using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Jellyfin.Plugin.JellyfinEnhanced;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using MediaBrowser.Common.Configuration;
using Newtonsoft.Json.Linq;

var root = Path.Combine(Path.GetTempPath(), "je-assets-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var logger = new Logger();
try
{
    var handler = new StubHandler();
    var service = new CdnAssetService(logger, handler, new TestPaths(root));
    foreach (var (source, path) in CdnAssetService.KnownAssets)
    {
        Check(service.IsValidSource(source), $"Known source {source}");
        Check(CdnAssetCatalog.IsSafePath(path), $"Known path {path}");
        var registered = CdnAssetCatalog.Sources[source];
        Check(registered.FixedPaths == null || registered.FixedPaths.ContainsKey(path), "Known fixed-path resolution");
    }

    foreach (var path in new[] { "", "../x", "x/../y", "/x", "x//y", "https://evil.test/x", "x?y", "x#y", "%2e%2e/x", "x\\y", "x\r\ny", new string('x', 513) })
    {
        Check(await service.GetAsync("selfhst", path, false, default) == null, "Unsafe path must be rejected");
    }
    Check(await service.GetAsync("unknown", "safe.png", false, default) == null, "Unknown source");
    Check(await service.GetAsync("ibb", "other.png", false, default) == null, "Fixed path whitelist");
    Check(handler.Calls == 0, "Rejected paths never send HTTP");

    // A disk entry seeded before service startup is used without an upstream request.
    var activeDisk = new CdnAssetDiskCache(logger, Path.Combine(root, "configurations", "Jellyfin.Plugin.JellyfinEnhanced", "cdn-cache"));
    var diskKey = "disk-" + Guid.NewGuid().ToString("N") + ".png";
    var (freshBin, freshMeta) = activeDisk.CachePaths("selfhst", diskKey);
    activeDisk.WriteDisk(freshBin, freshMeta, new CdnAssetService.CdnAsset([42], "image/png", "\"disk\""));
    Check((await service.GetAsync("selfhst", diskKey, false, default))!.Content.SequenceEqual(new byte[] { 42 }) && handler.Calls == 0, "Fresh disk avoids HTTP");
    var expiredKey = "expired-" + diskKey;
    var (expiredBin, expiredMeta) = activeDisk.CachePaths("selfhst", expiredKey);
    activeDisk.WriteDisk(expiredBin, expiredMeta, new CdnAssetService.CdnAsset([1], "image/png", "\"old\""));
    var oldMetadata = JObject.Parse(File.ReadAllText(expiredMeta));
    oldMetadata["FetchedAt"] = DateTimeOffset.UtcNow.AddHours(-25).ToUnixTimeMilliseconds();
    File.WriteAllText(expiredMeta, oldMetadata.ToString());
    handler.Respond = _ => Response("image/png", "refreshed");
    Check(Encoding.UTF8.GetString((await service.GetAsync("selfhst", expiredKey, false, default))!.Content) == "refreshed", "Expired disk refreshes");
    var initialCalls = handler.Calls;

    var key = "test-" + Guid.NewGuid().ToString("N") + ".png";
    handler.Respond = _ => Response("image/png", "asset-one");
    var asset = await service.GetAsync("selfhst", key, false, default);
    Check(asset != null && Encoding.UTF8.GetString(asset.Content) == "asset-one", "Successful fetch body");
    Check(asset!.ETag == $"\"{Convert.ToHexString(SHA256.HashData(asset.Content))}\"", "Content-derived quoted ETag");
    Check(handler.LastUri == new Uri("https://cdn.jsdelivr.net/gh/selfhst/icons/" + key), "Fixed source base URL");
    Check(handler.LastUserAgent.Contains("Mozilla/5.0"), "Browser user agent preserved");
    Check((await service.GetAsync("selfhst", key, false, default)) == asset && handler.Calls == initialCalls + 1, "Hot hit avoids HTTP");

    handler.Respond = _ => Response("image/png", "asset-two");
    Check(Encoding.UTF8.GetString((await service.GetAsync("selfhst", key, true, default))!.Content) == "asset-two", "Forced refresh bypasses hot/disk");
    Check(handler.Calls == initialCalls + 2, "Forced refresh reaches HTTP");
    handler.Respond = _ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
    Check(Encoding.UTF8.GetString((await service.GetAsync("selfhst", key, true, default))!.Content) == "asset-two", "Stale disk survives upstream failure");

    var miss = "missing-" + key;
    Check(await service.GetAsync("selfhst", miss, false, default) == null, "Missing response");
    var afterMiss = handler.Calls;
    Check(await service.GetAsync("selfhst", miss, false, default) == null && handler.Calls == afterMiss, "Negative cache avoids repeated HTTP");
    handler.Respond = _ => Response("image/png", "revived");
    Check(await service.GetAsync("selfhst", miss, true, default) != null, "Forced refresh revives negative entry");

    var fetcher = new CdnAssetFetcher(logger, handler);
    var sourcePolicy = CdnAssetCatalog.Sources["selfhst"];
    handler.Respond = _ => Response("text/html", "challenge");
    Check(await fetcher.FetchAsync(sourcePolicy, "selfhst", key, default) == null, "Upstream HTML rejected");
    handler.Respond = _ => { var response = Response("image/png", "small"); response.Content.Headers.ContentLength = 8L * 1024 * 1024 + 1; return response; };
    Check(await fetcher.FetchAsync(sourcePolicy, "selfhst", key, default) == null, "Declared over-limit content rejected");
    handler.Respond = _ => { var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new MemoryStream(new byte[8 * 1024 * 1024 + 1])) }; response.Content.Headers.ContentType = new MediaTypeHeaderValue("image/png"); response.Content.Headers.ContentLength = 1; return response; };
    Check(await fetcher.FetchAsync(sourcePolicy, "selfhst", key, default) == null, "Streaming size cap enforced despite false length");
    handler.Respond = _ => throw new TaskCanceledException("Simulated HttpClient timeout");
    Check(await fetcher.FetchAsync(sourcePolicy, "selfhst", key, default) == null, "Timeout allows stale fallback");
    using var canceled = new CancellationTokenSource();
    canceled.Cancel();
    try { await fetcher.FetchAsync(sourcePolicy, "selfhst", key, canceled.Token); throw new Exception("Cancellation swallowed"); }
    catch (OperationCanceledException) { }

    await CheckLocaleLayouts(logger, root);

    // Existing cache names and metadata remain readable after upgrades.
    var disk = new CdnAssetDiskCache(logger, Path.Combine(root, "disk"));
    var (binPath, metaPath) = disk.CachePaths("selfhst", "svg/example.svg");
    var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("svg/example.svg"))).ToLowerInvariant();
    Check(Path.GetFileName(binPath) == hash + ".bin" && Path.GetFileName(metaPath) == hash + ".meta.json", "Stable cache filenames");
    Directory.CreateDirectory(Path.GetDirectoryName(binPath)!);
    File.WriteAllBytes(binPath, [1, 2, 3]);
    File.WriteAllText(metaPath, "{\"ContentType\":\"image/svg+xml\",\"ETag\":\"\\\"legacy\\\"\",\"FetchedAt\":1700000000000}");
    Check(disk.TryReadDisk(binPath, metaPath, out var legacy, out var cachedAt) && legacy.Content.SequenceEqual(new byte[] { 1, 2, 3 }) && cachedAt == DateTimeOffset.FromUnixTimeMilliseconds(1700000000000).UtcDateTime, "Legacy cache format loads");
    disk.WriteDisk(binPath, metaPath, asset);
    var metadata = JObject.Parse(File.ReadAllText(metaPath));
    Check(metadata.Properties().Select(p => p.Name).SequenceEqual(new[] { "ContentType", "ETag", "FetchedAt" }), "Persisted metadata contract");
    Check(disk.TryReadDisk(binPath, metaPath, out var persisted, out _) && persisted.Content.SequenceEqual(asset.Content), "Disk round trip");
    File.WriteAllText(metaPath, "broken-json");
    Check(!disk.TryReadDisk(binPath, metaPath, out _, out _), "Corrupt metadata treated as miss");
    Check(!Directory.EnumerateFiles(root, "*.tmp", SearchOption.AllDirectories).Any(), "Atomic writes leave no temporary files");
    Console.WriteLine("CDN asset contracts passed: catalog security, HTTP limits, cache behavior and legacy persistence.");
}
finally
{
    Directory.Delete(root, recursive: true);
}

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

