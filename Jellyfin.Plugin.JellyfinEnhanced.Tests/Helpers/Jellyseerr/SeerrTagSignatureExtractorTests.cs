using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Helpers.Jellyseerr
{
    public sealed class SeerrTagSignatureExtractorTests
    {
        private static JsonElement Parse(string json)
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }

        [Fact]
        public void SeerrDetail_ExtractsAndNormalizesKeywordsAndGenres()
        {
            var detail = Parse("""
                {
                  "keywords": [
                    {"id":12377,"name":"zombie"},
                    {"id":1,"name":"Graphic-Violence"}
                  ],
                  "genres": [
                    {"id":27,"name":"Horror"},
                    {"id":35,"name":"Comedy"}
                  ]
                }
                """);

            var extracted = SeerrTagSignatureExtractor.TryExtract(detail, out var keywords, out var genres);

            Assert.True(extracted);
            Assert.Equal(new[] { "graphic violence", "zombie" }, keywords.OrderBy(static value => value));
            Assert.Equal(new[] { "comedy", "horror" }, genres.OrderBy(static value => value));
        }

        [Fact]
        public void TmdbMovieKeywordWrapper_IsAccepted()
        {
            var extracted = SeerrTagSignatureExtractor.TryExtract(
                Parse("""{"keywords":{"keywords":[{"id":1,"name":"heist"}]},"genres":[]}"""),
                out var keywords,
                out var genres);

            Assert.True(extracted);
            Assert.Contains("heist", keywords);
            Assert.Empty(genres);
        }

        [Fact]
        public void TmdbTvKeywordWrapper_IsAccepted()
        {
            var extracted = SeerrTagSignatureExtractor.TryExtract(
                Parse("""{"keywords":{"results":[{"id":2,"name":"time travel"}]},"genres":[]}"""),
                out var keywords,
                out var genres);

            Assert.True(extracted);
            Assert.Contains("time travel", keywords);
            Assert.Empty(genres);
        }

        [Theory]
        [InlineData("{}")]
        [InlineData("{\"keywords\":null,\"genres\":null}")]
        [InlineData("{\"keywords\":\"invalid\",\"genres\":42}")]
        [InlineData("{\"keywords\":[{\"id\":1}],\"genres\":[\"bare-string\"]}")]
        [InlineData("{\"keywords\":[],\"genres\":[{\"name\":null}]}")]
        [InlineData("{\"keywords\":{\"keywords\":{}},\"genres\":[]}")]
        [InlineData("{\"keywords\":{\"results\":false},\"genres\":[]}")]
        [InlineData("{\"keywords\":[],\"genres\":{\"results\":[]}}")]
        [InlineData("[1,2,3]")]
        public void MissingOrMalformedContainers_FailClosed(string json)
        {
            var extracted = SeerrTagSignatureExtractor.TryExtract(Parse(json), out var keywords, out var genres);

            Assert.False(extracted);
            Assert.Empty(keywords);
            Assert.Empty(genres);
        }

        [Theory]
        [InlineData("{\"keywords\":[]}")]
        [InlineData("{\"genres\":[]}")]
        public void EitherMissingSignalContainer_FailsClosedAndPublishesNoPartialSignature(string json)
        {
            var extracted = SeerrTagSignatureExtractor.TryExtract(Parse(json), out var keywords, out var genres);

            Assert.False(extracted);
            Assert.Empty(keywords);
            Assert.Empty(genres);
        }

        [Fact]
        public void KnownEmptyArrays_AreDistinguishedFromMissingMetadata()
        {
            var extracted = SeerrTagSignatureExtractor.TryExtract(
                Parse("""{"keywords":[],"genres":[]}"""),
                out var keywords,
                out var genres);

            Assert.True(extracted);
            Assert.Empty(keywords);
            Assert.Empty(genres);
        }
    }
}
