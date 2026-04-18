using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    public class RadarrMovie
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("tmdbId")]
        public int TmdbId { get; set; }

        [JsonPropertyName("imdbId")]
        public string? ImdbId { get; set; }

        [JsonPropertyName("tags")]
        public List<int> Tags { get; set; } = new List<int>();
    }

    public class RadarrTag
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("label")]
        public string Label { get; set; } = string.Empty;
    }

    public class RadarrService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public RadarrService(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        /// <summary>
        /// Fetches Radarr tag mappings keyed by TMDB ID. Throws <see cref="ArrFetchFailedException"/>
        /// on any upstream failure (SSRF reject, non-2xx, parse error, network error) so callers
        /// can distinguish a genuine empty library from a fetch failure — critical before any
        /// destructive post-processing (e.g. clearing "Requested by:" tags).
        /// </summary>
        public async Task<Dictionary<int, List<string>>> GetMovieTagsByTmdbId(string radarrUrl, string apiKey, CancellationToken ct = default)
        {
            var result = new Dictionary<int, List<string>>();

            if (!ArrUrlGuard.IsAllowedUrl(radarrUrl))
            {
                _logger.Error($"Refusing to fetch Radarr tags — URL rejected by SSRF guard: {radarrUrl}");
                throw new ArrFetchFailedException($"URL rejected by SSRF guard: {radarrUrl}");
            }

            try
            {
                var httpClient = _httpClientFactory.CreateClient(PluginServiceRegistrator.ArrSafeHttpClientName);
                httpClient.DefaultRequestHeaders.Add("X-Api-Key", apiKey);

                _logger.Info($"Fetching Radarr tags from {radarrUrl}");
                var tagsUrl = $"{radarrUrl.TrimEnd('/')}/api/v3/tag";
                var tagsResponse = await httpClient.GetAsync(tagsUrl, ct);

                if (!tagsResponse.IsSuccessStatusCode)
                {
                    _logger.Error($"Failed to fetch Radarr tags from {radarrUrl}. Status: {tagsResponse.StatusCode}");
                    throw new ArrFetchFailedException($"Radarr tags endpoint returned {(int)tagsResponse.StatusCode}");
                }

                var tagsContent = await tagsResponse.Content.ReadAsStringAsync(ct);
                var tags = JsonSerializer.Deserialize<List<RadarrTag>>(tagsContent) ?? new List<RadarrTag>();
                var tagDictionary = tags.ToDictionary(t => t.Id, t => t.Label);

                _logger.Info($"Found {tags.Count} tags in Radarr");

                _logger.Info($"Fetching Radarr movies from {radarrUrl}");
                var moviesUrl = $"{radarrUrl.TrimEnd('/')}/api/v3/movie";
                var moviesResponse = await httpClient.GetAsync(moviesUrl, ct);

                if (!moviesResponse.IsSuccessStatusCode)
                {
                    _logger.Error($"Failed to fetch Radarr movies from {radarrUrl}. Status: {moviesResponse.StatusCode}");
                    throw new ArrFetchFailedException($"Radarr movies endpoint returned {(int)moviesResponse.StatusCode}");
                }

                var moviesContent = await moviesResponse.Content.ReadAsStringAsync(ct);
                var movies = JsonSerializer.Deserialize<List<RadarrMovie>>(moviesContent) ?? new List<RadarrMovie>();

                _logger.Info($"Found {movies.Count} movies in Radarr");

                foreach (var movie in movies)
                {
                    if (movie.TmdbId > 0 && movie.Tags.Count > 0)
                    {
                        var movieTags = new List<string>();
                        foreach (var tagId in movie.Tags)
                        {
                            if (tagDictionary.TryGetValue(tagId, out var tagLabel))
                            {
                                movieTags.Add(tagLabel);
                            }
                        }

                        if (movieTags.Count > 0)
                        {
                            result[movie.TmdbId] = movieTags;
                        }
                    }
                }

                _logger.Info($"Mapped tags for {result.Count} movies");
                return result;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (ArrFetchFailedException)
            {
                throw;
            }
            catch (HttpRequestException ex)
            {
                _logger.Error($"Network error fetching Radarr tags from {radarrUrl}: {ex.GetType().Name}: {ex.Message}");
                throw new ArrFetchFailedException($"Network error: {ex.Message}", ex);
            }
            catch (TaskCanceledException ex)
            {
                _logger.Error($"Timeout fetching Radarr tags from {radarrUrl}: {ex.Message}");
                throw new ArrFetchFailedException("Request timed out", ex);
            }
            catch (JsonException ex)
            {
                _logger.Error($"Invalid JSON from Radarr tags endpoint {radarrUrl}: {ex.Message}");
                throw new ArrFetchFailedException("Invalid JSON response", ex);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Unexpected error fetching Radarr tags from {radarrUrl}");
                throw new ArrFetchFailedException($"Unexpected error: {ex.Message}", ex);
            }
        }
    }
}
