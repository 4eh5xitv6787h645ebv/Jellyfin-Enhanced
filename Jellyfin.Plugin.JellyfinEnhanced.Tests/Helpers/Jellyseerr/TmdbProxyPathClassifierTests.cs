using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Helpers.Jellyseerr
{
    /// <summary>
    /// Pins the raw-TMDB proxy to a narrow neutral allowlist and deny-by-default
    /// handling for title enumeration, ambiguity, and compound responses.
    /// </summary>
    public sealed class TmdbProxyPathClassifierTests
    {
        [Theory]
        [InlineData("search/keyword")]
        [InlineData("search/keyword?query=space")]
        [InlineData("search/company")]
        [InlineData("genres/movie")]
        [InlineData("genres/tv?language=en")]
        [InlineData("genre/movie/list")]
        [InlineData("genre/tv/list?language=en")]
        [InlineData("company/213")]
        [InlineData("network/49")]
        public void RatingFreeMetadata_IsNeutral(string path)
            => Assert.Equal(TmdbProxyGate.Neutral, TmdbProxyPathClassifier.Classify(path).Gate);

        [Theory]
        [InlineData("")]
        [InlineData("discover/movie")]
        [InlineData("discover/tv")]
        [InlineData("search/multi")]
        [InlineData("search/movie")]
        [InlineData("search/tv")]
        [InlineData("search/person")]
        [InlineData("search/network")]
        [InlineData("trending/all")]
        [InlineData("movie/550/similar")]
        [InlineData("tv/1399/recommendations")]
        [InlineData("person/287/combined_credits")]
        [InlineData("collection/10")]
        [InlineData("company/not-a-number")]
        [InlineData("network/0")]
        [InlineData("company/213/images")]
        [InlineData("network/49/alternative_names")]
        [InlineData("genres/movie/extra")]
        [InlineData("configuration")]
        [InlineData("movie")]
        [InlineData("movie/0")]
        [InlineData("movie/-1")]
        [InlineData("movie/not-a-number")]
        [InlineData("some/future/path")]
        public void EnumeratingAmbiguousOrUnknownPath_IsRestricted(string path)
            => Assert.Equal(TmdbProxyGate.Restricted, TmdbProxyPathClassifier.Classify(path).Gate);

        [Theory]
        [InlineData("movie/550", "movie", 550)]
        [InlineData("movie/550?language=en", "movie", 550)]
        [InlineData("tv/1399", "tv", 1399)]
        [InlineData("tv/1399/season/1", "tv", 1399)]
        [InlineData("movie/550/watch/providers", "movie", 550)]
        [InlineData("movie/550/reviews", "movie", 550)]
        [InlineData("movie/550/release_dates", "movie", 550)]
        public void TitleDetailOrSubresource_CarriesParentGate(string path, string mediaType, int tmdbId)
        {
            var result = TmdbProxyPathClassifier.Classify(path);

            Assert.Equal(TmdbProxyGate.DetailGate, result.Gate);
            Assert.Equal(mediaType, result.MediaType);
            Assert.Equal(tmdbId, result.TmdbId);
        }

        [Theory]
        [InlineData("movie/550?append_to_response=similar,recommendations")]
        [InlineData("tv/1399?append_to_response=recommendations")]
        [InlineData("movie/550?language=en&append_to_response=videos")]
        [InlineData("movie/550?append%5Fto_response=similar")]
        [InlineData("movie/550?APPEND%5FTO_RESPONSE=recommendations")]
        [InlineData("movie/550?%61ppend_to_response=similar")]
        public void NonemptyAppendToResponse_IsRestricted(string path)
            => Assert.Equal(TmdbProxyGate.Restricted, TmdbProxyPathClassifier.Classify(path).Gate);

        [Theory]
        [InlineData("genres/../movie/550")]
        [InlineData("genres/%2e%2e/movie/550")]
        [InlineData("genres/%2E%2E/movie/550")]
        [InlineData("genres/./movie")]
        [InlineData("movie/550/%2e/videos")]
        [InlineData("search/%2e%2e/movie/550")]
        public void DotSegmentsAreRestricted(string path)
            => Assert.Equal(TmdbProxyGate.Restricted, TmdbProxyPathClassifier.Classify(path).Gate);
    }
}
