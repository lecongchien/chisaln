import AppKit
import Foundation

/// Core macOS Application coordinator orchestrating multi-display WKWebView wallpapers,
/// Settings window, Menu Bar controls, debounced persistence, and sleep/display recovery.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var store: SettingsStore!
    private var menuBar: MenuBarController!
    private var wallpapers: [WallpaperWindowController] = []
    private var settingsWindow: SettingsWindowController?
    private var saveTimer: Timer?

    private var manualPause = false
    private var latestIconsJson = ""
    private var latestIconCount = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        let webDir = resolveWebDir()
        store = SettingsStore(webDir: webDir)

        menuBar = MenuBarController(
            onOpenSettings: { [weak self] in self?.openSettings() },
            onToggleNight: { [weak self] in self?.toggleDayNight() },
            onTogglePause: { [weak self] in self?.toggleManualPause() },
            onReload: { [weak self] in self?.reloadWallpapers() },
            onToggleMultiMonitor: { [weak self] in self?.toggleMultiMonitor() },
            onQuit: { [weak self] in self?.quitApp() }
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleScreenChange),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )
        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(handleWake),
            name: NSWorkspace.didWakeNotification,
            object: nil
        )

        launchWallpapers()

        let silentLaunch = CommandLine.arguments.contains("--autostart")
        if !silentLaunch {
            openSettings()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        saveTimer?.invalidate()
        store?.saveSettings()
        disposeWallpapers()
        settingsWindow?.shutdown()
    }

    private func resolveWebDir() -> URL {
        // 1. Inside packaged Scream.app/Contents/Resources/web
        if let resURL = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true),
           FileManager.default.fileExists(atPath: resURL.appendingPathComponent("themes.json").path) {
            return resURL
        }
        // 2. Local development run from repo root or host-macos/
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        let candidates = [
            cwd.appendingPathComponent("web", isDirectory: true),
            cwd.deletingLastPathComponent().appendingPathComponent("web", isDirectory: true),
            URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().appendingPathComponent("web", isDirectory: true)
        ]
        for c in candidates {
            if FileManager.default.fileExists(atPath: c.appendingPathComponent("themes.json").path) {
                return c
            }
        }
        return cwd.appendingPathComponent("web", isDirectory: true)
    }

    private func launchWallpapers() {
        disposeWallpapers()

        let theme = store.getTheme(store.current.theme)
        let page = theme?.page ?? "beach.html"
        let allScreens = NSScreen.screens
        guard !allScreens.isEmpty else { return }
        let targets: [NSScreen] = store.current.multiMonitor ? allScreens : [NSScreen.main ?? allScreens[0]]

        for (idx, scr) in targets.enumerated() {
            let wc = WallpaperWindowController(
                store: store,
                screen: scr,
                initialPage: page,
                manualPause: manualPause,
                autoPauseEnabled: store.current.autoPause,
                getIgnoredWindowNumbers: { [weak self] in
                    var s = Set<Int>()
                    if let sw = self?.settingsWindow { s.insert(sw.windowNumber) }
                    for w in self?.wallpapers ?? [] { s.insert(w.windowNumber) }
                    return s
                }
            )

            if idx == 0 {
                wc.onIconsSnapshotUpdated = { [weak self] json, count, _ in
                    guard let self = self else { return }
                    self.latestIconsJson = json
                    self.latestIconCount = count
                    self.settingsWindow?.postJson(json)
                    self.pushStatusToSettings()
                }
                wc.onPauseStateChanged = { [weak self] _ in
                    self?.pushStatusToSettings()
                }
                wc.onPageReady = { [weak self] in
                    self?.settingsWindow?.postObject(["t": "wallpaperReady"])
                }
            }

            wallpapers.append(wc)
            wc.show()
        }

        syncMenuBarState()
    }

    private func disposeWallpapers() {
        for w in wallpapers { w.shutdown() }
        wallpapers.removeAll()
    }

    @objc private func handleScreenChange() {
        launchWallpapers()
        pushStatusToSettings()
    }

    @objc private func handleWake() {
        reloadWallpapers()
    }

    func openSettings() {
        if settingsWindow == nil {
            settingsWindow = SettingsWindowController(store: store) { [weak self] raw in
                self?.handleSettingsMessage(raw)
            }
        }
        settingsWindow?.showAndFocus()
    }

    private func handleSettingsMessage(_ raw: String) {
        guard let data = raw.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = root["t"] as? String else { return }

        switch type {
        case "hello":
            pushFullInitToSettings()

        case "theme":
            let newId = root["id"] as? String ?? "beach"
            if let def = store.getTheme(newId) {
                store.current.theme = def.id
                scheduleSave()
                for w in wallpapers { w.navigate(to: def.page) }
                syncMenuBarState()
                pushStatusToSettings()
            }

        case "set":
            if let key = root["k"] as? String, !key.isEmpty {
                let val: Double?
                if let d = root["v"] as? Double { val = d }
                else if let i = root["v"] as? Int { val = Double(i) }
                else { val = nil }
                if let v = val {
                    store.setParam(themeId: store.current.theme, key: key, value: v)
                    scheduleSave()
                    for w in wallpapers { w.sendSingleParam(key: key, value: v) }
                    if key == "timeMode" { syncMenuBarState() }
                }
            }

        case "reset":
            store.resetTheme(store.current.theme)
            let defaults = store.getEffectiveParams(for: store.current.theme)
            for w in wallpapers { w.sendThemeSettings(defaults) }
            syncMenuBarState()
            pushFullInitToSettings()

        case "lang":
            let lang = (root["v"] as? String == "en") ? "en" : "vi"
            store.current.lang = lang
            scheduleSave()
            syncMenuBarState()
            pushFullInitToSettings()

        case "autostart":
            let enable = root["v"] as? Bool ?? false
            store.setAutoStart(enable)
            pushStatusToSettings()

        case "autopause":
            let enable = root["v"] as? Bool ?? true
            store.current.autoPause = enable
            scheduleSave()
            for w in wallpapers { w.setAutoPauseEnabled(enable) }
            pushStatusToSettings()

        case "multimonitor":
            let multi = root["v"] as? Bool ?? false
            if multi != store.current.multiMonitor {
                store.current.multiMonitor = multi
                scheduleSave()
                launchWallpapers()
                pushStatusToSettings()
            }

        case "togglePause":
            toggleManualPause()

        case "reload":
            reloadWallpapers()

        case "shareImage":
            if let first = wallpapers.first {
                first.requestSnapshot { [weak self] ok, path, info in
                    self?.settingsWindow?.postObject([
                        "t": "shareResult", "kind": "image", "ok": ok, "path": path, "info": info
                    ])
                }
            } else {
                settingsWindow?.postObject([
                    "t": "shareResult", "kind": "image", "ok": false, "path": "", "info": "No active wallpaper"
                ])
            }

        case "shareVideo":
            if let first = wallpapers.first {
                first.requestRecording { [weak self] ok, path, info in
                    self?.settingsWindow?.postObject([
                        "t": "shareResult", "kind": "video", "ok": ok, "path": path, "info": info
                    ])
                }
            } else {
                settingsWindow?.postObject([
                    "t": "shareResult", "kind": "video", "ok": false, "path": "", "info": "No active wallpaper"
                ])
            }

        case "uiTheme":
            let isDark = root["dark"] as? Bool ?? false
            settingsWindow?.setDarkMode(isDark)

        case "moon":
            var mode = root["mode"] as? String ?? "full"
            let date = root["date"] as? String ?? "2000-08-15"
            if mode != "full" && mode != "today" && mode != "birthday" { mode = "full" }
            store.current.moonMode = mode
            store.current.moonDate = date
            scheduleSave()
            for w in wallpapers { w.sendMoonConfig(mode: mode, date: date) }

        case "revealFile":
            if let path = root["path"] as? String, !path.isEmpty, FileManager.default.fileExists(atPath: path) {
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
            }

        case "minimizeToTray":
            settingsWindow?.hideToMenuBar()

        default:
            break
        }
    }

    private func pushFullInitToSettings() {
        guard let sw = settingsWindow else { return }
        var allParams: [String: [String: Double]] = [:]
        for t in store.themes {
            allParams[t.id] = store.getEffectiveParams(for: t.id)
        }
        sw.postObject([
            "t": "init",
            "theme": store.current.theme,
            "lang": store.current.lang,
            "moonMode": store.current.moonMode,
            "moonDate": store.current.moonDate,
            "paramsByTheme": allParams,
            "autostart": store.isAutoStartEnabled(),
            "autopause": store.current.autoPause,
            "multimonitor": store.current.multiMonitor,
            "screenCount": NSScreen.screens.count,
            "paused": wallpapers.first?.isPaused ?? false,
            "manualPause": manualPause,
            "iconCount": latestIconCount,
            "wallpaperReady": wallpapers.first?.isPageReady ?? false,
            "attachMode": "macOS Desktop Window"
        ])
        if !latestIconsJson.isEmpty {
            sw.postJson(latestIconsJson)
        }
    }

    private func pushStatusToSettings() {
        settingsWindow?.postObject([
            "t": "status",
            "autostart": store.isAutoStartEnabled(),
            "autopause": store.current.autoPause,
            "multimonitor": store.current.multiMonitor,
            "screenCount": NSScreen.screens.count,
            "paused": wallpapers.first?.isPaused ?? false,
            "manualPause": manualPause,
            "iconCount": latestIconCount,
            "attachMode": "macOS Desktop Window"
        ])
    }

    private func scheduleSave() {
        saveTimer?.invalidate()
        saveTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { [weak self] _ in
            self?.store.saveSettings()
        }
    }

    private func toggleDayNight() {
        let active = store.current.theme
        let cur = store.getEffectiveParams(for: active)
        let curMode = cur["timeMode"] ?? 0
        let nextMode: Double = (curMode.rounded() == 2) ? 0 : 2
        store.setParam(themeId: active, key: "timeMode", value: nextMode)
        scheduleSave()
        for w in wallpapers { w.sendSingleParam(key: "timeMode", value: nextMode) }
        syncMenuBarState()
        pushFullInitToSettings()
    }

    private func toggleManualPause() {
        manualPause.toggle()
        for w in wallpapers { w.setManualPause(manualPause) }
        syncMenuBarState()
        pushStatusToSettings()
    }

    private func toggleMultiMonitor() {
        store.current.multiMonitor.toggle()
        scheduleSave()
        launchWallpapers()
        pushStatusToSettings()
    }

    private func reloadWallpapers() {
        for w in wallpapers { w.reload() }
    }

    private func syncMenuBarState() {
        let tp = store.getEffectiveParams(for: store.current.theme)
        let isNight = ((tp["timeMode"] ?? 0).rounded() == 2)
        menuBar.syncState(
            lang: store.current.lang,
            isNight: isNight,
            paused: manualPause,
            multiMonitor: store.current.multiMonitor
        )
    }

    private func quitApp() {
        NSApp.terminate(nil)
    }
}
