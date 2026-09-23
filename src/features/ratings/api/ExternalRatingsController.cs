using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class ExternalRatingsController : UserControllerBase
    {
        private readonly Logger _logger;
        private readonly Services.WikidataAwardsService _wikidataAwardsService;
        private readonly Services.MdblistService _mdblistService;

        public ExternalRatingsController(
            Logger logger,
            Services.WikidataAwardsService wikidataAwardsService,
            Services.MdblistService mdblistService,
            IUserManager userManager) : base(userManager)
        {
            _logger = logger;
            _wikidataAwardsService = wikidataAwardsService;
            _mdblistService = mdblistService;
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

            try
            {
                var result = await _mdblistService.GetRatingsAsync(mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to fetch MDBList ratings for {mediaType}:{tmdbId}. Error: {ex.Message}");
                return StatusCode(500, "Failed to fetch MDBList ratings.");
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
    }
}
