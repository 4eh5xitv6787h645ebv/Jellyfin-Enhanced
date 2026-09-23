// Only Jellyfin host entities and plugin configuration are substituted. The services,
// request clients, parsing, caches, and HTTP helper are compiled from production sources.
global using JUser = Jellyfin.Data.Entities.User;
global using JSortOrder = MediaBrowser.Model.Querying.SortOrder;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public sealed class JellyfinEnhanced
    {
        public static JellyfinEnhanced? Instance { get; set; }
        public Configuration.PluginConfiguration Configuration { get; set; } = new();
    }
    public sealed class Logger
    {
        public void Debug(string message) { }
        public void Info(string message) { }
        public void Warning(string message) { }
        public void Error(string message) { }
    }
}
namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public sealed class PluginConfiguration
    {
        public bool AutoMovieRequestEnabled { get; set; } = true;
        public bool AutoSeasonRequestEnabled { get; set; } = true;
        public bool JellyseerrEnabled { get; set; } = true;
        public string TMDB_API_KEY { get; set; } = "fixture-key";
        public string JellyseerrUrls { get; set; } = "https://seerr.example";
        public string JellyseerrApiKey { get; set; } = "seerr-key";
        public int JellyseerrUserIdCacheTtlMinutes { get; set; } = 30;
        public int JellyseerrResponseCacheTtlMinutes { get; set; } = 10;
        public bool JellyseerrDisableCache { get; set; }
        public bool AutoMovieRequestCheckReleaseDate { get; set; }
        public string? AutoMovieRequestQualityMode { get; set; } = "default";
        public bool AutoMovieRequestFallbackOn4k { get; set; }
        public int AutoMovieRequestCustomServerId { get; set; } = -1;
        public int AutoMovieRequestCustomProfileId { get; set; }
        public string? AutoMovieRequestCustomRootFolder { get; set; }
        public bool AutoSeasonRequestRequireAllWatched { get; set; }
        public int AutoSeasonRequestThresholdValue { get; set; } = 2;
    }
}
namespace Jellyfin.Data.Entities
{
    public sealed class User { public Guid Id { get; set; } public string Username { get; set; } = "fixture"; }
}
namespace Jellyfin.Data.Enums { public enum BaseItemKind { Episode } }
namespace MediaBrowser.Model.Querying
{
    public enum SortOrder { Ascending }
    public enum ItemSortBy { ParentIndexNumber, IndexNumber }
}
namespace MediaBrowser.Controller.Entities
{
    public class BaseItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = "fixture";
        public Dictionary<string, string> ProviderIds { get; set; } = new() { ["Tmdb"] = "10" };
    }
    public sealed class InternalItemsQuery(JUser user)
    {
        public Guid[]? AncestorIds { get; set; }
        public Jellyfin.Data.Enums.BaseItemKind[]? IncludeItemTypes { get; set; }
        public bool Recursive { get; set; }
        public (MediaBrowser.Model.Querying.ItemSortBy, JSortOrder)[]? OrderBy { get; set; }
        public JUser User { get; } = user;
    }
}
namespace MediaBrowser.Controller.Entities.Movies { public sealed class Movie : BaseItem { } }
namespace MediaBrowser.Controller.Entities.TV
{
    public sealed class Series : BaseItem { }
    public sealed class Episode : BaseItem
    {
        public Series? Series { get; set; }
        public int? ParentIndexNumber { get; set; }
        public int? IndexNumber { get; set; }
    }
}
namespace MediaBrowser.Controller.Library
{
    public interface IUserManager { JUser? GetUserById(Guid id); }
    public interface IUserDataManager { UserData? GetUserData(JUser user, Entities.BaseItem item); }
    public sealed class UserData { public bool Played { get; set; } }
    public interface ILibraryManager { ItemsResult GetItemsResult(Entities.InternalItemsQuery query); }
    public sealed class ItemsResult { public Entities.BaseItem[] Items { get; set; } = []; }
}
