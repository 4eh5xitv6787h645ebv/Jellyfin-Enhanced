// Only the input contract needed by the linked production reconciler.
namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration;
internal sealed class PluginConfiguration
{
    public bool CalendarPageEnabled { get; set; }
    public bool CalendarUsePluginPages { get; set; }
    public bool DownloadsPageEnabled { get; set; }
    public bool DownloadsUsePluginPages { get; set; }
    public bool BookmarksEnabled { get; set; }
    public bool BookmarksUsePluginPages { get; set; }
    public bool HiddenContentEnabled { get; set; }
    public bool HiddenContentUsePluginPages { get; set; }
    public bool ActivityFeedEnabled { get; set; }
    public bool ActivityFeedUsePluginPages { get; set; }
    public bool RecommendationsPageEnabled { get; set; }
    public bool RecommendationsUsePluginPages { get; set; }
}
