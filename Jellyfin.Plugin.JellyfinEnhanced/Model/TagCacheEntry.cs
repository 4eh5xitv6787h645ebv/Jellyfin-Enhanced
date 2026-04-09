using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyfinEnhanced.Model
{
    /// <summary>
    /// Pre-computed tag data for a single library item.
    /// Stored server-side and served to clients in bulk.
    /// </summary>
    public class TagCacheEntry
    {
        public string? Type { get; set; }
        public string[]? Genres { get; set; }
        public float? CommunityRating { get; set; }
        public float? CriticRating { get; set; }
        public string[]? AudioLanguages { get; set; }
        /// <summary>
        /// Regional language variants (e.g. Brazilian Portuguese, Latino Spanish) sourced
        /// from Sonarr/Radarr's enriched languages list. Null when arr enrichment is disabled
        /// or the item isn't tracked in either arr.
        /// </summary>
        public List<TagRegionalLanguage>? RegionalAudioLanguages { get; set; }
        /// <summary>
        /// Admin-set per-item language region overrides. Maps canonical language family key
        /// (ISO 639-1, e.g. "pt", "es", "en") to BCP-47 regional code (e.g. "pt-BR", "es-419").
        /// Highest priority — beats arr enrichment and file metadata. Set via the flag-click
        /// popover on cards (admin-only). Inherited from Series to Season/Episode entries
        /// during cache build. Preserved across full cache rebuilds.
        /// </summary>
        public Dictionary<string, string>? ManualRegionOverrides { get; set; }
        public TagStreamData? StreamData { get; set; }
        public long LastUpdated { get; set; }
    }

    /// <summary>
    /// A single regional language variant sourced from arr metadata.
    /// Code is BCP-47 (pt-BR, es-419), Name is the human label from the arr.
    /// </summary>
    public class TagRegionalLanguage
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }

    /// <summary>
    /// Raw media stream data for client-side quality tag computation.
    /// Quality detection logic (700+ lines) stays in JS to avoid C# duplication.
    /// </summary>
    public class TagStreamData
    {
        public List<TagMediaStream>? Streams { get; set; }
        public List<TagMediaSource>? Sources { get; set; }
        public string? ItemName { get; set; }
        public string? ItemPath { get; set; }
    }

    public class TagMediaStream
    {
        public string? Type { get; set; }
        public string? Language { get; set; }
        public string? Codec { get; set; }
        public string? CodecTag { get; set; }
        public string? Profile { get; set; }
        public int? Height { get; set; }
        public int? Channels { get; set; }
        public string? ChannelLayout { get; set; }
        public string? VideoRangeType { get; set; }
        public string? DisplayTitle { get; set; }
    }

    public class TagMediaSource
    {
        public string? Path { get; set; }
        public string? Name { get; set; }
    }
}
