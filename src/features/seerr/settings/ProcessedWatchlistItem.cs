using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class ProcessedWatchlistItem
    {
        public int TmdbId { get; set; }
        public string MediaType { get; set; } = string.Empty; // "movie" or "tv"
        public System.DateTime ProcessedAt { get; set; }
        /// <summary>
        /// Indicates how this item was processed:
        /// - "sync": Item was added to watchlist during a scheduled sync task
        /// - "monitor": Item was added automatically when media arrived in library
        /// - "existing": Item was already in watchlist when plugin checked it
        /// </summary>
        public string Source { get; set; } = string.Empty;
    }
}
