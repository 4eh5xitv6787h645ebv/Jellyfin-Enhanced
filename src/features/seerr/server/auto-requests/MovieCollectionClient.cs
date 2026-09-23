using System;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Requests
{
    /// <summary>Looks up collection membership and the next eligible movie without submitting requests.</summary>
    internal sealed class MovieCollectionClient
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public MovieCollectionClient(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        // Collection info from TMDB
        internal sealed class CollectionInfo
        {
            public int Id { get; set; }
            public string Name { get; set; } = string.Empty;
        }

        // Movie info with title
        internal sealed class MovieInfo
        {
            public int TmdbId { get; set; }
            public string Title { get; set; } = string.Empty;
        }

        // Gets TMDB collection ID and name for a movie
        public async Task<CollectionInfo?> GetTmdbCollectionIdAsync(string tmdbId)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || string.IsNullOrEmpty(config.TMDB_API_KEY))
            {
                return null;
            }

            try
            {
                var httpClient = _httpClientFactory.CreateClient();
                var requestUrl = $"https://api.themoviedb.org/3/movie/{tmdbId}?api_key={config.TMDB_API_KEY}";

                var response = await httpClient.GetAsync(requestUrl);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.Debug($"[Auto-Movie-Request] TMDB returned {response.StatusCode} for movie {tmdbId}");
                    return null;
                }

                var content = await response.Content.ReadAsStringAsync();
                using (JsonDocument doc = JsonDocument.Parse(content))
                {
                    var root = doc.RootElement;
                    if (root.TryGetProperty("belongs_to_collection", out var collectionProp))
                    {
                        if (collectionProp.ValueKind != JsonValueKind.Null &&
                            collectionProp.TryGetProperty("id", out var idProp) &&
                            collectionProp.TryGetProperty("name", out var nameProp))
                        {
                            return new CollectionInfo
                            {
                                Id = idProp.GetInt32(),
                                Name = nameProp.GetString() ?? "Unknown Collection"
                            };
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"[Auto-Movie-Request] Error querying TMDB: {ex.Message}");
            }

            return null;
        }

        // Gets next movie in collection from Jellyseerr collection endpoint
        public async Task<MovieInfo?> GetNextMovieInCollectionAsync(int collectionId, string currentTmdbId)
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

                foreach (var url in urls)
                {
                    var trimmedUrl = url.Trim().TrimEnd('/');
                    var requestUrl = $"{trimmedUrl}/api/v1/collection/{collectionId}";

                    try
                    {
                        using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                            HttpMethod.Get, requestUrl, config.JellyseerrApiKey);
                        using var response = await httpClient.SendAsync(request);
                        var (content, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUrl);
                        if (error != null)
                        {
                            _logger.Debug($"[Auto-Movie-Request] Jellyseerr collection fetch failed: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay}");
                            continue;
                        }

                        using (JsonDocument doc = JsonDocument.Parse(content!))
                        {
                            var root = doc.RootElement;

                            if (root.TryGetProperty("parts", out var partsArray))
                            {
                                int? currentIndex = null;
                                int? nextIndex = null;

                                // Find current movie and next movie
                                var parts = partsArray.EnumerateArray().ToList();
                                for (int i = 0; i < parts.Count; i++)
                                {
                                    var part = parts[i];
                                    if (part.TryGetProperty("id", out var idProp) && idProp.GetInt32().ToString() == currentTmdbId)
                                    {
                                        currentIndex = i;
                                        break;
                                    }
                                }

                                if (currentIndex.HasValue && currentIndex.Value < parts.Count - 1)
                                {
                                    nextIndex = currentIndex.Value + 1;
                                    var nextPart = parts[nextIndex.Value];

                                    // Check if next movie is available or already requested
                                    if (nextPart.TryGetProperty("mediaInfo", out var mediaInfo))
                                    {
                                        if (mediaInfo.TryGetProperty("status", out var statusProp))
                                        {
                                            var statusValue = statusProp.GetInt32();
                                            // 5 = available, 2 = pending, 3 = processing
                                            if (statusValue == 5 || statusValue == 2 || statusValue == 3)
                                            {
                                                _logger.Debug($"[Auto-Movie-Request] Next movie already available or requested (status: {statusValue})");
                                                return null;
                                            }
                                        }
                                    }

                                    // Check release date if configured
                                    if (config.AutoMovieRequestCheckReleaseDate && nextPart.TryGetProperty("releaseDate", out var releaseDateProp))
                                    {
                                        var releaseDateStr = releaseDateProp.GetString();
                                        if (!string.IsNullOrEmpty(releaseDateStr) && DateTime.TryParse(releaseDateStr, out var releaseDate))
                                        {
                                            if (releaseDate > DateTime.Now)
                                            {
                                                _logger.Debug($"[Auto-Movie-Request] Next movie is not yet released (release date: {releaseDate:yyyy-MM-dd}), skipping");
                                                return null;
                                            }
                                        }
                                    }

                                    // Return next movie's TMDB ID and title
                                    if (nextPart.TryGetProperty("id", out var nextIdProp) &&
                                        nextPart.TryGetProperty("title", out var titleProp))
                                    {
                                        return new MovieInfo
                                        {
                                            TmdbId = nextIdProp.GetInt32(),
                                            Title = titleProp.GetString() ?? "Unknown Title"
                                        };
                                    }
                                }
                                else
                                {
                                    // _logger.Debug($"[Auto-Movie-Request] Current movie is the last in collection or not found");
                                    return null;
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Debug($"[Auto-Movie-Request] Error checking Jellyseerr at {trimmedUrl}: {ex.Message}");
                        continue;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"[Auto-Movie-Request] Error querying Jellyseerr collection: {ex.Message}");
            }

            return null;
        }

    }
}
