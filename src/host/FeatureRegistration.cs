using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.EventHandlers;
using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using MediaBrowser.Controller.Events;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>
    /// Explicit composition root. Ordered feature phases preserve the existing
    /// descriptor order and MVC filter execution; each feature owns its lifetimes.
    /// </summary>
    internal static class FeatureRegistration
    {
        internal static void RegisterServices(IServiceCollection serviceCollection)
        {
            serviceCollection.AddSingleton<StartupService>();
            // Build-target vs host-version check; logged at startup and surfaced
            // on the config page so a jf10 zip on a Jellyfin 12 host is not silent.
            serviceCollection.AddSingleton<HostCompatibilityService>();

            // Request-time injection middlewares (Jellyfin 10.11 & 12):
            //   - ScriptInjectionStartupFilter injects the client <script> into the
            //     web index.html;
            //   - BrandingAssetStartupFilter serves custom logo/banner/favicon images.
            //     Both are kill-switchable via config and no-op safely when there's
            //     nothing to do.
            serviceCollection.AddSingleton<IStartupFilter, ScriptInjectionStartupFilter>();
            AppearanceFeature.RegisterMiddleware(serviceCollection);

            serviceCollection.AddHttpClient();
            SeerrFeature.RegisterApi(serviceCollection);
            SpoilerGuardFeature.RegisterApi(serviceCollection);
            ArrFeature.RegisterApi(serviceCollection);
            serviceCollection.AddTransient<Services.Api.OutboundApiPolicy>();
            SeerrFeature.RegisterHttp(serviceCollection);
            serviceCollection.AddSingleton<Logger>();
            serviceCollection.AddSingleton<UserConfigurationManager>();
            // Auto-detects newly added config-page settings by diffing the
            // embedded configPage.html against a snapshot from the previous
            // startup -- see StartupService.
            serviceCollection.AddSingleton<WhatsNewService>();
            SeerrFeature.RegisterAutomation(serviceCollection);
            TagsFeature.RegisterServices(serviceCollection);
            // Local CDN subsystem: serves every third-party static asset (icons, fonts,
            // theme sheets, flags, remote locales) from the plugin's own route, backed by
            // an on-disk cache that the RefreshCdnAssetsTask warms/refreshes every 24h.
            serviceCollection.AddSingleton<CdnAssetService>();
            RatingsFeature.RegisterServices(serviceCollection);
            SeerrFeature.RegisterParentalPolicy(serviceCollection);
            AnalyticsFeature.Register(serviceCollection);
            serviceCollection.AddTransient<RefreshCdnAssetsTask>();
            ArrFeature.RegisterTasks(serviceCollection);
            RatingsFeature.RegisterTasks(serviceCollection);
            TagsFeature.RegisterTasks(serviceCollection);
            SeerrFeature.RegisterTasks(serviceCollection);
            serviceCollection.AddTransient<ClearTranslationCacheTask>();
            MaintenanceFeature.Register(serviceCollection);
            HiddenContentFeature.Register(serviceCollection);
            PlaybackFeature.Register(serviceCollection);
            ActivityFeature.Register(serviceCollection);
            SpoilerGuardFeature.RegisterImages(serviceCollection);
            serviceCollection.AddSingleton<RequestIdentityService>();
            SpoilerGuardFeature.RegisterProtection(serviceCollection);
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserCreatedEventArgs>, UserCreatedIdentityInvalidator>();
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserDeletedEventArgs>, UserDeletedIdentityInvalidator>();
            SpoilerGuardFeature.RegisterPromotion(serviceCollection);

            serviceCollection.Configure<MvcOptions>(options =>
            {
                // Post-processing runs in reverse order. Keep the original sequence:
                // hidden content, identity tags, field stripping, image protection.
                HiddenContentFeature.RegisterResponseFilter(options);
                SpoilerGuardFeature.RegisterResponseFilters(options);
            });
        }
    }
}
