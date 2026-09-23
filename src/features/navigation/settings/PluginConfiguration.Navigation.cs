namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {
        public bool RandomButtonEnabled { get; set; } = true;
        public bool RandomIncludeMovies { get; set; } = true;
        public bool RandomIncludeShows { get; set; } = true;
        public bool RandomUnwatchedOnly { get; set; } = false;
    }
}
