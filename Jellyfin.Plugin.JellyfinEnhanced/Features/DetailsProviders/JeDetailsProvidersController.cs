using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using System.Text.Json;
using System.Text;
using System.Threading.Tasks;
using System.Threading;
using System;
using Jellyfin.Data.Enums;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Database.Implementations;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Features.DetailsProviders.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Infrastructure.Http;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Arr;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.Arr;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.Library;
using MediaBrowser.Common.Net;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Persistence;
using MediaBrowser.Controller;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Platform;

namespace Jellyfin.Plugin.JellyfinEnhanced.Features.DetailsProviders
{
    /// <summary>
    /// Details-page providers: AniList and user reviews, translation, awards, MDBList ratings, Does The Dog Die,
    /// the elsewhere.json document, item stats and the *arr links (restructure S2.12, moved verbatim from
    /// JellyfinEnhancedController).
    /// </summary>
    [Route("JellyfinEnhanced")]
    [ApiController]
    public class JeDetailsProvidersController : JeControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Jellyfin.Plugin.JellyfinEnhanced.Shared.SpoilerGuard.SpoilerSeerrRedactor _spoilerSeerrRedactor;
        private readonly IUserDataManager _userDataManager;
        private readonly ILibraryManager _libraryManager;
        private readonly WikidataAwardsService _wikidataAwardsService;
        private readonly AnilistReviewsService _anilistReviewsService;
        private readonly ReviewTranslationService _reviewTranslationService;
        private readonly MdblistService _mdblistService;
        private readonly DoesTheDogDieService _doesTheDogDieService;
        private readonly ItemStatsService _itemStats;
        private readonly UserDisplayResolver _userDisplayResolver;
        private readonly ArrInstanceClient _arrInstanceClient;
        private readonly LibraryItemLookup _libraryItemLookup;

        public JeDetailsProvidersController(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            IUserDataManager userDataManager,
            ILibraryManager libraryManager,
            UserConfigurationManager userConfigurationManager,
            WikidataAwardsService wikidataAwardsService,
            AnilistReviewsService anilistReviewsService,
            ReviewTranslationService reviewTranslationService,
            MdblistService mdblistService,
            DoesTheDogDieService doesTheDogDieService,
            Jellyfin.Plugin.JellyfinEnhanced.Shared.SpoilerGuard.SpoilerSeerrRedactor spoilerSeerrRedactor,
            ItemStatsService itemStats)
            : base(userManager, logger, userConfigurationManager)
        {
            _httpClientFactory = httpClientFactory;
            _userDataManager = userDataManager;
            _libraryManager = libraryManager;
            _wikidataAwardsService = wikidataAwardsService;
            _anilistReviewsService = anilistReviewsService;
            _reviewTranslationService = reviewTranslationService;
            _mdblistService = mdblistService;
            _doesTheDogDieService = doesTheDogDieService;
            _spoilerSeerrRedactor = spoilerSeerrRedactor;
            _itemStats = itemStats;
            _userDisplayResolver = new UserDisplayResolver(userManager);
            _arrInstanceClient = new ArrInstanceClient(httpClientFactory, logger);
            _libraryItemLookup = new LibraryItemLookup(libraryManager, logger);
        }

        /// <summary>
        /// Browser-cache policy for the awards and MDBList ratings responses: the
        /// same body for every user (no per-user gating beyond [Authorize]), backed
        /// by server caches that keep it for days, so a revisit or reload within
        /// half an hour reuses the browser's copy instead of asking again. Private
        /// and varied on the auth headers like the TMDB passthrough, so no shared
        /// cache keeps it and one account's copy is never reused by another.
        /// Set only for an answer the upstream actually gave (Confirmed): errors
        /// and failure placeholders, which the server retries within the hour,
        /// are never kept.
        /// </summary>
        private void SetExternalDataCacheHeaders()
        {
            Response.Headers["Cache-Control"] = "private, max-age=1800";
            Response.Headers["Vary"] = "Authorization, X-Emby-Token, X-Jellyfin-User-Id";
        }

