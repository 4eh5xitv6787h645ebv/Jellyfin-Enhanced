using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Api
{
    public sealed class OutboundApiPolicy
    {
        private readonly Logger _logger;
        public OutboundApiPolicy(Logger logger) => _logger = logger;

        public bool IsAllowedUrl(string url)
        {
            var allowed = Jellyfin.Plugin.JellyfinEnhanced.Helpers.ArrUrlGuard.IsAllowedUrl(url);
            if (!allowed && !string.IsNullOrWhiteSpace(url))
            {
                // Log at Error so admins can diagnose "instance doesn't return data"
                // issues caused by a URL that hits the block list (e.g. metadata endpoints, loopback).
                _logger.Error($"IsAllowedUrl rejected outbound URL: {url}");
            }
            return allowed;
        }

        public void WarnIfArrInstancesCorrupt(PluginConfiguration config)
        {
            if (config.IsSonarrInstancesCorrupt())
            {
                var key = "sonarr:" + (config.SonarrInstances ?? "");
                bool firstSeen;
                lock (_loggedCorruptArrConfigLock) firstSeen = _loggedCorruptArrConfig.Add(key);
                if (firstSeen)
                    _logger.Error("SonarrInstances config is corrupt JSON — instance list is effectively empty. "
                        + "Endpoints will return no Sonarr data until the admin opens the config page and resets it. "
                        + $"Raw value (first 200 chars): {(config.SonarrInstances ?? "").Substring(0, Math.Min(200, (config.SonarrInstances ?? "").Length))}");
            }
            if (config.IsRadarrInstancesCorrupt())
            {
                var key = "radarr:" + (config.RadarrInstances ?? "");
                bool firstSeen;
                lock (_loggedCorruptArrConfigLock) firstSeen = _loggedCorruptArrConfig.Add(key);
                if (firstSeen)
                    _logger.Error("RadarrInstances config is corrupt JSON — instance list is effectively empty. "
                        + "Endpoints will return no Radarr data until the admin opens the config page and resets it. "
                        + $"Raw value (first 200 chars): {(config.RadarrInstances ?? "").Substring(0, Math.Min(200, (config.RadarrInstances ?? "").Length))}");
            }
        }

        // Once-per-value dedup so corrupted instance config logs at Error on first hit and stops
        // spamming on subsequent reads. Keyed by the raw stored JSON so a corrupt→fix→corrupt
        // cycle gets a fresh log entry.
        private static readonly HashSet<string> _loggedCorruptArrConfig = new();
        private static readonly object _loggedCorruptArrConfigLock = new();
    }
}
