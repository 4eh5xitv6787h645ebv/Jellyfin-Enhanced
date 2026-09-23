using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {
        public string CustomPluginLinks { get; set; } = "";
        public bool EnableCustomSplashScreen { get; set; } = false;
        public string SplashScreenImageUrl { get; set; } = "/web/assets/img/banner-light.png";

        // Kill-switch for the request-time branding-asset middleware
        // (BrandingAssetStartupFilter). When true, custom logo/banner/favicon images
        // are not served and jellyfin-web's stock assets are used. Default false.
        [AnalyticsExclude]
        public bool DisableBrandingMiddleware { get; set; } = false;

        // Icon Settings
        public bool UseIcons { get; set; } = true;
        [AnalyticsInclude]
        public string IconStyle { get; set; } = "emoji";

        // Extras Settings
        public bool ThemeSelectorEnabled { get; set; } = false;
        public bool PluginIconsEnabled { get; set; } = false;
        public bool EnableLoginImage { get; set; } = false;
    }
}
