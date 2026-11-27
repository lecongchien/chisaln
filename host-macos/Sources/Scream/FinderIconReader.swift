import AppKit
import Foundation

/// Reads real macOS Desktop icon coordinates from Finder on a background queue so
/// Scream's adaptive WebGL2 themes wrap shorelines, clouds, and grass clearings around real Mac icons.
/// Degrades gracefully if Automation permission is denied (backs off to 15s polling, zero crash/spam).
final class FinderIconReader {
    private let queue = DispatchQueue(label: "com.scream.finder-icons", qos: .utility)
    private var inFlight = false
    private var permissionDeniedUntil: Date = .distantPast

    private static let appleScript = """
    set AppleScript's text item delimiters to ";"
    tell application "Finder"
        if not (exists desktop) then return ""
        set posList to {}
        repeat with f in (every item of desktop)
            try
                set p to desktop position of f
                set end of posList to ((item 1 of p) as text) & "," & ((item 2 of p) as text)
            end try
        end repeat
        return posList as text
    end tell
    """

    func readAsync(completion: @escaping (_ rects: [IconRect], _ visible: Bool) -> Void) {
        queue.async { [weak self] in
            guard let self = self, !self.inFlight else { return }
            if Date() < self.permissionDeniedUntil {
                return
            }
            self.inFlight = true
            defer { self.inFlight = false }

            // Check if user hid macOS desktop icons via Finder preference (CreateDesktop = false)
            if let finderDefaults = UserDefaults(suiteName: "com.apple.finder"),
               finderDefaults.object(forKey: "CreateDesktop") != nil,
               !finderDefaults.bool(forKey: "CreateDesktop") {
                DispatchQueue.main.async { completion([], false) }
                return
            }

            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            proc.arguments = ["-e", Self.appleScript]

            let outPipe = Pipe()
            let errPipe = Pipe()
            proc.standardOutput = outPipe
            proc.standardError = errPipe

            var data = Data()
            let doneSem = DispatchSemaphore(value: 0)
            proc.terminationHandler = { _ in doneSem.signal() }

            do {
                try proc.run()
            } catch {
                self.permissionDeniedUntil = Date().addingTimeInterval(15)
                DispatchQueue.main.async { completion([], true) }
                return
            }

            // Drain stdout & stderr asynchronously with a 3.5s watchdog so a pending TCC Automation dialog
            // or stalled Finder AppleEvent can NEVER deadlock `inFlight = true` permanently.
            let readGroup = DispatchGroup()
            readGroup.enter()
            DispatchQueue.global(qos: .utility).async {
                data = outPipe.fileHandleForReading.readDataToEndOfFile()
                readGroup.leave()
            }
            readGroup.enter()
            DispatchQueue.global(qos: .utility).async {
                _ = errPipe.fileHandleForReading.readDataToEndOfFile()
                readGroup.leave()
            }

            if doneSem.wait(timeout: .now() + 3.5) == .timedOut {
                proc.terminate()
                self.permissionDeniedUntil = Date().addingTimeInterval(12)
                DispatchQueue.main.async { completion([], true) }
                return
            }
            _ = readGroup.wait(timeout: .now() + 1.0)

            if proc.terminationStatus != 0 {
                // User may have not granted Finder Automation permission yet — back off gently
                self.permissionDeniedUntil = Date().addingTimeInterval(15)
                DispatchQueue.main.async { completion([], true) }
                return
            }

            let raw = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            var rects: [IconRect] = []

            if !raw.isEmpty {
                for entry in raw.split(separator: ";") {
                    let parts = entry.split(separator: ",")
                    guard parts.count == 2,
                          let cx = Double(parts[0].trimmingCharacters(in: .whitespaces)),
                          let cy = Double(parts[1].trimmingCharacters(in: .whitespaces)) else {
                        continue
                    }
                    // Finder returns icon center in top-left primary display points; expand to standard icon+label tile
                    let left = Int(cx.rounded()) - 42
                    let top = Int(cy.rounded()) - 40
                    let right = Int(cx.rounded()) + 42
                    let bottom = Int(cy.rounded()) + 54
                    rects.append(IconRect(left: left, top: top, right: right, bottom: bottom))
                }
            }

            DispatchQueue.main.async {
                completion(rects, true)
            }
        }
    }
}
