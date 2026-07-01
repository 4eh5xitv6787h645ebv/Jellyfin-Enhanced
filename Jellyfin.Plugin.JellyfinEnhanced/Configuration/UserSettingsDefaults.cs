namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    /// <summary>
    /// Single mapper from the admin <see cref="PluginConfiguration"/> defaults to a fresh
    /// per-user <see cref="UserSettings"/> object. Previously this projection was duplicated
    /// inline in two controller endpoints (first-load seeding and "reset all users"); it is now
    /// centralised here so seeding, bulk-reset, and the new lock-enforcement / profile tooling
    /// all derive the same defaults.
    /// </summary>
    public static class UserSettingsDefaults
    {
        /// <summary>
        /// Builds a <see cref="UserSettings"/> populated from the admin defaults in
        /// <paramref name="config"/>. Field names that differ between the admin config and the
        /// per-user model (e.g. <c>DefaultSubtitleStyle</c> → <c>SelectedStylePresetIndex</c>,
        /// <c>DefaultLanguage</c> → <c>DisplayLanguage</c>) are mapped explicitly.
        /// </summary>
        public static UserSettings Build(PluginConfiguration config)
        {
            return new UserSettings
            {
                AutoPauseEnabled = config.AutoPauseEnabled,
                AutoResumeEnabled = config.AutoResumeEnabled,
                AutoPipEnabled = config.AutoPipEnabled,
                LongPress2xEnabled = config.LongPress2xEnabled,
                PauseScreenEnabled = config.PauseScreenEnabled,
                PauseScreenDelaySeconds = config.PauseScreenDelaySeconds,
                AutoSkipIntro = config.AutoSkipIntro,
                AutoSkipOutro = config.AutoSkipOutro,
                DisableCustomSubtitleStyles = config.DisableCustomSubtitleStyles,
                SelectedStylePresetIndex = config.DefaultSubtitleStyle,
                SelectedFontSizePresetIndex = config.DefaultSubtitleSize,
                SelectedFontFamilyPresetIndex = config.DefaultSubtitleFont,
                RandomButtonEnabled = config.RandomButtonEnabled,
                RandomUnwatchedOnly = config.RandomUnwatchedOnly,
                RandomIncludeMovies = config.RandomIncludeMovies,
                RandomIncludeShows = config.RandomIncludeShows,
                ShowWatchProgress = config.ShowWatchProgress,
                WatchProgressMode = string.IsNullOrWhiteSpace(config.WatchProgressDefaultMode) ? "percentage" : config.WatchProgressDefaultMode,
                WatchProgressTimeFormat = string.IsNullOrWhiteSpace(config.WatchProgressTimeFormat) ? "hours" : config.WatchProgressTimeFormat,
                ShowFileSizes = config.ShowFileSizes,
                ShowAudioLanguages = config.ShowAudioLanguages,
                QualityTagsEnabled = config.QualityTagsEnabled,
                ShowResolutionTag = config.ShowResolutionTag,
                ShowSourceTag = config.ShowSourceTag,
                ShowDynamicRangeTag = config.ShowDynamicRangeTag,
                ShowSpecialFormatTag = config.ShowSpecialFormatTag,
                ShowVideoCodecTag = config.ShowVideoCodecTag,
                ShowAudioInfoTag = config.ShowAudioInfoTag,
                ResolutionTagOrder = config.ResolutionTagOrder,
                SourceTagOrder = config.SourceTagOrder,
                DynamicRangeTagOrder = config.DynamicRangeTagOrder,
                SpecialFormatTagOrder = config.SpecialFormatTagOrder,
                VideoCodecTagOrder = config.VideoCodecTagOrder,
                AudioInfoTagOrder = config.AudioInfoTagOrder,
                GenreTagsEnabled = config.GenreTagsEnabled,
                LanguageTagsEnabled = config.LanguageTagsEnabled,
                RatingTagsEnabled = config.RatingTagsEnabled,
                PeopleTagsEnabled = config.PeopleTagsEnabled,
                TagsHideOnHover = config.TagsHideOnHover,
                QualityTagsPosition = config.QualityTagsPosition,
                GenreTagsPosition = config.GenreTagsPosition,
                LanguageTagsPosition = config.LanguageTagsPosition,
                RatingTagsPosition = config.RatingTagsPosition,
                ShowRatingInPlayer = config.ShowRatingInPlayer,
                RemoveContinueWatchingEnabled = config.RemoveContinueWatchingEnabled,
                ReviewsExpandedByDefault = config.ReviewsExpandedByDefault,
                DisplayLanguage = config.DefaultLanguage ?? string.Empty,
                CalendarDisplayMode = "list",
                CalendarDefaultViewMode = "agenda",
                LastOpenedTab = "shortcuts"
            };
        }
    }
}
