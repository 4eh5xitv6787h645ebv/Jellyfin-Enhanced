using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>Registers ratings dependencies with their established host lifetimes.</summary>
    internal static class RatingsFeature
    {
        internal static void RegisterServices(IServiceCollection serviceCollection)
        {
            // Awards lookup: on-demand per-title fetch from Wikidata's public SPARQL
            // endpoint (no API key), cached to disk indefinitely for hits / with a TTL
            // for misses — see WikidataAwardsService for details.
            serviceCollection.AddSingleton<WikidataAwardsService>();
            serviceCollection.AddSingleton<MdblistService>();
        }

        internal static void RegisterTasks(IServiceCollection serviceCollection)
        {
            serviceCollection.AddTransient<MdblistRatingsFetchTask>();
            serviceCollection.AddTransient<MdblistRatingsSyncTask>();
        }
    }
}
