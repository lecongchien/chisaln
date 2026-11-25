import AppKit
import CoreGraphics
import Foundation

/// Detects when a maximized or fullscreen application covers a display so Scream drops GPU usage near 0%.
enum ForegroundMonitor {
    static func shouldPause(for screen: NSScreen, ignoringWindowNumbers ignored: Set<Int>) -> Bool {
        guard let infoList = CGWindowListCopyWindowInfo(
            [.optionOnScreenOnly, .excludeDesktopElements],
            kCGNullWindowID
        ) as? [[String: Any]] else {
            return false
        }

        // Convert AppKit bottom-left screen rect into CoreGraphics top-left display coordinates
        let primaryHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height
        let vis = screen.visibleFrame
        let screenTop = primaryHeight - (vis.origin.y + vis.height)
        let screenRect = CGRect(x: vis.origin.x, y: screenTop, width: vis.width, height: vis.height)
        let screenArea = max(1.0, screenRect.width * screenRect.height)

        let myPid = ProcessInfo.processInfo.processIdentifier

        for info in infoList {
            guard let layer = info[kCGWindowLayer as String] as? Int, layer == 0 else { continue }
            if let alpha = info[kCGWindowAlpha as String] as? Double, alpha < 0.05 { continue }
            if let pid = info[kCGWindowOwnerPID as String] as? pid_t, pid == myPid { continue }
            if let winNum = info[kCGWindowNumber as String] as? Int, ignored.contains(winNum) { continue }
            if let owner = info[kCGWindowOwnerName as String] as? String,
               owner == "Window Server" || owner == "Dock" || owner == "Control Center" {
                continue
            }

            guard let boundsDict = info[kCGWindowBounds as String] as? [String: Any],
                  let wRect = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) else {
                continue
            }

            let inter = screenRect.intersection(wRect)
            if inter.isNull || inter.isEmpty { continue }

            let coverage = (inter.width * inter.height) / screenArea
            if coverage >= 0.88 {
                return true
            }
        }

        return false
    }
}
