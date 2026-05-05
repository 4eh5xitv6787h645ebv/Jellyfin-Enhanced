using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.EventHandlers;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay;
using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using MediaBrowser.Controller.Events;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using MediaBrowser.Controller;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            serviceCollection.AddSingleton<StartupService>();
            serviceCollection.AddHttpClient();
            serviceCollection.AddSingleton<Logger>();
            serviceCollection.AddSingleton<UserConfigurationManager>();
            serviceCollection.AddSingleton<AutoSeasonRequestService>();
            serviceCollection.AddSingleton<AutoSeasonRequestMonitor>();
            serviceCollection.AddSingleton<AutoMovieRequestService>();
            serviceCollection.AddSingleton<AutoMovieRequestMonitor>();
            serviceCollection.AddSingleton<WatchlistMonitor>();
            serviceCollection.AddSingleton<SeerrScanTriggerService>();
            serviceCollection.AddSingleton<TagCacheService>();
            serviceCollection.AddSingleton<TagCacheMonitor>();
            serviceCollection.AddTransient<ArrTagsSyncTask>();
            serviceCollection.AddTransient<BuildTagCacheTask>();
            serviceCollection.AddTransient<JellyseerrWatchlistSyncTask>();
            serviceCollection.AddTransient<JellyseerrUserImportTask>();
            serviceCollection.AddTransient<ClearTranslationCacheTask>();

            // Hidden Content: server-side filter for every native Jellyfin endpoint that surfaces user-facing item lists
            // (Resume, Items, Latest, NextUp, Upcoming, Suggestions, SearchHints). Same filter handles "Remove from
            // Continue Watching" via HideScope=continuewatching in hidden-content.json.
            serviceCollection.AddSingleton<HiddenContentResponseFilter>();
            serviceCollection.AddScoped<IEventConsumer<PlaybackStartEventArgs>, ContinueWatchingPlaybackConsumer>();
            serviceCollection.AddHostedService<ContinueWatchingLibraryHook>();
            serviceCollection.Configure<MvcOptions>(o => o.Filters.AddService<HiddenContentResponseFilter>());

            // Poster Tag Burn-in (issue 590) — server-rendered tag overlays composited
            // into poster bytes so Swiftfin/Findroid/Roku/AndroidTV clients see tags too.
            serviceCollection.AddSingleton<PosterTagComposer>();
            serviceCollection.AddSingleton<PosterTagCache>();
            serviceCollection.AddSingleton<PosterTagRenderer>();
            serviceCollection.AddSingleton<IStartupFilter, PosterTagStartupFilter>();
        }
    }
}