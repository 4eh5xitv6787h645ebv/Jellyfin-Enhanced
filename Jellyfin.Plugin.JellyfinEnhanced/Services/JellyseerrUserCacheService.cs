using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    // Centralized cache for Jellyseerr user lookups.
    // Prevents multiple services from independently fetching the full user list.
    public class JellyseerrUserCacheService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;
        private readonly SemaphoreSlim _fetchSemaphore = new(1, 1);

        private List<CachedJellyseerrUser>? _cachedUsers;
        private DateTime _cacheExpiry = DateTime.MinValue;
        private string? _cachedUrl;
        private string? _cachedApiKey;

        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

        public JellyseerrUserCacheService(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        // Gets all Jellyseerr users, using cache when available.
        public async Task<List<CachedJellyseerrUser>> GetUsersAsync(string jellyseerrUrl, string apiKey)
        {
            // Check if cache is valid (same URL/key and not expired)
            if (_cachedUsers != null
                && DateTime.UtcNow < _cacheExpiry
                && _cachedUrl == jellyseerrUrl
                && _cachedApiKey == apiKey)
            {
                return _cachedUsers;
            }

            // Use semaphore to prevent concurrent fetches
            await _fetchSemaphore.WaitAsync().ConfigureAwait(false);
            try
            {
                // Double-check after acquiring lock
                if (_cachedUsers != null
                    && DateTime.UtcNow < _cacheExpiry
                    && _cachedUrl == jellyseerrUrl
                    && _cachedApiKey == apiKey)
                {
                    return _cachedUsers;
                }

                var users = await FetchUsersFromJellyseerr(jellyseerrUrl, apiKey).ConfigureAwait(false);
                _cachedUsers = users;
                _cacheExpiry = DateTime.UtcNow.Add(CacheTtl);
                _cachedUrl = jellyseerrUrl;
                _cachedApiKey = apiKey;

                _logger.Debug($"[UserCache] Cached {users.Count} Jellyseerr users (TTL: {CacheTtl.TotalMinutes}min)");
                return users;
            }
            finally
            {
                _fetchSemaphore.Release();
            }
        }

        // Finds a Jellyseerr user ID by their Jellyfin user ID.
        public async Task<string?> GetJellyseerrUserIdAsync(string jellyseerrUrl, string apiKey, string jellyfinUserId)
        {
            var normalizedJellyfinUserId = jellyfinUserId.Replace("-", "").ToLowerInvariant();
            var users = await GetUsersAsync(jellyseerrUrl, apiKey).ConfigureAwait(false);

            var match = users.FirstOrDefault(u =>
                !string.IsNullOrEmpty(u.JellyfinUserId) &&
                u.JellyfinUserId.Replace("-", "").ToLowerInvariant() == normalizedJellyfinUserId);

            return match?.JellyseerrId.ToString();
        }

        // Finds a full CachedJellyseerrUser by their Jellyfin user ID.
        public async Task<CachedJellyseerrUser?> GetJellyseerrUserAsync(string jellyseerrUrl, string apiKey, string jellyfinUserId)
        {
            var normalizedJellyfinUserId = jellyfinUserId.Replace("-", "").ToLowerInvariant();
            var users = await GetUsersAsync(jellyseerrUrl, apiKey).ConfigureAwait(false);

            return users.FirstOrDefault(u =>
                !string.IsNullOrEmpty(u.JellyfinUserId) &&
                u.JellyfinUserId.Replace("-", "").ToLowerInvariant() == normalizedJellyfinUserId);
        }

        // Invalidates the cached user list.
        public void InvalidateCache()
        {
            _cachedUsers = null;
            _cacheExpiry = DateTime.MinValue;
            _logger.Debug("[UserCache] Cache invalidated");
        }

        private async Task<List<CachedJellyseerrUser>> FetchUsersFromJellyseerr(string jellyseerrUrl, string apiKey)
        {
            var result = new List<CachedJellyseerrUser>();

            try
            {
                var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Add("X-Api-Key", apiKey);

                var requestUri = $"{jellyseerrUrl.TrimEnd('/')}/api/v1/user?take=1000";
                var response = await httpClient.GetAsync(requestUri).ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.Warning($"[UserCache] Failed to fetch users from Jellyseerr: {response.StatusCode}");
                    return result;
                }

                var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var json = JsonSerializer.Deserialize<JsonElement>(content);

                if (json.TryGetProperty("results", out var usersArray))
                {
                    foreach (var userElement in usersArray.EnumerateArray())
                    {
                        var user = new CachedJellyseerrUser();

                        if (userElement.TryGetProperty("id", out var idProp))
                        {
                            user.JellyseerrId = idProp.GetInt32();
                        }

                        if (userElement.TryGetProperty("jellyfinUserId", out var jfUserIdProp))
                        {
                            user.JellyfinUserId = jfUserIdProp.GetString();
                        }

                        if (userElement.TryGetProperty("displayName", out var displayNameProp))
                        {
                            user.DisplayName = displayNameProp.GetString();
                        }

                        if (userElement.TryGetProperty("permissions", out var permsProp))
                        {
                            user.Permissions = permsProp.GetInt32();
                        }

                        result.Add(user);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"[UserCache] Error fetching users: {ex.Message}");
            }

            return result;
        }
    }

    public class CachedJellyseerrUser
    {
        public int JellyseerrId { get; set; }
        public string? JellyfinUserId { get; set; }
        public string? DisplayName { get; set; }
        public int Permissions { get; set; }
    }
}
