using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Http;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Jellyseerr;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Microsoft.EntityFrameworkCore;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Api.SeerrCacheState;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    public abstract class SeerrProxyControllerBase : UserControllerBase
    {
        protected readonly IHttpClientFactory _httpClientFactory;
        protected readonly Logger _logger;
        protected readonly Services.SeerrParentalFilter _parentalFilter;
        protected readonly SeerrIdentityService _seerrIdentity;
        private readonly SeerrStatusService _seerrStatus;

        protected SeerrProxyControllerBase(IUserManager userManager, IHttpClientFactory httpClientFactory, Logger logger, Services.SeerrParentalFilter parentalFilter, SeerrIdentityService seerrIdentity, SeerrStatusService seerrStatus) : base(userManager)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _parentalFilter = parentalFilter;
            _seerrIdentity = seerrIdentity;
            _seerrStatus = seerrStatus;
        }

        private static TimeSpan GetResponseCacheTtl()
        {
            var minutes = JellyfinEnhanced.Instance?.Configuration?.JellyseerrResponseCacheTtlMinutes ?? 10;
            return TimeSpan.FromMinutes(Math.Max(1, minutes));
        }

        private static bool IsCacheableApiPath(string apiPath, HttpMethod method)
        {
            if (method != HttpMethod.Get) return false;

            // /discover/watchlist is mutable per-user state. Caching
            // it for 10 min would mean: user adds movie → next watchlist GET
            // still returns the old payload until TTL expires. /api/v1/issue
            // is also mutable (status changes on assignment / resolution).
            // tightened to /api/v1/issue prefix to avoid
            // accidentally matching future endpoints with "issue" in the name.
            if (apiPath.Contains("/discover/watchlist", StringComparison.OrdinalIgnoreCase)) return false;
            if (apiPath.StartsWith("/api/v1/issue", StringComparison.OrdinalIgnoreCase)) return false;

            // include /search/keyword (typeahead spam) and item-detail
            // endpoints (movie/tv/season — fetched repeatedly by more-info-modal).
            return apiPath.Contains("/discover/") ||
                   apiPath.Contains("/genre") ||
                   apiPath.Contains("/similar") ||
                   apiPath.Contains("/recommendations") ||
                   apiPath.Contains("/person/") ||
                   apiPath.Contains("/collection/") ||
                   apiPath.Contains("/keyword") ||
                   apiPath.Contains("/search") ||
                   apiPath.StartsWith("/api/v1/movie/", StringComparison.OrdinalIgnoreCase) ||
                   apiPath.StartsWith("/api/v1/tv/", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsPublicScopeApiPath(string apiPath)
        {
            // Genre slider, network/studio/keyword discovery — pure TMDB
            // metadata, identical across users.
            if (apiPath.Contains("/discover/genreslider/", StringComparison.OrdinalIgnoreCase)) return true;
            // Query-string-form discovery (the shape JE actually emits).
            // Discovery responses include media.requests/requestedBy etc.
            // BUT the proxy uses X-Api-User header to filter requestedBy
            // server-side, so the body is per-user — except for very simple
            // shapes (no requestedBy filter, no language). Keep these
            // per-user to be safe; only the truly content-only TMDB sliders
            // and direct genre/keyword/person lookups are shared.
            if (apiPath.StartsWith("/api/v1/genres/", StringComparison.OrdinalIgnoreCase)) return true;
            if (apiPath.StartsWith("/api/v1/person/", StringComparison.OrdinalIgnoreCase)) return true;
            if (apiPath.StartsWith("/api/v1/keyword", StringComparison.OrdinalIgnoreCase)) return true;
            // For discover/movies?genre=X and discover/tv?genre=X paths
            // (query-string discovery), the response includes mediaInfo
            // for items the user has watched. Keep per-user.
            // Per-user response includes mediaInfo.requestedBy filtered to
            // the calling user's perspective and 4K availability based on
            // user permission, so KEEP per-user for movie/{id}, tv/{id},
            // collection/{id}, similar/recommendations, search, and
            // /discover/* with any filter.
            return false;
        }

        private static void EvictMovieTvCacheForRequest(string body)
        {
            if (string.IsNullOrEmpty(body)) return;
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (!doc.RootElement.TryGetProperty("mediaId", out var mediaIdEl)) return;
                if (!doc.RootElement.TryGetProperty("mediaType", out var mediaTypeEl)) return;
                var mediaId = mediaIdEl.GetInt32();
                var mediaType = mediaTypeEl.GetString();
                if (mediaType != "movie" && mediaType != "tv") return;
                // The cache key shape is `{userId}:{apiPath}`. We want to match
                // EITHER the bare detail (apiPath ends with `/api/v1/movie/12`)
                // OR a sub-path (apiPath starts with `/api/v1/movie/12/` —
                // for `/similar`, `/recommendations`, `/season/1`, etc).
                var bareSuffix = $":/api/v1/{mediaType}/{mediaId}";
                var subPathInfix = $":/api/v1/{mediaType}/{mediaId}/";
                lock (_responseCacheLock)
                {
                    var keys = _responseCache.Keys
                        .Where(k =>
                            k.EndsWith(bareSuffix, StringComparison.Ordinal)
                            || k.Contains(subPathInfix, StringComparison.Ordinal))
                        .ToList();
                    foreach (var k in keys) _responseCache.Remove(k);
                }
            }
            catch { /* best-effort eviction */ }
        }

        /// <summary>
        /// Runs the caller's parental-rating limit over a proxied Seerr body:
        /// list responses come back filtered, blocked detail/sub-resource
        /// responses become 403. Unrestricted users pass through untouched.
        /// </summary>
        private async Task<IActionResult> ApplyParentalFilterAsync(string json, string apiPath, string jellyfinUserId)
        {
            try
            {
                var result = await _parentalFilter.ApplyAsync(json, apiPath, jellyfinUserId, HttpContext.RequestAborted);
                if (result.Block) return ParentalBlockedResult();
                if (result.RetryLater)
                {
                    // Titles on this page are still being verified (the lookups keep
                    // running server-side): a retryable status makes the client
                    // re-fetch the page instead of showing the unverified rows as gone.
                    Response.Headers["Retry-After"] = "2";
                    return StatusCode(504, new { error = true, code = "parental_pending", message = "Parental rating lookups for this page are still running; retry shortly." });
                }
                return Content(result.Body, "application/json");
            }
            catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
            {
                return StatusCode(499); // browser went away (also reachable from the response-cache path)
            }
        }

        private async Task<bool> IsRequestBodyParentalBlockedAsync(string body, string jellyfinUserId)
        {
            // Unrestricted users: nothing to check, whatever the body looks like.
            if (!_parentalFilter.TryGetRestrictedPolicy(jellyfinUserId, out _)) return false;

            // Restricted users: a body we cannot identify as an allowed movie/tv
            // title is refused (fail closed), including string ids like "550".
            try
            {
                using var doc = JsonDocument.Parse(body);
                var rootEl = doc.RootElement;
                if (rootEl.ValueKind != JsonValueKind.Object || !rootEl.TryGetProperty("mediaId", out var idEl)) return true;
                int mediaId;
                if (idEl.ValueKind == JsonValueKind.Number)
                {
                    if (!idEl.TryGetInt32(out mediaId)) return true;
                }
                else if (idEl.ValueKind != JsonValueKind.String || !int.TryParse(idEl.GetString(), System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out mediaId))
                {
                    return true;
                }
                var mediaType = rootEl.TryGetProperty("mediaType", out var mtEl) && mtEl.ValueKind == JsonValueKind.String ? mtEl.GetString() : null;
                if (mediaType != "movie" && mediaType != "tv") return true;
                return mediaId <= 0 || await _parentalFilter.IsBlockedAsync(mediaType, mediaId, jellyfinUserId);
            }
            catch (JsonException)
            {
                return true;
            }
        }

        protected async Task<IActionResult> ProxyJellyseerrRequest(string apiPath, HttpMethod method, string? content = null)
        {
            // Propagate client disconnects (superseded search queries, page
            // navigations) to the upstream Seerr/TMDB call so we stop doing
            // work nobody will read. Only GETs are cancellable: POSTs (requests,
            // issues) must run to completion even if the browser goes away.
            var ct = method == HttpMethod.Get ? HttpContext.RequestAborted : CancellationToken.None;

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                _logger.Warning("Seerr integration is not configured or enabled.");
                return StatusCode(503, "Seerr integration is not configured or enabled.");
            }

            // Resolve user ID from authenticated principal (not caller-controlled headers)
            var jellyfinUserId = UserHelper.GetCurrentUserId(User)?.ToString();
            if (string.IsNullOrEmpty(jellyfinUserId))
            {
                _logger.Warning("Could not resolve Jellyfin user ID from the authenticated principal.");
                return Forbid();
            }

            // resolve the Seerr user ONCE up-front and reuse for
            // both ID-extraction and the non-admin permission check below.
            // Previously made TWO calls (and TWO Seerr round-trips when
            // JellyseerrDisableCache=true), doubling load on debugging admins.
            var seerrUser = await _seerrIdentity.GetJellyseerrUser(jellyfinUserId);
            var jellyseerrUserId = seerrUser?.Id.ToString();
            if (string.IsNullOrEmpty(jellyseerrUserId))
            {
                _logger.Warning($"Could not find a Jellyseerr user for Jellyfin user {ResolveUserDisplay(jellyfinUserId)}. Aborting request.");
                // When _seerrIdentity.GetJellyseerrUserId returns null because every Seerr URL
                // is returning a Cloudflare/proxy HTML challenge, the generic
                // "user not linked" message misleads the admin. Do one quick
                // reachability probe so the frontend gets a structured reason
                // it can render in a banner, matching /jellyseerr/user-status.
                // The probe is cached so a Seerr outage doesn't fan out N
                // status probes from the negative-user-cache window.
                bool reachable = await _seerrStatus.IsReachableCachedAsync();

                if (!reachable)
                {
                    // Admins get a pointer to the JE log (which carries the
                    // full code=Cloudflare5xx status=. cf-ray=. line);
                    // non-admins get plain copy.
                    var unreachableMsg = IsAdminUser()
                        ? "Can't reach Seerr. Check the JE log for cf-ray / Content-Type / status details."
                        : "Can't reach Seerr right now. Please try again in a moment.";
                    return StatusCode(502, new
                    {
                        error = true,
                        code = "unreachable",
                        message = unreachableMsg
                    });
                }
                if (SeerrIdentityService.IsJellyseerrImportBlocked(jellyfinUserId, JellyfinEnhanced.Instance?.Configuration ?? new Configuration.PluginConfiguration()))
                {
                    return StatusCode(403, new
                    {
                        error = true,
                        code = "blocked",
                        message = "Your administrator has disabled Seerr for your account."
                    });
                }
                return NotFound(new
                {
                    error = true,
                    code = "unlinked",
                    message = "Current Jellyfin user is not linked to a Jellyseerr user."
                });
            }

            // Enforce Seerr permissions for write operations and sensitive reads.
            // Jellyfin admins bypass all permission checks (they can do anything in Seerr).
            // For non-admins, validate before proxying so we return a clear 403 rather than
            // letting Seerr reject the request with a generic error.
            if (!IsAdminUser())
            {
                // reuse the Seerr user we already resolved at
                // line ~647 — no second _seerrIdentity.GetJellyseerrUser call.
                if (seerrUser != null)
                {
                    var perms = seerrUser.Permissions;
                    bool isSeerrAdmin = JellyseerrPermissionHelper.HasPermission(perms, JellyseerrPermission.ADMIN);

                    if (!isSeerrAdmin)
                    {
                        // POST /api/v1/request — make a request
                        if (method == HttpMethod.Post && apiPath.StartsWith("/api/v1/request", StringComparison.OrdinalIgnoreCase))
                        {
                            if (!JellyseerrPermissionHelper.HasAnyPermission(perms,
                                JellyseerrPermission.REQUEST | JellyseerrPermission.REQUEST_MOVIE | JellyseerrPermission.REQUEST_TV))
                                return StatusCode(403, new { code = "no_request_permission", message = "You do not have permission to make requests in Seerr." });
                        }

                        // POST /api/v1/issue — report an issue
                        if (method == HttpMethod.Post && apiPath.StartsWith("/api/v1/issue", StringComparison.OrdinalIgnoreCase))
                        {
                            if (!JellyseerrPermissionHelper.HasAnyPermission(perms,
                                JellyseerrPermission.CREATE_ISSUES | JellyseerrPermission.MANAGE_ISSUES))
                                return StatusCode(403, new { code = "no_issue_permission", message = "You do not have permission to report issues in Seerr." });
                        }

                        // GET /api/v1/issue — view issues list (any of: ?query, exact, /id)
                        // The /api/v1/issue/{id} path was previously not gated by this
                        // check.— non-admin without VIEW_ISSUES could
                        // fetch any issue by id by guessing.
                        if (method == HttpMethod.Get && (apiPath.StartsWith("/api/v1/issue?", StringComparison.OrdinalIgnoreCase)
                            || apiPath.StartsWith("/api/v1/issue/", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(apiPath, "/api/v1/issue", StringComparison.OrdinalIgnoreCase)))
                        {
                            if (!JellyseerrPermissionHelper.HasAnyPermission(perms,
                                JellyseerrPermission.VIEW_ISSUES | JellyseerrPermission.MANAGE_ISSUES))
                                return StatusCode(403, new { code = "no_issue_view_permission", message = "You do not have permission to view issues in Seerr." });
                        }

                        // GET /api/v1/service/sonarr|radarr, /api/v1/service/{type}/{id},
                        // /api/v1/overrideRule, Seerr does not gate this route
                        // behind REQUEST_ADVANCED, so require just the ability to request.
                        if (method == HttpMethod.Get && (
                            apiPath.StartsWith("/api/v1/service/", StringComparison.OrdinalIgnoreCase)
                            || apiPath.StartsWith("/api/v1/overrideRule", StringComparison.OrdinalIgnoreCase)))
                        {
                            if (!JellyseerrPermissionHelper.HasAnyPermission(perms,
                                JellyseerrPermission.REQUEST | JellyseerrPermission.REQUEST_MOVIE | JellyseerrPermission.REQUEST_TV
                                | JellyseerrPermission.REQUEST_ADVANCED | JellyseerrPermission.MANAGE_REQUESTS))
                                return StatusCode(403, new { code = "no_request_permission", message = "You do not have permission to make requests in Seerr." });
                        }
                    }
                }
            }

            // Check server-side response cache for cacheable endpoints.
            // bifurcate cache key. Public discovery
            // endpoints return identical content for all users, so include the
            // user-id in the key only for endpoints whose response actually
            // varies per-user (mediaInfo.requests, watchlist, partial-requests
            // setting, requested-by-me filters, etc).
            bool isCacheable = IsCacheableApiPath(apiPath, method) && !config.JellyseerrDisableCache;
            bool isPublicScope = IsPublicScopeApiPath(apiPath);
            var cacheKey = isPublicScope
                ? $"public:{apiPath}"
                : $"{jellyfinUserId}:{apiPath}";
            // Parental ratings (#581): a restricted user may not request a title
            // above their limit, whichever surface the request came from.
            if (method == HttpMethod.Post
                && apiPath.StartsWith("/api/v1/request", StringComparison.OrdinalIgnoreCase)
                && content != null
                && await IsRequestBodyParentalBlockedAsync(content, jellyfinUserId))
            {
                return ParentalBlockedResult();
            }

            if (isCacheable)
            {
                string? cachedContent = null;
                lock (_responseCacheLock)
                {
                    if (_responseCache.TryGetValue(cacheKey, out var cached) &&
                        DateTime.UtcNow - cached.CachedAt < GetResponseCacheTtl())
                    {
                        cachedContent = cached.Content;
                    }
                }
                if (cachedContent != null)
                {
                    return await ApplyParentalFilterAsync(cachedContent, apiPath, jellyfinUserId);
                }
            }

            var urls = config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            httpClient.Timeout = TimeSpan.FromSeconds(15);

            int lastStatusCode = 502;
            object lastErrorBody = new { error = true, code = "unreachable", message = "Can't reach Seerr right now. Please try again in a moment." };

            foreach (var url in urls)
            {
                var trimmedUrl = url.Trim();
                var requestUri = $"{trimmedUrl.TrimEnd('/')}{apiPath}";
                // High-frequency endpoints that don't need a per-call INFO line.
                // also covers /search/keyword (typeahead) and item-
                // detail endpoints (movie/tv/season) which more-info-modal hits
                // repeatedly.
                bool isQuietEndpoint = apiPath.Contains("/similar")
                    || apiPath.Contains("/recommendations")
                    || apiPath.Contains("/discover/")
                    || apiPath.Contains("/search")
                    || apiPath.Contains("/genre")
                    || apiPath.Contains("/keyword")
                    || apiPath.StartsWith("/api/v1/movie/", StringComparison.OrdinalIgnoreCase)
                    || apiPath.StartsWith("/api/v1/tv/", StringComparison.OrdinalIgnoreCase)
                    || apiPath.StartsWith("/api/v1/person/", StringComparison.OrdinalIgnoreCase);
                bool isIssuePolling = apiPath.Contains("/issue?");

                if (!isQuietEndpoint)
                {
                    var userDisplay = ResolveUserDisplay(jellyfinUserId);
                    if (isIssuePolling)
                        LogPollingRequest(userDisplay, requestUri, $"{jellyfinUserId}:{apiPath}");
                    else
                        _logger.Info($"Proxying Seerr request for user {userDisplay} to: {requestUri}");
                }

                try
                {
                    string? json = null;
                    Helpers.Jellyseerr.SeerrError? error = null;
                    // Seerr answers 5xx when its own TMDB call fails, which happens in
                    // bursts (a cold page fires several TMDB calls at once) and clears
                    // within a second. Retry idempotent GETs a couple of times before
                    // reporting the failure, so a page's first load doesn't come up empty.
                    var attempts = method == HttpMethod.Get ? 3 : 1;
                    for (var attempt = 1; attempt <= attempts; attempt++)
                    {
                        using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                            method, requestUri, config.JellyseerrApiKey, jellyseerrUserId, content);
                        if (content != null && attempt == 1) _logger.Debug($"Request body: {content}");

                        using var response = await httpClient.SendAsync(request, ct);
                        (json, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri, ct);
                        var transient = error != null && error.HttpStatus >= 500 && error.HttpStatus <= 599
                            && error.Code != Helpers.Jellyseerr.SeerrErrorCode.HtmlResponse
                            && error.Code != Helpers.Jellyseerr.SeerrErrorCode.Cloudflare5xx;
                        if (!transient || attempt == attempts) break;
                        _logger.Debug($"Seerr returned {error!.HttpStatus} for {apiPath}; retrying ({attempt}/{attempts - 1})");
                        await Task.Delay(TimeSpan.FromMilliseconds(400 * attempt), ct);
                    }

                    if (error == null && json != null)
                    {
                        // Cache only verified-JSON 2xx responses. The Content-Type
                        // guard inside ReadResponseAsync prevents HTML challenge
                        // pages from being cached as JSON for 10 min.
                        if (isCacheable)
                        {
                            lock (_responseCacheLock)
                            {
                                _responseCache[cacheKey] = (json, DateTime.UtcNow);

                                if (_responseCache.Count > 200 || _responseCache.Count % 50 == 0)
                                {
                                    var staleKeys = _responseCache
                                        .Where(kv => DateTime.UtcNow - kv.Value.CachedAt > GetResponseCacheTtl())
                                        .Select(kv => kv.Key)
                                        .ToList();
                                    foreach (var key in staleKeys)
                                        _responseCache.Remove(key);
                                }
                            }
                        }
                        // a successful POST /api/v1/request changes
                        // mediaInfo.requests on the corresponding /movie/{id}
                        // or /tv/{id} response. Evict cached detail entries
                        // for that media so the next modal open shows fresh
                        // state ("Pending" instead of "Request").
                        if (method == HttpMethod.Post
                            && apiPath.StartsWith("/api/v1/request", StringComparison.OrdinalIgnoreCase)
                            && content != null)
                        {
                            EvictMovieTvCacheForRequest(content);
                        }
                        return method == HttpMethod.Get
                            ? await ApplyParentalFilterAsync(json, apiPath, jellyfinUserId)
                            : Content(json, "application/json");
                    }

                    _logger.Warning($"Seerr request failed for user {ResolveUserDisplay(jellyfinUserId)} at {trimmedUrl}: code={error!.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");

                    // Map structured error → HTTP status + structured envelope.
                    // The frontend can switch on `code` to display a meaningful
                    // banner instead of "discovery silently disappeared".
                    lastStatusCode = error.Code switch
                    {
                        Helpers.Jellyseerr.SeerrErrorCode.HtmlResponse => 502,
                        Helpers.Jellyseerr.SeerrErrorCode.UpstreamRedirect => 502,
                        Helpers.Jellyseerr.SeerrErrorCode.Cloudflare5xx => 502,
                        Helpers.Jellyseerr.SeerrErrorCode.Unauthorized => 401,
                        Helpers.Jellyseerr.SeerrErrorCode.Forbidden => 403,
                        _ => error.HttpStatus > 0 ? error.HttpStatus : 502,
                    };
                    // admins keep the upstream URL in the response;
                    // non-admins get a sanitised version that strips it.
                    lastErrorBody = IsAdminUser() ? error.ToAdminResponseShape() : error.ToResponseShape();
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    // The browser aborted the request (superseded search, page
                    // navigation). Not an upstream failure: don't log as error,
                    // don't cache, don't fail over to the next Seerr URL.
                    // 499 = "client closed request"; nobody is listening anyway.
                    // A timeout-caused OperationCanceledException (ct not
                    // cancelled) falls through to the generic handler below.
                    return StatusCode(499);
                }
                catch (Exception ex)
                {
                    _logger.Error($"Failed to connect to Seerr URL for user {ResolveUserDisplay(jellyfinUserId)}: {trimmedUrl}. Error: {ex.Message}");
                    if (IsAdminUser())
                    {
                        lastErrorBody = new { error = true, code = "unreachable", message = $"Failed to reach {trimmedUrl}: {ex.Message}" };
                    }
                    else
                    {
                        lastErrorBody = new { error = true, code = "unreachable", message = "Can't reach Seerr right now. Please try again in a moment." };
                    }
                }
            }

            return StatusCode(lastStatusCode, lastErrorBody);
        }

        // Dedup tracker for high-frequency polling log lines.
        // Key = (userId, apiPath), Value = (last logged message, count since last log, last log time)
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, (string LastMsg, int Count, DateTime LastLogged)>
            _pollLogDedup = new();
        private static readonly TimeSpan _pollLogInterval = TimeSpan.FromMinutes(5);

        /// <summary>
        /// Logs a high-frequency polling request, consolidating repeated identical calls into a
        /// single summary line every <see cref="_pollLogInterval"/> rather than one line per poll.
        /// </summary>
        protected void LogPollingRequest(string userDisplay, string requestUri, string dedupKey)
        {
            var now = DateTime.UtcNow;
            _pollLogDedup.AddOrUpdate(
                dedupKey,
                _ =>
                {
                    // First occurrence — log immediately
                    _logger.Info($"Proxying Seerr request for user {userDisplay} to: {requestUri}");
                    return (requestUri, 0, now);
                },
                (_, existing) =>
                {
                    var newCount = existing.Count + 1;
                    if (now - existing.LastLogged >= _pollLogInterval)
                    {
                        // Enough time has passed — emit a consolidated summary
                        _logger.Info($"Proxying Seerr request for user {userDisplay} to: {requestUri} (repeated {newCount}x in last {_pollLogInterval.TotalMinutes:0}m)");
                        return (requestUri, 0, now);
                    }
                    // Still within the quiet window — suppress
                    return (existing.LastMsg, newCount, existing.LastLogged);
                });
        }
    }
}
