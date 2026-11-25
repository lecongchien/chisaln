import Foundation
import ServiceManagement

/// Manages themes.json manifest loading, settings.json persistence, and macOS Launch at Login.
final class SettingsStore {
    let webDir: URL
    let dataDir: URL
    let shareDir: URL
    private let settingsFile: URL

    private(set) var themes: [ThemeDefinition] = []
    var current: AppSettings = AppSettings()

    init(webDir: URL) {
        self.webDir = webDir
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        self.dataDir = appSupport.appendingPathComponent("ScreamWallpaper", isDirectory: true)
        self.shareDir = dataDir.appendingPathComponent("shares", isDirectory: true)
        self.settingsFile = dataDir.appendingPathComponent("settings.json")

        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)

        loadThemesManifest()
        loadSettings()
    }

    private func loadThemesManifest() {
        themes.removeAll()
        let manifestURL = webDir.appendingPathComponent("themes.json")
        guard let data = try? Data(contentsOf: manifestURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let arr = json["themes"] as? [[String: Any]] else {
            return
        }

        for item in arr {
            guard let id = item["id"] as? String, !id.isEmpty else { continue }
            let page = item["page"] as? String ?? "\(id).html"
            let status = item["status"] as? String ?? "ready"
            var defaults: [String: Double] = [:]

            if let groups = item["groups"] as? [[String: Any]] {
                for g in groups {
                    guard let prms = g["params"] as? [[String: Any]] else { continue }
                    for p in prms {
                        guard let key = p["key"] as? String, !key.isEmpty else { continue }
                        if let val = p["default"] as? Double {
                            defaults[key] = val
                        } else if let intVal = p["default"] as? Int {
                            defaults[key] = Double(intVal)
                        }
                    }
                }
            }

            themes.append(ThemeDefinition(id: id, page: page, status: status, defaults: defaults))
        }
    }

    func getTheme(_ id: String) -> ThemeDefinition? {
        if let hit = themes.first(where: { $0.id.caseInsensitiveCompare(id) == .orderedSame && $0.status == "ready" }) {
            return hit
        }
        return themes.first
    }

    func getEffectiveParams(for themeId: String) -> [String: Double] {
        var merged: [String: Double] = [:]
        if let def = getTheme(themeId) {
            for (k, v) in def.defaults { merged[k] = v }
        }
        if let overrides = current.params[themeId] {
            for (k, v) in overrides { merged[k] = v }
        }
        return merged
    }

    func setParam(themeId: String, key: String, value: Double) {
        var bag = current.params[themeId] ?? [:]
        bag[key] = value
        current.params[themeId] = bag
    }

    func resetTheme(_ themeId: String) {
        current.params.removeValue(forKey: themeId)
        saveSettings()
    }

    private func loadSettings() {
        if let data = try? Data(contentsOf: settingsFile),
           let decoded = try? JSONDecoder().decode(AppSettings.self, from: data) {
            current = decoded
        }

        // Migrate legacy standalone "cabin" theme cleanly into unified "seatrain" (viewMode = 1)
        if current.theme.caseInsensitiveCompare("cabin") == .orderedSame {
            current.theme = "seatrain"
            setParam(themeId: "seatrain", key: "viewMode", value: 1)
        }

        if getTheme(current.theme) == nil, let first = themes.first {
            current.theme = first.id
        }
        if current.lang != "vi" && current.lang != "en" {
            current.lang = "vi"
        }
    }

    func saveSettings() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        if let data = try? encoder.encode(current) {
            try? data.write(to: settingsFile, options: .atomic)
        }
    }

    func isAutoStartEnabled() -> Bool {
        SMAppService.mainApp.status == .enabled
    }

    @discardableResult
    func setAutoStart(_ enable: Bool) -> Bool {
        do {
            if enable {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            return true
        } catch {
            NSLog("Scream: SMAppService setAutoStart(\(enable)) failed: \(error.localizedDescription)")
            return false
        }
    }
}
