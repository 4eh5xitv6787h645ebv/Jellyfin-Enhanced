using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class UserSettingsController : UserControllerBase
    {
        private readonly Logger _logger;
        private readonly UserConfigurationManager _userConfigurationManager;

        public UserSettingsController(
            Logger logger,
            UserConfigurationManager userConfigurationManager,
            IUserManager userManager) : base(userManager)
        {
            _logger = logger;
            _userConfigurationManager = userConfigurationManager;
        }

        [HttpGet("user-settings/{userId}/settings.json")]
        [Authorize]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public IActionResult GetUserSettingsSettings(string userId)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            // Populate defaults from plugin configuration if missing
            if (!_userConfigurationManager.UserConfigurationExists(authorizedUserId, "settings.json"))
            {
                var defaultConfig = JellyfinEnhanced.Instance?.Configuration;
                if (defaultConfig != null)
                {
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
                        WatchProgressMode = string.IsNullOrWhiteSpace(defaultConfig.WatchProgressDefaultMode) ? "percentage" : defaultConfig.WatchProgressDefaultMode,
                        WatchProgressTimeFormat = string.IsNullOrWhiteSpace(defaultConfig.WatchProgressTimeFormat) ? "hours" : defaultConfig.WatchProgressTimeFormat,
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

                    _userConfigurationManager.SaveUserConfiguration(authorizedUserId, "settings.json", defaultUserSettings);
                    _logger.Info($"Saved default settings.json for new user {ResolveUserDisplay(authorizedUserId)} from plugin configuration.");
                }
            }

            var userConfig = _userConfigurationManager.GetUserConfiguration<UserSettings>(authorizedUserId, "settings.json");

            // IsAdmin reflects the CALLER's admin status (not the target user's, in the
            // rare admin-viewing-another-user's-settings case allowed by
            // AuthorizeUserConfigAccess). Computed fresh on every request from the
            // authenticated principal, never persisted to the settings file. Single
            // source of truth for every admin-gated JS module (js/enhanced/helpers.js).
            var settingsNode = System.Text.Json.JsonSerializer.SerializeToNode(userConfig) as System.Text.Json.Nodes.JsonObject;
            if (settingsNode != null)
            {
                settingsNode["IsAdmin"] = IsAdminUser();
                return Ok(settingsNode);
            }

            return Ok(userConfig);
        }

        [HttpGet("user-settings/{userId}/shortcuts.json")]
        [Authorize]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public IActionResult GetUserSettingsShortcuts(string userId)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            var userConfig = _userConfigurationManager.GetUserConfiguration<UserShortcuts>(authorizedUserId, "shortcuts.json");
            return Ok(userConfig);
        }

        [HttpGet("user-settings/{userId}/elsewhere.json")]
        [Authorize]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public IActionResult GetUserSettingsElsewhere(string userId)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            var userConfig = _userConfigurationManager.GetUserConfiguration<ElsewhereSettings>(authorizedUserId, "elsewhere.json");
            return Ok(userConfig);
        }

        [HttpPost("user-settings/{userId}/settings.json")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult SaveUserSettingsSettings(string userId, [FromBody] UserSettings userConfiguration)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            try
            {
                // Diff against the existing config so the log shows what actually changed
                var existing = _userConfigurationManager.GetUserConfiguration<UserSettings>(authorizedUserId, "settings.json");
                var changes = new System.Collections.Generic.List<string>();
                var isIdentical = false;
                if (existing != null)
                {
                    var existingJson = System.Text.Json.JsonSerializer.Serialize(existing);
                    var newJson      = System.Text.Json.JsonSerializer.Serialize(userConfiguration);
                    isIdentical = existingJson == newJson;
                    if (!isIdentical)
                    {
                        var existingDoc = System.Text.Json.JsonDocument.Parse(existingJson).RootElement;
                        var newDoc      = System.Text.Json.JsonDocument.Parse(newJson).RootElement;
                        foreach (var prop in newDoc.EnumerateObject())
                        {
                            if (!existingDoc.TryGetProperty(prop.Name, out var oldVal) ||
                                oldVal.ToString() != prop.Value.ToString())
                            {
                                changes.Add($"{prop.Name}: {(existingDoc.TryGetProperty(prop.Name, out var ov) ? ov.ToString() : "—")} → {prop.Value}");
                            }
                        }
                    }
                }

                if (!isIdentical)
                {
                    _userConfigurationManager.SaveUserConfiguration(authorizedUserId, "settings.json", userConfiguration);

                    if (changes.Count > 0)
                        _logger.Info($"Saved user settings for {ResolveUserDisplay(authorizedUserId)}: {string.Join(", ", changes)}");
                }

                return Ok(new { success = true, file = "settings.json" });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save user settings for user {ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save user settings." });
            }
        }

        [HttpPost("user-settings/{userId}/shortcuts.json")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult SaveUserSettingsShortcuts(string userId, [FromBody] UserShortcuts userConfiguration)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            try
            {
                _userConfigurationManager.SaveUserConfiguration(authorizedUserId, "shortcuts.json", userConfiguration);
                _logger.Info($"Saved user shortcuts for {ResolveUserDisplay(authorizedUserId)} to shortcuts.json");
                return Ok(new { success = true, file = "shortcuts.json" });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save user shortcuts for {ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save user shortcuts." });
            }
        }

        [HttpPost("user-settings/{userId}/elsewhere.json")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult SaveUserSettingsElsewhere(string userId, [FromBody] ElsewhereSettings userConfiguration)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            try
            {
                _userConfigurationManager.SaveUserConfiguration(authorizedUserId, "elsewhere.json", userConfiguration);
                _logger.Info($"Saved user elsewhere settings for {ResolveUserDisplay(authorizedUserId)} to elsewhere.json");
                return Ok(new { success = true, file = "elsewhere.json" });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save user elsewhere settings for {ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save user elsewhere settings." });
            }
        }
    }
}
