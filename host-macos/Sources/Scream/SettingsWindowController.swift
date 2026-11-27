import AppKit
import Foundation
import WebKit

/// Native macOS Settings window hosting the shared `web/settings.html` inspector & live preview.
final class SettingsWindowController: NSObject, NSWindowDelegate {
    private let store: SettingsStore
    private let onMessage: (String) -> Void
    private let window: NSWindow
    private let webView: WKWebView

    var windowNumber: Int { window.windowNumber }
    var isVisible: Bool { window.isVisible && !window.isMiniaturized }

    init(store: SettingsStore, webBaseURL: String, onMessage: @escaping (String) -> Void) {
        self.store = store
        self.onMessage = onMessage

        let config = WKWebViewConfiguration()
        if webBaseURL.hasPrefix("scream://") {
            config.setURLSchemeHandler(LocalWebSchemeHandler(webDir: store.webDir), forURLScheme: "scream")
        }
        config.mediaTypesRequiringUserActionForPlayback = []
        let shimScript = WKUserScript(source: screamReceiveShimJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(shimScript)

        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1160, height: 740),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        win.title = "Scream — Adaptive Live Wallpaper"
        win.minSize = NSSize(width: 920, height: 620)
        win.center()
        win.isReleasedWhenClosed = false

        let wv = WKWebView(frame: win.contentView?.bounds ?? .zero, configuration: config)
        wv.autoresizingMask = [.width, .height]
        if #available(macOS 13.3, *) {
            wv.isInspectable = true
        }

        self.window = win
        self.webView = wv
        super.init()

        let proxy = ScriptMessageProxy { [weak self] raw in
            self?.onMessage(raw)
        }
        config.userContentController.add(proxy, name: "scream")
        win.delegate = self
        win.contentView = wv

        if let url = URL(string: "\(webBaseURL)/settings.html?host=1") {
            wv.load(URLRequest(url: url))
        }
    }

    func showAndFocus() {
        NSApp.activate(ignoringOtherApps: true)
        if window.isMiniaturized {
            window.deminiaturize(nil)
        }
        window.makeKeyAndOrderFront(nil)
        postObject(["t": "previewVis", "v": true])
    }

    func hideToMenuBar() {
        postObject(["t": "previewVis", "v": false])
        window.orderOut(nil)
    }

    func setDarkMode(_ isDark: Bool) {
        window.appearance = NSAppearance(named: isDark ? .darkAqua : .aqua)
    }

    func postJson(_ json: String) {
        guard let encodedData = try? JSONSerialization.data(withJSONObject: [json]),
              let encodedArr = String(data: encodedData, encoding: .utf8),
              encodedArr.count >= 2 else { return }
        let jsLiteral = String(encodedArr.dropFirst().dropLast())
        let script = "window.__screamReceive && window.__screamReceive(\(jsLiteral));"
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    func postObject(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else { return }
        postJson(json)
    }

    // MARK: - NSWindowDelegate (hide smoothly to Menu Bar & pause preview GPU!)
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        hideToMenuBar()
        return false
    }

    func windowDidMiniaturize(_ notification: Notification) {
        postObject(["t": "previewVis", "v": false])
    }

    func windowDidDeminiaturize(_ notification: Notification) {
        postObject(["t": "previewVis", "v": true])
    }

    func shutdown() {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "scream")
        window.delegate = nil
        window.close()
    }
}
