using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    // Per-user opt-outs from individual admin strip categories. Each field
    // is nullable bool with semantics: null = inherit admin policy,
    // false = override to "don't hide this for me". true is recorded but
    // never enables a strip the admin disabled — the admin cap still wins.
    public class SpoilerBlurUserPrefs
    {
        public bool? HideSeriesDescriptions { get; set; }
        public bool? HideEpisodeDescriptions { get; set; }
        public bool? HideTags { get; set; }
        public bool? HideChapterNames { get; set; }
        public bool? HideTaglines { get; set; }
        // Single opt-out covering both community and critic ratings.
        public bool? HideRatings { get; set; }
        public bool? HideAirDate { get; set; }
        public bool? ReplaceEpisodeTitles { get; set; }
        public bool? HideCast { get; set; }
        public bool? HideReviews { get; set; }
        // Advanced per-category reveals (admin default: SpoilerAdvancedMode).
        // Unlike the per-field opt-outs above, `false` here is the STRICTER
        // choice: it opts this user out of the category reveals entirely,
        // restoring the uniform full strip. null = inherit the admin mode;
        // true is recorded but never enables the mode when the admin has it
        // off (the admin switch still gates everything).
        public bool? UseAdvancedCategories { get; set; }
        // Persist the in-dialog "Don't ask again for 15 minutes" snooze as a
        // permanent user choice instead of a session timer.
        public bool SkipDisableConfirm { get; set; }
    }
}
