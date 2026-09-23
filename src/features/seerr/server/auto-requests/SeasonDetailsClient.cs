using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Concurrent;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Requests
{
    /// <summary>Owns cached episode counts and deliberately fresh season availability lookups.</summary>
    internal sealed class SeasonDetailsClient
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;
        private readonly Dictionary<string, (string Content, DateTime CachedAt)> _seriesDetailsCache = new();
        private readonly object _seriesDetailsCacheLock = new();
        private readonly ConcurrentDictionary<string, Task<string?>> _seriesDetailsInFlight = new();


        public SeasonDetailsClient(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        private static TimeSpan GetSeriesDetailsCacheTtl()
        {
            var minutes = JellyfinEnhanced.Instance?.Configuration?.JellyseerrResponseCacheTtlMinutes ?? 10;
            return TimeSpan.FromMinutes(Math.Max(1, minutes));
        }

        private async Task<string?> GetSeriesDetailsJsonAsync(string tmdbId)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                return null;
            }

            var cacheKey = tmdbId;
            var cacheTtl = GetSeriesDetailsCacheTtl();
            var cacheEnabled = !config.JellyseerrDisableCache;

            if (cacheEnabled)
            {
                lock (_seriesDetailsCacheLock)
                {
                    if (_seriesDetailsCache.TryGetValue(cacheKey, out var cached) &&
                        DateTime.UtcNow - cached.CachedAt < cacheTtl)
                    {
                        return cached.Content;
                    }
                }
            }

            async Task<string?> FetchAsync()
            {
                var urls = AutoRequestUrls.GetConfiguredUrls(config.JellyseerrUrls);
                var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);

                foreach (var url in urls)
                {
                    try
                    {
                        var requestUrl = $"{url}/api/v1/tv/{tmdbId}";
                        using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                            HttpMethod.Get, requestUrl, config.JellyseerrApiKey);
                        using var response = await httpClient.SendAsync(request);
                        var (content, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUrl);
                        if (error != null)
                        {
                            _logger.Debug($"[Auto-Season-Request] Series details fetch for TMDB {tmdbId} failed: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay}");
                            continue;
                        }

                        return content;
                    }
                    catch (Exception ex)
                    {
                        _logger.Debug($"[Auto-Season-Request] Error checking Jellyseerr at {url}: {ex.Message}");
                    }
                }

                return null;
            }

            string? content;
            if (cacheEnabled)
            {
                var task = _seriesDetailsInFlight.GetOrAdd(cacheKey, _ => FetchAsync());
                try
                {
                    content = await task;
                }
                finally
                {
                    _seriesDetailsInFlight.TryRemove(cacheKey, out _);
                }

                if (!string.IsNullOrEmpty(content))
                {
                    lock (_seriesDetailsCacheLock)
                    {
                        _seriesDetailsCache[cacheKey] = (content, DateTime.UtcNow);
                    }
                }
            }
            else
            {
                content = await FetchAsync();
            }

            return content;
        }

        // Gets the total number of episodes in a season from TMDB
        public async Task<int?> GetTotalEpisodesInSeasonFromTmdb(string tmdbId, int seasonNumber)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                return null;
            }

            try
            {
                var content = await GetSeriesDetailsJsonAsync(tmdbId);
                if (string.IsNullOrEmpty(content))
                {
                    return null;
                }

                using (JsonDocument doc = JsonDocument.Parse(content))
                {
                    var root = doc.RootElement;

                    if (root.TryGetProperty("numberOfSeasons", out var totalSeasonsProp))
                    {
                        var totalSeasons = totalSeasonsProp.GetInt32();
                        _logger.Info($"[Auto-Season-Request] TMDB reports {totalSeasons} total seasons for TMDB ID {tmdbId}");
                    }

                    if (root.TryGetProperty("seasons", out var seasonsArray))
                    {
                        foreach (var season in seasonsArray.EnumerateArray())
                        {
                            if (season.TryGetProperty("seasonNumber", out var seasonNumProp) &&
                                seasonNumProp.GetInt32() == seasonNumber &&
                                season.TryGetProperty("episodeCount", out var episodeCountProp))
                            {
                                var episodeCount = episodeCountProp.GetInt32();
                                _logger.Info($"[Auto-Season-Request] TMDB reports {episodeCount} episodes in season {seasonNumber}");
                                return episodeCount;
                            }
                        }
                    }
                }

                _logger.Info($"[Auto-Season-Request] Season {seasonNumber} not found in TMDB data (season does not exist on TMDB)");
                return null;
            }
            catch (Exception ex)
            {
                _logger.Warning($"[Auto-Season-Request] Error querying TMDB episode count: {ex.Message}");
            }

            return null;
        }

        // Jellyseerr season status
        internal sealed class SeasonStatus
        {
            public bool IsAvailable { get; set; }
            public bool IsRequested { get; set; }
        }

        // Gets season status from Jellyseerr - always fetches fresh to ensure accurate request/availability state
        public async Task<SeasonStatus?> GetSeasonStatusFromJellyseerr(string tmdbId, int seasonNumber)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                return null;
            }

            try
            {
                var urls = AutoRequestUrls.GetConfiguredUrls(config.JellyseerrUrls);
                var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);

                string? content = null;
                foreach (var url in urls)
                {
                    try
                    {
                        var requestUrl = $"{url}/api/v1/tv/{tmdbId}";
                        using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                            HttpMethod.Get, requestUrl, config.JellyseerrApiKey);
                        using var response = await httpClient.SendAsync(request);
                        var (body, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUrl);
                        if (error != null)
                        {
                            _logger.Debug($"[Auto-Season-Request] Status check for TMDB {tmdbId} failed: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay}");
                            continue;
                        }

                        content = body;
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.Debug($"[Auto-Season-Request] Error fetching season status from {url}: {ex.Message}");
                    }
                }

                if (string.IsNullOrEmpty(content))
                {
                    return null;
                }

                using (JsonDocument doc = JsonDocument.Parse(content))
                {
                    var root = doc.RootElement;

                    if (root.TryGetProperty("numberOfSeasons", out var totalSeasonsProp))
                    {
                        var totalSeasons = totalSeasonsProp.GetInt32();
                        _logger.Info($"[Auto-Season-Request] Jellyseerr reports {totalSeasons} total seasons for TMDB ID {tmdbId}");
                        if (seasonNumber > totalSeasons)
                        {
                            _logger.Info($"[Auto-Season-Request] Season {seasonNumber} does not exist on TMDB - show only has {totalSeasons} season(s)");
                            return null;
                        }
                    }

                    bool hasRequest = false;
                    if (root.TryGetProperty("mediaInfo", out var mediaInfoElement) &&
                        mediaInfoElement.TryGetProperty("requests", out var requestsArray))
                    {
                        _logger.Info($"[Auto-Season-Request] Jellyseerr reports {requestsArray.GetArrayLength()} request(s) for TMDB ID {tmdbId}");
                        foreach (var request in requestsArray.EnumerateArray())
                        {
                            if (request.TryGetProperty("seasons", out var requestSeasons))
                            {
                                foreach (var requestSeason in requestSeasons.EnumerateArray())
                                {
                                    if (requestSeason.TryGetProperty("seasonNumber", out var requestSeasonNum) &&
                                        requestSeasonNum.GetInt32() == seasonNumber)
                                    {
                                        hasRequest = true;
                                        _logger.Info($"[Auto-Season-Request] Found existing request for season {seasonNumber}");
                                        break;
                                    }
                                }
                                if (hasRequest) break;
                            }
                        }
                    }
                    else
                    {
                        _logger.Info($"[Auto-Season-Request] No mediaInfo or no requests found for TMDB ID {tmdbId}");
                    }

                    if (root.TryGetProperty("seasons", out var seasonsArray))
                    {
                        foreach (var season in seasonsArray.EnumerateArray())
                        {
                            if (season.TryGetProperty("seasonNumber", out var seasonNumProp) &&
                                seasonNumProp.GetInt32() == seasonNumber)
                            {
                                var status = new SeasonStatus();
                                if (season.TryGetProperty("status", out var statusProp))
                                {
                                    var statusValue = statusProp.GetInt32();
                                    status.IsAvailable = statusValue == 5;
                                    _logger.Info($"[Auto-Season-Request] Jellyseerr Season {seasonNumber} raw status code: {statusValue} (5 = available)");
                                }

                                status.IsRequested = hasRequest;

                                _logger.Info($"[Auto-Season-Request] Season {seasonNumber} final status from Jellyseerr: Available={status.IsAvailable}, Requested={status.IsRequested}");
                                return status;
                            }
                        }
                    }
                }

                _logger.Info($"[Auto-Season-Request] Season {seasonNumber} not found in Jellyseerr response");
                return null;
            }
            catch (Exception ex)
            {
                _logger.Warning($"[Auto-Season-Request] Error querying Jellyseerr: {ex.Message}");
            }

            return null;
        }

    }
}
