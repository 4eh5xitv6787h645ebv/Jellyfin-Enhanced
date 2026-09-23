using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers;

/// <summary>Reconciles JE-owned sidebar entries without overwriting user customizations.</summary>
internal static class PluginPagesIntegration
{
    private const string PageNamespace = "Jellyfin.Plugin.JellyfinEnhanced";

    internal static void Synchronize(JObject document, PluginConfiguration configuration,
        bool supportsSubUrls, string rootUrl, int version)
    {
        if (!document.ContainsKey("pages")) document.Add("pages", new JArray());
        var pages = document.Value<JArray>("pages")!;
        var legacy = pages.FirstOrDefault(page => page.Value<string>("Id") == PageNamespace) as JObject;
        if (legacy != null && (legacy.Value<int?>("Version") ?? 0) < version) pages.Remove(legacy);

        // Declaration order is also the insertion order used by Plugin Pages.
        var definitions = new[]
        {
            new Page("CalendarPage", "calendarPage", "Calendar", "calendar_today", configuration.CalendarPageEnabled && configuration.CalendarUsePluginPages),
            new Page("DownloadsPage", "downloadsPage", "Requests", "download", configuration.DownloadsPageEnabled && configuration.DownloadsUsePluginPages),
            new Page("BookmarksPage", "bookmarksPage", "Bookmarks", "bookmark", configuration.BookmarksEnabled && configuration.BookmarksUsePluginPages),
            new Page("HiddenContentPage", "hiddenContentPage", "Hidden Content", "visibility_off", configuration.HiddenContentEnabled && configuration.HiddenContentUsePluginPages),
            new Page("ActivityPage", "activityPage", "Activity", "history", configuration.ActivityFeedEnabled && configuration.ActivityFeedUsePluginPages),
            new Page("RecommendationsPage", "recommendationsPage", "Recommendations", "auto_awesome", configuration.RecommendationsPageEnabled && configuration.RecommendationsUsePluginPages)
        };

        foreach (var definition in definitions)
        {
            var id = $"{PageNamespace}.{definition.Id}";
            var existing = pages.FirstOrDefault(page => page.Value<string>("Id") == id);
            if (existing == null && definition.Enabled)
            {
                pages.Add(new JObject
                {
                    { "Id", id },
                    { "Url", $"{(supportsSubUrls ? "" : rootUrl)}/JellyfinEnhanced/{definition.Route}" },
                    { "DisplayText", definition.Label },
                    { "Icon", definition.Icon },
                    { "Version", version }
                });
            }
            else if (existing != null && !definition.Enabled)
            {
                pages.Remove(existing);
            }
        }
    }

    private sealed record Page(string Id, string Route, string Label, string Icon, bool Enabled);
}
