import AppKit
import CoreGraphics
import Foundation
import WebKit

/// Weak forwarding proxy avoiding WKUserContentController -> handler retain cycles.
final class ScriptMessageProxy: NSObject, WKScriptMessageHandler {
    private let onMessage: (String) -> Void

    init(onMessage: @escaping (String) -> Void) {
        self.onMessage = onMessage
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let str = message.body as? String {
            onMessage(str)
        } else if let dict = message.body as? [String: Any],
                  let data = try? JSONSerialization.data(withJSONObject: dict),
                  let str = String(data: data, encoding: .utf8) {
            onMessage(str)
        }
    }
}

/// Shared document-start script buffering any early native->JS messages until page modules attach
/// `window.__screamReceive = handler`, eliminating cold-boot IPC race conditions on macOS WKWebView.
let screamReceiveShimJS = """
(function() {
  var queue = [];
  var handler = null;
  Object.defineProperty(window, '__screamReceive', {
    configurable: true,
    get: function() {
      return handler || function(msg) { queue.push(msg); };
    },
    set: function(fn) {
      handler = (typeof fn === 'function') ? fn : null;
      if (handler && queue.length) {
        var pending = queue.splice(0, queue.length);
        for (var i = 0; i < pending.length; i++) {
          try { handler(pending[i]); } catch (e) {}
        }
      }
    }
  });
})();
"""

/// Borderless desktop-level WKWebView window placed strictly above the static macOS wallpaper
/// and strictly below Finder's desktop icons & Sonoma Desktop Widgets (`kCGDesktopWindowLevel + 1`).
final class WallpaperWindowController: NSObject, WKNavigationDelegate {
    private let store: SettingsStore
    private let webBaseURL: String
    private var targetScreen: NSScreen
    private let getIgnoredWindowNumbers: () -> Set<Int>

    private let window: NSWindow
    private let webView: WKWebView
    private let iconReader = FinderIconReader()

    private var iconTimer: Timer?
    private var fgTimer: Timer?
    private var mouseTimer: Timer?

    private var currentThemeId: String
    private var currentPage: String
    private var manualPause: Bool
    private var autoPauseEnabled: Bool
    private var stageLoaded = false
    private var pageReady = false
    private var shuttingDown = false
    private var lastIconsJson = ""
    private var lastPauseState = -1
    private var lastMousePt = NSPoint(x: -9999, y: -9999)
    private var navRetryCount = 0
    private var pendingShareCallback: ((Bool, String, String) -> Void)?

    var onIconsSnapshotUpdated: ((_ json: String, _ count: Int, _ visible: Bool) -> Void)?
    var onPauseStateChanged: ((_ paused: Bool) -> Void)?
    var onPageReady: (() -> Void)?

    var isPaused: Bool { lastPauseState == 1 }
    var isPageReady: Bool { pageReady }
    var windowNumber: Int { window.windowNumber }

    init(
        store: SettingsStore,
        webBaseURL: String,
        screen: NSScreen,
        initialThemeId: String,
        initialPage: String,
        manualPause: Bool,
        autoPauseEnabled: Bool,
        getIgnoredWindowNumbers: @escaping () -> Set<Int>
    ) {
        self.store = store
        self.webBaseURL = webBaseURL
        self.targetScreen = screen
        self.currentThemeId = initialThemeId.isEmpty ? "arctic" : initialThemeId
        self.currentPage = initialPage
        self.manualPause = manualPause
        self.autoPauseEnabled = autoPauseEnabled
        self.getIgnoredWindowNumbers = getIgnoredWindowNumbers

        let config = WKWebViewConfiguration()
        if webBaseURL.hasPrefix("scream://") {
            config.setURLSchemeHandler(LocalWebSchemeHandler(webDir: store.webDir), forURLScheme: "scream")
        }
        config.mediaTypesRequiringUserActionForPlayback = []
        let shimScript = WKUserScript(source: screamReceiveShimJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(shimScript)

        let win = NSWindow(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        // Strictly above macOS desktop picture and strictly below Sonoma Widgets & Finder desktop icons!
        win.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)) + 1)
        win.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        win.isOpaque = true
        win.hasShadow = false
        win.ignoresMouseEvents = true
        win.canHide = false
        win.hidesOnDeactivate = false
        win.backgroundColor = NSColor(calibratedRed: 14.0/255.0, green: 78.0/255.0, blue: 108.0/255.0, alpha: 1.0)
        win.setFrame(screen.frame, display: true)

