using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Looks up award wins/nominations for a title by TMDB id from Wikidata's
    /// public SPARQL endpoint (no API key required), and caches the result to
    /// disk so the same title is never re-queried.
    ///
    /// Persistence mirrors TagCacheService: an in-memory dictionary is the
    /// source of truth, mutations are debounced to one atomic (temp file +
    /// rename) write instead of a write per lookup. Unlike TagCacheService this
    /// cache is populated lazily (on request, one title at a time) rather than
    /// built up-front for the whole library, so there's no rebuild/reconcile
    /// machinery here — just get-or-fetch.
    ///
    /// "Found" entries get a long TTL (PositiveTtl) rather than being kept
    /// forever: award history for a past ceremony rarely changes, but Wikidata
    /// is crowd-edited and does get corrected/filled in over time (e.g. a
    /// missing nomination category added later), so a title is still worth
    /// re-checking every few months rather than being frozen at first-fetch
    /// accuracy permanently. "Not found" entries (no Wikidata match, or a
    /// match with no award claims) get a much shorter TTL — see NegativeTtl —
    /// since a newly released title can gain Wikidata award data within months
    /// of a first "nothing yet" lookup.
    /// </summary>
    public class WikidataAwardsService : IDisposable
    {
        private const string SparqlEndpoint = "https://query.wikidata.org/sparql";

        // Wikidata's usage policy asks bulk/automated consumers to identify
        // themselves with a descriptive User-Agent (contact info in parens) —
        // an anonymous default UA is a common reason for being throttled.
        private const string UserAgent = "JellyfinEnhancedPlugin/1.0 (https://github.com/n00bcodr/Jellyfin-Enhanced; award data cache, one request per title, per server)";

        private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(20);
        // Re-check a confirmed "found" title occasionally so Wikidata
        // corrections/additions (a missing category filled in later, etc.)
        // eventually surface — long enough that this is a handful of requests
        // per title per year, not a meaningful load increase over "fetch once".
        private static readonly TimeSpan PositiveTtl = TimeSpan.FromDays(180);
        private static readonly TimeSpan NegativeTtl = TimeSpan.FromDays(30);
        // For a CONFIRMED "no awards" answer only. An unconfirmed (failed)
        // lookup retries much sooner — see AwardsCacheEntry.Confirmed.
        private static readonly TimeSpan RetryTtl = TimeSpan.FromHours(1);
        private static readonly TimeSpan SaveDebounce = TimeSpan.FromSeconds(10);
        private static readonly TimeSpan SaveMaxWait = TimeSpan.FromMinutes(2);
        private const int CurrentSchemaVersion = 1;

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IApplicationPaths _applicationPaths;
        private readonly Logger _logger;

        private readonly ConcurrentDictionary<string, AwardsCacheEntry> _cache = new();
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _inFlight = new();
        private readonly object _saveLock = new();
        private volatile bool _dirty;
        private long _firstDirtyTicks;
        private Timer? _debounceSaveTimer;
        private volatile bool _disposed;

        public WikidataAwardsService(IHttpClientFactory httpClientFactory, IApplicationPaths applicationPaths, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _applicationPaths = applicationPaths;
            _logger = logger;
            LoadFromDisk();
        }

        private string CacheFilePath =>
            Path.Combine(_applicationPaths.PluginsPath, "configurations", "Jellyfin.Plugin.JellyfinEnhanced", "awards.json");

        private static string CacheKey(string mediaType, string tmdbId) => $"{mediaType}-{tmdbId}";

        /// <summary>
        /// Returns the cached awards entry for this title, fetching from
        /// Wikidata on a cache miss (or an expired negative entry). Concurrent
        /// callers for the SAME title share one in-flight fetch instead of
        /// firing duplicate Wikidata requests (e.g. several users opening the
        /// same item-details page at once on a cold cache).
        /// </summary>
        public async Task<AwardsCacheEntry> GetAwardsAsync(string mediaType, string tmdbId, CancellationToken cancellationToken)
        {
            var key = CacheKey(mediaType, tmdbId);

            if (_cache.TryGetValue(key, out var cached) && !IsExpired(cached))
            {
                return cached;
            }

            var gate = _inFlight.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                // Re-check: another caller may have populated it while we waited on the gate.
                if (_cache.TryGetValue(key, out cached) && !IsExpired(cached))
                {
                    return cached;
                }

                var fetched = await FetchFromWikidataAsync(mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
                _cache[key] = fetched;
                ScheduleDebouncedSave();
                return fetched;
            }
            finally
            {
                gate.Release();
                // Best-effort cleanup: drop the gate once nobody's using it so this
                // dictionary doesn't grow by one entry per distinct title forever.
                if (gate.CurrentCount == 1)
                {
                    _inFlight.TryRemove(key, out _);
                }
            }
        }

        private static bool IsExpired(AwardsCacheEntry entry)
        {
            var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(entry.FetchedAtUnixMs);
            if (entry.Found) return age > PositiveTtl;
            return age > (entry.Confirmed ? NegativeTtl : RetryTtl);
        }

        private async Task<AwardsCacheEntry> FetchFromWikidataAsync(string mediaType, string tmdbId, CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            try
            {
                var isPerson = mediaType == "person";
                var query = isPerson ? WikidataAwardsQuery.BuildPersonQuery(tmdbId) : WikidataAwardsQuery.BuildTitleQuery(mediaType, tmdbId);
                var client = _httpClientFactory.CreateClient();
                client.Timeout = RequestTimeout;

                using var request = new HttpRequestMessage(HttpMethod.Get,
                    $"{SparqlEndpoint}?query={Uri.EscapeDataString(query)}");
                request.Headers.UserAgent.ParseAdd(UserAgent);
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/sparql-results+json"));

                using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.Warning($"[Awards] Wikidata query failed ({(int)response.StatusCode}) for {mediaType}:{tmdbId}");
                    return new AwardsCacheEntry { Found = false, Confirmed = false, FetchedAtUnixMs = now };
                }

                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

                return WikidataAwardsQuery.ParseResults(doc, now, isPerson);
            }
            catch (Exception ex)
            {
                // Network hiccup, timeout, malformed response, WDQS overload (it does
                // 502 occasionally under load) — never let an awards lookup fail the
                // item-details page. Cache as a short-lived miss so the same title
                // isn't retried on every view, but retries relatively soon since this
                // is a transient-failure guess, not a confirmed "no data".
                _logger.Warning($"[Awards] Failed to fetch awards for {mediaType}:{tmdbId}: {ex.Message}");
                return new AwardsCacheEntry { Found = false, Confirmed = false, FetchedAtUnixMs = now };
            }
        }

        private void LoadFromDisk()
        {
            var path = CacheFilePath;
            if (!File.Exists(path))
            {
                _logger.Info("[Awards] No cache file found, starting empty");
                return;
            }

            try
            {
                using var stream = File.OpenRead(path);
                var data = JsonSerializer.Deserialize<AwardsCacheDiskFormat>(stream);
                if (data?.Items == null) return;

                if (data.SchemaVersion != CurrentSchemaVersion)
                {
                    _logger.Info($"[Awards] On-disk cache schema v{data.SchemaVersion} != current v{CurrentSchemaVersion}; discarding {data.Items.Count} entries.");
                    return;
                }

                foreach (var kvp in data.Items)
                {
                    _cache[kvp.Key] = kvp.Value;
                }
                _logger.Info($"[Awards] Loaded {_cache.Count} entries from disk");
            }
            catch (Exception ex)
            {
                _logger.Warning($"[Awards] Failed to load cache from disk: {ex.Message}");
            }
        }

        private void SaveToDisk()
        {
            lock (_saveLock)
            {
                _dirty = false;
                Interlocked.Exchange(ref _firstDirtyTicks, 0);

                try
                {
                    var dir = Path.GetDirectoryName(CacheFilePath);
                    if (dir != null) Directory.CreateDirectory(dir);

                    var data = new AwardsCacheDiskFormat
                    {
                        SchemaVersion = CurrentSchemaVersion,
                        Items = new Dictionary<string, AwardsCacheEntry>(_cache),
                    };

                    var tempPath = CacheFilePath + ".tmp";
                    using (var stream = File.Create(tempPath))
                    {
                        JsonSerializer.Serialize(stream, data, new JsonSerializerOptions { WriteIndented = false });
                    }
                    File.Move(tempPath, CacheFilePath, overwrite: true);

                    _logger.Info($"[Awards] Saved {_cache.Count} entries to disk");
                }
                catch (Exception ex)
                {
                    _dirty = true; // retry on the next debounce cycle / Dispose
                    _logger.Error($"[Awards] Failed to save cache to disk: {ex.Message}");
                }
            }
        }

        private void ScheduleDebouncedSave()
        {
            _dirty = true;
            Interlocked.CompareExchange(ref _firstDirtyTicks, DateTime.UtcNow.Ticks, 0);

            if (_disposed)
            {
                SaveToDisk();
                return;
            }

            var due = ComputeDelay(Interlocked.Read(ref _firstDirtyTicks));
            var existing = _debounceSaveTimer;
            if (existing != null)
            {
                try
                {
                    existing.Change(due, Timeout.InfiniteTimeSpan);
                    return;
                }
                catch (ObjectDisposedException) { }
            }

            var timer = new Timer(_ =>
            {
                if (_dirty) SaveToDisk();
            }, null, due, Timeout.InfiniteTimeSpan);
            var old = Interlocked.Exchange(ref _debounceSaveTimer, timer);
            if (old != null && !ReferenceEquals(old, timer)) old.Dispose();

            if (_disposed)
            {
                var orphan = Interlocked.Exchange(ref _debounceSaveTimer, null);
                orphan?.Dispose();
                SaveToDisk();
            }
        }

        private static TimeSpan ComputeDelay(long firstDirtyTicks)
        {
            if (firstDirtyTicks == 0) return SaveDebounce;
            var elapsed = DateTime.UtcNow - new DateTime(firstDirtyTicks, DateTimeKind.Utc);
            var remainingCap = SaveMaxWait - elapsed;
            if (remainingCap < TimeSpan.Zero) return TimeSpan.Zero;
            return remainingCap < SaveDebounce ? remainingCap : SaveDebounce;
        }

        public void Dispose()
        {
            _disposed = true;
            var timer = Interlocked.Exchange(ref _debounceSaveTimer, null);
            timer?.Dispose();
            if (_dirty) SaveToDisk();
            foreach (var gate in _inFlight.Values) gate.Dispose();
        }
    }
}
