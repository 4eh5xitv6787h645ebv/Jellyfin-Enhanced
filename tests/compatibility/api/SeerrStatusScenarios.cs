using System.Net;
using Jellyfin.Plugin.JellyfinEnhanced;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;

internal static class SeerrStatusScenarios
{
    public static async Task RunAsync()
    {
        var transport = new FakeTransport();
        var logger = new Logger();
        var service = new SeerrStatusService(transport, logger);
        JellyfinEnhanced.Instance = null;
        Assert(!await service.IsReachableAsync() && transport.Requests.Count == 0, "missing configuration avoids network traffic");
        JellyfinEnhanced.Instance = new JellyfinEnhanced();
        Assert(!await service.IsReachableAsync() && transport.Requests.Count == 0, "disabled integration avoids network traffic");
        var config = JellyfinEnhanced.Instance.Configuration;
        config.JellyseerrEnabled = true;
        config.JellyseerrApiKey = "fixture-key";
        config.JellyseerrUrls = "https://first.invalid/\r\n https://second.invalid/ ";
        transport.Respond = request => request.RequestUri!.Host == "first.invalid"
            ? Json(HttpStatusCode.Unauthorized) : Json(HttpStatusCode.OK);
        Assert(await service.IsReachableAsync(), "status falls back to the next configured instance");
        Assert(transport.Requests.SequenceEqual(new[] { "https://first.invalid/api/v1/status", "https://second.invalid/api/v1/status" }), "status preserves configured URL order and normalization");
        Assert(transport.Headers.All(x => x == "fixture-key"), "status authenticates each upstream request");
        Assert(transport.ClientNames.All(x => x == "JellyfinEnhancedSeerr"), "status uses the redirect-safe named client");
        Assert(transport.Clients.All(x => x.Timeout == TimeSpan.FromSeconds(15)), "status preserves its timeout");

        SeerrCacheState.ClearAllSeerrCachesOnConfigChange();
        config.JellyseerrUrls = "https://second.invalid";
        transport.Requests.Clear();
        Assert(await service.IsReachableCachedAsync(), "positive status is available");
        transport.Respond = _ => Json(HttpStatusCode.ServiceUnavailable);
        var otherRequestService = new SeerrStatusService(transport, logger);
        Assert(await otherRequestService.IsReachableCachedAsync() && transport.Requests.Count == 1, "positive cache is shared across request-scoped services");
        Assert(!await service.IsReachableAsync() && transport.Requests.Count == 2, "explicit status probes bypass the cached proxy status");

        SeerrCacheState.ClearAllSeerrCachesOnConfigChange();
        transport.Requests.Clear();
        Assert(!await service.IsReachableCachedAsync(), "negative status is cached");
        transport.Respond = _ => Json(HttpStatusCode.OK);
        Assert(!await otherRequestService.IsReachableCachedAsync() && transport.Requests.Count == 1, "negative caching suppresses repeated outage probes");
        lock (SeerrCacheState._seerrStatusCacheLock)
            SeerrCacheState._seerrStatusCache = (false, DateTime.UtcNow.AddMinutes(-1));
        Assert(await service.IsReachableCachedAsync() && transport.Requests.Count == 2, "expired status is reprobed");

        SeerrCacheState._responseCache["user:detail"] = ("{}", DateTime.UtcNow);
        SeerrCacheState._avatarCache["avatar"] = (Array.Empty<byte>(), "image/png", "etag", DateTime.UtcNow);
        SeerrCacheState._tmdbEnrichmentCache["movie:1"] = (new SeerrCacheState.TmdbEnrichmentResult(), DateTime.UtcNow);
        SeerrCacheState._arrQueueCache = (new(), new(), DateTime.UtcNow);
        SeerrCacheState._arrHistoryCache = (new(), DateTime.UtcNow);
        var identityClears = SeerrIdentityService.ClearCount;
        SeerrCacheState.ClearAllSeerrCachesOnConfigChange();
        Assert(SeerrIdentityService.ClearCount == identityClears + 1, "config invalidation clears identity lookups");
        Assert(SeerrCacheState._responseCache.Count == 0 && SeerrCacheState._avatarCache.IsEmpty && SeerrCacheState._tmdbEnrichmentCache.Count == 0
            && SeerrCacheState._seerrStatusCache == null && SeerrCacheState._arrQueueCache == null && SeerrCacheState._arrHistoryCache == null,
            "config invalidation removes cached responses tied to previous integration settings");
        transport.Requests.Clear();
        Assert(await service.IsReachableCachedAsync() && transport.Requests.Count == 1, "config invalidation forces a fresh status probe");
        Console.WriteLine("PASS: Seerr fallback, authentication, named client, positive/negative cache TTL, and configuration invalidation.");
    }

    private static HttpResponseMessage Json(HttpStatusCode status) => new(status) { Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json") };
    private static void Assert(bool condition, string scenario)
    {
        if (!condition) throw new InvalidOperationException("FAIL: " + scenario);
    }

    private sealed class FakeTransport : IHttpClientFactory
    {
        public Func<HttpRequestMessage, HttpResponseMessage> Respond { get; set; } = _ => Json(HttpStatusCode.OK);
        public List<string> Requests { get; } = new();
        public List<string> Headers { get; } = new();
        public List<string> ClientNames { get; } = new();
        public List<HttpClient> Clients { get; } = new();
        public HttpClient CreateClient(string name)
        {
            ClientNames.Add(name);
            var client = new HttpClient(new Handler(this));
            Clients.Add(client);
            return client;
        }
        private sealed class Handler(FakeTransport owner) : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                owner.Requests.Add(request.RequestUri!.AbsoluteUri);
                owner.Headers.Add(request.Headers.TryGetValues("X-Api-Key", out var values) ? values.Single() : "");
                return Task.FromResult(owner.Respond(request));
            }
        }
    }
}
