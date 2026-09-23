using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>Registers seerr dependencies with their established host lifetimes.</summary>
    internal static class SeerrFeature
    {
        internal static void RegisterApi(IServiceCollection serviceCollection)
        {

            // Per-request application collaborators shared by feature controllers.
            // Their caches retain the existing process-wide ownership internally.
            serviceCollection.AddTransient<Services.Api.SeerrIdentityService>();
            serviceCollection.AddTransient<Services.Api.SeerrStatusService>();
            serviceCollection.AddTransient<Services.Api.SeerrWatchlistService>();
        }

        internal static void RegisterHttp(IServiceCollection serviceCollection)
        {
            serviceCollection.AddTransient<Services.Api.TmdbEnrichmentService>();

            // a named HttpClient with AllowAutoRedirect=false so
            // forward-auth proxies (Authelia / Pangolin / Authentik) returning
            // 302 to a login URL are detected as `UpstreamRedirect` instead of
            // silently followed and producing a 200 + login HTML body.
            // SeerrHttpHelper.UseClientName(name) selects this for outbound
            // Seerr/TMDB calls.
            serviceCollection.AddHttpClient(Helpers.Jellyseerr.SeerrHttpHelper.NamedClient)
                .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                {
                    AllowAutoRedirect = false
                });
        }

        internal static void RegisterAutomation(IServiceCollection serviceCollection)
        {
            serviceCollection.AddSingleton<AutoSeasonRequestService>();
            serviceCollection.AddSingleton<AutoSeasonRequestMonitor>();
            serviceCollection.AddSingleton<AutoMovieRequestService>();
            serviceCollection.AddSingleton<AutoMovieRequestMonitor>();
            serviceCollection.AddSingleton<WatchlistMonitor>();
            serviceCollection.AddSingleton<SeerrScanTriggerService>();
        }

        internal static void RegisterParentalPolicy(IServiceCollection serviceCollection)
        {
            serviceCollection.AddSingleton<SeerrParentalFilter>();
        }

        internal static void RegisterTasks(IServiceCollection serviceCollection)
        {
            serviceCollection.AddTransient<JellyseerrWatchlistSyncTask>();
            serviceCollection.AddTransient<JellyfinToSeerrWatchlistSyncTask>();
            serviceCollection.AddTransient<JellyseerrUserImportTask>();
        }
    }
}
