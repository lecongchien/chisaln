using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using Scream.Infrastructure;
using Scream.Presentation;

namespace Scream.Application
{
    /// <summary>
    /// Core Application-layer coordinator orchestrating wallpaper surfaces, settings window,
    /// global hotkeys, system tray, and single-instance IPC commands.
    /// </summary>
    internal sealed class WallpaperCoordinator : ApplicationContext
    {
        private const int HotkeyPauseId    = 0x5343;
        private const int HotkeySettingsId = 0x5344;
        private const int HotkeyNightId    = 0x5345;

        private readonly ISettingsRepository _store;
        private readonly Icon _appIcon;
        private readonly TrayController _tray;
        private readonly GlobalHotkeyManager _hotkeys;
        private readonly IpcCommandServer _ipc;
        private readonly AppUpdater _updater;
        private readonly System.Windows.Forms.Timer _saveTimer;

        private CoreWebView2Environment? _webEnv;
        private readonly List<WallpaperForm> _wallpapers = new();
        private SettingsForm? _settingsForm;
        private bool _manualPause;
        private bool _exiting;
        private string _latestIconsJson = "";
        private int _latestIconCount;

        public WallpaperCoordinator(ISettingsRepository store, bool openSettingsOnLaunch)
        {
            _store = store;
            _appIcon = AppIconFactory.CreateBrandedIcon();

            _tray = new TrayController(
                _appIcon,
                _store.Current.MultiMonitor,
                OpenSettings,
                ToggleMeadowNight,
                ToggleManualPause,
                ReloadWallpapers,
                ToggleMultiMonitor,
                HandleTrayUpdateClick,
                ShutdownAll);

            _updater = new AppUpdater(_store.DataDir, _store.Current.AutoUpdate, ShutdownAll);
            _updater.StateChanged += OnUpdateStateChanged;

            _hotkeys = new GlobalHotkeyManager();
            uint mods = Native.MOD_CONTROL | Native.MOD_ALT | Native.MOD_NOREPEAT;
            _hotkeys.Register(HotkeyPauseId, mods, Keys.H, ToggleManualPause);
            _hotkeys.Register(HotkeySettingsId, mods, Keys.M, OpenSettings);
            _hotkeys.Register(HotkeyNightId, mods, Keys.N, ToggleMeadowNight);

            _saveTimer = new System.Windows.Forms.Timer { Interval = 500 };
            _saveTimer.Tick += (_, _) =>
            {
                _saveTimer.Stop();
                _store.SaveSettings();
            };

            SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;

            _ipc = new IpcCommandServer();
            _ipc.Start(HandleExternalCommand);
            _ = BootstrapAsync(openSettingsOnLaunch);
        }

        private async Task BootstrapAsync(bool openSettingsOnLaunch)
        {
            try
            {
                var options = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
                _webEnv = await CoreWebView2Environment.CreateAsync(null, _store.WebViewUserDataDir, options);
            }
            catch (Exception ex)
            {
                AppLog.Write($"WallpaperCoordinator: Failed to create WebView2 environment: {ex.Message}");
                MessageBox.Show(
                    "Không tìm thấy Microsoft Edge WebView2 Runtime.\nChi tiết: " + ex.Message,
                    "Scream", MessageBoxButtons.OK, MessageBoxIcon.Error);
                ShutdownAll();
                return;
            }

            LaunchWallpapers();
            if (openSettingsOnLaunch) OpenSettings();
        }

        private string BuildThemeQuery(string themeId)
        {
            var p = _store.GetEffectiveParams(themeId);
            var sb = new System.Text.StringBuilder();
            if (p.TryGetValue("viewMode", out double vm))
            {
                sb.Append("&view=").Append((int)Math.Round(vm));
            }
            if (p.TryGetValue("timeMode", out double tm))
            {
                sb.Append("&time=").Append((int)Math.Round(tm));
            }
            string q = _store.Current.RenderQuality is "eco" or "balanced" or "ultra" or "super"
                ? _store.Current.RenderQuality
                : "ultra";
            sb.Append("&q=").Append(q);
            return sb.ToString();
        }

