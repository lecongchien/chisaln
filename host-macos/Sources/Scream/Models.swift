import Foundation

/// User-persisted application preferences (100% JSON-compatible with Windows AppSettings).
struct AppSettings: Codable {
    var theme: String = "beach"
    var lang: String = "vi"
    var multiMonitor: Bool = false
    var autoPause: Bool = true
    var moonMode: String = "full"
    var moonDate: String = "2000-08-15"
    var params: [String: [String: Double]] = [:]

    enum CodingKeys: String, CodingKey {
        case theme = "Theme"
        case lang = "Lang"
        case multiMonitor = "MultiMonitor"
        case autoPause = "AutoPause"
        case moonMode = "MoonMode"
        case moonDate = "MoonDate"
        case params = "Params"
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
