using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {
        /// <summary>
        /// When true (default), shows a "—" on poster cards for items the user hasn't rated yet.
        /// When false, the person_heart chip is hidden entirely for unrated items.
        /// </summary>
        public bool ShowUserRatingDash { get; set; } = true;
        public bool ShowUserRatingOnPosters { get; set; } = false;
        public bool QualityTagsEnabled { get; set; } = false;
        public bool ShowResolutionTag { get; set; } = true;
        public bool ShowSourceTag { get; set; } = true;
        public bool ShowDynamicRangeTag { get; set; } = true;
        public bool ShowSpecialFormatTag { get; set; } = true;
        public bool ShowVideoCodecTag { get; set; } = true;
        public bool ShowAudioInfoTag { get; set; } = true;
        public int ResolutionTagOrder { get; set; } = 1;
        public int SourceTagOrder { get; set; } = 2;
        public int DynamicRangeTagOrder { get; set; } = 3;
        public int SpecialFormatTagOrder { get; set; } = 4;
        public int VideoCodecTagOrder { get; set; } = 5;
        public int AudioInfoTagOrder { get; set; } = 6;
        public bool LanguageTagsEnabled { get; set; } = false;
        public bool RatingTagsEnabled { get; set; } = false;
        public bool PeopleTagsEnabled { get; set; } = false;
        public int TagsCacheTtlDays { get; set; } = 30;
        public bool DisableTagsOnSearchPage { get; set; } = false;
        public bool TagsHideOnHover { get; set; } = false;
        public bool TagCacheServerMode { get; set; } = true;
        public bool EnableTagsLocalStorageFallback { get; set; } = false;
        [AnalyticsInclude]
        public string QualityTagsPosition { get; set; } = "top-left";
        [AnalyticsInclude]
        public string GenreTagsPosition { get; set; } = "top-right";
        [AnalyticsInclude]
        public string LanguageTagsPosition { get; set; } = "bottom-left";
        /// <summary>
        /// Comma-separated list of language codes (e.g. "en,ja,fr") that should be
        /// prioritized among the flags shown on a poster card. Since only a handful
        /// of flags fit (see maxToShow in languagetags.js), audio tracks matching a
        /// code here are shown first, in the order listed; remaining slots are then
        /// filled with the item's other languages in their original detection order.
        /// Empty (default) preserves the pre-existing unprioritized behavior.
        /// Deliberately NOT [AnalyticsInclude]: this is a free-text box (the
        /// UI invites language names, not just codes), so analytics shares a
        /// normalized codes-only derivation instead — see
        /// AnalyticsConfigurationProjection.GetStringSettings.
        /// </summary>
        public string LanguageTagsPriority { get; set; } = string.Empty;
        /// <summary>
        /// When true, only languages matching <see cref="LanguageTagsPriority"/> are
        /// ever shown (a card can end up with fewer than the usual 3 flags, or
        /// none, if it has no matching audio track). When false (default), the
        /// priority list only affects ordering and remaining slots still fill
        /// with the item's other languages. No effect when the priority list
        /// is empty.
        /// </summary>
        public bool LanguageTagsPriorityStrict { get; set; } = false;
        [AnalyticsInclude]
        public string RatingTagsPosition { get; set; } = "bottom-right";
        public bool GenreTagsEnabled { get; set; } = false;
    }
}
