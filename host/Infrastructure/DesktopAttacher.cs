using System;
using System.Drawing;
using System.Threading;

namespace Scream.Infrastructure
{
    /// <summary>
    /// Attaches a borderless window behind the Windows desktop icon layer:
    /// - Windows 11 24H2+ ("Raised Desktop"): WS_EX_LAYERED child of Progman immediately below SHELLDLL_DefView,
    ///   guarded by SetWinEventHook + EnsureZOrder() so Windows Spotlight / Slideshow cannot bury or kill it.
    /// - Windows 10 / 11 pre-24H2: Classic top-level WorkerW child spawned via message 0x052C.
    /// </summary>
    internal sealed class DesktopAttacher : IDisposable
    {
        private IntPtr _childHwnd;
        private IntPtr _parentHwnd;
        private IntPtr _zAnchor;
        private IntPtr _winEventHook;
        private Native.WinEventDelegate? _winEventProc;
        private bool _isRaisedProgman;
        private Rectangle _targetBounds;

        public string ModeDescription { get; private set; } = "unattached";
        public bool IsAttached =>
            _parentHwnd != IntPtr.Zero &&
            Native.IsWindow(_parentHwnd) &&
            (!_isRaisedProgman || (_zAnchor != IntPtr.Zero && Native.IsWindow(_zAnchor))) &&
            _childHwnd != IntPtr.Zero &&
            Native.IsWindow(_childHwnd) &&
            Native.GetParent(_childHwnd) == _parentHwnd;

        public static bool IsDesktopShellReady()
        {
            IntPtr progman = Native.FindWindow("Progman", null);
            if (progman == IntPtr.Zero) return false;
            return FindClassicWorker(progman) != IntPtr.Zero ||
                   Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero;
        }

        public static IntPtr FindClassicWorker(IntPtr progman)
        {
            IntPtr defViewHost = IntPtr.Zero;
            Native.EnumWindows((hWnd, _) =>
            {
                if (hWnd != progman && Native.FindWindowEx(hWnd, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                {
                    defViewHost = hWnd;
                    return false;
                }
                return true;
            }, IntPtr.Zero);

            return defViewHost != IntPtr.Zero
                ? Native.FindWindowEx(IntPtr.Zero, defViewHost, "WorkerW", null)
                : IntPtr.Zero;
        }

        private static void RequestWorkerW(IntPtr progman, Func<bool> readyCheck)
        {
            Native.SendMessageTimeout(
                progman, Native.WM_SPAWN_WORKER,
                new IntPtr(0xD), new IntPtr(1),
                Native.SMTO_NORMAL, 300, out _);

            if (readyCheck()) return;

            // Fallback wParam/lParam variant used on some Windows 10 builds
            Native.SendMessageTimeout(
                progman, Native.WM_SPAWN_WORKER,
                IntPtr.Zero, IntPtr.Zero,
                Native.SMTO_NORMAL, 300, out _);

            for (int i = 0; i < 12 && !readyCheck(); i++)
            {
                Thread.Sleep(15);
            }
        }

        public bool Attach(IntPtr windowHandle, Rectangle screenBounds)
        {
            Detach();
            _childHwnd = windowHandle;
            _targetBounds = screenBounds;

            IntPtr progman = Native.FindWindow("Progman", null);
            if (progman == IntPtr.Zero)
            {
                AppLog.Write("DesktopAttacher: Progman window not found.");
                return false;
            }

            IntPtr classicWorker = FindClassicWorker(progman);
            IntPtr defViewInProgman = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);

            // Fast-path Windows 11 24H2+ ("Raised Desktop"): Progman natively hosts SHELLDLL_DefView
            // and system WorkerW children directly — skip blocking WM_SPAWN_WORKER + Thread.Sleep polling!
            bool isWin11RaisedDesktop =
                classicWorker == IntPtr.Zero &&
                defViewInProgman != IntPtr.Zero &&
                (Environment.OSVersion.Version.Build >= 26100 ||
                 Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null) != IntPtr.Zero);

            if (classicWorker == IntPtr.Zero && !isWin11RaisedDesktop)
            {
                RequestWorkerW(progman, () =>
                    FindClassicWorker(progman) != IntPtr.Zero ||
                    Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null) != IntPtr.Zero);
                classicWorker = FindClassicWorker(progman);
                defViewInProgman = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            }

            if (classicWorker != IntPtr.Zero)
            {
                // Classic Windows 10 / 11 pre-24H2 WorkerW attachment
                _parentHwnd = classicWorker;
                _zAnchor = IntPtr.Zero;
                _isRaisedProgman = false;
                ModeDescription = "Classic WorkerW (Win10 / Win11 pre-24H2)";
            }
            else if (defViewInProgman != IntPtr.Zero)
            {
                // Windows 11 24H2+ Raised Desktop: Progman layered child right under SHELLDLL_DefView
                _parentHwnd = progman;
                _zAnchor = defViewInProgman;
                _isRaisedProgman = true;
                ModeDescription = "Raised Progman Layered Child (Win11 24H2+)";

                int exStyle = Native.GetWindowLong(_childHwnd, Native.GWL_EXSTYLE);
                Native.SetWindowLong(_childHwnd, Native.GWL_EXSTYLE,
                    exStyle | Native.WS_EX_LAYERED | Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW);
                Native.SetLayeredWindowAttributes(_childHwnd, 0, 255, Native.LWA_ALPHA);
            }
            else
            {
                AppLog.Write("DesktopAttacher: Neither classic WorkerW nor Progman SHELLDLL_DefView found.");
                return false;
            }

