using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Newtonsoft.Json.Linq;

static void Equal(object? expected, object? actual, string context)
{
    if (!Equals(expected, actual)) throw new Exception($"{context}: expected {expected}, got {actual}");
}

var configuration = new PluginConfiguration();
foreach (var property in typeof(PluginConfiguration).GetProperties()) property.SetValue(configuration, true);
var document = new JObject { ["customSetting"] = "retained" };
PluginPagesIntegration.Synchronize(document, configuration, false, "/jellyfin", 1);
var pages = (JArray)document["pages"]!;
Equal(6, pages.Count, "all enabled pages");
Equal("Calendar,Requests,Bookmarks,Hidden Content,Activity,Recommendations", string.Join(',', pages.Select(page => page.Value<string>("DisplayText"))), "page order/labels");
Equal("/jellyfin/JellyfinEnhanced/calendarPage", pages[0].Value<string>("Url"), "legacy host base URL");
Equal("retained", document.Value<string>("customSetting"), "unrelated configuration");

pages[0]["DisplayText"] = "My calendar";
pages[0]["Url"] = "/custom-calendar";
var snapshot = document.ToString();
PluginPagesIntegration.Synchronize(document, configuration, true, "/different", 3);
Equal(snapshot, document.ToString(), "existing entries retain customization and version");

configuration.CalendarUsePluginPages = false;
configuration.DownloadsPageEnabled = false;
PluginPagesIntegration.Synchronize(document, configuration, true, "/jellyfin", 3);
Equal(4, pages.Count, "both enable flags independently gate entries");

var modern = new JObject { ["pages"] = new JArray(new JObject { ["Id"] = "other.plugin", ["custom"] = true }, new JObject { ["Id"] = "Jellyfin.Plugin.JellyfinEnhanced", ["Version"] = 0 }) };
PluginPagesIntegration.Synchronize(modern, configuration, true, "/jellyfin", 1);
var modernPages = (JArray)modern["pages"]!;
Equal(5, modernPages.Count, "legacy root removed; unrelated entry retained");
Equal("other.plugin", modernPages[0].Value<string>("Id"), "unrelated entry");
Equal("/JellyfinEnhanced/bookmarksPage", modernPages[1].Value<string>("Url"), "modern sub-URL support");

var duplicate = new JObject { ["pages"] = new JArray(new JObject { ["Id"] = "Jellyfin.Plugin.JellyfinEnhanced.CalendarPage" }, new JObject { ["Id"] = "Jellyfin.Plugin.JellyfinEnhanced.CalendarPage" }) };
PluginPagesIntegration.Synchronize(duplicate, new PluginConfiguration(), true, "", 1);
Equal(1, ((JArray)duplicate["pages"]!).Count, "preserve existing first-match removal semantics");

var currentLegacy = new JObject { ["pages"] = new JArray(new JObject { ["Id"] = "Jellyfin.Plugin.JellyfinEnhanced", ["Version"] = 1 }) };
PluginPagesIntegration.Synchronize(currentLegacy, new PluginConfiguration(), true, "", 1);
Equal(1, ((JArray)currentLegacy["pages"]!).Count, "current-version legacy entry retained");
Console.WriteLine("Plugin Pages integration contracts passed.");
