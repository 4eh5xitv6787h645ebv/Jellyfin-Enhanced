using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>Registers arr dependencies with their established host lifetimes.</summary>
    internal static class ArrFeature
    {
        internal static void RegisterApi(IServiceCollection serviceCollection)
        {
            serviceCollection.AddTransient<Services.Api.ArrApiClient>();
        }

        internal static void RegisterTasks(IServiceCollection serviceCollection)
        {
            serviceCollection.AddTransient<ArrTagsSyncTask>();
        }
    }
}
