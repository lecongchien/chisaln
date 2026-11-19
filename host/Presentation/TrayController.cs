using System;
using System.Drawing;
using System.Windows.Forms;

namespace Scream.Presentation
{
    /// <summary>Encapsulates the Windows System Tray icon and localized context menu.</summary>
    internal sealed class TrayController : IDisposable
    {
        private readonly NotifyIcon _trayIcon;
        private readonly ContextMenuStrip _trayMenu;
        private readonly ToolStripMenuItem _miSettings;
        private readonly ToolStripMenuItem _miNight;
        private readonly ToolStripMenuItem _miPause;
        private readonly ToolStripMenuItem _miReload;
        private readonly ToolStripMenuItem _miMultiMonitor;
        private readonly ToolStripMenuItem _miExit;

        public TrayController(
            Icon appIcon,
            bool initialMultiMonitor,
            Action onOpenSettings,
            Action onToggleNight,
            Action onTogglePause,
            Action onReload,
            Action onToggleMultiMonitor,
            Action onExit)
        {
            _miSettings = new ToolStripMenuItem("Cài đặt & Xem trước (Ctrl+Alt+M)", null, (_, _) => onOpenSettings());
            _miSettings.Font = new Font(_miSettings.Font, FontStyle.Bold);
            _miNight = new ToolStripMenuItem("Chế độ Đêm ánh trăng (Ctrl+Alt+N)", null, (_, _) => onToggleNight());
            _miPause = new ToolStripMenuItem("Tạm dừng (Ctrl+Alt+H)", null, (_, _) => onTogglePause());
            _miReload = new ToolStripMenuItem("Tải lại chủ đề", null, (_, _) => onReload());
            _miMultiMonitor = new ToolStripMenuItem("Phủ tất cả màn hình", null, (_, _) => onToggleMultiMonitor())
            {
                Checked = initialMultiMonitor
            };
            _miExit = new ToolStripMenuItem("Thoát Scream", null, (_, _) => onExit());

            _trayMenu = new ContextMenuStrip();
            _trayMenu.Items.AddRange(new ToolStripItem[]
            {
                _miSettings,
                _miNight,
                new ToolStripSeparator(),
                _miPause,
                _miReload,
                _miMultiMonitor,
                new ToolStripSeparator(),
                _miExit
            });

            _trayIcon = new NotifyIcon
            {
                Icon = appIcon,
                Text = "Scream — Hình nền thích ứng",
                ContextMenuStrip = _trayMenu,
                Visible = true
            };
            _trayIcon.DoubleClick += (_, _) => onOpenSettings();
        }

        public void ShowMenuAtCursor() => _trayMenu.Show(Cursor.Position);

        public void SyncState(string lang, bool isNight, bool manualPause, bool multiMonitor)
        {
            bool en = lang == "en";
            _miSettings.Text = en ? "Settings & Preview (Ctrl+Alt+M)" : "Cài đặt & Xem trước (Ctrl+Alt+M)";
            _miNight.Text = en ? "Moonlit Night Mode (Ctrl+Alt+N)" : "Chế độ Đêm ánh trăng (Ctrl+Alt+N)";
            _miNight.Checked = isNight;
            _miPause.Text = manualPause
                ? (en ? "Resume Wallpaper (Ctrl+Alt+H)" : "Tiếp tục hình nền (Ctrl+Alt+H)")
                : (en ? "Pause Wallpaper (Ctrl+Alt+H)" : "Tạm dừng hình nền (Ctrl+Alt+H)");
            _miReload.Text = en ? "Reload Theme" : "Tải lại chủ đề";
            _miMultiMonitor.Text = en ? "Cover All Monitors" : "Phủ tất cả màn hình";
            _miMultiMonitor.Checked = multiMonitor;
            _miExit.Text = en ? "Exit Scream" : "Thoát Scream";
            _trayIcon.Text = en ? "Scream — Adaptive Wallpaper" : "Scream — Hình nền thích ứng";
        }

        public void Dispose()
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _trayMenu.Dispose();
        }
    }
}
