using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Awards;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Resolves and caches award data for library items.
    /// </summary>
    /// <remarks>
    /// Lookups are expensive relative to how rarely awards change, so a result is
    /// fetched once and then persisted to disk and reused until it ages past the
    /// configured TTL (30 days by default). Restarts, library re-scans and repeated
    /// visits to the same detail page all hit the cache rather than the network.
    ///
    /// Entries are keyed on the item's PROVIDER id, not its Jellyfin id, so the record
    /// survives a library rebuild and is shared between duplicate copies of the same
    /// title across libraries.
    /// </remarks>
    public class AwardsService : IDisposable
    {
        private readonly ILibraryManager _libraryManager;
        private readonly IApplicationPaths _applicationPaths;
        private readonly OmdbAwardsSource _omdb;
        private readonly WikidataAwardsSource _wikidata;
        private readonly Logger _logger;

        private readonly ConcurrentDictionary<string, AwardsRecord> _cache = new(StringComparer.Ordinal);

        /// <summary>
        /// In-flight lookups, so N users opening the same detail page at once produce
        /// one upstream request rather than N.
        /// </summary>
        private readonly ConcurrentDictionary<string, Lazy<Task<AwardsRecord>>> _inFlight = new(StringComparer.Ordinal);

        private readonly object _saveLock = new();
        private Timer? _saveTimer;
        private volatile bool _dirty;
        private volatile bool _disposed;
        private int _loaded;

        /// <summary>
        /// Writes are coalesced: a browsing session can add dozens of entries in a
        /// minute and each one does not deserve its own full-file rewrite.
        /// </summary>
        private static readonly TimeSpan SaveDebounce = TimeSpan.FromSeconds(20);

        /// <summary>
        /// Bumped whenever <see cref="AwardsRecord"/> changes shape, so an older file
        /// is discarded and refetched instead of deserializing into partial entries.
        /// </summary>
        private const int CurrentSchemaVersion = 1;

        /// <summary>
        /// Hard ceiling on cached entries. A record is well under 1 KB, so the default
        /// bounds the file to a few tens of MB even for a library far larger than the
        /// number of titles that actually have awards.
        /// </summary>
        private const int DefaultMaxEntries = 50000;

        /// <summary>
        /// Minimum gap between forced refreshes of the same title, so the manual
        /// refresh control cannot be used to hammer an upstream service.
        /// </summary>
        private static readonly TimeSpan ManualRefreshCooldown = TimeSpan.FromMinutes(10);
        private readonly ConcurrentDictionary<string, DateTime> _lastManualRefresh = new(StringComparer.Ordinal);

        /// <summary>
        /// Caps how many award rows are stored for one title.
        /// </summary>
        /// <remarks>
        /// The heaviest real title measured (Breaking Bad) collapses to 107 rows, so
        /// this is generous headroom while still bounding a pathological result set —
        /// the cache is one JSON document rewritten as a whole, and one runaway record
        /// would inflate every subsequent save.
        /// </remarks>
        private const int MaxEntriesPerRecord = 250;

        /// <summary>Item types that can meaningfully carry awards.</summary>
        /// <remarks>
        /// Checked with a type test rather than a type-name string so a subclass or a
        /// future rename cannot silently make the feature stop matching.
        /// </remarks>
        private static bool IsSupported(BaseItem item) => item is Movie || item is Series;

        public AwardsService(
            ILibraryManager libraryManager,
            IApplicationPaths applicationPaths,
            OmdbAwardsSource omdb,
            WikidataAwardsSource wikidata,
            Logger logger)
        {
            _libraryManager = libraryManager;
            _applicationPaths = applicationPaths;
            _omdb = omdb;
            _wikidata = wikidata;
            _logger = logger;
        }

        private static Configuration.PluginConfiguration? Config => JellyfinEnhanced.Instance?.Configuration;

        private static bool FeatureEnabled => Config?.AwardsEnabled == true;

        private static bool WikidataEnabled => Config?.AwardsUseWikidata != false;

        private static TimeSpan CacheTtl
        {
            get
            {
                var days = Config?.AwardsCacheTtlDays ?? 30;
                // Clamped so a bad config value cannot turn every page view into a
                // fresh upstream request, nor pin a record forever.
                return TimeSpan.FromDays(Math.Clamp(days, 1, 365));
            }
        }

        private string CacheFilePath => Path.Combine(
            _applicationPaths.PluginsPath,
            "configurations",
            "Jellyfin.Plugin.JellyfinEnhanced",
            "awards-cache.json");

        /// <summary>
        /// Returns the awards for a Jellyfin item, fetching and caching on first use.
        /// </summary>
        /// <param name="itemId">The Jellyfin item id.</param>
        /// <param name="forceRefresh">Bypass a fresh cache entry and refetch.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>
        /// The record, or null when the feature is disabled, the item is unsupported,
        /// or it carries no usable provider id.
        /// </returns>
        public async Task<AwardsRecord?> GetForItemAsync(Guid itemId, bool forceRefresh, CancellationToken cancellationToken)
        {
            if (!FeatureEnabled)
            {
                return null;
            }

            var item = _libraryManager.GetItemById(itemId);
            if (item == null || !IsSupported(item))
            {
                return null;
            }

            var identity = ResolveIdentity(item);
            if (identity == null)
            {
                return null;
            }

            EnsureLoaded();

            if (forceRefresh)
            {
                // A cooldown per key, not per user, so several users pressing refresh on
                // the same title still results in a single upstream lookup.
                var last = _lastManualRefresh.GetOrAdd(identity.Key, DateTime.MinValue);
                if (DateTime.UtcNow - last < ManualRefreshCooldown)
                {
                    forceRefresh = false;
                }
                else
                {
                    _lastManualRefresh[identity.Key] = DateTime.UtcNow;
                    PruneRefreshCooldowns();
                }
            }

            if (!forceRefresh
                && _cache.TryGetValue(identity.Key, out var cached)
                && !cached.IsStale(CacheTtl))
            {
                return cached;
            }

            return await FetchCoalescedAsync(identity, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Upper bound on how long one shared lookup may run. Bounds the work when
        /// every caller has walked away, since the shared task deliberately does not
        /// observe any individual request's cancellation.
        /// </summary>
        private static readonly TimeSpan LookupTimeout = TimeSpan.FromSeconds(45);

        /// <summary>
        /// Runs one lookup per key at a time; concurrent callers await the same task.
        /// </summary>
        /// <remarks>
        /// The shared task is deliberately NOT started with the calling request's
        /// cancellation token. The first caller owns the task, so binding it to that
        /// request would mean one user navigating away cancels the lookup that every
        /// other waiter is depending on — they would all see an error for a request
        /// they never aborted. Each caller instead observes its own token while
        /// awaiting, and the shared work is bounded by its own timeout.
        /// </remarks>
        private Task<AwardsRecord> FetchCoalescedAsync(ItemIdentity identity, CancellationToken cancellationToken)
        {
            // Lazy with ExecutionAndPublication so the factory runs exactly once even
            // when several threads race GetOrAdd — a plain factory can be invoked by
            // both, and the loser's task is already started by the time it is thrown
            // away, producing the duplicate upstream lookup the gate exists to prevent.
            var lazy = _inFlight.GetOrAdd(
                identity.Key,
                key => new Lazy<Task<AwardsRecord>>(
                    () => RunLookupAsync(identity, key),
                    LazyThreadSafetyMode.ExecutionAndPublication));

            // WaitAsync lets each caller give up on its own token without disturbing
            // the shared task. The entry is removed by the task itself (see
            // RunLookupAsync), never in a waiter's finally: removing it here would
            // deregister a lookup that is still running — so the next caller would
            // start a second one — and could also evict a newer task inserted after
            // this one completed.
            return lazy.Value.WaitAsync(cancellationToken);
        }

        /// <summary>
        /// Wraps <see cref="FetchAsync"/> with the shared-lookup timeout.
        /// </summary>
        private async Task<AwardsRecord> RunLookupAsync(ItemIdentity identity, string key)
        {
            using var timeout = new CancellationTokenSource(LookupTimeout);
            try
            {
                return await FetchAsync(identity, timeout.Token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.Warning($"Awards: lookup for {key} did not complete: {ex.Message}");
                // Not a "no awards" answer: return the never-cached sentinel so the
                // next view retries rather than trusting a failed lookup.
                return new AwardsRecord { Key = key, FetchedUtc = DateTime.MinValue };
            }
            finally
            {
                // The task owns its own registration, so it is only ever removed once
                // the work is actually finished.
                _inFlight.TryRemove(key, out _);
            }
        }

        /// <summary>
        /// Performs the actual lookup: OMDb for the headline counts, Wikidata for the
        /// per-award detail, with each filling in for the other where it can.
        /// </summary>
        private async Task<AwardsRecord> FetchAsync(ItemIdentity identity, CancellationToken cancellationToken)
        {
            var record = new AwardsRecord
            {
                Key = identity.Key,
                FetchedUtc = DateTime.UtcNow
            };

            // Keep any previous record so a transient upstream failure does not wipe
            // good data — a failed refresh should serve stale, not empty.
            _cache.TryGetValue(identity.Key, out var previous);

            // Tracked per source, not as one flag. The two sources fail completely
            // independently: OMDb reads a local file and essentially cannot fail,
            // while Wikidata is a network call to a rate-limited public endpoint. A
            // single combined flag hides the common case — OMDb succeeds, Wikidata
            // does not — and that is exactly the case that must not be cached.
            var omdbFailed = false;
            var wikidataFailed = false;

            if (!string.IsNullOrEmpty(identity.ImdbId))
            {
                try
                {
                    var summary = await _omdb.GetSummaryAsync(identity.ImdbId!, Config?.AwardsOmdbApiKey, cancellationToken)
                                             .ConfigureAwait(false);
                    if (summary != null)
                    {
                        record.Summary = summary;
                        record.Sources.Add(summary.Source);
                    }
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    omdbFailed = true;
                    _logger.Warning($"Awards: OMDb lookup failed for {identity.Key}: {ex.Message}");
                }
            }

            if (WikidataEnabled)
            {
                var entries = await FetchWikidataAsync(identity, cancellationToken).ConfigureAwait(false);
                if (entries == null)
                {
                    wikidataFailed = true;
                }
                else if (entries.Count > 0)
                {
                    record.Entries = entries.Count > MaxEntriesPerRecord
                        ? entries.GetRange(0, MaxEntriesPerRecord)
                        : entries;
                    record.Sources.Add(WikidataAwardsSource.SourceName);
                }
            }

            // Carry forward whatever the failing source gave us last time, so a
            // momentary outage degrades to stale data rather than to blank data.
            if (previous != null)
            {
                if (wikidataFailed && record.Entries.Count == 0 && previous.Entries.Count > 0)
                {
                    record.Entries = previous.Entries;
                    record.Sources.Add(WikidataAwardsSource.SourceName);
                }

                if (omdbFailed && record.Summary == null && previous.Summary != null)
                {
                    record.Summary = previous.Summary;
                    record.Sources.Add(previous.Summary.Source);
                }
            }

            // Wikidata can supply the headline counts when OMDb had nothing for this
            // title, which keeps the banner working for items with no IMDb id.
            if (record.Summary == null && record.Entries.Count > 0)
            {
                record.Summary = new AwardsSummary
                {
                    Wins = record.Entries.Count(e => e.IsWinner),
                    Nominations = record.Entries.Count(e => !e.IsWinner),
                    Source = WikidataAwardsSource.SourceName
                };
            }

            var foundNothing = record.Summary == null && record.Entries.Count == 0;
            var anySourceFailed = omdbFailed || wikidataFailed;

            if (foundNothing && anySourceFailed)
            {
                // Every source we tried errored and there is nothing to fall back on.
                // Do not cache this as "no awards" — that would hide real awards for a
                // full TTL because of a momentary outage.
                if (previous != null)
                {
                    return previous;
                }

                record.NoAwards = false;
                record.FetchedUtc = DateTime.MinValue;
                return record;
            }

            record.NoAwards = foundNothing
                || (record.Entries.Count == 0 && record.Summary is { Wins: 0, Nominations: 0 });

            if (anySourceFailed)
            {
                // Something is still missing or was carried over from the previous
                // record, so this is not a complete answer. Backdate it to just inside
                // the TTL: the data stays usable now, and tonight's refresh picks it up
                // again instead of it sitting pinned as "fresh" for the next 30 days.
                record.FetchedUtc = DateTime.UtcNow - CacheTtl + TimeSpan.FromHours(6);
            }

            Store(identity.Key, record);
            return record;
        }

        /// <summary>
        /// Queries Wikidata using the best identifier available, falling back to a
        /// secondary id only when the primary matched nothing.
        /// </summary>
        /// <returns>The entries, or null when the query failed outright.</returns>
        private async Task<List<AwardEntry>?> FetchWikidataAsync(ItemIdentity identity, CancellationToken cancellationToken)
        {
            var sawEmptySuccess = false;

            foreach (var (property, value) in identity.WikidataLookups())
            {
                var entries = await _wikidata.GetAwardsAsync(property, value, cancellationToken).ConfigureAwait(false);

                if (entries == null)
                {
                    // Request-level failure for this identifier. Keep trying the others,
                    // but remember nothing has actually succeeded yet.
                    continue;
                }

                if (entries.Count > 0)
                {
                    return entries;
                }

                // A successful query with no rows. Keep trying the remaining
                // identifiers — a title can be linked under one id and not another —
                // but this counts as a real answer if none of them match either.
                sawEmptySuccess = true;
            }

            // Null means "we never got a usable answer", which must not be cached as
            // "this title has no awards". An empty list means at least one query
            // genuinely came back with nothing, which is a cacheable result.
            return sawEmptySuccess ? new List<AwardEntry>() : null;
        }

        /// <summary>
        /// Drops cooldown stamps that have already expired, so the map cannot grow
        /// without bound on a long-running server.
        /// </summary>
        private void PruneRefreshCooldowns()
        {
            if (_lastManualRefresh.Count < 1000)
            {
                return;
            }

            var cutoff = DateTime.UtcNow - ManualRefreshCooldown;
            foreach (var pair in _lastManualRefresh)
            {
                if (pair.Value < cutoff)
                {
                    _lastManualRefresh.TryRemove(pair.Key, out _);
                }
            }
        }

        /// <summary>Inserts or replaces a record and schedules a debounced save.</summary>
        private void Store(string key, AwardsRecord record)
        {
            _cache[key] = record;
            EvictIfOversized();
            MarkDirty();
        }

        /// <summary>
        /// Drops the oldest records once the cache exceeds its ceiling.
        /// </summary>
        /// <remarks>
        /// Trimming 10% at a time rather than one entry per insert keeps a full cache
        /// from re-sorting on every single lookup.
        /// </remarks>
        private void EvictIfOversized()
        {
            var max = Math.Clamp(Config?.AwardsMaxCacheEntries ?? DefaultMaxEntries, 100, 500000);
            if (_cache.Count <= max)
            {
                return;
            }

            var excess = _cache.Count - max + (max / 10);
            var victims = _cache.Values
                .OrderBy(r => r.FetchedUtc)
                .Take(excess)
                .Select(r => r.Key)
                .ToList();

            foreach (var victim in victims)
            {
                _cache.TryRemove(victim, out _);
            }

            _logger.Info($"Awards: cache exceeded {max} entries; removed the {victims.Count} oldest.");
        }

        /// <summary>
        /// Re-fetches every entry that has aged past the TTL. Used by the scheduled task.
        /// </summary>
        /// <param name="progress">Optional 0-100 progress sink.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>The number of records refreshed.</returns>
        public async Task<int> RefreshStaleAsync(IProgress<double>? progress, CancellationToken cancellationToken)
        {
            if (!FeatureEnabled)
            {
                return 0;
            }

            EnsureLoaded();

            var ttl = CacheTtl;
            var stale = _cache.Values.Where(r => r.IsStale(ttl)).Select(r => r.Key).ToList();
            if (stale.Count == 0)
            {
                progress?.Report(100);
                return 0;
            }

            _logger.Info($"Awards: refreshing {stale.Count} cache entries older than {ttl.TotalDays:F0} days.");

            var refreshed = 0;
            for (var i = 0; i < stale.Count; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var identity = ItemIdentity.FromKey(stale[i]);
                if (identity == null)
                {
                    _cache.TryRemove(stale[i], out _);
                    continue;
                }

                try
                {
                    await FetchAsync(identity, cancellationToken).ConfigureAwait(false);
                    refreshed++;
                }
                // Only an actual task cancellation stops the run. One title timing out
                // must not abandon the remaining thousands.
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    _logger.Warning($"Awards: refresh failed for {stale[i]}: {ex.Message}");
                }

                progress?.Report((i + 1) * 100.0 / stale.Count);
            }

            SaveNow();
            return refreshed;
        }

        /// <summary>Empties the cache and deletes the file. Admin-triggered.</summary>
        public void ClearCache()
        {
            _cache.Clear();
            _lastManualRefresh.Clear();

            lock (_saveLock)
            {
                try
                {
                    if (File.Exists(CacheFilePath))
                    {
                        File.Delete(CacheFilePath);
                    }
                }
                catch (Exception ex)
                {
                    _logger.Warning($"Awards: could not delete the cache file: {ex.Message}");
                }
            }

            _logger.Info("Awards: cache cleared.");
        }

        /// <summary>Cache counters for the admin config page.</summary>
        public object GetStats()
        {
            EnsureLoaded();

            var ttl = CacheTtl;
            var values = _cache.Values.ToList();

            return new
            {
                entries = values.Count,
                withAwards = values.Count(v => !v.NoAwards),
                withoutAwards = values.Count(v => v.NoAwards),
                stale = values.Count(v => v.IsStale(ttl)),
                ttlDays = (int)ttl.TotalDays,
                oldestUtc = values.Count == 0 ? null : values.Min(v => v.FetchedUtc).ToString("o", CultureInfo.InvariantCulture)
            };
        }

        /// <summary>
        /// Reads the cache file on first use.
        /// </summary>
        /// <remarks>
        /// Loading lazily rather than at startup keeps servers that never enable the
        /// feature from paying for the file read at all.
        /// </remarks>
        private void EnsureLoaded()
        {
            if (Interlocked.CompareExchange(ref _loaded, 1, 0) != 0)
            {
                return;
            }

            try
            {
                var path = CacheFilePath;
                if (!File.Exists(path))
                {
                    return;
                }

                using var stream = File.OpenRead(path);
                var file = JsonSerializer.Deserialize<AwardsCacheFile>(stream);

                if (file == null || file.SchemaVersion != CurrentSchemaVersion)
                {
                    _logger.Info("Awards: discarding a cache file written by a different plugin version.");
                    return;
                }

                foreach (var pair in file.Entries)
                {
                    if (pair.Value != null && !string.IsNullOrEmpty(pair.Key))
                    {
                        pair.Value.Key = pair.Key;
                        _cache[pair.Key] = pair.Value;
                    }
                }

                _logger.Info($"Awards: loaded {_cache.Count} cached records.");
            }
            catch (Exception ex)
            {
                // A truncated or hand-edited file must not take the feature down; an
                // empty cache simply refetches.
                _logger.Warning($"Awards: could not read the cache file, starting empty: {ex.Message}");
            }
        }

        private void MarkDirty()
        {
            if (_disposed)
            {
                return;
            }

            _dirty = true;

            lock (_saveLock)
            {
                if (_disposed)
                {
                    return;
                }

                _saveTimer ??= new Timer(_ => SaveNow(), null, Timeout.Infinite, Timeout.Infinite);
                _saveTimer.Change(SaveDebounce, Timeout.InfiniteTimeSpan);
            }
        }

        /// <summary>
        /// Writes the cache to disk via a temp file and an atomic move, so a crash
        /// mid-write leaves the previous good file intact rather than a truncated one.
        /// </summary>
        public void SaveNow()
        {
            if (!_dirty)
            {
                return;
            }

            lock (_saveLock)
            {
                if (!_dirty)
                {
                    return;
                }

                try
                {
                    var path = CacheFilePath;
                    var dir = Path.GetDirectoryName(path);
                    if (!string.IsNullOrEmpty(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }

                    var payload = new AwardsCacheFile
                    {
                        SchemaVersion = CurrentSchemaVersion,
                        Entries = _cache.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal)
                    };

                    var tempPath = path + ".tmp";
                    using (var stream = File.Create(tempPath))
                    {
                        JsonSerializer.Serialize(stream, payload);
                    }

                    File.Move(tempPath, path, overwrite: true);
                    _dirty = false;
                }
                catch (Exception ex)
                {
                    // Leave _dirty set so the next change retries the write.
                    _logger.Warning($"Awards: could not save the cache: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// The identifiers a lookup can use for one item, plus the cache key derived
        /// from them.
        /// </summary>
        internal sealed class ItemIdentity
        {
            public string Key { get; init; } = string.Empty;

            public string? ImdbId { get; init; }

            public string? TmdbId { get; init; }

            public string? TvdbId { get; init; }

            public bool IsSeries { get; init; }

            /// <summary>
            /// Identifier properties to try against Wikidata, best coverage first.
            /// </summary>
            public IEnumerable<(string Property, string Value)> WikidataLookups()
            {
                if (OmdbAwardsSource.IsValidImdbId(ImdbId))
                {
                    yield return (WikidataAwardsSource.PropImdb, ImdbId!);
                }

                if (WikidataAwardsSource.IsSafeIdentifier(TmdbId))
                {
                    yield return (IsSeries ? WikidataAwardsSource.PropTmdbTv : WikidataAwardsSource.PropTmdbMovie, TmdbId!);
                }

                if (WikidataAwardsSource.IsSafeIdentifier(TvdbId))
                {
                    yield return (WikidataAwardsSource.PropTvdb, TvdbId!);
                }
            }

            /// <summary>
            /// Rebuilds an identity from a cache key, for refreshes that run without a
            /// live library item (the title may since have been removed).
            /// </summary>
            public static ItemIdentity? FromKey(string key)
            {
                if (string.IsNullOrEmpty(key))
                {
                    return null;
                }

                if (key.StartsWith("tt", StringComparison.Ordinal))
                {
                    return OmdbAwardsSource.IsValidImdbId(key)
                        ? new ItemIdentity { Key = key, ImdbId = key }
                        : null;
                }

                var separator = key.IndexOf(':', StringComparison.Ordinal);
                if (separator <= 0 || separator == key.Length - 1)
                {
                    return null;
                }

                var prefix = key.Substring(0, separator);
                var value = key.Substring(separator + 1);

                if (!WikidataAwardsSource.IsSafeIdentifier(value))
                {
                    return null;
                }

                return prefix switch
                {
                    "tmdb-movie" => new ItemIdentity { Key = key, TmdbId = value, IsSeries = false },
                    "tmdb-tv" => new ItemIdentity { Key = key, TmdbId = value, IsSeries = true },
                    "tvdb" => new ItemIdentity { Key = key, TvdbId = value },
                    _ => null
                };
            }
        }

        /// <summary>
        /// Extracts the provider ids from an item and picks the cache key.
        /// </summary>
        /// <remarks>
        /// IMDb is preferred because it is the one id both sources understand, so items
        /// that have it share a single cache entry no matter which library they came from.
        /// </remarks>
        private static ItemIdentity? ResolveIdentity(BaseItem item)
        {
            var imdb = item.GetProviderId(MetadataProvider.Imdb);
            var tmdb = item.GetProviderId(MetadataProvider.Tmdb);
            var tvdb = item.GetProviderId(MetadataProvider.Tvdb);
            var isSeries = item is Series;

            string? key = null;
            if (OmdbAwardsSource.IsValidImdbId(imdb))
            {
                key = imdb;
            }
            else if (WikidataAwardsSource.IsSafeIdentifier(tmdb))
            {
                key = (isSeries ? "tmdb-tv:" : "tmdb-movie:") + tmdb;
            }
            else if (WikidataAwardsSource.IsSafeIdentifier(tvdb))
            {
                key = "tvdb:" + tvdb;
            }

            if (key == null)
            {
                return null;
            }

            return new ItemIdentity
            {
                Key = key,
                ImdbId = OmdbAwardsSource.IsValidImdbId(imdb) ? imdb : null,
                TmdbId = WikidataAwardsSource.IsSafeIdentifier(tmdb) ? tmdb : null,
                TvdbId = WikidataAwardsSource.IsSafeIdentifier(tvdb) ? tvdb : null,
                IsSeries = isSeries
            };
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            if (!disposing || _disposed)
            {
                return;
            }

            _disposed = true;

            lock (_saveLock)
            {
                _saveTimer?.Dispose();
                _saveTimer = null;
            }

            SaveNow();
        }
    }
}
