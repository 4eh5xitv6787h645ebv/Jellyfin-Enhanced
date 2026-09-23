using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Cache invalidation entry points used by plugin configuration updates and scheduled imports.
    /// Not an MVC controller; Seerr endpoints live in the feature's api/ controllers.
    /// </summary>
    public static class SeerrCacheInvalidation
    {
        internal static void ClearUserCaches() => SeerrIdentityService.ClearUserCaches();
        public static void ClearAllSeerrCachesOnConfigChange() => SeerrCacheState.ClearAllSeerrCachesOnConfigChange();
    }
}