        /// <summary>Top AniList reviews for an anime, by AniList id.</summary>
        [HttpGet("anilist/reviews")]
        [Authorize]
        public async Task<IActionResult> GetAnilistReviews([FromQuery] int anilistId, CancellationToken cancellationToken)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.ShowAnilistReviews)
            {
                return StatusCode(503, "AniList reviews are not enabled.");
            }

            if (anilistId <= 0)
            {
                return BadRequest("anilistId must be a positive integer.");
            }

            try
            {
                var result = await _anilistReviewsService.GetReviewsAsync(anilistId, cancellationToken).ConfigureAwait(false);
                SetExternalDataCacheHeaders();
                return Ok(result);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.Error($"Failed to fetch AniList reviews. Error: {ex.Message}");
                return StatusCode(502, "Failed to fetch AniList reviews.");
            }
        }

        /// <summary>Languages English reviews can be translated into on the configured LibreTranslate instance.</summary>
        [HttpGet("translate/languages")]
        [Authorize]
        public async Task<IActionResult> GetTranslationLanguages(CancellationToken cancellationToken)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.ReviewTranslationEnabled || string.IsNullOrWhiteSpace(config.ReviewTranslationUrl))
            {
                return StatusCode(503, "Review translation is not enabled.");
            }

            var baseUrl = config.ReviewTranslationUrl.Trim().TrimEnd('/');
            if (!await Jellyfin.Plugin.JellyfinEnhanced.Helpers.ArrUrlGuard.IsAllowedUrlAsync(baseUrl, cancellationToken).ConfigureAwait(false))
            {
                return BadRequest("The translation URL is not allowed.");
            }

            try
            {
                return Ok(new { languages = await _reviewTranslationService.GetTargetLanguagesAsync(baseUrl, cancellationToken).ConfigureAwait(false) });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.Error($"Failed to read translation languages. Error: {ex.Message}");
                return StatusCode(502, "Failed to reach the translation service.");
            }
        }

        /// <summary>Translates English review text into the target language, live.</summary>
        [HttpPost("translate")]
        [Authorize]
        public async Task<IActionResult> TranslateReview([FromBody] TranslateRequest request, CancellationToken cancellationToken)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.ReviewTranslationEnabled || string.IsNullOrWhiteSpace(config.ReviewTranslationUrl))
            {
                return StatusCode(503, "Review translation is not enabled.");
            }

            if (string.IsNullOrWhiteSpace(request?.Text) || request.Text.Length > Services.ReviewTranslationService.MaxTextLength)
            {
                return BadRequest($"text must be between 1 and {Services.ReviewTranslationService.MaxTextLength} characters.");
            }

            if (string.IsNullOrWhiteSpace(request.Target) || !System.Text.RegularExpressions.Regex.IsMatch(request.Target, "^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$"))
            {
                return BadRequest("target must be a language code.");
            }

            var baseUrl = config.ReviewTranslationUrl.Trim().TrimEnd('/');
            if (!await Jellyfin.Plugin.JellyfinEnhanced.Helpers.ArrUrlGuard.IsAllowedUrlAsync(baseUrl, cancellationToken).ConfigureAwait(false))
            {
                return BadRequest("The translation URL is not allowed.");
            }

            try
            {
                var translated = await _reviewTranslationService.TranslateAsync(
                    baseUrl, config.ReviewTranslationApiKey ?? string.Empty, request.Text, request.Target, cancellationToken).ConfigureAwait(false);
                return Ok(new { text = translated });
            }
            catch (Services.TranslationLimitException ex)
            {
                // A rate limit is passed on as 429 (with the wait, when the service gave one) so the client
                // can say "try again later"; a refusal (403) stays a 502 with its own error code.
                var rateLimited = ex.StatusCode == System.Net.HttpStatusCode.TooManyRequests;
                int? retryAfterSeconds = ex.RetryAfter is { } wait ? (int)Math.Ceiling(wait.TotalSeconds) : null;
                if (rateLimited && retryAfterSeconds is { } seconds)
                {
                    Response.Headers["Retry-After"] = seconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
                }

                _logger.Warning($"Translation service returned {(int)ex.StatusCode!} for a review. {ex.Message}");
                return StatusCode(rateLimited ? 429 : 502, new
                {
                    error = true,
                    code = rateLimited ? "translation_rate_limited" : "translation_refused",
                    message = ex.Message,
                    retryAfterSeconds = rateLimited ? retryAfterSeconds : null,
                });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.Error($"Failed to translate a review. Error: {ex.Message}");
                return StatusCode(502, "Failed to translate the review.");
            }
        }

        public class TranslateRequest
        {
            public string? Text { get; set; }

            public string? Target { get; set; }
        }

        [HttpGet("awards/{mediaType}/{tmdbId}")]
        [Authorize]
        public async Task<IActionResult> GetAwards(string mediaType, string tmdbId, CancellationToken cancellationToken)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.ShowAwards)
            {
                return StatusCode(503, "Awards feature is not enabled.");
            }

            if (mediaType != "movie" && mediaType != "tv" && mediaType != "person")
            {
                return BadRequest("mediaType must be 'movie', 'tv', or 'person'.");
            }

            if (string.IsNullOrWhiteSpace(tmdbId) || !tmdbId.All(char.IsDigit))
            {
                return BadRequest("tmdbId must be a positive integer.");
            }

            try
            {
                var result = await _wikidataAwardsService.GetAwardsAsync(mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
                if (result.Confirmed)
                {
                    SetExternalDataCacheHeaders();
                }
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to fetch awards for {mediaType}:{tmdbId}. Error: {ex.Message}");
                return StatusCode(500, "Failed to fetch awards.");
            }
        }

        /// <summary>
        /// MDBList ratings (TMDB score, Rotten Tomatoes critic/audience, IMDb,
        /// Trakt, Metacritic, etc.) for a title, keyed by TMDB id. Backed by
        /// MdblistService's disk cache -- the admin's MDBList API key is used
        /// server-side only and never reaches the client.
        /// </summary>
        [HttpGet("mdblist-ratings/{mediaType}/{tmdbId}")]
        [Authorize]
        public async Task<IActionResult> GetMdblistRatings(string mediaType, string tmdbId, CancellationToken cancellationToken)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.MdblistRatingsEnabled)
            {
                return StatusCode(503, "MDBList ratings feature is not enabled.");
            }

            if (mediaType != "movie" && mediaType != "tv")
            {
                return BadRequest("mediaType must be 'movie' or 'tv'.");
            }

            if (string.IsNullOrWhiteSpace(tmdbId) || !tmdbId.All(char.IsDigit))
            {
                return BadRequest("tmdbId must be a positive integer.");
            }

            // Unconfirmed so neither the browser nor the client cache keeps this answer,
            // which only holds while the title is guarded.
            if (_spoilerSeerrRedactor.HidesRatings(mediaType, tmdbId, UserHelper.GetCurrentUserId(User)?.ToString(), HttpContext))
            {
                return Ok(new { Found = false, Confirmed = false });
            }

            try
            {
                var result = await _mdblistService.GetRatingsAsync(mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
                if (result.Confirmed)
                {
                    SetExternalDataCacheHeaders();
                }
                return Ok(result);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return StatusCode(499); // browser went away; nothing was cached
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to fetch MDBList ratings for {mediaType}:{tmdbId}. Error: {ex.Message}");
                return StatusCode(500, "Failed to fetch MDBList ratings.");
            }
        }

        private bool DoesTheDogDieActive(out PluginConfiguration? config)
        {
            config = JellyfinEnhanced.Instance?.Configuration;
            return config != null && config.DoesTheDogDieEnabled && !string.IsNullOrWhiteSpace(config.DoesTheDogDieApiKey);
        }

        /// <summary>DoesTheDogDie content warnings for a title, by TMDB id.</summary>
        [HttpGet("ddd/{mediaType}/{tmdbId}")]
        [Authorize]
        public async Task<IActionResult> GetDoesTheDogDie(string mediaType, string tmdbId, CancellationToken cancellationToken)
        {
            if (!DoesTheDogDieActive(out _)) return StatusCode(503, "DoesTheDogDie is not enabled.");
            if (mediaType != "movie" && mediaType != "tv") return BadRequest("mediaType must be 'movie' or 'tv'.");
            if (string.IsNullOrWhiteSpace(tmdbId) || !tmdbId.All(char.IsDigit)) return BadRequest("tmdbId must be a positive integer.");

            try
            {
                var result = await _doesTheDogDieService.GetWarningsAsync(mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
                if (result.Confirmed) SetExternalDataCacheHeaders();
                return Ok(result);
            }
            catch (OperationCanceledException)
            {
                return StatusCode(499);
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to fetch DoesTheDogDie data for {mediaType}:{tmdbId}. Error: {ex.Message}");
                return StatusCode(500, "Failed to fetch DoesTheDogDie data.");
            }
        }

        /// <summary>Monthly request budget for the config page's Service Status card. refresh=true spends one request to measure it.</summary>
        [HttpGet("ddd/usage")]
        [Authorize]
        public async Task<IActionResult> GetDoesTheDogDieUsage([FromQuery] bool refresh, CancellationToken cancellationToken)
        {
            if (!IsAdminUser()) return Forbid();
            if (string.IsNullOrWhiteSpace(JellyfinEnhanced.Instance?.Configuration?.DoesTheDogDieApiKey))
            {
                return StatusCode(503, "DoesTheDogDie API key is not configured.");
            }

            try
            {
                var usage = refresh
                    ? await _doesTheDogDieService.RefreshUsageAsync(cancellationToken).ConfigureAwait(false)
                    : _doesTheDogDieService.GetUsage();
                return Ok(usage);
            }
            catch (OperationCanceledException)
            {
                return StatusCode(499);
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to read DoesTheDogDie usage. Error: {ex.Message}");
                return StatusCode(502, "Could not reach DoesTheDogDie.");
            }
        }

        /// <summary>All DoesTheDogDie topics, for the trigger picker.</summary>
        [HttpGet("ddd/topics")]
        [Authorize]
        public async Task<IActionResult> GetDoesTheDogDieTopics(CancellationToken cancellationToken)
        {
            if (!DoesTheDogDieActive(out _)) return StatusCode(503, "DoesTheDogDie is not enabled.");

            try
            {
                var catalog = await _doesTheDogDieService.GetCatalogAsync(cancellationToken).ConfigureAwait(false);
                if (catalog == null) return StatusCode(502, "DoesTheDogDie topics are unavailable.");
                SetExternalDataCacheHeaders();
                return Ok(catalog);
            }
            catch (OperationCanceledException)
            {
                return StatusCode(499);
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to fetch DoesTheDogDie topics. Error: {ex.Message}");
                return StatusCode(500, "Failed to fetch DoesTheDogDie topics.");
            }
        }

        [HttpGet("user-settings/{userId}/ddd-triggers.json")]
        [Authorize]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public IActionResult GetUserSettingsDdd(string userId)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null) return authorizationResult;

            return Ok(_userConfigurationManager.GetUserConfiguration<DddSettings>(authorizedUserId, "ddd-triggers.json"));
        }

        [HttpPost("user-settings/{userId}/ddd-triggers.json")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult SaveUserSettingsDdd(string userId, [FromBody] DddSettings userConfiguration)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null) return authorizationResult;

            try
            {
                _userConfigurationManager.SaveUserConfiguration(authorizedUserId, "ddd-triggers.json", userConfiguration);
                return Ok(new { success = true, file = "ddd-triggers.json" });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save user DoesTheDogDie settings for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save user DoesTheDogDie settings." });
            }
        }

        /// <summary>
        /// Live MDBList account/quota status (plan, daily limit, remaining
        /// requests, reset time) from MDBList's own GET /user endpoint, for
        /// the config page to display. Admin-only since it reveals account
        /// details -- same reasoning as ValidateTmdb. Always force-refreshes
        /// rather than serving the cached value, since querying /user doesn't
        /// itself count against the quota it's reporting on.
        /// </summary>
        /// <param name="apiKey">Optional: test an arbitrary (e.g. not-yet-saved)
        /// key instead of the saved config's, matching ValidateTmdb's pattern
        /// so the config page's "Check Status" button works before saving.</param>
        [HttpGet("mdblist-ratings/account-status")]
        [Authorize]
        public async Task<IActionResult> GetMdblistAccountStatus([FromQuery] string? apiKey, CancellationToken cancellationToken)
        {
            if (!IsAdminUser()) return Forbid();

            var effectiveKey = !string.IsNullOrWhiteSpace(apiKey)
                ? apiKey
                : JellyfinEnhanced.Instance?.Configuration?.MdblistApiKey;
            if (string.IsNullOrWhiteSpace(effectiveKey))
            {
                return StatusCode(503, "MDBList API key is not configured.");
            }

            var status = await _mdblistService.GetAccountStatusAsync(cancellationToken, forceRefresh: true, apiKeyOverride: apiKey).ConfigureAwait(false);
            if (status == null)
            {
                return StatusCode(502, "Could not reach MDBList to check account status (key may be invalid).");
            }
            return Ok(status);
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

            try
            {
                return Content(new Services.ElsewhereDocumentService(_userConfigurationManager).ReadJson(authorizedUserId), "application/json");
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to read user elsewhere settings for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { message = "Elsewhere settings could not be read. The stored document has been preserved." });
            }
        }

        [HttpPost("user-settings/{userId}/elsewhere.json")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult SaveUserSettingsElsewhere(string userId, [FromBody] System.Text.Json.JsonElement userConfiguration)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            // Raw body: Jellyfin's converters would turn a number into a string for a typed model.
            if (!Services.ElsewhereDocumentService.TryParseUpdate(userConfiguration, out var update, out var invalid))
            {
                return BadRequest(new { success = false, message = invalid });
            }

            try
            {
                if (!new Services.ElsewhereDocumentService(_userConfigurationManager).TrySave(authorizedUserId, update))
                {
                    return Conflict(new { success = false, message = "Elsewhere settings are being changed by another request. Try again." });
                }

                _logger.Info($"Saved user elsewhere settings for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)} to elsewhere.json");
                return Ok(new { success = true, file = "elsewhere.json" });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save user elsewhere settings for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save user elsewhere settings." });
            }
        }

        // ─── User Reviews (shared reviews.json at plugin config root) ────────────

        public sealed class ReviewPayload
        {
            public string Content { get; set; } = string.Empty;
            public double? Rating { get; set; }
        }

        /// <summary>Rating must be 0.5–5 in 0.5 increments (0.5, 3.5, 5, etc.).</summary>
        private static bool IsValidRating(double? rating) =>
            !rating.HasValue || (rating.Value >= 0.5 && rating.Value <= 5 && Math.Abs(rating.Value * 2 - Math.Round(rating.Value * 2)) < 0.0001);

        private static readonly System.Text.RegularExpressions.Regex _tmdbIdRegex =
            new System.Text.RegularExpressions.Regex(@"^\d+$", System.Text.RegularExpressions.RegexOptions.Compiled);

        // Extended key for season/episode reviews: {tmdbId}:s{n} or {tmdbId}:s{n}e{n}
        private static readonly System.Text.RegularExpressions.Regex _tmdbIdExtendedRegex =
            new System.Text.RegularExpressions.Regex(@"^\d+(:s\d+(:e\d+)?)?$", System.Text.RegularExpressions.RegexOptions.Compiled);

        private static bool IsValidTmdbKey(string tmdbId) =>
            !string.IsNullOrWhiteSpace(tmdbId) && _tmdbIdExtendedRegex.IsMatch(tmdbId);

        [HttpGet("reviews/{mediaType}/{tmdbId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetItemReviews(string mediaType, string tmdbId)
        {
            if (mediaType != "movie" && mediaType != "tv")
                return BadRequest(new { message = "MediaType must be 'movie' or 'tv'." });

            if (!IsValidTmdbKey(tmdbId))
                return BadRequest(new { message = "Invalid TmdbId." });

            var itemLabel = $"{mediaType}:{tmdbId}";
            var ctx = CreateReviewVisibilityContext(nameof(GetItemReviews), itemLabel);

            var suffix = $":{mediaType}:{tmdbId}";
            var store = _userConfigurationManager.GetAllReviews();
            var results = new List<object>();

            foreach (var kvp in store.Reviews)
            {
                if (!kvp.Key.EndsWith(suffix, StringComparison.Ordinal)) continue;

                // Per-review try/catch: if anything blows up while looking up
                // the author or evaluating their permissions, we skip just
                // this review with a warning. Without this, a single corrupt
                // or orphaned record would 500 the entire GetItemReviews call
                // and hide every other review on the item.
                try
                {
                    var review = kvp.Value;
                    if (!IsReviewVisibleToViewer(review, ctx, itemLabel, out var jellyfinUser)) continue;

                    results.Add(new
                    {
                        userId = review.UserId,
                        userName = jellyfinUser != null ? jellyfinUser.Username : review.UserId,
                        tmdbId = review.TmdbId,
                        mediaType = review.MediaType,
                        content = review.Content,
                        rating = review.Rating,
                        createdAt = review.CreatedAt,
                        updatedAt = review.UpdatedAt
                    });
                }
                catch (Exception ex)
                {
                    _logger.Warning($"Skipping review key={kvp.Key} due to filter error: {ex.Message}");
                }
            }

            return Ok(new { reviews = results });
        }

        /// <summary>Most distinct keys one <see cref="GetReviewRatings"/> call may ask for.</summary>
        private const int MaxReviewRatingKeys = 200;

        /// <summary>
        /// Average user rating for many items in one pass over the review
        /// store (the poster rating chips ask for a whole page at once instead
        /// of one <see cref="GetItemReviews"/> call per card).
        /// </summary>
        /// <param name="keys">Comma-separated "mediaType:tmdbKey" entries, e.g.
        /// "movie:603,tv:1399:s1". Malformed entries are ignored; at most
        /// <see cref="MaxReviewRatingKeys"/> distinct valid keys.</param>
        /// <returns>
        /// <c>{ "ratings": { "movie:603": { "average": 4.5, "count": 2 }, "tv:1399:s1": null } }</c>
        /// — one entry per valid requested key; null when no review visible to
        /// this viewer carries a rating. Computed from exactly the reviews
        /// <see cref="GetItemReviews"/> would return to the same viewer.
        /// </returns>
        [HttpGet("reviews/ratings")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetReviewRatings([FromQuery] string? keys)
        {
            // Insertion-ordered so the response lists keys in request order.
            var requested = new Dictionary<string, (double Sum, int Count)>(StringComparer.Ordinal);
            var order = new List<string>();
            foreach (var raw in (keys ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var sep = raw.IndexOf(':');
                if (sep <= 0) continue;
                var mediaType = raw.Substring(0, sep);
                if (mediaType != "movie" && mediaType != "tv") continue;
                if (!IsValidTmdbKey(raw.Substring(sep + 1))) continue;
                if (requested.ContainsKey(raw)) continue;
                if (requested.Count >= MaxReviewRatingKeys)
                    return BadRequest(new { message = $"At most {MaxReviewRatingKeys} keys per request." });
                requested[raw] = (0, 0);
                order.Add(raw);
            }

            if (requested.Count == 0)
                return BadRequest(new { message = "No valid keys. Expected comma-separated 'movie:<tmdbId>' or 'tv:<tmdbId>[:s<n>[:e<n>]]' entries." });

            var ctx = CreateReviewVisibilityContext(nameof(GetReviewRatings), $"{requested.Count} keys");
            foreach (var (key, sum, count) in AggregateVisibleReviewRatings(ctx, requested.ContainsKey))
            {
                requested[key] = (sum, count);
            }

            var ratings = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var key in order)
            {
                var (sum, count) = requested[key];
                ratings[key] = count == 0 ? null : new { average = sum / count, count };
            }

            return Ok(new { ratings });
        }

        [HttpPost("reviews/{mediaType}/{tmdbId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult UpsertReview(string mediaType, string tmdbId, [FromBody] ReviewPayload payload)
        {
            if (mediaType != "movie" && mediaType != "tv")
                return BadRequest(new { success = false, message = "MediaType must be 'movie' or 'tv'." });

            if (!IsValidTmdbKey(tmdbId))
                return BadRequest(new { success = false, message = "Invalid TmdbId." });

            if (payload == null)
                return BadRequest(new { success = false, message = "Invalid review payload." });

            var normalizedContent = payload.Content?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(normalizedContent) && !payload.Rating.HasValue)
                return BadRequest(new { success = false, message = "A rating or review text is required." });

            if (normalizedContent.Length > 2000)
                return BadRequest(new { success = false, message = "Review content must not exceed 2000 characters." });

            if (!IsValidRating(payload.Rating))
                return BadRequest(new { success = false, message = "Rating must be between 0.5 and 5, in 0.5 increments." });

            var currentUserId = UserHelper.GetCurrentUserId(User);
            if (!currentUserId.HasValue || currentUserId.Value == Guid.Empty) return Forbid();
            var userIdN = currentUserId.Value.ToString("N");

            try
            {
                var now = DateTime.UtcNow.ToString("o");
                var previousRating = _userConfigurationManager.UpsertReview(
                    userIdN, mediaType, tmdbId, normalizedContent, payload.Rating, now);
                _logger.Info($"Saved review for {mediaType}:{tmdbId} by user {_userDisplayResolver.ResolveUserDisplay(userIdN)}.");
                MirrorReviewRatingToUserData(userIdN, mediaType, tmdbId, previousRating, payload.Rating);
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save review for user {_userDisplayResolver.ResolveUserDisplay(userIdN)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save review." });
            }
        }

        [HttpPost("reviews/admin/{userIdN}/{mediaType}/{tmdbId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult AdminUpsertReview(string userIdN, string mediaType, string tmdbId, [FromBody] ReviewPayload payload)
        {
            if (!IsAdminUser())
                return Forbid();

            if (string.IsNullOrWhiteSpace(userIdN) || !Guid.TryParseExact(userIdN, "N", out _))
                return BadRequest(new { success = false, message = "Invalid userId (expected 32-char hex)." });

            if (mediaType != "movie" && mediaType != "tv")
                return BadRequest(new { success = false, message = "MediaType must be 'movie' or 'tv'." });

            if (!IsValidTmdbKey(tmdbId))
                return BadRequest(new { success = false, message = "Invalid TmdbId." });

            if (payload == null)
                return BadRequest(new { success = false, message = "Invalid review payload." });

            var normalizedContent = payload.Content?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(normalizedContent) && !payload.Rating.HasValue)
                return BadRequest(new { success = false, message = "A rating or review text is required." });

            if (normalizedContent.Length > 2000)
                return BadRequest(new { success = false, message = "Review content must not exceed 2000 characters." });

            if (!IsValidRating(payload.Rating))
                return BadRequest(new { success = false, message = "Rating must be between 0.5 and 5, in 0.5 increments." });

            try
            {
                var now = DateTime.UtcNow.ToString("o");
                var previousRating = _userConfigurationManager.UpsertReview(
                    userIdN, mediaType, tmdbId, normalizedContent, payload.Rating, now);
                _logger.Info($"Admin saved review for {mediaType}:{tmdbId} on behalf of {_userDisplayResolver.ResolveUserDisplay(userIdN)}.");
                MirrorReviewRatingToUserData(userIdN, mediaType, tmdbId, previousRating, payload.Rating);
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.Error($"Admin failed to save review for user {_userDisplayResolver.ResolveUserDisplay(userIdN)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save review." });
            }
        }

        [HttpDelete("reviews/{mediaType}/{tmdbId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult DeleteReview(string mediaType, string tmdbId)
        {
            if (mediaType != "movie" && mediaType != "tv")
                return BadRequest(new { success = false, message = "MediaType must be 'movie' or 'tv'." });

            if (!IsValidTmdbKey(tmdbId))
                return BadRequest(new { success = false, message = "Invalid TmdbId." });

            var currentUserId = UserHelper.GetCurrentUserId(User);
            if (!currentUserId.HasValue || currentUserId.Value == Guid.Empty) return Forbid();
            var userIdN = currentUserId.Value.ToString("N");

            try
            {
                if (_userConfigurationManager.DeleteReview(userIdN, mediaType, tmdbId, out var removedRating))
                {
                    _logger.Info($"Deleted review for {mediaType}:{tmdbId} by user {_userDisplayResolver.ResolveUserDisplay(userIdN)}.");
                    MirrorReviewRatingToUserData(userIdN, mediaType, tmdbId, removedRating, null);
                }
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to delete review for user {_userDisplayResolver.ResolveUserDisplay(userIdN)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to delete review." });
            }
        }

        /// <summary>
        /// Optionally keeps Jellyfin's own per-user rating for the matching
        /// library item in step with a review's star rating, so tools that only
        /// read Jellyfin user data (scrobblers, Letterboxd/Trakt syncs, other
        /// clients) can see ratings given through the reviews UI. Gated by the
        /// MirrorReviewRatingsToJellyfin setting (off by default).
        ///
        /// previousRating is the review's rating before this change (null if it
        /// had none or is new) and newRating the rating after it (null when the
        /// review was deleted or saved without a rating).
        ///
        /// - newRating set: write it to Jellyfin (overwrites).
        /// - newRating null and previousRating set: clear the Jellyfin rating,
        ///   but only if it still equals what the review would have mirrored.
        ///   Jellyfin ratings carry no provenance, so a value that differs was
        ///   changed somewhere else (another client, a sync tool) and is left
        ///   alone.
        ///
        /// Only whole movies and series are touched (a season/episode key has
        /// no reliably TMDB-keyed library item). Scale: 1-5 stars in half steps
        /// become Jellyfin's 0-10 (x2), which is what Jellyfin's own clients
        /// and the ratings-based sync tools already expect.
        ///
        /// Never throws: the review change is already saved by the time this
        /// runs, and a mirror failure must not turn that into a 500.
        /// </summary>
        private void MirrorReviewRatingToUserData(string userIdN, string mediaType, string tmdbId, double? previousRating, double? newRating)
        {
            try
            {
                var config = JellyfinEnhanced.Instance?.Configuration;
                if (config == null || !config.MirrorReviewRatingsToJellyfin) return;
                if (!newRating.HasValue && !previousRating.HasValue) return;

                // Season/episode reviews carry a ":s{n}[:e{n}]" suffix; there is no
                // TMDB-keyed library item to attach those to, so leave them alone.
                if (tmdbId.Contains(':')) return;

                if (!Guid.TryParseExact(userIdN, "N", out var userGuid)) return;
                var user = _userManager.GetUserById(userGuid);
                if (user == null) return;

                var item = _libraryItemLookup.FindLibraryItemByTmdb(user, mediaType, tmdbId);
                if (item == null)
                {
                    _logger.Debug($"[ReviewRatingMirror] No library item for {mediaType}:{tmdbId}; nothing to mirror for {_userDisplayResolver.ResolveUserDisplay(userIdN)}.");
                    return;
                }

                var userData = _userDataManager.GetUserData(user, item);
                if (userData == null) return;

                if (newRating.HasValue)
                {
                    var jellyfinRating = Math.Round(newRating.Value * 2, 1);
                    if (userData.Rating.HasValue && Math.Abs(userData.Rating.Value - jellyfinRating) < 0.01) return;

                    userData.Rating = jellyfinRating;
                    _userDataManager.SaveUserData(user, item, userData, UserDataSaveReason.UpdateUserRating, default);
                    _logger.Info($"[ReviewRatingMirror] Set Jellyfin rating {jellyfinRating} on '{item.Name}' for {_userDisplayResolver.ResolveUserDisplay(userIdN)} from their review.");
                    return;
                }

                var mirroredRating = Math.Round(previousRating!.Value * 2, 1);
                if (!userData.Rating.HasValue) return;
                if (Math.Abs(userData.Rating.Value - mirroredRating) >= 0.01)
                {
                    _logger.Debug($"[ReviewRatingMirror] Jellyfin rating {userData.Rating.Value} on '{item.Name}' no longer matches the review's {mirroredRating}; leaving it for {_userDisplayResolver.ResolveUserDisplay(userIdN)}.");
                    return;
                }

                userData.Rating = null;
                _userDataManager.SaveUserData(user, item, userData, UserDataSaveReason.UpdateUserRating, default);
                _logger.Info($"[ReviewRatingMirror] Cleared Jellyfin rating {mirroredRating} on '{item.Name}' for {_userDisplayResolver.ResolveUserDisplay(userIdN)} after their review rating was removed.");
            }
            catch (Exception ex)
            {
                _logger.Warning($"[ReviewRatingMirror] Could not mirror rating for {mediaType}:{tmdbId}: {ex.Message}");
            }
        }

        /// <summary>
        /// Lists every review on the server for an Administrator caller, so a
        /// headless integration (a sync job, a scrobbler, a backup script) can
        /// consume reviews without knowing the store's on-disk layout or
        /// polling the per-item endpoint once per TMDB id. Ordered by
        /// updatedAt ascending so a client can page forward and keep the last
        /// updatedAt it saw as its next "since".
        /// </summary>
        /// <param name="since">Optional ISO 8601 timestamp; only reviews whose updatedAt is at or after it are returned. A review whose stored timestamp cannot be parsed is always returned rather than silently dropped.</param>
        /// <param name="userId">Optional author filter, 32-char hex (N) form.</param>
        /// <param name="limit">Page size, 1-1000, default 500.</param>
        /// <param name="offset">Number of matching reviews to skip, default 0.</param>
        [HttpGet("reviews/admin/all")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult AdminListReviews(
            [FromQuery] string? since = null,
            [FromQuery] string? userId = null,
            [FromQuery] int limit = 500,
            [FromQuery] int offset = 0)
        {
            if (!IsAdminUser())
                return Forbid();

            DateTimeOffset? sinceUtc = null;
            if (!string.IsNullOrWhiteSpace(since))
            {
                if (!DateTimeOffset.TryParse(since, System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                        out var parsedSince))
                    return BadRequest(new { success = false, message = "Invalid 'since' (expected ISO 8601)." });
                sinceUtc = parsedSince;
            }

            if (!string.IsNullOrWhiteSpace(userId) && !Guid.TryParseExact(userId, "N", out _))
                return BadRequest(new { success = false, message = "Invalid userId (expected 32-char hex)." });

            if (limit < 1 || limit > 1000)
                return BadRequest(new { success = false, message = "limit must be between 1 and 1000." });

            if (offset < 0)
                return BadRequest(new { success = false, message = "offset must be 0 or greater." });

            try
            {
                var store = _userConfigurationManager.GetAllReviews();

                var matching = new List<(DateTimeOffset? UpdatedAt, string Key, UserReview Review)>();
                foreach (var kvp in store.Reviews)
                {
                    var review = kvp.Value;
                    if (review == null) continue;

                    if (!string.IsNullOrWhiteSpace(userId)
                        && !string.Equals(review.UserId, userId, StringComparison.OrdinalIgnoreCase))
                        continue;

                    DateTimeOffset? updatedAt = null;
                    if (DateTimeOffset.TryParse(review.UpdatedAt, System.Globalization.CultureInfo.InvariantCulture,
                            System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                            out var parsedUpdated))
                        updatedAt = parsedUpdated;

                    // Unparseable timestamps are kept so a corrupt field never hides a review.
                    if (sinceUtc.HasValue && updatedAt.HasValue && updatedAt.Value < sinceUtc.Value)
                        continue;

                    matching.Add((updatedAt, kvp.Key, review));
                }

                // Stable order: by updatedAt, then by key so ties never reshuffle between pages.
                matching.Sort((a, b) =>
                {
                    var byDate = Nullable.Compare(a.UpdatedAt, b.UpdatedAt);
                    return byDate != 0 ? byDate : string.CompareOrdinal(a.Key, b.Key);
                });

                var page = matching.Skip(offset).Take(limit).Select(m =>
                {
                    var review = m.Review;
                    string displayName = review.UserId;
                    if (Guid.TryParseExact(review.UserId, "N", out var authorGuid))
                    {
                        var author = _userManager.GetUserById(authorGuid);
                        if (author != null) displayName = author.Username;
                    }

                    return new
                    {
                        userId = review.UserId,
                        userName = displayName,
                        tmdbId = review.TmdbId,
                        mediaType = review.MediaType,
                        content = review.Content,
                        rating = review.Rating,
                        createdAt = review.CreatedAt,
                        updatedAt = review.UpdatedAt
                    };
                }).ToList();

                return Ok(new
                {
                    reviews = page,
                    total = matching.Count,
                    offset,
                    limit
                });
            }
            catch (Exception ex)
            {
                _logger.Error($"Admin failed to list reviews: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to list reviews." });
            }
        }

        [HttpDelete("reviews/admin/{userIdN}/{mediaType}/{tmdbId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult AdminDeleteReview(string userIdN, string mediaType, string tmdbId)
        {
            if (!IsAdminUser())
                return Forbid();

            if (mediaType != "movie" && mediaType != "tv")
                return BadRequest(new { success = false, message = "MediaType must be 'movie' or 'tv'." });

            if (!IsValidTmdbKey(tmdbId))
                return BadRequest(new { success = false, message = "Invalid TmdbId." });

            if (string.IsNullOrWhiteSpace(userIdN) || !Guid.TryParseExact(userIdN, "N", out _))
                return BadRequest(new { success = false, message = "Invalid userId (expected 32-char hex)." });

            try
            {
                var removed = _userConfigurationManager.DeleteReview(userIdN, mediaType, tmdbId, out var removedRating);
                if (removed)
                {
                    _logger.Info($"Admin deleted review for {mediaType}:{tmdbId} by user {_userDisplayResolver.ResolveUserDisplay(userIdN)}.");
                    MirrorReviewRatingToUserData(userIdN, mediaType, tmdbId, removedRating, null);
                    return Ok(new { success = true, removed = true });
                }
                // Fail explicitly: nothing to delete means the review was
                // already gone (race with a concurrent delete, wrong
                // userIdN, or a stale admin click). Returning 200 here
                // lets the frontend think it succeeded and refresh to a
                // list that looks the same as before.
                return NotFound(new { success = false, removed = false, message = "No matching review to delete." });
            }
            catch (Exception ex)
            {
                _logger.Error($"Admin failed to delete review for {mediaType}:{tmdbId} user {_userDisplayResolver.ResolveUserDisplay(userIdN)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to delete review." });
            }
        }

        /// <summary>
        /// Size and watch progress of an item and everything playable under it,
        /// in one response (see <see cref="Services.ItemStatsService"/>). The
        /// details page reads both chips from this; the two single-value
        /// routes below stay for older clients and other callers.
        /// </summary>
        [HttpGet("item-stats/{userId}/{itemId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetItemStatsByItemId(Guid userId, Guid itemId, [FromQuery] string? mediaSourceId = null)
        {
            var authorizationResult = AuthorizeUserAccess(userId, out var user);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            var item = _libraryManager.GetItemById<BaseItem>(itemId, user);
            if (item is null)
            {
                return NotFound();
            }

            var stats = _itemStats.Compute(user, item, mediaSourceId);
            return Ok(new { success = true, size = stats.Size, progress = stats.Progress, totalPlaybackTicks = stats.TotalPlaybackTicks, totalRuntimeTicks = stats.TotalRuntimeTicks });
        }

        [HttpGet("file-size/{userId}/{itemId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetFileSizeByItemId(Guid userId, Guid itemId, [FromQuery] string? mediaSourceId = null)
        {
            var authorizationResult = AuthorizeUserAccess(userId, out var user);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            var item = _libraryManager.GetItemById<BaseItem>(itemId, user);
            if (item is null)
            {
                return NotFound();
            }

            var stats = _itemStats.Compute(user, item, mediaSourceId);
            return Ok(new { success = true, size = stats.Size });
        }

        [HttpGet("watch-progress/{userId}/{itemId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetWatchProgressByItemId(Guid userId, Guid itemId)
        {
            var authorizationResult = AuthorizeUserAccess(userId, out var user);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            var item = _libraryManager.GetItemById<BaseItem>(itemId, user);
            if (item is null)
            {
                return NotFound();
            }

            var stats = _itemStats.Compute(user, item, null);
            return Ok(new { success = true, progress = stats.Progress, totalPlaybackTicks = stats.TotalPlaybackTicks, totalRuntimeTicks = stats.TotalRuntimeTicks });
        }

        [HttpGet("arr/identify-url")]
        [Authorize]
        public async Task<IActionResult> IdentifyUrl([FromQuery] string url)
        {
            if (!IsAdminUser())
                return Forbid();

            if (string.IsNullOrWhiteSpace(url))
                return BadRequest(new { reachable = false, service = "unknown" });

            if (!ArrUrlGuard.IsAllowedUrl(url, _logger))
                return BadRequest(new { reachable = false, service = "unknown" });

            var http = Shared.Seerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            http.Timeout = TimeSpan.FromSeconds(5);
            var cleanUrl = url.TrimEnd('/');

            // Try Sonarr/Radarr (/api/v3/system/status)
            try
            {
                using var resp = await http.GetAsync($"{cleanUrl}/api/v3/system/status");
                if (resp.IsSuccessStatusCode)
                {
                    var ct = resp.Content.Headers.ContentType?.MediaType ?? "";
                    if (ct.Contains("json"))
                    {
                        var json = await resp.Content.ReadAsStringAsync();
                        if (json.Contains("appName", StringComparison.Ordinal))
                        {
                            if (json.Contains("Sonarr", StringComparison.OrdinalIgnoreCase))
                                return Ok(new { reachable = true, service = "Sonarr" });
                            if (json.Contains("Radarr", StringComparison.OrdinalIgnoreCase))
                                return Ok(new { reachable = true, service = "Radarr" });
                        }
                    }
                }
                else if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized ||
                         resp.StatusCode == System.Net.HttpStatusCode.Forbidden)
                {
                    var contentType = resp.Content.Headers.ContentType?.MediaType ?? "";
                    if (contentType.Contains("json"))
                        return Ok(new { reachable = true, service = "arr" });
                }
            }
            catch (HttpRequestException) { /* continue to next service probe */ }
            catch (TaskCanceledException) { /* continue to next service probe */ }

            // Try Jellyfin (/System/Info/Public — public endpoint, returns JSON)
            try
            {
                using var resp = await http.GetAsync($"{cleanUrl}/System/Info/Public");
                if (resp.IsSuccessStatusCode)
                {
                    var ct = resp.Content.Headers.ContentType?.MediaType ?? "";
                    if (ct.Contains("json"))
                    {
                        var body = await resp.Content.ReadAsStringAsync();
                        if (body.Contains("ServerName", StringComparison.OrdinalIgnoreCase))
                            return Ok(new { reachable = true, service = "Jellyfin" });
                    }
                }
            }
            catch (HttpRequestException) { /* continue to next service probe */ }
            catch (TaskCanceledException) { /* continue to next service probe */ }

            // Try Jellyseerr (/api/v1/status — returns JSON)
            try
            {
                using var resp = await http.GetAsync($"{cleanUrl}/api/v1/status");
                if (resp.IsSuccessStatusCode)
                {
                    var ct = resp.Content.Headers.ContentType?.MediaType ?? "";
                    if (ct.Contains("json"))
                        return Ok(new { reachable = true, service = "Seerr" });
                }
            }
            catch (HttpRequestException) { /* continue to next service probe */ }
            catch (TaskCanceledException) { /* continue to next service probe */ }

            // Try generic reachability — also check HTML title for service name
            try
            {
                using var resp = await http.GetAsync(cleanUrl, HttpCompletionOption.ResponseHeadersRead);
                if (resp.IsSuccessStatusCode)
                {
                    // Only read first 64KB — title tag is near the top of the HTML
                    var buffer = new byte[65536];
                    using var stream = await resp.Content.ReadAsStreamAsync();
                    var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
                    var body = System.Text.Encoding.UTF8.GetString(buffer, 0, bytesRead);
                    // Check <title> tag for known service names (SPA root pages)
                    var titleMatch = System.Text.RegularExpressions.Regex.Match(
                        body, @"<title[^>]*>([^<]*)</title>", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    if (titleMatch.Success)
                    {
                        var title = titleMatch.Groups[1].Value;
                        if (title.Contains("Sonarr", StringComparison.OrdinalIgnoreCase))
                            return Ok(new { reachable = true, service = "Sonarr" });
                        if (title.Contains("Radarr", StringComparison.OrdinalIgnoreCase))
                            return Ok(new { reachable = true, service = "Radarr" });
                        if (title.Contains("Bazarr", StringComparison.OrdinalIgnoreCase))
                            return Ok(new { reachable = true, service = "Bazarr" });
                        if (title.Contains("Jellyseerr", StringComparison.OrdinalIgnoreCase)
                            || title.Contains("Overseerr", StringComparison.OrdinalIgnoreCase))
                            return Ok(new { reachable = true, service = "Seerr" });
                        if (title.Contains("Jellyfin", StringComparison.OrdinalIgnoreCase))
                            return Ok(new { reachable = true, service = "Jellyfin" });
                    }
                }
                return Ok(new { reachable = true, service = "unknown" });
            }
            catch (HttpRequestException)
            {
                return Ok(new { reachable = false, service = "unknown" });
            }
            catch (TaskCanceledException)
            {
                return Ok(new { reachable = false, service = "unknown" });
            }
        }

        [HttpGet("arr/series-slug")]
        [Authorize]
        public async Task<IActionResult> GetSeriesSlug([FromQuery] int tvdbId)
        {
            if (!IsAdminUser())
                return Forbid();

            if (tvdbId <= 0)
                return BadRequest(new { error = "tvdbId must be a positive integer" });

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
                return StatusCode(500, new { error = "Plugin configuration not available" });

            _arrInstanceClient.WarnIfArrInstancesCorrupt(config);
            var instances = config.GetEnabledSonarrInstances();
            if (instances.Count == 0)
            {
                if (config.IsSonarrInstancesCorrupt())
                    return StatusCode(500, new { error = "Sonarr instance configuration is corrupt — see server logs" });
                return NotFound(new { error = "Sonarr is not configured" });
            }

            var outcome = await _arrInstanceClient.FetchSeriesInfoFromInstance(instances[0], tvdbId, HttpContext.RequestAborted);
            if (outcome.Error != null)
                return StatusCode(502, new { error = $"Sonarr fetch failed: {outcome.Error}" });
            if (outcome.Match == null)
                return NotFound(new { error = "Series not found in Sonarr" });

            // Legacy endpoint: extract titleSlug from the enriched response. Preserve the historical
            // contract — return 404 rather than 200+null if the upstream response lacks titleSlug.
            var titleSlug = (string?)((dynamic)outcome.Match).titleSlug;
            if (string.IsNullOrEmpty(titleSlug))
                return NotFound(new { error = "Series not found in Sonarr" });
            return Ok(new { titleSlug });
        }

        [HttpGet("arr/series-slugs")]
        [Authorize]
        public async Task<IActionResult> GetSeriesSlugs([FromQuery] int tvdbId)
        {
            if (!IsAdminUser())
                return Forbid();

            if (tvdbId <= 0)
                return BadRequest(new { error = "tvdbId must be a positive integer" });

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
                return StatusCode(500, new { error = "Plugin configuration not available" });

            _arrInstanceClient.WarnIfArrInstancesCorrupt(config);
            var instances = config.GetEnabledSonarrInstances();
            if (instances.Count == 0)
                return Ok(BuildNoArrInstancesResult("Sonarr", config.IsSonarrInstancesCorrupt(), config.GetSonarrInstances().Count > 0));

            var ct = HttpContext.RequestAborted;
            var outcomes = await Task.WhenAll(instances.Select(i => _arrInstanceClient.FetchSeriesInfoFromInstance(i, tvdbId, ct)));
            return Ok(BuildArrLookupResult(instances, outcomes));
        }

        /// <summary>
        /// Response for <c>arr/series-slugs</c> / <c>arr/movie-instances</c> (and each entry of
        /// <c>arr/links</c>) when no instance of that kind is enabled. Distinguishes "config corrupt"
        /// and "admin disabled everything" from "never configured" so the frontend can toast the
        /// right message instead of silently showing no links.
        /// </summary>
        private static object BuildNoArrInstancesResult(string serviceName, bool corrupt, bool anyConfigured)
        {
            var errList = new List<object>();
            if (corrupt)
                errList.Add(new { instanceName = serviceName, reason = "config corrupt — see server logs" });
            else if (anyConfigured)
                errList.Add(new { instanceName = serviceName, reason = $"all {serviceName} instances are disabled" });
            return new { matches = Array.Empty<object>(), errors = errList };
        }

        /// <summary>
        /// Folds per-instance lookup outcomes (same order as <paramref name="instances"/>) into
        /// the <c>{ matches, errors }</c> shape shared by the single and batch arr link endpoints.
        /// </summary>
        private static object BuildArrLookupResult(IReadOnlyList<ArrInstance> instances, IReadOnlyList<ArrFetchOutcome> outcomes)
        {
            var matches = new List<object>();
            var errors = new List<object>();
            for (int i = 0; i < outcomes.Count; i++)
            {
                if (outcomes[i].Match != null) matches.Add(outcomes[i].Match!);
                if (outcomes[i].Error != null)
                    errors.Add(new { instanceName = instances[i].Name, reason = outcomes[i].Error });
            }

            return new { matches, errors };
        }

        // Batch arr link lookup limits. The Requests page shows 20 cards, so 100 leaves room for
        // other callers while bounding the upstream fan-out of a single request.
        private const int ArrLinksBatchMaxIds = 100;

        // Upstream calls in flight per Radarr/Sonarr instance, shared by every concurrent
        // arr/links request (the page sends a small visible-cards batch next to the rest).
        // 8 matches what the old per-card path reached: up to 8 browser requests through
        // JE's request pool, each querying every instance once. Lower values make a slow
        // instance (e.g. a 4K Radarr at ~1 s per lookup) take several rounds per page.
        private const int ArrLinksPerInstanceConcurrency = 8;

        // One gate per instance URL, process-wide, so parallel batches (two tabs, visible +
        // rest chunks) cannot multiply the load on an instance. Entries are tiny and keyed by
        // configured URLs, so the map stays as small as the instance list.
        private static readonly ConcurrentDictionary<string, SemaphoreSlim> _arrLinksInstanceGates =
            new(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Batch form of <c>arr/movie-instances</c> + <c>arr/series-slugs</c> for pages that
        /// show many items at once (the Requests page). Radarr/Sonarr v3 only filter
        /// <c>/movie</c> and <c>/series</c> by a single tmdbId/tvdbId (the unfiltered lists are
        /// whole-library dumps), so this still makes one upstream call per id and instance, but
        /// with bounded per-instance concurrency and a handful of browser requests per page.
        /// Each value is exactly what the matching single endpoint returns for that id.
        /// </summary>
        /// <param name="tmdbIds">Comma-separated positive TMDB movie ids (Radarr).</param>
        /// <param name="tvdbIds">Comma-separated positive TVDB series ids (Sonarr).</param>
        [HttpGet("arr/links")]
        [Authorize]
        public async Task<IActionResult> GetArrLinks([FromQuery] string? tmdbIds, [FromQuery] string? tvdbIds)
        {
            if (!IsAdminUser())
                return Forbid();

            var movieIds = ParsePositiveIdList(tmdbIds);
            var seriesIds = ParsePositiveIdList(tvdbIds);
            if (movieIds.Count + seriesIds.Count == 0)
                return BadRequest(new { error = "tmdbIds or tvdbIds must contain at least one positive integer" });
            if (movieIds.Count + seriesIds.Count > ArrLinksBatchMaxIds)
                return BadRequest(new { error = $"At most {ArrLinksBatchMaxIds} ids per request" });

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
                return StatusCode(500, new { error = "Plugin configuration not available" });

            _arrInstanceClient.WarnIfArrInstancesCorrupt(config);
            var ct = HttpContext.RequestAborted;

            var moviesTask = LookupArrLinksBatchAsync(
                movieIds,
                movieIds.Count > 0 ? config.GetEnabledRadarrInstances() : new List<ArrInstance>(),
                () => BuildNoArrInstancesResult("Radarr", config.IsRadarrInstancesCorrupt(), config.GetRadarrInstances().Count > 0),
                _arrInstanceClient.FetchMovieInfoFromInstance,
                ct);
            var seriesTask = LookupArrLinksBatchAsync(
                seriesIds,
                seriesIds.Count > 0 ? config.GetEnabledSonarrInstances() : new List<ArrInstance>(),
                () => BuildNoArrInstancesResult("Sonarr", config.IsSonarrInstancesCorrupt(), config.GetSonarrInstances().Count > 0),
                _arrInstanceClient.FetchSeriesInfoFromInstance,
                ct);
            try
            {
                await Task.WhenAll(moviesTask, seriesTask).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
            {
                // Browser went away (navigated off, aborted a superseded lookup) -
                // expected under normal use, not a failure worth logging.
                return StatusCode(499);
            }

            return Ok(new { movies = await moviesTask.ConfigureAwait(false), series = await seriesTask.ConfigureAwait(false) });
        }

        /// <summary>
        /// Parses a comma-separated id list: positive ints only, malformed entries ignored,
        /// duplicates removed (first-seen order kept).
        /// </summary>
        private static List<int> ParsePositiveIdList(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return new List<int>();
            var seen = new HashSet<int>();
            return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(part => int.TryParse(part, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var id) ? id : 0)
                .Where(id => id > 0 && seen.Add(id))
                .ToList();
        }

        /// <summary>
        /// Looks every id up on every instance with at most
        /// <see cref="ArrLinksPerInstanceConcurrency"/> calls in flight per instance (across all
        /// batch requests), and returns id → <c>{ matches, errors }</c>. Once an instance times
        /// out, fails at the network level or rejects the API key, its remaining lookups in this
        /// batch report the same error instead of waiting out the timeout once per id. Per-id
        /// HTTP errors (e.g. a 500 for one movie) are not generalised. FetchAndMapAsync makes a
        /// single attempt (no retry/backoff), so a failing instance costs one call per id.
        /// </summary>
        private static async Task<Dictionary<string, object>> LookupArrLinksBatchAsync(
            IReadOnlyList<int> ids,
            IReadOnlyList<ArrInstance> instances,
            Func<object> noInstancesResult,
            Func<ArrInstance, int, CancellationToken, Task<ArrFetchOutcome>> fetch,
            CancellationToken ct)
        {
            var result = new Dictionary<string, object>(ids.Count);
            if (ids.Count == 0) return result;

            if (instances.Count == 0)
            {
                var empty = noInstancesResult();
                foreach (var id in ids)
                    result[id.ToString(System.Globalization.CultureInfo.InvariantCulture)] = empty;
                return result;
            }

            var gates = instances
                .Select(i => _arrLinksInstanceGates.GetOrAdd(i.Url.Trim().TrimEnd('/'), _ => new SemaphoreSlim(ArrLinksPerInstanceConcurrency)))
                .ToArray();
            // Per-instance sticky failure (null = healthy); written by whichever lookup hits it first.
            var failed = new string?[instances.Count];

            async Task<ArrFetchOutcome> LookupOne(int instanceIndex, int id)
            {
                var gate = gates[instanceIndex];
                await gate.WaitAsync(ct).ConfigureAwait(false);
                try
                {
                    var sticky = Volatile.Read(ref failed[instanceIndex]);
                    if (sticky != null)
                        return new ArrFetchOutcome { Error = sticky };

                    var outcome = await fetch(instances[instanceIndex], id, ct).ConfigureAwait(false);
                    if (outcome.Error != null && IsInstanceWideArrError(outcome.Error))
                        Volatile.Write(ref failed[instanceIndex], outcome.Error);
                    return outcome;
                }
                finally
                {
                    gate.Release();
                }
            }

            var perId = ids
                .Select(id => Task.WhenAll(Enumerable.Range(0, instances.Count).Select(i => LookupOne(i, id))))
                .ToArray();
            var outcomes = await Task.WhenAll(perId).ConfigureAwait(false);

            for (int n = 0; n < ids.Count; n++)
                result[ids[n].ToString(System.Globalization.CultureInfo.InvariantCulture)] = BuildArrLookupResult(instances, outcomes[n]);
            return result;
        }

        // Errors from FetchAndMapAsync that describe the instance rather than the id looked up.
        private static bool IsInstanceWideArrError(string error)
            => error == "timeout"
                || error == "network error"
                || error == "URL rejected by SSRF guard"
                || error.StartsWith("authentication failed", StringComparison.Ordinal);

        [HttpGet("arr/movie-instances")]
        [Authorize]
        public async Task<IActionResult> GetMovieInstances([FromQuery] int tmdbId)
        {
            if (!IsAdminUser())
                return Forbid();

            if (tmdbId <= 0)
                return BadRequest(new { error = "tmdbId must be a positive integer" });

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
                return StatusCode(500, new { error = "Plugin configuration not available" });

            _arrInstanceClient.WarnIfArrInstancesCorrupt(config);
            var instances = config.GetEnabledRadarrInstances();
            if (instances.Count == 0)
                return Ok(BuildNoArrInstancesResult("Radarr", config.IsRadarrInstancesCorrupt(), config.GetRadarrInstances().Count > 0));

            var ct = HttpContext.RequestAborted;
            var outcomes = await Task.WhenAll(instances.Select(i => _arrInstanceClient.FetchMovieInfoFromInstance(i, tmdbId, ct)));
            return Ok(BuildArrLookupResult(instances, outcomes));
        }
    }
}
