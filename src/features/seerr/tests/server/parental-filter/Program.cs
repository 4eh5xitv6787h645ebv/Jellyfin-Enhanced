using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyfinEnhanced;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Globalization;
using Access = Jellyfin.Plugin.JellyfinEnhanced.Services.SeerrParentalFilter.TmdbAccess;

var tests = new (string Name, Func<Task> Run)[]
{
    ("passthrough allowlist and path traversal protection", Classifier),
    ("unrestricted users preserve bytes and perform no metadata calls", Unrestricted),
    ("detail rejection and regional rating semantics", Details),
    ("lists, nested requests, knownFor and collection response shapes", Lists),
    ("tag rules fail closed without verified keyword data", Tags),
    ("failed tag upgrades preserve rating-only cache entries", TagUpgrade),
    ("positive and negative cache entries suppress duplicate lookups", Cache),
    ("concurrent requests coalesce and cancellation does not cancel shared fetch", Concurrent),
    ("list cancellation drops queued work while active fetches warm cache", CancelLists),
    ("TMDB fallback and Seerr failover omit per-user credentials", Failover),
    ("parent title gates related lists, seasons and issues", ParentGates),
};
foreach (var (name, run) in tests)
{
    await run();
    Console.WriteLine($"PASS {name}");
}
Console.WriteLine($"{tests.Length} Seerr parental regression scenarios passed.");

static Task Classifier()
{
    foreach (var (path, expected) in new (string?, Access)[]
    {
        (null, Access.Deny), ("", Access.Deny), ("/", Access.Deny),
        ("genre/movie/list", Access.Allow), ("configuration", Access.Allow),
        ("company/1", Access.Allow), ("network/2", Access.Allow),
        ("search/company?query=abc", Access.Allow), ("search/keyword", Access.Allow),
        ("search/person", Access.Deny), ("discover/movie", Access.Deny),
        ("movie/1", Access.GateTitle), ("TV/2/season/1/episode/3", Access.GateTitle),
        ("tv/2/content_ratings", Access.GateTitle), ("movie/1/release_dates", Access.GateTitle),
        ("movie/1/watch/providers", Access.Allow), ("movie/1/reviews", Access.Allow),
        ("movie/1/similar", Access.Deny), ("movie/1/recommendations", Access.Deny),
        ("movie/1?append_to_response=similar", Access.Deny),
        ("movie/1?APPEND_TO_RESPONSE=keywords", Access.Deny),
        ("movie/1/../2", Access.Deny), ("movie/%31", Access.Deny),
        ("company/1/movies", Access.Deny), ("movie/no-id", Access.Deny)
    })
        Equal(expected, SeerrParentalFilter.ClassifyTmdbPassthrough(path, out _, out _), path ?? "null path");
    Check(SeerrParentalFilter.TryParseTmdbTitlePath("/TV/12/season/2?q=x", out var type, out var id), "parse title");
    Equal("tv", type, "normalized type"); Equal(12, id, "parsed id");
    return Task.CompletedTask;
}

static async Task Unrestricted()
{
    var f = new Fixture(new TestUser());
    const string body = "{ \"results\": [ {\"id\": 1,\"mediaType\":\"movie\"} ] }";
    Equal(body, (await f.Filter.ApplyAsync(body, "/api/v1/search", f.Id)).Body, "unrestricted bytes");
    Equal(false, await f.Filter.IsBlockedAsync("movie", 1, f.Id), "unrestricted single title");
    Equal(false, await f.Filter.IsBlockedAsync("movie", 1, "invalid"), "unknown user");
    Equal(0, f.Calls.Count, "no network");
}

