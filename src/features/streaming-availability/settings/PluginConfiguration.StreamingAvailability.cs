namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Jellyfin Elsewhere Settings
        public bool ElsewhereEnabled { get; set; } = true;
        public string TMDB_API_KEY { get; set; } = "";
        public string DEFAULT_REGION { get; set; } = "US";
        public string DEFAULT_PROVIDERS { get; set; } = "";
        public string IGNORE_PROVIDERS { get; set; } = "";
        public string ElsewhereCustomBrandingText { get; set; } = "";
        public string ElsewhereCustomBrandingImageUrl { get; set; } = "";
    }
}
