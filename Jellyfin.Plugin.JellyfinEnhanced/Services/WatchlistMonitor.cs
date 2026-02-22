using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    // Monitors library additions to automatically add requested media to user watchlists.
    // Queries Jellyseerr API directly to check if added items were requested by users.
    // Includes request caching and event debouncing to minimize API calls.
    public class WatchlistMonitor : IDisposable
    {
        private readonly ILibraryManager _libraryManager;
        private readonly IUserManager _userManager;
        private readonly IUserDataManager _userDataManager;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly UserConfigurationManager _userConfigurationManager;
        private readonly Logger _logger;

        // Cached Jellyseerr requests with TTL
        private List<RequestItemWithUser>? _cachedRequests;
        private DateTime _requestsCacheExpiry = DateTime.MinValue;
        private readonly SemaphoreSlim _requestsCacheSemaphore = new(1, 1);
        private static readonly TimeSpan RequestsCacheTtl = TimeSpan.FromMinutes(2);

        // Debounce: collect items and process them in batches
        private readonly ConcurrentQueue<(ItemChangeEventArgs Args, string EventType)> _pendingItems = new();
        private Timer? _debounceTimer;
        private static readonly TimeSpan DebounceDelay = TimeSpan.FromSeconds(5);
        private int _processingBatch;

        public WatchlistMonitor(
            ILibraryManager libraryManager,
            IUserManager userManager,
            IUserDataManager userDataManager,
            IHttpClientFactory httpClientFactory,
            UserConfigurationManager userConfigurationManager,
            Logger logger)
        {
            _libraryManager = libraryManager;
            _userManager = userManager;
            _userDataManager = userDataManager;
            _httpClientFactory = httpClientFactory;
            _userConfigurationManager = userConfigurationManager;
            _logger = logger;
        }

        // Initialize and start monitoring library events.
        public void Initialize()
        {
            // Only initialize if the watchlist feature is enabled in plugin configuration.
            var config = JellyfinEnhanced.Instance?.Configuration as Configuration.PluginConfiguration;
            if (config == null)
            {
                _logger.Warning("[Watchlist] Configuration is null - skipping watchlist monitoring initialization");
                return;
            }

            if (!config.AddRequestedMediaToWatchlist || !config.JellyseerrEnabled)
            {
                _logger.Info("[Watchlist] Watchlist monitoring is disabled in configuration - not subscribing to library events");
                return;
            }

            _libraryManager.ItemAdded += OnItemAdded;
            _libraryManager.ItemUpdated += OnItemUpdated;
            _logger.Info("[Watchlist] Successfully subscribed to library ItemAdded and ItemUpdated events");
        }

        // Handle library item added events - queue for debounced processing.
        private void OnItemAdded(object? sender, ItemChangeEventArgs e)
        {
            QueueItemForProcessing(e, "ItemAdded");
        }

        // Handle library item updated events - queue for debounced processing.
        private void OnItemUpdated(object? sender, ItemChangeEventArgs e)
        {
            QueueItemForProcessing(e, "ItemUpdated");
        }

        // Queue an item for debounced batch processing.
        private void QueueItemForProcessing(ItemChangeEventArgs e, string eventType)
        {
            // Only queue movies and TV series
            var itemKind = e.Item?.GetBaseItemKind();
            if (itemKind != BaseItemKind.Movie && itemKind != BaseItemKind.Series)
            {
                return;
            }

            _pendingItems.Enqueue((e, eventType));

            // Reset the debounce timer - process after DebounceDelay of inactivity
            _debounceTimer?.Dispose();
            _debounceTimer = new Timer(
                _ => _ = ProcessPendingItemsBatch(),
                null,
                DebounceDelay,
                Timeout.InfiniteTimeSpan);
        }

        // Process all pending items as a single batch with one API call.
        private async Task ProcessPendingItemsBatch()
        {
            // Prevent concurrent batch processing
            if (Interlocked.CompareExchange(ref _processingBatch, 1, 0) != 0)
            {
                return;
            }

            try
            {
                // Drain the queue
                var items = new List<(ItemChangeEventArgs Args, string EventType)>();
                while (_pendingItems.TryDequeue(out var item))
                {
                    items.Add(item);
                }

                if (items.Count == 0)
                {
                    return;
                }

                _logger.Debug($"[Watchlist] Processing batch of {items.Count} items");

                var config = JellyfinEnhanced.Instance?.Configuration as PluginConfiguration;
                if (config == null || !config.AddRequestedMediaToWatchlist || !config.JellyseerrEnabled)
                {
                    return;
                }

                var jellyseerrUrl = config.JellyseerrUrls?.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Trim();
                if (string.IsNullOrEmpty(jellyseerrUrl) || string.IsNullOrEmpty(config.JellyseerrApiKey))
                {
                    return;
                }

                // Fetch all requests ONCE for the entire batch (cached)
                var allRequests = await GetCachedJellyseerrRequests(jellyseerrUrl, config.JellyseerrApiKey);
                if (allRequests == null || allRequests.Count == 0)
                {
                    return;
                }

                // Process each item against the cached requests
                foreach (var (args, eventType) in items)
                {
                    await ProcessSingleItem(args, eventType, allRequests, config);
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"[Watchlist] Error processing batch: {ex.Message}\nStack trace: {ex.StackTrace}");
            }
            finally
            {
                Interlocked.Exchange(ref _processingBatch, 0);
            }
        }

        // Process a single item against the pre-fetched request list.
        private Task ProcessSingleItem(ItemChangeEventArgs e, string eventType, List<RequestItemWithUser> allRequests, PluginConfiguration config)
        {
            try
            {
                if (e.Item?.ProviderIds == null)
                {
                    return Task.CompletedTask;
                }

                if (!e.Item.ProviderIds.TryGetValue("Tmdb", out var tmdbIdString))
                {
                    return Task.CompletedTask;
                }

                if (!int.TryParse(tmdbIdString, out var tmdbId))
                {
                    _logger.Warning($"[Watchlist] Invalid TMDB ID format: {tmdbIdString}");
                    return Task.CompletedTask;
                }

                var itemKind = e.Item.GetBaseItemKind();
                var mediaType = itemKind == BaseItemKind.Movie ? "movie" : "tv";

                // Find requests matching this TMDB ID and media type
                var matchingRequests = allRequests.Where(r => r.TmdbId == tmdbId && r.MediaType == mediaType && !string.IsNullOrEmpty(r.RequestedByJellyfinUserId)).ToList();

                if (matchingRequests.Count == 0)
                {
                    return Task.CompletedTask;
                }

                // Add to watchlist for each user who requested it
                var addedCount = 0;
                var addedUsers = new List<string>();

                foreach (var request in matchingRequests)
                {
                    var jellyfinUserId = request.RequestedByJellyfinUserId!.Replace("-", "");
                    var user = _userManager.Users.FirstOrDefault(u => u.Id.ToString().Replace("-", "").Equals(jellyfinUserId, StringComparison.OrdinalIgnoreCase));

                    if (user == null)
                    {
                        continue;
                    }

                    // Check if prevention is enabled and item was already processed
                    if (config.PreventWatchlistReAddition)
                    {
                        var processedItems = _userConfigurationManager.GetProcessedWatchlistItems(user.Id);
                        if (processedItems.Items.Any(p => p.TmdbId == tmdbId && p.MediaType == mediaType))
                        {
                            continue;
                        }
                    }

                    var userData = _userDataManager.GetUserData(user, e.Item);
                    if (userData != null && userData.Likes != true)
                    {
                        userData.Likes = true;
                        _userDataManager.SaveUserData(user, e.Item, userData, UserDataSaveReason.UpdateUserRating, default);
                        addedCount++;
                        addedUsers.Add(user.Username);

                        if (config.PreventWatchlistReAddition)
                        {
                            var processedItems = _userConfigurationManager.GetProcessedWatchlistItems(user.Id);
                            processedItems.Items.Add(new ProcessedWatchlistItem
                            {
                                TmdbId = tmdbId,
                                MediaType = mediaType,
                                ProcessedAt = System.DateTime.UtcNow,
                                Source = "monitor"
                            });
                            _userConfigurationManager.SaveProcessedWatchlistItems(user.Id, processedItems);
                        }
                    }
                    else if (userData != null && userData.Likes == true && config.PreventWatchlistReAddition)
                    {
                        var processedItems = _userConfigurationManager.GetProcessedWatchlistItems(user.Id);
                        if (!processedItems.Items.Any(p => p.TmdbId == tmdbId && p.MediaType == mediaType))
                        {
                            processedItems.Items.Add(new ProcessedWatchlistItem
                            {
                                TmdbId = tmdbId,
                                MediaType = mediaType,
                                ProcessedAt = System.DateTime.UtcNow,
                                Source = "existing"
                            });
                            _userConfigurationManager.SaveProcessedWatchlistItems(user.Id, processedItems);
                        }
                    }
                }

                if (addedCount > 0)
                {
                    _logger.Info($"[Watchlist] ✓ Added '{e.Item.Name}' to watchlist for {string.Join(", ", addedUsers)}");
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"[Watchlist] Error processing item: {ex.Message}");
            }

            return Task.CompletedTask;
        }

        // Get ALL requests from Jellyseerr with caching.
        private async Task<List<RequestItemWithUser>?> GetCachedJellyseerrRequests(string jellyseerrUrl, string apiKey)
        {
            // Check cache first
            if (_cachedRequests != null && DateTime.UtcNow < _requestsCacheExpiry)
            {
                return _cachedRequests;
            }

            await _requestsCacheSemaphore.WaitAsync().ConfigureAwait(false);
            try
            {
                // Double-check after acquiring lock
                if (_cachedRequests != null && DateTime.UtcNow < _requestsCacheExpiry)
                {
                    return _cachedRequests;
                }

                var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Add("X-Api-Key", apiKey);

                var requestUri = $"{jellyseerrUrl.TrimEnd('/')}/api/v1/request?take=1000&skip=0&sort=added&filter=all";
                var response = await httpClient.GetAsync(requestUri).ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.Warning($"[Watchlist] Failed to fetch requests from Jellyseerr: {response.StatusCode}");
                    return null;
                }

                var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var json = JsonSerializer.Deserialize<JsonElement>(content);

                if (!json.TryGetProperty("results", out var resultsArray))
                {
                    _logger.Warning("[Watchlist] Requests response missing results array");
                    return null;
                }

                var items = new List<RequestItemWithUser>();
                foreach (var item in resultsArray.EnumerateArray())
                {
                    var parsed = ParseRequestItemWithUser(item);
                    if (parsed != null)
                    {
                        items.Add(parsed);
                    }
                }

                _cachedRequests = items;
                _requestsCacheExpiry = DateTime.UtcNow.Add(RequestsCacheTtl);
                _logger.Debug($"[Watchlist] Cached {items.Count} Jellyseerr requests (TTL: {RequestsCacheTtl.TotalMinutes}min)");

                return items;
            }
            finally
            {
                _requestsCacheSemaphore.Release();
            }
        }

        // Parse a request item including the requesting user's Jellyfin ID
        private RequestItemWithUser? ParseRequestItemWithUser(JsonElement item)
        {
            try
            {
                int? tmdbId = null;
                string? mediaType = null;
                string? requestedByJellyfinUserId = null;

                if (item.TryGetProperty("type", out var typeElement))
                {
                    mediaType = typeElement.GetString() switch
                    {
                        "movie" => "movie",
                        "tv" => "tv",
                        _ => null
                    };
                }

                if (item.TryGetProperty("media", out var mediaElement))
                {
                    if (mediaElement.TryGetProperty("tmdbId", out var tmdbElement) && tmdbElement.ValueKind == JsonValueKind.Number)
                    {
                        tmdbId = tmdbElement.GetInt32();
                    }
                }

                if (item.TryGetProperty("requestedBy", out var requestedByElement))
                {
                    if (requestedByElement.TryGetProperty("jellyfinUserId", out var jellyfinUserIdElement))
                    {
                        requestedByJellyfinUserId = jellyfinUserIdElement.GetString();
                    }
                }

                if (tmdbId.HasValue && mediaType != null && !string.IsNullOrEmpty(requestedByJellyfinUserId))
                {
                    return new RequestItemWithUser
                    {
                        TmdbId = tmdbId.Value,
                        MediaType = mediaType,
                        RequestedByJellyfinUserId = requestedByJellyfinUserId
                    };
                }
            }
            catch (Exception ex)
            {
                _logger.Debug($"[Watchlist] Error parsing request item: {ex.Message}");
            }

            return null;
        }

        // Cleanup when the plugin is disposed.
        public void Dispose()
        {
            _logger.Info("[Watchlist] Unsubscribing from library events");
            _libraryManager.ItemAdded -= OnItemAdded;
            _libraryManager.ItemUpdated -= OnItemUpdated;
            _debounceTimer?.Dispose();
            _requestsCacheSemaphore.Dispose();
            GC.SuppressFinalize(this);
        }

        private class RequestItemWithUser
        {
            public int TmdbId { get; set; }
            public string MediaType { get; set; } = string.Empty;
            public string? RequestedByJellyfinUserId { get; set; }
        }
    }
}
