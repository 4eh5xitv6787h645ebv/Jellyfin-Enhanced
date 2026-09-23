using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    /// <summary>
    /// Server-wide store of watched/favorited activity, keyed by
    /// "{userIdN}:{itemIdN}:{activityType}". Stored in a single shared file
    /// (activity.json) at the plugin config root. Reviews are NOT duplicated
    /// here -- the Activity Feed reads those live from AllReviewsStore.
    /// </summary>
    public class AllActivityStore
    {
        public Dictionary<string, ActivityEntry> Entries { get; set; } = new Dictionary<string, ActivityEntry>();
    }
}
