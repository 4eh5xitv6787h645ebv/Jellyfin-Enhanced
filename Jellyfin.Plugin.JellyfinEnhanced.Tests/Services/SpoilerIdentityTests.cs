using Jellyfin.Plugin.JellyfinEnhanced.Services;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Services
{
    public sealed class SpoilerIdentityTests
    {
        [Fact]
        public void MintMarker_IsStableLowercaseHex()
        {
            var service = new SpoilerIdentityService(
                null!,
                NullLogger<SpoilerIdentityService>.Instance);
            var userId = Guid.Parse("00112233-4455-6677-8899-aabbccddeeff");

            var first = service.MintMarker(userId);
            var second = service.MintMarker(userId);

            Assert.Equal(first, second);
            Assert.Equal(SpoilerIdentityService.MarkerHexLength, first.Length);
            Assert.All(first, character => Assert.Contains(character, "0123456789abcdef"));
        }

        [Fact]
        public void AppendAndParseMarker_RoundTripsAndIsIdempotent()
        {
            const string baseTag = "sb-01234567-originaltag";
            const string marker = "012345abcdef";

            var stamped = SpoilerIdentityService.AppendMarker(baseTag, marker);

            Assert.Equal(stamped, SpoilerIdentityService.AppendMarker(stamped, marker));
            Assert.True(SpoilerIdentityService.TryParseMarker(stamped, out var parsedBase, out var parsedMarker));
            Assert.Equal(baseTag, parsedBase);
            Assert.Equal(marker, parsedMarker);
        }

        [Fact]
        public void StampItem_RekeysBlurhashFromPreCacheBustTag()
        {
            const string originalTag = "originaltag";
            const string cacheBustedTag = "sb-01234567-" + originalTag;
            const string marker = "012345abcdef";
            var item = new BaseItemDto
            {
                ImageTags = new Dictionary<ImageType, string>
                {
                    [ImageType.Primary] = cacheBustedTag,
                },
                ImageBlurHashes = new Dictionary<ImageType, Dictionary<string, string>>
                {
                    [ImageType.Primary] = new Dictionary<string, string>
                    {
                        [originalTag] = "blurhash",
                    },
                },
            };

            SpoilerIdentityTagFilter.StampItem(item, marker);

            var stamped = cacheBustedTag + SpoilerIdentityService.MarkerSentinel + marker;
            Assert.Equal(stamped, item.ImageTags[ImageType.Primary]);
            Assert.Equal("blurhash", item.ImageBlurHashes[ImageType.Primary][stamped]);
            Assert.DoesNotContain(originalTag, item.ImageBlurHashes[ImageType.Primary].Keys);
        }
    }
}
