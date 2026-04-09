using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using MediaBrowser.Controller;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            // Fix browser caching: adds no-cache headers to plugin config endpoints via MVC action filter.
            // Uses IActionFilter (post-routing) instead of IStartupFilter to avoid BaseUrl path-matching issues.
            serviceCollection.AddSingleton<NoCacheConfigFilter>();
            serviceCollection.Configure<MvcOptions>(opts => opts.Filters.Add<NoCacheConfigFilter>());
            // Phase 2: enable RFC 7807 ProblemDetails for consistent error
            // responses across all plugin endpoints. Endpoints opt-in by
            // returning Problem(...) instead of StatusCode(...) or
            // BadRequest(new { ... }). The middleware also auto-shapes
            // unhandled exceptions as ProblemDetails.
            serviceCollection.AddProblemDetails();

            serviceCollection.AddSingleton<StartupService>();
            // Phase 3: Named HttpClients with per-service timeouts.
            // The default unnamed client is kept for backward compat;
            // services should migrate to named clients incrementally.
            serviceCollection.AddHttpClient();
            serviceCollection.AddHttpClient("Sonarr", c => { c.Timeout = TimeSpan.FromSeconds(15); });
            serviceCollection.AddHttpClient("Radarr", c => { c.Timeout = TimeSpan.FromSeconds(15); });
            serviceCollection.AddHttpClient("Jellyseerr", c => { c.Timeout = TimeSpan.FromSeconds(15); });
            // TMDB: timeout-only, no BaseAddress. The controller's proxy
            // builds absolute URLs with the API key appended, so setting
            // BaseAddress would create a latent double-path trap.
            serviceCollection.AddHttpClient("TMDB", c => { c.Timeout = TimeSpan.FromSeconds(10); });
            serviceCollection.AddSingleton<Logger>();
            // Phase 0: content-hash fingerprint for script / locale URLs.
            // Singleton so the hash is computed at most once and every caller
            // (asset-hash endpoint + ETag headers) shares the same value.
            serviceCollection.AddSingleton<AssetHashProvider>();
            // Phase 1: central lifecycle coordinator for server-side monitors.
            // Symmetric with the frontend moduleRegistry. Wired to
            // ConfigurationChanged in JellyfinEnhanced.cs ctor.
            serviceCollection.AddSingleton<JERuntimeCoordinator>();
            serviceCollection.AddSingleton<UserConfigurationManager>();
            serviceCollection.AddSingleton<AutoSeasonRequestService>();
            serviceCollection.AddSingleton<AutoSeasonRequestMonitor>();
            serviceCollection.AddSingleton<AutoMovieRequestService>();
            serviceCollection.AddSingleton<AutoMovieRequestMonitor>();
            serviceCollection.AddSingleton<WatchlistMonitor>();
            serviceCollection.AddSingleton<TagCacheService>();
            serviceCollection.AddSingleton<TagCacheMonitor>();
            serviceCollection.AddTransient<ArrTagsSyncTask>();
            serviceCollection.AddTransient<BuildTagCacheTask>();
            serviceCollection.AddTransient<JellyseerrWatchlistSyncTask>();
            serviceCollection.AddTransient<JellyseerrUserImportTask>();
            serviceCollection.AddTransient<ClearTranslationCacheTask>();
        }
    }
}