using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Helpers.Jellyseerr
{
    /// <summary>
    /// Verifies region selection and the movie/TV shapes produced by Seerr and
    /// TMDB's lightweight certification endpoints.
    /// </summary>
    public sealed class SeerrCertificationExtractorTests
    {
        private const string MovieUsAndGb = """
            {
              "releases": { "results": [
                { "iso_3166_1": "GB", "release_dates": [ { "type": 3, "certification": "15" } ] },
                { "iso_3166_1": "US", "release_dates": [
                  { "type": 1, "certification": "" },
                  { "type": 3, "certification": "PG-13" }
                ] }
              ] }
            }
            """;

        private static JsonElement Parse(string json)
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }

        [Fact]
        public void Movie_PrefersRequestedRegion()
        {
            var result = SeerrCertificationExtractor.Extract(Parse(MovieUsAndGb), "movie", "GB");

            Assert.Equal("15", result.Certification);
            Assert.Equal("GB", result.Iso);
        }

        [Fact]
        public void Movie_FallsBackToUsThenFirstRegion()
        {
            var us = SeerrCertificationExtractor.Extract(Parse(MovieUsAndGb), "movie", "FR");
            var first = SeerrCertificationExtractor.Extract(
                Parse("""{"releases":{"results":[{"iso_3166_1":"NZ","release_dates":[{"type":3,"certification":"M"}]}]}}"""),
                "movie",
                "AU");

            Assert.Equal("PG-13", us.Certification);
            Assert.Equal("US", us.Iso);
            Assert.Equal("M", first.Certification);
            Assert.Equal("NZ", first.Iso);
        }

        [Fact]
        public void Movie_PrefersTheatricalCertificationThenAnyNonblankCertification()
        {
            var theatrical = SeerrCertificationExtractor.Extract(Parse(MovieUsAndGb), "movie", "US");
            var fallback = SeerrCertificationExtractor.Extract(
                Parse("""{"releases":{"results":[{"iso_3166_1":"US","release_dates":[{"type":1,"certification":"R"}]}]}}"""),
                "movie",
                "US");

            Assert.Equal("PG-13", theatrical.Certification);
            Assert.Equal("R", fallback.Certification);
        }

        [Fact]
        public void Tv_UsesRequestedRegionAndUsFallback()
        {
            var detail = Parse("""
                {"contentRatings":{"results":[
                  {"iso_3166_1":"US","rating":"TV-14"},
                  {"iso_3166_1":"DE","rating":"16"}
                ]}}
                """);

            var de = SeerrCertificationExtractor.Extract(detail, "tv", "DE");
            var fallback = SeerrCertificationExtractor.Extract(detail, "tv", "JP");

            Assert.Equal("16", de.Certification);
            Assert.Equal("DE", de.Iso);
            Assert.Equal("TV-14", fallback.Certification);
            Assert.Equal("US", fallback.Iso);
        }

        [Fact]
        public void TmdbNativeShapes_AreAccepted()
        {
            var movie = SeerrCertificationExtractor.Extract(
                Parse("""{"results":[{"iso_3166_1":"US","release_dates":[{"type":3,"certification":"R"}]}]}"""),
                "movie",
                "US");
            var tv = SeerrCertificationExtractor.Extract(
                Parse("""{"results":[{"iso_3166_1":"US","rating":"TV-MA"}]}"""),
                "tv",
                "US");

            Assert.Equal("R", movie.Certification);
            Assert.Equal("TV-MA", tv.Certification);
        }

        [Theory]
        [InlineData("[]", "movie")]
        [InlineData("{}", "movie")]
        [InlineData("{}", "tv")]
        [InlineData("{\"releases\":{\"results\":\"invalid\"}}", "movie")]
        [InlineData("{\"contentRatings\":{\"results\":[{\"iso_3166_1\":42,\"rating\":false}]}}", "tv")]
        public void MissingOrMalformedCertification_ReturnsDefault(string json, string mediaType)
        {
            var result = SeerrCertificationExtractor.Extract(Parse(json), mediaType, "US");

            Assert.Null(result.Certification);
            Assert.Null(result.Iso);
        }

        [Fact]
        public void SelectedBlankRegion_IsUnratedWithoutCrossRegionSubstitution()
        {
            var detail = Parse("""
                {"releases":{"results":[
                  {"iso_3166_1":"AU","release_dates":[{"type":3,"certification":""}]},
                  {"iso_3166_1":"US","release_dates":[{"type":3,"certification":"R"}]}
                ]}}
                """);

            var result = SeerrCertificationExtractor.Extract(detail, "movie", "AU");

            Assert.Null(result.Certification);
            Assert.Null(result.Iso);
        }
    }
}
