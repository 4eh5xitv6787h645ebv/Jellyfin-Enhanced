using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks
{
    // Scheduled task that syncs Jellyseerr user requests to Jellyfin watchlist.
    public partial class JellyseerrRequestsSyncTask : IScheduledTask
    {
        private readonly ILibraryManager _libraryManager;
        private readonly IUserManager _userManager;
        private readonly IUserDataManager _userDataManager;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Configuration.UserConfigurationManager _userConfigurationManager;
        private readonly Logger _logger;

        public JellyseerrRequestsSyncTask(
            ILibraryManager libraryManager,
            IUserManager userManager,
            IUserDataManager userDataManager,
            IHttpClientFactory httpClientFactory,
            Configuration.UserConfigurationManager userConfigurationManager,
            Logger logger)
        {
            _libraryManager = libraryManager;
            _userManager = userManager;
            _userDataManager = userDataManager;
            _httpClientFactory = httpClientFactory;
            _userConfigurationManager = userConfigurationManager;
            _logger = logger;
        }

        public string Name => "Sync Jellyseerr Requests to Jellyfin Watchlist";
        public string Key => "JellyfinEnhancedJellyseerrRequestsSync";
        public string Description => "Syncs media requested by users in Jellyseerr to their Jellyfin watchlists. Useful for backfilling requests made outside Jellyfin Enhanced.";
        public string Category => "Jellyfin Enhanced";
        // GetDefaultTriggers implemented in version-specific partials

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled || !config.SyncJellyseerrRequests)
            {
                _logger.Info("[Jellyseerr Requests Sync] Sync is disabled in plugin configuration.");
                progress?.Report(100);
                return;
            }

            if (string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                _logger.Warning("[Jellyseerr Requests Sync] Jellyseerr URL or API key not configured.");
                progress?.Report(100);
                return;
            }

            var urls = config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var baseUrl = urls.FirstOrDefault()?.Trim();
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                _logger.Warning("[Jellyseerr Requests Sync] No valid Jellyseerr URL found.");
                progress?.Report(100);
                return;
            }

            _logger.Info("[Jellyseerr Requests Sync] Starting sync...");
            var http = _httpClientFactory.CreateClient();
            http.DefaultRequestHeaders.Remove("X-Api-Key");
            http.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);

            var users = _userManager.Users.ToList();
            var total = users.Count;
            var idx = 0;
            var totalAdded = 0;

            foreach (var jfUser in users)
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    _logger.Info($"[Jellyseerr Requests Sync] Processing user: {jfUser.Username}");
                    var jellyseerrUserId = await GetJellyseerrUserId(http, baseUrl, jfUser.Id.ToString());
                    if (string.IsNullOrEmpty(jellyseerrUserId))
                    {
                        _logger.Warning($"[Jellyseerr Requests Sync] No linked Jellyseerr user for {jfUser.Username}");
                        idx++; progress?.Report((double)idx / total * 100); continue;
                    }

                    var requests = await GetUserRequests(http, baseUrl, jellyseerrUserId);
                    if (requests == null || requests.Count == 0)
                    {
                        _logger.Info($"[Jellyseerr Requests Sync] No requests found for {jfUser.Username}");
                        idx++; progress?.Report((double)idx / total * 100); continue;
                    }

                    var added = 0; var pending = 0;
                    foreach (var req in requests)
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        var result = await ProcessRequestItem(jfUser, req);
                        if (result == WatchlistItemResult.Added) { added++; totalAdded++; }
                        else if (result == WatchlistItemResult.AddedToPending) { pending++; }
                    }

                    _logger.Info($"[Jellyseerr Requests Sync] User {jfUser.Username}: Added {added}, pending {pending}");
                }
                catch (Exception ex)
                {
                    _logger.Error($"[Jellyseerr Requests Sync] Error processing user {jfUser.Username}: {ex.Message}");
                }
                finally
                {
                    idx++; progress?.Report((double)idx / total * 100);
                }
            }

            _logger.Info($"[Jellyseerr Requests Sync] Completed. Added {totalAdded} items across {total} users");
            progress?.Report(100);
        }

        private async Task<string?> GetJellyseerrUserId(HttpClient http, string baseUrl, string jellyfinUserId)
        {
            try
            {
                var uri = $"{baseUrl.TrimEnd('/')}/api/v1/user?take=1000";
                var resp = await http.GetAsync(uri);
                if (!resp.IsSuccessStatusCode) return null;
                var json = JsonSerializer.Deserialize<JsonElement>(await resp.Content.ReadAsStringAsync());
                if (!json.TryGetProperty("results", out var arr)) return null;
                var normalizedJf = jellyfinUserId.Replace("-", "");
                foreach (var u in arr.EnumerateArray())
                {
                    if (u.TryGetProperty("jellyfinUserId", out var jfId))
                    {
                        var val = (jfId.GetString() ?? string.Empty).Replace("-", "");
                        if (string.Equals(val, normalizedJf, StringComparison.OrdinalIgnoreCase))
                        {
                            if (u.TryGetProperty("id", out var id)) return id.GetInt32().ToString();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"[Jellyseerr Requests Sync] Error getting Jellyseerr user id: {ex.Message}");
            }
            return null;
        }

        private async Task<List<RequestItem>?> GetUserRequests(HttpClient http, string baseUrl, string jellyseerrUserId)
        {
            // Try user-specific endpoint first, then fall back to query param.
            var endpoints = new List<string>
            {
                $"{baseUrl.TrimEnd('/')}/api/v1/user/{jellyseerrUserId}/requests?take=1000",
                $"{baseUrl.TrimEnd('/')}/api/v1/request?take=1000&requestedBy={jellyseerrUserId}"
            };

            foreach (var uri in endpoints)
            {
                try
                {
                    // Some instances require X-Api-User for user-scoped endpoints
                    http.DefaultRequestHeaders.Remove("X-Api-User");
                    http.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId);

                    var resp = await http.GetAsync(uri);
                    if (!resp.IsSuccessStatusCode) continue;
                    var content = await resp.Content.ReadAsStringAsync();
                    var root = JsonSerializer.Deserialize<JsonElement>(content);

                    var list = new List<RequestItem>();

                    // Common patterns: { results: [...] } or an array directly
                    IEnumerable<JsonElement> items;
                    if (root.ValueKind == JsonValueKind.Array)
                    {
                        items = root.EnumerateArray();
                    }
                    else if (root.TryGetProperty("results", out var results) && results.ValueKind == JsonValueKind.Array)
                    {
                        items = results.EnumerateArray();
                    }
                    else
                    {
                        continue;
                    }

                    foreach (var it in items)
                    {
                        int? tmdbId = null; string? mediaType = null; string? title = null;
                        if (it.TryGetProperty("media", out var media))
                        {
                            if (media.TryGetProperty("tmdbId", out var t)) tmdbId = SafeGetInt(t);
                            if (media.TryGetProperty("mediaType", out var mt)) mediaType = mt.GetString();
                            if (media.TryGetProperty("title", out var tt)) title = tt.GetString();
                        }
                        // Fallbacks
                        if (tmdbId == null && it.TryGetProperty("tmdbId", out var t2)) tmdbId = SafeGetInt(t2);
                        if (string.IsNullOrEmpty(mediaType) && it.TryGetProperty("mediaType", out var mt2)) mediaType = mt2.GetString();
                        if (string.IsNullOrEmpty(mediaType) && it.TryGetProperty("type", out var tp)) mediaType = tp.GetString();
                        if (string.IsNullOrEmpty(title) && it.TryGetProperty("title", out var tTitle)) title = tTitle.GetString();

                        if (tmdbId.HasValue && !string.IsNullOrEmpty(mediaType))
                        {
                            list.Add(new RequestItem { TmdbId = tmdbId.Value, MediaType = mediaType!, Title = title ?? string.Empty });
                        }
                    }

                    return list;
                }
                catch (Exception ex)
                {
                    _logger.Warning($"[Jellyseerr Requests Sync] Failed to fetch requests from {uri}: {ex.Message}");
                    continue;
                }
            }

            return null;
        }

        private static int? SafeGetInt(JsonElement el)
        {
            try { return el.ValueKind == JsonValueKind.String ? int.Parse(el.GetString() ?? "0") : el.GetInt32(); }
            catch { return null; }
        }

        private enum WatchlistItemResult
        {
            Added,
            AddedToPending,
            AlreadyInWatchlist,
            Skipped
        }

        private Task<WatchlistItemResult> ProcessRequestItem(JUser user, RequestItem request)
        {
            try
            {
                var itemType = request.MediaType == "movie" ? BaseItemKind.Movie : BaseItemKind.Series;
                var items = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = new[] { itemType },
                    HasTmdbId = true,
                    Recursive = true
                });

                var libraryItem = items.FirstOrDefault(i =>
                {
                    if (i.ProviderIds != null && i.ProviderIds.TryGetValue("Tmdb", out var tmdb))
                    {
                        return tmdb == request.TmdbId.ToString();
                    }
                    return false;
                });

                if (libraryItem == null)
                {
                    _logger.Debug($"[Jellyseerr Requests Sync] Item not found in library: {request.Title} (TMDB: {request.TmdbId}), adding to pending");
                    var pending = _userConfigurationManager.GetUserConfiguration<Configuration.PendingWatchlistItems>(user.Id.ToString(), "pending-watchlist.json");
                    var exists = pending.Items.Any(i => i.TmdbId == request.TmdbId && string.Equals(i.MediaType, request.MediaType, StringComparison.OrdinalIgnoreCase));
                    if (!exists)
                    {
                        pending.Items.Add(new Configuration.PendingWatchlistItem
                        {
                            TmdbId = request.TmdbId,
                            MediaType = request.MediaType,
                            RequestedAt = DateTime.UtcNow
                        });
                        _userConfigurationManager.SaveUserConfiguration(user.Id.ToString(), "pending-watchlist.json", pending);
                        _logger.Info($"[Jellyseerr Requests Sync] ✓ Added to pending: {request.Title} (TMDB: {request.TmdbId}) for {user.Username}");
                        return Task.FromResult(WatchlistItemResult.AddedToPending);
                    }
                    return Task.FromResult(WatchlistItemResult.Skipped);
                }

                var userData = _userDataManager.GetUserData(user, libraryItem);
                if (userData == null)
                {
                    _logger.Warning($"[Jellyseerr Requests Sync] User data null for {libraryItem.Name}; skipping");
                    return Task.FromResult(WatchlistItemResult.Skipped);
                }
                if (userData.Likes == true)
                {
                    return Task.FromResult(WatchlistItemResult.AlreadyInWatchlist);
                }

                userData.Likes = true;
                _userDataManager.SaveUserData(user, libraryItem, userData, UserDataSaveReason.UpdateUserRating, default);
                _logger.Info($"[Jellyseerr Requests Sync] ✓ Added to watchlist: {libraryItem.Name} for {user.Username}");
                return Task.FromResult(WatchlistItemResult.Added);
            }
            catch (Exception ex)
            {
                _logger.Error($"[Jellyseerr Requests Sync] Error processing request item: {ex.Message}");
                return Task.FromResult(WatchlistItemResult.Skipped);
            }
        }

        private class RequestItem
        {
            public int TmdbId { get; set; }
            public string MediaType { get; set; } = string.Empty;
            public string Title { get; set; } = string.Empty;
        }
    }
}
