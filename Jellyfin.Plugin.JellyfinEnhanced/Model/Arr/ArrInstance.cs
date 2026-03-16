namespace Jellyfin.Plugin.JellyfinEnhanced.Model.Arr
{
    /// <summary>
    /// Represents a single Sonarr or Radarr instance configuration.
    /// </summary>
    public class ArrInstance
    {
        /// <summary>
        /// User-assigned display name (e.g., "TV Shows", "Anime", "4K Movies").
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Base URL of the instance (e.g., "http://192.168.1.100:8989").
        /// </summary>
        public string Url { get; set; } = string.Empty;

        /// <summary>
        /// API key for authenticating with the instance.
        /// </summary>
        public string ApiKey { get; set; } = string.Empty;

        /// <summary>
        /// Optional per-instance URL mappings for reverse-proxy remapping.
        /// Format: newline-separated "jellyfin_url|arr_url" pairs.
        /// </summary>
        public string UrlMappings { get; set; } = string.Empty;
    }
}
