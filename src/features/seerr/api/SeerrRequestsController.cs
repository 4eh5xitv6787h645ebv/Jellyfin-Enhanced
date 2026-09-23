using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Newtonsoft.Json.Linq;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Microsoft.EntityFrameworkCore;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class SeerrRequestsController : SeerrProxyControllerBase
    {
        private readonly PendingSpoilerService _pendingSpoiler;

        public SeerrRequestsController(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            SeerrIdentityService seerrIdentity,
            SeerrStatusService seerrStatus,
            PendingSpoilerService pendingSpoiler,
            Services.SeerrParentalFilter parentalFilter) : base(userManager, httpClientFactory, logger, parentalFilter, seerrIdentity, seerrStatus)
        {
            _pendingSpoiler = pendingSpoiler;
        }

        [HttpPost("jellyseerr/request")]
        [Authorize]
        public async Task<IActionResult> JellyseerrRequest([FromBody] JsonElement requestBody)
        {
            var result = await ProxyJellyseerrRequest("/api/v1/request", HttpMethod.Post, requestBody.ToString());

            // Auto-on-request Spoiler Guard pending — best-effort, never blocks
            // the request. Gated by SpoilerBlurEnabled + SpoilerAutoEnableOnSeerrRequest.
            // Only a 2xx counts as user intent; 409 fails closed — its body is
            // ambiguous (MEDIA_EXISTS vs quota/permission denial) and SeerrHttpHelper
            // replaces it with a synthesized envelope anyway.
            try
            {
                var cfg = JellyfinEnhanced.Instance?.Configuration;
                if (cfg?.SpoilerBlurEnabled == true
                    && cfg?.SpoilerAutoEnableOnSeerrRequest == true
                    && IsSeerrRequestResultSuccessful(result))
                {
                    // Snapshot identity + body BEFORE Task.Run — HttpContext/User
                    // are invalid after we return; clone the request-scoped JsonElement.
                    var userId = UserHelper.GetCurrentUserId(User);
                    if (userId != null && userId != Guid.Empty)
                    {
                        var capturedUserId = userId.Value;
                        // Clone is detached (own document), safe to read off-thread.
                        JsonElement bodyClone;
                        try { bodyClone = requestBody.Clone(); }
                        catch { bodyClone = default; }

                        if (bodyClone.ValueKind == JsonValueKind.Object)
                        {
                            _ = Task.Run(() => TryAutoEnablePendingFromSeerrRequest(capturedUserId, bodyClone));
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"Spoiler Guard auto-on-request hook threw {ex.GetType().Name}: {ex.Message}");
            }

            return result;
        }

        // True only for a 2xx proxy result. 409 fails closed: it's an ambiguous
        // Seerr conflict (MEDIA_EXISTS vs quota/permission denial) whose body
        // SeerrHttpHelper has already replaced, so we can't distinguish — the
        // user can still toggle the modal manually. Null StatusCode counts as OK
        // only for ContentResult (the success path, defaults to 200); a null on
        // ObjectResult/StatusCodeResult is failure, guarding a future
        // Ok(errorEnvelope) misclassification.
        private static bool IsSeerrRequestResultSuccessful(IActionResult result)
        {
            int? status;
            bool allowNullAsOk = false;
            if (result is ContentResult cr)
            {
                status = cr.StatusCode;
                allowNullAsOk = true;
            }
            else if (result is ObjectResult or)
            {
                status = or.StatusCode;
            }
            else if (result is StatusCodeResult sr)
            {
                status = sr.StatusCode;
            }
            else
            {
                return false;
            }

            if (status is null)
            {
                if (!allowNullAsOk) return false;
                status = 200;
            }
            int sc = status.Value;
            return sc >= 200 && sc < 300;
        }

        // Off-thread continuation — must NOT touch HttpContext / User.
        // userId is captured by the caller before Task.Run was scheduled.
        private void TryAutoEnablePendingFromSeerrRequest(Guid userId, JsonElement requestBody)
        {
            try
            {
                if (requestBody.ValueKind != JsonValueKind.Object) return;
                if (!requestBody.TryGetProperty("mediaType", out var mtProp) || mtProp.ValueKind != JsonValueKind.String) return;
                if (!requestBody.TryGetProperty("mediaId", out var miProp)) return;

                var rawType = mtProp.GetString();
                if (string.IsNullOrEmpty(rawType)) return;
                var mediaType = rawType.ToLowerInvariant();
                if (mediaType != "tv" && mediaType != "movie") return;

                int tmdbInt;
                if (miProp.ValueKind == JsonValueKind.Number)
                {
                    if (!miProp.TryGetInt32(out tmdbInt) || tmdbInt <= 0) return;
                }
                else if (miProp.ValueKind == JsonValueKind.String)
                {
                    if (!int.TryParse(miProp.GetString(), System.Globalization.NumberStyles.Integer,
                                      System.Globalization.CultureInfo.InvariantCulture, out tmdbInt)
                        || tmdbInt <= 0) return;
                }
                else
                {
                    return;
                }

                var jUser = _userManager.GetUserById(userId);
                if (jUser == null) return;

                var canonicalTmdb = tmdbInt.ToString(System.Globalization.CultureInfo.InvariantCulture);
                var summary = _pendingSpoiler.AddSpoilerBlurPendingInternal(userId, jUser, mediaType, canonicalTmdb, displayName: null);
                if (summary.WroteSomething)
                {
                    _logger.Info($"Spoiler Guard auto-on-request {summary.Promoted} for {mediaType}:{canonicalTmdb} by {ResolveUserDisplay(userId.ToString("N"))}");
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"Spoiler Guard auto-on-request task threw {ex.GetType().Name}: {ex.Message}");
            }
        }

        [HttpGet("jellyseerr/request")]
        [Authorize]
        public Task<IActionResult> GetJellyseerrRequests([FromQuery] int take = 500, [FromQuery] int skip = 0, [FromQuery] string filter = "all")
        {
            return ProxyJellyseerrRequest($"/api/v1/request?take={take}&skip={skip}&filter={filter}", HttpMethod.Get);
        }

        // Returns the user's Seerr quota with a nextResetAt added per side.
        [HttpGet("jellyseerr/quota")]
        [Authorize]
        public async Task<IActionResult> GetJellyseerrQuota()
        {
            var jellyfinUserId = UserHelper.GetCurrentUserId(User)?.ToString() ?? "";
            var seerrUserId = await _seerrIdentity.GetJellyseerrUserId(jellyfinUserId);
            var quotaResult = await ProxyJellyseerrRequest($"/api/v1/user/{seerrUserId}/quota", HttpMethod.Get);

            // Reset-time enrichment is best-effort — fall back to the un-enriched
            // result on any failure (malformed body, Seerr admin shape, etc).
            if (quotaResult is ContentResult cr && cr.StatusCode is null or 200)
            {
                try
                {
                    var quota = JObject.Parse(cr.Content ?? "{}");
                    await EnrichQuotaWithResetAsync(quota, seerrUserId!, JellyfinEnhanced.Instance!.Configuration);
                    return Content(quota.ToString(Newtonsoft.Json.Formatting.None), "application/json");
                }
                catch (Exception ex)
                {
                    _logger.Warning($"Quota enrichment skipped ({ex.GetType().Name}): {ex.Message}");
                }
            }

            return quotaResult;
        }

        private async Task EnrichQuotaWithResetAsync(JObject quota, string seerrUserId, PluginConfiguration config)
        {
            // Parallel: independent HTTP calls, sequential would double worst-case latency.
            var movieTask = ComputeNextResetAsync(quota, "movie", seerrUserId, config);
            var tvTask = ComputeNextResetAsync(quota, "tv", seerrUserId, config);
            await Task.WhenAll(movieTask, tvTask);

            // Seerr admins / no-policy users return {"movie":null,"tv":null}; cast safely.
            if (movieTask.Result.HasValue && quota["movie"] is JObject mObj)
            {
                mObj["nextResetAt"] = movieTask.Result.Value.ToString("o");
            }
            if (tvTask.Result.HasValue && quota["tv"] is JObject tObj)
            {
                tObj["nextResetAt"] = tvTask.Result.Value.ToString("o");
            }
        }

        private async Task<DateTime?> ComputeNextResetAsync(JObject quota, string mediaType, string seerrUserId, PluginConfiguration config)
        {
            var side = quota[mediaType] as JObject;
            if (side == null) return null;

            int limit = side["limit"]?.Value<int?>() ?? 0;
            int used = side["used"]?.Value<int?>() ?? 0;
            int days = side["days"]?.Value<int?>() ?? 0;

            // limit=0 is unlimited; no requests means nothing to roll off.
            if (limit <= 0 || used <= 0 || days <= 0) return null;

            var urls = config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            httpClient.Timeout = TimeSpan.FromSeconds(8);

            // Iterate URLs for multi-instance failover, matching ProxyJellyseerrRequest.
            foreach (var rawUrl in urls)
            {
                var trimmedUrl = rawUrl.Trim().TrimEnd('/');
                try
                {
                    // sortDirection=asc returns oldest first; take=20 gives a margin for declined.
                    var requestUri = $"{trimmedUrl}/api/v1/request" +
                                     $"?take=20&skip=0&sortDirection=asc&requestedBy={seerrUserId}&mediaType={mediaType}";

                    using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get, requestUri, config.JellyseerrApiKey, seerrUserId);
                    using var response = await httpClient.SendAsync(request);
                    var (content, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri);
                    if (error != null)
                    {
                        _logger.Debug($"ComputeNextResetAsync({mediaType}) on {trimmedUrl} failed: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay}");
                        continue;
                    }

                    using var doc = JsonDocument.Parse(content!);
                    if (!doc.RootElement.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
                    {
                        continue;
                    }

                    // Quota excludes DECLINED (status==3), so we do too.
                    var windowStart = DateTime.UtcNow.AddDays(-days);
                    DateTime? oldestCreatedAt = null;
                    foreach (var req in results.EnumerateArray())
                    {
                        if (req.TryGetProperty("status", out var statusEl) &&
                            statusEl.ValueKind == JsonValueKind.Number &&
                            statusEl.GetInt32() == 3)
                        {
                            continue;
                        }

                        if (!req.TryGetProperty("createdAt", out var createdEl) ||
                            createdEl.ValueKind != JsonValueKind.String)
                        {
                            continue;
                        }

                        if (!DateTime.TryParse(createdEl.GetString(), null,
                            System.Globalization.DateTimeStyles.RoundtripKind, out var createdAt))
                        {
                            continue;
                        }

                        var createdAtUtc = createdAt.ToUniversalTime();
                        if (createdAtUtc < windowStart) continue;

                        if (oldestCreatedAt == null || createdAtUtc < oldestCreatedAt.Value)
                        {
                            oldestCreatedAt = createdAtUtc;
                        }
                    }

                    return oldestCreatedAt?.AddDays(days);
                }
                catch (Exception ex)
                {
                    _logger.Warning($"ComputeNextResetAsync({mediaType}) on {trimmedUrl} failed ({ex.GetType().Name}): {ex.Message}");
                }
            }

            return null;
        }

        [HttpPost("jellyseerr/request/tv/{tmdbId}/seasons")]
        [Authorize]
        public async Task<IActionResult> RequestTvSeasons(int tmdbId, [FromBody] JsonElement requestBody)
        {
            // enforce that the body's mediaType
            // is "tv" and the body's mediaId matches the route's tmdbId, so
            // logging/audit trails are consistent and a user with REQUEST_TV
            // (but not REQUEST_MOVIE) can't piggyback a movie request through
            // this route. Seerr would re-validate but JE's permission gate at
            // line ~620 only sees apiPath="/api/v1/request".
            if (tmdbId <= 0)
            {
                return BadRequest(new { error = true, code = "invalid_tmdb_id", message = "TMDB id must be positive." });
            }
            try
            {
                if (requestBody.TryGetProperty("mediaType", out var mtEl)
                    && mtEl.ValueKind == JsonValueKind.String
                    && !string.Equals(mtEl.GetString(), "tv", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new { error = true, code = "media_type_mismatch", message = "Body mediaType must be 'tv' on the seasons route." });
                }
                if (requestBody.TryGetProperty("mediaId", out var midEl) && midEl.ValueKind == JsonValueKind.Number)
                {
                    if (midEl.GetInt32() != tmdbId)
                    {
                        return BadRequest(new { error = true, code = "media_id_mismatch", message = "Body mediaId must match the {tmdbId} in the URL." });
                    }
                }
            }
            catch (InvalidOperationException)
            {
                // requestBody not a JSON object — let downstream Seerr return its own validation error.
            }
            return await ProxyJellyseerrRequest($"/api/v1/request", HttpMethod.Post, requestBody.ToString());
        }

        [HttpGet("jellyseerr/issue")]
        [Authorize]
        public Task<IActionResult> GetJellyseerrIssues(
            [FromQuery] int? mediaId,
            [FromQuery] int take = 20,
            [FromQuery] int skip = 0,
            [FromQuery] string? filter = "all",
            [FromQuery] string? sort = "added")
        {
            take = Math.Clamp(take, 1, 200);
            skip = Math.Max(0, skip);

            var queryParts = new List<string>
            {
                $"take={take}",
                $"skip={skip}"
            };

            if (mediaId.HasValue && mediaId.Value > 0)
            {
                queryParts.Add($"mediaId={mediaId.Value}");
            }

            if (!string.IsNullOrWhiteSpace(filter))
            {
                queryParts.Add($"filter={Uri.EscapeDataString(filter)}");
            }

            if (!string.IsNullOrWhiteSpace(sort))
            {
                queryParts.Add($"sort={Uri.EscapeDataString(sort)}");
            }

            var queryString = string.Join("&", queryParts);
            var apiPath = string.IsNullOrWhiteSpace(queryString) ? "/api/v1/issue" : $"/api/v1/issue?{queryString}";

            return ProxyJellyseerrRequest(apiPath, HttpMethod.Get);
        }

        [HttpGet("jellyseerr/issue/{id}")]
        [Authorize]
        public Task<IActionResult> GetJellyseerrIssueById(int id)
        {
            // V8-style guard. Seerr returns 500 for /issue/0 or /issue/-1.
            if (id <= 0)
            {
                return Task.FromResult<IActionResult>(BadRequest(new
                {
                    error = true,
                    code = "invalid_issue_id",
                    message = "Issue id must be positive."
                }));
            }
            return ProxyJellyseerrRequest($"/api/v1/issue/{id}", HttpMethod.Get);
        }

        [HttpPost("jellyseerr/issue")]
        [Authorize]
        public async Task<IActionResult> ReportJellyseerrIssue([FromBody] JsonElement issueBody)
        {
            return await ProxyJellyseerrRequest("/api/v1/issue", HttpMethod.Post, issueBody.ToString());
        }
    }
}