        let wv = WKWebView(frame: CGRect(origin: .zero, size: screen.frame.size), configuration: config)
        wv.autoresizingMask = [.width, .height]
        wv.wantsLayer = true
        wv.setValue(false, forKey: "drawsBackground")
        if #available(macOS 13.3, *) {
            wv.isInspectable = true
        }

        self.window = win
        self.webView = wv
        super.init()

        let proxy = ScriptMessageProxy { [weak self] raw in
            self?.handleWebMessage(raw)
        }
        config.userContentController.add(proxy, name: "scream")
        wv.navigationDelegate = self
        win.contentView = wv
    }

    func show() {
        window.orderFrontRegardless()
        loadStage(themeId: currentThemeId, page: currentPage)
        startTimers()
    }

    func loadStage(themeId: String, page: String) {
        currentThemeId = themeId.isEmpty ? "arctic" : themeId
        currentPage = page
        stageLoaded = false
        pageReady = false
        lastIconsJson = ""
        lastPauseState = -1
        let q = store.current.renderQuality
        let encoded = currentThemeId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "arctic"
        if let url = URL(string: "\(webBaseURL)/stage.html?host=1&theme=\(encoded)&q=\(q)") {
            webView.load(URLRequest(url: url))
        }
    }

    func switchTheme(id: String, page: String, settings: [String: Double]) {
        currentThemeId = id.isEmpty ? "arctic" : id
        currentPage = page
        if stageLoaded {
            let payload: [String: Any] = [
                "t": "switchTheme",
                "id": currentThemeId,
                "page": currentPage,
                "settings": settings
            ]
            if let json = serializeDict(payload) {
                postJson(json)
                return
            }
        }
        loadStage(themeId: currentThemeId, page: currentPage)
    }

    func reload() {
        loadStage(themeId: currentThemeId, page: currentPage)
    }

    func setManualPause(_ paused: Bool) {
        manualPause = paused
        pollForeground()
    }

    func setAutoPauseEnabled(_ enabled: Bool) {
        autoPauseEnabled = enabled
        pollForeground()
    }

    func postJson(_ json: String) {
        guard !shuttingDown else { return }
        // Safely encode the raw JSON string as a single JS string literal
        guard let encodedData = try? JSONSerialization.data(withJSONObject: [json]),
              let encodedArr = String(data: encodedData, encoding: .utf8),
              encodedArr.count >= 2 else { return }
        let jsLiteral = String(encodedArr.dropFirst().dropLast())
        let script = "window.__screamReceive && window.__screamReceive(\(jsLiteral));"
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.shuttingDown else { return }
            self.webView.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    func sendThemeSettings(_ values: [String: Double]) {
        let payload: [String: Any] = ["t": "settings", "v": values]
        if let json = serializeDict(payload) { postJson(json) }
    }

    func sendSingleParam(key: String, value: Double) {
        let payload: [String: Any] = ["t": "settings", "v": [key: value]]
        if let json = serializeDict(payload) { postJson(json) }
    }

    func sendMoonConfig(mode: String, date: String) {
        let payload: [String: Any] = ["t": "moon", "mode": mode, "date": date]
        if let json = serializeDict(payload) { postJson(json) }
    }

    func sendRenderQuality(_ quality: String) {
        let q = (quality == "eco" || quality == "balanced" || quality == "ultra" || quality == "super") ? quality : "ultra"
        let payload: [String: Any] = ["t": "quality", "v": q]
        if let json = serializeDict(payload) { postJson(json) }
    }

    func requestSnapshot(completion: @escaping (Bool, String, String) -> Void) {
        pendingShareCallback = completion
        postJson("{\"t\":\"snapshot\"}")
    }

    func requestRecording(completion: @escaping (Bool, String, String) -> Void) {
        pendingShareCallback = completion
        postJson("{\"t\":\"record\",\"sec\":4}")
    }

    private func startTimers() {
        iconTimer?.invalidate()
        fgTimer?.invalidate()
        mouseTimer?.invalidate()

        iconTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.pollIcons()
        }
        fgTimer = Timer.scheduledTimer(withTimeInterval: 0.65, repeats: true) { [weak self] _ in
            self?.pollForeground()
        }
        mouseTimer = Timer.scheduledTimer(withTimeInterval: 0.033, repeats: true) { [weak self] _ in
            self?.pollCursor()
        }
    }

    private func handleWebMessage(_ raw: String) {
        guard let data = raw.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = root["t"] as? String else { return }

        switch type {
        case "stageReady":
            stageLoaded = true
            navRetryCount = 0
            sendThemeSettings(store.getEffectiveParams(for: store.current.theme))
            sendMoonConfig(mode: store.current.moonMode, date: store.current.moonDate)
            sendRenderQuality(store.current.renderQuality)
            pollIcons()

        case "ready":
            stageLoaded = true
            pageReady = true
            navRetryCount = 0
            sendThemeSettings(store.getEffectiveParams(for: store.current.theme))
            sendMoonConfig(mode: store.current.moonMode, date: store.current.moonDate)
            sendRenderQuality(store.current.renderQuality)
            lastIconsJson = ""
            lastPauseState = -1
            pollIcons()
            pollForeground()
            onPageReady?()

        case "snapshotResult":
            handleShareMedia(root, defaultExt: "png")

        case "recordResult":
            handleShareMedia(root, defaultExt: "webm")

        case "sceneError":
            if let msg = root["msg"] as? String {
                NSLog("Scream sceneError: \(msg)")
            }

        default:
            break
        }
    }

    private func handleShareMedia(_ root: [String: Any], defaultExt: String) {
        guard let cb = pendingShareCallback else { return }
        pendingShareCallback = nil

        let ok = root["ok"] as? Bool ?? false
        if !ok {
            let err = root["err"] as? String ?? "Export failed"
            cb(false, "", err)
            return
        }

        let dataUrl = root["data"] as? String ?? ""
        let ext = root["ext"] as? String ?? defaultExt
        guard let commaIdx = dataUrl.firstIndex(of: ",") else {
            cb(false, "", "Invalid media payload")
            return
        }

        let b64 = String(dataUrl[dataUrl.index(after: commaIdx)...])
        guard let bytes = Data(base64Encoded: b64) else {
            cb(false, "", "Base64 decode failed")
            return
        }

        let fmt = DateFormatter()
        fmt.dateFormat = "yyyyMMdd-HHmmss"
        let fileName = "scream-\(store.current.theme)-\(fmt.string(from: Date())).\(ext)"
        let fileURL = store.shareDir.appendingPathComponent(fileName)
        do {
            try bytes.write(to: fileURL, options: .atomic)
            cb(true, fileURL.path, fileName)
        } catch {
            cb(false, "", error.localizedDescription)
        }
    }

    private func pollIcons() {
        guard !shuttingDown, (stageLoaded || pageReady) else { return }
        if lastPauseState == 1 && !lastIconsJson.isEmpty { return }

        let primaryHeight = NSScreen.screens.first?.frame.height ?? targetScreen.frame.height
        let frame = targetScreen.frame
        let screenLeft = Int(frame.origin.x.rounded())
        let screenTop = Int((primaryHeight - (frame.origin.y + frame.height)).rounded())
        let screenW = max(1, Int(frame.width.rounded()))
        let screenH = max(1, Int(frame.height.rounded()))

        iconReader.readAsync { [weak self] allRects, visible in
            guard let self = self, !self.shuttingDown, (self.stageLoaded || self.pageReady) else { return }
            var boxes: [[Int]] = []
            for r in allRects {
                if r.right < screenLeft - 80 || r.left > screenLeft + screenW + 80 ||
                   r.bottom < screenTop - 80 || r.top > screenTop + screenH + 80 {
                    continue
                }
                boxes.append([
                    r.left - screenLeft,
                    r.top - screenTop,
                    r.right - screenLeft,
                    r.bottom - screenTop
                ])
            }

            let payload: [String: Any] = [
                "t": "icons",
                "vis": visible,
                "sw": screenW,
                "sh": screenH,
                "r": boxes
            ]
            guard let json = self.serializeDict(payload), json != self.lastIconsJson else { return }
            self.lastIconsJson = json
            self.postJson(json)
            self.onIconsSnapshotUpdated?(json, boxes.count, visible)
        }
    }

    private func pollForeground() {
        guard !shuttingDown, pageReady else { return }
        var shouldPause = manualPause
        if !shouldPause && autoPauseEnabled {
            var ignored = getIgnoredWindowNumbers()
            ignored.insert(window.windowNumber)
            shouldPause = ForegroundMonitor.shouldPause(for: targetScreen, ignoringWindowNumbers: ignored)
        }

        let state = shouldPause ? 1 : 0
        if state == lastPauseState { return }
        lastPauseState = state
        postJson(shouldPause ? "{\"t\":\"pause\",\"v\":true}" : "{\"t\":\"pause\",\"v\":false}")
        onPauseStateChanged?(shouldPause)
    }

    private func pollCursor() {
        guard !shuttingDown, pageReady, lastPauseState != 1 else { return }
        let pt = NSEvent.mouseLocation
        if abs(pt.x - lastMousePt.x) < 4 && abs(pt.y - lastMousePt.y) < 4 { return }
        lastMousePt = pt

        let frame = targetScreen.frame
        guard frame.width > 0 && frame.height > 0 else { return }
        let nx = max(0.0, min(1.0, (pt.x - frame.origin.x) / frame.width))
        // Convert AppKit bottom-left Y to top-left CSS Y
        let ny = max(0.0, min(1.0, 1.0 - (pt.y - frame.origin.y) / frame.height))
        let msg = String(format: "{\"t\":\"mouse\",\"x\":%.4f,\"y\":%.4f}", nx, ny)
        postJson(msg)
    }

    // MARK: - WKNavigationDelegate (Sonoma/Sequoia compositor kick + crash/failure auto-recovery)
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !shuttingDown else { return }
        // Force WebKit Metal compositor to commit layer updates on desktop-level non-key windows
        webView.evaluateJavaScript("void document.body.offsetHeight;", completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleNavError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard !shuttingDown else { return }
        NSLog("Scream: Desktop WKWebView WebContent process terminated — reloading stage.")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self = self, !self.shuttingDown else { return }
            self.reload()
        }
    }

    private func handleNavError(_ error: Error) {
        let nsErr = error as NSError
        if nsErr.domain == NSURLErrorDomain && nsErr.code == NSURLErrorCancelled { return }
        NSLog("Scream: Wallpaper navigation failed: \(error.localizedDescription)")
        guard !shuttingDown, navRetryCount < 3 else { return }
        navRetryCount += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self = self, !self.shuttingDown else { return }
            self.loadStage(themeId: self.currentThemeId, page: self.currentPage)
        }
    }

    func shutdown() {
        guard !shuttingDown else { return }
        shuttingDown = true
        iconTimer?.invalidate()
        fgTimer?.invalidate()
        mouseTimer?.invalidate()
        iconTimer = nil
        fgTimer = nil
        mouseTimer = nil
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "scream")
        window.orderOut(nil)
        window.close()
    }

    private func serializeDict(_ dict: [String: Any]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
