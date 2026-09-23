using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Shoko Settings — single-instance (URL + API key), like Jellyseerr, not the
        // Sonarr/Radarr instance-list pattern: Shoko is one server per household.
        public string ShokoUrl { get; set; } = "";
        public string ShokoApiKey { get; set; } = "";
        public string ShokoUrlMappings { get; set; } = "";

        // Which AniDB episode types to include on the calendar — Credits/Trailer/Parody/Other
        // default off since they're calendar noise for most users.
        public bool ShokoShowEpisodes { get; set; } = true;
        public bool ShokoShowSpecials { get; set; } = false;
        public bool ShokoShowCredits { get; set; } = false;
        public bool ShokoShowTrailers { get; set; } = false;
        public bool ShokoShowParodies { get; set; } = false;
        public bool ShokoShowOther { get; set; } = false;

        // Calendar Page Settings (Sonarr/Radarr Releases)
        public bool CalendarPageEnabled { get; set; } = false;
        public bool CalendarUseCustomTabs { get; set; } = false;
        public bool CalendarUsePluginPages { get; set; } = false;
        /// <summary>
        /// Shows Calendar as a self-contained tab on the Home page, created and
        /// managed entirely by Jellyfin Enhanced's own injected script (see
        /// js/enhanced/native-tabs.js) -- no external Custom Tabs plugin required.
        /// Recommended on Jellyfin 12's experimental layout (the default there),
        /// where the legacy Custom-Tabs/Plugin-Pages integration points are hidden.
        /// </summary>
        public bool CalendarUseNativeTab { get; set; } = false;
        public bool CalendarAutoCreateCustomTab { get; set; } = false;
        [AnalyticsExclude]
        public bool CalendarCustomTabJeOwned { get; set; } = false;
        public string CalendarFirstDayOfWeek { get; set; } = "Monday";
        public string CalendarTimeFormat { get; set; } = "5pm/5:30pm";
        public bool CalendarHighlightFavorites { get; set; } = false;
        public bool CalendarHighlightWatchedSeries { get; set; } = false;
        public bool CalendarFilterByLibraryAccess { get; set; } = true;
        public bool CalendarShowOnlyRequested { get; set; } = false;
        public bool CalendarForceOnlyRequested { get; set; } = false;


        /// <summary>
        /// True when both <see cref="ShokoUrl"/> and <see cref="ShokoApiKey"/> are set. Unlike
        /// Sonarr/Radarr, there is no JSON instance list to corrupt — Shoko is two flat fields.
        /// </summary>
        public bool IsShokoConfigured()
            => !string.IsNullOrWhiteSpace(ShokoUrl) && !string.IsNullOrWhiteSpace(ShokoApiKey);
    }
}
