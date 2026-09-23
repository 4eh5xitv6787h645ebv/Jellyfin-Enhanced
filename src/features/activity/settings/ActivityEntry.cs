using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    /// <summary>
    /// A single "recently watched" or "recently favorited" activity record for
    /// the Activity Feed. One entry per (user, item, type). Re-watching bumps
    /// OccurredAt; favorites keep their timestamp until removed and re-added.
    /// </summary>
    public class ActivityEntry
    {
        /// <summary>Jellyfin user ID in N format (no dashes).</summary>
        public string UserId { get; set; } = string.Empty;
        /// <summary>Jellyfin item ID in N format (no dashes).</summary>
        public string ItemId { get; set; } = string.Empty;
        /// <summary>"Watched" or "Favorited".</summary>
        public string ActivityType { get; set; } = string.Empty;
        public string OccurredAt { get; set; } = string.Empty;
        /// <summary>
        /// Watched-only: whether this watch was ever played to completion.
        /// A "Watched" entry is first recorded once playback crosses the
        /// threshold in ActivityPlaybackConsumer (started, not necessarily
        /// finished); a later full watch upgrades this to true. Never
        /// downgraded once set -- a partial re-watch after finishing once
        /// shouldn't erase that it was completed.
        /// </summary>
        public bool Completed { get; set; }
        /// <summary>
        /// Watched-only: highest fraction (0.0-1.0) of the item's runtime
        /// ever observed played, across all sessions -- never downgraded, so
        /// a partial re-watch after a deeper watch doesn't roll this back.
        /// </summary>
        public double Progress { get; set; }
    }
}
