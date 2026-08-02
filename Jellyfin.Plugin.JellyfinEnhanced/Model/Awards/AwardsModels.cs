using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Model.Awards
{
    /// <summary>
    /// Headline award counts for an item, as shown on the detail-page banner.
    /// </summary>
    /// <remarks>
    /// Counts follow the IMDb convention that OMDb mirrors: <see cref="Wins"/> and
    /// <see cref="Nominations"/> are DISJOINT. A title with "27 wins &amp; 25
    /// nominations total" won 27 trophies and lost 25 other times, for 52 entries —
    /// it is NOT 27 of 25. Rendering them as "27 Wins | 25 Nominations" therefore
    /// reads correctly without further arithmetic.
    /// </remarks>
    public class AwardsSummary
    {
        /// <summary>Number of awards actually won. Never negative.</summary>
        [JsonPropertyName("wins")]
        public int Wins { get; set; }

        /// <summary>Number of nominations that did NOT result in a win. Never negative.</summary>
        [JsonPropertyName("nominations")]
        public int Nominations { get; set; }

        /// <summary>
        /// "Won" or "NominatedFor" when the source called out a headline award
        /// (Oscar / Primetime Emmy / Golden Globe / BAFTA), otherwise null.
        /// </summary>
        [JsonPropertyName("leadVerb")]
        public string? LeadVerb { get; set; }

        /// <summary>How many of the lead award were won/nominated. 0 when there is no lead award.</summary>
        [JsonPropertyName("leadCount")]
        public int LeadCount { get; set; }

        /// <summary>Display name of the lead award ("Oscars", "Primetime Emmy", ...), or null.</summary>
        [JsonPropertyName("leadAward")]
        public string? LeadAward { get; set; }

        /// <summary>
        /// The raw upstream summary string, kept verbatim for diagnostics and for
        /// the "as reported by" line in the expanded panel.
        /// </summary>
        [JsonPropertyName("rawText")]
        public string? RawText { get; set; }

        /// <summary>Where the counts came from: "omdb-cache", "omdb-api" or "wikidata".</summary>
        [JsonPropertyName("source")]
        public string Source { get; set; } = string.Empty;
    }

    /// <summary>
    /// One award record — a single trophy or nomination for the item.
    /// </summary>
    public class AwardEntry
    {
        /// <summary>True when the item won this award; false when it was only nominated.</summary>
        [JsonPropertyName("isWinner")]
        public bool IsWinner { get; set; }

        /// <summary>
        /// Award family used to group rows in the UI, e.g. "Academy Awards".
        /// Never empty — falls back to a name derived from <see cref="Category"/>.
        /// </summary>
        [JsonPropertyName("group")]
        public string Group { get; set; } = string.Empty;

        /// <summary>Full award/category name, e.g. "Academy Award for Best Director".</summary>
        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        /// <summary>Ceremony name when known, e.g. "96th Academy Awards"; otherwise null.</summary>
        [JsonPropertyName("ceremony")]
        public string? Ceremony { get; set; }

        /// <summary>Ceremony year when known; otherwise null.</summary>
        [JsonPropertyName("year")]
        public int? Year { get; set; }

        /// <summary>
        /// People credited on this award (actors, directors, producers). Empty for
        /// awards granted to the work itself, which is normal and not an error.
        /// </summary>
        [JsonPropertyName("people")]
        public List<string> People { get; set; } = new();

        /// <summary>
        /// A page describing the award itself — its English Wikipedia article where
        /// one exists, otherwise the Wikidata entity. Lets a viewer find out what the
        /// award actually is rather than just reading its name.
        /// </summary>
        [JsonPropertyName("url")]
        public string? Url { get; set; }
    }

    /// <summary>
    /// The cached awards record for one title. This is the unit that is persisted
    /// to disk and returned to the client.
    /// </summary>
    public class AwardsRecord
    {
        /// <summary>
        /// Provider-scoped cache key ("tt0088763", "tmdb-movie:105", "tvdb:121361").
        /// Keying on the provider id rather than the Jellyfin item id means the entry
        /// survives library re-scans and is shared by duplicate items.
        /// </summary>
        [JsonPropertyName("key")]
        public string Key { get; set; } = string.Empty;

        /// <summary>Headline counts, or null when nothing was found.</summary>
        [JsonPropertyName("summary")]
        public AwardsSummary? Summary { get; set; }

        /// <summary>Structured per-award rows. May be empty even when <see cref="Summary"/> is set.</summary>
        [JsonPropertyName("entries")]
        public List<AwardEntry> Entries { get; set; } = new();

        /// <summary>
        /// True when a lookup completed and the title genuinely has no awards.
        /// Distinguishes "we asked and there is nothing" from "we have not asked yet",
        /// so a negative result is cached instead of being re-fetched on every view.
        /// </summary>
        [JsonPropertyName("noAwards")]
        public bool NoAwards { get; set; }

        /// <summary>UTC timestamp of the lookup that produced this record.</summary>
        [JsonPropertyName("fetchedUtc")]
        public DateTime FetchedUtc { get; set; }

        /// <summary>
        /// Sources consulted, in the order they contributed, e.g. ["omdb-cache", "wikidata"].
        /// Surfaced in the UI as attribution and used by support to explain odd counts.
        /// </summary>
        [JsonPropertyName("sources")]
        public List<string> Sources { get; set; } = new();

        /// <summary>True when this record is older than the configured TTL.</summary>
        public bool IsStale(TimeSpan ttl) => DateTime.UtcNow - FetchedUtc > ttl;
    }

    /// <summary>
    /// On-disk envelope for the awards cache. The schema version lets a future
    /// change to <see cref="AwardsRecord"/> discard an incompatible file instead
    /// of deserializing it into half-populated entries.
    /// </summary>
    public class AwardsCacheFile
    {
        [JsonPropertyName("schemaVersion")]
        public int SchemaVersion { get; set; }

        [JsonPropertyName("entries")]
        public Dictionary<string, AwardsRecord> Entries { get; set; } = new();
    }
}
