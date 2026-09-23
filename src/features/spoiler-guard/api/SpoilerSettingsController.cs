using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class SpoilerSettingsController : UserControllerBase
    {
        private readonly Logger _logger;
        private readonly UserConfigurationManager _userConfigurationManager;

        public SpoilerSettingsController(
            Logger logger,
            UserConfigurationManager userConfigurationManager,
            IUserManager userManager) : base(userManager)
        {
            _logger = logger;
            _userConfigurationManager = userConfigurationManager;
        }

        // Self-or-admin accessor pair for spoilerblur.json, mirroring the other
        // per-user files — otherwise it would be the only per-user JE file an
        // administrator cannot inspect or repair remotely.
        [HttpGet("user-settings/{userId}/spoilerblur.json")]
        [Authorize]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        [Produces("application/json")]
        public IActionResult GetUserSpoilerBlur(string userId)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            // Lenient read on purpose: this is an inspection surface, so a corrupt
            // file should still return the (empty) default rather than 503 — the
            // user-facing spoiler-blur endpoints already handle strict reads,
            // backups and corruption reporting.
            var state = _userConfigurationManager.GetUserConfiguration<UserSpoilerBlur>(
                authorizedUserId, Services.SpoilerBlurImageFilter.SpoilerBlurFileName);
            return Ok(state);
        }

        // Hard cap per spoiler-list dict on the raw full-state save endpoint:
        // the image/field-strip filters iterate this file every request
        // (IsMovieInSpoilerScope does a library lookup per Collections key), so
        // an unbounded payload amplifies into millions of GetItemById calls per
        // library view. Mirrors the pending path's PendingSpoilerService.MaxPendingTmdbPerUser cap
        // this endpoint would otherwise bypass.
        private const int MaxSpoilerEntriesPerDict = 1000;

        [HttpPost("user-settings/{userId}/spoilerblur.json")]
        [Authorize]
        [Produces("application/json")]
        [Consumes("application/json")]
        // Cap the body: 4×1000 entries is a few hundred KB even with long names.
        // 2 MB leaves headroom while removing Kestrel's ~28 MB default as a DoS lever.
        [RequestSizeLimit(2 * 1024 * 1024)]
        public IActionResult SaveUserSpoilerBlur(string userId, [FromBody] UserSpoilerBlur userConfiguration)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            if (userConfiguration == null)
            {
                return BadRequest(new { success = false, message = "Invalid Spoiler Guard payload." });
            }

            // Reject oversized payloads rather than silently truncating — dropping
            // entries would confuse a legitimate large list, and over-cap is buggy or hostile.
            if (userConfiguration.Series.Count > MaxSpoilerEntriesPerDict
                || userConfiguration.Movies.Count > MaxSpoilerEntriesPerDict
                || userConfiguration.Collections.Count > MaxSpoilerEntriesPerDict
                || userConfiguration.PendingTmdb.Count > MaxSpoilerEntriesPerDict)
            {
                _logger.Warning($"Rejecting oversized Spoiler Guard payload for {ResolveUserDisplay(authorizedUserId)} (series={userConfiguration.Series.Count}, movies={userConfiguration.Movies.Count}, collections={userConfiguration.Collections.Count}, pending={userConfiguration.PendingTmdb.Count}; cap {MaxSpoilerEntriesPerDict}).");
                return StatusCode(413, new { success = false, message = $"Spoiler Guard list exceeds the maximum of {MaxSpoilerEntriesPerDict} entries per category." });
            }

            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            // Snapshot pre-write pending keys to diff the promoter gate after save:
            // this endpoint is a pending writer too and must keep the gate in sync.
            HashSet<string> priorPending;
            try
            {
                var prior = _userConfigurationManager.GetUserConfiguration<UserSpoilerBlur>(authorizedUserId, fileName);
                priorPending = new HashSet<string>(prior.PendingTmdb.Keys, StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                priorPending = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            }

            try
            {
                lock (_userConfigurationManager.GetUserFileLock(authorizedUserId, fileName))
                {
                    // Pre-write strict read so a corrupt existing file 503s + backs up
                    // instead of being silently overwritten (same as hidden-content).
                    try
                    {
                        _userConfigurationManager.GetUserConfigurationStrict<UserSpoilerBlur>(
                            authorizedUserId, fileName);
                    }
                    catch (Exception strictEx) when (strictEx is InvalidDataException
                                                  || strictEx is Newtonsoft.Json.JsonException)
                    {
                        _logger.Warning($"{fileName} corrupt for {ResolveUserDisplay(authorizedUserId)} (backed up): {strictEx.Message}");
                        return StatusCode(503, new { success = false, message = "Spoiler Guard store is corrupt; backed up. Please retry." });
                    }
                    catch (IOException ioEx)
                    {
                        _logger.Warning($"{fileName} temporarily unreadable for {ResolveUserDisplay(authorizedUserId)}: {ioEx.Message}");
                        return StatusCode(500, new { success = false, message = "Spoiler Guard store is temporarily unavailable. Please retry." });
                    }

                    _userConfigurationManager.SaveUserConfiguration(authorizedUserId, fileName, userConfiguration);
                }

                // Reconcile the promoter's fast-path gate with the new PendingTmdb
                // set: register keys the payload added, unregister keys it removed.
                // Registration is idempotent, so re-registering survivors is harmless.
                if (Guid.TryParseExact(authorizedUserId, "N", out var gateUserId))
                {
                    foreach (var key in userConfiguration.PendingTmdb.Keys)
                    {
                        Services.SpoilerSeerrPendingPromoter.RegisterPending(key, gateUserId);
                    }
                    foreach (var stale in priorPending)
                    {
                        if (!userConfiguration.PendingTmdb.ContainsKey(stale))
                        {
                            Services.SpoilerSeerrPendingPromoter.UnregisterPending(stale, gateUserId);
                        }
                    }
                }

                _logger.Info($"Saved Spoiler Guard state for {ResolveUserDisplay(authorizedUserId)} to {fileName}");
                return Ok(new { success = true, file = fileName });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save Spoiler Guard state for {ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save Spoiler Guard state." });
            }
        }
        // ─── Spoiler Guard ─── Per-user list of series IDs the user has opted
        // into Spoiler Guard for. The image filter (Services/SpoilerBlurImageFilter.cs)
        // reads spoilerblur.json on every image request and blurs every UNWATCHED
        // episode of any series in that list. Watched episodes pass through unblurred.

        // Returns a snapshot of any spoilerblur.json corruption events
        // that have been logged this process-lifetime. Diagnostic endpoint:
        // there is no UI consumer yet — it exists so an admin (or a user,
        // for their own events) can check whether Spoiler Guard preferences
        // were reset after a corrupt-file backup, without shell access.
        // Per-user — each user only sees their OWN corruption events.
        // Admins see all users (so they can advise affected users).
        [HttpGet("spoiler-blur/health")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetSpoilerBlurHealth()
        {
            // Role-first admin check so Administrator API keys (role claim,
            // no user id) work — same pattern as IsAdminUser() everywhere else.
            var isAdmin = IsAdminUser();
            var userId = UserHelper.GetCurrentUserId(User);
            if (!isAdmin && (userId == null || userId == Guid.Empty)) return Forbid();
            var userKey = userId.HasValue && userId.Value != Guid.Empty
                ? userId.Value.ToString("N")
                : null; // admin API key: no user identity, sees all events

            var log = Services.SpoilerUserResolver.GetCorruptionLog();
            var events = new List<object>();
            foreach (var kvp in log)
            {
                if (!isAdmin && kvp.Key != userKey) continue; // non-admin: only own
                events.Add(new
                {
                    userId = kvp.Key,
                    userDisplay = kvp.Value.UserDisplay,
                    at = kvp.Value.At.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                    reason = kvp.Value.Reason,
                });
            }
            return Ok(new
            {
                healthy = events.Count == 0,
                corruptionEvents = events,
            });
        }

        // Admin acks any corruption event (clears the banner); users ack their own.
        [HttpDelete("spoiler-blur/health/{targetUserId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult AckSpoilerBlurCorruption(string targetUserId)
        {
            // Role-first admin check: Administrator API keys can ack any user's
            // events; non-admins need a user identity and ack only their own.
            var isAdmin = IsAdminUser();
            var userId = UserHelper.GetCurrentUserId(User);
            if (!isAdmin && (userId == null || userId == Guid.Empty)) return Forbid();
            var userKey = userId.HasValue && userId.Value != Guid.Empty
                ? userId.Value.ToString("N")
                : null;

            if (!Guid.TryParse(targetUserId, out var tGuid)
                && !Guid.TryParseExact(targetUserId, "N", out tGuid))
            {
                return BadRequest(new { success = false, message = "Invalid userId." });
            }
            var tKey = tGuid.ToString("N");
            if (!isAdmin && tKey != userKey) return Forbid();
            Services.SpoilerUserResolver.ClearCorruption(tKey);
            return Ok(new { success = true });
        }

        [HttpGet("spoiler-blur/series")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetSpoilerBlurSeries()
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();
            var userKey = userId.Value.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;

            // Distinguish "file missing" (empty + 200, normal first-time state)
            // from "corrupt/unreadable" (503 + backup-made hint). A lenient read
            // silently returns empty on parse error — the user would think their
            // spoiler list was wiped.
            if (!_userConfigurationManager.UserConfigurationExists(userKey, fileName))
            {
                return Ok(new UserSpoilerBlur());
            }
            try
            {
                var state = _userConfigurationManager.GetUserConfigurationStrict<UserSpoilerBlur>(
                    userKey, fileName);
                return Ok(state);
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
        }

        // Per-user override toggles for the admin's strip categories. Nullable
        // bools where null means "inherit admin policy"; SkipDisableConfirm is a
        // permanent flag replacing the per-session "Don't ask for 15 minutes" snooze.
        [HttpGet("spoiler-blur/user-prefs")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetSpoilerBlurUserPrefs()
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();
            var userKey = userId.Value.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;

            if (!_userConfigurationManager.UserConfigurationExists(userKey, fileName))
            {
                return Ok(new SpoilerBlurUserPrefs());
            }
            try
            {
                var state = _userConfigurationManager.GetUserConfigurationStrict<UserSpoilerBlur>(
                    userKey, fileName);
                return Ok(state.Prefs ?? new SpoilerBlurUserPrefs());
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
        }

        [HttpPost("spoiler-blur/user-prefs")]
        [Authorize]
        [Produces("application/json")]
        [Consumes("application/json")]
        [RequestSizeLimit(8 * 1024)]
        public IActionResult SetSpoilerBlurUserPrefs([FromBody] SpoilerBlurUserPrefs? body)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();
            if (body == null) return BadRequest(new { success = false, message = "Missing body." });

            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            var userKey = userId.Value.ToString("N");

            try
            {
                _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                {
                    state.Prefs = new SpoilerBlurUserPrefs
                    {
                        HideSeriesDescriptions = body.HideSeriesDescriptions,
                        HideEpisodeDescriptions = body.HideEpisodeDescriptions,
                        HideTags = body.HideTags,
                        HideChapterNames = body.HideChapterNames,
                        HideTaglines = body.HideTaglines,
                        HideRatings = body.HideRatings,
                        HideAirDate = body.HideAirDate,
                        ReplaceEpisodeTitles = body.ReplaceEpisodeTitles,
                        HideCast = body.HideCast,
                        HideReviews = body.HideReviews,
                        UseAdvancedCategories = body.UseAdvancedCategories,
                        SkipDisableConfirm = body.SkipDisableConfirm,
                    };
                    return 1;
                });
                return Ok(new { success = true, prefs = body });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save Spoiler Guard user prefs for {ResolveUserDisplay(userKey)}: {ex.GetType().Name}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save user prefs." });
            }
        }
    }
}
