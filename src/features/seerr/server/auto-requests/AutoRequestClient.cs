using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Requests
{
    /// <summary>
    /// Resolves Jellyfin users and submits automatic Seerr requests. Each owning service
    /// has its own instance so user-ID cache lifetimes remain independent.
    /// </summary>
    internal sealed class AutoRequestClient
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;
        private readonly string _logPrefix;
        private readonly Dictionary<string, (string JellyseerrUserId, DateTime CachedAt)> _jellyseerrUserIdCache = new();
        private readonly object _userIdCacheLock = new();

        public AutoRequestClient(IHttpClientFactory httpClientFactory, Logger logger, string logPrefix)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _logPrefix = logPrefix;
        }

        // The payload factory is evaluated inside each attempt, preserving request validation and retry behavior.
        public async Task<bool> SubmitAsync(string jellyfinUserId, string mediaDescription, Func<string> createPayload)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                _logger.Warning($"{_logPrefix} Jellyseerr configuration is missing");
                return false;
            }

            // Get Jellyseerr user ID
            var jellyseerrUserId = await GetJellyseerrUserId(jellyfinUserId);
            if (string.IsNullOrEmpty(jellyseerrUserId))
            {
                _logger.Warning($"{_logPrefix} Could not find Jellyseerr user for Jellyfin user {jellyfinUserId}");
                return false;
            }

            var urls = AutoRequestUrls.GetConfiguredUrls(config.JellyseerrUrls);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);

            foreach (var url in urls)
            {
                try
                {
                    var requestUri = $"{url.Trim().TrimEnd('/')}/api/v1/request";

                    var jsonContent = createPayload();

                    using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Post, requestUri, config.JellyseerrApiKey, jellyseerrUserId, jsonContent);
                    using var response = await httpClient.SendAsync(request);
                    var (responseContent, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri);

                    if (error == null)
                    {
                        return true;
                    }
                    _logger.Warning($"{_logPrefix} Jellyseerr request failed: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");
                }
                catch (Exception ex)
                {
                    _logger.Error($"{_logPrefix} Exception requesting {mediaDescription} from Jellyseerr at {url}: {ex.Message}");
                }
            }

            return false;
        }

        private static string NormalizeUserId(string userId)
        {
            return userId.Replace("-", string.Empty).ToLowerInvariant();
        }

        private static TimeSpan GetJellyseerrUserIdCacheTtl()
        {
            var minutes = JellyfinEnhanced.Instance?.Configuration?.JellyseerrUserIdCacheTtlMinutes ?? 30;
            return TimeSpan.FromMinutes(Math.Max(1, minutes));
        }

        // Gets the Jellyseerr user ID for a Jellyfin user
        private async Task<string?> GetJellyseerrUserId(string jellyfinUserId)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                return null;
            }

            var normalizedJellyfinUserId = NormalizeUserId(jellyfinUserId);

            lock (_userIdCacheLock)
            {
                if (_jellyseerrUserIdCache.TryGetValue(normalizedJellyfinUserId, out var cached) &&
                    DateTime.UtcNow - cached.CachedAt < GetJellyseerrUserIdCacheTtl())
                {
                    return cached.JellyseerrUserId;
                }
            }

            var urls = AutoRequestUrls.GetConfiguredUrls(config.JellyseerrUrls);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);

            foreach (var url in urls)
            {
                try
                {
                    var requestUri = $"{url.Trim().TrimEnd('/')}/api/v1/user?take=1000";
                    using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get, requestUri, config.JellyseerrApiKey);
                    using var response = await httpClient.SendAsync(request);
                    var (content, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri);

                    if (error == null && content != null)
                    {
                        var usersResponse = JsonSerializer.Deserialize<JsonElement>(content);

                        if (usersResponse.TryGetProperty("results", out var usersArray))
                        {
                            foreach (var userElement in usersArray.EnumerateArray())
                            {
                                if (userElement.TryGetProperty("jellyfinUserId", out var jfUserId) &&
                                    userElement.TryGetProperty("id", out var id))
                                {
                                    var jellyseerrJfUserId = jfUserId.GetString();
                                    if (!string.IsNullOrEmpty(jellyseerrJfUserId))
                                    {
                                        // Normalize both IDs for comparison (remove dashes)
                                        var normalizedJellyseerrId = jellyseerrJfUserId.Replace("-", "").ToLowerInvariant();

                                        if (normalizedJellyseerrId == normalizedJellyfinUserId)
                                        {
                                            var jellyseerrUserId = id.GetInt32().ToString();
                                            lock (_userIdCacheLock)
                                            {
                                                _jellyseerrUserIdCache[normalizedJellyfinUserId] = (jellyseerrUserId, DateTime.UtcNow);
                                            }
                                            return jellyseerrUserId;
                                        }
                                    }
                                }
                            }
                            _logger.Warning($"{_logPrefix} No Jellyseerr user found for Jellyfin user {jellyfinUserId}");
                        }
                    }
                    else if (error != null)
                    {
                        _logger.Warning($"{_logPrefix} Failed to fetch users from Jellyseerr: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.Error($"{_logPrefix} Exception while trying to get Jellyseerr user ID from {url}: {ex.Message}");
                }
            }

            return null;
        }

    }
}
