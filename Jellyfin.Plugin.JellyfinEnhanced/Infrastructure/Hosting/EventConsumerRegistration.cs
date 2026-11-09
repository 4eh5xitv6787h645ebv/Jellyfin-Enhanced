using Jellyfin.Plugin.JellyfinEnhanced.EventHandlers;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Activity.Events;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using MediaBrowser.Controller.Events;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.DependencyInjection;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Admin.Events;

namespace Jellyfin.Plugin.JellyfinEnhanced.Infrastructure.Hosting
{
    /// <summary>
    /// Every IEventConsumer registration, verbatim and in its original relative order (restructure S2.0b,
    /// backend.md §2 "DI registration" item 4): consumers of one event come from different features and Jellyfin
    /// resolves them in registration order. Feature registrations never add an event consumer.
    /// </summary>
    public static class EventConsumerRegistration
    {
        public static IServiceCollection AddJeEventConsumers(this IServiceCollection serviceCollection)
        {
            serviceCollection.AddScoped<IEventConsumer<PlaybackStartEventArgs>, MaintenancePlaybackReminderConsumer>();
            serviceCollection.AddScoped<IEventConsumer<PlaybackStartEventArgs>, ContinueWatchingPlaybackConsumer>();
            serviceCollection.AddScoped<IEventConsumer<PlaybackStopEventArgs>, ActivityPlaybackConsumer>();
            // Auto-enable spoiler mode for a series on first play of S1E1.
            // Gated by SpoilerAutoEnableOnFirstPlay; runs on every PlaybackStart.
            serviceCollection.AddScoped<IEventConsumer<PlaybackStartEventArgs>, SpoilerAutoEnableOnFirstPlayConsumer>();
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserCreatedEventArgs>, UserCreatedIdentityInvalidator>();
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserDeletedEventArgs>, UserDeletedIdentityInvalidator>();
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserUpdatedEventArgs>, ReviewAuthorCacheInvalidator>();
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserDeletedEventArgs>, ReviewAuthorCacheInvalidator>();
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserLockedOutEventArgs>, ReviewAuthorCacheInvalidator>();
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserUpdatedEventArgs>, TagCacheAccessInvalidator>();
            serviceCollection.AddScoped<IEventConsumer<Jellyfin.Data.Events.Users.UserDeletedEventArgs>, TagCacheAccessInvalidator>();
            return serviceCollection;
        }
    }
}
