using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Manages a server-side pre-computed tag cache for all library items.
    /// The cache is stored in memory (ConcurrentDictionary) and persisted to disk as JSON.
    /// Clients fetch the full cache in one GET request instead of making per-page batch calls.
    /// </summary>
    public class TagCacheService : IDisposable
    {
        private readonly ILibraryManager _libraryManager;
        private readonly IApplicationPaths _applicationPaths;
        private readonly ILogger<TagCacheService> _logger;
        private volatile ConcurrentDictionary<string, TagCacheEntry> _cache = new();
        private readonly object _cacheMutationLock = new();
        private readonly object _fullBuildLock = new();
        private readonly object _saveLock = new();
        // While a full cache is built off to the side, event-driven mutations
        // continue updating the live cache and are journaled here for replay at
        // publish. A null value is a removal tombstone.
        private Dictionary<string, TagCacheEntry?>? _rebuildMutations;
        private long _version;
        private long _lastModified;
        private long _changeVersion;
        private long _persistedChangeVersion;
        private Timer? _debounceSaveTimer;

        internal Action? SaveSnapshotCapturedForTest { get; set; }

        // Bump whenever a TagCacheEntry field the STRIP paths depend on is added,
        // so a cache serialized by an older build is discarded and rebuilt. v2
        // added SeriesId, which the Spoiler Guard tag-strip requires: a v1 cache
        // has null SeriesId on every episode, so the strip skips them and unstripped
        // ratings leak onto guarded cards via renderFromServerCache. Discarding
        // starts empty (client falls back to the live/per-batch strip) until rebuild.
        private const int CurrentCacheSchemaVersion = 2;

        // User access cache: avoids expensive GetItemIds query on every request
        private readonly ConcurrentDictionary<string, (HashSet<string> Ids, DateTime CachedAt)> _userAccessCache = new();
        private static readonly TimeSpan UserAccessCacheTtl = TimeSpan.FromSeconds(60);

        public static readonly HashSet<BaseItemKind> TaggableTypes = new()
        {
            BaseItemKind.Movie,
            BaseItemKind.Episode,
            BaseItemKind.Series,
            BaseItemKind.Season,
            BaseItemKind.BoxSet,
        };

        public TagCacheService(ILibraryManager libraryManager, IApplicationPaths applicationPaths, ILogger<TagCacheService> logger)
        {
            _libraryManager = libraryManager;
            _applicationPaths = applicationPaths;
            _logger = logger;
        }

        public long Version => Interlocked.Read(ref _version);
        public long LastModified => Interlocked.Read(ref _lastModified);
        public int Count => _cache.Count;

        internal bool ContainsKeyForTest(string key) => _cache.ContainsKey(key);

        private string CacheFilePath =>
            Path.Combine(_applicationPaths.PluginsPath, "configurations", "Jellyfin.Plugin.JellyfinEnhanced", "tag-cache.json");

        /// <summary>
        /// Build the complete tag cache for all library items.
        /// Called by the scheduled task on startup and periodically.
        /// </summary>
        public void BuildFullCache(IProgress<double>? progress, CancellationToken cancellationToken)
        {
            lock (_fullBuildLock)
            {
                _logger.LogInformation("[TagCache] Starting full cache build...");
                var sw = System.Diagnostics.Stopwatch.StartNew();
                BeginRebuildMutationCapture();
                var published = false;

                try
                {
                    var allItems = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        IncludeItemTypes = TaggableTypes.ToArray(),
                        IsVirtualItem = false,
                        Recursive = true
                    }).ToList();

                    _logger.LogInformation($"[TagCache] Found {allItems.Count} taggable items");

                    var newCache = new ConcurrentDictionary<string, TagCacheEntry>();
                    var processed = 0;

                    foreach (var item in allItems)
                    {
                        cancellationToken.ThrowIfCancellationRequested();

                        var entry = BuildEntryForItem(item);
                        if (entry != null)
                        {
                            var key = item.Id.ToString("N").ToLowerInvariant();
                            newCache[key] = entry;
                        }

                        processed++;
                        if (processed % 500 == 0)
                        {
                            progress?.Report((double)processed / allItems.Count * 100);
                        }
                    }

                    PublishRebuiltCache(newCache);
                    published = true;
                    Interlocked.Increment(ref _version);
                    Interlocked.Exchange(ref _lastModified, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                    _userAccessCache.Clear();
                    progress?.Report(100);

                    sw.Stop();
                    _logger.LogInformation($"[TagCache] Full cache build complete: {_cache.Count} entries in {sw.Elapsed.TotalSeconds:F1}s");

                    SaveToDisk();
                }
                finally
                {
                    if (!published)
                    {
                        AbortRebuildMutationCapture();
                    }
                }
            }
        }

        private void BeginRebuildMutationCapture()
        {
            lock (_cacheMutationLock)
            {
                if (_rebuildMutations != null)
                {
                    throw new InvalidOperationException("A tag-cache rebuild is already active.");
                }
                _rebuildMutations = new Dictionary<string, TagCacheEntry?>(StringComparer.OrdinalIgnoreCase);
            }
        }

        private void PublishRebuiltCache(ConcurrentDictionary<string, TagCacheEntry> rebuilt)
        {
            lock (_cacheMutationLock)
            {
                if (_rebuildMutations == null)
                {
                    throw new InvalidOperationException("No tag-cache rebuild is active.");
                }

                foreach (var mutation in _rebuildMutations)
                {
                    if (mutation.Value == null)
                    {
                        rebuilt.TryRemove(mutation.Key, out _);
                    }
                    else
                    {
                        rebuilt[mutation.Key] = mutation.Value;
                    }
                }

                _cache = rebuilt;
                _rebuildMutations = null;
                Interlocked.Increment(ref _changeVersion);
            }
        }

        private void AbortRebuildMutationCapture()
        {
            lock (_cacheMutationLock)
            {
                _rebuildMutations = null;
            }
        }

        private void CommitCacheEntry(string key, TagCacheEntry entry)
        {
            lock (_cacheMutationLock)
            {
                _cache[key] = entry;
                if (_rebuildMutations != null)
                {
                    _rebuildMutations[key] = entry;
                }
                Interlocked.Increment(ref _changeVersion);
            }
        }

        private bool CommitCacheRemoval(string key)
        {
            lock (_cacheMutationLock)
            {
                var removed = _cache.TryRemove(key, out _);
                var journaled = _rebuildMutations != null;
                if (_rebuildMutations != null)
                {
                    _rebuildMutations[key] = null;
                }
                if (removed || journaled)
                {
                    Interlocked.Increment(ref _changeVersion);
                }
                return removed || journaled;
            }
        }

        internal void BeginRebuildForTest() => BeginRebuildMutationCapture();

        internal void PublishRebuildForTest(Dictionary<string, TagCacheEntry> entries)
            => PublishRebuiltCache(new ConcurrentDictionary<string, TagCacheEntry>(entries));

        internal void UpsertEntryForTest(string key, TagCacheEntry entry) => CommitCacheEntry(key, entry);

        internal void RemoveEntryForTest(string key) => CommitCacheRemoval(key);

        internal bool HasUnsavedChangesForTest
            => Interlocked.Read(ref _changeVersion) != Interlocked.Read(ref _persistedChangeVersion);

        /// <summary>
        /// Update (or insert) a single item in the cache.
        /// Called by TagCacheMonitor on ItemAdded/ItemUpdated events.
        /// </summary>
        public void UpdateItem(BaseItem item)
        {
            var kind = item.GetBaseItemKind();
            if (!TaggableTypes.Contains(kind)) return;

            var entry = BuildEntryForItem(item);
            if (entry != null)
            {
                var key = item.Id.ToString("N").ToLowerInvariant();
                CommitCacheEntry(key, entry);
                Interlocked.Exchange(ref _lastModified, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                ScheduleDebouncedSave();
            }
        }

        /// <summary>
        /// Remove an item from the cache.
        /// </summary>
        public void RemoveItem(Guid itemId)
        {
            var key = itemId.ToString("N").ToLowerInvariant();
            if (CommitCacheRemoval(key))
            {
                Interlocked.Exchange(ref _lastModified, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                ScheduleDebouncedSave();
            }
        }

        /// <summary>
        /// Get cache entries filtered by a user's library access.
        /// User access IDs are cached for 60 seconds to avoid expensive DB queries.
        /// Optionally returns only entries modified after a given timestamp.
        /// </summary>
        public Dictionary<string, TagCacheEntry> GetCacheForUser(JUser user, long? since = null)
        {
            // Capture local reference for thread safety (cache reference may be swapped)
            var cache = _cache;
            var userKey = user.Id.ToString("N");

            // Check user access cache
            HashSet<string> accessibleSet;
            if (_userAccessCache.TryGetValue(userKey, out var cached) && DateTime.UtcNow - cached.CachedAt < UserAccessCacheTtl)
            {
                accessibleSet = cached.Ids;
            }
            else
            {
                var accessibleIds = _libraryManager.GetItemIds(new InternalItemsQuery(user)
                {
                    IncludeItemTypes = TaggableTypes.ToArray(),
                    Recursive = true
                });
                accessibleSet = new HashSet<string>(
                    accessibleIds.Select(id => id.ToString("N").ToLowerInvariant())
                );
                _userAccessCache[userKey] = (accessibleSet, DateTime.UtcNow);
            }

            var result = new Dictionary<string, TagCacheEntry>();
            foreach (var kvp in cache)
            {
                if (!accessibleSet.Contains(kvp.Key)) continue;
                if (since.HasValue && kvp.Value.LastUpdated <= since.Value) continue;
                result[kvp.Key] = kvp.Value;
            }

            return result;
        }

        // ── Spoiler Guard per-user tag-strip (F3) ────────────────────────────
        //
        // The JE tag pipeline reads the server cache BEFORE it fetches per-batch
        // tag-data, so a guarded (unwatched, spoiler-listed) card would still
        // render rating/genre overlays from the cached entry unless we strip the
        // cache response too. TagCacheService stores ONE shared TagCacheEntry per
        // item across ALL users, so the strip NEVER mutates a cached entry — it
        // replaces the affected key with a stripped Clone() for this response only.
        //
        // The gating logic (scope + watched) is pulled out into pure static helpers
        // so the controller can inject the runtime facts as delegates
        // (IUserDataManager / ILibraryManager) and the unit tests can drive it with
        // in-memory fakes — no live library required.

        internal enum TagStripDecision
        {
            /// <summary>Not in spoiler scope, or already watched → serve the shared entry unchanged.</summary>
            Keep,
            /// <summary>Exempt season (S≤1 or any episode watched) → strip only the series-fallback rating.</summary>
            SeasonRatingOnly,
            /// <summary>Guarded + unwatched → full strip per the enabled toggles.</summary>
            Strip,
        }

        /// <summary>
        /// Resolve the strip decision for a single cache entry. Pure: the two runtime
        /// facts the reference reads from the live library (played-state, season
        /// index / any-watched) are injected as delegates, so this mirrors the
        /// GetCacheForUser gating without a live ILibraryManager/IUserDataManager.
        /// </summary>
        /// <param name="key">Cache key (item id, N format).</param>
        /// <param name="entry">The shared cache entry (never mutated here).</param>
        /// <param name="spState">The requesting user's spoiler state.</param>
        /// <param name="isMovieInScope">Movie scope test (direct opt-in or via an opted-in collection).</param>
        /// <param name="isPlayed">Played test for Episode/Movie entries (false when the item can't be resolved → strip).</param>
        /// <param name="seasonIndexNumber">Season IndexNumber, or null when the id isn't a resolvable Season → strip.</param>
        /// <param name="seasonAnyWatched">Any-episode-watched probe, only invoked for guarded seasons with IndexNumber &gt; 1.</param>
        /// <param name="onKeyNotGuid">Callback when a cache key doesn't parse as a Guid (played check skipped, entry still stripped).</param>
        internal static TagStripDecision ResolveTagStripDecision(
            string key,
            TagCacheEntry entry,
            UserSpoilerBlur spState,
            Func<Guid, bool> isMovieInScope,
            Func<Guid, bool> isPlayed,
            Func<Guid, int?> seasonIndexNumber,
            Func<Guid, bool> seasonAnyWatched,
            Action<string> onKeyNotGuid)
        {
            var isEpisode = string.Equals(entry.Type, "Episode", StringComparison.Ordinal);
            var isSeason = string.Equals(entry.Type, "Season", StringComparison.Ordinal);
            var isMovie = string.Equals(entry.Type, "Movie", StringComparison.Ordinal);
            var isSeries = string.Equals(entry.Type, "Series", StringComparison.Ordinal);
            if (!isEpisode && !isSeason && !isMovie && !isSeries) return TagStripDecision.Keep;

            // ── Scope gate ──
            if (isMovie)
            {
                // In scope if directly in Movies dict OR a child of an opted-in collection.
                if (!Guid.TryParse(key, out var mGuid)) return TagStripDecision.Keep;
                if (!isMovieInScope(mGuid)) return TagStripDecision.Keep;
            }
            else if (isSeries)
            {
                // Series-level entry: strip only when Spoiler Guard is on for THIS
                // series (key == series ID). Covers home-rail cards bound to seriesId
                // when "Use episode images in Next Up/Continue Watching" is OFF.
                if (!spState.Series.ContainsKey(key)) return TagStripDecision.Keep;
            }
            else
            {
                // Episode/Season resolved via the entry's captured parent SeriesId.
                if (string.IsNullOrEmpty(entry.SeriesId)) return TagStripDecision.Keep;
                if (!spState.Series.ContainsKey(entry.SeriesId)) return TagStripDecision.Keep;
            }

            // ── Watched / season-exempt gate ──
            // Played state is checked in-memory (no per-entry library scan). Episodes:
            // Played skips the strip. Seasons: S≤1 OR any-episode-watched are exempt
            // (poster + non-rating tags kept, only the series-fallback rating stripped).
            if (Guid.TryParse(key, out var entryGuid))
            {
                if (isEpisode || isMovie)
                {
                    if (isPlayed(entryGuid)) return TagStripDecision.Keep;
                }
                else if (isSeason)
                {
                    var sNum = seasonIndexNumber(entryGuid);
                    if (sNum.HasValue)
                    {
                        // S0/S1 posters always pass (their existence isn't a spoiler),
                        // as do seasons with any watched episode — "exempt".
                        var exempt = sNum.Value <= 1 || seasonAnyWatched(entryGuid);
                        if (exempt) return TagStripDecision.SeasonRatingOnly;
                    }
                    // sNum == null (id isn't a resolvable Season) falls through to Strip.
                }
            }
            else
            {
                // A future TagCacheService key-format change is observable rather than
                // silently stripping every rail; the played check is skipped, but the
                // scope-matched entry is still stripped (fail-closed).
                onKeyNotGuid(key);
            }

            return TagStripDecision.Strip;
        }

        /// <summary>
        /// Produce the entry to serve for a resolved decision. NEVER mutates
        /// <paramref name="entry"/>: returns a stripped <see cref="TagCacheEntry.Clone"/>
        /// when something changes, else the original shared instance.
        /// </summary>
        internal static TagCacheEntry ApplyTagStrip(
            TagCacheEntry entry,
            TagStripDecision decision,
            bool stripGenres,
            bool stripRatings,
            bool sanitizeTitleStreams)
        {
            if (decision == TagStripDecision.Keep) return entry;

            if (decision == TagStripDecision.SeasonRatingOnly)
            {
                // Exempt seasons keep their poster + non-rating tags, but a season
                // carries only the series-FALLBACK rating (hidden on the guarded
                // series everywhere else). Strip just the rating so it can't surface
                // via the server tag cache. Nothing to do when ratings aren't being
                // stripped or the entry has no rating — serve the shared instance.
                if (stripRatings && (entry.CommunityRating != null || entry.CriticRating != null))
                {
                    var seasonStripped = entry.Clone();
                    seasonStripped.CommunityRating = null;
                    seasonStripped.CriticRating = null;
                    return seasonStripped;
                }
                return entry;
            }

            // Full strip. Clone before mutating — see TagCacheEntry.Clone().
            var stripped = entry.Clone();
            if (stripGenres)
            {
                stripped.Genres = Array.Empty<string>();
                stripped.AudioLanguages = null;
                stripped.StreamData = null;
            }
            if (stripRatings)
            {
                stripped.CommunityRating = null;
                stripped.CriticRating = null;
            }
            // When StreamData wasn't already wiped by the tag-strip but title
            // replacement / overview strip is on, sanitize its title-bearing fields.
            // Clone StreamData (same cross-user-mutation hazard). qualitytags.js
            // recomputes overlay text from Codec/Height/VideoRangeType, so dropping
            // DisplayTitle/ItemName/paths is acceptable.
            if (sanitizeTitleStreams && stripped.StreamData != null && !stripGenres)
            {
                var sd = stripped.StreamData;
                stripped.StreamData = new TagStreamData
                {
                    ItemName = null,
                    ItemPath = null,
                    Streams = sd.Streams?.Select(st => new TagMediaStream
                    {
                        Type = st.Type,
                        Language = st.Language,
                        Codec = st.Codec,
                        CodecTag = st.CodecTag,
                        Profile = st.Profile,
                        Height = st.Height,
                        Channels = st.Channels,
                        ChannelLayout = st.ChannelLayout,
                        VideoRangeType = st.VideoRangeType,
                        DisplayTitle = null,
                    }).ToList(),
                    Sources = sd.Sources?.Select(_ => new TagMediaSource
                    {
                        Path = null,
                        Name = null,
                    }).ToList(),
                };
            }
            return stripped;
        }

        /// <summary>
        /// Walk a per-user cache response and replace each guarded entry with its
        /// stripped clone. Mutates the supplied dictionary (a per-request result), not
        /// the shared cache. <paramref name="resolve"/> yields the per-entry decision.
        /// </summary>
        internal static void StripCacheForUser(
            IDictionary<string, TagCacheEntry> items,
            bool stripGenres,
            bool stripRatings,
            bool sanitizeTitleStreams,
            Func<string, TagCacheEntry, TagStripDecision> resolve)
        {
            foreach (var key in items.Keys.ToList())
            {
                var entry = items[key];
                if (entry == null) continue;
                var decision = resolve(key, entry);
                if (decision == TagStripDecision.Keep) continue;
                items[key] = ApplyTagStrip(entry, decision, stripGenres, stripRatings, sanitizeTitleStreams);
            }
        }

        /// <summary>
        /// Load the cache from disk on startup.
        /// </summary>
        public void LoadFromDisk()
        {
            var path = CacheFilePath;
            if (!File.Exists(path))
            {
                _logger.LogInformation("[TagCache] No cache file found, starting empty");
                return;
            }

            try
            {
                var json = File.ReadAllText(path);
                var data = JsonSerializer.Deserialize<TagCacheDiskFormat>(json);
                if (data?.Items != null)
                {
                    // Discard a cache written by an older schema (e.g. predating
                    // SeriesId) rather than serving entries the strip paths can't
                    // process. Starting empty is safe — the Build task rebuilds it.
                    if (data.SchemaVersion != CurrentCacheSchemaVersion)
                    {
                        _logger.LogInformation($"[TagCache] On-disk cache schema v{data.SchemaVersion} != current v{CurrentCacheSchemaVersion}; discarding {data.Items.Count} entries and rebuilding on next scan.");
                        return;
                    }
                    var loaded = new ConcurrentDictionary<string, TagCacheEntry>(data.Items);
                    lock (_cacheMutationLock)
                    {
                        _cache = loaded;
                        Interlocked.Exchange(ref _version, data.Version);
                        Interlocked.Exchange(ref _lastModified, data.LastModified);
                        Interlocked.Exchange(ref _changeVersion, 0);
                        Interlocked.Exchange(ref _persistedChangeVersion, 0);
                    }
                    _logger.LogInformation($"[TagCache] Loaded {_cache.Count} entries from disk (v{data.Version}, schema v{data.SchemaVersion})");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[TagCache] Failed to load cache from disk: {ex.Message}");
            }
        }

        /// <summary>
        /// Persist the cache to disk using atomic write (temp file + rename).
        /// </summary>
        public void SaveToDisk()
        {
            lock (_saveLock)
            {
                try
                {
                    var dir = Path.GetDirectoryName(CacheFilePath);
                    if (dir != null) Directory.CreateDirectory(dir);

                    Dictionary<string, TagCacheEntry> itemSnapshot;
                    long changeVersionToPersist;
                    long cacheVersion;
                    long lastModified;
                    lock (_cacheMutationLock)
                    {
                        itemSnapshot = new Dictionary<string, TagCacheEntry>(_cache);
                        changeVersionToPersist = Interlocked.Read(ref _changeVersion);
                        cacheVersion = Interlocked.Read(ref _version);
                        lastModified = Interlocked.Read(ref _lastModified);
                    }
                    SaveSnapshotCapturedForTest?.Invoke();

                    var data = new TagCacheDiskFormat
                    {
                        SchemaVersion = CurrentCacheSchemaVersion,
                        Version = cacheVersion,
                        LastModified = lastModified,
                        Items = itemSnapshot
                    };

                    var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = false });
                    var tempPath = CacheFilePath + ".tmp";
                    File.WriteAllText(tempPath, json);
                    File.Move(tempPath, CacheFilePath, overwrite: true);
                    // Only acknowledge the generation captured in itemSnapshot.
                    // A concurrent update has a larger _changeVersion and remains
                    // dirty for the timer's next pass.
                    Interlocked.Exchange(ref _persistedChangeVersion, changeVersionToPersist);
                    _logger.LogInformation($"[TagCache] Saved {itemSnapshot.Count} entries to disk");
                }
                catch (Exception ex)
                {
                    _logger.LogError($"[TagCache] Failed to save cache to disk: {ex.Message}");
                }
            }
        }

        private void ScheduleDebouncedSave()
        {
            // Reuse existing timer if possible, otherwise create a new one.
            // Change() resets the countdown without creating a new object.
            var existing = _debounceSaveTimer;
            if (existing != null)
            {
                try
                {
                    existing.Change(TimeSpan.FromSeconds(30), Timeout.InfiniteTimeSpan);
                    return;
                }
                catch (ObjectDisposedException) { }
            }
            var timer = new Timer(_ =>
            {
                if (Interlocked.Read(ref _changeVersion) != Interlocked.Read(ref _persistedChangeVersion))
                {
                    SaveToDisk();
                }
            }, null, TimeSpan.FromSeconds(30), Timeout.InfiniteTimeSpan);
            var old = Interlocked.Exchange(ref _debounceSaveTimer, timer);
            if (old != null && !ReferenceEquals(old, timer))
            {
                old.Dispose();
            }
        }

        public void Dispose()
        {
            var timer = Interlocked.Exchange(ref _debounceSaveTimer, null);
            timer?.Dispose();
            if (Interlocked.Read(ref _changeVersion) != Interlocked.Read(ref _persistedChangeVersion))
            {
                SaveToDisk();
            }
        }

        /// <summary>
        /// Build a TagCacheEntry for a single library item.
        /// For Series/Season, resolves first-episode data server-side.
        /// </summary>
        private TagCacheEntry? BuildEntryForItem(BaseItem item)
        {
            try
            {
                var kind = item.GetBaseItemKind();
                var isContainer = kind == BaseItemKind.Series || kind == BaseItemKind.Season;

                // Capture parent series ID for Episodes/Seasons so the Spoiler
                // Guard filter can strip unwatched-episode entries without a
                // library lookup per entry on every GetTagCache request.
                string? seriesIdN = null;
                if (item is MediaBrowser.Controller.Entities.TV.Episode tcEp)
                {
                    if (tcEp.SeriesId != Guid.Empty) seriesIdN = tcEp.SeriesId.ToString("N");
                }
                else if (item is MediaBrowser.Controller.Entities.TV.Season tcSeason)
                {
                    if (tcSeason.SeriesId != Guid.Empty) seriesIdN = tcSeason.SeriesId.ToString("N");
                }

                var entry = new TagCacheEntry
                {
                    Type = kind.ToString(),
                    TmdbId = item.ProviderIds?.TryGetValue("Tmdb", out var tmdbId) == true ? tmdbId : null,
                    Genres = item.Genres,
                    CommunityRating = item.CommunityRating,
                    CriticRating = item.CriticRating,
                    LastUpdated = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    SeriesId = seriesIdN,
                };

                if (isContainer)
                {
                    var firstEp = GetFirstEpisode(item);
                    if (firstEp != null)
                    {
                        if (entry.Genres == null || entry.Genres.Length == 0)
                        {
                            entry.Genres = firstEp.Genres;
                        }

                        var (streams, sources, languages) = ExtractMediaData(firstEp);
                        entry.StreamData = new TagStreamData
                        {
                            Streams = streams,
                            Sources = sources,
                            ItemName = firstEp.Name,
                            ItemPath = string.IsNullOrEmpty(firstEp.Path) ? null : Path.GetFileName(firstEp.Path)
                        };
                        entry.AudioLanguages = languages;
                    }

                    if (kind == BaseItemKind.Season && entry.CommunityRating == null)
                    {
                        var series = GetParentSeries(item);
                        if (series != null)
                        {
                            entry.CommunityRating = series.CommunityRating;
                            entry.CriticRating = series.CriticRating;
                            if (entry.Genres == null || entry.Genres.Length == 0)
                            {
                                entry.Genres = series.Genres;
                            }
                        }
                    }

                    // For Season: store parent series TMDB ID + season number for user review key
                    if (kind == BaseItemKind.Season && item is MediaBrowser.Controller.Entities.TV.Season season)
                    {
                        var series = GetParentSeries(item);
                        if (series?.ProviderIds?.TryGetValue("Tmdb", out var seriesTmdb) == true)
                            entry.SeriesTmdbId = seriesTmdb;
                        entry.SeasonNumber = season.IndexNumber;
                    }
                }
                else
                {
                    var (streams, sources, languages) = ExtractMediaData(item);
                    entry.StreamData = new TagStreamData
                    {
                        Streams = streams,
                        Sources = sources,
                        ItemName = item.Name,
                        ItemPath = string.IsNullOrEmpty(item.Path) ? null : Path.GetFileName(item.Path)
                    };
                    entry.AudioLanguages = languages;

                    if (kind == BaseItemKind.Episode && entry.CommunityRating == null)
                    {
                        var series = GetParentSeries(item);
                        if (series != null)
                        {
                            entry.CommunityRating = series.CommunityRating;
                            entry.CriticRating = series.CriticRating;
                        }
                    }

                    // For Episode: store parent series TMDB ID + season/episode numbers for user review key
                    if (kind == BaseItemKind.Episode && item is MediaBrowser.Controller.Entities.TV.Episode ep)
                    {
                        var series = GetParentSeries(item);
                        if (series?.ProviderIds?.TryGetValue("Tmdb", out var seriesTmdb) == true)
                            entry.SeriesTmdbId = seriesTmdb;
                        entry.SeasonNumber = ep.ParentIndexNumber;
                        entry.EpisodeNumber = ep.IndexNumber;
                    }
                }

                return entry;
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[TagCache] Failed to build entry for {item.Id}: {ex.Message}");
                return null;
            }
        }

        private (List<TagMediaStream>, List<TagMediaSource>, string[]) ExtractMediaData(BaseItem item)
        {
            var streams = new List<TagMediaStream>();
            var sources = new List<TagMediaSource>();
            var languages = new HashSet<string>();

            try
            {
                var mediaSources = item.GetMediaSources(false);
                foreach (var source in mediaSources)
                {
                    sources.Add(new TagMediaSource
                    {
                        Path = string.IsNullOrEmpty(source.Path) ? null : Path.GetFileName(source.Path),
                        Name = source.Name
                    });

                    if (source.MediaStreams == null) continue;
                    foreach (var s in source.MediaStreams)
                    {
                        if (s.Type != MediaStreamType.Video && s.Type != MediaStreamType.Audio)
                            continue;

                        streams.Add(new TagMediaStream
                        {
                            Type = s.Type.ToString(),
                            Language = s.Language,
                            Codec = s.Codec,
                            CodecTag = s.CodecTag,
                            Profile = s.Profile,
                            Height = s.Height,
                            Channels = s.Channels,
                            ChannelLayout = s.ChannelLayout,
                            VideoRangeType = s.VideoRangeType.ToString(),
                            DisplayTitle = s.DisplayTitle
                        });

                        if (s.Type == MediaStreamType.Audio && !string.IsNullOrEmpty(s.Language))
                        {
                            var lang = s.Language.ToLowerInvariant();
                            if (lang != "und" && lang != "root")
                            {
                                languages.Add(lang);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[TagCache] Failed to extract media data for {item.Id}: {ex.Message}");
            }

            return (streams, sources, languages.ToArray());
        }

        private BaseItem? GetFirstEpisode(BaseItem container)
        {
            try
            {
                var epQuery = new InternalItemsQuery
                {
                    ParentId = container.Id,
                    IncludeItemTypes = new[] { BaseItemKind.Episode },
                    Recursive = true,
                    Limit = 1,
                    OrderBy = new[] { (ItemSortBy.PremiereDate, JSortOrder.Ascending) }
                };
                return _libraryManager.GetItemList(epQuery).FirstOrDefault();
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[TagCache] Failed to get first episode for {container.Id}: {ex.Message}");
                return null;
            }
        }

        private BaseItem? GetParentSeries(BaseItem item)
        {
            try
            {
                Guid? seriesId = null;
                if (item is MediaBrowser.Controller.Entities.TV.Episode ep)
                    seriesId = ep.SeriesId;
                else if (item is MediaBrowser.Controller.Entities.TV.Season season)
                    seriesId = season.SeriesId;

                if (seriesId.HasValue && seriesId.Value != Guid.Empty)
                {
                    return _libraryManager.GetItemById<BaseItem>(seriesId.Value);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[TagCache] Failed to get parent series for {item.Id}: {ex.Message}");
            }
            return null;
        }

        private class TagCacheDiskFormat
        {
            // On-disk entry schema. Absent (0) in caches written before this
            // field existed, so they read as != CurrentCacheSchemaVersion and
            // are discarded + rebuilt. Distinct from Version (content revision).
            public int SchemaVersion { get; set; }
            public long Version { get; set; }
            public long LastModified { get; set; }
            public Dictionary<string, TagCacheEntry> Items { get; set; } = new();
        }
    }
}
