using System;
using System.Drawing;
using System.Text;

namespace Scream.Infrastructure
{
    /// <summary>
    /// Detects whether a maximized or full-screen window currently obscures the target screen,
    /// properly filtering out desktop shell windows, hidden windows, self windows, and DWM-cloaked UWP windows.
    /// </summary>
    internal static class ForegroundMonitor
    {
        public static bool ShouldPauseForScreen(
            Rectangle screenBounds,
            IntPtr selfWallpaperHwnd,
            IntPtr selfSettingsHwnd,
            out string reasonClass)
        {
            reasonClass = "";
            IntPtr fg = Native.GetForegroundWindow();
            if (fg == IntPtr.Zero || fg == selfWallpaperHwnd || fg == selfSettingsHwnd)
            {
                return false;
            }

            if (!Native.IsWindowVisible(fg))
            {
                return false;
            }

            // Exclude DWM-cloaked windows (suspended UWP apps, virtual desktop hidden windows)
            if (Native.DwmGetWindowAttribute(fg, Native.DWMWA_CLOAKED, out int cloaked, sizeof(int)) == 0 && cloaked != 0)
            {
                return false;
            }

            var classBuilder = new StringBuilder(64);
            Native.GetClassName(fg, classBuilder, classBuilder.Capacity);
            string cls = classBuilder.ToString();

            if (cls is "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd"
                or "NotifyIconOverflowWindow" or "Windows.UI.Core.CoreWindow")
            {
                return false;
            }

            if (!Native.GetWindowRect(fg, out Native.RECT wr))
            {
                return false;
            }

            int width = wr.Right - wr.Left;
            int height = wr.Bottom - wr.Top;
            if (width <= 0 || height <= 0) return false;

            int cx = (wr.Left + wr.Right) / 2;
            int cy = (wr.Top + wr.Bottom) / 2;
            if (!screenBounds.Contains(cx, cy))
            {
                return false;
            }

            bool coversEntireScreen =
                wr.Left <= screenBounds.Left + 2 &&
                wr.Top <= screenBounds.Top + 2 &&
                wr.Right >= screenBounds.Right - 2 &&
                wr.Bottom >= screenBounds.Bottom - 2;

            if (coversEntireScreen || Native.IsZoomed(fg))
            {
                reasonClass = cls;
                return true;
            }

            return false;
        }
    }
}
