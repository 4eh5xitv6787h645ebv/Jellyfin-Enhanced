using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Seerr Search Settings
        public bool JellyseerrEnabled { get; set; } = false;
        public bool JellyseerrShowSearchResults { get; set; } = true;
        public bool JellyseerrShowReportButton { get; set; } = false;
        public bool JellyseerrShowIssueIndicator { get; set; } = false;
        public bool JellyseerrEnable4KRequests { get; set; } = false;
        public bool JellyseerrEnable4KTvRequests { get; set; } = false;
        public bool JellyseerrShowAdvanced { get; set; } = false;
        public bool JellyseerrShowQuotaInfo { get; set; } = true;
        public bool JellyseerrShowSimilar { get; set; } = true;
        public bool JellyseerrShowRecommended { get; set; } = true;
        public bool JellyseerrShowRequestMoreOnSeries { get; set; } = true;
        public bool JellyseerrShowNetworkDiscovery { get; set; } = true;
        public bool JellyseerrShowGenreDiscovery { get; set; } = true;
        public bool JellyseerrShowTagDiscovery { get; set; } = true;
        public bool JellyseerrShowPersonDiscovery { get; set; } = true;
        public bool JellyseerrShowCollectionDiscovery { get; set; } = true;
        public bool JellyseerrShowDetailPageLink { get; set; } = true;
        public bool JellyseerrShowDetailPageLinkAsText { get; set; } = false;
        public bool JellyseerrExcludeLibraryItems { get; set; } = true;
        public bool JellyseerrExcludeBlocklistedItems { get; set; } = false;
        public bool ShowElsewhereOnJellyseerr { get; set; } = false;
        public bool JellyseerrUseMoreInfoModal { get; set; } = true;
        public bool JellyseerrAvailablePosterLinksToJellyfin { get; set; } = false;
        public string JellyseerrUrls { get; set; } = "";
        public string JellyseerrApiKey { get; set; } = "";
        public string JellyseerrUrlMappings { get; set; } = "";

        // On-demand library sync: POST {seerrUrl}/api/v1/settings/jobs/jellyfin-recently-added-scan/run
        // when Jellyfin reports new items, debounced so a bulk import collapses to one call.
        public bool TriggerSeerrScanOnItemAdded { get; set; } = false;
        public int SeerrScanDebounceSeconds { get; set; } = 60;
        public bool ShowCollectionsInSearch { get; set; } = true;
        public bool JellyseerrDisableCache { get; set; } = false;
        public int JellyseerrResponseCacheTtlMinutes { get; set; } = 10;
        public int JellyseerrUserIdCacheTtlMinutes { get; set; } = 30;

        // Auto Season Request Settings
        public bool AutoSeasonRequestEnabled { get; set; } = false;
        public int AutoSeasonRequestThresholdValue { get; set; } = 2;
        public bool AutoSeasonRequestRequireAllWatched { get; set; } = false;

        // Auto Movie Request Settings
        public bool AutoMovieRequestEnabled { get; set; } = false;
        public string AutoMovieRequestTriggerType { get; set; } = "OnMinutesWatched"; // "OnStart", "OnMinutesWatched", or "Both"
        public int AutoMovieRequestMinutesWatched { get; set; } = 20; // Minutes to watch before triggering request
        public bool AutoMovieRequestCheckReleaseDate { get; set; } = true; // Only request if movie is already released
        public string AutoMovieRequestQualityMode { get; set; } = "default"; // "default", "original", or "custom"
        public int AutoMovieRequestCustomServerId { get; set; } = -1; // Radarr server ID for "custom" mode
        public int AutoMovieRequestCustomProfileId { get; set; } = 0; // Quality profile ID for "custom" mode
        public string AutoMovieRequestCustomRootFolder { get; set; } = ""; // Root folder path for "custom" mode
        public bool AutoMovieRequestFallbackOn4k { get; set; } = true; // When original mode finds a 4K profile, fall back to default

        // Watchlist Settings
        public bool AddRequestedMediaToWatchlist { get; set; } = false;
        public bool SyncJellyseerrWatchlist { get; set; } = false;
        public bool SyncJellyfinWatchlistToSeerr { get; set; } = false;
        public bool PreventWatchlistReAddition { get; set; } = true;
        public int WatchlistMemoryRetentionDays { get; set; } = 365;

        // User Import Settings
        public bool JellyseerrAutoImportUsers { get; set; }
        public string JellyseerrImportBlockedUsers { get; set; } = string.Empty;

        // Recommendations Page Settings (Jellyseerr discover rows)
        public bool RecommendationsPageEnabled { get; set; } = false;
        public bool RecommendationsUsePluginPages { get; set; } = false;
        public bool RecommendationsUseCustomTabs { get; set; } = false;
        public bool RecommendationsUseNativeTab { get; set; } = false;
        public bool RecommendationsAutoCreateCustomTab { get; set; } = false;
        [AnalyticsExclude]
        public bool RecommendationsCustomTabJeOwned { get; set; } = false;
    }
}