        private void LaunchWallpapers()
        {
            DisposeWallpapers();
            if (_webEnv == null) return;

            var theme = _store.GetTheme(_store.Current.Theme);
            string page = theme?.Page ?? "arctic.html";
            string query = BuildThemeQuery(_store.Current.Theme);
            Screen[] targets = _store.Current.MultiMonitor
                ? Screen.AllScreens
                : new[] { Screen.PrimaryScreen ?? Screen.AllScreens[0] };

            bool isFirst = true;
            foreach (var scr in targets)
            {
                var wf = new WallpaperForm(
                    _store,
                    _webEnv,
                    scr,
                    theme?.Id ?? _store.Current.Theme,
                    page,
                    query,
                    _manualPause,
                    _store.Current.AutoPause,
                    () => _settingsForm != null && !_settingsForm.IsDisposed ? _settingsForm.Handle : IntPtr.Zero);

                if (isFirst)
                {
                    wf.IconsSnapshotUpdated += (json, count, _) =>
                    {
                        _latestIconsJson = json;
                        _latestIconCount = count;
                        _settingsForm?.PostJson(json);
                        PushStatusToSettings();
                    };
                    wf.PauseStateChanged += _ => PushStatusToSettings();
                    wf.StatusChanged += _ => PushStatusToSettings();
                    wf.PageReady += () => _settingsForm?.PostObject(new { t = "wallpaperReady", theme = _store.Current.Theme });
                    isFirst = false;
                }

                _wallpapers.Add(wf);
                wf.Show();
            }

            SyncTrayState();
        }

        private void DisposeWallpapers()
        {
            foreach (var wf in _wallpapers)
            {
                try { wf.Shutdown(); } catch { }
            }
            _wallpapers.Clear();
        }

        private void OnDisplaySettingsChanged(object? sender, EventArgs e)
        {
            if (_exiting) return;
            SynchronizationContext.Current?.Post(_ =>
            {
                if (!_exiting) LaunchWallpapers();
            }, null);
        }

        public void OpenSettings()
        {
            if (_exiting || _webEnv == null) return;

            if (_settingsForm == null || _settingsForm.IsDisposed)
            {
                _settingsForm = new SettingsForm(_store, _webEnv, _appIcon, HandleSettingsMessage);
                _settingsForm.FormClosed += (_, _) => { _settingsForm = null; };
                _settingsForm.Show();
            }
            _settingsForm.BringToFrontForce();
        }

