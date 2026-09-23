using System.Collections.Concurrent;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Api
{
    internal static class SeerrCacheState
    {

        // Server-side cache for proxied avatar images to avoid re-fetching from
        // upstream Seerr on every request. Entries expire after 1 hour.
        internal static readonly ConcurrentDictionary<string, (byte[] Content, string ContentType, string ETag, DateTime CachedAt)> _avatarCache = new();
        internal static readonly TimeSpan _avatarCacheDuration = TimeSpan.FromHours(1);

        // Cache for Seerr proxy responses (discovery/search endpoints)
        internal static readonly Dictionary<string, (string Content, DateTime CachedAt)> _responseCache = new();
        internal static readonly object _responseCacheLock = new();

        // Throttle for manual user import
        internal static DateTime _lastManualImport = DateTime.MinValue;
        internal static readonly object _importThrottleLock = new();

        // cache the result of /api/v1/status probes so a Seerr outage
        // doesn't cause every failed proxy call to issue a fresh status check.
        // Negative-cached for 30s; positive results expire on the same TTL.
        internal static (bool Active, DateTime CachedAt)? _seerrStatusCache;
        internal static readonly object _seerrStatusCacheLock = new();
        internal static readonly TimeSpan _seerrStatusCacheTtl = TimeSpan.FromSeconds(30);

        // Cache for request-page TMDB enrichments (movie/tv detail lookups via Jellyseerr)
        internal static readonly Dictionary<string, (TmdbEnrichmentResult Data, DateTime CachedAt)> _tmdbEnrichmentCache = new();
        internal static readonly object _tmdbEnrichmentCacheLock = new();
        internal static readonly ConcurrentDictionary<string, Task<TmdbEnrichmentResult>> _tmdbEnrichmentInFlight = new();

        internal sealed class TmdbEnrichmentResult
        {
            public string? Title { get; init; }
            public int? Year { get; init; }
            public string? PosterUrl { get; init; }
            public string? DigitalReleaseDate { get; init; }
            public string? TheatricalReleaseDate { get; init; }
            public string? InitialAirDate { get; init; }
            public string? NextAirDate { get; init; }
        }

        // Merged, unfiltered (all-instances) results are cached process-wide for a short TTL
        // tied to the admin's own poll interval — per-user visibility (DownloadsFilterByUserRequests /
        // DownloadsHistoryAdminOnly) is always applied fresh, AFTER the cache read, so nothing
        // user-specific is ever stored in these caches.
        internal static (List<object> Items, List<object> Errors, DateTime CachedAt)? _arrQueueCache;
        internal static readonly object _arrQueueCacheLock = new();
        internal static (List<dynamic> Items, DateTime CachedAt)? _arrHistoryCache;
        internal static readonly object _arrHistoryCacheLock = new();

        public static void ClearAllSeerrCachesOnConfigChange()
        {
            SeerrIdentityService.ClearUserCaches();
            lock (_responseCacheLock)
            {
                _responseCache.Clear();
            }
            lock (_tmdbEnrichmentCacheLock)
            {
                _tmdbEnrichmentCache.Clear();
            }
            // Avatar cache may reference the OLD Seerr URL — clear it too.
            _avatarCache.Clear();
            // also flush the cached status probe so admins see fresh
            // reachability immediately after fixing config.
            lock (_seerrStatusCacheLock) { _seerrStatusCache = null; }
            // Arr instance URLs/keys may have just changed too — drop the merged
            // queue/history caches rather than waiting out their TTL.
            lock (_arrQueueCacheLock) { _arrQueueCache = null; }
            lock (_arrHistoryCacheLock) { _arrHistoryCache = null; }
        }
    }
}
