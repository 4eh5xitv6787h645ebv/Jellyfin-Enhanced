using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {
        public bool ColoredActivityIconsEnabled { get; set; } = false;

        // Activity Feed Settings -- server-wide "recent activity" tab (recently
        // watched, favorited, reviewed). Each entry is filtered per-viewer by
        // library access before being shown, same as the tag cache.
        public bool ActivityFeedEnabled { get; set; } = false;
        public bool ActivityFeedShowWatched { get; set; } = true;
        public bool ActivityFeedShowFavorited { get; set; } = true;
        public bool ActivityFeedShowReviewed { get; set; } = true;
        /// <summary>
        /// Shows the Active Streams section on the Activity Feed page. This is
        /// separate from ActiveStreamsEnabled (the header widget toggle) so an
        /// admin can run the section here without the persistent header icon,
        /// or vice versa -- but the underlying live-session data still requires
        /// ActiveStreamsEnabled to be on somewhere, since that's what gates the
        /// active-streams/sessions endpoint itself.
        /// </summary>
        public bool ActivityFeedShowActiveStreams { get; set; } = true;
        public bool ActivityFeedUsePluginPages { get; set; } = false;
        public bool ActivityFeedUseCustomTabs { get; set; } = false;
        /// <summary>
        /// Shows Activity as a self-contained tab on the Home page, created and
        /// managed entirely by Jellyfin Enhanced's own injected script (see
        /// js/enhanced/native-tabs.js) -- no external Custom Tabs plugin required.
        /// Recommended on Jellyfin 12's experimental layout (the default there),
        /// where the legacy Custom-Tabs/Plugin-Pages integration points are hidden.
        /// </summary>
        public bool ActivityFeedUseNativeTab { get; set; } = false;
        public bool ActivityFeedAutoCreateCustomTab { get; set; } = false;
        [AnalyticsExclude]
        public bool ActivityFeedCustomTabJeOwned { get; set; } = false;
    }
}
