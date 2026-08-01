using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Helpers.Jellyseerr
{
    /// <summary>
    /// Ensures a crafted request body cannot make an unknown media type fall
    /// through to the movie gate or turn an unidentifiable title into a POST.
    /// </summary>
    public sealed class SeerrRequestMediaParserTests
    {
        [Theory]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":293660}", "movie", 293660)]
        [InlineData("{\"mediaType\":\"tv\",\"mediaId\":1399}", "tv", 1399)]
        [InlineData("{\"mediaType\":\"MOVIE\",\"mediaId\":1}", "movie", 1)]
        [InlineData("{\"mediaType\":\"Tv\",\"mediaId\":\"42\"}", "tv", 42)]
        [InlineData("{\"mediaType\":\"tv\",\"mediaId\":1399,\"seasons\":[1],\"is4k\":false}", "tv", 1399)]
        public void ValidTitleIdentity_IsNormalized(string json, string expectedType, int expectedId)
        {
            var parsed = SeerrRequestMediaParser.TryParse(json, out var media);

            Assert.True(parsed);
            Assert.Equal(expectedType, media.MediaType);
            Assert.Equal(expectedId, media.TmdbId);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("not-json")]
        [InlineData("null")]
        [InlineData("[]")]
        [InlineData("{}")]
        [InlineData("{\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"movie\"}")]
        [InlineData("{\"mediaType\":null,\"mediaId\":1}")]
        [InlineData("{\"mediaType\":42,\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"\",\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"person\",\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"collection\",\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"movies\",\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":null}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":false}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":{}}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":[]}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":0}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":-1}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":1.5}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":2147483648}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"\"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"0\"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"-1\"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"1.5\"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"2147483648\"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"abc\"}")]
        [InlineData("{\"MediaType\":\"movie\",\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"movie\",\"MediaId\":1}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"+1\"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\" 1\"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"1 \"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":\"1e2\"}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":1} trailing")]
        public void InvalidOrUnidentifiableBody_IsRejected(string? json)
        {
            var parsed = SeerrRequestMediaParser.TryParse(json, out var media);

            Assert.False(parsed);
            Assert.Equal(default, media);
        }

        [Theory]
        [InlineData("{\"mediaType\":\"movie\",\"mediaType\":\"tv\",\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaType\":\"movie\",\"mediaId\":1}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":1,\"mediaId\":2}")]
        [InlineData("{\"mediaType\":\"movie\",\"mediaId\":1,\"mediaId\":1}")]
        public void ConflictingDuplicateIdentityFields_AreRejected(string json)
            => Assert.False(SeerrRequestMediaParser.TryParse(json, out _));

        [Theory]
        [InlineData("{\"id\":7,\"media\":{\"mediaType\":\"movie\",\"tmdbId\":293660}}", "movie", 293660)]
        [InlineData("{\"id\":\"7\",\"media\":{\"mediaType\":\"TV\",\"tmdbId\":\"1399\",\"adult\":false}}", "tv", 1399)]
        public void NestedDetail_BindsEntityAndTitleIdentity(
            string json,
            string expectedType,
            int expectedTmdbId)
        {
            var parsed = SeerrRequestMediaParser.TryParseNestedDetail(json, 7, out var media);

            Assert.True(parsed);
            Assert.Equal(new SeerrRequestMedia(expectedType, expectedTmdbId), media);
        }

        [Theory]
        [InlineData("{\"id\":8,\"media\":{\"mediaType\":\"movie\",\"tmdbId\":1}}")]
        [InlineData("{\"id\":7,\"id\":7,\"media\":{\"mediaType\":\"movie\",\"tmdbId\":1}}")]
        [InlineData("{\"id\":7,\"media\":{},\"media\":{\"mediaType\":\"movie\",\"tmdbId\":1}}")]
        [InlineData("{\"id\":7,\"media\":{\"mediaType\":\"movie\",\"mediaType\":\"tv\",\"tmdbId\":1}}")]
        [InlineData("{\"id\":7,\"media\":{\"mediaType\":\"movie\",\"tmdbId\":1,\"tmdbId\":2}}")]
        [InlineData("{\"id\":7,\"media\":{\"mediaType\":\"movie\",\"tmdbId\":1,\"adult\":true}}")]
        [InlineData("{\"id\":7,\"media\":{\"mediaType\":\"movie\",\"tmdbId\":1,\"adult\":null}}")]
        [InlineData("{\"id\":7,\"type\":\"movie\",\"media\":{\"tmdbId\":1}}")]
        public void NestedDetail_MismatchedOrAmbiguousIdentityIsRejected(string json)
            => Assert.False(SeerrRequestMediaParser.TryParseNestedDetail(json, 7, out _));

        [Fact]
        public void JsonElementOverload_UsesSameValidation()
        {
            using var document = System.Text.Json.JsonDocument.Parse(
                """{"mediaType":"tv","mediaId":1399,"seasons":[1]}""");

            Assert.True(SeerrRequestMediaParser.TryParse(document.RootElement, out var media));
            Assert.Equal(new SeerrRequestMedia("tv", 1399), media);
        }
    }
}