static async Task Details()
{
    var f = new Fixture();
    Equal(false, (await f.Filter.ApplyAsync(Detail(1, "PG"), "/api/v1/movie/1", f.Id)).Block, "PG allowed");
    Equal(true, (await f.Filter.ApplyAsync(Detail(2, "R"), "/api/v1/movie/2", f.Id)).Block, "R denied");
    Equal(true, (await f.Filter.ApplyAsync("invalid json", "/api/v1/movie/3", f.Id)).Block, "malformed detail");
    Equal(true, (await f.Filter.ApplyAsync("{\"adult\":true}", "/api/v1/movie/4", f.Id)).Block, "adult detail");
    f.User.BlockUnrated = [UnratedItem.Movie];
    Equal(true, (await f.Filter.ApplyAsync(Detail(5, "PG", country: "GB"), "/api/v1/movie/5", f.Id)).Block, "foreign rating not used");
    Equal(false, (await f.Filter.ApplyAsync("{}", "/api/v1/tv/6", f.Id)).Block, "TV unrated preference independent");
    f.User.MaxParentalRatingSubScore = 0;
    Equal(true, (await f.Filter.ApplyAsync(Detail(7, "PG-SUB"), "/api/v1/movie/7", f.Id)).Block, "independent subscore ceiling");
    Equal(0, f.Calls.Count, "detail scoring requires no network");
}

static async Task Lists()
{
    var f = new Fixture();
    await f.Seed(1, "PG"); await f.Seed(2, "R");
    const string source = "{\"results\":[{\"id\":1,\"mediaType\":\"movie\",\"title\":\"A&B <ok>\"},{\"id\":2,\"mediaType\":\"movie\"},{\"id\":3,\"mediaType\":\"person\",\"knownFor\":[{\"id\":1,\"mediaType\":\"movie\"},{\"id\":2,\"mediaType\":\"movie\"},{\"id\":999}]},{\"mediaType\":\"alien\"}]}";
    var result = await f.Filter.ApplyAsync(source, "/api/v1/search?query=x", f.Id);
    Equal(false, result.Block, "list response allowed"); Equal(false, result.RetryLater, "cache complete");
    var rows = JsonNode.Parse(result.Body)!["results"]!.AsArray();
    Equal(2, rows.Count, "blocked and unknown rows removed");
    Equal(1, rows[1]!["knownFor"]!.AsArray().Count, "nested knownFor filtered");
    Check(result.Body.Contains("A&B <ok>"), "JSON relaxed encoding preserved");
    foreach (var (path, property, body, expected) in new[]
    {
        ("/api/v1/request", "results", "{\"results\":[{\"media\":{\"tmdbId\":1,\"mediaType\":\"movie\"}},{\"media\":{\"tmdbId\":2,\"mediaType\":\"movie\"}},{\"media\":null}]}", 2),
        ("/api/v1/discover/watchlist", "results", "{\"results\":[{\"tmdbId\":\"1\",\"mediaType\":\"movie\"},{\"tmdbId\":2,\"mediaType\":\"movie\"}]}", 1),
        ("/api/v1/collection/5", "parts", "{\"parts\":[{\"id\":1},{\"id\":2}]}", 1),
        ("/api/v1/person/5/combined_credits", "cast", "{\"cast\":[{\"id\":1,\"mediaType\":\"movie\"},{\"id\":2,\"mediaType\":\"movie\"}],\"crew\":[{\"id\":2,\"mediaType\":\"movie\"}]}", 1)
    })
    {
        var filtered = await f.Filter.ApplyAsync(body, path, f.Id);
        Equal(expected, JsonNode.Parse(filtered.Body)![property]!.AsArray().Count, path);
        if (property == "cast") Equal(0, JsonNode.Parse(filtered.Body)!["crew"]!.AsArray().Count, "crew filtered");
    }
    const string unchanged = "{ \"results\": [{\"id\":1}] }";
    Equal(unchanged, (await f.Filter.ApplyAsync(unchanged, "/api/v1/discover/movies", f.Id)).Body, "unchanged bytes");
    Equal(0, f.Calls.Count, "seeded list reads cache");
}

static async Task Tags()
{
    var f = new Fixture(); f.User.BlockedTags = ["violence"];
    Equal(true, (await f.Filter.ApplyAsync(Detail(1, "PG"), "/api/v1/movie/1", f.Id)).Block, "unknown tags fail closed");
    Equal(false, (await f.Filter.ApplyAsync(Detail(1, "PG", "[]"), "/api/v1/movie/1", f.Id)).Block, "verified empty tags allowed");
    Equal(true, (await f.Filter.ApplyAsync(Detail(2, "PG", "[{\"name\":\"VIOLENCE\"}]"), "/api/v1/movie/2", f.Id)).Block, "tag match case insensitive");
    f.User.BlockedTags = []; f.User.AllowedTags = ["family"];
    Equal(true, (await f.Filter.ApplyAsync(Detail(3, "PG", "[]"), "/api/v1/movie/3", f.Id)).Block, "allowlist needs match");
}

