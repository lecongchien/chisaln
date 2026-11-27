import AppKit
import CryptoKit
import Foundation

/// Immutable snapshot of the macOS auto-updater state projected to Settings UI and Menu Bar.
struct UpdateStatusSnapshot {
    var state: String = "idle"
    var currentVersion: String = "1.0.0"
    var latestVersion: String = ""
    var progress: Int = 0
    var downloadedBytes: Int64 = 0
    var totalBytes: Int64 = 0
    var errorCode: String = ""
    var message: String = ""
    var canInstall: Bool = false
    var isDevBuild: Bool = false
    var autoUpdate: Bool = true
    var userInitiated: Bool = false
    var lastCheckedUtc: String = ""

    func toPayload() -> [String: Any] {
        return [
            "t": "updateState",
            "state": state,
            "currentVersion": currentVersion,
            "latestVersion": latestVersion,
            "progress": progress,
            "downloadedBytes": downloadedBytes,
            "totalBytes": totalBytes,
            "errorCode": errorCode,
            "message": message,
            "canInstall": canInstall,
            "isDevBuild": isDevBuild,
            "autoupdate": autoUpdate,
            "userInitiated": userInitiated,
            "lastCheckedUtc": lastCheckedUtc
        ]
    }
}

/// Zero-dependency macOS auto-updater polling a public latest.json manifest, verifying SHA-256
/// with CryptoKit, and atomically swapping Scream.app with rollback protection.
final class AppUpdater: NSObject, URLSessionDownloadDelegate {
    private static let defaultManifestUrl =
        "https://github.com/lecongchien/chisaln/releases/latest/download/latest.json"

    private static let initialCheckDelaySec: TimeInterval = 15
    private static let periodicCheckIntervalSec: TimeInterval = 4 * 3600

    private struct ManifestInfo {
        let version: String
        let zipUrl: String
        let zipSha256: String
        let zipSize: Int64
    }

    private let updatesDir: URL
    private let manifestUrl: String
    private let allowLocalHttp: Bool
    private let isDevBuild: Bool
    private let requestAppExit: () -> Void
    private let lock = NSLock()
    private let isoFormatter: ISO8601DateFormatter

    private var autoUpdateEnabled: Bool
    private var isBusy = false
    private var isShutdown = false
    private var failedAutoVersion = ""
    private var latestManifest: ManifestInfo?
    private var downloadedZipURL: URL?
    private var downloadedVersion = ""
    private var scheduleTimer: Timer?
    private var initialWorkItem: DispatchWorkItem?
    private var activeDownloadTask: URLSessionDownloadTask?
    private var downloadContinuation: ((Result<URL, Error>) -> Void)?
    private var downloadExpectedSize: Int64 = 0
    private var downloadVersion = ""
    private var downloadUserInitiated = false
    private var lastProgressEmitTime: TimeInterval = 0
    private var lastProgressPct: Int = -1

