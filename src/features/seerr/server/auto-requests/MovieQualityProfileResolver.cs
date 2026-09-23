using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Requests
{
    /// <summary>Resolves default, inherited, or custom movie request quality settings.</summary>
    internal sealed class MovieQualityProfileResolver
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public MovieQualityProfileResolver(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        // Quality profile settings for Jellyseerr requests
        internal sealed class QualityProfileSettings
        {
            public int? ServerId { get; set; }
            public int? ProfileId { get; set; }
            public string? RootFolder { get; set; }
            public bool Is4k { get; set; }
        }

        // Gets the quality profile of a movie from its existing Jellyseerr request
        private async Task<QualityProfileSettings?> GetOriginalMovieQualityProfileAsync(string tmdbId)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                return null;
            }

            var urls = AutoRequestUrls.GetConfiguredUrls(config.JellyseerrUrls);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);

            foreach (var url in urls)
            {
                try
                {
                    var requestUrl = $"{url}/api/v1/movie/{tmdbId}";
                    using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get, requestUrl, config.JellyseerrApiKey);
                    using var response = await httpClient.SendAsync(request);
                    var (content, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUrl);
                    if (error != null)
                    {
                        _logger.Debug($"[Auto-Movie-Request] Quality profile lookup for movie {tmdbId} failed: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay}");
                        continue;
                    }

                    using (JsonDocument doc = JsonDocument.Parse(content!))
                    {
                        var root = doc.RootElement;
                        if (root.TryGetProperty("mediaInfo", out var mediaInfo) &&
                            mediaInfo.TryGetProperty("requests", out var requests) &&
                            requests.GetArrayLength() > 0)
                        {
                            var firstRequest = requests[0];
                            var settings = new QualityProfileSettings();

                            if (firstRequest.TryGetProperty("profileId", out var profileId) &&
                                profileId.ValueKind == JsonValueKind.Number)
                            {
                                settings.ProfileId = profileId.GetInt32();
                            }
                            if (firstRequest.TryGetProperty("serverId", out var serverId) &&
                                serverId.ValueKind == JsonValueKind.Number)
                            {
                                settings.ServerId = serverId.GetInt32();
                            }
                            if (firstRequest.TryGetProperty("rootFolder", out var rootFolder) &&
                                rootFolder.ValueKind == JsonValueKind.String)
                            {
                                settings.RootFolder = rootFolder.GetString();
                            }
                            if (firstRequest.TryGetProperty("is4k", out var is4k) &&
                                is4k.ValueKind == JsonValueKind.True)
                            {
                                settings.Is4k = true;
                            }

                            if (settings.ProfileId.HasValue || settings.ServerId.HasValue)
                            {
                                _logger.Debug($"[Auto-Movie-Request] Found quality profile for TMDB {tmdbId}: profileId={settings.ProfileId}, serverId={settings.ServerId}, rootFolder={settings.RootFolder}, is4k={settings.Is4k}");
                                return settings;
                            }
                        }
                    }

                    _logger.Debug($"[Auto-Movie-Request] No request records found for TMDB {tmdbId} in Jellyseerr");
                    return null;
                }
                catch (HttpRequestException ex)
                {
                    _logger.Debug($"[Auto-Movie-Request] Failed to connect to {url}: {ex.Message}");
                    continue;
                }
                catch (JsonException ex)
                {
                    _logger.Warning($"[Auto-Movie-Request] Invalid response from {url}: {ex.Message}");
                    continue;
                }
                catch (Exception ex)
                {
                    _logger.Warning($"[Auto-Movie-Request] Unexpected error fetching quality profile from {url}: {ex.Message}");
                    continue;
                }
            }

            return null;
        }

        // Resolves quality profile settings based on configuration mode
        public async Task<QualityProfileSettings?> ResolveQualityProfileAsync(string watchedTmdbId)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return null;
            }

            var mode = config.AutoMovieRequestQualityMode ?? "default";

            if (mode == "original")
            {
                var settings = await GetOriginalMovieQualityProfileAsync(watchedTmdbId);
                if (settings == null)
                {
                    _logger.Warning($"[Auto-Movie-Request] Could not determine quality profile for watched movie TMDB {watchedTmdbId}, falling back to default");
                    return null;
                }

                if (settings.Is4k && config.AutoMovieRequestFallbackOn4k)
                {
                    _logger.Info($"[Auto-Movie-Request] Original movie used a 4K quality profile, falling back to default (AutoMovieRequestFallbackOn4k is enabled)");
                    return null;
                }

                return settings;
            }

            if (mode == "custom")
            {
                var settings = new QualityProfileSettings();
                if (config.AutoMovieRequestCustomServerId >= 0)
                {
                    settings.ServerId = config.AutoMovieRequestCustomServerId;
                }
                if (config.AutoMovieRequestCustomProfileId > 0)
                {
                    settings.ProfileId = config.AutoMovieRequestCustomProfileId;
                }
                if (!string.IsNullOrEmpty(config.AutoMovieRequestCustomRootFolder))
                {
                    settings.RootFolder = config.AutoMovieRequestCustomRootFolder;
                }

                // Only return if at least one value is set
                if (settings.ServerId.HasValue || settings.ProfileId.HasValue || !string.IsNullOrEmpty(settings.RootFolder))
                {
                    return settings;
                }

                _logger.Warning("[Auto-Movie-Request] Custom quality profile mode selected but no values configured, falling back to default");
                return null;
            }

            // "default" mode or unrecognized - no quality profile settings
            if (mode != "default")
            {
                _logger.Warning($"[Auto-Movie-Request] Unrecognized quality mode '{mode}', treating as default");
            }
            return null;
        }

    }
}
