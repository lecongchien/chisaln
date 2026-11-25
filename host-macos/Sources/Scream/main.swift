import AppKit

let app = NSApplication.shared
// Menu Bar accessory app (no permanent Dock clutter; Settings window appears cleanly on demand)
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
