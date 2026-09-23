using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class PendingWatchlistItems
    {
        public List<PendingWatchlistItem> Items { get; set; } = new List<PendingWatchlistItem>();
    }
}
