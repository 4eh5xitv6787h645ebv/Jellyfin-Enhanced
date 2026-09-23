namespace System.Net.Http
{
    public interface IHttpClientFactory { HttpClient CreateClient(string name); }
    public static class FactoryExtensions { public static HttpClient CreateClient(this IHttpClientFactory factory) => factory.CreateClient(string.Empty); }
}
// Only Jellyfin host surfaces are substituted. Filtering, classifiers, HTTP parsing,
// extraction, decisions, and caches are the linked production implementation.
namespace Jellyfin.Data { internal static class NamespaceMarker { } }
namespace Jellyfin.Data.Enums { public enum UnratedItem { Movie, Series } }
namespace Jellyfin.Database.Implementations.Enums { public enum PreferenceKind { BlockUnratedItems, BlockedTags, AllowedTags } }
namespace MediaBrowser.Controller.Library
{
    using Jellyfin.Data.Enums;
    using Jellyfin.Database.Implementations.Enums;
    public interface IUserManager { TestUser? GetUserById(Guid id); }
    public sealed class TestUser
    {
        public int? MaxParentalRatingScore { get; set; }
        public int? MaxParentalRatingSubScore { get; set; }
        public UnratedItem[] BlockUnrated { get; set; } = [];
        public string[] BlockedTags { get; set; } = [];
        public string[] AllowedTags { get; set; } = [];
        public T[] GetPreferenceValues<T>(PreferenceKind kind) => BlockUnrated.Cast<T>().ToArray();
        public string[] GetPreference(PreferenceKind kind) => kind == PreferenceKind.BlockedTags ? BlockedTags : AllowedTags;
    }
}
namespace MediaBrowser.Controller.Configuration
{
    public interface IServerConfigurationManager { TestConfiguration Configuration { get; } }
    public sealed class TestConfiguration { public string MetadataCountryCode { get; set; } = "US"; }
}
namespace MediaBrowser.Model.Globalization
{
    public interface ILocalizationManager { TestRating? GetRatingScore(string certification, string country); }
    public sealed record TestRating(int Score, int? SubScore);
}
namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public sealed class PluginConfiguration
    {
        public bool JellyseerrEnabled { get; set; } = true;
        public string JellyseerrUrls { get; set; } = "https://seerr.test";
        public string JellyseerrApiKey { get; set; } = "test-seerr-key";
        public string TMDB_API_KEY { get; set; } = "test-tmdb-key";
    }
}
namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public sealed class JellyfinEnhanced
    {
        public static JellyfinEnhanced? Instance { get; set; } = new();
        public Configuration.PluginConfiguration Configuration { get; set; } = new();
    }
    public sealed class Logger
    {
        public void Debug(string message) { }
        public void Warning(string message) { }
    }
}
