using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    /// <summary>
    /// A single user-written review for a TMDB item.
    /// </summary>
    public class UserReview
    {
        /// <summary>Jellyfin user ID in N format (no dashes).</summary>
        public string UserId { get; set; } = string.Empty;
        public string TmdbId { get; set; } = string.Empty;
        /// <summary>"movie" or "tv"</summary>
        public string MediaType { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        /// <summary>Optional rating, 1–5 in 0.5 increments.</summary>
        public double? Rating { get; set; }
        public string CreatedAt { get; set; } = string.Empty;
        public string UpdatedAt { get; set; } = string.Empty;
    }
}
