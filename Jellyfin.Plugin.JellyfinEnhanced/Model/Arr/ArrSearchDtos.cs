namespace Jellyfin.Plugin.JellyfinEnhanced.Model.Arr
{
    /// <summary>
    /// Request body for the automatic-search and release-lookup POST endpoints: identifies the
    /// Jellyfin item to resolve to a Sonarr/Radarr entity. Model binding is case-insensitive, so
    /// the client posts <c>{ "itemId": "..." }</c>.
    /// </summary>
    public class ArrSearchRequest
    {
        /// <summary>Jellyfin item id (GUID string) of the movie, series, season or episode.</summary>
        public string? ItemId { get; set; }
    }

    /// <summary>
    /// Request body for grabbing a specific release from the interactive-search results. Only the
    /// release <see cref="Guid"/> + <see cref="IndexerId"/> are accepted so a caller can never forge
    /// an arbitrary download URL — the arr instance looks the release up from its own cache by pair.
    /// </summary>
    public class ArrGrabRequest
    {
        /// <summary>Jellyfin item id (GUID string) the release belongs to; re-resolves the instance.</summary>
        public string? ItemId { get; set; }

        /// <summary>Opaque release identifier returned by Sonarr/Radarr in the release-lookup response.</summary>
        public string? Guid { get; set; }

        /// <summary>Indexer id the release came from (paired with <see cref="Guid"/> for the grab).</summary>
        public int IndexerId { get; set; }
    }
}
