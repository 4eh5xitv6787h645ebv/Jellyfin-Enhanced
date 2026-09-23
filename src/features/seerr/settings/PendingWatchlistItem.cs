using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class PendingWatchlistItem
    {
        public int TmdbId { get; set; }
        public string MediaType { get; set; } = string.Empty; // "movie" or "tv"
        public System.DateTime RequestedAt { get; set; }
    }
}
