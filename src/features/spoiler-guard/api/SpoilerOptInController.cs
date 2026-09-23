using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class SpoilerOptInController : UserControllerBase
    {
        private readonly Logger _logger;
        private readonly ILibraryManager _libraryManager;
        private readonly UserConfigurationManager _userConfigurationManager;
        private readonly PendingSpoilerService _pendingSpoiler;

        public SpoilerOptInController(
            Logger logger,
            IUserManager userManager,
            ILibraryManager libraryManager,
            UserConfigurationManager userConfigurationManager,
            PendingSpoilerService pendingSpoiler) : base(userManager)
        {
            _logger = logger;
            _libraryManager = libraryManager;
            _userConfigurationManager = userConfigurationManager;
            _pendingSpoiler = pendingSpoiler;
        }

        [HttpPost("spoiler-blur/series/{seriesId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult EnableSpoilerBlurForSeries(string seriesId)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();

            if (!Guid.TryParse(seriesId, out var seriesGuid)
                && !Guid.TryParseExact(seriesId, "N", out seriesGuid))
            {
                return BadRequest(new { success = false, message = "Invalid seriesId." });
            }

            // Confirm the item exists and is a series the user can access.
            // GetItemById returns null when filtered out by library access — 404
            // so we don't leak existence. Also treat any lookup throw as 404:
            // arbitrary GUIDs hitting a partially-stored row make Jellyfin's
            // deserializer throw ("Cannot deserialize unknown type").
            var jUser = _userManager.GetUserById(userId.Value);
            if (jUser == null) return Forbid();
            MediaBrowser.Controller.Entities.BaseItem? item = null;
            try
            {
                item = _libraryManager.GetItemById<MediaBrowser.Controller.Entities.BaseItem>(seriesGuid, jUser);
            }
            catch (Exception ex)
            {
                _logger.Warning($"GetItemById<BaseItem> threw for {seriesGuid}: {ex.GetType().Name}: {ex.Message}");
            }
            if (item is not MediaBrowser.Controller.Entities.TV.Series series)
            {
                return NotFound(new { success = false, message = "Series not found or not accessible." });
            }

            var key = seriesGuid.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            var userKey = userId.Value.ToString("N");

            try
            {
                // RmwUserConfiguration reads strict: it refuses corrupt JSON (backs up
                // to *.corrupt-<ts>) instead of returning empty + clobbering other opt-ins.
                _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                {
                    // Preserve original EnabledAt on re-toggle; refresh SeriesName
                    // opportunistically (covers renames). Return 0 (no-write) when
                    // truly unchanged so we don't burn a disk write on each re-toggle.
                    if (state.Series.TryGetValue(key, out var existing))
                    {
                        var newName = series.Name ?? existing.SeriesName;
                        if (string.Equals(existing.SeriesName, newName, StringComparison.Ordinal))
                        {
                            return 0;
                        }
                        existing.SeriesName = newName;
                        return 1;
                    }
                    state.Series[key] = new SpoilerBlurSeriesEntry
                    {
                        SeriesId = key,
                        SeriesName = series.Name ?? string.Empty,
                        EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                    };
                    return 1;
                });
                _logger.Info($"Spoiler Guard enabled for series '{series.Name}' ({key}) by {ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, seriesId = key, name = series.Name });
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
                _logger.Error($"Failed to enable spoiler blur for series {key}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler blur state." });
            }
        }

        [HttpDelete("spoiler-blur/series/{seriesId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult DisableSpoilerBlurForSeries(string seriesId)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();

            if (!Guid.TryParse(seriesId, out var seriesGuid)
                && !Guid.TryParseExact(seriesId, "N", out seriesGuid))
            {
                return BadRequest(new { success = false, message = "Invalid seriesId." });
            }

            var key = seriesGuid.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            var userKey = userId.Value.ToString("N");

            try
            {
                bool removed = false;
                _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                {
                    removed = state.Series.Remove(key);
                    return removed ? 1 : 0;
                });
                if (!removed)
                {
                    // Log so a client/server desync (two tabs, stale cache) is
                    // observable instead of silently returning success.
                    _logger.Info($"Spoiler Guard disable was a no-op for series {key} by {ResolveUserDisplay(userKey)} — series was not in the user's spoiler-blur list.");
                    return Ok(new { success = true, seriesId = key, removed = false });
                }
                _logger.Info($"Spoiler Guard disabled for series {key} by {ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, seriesId = key, removed = true });
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
                _logger.Error($"Failed to disable spoiler blur for series {key}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler blur state." });
            }
        }

        public class SpoilerBlurMovieRequest
        {
            public string? MovieName { get; set; }
        }

        // Per-movie Spoiler Guard opt-in — stored in the same spoilerblur.json
        // (UserSpoilerBlur.Movies dict). Blurs the movie's poster/backdrop and
        // field-strips its metadata until the user marks it Played.
        [HttpPost("spoiler-blur/movies/{movieId}")]
        [Authorize]
        [RequestSizeLimit(8 * 1024)]
        [Produces("application/json")]
        public IActionResult EnableSpoilerBlurForMovie(string movieId, [FromBody] SpoilerBlurMovieRequest? body = null)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();

            if (!Guid.TryParse(movieId, out var movieGuid)
                && !Guid.TryParseExact(movieId, "N", out movieGuid))
            {
                return BadRequest(new { success = false, message = "Invalid movieId." });
            }

            // Same protection as the Series endpoint: bogus GUID can throw
            // InvalidOperationException from Jellyfin's deserializer.
            var jUser = _userManager.GetUserById(userId.Value);
            if (jUser == null) return Forbid();
            MediaBrowser.Controller.Entities.BaseItem? item = null;
            try
            {
                item = _libraryManager.GetItemById<MediaBrowser.Controller.Entities.BaseItem>(movieGuid, jUser);
            }
            catch (Exception ex)
            {
                _logger.Warning($"GetItemById<BaseItem> threw for {movieGuid}: {ex.GetType().Name}: {ex.Message}");
            }
            if (item is not MediaBrowser.Controller.Entities.Movies.Movie movie)
            {
                return NotFound(new { success = false, message = "Movie not found or not accessible." });
            }

            var key = movieGuid.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            var userKey = userId.Value.ToString("N");

            // Sanitize provided MovieName: strip HTML tags + angle brackets, cap
            // length. Do NOT strip apostrophes/quotes/backticks — titles legitimately
            // contain them (e.g. "Don't Look Up") and stripping mangles the display
            // value. Consumers render via textContent, so the <>/HTML strip is enough
            // defense-in-depth at the storage layer.
            string movieNameSanitized = (movie.Name ?? string.Empty);
            if (body?.MovieName is string clientName && !string.IsNullOrEmpty(clientName))
            {
                var cleaned = System.Text.RegularExpressions.Regex.Replace(clientName, "<[^>]+>", string.Empty);
                cleaned = cleaned.Replace("<", string.Empty).Replace(">", string.Empty);
                if (cleaned.Length > 200) cleaned = cleaned.Substring(0, 200);
                if (!string.IsNullOrWhiteSpace(cleaned)) movieNameSanitized = cleaned;
            }

            try
            {
                _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                {
                    if (state.Movies.TryGetValue(key, out var existing))
                    {
                        if (string.Equals(existing.MovieName, movieNameSanitized, StringComparison.Ordinal))
                        {
                            return 0;
                        }
                        existing.MovieName = movieNameSanitized;
                        return 1;
                    }
                    state.Movies[key] = new SpoilerBlurMovieEntry
                    {
                        MovieId = key,
                        MovieName = movieNameSanitized,
                        EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                    };
                    return 1;
                });
                _logger.Info($"Spoiler Guard enabled for movie '{movie.Name}' ({key}) by {ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, movieId = key, name = movie.Name });
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
                _logger.Error($"Failed to enable spoiler blur for movie {key}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler blur state." });
            }
        }

        [HttpDelete("spoiler-blur/movies/{movieId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult DisableSpoilerBlurForMovie(string movieId)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();

            if (!Guid.TryParse(movieId, out var movieGuid)
                && !Guid.TryParseExact(movieId, "N", out movieGuid))
            {
                return BadRequest(new { success = false, message = "Invalid movieId." });
            }

            var key = movieGuid.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            var userKey = userId.Value.ToString("N");

            try
            {
                bool removed = false;
                _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                {
                    removed = state.Movies.Remove(key);
                    return removed ? 1 : 0;
                });
                if (!removed)
                {
                    _logger.Info($"Spoiler Guard disable was a no-op for movie {key} by {ResolveUserDisplay(userKey)} — movie was not in the user's spoiler-blur list.");
                    return Ok(new { success = true, movieId = key, removed = false });
                }
                _logger.Info($"Spoiler Guard disabled for movie {key} by {ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, movieId = key, removed = true });
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
                _logger.Error($"Failed to disable spoiler blur for movie {key}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler blur state." });
            }
        }

        public class SpoilerBlurCollectionRequest
        {
            public string? CollectionName { get; set; }
        }

        // Per-collection Spoiler Guard opt-in. A collection (BoxSet) is a SHORTCUT:
        // toggling here protects every movie inside (each until watched), while the
        // collection's OWN art/DTO pass through clear — it's the entry point clicked.
        [HttpPost("spoiler-blur/collections/{collectionId}")]
        [Authorize]
        [RequestSizeLimit(8 * 1024)]
        [Produces("application/json")]
        public IActionResult EnableSpoilerBlurForCollection(string collectionId, [FromBody] SpoilerBlurCollectionRequest? body = null)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();

            if (!Guid.TryParse(collectionId, out var collGuid)
                && !Guid.TryParseExact(collectionId, "N", out collGuid))
            {
                return BadRequest(new { success = false, message = "Invalid collectionId." });
            }

            var jUser = _userManager.GetUserById(userId.Value);
            if (jUser == null) return Forbid();
            MediaBrowser.Controller.Entities.BaseItem? item = null;
            try
            {
                item = _libraryManager.GetItemById<MediaBrowser.Controller.Entities.BaseItem>(collGuid, jUser);
            }
            catch (Exception ex)
            {
                _logger.Warning($"GetItemById<BaseItem> threw for {collGuid}: {ex.GetType().Name}: {ex.Message}");
            }
            if (item is not MediaBrowser.Controller.Entities.Movies.BoxSet boxSet)
            {
                return NotFound(new { success = false, message = "Collection not found or not accessible." });
            }

            var key = collGuid.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            var userKey = userId.Value.ToString("N");

            string collNameSanitized = (boxSet.Name ?? string.Empty);
            if (body?.CollectionName is string clientName && !string.IsNullOrEmpty(clientName))
            {
                var cleaned = System.Text.RegularExpressions.Regex.Replace(clientName, "<[^>]+>", string.Empty);
                cleaned = cleaned.Replace("<", string.Empty).Replace(">", string.Empty);
                if (cleaned.Length > 200) cleaned = cleaned.Substring(0, 200);
                if (!string.IsNullOrWhiteSpace(cleaned)) collNameSanitized = cleaned;
            }

            try
            {
                _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                {
                    if (state.Collections.TryGetValue(key, out var existing))
                    {
                        if (string.Equals(existing.CollectionName, collNameSanitized, StringComparison.Ordinal))
                        {
                            return 0;
                        }
                        existing.CollectionName = collNameSanitized;
                        return 1;
                    }
                    state.Collections[key] = new SpoilerBlurCollectionEntry
                    {
                        CollectionId = key,
                        CollectionName = collNameSanitized,
                        EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                    };
                    return 1;
                });
                _logger.Info($"Spoiler Guard enabled for collection '{boxSet.Name}' ({key}) by {ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, collectionId = key, name = boxSet.Name });
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
                _logger.Error($"Failed to enable spoiler blur for collection {key}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler blur state." });
            }
        }

        [HttpDelete("spoiler-blur/collections/{collectionId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult DisableSpoilerBlurForCollection(string collectionId)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();

            if (!Guid.TryParse(collectionId, out var collGuid)
                && !Guid.TryParseExact(collectionId, "N", out collGuid))
            {
                return BadRequest(new { success = false, message = "Invalid collectionId." });
            }

            var key = collGuid.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            var userKey = userId.Value.ToString("N");

            try
            {
                bool removed = false;
                _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                {
                    removed = state.Collections.Remove(key);
                    return removed ? 1 : 0;
                });
                if (!removed)
                {
                    _logger.Info($"Spoiler Guard disable was a no-op for collection {key} by {ResolveUserDisplay(userKey)} — collection was not in the user's spoiler-blur list.");
                    return Ok(new { success = true, collectionId = key, removed = false });
                }
                _logger.Info($"Spoiler Guard disabled for collection {key} by {ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, collectionId = key, removed = true });
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
                _logger.Error($"Failed to disable spoiler blur for collection {key}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler blur state." });
            }
        }

        // ─── Pre-acquisition pending Spoiler Guard (Seerr / not-yet-downloaded) ───
        // Registers Spoiler Guard intent for a TMDB id that may not yet be in the
        // library. Two sources: (a) the Seerr modal's manual "Enable spoiler" button
        // (allowed whenever SpoilerBlurEnabled, even when the Request button is
        // disabled), (b) auto on Seerr request (SpoilerAutoEnableOnSeerrRequest).
        // If the id resolves to an accessible library item we promote straight into
        // Series/Movies; otherwise we record into PendingTmdb and
        // SpoilerSeerrPendingPromoter promotes it on ItemAdded.
        [HttpPost("spoiler-blur/pending/{mediaType}/{tmdbId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult EnableSpoilerBlurPending(string mediaType, string tmdbId, [FromQuery] string? displayName = null)
        {
            var cfg = JellyfinEnhanced.Instance?.Configuration;
            if (cfg?.SpoilerBlurEnabled != true)
            {
                return StatusCode(503, new { success = false, message = "Spoiler Guard is disabled by the administrator." });
            }

            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();

            var normalizedType = (mediaType ?? string.Empty).ToLowerInvariant();
            if (normalizedType != "tv" && normalizedType != "movie")
            {
                return BadRequest(new { success = false, message = "mediaType must be 'tv' or 'movie'." });
            }
            // TMDB ids are positive integers; reject anything else so we don't
            // store junk keys that the promoter would never match.
            if (string.IsNullOrWhiteSpace(tmdbId)
                || !int.TryParse(tmdbId, System.Globalization.NumberStyles.Integer,
                                 System.Globalization.CultureInfo.InvariantCulture, out var tmdbInt)
                || tmdbInt <= 0)
            {
                return BadRequest(new { success = false, message = "Invalid tmdbId." });
            }
            var canonicalTmdb = tmdbInt.ToString(System.Globalization.CultureInfo.InvariantCulture);

            // Library lookup: if the TMDB id already resolves to a Series /
            // Movie the user can access, promote straight into the real
            // Series / Movies dict and skip pending. This handles the
            // "already in library" case (Seerr returns "already available"
            // or the user opens the modal for an existing title) cleanly.
            var jUser = _userManager.GetUserById(userId.Value);
            if (jUser == null) return Forbid();

            try
            {
                var summary = _pendingSpoiler.AddSpoilerBlurPendingInternal(userId.Value, jUser, normalizedType, canonicalTmdb, displayName);
                if (summary.Promoted == "cap-exceeded")
                {
                    return StatusCode(429, new
                    {
                        success = false,
                        code = "pending_cap_exceeded",
                        message = $"You already have the maximum of {PendingSpoilerService.MaxPendingTmdbPerUser} pending spoiler-blur entries. Remove some via the management UI before adding more."
                    });
                }
                return Ok(new { success = true, promoted = summary.Promoted, jellyfinId = summary.JellyfinId, name = summary.Name });
            }
            catch (InvalidDataException strictEx)
            {
                var ukey = userId.Value.ToString("N");
                _logger.Warning($"spoilerblur.json corrupt for {ResolveUserDisplay(ukey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(ukey, ResolveUserDisplay(ukey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                var ukey = userId.Value.ToString("N");
                _logger.Warning($"spoilerblur.json corrupt for {ResolveUserDisplay(ukey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(ukey, ResolveUserDisplay(ukey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to record spoiler-blur pending {normalizedType}:{canonicalTmdb}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler-blur pending state." });
            }
        }

        [HttpDelete("spoiler-blur/pending/{mediaType}/{tmdbId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult DisableSpoilerBlurPending(string mediaType, string tmdbId)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();

            var normalizedType = (mediaType ?? string.Empty).ToLowerInvariant();
            if (normalizedType != "tv" && normalizedType != "movie")
            {
                return BadRequest(new { success = false, message = "mediaType must be 'tv' or 'movie'." });
            }
            if (string.IsNullOrWhiteSpace(tmdbId)
                || !int.TryParse(tmdbId, System.Globalization.NumberStyles.Integer,
                                 System.Globalization.CultureInfo.InvariantCulture, out var tmdbInt)
                || tmdbInt <= 0)
            {
                return BadRequest(new { success = false, message = "Invalid tmdbId." });
            }
            var canonicalTmdb = tmdbInt.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var pendingKey = $"{normalizedType}:{canonicalTmdb}";
            var userKey = userId.Value.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;

            // Mirror the POST abstraction: the modal's "Disable spoiler" click needn't
            // know whether the entry is pending or in Series/Movies. Resolve TMDB ->
            // Jellyfin id and remove from whichever side holds it. Pre-compute the id
            // outside the RMW so we don't capture mutated locals into the lambda.
            var jUser = _userManager.GetUserById(userId.Value);
            try
            {
                var existingItem = jUser != null
                    ? _pendingSpoiler.FindLibraryItemByTmdb(jUser, normalizedType, canonicalTmdb)
                    : null;
                var seriesKeyToRemove = (existingItem as MediaBrowser.Controller.Entities.TV.Series)?.Id.ToString("N");
                var movieKeyToRemove = (existingItem as MediaBrowser.Controller.Entities.Movies.Movie)?.Id.ToString("N");
                var resultBox = new[] { (Removed: false, From: "none", JellyfinId: (string?)null) };
                _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                    {
                        bool pendingRemoved = state.PendingTmdb.Remove(pendingKey);
                        bool seriesRemoved = seriesKeyToRemove != null && state.Series.Remove(seriesKeyToRemove);
                        bool movieRemoved = movieKeyToRemove != null && state.Movies.Remove(movieKeyToRemove);
                        if (seriesRemoved) resultBox[0] = (true, "series", seriesKeyToRemove);
                        else if (movieRemoved) resultBox[0] = (true, "movie", movieKeyToRemove);
                        else if (pendingRemoved) resultBox[0] = (true, "pending", null);
                        return resultBox[0].Removed ? 1 : 0;
                    });
                // Either way the key is no longer pending for this user — keep the
                // promoter's gate consistent so it stops sweeping this user.
                Services.SpoilerSeerrPendingPromoter.UnregisterPending(pendingKey, userId.Value);
                var (removedAnything, removedFrom, removedJellyfinId) = resultBox[0];
                if (!removedAnything)
                {
                    return Ok(new { success = true, removed = false, removedFrom = "none" });
                }
                _logger.Info($"Spoiler Guard pending DELETE removed {pendingKey} ({removedFrom}) for {ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, removed = true, removedFrom, jellyfinId = removedJellyfinId });
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
                _logger.Error($"Failed to remove spoiler-blur pending {pendingKey}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler-blur pending state." });
            }
        }
    }
}