            // Convert style to borderless child window so SetParent behaves predictably
            int style = Native.GetWindowLong(_childHwnd, Native.GWL_STYLE);
            style &= ~(Native.WS_POPUP | Native.WS_CAPTION | Native.WS_THICKFRAME);
            style |= Native.WS_CHILD | Native.WS_VISIBLE;
            Native.SetWindowLong(_childHwnd, Native.GWL_STYLE, style);

            Native.SetParent(_childHwnd, _parentHwnd);

            PositionToTargetScreen();

            if (_isRaisedProgman)
            {
                EnsureZOrder();
                InstallExplorerHook(progman);
            }

            AppLog.Write($"DesktopAttacher: Attached using [{ModeDescription}] bounds={screenBounds}");
            return true;
        }

        public void PositionToTargetScreen()
        {
            if (_childHwnd == IntPtr.Zero || _parentHwnd == IntPtr.Zero) return;

            var topLeft = new Native.POINT { X = _targetBounds.X, Y = _targetBounds.Y };
            Native.ScreenToClient(_parentHwnd, ref topLeft);

            IntPtr insertAfter = _isRaisedProgman ? _zAnchor : IntPtr.Zero;
            uint flags = Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW | Native.SWP_FRAMECHANGED;
            if (!_isRaisedProgman) flags |= Native.SWP_NOZORDER;

            Native.SetWindowPos(
                _childHwnd, insertAfter,
                topLeft.X, topLeft.Y, _targetBounds.Width, _targetBounds.Height,
                flags);
        }

        public void UpdateBounds(Rectangle newBounds)
        {
            if (newBounds == _targetBounds) return;
            _targetBounds = newBounds;
            PositionToTargetScreen();
        }

        private void InstallExplorerHook(IntPtr progman)
        {
            if (_winEventHook != IntPtr.Zero) return;
            Native.GetWindowThreadProcessId(progman, out uint pid);
            if (pid == 0) return;

            _winEventProc = (_, _, _, _, _, _, _) => EnsureZOrder();
            _winEventHook = Native.SetWinEventHook(
                Native.EVENT_OBJECT_CREATE,
                Native.EVENT_OBJECT_REORDER,
                IntPtr.Zero,
                _winEventProc,
                pid,
                0,
                Native.WINEVENT_OUTOFCONTEXT);
        }

        public void EnsureZOrder()
        {
            if (!_isRaisedProgman || _childHwnd == IntPtr.Zero || _parentHwnd == IntPtr.Zero) return;
            if (!Native.IsWindow(_childHwnd) || !Native.IsWindow(_parentHwnd)) return;

            // Verify we are directly below zAnchor (SHELLDLL_DefView)
            if (_zAnchor != IntPtr.Zero && Native.GetWindow(_childHwnd, Native.GW_HWNDPREV) != _zAnchor)
            {
                Native.SetWindowPos(
                    _childHwnd, _zAnchor, 0, 0, 0, 0,
                    Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
            }

            // Push any system wallpaper WorkerW children under Progman to the very bottom
            IntPtr worker = Native.FindWindowEx(_parentHwnd, IntPtr.Zero, "WorkerW", null);
            while (worker != IntPtr.Zero)
            {
                if (worker != _childHwnd)
                {
                    Native.SetWindowPos(
                        worker, Native.HWND_BOTTOM, 0, 0, 0, 0,
                        Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
                }
                worker = Native.FindWindowEx(_parentHwnd, worker, "WorkerW", null);
            }
        }

        public void Detach()
        {
            if (_winEventHook != IntPtr.Zero)
            {
                Native.UnhookWinEvent(_winEventHook);
                _winEventHook = IntPtr.Zero;
                _winEventProc = null;
            }

            IntPtr prevParent = _parentHwnd;
            if (_childHwnd != IntPtr.Zero && Native.IsWindow(_childHwnd))
            {
                Native.SetParent(_childHwnd, IntPtr.Zero);
            }

            if (prevParent != IntPtr.Zero && Native.IsWindow(prevParent))
            {
                Native.RedrawWindow(
                    prevParent, IntPtr.Zero, IntPtr.Zero,
                    Native.RDW_INVALIDATE | Native.RDW_ERASE | Native.RDW_ALLCHILDREN | Native.RDW_UPDATENOW);
            }

            // Also repaint Progman so static/Slideshow/Spotlight wallpaper refreshes cleanly
            IntPtr progman = Native.FindWindow("Progman", null);
            if (progman != IntPtr.Zero && progman != prevParent)
            {
                Native.RedrawWindow(
                    progman, IntPtr.Zero, IntPtr.Zero,
                    Native.RDW_INVALIDATE | Native.RDW_ERASE | Native.RDW_ALLCHILDREN | Native.RDW_UPDATENOW);
            }

            _parentHwnd = IntPtr.Zero;
            _zAnchor = IntPtr.Zero;
            _isRaisedProgman = false;
        }

        public void Dispose()
        {
            Detach();
        }
    }
}
