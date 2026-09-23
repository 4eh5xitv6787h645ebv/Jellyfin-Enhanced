using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    public static class JellyfinEnhancedController
    {
        // Compatibility entry points used by plugin configuration updates and scheduled imports.
        // This is not an MVC controller; feature endpoints live in the adjacent controllers.
        internal static void ClearUserCaches() => SeerrIdentityService.ClearUserCaches();
        public static void ClearAllSeerrCachesOnConfigChange() => SeerrCacheState.ClearAllSeerrCachesOnConfigChange();
    }
}
