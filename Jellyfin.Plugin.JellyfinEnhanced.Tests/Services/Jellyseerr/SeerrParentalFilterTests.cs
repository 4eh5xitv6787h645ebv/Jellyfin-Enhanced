using System.Net;
using System.Text.Json.Nodes;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Jellyseerr;
using Jellyfin.Plugin.JellyfinEnhanced.Tests.TestDoubles;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Globalization;
using MediaBrowser.Model.Users;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Services.Jellyseerr
{
    /// <summary>
    /// Pins the security boundary around the endpoint orchestration. Pure rating,
    /// tag, parser, certification, and raw-path decisions have separate suites.
    /// </summary>
    public sealed class SeerrParentalFilterTests
    {
        private static readonly Guid RestrictedUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        private static readonly Guid SecondUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        private static readonly Guid ThirdUserId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        [Fact]
        public async Task FeatureDisabledAdminAndUnrestrictedCallers_BypassWithoutLookup()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            harness.AddUser(SecondUserId, null, null);
            const string body = "{\"results\":[{\"id\":200,\"mediaType\":\"movie\"}]}";

            var admin = await harness.Filter.ApplyAsync(body, "/api/v1/search?query=x", Caller(RestrictedUserId, true));
            var unrestricted = await harness.Filter.ApplyAsync(body, "/api/v1/search?query=x", Caller(SecondUserId));
            harness.Configuration!.SeerrRespectParentalRatings = false;
            var disabled = await harness.Filter.ApplyAsync(body, "/api/v1/search?query=x", Caller(RestrictedUserId));

            AssertBypassed(admin, body);
            AssertBypassed(unrestricted, body);
            AssertBypassed(disabled, body);
            Assert.Equal(0, harness.Handler.RequestCount);
        }

        [Fact]
        public async Task UnrelatedUnratedPolicy_DoesNotActivateMovieOrTvFiltering()
        {
            var harness = new Harness();
            harness.AddUser(
                RestrictedUserId,
                null,
                0,
                new UserPolicy { BlockUnratedItems = new[] { UnratedItem.Music } });
            const string body = "{\"results\":[{\"id\":200,\"mediaType\":\"movie\",\"adult\":true}]}";

            var response = await harness.Filter.ApplyAsync(
                body,
                "/api/v1/search?query=x",
                Caller(RestrictedUserId));

            AssertBypassed(response, body);
            Assert.False(await harness.Filter.IsSeerrProxyPathBlockedAsync(
                "/api/v1/discover/future-surface",
                Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsTmdbProxyPathBlockedAsync(
                "discover/movie",
                Caller(RestrictedUserId)));
            Assert.Equal(0, harness.Handler.RequestCount);
        }

        [Fact]
        public async Task Search_FiltersMovieTvAdultAndKnownFor_ButKeepsNonTitlesAndOriginalInput()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            const string body = """
                {
                  "pageInfo":{"pages":4},"totalResults":6,"totalPages":4,
                  "results":[
                    {"id":100,"mediaType":"movie"},
                    {"id":200,"mediaType":"movie"},
                    {"id":200,"mediaType":"tv"},
                    {"id":100,"mediaType":"movie","adult":true},
                    {"id":5,"mediaType":"person","knownFor":[
                      {"id":100,"mediaType":"movie"},{"id":200,"mediaType":"movie"}
                    ]},
                    {"id":9,"mediaType":"collection"}
                  ]
                }
                """;

            var filtered = await harness.Filter.ApplyAsync(body, "/api/v1/search?query=x", Caller(RestrictedUserId));
            var root = SuccessfulObject(filtered);

            Assert.Equal(new[] { 100, 5, 9 }, Ids(root, "results"));
            var person = Assert.IsType<JsonObject>(Assert.IsType<JsonArray>(root["results"])[1]);
            Assert.Equal(new[] { 100 }, Ids(person, "knownFor"));
            Assert.Equal(6, root["totalResults"]!.GetValue<int>());
            var marker = Assert.IsType<JsonObject>(root["jellyfinEnhancedPagination"]);
            Assert.Equal("upstream-total-upper-bound", marker["contract"]!.GetValue<string>());
            Assert.Equal(3, marker["removedFromPage"]!.GetValue<int>());

            var lookupCount = harness.Handler.RequestCount;
            var filteredAgain = await harness.Filter.ApplyAsync(
                body,
                "/api/v1/search?query=x",
                Caller(RestrictedUserId));
            Assert.Equal(filtered.Body, filteredAgain.Body);
            Assert.Equal(lookupCount, harness.Handler.RequestCount);

            var admin = await harness.Filter.ApplyAsync(body, "/api/v1/search?query=x", Caller(RestrictedUserId, true));
            AssertBypassed(admin, body);
            Assert.DoesNotContain("jellyfinEnhancedPagination", body, StringComparison.Ordinal);
            Assert.All(harness.Handler.Requests, request =>
            {
                Assert.Null(request.ApiUser);
                Assert.Equal("test-key", request.ApiKey);
            });
        }

        [Fact]
        public async Task DirectDetailAndSubresources_GateMovieAndTvParents()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);

            var allowedMovie = await harness.Filter.ApplyAsync(
                MovieDetail(100, "PG-13"), "/api/v1/movie/100", Caller(RestrictedUserId));
            var blockedMovie = await harness.Filter.ApplyAsync(
                MovieDetail(200, "R"), "/api/v1/movie/200", Caller(RestrictedUserId));
            var blockedTv = await harness.Filter.ApplyAsync(
                TvDetail(200, "TV-MA"), "/api/v1/tv/200", Caller(RestrictedUserId));
            var movieSubresource = await harness.Filter.ApplyAsync(
                "{\"rating\":90}", "/api/v1/movie/200/ratingscombined", Caller(RestrictedUserId));
            var tvSeason = await harness.Filter.ApplyAsync(
                "{\"episodes\":[]}", "/api/v1/tv/200/season/1", Caller(RestrictedUserId));

            Assert.False(allowedMovie.Block);
            Assert.True(allowedMovie.Succeeded);
            Assert.True(blockedMovie.Block);
            Assert.True(blockedTv.Block);
            Assert.True(movieSubresource.Block);
            Assert.True(tvSeason.Block);
        }

        [Fact]
        public async Task RelatedList_GatesParentThenFiltersChildren()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            const string list = "{\"results\":[{\"id\":100},{\"id\":200}]}";

            var deniedParent = await harness.Filter.ApplyAsync(
                list, "/api/v1/movie/200/recommendations", Caller(RestrictedUserId));
            var allowedParent = await harness.Filter.ApplyAsync(
                list, "/api/v1/movie/100/similar", Caller(RestrictedUserId));

            Assert.True(deniedParent.Block);
            Assert.Equal(new[] { 100 }, Ids(SuccessfulObject(allowedParent), "results"));
        }

        [Fact]
        public async Task RestrictedSeerrProxy_PreflightsTitlePathsBeforeUpstreamResponse()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);

            Assert.True(await harness.Filter.IsSeerrProxyPathBlockedAsync(
                "/api/v1/movie/200/similar?page=1",
                Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsSeerrProxyPathBlockedAsync(
                "/api/v1/tv/200/season/1",
                Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsSeerrProxyPathBlockedAsync(
                "/api/v1/movie/100/recommendations?page=1",
                Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsSeerrProxyPathBlockedAsync(
                "/api/v1/discover/future-surface",
                Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsSeerrProxyPathBlockedAsync(
                "/api/v1/search?query=x",
                Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsSeerrProxyPathBlockedAsync(
                "/api/v1/movie/200/similar?page=1",
                Caller(RestrictedUserId, true)));
        }

        [Fact]
        public async Task RequestAndIssueListsAndDetails_UseNestedMediaIdentity()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            const string list = """
                {"results":[
                  {"id":1,"media":{"tmdbId":100,"mediaType":"movie"}},
                  {"id":2,"media":{"tmdbId":200,"mediaType":"movie"}},
                  {"id":3}
                ]}
                """;
            const string allowedDetail = "{\"id\":1,\"media\":{\"tmdbId\":100,\"mediaType\":\"movie\"}}";
            const string blockedDetail = "{\"id\":2,\"media\":{\"tmdbId\":200,\"mediaType\":\"movie\"}}";

            var requests = await harness.Filter.ApplyAsync(list, "/api/v1/request?take=100", Caller(RestrictedUserId));
            var issues = await harness.Filter.ApplyAsync(list, "/api/v1/issue?take=100", Caller(RestrictedUserId));
            var requestDetail = await harness.Filter.ApplyAsync(allowedDetail, "/api/v1/request/1", Caller(RestrictedUserId));
            var issueDetail = await harness.Filter.ApplyAsync(blockedDetail, "/api/v1/issue/2", Caller(RestrictedUserId));
            var mismatchedDetail = await harness.Filter.ApplyAsync(allowedDetail, "/api/v1/request/2", Caller(RestrictedUserId));

            Assert.Equal(new[] { 1 }, Ids(SuccessfulObject(requests), "results"));
            Assert.Equal(new[] { 1 }, Ids(SuccessfulObject(issues), "results"));
            Assert.False(requestDetail.Block);
            Assert.True(requestDetail.Succeeded);
            Assert.True(issueDetail.Block);
            Assert.True(mismatchedDetail.Block);
        }

        [Fact]
        public async Task RequestEndpoint_AmbiguousListAndDetailShapeFailsClosed()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            const string ambiguous =
                "{\"results\":[],\"media\":{\"tmdbId\":100,\"mediaType\":\"movie\"}}";

            var result = await harness.Filter.ApplyAsync(
                ambiguous,
                "/api/v1/request",
                Caller(RestrictedUserId));

            Assert.False(result.Succeeded);
            Assert.False(result.Block);
            Assert.Empty(result.Body);
        }

        [Fact]
        public async Task WatchlistCollectionAndCredits_FilterTheirNativeShapes()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            const string watchlist = "{\"results\":[{\"tmdbId\":100,\"mediaType\":\"movie\"},{\"tmdbId\":200,\"mediaType\":\"tv\"}]}";
            const string collection = "{\"parts\":[{\"id\":100},{\"id\":200}]}";
            const string credits = "{\"cast\":[{\"id\":100,\"mediaType\":\"movie\"},{\"id\":200,\"mediaType\":\"movie\"}],\"crew\":[{\"id\":200,\"mediaType\":\"tv\"}]}";

            var watchlistResult = await harness.Filter.ApplyAsync(
                watchlist, "/api/v1/discover/watchlist?page=1", Caller(RestrictedUserId));
            var collectionResult = await harness.Filter.ApplyAsync(
                collection, "/api/v1/collection/9", Caller(RestrictedUserId));
            var creditsResult = await harness.Filter.ApplyAsync(
                credits, "/api/v1/person/9/combined_credits", Caller(RestrictedUserId));

            Assert.Equal(new[] { 100 }, Ids(SuccessfulObject(watchlistResult), "results", "tmdbId"));
            Assert.Equal(new[] { 100 }, Ids(SuccessfulObject(collectionResult), "parts"));
            var creditsRoot = SuccessfulObject(creditsResult);
            Assert.Equal(new[] { 100 }, Ids(creditsRoot, "cast"));
            Assert.Empty(Ids(creditsRoot, "crew"));
        }

        [Fact]
        public async Task GenreSliderMetadata_IsPassedThroughAsNonTitleData()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            const string body = "[{\"id\":28,\"name\":\"Action\"},{\"id\":35,\"name\":\"Comedy\"}]";

            var result = await harness.Filter.ApplyAsync(
                body,
                "/api/v1/discover/genreslider/movie",
                Caller(RestrictedUserId));

            AssertBypassed(result, body);
            Assert.Equal(0, harness.Handler.RequestCount);
        }

        [Theory]
        [InlineData("not-json")]
        [InlineData("[]")]
        [InlineData("{}")]
        [InlineData("{\"results\":{}}")]
        public async Task MalformedProtectedListShape_ReturnsNonAuthoritativeFailure(string body)
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);

            var result = await harness.Filter.ApplyAsync(body, "/api/v1/search?query=x", Caller(RestrictedUserId));

            Assert.False(result.Succeeded);
            Assert.False(result.Block);
            Assert.Empty(result.Body);
        }

        [Fact]
        public async Task MalformedRowsAreRemovedWithoutDiscardingVerifiedRows()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            const string body = "{\"results\":[null,\"bad\",{\"id\":0,\"mediaType\":\"movie\"},{\"id\":100,\"mediaType\":\"movie\"}]}";

            var result = await harness.Filter.ApplyAsync(body, "/api/v1/search?query=x", Caller(RestrictedUserId));

            Assert.Equal(new[] { 100 }, Ids(SuccessfulObject(result), "results"));
        }

        [Fact]
        public async Task ExplicitMediaTypeThatContradictsEndpointHintIsRemoved()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            const string body =
                "{\"results\":[{\"id\":100,\"mediaType\":\"movie\"},{\"id\":100,\"mediaType\":\"tv\"}]}";

            var result = await harness.Filter.ApplyAsync(
                body,
                "/api/v1/discover/movies?page=1",
                Caller(RestrictedUserId));

            Assert.Equal(new[] { 100 }, Ids(SuccessfulObject(result), "results"));
        }

        [Fact]
        public async Task UnratedPolicy_DistinguishesMoviesAndSeriesAndIsReadAgainPerCall()
        {
            var harness = new Harness();
            var entry = harness.AddUser(
                RestrictedUserId,
                null,
                null,
                new UserPolicy { BlockUnratedItems = new[] { UnratedItem.Movie } });

            Assert.True(await harness.Filter.IsBlockedAsync("movie", 300, Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsBlockedAsync("tv", 300, Caller(RestrictedUserId)));

            entry.Policy = new UserPolicy { BlockUnratedItems = new[] { UnratedItem.Series } };
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 300, Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("tv", 300, Caller(RestrictedUserId)));
        }

        [Fact]
        public async Task TagPolicies_AreIsolatedPerCallerOverSharedMetadata()
        {
            var harness = new Harness();
            harness.Configuration!.SeerrRespectBlockedTags = true;
            harness.AddUser(RestrictedUserId, null, null, Policy(blocked: new[] { "horror" }));
            harness.AddUser(SecondUserId, null, null, Policy(allowed: new[] { "zombie" }));
            harness.AddUser(ThirdUserId, null, null, Policy(allowed: new[] { "family" }));

            Assert.True(await harness.Filter.IsBlockedAsync("movie", 400, Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 400, Caller(SecondUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("movie", 400, Caller(ThirdUserId)));
            Assert.Equal(1, harness.Handler.RequestCount);

            harness.Configuration.SeerrRespectBlockedTags = false;
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 400, Caller(RestrictedUserId)));
            Assert.Equal(1, harness.Handler.RequestCount);
        }

        [Fact]
        public async Task MetadataCache_IsPolicyNeutralAndPolicyChangesApplyImmediately()
        {
            var harness = new Harness();
            var restricted = harness.AddUser(RestrictedUserId, 13, 0);
            harness.AddUser(SecondUserId, 17, 0);

            Assert.True(await harness.Filter.IsBlockedAsync("movie", 200, Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 200, Caller(SecondUserId)));
            Assert.Equal(1, harness.Handler.RequestCount);

            restricted.User.MaxParentalRatingScore = 17;
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 200, Caller(RestrictedUserId)));
            Assert.Equal(1, harness.Handler.RequestCount);
        }

        [Fact]
        public async Task ClearCacheAndConfigurationInvalidation_ForceFreshLookups()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);

            Assert.False(await harness.Filter.IsBlockedAsync("movie", 100, Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 100, Caller(RestrictedUserId)));
            Assert.Equal(1, harness.Handler.RequestCount);

            harness.Filter.ClearCache();
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 100, Caller(RestrictedUserId)));
            Assert.Equal(2, harness.Handler.RequestCount);

            harness.Filter.InvalidateConfiguration();
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 100, Caller(RestrictedUserId)));
            Assert.Equal(3, harness.Handler.RequestCount);
        }

        [Fact]
        public async Task ConfigurationRegionChange_AutomaticallyInvalidatesMetadataGeneration()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            harness.Details["/api/v1/movie/500"] = MultiRegionMovieDetail(500);

            Assert.True(await harness.Filter.IsBlockedAsync("movie", 500, Caller(RestrictedUserId)));
            harness.Configuration!.DEFAULT_REGION = "AU";
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 500, Caller(RestrictedUserId)));
            Assert.Equal(2, harness.Handler.RequestCount);
        }

        [Fact]
        public async Task LookupAndPolicyFailures_FailClosedForMutationsAndProtectedResponses()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);

            Assert.True(await harness.Filter.IsBlockedAsync("movie", 999, Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("person", 100, Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("movie", 0, Caller(RestrictedUserId)));

            harness.UserLookupThrows = true;
            Assert.True(await harness.Filter.IsBlockedAsync("movie", 100, Caller(RestrictedUserId)));
            var response = await harness.Filter.ApplyAsync(
                "{\"results\":[]}", "/api/v1/search?query=x", Caller(RestrictedUserId));
            Assert.False(response.Succeeded);
            Assert.Empty(response.Body);
        }

        [Fact]
        public async Task MetadataAndDetailBodiesMustBindExactlyToRequestedTmdbId()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            harness.Details["/api/v1/movie/800"] = MovieDetail(100, "PG");
            harness.Details["/api/v1/movie/801"] =
                MovieDetail(801, "PG").Replace("\"id\":801", "\"id\":801,\"id\":801", StringComparison.Ordinal);

            Assert.True(await harness.Filter.IsBlockedAsync("movie", 800, Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("movie", 801, Caller(RestrictedUserId)));

            var mismatchedDetail = await harness.Filter.ApplyAsync(
                MovieDetail(100, "PG"),
                "/api/v1/movie/800",
                Caller(RestrictedUserId));
            Assert.True(mismatchedDetail.Block);
        }

        [Fact]
        public async Task TmdbMovieLookupIncludesAndEnforcesAuthoritativeAdultFlag()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            harness.Configuration!.TMDB_API_KEY = "tmdb-test-key";
            harness.Responder = (request, _) =>
            {
                var id = request.RequestUri?.AbsolutePath.EndsWith("/901", StringComparison.Ordinal) == true
                    ? 901
                    : 900;
                var adultProperty = id == 900 ? "\"adult\":true," : string.Empty;
                var body = string.Concat(
                    "{\"id\":",
                    id,
                    ",",
                    adultProperty,
                    "\"release_dates\":{\"results\":[{\"iso_3166_1\":\"US\",\"release_dates\":[{\"type\":3,\"certification\":\"PG\"}]}]}}");
                return Task.FromResult(RecordingHttpMessageHandler.Json(body));
            };

            Assert.True(await harness.Filter.IsBlockedAsync("movie", 900, Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("movie", 901, Caller(RestrictedUserId)));

            Assert.All(harness.Handler.Requests, request =>
            {
                Assert.StartsWith("/3/movie/", request.RequestUri!.AbsolutePath, StringComparison.Ordinal);
                Assert.Contains("append_to_response=release_dates", request.RequestUri.Query, StringComparison.Ordinal);
            });
        }

        [Fact]
        public async Task MalformedCertificationContainerIsNotTreatedAsAuthoritativeUnrated()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            harness.Details["/api/v1/movie/910"] = "{\"id\":910,\"adult\":false}";
            harness.Details["/api/v1/tv/910"] =
                "{\"id\":910,\"adult\":false,\"contentRatings\":{}}";
            harness.Details["/api/v1/movie/911"] =
                "{\"id\":911,\"adult\":false,\"releases\":{\"results\":[]}}";
            harness.Details["/api/v1/movie/912"] =
                "{\"id\":912,\"adult\":false,\"releases\":{\"results\":[{\"iso_3166_1\":\"US\"}]}}";
            harness.Details["/api/v1/tv/912"] =
                "{\"id\":912,\"adult\":false,\"contentRatings\":{\"results\":[{\"iso_3166_1\":\"US\"}]}}";

            Assert.True(await harness.Filter.IsBlockedAsync("movie", 910, Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("tv", 910, Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsBlockedAsync("movie", 911, Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("movie", 912, Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsBlockedAsync("tv", 912, Caller(RestrictedUserId)));
        }

        [Fact]
        public async Task RestrictedTmdbProxy_DeniesUnknownPathsAndGatesDetailWhileAdminBypasses()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);

            Assert.False(await harness.Filter.IsTmdbProxyPathBlockedAsync("company/213", Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsTmdbProxyPathBlockedAsync("discover/movie", Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsTmdbProxyPathBlockedAsync("movie/100", Caller(RestrictedUserId)));
            Assert.True(await harness.Filter.IsTmdbProxyPathBlockedAsync("movie/200", Caller(RestrictedUserId)));
            Assert.False(await harness.Filter.IsTmdbProxyPathBlockedAsync("discover/movie", Caller(RestrictedUserId, true)));
        }

        [Fact]
        public async Task ConcurrentColdLookups_AreCoalescedIntoOneUpstreamRequest()
        {
            var harness = new Harness();
            harness.AddUser(RestrictedUserId, 13, 0);
            var started = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var release = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var requestCount = 0;
            harness.Responder = async (_, cancellationToken) =>
            {
                Interlocked.Increment(ref requestCount);
                started.TrySetResult(true);
                await release.Task.WaitAsync(cancellationToken);
                return RecordingHttpMessageHandler.Json(MovieDetail(700, "PG-13"));
            };

            var calls = Enumerable.Range(0, 24)
                .Select(_ => harness.Filter.IsBlockedAsync("movie", 700, Caller(RestrictedUserId)))
                .ToArray();
            await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            await Task.Delay(75);

            Assert.Equal(1, Volatile.Read(ref requestCount));
            release.TrySetResult(true);
            var decisions = await Task.WhenAll(calls).WaitAsync(TimeSpan.FromSeconds(5));
            Assert.All(decisions, Assert.False);
            Assert.Equal(1, harness.Handler.RequestCount);
        }

        private static SeerrCaller Caller(Guid userId, bool admin = false)
            => new(userId.ToString(), admin);

        private static void AssertBypassed(SeerrParentalResult result, string body)
        {
            Assert.True(result.Succeeded);
            Assert.False(result.Block);
            Assert.Equal(body, result.Body);
        }

        private static JsonObject SuccessfulObject(SeerrParentalResult result)
        {
            Assert.True(result.Succeeded);
            Assert.False(result.Block);
            return Assert.IsType<JsonObject>(JsonNode.Parse(result.Body));
        }

        private static int[] Ids(JsonObject root, string container, string field = "id")
        {
            var array = Assert.IsType<JsonArray>(root[container]);
            var values = new List<int>(array.Count);
            foreach (var node in array)
            {
                var item = Assert.IsType<JsonObject>(node);
                values.Add(item[field]!.GetValue<int>());
            }

            return values.ToArray();
        }

        private static UserPolicy Policy(string[]? blocked = null, string[]? allowed = null)
            => new()
            {
                BlockUnratedItems = Array.Empty<UnratedItem>(),
                BlockedTags = blocked ?? Array.Empty<string>(),
                AllowedTags = allowed ?? Array.Empty<string>(),
            };

        private static string MovieDetail(
            int id,
            string certification,
            string keyword = "family",
            string genre = "comedy")
            => $$"""
                {
                  "id":{{id}},"adult":false,
                  "releases":{"results":[{"iso_3166_1":"US","release_dates":[{"type":3,"certification":"{{certification}}"}]}]},
                  "keywords":[{"name":"{{keyword}}"}],"genres":[{"name":"{{genre}}"}]
                }
                """;

        private static string TvDetail(int id, string certification)
            => $$"""
                {
                  "id":{{id}},"adult":false,
                  "contentRatings":{"results":[{"iso_3166_1":"US","rating":"{{certification}}"}]},
                  "keywords":[],"genres":[]
                }
                """;

        private static string MultiRegionMovieDetail(int id)
            => $$"""
                {
                  "id":{{id}},"adult":false,
                  "releases":{"results":[
                    {"iso_3166_1":"US","release_dates":[{"type":3,"certification":"R"}]},
                    {"iso_3166_1":"AU","release_dates":[{"type":3,"certification":"PG"}]}
                  ]},
                  "keywords":[],"genres":[]
                }
                """;

        private sealed class Harness
        {
            private static readonly IReadOnlyDictionary<string, ParentalRatingScore> RatingScores =
                new Dictionary<string, ParentalRatingScore>(StringComparer.OrdinalIgnoreCase)
                {
                    ["G"] = new ParentalRatingScore(0, 0),
                    ["PG"] = new ParentalRatingScore(10, 0),
                    ["TV-PG"] = new ParentalRatingScore(10, 0),
                    ["PG-13"] = new ParentalRatingScore(13, 0),
                    ["TV-14"] = new ParentalRatingScore(14, 0),
                    ["R"] = new ParentalRatingScore(17, 0),
                    ["TV-MA"] = new ParentalRatingScore(17, 1),
                };

            private readonly Dictionary<Guid, UserEntry> _users = new();

            internal Harness()
            {
                Configuration = new PluginConfiguration
                {
                    JellyseerrEnabled = true,
                    JellyseerrUrls = "http://seerr.test",
                    JellyseerrApiKey = "test-key",
                    TMDB_API_KEY = string.Empty,
                    DEFAULT_REGION = "US",
                    SeerrRespectParentalRatings = true,
                    SeerrRespectBlockedTags = false,
                    SeerrParentalRatingCacheTtlMinutes = 1440,
                };
                Details["/api/v1/movie/100"] = MovieDetail(100, "PG-13");
                Details["/api/v1/movie/200"] = MovieDetail(200, "R");
                Details["/api/v1/movie/300"] = MovieDetail(300, string.Empty);
                Details["/api/v1/movie/400"] = MovieDetail(400, "PG-13", "zombie", "horror");
                Details["/api/v1/tv/100"] = TvDetail(100, "TV-PG");
                Details["/api/v1/tv/200"] = TvDetail(200, "TV-MA");
                Details["/api/v1/tv/300"] = TvDetail(300, string.Empty);

                Handler = new RecordingHttpMessageHandler(RespondAsync);
                var userManager = InterfaceProxy.Create<IUserManager>(DispatchUserManager);
                var localization = InterfaceProxy.Create<ILocalizationManager>(DispatchLocalization);
                Filter = new SeerrParentalFilter(
                    new RecordingHttpClientFactory(Handler),
                    TestPluginLogger.Create(),
                    userManager,
                    localization,
                    () => Configuration);
            }

            internal PluginConfiguration? Configuration { get; set; }

            internal Dictionary<string, string> Details { get; } = new(StringComparer.Ordinal);

            internal RecordingHttpMessageHandler Handler { get; }

            internal SeerrParentalFilter Filter { get; }

            internal bool UserLookupThrows { get; set; }

            internal Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>>? Responder { get; set; }

            internal UserEntry AddUser(
                Guid id,
                int? maxScore,
                int? maxSubScore,
                UserPolicy? policy = null)
            {
                var user = new User($"user-{id:N}", "Provider", "PasswordProvider")
                {
                    MaxParentalRatingScore = maxScore,
                    MaxParentalRatingSubScore = maxSubScore,
                };
                var entry = new UserEntry(user, policy ?? Policy());
                _users[id] = entry;
                return entry;
            }

            private object? DispatchUserManager(System.Reflection.MethodInfo method, object?[]? arguments)
            {
                if (UserLookupThrows && (method.Name == "GetUserById" || method.Name == "GetUserDto"))
                {
                    throw new InvalidOperationException("simulated policy lookup failure");
                }

                if (method.Name == "GetUserById"
                    && arguments is { Length: > 0 }
                    && arguments[0] is Guid id)
                {
                    return _users.TryGetValue(id, out var entry) ? entry.User : null;
                }

                if (method.Name == "GetUserDto"
                    && arguments is { Length: > 0 }
                    && arguments[0] is User user)
                {
                    var entry = _users.Values.SingleOrDefault(candidate => ReferenceEquals(candidate.User, user));
                    return entry is null ? null : new UserDto { Policy = entry.Policy };
                }

                return InterfaceProxy.DefaultValue(method.ReturnType);
            }

            private static object? DispatchLocalization(
                System.Reflection.MethodInfo method,
                object?[]? arguments)
            {
                if (method.Name == "GetRatingScore"
                    && arguments is { Length: > 0 }
                    && arguments[0] is string rating)
                {
                    ParentalRatingScore? result = RatingScores.TryGetValue(rating, out var score)
                        ? score
                        : null;
                    return result;
                }

                return InterfaceProxy.DefaultValue(method.ReturnType);
            }

            private Task<HttpResponseMessage> RespondAsync(
                HttpRequestMessage request,
                CancellationToken cancellationToken)
            {
                if (Responder is not null)
                {
                    return Responder(request, cancellationToken);
                }

                if (request.RequestUri is not null
                    && Details.TryGetValue(request.RequestUri.AbsolutePath, out var detail))
                {
                    return Task.FromResult(RecordingHttpMessageHandler.Json(detail));
                }

                return Task.FromResult(RecordingHttpMessageHandler.Json("{}", HttpStatusCode.NotFound));
            }
        }

        private sealed class UserEntry(User user, UserPolicy policy)
        {
            internal User User { get; } = user;

            internal UserPolicy Policy { get; set; } = policy;
        }
    }
}
