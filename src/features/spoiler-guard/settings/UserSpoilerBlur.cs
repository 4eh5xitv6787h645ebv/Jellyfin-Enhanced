using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class UserSpoilerBlur
    {
        // Keyed by series ID in N format (no dashes), case-insensitive — matches
        // UserHiddenContent. The setter re-wraps incoming dictionaries with
        // StringComparer.OrdinalIgnoreCase because System.Text.Json deserialization
        // silently drops the comparer (it builds a default-comparer Dictionary and
        // assigns to the setter), breaking case-insensitive lookups on any STJ read
        // path. Newtonsoft preserves the comparer, but we don't rely on that.
        private Dictionary<string, SpoilerBlurSeriesEntry> _series
            = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, SpoilerBlurSeriesEntry> Series
        {
            get => _series;
            set => _series = value == null
                ? new Dictionary<string, SpoilerBlurSeriesEntry>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, SpoilerBlurSeriesEntry>(value, StringComparer.OrdinalIgnoreCase);
        }

        // Movies opted into Spoiler Guard. Keyed like Series (N-format GUID,
        // case-insensitive). Files written before movie support deserialize with
        // an empty dict.
        private Dictionary<string, SpoilerBlurMovieEntry> _movies
            = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, SpoilerBlurMovieEntry> Movies
        {
            get => _movies;
            set => _movies = value == null
                ? new Dictionary<string, SpoilerBlurMovieEntry>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, SpoilerBlurMovieEntry>(value, StringComparer.OrdinalIgnoreCase);
        }

        // Collections (BoxSet) the user has opted into Spoiler Guard for.
        // Same N-format key, case-insensitive comparer.
        private Dictionary<string, SpoilerBlurCollectionEntry> _collections
            = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, SpoilerBlurCollectionEntry> Collections
        {
            get => _collections;
            set => _collections = value == null
                ? new Dictionary<string, SpoilerBlurCollectionEntry>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, SpoilerBlurCollectionEntry>(value, StringComparer.OrdinalIgnoreCase);
        }

        // Pre-acquisition pending entries keyed "tv:{tmdbId}" or
        // "movie:{tmdbId}". Promoted to Series/Movies by
        // SpoilerSeerrPendingPromoter on ItemAdded.
        private Dictionary<string, SpoilerBlurPendingEntry> _pendingTmdb
            = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, SpoilerBlurPendingEntry> PendingTmdb
        {
            get => _pendingTmdb;
            set => _pendingTmdb = value == null
                ? new Dictionary<string, SpoilerBlurPendingEntry>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, SpoilerBlurPendingEntry>(value, StringComparer.OrdinalIgnoreCase);
        }

        // Per-user override of admin strip policy. A fresh user state has an
        // empty Prefs object (all nullable bools = null), so unmigrated
        // spoilerblur.json files continue to honor admin policy unchanged.
        public SpoilerBlurUserPrefs Prefs { get; set; } = new SpoilerBlurUserPrefs();
    }
}
