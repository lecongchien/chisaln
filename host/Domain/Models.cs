using System.Collections.Generic;

namespace Scream.Domain
{
    /// <summary>User-persisted application preferences (pure domain entity).</summary>
    internal sealed class AppSettings
    {
        public string Theme { get; set; } = "beach";
        public string Lang { get; set; } = "vi";
        public bool MultiMonitor { get; set; } = false;
        public bool AutoPause { get; set; } = true;
        public Dictionary<string, Dictionary<string, double>> Params { get; set; } = new();
    }

    /// <summary>Root manifest deserialized from web/themes.json.</summary>
    internal sealed class ThemeManifest
    {
        public int Version { get; set; } = 1;
        public List<ThemeDefinition> Themes { get; set; } = new();
    }

    /// <summary>Metadata and default parameter values for a single adaptive theme.</summary>
    internal sealed class ThemeDefinition
    {
        public string Id { get; set; } = "";
        public string Page { get; set; } = "";
        public string Status { get; set; } = "ready";
        public Dictionary<string, double> Defaults { get; set; } = new();
    }
}
