using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Extensions;
using Microsoft.EntityFrameworkCore;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Api.SeerrCacheState;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class SeerrSynchronizationController : UserControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;
        private readonly IUserDataManager _userDataManager;
        private readonly SeerrIdentityService _seerrIdentity;
        private readonly SeerrWatchlistService _watchlist;

        public SeerrSynchronizationController(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            IUserDataManager userDataManager,
            SeerrIdentityService seerrIdentity,
            SeerrWatchlistService watchlist) : base(userManager)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _userDataManager = userDataManager;
            _seerrIdentity = seerrIdentity;
            _watchlist = watchlist;
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

                int itemsProcessed = 0;
                int itemsAdded = 0;
                var errors = new List<string>();

                foreach (var user in _userManager.GetAllUsers())
                {
                    try
                    {
                        _logger.Info($"[Manual Watchlist Sync] Processing user: {user.Username} ({user.Id})");

                        // Get Seerr user ID for this Jellyfin user
                        var jellyseerrUserId = await _seerrIdentity.GetJellyseerrUserId(user.Id.ToString());
                        if (string.IsNullOrEmpty(jellyseerrUserId))
                        {
                            _logger.Warning($"[Manual Watchlist Sync] Could not find Seerr user for {user.Username}");
                            continue;
                        }

                        // Get watchlist from Seerr
                        var watchlistItems = await _watchlist.GetJellyseerrWatchlistForUser(jellyseerrUserId);
                        if (watchlistItems == null || watchlistItems.Count == 0)
                        {
                            _logger.Info($"[Manual Watchlist Sync] No watchlist items found for {user.Username}");
                            watchlistItems = new List<SeerrWatchlistService.WatchlistItem>();
                        }

                        _logger.Info($"[Manual Watchlist Sync] Found {watchlistItems.Count} watchlist items for {user.Username}");

                        var requestItems = await _watchlist.GetJellyseerrRequestsForUser(jellyseerrUserId);
                        if (requestItems != null && requestItems.Count > 0)
                        {
                            _logger.Info($"[Manual Watchlist Sync] Found {requestItems.Count} request items for {user.Username}");
                            watchlistItems.AddRange(requestItems);
                        }

                        var processedKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                        // Process each watchlist item
                        foreach (var item in watchlistItems)
                        {
                            itemsProcessed++;

                            var key = $"{item.MediaType}:{item.TmdbId}";
                            if (!processedKeys.Add(key))
                            {
                                continue;
                            }

                            // Find the item in Jellyfin library by TMDB ID
                            var libraryItem = _watchlist.FindItemByTmdbId(item.TmdbId, item.MediaType);
                            if (libraryItem != null)
                            {
                                var userData = _userDataManager.GetUserData(user, libraryItem);
                                if (userData == null)
                                {
                                    _logger.Warning($"[Manual Watchlist Sync] User data was null for '{libraryItem.Name}' and user {user.Username}; skipping.");
                                }
                                else if (userData.Likes != true)
                                {
                                    userData.Likes = true;
                                    _userDataManager.SaveUserData(user, libraryItem, userData, UserDataSaveReason.UpdateUserRating, default);
                                    itemsAdded++;
                                    _logger.Info($"[Manual Watchlist Sync] Added '{libraryItem.Name}' to watchlist for {user.Username}");
                                }
                            }
                            else
                            {
                                // Item not in library yet - WatchlistMonitor will automatically add it when it arrives
                                _logger.Debug($"[Manual Watchlist Sync] Item TMDB {item.TmdbId} ({item.MediaType}) not in library yet for {user.Username} - will be auto-added by WatchlistMonitor when available");
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"[Manual Watchlist Sync] Error processing user {user.Username}: {ex.Message}");
                        errors.Add("Failed to sync watchlist for a user.");
                    }
                }

                _logger.Info($"[Manual Watchlist Sync] Sync complete. Processed: {itemsProcessed}, Added: {itemsAdded}");

                return Ok(new
                {
                    success = true,
                    itemsProcessed,
                    itemsAdded,
                    errors = errors.Count > 0 ? errors : null
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
                    SeerrIdentityService.ClearUserCaches();
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
    }
}
