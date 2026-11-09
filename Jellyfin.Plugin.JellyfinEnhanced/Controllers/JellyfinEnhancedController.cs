using Microsoft.AspNetCore.Mvc;
using Jellyfin.Plugin.JellyfinEnhanced.Transport;
using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Newtonsoft.Json.Linq;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags.PosterTags;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Common.Net;
using MediaBrowser.Common.Plugins;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.Seerr;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model;
using MediaBrowser.Controller.Persistence;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Arr;
using Jellyfin.Plugin.JellyfinEnhanced.Extensions;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Admin.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Chrome.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Features.HiddenContent.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Infrastructure.Http;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.Arr;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.Library;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.Text;
using static Jellyfin.Plugin.JellyfinEnhanced.Shared.Seerr.SeerrCaches;
using Jellyfin.Database.Implementations;
using Jellyfin.Database.Implementations.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.MediaTags;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Seerr.PublicApi;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.Tmdb;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Seerr.Services;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public class JellyfinEnhancedController : JeControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILibraryManager _libraryManager;
        private readonly Features.Admin.Services.MaintenanceModeService _maintenanceModeService;
        private readonly Services.CdnAssetService _cdnAssetService;
        private readonly Services.UsageEventCounterService _usageEventCounterService;
        private readonly Services.AnalyticsReportingService _analyticsReportingService;
        private readonly IPluginManager _pluginManager;
        private readonly UserDisplayResolver _userDisplayResolver;
        private readonly ArrInstanceClient _arrInstanceClient;
        private readonly ActiveSessionsService _activeSessionsService;
        private readonly HiddenContentDocumentService _hiddenContentDocumentService;

        public JellyfinEnhancedController(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            ILibraryManager libraryManager,
            UserConfigurationManager userConfigurationManager,
            MediaBrowser.Controller.Session.ISessionManager sessionManager,
            Features.Admin.Services.MaintenanceModeService maintenanceModeService,
            Services.CdnAssetService cdnAssetService,
            Services.UsageEventCounterService usageEventCounterService,
            Services.AnalyticsReportingService analyticsReportingService,
            IPluginManager pluginManager)
            : base(userManager, logger, userConfigurationManager)
        {
            _httpClientFactory = httpClientFactory;
            _libraryManager = libraryManager;
            _maintenanceModeService = maintenanceModeService;
            _cdnAssetService = cdnAssetService;
            _usageEventCounterService = usageEventCounterService;
            _analyticsReportingService = analyticsReportingService;
            _pluginManager = pluginManager;
            _userDisplayResolver = new UserDisplayResolver(userManager);
            _arrInstanceClient = new ArrInstanceClient(httpClientFactory, logger);
            _activeSessionsService = new ActiveSessionsService(sessionManager);
            _hiddenContentDocumentService = new HiddenContentDocumentService(userConfigurationManager, logger, _userDisplayResolver);
        }

        [HttpGet("script")]
        public ActionResult GetMainScript() => GetScriptResource("js/plugin.js");
        [HttpGet("js/{**path}")]
        public ActionResult GetScript(string path) => GetScriptResource($"js/{path}");
        [HttpGet("Configuration/jeAdmin.css")]
        public ActionResult GetAdminStylesheet() => ServeConcatenated("jeAdmin.css", ".css", "text/css");

        [HttpGet("Configuration/jeAdmin.js")]
        public ActionResult GetAdminScript() => ServeConcatenated("jeAdmin.js", ".js", "application/javascript");

        // Engine file first, then every embedded Configuration/admin/*<ext> file (sorted), so adding a tab's sections or
        // styles never needs a route or csproj change.
        private ActionResult ServeConcatenated(string engineFile, string ext, string contentType)
        {
            const string prefix = "Jellyfin.Plugin.JellyfinEnhanced.Configuration.";
            var asm = Assembly.GetExecutingAssembly();
            var names = new[] { prefix + engineFile }
                .Concat(asm.GetManifestResourceNames()
                    .Where(n => n.StartsWith(prefix + "admin.", StringComparison.Ordinal) && n.EndsWith(ext, StringComparison.Ordinal))
                    .OrderBy(n => n, StringComparer.Ordinal));
            var sb = new System.Text.StringBuilder();
            foreach (var name in names)
            {
                using var stream = asm.GetManifestResourceStream(name);
                if (stream == null) continue;
                using var reader = new StreamReader(stream);
                sb.Append(reader.ReadToEnd()).Append('\n');
            }

            var devMode = JellyfinEnhanced.Instance?.Configuration?.DevMode == true;
            Response.Headers["Cache-Control"] = devMode ? "no-store" : "public, max-age=31536000, immutable";
            return Content(sb.ToString(), contentType);
        }

        // [AllowAnonymous]: version is loaded by translations.js cache-buster pre-login.
        // Information disclosure of the plugin version is acceptable — Jellyfin core
        // exposes its own version pre-auth too. CVEs against JE are tracked publicly
        // so attackers do not need this endpoint to fingerprint a vulnerable version.
        [HttpGet("version")]
        public ActionResult GetVersion() => Content(JellyfinEnhanced.Instance?.Version.ToString() ?? "unknown");

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

            return new JsonResult(BuildPrivateConfig(config));
        }

        /// <summary>
        /// The admin-only private config payload. Shared by /private-config and
        /// /bootstrap so the field list lives in one place; callers MUST gate on
        /// IsAdminUser() before calling this.
        /// </summary>
        private BootstrapPrivateConfig BuildPrivateConfig(PluginConfiguration config)
        {
            // Check + log corruption so admins who never hit one of the action endpoints
            // still see a server-side error entry on private-config load.
            _arrInstanceClient.WarnIfArrInstancesCorrupt(config);

            return new BootstrapPrivateConfig
            {
                // For Arr Links (legacy single-instance fields, kept for backward compat)
                SonarrUrl = config.SonarrUrl,
                RadarrUrl = config.RadarrUrl,
                BazarrUrl = config.BazarrUrl,
                SonarrUrlMappings = config.SonarrUrlMappings,
                RadarrUrlMappings = config.RadarrUrlMappings,
                BazarrUrlMappings = config.BazarrUrlMappings,

                // Shoko (single-instance, like Jellyseerr)
                ShokoUrl = config.ShokoUrl,
                ShokoUrlMappings = config.ShokoUrlMappings,

                // Multi-instance Sonarr/Radarr (no API keys exposed). Enabled flag is exposed so
                // the config page can render a per-instance toggle and arr-links can filter
                // disabled instances from the dropdown without a round-trip.
                SonarrInstances = config.GetSonarrInstances().Select(i => new BootstrapArrInstance { Name = i.Name, Url = i.Url, UrlMappings = i.UrlMappings, Enabled = i.Enabled }),
                RadarrInstances = config.GetRadarrInstances().Select(i => new BootstrapArrInstance { Name = i.Name, Url = i.Url, UrlMappings = i.UrlMappings, Enabled = i.Enabled }),

                // Corruption flags so the frontend can surface a toast without waiting for an
                // action endpoint to round-trip a corruption error envelope.
                SonarrInstancesCorrupt = config.IsSonarrInstancesCorrupt(),
                RadarrInstancesCorrupt = config.IsRadarrInstancesCorrupt(),

                // What each Custom tag rule matches, by rule id (the chip tooltip's second line).
                CustomTagRuleSources = CustomTagRuleSourcesForAdmins(config),
            };
        }

        /// <summary>The Custom tag rules as every client may see them: id, label and icon, in table order.</summary>
        private static BootstrapCustomTagRule[] CustomTagRulesForClients(PluginConfiguration config)
        {
            var matcher = CustomTagMatcher.For(config);
            return matcher.Rules.Select((rule, i) => new BootstrapCustomTagRule { Id = matcher.Ids[i], Label = rule.Label, Icon = rule.Icon }).ToArray();
        }

        /// <summary>The tag or collection each Custom tag rule matches, by id (admins only).</summary>
        private static BootstrapCustomTagSource[] CustomTagRuleSourcesForAdmins(PluginConfiguration config)
        {
            var matcher = CustomTagMatcher.For(config);
            return matcher.Rules.Select((rule, i) => new BootstrapCustomTagSource { Id = matcher.Ids[i], Match = rule.Match, Value = rule.Value }).ToArray();
        }
        // [AllowAnonymous]: public-config is loaded by `loadLoginImageEarly` before
        // the user logs in, so we cannot gate the whole endpoint on [Authorize].
        // Instead, sensitive Seerr fields (BaseUrl, UrlMappings) are REDACTED for
        // unauthenticated callers — they only need login-screen toggles like
        // EnableLoginImage. Authenticated callers (any Jellyfin user) get the full
        // payload so client-side "Open in Seerr" deep links still work.
        [HttpGet("public-config")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public ActionResult GetPublicConfig()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return StatusCode(503);
            }

            return new JsonResult(BuildPublicConfig(config));
        }

        /// <summary>
        /// Publish item looks only for targets the caller can see. The library's
        /// user-aware lookup applies Jellyfin's library and parental access checks,
        /// including series targets whose scoped look is inherited by children.
        /// No shared response cache or ETag is used for this per-request projection.
        /// </summary>
        private List<TagLookItemOverride>? VisibleItemLooks(PluginConfiguration config)
        {
            if (User?.Identity?.IsAuthenticated != true) return null;
            var looks = TagLookValidation.NormalizeItemOverrides(config.TagLookItemOverrides);
            if (looks is null) return null;
            var id = UserHelper.GetCurrentUserId(User);
            var user = id.HasValue ? _userManager?.GetUserById(id.Value) : null;
            if (user is null || _libraryManager is null) return null;
            var visible = looks.Where(look => _libraryManager.GetItemById<BaseItem>(Guid.Parse(look.ItemId), user) is not null).ToList();
            return visible.Count == 0 ? null : visible;
        }

        /// <summary>
        /// The public config payload. Shared by /public-config and /bootstrap so the
        /// field list lives in one place. Redaction of the Seerr URLs is keyed on the
        /// CURRENT request's authentication state, exactly as /public-config does.
        /// </summary>
        private BootstrapPublicConfig BuildPublicConfig(PluginConfiguration config)
        {
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

            // Maintenance banner state comes from the runtime state (in-memory), not just the
            // saved toggle: a scheduled window or a timed manual window is active without the
            // admin toggle being on, and carries its own message and end time for the countdown.
            var mmState = _maintenanceModeService.GetStatus();
            var mmActive = mmState.IsActive || config.MaintenanceModeEnabled;
            var mmMessage = mmState.IsActive && !string.IsNullOrWhiteSpace(mmState.Message)
                ? mmState.Message
                : config.MaintenanceModeMessage;

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

            return new BootstrapPublicConfig
            {
                // Jellyfin Enhanced Settings
                TmdbEnabled = tmdbEnabled,
                ToastDuration = config.ToastDuration,
                HelpPanelAutocloseDelay = config.HelpPanelAutocloseDelay,
                EnableCustomSplashScreen = config.EnableCustomSplashScreen,
                SplashScreenImageUrl = config.SplashScreenImageUrl,

                // Jellyfin Elsewhere Settings
                ElsewhereEnabled = config.ElsewhereEnabled,
                DEFAULT_REGION = config.DEFAULT_REGION,
                DEFAULT_PROVIDERS = config.DEFAULT_PROVIDERS,
                IGNORE_PROVIDERS = config.IGNORE_PROVIDERS,
                ElsewhereSeasonProviders = config.ElsewhereSeasonProviders,
                ElsewhereCustomBrandingText = config.ElsewhereCustomBrandingText,
                ElsewhereCustomBrandingImageUrl = config.ElsewhereCustomBrandingImageUrl,
                ClearLocalStorageTimestamp = config.ClearLocalStorageTimestamp,
                ClearTranslationCacheTimestamp = config.ClearTranslationCacheTimestamp,

                // Default User Settings
                AutoPauseEnabled = config.AutoPauseEnabled,
                AutoResumeEnabled = config.AutoResumeEnabled,
                AutoPipEnabled = config.AutoPipEnabled,
                AutoSkipIntro = config.AutoSkipIntro,
                AutoSkipOutro = config.AutoSkipOutro,
                LongPress2xEnabled = config.LongPress2xEnabled,
                RandomButtonEnabled = config.RandomButtonEnabled,
                RandomIncludeMovies = config.RandomIncludeMovies,
                RandomIncludeShows = config.RandomIncludeShows,
                RandomUnwatchedOnly = config.RandomUnwatchedOnly,
                RandomScopeCurrentContainer = config.RandomScopeCurrentContainer,
                ShowWatchProgress = config.ShowWatchProgress,
                WatchProgressDefaultMode = config.WatchProgressDefaultMode,
                WatchProgressTimeFormat = config.WatchProgressTimeFormat,
                ShowFileSizes = config.ShowFileSizes,
                RemoveContinueWatchingEnabled = config.RemoveContinueWatchingEnabled,
                ShowAudioLanguages = config.ShowAudioLanguages,
                Shortcuts = config.Shortcuts,
                ShowReviews = config.ShowReviews,
                ShowUserReviews = config.ShowUserReviews,
                ReviewsExpandedByDefault = config.ReviewsExpandedByDefault,
                HideReviewsFromHiddenUsers = config.HideReviewsFromHiddenUsers,
                HideReviewsFromDisabledUsers = config.HideReviewsFromDisabledUsers,
                ShowAwards = config.ShowAwards,
                ShowAnilistReviews = config.ShowAnilistReviews,
                ReviewTranslationEnabled = config.ReviewTranslationEnabled,
                ReviewTranslationServer = config.ReviewTranslationEnabled && !string.IsNullOrWhiteSpace(config.ReviewTranslationUrl),
                DoesTheDogDieEnabled = config.DoesTheDogDieEnabled && !string.IsNullOrWhiteSpace(config.DoesTheDogDieApiKey),
                MdblistEnabled = mdblistEnabled,
                MdblistRatingsEnabled = config.MdblistRatingsEnabled,
                MdblistRatingsShowOnItemDetails = config.MdblistRatingsShowOnItemDetails,
                MdblistRatingsSources = config.MdblistRatingsSources,
                MdblistRatingsShowPercentSymbol = config.MdblistRatingsShowPercentSymbol,
                ShowReleaseDates = config.ShowReleaseDates,
                ShowUserRatingOnPosters = config.ShowUserRatingOnPosters,
                ShowUserRatingDash = config.ShowUserRatingDash,
                PauseScreenEnabled = config.PauseScreenEnabled,
                PauseScreenDelaySeconds = config.PauseScreenDelaySeconds,
                ShowPlaybackRatingBadge = config.ShowPlaybackRatingBadge,
                NativePosterTagsEnabled = config.NativePosterTagsEnabled,
                TagStyleWebActive = config.TagStylesEnabled && config.TagStyleTarget is "web" or "both"
                    && (config.TagStylesAllowUserPreset || !TagStyleSet.Parse(config.TagStyleOverrides, config.TagStylePreset).IsEmpty),
                // Tag Styles: user presets
                TagStylesAllowUserPreset = config.TagStylesEnabled && config.TagStylesAllowUserPreset,
                TagStylePreset = TagStyleKeys.NormalizePreset(config.TagStylePreset),
                QualityTagsEnabled = config.QualityTagsEnabled,
                ShowResolutionTag = config.ShowResolutionTag,
                ShowSourceTag = config.ShowSourceTag,
                // Source and edition defaults.
                ShowEditionTag = config.ShowEditionTag,
                ShowRuntimeTag = config.ShowRuntimeTag,
                ShowVersionsTag = config.ShowVersionsTag,
                ShowAspectRatioTag = config.ShowAspectRatioTag,
                ShowFrameRateTag = config.ShowFrameRateTag,
                EditionTagOrder = config.EditionTagOrder,
                RuntimeTagOrder = config.RuntimeTagOrder,
                VersionsTagOrder = config.VersionsTagOrder,
                AspectRatioTagOrder = config.AspectRatioTagOrder,
                FrameRateTagOrder = config.FrameRateTagOrder,
                ShowLowQualitySourceTag = config.ShowLowQualitySourceTag,
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
                AgeRatingTagsEnabled = config.AgeRatingTagsEnabled,
                LogoTagsEnabled = config.LogoTagsEnabled,
                StatusTagsEnabled = config.StatusTagsEnabled,
                AwardsTagsEnabled = config.AwardsTagsEnabled,
                AwardsTagsPosition = config.AwardsTagsPosition,
                AwardsTagsImdb = config.AwardsTagsImdb,
                AwardsTagsCertifiedFresh = config.AwardsTagsCertifiedFresh,
                AwardsTagsOscar = config.AwardsTagsOscar,
                AwardsTagsEmmy = config.AwardsTagsEmmy,
                AwardsTagsLetterboxd = config.AwardsTagsLetterboxd,
                CustomTagsEnabled = config.CustomTagsEnabled,
                PeopleTagsEnabled = config.PeopleTagsEnabled,
                DisableAllShortcuts = config.DisableAllShortcuts,
                DefaultSubtitleStyle = config.DefaultSubtitleStyle,
                DefaultSubtitleSize = config.DefaultSubtitleSize,
                DefaultSubtitleFont = config.DefaultSubtitleFont,
                DefaultSubtitleTextEffect = config.DefaultSubtitleTextEffect,
                DisableCustomSubtitleStyles = config.DisableCustomSubtitleStyles,
                DefaultLanguage = config.DefaultLanguage,
                // Overlay positions
                QualityTagsPosition = config.QualityTagsPosition,
                GenreTagsPosition = config.GenreTagsPosition,
                LanguageTagsPosition = config.LanguageTagsPosition,
                LanguageTagsPriority = config.LanguageTagsPriority,
                LanguageTagsPriorityStrict = config.LanguageTagsPriorityStrict,
                LanguageTagsMergeRegions = config.LanguageTagsMergeRegions,
                QualityTagsPreferredAudioLanguage = config.QualityTagsPreferredAudioLanguage,
                SeriesQualityAggregation = Shared.MediaTags.SeriesQualityAggregation.Normalize(config.SeriesQualityAggregation),
                QualityHideSdr = config.QualityHideSdr,
                QualityMinimumResolution = QualityDisplayRules.Minimum(config.QualityMinimumResolution),
                QualityHdrDisplayMode = QualityDisplayRules.Mode(config.QualityHdrDisplayMode),
                QualityVideoCodecDisplayMode = QualityDisplayRules.Mode(config.QualityVideoCodecDisplayMode),
                QualityAudioDisplayMode = QualityDisplayRules.Mode(config.QualityAudioDisplayMode),
                QualityTagsAudioLanguageFromUser = config.QualityTagsAudioLanguageFromUser,
                RatingTagsPosition = config.RatingTagsPosition,
                RatingTagsOnMovies = config.RatingTagsOnMovies,
                RatingTagsOnSeries = config.RatingTagsOnSeries,
                RatingTagsOnSeasons = config.RatingTagsOnSeasons,
                RatingTagsOnEpisodes = config.RatingTagsOnEpisodes,
                RatingTagsOnContinueWatching = config.RatingTagsOnContinueWatching,
                RatingTagsOnNextUp = config.RatingTagsOnNextUp,
                RatingTagsShowCommunity = config.RatingTagsShowCommunity,
                RatingTagsShowCritic = config.RatingTagsShowCritic,
                // Multi-source rating defaults.
                RatingTagsSources = RatingSourceSettings.Defaults(config),
                RatingTagsMinScore = RatingSourceSettings.NormalizeMinimum(config.RatingTagsMinScore),
                RatingTagsColorByScore = config.RatingTagsColorByScore,
                // Language Tags display starting defaults (normalized)
                LanguageTagsShowAudio = config.LanguageTagsShowAudio,
                LanguageTagsShowSubtitles = config.LanguageTagsShowSubtitles,
                LanguageTagsStyle = LanguageTagDisplay.NormalizeStyle(config.LanguageTagsStyle),
                LanguageTagsCountBadge = LanguageTagDisplay.NormalizeCountBadge(config.LanguageTagsCountBadge),
                AgeRatingTagsPosition = config.AgeRatingTagsPosition,
                // Logos group: its starting corner and the administrator's (read-only) choices.
                LogoTagsPosition = config.LogoTagsPosition,
                LogoTagsMovieMode = LogoTagRules.MovieMode(config.LogoTagsMovieMode),
                LogoTagsSeriesMode = LogoTagRules.SeriesMode(config.LogoTagsSeriesMode),
                LogoTagsMaxLogos = LogoTagRules.Max(config.LogoTagsMaxLogos),
                StatusTagsPosition = config.StatusTagsPosition,
                // Custom tag group: starting corner and rules.
                CustomTagsPosition = config.CustomTagsPosition,
                // Rule ids, labels and icons only: the tag or collection a rule matches is
                // admin-only (CustomTagRuleSources in the private config).
                CustomTagRules = CustomTagRulesForClients(config),
                StatusTagsJustAdded = config.StatusTagsJustAdded,
                StatusTagsNewRelease = config.StatusTagsNewRelease,
                StatusTagsTrending = config.StatusTagsTrending,
                StatusTagsSchedule = config.StatusTagsSchedule,
                StatusTagsMilestones = config.StatusTagsMilestones,
                StatusTagsSeriesStatus = config.StatusTagsSeriesStatus,
                StatusTagsScenes = config.StatusTagsScenes,
                // Leaving soon / direct-play families: starting values, and whether a
                // Leaving soon source is set (never its URL, key or collection names).
                StatusTagsLeaving = config.StatusTagsLeaving,
                StatusTagsDirectPlay = config.StatusTagsDirectPlay,
                LeavingSoonAvailable = Features.MediaTags.Services.LeavingSoonService.Configured(config),
                StatusTagsJustAddedDays = config.StatusTagsJustAddedDays,
                StatusTagsNewReleaseDays = config.StatusTagsNewReleaseDays,
                // Poster tag layout starting defaults (normalized; null = built-in)
                TagLayout = TagLayoutRules.NormalizeLayout(config.TagLayout),
                TagLayouts = TagLayoutRules.NormalizeProfiles(config.TagLayouts),
                TagGroupOrder = TagLayoutRules.NormalizeOrder(config.TagGroupOrder),
                TagGroupCaps = TagLayoutRules.NormalizeCaps(config.TagGroupCaps),
                TagGroupScopes = TagLayoutRules.NormalizeScopes(config.TagGroupScopes),
                TagLabelDensity = TagLayoutRules.NormalizeDensity(config.TagLabelDensity),
                TagScale = TagLayoutRules.NormalizeScale(config.TagScale),
                TagGap = TagLayoutRules.NormalizeGap(config.TagGap),
                TagEdgeSpacing = TagLayoutRules.NormalizeEdgeSpacing(config.TagEdgeSpacing) ?? "default",
                // Tag look rules starting default (normalized; null = none)
                TagLookRules = TagLookValidation.NormalizeRules(config.TagLookRules),
                // Server-wide per-item looks (normalized; null = none): ids and looks only,
                // and only for signed-in callers (item ids are not for the login page).
                TagLookItemOverrides = VisibleItemLooks(config),
                // Per-shape tag looks starting default (normalized; null = none)
                TagShapeOverrides = TagShapeRules.NormalizeDefaults(config.TagShapeOverrides),
                ShowRatingInPlayer = config.ShowRatingInPlayer,

                TagsCacheTtlDays = config.TagsCacheTtlDays,
                DisableTagsOnSearchPage = config.DisableTagsOnSearchPage,
                TagsHideOnHover = config.TagsHideOnHover,
                TagCacheServerMode = config.TagCacheServerMode,
                EnableTagsLocalStorageFallback = config.EnableTagsLocalStorageFallback,

                // Seerr Search Settings
                JellyseerrEnabled = config.JellyseerrEnabled,
                JellyseerrShowSearchResults = config.JellyseerrShowSearchResults,
                JellyseerrSearchExcludeLibraryItems = config.JellyseerrSearchExcludeLibraryItems,
                JellyseerrShowReportButton = config.JellyseerrShowReportButton,
                JellyseerrShowIssueIndicator = config.JellyseerrShowIssueIndicator,
                JellyseerrEnable4KRequests = config.JellyseerrEnable4KRequests,
                JellyseerrEnable4KTvRequests = config.JellyseerrEnable4KTvRequests,
                ShowCollectionsInSearch = config.ShowCollectionsInSearch,
                JellyseerrShowAdvanced = config.JellyseerrShowAdvanced,
                JellyseerrSingleSeasonRequestOnly = config.JellyseerrSingleSeasonRequestOnly,
                JellyseerrShowQuotaInfo = config.JellyseerrShowQuotaInfo,
                ShowElsewhereOnJellyseerr = config.ShowElsewhereOnJellyseerr,
                JellyseerrUseMoreInfoModal = config.JellyseerrUseMoreInfoModal,
                JellyseerrAvailablePosterLinksToJellyfin = config.JellyseerrAvailablePosterLinksToJellyfin,
                AddRequestedMediaToWatchlist = config.AddRequestedMediaToWatchlist,
                SyncJellyseerrWatchlist = config.SyncJellyseerrWatchlist,
                JellyseerrAutoImportUsers = config.JellyseerrAutoImportUsers,
                JellyseerrShowSimilar = config.JellyseerrShowSimilar,
                JellyseerrShowRecommended = config.JellyseerrShowRecommended,
                JellyseerrShowRequestMoreOnSeries = config.JellyseerrShowRequestMoreOnSeries,
                JellyseerrShowNetworkDiscovery = config.JellyseerrShowNetworkDiscovery,
                JellyseerrShowGenreDiscovery = config.JellyseerrShowGenreDiscovery,
                JellyseerrShowTagDiscovery = config.JellyseerrShowTagDiscovery,
                JellyseerrShowPersonDiscovery = config.JellyseerrShowPersonDiscovery,
                JellyseerrShowCollectionDiscovery = config.JellyseerrShowCollectionDiscovery,
                JellyseerrShowDetailPageLink = config.JellyseerrShowDetailPageLink,
                JellyseerrShowDetailPageLinkAsText = config.JellyseerrShowDetailPageLinkAsText,
                JellyseerrExcludeLibraryItems = config.JellyseerrExcludeLibraryItems,
                JellyseerrExcludeBlocklistedItems = config.JellyseerrExcludeBlocklistedItems,
                JellyseerrDisableCache = config.JellyseerrDisableCache,
                JellyseerrBaseUrl = jellyseerrBaseUrl,
                JellyseerrUrlMappings = jellyseerrUrlMappings,

                // Bookmarks Settings
                BookmarksEnabled = config.BookmarksEnabled,
                BookmarksUsePluginPages = config.BookmarksUsePluginPages,
                BookmarksUseCustomTabs = config.BookmarksUseCustomTabs,
                BookmarksUseNativeTab = config.BookmarksUseNativeTab,

                // Arr Links Settings
                ArrLinksEnabled = config.ArrLinksEnabled,
                ShowArrLinksAsText = config.ShowArrLinksAsText,
                ArrLinksShowStatusSingle = config.ArrLinksShowStatusSingle,

                // Arr Tags Sync Settings
                ArrTagsSyncEnabled = config.ArrTagsSyncEnabled,
                ArrTagsPrefix = config.ArrTagsPrefix,
                ArrTagsShowAsLinks = config.ArrTagsShowAsLinks,
                ArrTagsLinksFilter = config.ArrTagsLinksFilter,
                ArrTagsLinksHideFilter = config.ArrTagsLinksHideFilter,

                // Audio Language Tags Sync Settings
                AudioLanguageTagSyncEnabled = config.AudioLanguageTagSyncEnabled,
                AudioLanguageTagPrefix = config.AudioLanguageTagPrefix,
                AudioLanguageTagShowAsLinks = config.AudioLanguageTagShowAsLinks,

                // Letterboxd Settings
                LetterboxdEnabled = config.LetterboxdEnabled,
                ShowLetterboxdLinkAsText = config.ShowLetterboxdLinkAsText,
                // Metadata Icons (Druidblack)
                MetadataIconsEnabled = config.MetadataIconsEnabled,

                // Icon Settings
                UseIcons = config.UseIcons,
                IconStyle = config.IconStyle,

                // Extras Settings
                ColoredRatingsEnabled = config.ColoredRatingsEnabled,
                ThemeSelectorEnabled = config.ThemeSelectorEnabled,
                ColoredActivityIconsEnabled = config.ColoredActivityIconsEnabled,
                PluginIconsEnabled = config.PluginIconsEnabled,
                EnableLoginImage = config.EnableLoginImage,
                ActiveStreamsEnabled = config.ActiveStreamsEnabled,
                ActiveStreamsAllUsers = config.ActiveStreamsAllUsers,
                AnalyticsEnabled = config.AnalyticsEnabled,
                AnalyticsShareUsageCounts = config.AnalyticsShareUsageCounts,

                // Requests Page Settings
                DownloadsPageEnabled = config.DownloadsPageEnabled,
                DownloadsPageShowIssues = config.DownloadsPageShowIssues,
                ShowDownloadsInRequests = config.ShowDownloadsInRequests,
                DownloadsUsePluginPages = config.DownloadsUsePluginPages,
                DownloadsUseCustomTabs = config.DownloadsUseCustomTabs,
                DownloadsUseNativeTab = config.DownloadsUseNativeTab,
                DownloadsPagePollingEnabled = config.DownloadsPagePollingEnabled,
                DownloadsPollIntervalSeconds = config.DownloadsPollIntervalSeconds,
                DownloadsFilterByUserRequests = config.DownloadsFilterByUserRequests,
                DownloadsShowHistory = config.DownloadsShowHistory,
                DownloadsHistoryAdminOnly = config.DownloadsHistoryAdminOnly,

                // Calendar Page Settings
                CalendarPageEnabled = config.CalendarPageEnabled,
                CalendarUseCustomTabs = config.CalendarUseCustomTabs,
                CalendarUsePluginPages = config.CalendarUsePluginPages,
                CalendarUseNativeTab = config.CalendarUseNativeTab,
                CalendarFirstDayOfWeek = config.CalendarFirstDayOfWeek,
                CalendarTimeFormat = config.CalendarTimeFormat,
                CalendarHighlightFavorites = config.CalendarHighlightFavorites,
                CalendarHighlightWatchedSeries = config.CalendarHighlightWatchedSeries,
                CalendarFilterByLibraryAccess = config.CalendarFilterByLibraryAccess,
                CalendarShowOnlyRequested = config.CalendarShowOnlyRequested,
                CalendarForceOnlyRequested = config.CalendarForceOnlyRequested,
                ShokoConfigured = config.IsShokoConfigured(),

                // Recommendations Page Settings
                RecommendationsPageEnabled = config.RecommendationsPageEnabled,
                RecommendationsUseCustomTabs = config.RecommendationsUseCustomTabs,
                RecommendationsUseNativeTab = config.RecommendationsUseNativeTab,

                // Activity Feed Settings
                ActivityFeedEnabled = config.ActivityFeedEnabled,
                ActivityFeedUseCustomTabs = config.ActivityFeedUseCustomTabs,
                ActivityFeedUseNativeTab = config.ActivityFeedUseNativeTab,
                ActivityFeedShowWatched = config.ActivityFeedShowWatched,
                ActivityFeedShowFavorited = config.ActivityFeedShowFavorited,
                ActivityFeedShowReviewed = config.ActivityFeedShowReviewed,
                ActivityFeedShowActiveStreams = config.ActivityFeedShowActiveStreams,

                // Hidden Content Settings
                HiddenContentEnabled = config.HiddenContentEnabled,
                HiddenContentUsePluginPages = config.HiddenContentUsePluginPages,
                HiddenContentUseCustomTabs = config.HiddenContentUseCustomTabs,
                HiddenContentUseNativeTab = config.HiddenContentUseNativeTab,
                HiddenContentAdmin = config.HiddenContentAdmin,

                // Catch Up Page Settings
                CatchUpEnabled = config.CatchUpEnabled,
                CatchUpUsePluginPages = config.CatchUpUsePluginPages,
                CatchUpUseCustomTabs = config.CatchUpUseCustomTabs,
                CatchUpUseNativeTab = config.CatchUpUseNativeTab,

                // Maintenance Mode
                MaintenanceModeEnabled = mmActive,
                MaintenanceModeMessage = mmMessage,
                // UTC ISO timestamp (or null when open-ended) so the banner can count down.
                MaintenanceModeEndsAt = mmState.IsActive ? mmState.EndsAt : null,
                MaintenanceModeAction = config.MaintenanceModeAction,
                // Derived, never the raw value: the stored setting can be a
                // JSON array of real user GUIDs, and this endpoint is
                // anonymous (pre-login). No client script reads this field —
                // enforcement is server-side — so only the shape is exposed.
                MaintenanceModeAffectedUsers = PluginConfiguration.DeriveAffectedUsersShape(config.MaintenanceModeAffectedUsers),

                // Spoiler Guard — frontend uses these to decide whether the per-show toggle appears.
                SpoilerBlurEnabled = config.SpoilerBlurEnabled,
                SpoilerBlurIntensity = config.SpoilerBlurIntensity,
                SpoilerBlurStrictRefresh = config.SpoilerBlurStrictRefresh,
                // Strip-policy fields drive the per-user override UI — only
                // admin-enabled categories surface an opt-out toggle.
                SpoilerStripSeriesOverview = config.SpoilerStripSeriesOverview ?? config.SpoilerStripOverview,
                SpoilerStripOverview = config.SpoilerStripOverview,
                SpoilerStripTags = config.SpoilerStripTags,
                SpoilerStripChapters = config.SpoilerStripChapters,
                SpoilerStripTaglines = config.SpoilerStripTaglines,
                SpoilerStripRatings = config.SpoilerStripRatings,
                SpoilerStripPremiereDate = config.SpoilerStripPremiereDate,
                SpoilerReplaceTitle = config.SpoilerReplaceTitle,
                SpoilerStripCast = config.SpoilerStripCast,
                SpoilerStripReviews = config.SpoilerStripReviews,
                // Gates the per-user "Seek previews" opt-out row.
                SpoilerBlurTrickplay = config.SpoilerBlurTrickplay,
                // Advanced category reveals: clients only need the master flag
                // (to gate the per-user opt-out row in the settings panel);
                // the six per-category strip toggles are server-only strip
                // policy and are deliberately not exposed.
                SpoilerAdvancedMode = config.SpoilerAdvancedMode,
            };
        }

        /// <summary>
        /// One-request client bootstrap: everything plugin.js used to fetch in its
        /// first two stages (version, public config, admin-only private config,
        /// delivery-plugin presence, the five per-user documents) plus the ordered
        /// component-script list. Every part reuses the builder behind the
        /// corresponding standalone endpoint, so the shapes are identical and the
        /// existing endpoints stay as they are for the config page, other callers
        /// and clients that cached an older plugin.js.
        ///
        /// Security: [Authorize] (no anonymous variant — the login screen keeps
        /// using /public-config); the private config is included only when the
        /// caller passes the same IsAdminUser() gate as /private-config (null
        /// otherwise); the user documents are always those of the TOKEN's user —
        /// there is no userId parameter to point elsewhere.
        /// </summary>
        [HttpGet("bootstrap")]
        [Authorize]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public ActionResult GetBootstrap()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return StatusCode(503);
            }

            var userId = UserHelper.GetCurrentUserId(User);
            if (!userId.HasValue)
            {
                return Forbid();
            }

            // UserConfigurationManager expects folder names in N format (without dashes),
            // matching AuthorizeUserConfigAccess.
            var authorizedUserId = userId.Value.ToString("N");

            IReadOnlyList<string>? componentScripts = null;
            try
            {
                componentScripts = Services.ClientScriptBundle.GetComponentScripts();
            }
            catch (Exception ex)
            {
                // The client falls back to fetching js/component-scripts.json itself.
                _logger.Error($"Bootstrap: could not read the component-script manifest: {ex.Message}");
            }

            var isAdmin = IsAdminUser();

            var settingsSnapshot = TryLoadUserDocument("settings.json", authorizedUserId, () => LoadRevisionedSettings(authorizedUserId));
            var bookmarkSnapshot = TryLoadUserDocument("bookmark.json", authorizedUserId, () => new Features.Bookmarks.Services.BookmarkDocumentService(_userConfigurationManager).Read(authorizedUserId));
            return TransportJson.Create(new BootstrapResponse
            {
                Version = JellyfinEnhanced.Instance?.Version.ToString() ?? "unknown",
                // Lets the client confirm the payload belongs to the user it expects
                // (a token swap during a user switch must never be applied silently).
                UserId = authorizedUserId,
                PublicConfig = BuildPublicConfig(config),
                PrivateConfig = isAdmin ? BuildPrivateConfig(config) : null,
                // Same name checks the client used to run against GET /Plugins.
                HasCustomTabs = IsPluginInstalled("Custom Tabs"),
                HasPluginPages = IsPluginInstalled("Plugin Pages"),
                UserSettings = new BootstrapUserDocuments
                {
                    Settings = settingsSnapshot?.Settings,
                    SettingsRevision = settingsSnapshot?.Revision,
                    Shortcuts = TryLoadUserDocument("shortcuts.json", authorizedUserId, () => _userConfigurationManager.GetUserConfiguration<UserShortcuts>(authorizedUserId, "shortcuts.json")),
                    Bookmark = null,
                    BookmarkSnapshot = bookmarkSnapshot,
                    Elsewhere = TryLoadUserDocument("elsewhere.json", authorizedUserId, () => _userConfigurationManager.GetUserConfiguration<ElsewhereSettings>(authorizedUserId, "elsewhere.json")),
                    HiddenContent = TryLoadUserDocument("hidden-content.json", authorizedUserId, () => _hiddenContentDocumentService.LoadUserHiddenContentDocument(authorizedUserId)),
                },
                ComponentScripts = componentScripts,
                Prefetched = BuildBootstrapPrefetched(config, userId.Value, authorizedUserId, isAdmin),
            });
        }

        /// <summary>
        /// Small answers the component modules ask for on every page load, carried
        /// in the bootstrap so they cost no request of their own. Each value is the
        /// exact body of its standalone endpoint (which stays for every other
        /// caller) under the same gate, or null when that endpoint would be needed
        /// anyway: the feature is off, the caller may not read it, or answering
        /// would mean an upstream round trip (Seerr) or a failure the endpoint
        /// reports itself (a corrupt Spoiler Guard file). The client takes each
        /// value at most once and only shortly after the response, and otherwise
        /// asks the endpoint as before.
        ///   SpoilerBlurSeries    — GET spoiler-blur/series (the caller's own state)
        ///   SeerrUserStatus      — GET jellyseerr/user-status, when no Seerr lookup is needed
        ///   SeerrStatus          — GET jellyseerr/status, from the 30-second probe cache only
        ///   ActiveStreamSessions — GET active-streams/sessions, admins or ActiveStreamsAllUsers
        ///   TagStripRevision     — the StripRevision POST tag-data answers carry (no endpoint of its
        ///                          own), null when the Spoiler Guard state could not be read
        /// </summary>
        private BootstrapPrefetched BuildBootstrapPrefetched(PluginConfiguration config, Guid userId, string authorizedUserId, bool isAdmin)
        {
            UserSpoilerBlur? spoilerBlurSeries = null;
            object? seerrUserStatus = null;
            object? seerrStatus = null;
            List<object>? activeStreamSessions = null;

            if (config.SpoilerBlurEnabled)
            {
                spoilerBlurSeries = TryReadSpoilerBlurStateForBootstrap(authorizedUserId);
            }

            // Lets the web batch fallback check what it kept from earlier pages before
            // its first request (tags/tag-pipeline.js); unknown when the state is unreadable.
            string? tagStripRevision = !Shared.SpoilerGuard.SpoilerTagDataStripper.IsConfigured(config)
                ? Shared.SpoilerGuard.SpoilerTagDataStripper.NoTagStrip
                : spoilerBlurSeries == null
                    ? null
                    : Shared.SpoilerGuard.SpoilerTagDataStripper.TagStripRevision(Shared.SpoilerGuard.SpoilerTagDataStripper.CreatePolicy(config, spoilerBlurSeries));

            if (config.JellyseerrEnabled)
            {
                // Same "D"-format id GetJellyseerrUserStatus reads from the token.
                seerrUserStatus = SeerrApi.Status.TryBuildSeerrUserStatusWithoutLookup(config, userId.ToString(), isAdmin);

                // Asked at startup by the issue reporter only.
                if (config.JellyseerrShowReportButton)
                {
                    var reachable = TryGetCachedSeerrReachability();
                    if (reachable.HasValue)
                    {
                        seerrStatus = SeerrApi.Status.SeerrStatusResponse(reachable.Value);
                    }
                }
            }

            if (CanReadActiveSessions(config, isAdmin))
            {
                try
                {
                    activeStreamSessions = _activeSessionsService.BuildActiveSessionList(isAdmin);
                }
                catch (Exception ex)
                {
                    _logger.Warning($"Bootstrap: could not list active sessions: {ex.Message}");
                }
            }

            return new BootstrapPrefetched
            {
                SpoilerBlurSeries = spoilerBlurSeries,
                SeerrUserStatus = seerrUserStatus,
                SeerrStatus = seerrStatus,
                ActiveStreamSessions = activeStreamSessions,
                TagStripRevision = tagStripRevision,
            };
        }

        /// <summary>
        /// Loads one per-user document for the bootstrap payload. A failure yields
        /// null (the client then applies the same defaults it uses when the
        /// standalone endpoint fails) instead of failing the whole bootstrap.
        /// </summary>
        private T? TryLoadUserDocument<T>(string fileName, string authorizedUserId, Func<T> load) where T : class
        {
            try
            {
                return load();
            }
            catch (Exception ex)
            {
                _logger.Error($"Bootstrap: failed to load {fileName} for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Whether a plugin with exactly this name is loaded and running right now. A plugin
        /// that is disabled (after the restart that unloads it) or failed to load serves
        /// nothing, so the client must treat it as absent; one disabled, deleted or updated
        /// but not yet restarted is still loaded and serving, so it counts as present.
        /// </summary>
        private bool IsPluginInstalled(string name)
        {
            try
            {
                return _pluginManager.Plugins.Any(p => string.Equals(p.Name, name, StringComparison.Ordinal)
                    && p.Instance != null);
            }
            catch (Exception ex)
            {
                _logger.Warning($"Bootstrap: could not enumerate installed plugins: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// The concatenated component scripts (see Services/ClientScriptBundle).
        /// Same headers as GetScriptResource: immutable in production (the URL
        /// carries the cache key), no-store and rebuilt per request in dev mode.
        /// </summary>
        [HttpGet("bundle.js")]
        public ActionResult GetScriptBundle() => GetScriptBundleResource(map: false);

        [HttpGet("bundle.js.map")]
        public ActionResult GetScriptBundleMap() => GetScriptBundleResource(map: true);

        private ActionResult GetScriptBundleResource(bool map)
        {
            var plugin = JellyfinEnhanced.Instance;
            if (plugin == null)
            {
                return StatusCode(503);
            }

            var devMode = plugin.Configuration?.DevMode == true;
            byte[] script, sourceMap;
            try
            {
                (script, sourceMap) = Services.ClientScriptBundle.GetBundle(plugin.ScriptCacheKey, rebuild: devMode, _logger);
            }
            catch (Exception ex)
            {
                // The client falls back to loading the component scripts individually.
                _logger.Error($"Failed to build the component bundle: {ex.Message}");
                return StatusCode(500);
            }

            Response.Headers["Cache-Control"] = devMode ? "no-store" : "public, max-age=31536000, immutable";
            return map
                ? File(sourceMap, "application/json")
                : File(script, "application/javascript");
        }

        /// <summary>
        /// Award wins/nominations for a title or a person, keyed by TMDB id.
        /// "movie"/"tv" return awards the title itself (or a cast/crew member,
        /// "for" that title) received; "person" returns that person's own
        /// full award history across their career. Backed by
        /// WikidataAwardsService's disk cache — Wikidata's public SPARQL endpoint
        /// needs no API key, so this is gated only on the ShowAwards toggle, not
        /// TMDB_API_KEY (that key is unrelated to this lookup).
        /// </summary>
        /// <summary>
        /// Bumps one feature-usage counter (e.g. "seerr.request_submitted") for the
        /// current analytics reporting period. No-ops silently (not an error)
        /// unless analytics AND the usage-counts category are both enabled, so a
        /// client that fires this unconditionally never needs to check config
        /// first. Any authenticated user can call this; it's a fire-and-forget
        /// counter bump, not a privileged action.
        /// </summary>
        [HttpPost("usage/track")]
        [Authorize]
        public IActionResult TrackUsage([FromBody] JsonElement requestBody)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.AnalyticsEnabled || !config.AnalyticsShareUsageCounts)
            {
                return Ok();
            }

            if (!requestBody.TryGetProperty("key", out var keyEl) || keyEl.ValueKind != JsonValueKind.String)
            {
                return BadRequest("Missing 'key'.");
            }

            var key = keyEl.GetString() ?? string.Empty;
            // IsKnownKey restricts this endpoint to the finite set of counters
            // the plugin actually emits: without it, any authenticated user
            // could mint unbounded distinct counter rows or forge "total.*"
            // snapshot keys alongside the real ones.
            if (!Services.UsageEventCounterService.IsValidKey(key))
            {
                return BadRequest("Invalid feature key.");
            }
            if (!Services.UsageEventCounterService.IsKnownKey(key))
            {
                // Loud on purpose: a well-formed-but-unlisted key is almost
                // always a new client counter shipped without the matching
                // KnownKeys entry — silently 400ing it would read as "nobody
                // uses this feature" on the dashboard forever. (key already
                // passed the charset check above, so it's safe to log.)
                _logger.Warning($"[Analytics] Rejected unknown usage key '{key}' — new counters must be added to UsageEventCounterService.KnownKeys in the same change that emits them.");
                return BadRequest("Unknown feature key.");
            }

            _usageEventCounterService.Increment(key);
            return Ok();
        }

        /// <summary>
        /// Returns the exact payload a report would send right now, using the
        /// CURRENTLY DISPLAYED checkbox states from the request body, not
        /// necessarily the saved config, so toggling a checkbox on the
        /// config page and clicking Preview updates immediately, without
        /// requiring Save first. Also returns when/what was last actually
        /// sent (that part always reflects the real saved state). Admin-only
        /// since it reflects the server's full config-flag snapshot.
        ///
        /// Deliberately does NOT call EnsureRegisteredAsync: registering
        /// mints a real row on the backend, and a preview click is not
        /// consent to opt in. If this install has never actually sent a real
        /// report, InstallId is shown as an unregistered placeholder rather
        /// than silently registering just to fill in the preview. Only a
        /// genuine send (config saved with analytics on, or the scheduled
        /// task) ever registers.
        /// </summary>
        [HttpPost("usage/preview")]
        [Authorize]
        public IActionResult PreviewUsageReport([FromBody] JsonElement requestBody)
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return StatusCode(503);
            }

            bool ReadBool(string name, bool fallback) =>
                requestBody.TryGetProperty(name, out var el) && el.ValueKind is JsonValueKind.True or JsonValueKind.False
                    ? el.GetBoolean()
                    : fallback;

            var shareFeatureFlags = ReadBool("shareFeatureFlags", config.AnalyticsShareFeatureFlags);
            var shareUsageCounts = ReadBool("shareUsageCounts", config.AnalyticsShareUsageCounts);
            var shareDataSizes = ReadBool("shareDataSizes", config.AnalyticsShareDataSizes);

            var payload = _analyticsReportingService.BuildPayload(config, shareFeatureFlags, shareUsageCounts, shareDataSizes);
            var displayInstallId = string.IsNullOrEmpty(payload.InstallId)
                ? "(not registered yet; assigned on first real send)"
                : payload.InstallId;

            return new JsonResult(new
            {
                Payload = new
                {
                    InstallId = displayInstallId,
                    payload.PluginVersion,
                    payload.JellyfinVersion,
                    payload.JellyfinTarget,
                    payload.Config,
                    payload.Settings,
                    payload.DataFileSizes,
                    payload.Period,
                    payload.Events,
                },
                LastReportedAt = config.AnalyticsLastReportedAt,
                LastPayloadJson = config.AnalyticsLastPayloadJson,
            });
        }

        [HttpGet("locales")]
        [Authorize]
        [ResponseCache(Duration = 86400)]
        public ActionResult GetAvailableLocales()
        {
            var prefix = "Jellyfin.Plugin.JellyfinEnhanced.js.locales.";
            var suffix = ".json";
            var locales = Assembly.GetExecutingAssembly()
                .GetManifestResourceNames()
                .Where(n => n.StartsWith(prefix, StringComparison.Ordinal) && n.EndsWith(suffix, StringComparison.Ordinal))
                .Select(n => n.Substring(prefix.Length, n.Length - prefix.Length - suffix.Length))
                .Where(code => code != "en") // Exclude base English (en-GB and en-US are the usable variants)
                .OrderBy(code => code, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return Ok(locales);
        }

        /// <summary>
        /// Local CDN route. Serves a third-party static asset (icon, flag, theme
        /// sheet, remote locale, …) from the plugin's on-disk cache, fetching it from the
        /// fixed upstream CDN on a cache miss. This is the ONLY endpoint clients use for
        /// these assets — they never contact an external host directly.
        ///
        /// Anonymous by design: these are public assets loaded via &lt;img&gt;, CSS
        /// @import and &lt;link&gt;, none of which can carry a Jellyfin auth token, and no
        /// user data is exposed. The {source} is validated against a fixed allow-list and
        /// {path} is strictly sanitized in the service, so this cannot be used as an open
        /// proxy.
        /// </summary>
        [HttpGet("cdn/{source}/{**path}")]
        public async Task<IActionResult> GetCdnAsset(string source, string path, CancellationToken cancellationToken)
        {
            if (!_cdnAssetService.IsValidSource(source))
            {
                return NotFound();
            }

            var asset = await _cdnAssetService.GetAsync(source, path ?? string.Empty, forceRefresh: false, cancellationToken).ConfigureAwait(false);
            if (asset == null)
            {
                return NotFound();
            }

            // Long-lived immutable caching: after the first hit the browser serves these
            // from its own cache and rarely re-requests. Conditional requests get a 304.
            Response.Headers["Cache-Control"] = "public, max-age=86400";
            Response.Headers["ETag"] = asset.ETag;
            // Defence in depth for SVG served same-origin: forbid MIME sniffing and, for
            // SVG specifically, sandbox it so an embedded <script> can never execute if it
            // were opened directly.
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            if (asset.ContentType.Equals("image/svg+xml", StringComparison.OrdinalIgnoreCase))
            {
                Response.Headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
            }

            if (Request.Headers.TryGetValue("If-None-Match", out var ifNoneMatch)
                && ifNoneMatch.ToString().Contains(asset.ETag, StringComparison.Ordinal))
            {
                return StatusCode(304);
            }

            return File(asset.Content, asset.ContentType);
        }

        // Material Symbols glyph fonts, bundled with the plugin instead of proxied
        // from Google Fonts (see #830). The -subset files hold only the icons the
        // client uses (scripts/material-symbols/subset.py) under JE-private family
        // names; the full fonts back the public family names for themes and custom
        // CSS that rely on JE providing them.
        private static readonly HashSet<string> BundledFontNames = new(StringComparer.OrdinalIgnoreCase)
        {
            "materialsymbolsrounded-subset.woff2",
            "materialsymbolsoutlined-subset.woff2",
            "materialsymbolsrounded.woff2",
            "materialsymbolsoutlined.woff2"
        };

        [HttpGet("fonts/{name}")]
        public IActionResult GetBundledFont(string name)
        {
            var sanitized = Path.GetFileName(name);
            if (!BundledFontNames.Contains(sanitized))
            {
                return NotFound();
            }

            var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream($"Jellyfin.Plugin.JellyfinEnhanced.js.fonts.{sanitized}");
            if (stream == null)
            {
                return NotFound();
            }

            Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
            return File(stream, "font/woff2");
        }

        [HttpGet("locales/{lang}.json")]
        public ActionResult GetLocale(string lang)
        {
            var sanitizedLang = Path.GetFileName(lang); // Basic sanitization
            var resourcePath = $"Jellyfin.Plugin.JellyfinEnhanced.js.locales.{sanitizedLang}.json";
            var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourcePath);

            if (stream == null && sanitizedLang.Contains('-'))
            {
                // Fall back from regional variant (e.g. de-DE) to the base language (de).
                // Jellyfin reports BCP-47 codes like de-DE when the user picks "Auto" or a
                // regional locale, but the plugin only ships base-language files for most
                // languages. Without this fallback the user gets English instead of German.
                var baseLang = sanitizedLang.Split('-')[0];
                var fallbackPath = $"Jellyfin.Plugin.JellyfinEnhanced.js.locales.{baseLang}.json";
                stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(fallbackPath);
                if (stream != null)
                {
                    _logger.Info($"Locale file not found for {sanitizedLang}, falling back to base language {baseLang}");
                }
            }

            if (stream == null)
            {
                _logger.Warning($"Locale file not found for language: {sanitizedLang}");
                return NotFound();
            }

            return new FileStreamResult(stream, "application/json");
        }

        private ActionResult GetScriptResource(string resourcePath)
        {
            var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream($"Jellyfin.Plugin.JellyfinEnhanced.{resourcePath.Replace('/', '.')}");
            if (stream == null) return NotFound();

            // Pick a content type that matches the requested file. Defaults to JS for the
            // legacy /js/* callers; adds CSS so /css/* doesn't get served as application/javascript
            // (which breaks <link rel="stylesheet"> in strict-MIME browsers).
            string contentType = "application/javascript";
            if (resourcePath.EndsWith(".css", StringComparison.OrdinalIgnoreCase))
                contentType = "text/css";
            else if (resourcePath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                contentType = "application/json";
            else if (resourcePath.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
                contentType = "text/html";

            // DevMode: no-cache so the browser always re-fetches after a server restart,
            // useful when iterating on JS without bumping the version number.
            // Production: the script URL includes ?v={version}-{dllTimestamp}, so the URL
            // changes on every build and immutable caching is safe.
            var devMode = JellyfinEnhanced.Instance?.Configuration?.DevMode == true;
            Response.Headers["Cache-Control"] = devMode ? "no-store" : "public, max-age=31536000, immutable";
            // Say it is UTF-8: these files carry characters such as "·" and "★", and a script or stylesheet
            // with no charset is decoded with the page's encoding, which has shown them as "Â·" and "â˜…".
            return new FileStreamResult(stream, contentType + "; charset=utf-8");
        }

        /// <summary>
        /// The caller's Spoiler Guard state exactly as GET spoiler-blur/series returns
        /// it on success, for the bootstrap payload. Null when the file cannot be read
        /// cleanly: the client then asks that endpoint, which quarantines and reports
        /// a corrupt file as before (this read never quarantines anything).
        /// </summary>
        private UserSpoilerBlur? TryReadSpoilerBlurStateForBootstrap(string userKey)
        {
            var fileName = Features.SpoilerGuard.Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            try
            {
                if (!_userConfigurationManager.UserConfigurationExists(userKey, fileName))
                {
                    return new UserSpoilerBlur();
                }

                return _userConfigurationManager.GetUserConfigurationStrict<UserSpoilerBlur>(
                    userKey, fileName, quarantineCorrupt: false);
            }
            catch (Exception)
            {
                // The strict reader logs read/parse failures; the endpoint reports them.
                return null;
            }
        }

        // ==================== Arr Links ====================

        /// <summary>
        /// Whether the caller may read the active-streams session list: the feature
        /// is on and the caller is an admin or ActiveStreamsAllUsers is set. The same
        /// gate GetActiveSessions applies, for the bootstrap payload.
        /// </summary>
        private static bool CanReadActiveSessions(Configuration.PluginConfiguration config, bool isAdmin)
            => config.ActiveStreamsEnabled && (isAdmin || config.ActiveStreamsAllUsers);

        // Tag-cache + tag-data both load the user's spoiler state. Strict-read so
        // corruption is detected (rate-limited warn), then fall back to null so the
        // strip silently no-ops rather than 503-ing the unrelated tag-cache request —
        // the user's own /spoiler-blur/series endpoint will 503 next call. See
        // IsMovieInSpoilerScope for scope semantics (direct or via opted-in BoxSet).


        [HttpGet("proxy/avatar")]
        [Authorize]
        public async Task<IActionResult> ProxyAvatar([FromQuery] string path)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(path))
            {
                return NotFound();
            }

            var jellyseerrUrl = config.JellyseerrUrls
                .Split(new[] { '\r', '\n', ',' }, StringSplitOptions.RemoveEmptyEntries)[0]
                .Trim().TrimEnd('/');

            // Strip query string (?v=timestamp) and fragment — only the path is needed.
            var avatarPath = path.Trim();
            var q = avatarPath.IndexOf('?');
            if (q >= 0) avatarPath = avatarPath[..q];
            var f = avatarPath.IndexOf('#');
            if (f >= 0) avatarPath = avatarPath[..f];

            if (!avatarPath.StartsWith('/'))
                avatarPath = $"/{avatarPath}";

            // Block path traversal, scheme injection, and request smuggling.
            if (avatarPath.Contains("..") || avatarPath.Contains("://") || avatarPath.Contains("@")
                || avatarPath.Contains("\r") || avatarPath.Contains("\n")
                || avatarPath.Contains("%0d", StringComparison.OrdinalIgnoreCase)
                || avatarPath.Contains("%0a", StringComparison.OrdinalIgnoreCase)
                || avatarPath.Contains("%00"))
            {
                _logger.Warning("ProxyAvatar: unsafe characters in path blocked");
                return BadRequest("Invalid avatar path");
            }

            // SSRF guard: only allow known Jellyseerr avatar path prefixes.
            if (!avatarPath.StartsWith("/avatar/", StringComparison.OrdinalIgnoreCase)
                && !avatarPath.StartsWith("/avatarproxy/", StringComparison.OrdinalIgnoreCase)
                && !avatarPath.StartsWith("/api/v1/avatar/", StringComparison.OrdinalIgnoreCase))
            {
                _logger.Warning($"ProxyAvatar: path not in allowed list '{avatarPath}'");
                return BadRequest("Invalid avatar path");
            }

            try
            {
                // include the resolved Seerr URL in the cache key
                // so that switching to a different Seerr instance with the same
                // avatar path doesn't serve stale bytes from the old instance.
                var cacheKey = $"{jellyseerrUrl}|{avatarPath}";

                // Check server-side cache first to avoid hitting upstream Seerr
                // on every request. This is critical for large avatars (e.g., animated
                // GIFs) that would otherwise be re-downloaded on every conditional request.
                if (_avatarCache.TryGetValue(cacheKey, out var cached)
                    && DateTime.UtcNow - cached.CachedAt < _avatarCacheDuration)
                {
                    // Serve 304 if client already has this version
                    if (Request.Headers.TryGetValue("If-None-Match", out var cachedIfNoneMatch)
                        && cachedIfNoneMatch.ToString().Contains(cached.ETag))
                    {
                        Response.Headers["Cache-Control"] = "public, max-age=3600";
                        Response.Headers["ETag"] = cached.ETag;
                        return StatusCode(304);
                    }

                    Response.Headers["Cache-Control"] = "public, max-age=3600";
                    Response.Headers["ETag"] = cached.ETag;
                    return File(cached.Content, cached.ContentType);
                }

                var client = Shared.Seerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
                client.Timeout = TimeSpan.FromSeconds(10);

                using var avatarRequest = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Get, $"{jellyseerrUrl}{avatarPath}");
                // explicit User-Agent + Accept so Cloudflare's bot
                // mode doesn't return an HTML challenge page that we'd try to
                // serve as an image.
                avatarRequest.Headers.UserAgent.ParseAdd(Shared.Seerr.SeerrHttpHelper.UserAgent);
                avatarRequest.Headers.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("image/*"));
                var response = await client.SendAsync(avatarRequest);
                if (!response.IsSuccessStatusCode)
                {
                    return NotFound();
                }

                // Closed-set MIME whitelist. previously
                // accepted `image/svg+xml`, so a compromised Seerr could serve
                // an SVG with embedded `<script>` that we'd cache for 1 hour.
                // SVG is intentionally excluded — TMDB avatars are always
                // raster formats.
                var contentType = response.Content.Headers.ContentType?.MediaType ?? "image/jpeg";
                var allowedAvatarTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    "image/png", "image/jpeg", "image/jpg", "image/gif",
                    "image/webp", "image/avif", "image/bmp"
                };
                if (!allowedAvatarTypes.Contains(contentType))
                {
                    _logger.Debug($"ProxyAvatar rejected unsafe content-type: {contentType}");
                    return NotFound();
                }

                var content = await response.Content.ReadAsByteArrayAsync();

                // Compute ETag from content hash for conditional request support.
                var hash = SHA256.HashData(content);
                var etag = $"\"{Convert.ToHexString(hash)}\"";

                // Store in server-side cache and evict expired entries periodically
                _avatarCache[cacheKey] = (content, contentType, etag, DateTime.UtcNow);
                if (_avatarCache.Count > 50 || _avatarCache.Count % 10 == 0)
                {
                    foreach (var key in _avatarCache
                        .Where(kv => DateTime.UtcNow - kv.Value.CachedAt > _avatarCacheDuration)
                        .Select(kv => kv.Key)
                        .ToList())
                    {
                        _avatarCache.TryRemove(key, out _);
                    }
                }

                // Serve 304 if client already has this version
                if (Request.Headers.TryGetValue("If-None-Match", out var ifNoneMatch)
                    && ifNoneMatch.ToString().Contains(etag))
                {
                    Response.Headers["Cache-Control"] = "public, max-age=3600";
                    Response.Headers["ETag"] = etag;
                    return StatusCode(304);
                }

                Response.Headers["Cache-Control"] = "public, max-age=3600";
                Response.Headers["ETag"] = etag;

                return File(content, contentType);
            }
            catch (Exception ex)
            {
                _logger.Warning($"ProxyAvatar exception: {ex.Message}");
                return NotFound();
            }
        }

        [Authorize]
        [HttpGet("{viewName}")]
        public ActionResult GetView([FromRoute] string viewName)
        {
            if (JellyfinEnhanced.Instance == null)
            {
                return BadRequest("No plugin instance found");
            }

            IEnumerable<PluginPageInfo> pages = JellyfinEnhanced.Instance.GetViews();

            if (pages == null)
            {
                return NotFound("Pages is null or empty");
            }

            PluginPageInfo? view = pages.FirstOrDefault(pageInfo => pageInfo?.Name == viewName, null);

            if (view == null)
            {
                return NotFound("No matching view found");
            }

            Stream? stream = JellyfinEnhanced.Instance.GetType().Assembly.GetManifestResourceStream(view.EmbeddedResourcePath);

            if (stream == null)
            {
                _logger.Warning($"Failed to get resource {view.EmbeddedResourcePath}");
                return NotFound();
            }

            return File(stream, MimeTypes.GetMimeType(view.EmbeddedResourcePath));
        }
    }
}
