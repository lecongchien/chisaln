using System;
using System.Drawing;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Scream.Application;
using Scream.Infrastructure;

namespace Scream.Presentation
{
    internal sealed class SettingsForm : Form
    {
        private readonly ISettingsRepository _store;
        private readonly CoreWebView2Environment _webEnv;
        private readonly WebView2 _webView;
        private readonly Action<string> _onMessage;
        private bool _initialized;
        private FormBorderStyle _prevBorder = FormBorderStyle.Sizable;
        private FormWindowState _prevState = FormWindowState.Normal;
        private Rectangle _prevBounds;
        private bool _isFullScreen;

        public SettingsForm(
            ISettingsRepository store,
            CoreWebView2Environment webEnv,
            Icon appIcon,
            Action<string> onMessage)
        {
            _store = store;
            _webEnv = webEnv;
            _onMessage = onMessage;

            Text = "Scream — Hình nền thích ứng";
            Icon = appIcon;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1220, 760);
            MinimumSize = new Size(920, 620);
            BackColor = Color.FromArgb(245, 245, 247);

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(245, 245, 247)
            };
            Controls.Add(_webView);
        }

        private bool _darkMode;

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            ApplyDwmTitlebar(_darkMode);
        }

        public void SetDarkMode(bool dark)
        {
            if (_darkMode == dark && IsHandleCreated) return;
            _darkMode = dark;
            var bg = dark ? Color.FromArgb(22, 22, 26) : Color.FromArgb(245, 245, 247);
            BackColor = bg;
            if (!_webView.IsDisposed) _webView.DefaultBackgroundColor = bg;
            if (IsHandleCreated) ApplyDwmTitlebar(dark);
        }

        private void ApplyDwmTitlebar(bool dark)
        {
            int flag = dark ? 1 : 0;
            Native.DwmSetWindowAttribute(Handle, Native.DWMWA_USE_IMMERSIVE_DARK_MODE, ref flag, sizeof(int));
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            if (_initialized) return;
            _initialized = true;
            await InitializeAsync();
        }

        private async Task InitializeAsync()
        {
            try
            {
                await _webView.EnsureCoreWebView2Async(_webEnv);
                if (IsDisposed) return;

                var core = _webView.CoreWebView2;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.AreDevToolsEnabled = true;

                core.SetVirtualHostNameToFolderMapping(
                    "app.local", _store.WebDir, CoreWebView2HostResourceAccessKind.Allow);
                core.SetVirtualHostNameToFolderMapping(
                    "share.local", _store.ShareDir, CoreWebView2HostResourceAccessKind.Allow);

                core.WebMessageReceived += (_, args) =>
                {
                    try
                    {
                        string msg = args.TryGetWebMessageAsString();
                        if (!string.IsNullOrEmpty(msg))
                        {
                            _onMessage(msg);
                        }
                    }
                    catch { }
                };

                core.ContainsFullScreenElementChanged += (_, _) =>
                {
                    SetFullScreen(core.ContainsFullScreenElement);
                };

                core.Navigate("https://app.local/settings.html?host=1");
            }
            catch (Exception ex)
            {
                AppLog.Write($"SettingsForm init failed: {ex.Message}");
                MessageBox.Show(
                    "Không thể khởi tạo WebView2 cho cửa sổ cài đặt:\n" + ex.Message,
                    "Scream", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public void BringToFrontForce()
        {
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }
            bool wasTop = TopMost;
            TopMost = true;
            BringToFront();
            Activate();
            TopMost = wasTop;
        }

        private void SetFullScreen(bool enable)
        {
            if (_isFullScreen == enable) return;
            _isFullScreen = enable;
            if (enable)
            {
                _prevBorder = FormBorderStyle;
                _prevState = WindowState;
                _prevBounds = Bounds;
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Normal;
                Bounds = Screen.FromControl(this).Bounds;
                TopMost = true;
            }
            else
            {
                TopMost = false;
                FormBorderStyle = _prevBorder;
                WindowState = _prevState;
                if (_prevState == FormWindowState.Normal && _prevBounds.Width > 0)
                {
                    Bounds = _prevBounds;
                }
            }
        }

        public void PostJson(string json)
        {
            if (IsDisposed || _webView.CoreWebView2 == null) return;
            try
            {
                _webView.CoreWebView2.PostWebMessageAsString(json);
            }
            catch { }
        }

        public void PostObject(object payload)
        {
            PostJson(JsonSerializer.Serialize(payload));
        }
    }
}
