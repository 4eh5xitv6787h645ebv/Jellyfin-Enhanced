using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    public sealed class PosterTagCache
    {
        private const int MaxEntries = 4000;
        private const long MaxBytes = 256L * 1024L * 1024L; // 256 MB total cap

        private readonly Logger _logger;
        private readonly string _cacheDir;
        private readonly ConcurrentDictionary<string, CacheEntry> _index = new();
        private long _totalBytes;
        private readonly object _evictionLock = new();

        public PosterTagCache(Logger logger, IApplicationPaths appPaths)
        {
            _logger = logger;
            _cacheDir = Path.Combine(appPaths.CachePath, "JellyfinEnhanced", "PosterTags");
            Directory.CreateDirectory(_cacheDir);
            HydrateIndex();
        }

        public string BuildKey(Guid itemId, byte[] sourceBytes, PosterTagSet tags, string fingerprint)
        {
            // Hash the source bytes so a Jellyfin re-encode (different size/quality)
            // produces a different cache entry. Cheap relative to a full Skia compose.
            var sb = new StringBuilder(96);
            sb.Append(itemId.ToString("N"));
            sb.Append('|').Append(tags.Genre ?? string.Empty);
            sb.Append('|').Append(tags.Rating?.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty);
            sb.Append('|').Append(fingerprint);
            sb.Append('|').Append(sourceBytes.Length);

            // Digest of head + tail (1 KB each) — fast and discriminates Jellyfin
            // size/quality variants. Use IncrementalHash so we never allocate the
            // intermediate concatenated buffer.
            using (var inc = IncrementalHash.CreateHash(HashAlgorithmName.SHA256))
            {
                if (sourceBytes.Length >= 1024)
                {
                    inc.AppendData(sourceBytes, 0, 1024);
                }
                else
                {
                    inc.AppendData(sourceBytes, 0, sourceBytes.Length);
                }
                if (sourceBytes.Length >= 2048)
                {
                    inc.AppendData(sourceBytes, sourceBytes.Length - 1024, 1024);
                }
                sb.Append('|').Append(Convert.ToHexString(inc.GetHashAndReset()));
            }

            var keyHash = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
            return Convert.ToHexString(keyHash);
        }

        public byte[]? TryGet(string key)
        {
            if (!_index.TryGetValue(key, out var entry))
            {
                return null;
            }

            try
            {
                entry.LastAccessTicks = DateTime.UtcNow.Ticks;
                return File.ReadAllBytes(entry.Path);
            }
            catch (Exception ex)
            {
                _logger.Warning($"[PosterTags] Cache read failed for {key[..8]}: {ex.Message}");
                Remove(key);
                return null;
            }
        }

        public void Put(string key, byte[] bytes)
        {
            // Defense-in-depth: cache key is SHA256 hex by construction, but
            // refuse anything that could escape _cacheDir if a future caller
            // forgets that contract.
            if (!IsValidHexKey(key))
            {
                _logger.Warning($"[PosterTags] Refusing cache write with invalid key");
                return;
            }

            var path = Path.Combine(_cacheDir, key + ".bin");
            var tmpPath = path + ".tmp";

            // Atomic write: write to a sibling temp file then move. A crash
            // mid-write leaves a .tmp orphan rather than a truncated .bin
            // that would later be served as a corrupt poster.
            try
            {
                File.WriteAllBytes(tmpPath, bytes);
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
                File.Move(tmpPath, path);
            }
            catch (Exception ex)
            {
                _logger.Warning($"[PosterTags] Cache write failed for {key[..8]} ({ex.GetType().Name}): {ex.Message}");
                try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { /* best-effort */ }
                return;
            }

            var entry = new CacheEntry
            {
                Path = path,
                Bytes = bytes.Length,
                LastAccessTicks = DateTime.UtcNow.Ticks,
            };

            // Race-safe: subtract previous entry's bytes if we are overwriting
            // an existing key (two concurrent Puts for the same poster).
            _index.AddOrUpdate(
                key,
                _ =>
                {
                    System.Threading.Interlocked.Add(ref _totalBytes, bytes.Length);
                    return entry;
                },
                (_, old) =>
                {
                    System.Threading.Interlocked.Add(ref _totalBytes, bytes.Length - old.Bytes);
                    return entry;
                });
            EvictIfNeeded();
        }

        private static bool IsValidHexKey(string key)
        {
            if (string.IsNullOrEmpty(key) || key.Length != 64)
            {
                return false;
            }
            foreach (var c in key)
            {
                if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f')))
                {
                    return false;
                }
            }
            return true;
        }

        private void Remove(string key)
        {
            if (_index.TryRemove(key, out var entry))
            {
                System.Threading.Interlocked.Add(ref _totalBytes, -entry.Bytes);
                try { File.Delete(entry.Path); } catch { /* best-effort */ }
            }
        }

        private void EvictIfNeeded()
        {
            if (_index.Count <= MaxEntries && System.Threading.Interlocked.Read(ref _totalBytes) <= MaxBytes)
            {
                return;
            }

            lock (_evictionLock)
            {
                while (_index.Count > MaxEntries || System.Threading.Interlocked.Read(ref _totalBytes) > MaxBytes)
                {
                    var oldest = _index.OrderBy(kv => kv.Value.LastAccessTicks).FirstOrDefault();
                    if (oldest.Key == null)
                    {
                        break;
                    }
                    Remove(oldest.Key);
                }
            }
        }

        private void HydrateIndex()
        {
            try
            {
                // Sweep stray .tmp files left over from a crash mid-write.
                foreach (var orphan in Directory.EnumerateFiles(_cacheDir, "*.tmp"))
                {
                    try { File.Delete(orphan); } catch { /* best-effort */ }
                }

                foreach (var file in Directory.EnumerateFiles(_cacheDir, "*.bin"))
                {
                    var info = new FileInfo(file);
                    var key = Path.GetFileNameWithoutExtension(info.Name);
                    if (!IsValidHexKey(key))
                    {
                        // Foreign filename in our cache dir — leave alone (don't
                        // delete files we don't own) but don't index either.
                        continue;
                    }
                    _index[key] = new CacheEntry
                    {
                        Path = file,
                        Bytes = info.Length,
                        LastAccessTicks = info.LastWriteTimeUtc.Ticks,
                    };
                    System.Threading.Interlocked.Add(ref _totalBytes, info.Length);
                }
                _logger.Info($"[PosterTags] Hydrated cache: {_index.Count} entries, {_totalBytes / 1024 / 1024} MB");
            }
            catch (Exception ex)
            {
                _logger.Warning($"[PosterTags] Cache hydrate failed: {ex.Message}");
            }
        }

        public void Purge()
        {
            lock (_evictionLock)
            {
                foreach (var key in _index.Keys.ToList())
                {
                    Remove(key);
                }
            }
            _logger.Info("[PosterTags] Cache purged");
        }

        private sealed class CacheEntry
        {
            public string Path { get; set; } = string.Empty;
            public long Bytes { get; set; }
            public long LastAccessTicks { get; set; }
        }
    }
}