static async Task TagUpgrade()
{
    var f = new Fixture(); await f.Seed(1, "PG");
    f.User.BlockedTags = ["violence"];
    f.Handler = (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
    Equal(true, await f.Filter.IsBlockedAsync("movie", 1, f.Id), "failed upgrade blocked");
    Equal(true, await f.Filter.IsBlockedAsync("movie", 1, f.Id), "upgrade failure negative cached");
    Equal(1, f.Calls.Count, "tag failure only fetches Seerr once");
    f.User.BlockedTags = [];
    Equal(false, await f.Filter.IsBlockedAsync("movie", 1, f.Id), "good rating retained");
    Equal(1, f.Calls.Count, "rating retained without refetch");
}

static async Task Cache()
{
    var f = new Fixture();
    f.Handler = (_, _) => Task.FromResult(Json(Detail(1, "PG")));
    Equal(false, await f.Filter.IsBlockedAsync("movie", 1, f.Id), "successful fetch");
    Equal(false, await f.Filter.IsBlockedAsync("movie", 1, f.Id), "positive cache");
    Equal(1, f.Calls.Count, "one fetch");
    f.Handler = (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
    Equal(true, await f.Filter.IsBlockedAsync("movie", 2, f.Id), "failed fetch closed");
    Equal(true, await f.Filter.IsBlockedAsync("movie", 2, f.Id), "negative cache");
    Equal(3, f.Calls.Count, "only TMDB plus Seerr fallback on first miss");
}

static async Task Concurrent()
{
    var f = new Fixture();
    var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    f.Handler = async (_, token) => { started.TrySetResult(); await release.Task.WaitAsync(token); return Json(Detail(1, "PG")); };
    using var abort = new CancellationTokenSource();
    var first = f.Filter.IsBlockedAsync("movie", 1, f.Id, abort.Token);
    await started.Task.WaitAsync(TimeSpan.FromSeconds(2));
    var second = f.Filter.IsBlockedAsync("movie", 1, f.Id);
    abort.Cancel();
    Equal(true, await first, "aborted single-title caller fails closed");
    release.SetResult();
    Equal(false, await second, "other caller still receives shared result");
    Equal(1, f.Calls.Count, "one coalesced network request");
}

static async Task CancelLists()
{
    var f = new Fixture();
    var full = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var calls = 0;
    f.Handler = async (_, token) =>
    {
        if (Interlocked.Increment(ref calls) == 16) full.TrySetResult();
        await release.Task.WaitAsync(token);
        return Json(Detail(1, "PG"));
    };
    using var abort = new CancellationTokenSource();
    string Page(int start) => "{\"results\":[" + string.Join(',', Enumerable.Range(start, 20).Select(id => "{\"id\":" + id + "}")) + "]}";
    var first = f.Filter.ApplyAsync(Page(1), "/api/v1/discover/movies", f.Id, abort.Token);
    var second = f.Filter.ApplyAsync(Page(21), "/api/v1/discover/movies", f.Id, abort.Token);
    await full.Task.WaitAsync(TimeSpan.FromSeconds(2));
    Equal(16, f.Calls.Count, "shared pool caps two concurrent lists");
    abort.Cancel();
    foreach (var task in new[] { first, second })
    {
        var cancelled = false;
        try { await task; } catch (OperationCanceledException) { cancelled = true; }
        Check(cancelled, "list cancellation propagates to response caller");
    }
    // Cancellation callbacks on semaphore waiters are dispatched asynchronously.
    // Let those callbacks drain before releasing occupied slots.
    await Task.Delay(100);
    release.SetResult();
    // These titles occupied the first list's slots; join their still-running
    // coalesced fetches so cache warming has completed before checking counts.
    foreach (var id in Enumerable.Range(1, 16))
        Equal(false, await f.Filter.IsBlockedAsync("movie", id, f.Id), "active fetch warmed cache");
    Equal(16, f.Calls.Count, "abandoned queued titles never fetched");
}

static async Task Failover()
{
    var f = new Fixture();
    JellyfinEnhanced.Instance!.Configuration.JellyseerrUrls = "https://first.test\nhttps://second.test";
    f.Handler = (request, _) => Task.FromResult(request.RequestUri!.Host == "second.test" ? Json(Detail(1, "PG")) : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
    Equal(false, await f.Filter.IsBlockedAsync("movie", 1, f.Id), "fallback succeeds");
    Equal(3, f.Calls.Count, "TMDB then both Seerr URLs");
    var requests = f.Calls.ToArray();
    Check(requests[0].Uri.Contains("release_dates?api_key=test-tmdb-key"), "TMDB lightweight endpoint");
    Check(requests.Skip(1).All(r => r.ApiKey == "test-seerr-key" && !r.HasUser), "user-neutral Seerr auth");
}

static async Task ParentGates()
{
    var f = new Fixture(); await f.Seed(2, "R");
    Equal(true, (await f.Filter.ApplyAsync("{\"results\":[]}", "/api/v1/movie/2/recommendations", f.Id)).Block, "related list parent gated");
    Equal(true, (await f.Filter.ApplyAsync("{}", "/api/v1/movie/2/ratings", f.Id)).Block, "subresource parent gated");
    Equal(true, (await f.Filter.ApplyAsync("{\"media\":{\"mediaType\":\"movie\",\"tmdbId\":2}}", "/api/v1/issue/8", f.Id)).Block, "issue parent gated");
    Equal(false, (await f.Filter.ApplyAsync("{}", "/api/v1/issue/8", f.Id)).Block, "missing issue media harmless");
    Equal(true, (await f.Filter.ApplyAsync("{\"media\":{}}", "/api/v1/issue/8", f.Id)).Block, "unidentifiable issue media closed");
}

static string Detail(int id, string rating, string? keywords = null, string country = "US") =>
    "{\"id\":" + id + ",\"releases\":{\"results\":[{\"iso_3166_1\":\"" + country + "\",\"release_dates\":[{\"type\":3,\"certification\":\"" + rating + "\"}]}]}" + (keywords == null ? "" : ",\"keywords\":" + keywords + ",\"genres\":[]") + "}";
static HttpResponseMessage Json(string body) => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
static void Check(bool value, string label) { if (!value) throw new Exception(label); }
static void Equal<T>(T expected, T actual, string label) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"{label}: expected {expected}, got {actual}"); }

sealed class Fixture : IHttpClientFactory, IUserManager, IServerConfigurationManager, ILocalizationManager
{
    public string Id { get; } = Guid.NewGuid().ToString();
    public TestUser User { get; }
    public TestConfiguration Configuration { get; } = new();
    public SeerrParentalFilter Filter { get; }
    public ConcurrentQueue<(string Uri, string? ApiKey, bool HasUser)> Calls { get; } = new();
    public Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Handler { get; set; } = (_, _) => throw new Exception("Unexpected metadata request");
    public Fixture(TestUser? user = null)
    {
        User = user ?? new TestUser { MaxParentalRatingScore = 12 };
        JellyfinEnhanced.Instance = new();
        Filter = new(this, this, this, this, new Logger());
    }
    public TestUser? GetUserById(Guid id) => id.ToString() == Id ? User : null;
    public TestRating? GetRatingScore(string certification, string country) => certification switch { "PG" => new(6, 0), "PG-SUB" => new(6, 1), "R" => new(18, 0), _ => null };
    public HttpClient CreateClient(string name) => new(new FakeHandler(this));
    public async Task Seed(int id, string rating)
    {
        var body = "{\"id\":" + id + ",\"releases\":{\"results\":[{\"iso_3166_1\":\"US\",\"release_dates\":[{\"type\":3,\"certification\":\"" + rating + "\"}]}]}}";
        await Filter.ApplyAsync(body, $"/api/v1/movie/{id}", Id);
    }
    sealed class FakeHandler(Fixture fixture) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            fixture.Calls.Enqueue((request.RequestUri!.ToString(), request.Headers.TryGetValues("X-Api-Key", out var keys) ? keys.Single() : null, request.Headers.Contains("X-Api-User")));
            return fixture.Handler(request, cancellationToken);
        }
    }
}
