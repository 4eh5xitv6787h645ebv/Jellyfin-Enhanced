using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    // Pre-acquisition spoiler intent: user subscribed to Spoiler Guard for a
    // TMDB id not (yet) in the library. Two sources: (a) auto-add on a Seerr
    // request via JE's /jellyseerr/request, gated by SpoilerAutoEnableOnSeerrRequest;
    // (b) manual add from the Seerr more-info modal, gated only by SpoilerBlurEnabled
    // (so a user can register intent even when another user already requested the
    // title and the Request button is disabled). Keyed "tv:{tmdbId}" or
    // "movie:{tmdbId}". On ItemAdded, SpoilerSeerrPendingPromoter matches by
    // ProviderIds.Tmdb, promotes it into Series/Movies, and removes this row.
    public class SpoilerBlurPendingEntry
    {
        public string MediaType { get; set; } = string.Empty;
        public string TmdbId { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string RequestedAt { get; set; } = string.Empty;
    }
}
