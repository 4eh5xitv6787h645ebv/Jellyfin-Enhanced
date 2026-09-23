using Microsoft.AspNetCore.Mvc;
using Jellyfin.Data;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Microsoft.EntityFrameworkCore;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class TmdbController : UserControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;
        private readonly Services.SeerrParentalFilter _parentalFilter;

        public TmdbController(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            Services.SeerrParentalFilter parentalFilter,
            IUserManager userManager) : base(userManager)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _parentalFilter = parentalFilter;
        }

        [HttpGet("tmdb/validate")]
        [Authorize]
        public async Task<IActionResult> ValidateTmdb([FromQuery] string apiKey)
        {
            // Admin-only: validates an arbitrary API key against TMDB. Any
            // authenticated user could otherwise use this as a free oracle
            // for testing leaked TMDB keys, matching the pattern in every
            // sibling validate endpoint (arr/validate/sonarr|radarr,
            // jellyseerr/validate).
            if (!IsAdminUser())
            {
                return Forbid();
            }

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return BadRequest(new { ok = false, message = "API key is missing" });
            }

            var httpClient = _httpClientFactory.CreateClient();
            try
            {
                var requestUri = $"https://api.themoviedb.org/3/configuration?api_key={Uri.EscapeDataString(apiKey)}";
                var response = await httpClient.GetAsync(requestUri);

                if (response.IsSuccessStatusCode)
                {
                    return Ok(new { ok = true });
                }

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    return Unauthorized(new { ok = false, message = "Invalid API Key." });
                }

                return StatusCode((int)response.StatusCode, new { ok = false, message = "Failed to connect to TMDB." });
            }
            catch (Exception ex)
            {
                _logger.Error($"Exception during TMDB API key validation: {ex.Message}");
                return StatusCode(500, new { ok = false, message = "Could not reach TMDB services." });
            }
        }

        [HttpGet("tmdb/{**apiPath}")]
        [Authorize]
        public async Task<IActionResult> ProxyTmdbRequest(string apiPath)
        {
            // Parental ratings (#581): for a restricted user the raw TMDB passthrough
            // is limited to title-free lookups; single-title lookups are gated on
            // that title and anything else (search, discover, trending, lists) is
            // refused, because it would return titles unfiltered.
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.TMDB_API_KEY))
            {
                return StatusCode(503, "TMDB API key is not configured.");
            }

            var tmdbCallerId = UserHelper.GetCurrentUserId(User)?.ToString();
            var queryString = HttpContext.Request.QueryString;
            if (_parentalFilter.TryGetRestrictedPolicy(tmdbCallerId, out _))
            {
                // Kestrel decodes %3F in the path, so a query (even a double-encoded
                // append_to_response) can arrive inside apiPath. Restricted users get
                // plain path characters only.
                if (apiPath.IndexOfAny(new[] { '?', '%', '&', '#', ';', '=', '\\' }) >= 0)
                {
                    return ParentalBlockedResult();
                }

                // The route captures only the path; the query matters too. Work on the
                // DECODED keys so percent-encoding (append%5Fto%5Fresponse) can't slip
                // a title list past the classifier, and forward only a small set of
                // harmless parameters, rebuilt from the decoded values.
                var allowedKeys = new[] { "language", "page", "region", "include_adult", "query" };
                var decodedQuery = string.Join("&", HttpContext.Request.Query
                    .Where(kv => allowedKeys.Contains(kv.Key, StringComparer.OrdinalIgnoreCase))
                    .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value.ToString())}"));
                if (HttpContext.Request.Query.Keys.Any(k => !allowedKeys.Contains(k, StringComparer.OrdinalIgnoreCase)))
                {
                    return ParentalBlockedResult();
                }
                switch (Services.SeerrParentalFilter.ClassifyTmdbPassthrough(apiPath + (decodedQuery.Length > 0 ? "?" + decodedQuery : string.Empty), out var gatedType, out var gatedId))
                {
                    case Services.SeerrParentalFilter.TmdbAccess.Deny:
                        return ParentalBlockedResult();
                    case Services.SeerrParentalFilter.TmdbAccess.GateTitle:
                        if (await _parentalFilter.IsBlockedAsync(gatedType, gatedId, tmdbCallerId))
                        {
                            return ParentalBlockedResult();
                        }
                        break;
                }
                queryString = decodedQuery.Length > 0 ? new QueryString("?" + decodedQuery) : QueryString.Empty;
            }

            var httpClient = _httpClientFactory.CreateClient();
            var separator = queryString.HasValue ? "&" : "?";
            var requestUri = $"https://api.themoviedb.org/3/{apiPath}{queryString}{separator}api_key={config.TMDB_API_KEY}";

            try
            {
                var response = await httpClient.GetAsync(requestUri, HttpContext.RequestAborted);
                var content = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);

                if (response.IsSuccessStatusCode)
                {
                    return Content(content, "application/json");
                }

                return StatusCode((int)response.StatusCode, content);
            }
            catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
            {
                // Browser went away (navigated off, aborted a superseded fetch) -
                // expected under normal use, not a failure worth logging.
                return StatusCode(499);
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to proxy TMDB request for '{apiPath}{queryString}'. Error: {ex}");
                return StatusCode(500, "Failed to connect to TMDB.");
            }
        }
    }
}
