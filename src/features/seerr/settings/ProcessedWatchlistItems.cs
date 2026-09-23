using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class ProcessedWatchlistItems
    {
        public List<ProcessedWatchlistItem> Items { get; set; } = new List<ProcessedWatchlistItem>();
    }
}
