using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;

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
        private readonly Logger _logger;
        private readonly LanguageEnrichmentService _languageEnrichment;
        private volatile ConcurrentDictionary<string, TagCacheEntry> _cache = new();
        private readonly object _saveLock = new();
        private long _version;
        private long _lastModified;
        private Timer? _debounceSaveTimer;
        private volatile bool _dirty;

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

        public TagCacheService(
            ILibraryManager libraryManager,
            IApplicationPaths applicationPaths,
            Logger logger,
            LanguageEnrichmentService languageEnrichment)
        {
            _libraryManager = libraryManager;
            _applicationPaths = applicationPaths;
            _logger = logger;
            _languageEnrichment = languageEnrichment;
        }

        public long Version => Interlocked.Read(ref _version);
        public long LastModified => Interlocked.Read(ref _lastModified);
        public int Count => _cache.Count;

        private string CacheFilePath =>
            Path.Combine(_applicationPaths.PluginsPath, "configurations", "Jellyfin.Plugin.JellyfinEnhanced", "tag-cache.json");

        /// <summary>
        /// Build the complete tag cache for all library items.
        /// Called by the scheduled task on startup and periodically.
        /// </summary>
        public void BuildFullCache(IProgress<double>? progress, CancellationToken cancellationToken)
        {
            _logger.Info("[TagCache] Starting full cache build...");
            var sw = System.Diagnostics.Stopwatch.StartNew();

            // Refresh language enrichment cache from arrs BEFORE walking items, so each item
            // can pick up regional variants synchronously. Force=true so a deliberate rebuild
            // always re-pulls from the arrs (the 6-hour TTL only applies to background warm-ups).
            // Connectivity/parse failures inside the service are already handled there; this
            // outer catch only fires on unexpected bugs (e.g. disposed semaphore). We narrow
            // the caught type so genuine bugs surface as Error instead of being masked as a
            // routine "arr is down" Warning — if a NullReferenceException ever lands here,
            // something is actually broken.
            try
            {
                _languageEnrichment.EnsureFreshAsync(cancellationToken, force: true).GetAwaiter().GetResult();
            }
            catch (OperationCanceledException) { throw; }
            catch (ObjectDisposedException ex)
            {
                _logger.Warning($"[TagCache] Language enrichment service was disposed mid-refresh: {ex.Message}");
            }
            catch (InvalidOperationException ex)
            {
                _logger.Warning($"[TagCache] Language enrichment refresh failed: {ex.Message}");
            }
            catch (System.Net.Http.HttpRequestException ex)
            {
                _logger.Warning($"[TagCache] Language enrichment connectivity failure: {ex.Message}");
            }

            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = TaggableTypes.ToArray(),
                IsVirtualItem = false,
                Recursive = true
            }).ToList();

            _logger.Info($"[TagCache] Found {allItems.Count} taggable items");

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

            // Preserve admin-set ManualRegionOverrides from the old cache. These are set
            // via the per-item flag-click popover and must survive full rebuilds.
            var oldCache = _cache;
            foreach (var kvp in oldCache)
            {
                if (kvp.Value.ManualRegionOverrides != null
                    && kvp.Value.ManualRegionOverrides.Count > 0
                    && newCache.TryGetValue(kvp.Key, out var newEntry))
                {
                    newEntry.ManualRegionOverrides = kvp.Value.ManualRegionOverrides;
                }
            }

            // Inherit series-level overrides to Season/Episode entries that don't have
            // their own override. We use the allItems list (still in memory) to resolve
            // each child's SeriesId cheaply.
            foreach (var item in allItems)
            {
                var kind = item.GetBaseItemKind();
                if (kind != BaseItemKind.Season && kind != BaseItemKind.Episode) continue;

                var key = item.Id.ToString("N").ToLowerInvariant();
                if (!newCache.TryGetValue(key, out var childEntry)) continue;
                if (childEntry.ManualRegionOverrides != null) continue; // has own override

                Guid? seriesId = null;
                if (item is MediaBrowser.Controller.Entities.TV.Season s) seriesId = s.SeriesId;
                else if (item is MediaBrowser.Controller.Entities.TV.Episode e) seriesId = e.SeriesId;

                if (seriesId.HasValue && seriesId.Value != Guid.Empty)
                {
                    var seriesKey = seriesId.Value.ToString("N").ToLowerInvariant();
                    if (newCache.TryGetValue(seriesKey, out var seriesEntry)
                        && seriesEntry.ManualRegionOverrides != null
                        && seriesEntry.ManualRegionOverrides.Count > 0)
                    {
                        childEntry.ManualRegionOverrides = seriesEntry.ManualRegionOverrides;
                    }
                }
            }

            // Atomic reference swap — readers see old or new cache, never partial
            _cache = newCache;
            Interlocked.Increment(ref _version);
            Interlocked.Exchange(ref _lastModified, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            // Invalidate user access cache since items may have changed
            _userAccessCache.Clear();
            progress?.Report(100);

            sw.Stop();
            _logger.Info($"[TagCache] Full cache build complete: {_cache.Count} entries in {sw.Elapsed.TotalSeconds:F1}s");

            SaveToDisk();
        }

        /// <summary>
        /// Set or clear ManualRegionOverrides on a specific cache entry.
        /// Called from the language-region controller endpoint. Triggers a debounced save.
        /// </summary>
        public void SetManualRegionOverride(string cacheKey, Dictionary<string, string>? overrides)
        {
            if (_cache.TryGetValue(cacheKey, out var entry))
            {
                entry.ManualRegionOverrides = overrides;
                Interlocked.Increment(ref _version);
                Interlocked.Exchange(ref _lastModified, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                ScheduleDebouncedSave();
            }
        }

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
                // Preserve admin-set ManualRegionOverrides across metadata refreshes.
                if (_cache.TryGetValue(key, out var oldEntry)
                    && oldEntry.ManualRegionOverrides != null
                    && oldEntry.ManualRegionOverrides.Count > 0)
                {
                    entry.ManualRegionOverrides = oldEntry.ManualRegionOverrides;
                }
                _cache[key] = entry;
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
            if (_cache.TryRemove(key, out _))
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

        /// <summary>
        /// Load the cache from disk on startup.
        /// </summary>
        public void LoadFromDisk()
        {
            var path = CacheFilePath;
            if (!File.Exists(path))
            {
                _logger.Info("[TagCache] No cache file found, starting empty");
                return;
            }

            try
            {
                var json = File.ReadAllText(path);
                var data = JsonSerializer.Deserialize<TagCacheDiskFormat>(json);
                if (data?.Items != null)
                {
                    var loaded = new ConcurrentDictionary<string, TagCacheEntry>(data.Items);
                    _cache = loaded;
                    Interlocked.Exchange(ref _version, data.Version);
                    Interlocked.Exchange(ref _lastModified, data.LastModified);
                    _logger.Info($"[TagCache] Loaded {_cache.Count} entries from disk (v{data.Version})");
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"[TagCache] Failed to load cache from disk: {ex.Message}");
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

                    var data = new TagCacheDiskFormat
                    {
                        Version = Interlocked.Read(ref _version),
                        LastModified = Interlocked.Read(ref _lastModified),
                        Items = new Dictionary<string, TagCacheEntry>(_cache)
                    };

                    var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = false });
                    var tempPath = CacheFilePath + ".tmp";
                    File.WriteAllText(tempPath, json);
                    File.Move(tempPath, CacheFilePath, overwrite: true);
                    _dirty = false;
                    _logger.Info($"[TagCache] Saved {_cache.Count} entries to disk");
                }
                catch (Exception ex)
                {
                    _logger.Error($"[TagCache] Failed to save cache to disk: {ex.Message}");
                }
            }
        }

        private void ScheduleDebouncedSave()
        {
            _dirty = true;
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
                if (_dirty) SaveToDisk();
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
            if (_dirty) SaveToDisk();
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

                var entry = new TagCacheEntry
                {
                    Type = kind.ToString(),
                    Genres = item.Genres,
                    CommunityRating = item.CommunityRating,
                    CriticRating = item.CriticRating,
                    LastUpdated = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
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
                        // Resolve regional variants from the SERIES (Sonarr is keyed by series TVDB id),
                        // not the first episode whose ProviderIds usually lack TVDB.
                        var regional = _languageEnrichment.GetForItem(item);
                        if (regional != null && regional.Count > 0) entry.RegionalAudioLanguages = regional;
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
                    var regional = _languageEnrichment.GetForItem(item);
                    if (regional != null && regional.Count > 0) entry.RegionalAudioLanguages = regional;

                    if (kind == BaseItemKind.Episode && entry.CommunityRating == null)
                    {
                        var series = GetParentSeries(item);
                        if (series != null)
                        {
                            entry.CommunityRating = series.CommunityRating;
                            entry.CriticRating = series.CriticRating;
                        }
                    }
                }

                return entry;
            }
            catch (Exception ex)
            {
                _logger.Warning($"[TagCache] Failed to build entry for {item.Id}: {ex.Message}");
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
                _logger.Warning($"[TagCache] Failed to extract media data for {item.Id}: {ex.Message}");
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
                _logger.Warning($"[TagCache] Failed to get first episode for {container.Id}: {ex.Message}");
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
                _logger.Warning($"[TagCache] Failed to get parent series for {item.Id}: {ex.Message}");
            }
            return null;
        }

        private class TagCacheDiskFormat
        {
            public long Version { get; set; }
            public long LastModified { get; set; }
            public Dictionary<string, TagCacheEntry> Items { get; set; } = new();
        }
    }
}
