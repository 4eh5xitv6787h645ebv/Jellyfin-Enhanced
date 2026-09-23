using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    // Per-collection Spoiler Guard entry. Toggling Spoiler Guard on a collection
    // (BoxSet) is a SHORTCUT: it does NOT blur/strip the collection itself (its
    // name + art is the entry point the user clicked, like a Series). Instead
    // every member movie (via BoxSet LinkedChildren) is treated as directly
    // opted-in, so its Primary art blurs until Played and its DTO strips. A movie
    // can be in `Movies` directly AND inherited via a collection — the image/strip
    // pipelines OR these together (IsMovieInSpoilerScope).
    public class SpoilerBlurCollectionEntry
    {
        public string CollectionId { get; set; } = string.Empty;
        public string CollectionName { get; set; } = string.Empty;
        public string EnabledAt { get; set; } = string.Empty;
    }
}
