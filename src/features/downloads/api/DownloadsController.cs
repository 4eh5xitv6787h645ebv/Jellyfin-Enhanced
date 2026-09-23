using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Arr;
using Microsoft.EntityFrameworkCore;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Api.SeerrCacheState;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class DownloadsController : UserControllerBase
    {
        private readonly SeerrIdentityService _seerrIdentity;
        private readonly SeerrWatchlistService _watchlist;
        private readonly ArrApiClient _arrClient;
        private readonly OutboundApiPolicy _outboundPolicy;

        public DownloadsController(
            SeerrIdentityService seerrIdentity,
            SeerrWatchlistService watchlist,
            ArrApiClient arrClient,
            OutboundApiPolicy outboundPolicy,
            IUserManager userManager) : base(userManager)
        {
            _seerrIdentity = seerrIdentity;
            _watchlist = watchlist;
            _arrClient = arrClient;
            _outboundPolicy = outboundPolicy;
        }

        /// <summary>
        /// Non-admin users can only see downloads/history for items they requested via Seerr,
        /// unless the admin has disabled per-user filtering. Returns Blocked=true when the
        /// caller should be shown an empty result (no Seerr link, no linked account, or no
        /// requests to filter by) rather than the unfiltered arr queue/history.
        /// </summary>
        private async Task<(bool Blocked, HashSet<(int TmdbId, string MediaType)>? Allowed)> GetAllowedRequestsForCurrentUserAsync(PluginConfiguration config)
        {
            if (IsAdminUser() || !config.DownloadsFilterByUserRequests)
                return (false, null);

            if (!config.JellyseerrEnabled || string.IsNullOrWhiteSpace(config.JellyseerrUrls) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
                return (true, null);

            var jellyfinUserId = UserHelper.GetCurrentUserId(User)?.ToString();
            if (string.IsNullOrEmpty(jellyfinUserId))
                return (true, null);

            var jellyseerrUserId = await _seerrIdentity.GetJellyseerrUserId(jellyfinUserId);
            if (string.IsNullOrEmpty(jellyseerrUserId))
                return (true, null);

            var userRequests = await _watchlist.GetJellyseerrRequestsForUser(jellyseerrUserId);
            if (userRequests == null || userRequests.Count == 0)
                return (true, null);

            return (false, new HashSet<(int, string)>(userRequests.Select(r => (r.TmdbId, r.MediaType))));
        }

        private static TimeSpan GetArrPollCacheTtl(PluginConfiguration config)
        {
            return TimeSpan.FromSeconds(Math.Clamp(config.DownloadsPollIntervalSeconds, 5, 300));
        }

        private static List<object> FilterQueueItemsByAllowedRequests(List<object> items, HashSet<(int TmdbId, string MediaType)>? allowedRequests)
        {
            if (allowedRequests == null) return items;
            var filtered = new List<object>();
            foreach (dynamic item in items)
            {
                string mediaType = item.source == nameof(ArrType.Sonarr) ? "tv" : "movie";
                int? tmdbId = item.tmdbId;
                if (tmdbId.HasValue && allowedRequests.Contains((tmdbId.Value, mediaType)))
                    filtered.Add(item);
            }
            return filtered;
        }

        private static List<dynamic> FilterHistoryItemsByAllowedRequests(List<dynamic> items, HashSet<(int TmdbId, string MediaType)>? allowedRequests)
        {
            if (allowedRequests == null) return items;
            var filtered = new List<dynamic>();
            foreach (var item in items)
            {
                string mediaType = item.source == nameof(ArrType.Sonarr) ? "tv" : "movie";
                int? tmdbId = item.tmdbId;
                if (tmdbId.HasValue && allowedRequests.Contains((tmdbId.Value, mediaType)))
                    filtered.Add(item);
            }
            return filtered;
        }

        [HttpGet("arr/queue")]
        [Authorize]
        public async Task<IActionResult> GetDownloadQueue()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
                return StatusCode(500, "Plugin configuration not available");

            var (blocked, allowedRequests) = await GetAllowedRequestsForCurrentUserAsync(config);
            if (blocked)
                return Ok(new { items = new List<object>(), errors = new List<object>() });

            _outboundPolicy.WarnIfArrInstancesCorrupt(config);
            var sonarrInstances = config.GetEnabledSonarrInstances();
            var radarrInstances = config.GetEnabledRadarrInstances();

            var ttl = GetArrPollCacheTtl(config);
            List<object>? rawItems = null;
            List<object>? errors = null;
            lock (_arrQueueCacheLock)
            {
                if (_arrQueueCache.HasValue && DateTime.UtcNow - _arrQueueCache.Value.CachedAt < ttl)
                {
                    rawItems = _arrQueueCache.Value.Items;
                    errors = _arrQueueCache.Value.Errors;
                }
            }

            if (rawItems == null || errors == null)
            {
                var ct = HttpContext.RequestAborted;
                var sonarrTasks = sonarrInstances.Select(i => _arrClient.FetchSonarrQueue(i, ct)).ToList();
                var radarrTasks = radarrInstances.Select(i => _arrClient.FetchRadarrQueue(i, ct)).ToList();

                var sonarrResults = await Task.WhenAll(sonarrTasks);
                var radarrResults = await Task.WhenAll(radarrTasks);

                rawItems = new List<object>();
                errors = new List<object>();
                if (config.IsSonarrInstancesCorrupt())
                    errors.Add(new { instanceName = "Sonarr", source = "Sonarr", reason = "config corrupt — see server logs" });
                else if (sonarrInstances.Count == 0 && config.GetSonarrInstances().Count > 0)
                    errors.Add(new { instanceName = "Sonarr", source = "Sonarr", reason = "all Sonarr instances are disabled" });
                if (config.IsRadarrInstancesCorrupt())
                    errors.Add(new { instanceName = "Radarr", source = "Radarr", reason = "config corrupt — see server logs" });
                else if (radarrInstances.Count == 0 && config.GetRadarrInstances().Count > 0)
                    errors.Add(new { instanceName = "Radarr", source = "Radarr", reason = "all Radarr instances are disabled" });
                for (int i = 0; i < sonarrResults.Length; i++)
                {
                    rawItems.AddRange(sonarrResults[i].Items);
                    if (sonarrResults[i].Error != null)
                        errors.Add(new { instanceName = sonarrInstances[i].Name, source = "Sonarr", reason = sonarrResults[i].Error });
                }
                for (int i = 0; i < radarrResults.Length; i++)
                {
                    rawItems.AddRange(radarrResults[i].Items);
                    if (radarrResults[i].Error != null)
                        errors.Add(new { instanceName = radarrInstances[i].Name, source = "Radarr", reason = radarrResults[i].Error });
                }

                lock (_arrQueueCacheLock)
                {
                    _arrQueueCache = (rawItems, errors, DateTime.UtcNow);
                }
            }

            var items = FilterQueueItemsByAllowedRequests(rawItems, allowedRequests);
            return Ok(new { items, errors });
        }

        [HttpGet("arr/history")]
        [Authorize]
        public async Task<IActionResult> GetDownloadHistory([FromQuery] int take = 20, [FromQuery] int skip = 0)
        {
            take = Math.Clamp(take, 1, 50);
            skip = Math.Max(0, skip);

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
                return StatusCode(500, "Plugin configuration not available");

            if (!config.DownloadsShowHistory)
                return Ok(new { items = new List<object>(), totalPages = 0, visible = false });

            if (config.DownloadsHistoryAdminOnly && !IsAdminUser())
                return Ok(new { items = new List<object>(), totalPages = 0, visible = false });

            var (blocked, allowedRequests) = await GetAllowedRequestsForCurrentUserAsync(config);
            if (blocked)
                return Ok(new { items = new List<object>(), totalPages = 0, visible = true });

            var sonarrInstances = config.GetEnabledSonarrInstances();
            var radarrInstances = config.GetEnabledRadarrInstances();

            var ttl = GetArrPollCacheTtl(config);
            List<dynamic>? rawItems = null;
            lock (_arrHistoryCacheLock)
            {
                if (_arrHistoryCache.HasValue && DateTime.UtcNow - _arrHistoryCache.Value.CachedAt < ttl)
                    rawItems = _arrHistoryCache.Value.Items;
            }

            if (rawItems == null)
            {
                var ct = HttpContext.RequestAborted;
                var sonarrTasks = sonarrInstances.Select(i => _arrClient.FetchSonarrHistory(i, ct)).ToList();
                var radarrTasks = radarrInstances.Select(i => _arrClient.FetchRadarrHistory(i, ct)).ToList();

                var sonarrResults = await Task.WhenAll(sonarrTasks);
                var radarrResults = await Task.WhenAll(radarrTasks);

                var merged = new List<dynamic>();
                foreach (var result in sonarrResults) merged.AddRange(result.Items);
                foreach (var result in radarrResults) merged.AddRange(result.Items);

                rawItems = merged
                    .OrderByDescending(i => (DateTime?)i.date ?? DateTime.MinValue)
                    .Take(ArrApiClient.HistoryWindowSize)
                    .ToList();

                lock (_arrHistoryCacheLock)
                {
                    _arrHistoryCache = (rawItems, DateTime.UtcNow);
                }
            }

            var filtered = FilterHistoryItemsByAllowedRequests(rawItems, allowedRequests);
            var totalPages = filtered.Count == 0 ? 0 : (int)Math.Ceiling(filtered.Count / (double)take);
            var page = filtered.Skip(skip).Take(take).ToList();

            return Ok(new { items = page, totalPages, visible = true });
        }
    }
}
