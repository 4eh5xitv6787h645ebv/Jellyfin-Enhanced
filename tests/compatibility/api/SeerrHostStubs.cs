// Only the Jellyfin host/configuration boundary is substituted. These tests compile and run
// the production status service, shared cache state, and Seerr HTTP response validation.
namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public sealed class JellyfinEnhanced
    {
        public static JellyfinEnhanced? Instance { get; set; }
        public StatusConfiguration Configuration { get; } = new();
    }
    public sealed class StatusConfiguration
    {
        public bool JellyseerrEnabled { get; set; }
        public string JellyseerrApiKey { get; set; } = "";
        public string JellyseerrUrls { get; set; } = "";
    }
    public sealed class Logger
    {
        public void Warning(string message) { }
    }
}
namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Api
{
    public static class SeerrIdentityService
    {
        public static int ClearCount { get; private set; }
        public static void ClearUserCaches() => ClearCount++;
    }
}