static HttpResponseMessage Response(string type, string value)
{
    var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(Encoding.UTF8.GetBytes(value)) };
    response.Content.Headers.ContentType = new MediaTypeHeaderValue(type);
    return response;
}

static async Task CheckLocaleLayouts(Logger logger, string root)
{
    const string rootBase = "https://raw.githubusercontent.com/n00bcodr/Jellyfin-Enhanced/main/locales/";
    const string legacyBase = "https://raw.githubusercontent.com/n00bcodr/Jellyfin-Enhanced/main/Jellyfin.Plugin.JellyfinEnhanced/js/locales/";
    var handler = new StubHandler();
    var service = new CdnAssetService(logger, handler, new TestPaths(root));
    string NewLocale() => "locale-" + Guid.NewGuid().ToString("N") + ".json";

    var rootLayout = NewLocale();
    handler.Respond = _ => Response("application/json", "{\"layout\":\"root\"}");
    var asset = await service.GetAsync("locales", rootLayout, false, default);
    Check(asset != null && handler.Requests.SequenceEqual(new[] { rootBase + rootLayout }), "Root locale layout succeeds without a fallback request");
    Check(await service.GetAsync("locales", rootLayout, false, default) == asset && handler.Calls == 1, "Root-layout locale caches under its public key");

    var relocated = NewLocale();
    handler.Requests.Clear();
    handler.Respond = request => request.RequestUri!.AbsoluteUri.StartsWith(rootBase, StringComparison.Ordinal)
        ? new HttpResponseMessage(HttpStatusCode.NotFound)
        : Response("application/json", "{\"layout\":\"legacy\"}");
    asset = await service.GetAsync("locales", relocated, false, default);
    Check(asset != null && Encoding.UTF8.GetString(asset.Content) == "{\"layout\":\"legacy\"}", "Pre-layout locale is served after the root path returns 404");
    Check(handler.Requests.SequenceEqual(new[] { rootBase + relocated, legacyBase + relocated }), "Locale fallback uses only the two fixed repository layouts in order");
    var fetchedCalls = handler.Calls;
    Check(await service.GetAsync("locales", relocated, false, default) == asset && handler.Calls == fetchedCalls, "Fallback locale shares the existing public cache key and hot-cache policy");

    foreach (var failure in new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden, HttpStatusCode.TooManyRequests, HttpStatusCode.ServiceUnavailable })
    {
        handler.Requests.Clear();
        handler.Respond = _ => new HttpResponseMessage(failure);
        Check(await service.GetAsync("locales", NewLocale(), false, default) == null && handler.Requests.Count == 1, $"Locale HTTP {(int)failure} must not probe an alternate layout");
    }

    var missing = NewLocale();
    handler.Requests.Clear();
    handler.Respond = _ => new HttpResponseMessage(HttpStatusCode.NotFound);
    Check(await service.GetAsync("locales", missing, false, default) == null && handler.Requests.Count == 2, "Missing locale tries both layouts exactly once");
    Check(await service.GetAsync("locales", missing, false, default) == null && handler.Requests.Count == 2, "A miss across both layouts preserves negative caching");

    handler.Requests.Clear();
    handler.Respond = _ => Response("text/html", "challenge");
    Check(await service.GetAsync("locales", NewLocale(), false, default) == null && handler.Requests.Count == 1, "Unexpected locale content does not trigger layout fallback");
    handler.Requests.Clear();
    handler.Respond = request => request.RequestUri!.AbsoluteUri.StartsWith(rootBase, StringComparison.Ordinal)
        ? new HttpResponseMessage(HttpStatusCode.NotFound) : Response("text/html", "challenge");
    Check(await service.GetAsync("locales", NewLocale(), false, default) == null && handler.Requests.Count == 2, "Fallback locale must satisfy the same content-type allowlist");
    handler.Requests.Clear();
    handler.Respond = request =>
    {
        if (request.RequestUri!.AbsoluteUri.StartsWith(rootBase, StringComparison.Ordinal)) return new HttpResponseMessage(HttpStatusCode.NotFound);
        var response = Response("application/json", "{}");
        response.Content.Headers.ContentLength = 8L * 1024 * 1024 + 1;
        return response;
    };
    Check(await service.GetAsync("locales", NewLocale(), false, default) == null && handler.Requests.Count == 2, "Fallback locale must satisfy the same response size cap");
    handler.Requests.Clear();
    handler.Respond = _ => throw new TaskCanceledException("Simulated timeout");
    Check(await service.GetAsync("locales", NewLocale(), false, default) == null && handler.Requests.Count == 1, "Locale timeout must not probe an alternate layout");
    handler.Requests.Clear();
    Check(await service.GetAsync("locales", "../outside.json", false, default) == null && handler.Requests.Count == 0, "Locale fallback cannot bypass path validation");
    Console.WriteLine("Locale layout contracts passed: root and pre-layout upstreams, 404-only fallback, unchanged cache and response guards.");
}

sealed record TestPaths(string PluginsPath) : IApplicationPaths;

sealed class StubHandler : HttpMessageHandler, IHttpClientFactory
{
    public int Calls { get; private set; }
    public Uri? LastUri { get; private set; }
    public List<string> Requests { get; } = new();
    public string LastUserAgent { get; private set; } = "";
    public Func<HttpRequestMessage, HttpResponseMessage> Respond { get; set; } = _ => throw new Exception("Unexpected request");
    public HttpClient CreateClient(string name) => new(this, disposeHandler: false);
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Calls++;
        LastUri = request.RequestUri;
        Requests.Add(request.RequestUri!.AbsoluteUri);
        LastUserAgent = request.Headers.UserAgent.ToString();
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(Respond(request));
    }
}
