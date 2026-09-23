using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Kill-switch for the request-time <script> injection middleware
        // (ScriptInjectionStartupFilter). When true, the middleware no-ops and the
        // plugin falls back to the legacy on-disk index.html rewrite. Default false.
        [AnalyticsExclude]
        public bool DisableScriptInjectionMiddleware { get; set; } = false;
    }
}
