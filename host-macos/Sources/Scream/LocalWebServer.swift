import Foundation
import Network

/// Lightweight loopback-only (127.0.0.1) HTTP/1.1 static asset server powered by Apple's native
/// `Network.framework` (`NWListener`).
///
/// Why this replaces `WKURLSchemeHandler` (`scream://app/...`) on macOS:
/// - In WebKit (macOS 13–15), custom URL schemes receive an opaque security origin (`"null"`), which
///   breaks nested `<iframe src="...">` same-origin isolation, taints WebGL2 `texImage2D` / `toDataURL`
///   with `SecurityError`, and triggers WebKit cross-origin subframe `requestAnimationFrame` throttling.
/// - Serving over `http://127.0.0.1:<ephemeral-port>/` guarantees a true W3C Secure Context
///   (`isSecureContext === true`) and identical Same-Origin semantics to Windows `https://app.local/`,
///   with zero macOS Firewall prompts (loopback-only) and zero port collisions.
final class LocalWebServer {
    private let webRoot: URL
    private let canonicalRootPath: String
    private let listenerQueue = DispatchQueue(label: "com.scream.local-web-listener", qos: .userInitiated)
    private let connQueue = DispatchQueue(label: "com.scream.local-web-conn", qos: .userInitiated, attributes: .concurrent)
    private var listener: NWListener?
    private(set) var port: UInt16 = 0

    var baseURL: String? {
        port > 0 ? "http://127.0.0.1:\(port)" : nil
    }

    init(webDir: URL) {
        self.webRoot = webDir.standardizedFileURL
        self.canonicalRootPath = self.webRoot.path
    }

    /// Starts listening strictly on loopback (`127.0.0.1`) and blocks briefly (typically <5ms) until ready.
    @discardableResult
    func start() -> Bool {
        if port > 0 && listener != nil { return true }

        // 1. Preferred: let Darwin allocate a dynamic ephemeral port strictly on the loopback interface (lo0).
        if tryBindDynamicLoopback() {
            return true
        }

        // 2. Fallback: bind explicit concrete high ports on 127.0.0.1.
        for _ in 0..<12 {
            let candidate = UInt16.random(in: 49200...64500)
            if let nwPort = NWEndpoint.Port(rawValue: candidate), tryBindExplicitLoopback(port: nwPort) {
                return true
            }
        }

        NSLog("Scream: LocalWebServer failed to bind any 127.0.0.1 loopback port.")
        return false
    }

    func stop() {
        let active = listener
        listener = nil
        port = 0
        active?.cancel()
    }

    private func tryBindDynamicLoopback() -> Bool {
        let params = NWParameters.tcp
        params.requiredInterfaceType = .loopback
        params.allowLocalEndpointReuse = true

        guard let nwListener = try? NWListener(using: params, on: .any) else {
            return false
        }
        return awaitListenerReady(nwListener)
    }

    private func tryBindExplicitLoopback(port requestedPort: NWEndpoint.Port) -> Bool {
        let params = NWParameters.tcp
        params.requiredInterfaceType = .loopback
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: requestedPort)

