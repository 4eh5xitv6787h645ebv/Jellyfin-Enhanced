using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    // Stable hash of plugin assembly version + the subset of plugin config
    // that affects rendered UI (sidebar entries, home tabs, branding).
    // Bumps when an admin toggles a feature so the bootstrap script's cache
    // key changes and clients re-fetch on the next request — no hard refresh.
    //
    // The hash material is salted with a per-server random GUID generated
    // once and held in memory. That defeats the dictionary attack where an
    // anonymous caller (the version endpoint is AllowAnonymous so the
    // bootstrap can fetch it pre-login) precomputes hashes for every combo
    // of feature toggles and reads back which features the admin has on.
    public static class ConfigVersion
    {
        private static readonly string _salt = Guid.NewGuid().ToString("N");
        private static readonly object _lock = new();
        private static string _cached = string.Empty;
        private static DateTime _cachedAt = DateTime.MinValue;
        // Monotonic counter incremented on every plugin config save.
        // Bumps the hash even when (a) the save changed only fields outside
        // the curated sidebar/tabs subset, (b) the file mtime can't be read
        // (filesystem permission / locking races), or (c) the underlying
        // filesystem has poor mtime granularity (FAT, NFS, container
        // overlayfs all round to ~1s, so two saves in the same second
        // produce identical mtimes — invisible to mtime-only diffing).
        private static long _saveCounter;

        public static string Current
        {
            get
            {
                lock (_lock)
                {
                    var now = DateTime.UtcNow;
                    if (now - _cachedAt < TimeSpan.FromSeconds(2) && !string.IsNullOrEmpty(_cached))
                    {
                        return _cached;
                    }
                    _cached = Compute();
                    _cachedAt = now;
                    return _cached;
                }
            }
        }

        public static (string Sidebar, string Tabs, string Config, string Translations) Topics()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            return (
                Sidebar:      Hash(SidebarMaterial(config)),
                Tabs:         Hash(TabsMaterial(config)),
                Config:       Current,
                Translations: HashTimestamp(config?.ClearTranslationCacheTimestamp ?? 0));
        }

        public static void Invalidate()
        {
            lock (_lock)
            {
                _cached = string.Empty;
                _cachedAt = DateTime.MinValue;
            }
        }

        // Called from the plugin's SaveConfiguration override on every save.
        // Increments the save counter and invalidates the cache so the next
        // /version response reflects the new hash without waiting for the 2s
        // cache window to expire.
        //
        // Holds _lock for both operations atomically — without it, a /version
        // request that arrived between the Increment and the Invalidate
        // could read the cached pre-save hash even though the counter had
        // already advanced (Compute() reads the counter at recompute time;
        // a fresh _cachedAt would let the reader skip recompute entirely).
        public static void OnConfigSaved()
        {
            lock (_lock)
            {
                Interlocked.Increment(ref _saveCounter);
                _cached = string.Empty;
                _cachedAt = DateTime.MinValue;
            }
        }

        private static string Compute()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            var version = JellyfinEnhanced.Instance?.Version.ToString() ?? "0";
            // The save counter is the primary "any save changed something"
            // signal — it's incremented from UpdateConfiguration, so it's
            // immune to filesystem mtime granularity (FAT/NFS/overlayfs round
            // to ~1s) and immune to read-time races. Mtime is folded in as
            // a secondary signal so out-of-band edits to the config file are
            // also picked up.
            var saveCounter = Interlocked.Read(ref _saveCounter);
            var mtime = ReadConfigMtime();
            var material = $"{version}|{SidebarMaterial(config)}|{TabsMaterial(config)}|{HashTimestamp(config?.ClearLocalStorageTimestamp ?? 0)}|{saveCounter}|{mtime}";
            return Hash(material);
        }

        // Returns the config file's last-write time in ticks, or
        // DateTime.UtcNow.Ticks if the file is unreadable. Returning the
        // current time on failure ensures the hash still bumps when the
        // read genuinely races a write — the alternative (return 0) would
        // collapse the hash to its non-mtime material and silently mask
        // saves that didn't touch the curated sidebar/tabs subset. The
        // save-counter mixed into Compute() is the authoritative signal
        // for in-process saves, so the mtime fallback only matters for
        // out-of-band file edits we can't detect any other way.
        private static long ReadConfigMtime()
        {
            try
            {
                var path = JellyfinEnhanced.Instance?.ConfigurationFilePath;
                if (string.IsNullOrEmpty(path) || !File.Exists(path)) return DateTime.UtcNow.Ticks;
                return File.GetLastWriteTimeUtc(path).Ticks;
            }
            catch (Exception ex)
            {
                JellyfinEnhanced.Instance?.LogVersionMtimeFailure(ex);
                return DateTime.UtcNow.Ticks;
            }
        }

        private static string SidebarMaterial(PluginConfiguration? c)
        {
            if (c is null) return string.Empty;
            return string.Join(',', new[]
            {
                Bool("calPg", c.CalendarPageEnabled && c.CalendarUsePluginPages),
                Bool("dlPg",  c.DownloadsPageEnabled && c.DownloadsUsePluginPages),
                Bool("bmPg",  c.BookmarksEnabled && c.BookmarksUsePluginPages),
                Bool("hcPg",  c.HiddenContentEnabled && c.HiddenContentUsePluginPages)
            });
        }

        private static string TabsMaterial(PluginConfiguration? c)
        {
            if (c is null) return string.Empty;
            return string.Join(',', new[]
            {
                Bool("calTb", c.CalendarPageEnabled && c.CalendarUseCustomTabs),
                Bool("dlTb",  c.DownloadsPageEnabled && c.DownloadsUseCustomTabs),
                Bool("bmTb",  c.BookmarksEnabled && c.BookmarksUseCustomTabs),
                Bool("hcTb",  c.HiddenContentEnabled && c.HiddenContentUseCustomTabs)
            });
        }

        private static string Bool(string key, bool value) => value ? key : "_" + key;

        private static string HashTimestamp(long timestamp) => timestamp.ToString(CultureInfo.InvariantCulture);

        private static string Hash(string material)
        {
            var bytes = Encoding.UTF8.GetBytes(_salt + "|" + material);
            var sha = SHA256.HashData(bytes);
            return Convert.ToHexString(sha)[..12];
        }
    }
}
