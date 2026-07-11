using Jellyfin.Plugin.JellyfinEnhanced.Controllers;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Controllers
{
    public class ConfigResourcePathTests
    {
        [Theory]
        [InlineData(
            "js/enhanced/hidden-content/hidden-content-data.js",
            "Jellyfin.Plugin.JellyfinEnhanced.js.enhanced.hidden_content.hidden-content-data.js")]
        [InlineData(
            "js/jellyseerr/more-info/more-info-modal-styles.js",
            "Jellyfin.Plugin.JellyfinEnhanced.js.jellyseerr.more_info.more-info-modal-styles.js")]
        [InlineData(
            "js/enhanced/spoilerguard/ids.js",
            "Jellyfin.Plugin.JellyfinEnhanced.js.enhanced.spoilerguard.ids.js")]
        [InlineData(
            "Configuration/config-page.js",
            "Jellyfin.Plugin.JellyfinEnhanced.Configuration.config-page.js")]
        public void BuildEmbeddedResourceName_NormalizesDirectoriesButPreservesFilename(
            string resourcePath,
            string expected)
        {
            Assert.Equal(expected, ConfigController.BuildEmbeddedResourceName(resourcePath));
        }

        [Fact]
        public void DedicatedController_OwnsLocalCdnRoute()
        {
            var method = typeof(ConfigController).GetMethod(nameof(ConfigController.GetCdnAsset));
            var route = Assert.Single(method!.GetCustomAttributes(typeof(HttpGetAttribute), inherit: false));

            Assert.Equal("cdn/{source}/{**path}", ((HttpGetAttribute)route).Template);
            Assert.Null(typeof(ConfigController).Assembly.GetType(
                "Jellyfin.Plugin.JellyfinEnhanced.Controllers.JellyfinEnhancedController"));
        }
    }
}
