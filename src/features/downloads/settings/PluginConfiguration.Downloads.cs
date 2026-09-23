using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Requests Page Settings (Sonarr/Radarr Queue Monitoring)
        public bool DownloadsPageEnabled { get; set; } = false;
        public bool DownloadsUsePluginPages { get; set; } = false;
        public bool DownloadsUseCustomTabs { get; set; } = false;
        /// <summary>
        /// Shows Requests as a self-contained tab on the Home page, created and
        /// managed entirely by Jellyfin Enhanced's own injected script (see
        /// js/enhanced/native-tabs.js) -- no external Custom Tabs plugin required.
        /// Recommended on Jellyfin 12's experimental layout (the default there),
        /// where the legacy Custom-Tabs/Plugin-Pages integration points are hidden.
        /// </summary>
        public bool DownloadsUseNativeTab { get; set; } = false;
        public bool DownloadsAutoCreateCustomTab { get; set; } = false;
        [AnalyticsExclude]
        public bool DownloadsCustomTabJeOwned { get; set; } = false;
        public bool DownloadsPagePollingEnabled { get; set; } = true;
        public int DownloadsPollIntervalSeconds { get; set; } = 30;
        public bool DownloadsPageShowIssues { get; set; } = false;
        public bool ShowDownloadsInRequests { get; set; } = true;
        public bool DownloadsFilterByUserRequests { get; set; } = true;
        public bool DownloadsShowHistory { get; set; } = true;
        public bool DownloadsHistoryAdminOnly { get; set; } = false;
    }
}
