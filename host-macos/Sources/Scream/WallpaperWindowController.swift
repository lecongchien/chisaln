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

/// Borderless desktop-level WKWebView window placed strictly above the static macOS wallpaper
/// and strictly below Finder's desktop icons (`kCGDesktopWindowLevel + 1`).
final class WallpaperWindowController: NSObject, WKNavigationDelegate {
    private let store: SettingsStore
    private var targetScreen: NSScreen
    private let getIgnoredWindowNumbers: () -> Set<Int>

    private let window: NSWindow
    private let webView: WKWebView
    private let iconReader = FinderIconReader()

    private var iconTimer: Timer?
    private var fgTimer: Timer?
    private var mouseTimer: Timer?

    private var currentPage: String
    private var manualPause: Bool
    private var autoPauseEnabled: Bool
    private var pageReady = false
    private var shuttingDown = false
    private var lastIconsJson = ""
    private var lastPauseState = -1
    private var lastMousePt = NSPoint(x: -9999, y: -9999)
    private var pendingShareCallback: ((Bool, String, String) -> Void)?

    var onIconsSnapshotUpdated: ((_ json: String, _ count: Int, _ visible: Bool) -> Void)?
    var onPauseStateChanged: ((_ paused: Bool) -> Void)?
    var onPageReady: (() -> Void)?

    var isPaused: Bool { lastPauseState == 1 }
    var isPageReady: Bool { pageReady }
    var windowNumber: Int { window.windowNumber }

    init(
        store: SettingsStore,
        screen: NSScreen,
        initialPage: String,
        manualPause: Bool,
        autoPauseEnabled: Bool,
        getIgnoredWindowNumbers: @escaping () -> Set<Int>
    ) {
        self.store = store
        self.targetScreen = screen
        self.currentPage = initialPage
        self.manualPause = manualPause
        self.autoPauseEnabled = autoPauseEnabled
        self.getIgnoredWindowNumbers = getIgnoredWindowNumbers

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(LocalWebSchemeHandler(webDir: store.webDir), forURLScheme: "scream")
        config.mediaTypesRequiringUserActionForPlayback = []

        let win = NSWindow(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        // Strictly above macOS desktop picture and strictly below Finder desktop icons!
        win.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)) + 1)
        win.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        win.isOpaque = true
        win.hasShadow = false
        win.ignoresMouseEvents = true
        win.backgroundColor = NSColor(calibratedRed: 14.0/255.0, green: 78.0/255.0, blue: 108.0/255.0, alpha: 1.0)
        win.setFrame(screen.frame, display: true)

        let wv = WKWebView(frame: CGRect(origin: .zero, size: screen.frame.size), configuration: config)
        wv.autoresizingMask = [.width, .height]
        wv.setValue(false, forKey: "drawsBackground")

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
        navigate(to: currentPage)
        startTimers()
    }

    func navigate(to page: String) {
        currentPage = page
        pageReady = false
        lastIconsJson = ""
        lastPauseState = -1
        if let url = URL(string: "scream://app/\(page)?host=1") {
            webView.load(URLRequest(url: url))
        }
    }

    func reload() {
        navigate(to: currentPage)
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
        case "ready":
            pageReady = true
            sendThemeSettings(store.getEffectiveParams(for: store.current.theme))
            sendMoonConfig(mode: store.current.moonMode, date: store.current.moonDate)
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
        guard !shuttingDown, pageReady else { return }
        if lastPauseState == 1 && !lastIconsJson.isEmpty { return }

        let primaryHeight = NSScreen.screens.first?.frame.height ?? targetScreen.frame.height
        let frame = targetScreen.frame
        let screenLeft = Int(frame.origin.x.rounded())
        let screenTop = Int((primaryHeight - (frame.origin.y + frame.height)).rounded())
        let screenW = max(1, Int(frame.width.rounded()))
        let screenH = max(1, Int(frame.height.rounded()))

        iconReader.readAsync { [weak self] allRects, visible in
            guard let self = self, !self.shuttingDown, self.pageReady else { return }
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
