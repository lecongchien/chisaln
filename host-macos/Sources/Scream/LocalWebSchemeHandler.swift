import Foundation
import WebKit

/// Serves the bundled `web/` folder over a same-origin `scream://app/...` custom URL scheme
/// so ES modules, `fetch('./themes.json')`, WebGL2 textures, and the Settings preview iframe
/// work cleanly inside WKWebView with zero local HTTP server ports and zero CORS restrictions.
final class LocalWebSchemeHandler: NSObject, WKURLSchemeHandler {
    private let webRoot: URL
    private let canonicalRootPath: String

    init(webDir: URL) {
        self.webRoot = webDir.standardizedFileURL
        self.canonicalRootPath = self.webRoot.path
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let reqURL = urlSchemeTask.request.url else {
            finishError(urlSchemeTask, code: 400)
            return
        }

        var relPath = reqURL.path
        while relPath.hasPrefix("/") { relPath.removeFirst() }
        if relPath.isEmpty { relPath = "settings.html" }

        let targetURL = webRoot.appendingPathComponent(relPath).standardizedFileURL
        // Strict path-traversal boundary check
        guard targetURL.path.hasPrefix(canonicalRootPath) else {
            finishError(urlSchemeTask, code: 403)
            return
        }

        guard FileManager.default.fileExists(atPath: targetURL.path),
              let data = try? Data(contentsOf: targetURL) else {
            finishError(urlSchemeTask, code: 404)
            return
        }

        let mime = mimeType(for: targetURL.pathExtension.lowercased())
        let headers: [String: String] = [
            "Content-Type": mime,
            "Content-Length": "\(data.count)",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        ]

        if let response = HTTPURLResponse(
            url: reqURL,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        ) {
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } else {
            finishError(urlSchemeTask, code: 500)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // Synchronous local disk delivery completes immediately.
    }

    private func finishError(_ task: WKURLSchemeTask, code: Int) {
        let err = NSError(domain: "ScreamLocalWeb", code: code, userInfo: nil)
        task.didFailWithError(err)
    }

    private func mimeType(for ext: String) -> String {
        switch ext {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs":   return "application/javascript; charset=utf-8"
        case "css":         return "text/css; charset=utf-8"
        case "json":        return "application/json; charset=utf-8"
        case "svg":         return "image/svg+xml"
        case "png":         return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp":        return "image/webp"
        case "ico":         return "image/x-icon"
        case "woff2":       return "font/woff2"
        default:            return "application/octet-stream"
        }
    }
}
