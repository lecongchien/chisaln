using System.Collections.Generic;
using Scream.Domain;

namespace Scream.Application
{
    /// <summary>Persistence & manifest port decoupled from concrete file/registry infrastructure.</summary>
    internal interface ISettingsRepository
    {
        string DataDir { get; }
        string WebDir { get; }
        string ShareDir { get; }
        string WebViewUserDataDir { get; }
        bool IsolatedProfile { get; }

        AppSettings Current { get; }
        IReadOnlyList<ThemeDefinition> Themes { get; }

        ThemeDefinition? GetTheme(string id);
        Dictionary<string, double> GetEffectiveParams(string themeId);
        void SetParam(string themeId, string key, double value);
        void ResetTheme(string themeId);
        void SaveSettings();
        bool IsAutoStartEnabled();
        bool SetAutoStart(bool enable);
    }
}
