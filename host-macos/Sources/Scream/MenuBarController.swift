import AppKit
import Foundation

/// Native macOS Menu Bar controller mirroring Windows TrayController (Vietnamese & English).
final class MenuBarController: NSObject {
    private let statusItem: NSStatusItem
    private let menu = NSMenu()

    private let itemOpen: NSMenuItem
    private let itemNight: NSMenuItem
    private let itemPause: NSMenuItem
    private let itemReload: NSMenuItem
    private let itemMulti: NSMenuItem
    private let itemQuit: NSMenuItem

    private let onOpenSettings: () -> Void
    private let onToggleNight: () -> Void
    private let onTogglePause: () -> Void
    private let onReload: () -> Void
    private let onToggleMultiMonitor: () -> Void
    private let onQuit: () -> Void

    init(
        onOpenSettings: @escaping () -> Void,
        onToggleNight: @escaping () -> Void,
        onTogglePause: @escaping () -> Void,
        onReload: @escaping () -> Void,
        onToggleMultiMonitor: @escaping () -> Void,
        onQuit: @escaping () -> Void
    ) {
        self.onOpenSettings = onOpenSettings
        self.onToggleNight = onToggleNight
        self.onTogglePause = onTogglePause
        self.onReload = onReload
        self.onToggleMultiMonitor = onToggleMultiMonitor
        self.onQuit = onQuit

        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        self.itemOpen = NSMenuItem(title: "Mở Cài đặt…", action: #selector(handleOpen), keyEquivalent: ",")
        self.itemNight = NSMenuItem(title: "Đổi nhanh Ngày / Đêm", action: #selector(handleNight), keyEquivalent: "")
        self.itemPause = NSMenuItem(title: "Tạm dừng hình nền", action: #selector(handlePause), keyEquivalent: "")
        self.itemReload = NSMenuItem(title: "Tải lại hình nền", action: #selector(handleReload), keyEquivalent: "")
        self.itemMulti = NSMenuItem(title: "Phủ tất cả màn hình", action: #selector(handleMulti), keyEquivalent: "")
        self.itemQuit = NSMenuItem(title: "Thoát Scream", action: #selector(handleQuit), keyEquivalent: "q")

        super.init()

        for item in [itemOpen, itemNight, itemPause, itemReload, itemMulti, itemQuit] {
            item.target = self
        }

        menu.addItem(itemOpen)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(itemNight)
        menu.addItem(itemPause)
        menu.addItem(itemReload)
        menu.addItem(itemMulti)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(itemQuit)

        if let btn = statusItem.button {
            btn.image = Self.createMenuBarTemplateIcon()
            btn.toolTip = "Scream Adaptive Wallpaper"
        }
        statusItem.menu = menu
    }

    func syncState(lang: String, isNight: Bool, paused: Bool, multiMonitor: Bool) {
        let en = (lang == "en")
        itemOpen.title = en ? "Open Settings…" : "Mở Cài đặt…"
        itemNight.title = en
            ? (isNight ? "Switch to Day" : "Switch to Night")
            : (isNight ? "Chuyển sang Ban ngày" : "Chuyển sang Ban đêm")
        itemPause.title = en
            ? (paused ? "Resume Wallpaper" : "Pause Wallpaper")
            : (paused ? "Tiếp tục hình nền" : "Tạm dừng hình nền")
        itemReload.title = en ? "Reload Wallpaper" : "Tải lại hình nền"
        itemMulti.title = en ? "Extend Across All Displays" : "Phủ tất cả màn hình"
        itemMulti.state = multiMonitor ? .on : .off
        itemQuit.title = en ? "Quit Scream" : "Thoát Scream"
    }

    /// Crisp 18x18 template icon (crescent moon + ocean wave) adapting cleanly to macOS Light & Dark Menu Bar.
    private static func createMenuBarTemplateIcon() -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let img = NSImage(size: size, flipped: false) { _ in
            NSColor.labelColor.set()

            // Outer ring
            let ring = NSBezierPath(ovalIn: NSRect(x: 1.5, y: 1.5, width: 15, height: 15))
            ring.lineWidth = 1.4
            ring.stroke()

            // Crescent moon inside upper half
            let moon = NSBezierPath()
            moon.appendArc(withCenter: NSPoint(x: 9.0, y: 11.2), radius: 3.1, startAngle: 35, endAngle: 295, clockwise: false)
            moon.appendArc(withCenter: NSPoint(x: 10.6, y: 11.9), radius: 2.3, startAngle: 265, endAngle: 65, clockwise: true)
            moon.close()
            moon.fill()

            // Wave arc inside lower half
            let wave = NSBezierPath()
            wave.move(to: NSPoint(x: 4.4, y: 6.4))
            wave.curve(to: NSPoint(x: 13.6, y: 6.4),
                       controlPoint1: NSPoint(x: 7.0, y: 4.4),
                       controlPoint2: NSPoint(x: 11.0, y: 4.4))
            wave.lineWidth = 1.45
            wave.lineCapStyle = .round
            wave.stroke()
            return true
        }
        img.isTemplate = true
        return img
    }

    @objc private func handleOpen() { onOpenSettings() }
    @objc private func handleNight() { onToggleNight() }
    @objc private func handlePause() { onTogglePause() }
    @objc private func handleReload() { onReload() }
    @objc private func handleMulti() { onToggleMultiMonitor() }
    @objc private func handleQuit() { onQuit() }
}