    private lazy var downloadSession: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.timeoutIntervalForRequest = 30
        cfg.timeoutIntervalForResource = 600
        cfg.httpAdditionalHeaders = ["User-Agent": "Scream/\(currentVersion) (macOS; Universal)"]
        return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }()

    let currentVersion: String
    private(set) var snapshot: UpdateStatusSnapshot
    var onStateChanged: ((UpdateStatusSnapshot) -> Void)?

    init(dataDir: URL, autoUpdateEnabled: Bool, requestAppExit: @escaping () -> Void) {
        self.updatesDir = dataDir.appendingPathComponent("updates", isDirectory: true)
        self.autoUpdateEnabled = autoUpdateEnabled
        self.requestAppExit = requestAppExit
        self.currentVersion = Self.readCurrentVersion()
        let resolved = Self.resolveManifestUrl()
        self.manifestUrl = resolved.url
        self.allowLocalHttp = resolved.allowLocalHttp
        self.isDevBuild = !Bundle.main.bundlePath.hasSuffix(".app")
        self.isoFormatter = ISO8601DateFormatter()
        self.isoFormatter.formatOptions = [.withInternetDateTime]

        self.snapshot = UpdateStatusSnapshot(
            state: "idle",
            currentVersion: self.currentVersion,
            isDevBuild: self.isDevBuild,
            autoUpdate: autoUpdateEnabled
        )

        super.init()

        try? FileManager.default.createDirectory(at: updatesDir, withIntermediateDirectories: true)
        cleanupStaleFiles()
        scheduleBackgroundChecks()
    }

    func setAutoUpdateEnabled(_ enabled: Bool) {
        var shouldTrigger = false
        lock.lock()
        autoUpdateEnabled = enabled
        var next = snapshot
        next.autoUpdate = enabled
        snapshot = next
        if enabled && (next.state == "available" || next.state == "readyToInstall") && !isDevBuild && !isBusy {
            shouldTrigger = true
        }
        lock.unlock()

        emitOnMain(next)
        if shouldTrigger {
            downloadAndInstall(silentRelaunch: true, userInitiated: false)
        }
    }

    func checkForUpdates(userInitiated: Bool) {
        lock.lock()
        if isBusy || isShutdown {
            lock.unlock()
            return
        }
        isBusy = true
        let autoEnabled = autoUpdateEnabled
        let prevLatest = snapshot.latestVersion
        let prevChecked = snapshot.lastCheckedUtc
        lock.unlock()

        publish(UpdateStatusSnapshot(
            state: "checking",
            currentVersion: currentVersion,
            latestVersion: prevLatest,
            isDevBuild: isDevBuild,
            autoUpdate: autoEnabled,
            userInitiated: userInitiated,
            lastCheckedUtc: prevChecked
        ))

        fetchManifest { [weak self] result in
            guard let self = self else { return }
            let checkedAt = self.isoFormatter.string(from: Date())
            var shouldAutoInstall = false

            switch result {
            case .failure(let err):
                NSLog("Scream AppUpdater: Check failed: \(err.localizedDescription)")
                self.finishBusy()
                self.publish(UpdateStatusSnapshot(
                    state: "error",
                    currentVersion: self.currentVersion,
                    errorCode: "network",
                    message: err.localizedDescription,
                    isDevBuild: self.isDevBuild,
                    autoUpdate: self.getAutoUpdate(),
                    userInitiated: userInitiated,
                    lastCheckedUtc: prevChecked
                ))

            case .success(let manifest):
                guard !manifest.version.isEmpty else {
                    self.finishBusy()
                    self.publish(UpdateStatusSnapshot(
                        state: "error",
                        currentVersion: self.currentVersion,
                        errorCode: "manifest",
                        message: "Invalid update manifest.",
                        isDevBuild: self.isDevBuild,
                        autoUpdate: self.getAutoUpdate(),
                        userInitiated: userInitiated,
                        lastCheckedUtc: checkedAt
                    ))
                    return
                }

                if Self.compareVersions(manifest.version, self.currentVersion) <= 0 {
                    self.lock.lock()
                    self.latestManifest = nil
                    self.isBusy = false
                    let auto = self.autoUpdateEnabled
                    self.lock.unlock()

                    self.publish(UpdateStatusSnapshot(
                        state: "upToDate",
                        currentVersion: self.currentVersion,
                        latestVersion: manifest.version,
                        isDevBuild: self.isDevBuild,
                        autoUpdate: auto,
                        userInitiated: userInitiated,
                        lastCheckedUtc: checkedAt
                    ))
                    return
                }

                guard !manifest.zipUrl.isEmpty, self.isAllowedUrl(manifest.zipUrl) else {
                    self.finishBusy()
                    self.publish(UpdateStatusSnapshot(
                        state: "error",
                        currentVersion: self.currentVersion,
                        latestVersion: manifest.version,
                        errorCode: "manifest",
                        message: "No valid macOS package URL in manifest.",
                        isDevBuild: self.isDevBuild,
                        autoUpdate: self.getAutoUpdate(),
                        userInitiated: userInitiated,
                        lastCheckedUtc: checkedAt
                    ))
                    return
                }

                self.lock.lock()
                self.latestManifest = manifest
                let alreadyReady = self.downloadedZipURL != nil
                    && FileManager.default.fileExists(atPath: self.downloadedZipURL!.path)
                    && self.downloadedVersion.caseInsensitiveCompare(manifest.version) == .orderedSame
                let auto = self.autoUpdateEnabled
                let failedVer = self.failedAutoVersion
                self.isBusy = false
                self.lock.unlock()

                self.publish(UpdateStatusSnapshot(
                    state: alreadyReady ? "readyToInstall" : "available",
                    currentVersion: self.currentVersion,
                    latestVersion: manifest.version,
                    progress: alreadyReady ? 100 : 0,
                    totalBytes: manifest.zipSize,
                    canInstall: true,
                    isDevBuild: self.isDevBuild,
                    autoUpdate: auto,
                    userInitiated: userInitiated,
                    lastCheckedUtc: checkedAt
                ))

                if auto && !userInitiated && !self.isDevBuild
                    && failedVer.caseInsensitiveCompare(manifest.version) != .orderedSame {
                    shouldAutoInstall = true
                }
            }

            if shouldAutoInstall {
                self.downloadAndInstall(silentRelaunch: true, userInitiated: false)
            }
        }
    }

    func downloadAndInstall(silentRelaunch: Bool, userInitiated: Bool) {
        lock.lock()
        let manifest = latestManifest
        lock.unlock()

        guard let manifest = manifest else {
            checkForUpdates(userInitiated: userInitiated)
            return
        }

        lock.lock()
        if isBusy || isShutdown {
            lock.unlock()
            return
        }
        isBusy = true
        let auto = autoUpdateEnabled
        let checkedAt = snapshot.lastCheckedUtc
        lock.unlock()

        if isDevBuild {
            finishBusy()
            publish(UpdateStatusSnapshot(
                state: "error",
                currentVersion: currentVersion,
                latestVersion: manifest.version,
                errorCode: "devMode",
                message: "Auto-install runs only from a packaged Scream.app bundle.",
                canInstall: false,
                isDevBuild: true,
                autoUpdate: auto,
                userInitiated: userInitiated,
                lastCheckedUtc: checkedAt
            ))
            return
        }

        let safeVer = Self.sanitizeFileName(manifest.version)
        let destZip = updatesDir.appendingPathComponent("Scream-v\(safeVer)-macOS.zip")

        // Reuse previously verified download if still intact
        if FileManager.default.fileExists(atPath: destZip.path),
           verifySha256IfPresent(fileURL: destZip, expectedHex: manifest.zipSha256) {
            finalizeAndApply(manifest: manifest, zipURL: destZip, silentRelaunch: silentRelaunch, userInitiated: userInitiated)
            return
        }

        try? FileManager.default.removeItem(at: destZip)

        publish(UpdateStatusSnapshot(
            state: "downloading",
            currentVersion: currentVersion,
            latestVersion: manifest.version,
            progress: 0,
            downloadedBytes: 0,
            totalBytes: manifest.zipSize,
            isDevBuild: isDevBuild,
            autoUpdate: auto,
            userInitiated: userInitiated,
            lastCheckedUtc: checkedAt
        ))

        guard let url = URL(string: manifest.zipUrl), isAllowedUrl(manifest.zipUrl) else {
            finishBusy()
            publishError(code: "manifest", message: "Untrusted update download URL.", latestVersion: manifest.version, userInitiated: userInitiated)
            return
        }

        lock.lock()
        downloadExpectedSize = manifest.zipSize
        downloadVersion = manifest.version
        downloadUserInitiated = userInitiated
        lastProgressEmitTime = 0
        lastProgressPct = -1
        downloadContinuation = { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let err):
                NSLog("Scream AppUpdater: Download failed: \(err.localizedDescription)")
                if !userInitiated {
                    self.lock.lock()
                    self.failedAutoVersion = manifest.version
                    self.lock.unlock()
                }
                self.finishBusy()
                self.publishError(code: "network", message: err.localizedDescription, latestVersion: manifest.version, userInitiated: userInitiated)

            case .success(let tempLocation):
                do {
                    if FileManager.default.fileExists(atPath: destZip.path) {
                        try FileManager.default.removeItem(at: destZip)
                    }
                    try FileManager.default.moveItem(at: tempLocation, to: destZip)
                } catch {
                    self.finishBusy()
                    self.publishError(code: "install", message: error.localizedDescription, latestVersion: manifest.version, userInitiated: userInitiated)
                    return
                }

                if !self.verifySha256IfPresent(fileURL: destZip, expectedHex: manifest.zipSha256) {
                    try? FileManager.default.removeItem(at: destZip)
                    NSLog("Scream AppUpdater: SHA-256 verification failed for v\(manifest.version)")
                    if !userInitiated {
                        self.lock.lock()
                        self.failedAutoVersion = manifest.version
                        self.lock.unlock()
                    }
                    self.finishBusy()
                    self.publishError(code: "checksum", message: "SHA-256 verification failed.", latestVersion: manifest.version, userInitiated: userInitiated)
                    return
                }

                self.finalizeAndApply(manifest: manifest, zipURL: destZip, silentRelaunch: silentRelaunch, userInitiated: userInitiated)
            }
        }
        let task = downloadSession.downloadTask(with: url)
        activeDownloadTask = task
        lock.unlock()

        task.resume()
    }

    private func finalizeAndApply(manifest: ManifestInfo, zipURL: URL, silentRelaunch: Bool, userInitiated: Bool) {
        lock.lock()
        downloadedZipURL = zipURL
        downloadedVersion = manifest.version
        let auto = autoUpdateEnabled
        let checkedAt = snapshot.lastCheckedUtc
        lock.unlock()

        let targetAppURL = Bundle.main.bundleURL
        let parentDir = targetAppURL.deletingLastPathComponent().path
        let canWriteDirectly = FileManager.default.isWritableFile(atPath: parentDir)
            && FileManager.default.isWritableFile(atPath: targetAppURL.path)

        // Never pop up a macOS administrator password dialog unexpectedly during background updates.
        if !canWriteDirectly && !userInitiated {
            finishBusy()
            publish(UpdateStatusSnapshot(
                state: "readyToInstall",
                currentVersion: currentVersion,
                latestVersion: manifest.version,
                progress: 100,
                downloadedBytes: manifest.zipSize,
                totalBytes: manifest.zipSize,
                canInstall: true,
                isDevBuild: isDevBuild,
                autoUpdate: auto,
                userInitiated: false,
                lastCheckedUtc: checkedAt
            ))
            return
        }

        publish(UpdateStatusSnapshot(
            state: "installing",
            currentVersion: currentVersion,
            latestVersion: manifest.version,
            progress: 100,
            downloadedBytes: manifest.zipSize,
            totalBytes: manifest.zipSize,
            canInstall: false,
            isDevBuild: isDevBuild,
            autoUpdate: auto,
            userInitiated: userInitiated,
            lastCheckedUtc: checkedAt
        ))

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            do {
                try self.extractAndLaunchSwap(
                    zipURL: zipURL,
                    targetAppURL: targetAppURL,
                    needsAdmin: !canWriteDirectly,
                    silentRelaunch: silentRelaunch
                )
                DispatchQueue.main.async {
                    self.requestAppExit()
                }
            } catch {
                NSLog("Scream AppUpdater: Apply failed: \(error.localizedDescription)")
                if !userInitiated {
                    self.lock.lock()
                    self.failedAutoVersion = manifest.version
                    self.lock.unlock()
                }
                self.finishBusy()
                self.publishError(code: "install", message: error.localizedDescription, latestVersion: manifest.version, userInitiated: userInitiated)
            }
        }
    }

    private func extractAndLaunchSwap(zipURL: URL, targetAppURL: URL, needsAdmin: Bool, silentRelaunch: Bool) throws {
        let stageDir = updatesDir.appendingPathComponent("stage-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: stageDir, withIntermediateDirectories: true)

        let unzip = Process()
        unzip.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        unzip.arguments = ["-x", "-k", zipURL.path, stageDir.path]
        try unzip.run()
        unzip.waitUntilExit()
        guard unzip.terminationStatus == 0 else {
            try? FileManager.default.removeItem(at: stageDir)
            throw NSError(domain: "ScreamUpdater", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to unpack macOS update archive."])
        }

        let extractedApp = stageDir.appendingPathComponent("Scream.app", isDirectory: true)
        guard FileManager.default.fileExists(atPath: extractedApp.path) else {
            try? FileManager.default.removeItem(at: stageDir)
            throw NSError(domain: "ScreamUpdater", code: 2, userInfo: [NSLocalizedDescriptionKey: "Scream.app missing from update archive."])
        }

        let pid = ProcessInfo.processInfo.processIdentifier
        let scriptURL = updatesDir.appendingPathComponent("apply-update-\(UUID().uuidString).sh")
        let relaunchLine = silentRelaunch
            ? "open -n \"$TARGET_APP\" --args --autostart >/dev/null 2>&1 || true"
            : "open -n \"$TARGET_APP\" >/dev/null 2>&1 || true"

        let script = """
        #!/bin/sh
        OLD_PID="$1"
        NEW_APP="$2"
        TARGET_APP="$3"
        STAGE_DIR="$4"
        BACKUP_APP="${TARGET_APP}.backup.$$"

        i=0
        while kill -0 "$OLD_PID" 2>/dev/null; do
          i=$((i + 1))
          if [ "$i" -ge 100 ]; then break; fi
          sleep 0.2
        done
        sleep 0.3

        rm -rf "$BACKUP_APP" 2>/dev/null || true
        if ! mv "$TARGET_APP" "$BACKUP_APP"; then
          exit 1
        fi

        if /usr/bin/ditto "$NEW_APP" "$TARGET_APP"; then
          /usr/bin/xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true
          rm -rf "$BACKUP_APP" "$STAGE_DIR" 2>/dev/null || true
          \(relaunchLine)
          rm -f "$0" 2>/dev/null || true
          exit 0
        else
          rm -rf "$TARGET_APP" 2>/dev/null || true
          mv "$BACKUP_APP" "$TARGET_APP" 2>/dev/null || true
          rm -rf "$STAGE_DIR" 2>/dev/null || true
          exit 1
        fi
        """

        try script.write(to: scriptURL, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptURL.path)

        if needsAdmin {
            let cmd = "\(Self.shellQuote(scriptURL.path)) \(pid) \(Self.shellQuote(extractedApp.path)) \(Self.shellQuote(targetAppURL.path)) \(Self.shellQuote(stageDir.path)) >/dev/null 2>&1 &"
            let escapedForAppleScript = cmd
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            let osa = Process()
            osa.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            osa.arguments = ["-e", "do shell script \"\(escapedForAppleScript)\" with administrator privileges"]
            try osa.run()
            osa.waitUntilExit()
            if osa.terminationStatus != 0 {
                try? FileManager.default.removeItem(at: stageDir)
                try? FileManager.default.removeItem(at: scriptURL)
                throw NSError(domain: "ScreamUpdater", code: 3, userInfo: [NSLocalizedDescriptionKey: "Administrator authorization was cancelled."])
            }
        } else {
            let runner = Process()
            runner.executableURL = URL(fileURLWithPath: "/bin/sh")
            runner.arguments = [scriptURL.path, "\(pid)", extractedApp.path, targetAppURL.path, stageDir.path]
            runner.standardOutput = FileHandle.nullDevice
            runner.standardError = FileHandle.nullDevice
            try runner.run()
        }
    }

    // MARK: - URLSessionDownloadDelegate

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        lock.lock()
        let fallback = downloadExpectedSize
        let ver = downloadVersion
        let userInit = downloadUserInitiated
        let auto = autoUpdateEnabled
        let checkedAt = snapshot.lastCheckedUtc
        let now = Date().timeIntervalSinceReferenceDate
        let total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : fallback
        let pct = total > 0 ? Int(min(100, max(0, (totalBytesWritten * 100) / total))) : 0
        let shouldEmit = pct != lastProgressPct && ((now - lastProgressEmitTime) >= 0.14 || pct == 100)
        if shouldEmit {
            lastProgressPct = pct
            lastProgressEmitTime = now
        }
        lock.unlock()

        if shouldEmit {
            publish(UpdateStatusSnapshot(
                state: "downloading",
                currentVersion: currentVersion,
                latestVersion: ver,
                progress: pct,
                downloadedBytes: totalBytesWritten,
                totalBytes: total,
                isDevBuild: isDevBuild,
                autoUpdate: auto,
                userInitiated: userInit,
                lastCheckedUtc: checkedAt
            ))
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // Move out of URLSession's ephemeral temp location immediately before returning!
        let preserved = updatesDir.appendingPathComponent("dl-\(UUID().uuidString).part")
        let outcome: Result<URL, Error>
        do {
            try FileManager.default.moveItem(at: location, to: preserved)
            outcome = .success(preserved)
        } catch {
            outcome = .failure(error)
        }

        lock.lock()
        let cb = downloadContinuation
        downloadContinuation = nil
        activeDownloadTask = nil
        lock.unlock()

        cb?(outcome)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error = error else { return }
        lock.lock()
        let cb = downloadContinuation
        downloadContinuation = nil
        activeDownloadTask = nil
        lock.unlock()

        cb?(.failure(error))
    }

    // MARK: - Manifest & Helpers

    private func fetchManifest(completion: @escaping (Result<ManifestInfo, Error>) -> Void) {
        guard isAllowedUrl(manifestUrl) else {
            completion(.failure(NSError(domain: "ScreamUpdater", code: 10, userInfo: [NSLocalizedDescriptionKey: "Manifest URL must use HTTPS."])))
            return
        }

        let sep = manifestUrl.contains("?") ? "&" : "?"
        let reqUrlStr = "\(manifestUrl)\(sep)t=\(Int(Date().timeIntervalSince1970))"
        guard let url = URL(string: reqUrlStr) else {
            completion(.failure(NSError(domain: "ScreamUpdater", code: 11, userInfo: [NSLocalizedDescriptionKey: "Invalid manifest URL."])))
            return
        }

        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        req.setValue("Scream/\(currentVersion) (macOS; Universal)", forHTTPHeaderField: "User-Agent")
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

        URLSession.shared.dataTask(with: req) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                completion(.failure(NSError(domain: "ScreamUpdater", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode)"])))
                return
            }
            guard let data = data,
                  let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                completion(.failure(NSError(domain: "ScreamUpdater", code: 12, userInfo: [NSLocalizedDescriptionKey: "Invalid JSON in latest.json."])))
                return
            }

            var ver = (root["version"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if ver.isEmpty, let tag = root["tag"] as? String {
                ver = tag.trimmingCharacters(in: .whitespacesAndNewlines)
                if ver.hasPrefix("v") || ver.hasPrefix("V") { ver.removeFirst() }
            }

            let mac = root["macos"] as? [String: Any] ?? [:]
            let zipUrl = (mac["zipUrl"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let zipSha = (mac["zipSha256"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let zipSize: Int64
            if let n = mac["zipSize"] as? NSNumber {
                zipSize = n.int64Value
            } else {
                zipSize = 0
            }

            completion(.success(ManifestInfo(version: ver, zipUrl: zipUrl, zipSha256: zipSha, zipSize: zipSize)))
        }.resume()
    }

    private func scheduleBackgroundChecks() {
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            if self.getAutoUpdate() {
                self.checkForUpdates(userInitiated: false)
            }
            self.scheduleTimer = Timer.scheduledTimer(withTimeInterval: Self.periodicCheckIntervalSec, repeats: true) { [weak self] _ in
                guard let self = self, self.getAutoUpdate() else { return }
                self.checkForUpdates(userInitiated: false)
            }
        }
        initialWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.initialCheckDelaySec, execute: work)
    }

    func shutdown() {
        lock.lock()
        isShutdown = true
        let task = activeDownloadTask
        activeDownloadTask = nil
        downloadContinuation = nil
        lock.unlock()

        initialWorkItem?.cancel()
        scheduleTimer?.invalidate()
        task?.cancel()
        downloadSession.invalidateAndCancel()
    }

    private func verifySha256IfPresent(fileURL: URL, expectedHex: String) -> Bool {
        let expected = expectedHex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !expected.isEmpty else { return true }
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else { return false }
        defer { try? handle.close() }

        var hasher = SHA256()
        while true {
            let chunk = (try? handle.read(upToCount: 65536)) ?? Data()
            if chunk.isEmpty { break }
            hasher.update(data: chunk)
        }
        let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        return digest == expected
    }

    private func cleanupStaleFiles() {
        guard let items = try? FileManager.default.contentsOfDirectory(at: updatesDir, includingPropertiesForKeys: [.contentModificationDateKey]) else {
            return
        }
        let cutoff = Date().addingTimeInterval(-12 * 3600)
        for item in items {
            let name = item.lastPathComponent
            let modDate = (try? item.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
            if name.hasSuffix(".part") || name.hasPrefix("stage-") || name.hasPrefix("apply-update-") || modDate < cutoff {
                try? FileManager.default.removeItem(at: item)
            }
        }
    }

    private func finishBusy() {
        lock.lock()
        isBusy = false
        lock.unlock()
    }

    private func getAutoUpdate() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return autoUpdateEnabled
    }

    private func publishError(code: String, message: String, latestVersion: String, userInitiated: Bool) {
        lock.lock()
        let auto = autoUpdateEnabled
        let hasManifest = latestManifest != nil
        let checkedAt = snapshot.lastCheckedUtc
        lock.unlock()

        publish(UpdateStatusSnapshot(
            state: "error",
            currentVersion: currentVersion,
            latestVersion: latestVersion,
            errorCode: code,
            message: message,
            canInstall: hasManifest && !isDevBuild,
            isDevBuild: isDevBuild,
            autoUpdate: auto,
            userInitiated: userInitiated,
            lastCheckedUtc: checkedAt
        ))
    }

    private func publish(_ next: UpdateStatusSnapshot) {
        lock.lock()
        snapshot = next
        let stopped = isShutdown
        lock.unlock()
        if !stopped {
            emitOnMain(next)
        }
    }

    private func emitOnMain(_ snap: UpdateStatusSnapshot) {
        if Thread.isMainThread {
            onStateChanged?(snap)
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.onStateChanged?(snap)
            }
        }
    }

    private func isAllowedUrl(_ raw: String) -> Bool {
        guard let url = URL(string: raw), let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "https" { return true }
        if allowLocalHttp && scheme == "http" {
            let host = (url.host ?? "").lowercased()
            return host == "localhost" || host == "127.0.0.1"
        }
        return false
    }

    private static func readCurrentVersion() -> String {
        if let short = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
           !short.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return short.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return "1.0.0"
    }

    private static func resolveManifestUrl() -> (url: String, allowLocalHttp: Bool) {
        if let envUrl = ProcessInfo.processInfo.environment["SCREAM_UPDATE_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !envUrl.isEmpty {
            return (envUrl, true)
        }
        if let plistUrl = Bundle.main.infoDictionary?["ScreamUpdateManifestUrl"] as? String,
           !plistUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return (plistUrl.trimmingCharacters(in: .whitespacesAndNewlines), false)
        }
        return (defaultManifestUrl, false)
    }

    private static func compareVersions(_ a: String, _ b: String) -> Int {
        func parse(_ raw: String) -> ([Int], String) {
            var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if s.hasPrefix("v") || s.hasPrefix("V") { s.removeFirst() }
            if let plus = s.firstIndex(of: "+") { s = String(s[..<plus]) }
            var pre = ""
            if let dash = s.firstIndex(of: "-") {
                pre = String(s[s.index(after: dash)...])
                s = String(s[..<dash])
            }
            let parts = s.split(separator: ".").map { Int($0) ?? 0 }
            let padded = parts + Array(repeating: 0, count: max(0, 3 - parts.count))
            return (padded, pre)
        }

        let (na, pa) = parse(a)
        let (nb, pb) = parse(b)
        let len = max(na.count, nb.count)
        for i in 0..<len {
            let va = i < na.count ? na[i] : 0
            let vb = i < nb.count ? nb[i] : 0
            if va != vb { return va < vb ? -1 : 1 }
        }
        if !pa.isEmpty && pb.isEmpty { return -1 }
        if pa.isEmpty && !pb.isEmpty { return 1 }
        let cmp = pa.caseInsensitiveCompare(pb)
        return cmp == .orderedAscending ? -1 : (cmp == .orderedDescending ? 1 : 0)
    }

    private static func sanitizeFileName(_ raw: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: ".-_"))
        return String(raw.unicodeScalars.filter { allowed.contains($0) })
    }

    private static func shellQuote(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
