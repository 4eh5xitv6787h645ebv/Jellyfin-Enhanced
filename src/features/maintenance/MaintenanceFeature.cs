using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>Registers maintenance dependencies with their established host lifetimes.</summary>
    internal static class MaintenanceFeature
    {
        internal static void Register(IServiceCollection serviceCollection)
        {

            serviceCollection.AddSingleton<MaintenanceModeService>();
        }
    }
}
