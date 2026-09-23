using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>Registers tags dependencies with their established host lifetimes.</summary>
    internal static class TagsFeature
    {
        internal static void RegisterServices(IServiceCollection serviceCollection)
        {
            serviceCollection.AddSingleton<TagCacheService>();
            serviceCollection.AddSingleton<TagCacheMonitor>();
        }

        internal static void RegisterTasks(IServiceCollection serviceCollection)
        {
            serviceCollection.AddTransient<BuildTagCacheTask>();
        }
    }
}
