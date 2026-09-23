using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Microsoft.EntityFrameworkCore;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class ConfigurationController : UserControllerBase
    {
        private readonly Logger _logger;
        private readonly UserConfigurationManager _userConfigurationManager;
        private readonly Services.WhatsNewService _whatsNewService;
        private readonly OutboundApiPolicy _outboundPolicy;

        public ConfigurationController(
            Logger logger,
            UserConfigurationManager userConfigurationManager,
            Services.WhatsNewService whatsNewService,
            OutboundApiPolicy outboundPolicy,
            IUserManager userManager) : base(userManager)
        {
            _logger = logger;
            _userConfigurationManager = userConfigurationManager;
            _whatsNewService = whatsNewService;
            _outboundPolicy = outboundPolicy;
        }

        [HttpGet("private-config")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        [Authorize]
        public ActionResult GetPrivateConfig()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return StatusCode(503);
            }

            // Non-admin users receive an empty config object rather than a 403 so that the
            // client-side plugin initialises without error but never sees sensitive fields.
            if (!IsAdminUser())
            {
                return new JsonResult(new { });
            }

            // Check + log corruption so admins who never hit one of the action endpoints
            // still see a server-side error entry on private-config load.
            _outboundPolicy.WarnIfArrInstancesCorrupt(config);

            return new JsonResult(new
            {
                // For Arr Links (legacy single-instance fields, kept for backward compat)
                config.SonarrUrl,
                config.RadarrUrl,
                config.BazarrUrl,
                config.SonarrUrlMappings,
                config.RadarrUrlMappings,
                config.BazarrUrlMappings,

                // Shoko (single-instance, like Jellyseerr)
                config.ShokoUrl,
                config.ShokoUrlMappings,

                // Multi-instance Sonarr/Radarr (no API keys exposed). Enabled flag is exposed so
                // the config page can render a per-instance toggle and arr-links can filter
                // disabled instances from the dropdown without a round-trip.
                SonarrInstances = config.GetSonarrInstances().Select(i => new { i.Name, i.Url, i.UrlMappings, i.Enabled }),
                RadarrInstances = config.GetRadarrInstances().Select(i => new { i.Name, i.Url, i.UrlMappings, i.Enabled }),

                // Corruption flags so the frontend can surface a toast without waiting for an
                // action endpoint to round-trip a corruption error envelope.
                SonarrInstancesCorrupt = config.IsSonarrInstancesCorrupt(),
                RadarrInstancesCorrupt = config.IsRadarrInstancesCorrupt(),
            });
        }
        // [AllowAnonymous]: public-config is loaded by `loadLoginImageEarly` before
        // the user logs in, so we cannot gate the whole endpoint on [Authorize].
        // Instead, sensitive Seerr fields (BaseUrl, UrlMappings) are REDACTED for
        // unauthenticated callers — they only need login-screen toggles like
        // EnableLoginImage. Authenticated callers (any Jellyfin user) get the full
        // payload so client-side "Open in Seerr" deep links still work.
        [HttpGet("public-config")]
        public ActionResult GetPublicConfig()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return StatusCode(503);
            }

            // Expose whether TMDB is configured as a boolean so all users
            // (including non-admin) can use TMDB-dependent features like
            // Reviews and Elsewhere without leaking the actual API key.
            var tmdbEnabled = !string.IsNullOrWhiteSpace(config.TMDB_API_KEY);

            // Same reasoning as tmdbEnabled above -- expose only whether an
            // MDBList key is configured, never the key itself.
            var mdblistEnabled = !string.IsNullOrWhiteSpace(config.MdblistApiKey);

            // Only authenticated callers see internal Seerr URLs — they're used by
            // client-side deep links and would otherwise leak network topology to
            // unauthenticated visitors hitting the login page.
            bool isAuthed = User?.Identity?.IsAuthenticated == true;

            string jellyseerrBaseUrl = string.Empty;
            string jellyseerrUrlMappings = string.Empty;
            if (isAuthed)
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(config.JellyseerrUrls))
                    {
                        jellyseerrBaseUrl = config.JellyseerrUrls
                            .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(u => u.Trim())
                            .FirstOrDefault() ?? string.Empty;
                    }
                }
                catch { /* ignore */ }
                jellyseerrUrlMappings = config.JellyseerrUrlMappings ?? string.Empty;
            }

            return new JsonResult(new
            {
                // Jellyfin Enhanced Settings
                TmdbEnabled = tmdbEnabled,
                config.ToastDuration,
                config.HelpPanelAutocloseDelay,
                config.EnableCustomSplashScreen,
                config.SplashScreenImageUrl,

                // Jellyfin Elsewhere Settings
                config.ElsewhereEnabled,
                config.DEFAULT_REGION,
                config.DEFAULT_PROVIDERS,
                config.IGNORE_PROVIDERS,
                config.ElsewhereCustomBrandingText,
                config.ElsewhereCustomBrandingImageUrl,
                config.ClearLocalStorageTimestamp,
                config.ClearTranslationCacheTimestamp,

                // Default User Settings
                config.AutoPauseEnabled,
                config.AutoResumeEnabled,
                config.AutoPipEnabled,
                config.AutoSkipIntro,
                config.AutoSkipOutro,
                config.LongPress2xEnabled,
                config.RandomButtonEnabled,
                config.RandomIncludeMovies,
                config.RandomIncludeShows,
                config.RandomUnwatchedOnly,
                config.ShowWatchProgress,
                config.ShowFileSizes,
                config.RemoveContinueWatchingEnabled,
                config.ShowAudioLanguages,
                config.Shortcuts,
                config.ShowReviews,
                config.ShowUserReviews,
                config.ReviewsExpandedByDefault,
                config.HideReviewsFromHiddenUsers,
                config.HideReviewsFromDisabledUsers,
                config.ShowAwards,
                MdblistEnabled = mdblistEnabled,
                config.MdblistRatingsEnabled,
                config.MdblistRatingsShowOnItemDetails,
                config.MdblistRatingsSources,
                config.MdblistRatingsShowPercentSymbol,
                config.ShowReleaseDates,
                config.ShowUserRatingOnPosters,
                config.ShowUserRatingDash,
                config.PauseScreenEnabled,
                config.ShowPlaybackRatingBadge,
                config.QualityTagsEnabled,
                config.ShowResolutionTag,
                config.ShowSourceTag,
                config.ShowDynamicRangeTag,
                config.ShowSpecialFormatTag,
                config.ShowVideoCodecTag,
                config.ShowAudioInfoTag,
                config.ResolutionTagOrder,
                config.SourceTagOrder,
                config.DynamicRangeTagOrder,
                config.SpecialFormatTagOrder,
                config.VideoCodecTagOrder,
                config.AudioInfoTagOrder,
                config.GenreTagsEnabled,
                config.LanguageTagsEnabled,
                config.RatingTagsEnabled,
                config.PeopleTagsEnabled,
                config.DisableAllShortcuts,
                config.DefaultSubtitleStyle,
                config.DefaultSubtitleSize,
                config.DefaultSubtitleFont,
                config.DisableCustomSubtitleStyles,
                config.DefaultLanguage,
                // Overlay positions
                config.QualityTagsPosition,
                config.GenreTagsPosition,
                config.LanguageTagsPosition,
                config.LanguageTagsPriority,
                config.LanguageTagsPriorityStrict,
                config.RatingTagsPosition,
                config.ShowRatingInPlayer,

                config.TagsCacheTtlDays,
                config.DisableTagsOnSearchPage,
                config.TagsHideOnHover,
                config.TagCacheServerMode,
                config.EnableTagsLocalStorageFallback,

                // Seerr Search Settings
                config.JellyseerrEnabled,
                config.JellyseerrShowSearchResults,
                config.JellyseerrShowReportButton,
                config.JellyseerrShowIssueIndicator,
                config.JellyseerrEnable4KRequests,
                config.JellyseerrEnable4KTvRequests,
                config.ShowCollectionsInSearch,
                config.JellyseerrShowAdvanced,
                config.JellyseerrShowQuotaInfo,
                config.ShowElsewhereOnJellyseerr,
                config.JellyseerrUseMoreInfoModal,
                config.JellyseerrAvailablePosterLinksToJellyfin,
                config.AddRequestedMediaToWatchlist,
                config.SyncJellyseerrWatchlist,
                config.JellyseerrAutoImportUsers,
                config.JellyseerrShowSimilar,
                config.JellyseerrShowRecommended,
                config.JellyseerrShowRequestMoreOnSeries,
                config.JellyseerrShowNetworkDiscovery,
                config.JellyseerrShowGenreDiscovery,
                config.JellyseerrShowTagDiscovery,
                config.JellyseerrShowPersonDiscovery,
                config.JellyseerrShowCollectionDiscovery,
                config.JellyseerrShowDetailPageLink,
                config.JellyseerrShowDetailPageLinkAsText,
                config.JellyseerrExcludeLibraryItems,
                config.JellyseerrExcludeBlocklistedItems,
                config.JellyseerrDisableCache,
                JellyseerrBaseUrl = jellyseerrBaseUrl,
                JellyseerrUrlMappings = jellyseerrUrlMappings,

                // Bookmarks Settings
                config.BookmarksEnabled,
                config.BookmarksUsePluginPages,
                config.BookmarksUseCustomTabs,
                config.BookmarksUseNativeTab,

                // Arr Links Settings
                config.ArrLinksEnabled,
                config.ShowArrLinksAsText,
                config.ArrLinksShowStatusSingle,

                // Arr Tags Sync Settings
                config.ArrTagsSyncEnabled,
                config.ArrTagsPrefix,
                config.ArrTagsShowAsLinks,
                config.ArrTagsLinksFilter,
                config.ArrTagsLinksHideFilter,

                // Letterboxd Settings
                config.LetterboxdEnabled,
                config.ShowLetterboxdLinkAsText,
                // Metadata Icons (Druidblack)
                config.MetadataIconsEnabled,

                // Icon Settings
                config.UseIcons,
                config.IconStyle,

                // Extras Settings
                config.ColoredRatingsEnabled,
                config.ThemeSelectorEnabled,
                config.ColoredActivityIconsEnabled,
                config.PluginIconsEnabled,
                config.EnableLoginImage,
                config.ActiveStreamsEnabled,
                config.ActiveStreamsAllUsers,
                config.AnalyticsEnabled,
                config.AnalyticsShareUsageCounts,

                // Requests Page Settings
                config.DownloadsPageEnabled,
                config.DownloadsPageShowIssues,
                config.ShowDownloadsInRequests,
                config.DownloadsUsePluginPages,
                config.DownloadsUseCustomTabs,
                config.DownloadsUseNativeTab,
                config.DownloadsPagePollingEnabled,
                config.DownloadsPollIntervalSeconds,
                config.DownloadsFilterByUserRequests,
                config.DownloadsShowHistory,
                config.DownloadsHistoryAdminOnly,

                // Calendar Page Settings
                config.CalendarPageEnabled,
                config.CalendarUseCustomTabs,
                config.CalendarUsePluginPages,
                config.CalendarUseNativeTab,
                config.CalendarFirstDayOfWeek,
                config.CalendarTimeFormat,
                config.CalendarHighlightFavorites,
                config.CalendarHighlightWatchedSeries,
                config.CalendarFilterByLibraryAccess,
                config.CalendarShowOnlyRequested,
                config.CalendarForceOnlyRequested,

                // Recommendations Page Settings
                config.RecommendationsPageEnabled,
                config.RecommendationsUseCustomTabs,
                config.RecommendationsUseNativeTab,

                // Activity Feed Settings
                config.ActivityFeedEnabled,
                config.ActivityFeedUseCustomTabs,
                config.ActivityFeedUseNativeTab,
                config.ActivityFeedShowWatched,
                config.ActivityFeedShowFavorited,
                config.ActivityFeedShowReviewed,
                config.ActivityFeedShowActiveStreams,

                // Hidden Content Settings
                config.HiddenContentEnabled,
                config.HiddenContentUsePluginPages,
                config.HiddenContentUseCustomTabs,
                config.HiddenContentUseNativeTab,
                config.HiddenContentAdmin,

                // Maintenance Mode
                config.MaintenanceModeEnabled,
                config.MaintenanceModeMessage,
                config.MaintenanceModeAction,
                // Derived, never the raw value: the stored setting can be a
                // JSON array of real user GUIDs, and this endpoint is
                // anonymous (pre-login). No client script reads this field —
                // enforcement is server-side — so only the shape is exposed.
                MaintenanceModeAffectedUsers = PluginConfiguration.DeriveAffectedUsersShape(config.MaintenanceModeAffectedUsers),

                // Spoiler Guard — frontend uses these to decide whether the per-show toggle appears.
                config.SpoilerBlurEnabled,
                config.SpoilerBlurIntensity,
                config.SpoilerBlurStrictRefresh,
                // Strip-policy fields drive the per-user override UI — only
                // admin-enabled categories surface an opt-out toggle.
                SpoilerStripSeriesOverview = config.SpoilerStripSeriesOverview ?? config.SpoilerStripOverview,
                config.SpoilerStripOverview,
                config.SpoilerStripTags,
                config.SpoilerStripChapters,
                config.SpoilerStripTaglines,
                config.SpoilerStripRatings,
                config.SpoilerStripPremiereDate,
                config.SpoilerReplaceTitle,
                config.SpoilerStripCast,
                config.SpoilerStripReviews,
                // Advanced category reveals: clients only need the master flag
                // (to gate the per-user opt-out row in the settings panel);
                // the six per-category strip toggles are server-only strip
                // policy and are deliberately not exposed.
                config.SpoilerAdvancedMode,
            });
        }

        [HttpGet("whats-new")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetWhatsNew()
        {
            if (!IsAdminUser()) return Forbid();

            var state = _whatsNewService.GetState();
            if (state == null)
            {
                return Ok(new { pluginVersion = (string?)null, newSettings = new Dictionary<string, string>() });
            }

            return Ok(new { pluginVersion = state.PluginVersion, newSettings = state.NewSettings });
        }

        [HttpPost("whats-new/dismiss")]
        [Authorize]
        public IActionResult DismissWhatsNew()
        {
            if (!IsAdminUser()) return Forbid();

            _whatsNewService.Dismiss();
            return Ok();
        }

        [HttpPost("reset-all-users-settings")]
        [Authorize]
        public IActionResult ResetAllUsersSettings()
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            var defaultConfig = JellyfinEnhanced.Instance?.Configuration;

            if (defaultConfig == null)
            {
                return StatusCode(500, new { success = false, message = "Default plugin configuration not found." });
            }

            var defaultUserSettings = new UserSettings
            {
                AutoPauseEnabled = defaultConfig.AutoPauseEnabled,
                AutoResumeEnabled = defaultConfig.AutoResumeEnabled,
                AutoPipEnabled = defaultConfig.AutoPipEnabled,
                LongPress2xEnabled = defaultConfig.LongPress2xEnabled,
                PauseScreenEnabled = defaultConfig.PauseScreenEnabled,
                PauseScreenDelaySeconds = defaultConfig.PauseScreenDelaySeconds,
                AutoSkipIntro = defaultConfig.AutoSkipIntro,
                AutoSkipOutro = defaultConfig.AutoSkipOutro,
                DisableCustomSubtitleStyles = defaultConfig.DisableCustomSubtitleStyles,
                SelectedStylePresetIndex = defaultConfig.DefaultSubtitleStyle,
                SelectedFontSizePresetIndex = defaultConfig.DefaultSubtitleSize,
                SelectedFontFamilyPresetIndex = defaultConfig.DefaultSubtitleFont,
                RandomButtonEnabled = defaultConfig.RandomButtonEnabled,
                RandomUnwatchedOnly = defaultConfig.RandomUnwatchedOnly,
                RandomIncludeMovies = defaultConfig.RandomIncludeMovies,
                RandomIncludeShows = defaultConfig.RandomIncludeShows,
                ShowWatchProgress = defaultConfig.ShowWatchProgress,
                ShowFileSizes = defaultConfig.ShowFileSizes,
                ShowAudioLanguages = defaultConfig.ShowAudioLanguages,
                QualityTagsEnabled = defaultConfig.QualityTagsEnabled,
                ShowResolutionTag = defaultConfig.ShowResolutionTag,
                ShowSourceTag = defaultConfig.ShowSourceTag,
                ShowDynamicRangeTag = defaultConfig.ShowDynamicRangeTag,
                ShowSpecialFormatTag = defaultConfig.ShowSpecialFormatTag,
                ShowVideoCodecTag = defaultConfig.ShowVideoCodecTag,
                ShowAudioInfoTag = defaultConfig.ShowAudioInfoTag,
                ResolutionTagOrder = defaultConfig.ResolutionTagOrder,
                SourceTagOrder = defaultConfig.SourceTagOrder,
                DynamicRangeTagOrder = defaultConfig.DynamicRangeTagOrder,
                SpecialFormatTagOrder = defaultConfig.SpecialFormatTagOrder,
                VideoCodecTagOrder = defaultConfig.VideoCodecTagOrder,
                AudioInfoTagOrder = defaultConfig.AudioInfoTagOrder,
                GenreTagsEnabled = defaultConfig.GenreTagsEnabled,
                LanguageTagsEnabled = defaultConfig.LanguageTagsEnabled,
                RatingTagsEnabled = defaultConfig.RatingTagsEnabled,
                PeopleTagsEnabled = defaultConfig.PeopleTagsEnabled,
                QualityTagsPosition = defaultConfig.QualityTagsPosition,
                GenreTagsPosition = defaultConfig.GenreTagsPosition,
                LanguageTagsPosition = defaultConfig.LanguageTagsPosition,
                RatingTagsPosition = defaultConfig.RatingTagsPosition,
                ShowRatingInPlayer = defaultConfig.ShowRatingInPlayer,
                RemoveContinueWatchingEnabled = defaultConfig.RemoveContinueWatchingEnabled,
                ReviewsExpandedByDefault = defaultConfig.ReviewsExpandedByDefault,
                DisplayLanguage = defaultConfig.DefaultLanguage,
                CalendarDisplayMode = "list",
                CalendarDefaultViewMode = "agenda",
                LastOpenedTab = "shortcuts"
            };

            var userCount = 0;
            var skippedSettings = new System.Collections.Generic.List<string>();
            var skippedHc = new System.Collections.Generic.List<string>();
            // Get all user IDs from the UserConfigurationManager's known users
            var userIds = _userConfigurationManager.GetAllUserIds();
            foreach (var userId in userIds)
            {
                try
                {
                    _userConfigurationManager.SaveUserConfiguration(userId, "settings.json", defaultUserSettings);
                    userCount++;
                }
                catch (Exception ex)
                {
                    _logger.Warning($"Skipping settings.json reset for {ResolveUserDisplay(userId)}: {ex.Message}");
                    skippedSettings.Add(userId);
                }

                // Push HC Settings only — user's Items dict is data, not a default. Per-user errors are skipped, not fatal.
                try
                {
                    _userConfigurationManager.RmwUserConfiguration<UserHiddenContent>(
                        userId, "hidden-content.json", hc =>
                        {
                            hc.Settings = HiddenContentDefaults.BuildHcDefaultSettings(defaultConfig);
                            return 1;
                        });
                    Services.HiddenContentResponseFilter.InvalidateUser(userId);
                }
                catch (Exception ex) when (ex is InvalidDataException
                                        || ex is Newtonsoft.Json.JsonException
                                        || ex is IOException
                                        || ex is UnauthorizedAccessException)
                {
                    _logger.Warning($"Skipping HC settings reset for {ResolveUserDisplay(userId)}: {ex.Message}");
                    skippedHc.Add(userId);
                }

                // Spoiler Guard: reset only the settings-like override Prefs to
                // "inherit admin policy". The Series/Movies/Collections/PendingTmdb lists
                // are user DATA (like HC Items) and are deliberately preserved. Only touch
                // existing files — creating spoilerblur.json here would seed empty state everywhere.
                try
                {
                    if (_userConfigurationManager.UserConfigurationExists(
                            userId, Services.SpoilerBlurImageFilter.SpoilerBlurFileName))
                    {
                        _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                            userId, Services.SpoilerBlurImageFilter.SpoilerBlurFileName, sb =>
                            {
                                sb.Prefs = new SpoilerBlurUserPrefs();
                                return 1;
                            });
                    }
                }
                catch (Exception ex) when (ex is InvalidDataException
                                        || ex is Newtonsoft.Json.JsonException
                                        || ex is IOException
                                        || ex is UnauthorizedAccessException)
                {
                    _logger.Warning($"Skipping Spoiler Guard prefs reset for {ResolveUserDisplay(userId)}: {ex.Message}");
                }
            }

            _logger.Info($"Reset settings for {userCount}/{userIds.Count()} users to plugin defaults. Skipped settings: {skippedSettings.Count}, skipped HC: {skippedHc.Count}.");
            return Ok(new
            {
                success = true,
                userCount,
                totalUsers = userIds.Count(),
                skippedSettingsUserIds = skippedSettings,
                skippedHcUserIds = skippedHc,
            });
        }
    }
}