        guard let nwListener = try? NWListener(using: params, on: requestedPort) else {
            return false
        }
        return awaitListenerReady(nwListener)
    }

    private func awaitListenerReady(_ nwListener: NWListener) -> Bool {
        let readySem = DispatchSemaphore(value: 0)
        var resolvedPort: UInt16 = 0
        var signaled = false

        nwListener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                if let p = nwListener.port?.rawValue, p > 0 {
                    resolvedPort = p
                }
                if !signaled {
                    signaled = true
                    readySem.signal()
                }
            case .failed(let err):
                NSLog("Scream: LocalWebServer listener error: \(err.localizedDescription)")
                if !signaled {
                    signaled = true
                    readySem.signal()
                }
                if self?.listener === nwListener {
                    self?.listener = nil
                    self?.port = 0
                }
            case .cancelled:
                if !signaled {
                    signaled = true
                    readySem.signal()
                }
            default:
                break
            }
        }

        nwListener.newConnectionHandler = { [weak self] conn in
            self?.handleConnection(conn)
        }

        nwListener.start(queue: listenerQueue)
        let waitResult = readySem.wait(timeout: .now() + 2.5)
        if waitResult == .success && resolvedPort > 0 {
            self.listener = nwListener
            self.port = resolvedPort
            NSLog("Scream: LocalWebServer listening on http://127.0.0.1:\(resolvedPort)")
            return true
        }

        nwListener.cancel()
        return false
    }

    private func handleConnection(_ conn: NWConnection) {
        conn.stateUpdateHandler = { state in
            if case .failed = state {
                conn.cancel()
            }
        }
        conn.start(queue: connQueue)
        receiveRequest(conn: conn, buffer: Data())
    }

    private func receiveRequest(conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, isComplete, error in
            guard let self = self else {
                conn.cancel()
                return
            }
            if error != nil {
                conn.cancel()
                return
            }

            var acc = buffer
            if let chunk = data, !chunk.isEmpty {
                acc.append(chunk)
            }

            let headerEnd = Data([13, 10, 13, 10]) // "\r\n\r\n"
            if acc.range(of: headerEnd) != nil || isComplete || acc.count >= 32768 {
                self.processRequestData(acc, on: conn)
                return
            }

            self.receiveRequest(conn: conn, buffer: acc)
        }
    }

    private func processRequestData(_ rawData: Data, on conn: NWConnection) {
        guard let rawText = String(data: rawData, encoding: .utf8),
              let firstLineRaw = rawText.components(separatedBy: "\r\n").first else {
            sendResponse(on: conn, status: 400, reason: "Bad Request", mime: "text/plain; charset=utf-8", body: Data(), headOnly: false)
            return
        }

        let firstLine = firstLineRaw.components(separatedBy: "\n").first ?? firstLineRaw
        let parts = firstLine.split(separator: " ")
        guard parts.count >= 2 else {
            sendResponse(on: conn, status: 400, reason: "Bad Request", mime: "text/plain; charset=utf-8", body: Data(), headOnly: false)
            return
        }

        let method = String(parts[0]).uppercased()
        if method == "OPTIONS" {
            sendResponse(on: conn, status: 204, reason: "No Content", mime: "text/plain; charset=utf-8", body: Data(), headOnly: true)
            return
        }
        guard method == "GET" || method == "HEAD" else {
            sendResponse(on: conn, status: 405, reason: "Method Not Allowed", mime: "text/plain; charset=utf-8", body: Data(), headOnly: true)
            return
        }

        let rawTarget = String(parts[1])
        let pathOnly = rawTarget.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? "/"
        let decoded = pathOnly.removingPercentEncoding ?? pathOnly

        var relPath = decoded
        while relPath.hasPrefix("/") { relPath.removeFirst() }
        if relPath.isEmpty { relPath = "settings.html" }

        let targetURL = webRoot.appendingPathComponent(relPath).standardizedFileURL
        let resolvedPath = targetURL.path

        // Strict canonical path-traversal guard (prevents escaping webDir)
        let allowedPrefix = canonicalRootPath.hasSuffix("/") ? canonicalRootPath : (canonicalRootPath + "/")
        guard resolvedPath == canonicalRootPath || resolvedPath.hasPrefix(allowedPrefix) else {
            sendResponse(on: conn, status: 403, reason: "Forbidden", mime: "text/plain; charset=utf-8", body: Data(), headOnly: method == "HEAD")
            return
        }

        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: resolvedPath, isDirectory: &isDir),
              !isDir.boolValue,
              let fileData = try? Data(contentsOf: targetURL) else {
            sendResponse(on: conn, status: 404, reason: "Not Found", mime: "text/plain; charset=utf-8", body: Data(), headOnly: method == "HEAD")
            return
        }

        let mime = mimeType(for: targetURL.pathExtension.lowercased())
        sendResponse(on: conn, status: 200, reason: "OK", mime: mime, body: fileData, headOnly: method == "HEAD")
    }

    private func sendResponse(
        on conn: NWConnection,
        status: Int,
        reason: String,
        mime: String,
        body: Data,
        headOnly: Bool
    ) {
        let header =
            "HTTP/1.1 \(status) \(reason)\r\n" +
            "Content-Type: \(mime)\r\n" +
            "Content-Length: \(body.count)\r\n" +
            "Cache-Control: no-cache\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n" +
            "Access-Control-Allow-Headers: *\r\n" +
            "Connection: close\r\n\r\n"

        var payload = Data(header.utf8)
        if !headOnly && !body.isEmpty {
            payload.append(body)
        }

        // Send with `.finalMessage` + `isComplete: true` so Darwin emits a clean TCP FIN after flushing all bytes
        // instead of an abrupt TCP RST that could drop large WebP/PNG assets mid-read in WebKit.
        conn.send(content: payload, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { error in
            if error != nil {
                conn.cancel()
                return
            }
            conn.receive(minimumIncompleteLength: 1, maximumLength: 1) { _, _, _, _ in
                conn.cancel()
            }
        })
    }

    private func mimeType(for ext: String) -> String {
        switch ext {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs":   return "text/javascript; charset=utf-8"
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
