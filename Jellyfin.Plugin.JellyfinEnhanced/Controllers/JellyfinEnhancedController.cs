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
using Jellyfin.Plugin.JellyfinEnhanced.Model.Jellyseerr;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
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
using static Jellyfin.Plugin.JellyfinEnhanced.Services.SeerrCaches;
using Jellyfin.Database.Implementations;
using Jellyfin.Database.Implementations.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.MediaTags;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public class JellyfinEnhancedController : JeControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Services.SeerrParentalFilter _parentalFilter;
        private readonly Services.SpoilerSeerrRedactor _spoilerSeerrRedactor;
        private readonly IUserDataManager _userDataManager;
        private readonly ILibraryManager _libraryManager;
        private readonly IDtoService _dtoService;
        private readonly IItemRepository _itemRepository;
        private readonly IDbContextFactory<JellyfinDbContext> _dbContextFactory;
        private readonly Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags.Services.TagCacheService _tagCacheService;
        private readonly MediaBrowser.Controller.Session.ISessionManager _sessionManager;
        private readonly Features.Admin.Services.MaintenanceModeService _maintenanceModeService;
        private readonly Services.CdnAssetService _cdnAssetService;
        private readonly Services.SpoilerUserResolver _spoilerResolver;
        private readonly Services.SpoilerTagDataStripper _spoilerTagDataStripper;
        private readonly Services.WikidataAwardsService _wikidataAwardsService;
        private readonly Services.AnilistReviewsService _anilistReviewsService;
        private readonly Services.ReviewTranslationService _reviewTranslationService;
        private readonly Services.MdblistService _mdblistService;
        private readonly Services.DoesTheDogDieService _doesTheDogDieService;
        private readonly Features.Admin.Services.WhatsNewService _whatsNewService;
        private readonly Services.UsageEventCounterService _usageEventCounterService;
        private readonly Services.AnalyticsReportingService _analyticsReportingService;
        private readonly Services.HostCompatibilityService _hostCompatibility;
        private readonly Services.TmdbResponseCache _tmdbResponseCache;
        private readonly Services.ItemStatsService _itemStats;
        private readonly IServerConfigurationManager _serverConfigurationManager;
        private readonly INetworkManager _networkManager;
        private readonly Services.SpoilerExistingTitlesApplier _spoilerExistingApplier;
        private readonly MediaBrowser.Model.Tasks.ITaskManager _taskManager;
        private readonly IPluginManager _pluginManager;
        private readonly Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags.Services.MatroskaLanguageCache _matroskaLanguageCache;
        private readonly UserDisplayResolver _userDisplayResolver;
        private readonly ArrInstanceClient _arrInstanceClient;
        private readonly ActiveSessionsService _activeSessionsService;
        private readonly HiddenContentDocumentService _hiddenContentDocumentService;
        private readonly LibraryItemLookup _libraryItemLookup;
        private readonly Services.SeerrUserLookup _seerrUserLookup;

        private async Task<bool> IsSeerrReachableCached()
        {
            var cached = TryGetCachedSeerrReachability();
            if (cached.HasValue)
            {
                return cached.Value;
            }

            bool active = await ProbeJellyseerrStatusAsync();
            lock (_seerrStatusCacheLock)
            {
                _seerrStatusCache = (active, DateTime.UtcNow);
            }
            return active;
        }

        public JellyfinEnhancedController(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            IUserDataManager userDataManager,
            ILibraryManager libraryManager,
            IDtoService dtoService,
            UserConfigurationManager userConfigurationManager,
            IItemRepository itemRepository,
            IDbContextFactory<JellyfinDbContext> dbContextFactory,
            Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags.Services.TagCacheService tagCacheService,
            MediaBrowser.Controller.Session.ISessionManager sessionManager,
            Features.Admin.Services.MaintenanceModeService maintenanceModeService,
            Services.CdnAssetService cdnAssetService,
            Services.SpoilerUserResolver spoilerResolver,
            Services.SpoilerTagDataStripper spoilerTagDataStripper,
            Services.WikidataAwardsService wikidataAwardsService,
            Services.AnilistReviewsService anilistReviewsService,
            Services.ReviewTranslationService reviewTranslationService,
            Services.MdblistService mdblistService,
            Services.DoesTheDogDieService doesTheDogDieService,
            Services.SeerrParentalFilter parentalFilter,
            Services.SpoilerSeerrRedactor spoilerSeerrRedactor,
            Features.Admin.Services.WhatsNewService whatsNewService,
            Services.UsageEventCounterService usageEventCounterService,
            Services.AnalyticsReportingService analyticsReportingService,
            Services.HostCompatibilityService hostCompatibility,
            Services.TmdbResponseCache tmdbResponseCache,
            Services.ItemStatsService itemStats,
            IServerConfigurationManager serverConfigurationManager,
            INetworkManager networkManager,
            Services.SpoilerExistingTitlesApplier spoilerExistingApplier,
            MediaBrowser.Model.Tasks.ITaskManager taskManager,
            IPluginManager pluginManager,
            Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags.Services.MatroskaLanguageCache matroskaLanguageCache)
            : base(userManager, logger, userConfigurationManager)
        {
            _httpClientFactory = httpClientFactory;
            _userDataManager = userDataManager;
            _libraryManager = libraryManager;
            _dtoService = dtoService;
            _itemRepository = itemRepository;
            _dbContextFactory = dbContextFactory;
            _tagCacheService = tagCacheService;
            _sessionManager = sessionManager;
            _maintenanceModeService = maintenanceModeService;
            _cdnAssetService = cdnAssetService;
            _spoilerResolver = spoilerResolver;
            _spoilerTagDataStripper = spoilerTagDataStripper;
            _wikidataAwardsService = wikidataAwardsService;
            _anilistReviewsService = anilistReviewsService;
            _reviewTranslationService = reviewTranslationService;
            _mdblistService = mdblistService;
            _doesTheDogDieService = doesTheDogDieService;
            _parentalFilter = parentalFilter;
            _spoilerSeerrRedactor = spoilerSeerrRedactor;
            _whatsNewService = whatsNewService;
            _usageEventCounterService = usageEventCounterService;
            _analyticsReportingService = analyticsReportingService;
            _hostCompatibility = hostCompatibility;
            _tmdbResponseCache = tmdbResponseCache;
            _itemStats = itemStats;
            _serverConfigurationManager = serverConfigurationManager;
            _networkManager = networkManager;
            _spoilerExistingApplier = spoilerExistingApplier;
            _taskManager = taskManager;
            _pluginManager = pluginManager;
            _matroskaLanguageCache = matroskaLanguageCache;
            _userDisplayResolver = new UserDisplayResolver(userManager);
            _arrInstanceClient = new ArrInstanceClient(httpClientFactory, logger);
            _activeSessionsService = new ActiveSessionsService(sessionManager);
            _hiddenContentDocumentService = new HiddenContentDocumentService(userConfigurationManager, logger, _userDisplayResolver);
            _libraryItemLookup = new LibraryItemLookup(libraryManager, logger);
            _seerrUserLookup = new Services.SeerrUserLookup(httpClientFactory, logger, _userDisplayResolver);
        }

        internal static void ClearUserCaches() => Services.SeerrCaches.ClearUserCaches();

        // Forwarder kept for the test call sites and JellyfinEnhanced.cs (restructure S2.0b; S2.14 removes it).
        public static void ClearAllSeerrCachesOnConfigChange() => Services.SeerrCaches.ClearAllSeerrCachesOnConfigChange();

        // Seerr's discover API accepts these params (verified live against
        // Seerr 3.2.0). The correct names are `keywords`, `watchProviders`,
        // `watchRegion` — no `with*` prefix; Seerr rejects `withCompanies`
        // / `withNetworks` / `withOriginalLanguage` as `Unknown query parameter`.
        // `studio` and `network` are accepted on /discover/movies and
        // /discover/tv respectively (handled via path routes).
        private static readonly string[] DiscoverFilterParams = {
            "sortBy", "primaryReleaseDateGte", "primaryReleaseDateLte",
            "firstAirDateGte", "firstAirDateLte",
            "voteAverageGte", "voteAverageLte",
            "withRuntimeGte", "withRuntimeLte",
            "certification", "watchRegion", "language",
            "keywords", "watchProviders"
        };

        private string AppendDiscoverFilters(string basePath)
        {
            var sb = new StringBuilder(basePath);
            foreach (var param in DiscoverFilterParams)
            {
                if (Request.Query.TryGetValue(param, out var value) && !string.IsNullOrEmpty(value))
                {
                    sb.Append($"&{param}={Uri.EscapeDataString(value!)}");
                }
            }
            return sb.ToString();
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
                // After the parental filter, which reads what this removes, and on the way
                // out of the shared response cache, so one user's guards never reach another.
                return Content(_spoilerSeerrRedactor.RedactSeerr(result.Body, apiPath, jellyfinUserId, HttpContext), "application/json");
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

        // Seerr permissions that allow choosing server, quality profile and root folder on a request (ADMIN implies all).
        private const JellyseerrPermission AdvancedRequestPermissions =
            JellyseerrPermission.ADMIN | JellyseerrPermission.REQUEST_ADVANCED | JellyseerrPermission.MANAGE_REQUESTS;

        private static readonly string[] AdvancedRequestFields = { "serverId", "profileId", "rootFolder", "languageProfileId", "tags" };

        /// <summary>
        /// Removes the advanced options (server, profile, root folder, language profile, tags) from a request body.
        /// Returns the body unchanged when it is not a JSON object.
        /// </summary>
        private static string StripAdvancedRequestOptions(string content)
        {
            try
            {
                if (System.Text.Json.Nodes.JsonNode.Parse(content) is not System.Text.Json.Nodes.JsonObject body)
                {
                    return content;
                }

                foreach (var field in AdvancedRequestFields)
                {
                    body.Remove(field);
                }

                return body.ToJsonString();
            }
            catch (JsonException)
            {
                return content;
            }
        }

        private async Task<IActionResult> ProxyJellyseerrRequest(string apiPath, HttpMethod method, string? content = null)
        {
            // Propagate client disconnects (superseded search queries, page
            // navigations) to the upstream Seerr/TMDB call so we stop doing
            // work nobody will read. Only GETs are cancellable: POSTs (requests,
            // issues) must run to completion even if the browser goes away.
            var ct = method == HttpMethod.Get ? HttpContext.RequestAborted : CancellationToken.None;

            // Writes are not idempotent: every failed write says whether it may have
            // been applied (docs/rewrite/seerr-proxy-outcomes.md), and once one has been
            // handed to the network it is never retried or failed over to another URL.
            var isWrite = method != HttpMethod.Get;
            Helpers.Jellyseerr.SeerrRequestOutcome? notSent = isWrite ? Helpers.Jellyseerr.SeerrRequestOutcome.NotSent : null;

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                _logger.Warning("Seerr integration is not configured or enabled.");
                return isWrite
                    ? StatusCode(503, Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("not_configured", "Seerr integration is not configured or enabled.", notSent))
                    : StatusCode(503, "Seerr integration is not configured or enabled.");
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
            var seerrUser = await _seerrUserLookup.GetJellyseerrUser(jellyfinUserId);
            var jellyseerrUserId = seerrUser?.Id.ToString();
            if (string.IsNullOrEmpty(jellyseerrUserId))
            {
                _logger.Warning($"Could not find a Jellyseerr user for Jellyfin user {_userDisplayResolver.ResolveUserDisplay(jellyfinUserId)}. Aborting request.");
                // When GetJellyseerrUserId returns null because every Seerr URL
                // is returning a Cloudflare/proxy HTML challenge, the generic
                // "user not linked" message misleads the admin. Do one quick
                // reachability probe so the frontend gets a structured reason
                // it can render in a banner, matching /jellyseerr/user-status.
                // The probe is cached so a Seerr outage doesn't fan out N
                // status probes from the negative-user-cache window.
                bool reachable = await IsSeerrReachableCached();

                if (!reachable)
                {
                    // Admins get a pointer to the JE log (which carries the
                    // full code=Cloudflare5xx status=. cf-ray=. line);
                    // non-admins get plain copy.
                    var unreachableMsg = IsAdminUser()
                        ? "Can't reach Seerr. Check the JE log for cf-ray / Content-Type / status details."
                        : "Can't reach Seerr right now. Please try again in a moment.";
                    return StatusCode(502, Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("unreachable", unreachableMsg, notSent));
                }
                if (Services.SeerrUserLookup.IsJellyseerrImportBlocked(jellyfinUserId, JellyfinEnhanced.Instance?.Configuration ?? new Configuration.PluginConfiguration()))
                {
                    return StatusCode(403, Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("blocked", "Your administrator has disabled Seerr for your account.", notSent));
                }
                return NotFound(Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("unlinked", "Current Jellyfin user is not linked to a Jellyseerr user.", notSent));
            }

            // Enforce Seerr permissions for write operations and sensitive reads.
            // Jellyfin admins bypass all permission checks (they can do anything in Seerr).
            // For non-admins, validate before proxying so we return a clear 403 rather than
            // letting Seerr reject the request with a generic error.
            if (!IsAdminUser())
            {
                // reuse the Seerr user we already resolved at
                // line ~647 — no second GetJellyseerrUser call.
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
                                return StatusCode(403, Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("no_request_permission", "You do not have permission to make requests in Seerr.", notSent, error: false));

                            if (content != null && !JellyseerrPermissionHelper.HasAnyPermission(perms, AdvancedRequestPermissions))
                                content = StripAdvancedRequestOptions(content);
                        }

                        // POST /api/v1/issue — report an issue
                        if (method == HttpMethod.Post && apiPath.StartsWith("/api/v1/issue", StringComparison.OrdinalIgnoreCase))
                        {
                            if (!JellyseerrPermissionHelper.HasAnyPermission(perms,
                                JellyseerrPermission.CREATE_ISSUES | JellyseerrPermission.MANAGE_ISSUES))
                                return StatusCode(403, Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("no_issue_permission", "You do not have permission to report issues in Seerr.", notSent, error: false));
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
                return StatusCode(403, Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("parental_block", "This title is above your parental rating limit.", notSent));
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
            // Every write failure that falls through the loop was provably not sent:
            // anything sent returns from inside the loop.
            if (isWrite)
            {
                lastErrorBody = Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("unreachable", "Can't reach Seerr right now. Please try again in a moment.", notSent);
            }

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
                    var userDisplay = _userDisplayResolver.ResolveUserDisplay(jellyfinUserId);
                    if (isIssuePolling)
                        LogPollingRequest(userDisplay, requestUri, $"{jellyfinUserId}:{apiPath}");
                    else
                        _logger.Info($"Proxying Seerr request for user {userDisplay} to: {requestUri}");
                }

                // Set immediately before the write is handed to HttpClient. From then
                // on the write may reach Seerr, so it ends here whatever happens.
                var writeDispatched = false;
                try
                {
                    string? json = null;
                    Helpers.Jellyseerr.SeerrError? error = null;
                    var upstreamStatus = 0;
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

                        writeDispatched = isWrite;
                        using var response = await httpClient.SendAsync(request, ct);
                        upstreamStatus = (int)response.StatusCode;
                        (json, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri, ct);
                        var transient = error != null && error.HttpStatus >= 500 && error.HttpStatus <= 599
                            && error.Code != Helpers.Jellyseerr.SeerrErrorCode.HtmlResponse
                            && error.Code != Helpers.Jellyseerr.SeerrErrorCode.Cloudflare5xx;
                        if (!transient || attempt == attempts) break;
                        _logger.Debug($"Seerr returned {error!.HttpStatus} for {apiPath}; retrying ({attempt}/{attempts - 1})");
                        await Task.Delay(TimeSpan.FromMilliseconds(400 * attempt), ct);
                    }

                    // A 2xx that is not a complete JSON document cannot confirm the write
                    // (truncated, empty or garbled), so it is reported as unknown below.
                    if (isWrite && error == null && json != null && !Helpers.Jellyseerr.SeerrRequestOutcomes.IsUsableWriteResponse(json))
                    {
                        error = new Helpers.Jellyseerr.SeerrError
                        {
                            Code = Helpers.Jellyseerr.SeerrErrorCode.ParseError,
                            HttpStatus = upstreamStatus,
                            Url = requestUri,
                            Message = $"Seerr answered {upstreamStatus} from {requestUri} with a body that is not valid JSON; the write may have been applied.",
                            UserMessage = "Got an unexpected response from Seerr. Please try again in a moment."
                        };
                        json = null;
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

                    _logger.Warning($"Seerr request failed for user {_userDisplayResolver.ResolveUserDisplay(jellyfinUserId)} at {trimmedUrl}: code={error!.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");

                    // Map structured error → HTTP status + structured envelope.
                    // The frontend can switch on `code` to display a meaningful
                    // banner instead of "discovery silently disappeared".
                    lastStatusCode = error.Code switch
                    {
                        Helpers.Jellyseerr.SeerrErrorCode.HtmlResponse => 502,
                        Helpers.Jellyseerr.SeerrErrorCode.UpstreamRedirect => 502,
                        Helpers.Jellyseerr.SeerrErrorCode.Cloudflare5xx => 502,
                        Helpers.Jellyseerr.SeerrErrorCode.ParseError => 502,
                        Helpers.Jellyseerr.SeerrErrorCode.Unauthorized => 401,
                        Helpers.Jellyseerr.SeerrErrorCode.Forbidden => 403,
                        _ => error.HttpStatus > 0 ? error.HttpStatus : 502,
                    };

                    if (isWrite)
                    {
                        // Seerr (or something in front of it) answered this write: report
                        // that answer; another URL would be a second, independent write.
                        var outcome = Helpers.Jellyseerr.SeerrRequestOutcomes.ForUpstreamError(error);
                        return SeerrWriteFailure(lastStatusCode, error.ToProxyErrorResponse(IsAdminUser(), outcome), apiPath, content, trimmedUrl);
                    }

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
                    _logger.Error($"Failed to connect to Seerr URL for user {_userDisplayResolver.ResolveUserDisplay(jellyfinUserId)}: {trimmedUrl}. Error: {ex.Message}");
                    var message = IsAdminUser()
                        ? $"Failed to reach {trimmedUrl}: {ex.Message}"
                        : "Can't reach Seerr right now. Please try again in a moment.";
                    if (!isWrite)
                    {
                        lastErrorBody = new { error = true, code = "unreachable", message };
                        continue;
                    }

                    // A refused connect or failed DNS lookup proves nothing reached this
                    // URL, so the next one may still be tried. Anything else (timeout,
                    // reset, a response cut short) may have been applied.
                    if (writeDispatched && !Helpers.Jellyseerr.SeerrRequestOutcomes.IsProvablyUnsent(ex))
                    {
                        return SeerrWriteFailure(502, Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("unreachable", message, Helpers.Jellyseerr.SeerrRequestOutcome.Unknown), apiPath, content, trimmedUrl);
                    }

                    lastErrorBody = Helpers.Jellyseerr.SeerrProxyErrorResponse.Create("unreachable", message, notSent);
                }
            }

            return StatusCode(lastStatusCode, lastErrorBody);
        }

        /// <summary>
        /// Ends a write that was handed to a Seerr URL without a usable success. Never
        /// retried or failed over: the body says whether it may have been applied.
        /// An unknown request outcome also evicts the title's cached details, so the
        /// browser's follow-up status read sees what Seerr actually holds.
        /// </summary>
        /// <param name="status">The proxy HTTP status.</param>
        /// <param name="body">The failure envelope, with its request outcome set.</param>
        /// <param name="apiPath">The Seerr API path written to.</param>
        /// <param name="content">The forwarded request body.</param>
        /// <param name="url">The configured Seerr base URL the write went to (log only).</param>
        /// <returns>The failure result.</returns>
        private ObjectResult SeerrWriteFailure(int status, Helpers.Jellyseerr.SeerrProxyErrorResponse body, string apiPath, string? content, string url)
        {
            var outcome = body.RequestOutcome ?? Helpers.Jellyseerr.SeerrRequestOutcome.Unknown;
            _logger.Warning($"Seerr write {apiPath} at {url} ended with outcome={outcome.ToWireValue()} status={status}; not retried on another URL.");
            if (outcome == Helpers.Jellyseerr.SeerrRequestOutcome.Unknown
                && apiPath.StartsWith("/api/v1/request", StringComparison.OrdinalIgnoreCase)
                && content != null)
            {
                EvictMovieTvCacheForRequest(content);
            }
            return StatusCode(status, body);
        }

        /// <summary>
        /// Whether Seerr is configured and reachable. Every details page and the
        /// search page ask this; the answer comes from the same 30-second probe
        /// cache the proxy uses, so it costs a Seerr round trip at most twice a
        /// minute rather than once per page.
        /// </summary>
        [HttpGet("jellyseerr/status")]
        [Authorize]
        public async Task<IActionResult> GetJellyseerrStatus()
        {
            return Ok(SeerrStatusResponse(await IsSeerrReachableCached()));
        }

        /// <summary>The <c>jellyseerr/status</c> response body.</summary>
        private static object SeerrStatusResponse(bool active) => new { active };

        private async Task<bool> ProbeJellyseerrStatusAsync()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled || string.IsNullOrEmpty(config.JellyseerrApiKey) || string.IsNullOrEmpty(config.JellyseerrUrls))
            {
                return false;
            }

            var urls = config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            httpClient.Timeout = TimeSpan.FromSeconds(15);

            foreach (var url in urls)
            {
                var requestUri = $"{url.Trim().TrimEnd('/')}/api/v1/status";
                try
                {
                    using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get, requestUri, config.JellyseerrApiKey);
                    using var response = await httpClient.SendAsync(request);
                    var (_, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri);
                    if (error == null)
                    {
                        return true;
                    }
                    _logger.Warning($"Seerr status check failed at {url}: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");
                }
                catch
                {
                    // Ignore and try next URL
                }
            }

            _logger.Warning("Could not establish a connection with any configured Seerr URL. Status is inactive.");
            return false;
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

            if (!ArrUrlGuard.IsAllowedUrl(url, _logger))
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

            if (!ArrUrlGuard.IsAllowedUrl(url, _logger))
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
            var jellyfinUserId = UserHelper.GetCurrentUserId(User)?.ToString();
            var withoutLookup = TryBuildSeerrUserStatusWithoutLookup(config, jellyfinUserId, IsAdminUser());
            if (withoutLookup != null)
            {
                return Ok(withoutLookup);
            }

            // Only reached with Seerr configured, a signed-in user that is not
            // blocked, and no cached Seerr user id (or, for a non-admin, no
            // cached Seerr user to read canRequestAdvanced from).
            // GetSeerrUserId uses the user ID cache (30-min TTL).
            // A successful user lookup implicitly proves Seerr is reachable.
            var jellyseerrUserId = await _seerrUserLookup.GetJellyseerrUserId(jellyfinUserId!);
            if (!string.IsNullOrEmpty(jellyseerrUserId))
            {
                var seerrUser = await _seerrUserLookup.GetJellyseerrUser(jellyfinUserId!);
                return Ok(LinkedSeerrUserStatus(jellyseerrUserId, CanRequestAdvanced(IsAdminUser(), seerrUser)));
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

        /// <summary>
        /// The <c>jellyseerr/user-status</c> answer when it needs no Seerr round trip:
        /// Seerr not configured, no signed-in user, the user blocked from import, or
        /// the user's Seerr id already in the user-id cache (and, for a non-admin,
        /// their Seerr user in the user cache, for canRequestAdvanced). Null when
        /// the full lookup is required. Shared by the endpoint and the bootstrap payload so
        /// both return the same object.
        /// </summary>
        private static object? TryBuildSeerrUserStatusWithoutLookup(Configuration.PluginConfiguration? config, string? jellyfinUserId, bool isAdmin)
        {
            if (config == null || !config.JellyseerrEnabled ||
                string.IsNullOrEmpty(config.JellyseerrApiKey) ||
                string.IsNullOrEmpty(config.JellyseerrUrls))
            {
                return new { active = false, userFound = false, reason = "disabled" };
            }

            if (string.IsNullOrEmpty(jellyfinUserId))
            {
                return new { active = false, userFound = false, reason = "no_user" };
            }

            if (Services.SeerrUserLookup.IsJellyseerrImportBlocked(jellyfinUserId, config))
            {
                return new { active = true, userFound = false, reason = "blocked" };
            }

            var cachedId = Services.SeerrUserLookup.TryGetCachedJellyseerrUserId(jellyfinUserId);
            if (cachedId == null) return null;

            // canRequestAdvanced: an admin always may; anyone else needs their
            // Seerr user (permissions), which must already be in the user cache
            // for this answer to need no Seerr round trip.
            if (isAdmin) return LinkedSeerrUserStatus(cachedId, true);
            return TryGetCachedJellyseerrUser(jellyfinUserId, out var seerrUser)
                ? LinkedSeerrUserStatus(cachedId, CanRequestAdvanced(false, seerrUser))
                : null;
        }

        /// <summary>The <c>jellyseerr/user-status</c> answer for a linked user.</summary>
        private static object LinkedSeerrUserStatus(string jellyseerrUserId, bool canRequestAdvanced)
            => new { active = true, userFound = true, jellyseerrUserId = jellyseerrUserId, reason = "linked", canRequestAdvanced };

        /// <summary>
        /// Whether the request modals may offer the advanced options (server,
        /// quality profile, root folder): Jellyfin admins always, anyone else
        /// with an advanced-request permission in Seerr.
        /// </summary>
        private static bool CanRequestAdvanced(bool isAdmin, JellyseerrUser? seerrUser)
            => isAdmin
                || (seerrUser != null && JellyseerrPermissionHelper.HasAnyPermission(seerrUser.Permissions, AdvancedRequestPermissions));

        /// <summary>
        /// The Seerr user GetJellyseerrUser would answer from its cache (an
        /// unexpired entry, positive or negative, cache not disabled), without
        /// contacting Seerr; false when it would have to look the user up.
        /// </summary>
        private static bool TryGetCachedJellyseerrUser(string jellyfinUserId, out JellyseerrUser? user)
        {
            user = null;
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || config.JellyseerrDisableCache)
            {
                return false;
            }

            lock (_userCacheLock)
            {
                if (_userCache.TryGetValue(jellyfinUserId, out var cached))
                {
                    var ttl = cached.User == null ? TimeSpan.FromSeconds(60) : GetUserIdCacheTtl();
                    if (DateTime.UtcNow - cached.CachedAt < ttl)
                    {
                        user = cached.User;
                        return true;
                    }
                }
            }

            return false;
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
                var seerrUser = await _seerrUserLookup.GetJellyseerrUser(userId, bypassCache: true, allowAutoImport: false);

                if (seerrUser == null)
                {
                    // Null has 5 distinct causes: user genuinely unlinked, blocked
                    // by JE config, every Seerr URL HTTP-failed, every URL threw,
                    // or JSON shape mismatch. The UI renders them all as "Not
                    // linked", which misleads admins during transient Seerr
                    // outages. Leave a breadcrumb in the server log so the cause
                    // can be correlated with the preceding WARN/ERROR lines
                    // that GetJellyseerrUser already emits.
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
                        issues.Add("Advanced request options are hidden for this user (missing REQUEST_ADVANCED)");
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


        [HttpGet("jellyseerr/search")]
        [Authorize]
        public Task<IActionResult> JellyseerrSearch([FromQuery] string? query, [FromQuery] int page = 1, [FromQuery] string? language = null)
        {
            // previously returned ASP.NET model-binding's RFC9110-link
            // error envelope when `query` was null/empty. Now we return a clean
            // structured BadRequest matching the rest of the API.
            if (string.IsNullOrWhiteSpace(query))
            {
                return Task.FromResult<IActionResult>(BadRequest(new
                {
                    error = true,
                    code = "missing_query",
                    message = "Search query is required."
                }));
            }
            // Clamp pathological inputs. Use UTF-16 surrogate-safe truncation so
            // we don't split a high/low surrogate pair.— important
            // for emoji or extended-CJK searches.
            if (query.Length > 256)
            {
                var cut = 256;
                if (cut > 0 && char.IsHighSurrogate(query[cut - 1])) cut--;
                query = query.Substring(0, cut);
            }
            if (page < 1) page = 1;

            var path = $"/api/v1/search?query={Uri.EscapeDataString(query)}&page={page}";
            if (!string.IsNullOrEmpty(language))
                path += $"&language={Uri.EscapeDataString(language)}";
            return ProxyJellyseerrRequest(path, HttpMethod.Get);
        }

        [HttpGet("jellyseerr/sonarr")]
        [Authorize]
        public Task<IActionResult> GetSonarrInstances()
        {
            return ProxyJellyseerrRequest("/api/v1/service/sonarr", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/radarr")]
        [Authorize]
        public Task<IActionResult> GetRadarrInstances()
        {
            return ProxyJellyseerrRequest("/api/v1/service/radarr", HttpMethod.Get);
        }

        // Sonarr title lookup for series TMDB has no TVDB id for (#653). Seerr
        // resolves the title through its first Sonarr instance and answers 404
        // when none is configured; the season modal then falls back to a manual
        // TVDB id input. Same request-permission gate as the /service/ reads above.
        [HttpGet("jellyseerr/sonarr/lookup/{tmdbId}")]
        [Authorize]
        public Task<IActionResult> GetSonarrLookup(int tmdbId)
        {
            return ProxyJellyseerrRequest($"/api/v1/service/sonarr/lookup/{tmdbId}", HttpMethod.Get);
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

        [HttpGet("jellyseerr/{type}/{serverId}")]
        [Authorize]
        public Task<IActionResult> GetServiceDetails(string type, int serverId)
        {
            // Allowlist the type segment so only known Seerr service routes are reachable —
            // `/api/v1/service/{type}/{serverId}` is interpolated into the upstream URL, so
            // any user-supplied value would be passed through. Today Seerr only knows
            // sonarr/radarr; reject anything else with 400.
            if (type != "sonarr" && type != "radarr")
            {
                return Task.FromResult<IActionResult>(BadRequest(new { error = true, code = "invalid_service_type", message = "Service type must be 'sonarr' or 'radarr'." }));
            }
            return ProxyJellyseerrRequest($"/api/v1/service/{type}/{serverId}", HttpMethod.Get);
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
                // Shared auto-enable scope (content type only — the title
                // isn't in a library yet, so the library filter can't apply).
                if (!Services.SpoilerAutoEnableFilter.AllowsType(JellyfinEnhanced.Instance?.Configuration, mediaType == "tv")) return;

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
                var summary = AddSpoilerBlurPendingInternal(userId, jUser, mediaType, canonicalTmdb, displayName: null);
                if (summary.WroteSomething)
                {
                    _logger.Info($"Spoiler Guard auto-on-request {summary.Promoted} for {mediaType}:{canonicalTmdb} by {_userDisplayResolver.ResolveUserDisplay(userId.ToString("N"))}");
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
            var seerrUserId = await _seerrUserLookup.GetJellyseerrUserId(jellyfinUserId);
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

                        if (!DateTime.TryParse(createdEl.GetString(), System.Globalization.CultureInfo.InvariantCulture,
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

        [HttpGet("jellyseerr/tv/{tmdbId}")]
        [Authorize]
        public Task<IActionResult> GetTvShow(int tmdbId)
        {
            return ProxyJellyseerrRequest($"/api/v1/tv/{tmdbId}", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/tv/{tmdbId}/season/{seasonNumber}")]
        [Authorize]
        public Task<IActionResult> GetTvSeason(int tmdbId, int seasonNumber)
        {
            return ProxyJellyseerrRequest($"/api/v1/tv/{tmdbId}/season/{seasonNumber}", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/movie/{tmdbId}")]
        [Authorize]
        public Task<IActionResult> GetMovie(int tmdbId)
        {
            return ProxyJellyseerrRequest($"/api/v1/movie/{tmdbId}", HttpMethod.Get);
        }

        /// <summary>
        /// Batched collection lookup for the Seerr search row: the collection each
        /// movie of one rendered batch of results belongs to, in one request
        /// instead of a proxied Seerr movie detail per movie plus a TMDB movie
        /// detail for each one Seerr names no collection for. Same sources, order
        /// and gating as those per-movie calls: the caller's Seerr movie detail
        /// through ProxyJellyseerrRequest (its response cache, Seerr user and
        /// permission checks, parental gate) first; TMDB's movie detail through
        /// TmdbResponseCache, with the passthrough's parental gate, only when
        /// Seerr's detail has no collection and a TMDB key is configured.
        /// ids: comma-separated TMDB movie ids (distinct, max 100).
        /// Response: { "results": { "603": { id, name, posterPath, backdropPath } | null } }
        /// where null means no collection; an id whose lookup failed or was
        /// refused to this caller is left out, so the client asks again later.
        /// </summary>
        [HttpGet("jellyseerr/movie-collections")]
        [Authorize]
        public async Task<IActionResult> GetMovieCollectionsBatch([FromQuery] string? ids)
        {
            // Per-user body (Seerr user, parental gating): never kept by the browser.
            Response.Headers["Cache-Control"] = "no-store";

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                return StatusCode(503, "Seerr integration is not configured or enabled.");
            }

            if (!Services.MovieCollectionsBatch.TryParseIds(ids, out var requested, out var idsError))
            {
                return BadRequest(idsError);
            }

            var callerId = UserHelper.GetCurrentUserId(User)?.ToString();
            if (string.IsNullOrEmpty(callerId))
            {
                return Forbid();
            }

            var results = new ConcurrentDictionary<int, Services.MovieCollectionsBatch.Collection?>();

            // Resolve the caller's Seerr user once, so the per-movie proxy calls
            // below read it from the cache instead of all looking it up cold at
            // the same time. Without one (unlinked, blocked, Seerr unreachable)
            // every per-movie call fails, so every id stays unknown.
            if (await _seerrUserLookup.GetJellyseerrUser(callerId) == null)
            {
                return Content(Services.MovieCollectionsBatch.Serialize(requested, results), "application/json");
            }

            var tmdbKey = config.TMDB_API_KEY;
            // The client's TmdbEnabled flag (GetPublicConfig) gated the TMDB fallback.
            var tmdbEnabled = !string.IsNullOrWhiteSpace(tmdbKey);
            var aborted = HttpContext.RequestAborted;
            // As many Seerr detail calls at once as the client used to make; a cold
            // detail makes Seerr call TMDB, which answers bursts with 5xx.
            using var slots = new SemaphoreSlim(4);
            var failures = 0;
            string? lastError = null;

            async Task LoadAsync(int tmdbId)
            {
                await slots.WaitAsync(aborted).ConfigureAwait(false);
                try
                {
                    // Anything but a readable 200 (refused by the parental gate or
                    // Seerr permissions, upstream failure, cancelled) leaves the id
                    // unknown, as the failed call left it for the client.
                    var seerr = await ProxyJellyseerrRequest($"/api/v1/movie/{tmdbId}", HttpMethod.Get).ConfigureAwait(false);
                    if (seerr is not ContentResult { StatusCode: null or 200, Content: { } json }
                        || !Services.MovieCollectionsBatch.TryReadSeerrCollection(json, out var collection))
                    {
                        return;
                    }

                    if (collection != null || !tmdbEnabled)
                    {
                        results[tmdbId] = collection;
                        return;
                    }

                    // The passthrough's gate for "movie/{id}" (TmdbAccess.GateTitle).
                    if (await _parentalFilter.IsBlockedAsync("movie", tmdbId, callerId, aborted).ConfigureAwait(false))
                    {
                        return;
                    }

                    // Same cache entry (path, empty query, bundle) as the
                    // passthrough's GET tmdb/movie/{id}.
                    var response = await _tmdbResponseCache.GetAsync($"movie/{tmdbId}", string.Empty, tmdbKey, aborted, bundle: true).ConfigureAwait(false);
                    if (response.IsSuccess && Services.MovieCollectionsBatch.TryReadTmdbCollection(response.Content, out var tmdbCollection))
                    {
                        results[tmdbId] = tmdbCollection;
                    }
                }
                catch (OperationCanceledException) when (aborted.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or IOException or InvalidOperationException)
                {
                    // TMDB failures as GetWatchProvidersBatch sees them; logged once
                    // per batch below. Seerr failures are logged by the proxy.
                    Interlocked.Increment(ref failures);
                    lastError = ex.Message;
                }
                finally
                {
                    slots.Release();
                }
            }

            try
            {
                await Task.WhenAll(requested.Select(LoadAsync)).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (aborted.IsCancellationRequested)
            {
                return StatusCode(499);
            }

            if (aborted.IsCancellationRequested)
            {
                return StatusCode(499); // the proxy calls answered 499 instead of throwing
            }

            if (failures > 0)
            {
                _logger.Warning($"Movie collections batch: {failures} of {requested.Count} TMDB lookups failed ({lastError}).");
            }

            return Content(Services.MovieCollectionsBatch.Serialize(requested, results), "application/json");
        }

        [HttpGet("jellyseerr/movie/{tmdbId}/similar")]
        [Authorize]
        public Task<IActionResult> GetSimilarMovies(int tmdbId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest($"/api/v1/movie/{tmdbId}/similar?page={page}", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/movie/{tmdbId}/recommendations")]
        [Authorize]
        public Task<IActionResult> GetRecommendedMovies(int tmdbId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest($"/api/v1/movie/{tmdbId}/recommendations?page={page}", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/movie/{tmdbId}/ratingscombined")]
        [Authorize]
        public Task<IActionResult> GetMovieRatingsCombined(int tmdbId)
        {
            return ProxyJellyseerrRequest($"/api/v1/movie/{tmdbId}/ratingscombined", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/tv/{tmdbId}/similar")]
        [Authorize]
        public Task<IActionResult> GetSimilarTvShows(int tmdbId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest($"/api/v1/tv/{tmdbId}/similar?page={page}", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/tv/{tmdbId}/recommendations")]
        [Authorize]
        public Task<IActionResult> GetRecommendedTvShows(int tmdbId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest($"/api/v1/tv/{tmdbId}/recommendations?page={page}", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/tv/{tmdbId}/ratings")]
        [Authorize]
        public Task<IActionResult> GetTvRatingsCombined(int tmdbId)
        {
            return ProxyJellyseerrRequest($"/api/v1/tv/{tmdbId}/ratings", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/tv/network/{networkId}")]
        [Authorize]
        public Task<IActionResult> DiscoverTvByNetwork(int networkId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/tv?page={page}&network={networkId}"), HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/movies/studio/{studioId}")]
        [Authorize]
        public Task<IActionResult> DiscoverMoviesByStudio(int studioId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/movies?page={page}&studio={studioId}"), HttpMethod.Get);
        }

        /// <summary>
        /// Series produced by a TMDB company (studio) — the TV half of a
        /// studio feed. Seerr's /discover/tv filters by network only, so this
        /// asks TMDB's discover/tv?with_companies directly (through the shared
        /// TMDB response cache) and answers in Seerr's discover shape; see
        /// TmdbCompanyTvDiscover for what the rows carry. Same per-user
        /// parental gate as the Seerr-proxied discover feeds.
        /// </summary>
        [HttpGet("jellyseerr/discover/tv/studio/{studioId}")]
        [Authorize]
        public async Task<IActionResult> DiscoverTvByStudio(int studioId, [FromQuery] int page = 1, [FromQuery] string? sortBy = null)
        {
            // Per-user body (library ids, parental filtering): never kept by the browser.
            Response.Headers["Cache-Control"] = "no-store";

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled)
            {
                return StatusCode(503, "Seerr integration is not configured or enabled.");
            }
            if (string.IsNullOrEmpty(config.TMDB_API_KEY))
            {
                return StatusCode(503, "TMDB API key is not configured.");
            }
            if (studioId <= 0 || page < 1 || page > 500)
            {
                return BadRequest(new { error = true, code = "invalid_parameters", message = "studioId must be positive and page between 1 and 500." });
            }

            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null)
            {
                return Forbid();
            }

            var query = $"?with_companies={studioId}&page={page}";
            if (Services.TmdbCompanyTvDiscover.IsValidSort(sortBy))
            {
                query += $"&sort_by={sortBy}";
            }

            try
            {
                var response = await _tmdbResponseCache.GetAsync("discover/tv", query, config.TMDB_API_KEY, HttpContext.RequestAborted);
                if (!response.IsSuccess)
                {
                    _logger.Warning($"TMDB discover/tv for company {studioId} (page {page}) returned {response.StatusCode}.");
                    return StatusCode(502, new { error = true, code = "tmdb_error", message = "TMDB did not answer the series-by-studio lookup." });
                }

                // One indexed provider-id lookup per row, scoped to what this user
                // may see, so in-library series link into Jellyfin and honour the
                // exclude-library-items setting like the Seerr-fed cards do. Those
                // rows (usually few) take Seerr's own mediaInfo, the same detail
                // call the More Info modal makes, so a partly available series
                // keeps "Request missing" instead of reading as fully available.
                var jUser = _userManager.GetUserById(userId.Value);
                var mediaInfo = new Dictionary<int, string>();
                if (jUser != null)
                {
                    var inLibrary = new List<(int TmdbId, Guid ItemId)>();
                    foreach (var tmdbId in Services.TmdbCompanyTvDiscover.ReadRowIds(response.Content))
                    {
                        var item = _libraryItemLookup.FindLibraryItemByTmdb(jUser, "tv", tmdbId.ToString(System.Globalization.CultureInfo.InvariantCulture));
                        if (item != null) inLibrary.Add((tmdbId, item.Id));
                    }
                    var seerrInfo = await Task.WhenAll(inLibrary.Select(row => GetSeerrTvMediaInfoAsync(row.TmdbId)));
                    for (var i = 0; i < inLibrary.Count; i++)
                    {
                        mediaInfo[inLibrary[i].TmdbId] = seerrInfo[i] ?? Services.TmdbCompanyTvDiscover.LibraryMediaInfo(inLibrary[i].ItemId);
                    }
                }
                var body = Services.TmdbCompanyTvDiscover.ToSeerrShape(response.Content, mediaInfo);

                return await ApplyParentalFilterAsync(body, $"/api/v1/discover/tv?studio={studioId}&page={page}", userId.Value.ToString());
            }
            catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
            {
                return StatusCode(499);
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to fetch series for company {studioId} from TMDB. Error: {ex.Message}");
                return StatusCode(502, new { error = true, code = "tmdb_error", message = "Failed to connect to TMDB." });
            }
        }

        /// <summary>
        /// Seerr's mediaInfo for a series, read through the caller's proxied
        /// /api/v1/tv/{id} (same response cache and parental gate as the More
        /// Info modal). Null when Seerr has no record of it or does not answer.
        /// </summary>
        private async Task<string?> GetSeerrTvMediaInfoAsync(int tmdbId)
        {
            var result = await ProxyJellyseerrRequest($"/api/v1/tv/{tmdbId}", HttpMethod.Get);
            return result is ContentResult { StatusCode: null or 200, Content: { } json }
                ? Services.TmdbCompanyTvDiscover.ExtractMediaInfo(json)
                : null;
        }

        [HttpGet("jellyseerr/discover/trending")]
        [Authorize]
        public Task<IActionResult> DiscoverTrending([FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/trending?page={page}"), HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/movies")]
        [Authorize]
        public Task<IActionResult> DiscoverMovies([FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/movies?page={page}"), HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/tv")]
        [Authorize]
        public Task<IActionResult> DiscoverTv([FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/tv?page={page}"), HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/movies/upcoming")]
        [Authorize]
        public Task<IActionResult> DiscoverUpcomingMovies([FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/movies/upcoming?page={page}"), HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/tv/upcoming")]
        [Authorize]
        public Task<IActionResult> DiscoverUpcomingTv([FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/tv/upcoming?page={page}"), HttpMethod.Get);
        }

        [HttpGet("studio/{studioId}")]
        [Authorize]
        public IActionResult GetStudioInfo(Guid studioId)
        {
            try
            {
                var studio = _libraryManager.GetItemById(studioId);
                if (studio == null)
                {
                    return NotFound(new { message = "Studio not found" });
                }

                // Get TMDB ID from provider IDs if available
                string? tmdbId = null;
                if (studio.ProviderIds != null && studio.ProviderIds.TryGetValue("Tmdb", out var id))
                {
                    tmdbId = id;
                }

                return Ok(new
                {
                    id = studio.Id,
                    name = studio.Name,
                    tmdbId = tmdbId,
                    type = studio.GetType().Name
                });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to get studio info for {studioId}: {ex.Message}");
                return StatusCode(500, new { message = "Failed to get studio info" });
            }
        }

        [HttpGet("boxset/{boxsetId}")]
        [Authorize]
        public IActionResult GetBoxSetInfo(Guid boxsetId)
        {
            try
            {
                var boxset = _libraryManager.GetItemById(boxsetId);
                if (boxset == null || boxset.GetType().Name != "BoxSet")
                {
                    return NotFound(new { message = "BoxSet not found" });
                }

                // Get TMDB collection ID from provider IDs
                string? tmdbId = null;
                if (boxset.ProviderIds != null && boxset.ProviderIds.TryGetValue("Tmdb", out var id))
                {
                    tmdbId = id;
                }

                return Ok(new
                {
                    id = boxset.Id,
                    name = boxset.Name,
                    tmdbId = tmdbId,
                    type = boxset.GetType().Name
                });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to get boxset info for {boxsetId}: {ex.Message}");
                return StatusCode(500, new { message = "Failed to get boxset info" });
            }
        }

        [HttpGet("person/{personId}")]
        [Authorize]
        public async Task<IActionResult> GetPersonInfo(Guid personId, [FromQuery] Guid? itemId = null)
        {
            try
            {
                var person = _libraryManager.GetItemById(personId);
                if (person == null)
                {
                    return NotFound(new { message = "Person not found" });
                }

                var itemPremiereDate = ResolveVisibleItemPremiereDate(itemId);
                return Ok(await BuildPersonInfoAsync(person, itemPremiereDate, HttpContext.RequestAborted));
            }
            catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
            {
                return StatusCode(499); // browser went away
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to get person info for {personId}: {ex.Message}");
                return StatusCode(500, new { message = "Failed to get person info" });
            }
        }

        private const int MaxPeopleInfoBatchSize = 100;
        // Per request; TmdbResponseCache caps the upstream calls in flight
        // across all requests (and multiplexes them over one HTTP/2
        // connection), so a cast row resolves in about one TMDB round trip.
        private const int PeopleInfoTmdbConcurrency = 16;
        // One slow TMDB lookup must not hold a whole cast batch (or a single
        // person request) hostage: past this, fall back to Jellyfin-only data.
        private static readonly TimeSpan PersonTmdbTimeout = TimeSpan.FromSeconds(6);

        /// <summary>
        /// Batch form of <see cref="GetPersonInfo"/> for the People Tags cast
        /// row: one request for every cast card instead of one per actor.
        /// <c>ids</c> is a comma-separated list of person GUIDs (N or D format,
        /// malformed entries ignored, duplicates collapsed, at most
        /// <see cref="MaxPeopleInfoBatchSize"/> distinct ids). Returns
        /// <c>{ people: { "&lt;personId N&gt;": { ...same shape as person/{id}... } } }</c>;
        /// ids that are not Person entities are omitted.
        /// </summary>
        [HttpGet("people/info")]
        [Authorize]
        public async Task<IActionResult> GetPeopleInfo([FromQuery] string? ids, [FromQuery] Guid? itemId = null)
        {
            var personIds = new HashSet<Guid>();
            var parsedIds = (ids ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(raw => Guid.TryParse(raw, out var parsed) ? parsed : Guid.Empty)
                .Where(parsed => parsed != Guid.Empty);
            foreach (var parsed in parsedIds)
            {
                personIds.Add(parsed);
                if (personIds.Count > MaxPeopleInfoBatchSize)
                {
                    return BadRequest(new { message = $"At most {MaxPeopleInfoBatchSize} person ids per request." });
                }
            }

            if (personIds.Count == 0)
            {
                return BadRequest(new { message = "No valid person ids supplied." });
            }

            var ct = HttpContext.RequestAborted;
            try
            {
                var people = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    ItemIds = personIds.ToArray(),
                    IncludeItemTypes = new[] { BaseItemKind.Person }
                })
                    .OfType<MediaBrowser.Controller.Entities.Person>()
                    .GroupBy(p => p.Id)
                    .Select(g => g.First())
                    .ToList();

                // Resolved once for the whole batch rather than per person.
                var itemPremiereDate = ResolveVisibleItemPremiereDate(itemId);

                using var tmdbGate = new SemaphoreSlim(PeopleInfoTmdbConcurrency);
                var tasks = people.Select(async person =>
                {
                    await tmdbGate.WaitAsync(ct).ConfigureAwait(false);
                    try
                    {
                        return (Key: person.Id.ToString("N"), Info: await BuildPersonInfoAsync(person, itemPremiereDate, ct).ConfigureAwait(false));
                    }
                    finally
                    {
                        tmdbGate.Release();
                    }
                }).ToList();

                var results = await Task.WhenAll(tasks).ConfigureAwait(false);
                ct.ThrowIfCancellationRequested();

                var map = new Dictionary<string, object>(results.Length, StringComparer.OrdinalIgnoreCase);
                foreach (var (key, info) in results)
                {
                    map[key] = info;
                }

                return Ok(new { people = map });
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return StatusCode(499); // browser went away (navigated off / superseded)
            }
            catch (Exception ex) when (ex is InvalidOperationException or IOException or System.Data.Common.DbException)
            {
                // What the library/database layer throws.
                _logger.Error($"Failed to get batch person info ({personIds.Count} ids): {ex.Message}");
                return StatusCode(500, new { message = "Failed to get person info" });
            }
        }

        /// <summary>
        /// PremiereDate of the item used for "age at release", honoured only
        /// when that item is visible to the calling user (library access and
        /// parental rules); otherwise null so no age-at-release is derived.
        /// </summary>
        private DateTime? ResolveVisibleItemPremiereDate(Guid? itemId)
        {
            if (!itemId.HasValue || itemId.Value == Guid.Empty)
            {
                return null;
            }

            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId.Value == Guid.Empty)
            {
                return null;
            }

            try
            {
                var user = _userManager.GetUserById(userId.Value);
                if (user == null)
                {
                    return null;
                }

                // The user overload returns null when the item is not visible
                // to this user.
                var item = _libraryManager.GetItemById<BaseItem>(itemId.Value, user);
                return item?.PremiereDate;
            }
            catch (Exception ex) when (ex is InvalidOperationException or IOException or System.Data.Common.DbException)
            {
                // What the library/database layer throws.
                _logger.Warning($"Could not resolve item {itemId.Value} for person ages: {ex.GetType().Name}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Shared response object for person/{id} and people/info. The shape
        /// is part of the client contract (peopletags.js, person-discovery.js).
        /// </summary>
        private async Task<object> BuildPersonInfoAsync(BaseItem person, DateTime? itemPremiereDate, CancellationToken cancellationToken)
        {
            // Get TMDB ID from provider IDs if available
            string? tmdbId = null;
            if (person.ProviderIds != null && person.ProviderIds.TryGetValue("Tmdb", out var id))
            {
                tmdbId = id;
            }

            // Get person-specific data
            // Note: PremiereDate on Person items stores birth date, EndDate stores death date
            var birthDate = person.PremiereDate;
            var endDate = person.EndDate;
            var birthPlace = person.ProductionLocations?.FirstOrDefault() ?? null;

            // Try to enrich with TMDB data if available
            if (!string.IsNullOrEmpty(tmdbId) && int.TryParse(tmdbId, out var tmdbPersonId))
            {
                using var tmdbTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                tmdbTimeout.CancelAfter(PersonTmdbTimeout);
                try
                {
                    // _logger.Info($"Fetching TMDB data for person {person.Id} (TMDB ID: {tmdbPersonId})");
                    var tmdbPersonData = await GetTmdbPersonData(tmdbPersonId, tmdbTimeout.Token).ConfigureAwait(false);
                    if (tmdbPersonData != null)
                    {
                        // _logger.Info($"TMDB data received: BirthPlace={tmdbPersonData.BirthPlace}, BirthDate={tmdbPersonData.BirthDate}, DeathDate={tmdbPersonData.DeathDate}");

                        // Use TMDB death date if Jellyfin doesn't have it
                        if (!endDate.HasValue && tmdbPersonData.DeathDate.HasValue)
                        {
                            endDate = tmdbPersonData.DeathDate;
                        }

                        // Use TMDB birth date if Jellyfin doesn't have it
                        if (!birthDate.HasValue && tmdbPersonData.BirthDate.HasValue)
                        {
                            birthDate = tmdbPersonData.BirthDate;
                        }

                        // Always prefer TMDB birthplace
                        if (!string.IsNullOrEmpty(tmdbPersonData.BirthPlace))
                        {
                            birthPlace = tmdbPersonData.BirthPlace;
                            // _logger.Debug($"Using TMDB birthplace: {birthPlace}");
                        }
                    }
                    else
                    {
                        _logger.Warning($"No TMDB data returned for person {person.Id} (TMDB ID: {tmdbPersonId})");
                    }
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested && tmdbTimeout.IsCancellationRequested)
                {
                    _logger.Warning($"TMDB lookup for person {person.Id} (TMDB ID: {tmdbPersonId}) exceeded {PersonTmdbTimeout.TotalSeconds:0}s; using Jellyfin data only");
                }
                catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
                {
                    _logger.Warning($"Failed to enrich person {person.Id} with TMDB data: {ex.Message}");
                    // Continue with Jellyfin data only
                }
            }
            else
            {
                // _logger.Debug($"No TMDB ID available for person {person.Id}");
            }

            int? currentAge = null;
            int? ageAtItemRelease = null;
            int? ageAtDeath = null;
            bool isDeceased = endDate.HasValue && endDate.Value < DateTime.Now;

            // Calculate current age or age at death
            if (birthDate.HasValue)
            {
                if (isDeceased)
                {
                    // If deceased, calculate age at death
                    ageAtDeath = CalculateAge(birthDate.Value, endDate!.Value); // isDeceased implies a death date
                }
                else
                {
                    // If alive, calculate current age
                    currentAge = CalculateAge(birthDate.Value, DateTime.Now);
                }

                // Calculate age at item release if a visible item was provided
                if (itemPremiereDate.HasValue)
                {
                    ageAtItemRelease = CalculateAge(birthDate.Value, itemPremiereDate.Value);
                }
            }

            return new
            {
                id = person.Id,
                name = person.Name,
                tmdbId = tmdbId,
                type = person.GetType().Name,
                birthDate = birthDate?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
                deathDate = endDate?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
                birthPlace = birthPlace,
                isDeceased = isDeceased,
                currentAge = currentAge,
                ageAtDeath = ageAtDeath,
                ageAtItemRelease = ageAtItemRelease
            };
        }

        private async Task<TmdbPersonData?> GetTmdbPersonData(int tmdbPersonId, CancellationToken cancellationToken = default)
        {
            try
            {
                // Get TMDB API key from configuration
                var config = JellyfinEnhanced.Instance?.Configuration;
                if (config == null || string.IsNullOrEmpty(config.TMDB_API_KEY))
                {
                    _logger.Warning("TMDB API key not configured in plugin settings");
                    return null;
                }

                // _logger.Debug($"Fetching TMDB person data from: https://api.themoviedb.org/3/person/{tmdbPersonId}");
                var response = await _tmdbResponseCache.GetAsync($"person/{tmdbPersonId}", string.Empty, config.TMDB_API_KEY, cancellationToken);

                if (!response.IsSuccess)
                {
                    _logger.Warning($"TMDB API request failed with status {(System.Net.HttpStatusCode)response.StatusCode}");
                    return null;
                }

                var content = response.Content;
                var jsonElement = JsonSerializer.Deserialize<JsonElement>(content);

                DateTime? birthDate = null;
                DateTime? deathDate = null;
                string? birthPlace = null;

                // Parse birth date
                if (jsonElement.TryGetProperty("birthday", out var birthdayProp) &&
                    birthdayProp.ValueKind != JsonValueKind.Null &&
                    IsoDates.TryParseIso(birthdayProp.GetString()) is DateTime birth)
                {
                    birthDate = birth;
                }

                // Parse death date
                if (jsonElement.TryGetProperty("deathday", out var deathdayProp) &&
                    deathdayProp.ValueKind != JsonValueKind.Null &&
                    deathdayProp.GetString() is string deathStr &&
                    IsoDates.TryParseIso(deathStr) is DateTime death)
                {
                    deathDate = death;
                }

                // Parse birth place
                if (jsonElement.TryGetProperty("place_of_birth", out var placeProp) &&
                    placeProp.ValueKind != JsonValueKind.Null)
                {
                    birthPlace = placeProp.GetString();
                    if (!string.IsNullOrEmpty(birthPlace))
                    {
                        // _logger.Debug($"Parsed place_of_birth: {birthPlace}");
                    }
                }

                return new TmdbPersonData
                {
                    BirthDate = birthDate,
                    DeathDate = deathDate,
                    BirthPlace = birthPlace
                };
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Browser went away; the shared TMDB call still finishes and is cached.
                throw;
            }
            catch (Exception ex)
            {
                _logger.Warning($"Failed to get TMDB person data for ID {tmdbPersonId}: {ex.Message}");
                return null;
            }
        }

        private int CalculateAge(DateTime birthDate, DateTime referenceDate)
        {
            int age = referenceDate.Year - birthDate.Year;
            if (referenceDate < birthDate.AddYears(age))
            {
                age--;
            }
            return Math.Max(0, age);
        }

        [HttpGet("genre/{genreId}")]
        [Authorize]
        public IActionResult GetGenreInfo(Guid genreId)
        {
            try
            {
                var genre = _libraryManager.GetItemById(genreId);
                if (genre == null)
                {
                    return NotFound(new { message = "Genre not found" });
                }

                return Ok(new
                {
                    id = genre.Id,
                    name = genre.Name,
                    type = genre.GetType().Name
                });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to get genre info for {genreId}: {ex.Message}");
                return StatusCode(500, new { message = "Failed to get genre info" });
            }
        }

        [HttpGet("jellyseerr/person/{personId}")]
        [Authorize]
        public Task<IActionResult> GetJellyseerrPerson(int personId)
        {
            // TMDB person id 0 / negative produces a noisy 500 from
            // Seerr. Cheap to reject up-front so admins don't see "code=UpstreamError"
            // for what is really an invalid input.
            if (personId <= 0)
            {
                return Task.FromResult<IActionResult>(BadRequest(new
                {
                    error = true,
                    code = "invalid_person_id",
                    message = "TMDB person id must be positive."
                }));
            }
            return ProxyJellyseerrRequest($"/api/v1/person/{personId}", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/person/{personId}/combined_credits")]
        [Authorize]
        public Task<IActionResult> GetJellyseerrPersonCredits(int personId)
        {
            if (personId <= 0)
            {
                return Task.FromResult<IActionResult>(BadRequest(new
                {
                    error = true,
                    code = "invalid_person_id",
                    message = "TMDB person id must be positive."
                }));
            }
            return ProxyJellyseerrRequest($"/api/v1/person/{personId}/combined_credits", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/tv/genre/{genreId}")]
        [Authorize]
        public Task<IActionResult> DiscoverTvByGenre(int genreId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/tv?page={page}&genre={genreId}"), HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/movies/genre/{genreId}")]
        [Authorize]
        public Task<IActionResult> DiscoverMoviesByGenre(int genreId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/movies?page={page}&genre={genreId}"), HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/tv/keyword/{keywordId}")]
        [Authorize]
        public Task<IActionResult> DiscoverTvByKeyword(int keywordId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/tv?page={page}&keywords={keywordId}"), HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/movies/keyword/{keywordId}")]
        [Authorize]
        public Task<IActionResult> DiscoverMoviesByKeyword(int keywordId, [FromQuery] int page = 1)
        {
            return ProxyJellyseerrRequest(AppendDiscoverFilters($"/api/v1/discover/movies?page={page}&keywords={keywordId}"), HttpMethod.Get);
        }

        [HttpGet("tmdb/search/person")]
        [Authorize]
        public Task<IActionResult> SearchTmdbPerson([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return Task.FromResult<IActionResult>(BadRequest(new { message = "Query cannot be empty" }));
            }
            return ProxyJellyseerrRequest($"/api/v1/search?query={Uri.EscapeDataString(query)}&page=1", HttpMethod.Get);
        }

        [HttpGet("tmdb/search/keyword")]
        [Authorize]
        public Task<IActionResult> SearchTmdbKeyword([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return Task.FromResult<IActionResult>(BadRequest(new { message = "Query cannot be empty" }));
            }
            return ProxyJellyseerrRequest($"/api/v1/search/keyword?query={Uri.EscapeDataString(query)}", HttpMethod.Get);
        }

        [HttpGet("tmdb/genres/movie")]
        [Authorize]
        public Task<IActionResult> GetTmdbMovieGenres()
        {
            return ProxyJellyseerrRequest("/api/v1/genres/movie", HttpMethod.Get);
        }

        [HttpGet("tmdb/genres/tv")]
        [Authorize]
        public Task<IActionResult> GetTmdbTvGenres()
        {
            return ProxyJellyseerrRequest("/api/v1/genres/tv", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/genreslider/movie")]
        [Authorize]
        public Task<IActionResult> GetMovieGenreSlider()
        {
            return ProxyJellyseerrRequest("/api/v1/discover/genreslider/movie", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/discover/genreslider/tv")]
        [Authorize]
        public Task<IActionResult> GetTvGenreSlider()
        {
            return ProxyJellyseerrRequest("/api/v1/discover/genreslider/tv", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/overrideRule")]
        [Authorize]
        public Task<IActionResult> GetOverrideRules()
        {
            return ProxyJellyseerrRequest("/api/v1/overrideRule", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/collection/{collectionId}")]
        [Authorize]
        public Task<IActionResult> GetCollection(int collectionId)
        {
            return ProxyJellyseerrRequest($"/api/v1/collection/{collectionId}", HttpMethod.Get);
        }

        [HttpGet("jellyseerr/user")]
        [Authorize]
        public Task<IActionResult> GetJellyseerrUsers([FromQuery] int take = 1000)
        {
            // Admin-only: this proxies Seerr's full user list, which includes
            // every Seerr user's email, username, plexUsername, permissions,
            // and userType. Without this gate any authenticated Jellyfin user
            // could harvest the entire Seerr roster.
            if (!IsAdminUser())
            {
                return Task.FromResult<IActionResult>(Forbid());
            }
            return ProxyJellyseerrRequest($"/api/v1/user?take={take}", HttpMethod.Get);
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

        [HttpGet("jellyseerr/watchlist")]
        [Authorize]
        public Task<IActionResult> GetJellyseerrWatchlist([FromQuery] int page = 1)
        {
            // Bug discovered live in round-1 e2e: previous endpoint `/api/v1/user/watchlist`
            // returns 400 from Seerr (`request.params.userId should be number`) —
            // Seerr's user-watchlist endpoint expects the userId in the URL path.
            // The discover endpoint reads X-Api-User from the proxy header instead,
            // returning the same shape and matching how the rest of JE's discovery
            // calls work.
            if (page < 1) page = 1;
            return ProxyJellyseerrRequest($"/api/v1/discover/watchlist?page={page}", HttpMethod.Get);
        }

        [HttpPost("jellyseerr/sync-watchlist")]
        [Authorize]
        public async Task<IActionResult> SyncJellyseerrWatchlist()
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            try
            {
                var config = JellyfinEnhanced.Instance?.Configuration;
                if (config == null || !config.JellyseerrEnabled || !config.SyncJellyseerrWatchlist)
                {
                    return BadRequest(new { error = "Jellyseerr watchlist sync is not enabled" });
                }

                _logger.Info("[Manual Watchlist Sync] Starting manual Seerr watchlist sync...");

                // The scheduled task's own pass, so a manual sync honours the same
                // blocked users, re-addition prevention and requested-media settings.
                var summary = await new ScheduledTasks.JellyseerrWatchlistSyncTask(
                    _libraryManager, _userManager, _userDataManager, _httpClientFactory, _userConfigurationManager, _logger)
                    .RunAsync(null, CancellationToken.None);
                if (summary == null)
                {
                    return BadRequest(new { error = "Jellyseerr URL or API key is not configured" });
                }

                if (summary.SeerrUnreachable)
                {
                    return StatusCode(502, new { error = "Could not load the user list from any configured Jellyseerr URL." });
                }

                _logger.Info($"[Manual Watchlist Sync] Sync complete. Processed: {summary.ItemsProcessed}, Added: {summary.ItemsAdded}");

                return Ok(new
                {
                    success = true,
                    itemsProcessed = summary.ItemsProcessed,
                    itemsAdded = summary.ItemsAdded,
                    errors = summary.FailedUsers > 0
                        ? Enumerable.Repeat("Failed to sync watchlist for a user.", summary.FailedUsers).ToList()
                        : null
                });
            }
            catch (Exception ex)
            {
                _logger.Error($"[Manual Watchlist Sync] Fatal error: {ex}");
                return StatusCode(500, new { error = "An internal error occurred during watchlist sync." });
            }
        }

        [HttpPost("jellyseerr/import-users")]
        [Authorize]
        public async Task<IActionResult> ImportJellyseerrUsers()
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            try
            {
                var config = JellyfinEnhanced.Instance?.Configuration;
                if (config == null || !config.JellyseerrEnabled)
                {
                    return BadRequest(new { error = "Jellyseerr integration is not enabled" });
                }

                if (string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
                {
                    return BadRequest(new { error = "Jellyseerr URL or API key not configured" });
                }

                // Claim the throttle slot atomically to prevent concurrent imports
                lock (_importThrottleLock)
                {
                    if ((DateTime.UtcNow - _lastManualImport).TotalSeconds < 30)
                    {
                        return StatusCode(429, new { error = "Import was run recently. Please wait before retrying." });
                    }

                    _lastManualImport = DateTime.UtcNow;
                }

                _logger.Info("[Manual User Import] Starting manual Jellyseerr user import...");

                var urls = config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                var blockedIds = Helpers.Jellyseerr.JellyseerrUserImportHelper.GetBlockedUserIds(config.JellyseerrImportBlockedUsers);
                var userIds = _userManager.GetAllUsers()
                    .Select(u => u.Id.ToString().Replace("-", ""))
                    .Where(id => !blockedIds.Contains(id))
                    .ToList();
                _logger.Info($"[Manual User Import] Importing {userIds.Count} Jellyfin users...");

                var importResult = await Helpers.Jellyseerr.JellyseerrUserImportHelper.BulkImportAsync(
                    userIds, urls, config.JellyseerrApiKey, _httpClientFactory, _logger);

                // only flush user caches when at least one user
                // was actually imported. Previously a 0-imported "success" (all
                // email-collisioned) would wipe every healthy cache entry,
                // forcing a stampede on next request.
                if (importResult.Reached && importResult.Imported > 0)
                {
                    ClearUserCaches();
                }

                // Reset the throttle slot when nothing was imported AND we got
                // any kind of error, so the admin can fix Seerr-side issues
                // and retry without waiting 30s.
                if (importResult.Imported == 0 && importResult.Errors.Count > 0)
                {
                    lock (_importThrottleLock)
                    {
                        _lastManualImport = DateTime.MinValue;
                    }
                }

                if (importResult.Reached)
                {
                    _logger.Info($"[Manual User Import] Completed. {importResult.Imported} new user(s) imported out of {userIds.Count} sent. Errors: {importResult.Errors.Count}");
                    return Ok(new
                    {
                        success = true,
                        usersImported = importResult.Imported,
                        totalUsers = userIds.Count,
                        errors = importResult.Errors,
                    });
                }
                else
                {
                    return StatusCode(502, new
                    {
                        error = "Import failed on all configured Jellyseerr URLs.",
                        errors = importResult.Errors,
                    });
                }
            }
            catch (HttpRequestException ex)
            {
                _logger.Error($"[Manual User Import] Connection error: {ex.Message}");
                return StatusCode(502, new { error = "Failed to connect to Jellyseerr. Check server logs for details." });
            }
            catch (JsonException ex)
            {
                _logger.Error($"[Manual User Import] Invalid Jellyseerr response: {ex.Message}");
                return StatusCode(502, new { error = "Invalid response from Jellyseerr. Check server logs for details." });
            }
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
                SeriesQualityAggregation = Jellyfin.Plugin.JellyfinEnhanced.Shared.MediaTags.SeriesQualityAggregation.Normalize(config.SeriesQualityAggregation),
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
                LeavingSoonAvailable = Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags.Services.LeavingSoonService.Configured(config),
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
            string? tagStripRevision = !Services.SpoilerTagDataStripper.IsConfigured(config)
                ? Services.SpoilerTagDataStripper.NoTagStrip
                : spoilerBlurSeries == null
                    ? null
                    : Services.SpoilerTagDataStripper.TagStripRevision(Services.SpoilerTagDataStripper.CreatePolicy(config, spoilerBlurSeries));

            if (config.JellyseerrEnabled)
            {
                // Same "D"-format id GetJellyseerrUserStatus reads from the token.
                seerrUserStatus = TryBuildSeerrUserStatusWithoutLookup(config, userId.ToString(), isAdmin);

                // Asked at startup by the issue reporter only.
                if (config.JellyseerrShowReportButton)
                {
                    var reachable = TryGetCachedSeerrReachability();
                    if (reachable.HasValue)
                    {
                        seerrStatus = SeerrStatusResponse(reachable.Value);
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

        [HttpGet("tmdb/{**apiPath}")]
        [Authorize]
        public async Task<IActionResult> ProxyTmdbRequest(string apiPath)
        {
            // Parental ratings (#581): for a restricted user the raw TMDB passthrough
            // is limited to title-free lookups; single-title lookups are gated on
            // that title and anything else (search, discover, trending, lists) is
            // refused, because it would return titles unfiltered.
            // Nothing but a successful upstream response may be kept by the browser,
            // and even that is revalidated (so re-gated) on every use.
            Response.Headers["Cache-Control"] = "no-store";

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

            try
            {
                // Gating above has already run for this caller; the server cache is
                // keyed on what goes upstream (see TmdbResponseCache for why that
                // is account-safe).
                // bundle: a cold title lookup (or one of its release dates /
                // watch providers / reviews) fetches the whole set in one
                // TMDB call, which the details page's sibling requests join.
                var response = await _tmdbResponseCache.GetAsync(apiPath, queryString.ToString(), config.TMDB_API_KEY, HttpContext.RequestAborted, bundle: true);

                if (response.IsSuccess)
                {
                    // Before the 304 below: the ETag describes the unredacted body, so a
                    // browser's copy from before the title was guarded must not be reused.
                    if (_spoilerSeerrRedactor.TryRedactTmdb(response.Content, apiPath, tmdbCallerId, HttpContext, out var redactedBody))
                    {
                        Response.Headers["Cache-Control"] = "no-store";
                        return Content(redactedBody, "application/json");
                    }

                    // Browser cache: private + no-cache, so every reuse comes back
                    // here (parental gating above runs again) and costs only a 304
                    // when the body is unchanged. Varied on the auth headers so a
                    // shared browser profile never hands one account's response
                    // (restricted users get different results) to another.
                    Response.Headers["Cache-Control"] = "private, no-cache";
                    Response.Headers["Vary"] = "Authorization, X-Emby-Token, X-Jellyfin-User-Id";
                    Response.Headers["ETag"] = response.ETag;
                    if (Services.TmdbResponseCache.IfNoneMatchMatches(Request.Headers["If-None-Match"], response.ETag))
                    {
                        return StatusCode(StatusCodes.Status304NotModified);
                    }
                    return Content(response.Content, "application/json");
                }

                return StatusCode(response.StatusCode, response.Content);
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

        /// <summary>
        /// Batched watch providers for Seerr cards: one request per screenful of
        /// cards instead of one TMDB passthrough call per card, returning only the
        /// region's flat-rate providers (what a card renders) rather than every
        /// region's full list.
        /// items: comma-separated "movie:{id}" / "tv:{id}" (distinct, max 100).
        /// region: two-letter code; defaults to the admin DEFAULT_REGION.
        /// Response: { "region": "US", "results": { "movie:603": [ { provider_id,
        /// provider_name, logo_path } ] | null } } where null means unavailable
        /// (upstream error, or refused to this caller by parental gating).
        /// </summary>
        [HttpGet("watch-providers")]
        [Authorize]
        public async Task<IActionResult> GetWatchProvidersBatch([FromQuery] string? items, [FromQuery] string? region)
        {
            Response.Headers["Cache-Control"] = "no-store";

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.TMDB_API_KEY))
            {
                return StatusCode(503, "TMDB API key is not configured.");
            }

            if (!Services.WatchProvidersBatch.TryParseItems(items, out var requested, out var itemsError))
            {
                return BadRequest(itemsError);
            }

            var regionCode = string.IsNullOrEmpty(region) ? Services.WatchProvidersBatch.DefaultRegion(config.DEFAULT_REGION) : region;
            if (!Services.WatchProvidersBatch.IsValidRegion(regionCode))
            {
                return BadRequest("Invalid region.");
            }

            var apiKey = config.TMDB_API_KEY;
            var callerId = UserHelper.GetCurrentUserId(User)?.ToString();
            var restricted = _parentalFilter.TryGetRestrictedPolicy(callerId, out _);
            var aborted = HttpContext.RequestAborted;
            var results = new ConcurrentDictionary<string, List<Services.WatchProvidersBatch.Provider>?>(StringComparer.Ordinal);
            using var slots = new SemaphoreSlim(6);
            var failures = 0;
            string? lastError = null;

            async Task LoadAsync(Services.WatchProvidersBatch.Item item)
            {
                await slots.WaitAsync(aborted).ConfigureAwait(false);
                try
                {
                    // The same per-caller parental gating the passthrough applies to
                    // {type}/{id}/watch/providers; anything refused stays null.
                    if (restricted)
                    {
                        switch (Services.SeerrParentalFilter.ClassifyTmdbPassthrough(item.ApiPath, out var gatedType, out var gatedId))
                        {
                            case Services.SeerrParentalFilter.TmdbAccess.Deny:
                                return;
                            case Services.SeerrParentalFilter.TmdbAccess.GateTitle:
                                if (await _parentalFilter.IsBlockedAsync(gatedType, gatedId, callerId, aborted).ConfigureAwait(false))
                                {
                                    return;
                                }
                                break;
                        }
                    }

                    var response = await _tmdbResponseCache.GetAsync(item.ApiPath, string.Empty, apiKey, aborted).ConfigureAwait(false);
                    if (response.IsSuccess)
                    {
                        results[item.Key] = Services.WatchProvidersBatch.ExtractFlatrate(response.Content, regionCode);
                    }
                }
                catch (OperationCanceledException) when (aborted.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or IOException or InvalidOperationException)
                {
                    // What TmdbResponseCache surfaces from HttpClient: connection
                    // failures and the body cap, the upstream timeout, a broken
                    // stream, an unusable response. One title failing upstream
                    // leaves just that entry null; logged once per batch below so
                    // an outage doesn't log 100 lines.
                    Interlocked.Increment(ref failures);
                    lastError = ex.Message;
                }
                finally
                {
                    slots.Release();
                }
            }

            try
            {
                await Task.WhenAll(requested.Select(LoadAsync)).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (aborted.IsCancellationRequested)
            {
                return StatusCode(499);
            }

            if (failures > 0)
            {
                _logger.Warning($"Watch providers batch: {failures} of {requested.Count} lookups failed ({lastError}).");
            }

            var body = Services.WatchProvidersBatch.Serialize(regionCode, requested, results);
            var etag = Services.TmdbResponseCache.ComputeETag(body);
            // Same browser-cache policy as the passthrough: every reuse revalidates
            // here (so gating runs again) and costs a 304 when nothing changed.
            Response.Headers["Cache-Control"] = "private, no-cache";
            Response.Headers["Vary"] = "Authorization, X-Emby-Token, X-Jellyfin-User-Id";
            Response.Headers["ETag"] = etag;
            if (Services.TmdbResponseCache.IfNoneMatchMatches(Request.Headers["If-None-Match"], etag))
            {
                return StatusCode(StatusCodes.Status304NotModified);
            }
            return Content(body, "application/json");
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
        // library view. Mirrors the pending path's MaxPendingTmdbPerUser cap
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
                _logger.Warning($"Rejecting oversized Spoiler Guard payload for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)} (series={userConfiguration.Series.Count}, movies={userConfiguration.Movies.Count}, collections={userConfiguration.Collections.Count}, pending={userConfiguration.PendingTmdb.Count}; cap {MaxSpoilerEntriesPerDict}).");
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
                        _logger.Warning($"{fileName} corrupt for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)} (backed up): {strictEx.Message}");
                        return StatusCode(503, new { success = false, message = "Spoiler Guard store is corrupt; backed up. Please retry." });
                    }
                    catch (IOException ioEx)
                    {
                        _logger.Warning($"{fileName} temporarily unreadable for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)}: {ioEx.Message}");
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

                _logger.Info($"Saved Spoiler Guard state for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)} to {fileName}");
                return Ok(new { success = true, file = fileName });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save Spoiler Guard state for {_userDisplayResolver.ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
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

        // ─── Spoiler Guard: apply auto-enable scope to existing titles ───
        // Admin-only. Library-add auto-enable never re-arms on rescans (so a
        // user's opt-out sticks); these routes back the config page's explicit
        // "Apply to existing titles now" action instead. Preview is a dry run
        // with the SAVED scope; start hands the options to the scheduled task
        // (so progress/cancel also show in Dashboard > Scheduled Tasks).

        private MediaBrowser.Model.Tasks.IScheduledTaskWorker? GetSpoilerApplyExistingWorker()
        {
            return _taskManager.ScheduledTasks.FirstOrDefault(w => w.ScheduledTask is ScheduledTasks.SpoilerApplyExistingTitlesTask);
        }

        [HttpGet("spoiler-blur/apply-existing/preview")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult PreviewSpoilerApplyExisting([FromQuery] bool skipStarted = false)
        {
            if (!IsAdminUser()) return Forbid();
            if (JellyfinEnhanced.Instance?.Configuration?.SpoilerBlurEnabled != true)
            {
                return Conflict(new { success = false, message = "Spoiler Guard is disabled." });
            }
            var worker = GetSpoilerApplyExistingWorker();
            if (worker != null && worker.State != MediaBrowser.Model.Tasks.TaskState.Idle)
            {
                return Conflict(new { success = false, message = "A run is already in progress." });
            }
            try
            {
                var summary = _spoilerExistingApplier.Preview(new Services.SpoilerExistingTitlesApplier.Options { SkipStarted = skipStarted }, HttpContext.RequestAborted);
                if (summary.Error != null) return StatusCode(500, new { success = false, message = summary.Error });
                return Ok(summary);
            }
            catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
            {
                return StatusCode(499); // browser went away
            }
        }

        [HttpPost("spoiler-blur/apply-existing")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult StartSpoilerApplyExisting([FromQuery] bool skipStarted = false)
        {
            if (!IsAdminUser()) return Forbid();
            if (JellyfinEnhanced.Instance?.Configuration?.SpoilerBlurEnabled != true)
            {
                return Conflict(new { success = false, message = "Spoiler Guard is disabled." });
            }
            var worker = GetSpoilerApplyExistingWorker();
            if (worker == null) return StatusCode(503, new { success = false, message = "The scheduled task is not registered." });
            if (worker.State != MediaBrowser.Model.Tasks.TaskState.Idle)
            {
                return Conflict(new { success = false, message = "A run is already in progress." });
            }
            var completedRuns = _spoilerExistingApplier.CompletedRuns;
            var options = new Services.SpoilerExistingTitlesApplier.Options { SkipStarted = skipStarted };
            _spoilerExistingApplier.SetPendingOptions(options);
            // If a dashboard start wins the race between the state check and
            // here, the worker rejects this start inside its own Task: drop
            // these options then so a later dashboard run keeps the defaults
            // (they also expire after a minute as a backstop).
            var start = _taskManager.Execute(worker, new MediaBrowser.Model.Tasks.TaskOptions());
            start.ContinueWith(
                _ => _spoilerExistingApplier.ClearPendingOptions(options),
                CancellationToken.None,
                TaskContinuationOptions.OnlyOnFaulted,
                TaskScheduler.Default);
            _logger.Info($"SpoilerApplyExisting: run started from the config page by {_userDisplayResolver.ResolveUserDisplay(UserHelper.GetCurrentUserId(User)?.ToString("N") ?? string.Empty)} (skip started: {skipStarted})");
            return Accepted(new { success = true, taskId = worker.Id, completedRuns });
        }

        [HttpGet("spoiler-blur/apply-existing/status")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetSpoilerApplyExistingStatus()
        {
            if (!IsAdminUser()) return Forbid();
            var worker = GetSpoilerApplyExistingWorker();
            return Ok(new
            {
                taskId = worker?.Id,
                state = worker?.State.ToString() ?? "Unavailable",
                progress = worker?.CurrentProgress,
                completedRuns = _spoilerExistingApplier.CompletedRuns,
                lastRun = _spoilerExistingApplier.LastRun,
            });
        }

        /// <summary>
        /// The caller's Spoiler Guard state exactly as GET spoiler-blur/series returns
        /// it on success, for the bootstrap payload. Null when the file cannot be read
        /// cleanly: the client then asks that endpoint, which quarantines and reports
        /// a corrupt file as before (this read never quarantines anything).
        /// </summary>
        private UserSpoilerBlur? TryReadSpoilerBlurStateForBootstrap(string userKey)
        {
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
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

        /// <summary>
        /// Whether the caller's Spoiler Guard covers a movie, directly or through a
        /// collection. Client state lists collection ids, not the movies inside them.
        /// </summary>
        /// <param name="movieId">The movie's Jellyfin id.</param>
        /// <returns><c>{inScope}</c>, for the caller's own state only.</returns>
        [HttpGet("spoiler-blur/movies/{movieId}/in-scope")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetSpoilerMovieScope(string movieId)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null || userId == Guid.Empty) return Forbid();
            if (!Guid.TryParse(movieId, out var id) || id == Guid.Empty)
            {
                return BadRequest(new { success = false, message = "Invalid movie id." });
            }

            var state = _spoilerResolver.LoadUserState(HttpContext, userId.Value);
            if (!_spoilerResolver.TryGetMovieScope(state, id, out var inScope))
            {
                // Unknown isn't "out of scope": the client keeps its protection on a failure.
                return StatusCode(503, new { success = false, message = "Could not resolve Spoiler Guard scope." });
            }

            return Ok(new { inScope });
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
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
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
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
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
                        HideTrickplay = body.HideTrickplay,
                        UseAdvancedCategories = body.UseAdvancedCategories,
                        SkipDisableConfirm = body.SkipDisableConfirm,
                    };
                    return 1;
                });
                return Ok(new { success = true, prefs = body });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save Spoiler Guard user prefs for {_userDisplayResolver.ResolveUserDisplay(userKey)}: {ex.GetType().Name}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save user prefs." });
            }
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
                _logger.Info($"Spoiler Guard enabled for series '{series.Name}' ({key}) by {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, seriesId = key, name = series.Name });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
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
                    _logger.Info($"Spoiler Guard disable was a no-op for series {key} by {_userDisplayResolver.ResolveUserDisplay(userKey)} — series was not in the user's spoiler-blur list.");
                    return Ok(new { success = true, seriesId = key, removed = false });
                }
                _logger.Info($"Spoiler Guard disabled for series {key} by {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, seriesId = key, removed = true });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
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
                _logger.Info($"Spoiler Guard enabled for movie '{movie.Name}' ({key}) by {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, movieId = key, name = movie.Name });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
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
                    _logger.Info($"Spoiler Guard disable was a no-op for movie {key} by {_userDisplayResolver.ResolveUserDisplay(userKey)} — movie was not in the user's spoiler-blur list.");
                    return Ok(new { success = true, movieId = key, removed = false });
                }
                _logger.Info($"Spoiler Guard disabled for movie {key} by {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, movieId = key, removed = true });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
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
                _logger.Info($"Spoiler Guard enabled for collection '{boxSet.Name}' ({key}) by {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, collectionId = key, name = boxSet.Name });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
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
                    _logger.Info($"Spoiler Guard disable was a no-op for collection {key} by {_userDisplayResolver.ResolveUserDisplay(userKey)} — collection was not in the user's spoiler-blur list.");
                    return Ok(new { success = true, collectionId = key, removed = false });
                }
                _logger.Info($"Spoiler Guard disabled for collection {key} by {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, collectionId = key, removed = true });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
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
                var summary = AddSpoilerBlurPendingInternal(userId.Value, jUser, normalizedType, canonicalTmdb, displayName);
                if (summary.Promoted == "cap-exceeded")
                {
                    return StatusCode(429, new
                    {
                        success = false,
                        code = "pending_cap_exceeded",
                        message = $"You already have the maximum of {MaxPendingTmdbPerUser} pending spoiler-blur entries. Remove some via the management UI before adding more."
                    });
                }
                return Ok(new { success = true, promoted = summary.Promoted, jellyfinId = summary.JellyfinId, name = summary.Name });
            }
            catch (InvalidDataException strictEx)
            {
                var ukey = userId.Value.ToString("N");
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(ukey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(ukey, _userDisplayResolver.ResolveUserDisplay(ukey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                var ukey = userId.Value.ToString("N");
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(ukey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(ukey, _userDisplayResolver.ResolveUserDisplay(ukey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to record spoiler-blur pending {normalizedType}:{canonicalTmdb}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler-blur pending state." });
            }
        }

        // Shared core for the manual modal-button POST and the auto-on-Seerr-request
        // hook: library lookup + RMW, returning a structured result both the HTTP
        // layer and the fire-and-forget log layer can reason about.
        private SpoilerBlurPendingResult AddSpoilerBlurPendingInternal(
            Guid userId,
            Jellyfin.Database.Implementations.Entities.User jUser,
            string mediaType,
            string canonicalTmdb,
            string? displayName)
        {
            var pendingKey = $"{mediaType}:{canonicalTmdb}";
            var userKey = userId.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            var existingItem = _libraryItemLookup.FindLibraryItemByTmdb(jUser, mediaType, canonicalTmdb);

            if (existingItem is MediaBrowser.Controller.Entities.TV.Series existingSeries)
            {
                var seriesKey = existingSeries.Id.ToString("N");
                var changed = _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                    {
                        var pendingRemoved = state.PendingTmdb.Remove(pendingKey);
                        if (state.Series.ContainsKey(seriesKey)) return pendingRemoved ? 1 : 0;
                        state.Series[seriesKey] = new SpoilerBlurSeriesEntry
                        {
                            SeriesId = seriesKey,
                            SeriesName = existingSeries.Name ?? string.Empty,
                            EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                        };
                        return 1;
                    });
                // The pending row (if any) was just consumed — keep the
                // promoter's gate consistent so it stops sweeping this user.
                Services.SpoilerSeerrPendingPromoter.UnregisterPending(pendingKey, userId);
                _logger.Info($"Spoiler Guard pending resolved to existing series '{existingSeries.Name}' ({seriesKey}) for {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return new SpoilerBlurPendingResult("series", seriesKey, existingSeries.Name, changed > 0);
            }
            if (existingItem is MediaBrowser.Controller.Entities.Movies.Movie existingMovie)
            {
                var movieKey = existingMovie.Id.ToString("N");
                var changed = _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                    userKey, fileName, state =>
                    {
                        var pendingRemoved = state.PendingTmdb.Remove(pendingKey);
                        if (state.Movies.ContainsKey(movieKey)) return pendingRemoved ? 1 : 0;
                        state.Movies[movieKey] = new SpoilerBlurMovieEntry
                        {
                            MovieId = movieKey,
                            MovieName = existingMovie.Name ?? string.Empty,
                            EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                        };
                        return 1;
                    });
                Services.SpoilerSeerrPendingPromoter.UnregisterPending(pendingKey, userId);
                _logger.Info($"Spoiler Guard pending resolved to existing movie '{existingMovie.Name}' ({movieKey}) for {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return new SpoilerBlurPendingResult("movie", movieKey, existingMovie.Name, changed > 0);
            }

            var sanitized = SanitizePendingDisplayName(displayName);
            var capExceeded = new[] { false };
            var pendingChanged = _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                userKey, fileName, state =>
                {
                    if (state.PendingTmdb.TryGetValue(pendingKey, out var existing))
                    {
                        if (string.Equals(existing.DisplayName, sanitized, StringComparison.Ordinal))
                        {
                            return 0;
                        }
                        existing.DisplayName = sanitized;
                        return 1;
                    }
                    if (state.PendingTmdb.Count >= MaxPendingTmdbPerUser)
                    {
                        capExceeded[0] = true;
                        return 0;
                    }
                    state.PendingTmdb[pendingKey] = new SpoilerBlurPendingEntry
                    {
                        MediaType = mediaType,
                        TmdbId = canonicalTmdb,
                        DisplayName = sanitized,
                        RequestedAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                    };
                    return 1;
                });
            if (capExceeded[0])
            {
                _logger.Warning($"Spoiler Guard pending: cap of {MaxPendingTmdbPerUser} reached for {_userDisplayResolver.ResolveUserDisplay(userKey)} — rejecting new {pendingKey}");
                return new SpoilerBlurPendingResult("cap-exceeded", null, null, false);
            }
            // Prime the promoter's fast-path gate so the next ItemAdded
            // matching this TMDB id sweeps THIS user instead of bailing.
            Services.SpoilerSeerrPendingPromoter.RegisterPending(pendingKey, userId);
            _logger.Info($"Spoiler Guard pending recorded {pendingKey} for {_userDisplayResolver.ResolveUserDisplay(userKey)} (not yet in library)");

            // TOCTOU recovery: the scanner may have added the item between the
            // top-of-method lookup and this write — ItemAdded fired before our
            // pending row existed, so the promoter skipped this user. Re-check
            // once and promote inline if so.
            try
            {
                var raceItem = _libraryItemLookup.FindLibraryItemByTmdb(jUser, mediaType, canonicalTmdb);
                if (raceItem is MediaBrowser.Controller.Entities.TV.Series rs)
                {
                    return PromotePendingToSeries(userKey, fileName, rs, pendingKey);
                }
                if (raceItem is MediaBrowser.Controller.Entities.Movies.Movie rm)
                {
                    return PromotePendingToMovie(userKey, fileName, rm, pendingKey);
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"Spoiler Guard pending TOCTOU recheck threw {ex.GetType().Name}: {ex.Message}");
            }
            return new SpoilerBlurPendingResult("pending", null, null, pendingChanged > 0);
        }

        // TOCTOU recovery helper: a pending row was just written but a
        // matching library item is already present. Promote into Series.
        private SpoilerBlurPendingResult PromotePendingToSeries(
            string userKey, string fileName,
            MediaBrowser.Controller.Entities.TV.Series series, string pendingKey)
        {
            var seriesKey = series.Id.ToString("N");
            _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                userKey, fileName, state =>
                {
                    var pendingRemoved = state.PendingTmdb.Remove(pendingKey);
                    if (state.Series.ContainsKey(seriesKey)) return pendingRemoved ? 1 : 0;
                    state.Series[seriesKey] = new SpoilerBlurSeriesEntry
                    {
                        SeriesId = seriesKey,
                        SeriesName = series.Name ?? string.Empty,
                        EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                    };
                    return 1;
                });
            // Pending row consumed inline — release the promoter's gate for
            // this user (harmless no-op if it was never registered).
            if (Guid.TryParseExact(userKey, "N", out var promotedSeriesUserId))
            {
                Services.SpoilerSeerrPendingPromoter.UnregisterPending(pendingKey, promotedSeriesUserId);
            }
            _logger.Info($"Spoiler Guard pending TOCTOU-promoted to series '{series.Name}' ({seriesKey}) for {_userDisplayResolver.ResolveUserDisplay(userKey)}");
            return new SpoilerBlurPendingResult("series", seriesKey, series.Name, true);
        }

        private SpoilerBlurPendingResult PromotePendingToMovie(
            string userKey, string fileName,
            MediaBrowser.Controller.Entities.Movies.Movie movie, string pendingKey)
        {
            var movieKey = movie.Id.ToString("N");
            _userConfigurationManager.RmwUserConfiguration<UserSpoilerBlur>(
                userKey, fileName, state =>
                {
                    var pendingRemoved = state.PendingTmdb.Remove(pendingKey);
                    if (state.Movies.ContainsKey(movieKey)) return pendingRemoved ? 1 : 0;
                    state.Movies[movieKey] = new SpoilerBlurMovieEntry
                    {
                        MovieId = movieKey,
                        MovieName = movie.Name ?? string.Empty,
                        EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                    };
                    return 1;
                });
            if (Guid.TryParseExact(userKey, "N", out var promotedMovieUserId))
            {
                Services.SpoilerSeerrPendingPromoter.UnregisterPending(pendingKey, promotedMovieUserId);
            }
            _logger.Info($"Spoiler Guard pending TOCTOU-promoted to movie '{movie.Name}' ({movieKey}) for {_userDisplayResolver.ResolveUserDisplay(userKey)}");
            return new SpoilerBlurPendingResult("movie", movieKey, movie.Name, true);
        }

        private sealed record SpoilerBlurPendingResult(string Promoted, string? JellyfinId, string? Name, bool WroteSomething);

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
                    ? _libraryItemLookup.FindLibraryItemByTmdb(jUser, normalizedType, canonicalTmdb)
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
                _logger.Info($"Spoiler Guard pending DELETE removed {pendingKey} ({removedFrom}) for {_userDisplayResolver.ResolveUserDisplay(userKey)}");
                return Ok(new { success = true, removed = true, removedFrom, jellyfinId = removedJellyfinId });
            }
            catch (InvalidDataException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Newtonsoft.Json.JsonException strictEx)
            {
                _logger.Warning($"spoilerblur.json corrupt for {_userDisplayResolver.ResolveUserDisplay(userKey)} (backed up): {strictEx.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, _userDisplayResolver.ResolveUserDisplay(userKey), strictEx.Message);
                return StatusCode(503, new { success = false, message = "Spoiler Guard data was corrupt and has been backed up. Your stored values have been reset to defaults — please reconfigure." });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to remove spoiler-blur pending {pendingKey}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save spoiler-blur pending state." });
            }
        }

        // Clamp + strip control / format chars so a poisoned modal
        // payload can't grow spoilerblur.json without bound or sneak null
        // bytes / bidi-override (U+202E) tricks through the JSON
        // serializer + management UI. Strips Unicode Cf (Format) and Cc
        // (Control) categories explicitly so RTL spoofing
        // (e.g. `‮gnP.exe`) is neutralized. Truncates surrogate-pair-
        // safe so we don't emit lone surrogates that round-trip as U+FFFD
        // through Newtonsoft.
        private static string SanitizePendingDisplayName(string? raw)
        {
            if (string.IsNullOrEmpty(raw)) return string.Empty;
            const int max = 200;
            int end = raw.Length > max ? max : raw.Length;
            if (end > 0 && end < raw.Length && char.IsHighSurrogate(raw[end - 1]))
            {
                end -= 1;
            }
            var s = raw.Substring(0, end);
            var buf = new System.Text.StringBuilder(s.Length);
            foreach (var c in s)
            {
                if (c == '\r' || c == '\n' || c == '\t') { buf.Append(' '); continue; }
                var cat = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
                if (cat == System.Globalization.UnicodeCategory.Control
                    || cat == System.Globalization.UnicodeCategory.Format)
                {
                    continue;
                }
                buf.Append(c);
            }
            return buf.ToString().Normalize(System.Text.NormalizationForm.FormC);
        }

        // Hard cap on PendingTmdb — defensive against an auth'd user spamming the
        // modal/Seerr hook to grow spoilerblur.json without bound. 500 is well above
        // any real watchlist. Reaching it rejects NEW inserts only; existing entries
        // still promote and DELETE still works, so users can prune to recover.
        private const int MaxPendingTmdbPerUser = 500;

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

        // ==================== Arr Links ====================

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

            var http = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
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

        /// <summary>
        /// Whether the caller may read the active-streams session list: the feature
        /// is on and the caller is an admin or ActiveStreamsAllUsers is set. The same
        /// gate GetActiveSessions applies, for the bootstrap payload.
        /// </summary>
        private static bool CanReadActiveSessions(Configuration.PluginConfiguration config, bool isAdmin)
            => config.ActiveStreamsEnabled && (isAdmin || config.ActiveStreamsAllUsers);

        // Dedup tracker for high-frequency polling log lines.
        // Key = (userId, apiPath), Value = (last logged message, count since last log, last log time)
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, (string LastMsg, int Count, DateTime LastLogged)>
            _pollLogDedup = new();
        private static readonly TimeSpan _pollLogInterval = TimeSpan.FromMinutes(5);

        // Tag-cache + tag-data both load the user's spoiler state. Strict-read so
        // corruption is detected (rate-limited warn), then fall back to null so the
        // strip silently no-ops rather than 503-ing the unrelated tag-cache request —
        // the user's own /spoiler-blur/series endpoint will 503 next call. See
        // IsMovieInSpoilerScope for scope semantics (direct or via opted-in BoxSet).

        /// <summary>
        /// Logs a high-frequency polling request, consolidating repeated identical calls into a
        /// single summary line every <see cref="_pollLogInterval"/> rather than one line per poll.
        /// </summary>
        private void LogPollingRequest(string userDisplay, string requestUri, string dedupKey)
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

                var client = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
                client.Timeout = TimeSpan.FromSeconds(10);

                using var avatarRequest = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Get, $"{jellyseerrUrl}{avatarPath}");
                // explicit User-Agent + Accept so Cloudflare's bot
                // mode doesn't return an HTML challenge page that we'd try to
                // serve as an image.
                avatarRequest.Headers.UserAgent.ParseAdd(Helpers.Jellyseerr.SeerrHttpHelper.UserAgent);
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
    public class TmdbPersonData
    {
        public DateTime? BirthDate { get; set; }
        public DateTime? DeathDate { get; set; }
        public string? BirthPlace { get; set; }
    }
}
