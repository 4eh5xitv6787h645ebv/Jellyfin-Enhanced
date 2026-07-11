using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Services
{
    public sealed class CdnAssetServiceTests
    {
        [Theory]
        [InlineData("svg/sonarr.svg")]
        [InlineData("colors/jellyblue.css")]
        [InlineData("s/font-name.woff2")]
        public void IsSafePath_AcceptsRelativeAssetPaths(string path)
        {
            Assert.True(CdnAssetService.IsSafePath(path));
        }

        [Theory]
        [InlineData("")]
        [InlineData("../secret")]
        [InlineData("https://example.test/asset.svg")]
        [InlineData("//example.test/asset.svg")]
        [InlineData("asset.svg?redirect=https://example.test")]
        [InlineData("asset.svg\r\nX-Test: injected")]
        public void IsSafePath_RejectsTraversalAndUrlSyntax(string path)
        {
            Assert.False(CdnAssetService.IsSafePath(path));
        }
    }
}
