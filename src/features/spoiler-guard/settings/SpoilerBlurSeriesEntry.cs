using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    // Per-user Spoiler Guard state. Stored in spoilerblur.json alongside
    // bookmarks.json / hidden-content.json. Each entry marks a series the user
    // has opted into Spoiler Guard for; the image filter blurs every UNWATCHED
    // episode of that series (both already-aired-but-not-watched, and unaired).
    public class SpoilerBlurSeriesEntry
    {
        public string SeriesId { get; set; } = string.Empty;
        // Display name captured at enable time so the management UI doesn't
        // need a separate library lookup per row. Updated opportunistically.
        public string SeriesName { get; set; } = string.Empty;
        // ISO 8601 timestamp.
        public string EnabledAt { get; set; } = string.Empty;
    }
}
