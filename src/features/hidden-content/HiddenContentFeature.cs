using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>Registers hidden-content dependencies with their established host lifetimes.</summary>
    internal static class HiddenContentFeature
    {
        internal static void Register(IServiceCollection serviceCollection)
        {
            // Covers native list endpoints and supported home-section responses.
            serviceCollection.AddSingleton<HiddenContentResponseFilter>();
        }

        internal static void RegisterResponseFilter(MvcOptions options)
        {
            options.Filters.AddService<HiddenContentResponseFilter>();
        }
    }
}
