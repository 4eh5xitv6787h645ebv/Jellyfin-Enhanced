namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {
        public bool ShowWatchProgress { get; set; } = false;
        public string WatchProgressDefaultMode { get; set; } = "percentage";
        public string WatchProgressTimeFormat { get; set; } = "hours";
        public bool ShowFileSizes { get; set; } = false;
        public bool ShowAudioLanguages { get; set; } = true;
        public bool ShowReleaseDates { get; set; } = false;

        // Letterboxd Settings
        public bool LetterboxdEnabled { get; set; } = false;
        public bool ShowLetterboxdLinkAsText { get; set; } = false;

        // Metadata Icons (Druidblack)
        public bool MetadataIconsEnabled { get; set; } = false;
    }
}
