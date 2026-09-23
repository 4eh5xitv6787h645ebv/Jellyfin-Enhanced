using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>Registers appearance dependencies with their established host lifetimes.</summary>
    internal static class AppearanceFeature
    {
        internal static void RegisterMiddleware(IServiceCollection serviceCollection)
        {
            serviceCollection.AddSingleton<IStartupFilter, BrandingAssetStartupFilter>();
        }
    }
}
