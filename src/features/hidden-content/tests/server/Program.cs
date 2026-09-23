using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Services;

var series = Guid.NewGuid();
var episode = Guid.NewGuid();
var data = new UserHiddenContent
{
    Items = new()
    {
        ["series"] = new() { ItemId = series.ToString("N").ToUpperInvariant(), Type = "Series", HideScope = "homesections" },
        ["episode"] = new() { ItemId = episode.ToString(), Type = "Episode", HideScope = "recommendations" }
    }
};
var policy = HiddenContentPolicy.Build(data);
Check(policy.IsHidden(episode.ToString("N"), series.ToString(), "continuewatching"), "Series scopes must cascade to episodes across GUID representations");
Check(policy.IsHidden(episode.ToString(), series.ToString("N"), "nextup"), "Home-section hides must cover Next Up");
Check(policy.IsHidden(series.ToString(), null, "continuewatching"), "Series rows themselves must be hidden");
Check(!policy.IsHidden(episode.ToString(), series.ToString(), "library"), "Scoped hides must not leak into the library");
Check(policy.IsHidden(episode.ToString(), null, "recommendations"), "Item-specific scope must remain independently effective");
Check(!policy.IsHidden(Guid.NewGuid().ToString(), null, "nextup"), "Unrelated items must remain visible");

data.Settings.FilterNextUp = false;
Check(!policy.IsHidden(episode.ToString(), series.ToString(), "nextup"), "A disabled surface gate wins over explicit hides");
data.Settings.Enabled = false;
Check(!policy.IsHidden(episode.ToString(), series.ToString(), "continuewatching"), "User master switch must disable cached policy results");
Check(HiddenContentPolicy.Build(data).IsEmpty, "Disabled policies must not create lookup entries");

data.Settings.Enabled = true;
data.Items["series"].HideScope = "";
policy = HiddenContentPolicy.Build(data);
Check(policy.IsHidden(episode.ToString(), series.ToString(), "library"), "Legacy empty scope must mean global");
Check(!policy.IsHidden(episode.ToString(), series.ToString(), "search"), "Default search opt-out must be preserved even for global hides");
data.Settings.FilterSearch = true;
Check(policy.IsHidden(episode.ToString(), series.ToString(), "search"), "Search opt-in must apply global hides");
Check(!policy.IsHidden(episode.ToString(), series.ToString(), "nextup"), "Global scope must still obey disabled Next Up gate");
Check(HiddenContentPolicy.Build(null).IsEmpty, "Missing saved data must be an empty policy");
data.Items["series"].ItemId = "external-ID";
policy = HiddenContentPolicy.Build(data);
Check(policy.IsHidden("EXTERNAL-id", null, "library"), "Non-GUID identifiers must retain case-insensitive matching");
Console.WriteLine("Hidden-content scope, cascade and settings compatibility checks passed.");

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}
