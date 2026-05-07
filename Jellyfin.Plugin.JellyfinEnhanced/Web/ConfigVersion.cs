using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    /// <summary>
    /// Stable hash of plugin assembly version + the subset of plugin config
    /// that affects rendered UI (sidebar entries, home tabs, branding).
    /// Bumps when an admin toggles a feature so the bootstrap script's cache
    /// key changes and clients re-fetch on the next request — no hard refresh.
    /// </summary>
    public static class ConfigVersion
    {
        private static readonly object _lock = new();
        private static string _cached = string.Empty;
        private static DateTime _cachedAt = DateTime.MinValue;

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

        private static string Compute()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            var version = JellyfinEnhanced.Instance?.Version.ToString() ?? "0";
            var material = $"{version}|{SidebarMaterial(config)}|{TabsMaterial(config)}|{HashTimestamp(config?.ClearLocalStorageTimestamp ?? 0)}";
            return Hash(material);
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
            var bytes = Encoding.UTF8.GetBytes(material);
            var sha = SHA256.HashData(bytes);
            return Convert.ToHexString(sha)[..12];
        }
    }
}