        private void HandleSettingsMessage(string raw)
        {
            try
            {
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;
                string type = root.TryGetProperty("t", out var tEl) ? tEl.GetString() ?? "" : "";

                switch (type)
                {
                    case "hello":
                        PushFullInitToSettings();
                        break;

                    case "theme":
                        string newTheme = root.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "arctic" : "arctic";
                        var def = _store.GetTheme(newTheme);
                        if (def != null)
                        {
                            _store.Current.Theme = def.Id;
                            ScheduleSave();
                            string query = BuildThemeQuery(def.Id);
                            var effectiveParams = _store.GetEffectiveParams(def.Id);
                            foreach (var wf in _wallpapers) wf.SwitchTheme(def.Id, def.Page, query, effectiveParams);
                            SyncTrayState();
                            PushStatusToSettings();
                        }
                        break;

                    case "set":
                        string key = root.TryGetProperty("k", out var kEl) ? kEl.GetString() ?? "" : "";
                        if (!string.IsNullOrEmpty(key) && root.TryGetProperty("v", out var vEl) && vEl.TryGetDouble(out double val))
                        {
                            _store.SetParam(_store.Current.Theme, key, val);
                            ScheduleSave();
                            foreach (var wf in _wallpapers) wf.SendSingleParam(key, val);
                            if (key == "timeMode") SyncTrayState();
                        }
                        break;

                    case "reset":
                        _store.ResetTheme(_store.Current.Theme);
                        var defaults = _store.GetEffectiveParams(_store.Current.Theme);
                        foreach (var wf in _wallpapers) wf.SendThemeSettings(defaults);
                        SyncTrayState();
                        PushFullInitToSettings();
                        break;

                    case "lang":
                        string lang = root.TryGetProperty("v", out var lEl) ? lEl.GetString() ?? "vi" : "vi";
                        _store.Current.Lang = lang == "en" ? "en" : "vi";
                        ScheduleSave();
                        SyncTrayState();
                        PushFullInitToSettings();
                        break;

                    case "autostart":
                        _store.SetAutoStart(root.TryGetProperty("v", out var aEl) && aEl.GetBoolean());
                        PushStatusToSettings();
                        break;

                    case "autopause":
                        bool enableAutoPause = root.TryGetProperty("v", out var apEl) && apEl.GetBoolean();
                        _store.Current.AutoPause = enableAutoPause;
                        ScheduleSave();
                        foreach (var wf in _wallpapers) wf.SetAutoPauseEnabled(enableAutoPause);
                        PushStatusToSettings();
                        break;

                    case "autoupdate":
                        bool enableAutoUpdate = root.TryGetProperty("v", out var auEl) && auEl.GetBoolean();
                        _store.Current.AutoUpdate = enableAutoUpdate;
                        ScheduleSave();
                        _updater.SetAutoUpdateEnabled(enableAutoUpdate);
                        PushStatusToSettings();
                        break;

                    case "checkUpdate":
                        _ = _updater.CheckForUpdatesAsync(userInitiated: true);
                        break;

                    case "installUpdate":
                        _ = _updater.DownloadAndInstallAsync(silentRelaunch: false, userInitiated: true);
                        break;

                    case "multimonitor":
                        bool multi = root.TryGetProperty("v", out var mmEl) && mmEl.GetBoolean();
                        if (multi != _store.Current.MultiMonitor)
                        {
                            _store.Current.MultiMonitor = multi;
                            ScheduleSave();
                            LaunchWallpapers();
                            PushStatusToSettings();
                        }
                        break;

                    case "togglePause":
                        ToggleManualPause();
                        break;

                    case "reload":
                        ReloadWallpapers();
                        break;

                    case "shareImage":
                        if (_wallpapers.Count > 0)
                        {
                            _wallpapers[0].RequestSnapshot((ok, path, info) =>
                                _settingsForm?.PostObject(new { t = "shareResult", kind = "image", ok, path, info }));
                        }
                        else
                        {
                            _settingsForm?.PostObject(new { t = "shareResult", kind = "image", ok = false, path = "", info = "No active wallpaper" });
                        }
                        break;

                    case "shareVideo":
                        if (_wallpapers.Count > 0)
                        {
                            _wallpapers[0].RequestRecording((ok, path, info) =>
                                _settingsForm?.PostObject(new { t = "shareResult", kind = "video", ok, path, info }));
                        }
                        else
                        {
                            _settingsForm?.PostObject(new { t = "shareResult", kind = "video", ok = false, path = "", info = "No active wallpaper" });
                        }
                        break;

                    case "uiTheme":
                        bool isDark = root.TryGetProperty("dark", out var dkEl) && dkEl.GetBoolean();
                        _settingsForm?.SetDarkMode(isDark);
                        break;

                    case "moon":
                        string mMode = root.TryGetProperty("mode", out var mmModeEl) ? mmModeEl.GetString() ?? "full" : "full";
                        string mDate = root.TryGetProperty("date", out var mmDateEl) ? mmDateEl.GetString() ?? "2000-08-15" : "2000-08-15";
                        if (mMode != "full" && mMode != "today" && mMode != "birthday") mMode = "full";
                        _store.Current.MoonMode = mMode;
                        _store.Current.MoonDate = mDate;
                        ScheduleSave();
                        foreach (var wf in _wallpapers) wf.SendMoonConfig(mMode, mDate);
                        break;

                    case "quality":
                        string qMode = root.TryGetProperty("v", out var qEl) ? qEl.GetString() ?? "ultra" : "ultra";
                        if (qMode != "eco" && qMode != "balanced" && qMode != "ultra" && qMode != "super") qMode = "ultra";
                        _store.Current.RenderQuality = qMode;
                        ScheduleSave();
                        foreach (var wf in _wallpapers) wf.SendRenderQuality(qMode);
                        break;

                    case "revealFile":
                        string pathToOpen = root.TryGetProperty("path", out var pEl) ? pEl.GetString() ?? "" : "";
                        if (!string.IsNullOrEmpty(pathToOpen) && File.Exists(pathToOpen))
                        {
                            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{pathToOpen}\"") { UseShellExecute = true });
                        }
                        break;

                    case "minimizeToTray":
                        _settingsForm?.Close();
                        break;
                }
            }
            catch (Exception ex)
            {
                AppLog.Write($"WallpaperCoordinator.HandleSettingsMessage error: {ex.Message}");
            }
        }

        private void PushFullInitToSettings()
        {
            if (_settingsForm == null || _settingsForm.IsDisposed) return;

            var allParams = new Dictionary<string, Dictionary<string, double>>();
            foreach (var t in _store.Themes) allParams[t.Id] = _store.GetEffectiveParams(t.Id);

            _settingsForm.PostObject(new
            {
                t = "init",
                theme = _store.Current.Theme,
                lang = _store.Current.Lang,
                moonMode = _store.Current.MoonMode,
                moonDate = _store.Current.MoonDate,
                renderQuality = _store.Current.RenderQuality is "eco" or "balanced" or "ultra" or "super" ? _store.Current.RenderQuality : "ultra",
                paramsByTheme = allParams,
                autostart = _store.IsAutoStartEnabled(),
                autopause = _store.Current.AutoPause,
                autoupdate = _store.Current.AutoUpdate,
                multimonitor = _store.Current.MultiMonitor,
                screenCount = Screen.AllScreens.Length,
                paused = _wallpapers.Count > 0 && _wallpapers[0].IsPaused,
                manualPause = _manualPause,
                iconCount = _latestIconCount,
                wallpaperReady = _wallpapers.Count == 0 || _wallpapers[0].IsPageReady,
                attachMode = _wallpapers.Count > 0 ? _wallpapers[0].AttachMode : "",
                appVersion = _updater.CurrentVersion,
                platform = "windows"
            });

            if (!string.IsNullOrEmpty(_latestIconsJson)) _settingsForm.PostJson(_latestIconsJson);
            PushUpdateStateToSettings(_updater.Snapshot);
        }

        private void PushStatusToSettings()
        {
            if (_settingsForm == null || _settingsForm.IsDisposed) return;
            _settingsForm.PostObject(new
            {
                t = "status",
                autostart = _store.IsAutoStartEnabled(),
                autopause = _store.Current.AutoPause,
                autoupdate = _store.Current.AutoUpdate,
                multimonitor = _store.Current.MultiMonitor,
                screenCount = Screen.AllScreens.Length,
                paused = _wallpapers.Count > 0 && _wallpapers[0].IsPaused,
                manualPause = _manualPause,
                iconCount = _latestIconCount,
                wallpaperReady = _wallpapers.Count == 0 || _wallpapers[0].IsPageReady,
                attachMode = _wallpapers.Count > 0 ? _wallpapers[0].AttachMode : ""
            });
        }

        private void OnUpdateStateChanged(UpdateStatusSnapshot snap)
        {
            if (_exiting) return;
            _tray.SyncUpdateState(_store.Current.Lang, snap.State, snap.LatestVersion, snap.Progress);
            PushUpdateStateToSettings(snap);
        }

        private void PushUpdateStateToSettings(UpdateStatusSnapshot snap)
        {
            if (_settingsForm == null || _settingsForm.IsDisposed) return;
            _settingsForm.PostObject(new
            {
                t = "updateState",
                state = snap.State,
                currentVersion = snap.CurrentVersion,
                latestVersion = snap.LatestVersion,
                progress = snap.Progress,
                downloadedBytes = snap.DownloadedBytes,
                totalBytes = snap.TotalBytes,
                errorCode = snap.ErrorCode,
                message = snap.Message,
                canInstall = snap.CanInstall,
                isDevBuild = snap.IsDevBuild,
                autoupdate = snap.AutoUpdate,
                userInitiated = snap.UserInitiated,
                lastCheckedUtc = snap.LastCheckedUtc
            });
        }

        private void HandleTrayUpdateClick()
        {
            OpenSettings();
            _settingsForm?.PostObject(new { t = "openTab", tab = "system" });
            if (_updater.Snapshot.State is "available" or "readyToInstall")
            {
                _ = _updater.DownloadAndInstallAsync(silentRelaunch: false, userInitiated: true);
            }
            else if (_updater.Snapshot.State is not ("checking" or "downloading" or "installing"))
            {
                _ = _updater.CheckForUpdatesAsync(userInitiated: true);
            }
        }

        private void ScheduleSave()
        {
            _saveTimer.Stop();
            _saveTimer.Start();
        }

        private void ToggleMeadowNight()
        {
            string activeTheme = _store.Current.Theme;
            if (activeTheme != "arctic" && activeTheme != "skyship" && activeTheme != "seatrain")
                activeTheme = "arctic";

            var cur = _store.GetEffectiveParams(activeTheme);
            double curMode = cur.TryGetValue("timeMode", out var v) ? v : 0;
            double nextMode = Math.Round(curMode) == 2 ? 0 : 2;
            _store.SetParam(activeTheme, "timeMode", nextMode);
            ScheduleSave();
            foreach (var wf in _wallpapers) wf.SendSingleParam("timeMode", nextMode);
            SyncTrayState();
            PushFullInitToSettings();
        }

        private void ToggleManualPause()
        {
            _manualPause = !_manualPause;
            foreach (var wf in _wallpapers) wf.SetManualPause(_manualPause);
            SyncTrayState();
            PushStatusToSettings();
        }

        private void ToggleMultiMonitor()
        {
            _store.Current.MultiMonitor = !_store.Current.MultiMonitor;
            ScheduleSave();
            LaunchWallpapers();
            PushStatusToSettings();
        }

        private void ReloadWallpapers()
        {
            foreach (var wf in _wallpapers) wf.ReloadPage();
        }

        private void SyncTrayState()
        {
            string th = _store.Current.Theme;
            var tp = _store.GetEffectiveParams(th);
            bool isNight = tp.TryGetValue("timeMode", out var mt) && Math.Round(mt) == 2;
            _tray.SyncState(_store.Current.Lang, isNight, _manualPause, _store.Current.MultiMonitor);
        }

        private void HandleExternalCommand(string cmd)
        {
            switch (cmd)
            {
                case "--settings":
                case "":
                    OpenSettings();
                    break;
                case "--menu":
                    _tray.ShowMenuAtCursor();
                    break;
                case "--exit":
                    ShutdownAll();
                    break;
            }
        }

        public void ShutdownAll()
        {
            if (_exiting) return;
            _exiting = true;

            SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
            _updater.StateChanged -= OnUpdateStateChanged;
            _updater.Dispose();
            _ipc.Dispose();
            _saveTimer.Stop();
            _store.SaveSettings();
            _hotkeys.Dispose();

            if (_settingsForm != null && !_settingsForm.IsDisposed) _settingsForm.Close();

            DisposeWallpapers();
            _tray.Dispose();
            _appIcon.Dispose();

            ExitThread();
        }
    }
}
