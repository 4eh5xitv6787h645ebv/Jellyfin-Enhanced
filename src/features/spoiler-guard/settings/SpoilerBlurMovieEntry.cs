using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    // Per-movie Spoiler Guard entry. Distinct from SpoilerBlurSeriesEntry
    // so the storage shape is explicit and the management UI can render
    // movies + series in separate sections without type-sniffing.
    public class SpoilerBlurMovieEntry
    {
        public string MovieId { get; set; } = string.Empty;
        public string MovieName { get; set; } = string.Empty;
        public string EnabledAt { get; set; } = string.Empty;
    }
}
