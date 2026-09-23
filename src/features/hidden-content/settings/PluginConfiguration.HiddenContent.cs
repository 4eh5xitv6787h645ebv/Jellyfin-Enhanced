using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {
        public bool RemoveContinueWatchingEnabled { get; set; } = false;

        // Hidden Content Settings
        public bool HiddenContentEnabled { get; set; } = false;
        public bool HiddenContentUsePluginPages { get; set; } = false;
        public bool HiddenContentUseCustomTabs { get; set; } = false;
        /// <summary>
        /// Shows Hidden Content as a self-contained tab on the Home page, created
        /// and managed entirely by Jellyfin Enhanced's own injected script (see
        /// js/enhanced/native-tabs.js) -- no external Custom Tabs plugin required.
        /// Recommended on Jellyfin 12's experimental layout (the default there),
        /// where the legacy Custom-Tabs/Plugin-Pages integration points are hidden.
        /// </summary>
        public bool HiddenContentUseNativeTab { get; set; } = false;
        public bool HiddenContentAutoCreateCustomTab { get; set; } = false;
        [AnalyticsExclude]
        public bool HiddenContentCustomTabJeOwned { get; set; } = false;

        // Admin cross-user hidden-content view + management
        public bool HiddenContentAdmin { get; set; } = true;

        // Hidden Content per-user defaults
        public bool HiddenContentDefaultEnabled { get; set; } = true;
        public bool HiddenContentDefaultShowHideButtons { get; set; } = true;
        public bool HiddenContentDefaultShowHideConfirmation { get; set; } = true;
        public bool HiddenContentDefaultShowButtonJellyseerr { get; set; } = true;
        public bool HiddenContentDefaultShowButtonLibrary { get; set; } = false;
        public bool HiddenContentDefaultShowButtonDetails { get; set; } = true;
        public bool HiddenContentDefaultShowButtonCast { get; set; } = false;
        public bool HiddenContentDefaultFilterLibrary { get; set; } = true;
        public bool HiddenContentDefaultFilterDiscovery { get; set; } = true;
        public bool HiddenContentDefaultFilterSearch { get; set; } = false;
        public bool HiddenContentDefaultFilterCalendar { get; set; } = true;
        public bool HiddenContentDefaultFilterUpcoming { get; set; } = true;
        public bool HiddenContentDefaultFilterRecommendations { get; set; } = true;
        public bool HiddenContentDefaultFilterRequests { get; set; } = true;
        public bool HiddenContentDefaultFilterNextUp { get; set; } = true;
        public bool HiddenContentDefaultFilterContinueWatching { get; set; } = true;
        public bool HiddenContentDefaultExperimentalHideCollections { get; set; } = false;
    }
}
