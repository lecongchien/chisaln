import Foundation

/// User-persisted application preferences (100% JSON-compatible with Windows AppSettings).
struct AppSettings: Codable {
    var theme: String = "beach"
    var lang: String = "vi"
    var multiMonitor: Bool = false
    var autoPause: Bool = true
    var autoUpdate: Bool = true
    var renderQuality: String = "ultra"
    var moonMode: String = "full"
    var moonDate: String = "2000-08-15"
    var params: [String: [String: Double]] = [:]

    enum CodingKeys: String, CodingKey {
        case theme = "Theme"
        case lang = "Lang"
        case multiMonitor = "MultiMonitor"
        case autoPause = "AutoPause"
        case autoUpdate = "AutoUpdate"
        case renderQuality = "RenderQuality"
        case moonMode = "MoonMode"
        case moonDate = "MoonDate"
        case params = "Params"
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        theme = try c.decodeIfPresent(String.self, forKey: .theme) ?? "beach"
        lang = try c.decodeIfPresent(String.self, forKey: .lang) ?? "vi"
        multiMonitor = try c.decodeIfPresent(Bool.self, forKey: .multiMonitor) ?? false
        autoPause = try c.decodeIfPresent(Bool.self, forKey: .autoPause) ?? true
        autoUpdate = try c.decodeIfPresent(Bool.self, forKey: .autoUpdate) ?? true
        let rawQ = try c.decodeIfPresent(String.self, forKey: .renderQuality) ?? "ultra"
        renderQuality = (rawQ == "eco" || rawQ == "balanced" || rawQ == "ultra" || rawQ == "super") ? rawQ : "ultra"
        moonMode = try c.decodeIfPresent(String.self, forKey: .moonMode) ?? "full"
        moonDate = try c.decodeIfPresent(String.self, forKey: .moonDate) ?? "2000-08-15"
        params = try c.decodeIfPresent([String: [String: Double]].self, forKey: .params) ?? [:]
    }
}

struct ThemeDefinition {
    let id: String
    let page: String
    let status: String
    let defaults: [String: Double]
}

struct IconRect {
    let left: Int
    let top: Int
    let right: Int
    let bottom: Int
}
