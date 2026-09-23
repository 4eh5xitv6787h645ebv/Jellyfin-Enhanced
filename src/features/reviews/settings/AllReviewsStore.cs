using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    /// <summary>
    /// Server-wide store of all user reviews, keyed by "{userIdN}:{mediaType}:{tmdbId}".
    /// Stored in a single shared file (reviews.json) at the plugin config root.
    /// </summary>
    public class AllReviewsStore
    {
        public Dictionary<string, UserReview> Reviews { get; set; } = new Dictionary<string, UserReview>();
    }
}
