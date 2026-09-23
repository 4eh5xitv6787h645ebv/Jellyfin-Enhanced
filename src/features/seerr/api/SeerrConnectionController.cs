using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Jellyseerr;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Jellyfin.Plugin.JellyfinEnhanced.Extensions;
using Microsoft.EntityFrameworkCore;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class SeerrConnectionController : UserControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;
        private readonly SeerrIdentityService _seerrIdentity;
        private readonly OutboundApiPolicy _outboundPolicy;

        private readonly SeerrStatusService _seerrStatus;

        public SeerrConnectionController(
            SeerrStatusService seerrStatus,
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            SeerrIdentityService seerrIdentity,
            OutboundApiPolicy outboundPolicy) : base(userManager)
        {
            _seerrStatus = seerrStatus;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _seerrIdentity = seerrIdentity;
            _outboundPolicy = outboundPolicy;
        }

        [HttpGet("jellyseerr/status")]
        [Authorize]
        public async Task<IActionResult> GetJellyseerrStatus()
        {
            return Ok(new { active = await _seerrStatus.IsReachableAsync() });
        }

        [HttpGet("jellyseerr/validate")]
        [Authorize]
        public async Task<IActionResult> ValidateJellyseerr([FromQuery] string url, [FromHeader(Name = "X-Arr-ApiKey")] string apiKey)
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(apiKey))
                return BadRequest(new { ok = false, message = "Missing url or apiKey" });

            if (!_outboundPolicy.IsAllowedUrl(url))
                return BadRequest(new { ok = false, message = "Invalid URL" });

            var http = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            http.Timeout = TimeSpan.FromSeconds(10);

            // Use the SeerrHttpHelper so the admin gets the same typed errors
            // (HtmlResponse / Cloudflare5xx / UpstreamRedirect / Unauthorized)
            // as runtime fetches — Round-3 found that the validate path
            // returned a generic "Status check failed" for HTML challenge
            // pages, which is the most-confusing first-setup error.
            var requestUri = $"{url.TrimEnd('/')}/api/v1/user";
            try
            {
                using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                    HttpMethod.Get, requestUri, apiKey);
                using var resp = await http.SendAsync(request);
                var (_, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(resp, requestUri);
                if (error == null) return Ok(new { ok = true });

                _logger.Warning($"Seerr validate failed for {url}: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");
                int httpCode = error.Code switch
                {
                    Helpers.Jellyseerr.SeerrErrorCode.HtmlResponse => 502,
                    Helpers.Jellyseerr.SeerrErrorCode.UpstreamRedirect => 502,
                    Helpers.Jellyseerr.SeerrErrorCode.Cloudflare5xx => 502,
                    _ => error.HttpStatus > 0 ? error.HttpStatus : 502,
                };
                return StatusCode(httpCode, new
                {
                    ok = false,
                    code = error.Code.ToString(),
                    cfRay = error.CfRay,
                    message = error.Message
                });
            }
            catch (Exception ex)
            {
                _logger.Warning($"Seerr validate failed for {url}: {ex.Message}");
                return StatusCode(502, new
                {
                    ok = false,
                    code = "Unreachable",
                    message = $"Unable to reach Jellyseerr at {url}: {ex.Message}"
                });
            }
        }

        // Manually trigger Seerr's recently-added library scan against a single URL.
        // Used by the admin "Trigger scan now" button so the test runs against the
        // values currently in the form (which may not be saved yet), exactly like
        // the validate endpoint above.
        [HttpPost("jellyseerr/trigger-recently-added-scan")]
        [Authorize]
        public async Task<IActionResult> TriggerJellyseerrRecentlyAddedScan([FromQuery] string url, [FromHeader(Name = "X-Arr-ApiKey")] string apiKey)
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(apiKey))
                return BadRequest(new { ok = false, message = "Missing url or apiKey" });

            if (!_outboundPolicy.IsAllowedUrl(url))
                return BadRequest(new { ok = false, message = "Invalid URL" });

            var http = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            http.Timeout = TimeSpan.FromSeconds(15);

            // route via SeerrHttpHelper so a Cloudflare/forward-auth
            // 200+HTML response no longer falsely reports `ok=true` to admins.
            var requestUri = $"{url.TrimEnd('/')}/api/v1/settings/jobs/jellyfin-recently-added-scan/run";
            try
            {
                using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                    HttpMethod.Post, requestUri, apiKey, bodyJson: "{}");
                using var resp = await http.SendAsync(request);
                var (_, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(resp, requestUri);
                if (error == null)
                {
                    _logger.Info($"[SeerrScan] Manually triggered Seerr recently-added scan via admin button — {url}");
                    return Ok(new { ok = true });
                }

                _logger.Warning($"[SeerrScan] Manual trigger failed for {url}: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");
                int httpCode = error.Code switch
                {
                    Helpers.Jellyseerr.SeerrErrorCode.HtmlResponse => 502,
                    Helpers.Jellyseerr.SeerrErrorCode.UpstreamRedirect => 502,
                    Helpers.Jellyseerr.SeerrErrorCode.Cloudflare5xx => 502,
                    _ => error.HttpStatus > 0 ? error.HttpStatus : 502,
                };
                return StatusCode(httpCode, new
                {
                    ok = false,
                    code = error.Code.ToString(),
                    cfRay = error.CfRay,
                    message = error.Message
                });
            }
            catch (Exception ex)
            {
                _logger.Warning($"[SeerrScan] Manual trigger threw for {url}: {ex.Message}");
                return StatusCode(502, new
                {
                    ok = false,
                    code = "Unreachable",
                    message = $"Unable to reach Seerr: {ex.Message}"
                });
            }
        }

        [HttpGet("jellyseerr/user-status")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        [Authorize]
        public async Task<IActionResult> GetJellyseerrUserStatus()
        {
            // report a typed `reason` so the frontend can display
            // a meaningful banner instead of silently hiding discovery sections.
            // Possible reasons: disabled, no_user, blocked, unlinked, unreachable.
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled ||
                string.IsNullOrEmpty(config.JellyseerrApiKey) ||
                string.IsNullOrEmpty(config.JellyseerrUrls))
            {
                return Ok(new { active = false, userFound = false, reason = "disabled" });
            }

            var jellyfinUserId = UserHelper.GetCurrentUserId(User)?.ToString();
            if (string.IsNullOrEmpty(jellyfinUserId))
                return Ok(new { active = false, userFound = false, reason = "no_user" });

            if (SeerrIdentityService.IsJellyseerrImportBlocked(jellyfinUserId, config))
            {
                return Ok(new { active = true, userFound = false, reason = "blocked" });
            }

            // GetSeerrUserId uses the user ID cache (30-min TTL).
            // A successful user lookup implicitly proves Seerr is reachable.
            var jellyseerrUserId = await _seerrIdentity.GetJellyseerrUserId(jellyfinUserId);
            if (!string.IsNullOrEmpty(jellyseerrUserId))
            {
                return Ok(new { active = true, userFound = true, jellyseerrUserId = jellyseerrUserId, reason = "linked" });
            }

            // User not found — could be server unreachable, HTML challenge from
            // proxy, or user genuinely not linked. Probe /status to distinguish
            // "unreachable" from "unlinked".
            var statusResult = await GetJellyseerrStatus() as OkObjectResult;
            bool active = false;
            if (statusResult?.Value is not null)
            {
                var json = System.Text.Json.JsonSerializer.Serialize(statusResult.Value);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("active", out var a))
                    active = a.GetBoolean();
            }
            return Ok(new
            {
                active,
                userFound = false,
                reason = active ? "unlinked" : "unreachable"
            });
        }

        [HttpGet("jellyseerr/permission-audit")]
        [Authorize]
        public async Task<IActionResult> GetPermissionAudit()
        {
            if (!IsAdminUser()) return Forbid();

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled ||
                string.IsNullOrEmpty(config.JellyseerrApiKey) ||
                string.IsNullOrEmpty(config.JellyseerrUrls))
                return StatusCode(503, "Seerr integration is not configured or enabled.");

            var jellyfinUsers = _userManager.GetAllUsers()
                .GroupBy(u => u.Id)
                .Select(g => g.First())
                .ToList();
            var results = new List<object>();

            foreach (var jfUser in jellyfinUsers)
            {
                var userId = jfUser.Id.ToString("N");
                // allowAutoImport: false — audit must be read-only and must not
                // create Seerr users as a side effect.
                var seerrUser = await _seerrIdentity.GetJellyseerrUser(userId, bypassCache: true, allowAutoImport: false);

                if (seerrUser == null)
                {
                    // Null has 5 distinct causes: user genuinely unlinked, blocked
                    // by JE config, every Seerr URL HTTP-failed, every URL threw,
                    // or JSON shape mismatch. The UI renders them all as "Not
                    // linked", which misleads admins during transient Seerr
                    // outages. Leave a breadcrumb in the server log so the cause
                    // can be correlated with the preceding WARN/ERROR lines
                    // that _seerrIdentity.GetJellyseerrUser already emits.
                    _logger.Info($"[audit] user {jfUser.Username} ({userId}): GetJellyseerrUser returned null — see preceding log lines for cause");
                    results.Add(new
                    {
                        jellyfinUsername = jfUser.Username,
                        jellyfinUserId   = userId,
                        linked           = false,
                        permissions      = (int?)null,
                        issues           = new[] { "Not linked to a Seerr account" }
                    });
                    continue;
                }

                var perms = seerrUser.Permissions;
                bool isAdmin = JellyseerrPermissionHelper.HasPermission(perms, JellyseerrPermission.ADMIN);

                // Admins inherit all permissions — nothing to flag
                if (isAdmin)
                {
                    results.Add(new
                    {
                        jellyfinUsername = jfUser.Username,
                        jellyfinUserId   = userId,
                        linked           = true,
                        permissions      = (int)perms,
                        issues           = Array.Empty<string>()
                    });
                    continue;
                }

                var issues = new List<string>();

                // Search & request
                if (!JellyseerrPermissionHelper.HasAnyPermission(perms,
                    JellyseerrPermission.REQUEST | JellyseerrPermission.REQUEST_MOVIE | JellyseerrPermission.REQUEST_TV))
                    issues.Add("Cannot make requests (missing REQUEST / REQUEST_MOVIE / REQUEST_TV)");

                // 4K movie requests (only relevant if plugin has 4K enabled)
                if (config.JellyseerrEnable4KRequests &&
                    !JellyseerrPermissionHelper.HasAnyPermission(perms,
                        JellyseerrPermission.REQUEST_4K | JellyseerrPermission.REQUEST_4K_MOVIE))
                    issues.Add("Cannot request 4K movies (missing REQUEST_4K / REQUEST_4K_MOVIE)");

                // 4K TV requests
                if (config.JellyseerrEnable4KTvRequests &&
                    !JellyseerrPermissionHelper.HasAnyPermission(perms,
                        JellyseerrPermission.REQUEST_4K | JellyseerrPermission.REQUEST_4K_TV))
                    issues.Add("Cannot request 4K TV (missing REQUEST_4K / REQUEST_4K_TV)");

                // Advanced request options — only relevant if user can already make requests
                if (config.JellyseerrShowAdvanced)
                {
                    bool canRequest = JellyseerrPermissionHelper.HasAnyPermission(perms,
                        JellyseerrPermission.REQUEST | JellyseerrPermission.REQUEST_MOVIE | JellyseerrPermission.REQUEST_TV);
                    if (canRequest && !JellyseerrPermissionHelper.HasPermission(perms, JellyseerrPermission.REQUEST_ADVANCED))
                        issues.Add("Cannot use advanced request options (missing REQUEST_ADVANCED)");
                }

                // Requests page / view — without REQUEST_VIEW they only see their own requests
                if (config.DownloadsPageEnabled &&
                    !JellyseerrPermissionHelper.HasAnyPermission(perms,
                        JellyseerrPermission.REQUEST_VIEW | JellyseerrPermission.MANAGE_REQUESTS))
                    issues.Add("Can only see own requests on Requests page (missing REQUEST_VIEW / MANAGE_REQUESTS) (Can be ignored if on purpose)");

                // Report issues — MANAGE_ISSUES implies CREATE_ISSUES
                if (config.JellyseerrShowReportButton &&
                    !JellyseerrPermissionHelper.HasAnyPermission(perms,
                        JellyseerrPermission.CREATE_ISSUES | JellyseerrPermission.MANAGE_ISSUES))
                    issues.Add("Cannot report issues (missing CREATE_ISSUES or MANAGE_ISSUES)");

                // View issues indicator — MANAGE_ISSUES implies VIEW_ISSUES
                if (config.JellyseerrShowIssueIndicator &&
                    !JellyseerrPermissionHelper.HasAnyPermission(perms,
                        JellyseerrPermission.VIEW_ISSUES | JellyseerrPermission.MANAGE_ISSUES))
                    issues.Add("Cannot view issues from others or count indicator (missing VIEW_ISSUES or MANAGE_ISSUES)");


                results.Add(new
                {
                    jellyfinUsername = jfUser.Username,
                    jellyfinUserId   = userId,
                    linked           = true,
                    permissions      = (int)perms,
                    issues
                });
            }

            return Ok(results);
        }

        // Admin-only: proxies Seerr's own Radarr/Sonarr instance CRUD settings
        // (hostname, port, apiKey, useSsl, baseUrl, ...), NOT the read-only
        // /service/{sonarr,radarr} discovery endpoints above. Seerr's
        // /settings subrouter requires a Seerr Administrator key, and the
        // response includes each instance's real API key, so this stays
        // behind IsAdminUser() regardless of [Authorize] alone. Backs the
        // "Import from Seerr" button on the *arr config tab.
        [HttpGet("jellyseerr/settings/{type}")]
        [Authorize]
        public async Task<IActionResult> GetJellyseerrArrSettings(string type)
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            if (type != "radarr" && type != "sonarr")
            {
                return BadRequest(new { error = "Invalid type. Must be 'radarr' or 'sonarr'." });
            }

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                return StatusCode(503, new { error = "Seerr integration is not configured or enabled." });
            }

            var jellyseerrUrl = config.JellyseerrUrls
                .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .FirstOrDefault()?.Trim();
            if (string.IsNullOrEmpty(jellyseerrUrl))
            {
                return StatusCode(503, new { error = "No valid Seerr URL configured." });
            }

            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            var requestUri = $"{jellyseerrUrl.TrimEnd('/')}/api/v1/settings/{type}";
            using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(HttpMethod.Get, requestUri, config.JellyseerrApiKey);
            using var response = await httpClient.SendAsync(request);
            var (json, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri);

            if (error != null)
            {
                _logger.Warning($"[Seerr Arr Settings Import] Failed to fetch {type} settings from Seerr: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay} {error.Message}");
                // Seerr's /settings subrouter 403s a non-admin key, which is
                // by far the most common failure here, worth its own message
                // rather than the generic "could not reach Seerr" one.
                if (error.HttpStatus == 403)
                {
                    return StatusCode(403, new { error = "Seerr rejected this request. The configured Seerr API key needs Administrator permission to read Radarr/Sonarr settings." });
                }
                return StatusCode(error.HttpStatus > 0 ? error.HttpStatus : 502, error.ToResponseShape());
            }

            // Pass through Seerr's own array shape unmodified; the frontend
            // reads the fields it needs (name, hostname, port, apiKey,
            // useSsl, baseUrl, is4k) rather than us re-serializing here.
            return Content(json ?? "[]", "application/json");
        }

        [HttpGet("jellyseerr/settings/partial-requests")]
        [Authorize]
        public async Task<IActionResult> GetJellyseerrPartialRequestsSetting()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                // previously returned 200+false, which made the
                // frontend silently flip the request modal to whole-season
                // mode. Returns 503 with structured `code` so the frontend
                // can keep its last-known state instead of regressing.
                _logger.Warning("Seerr integration is not configured or enabled.");
                return StatusCode(503, new { error = true, code = "disabled", message = "Seerr integration not configured." });
            }

            var urls = config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);

            foreach (var url in urls)
            {
                var trimmedUrl = url.Trim();
                try
                {
                    var requestUri = $"{trimmedUrl.TrimEnd('/')}/api/v1/settings/main";
                    _logger.Info($"Fetching Seerr partial requests setting from: {requestUri}");

                    using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get, requestUri, config.JellyseerrApiKey);
                    using var response = await httpClient.SendAsync(request);
                    var (responseContent, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri);

                    if (error == null && responseContent != null)
                    {
                        using var settings = JsonDocument.Parse(responseContent);
                        var partialRequestsEnabled = false;
                        if (settings.RootElement.TryGetProperty("partialRequestsEnabled", out var prop))
                        {
                            partialRequestsEnabled = prop.GetBoolean();
                        }

                        var enableSpecialEpisodes = false;
                        if (settings.RootElement.TryGetProperty("enableSpecialEpisodes", out var specialProp))
                        {
                            enableSpecialEpisodes = specialProp.GetBoolean();
                        }

                        _logger.Info($"Seerr settings — partialRequests: {partialRequestsEnabled}, specialEpisodes: {enableSpecialEpisodes}");
                        return Ok(new { partialRequestsEnabled, enableSpecialEpisodes });
                    }

                    _logger.Warning($"Failed to fetch Seerr settings from {trimmedUrl}: code={error!.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");
                }
                catch (Exception ex)
                {
                    _logger.Error($"Failed to connect to Seerr URL: {trimmedUrl}. Error: {ex.Message}");
                }
            }

            // don't silently default to false on outage — that
            // hides admin-configured "partial requests off" UX state. Return
            // 503 so the frontend can keep last-known state.
            _logger.Warning("Could not fetch Seerr settings from any URL — surfacing as 503 unreachable");
            return StatusCode(503, new
            {
                error = true,
                code = "unreachable",
                message = "Could not reach Seerr to read partial-requests setting."
            });
        }
    }
}
