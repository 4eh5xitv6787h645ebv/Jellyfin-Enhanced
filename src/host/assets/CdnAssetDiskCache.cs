using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using CdnAsset = Jellyfin.Plugin.JellyfinEnhanced.Services.CdnAssetService.CdnAsset;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>Reads and writes the existing CDN cache format and enforces its disk budget.</summary>
    internal sealed class CdnAssetDiskCache
    {
        private readonly Logger _logger;
        private readonly string _cacheDir;

        internal CdnAssetDiskCache(Logger logger, string cacheDir)
        {
            _logger = logger;
            _cacheDir = cacheDir;
        }

        // Total on-disk cache budget. Even though every source is a fixed allow-list, an
        // anonymous caller can still cause many distinct valid assets to be cached, so the
        // cache is swept back under budget (oldest-first eviction) to bound disk growth.
        private const long MaxCacheBytes = 512L * 1024 * 1024;   // 512 MB
        private const long SweepThresholdBytes = 64L * 1024 * 1024; // sweep after ~64 MB written
        private static long _bytesSinceSweep;
        private static long _tmpCounter;
        private static readonly object _sweepLock = new();

        internal (string BinPath, string MetaPath) CachePaths(string source, string path)
        {
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path))).ToLowerInvariant();
            var dir = Path.Combine(_cacheDir, source);
            return (Path.Combine(dir, hash + ".bin"), Path.Combine(dir, hash + ".meta.json"));
        }

        internal void EnsureCacheDir()
        {
            try
            {
                Directory.CreateDirectory(_cacheDir);
            }
            catch (Exception ex)
            {
                _logger.Warning($"[CDN] Could not create cache directory: {ex.Message}");
            }
        }

        internal bool TryReadDisk(string binPath, string metaPath, out CdnAsset asset, out DateTime cachedAt)
        {
            asset = null!;
            cachedAt = DateTime.MinValue;
            try
            {
                if (!File.Exists(binPath) || !File.Exists(metaPath))
                {
                    return false;
                }

                var meta = JsonConvert.DeserializeObject<CacheMeta>(File.ReadAllText(metaPath));
                if (meta == null || string.IsNullOrEmpty(meta.ContentType) || string.IsNullOrEmpty(meta.ETag))
                {
                    return false;
                }

                var content = File.ReadAllBytes(binPath);
                asset = new CdnAsset(content, meta.ContentType, meta.ETag);
                cachedAt = DateTimeOffset.FromUnixTimeMilliseconds(meta.FetchedAt).UtcDateTime;
                return true;
            }
            catch (Exception ex)
            {
                _logger.Debug($"[CDN] Failed to read disk cache entry: {ex.Message}");
                return false;
            }
        }

        internal void WriteDisk(string binPath, string metaPath, CdnAsset asset)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(binPath)!);
                var meta = JsonConvert.SerializeObject(new CacheMeta
                {
                    ContentType = asset.ContentType,
                    ETag = asset.ETag,
                    FetchedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });

                // Write to temp files then atomically rename into place (rename is atomic on
                // the same filesystem), so a concurrent reader never sees a half-written or
                // truncated file. The bin is published before the meta, so the only possible
                // interleaving a reader can catch is new content paired with the old ETag,
                // which self-corrects on the next revalidation — never a corrupt body.
                var n = Interlocked.Increment(ref _tmpCounter);
                var binTmp = $"{binPath}.{n}.tmp";
                var metaTmp = $"{metaPath}.{n}.tmp";
                File.WriteAllBytes(binTmp, asset.Content);
                File.Move(binTmp, binPath, overwrite: true);
                File.WriteAllText(metaTmp, meta);
                File.Move(metaTmp, metaPath, overwrite: true);

                MaybeEnforceCacheBudget(asset.Content.Length);
            }
            catch (Exception ex)
            {
                _logger.Warning($"[CDN] Failed to write disk cache entry: {ex.Message}");
            }
        }

        /// <summary>
        /// After enough bytes have been written, sweep the cache back under
        /// <see cref="MaxCacheBytes"/> by evicting the oldest entries. Non-blocking: if a
        /// sweep is already running, this returns immediately.
        /// </summary>
        private void MaybeEnforceCacheBudget(long bytesWritten)
        {
            if (Interlocked.Add(ref _bytesSinceSweep, bytesWritten) < SweepThresholdBytes)
            {
                return;
            }

            Interlocked.Exchange(ref _bytesSinceSweep, 0);
            if (!Monitor.TryEnter(_sweepLock))
            {
                return; // a sweep is already in progress
            }

            try
            {
                EnforceCacheBudget();
            }
            catch (Exception ex)
            {
                _logger.Warning($"[CDN] Cache budget sweep failed: {ex.Message}");
            }
            finally
            {
                Monitor.Exit(_sweepLock);
            }
        }

        private void EnforceCacheBudget()
        {
            if (!Directory.Exists(_cacheDir))
            {
                return;
            }

            var bins = new DirectoryInfo(_cacheDir).GetFiles("*.bin", SearchOption.AllDirectories);
            long total = 0;
            foreach (var f in bins)
            {
                total += f.Length;
            }

            if (total <= MaxCacheBytes)
            {
                return;
            }

            // Evict oldest-written entries (bin + its sibling meta) until back under 80% of budget.
            var target = MaxCacheBytes * 8 / 10;
            var evicted = 0;
            foreach (var f in bins.OrderBy(f => f.LastWriteTimeUtc))
            {
                if (total <= target)
                {
                    break;
                }

                try
                {
                    total -= f.Length;
                    f.Delete();
                    // bin is "<hash>.bin"; its meta sibling is "<hash>.meta.json".
                    var meta = f.FullName[..^4] + ".meta.json";
                    if (File.Exists(meta))
                    {
                        File.Delete(meta);
                    }

                    evicted++;
                }
                catch { /* best effort; a file held open elsewhere is skipped */ }
            }

            _logger.Info($"[CDN] Cache over budget; evicted {evicted} oldest entries.");
        }

        private sealed class CacheMeta
        {
            public string ContentType { get; set; } = string.Empty;
            public string ETag { get; set; } = string.Empty;
            public long FetchedAt { get; set; }
        }
    }
}
