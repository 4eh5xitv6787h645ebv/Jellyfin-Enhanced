using System.Net.Http;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.EventHandlers;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Activity;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Admin;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Admin.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Catchup;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Chrome;
using Jellyfin.Plugin.JellyfinEnhanced.Features.DetailsProviders;
using Jellyfin.Plugin.JellyfinEnhanced.Features.HiddenContent;
using Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags;
using Jellyfin.Plugin.JellyfinEnhanced.Infrastructure.Hosting;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using MediaBrowser.Controller.Events;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using MediaBrowser.Controller;
using Jellyfin.Plugin.JellyfinEnhanced.Features.DetailsProviders.Services;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            serviceCollection.AddSingleton<StartupService>();
            // Build-target vs host-version check; logged at startup and surfaced
            // on the config page so unsupported host majors are not silent.
            serviceCollection.AddSingleton<HostCompatibilityService>();

            // Request-time injection middlewares (Jellyfin 12):
            //   - ScriptInjectionStartupFilter injects the client <script> into the
            //     web index.html;
            //   - BrandingAssetStartupFilter serves custom logo/banner/favicon images.
            //     Both are kill-switchable via config and no-op safely when there's
            //     nothing to do.
            serviceCollection.AddSingleton<IStartupFilter, ScriptInjectionStartupFilter>();
            serviceCollection.AddJeChrome();

            serviceCollection.AddHttpClient();

            // a named HttpClient with AllowAutoRedirect=false so
            // forward-auth proxies (Authelia / Pangolin / Authentik) returning
            // 302 to a login URL are detected as `UpstreamRedirect` instead of
            // silently followed and producing a 200 + login HTML body.
            // SeerrHttpHelper.UseClientName(name) selects this for outbound
            // Seerr/TMDB calls.
            serviceCollection.AddHttpClient(Helpers.Jellyseerr.SeerrHttpHelper.NamedClient)
                .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                {
                    AllowAutoRedirect = false,
                    UseCookies = false
                })
                .AddHttpMessageHandler(() => new Helpers.Jellyseerr.SeerrCsrfHandler());
            serviceCollection.AddSingleton<Logger>();
            serviceCollection.AddSingleton<UserConfigurationManager>();
            // Auto-detects newly added config-page settings by diffing the
            // embedded configPage.html against a snapshot from the previous
            // startup -- see StartupService.
            serviceCollection.AddJeAdmin();
            serviceCollection.AddSingleton<AutoSeasonRequestService>();
            serviceCollection.AddSingleton<AutoSeasonRequestMonitor>();
            serviceCollection.AddSingleton<AutoMovieRequestService>();
            serviceCollection.AddSingleton<AutoMovieRequestMonitor>();
            serviceCollection.AddSingleton<WatchlistMonitor>();
            serviceCollection.AddJeCatchup();
            serviceCollection.AddSingleton<SeerrScanTriggerService>();
            serviceCollection.AddJeMediaTags();
            // Local CDN subsystem: serves every third-party static asset (icons, fonts,
            // theme sheets, flags, remote locales) from the plugin's own route, backed by
            // an on-disk cache that the RefreshCdnAssetsTask warms/refreshes every 24h.
            serviceCollection.AddSingleton<CdnAssetService>();
            serviceCollection.AddJeDetailsProviders();
            // In-memory, size-bounded cache + single-flight for TMDB passthrough and
            // person lookups -- see TmdbResponseCache for TTLs and why it is account-safe.
            serviceCollection.AddSingleton<TmdbResponseCache>();
            serviceCollection.AddSingleton<SeerrParentalFilter>();
            // Opt-in anonymous usage reporting: UsageEventCounterService holds the
            // current period's counters (debounced disk persistence, same pattern
            // as WikidataAwardsService); AnalyticsReportingService builds/sends the
            // payload on AnalyticsReportTask's cadence. See AnalyticsReportingService
            // for what's collected and why it's safe to ship the anon key in-client.
            serviceCollection.AddSingleton<UsageEventCounterService>();
            serviceCollection.AddSingleton<AnalyticsReportingService>();
            serviceCollection.AddTransient<AnalyticsReportTask>();
            serviceCollection.AddTransient<RefreshCdnAssetsTask>();
            serviceCollection.AddTransient<JellyseerrWatchlistSyncTask>();
            serviceCollection.AddTransient<JellyfinToSeerrWatchlistSyncTask>();
            serviceCollection.AddTransient<JellyseerrUserImportTask>();

            // Hidden Content: server-side filter for every native Jellyfin endpoint that surfaces user-facing item lists
            // (Resume, Items, Latest, NextUp, Upcoming, Suggestions, SearchHints), plus the Home Screen Sections
            // plugin's own section-content endpoint, which replaces those native lists on an HSS home screen. Same
            // filter handles "Remove from Continue Watching" via HideScope=continuewatching in hidden-content.json.
            // Maintenance Mode extras: a 30s timer that opens/closes the daily scheduled window
            // and expires timed manual windows, plus the per-playback-start reminder popup.
            serviceCollection.AddHostedService<MaintenanceScheduleService>();
            serviceCollection.AddJeEventConsumers();
            serviceCollection.AddJeHiddenContent();

            // Activity Feed: recently watched / favorited / reviewed, gated by
            // ActivityFeedEnabled. ActivityFavoriteMonitor is a Singleton that
            // self-subscribes to IUserDataManager.UserDataSaved in its own
            // constructor (see StartupService, which forces its construction).
            serviceCollection.AddJeActivity();

            // Spoiler Guard: an MVC action filter on the Image controller blurs
            // guarded-episode image bytes, so every client gets them via the native image API.
            serviceCollection.AddSingleton<ImageBlurService>();
            // Shared user-resolution + state-load helper. One instance, both filters use it
            // so the IPv6 / shared-IP / fail-closed logic stays in ONE place.
            serviceCollection.AddSingleton<SpoilerIdentityService>();
            serviceCollection.AddSingleton<RequestIdentityService>();
            serviceCollection.AddSingleton<SpoilerIdentityTagFilter>();
            serviceCollection.AddSingleton<SpoilerUserResolver>();
            serviceCollection.AddSingleton<SpoilerBlurImageFilter>();
            // Per-(user, series) next-unwatched boundary for the advanced
            // category reveals; owns its own bounded cache and evicts on
            // IUserDataManager.UserDataSaved (O(1) on the event thread).
            serviceCollection.AddSingleton<SpoilerNextUnwatchedService>();
            // Spoiler Field Strip: removes spoiler-y metadata (Overview, ratings,
            // title, cast, etc.) from BaseItemDto responses for guarded unwatched episodes.
            serviceCollection.AddSingleton<SpoilerFieldStripFilter>();
            // The same policy for the Seerr, TMDB and MDBList data JE shows itself.
            serviceCollection.AddSingleton<SpoilerSeerrRedactor>();

            // Promotes pending pre-acquisition Spoiler Guard entries (PendingTmdb)
            // into real Series/Movies entries when matching library items land.
            serviceCollection.AddHostedService<SpoilerSeerrPendingPromoter>();
            // Auto-enable Spoiler Guard for every user the moment a new
            // Series/Movie lands in the library (SpoilerAutoEnableOnLibraryAdd);
            // batches a scan's ItemAdded burst into one write per user.
            serviceCollection.AddHostedService<SpoilerLibraryAddAutoEnabler>();
            // Admin-triggered "apply to existing titles": the same scope and
            // write path for titles that were already in the library. Run by
            // SpoilerApplyExistingTitlesTask; previewed by the config page.
            serviceCollection.AddSingleton<SpoilerExistingTitlesApplier>();
            // Spoiler Guard's tag-data strip, shared by GET /tag-cache, POST
            // /tag-data and native poster tags.
            serviceCollection.AddSingleton<SpoilerTagDataStripper>();

            serviceCollection.AddJeMvcFilters();
        }
    }
}
