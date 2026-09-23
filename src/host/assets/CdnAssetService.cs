using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Local CDN subsystem. Every third-party static asset the client used to load
    /// directly from an external CDN (jsDelivr icons, flag CDNs, the Jellyfish theme
    /// colour sheets, remote locale JSON, …) is instead served from the plugin's own
    /// <c>/JellyfinEnhanced/cdn/{source}/{path}</c> route, backed by this service.
    /// (Google Fonts is bundled directly instead - see <c>GetBundledFont</c>.)
    ///
    /// Design goals:
    ///   * Clients ONLY ever hit the local plugin route — never an external host.
    ///   * Assets are cached on disk (not in RAM) so poster-sized fleets never
    ///     bloat the server process, and cached copies survive CDN outages.
    ///   * A scheduled task (<see cref="ScheduledTasks.RefreshCdnAssetsTask"/>) warms
    ///     and refreshes the <see cref="KnownAssets"/> set every 24h so the
    ///     "mutable" assets (icons/fonts/theme sheets/etc.) stay current.
    ///   * Every fetch is locked to a fixed allow-list of upstream bases + a
    ///     per-source content-type whitelist, so the route can never be turned into
    ///     an open proxy / SSRF vector by a crafted request path.
    /// </summary>
    public class CdnAssetService
    {
        private readonly Logger _logger;
        private readonly CdnAssetFetcher _fetcher;
        private readonly CdnAssetDiskCache _disk;

        // How long a cached asset is considered fresh before a background/on-demand
        // request will try to refresh it. Mirrors the client-side 24h translation cache
        // and the scheduled-task cadence.
        private static readonly TimeSpan CacheTtl = TimeSpan.FromHours(24);

        // Small in-memory hot layer: keeps the most-recently-served bytes so repeated
        // hits (icons on every card) don't re-read the disk. Bounded; not the source of
        // truth (the disk is).
        private static readonly ConcurrentDictionary<string, (CdnAsset Asset, DateTime CachedAt)> _hot = new();
        private const int HotCacheMax = 128;

        // Negative cache: keys that recently failed upstream (with no usable disk copy) are
        // remembered briefly so a flood of the same missing path can't re-hit upstream on
        // every request. This is the anonymous route's primary abuse guard together with
        // the outbound-fetch gate below.
        private static readonly ConcurrentDictionary<string, DateTime> _negativeCache = new();
        private static readonly TimeSpan NegativeCacheTtl = TimeSpan.FromMinutes(5);
        private const int NegativeCacheMax = 512;

        // Hard cap on concurrent OUTBOUND fetches across the whole plugin, so an
        // unauthenticated flood of distinct cache-miss paths can't exhaust the server's
        // sockets/connection pool — excess requests queue on this gate instead.
        private static readonly SemaphoreSlim _fetchGate = new(8, 8);

        public CdnAssetService(Logger logger, IHttpClientFactory httpClientFactory, IApplicationPaths applicationPaths)
        {
            _logger = logger;
            _fetcher = new CdnAssetFetcher(logger, httpClientFactory);
            _disk = new CdnAssetDiskCache(logger, Path.Combine(applicationPaths.PluginsPath, "configurations", "Jellyfin.Plugin.JellyfinEnhanced", "cdn-cache"));
        }

        /// <summary>An immutable cached asset ready to serve.</summary>
        public sealed record CdnAsset(byte[] Content, string ContentType, string ETag);

        /// <summary>Assets warmed by the scheduled refresh; ordered to preserve host pacing.</summary>
        public static readonly IReadOnlyList<(string Source, string Path)> KnownAssets = CdnAssetCatalog.KnownAssets;

        /// <summary>True when <paramref name="source"/> is a registered upstream.</summary>
        public bool IsValidSource(string source) => CdnAssetCatalog.Sources.ContainsKey(source);

        /// <summary>
        /// Returns the cached asset for (source, path), fetching and caching it from the
        /// upstream CDN when it is missing or stale. Returns <c>null</c> when the source
        /// is unknown, the path is unsafe, or the asset can't be obtained from cache or
        /// upstream.
        /// </summary>
        public async Task<CdnAsset?> GetAsync(string source, string path, bool forceRefresh, CancellationToken cancellationToken)
        {
            if (!CdnAssetCatalog.Sources.TryGetValue(source, out var src))
            {
                return null;
            }

            if (!CdnAssetCatalog.IsSafePath(path))
            {
                _logger.Warning($"[CDN] Rejected unsafe asset path for source '{source}'.");
                return null;
            }

            var key = $"{source}/{path}";

            // Hot in-memory layer (skipped on a forced refresh so the task always re-downloads).
            // Honours the same TTL as the disk so a lazily-cached asset (flags/locales) is not
            // pinned stale in memory for the whole process lifetime.
            if (!forceRefresh && _hot.TryGetValue(key, out var hot)
                && DateTime.UtcNow - hot.CachedAt < CacheTtl)
            {
                return hot.Asset;
            }

            var (binPath, metaPath) = _disk.CachePaths(source, path);

            // Serve from disk when fresh.
            if (!forceRefresh && _disk.TryReadDisk(binPath, metaPath, out var cachedAsset, out var cachedAt)
                && DateTime.UtcNow - cachedAt < CacheTtl)
            {
                Promote(key, cachedAsset);
                return cachedAsset;
            }

            // A path that recently failed upstream with no usable cache is short-circuited so a
            // flood of the same missing key can't re-hit upstream. Checked AFTER the hot/disk
            // layers so a copy that appeared in the meantime always wins over a stale negative
            // entry. Skipped on forceRefresh so the scheduled task can always retry.
            if (!forceRefresh && _negativeCache.TryGetValue(key, out var failedAt)
                && DateTime.UtcNow - failedAt < NegativeCacheTtl)
            {
                return null;
            }

            // Fetch (and cache) from upstream, bounded by the outbound-fetch gate.
            CdnAsset? fetched;
            await _fetchGate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                fetched = await _fetcher.FetchAsync(src, source, path, cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                _fetchGate.Release();
            }

            if (fetched != null)
            {
                _negativeCache.TryRemove(key, out _); // a forced refresh may have revived a previously-missing key
                _disk.WriteDisk(binPath, metaPath, fetched);
                Promote(key, fetched);
                return fetched;
            }

            // Upstream failed — fall back to a stale-but-usable disk copy if we have one
            // (resilience against transient CDN outages).
            if (_disk.TryReadDisk(binPath, metaPath, out var staleAsset, out _))
            {
                _logger.Debug($"[CDN] Serving stale cached copy of '{key}' after upstream fetch failure.");
                Promote(key, staleAsset);
                return staleAsset;
            }

            // Nothing upstream and nothing on disk: remember the miss briefly so repeats are cheap.
            RecordNegative(key);
            return null;
        }

        /// <summary>Remember a failed key for a short TTL, with a crude size bound.</summary>
        private static void RecordNegative(string key)
        {
            if (_negativeCache.Count >= NegativeCacheMax)
            {
                _negativeCache.Clear();
            }

            _negativeCache[key] = DateTime.UtcNow;
        }

        // Sources known to rate-limit a burst of same-host requests within a
        // few seconds (observed directly: Wikimedia Commons 429s a fresh install's
        // startup refresh of all "award-logos" entries, even though each request
        // on its own succeeds fine seconds apart). Everything else (jsdelivr,
        // Google Fonts, etc.) has never shown this and gets no artificial delay —
        // this is deliberately narrow, not a blanket slowdown of every refresh.
        private static readonly HashSet<string> BurstSensitiveSources = new(StringComparer.Ordinal) { "award-logos" };
        // Wikimedia's actual per-IP rate-limit threshold isn't documented, so this
        // is a deliberately conservative guess rather than a tuned value — cheap to
        // be generous here since it only adds a few seconds to a background refresh
        // that runs once at startup and once every 24h, not on the request path.
        private static readonly TimeSpan BurstSensitiveDelay = TimeSpan.FromSeconds(2);

        /// <summary>Forces a fresh download of every <see cref="KnownAssets"/> entry.</summary>
        public async Task RefreshKnownAsync(IProgress<double>? progress, CancellationToken cancellationToken)
        {
            _disk.EnsureCacheDir();
            var total = KnownAssets.Count;
            var done = 0;
            var ok = 0;
            string? previousSource = null;

            foreach (var (source, path) in KnownAssets)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (source == previousSource && BurstSensitiveSources.Contains(source))
                {
                    await Task.Delay(BurstSensitiveDelay, cancellationToken).ConfigureAwait(false);
                }
                previousSource = source;

                var asset = await GetAsync(source, path, forceRefresh: true, cancellationToken).ConfigureAwait(false);
                if (asset != null)
                {
                    ok++;
                }
                else
                {
                    _logger.Warning($"[CDN] Failed to refresh known asset '{source}/{path}'.");
                }

                done++;
                progress?.Report((double)done / total * 100);
            }

            _logger.Info($"[CDN] Refreshed {ok}/{total} known assets into the local cache.");
        }

        private static void Promote(string key, CdnAsset asset)
        {
            // Naive bound: clear when full. Icons are few and hot, so churn is negligible.
            if (_hot.Count >= HotCacheMax)
            {
                _hot.Clear();
            }

            _hot[key] = (asset, DateTime.UtcNow);
        }

    }
}
