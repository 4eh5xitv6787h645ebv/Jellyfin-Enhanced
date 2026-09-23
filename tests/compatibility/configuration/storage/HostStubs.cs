// Host boundaries only. Persistence code and serialized stores are production sources.
namespace MediaBrowser.Common.Configuration
{
    public interface IApplicationPaths { string PluginsPath { get; } }
}

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public sealed class Logger
    {
        public void Info(string message) { }
        public void Warning(string message) { }
        public void Error(string message) { }
    }
}

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    internal static class SpoilerBlurImageFilter
    {
        public const string SpoilerBlurFileName = "spoilerblur.json";
    }

    internal static class SpoilerUserResolver
    {
        public static void InvalidateUser(string userId) { }
    }

    internal static class ActivityService
    {
        internal const string ActivityTypeFavorited = "Favorited";
    }
}
