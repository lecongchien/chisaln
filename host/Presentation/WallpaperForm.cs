using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Scream.Application;
using Scream.Infrastructure;

namespace Scream.Presentation
{
    internal sealed class WallpaperForm : Form
    {
        private readonly ISettingsRepository _store;
        private readonly CoreWebView2Environment _webEnv;
        private readonly Func<IntPtr> _getSettingsHwnd;
        private readonly WebView2 _webView;
        private readonly DesktopAttacher _attacher = new();
        private readonly IconReader _iconReader = new();
        private readonly Timer _iconTimer;
        private readonly Timer _fgTimer;
        private readonly Timer _mouseTimer;

        private Screen _targetScreen;
        private string _currentPage;
        private string _currentQuery;
        private bool _manualPause;
        private bool _autoPauseEnabled;
        private bool _pageReady;
        private bool _shuttingDown;
        private string _lastIconsJson = "";
        private int _lastPauseState = -1;
        private Point _lastMousePos = new(-9999, -9999);
        private Action<bool, string, string>? _pendingShareCallback;

        public event Action<string, int, bool>? IconsSnapshotUpdated;
        public event Action<bool>? PauseStateChanged;
        public event Action<string>? StatusChanged;
        public event Action? PageReady;

        public Screen TargetScreen => _targetScreen;
        public string LastIconsJson => _lastIconsJson;
        public bool IsPaused => _lastPauseState == 1;
        public bool IsPageReady => _pageReady;
        public string AttachMode => _attacher.ModeDescription;

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
                return cp;
            }
        }

        public WallpaperForm(
            ISettingsRepository store,
            CoreWebView2Environment webEnv,
            Screen screen,
            string initialPage,
            string initialQuery,
            bool manualPause,
            bool autoPauseEnabled,
            Func<IntPtr> getSettingsHwnd)
        {
            _store = store;
            _webEnv = webEnv;
            _targetScreen = screen;
            _currentPage = initialPage;
            _currentQuery = initialQuery ?? "";
            _manualPause = manualPause;
            _autoPauseEnabled = autoPauseEnabled;
            _getSettingsHwnd = getSettingsHwnd;

            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Bounds = screen.Bounds;
            BackColor = Color.FromArgb(14, 78, 108);

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(14, 78, 108)
            };
            Controls.Add(_webView);

            _iconTimer = new Timer { Interval = 650 };
            _iconTimer.Tick += (_, _) => PollIcons();

            _fgTimer = new Timer { Interval = 650 };
            _fgTimer.Tick += (_, _) => PollForeground();

            _mouseTimer = new Timer { Interval = 33 };
            _mouseTimer.Tick += (_, _) => PollCursor();
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            if (_shuttingDown) return;

            if (!_attacher.Attach(Handle, _targetScreen.Bounds))
            {
                StatusChanged?.Invoke("Failed to attach to desktop layer");
            }
            else
            {
                StatusChanged?.Invoke(_attacher.ModeDescription);
            }

            try
            {
                await InitializeWebViewAsync();
            }
            catch (Exception ex)
            {
                AppLog.Write($"WallpaperForm: WebView2 init failed: {ex.Message}");
                StatusChanged?.Invoke("WebView2 error: " + ex.Message);
            }
        }

        private async Task InitializeWebViewAsync()
        {
            await _webView.EnsureCoreWebView2Async(_webEnv);
            if (_shuttingDown || IsDisposed) return;

            var core = _webView.CoreWebView2;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsZoomControlEnabled = false;

            core.SetVirtualHostNameToFolderMapping(
                "app.local", _store.WebDir, CoreWebView2HostResourceAccessKind.Allow);

            core.WebMessageReceived += OnWebMessageReceived;
            core.ProcessFailed += (_, args) =>
            {
                AppLog.Write($"WallpaperForm: WebView2 process failed: {args.ProcessFailedKind}");
                if (!_shuttingDown && !IsDisposed)
                {
                    BeginInvoke(new Action(ReloadPage));
                }
            };

            NavigateToPage(_currentPage, _currentQuery);
            _iconTimer.Start();
            _fgTimer.Start();
            _mouseTimer.Start();
        }

        public void NavigateToPage(string page, string extraQuery = "")
        {
            _currentPage = page;
            _currentQuery = extraQuery ?? "";
            _pageReady = false;
            _lastIconsJson = "";
            _lastPauseState = -1;
            if (_webView.CoreWebView2 != null)
            {
                _webView.CoreWebView2.Navigate($"https://app.local/{page}?host=1{_currentQuery}");
            }
        }

        public void ReloadPage()
        {
            NavigateToPage(_currentPage, _currentQuery);
        }

        public void UpdateScreenBounds(Screen newScreen)
        {
            _targetScreen = newScreen;
            _attacher.UpdateBounds(newScreen.Bounds);
            _lastIconsJson = "";
            PollIcons();
        }

        public void SetManualPause(bool paused)
        {
            _manualPause = paused;
            PollForeground();
        }

        public void SetAutoPauseEnabled(bool enabled)
        {
            _autoPauseEnabled = enabled;
            PollForeground();
        }

        public void PostJson(string json)
        {
            if (_shuttingDown || IsDisposed || _webView.CoreWebView2 == null) return;
            try
            {
                _webView.CoreWebView2.PostWebMessageAsString(json);
            }
            catch (Exception ex)
            {
                AppLog.Write($"WallpaperForm.PostJson error: {ex.Message}");
            }
        }

        public void SendThemeSettings(Dictionary<string, double> values)
        {
            string json = JsonSerializer.Serialize(new { t = "settings", v = values });
            PostJson(json);
        }

        public void SendSingleParam(string key, double value)
        {
            var dict = new Dictionary<string, double> { [key] = value };
            string json = JsonSerializer.Serialize(new { t = "settings", v = dict });
            PostJson(json);
        }

        public void SendMoonConfig(string mode, string date)
        {
            string json = JsonSerializer.Serialize(new { t = "moon", mode, date });
            PostJson(json);
        }

        public void SendRenderQuality(string quality)
        {
            string q = quality is "eco" or "balanced" or "ultra" ? quality : "ultra";
            string json = JsonSerializer.Serialize(new { t = "quality", v = q });
            PostJson(json);
        }

        public void RequestSnapshot(Action<bool, string, string> callback)
        {
            _pendingShareCallback = callback;
            PostJson("{\"t\":\"snapshot\"}");
        }

        public void RequestRecording(Action<bool, string, string> callback)
        {
            _pendingShareCallback = callback;
            PostJson("{\"t\":\"record\",\"sec\":4}");
        }

        private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw;
            try
            {
                raw = e.TryGetWebMessageAsString();
            }
            catch
            {
                return;
            }

            if (string.IsNullOrEmpty(raw)) return;

            try
            {
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;
                string type = root.TryGetProperty("t", out var tEl) ? tEl.GetString() ?? "" : "";

                switch (type)
                {
                    case "ready":
                        _pageReady = true;
                        SendThemeSettings(_store.GetEffectiveParams(_store.Current.Theme));
                        SendMoonConfig(_store.Current.MoonMode, _store.Current.MoonDate);
                        SendRenderQuality(_store.Current.RenderQuality);
                        _lastIconsJson = "";
                        _lastPauseState = -1;
                        PollIcons();
                        PollForeground();
                        PageReady?.Invoke();
                        break;

                    case "snapshotResult":
                        HandleShareMedia(root, "png", "scream-beach-snapshot");
                        break;

                    case "recordResult":
                        HandleShareMedia(root, "webm", "scream-live-clip");
                        break;
                }
            }
            catch (Exception ex)
            {
                AppLog.Write($"WallpaperForm.OnWebMessageReceived parse error: {ex.Message}");
            }
        }

        private void HandleShareMedia(JsonElement root, string defaultExt, string prefix)
        {
            var cb = _pendingShareCallback;
            _pendingShareCallback = null;
            if (cb == null) return;

            bool ok = root.TryGetProperty("ok", out var okEl) && okEl.GetBoolean();
            if (!ok)
            {
                string err = root.TryGetProperty("err", out var errEl) ? errEl.GetString() ?? "Export failed" : "Export failed";
                cb(false, "", err);
                return;
            }

            string dataUrl = root.TryGetProperty("data", out var dEl) ? dEl.GetString() ?? "" : "";
            string ext = root.TryGetProperty("ext", out var extEl) ? extEl.GetString() ?? defaultExt : defaultExt;
            int commaIdx = dataUrl.IndexOf(',');
            if (commaIdx < 0)
            {
                cb(false, "", "Invalid media payload");
                return;
            }

            try
            {
                byte[] bytes = Convert.FromBase64String(dataUrl[(commaIdx + 1)..]);
                string themeId = _store.Current.Theme;
                string fileName = $"scream-{themeId}-{DateTime.Now:yyyyMMdd-HHmmss}.{ext}";
                string filePath = Path.Combine(_store.ShareDir, fileName);
                File.WriteAllBytes(filePath, bytes);
                cb(true, filePath, fileName);
            }
            catch (Exception ex)
            {
                cb(false, "", ex.Message);
            }
        }

        private void PollIcons()
        {
            if (_shuttingDown || IsDisposed) return;

            // Self-heal if Explorer restarted and destroyed parent window
            if (!_attacher.IsAttached)
            {
                _attacher.Attach(Handle, _targetScreen.Bounds);
            }
            else
            {
                _attacher.EnsureZOrder();
            }

            if (!_pageReady || _webView.CoreWebView2 == null) return;
            // Skip cross-process Explorer ReadProcessMemory polling when wallpaper is paused/covered
            if (_lastPauseState == 1 && !string.IsNullOrEmpty(_lastIconsJson)) return;

            List<Native.RECT>? allRects = _iconReader.Read(out bool visible);
            if (allRects == null) return;

            Rectangle bounds = _targetScreen.Bounds;
            var sb = new StringBuilder(512);
            sb.Append("{\"t\":\"icons\",\"vis\":")
              .Append(visible ? "true" : "false")
              .Append(",\"sw\":").Append(bounds.Width)
              .Append(",\"sh\":").Append(bounds.Height)
              .Append(",\"r\":[");

            int countOnScreen = 0;
            foreach (var r in allRects)
            {
                // Include icons that overlap this monitor (with a small margin for smooth shoreline transitions)
                if (r.Right < bounds.Left - 80 || r.Left > bounds.Right + 80 ||
                    r.Bottom < bounds.Top - 80 || r.Top > bounds.Bottom + 80)
                {
                    continue;
                }

                if (countOnScreen > 0) sb.Append(',');
                sb.Append('[')
                  .Append(r.Left - bounds.Left).Append(',')
                  .Append(r.Top - bounds.Top).Append(',')
                  .Append(r.Right - bounds.Left).Append(',')
                  .Append(r.Bottom - bounds.Top).Append(']');
                countOnScreen++;
            }

            sb.Append("]}");
            string json = sb.ToString();
            if (json == _lastIconsJson) return;

            _lastIconsJson = json;
            PostJson(json);
            IconsSnapshotUpdated?.Invoke(json, countOnScreen, visible);
        }

        private void PollForeground()
        {
            if (_shuttingDown || IsDisposed || !_pageReady || _webView.CoreWebView2 == null) return;

            bool shouldPause = _manualPause;
            string reason = _manualPause ? "manual" : "";

            if (!shouldPause && _autoPauseEnabled)
            {
                shouldPause = ForegroundMonitor.ShouldPauseForScreen(
                    _targetScreen.Bounds, Handle, _getSettingsHwnd(), out reason);
            }

            int state = shouldPause ? 1 : 0;
            if (state == _lastPauseState) return;

            _lastPauseState = state;
            PostJson(shouldPause ? "{\"t\":\"pause\",\"v\":true}" : "{\"t\":\"pause\",\"v\":false}");
            PauseStateChanged?.Invoke(shouldPause);
            AppLog.Write(shouldPause ? $"Wallpaper paused ({reason})" : "Wallpaper resumed");
        }

        private void PollCursor()
        {
            if (_shuttingDown || IsDisposed || !_pageReady || _lastPauseState == 1 || _webView.CoreWebView2 == null) return;
            Point pt = Cursor.Position;
            if (Math.Abs(pt.X - _lastMousePos.X) < 4 && Math.Abs(pt.Y - _lastMousePos.Y) < 4) return;
            _lastMousePos = pt;

            Rectangle b = _targetScreen.Bounds;
            if (b.Width <= 0 || b.Height <= 0) return;
            double nx = Math.Clamp((pt.X - b.Left) / (double)b.Width, 0.0, 1.0);
            double ny = Math.Clamp((pt.Y - b.Top) / (double)b.Height, 0.0, 1.0);
            PostJson(string.Create(
                System.Globalization.CultureInfo.InvariantCulture,
                $"{{\"t\":\"mouse\",\"x\":{nx:F4},\"y\":{ny:F4}}}"));
        }

        public void Shutdown()
        {
            if (_shuttingDown) return;
            _shuttingDown = true;

            _iconTimer.Stop();
            _fgTimer.Stop();
            _mouseTimer.Stop();
            _iconReader.Dispose();

            try { _webView.Dispose(); } catch { }
            _attacher.Detach();

            if (!IsDisposed)
            {
                Hide();
                Close();
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _iconTimer.Dispose();
                _fgTimer.Dispose();
                _mouseTimer.Dispose();
                _iconReader.Dispose();
                _attacher.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
