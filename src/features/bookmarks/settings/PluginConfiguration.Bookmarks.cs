using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Bookmarks Settings
        public bool BookmarksEnabled { get; set; } = true;
        public bool BookmarksUsePluginPages { get; set; } = false;
        public bool BookmarksUseCustomTabs { get; set; } = false;
        /// <summary>
        /// Shows Bookmarks as a self-contained tab on the Home page, created and
        /// managed entirely by Jellyfin Enhanced's own injected script (see
        /// js/enhanced/native-tabs.js) -- no external Custom Tabs plugin required.
        /// Recommended on Jellyfin 12's experimental layout (the default there),
        /// where the legacy Custom-Tabs/Plugin-Pages integration points are hidden.
        /// </summary>
        public bool BookmarksUseNativeTab { get; set; } = false;
        /// <summary>
        /// When true (and the Custom Tabs plugin is detected with a recognized
        /// config schema), Jellyfin Enhanced will manage the corresponding
        /// Custom Tabs entry: creating it when <see cref="BookmarksUseCustomTabs"/>
        /// is enabled and removing it when disabled. The toggle in the UI is
        /// only shown when both conditions hold; it is silently ignored otherwise.
        /// </summary>
        public bool BookmarksAutoCreateCustomTab { get; set; } = false;

        /// <summary>
        /// True if Jellyfin Enhanced created the corresponding Custom Tabs entry
        /// (set when sync ADDs an entry; cleared when sync REMOVES one). Sync uses
        /// this flag to ensure it never deletes a Custom Tabs entry the admin
        /// created manually. Hidden field — no UI; managed entirely by saveConfig.
        /// </summary>
        [AnalyticsExclude]
        public bool BookmarksCustomTabJeOwned { get; set; } = false;
    }
}
