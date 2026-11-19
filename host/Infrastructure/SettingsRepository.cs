using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Microsoft.Win32;
using Scream.Application;
using Scream.Domain;

namespace Scream.Infrastructure
{
    /// <summary>File-system JSON & Windows HKCU Run Registry implementation of ISettingsRepository.</summary>
    internal sealed class SettingsRepository : ISettingsRepository
    {
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunValueName = "ScreamWallpaper";

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
            WriteIndented = true
        };

        private readonly string _settingsFile;
        private readonly List<ThemeDefinition> _themes = new();

        public string DataDir { get; }
        public string WebDir { get; }
        public string ShareDir { get; }
        public string WebViewUserDataDir { get; }
        public bool IsolatedProfile { get; }

        public AppSettings Current { get; private set; } = new();
        public IReadOnlyList<ThemeDefinition> Themes => _themes;

        public SettingsRepository(string webDir)
        {
            WebDir = webDir;
            string? overrideDir = Environment.GetEnvironmentVariable("SCREAM_PROFILE_DIR");
            IsolatedProfile = !string.IsNullOrWhiteSpace(overrideDir);
            DataDir = IsolatedProfile
                ? Path.GetFullPath(overrideDir!)
                : Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ScreamWallpaper");

            Directory.CreateDirectory(DataDir);
            ShareDir = Path.Combine(DataDir, "shares");
            Directory.CreateDirectory(ShareDir);
            WebViewUserDataDir = Path.Combine(DataDir, "WebView2");
            _settingsFile = Path.Combine(DataDir, "settings.json");

            AppLog.Init(DataDir);
            LoadThemesManifest();
            LoadSettings();
        }

        private void LoadThemesManifest()
        {
            string themesPath = Path.Combine(WebDir, "themes.json");
            _themes.Clear();
            if (!File.Exists(themesPath)) return;

            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(themesPath));
                if (!doc.RootElement.TryGetProperty("themes", out var arr)) return;

                foreach (var item in arr.EnumerateArray())
                {
                    var def = new ThemeDefinition
                    {
                        Id = item.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "",
                        Page = item.TryGetProperty("page", out var pageEl) ? pageEl.GetString() ?? "" : "",
                        Status = item.TryGetProperty("status", out var stEl) ? stEl.GetString() ?? "ready" : "ready"
                    };

                    if (item.TryGetProperty("groups", out var groups))
                    {
                        foreach (var g in groups.EnumerateArray())
                        {
                            if (!g.TryGetProperty("params", out var prms)) continue;
                            foreach (var p in prms.EnumerateArray())
                            {
                                string key = p.TryGetProperty("key", out var kEl) ? kEl.GetString() ?? "" : "";
                                if (string.IsNullOrEmpty(key)) continue;
                                if (p.TryGetProperty("default", out var dEl) && dEl.TryGetDouble(out double dVal))
                                {
                                    def.Defaults[key] = dVal;
                                }
                            }
                        }
                    }

                    if (!string.IsNullOrEmpty(def.Id))
                    {
                        _themes.Add(def);
                    }
                }
            }
            catch (Exception ex)
            {
                AppLog.Write($"SettingsRepository: Failed to load themes.json: {ex.Message}");
            }
        }

        public ThemeDefinition? GetTheme(string id)
        {
            foreach (var t in _themes)
            {
                if (string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase) && t.Status == "ready")
                {
                    return t;
                }
            }
            return _themes.Count > 0 ? _themes[0] : null;
        }

        public Dictionary<string, double> GetEffectiveParams(string themeId)
        {
            var merged = new Dictionary<string, double>();
            var def = GetTheme(themeId);
            if (def != null)
            {
                foreach (var kv in def.Defaults)
                {
                    merged[kv.Key] = kv.Value;
                }
            }

            if (Current.Params.TryGetValue(themeId, out var overrides))
            {
                foreach (var kv in overrides)
                {
                    merged[kv.Key] = kv.Value;
                }
            }
            return merged;
        }

        public void SetParam(string themeId, string key, double value)
        {
            if (!Current.Params.TryGetValue(themeId, out var dict))
            {
                dict = new Dictionary<string, double>();
                Current.Params[themeId] = dict;
            }
            dict[key] = value;
        }

        public void ResetTheme(string themeId)
        {
            Current.Params.Remove(themeId);
            SaveSettings();
        }

        private void LoadSettings()
        {
            if (File.Exists(_settingsFile))
            {
                try
                {
                    var loaded = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_settingsFile), JsonOpts);
                    if (loaded != null)
                    {
                        Current = loaded;
                    }
                }
                catch (Exception ex)
                {
                    AppLog.Write($"SettingsRepository: Failed to read settings.json: {ex.Message}");
                    Current = new AppSettings();
                }
            }

            if (GetTheme(Current.Theme) == null && _themes.Count > 0)
            {
                Current.Theme = _themes[0].Id;
            }
            if (Current.Lang is not ("vi" or "en"))
            {
                Current.Lang = "vi";
            }
        }

        public void SaveSettings()
        {
            try
            {
                string json = JsonSerializer.Serialize(Current, JsonOpts);
                File.WriteAllText(_settingsFile, json);
            }
            catch (Exception ex)
            {
                AppLog.Write($"SettingsRepository: Save failed: {ex.Message}");
            }
        }

        public bool IsAutoStartEnabled()
        {
            if (IsolatedProfile) return false;
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false);
                var val = key?.GetValue(RunValueName) as string;
                return !string.IsNullOrWhiteSpace(val);
            }
            catch
            {
                return false;
            }
        }

        public bool SetAutoStart(bool enable)
        {
            if (IsolatedProfile) return false;
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, true);
                if (key == null) return false;
                if (enable)
                {
                    string exePath = Environment.ProcessPath ?? "";
                    if (string.IsNullOrEmpty(exePath)) return false;
                    key.SetValue(RunValueName, $"\"{exePath}\" --autostart");
                }
                else
                {
                    key.DeleteValue(RunValueName, false);
                }
                return true;
            }
            catch (Exception ex)
            {
                AppLog.Write($"SettingsRepository: SetAutoStart({enable}) failed: {ex.Message}");
                return false;
            }
        }
    }
}
