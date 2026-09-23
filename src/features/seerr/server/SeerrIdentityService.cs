using System.Text.Json;
using MediaBrowser.Controller.Library;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Jellyseerr;
using Microsoft.EntityFrameworkCore;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Api
{
    /// <summary>
    /// Resolves Jellyfin users to Seerr accounts and owns the shared identity lookup caches.
    /// </summary>
    public sealed class SeerrIdentityService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;
        private readonly IUserManager _userManager;

        // Cache for Seerr user ID lookups (JellyfinUserId -> SeerrUserId)
        private static readonly Dictionary<string, (string JellyseerrUserId, DateTime CachedAt)> _userIdCache = new();
        private static readonly object _userIdCacheLock = new();

        // Cache for Seerr user lookups (JellyfinUserId -> full Seerr user payload, null = negative cache)
        private static readonly Dictionary<string, (JellyseerrUser? User, DateTime CachedAt)> _userCache = new();
        private static readonly object _userCacheLock = new();

        public SeerrIdentityService(IHttpClientFactory httpClientFactory, Logger logger, IUserManager userManager)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _userManager = userManager;
        }

        private static TimeSpan GetUserIdCacheTtl()
        {
            var minutes = JellyfinEnhanced.Instance?.Configuration?.JellyseerrUserIdCacheTtlMinutes ?? 30;
            return TimeSpan.FromMinutes(Math.Max(1, minutes));
        }

        public async Task<JellyseerrUser?> GetJellyseerrUser(string jellyfinUserId, bool bypassCache = false, bool allowAutoImport = true)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                _logger.Warning("Seerr configuration is missing. Cannot look up user ID.");
                return null;
            }

            // Skip blocked users entirely — no lookup, no import, no API calls
            if (IsJellyseerrImportBlocked(jellyfinUserId, config))
            {
                return null;
            }

            bool cacheEnabled = !config.JellyseerrDisableCache && !bypassCache;
            if (cacheEnabled)
            {
                lock (_userCacheLock)
                {
                    if (_userCache.TryGetValue(jellyfinUserId, out var cached))
                    {
                        // Negative entries use a much shorter TTL so transient
                        // failures don't poison discovery for 30 min after recovery.
                        var ttl = cached.User == null ? TimeSpan.FromSeconds(60) : GetUserIdCacheTtl();
                        if (DateTime.UtcNow - cached.CachedAt < ttl)
                        {
                            return cached.User;
                        }
                    }
                }
            }

            // _logger.Info($"Attempting to find Seerr user for Jellyfin User ID: {jellyfinUserId}");
            var urls = config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            httpClient.Timeout = TimeSpan.FromSeconds(15);

            foreach (var url in urls)
            {
                var trimmedUrl = url.Trim();
                var requestUri = $"{trimmedUrl.TrimEnd('/')}/api/v1/user?take=1000"; // Fetch all users to find a match
                try
                {
                    using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get, requestUri, config.JellyseerrApiKey);
                    using var response = await httpClient.SendAsync(request);
                    var (json, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri);

                    if (error != null)
                    {
                        // Distinct error logging by class lets admins triage
                        // (HTML response = reverse proxy, 401 = key wrong, etc.)
                        _logger.Warning($"Failed to fetch users from Seerr at {trimmedUrl}: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");
                        continue;
                    }

                    var usersResponse = System.Text.Json.JsonSerializer.Deserialize<JsonElement>(json!);
                    if (usersResponse.TryGetProperty("results", out var usersArray))
                    {
                        var users = System.Text.Json.JsonSerializer.Deserialize<List<JellyseerrUser>>(usersArray.ToString());
                        var normalizedJellyfinUserId = jellyfinUserId.Replace("-", "");
                        var user = users?.FirstOrDefault(u => string.Equals(u.JellyfinUserId, normalizedJellyfinUserId, StringComparison.OrdinalIgnoreCase));
                        if (user != null)
                        {
                            if (cacheEnabled)
                            {
                                lock (_userCacheLock)
                                {
                                    _userCache[jellyfinUserId] = (user, DateTime.UtcNow);
                                }
                            }
                            return user;
                        }
                        _logger.Info($"No matching Jellyfin User ID found in the {users?.Count ?? 0} users from {trimmedUrl}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.Error($"Exception while trying to get Seerr user ID from {trimmedUrl}: {ex.Message}");
                }
            }

            // User not found — attempt just-in-time import into Jellyseerr.
            // `allowAutoImport=false` is passed by read-only callers (e.g. the
            // Permission Audit endpoint, which advertises itself as a non-
            // mutating check). Without this guard, clicking "Run Audit" with
            // auto-import enabled would silently create Seerr users as a side
            // effect — including users an admin may have deliberately kept out
            // of Seerr (but not yet added to the blocklist).
            var importDefinite = false;
            if (allowAutoImport && config.JellyseerrAutoImportUsers)
            {
                _logger.Info($"User not found in Jellyseerr. Attempting just-in-time import for Jellyfin User ID {ResolveUserDisplay(jellyfinUserId)}...");
                var (importedUser, definite) = await TryAutoImportJellyseerrUser(jellyfinUserId, urls, httpClient);
                importDefinite = definite;
                if (importedUser != null)
                {
                    if (cacheEnabled)
                    {
                        lock (_userCacheLock)
                        {
                            _userCache[jellyfinUserId] = (importedUser, DateTime.UtcNow);
                        }
                    }

                    return importedUser;
                }
            }

            // Only negative-cache when the import gave a definite "not importable" answer.
            // Transient failures (network errors, exceptions) should not be cached so the
            // next request can retry immediately.
            if (cacheEnabled && importDefinite)
            {
                lock (_userCacheLock)
                {
                    _userCache[jellyfinUserId] = (null, DateTime.UtcNow);
                }
            }

            _logger.Warning($"Could not find or import a matching Seerr user for Jellyfin User ID {ResolveUserDisplay(jellyfinUserId)} after checking all URLs.");
            return null;
        }

        private async Task<(JellyseerrUser? User, bool Definite)> TryAutoImportJellyseerrUser(string jellyfinUserId, string[] urls, HttpClient httpClient)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            var apiKey = config?.JellyseerrApiKey ?? string.Empty;

            // Jellyseerr requires dashless UUIDs — dashed format causes empty email and UNIQUE constraint errors
            var normalizedUserId = jellyfinUserId.Replace("-", "");

            // Track whether we got any HTTP response from Jellyseerr (vs network failures).
            // This determines whether a null result should be negative-cached or retried.
            var reachedJellyseerr = false;

            foreach (var url in urls)
            {
                try
                {
                    var importUri = $"{url.Trim().TrimEnd('/')}/api/v1/user/import-from-jellyfin";
                    var requestBody = JsonSerializer.Serialize(new { jellyfinUserIds = new[] { normalizedUserId } });

                    using var importRequest = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Post, importUri, apiKey, bodyJson: requestBody);
                    using var importResponse = await httpClient.SendAsync(importRequest);
                    reachedJellyseerr = true;
                    var (importJson, importError) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(importResponse, importUri);

                    if (importError != null)
                    {
                        // Email collision is a definite failure — a renamed/deleted Jellyfin user left
                        // an orphaned Jellyseerr account with the same email. Won't resolve on retry.
                        if (!string.IsNullOrEmpty(importError.Message)
                            && importError.Message.Contains("UNIQUE constraint failed: user.email", StringComparison.OrdinalIgnoreCase))
                        {
                            _logger.Warning($"Could not auto-import Jellyfin User ID {ResolveUserDisplay(jellyfinUserId)}: an existing Jellyseerr account has a conflicting email (possibly from a previous user that was renamed or deleted). Remove the conflicting user in Jellyseerr to resolve this.");
                            return (null, true);
                        }

                        _logger.Warning($"Failed to auto-import user to Jellyseerr at {url}: code={importError.Code} status={importError.HttpStatus} cf-ray={importError.CfRay} — {importError.Message}");
                        continue;
                    }

                    // The import endpoint returns an array of newly created users.
                    // Parse it directly to avoid a second API call.
                    var importedUsers = JsonSerializer.Deserialize<List<JellyseerrUser>>(importJson!);
                    var user = importedUsers?.FirstOrDefault(u => string.Equals(u.JellyfinUserId, normalizedUserId, StringComparison.OrdinalIgnoreCase));
                    if (user != null)
                    {
                        _logger.Info($"Auto-imported Seerr user ID {user.Id} for Jellyfin User {ResolveUserDisplay(jellyfinUserId)}");
                        return (user, true);
                    }

                    // Some Jellyseerr versions return an empty array even on success (user already existed
                    // but wasn't in the import response). Fall back to a full user list query to find them.
                    _logger.Info($"Import succeeded at {url.Trim()} but user not in response. Doing fresh lookup...");
                    var lookupUri = $"{url.Trim().TrimEnd('/')}/api/v1/user?take=1000";
                    using var lookupRequest = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get, lookupUri, apiKey);
                    using var lookupResponse = await httpClient.SendAsync(lookupRequest);
                    var (lookupJson, lookupError) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(lookupResponse, lookupUri);
                    if (lookupError == null && lookupJson != null)
                    {
                        var lookupRoot = JsonSerializer.Deserialize<JsonElement>(lookupJson);
                        if (lookupRoot.TryGetProperty("results", out var usersArray))
                        {
                            var allUsers = JsonSerializer.Deserialize<List<JellyseerrUser>>(usersArray.ToString());
                            var found = allUsers?.FirstOrDefault(u => string.Equals(u.JellyfinUserId, normalizedUserId, StringComparison.OrdinalIgnoreCase));
                            if (found != null)
                            {
                                _logger.Info($"Found Seerr user ID {found.Id} for Jellyfin User {ResolveUserDisplay(jellyfinUserId)} via fresh lookup");
                                return (found, true);
                            }
                        }
                    }
                    else if (lookupError != null)
                    {
                        _logger.Debug($"Fresh lookup at {url.Trim()} failed: code={lookupError.Code} status={lookupError.HttpStatus} cf-ray={lookupError.CfRay}");
                    }

                    // Import succeeded and fresh lookup found nothing — user is genuinely not importable
                    return (null, true);
                }
                catch (HttpRequestException ex)
                {
                    // Network errors, timeouts, etc. are transient — try the next URL
                    _logger.Debug($"Connection error during auto-import for Jellyfin User {ResolveUserDisplay(jellyfinUserId)} at {url}: {ex.Message}");
                }
                catch (JsonException ex)
                {
                    // Invalid Jellyseerr response — log warning but try next URL
                    _logger.Warning($"Invalid response from Jellyseerr during auto-import for Jellyfin User {ResolveUserDisplay(jellyfinUserId)} at {url}: {ex.Message}");
                }
            }

            // Definite only if we actually got an HTTP response from at least one URL.
            // If all URLs failed with exceptions (network down), this is transient and should not be cached.
            return (null, reachedJellyseerr);
        }

        public static bool IsJellyseerrImportBlocked(string jellyfinUserId, Configuration.PluginConfiguration config)
        {
            var blockedIds = Helpers.Jellyseerr.JellyseerrUserImportHelper.GetBlockedUserIds(config.JellyseerrImportBlockedUsers);
            if (blockedIds.Count == 0)
            {
                return false;
            }

            var normalizedId = jellyfinUserId.Replace("-", "");
            return blockedIds.Contains(normalizedId);
        }

        public static void ClearUserCaches()
        {
            lock (_userCacheLock)
            {
                _userCache.Clear();
            }

            lock (_userIdCacheLock)
            {
                _userIdCache.Clear();
            }
        }

        public async Task<string?> GetJellyseerrUserId(string jellyfinUserId)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            bool cacheEnabled = config == null || !config.JellyseerrDisableCache;

            // Check cache first (unless disabled)
            if (cacheEnabled)
            {
                lock (_userIdCacheLock)
                {
                    if (_userIdCache.TryGetValue(jellyfinUserId, out var cached) &&
                        DateTime.UtcNow - cached.CachedAt < GetUserIdCacheTtl())
                    {
                        return cached.JellyseerrUserId;
                    }
                }
            }

            var user = await GetJellyseerrUser(jellyfinUserId);
            var jellyseerrUserId = user?.Id.ToString();

            if (!string.IsNullOrEmpty(jellyseerrUserId) && cacheEnabled)
            {
                lock (_userIdCacheLock)
                {
                    _userIdCache[jellyfinUserId] = (jellyseerrUserId, DateTime.UtcNow);
                }
            }

            return jellyseerrUserId;
        }

        private string ResolveUserDisplay(string userId) => UserDisplay.Resolve(_userManager, userId);
    }
}
