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
    public class SonarrSeries
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("tvdbId")]
        public int TvdbId { get; set; }

        [JsonPropertyName("imdbId")]
        public string? ImdbId { get; set; }

        [JsonPropertyName("tags")]
        public List<int> Tags { get; set; } = new List<int>();
    }

    public class SonarrTag
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("label")]
        public string Label { get; set; } = string.Empty;
    }

    public class SonarrService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public SonarrService(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        /// <summary>
        /// Fetches Sonarr tag mappings keyed by IMDb ID. Throws <see cref="ArrFetchFailedException"/>
        /// on any upstream failure (SSRF reject, non-2xx, parse error, network error) so callers
        /// can distinguish a genuine empty library from a fetch failure — critical before any
        /// destructive post-processing (e.g. clearing "Requested by:" tags).
        /// </summary>
        public async Task<Dictionary<string, List<string>>> GetSeriesTagsByTvdbId(string sonarrUrl, string apiKey, CancellationToken ct = default)
        {
            var result = new Dictionary<string, List<string>>();

            if (!ArrUrlGuard.IsAllowedUrl(sonarrUrl))
            {
                _logger.Error($"Refusing to fetch Sonarr tags — URL rejected by SSRF guard: {sonarrUrl}");
                throw new ArrFetchFailedException($"URL rejected by SSRF guard: {sonarrUrl}");
            }

            try
            {
                var httpClient = _httpClientFactory.CreateClient(PluginServiceRegistrator.ArrSafeHttpClientName);
                httpClient.DefaultRequestHeaders.Add("X-Api-Key", apiKey);

                _logger.Info($"Fetching Sonarr tags from {sonarrUrl}");
                var tagsUrl = $"{sonarrUrl.TrimEnd('/')}/api/v3/tag";
                var tagsResponse = await httpClient.GetAsync(tagsUrl, ct);

                if (!tagsResponse.IsSuccessStatusCode)
                {
                    _logger.Error($"Failed to fetch Sonarr tags from {sonarrUrl}. Status: {tagsResponse.StatusCode}");
                    throw new ArrFetchFailedException($"Sonarr tags endpoint returned {(int)tagsResponse.StatusCode}");
                }

                var tagsContent = await tagsResponse.Content.ReadAsStringAsync(ct);
                var tags = JsonSerializer.Deserialize<List<SonarrTag>>(tagsContent) ?? new List<SonarrTag>();
                var tagDictionary = tags.ToDictionary(t => t.Id, t => t.Label);

                _logger.Info($"Found {tags.Count} tags in Sonarr");

                _logger.Info($"Fetching Sonarr series from {sonarrUrl}");
                var seriesUrl = $"{sonarrUrl.TrimEnd('/')}/api/v3/series";
                var seriesResponse = await httpClient.GetAsync(seriesUrl, ct);

                if (!seriesResponse.IsSuccessStatusCode)
                {
                    _logger.Error($"Failed to fetch Sonarr series from {sonarrUrl}. Status: {seriesResponse.StatusCode}");
                    throw new ArrFetchFailedException($"Sonarr series endpoint returned {(int)seriesResponse.StatusCode}");
                }

                var seriesContent = await seriesResponse.Content.ReadAsStringAsync(ct);
                var allSeries = JsonSerializer.Deserialize<List<SonarrSeries>>(seriesContent) ?? new List<SonarrSeries>();

                _logger.Info($"Found {allSeries.Count} series in Sonarr");

                foreach (var series in allSeries)
                {
                    if (!string.IsNullOrEmpty(series.ImdbId) && series.Tags.Count > 0)
                    {
                        var seriesTags = new List<string>();
                        foreach (var tagId in series.Tags)
                        {
                            if (tagDictionary.TryGetValue(tagId, out var tagLabel))
                            {
                                seriesTags.Add(tagLabel);
                            }
                        }

                        if (seriesTags.Count > 0)
                        {
                            result[series.ImdbId] = seriesTags;
                        }
                    }
                }

                _logger.Info($"Mapped tags for {result.Count} series");
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
                _logger.Error($"Network error fetching Sonarr tags from {sonarrUrl}: {ex.GetType().Name}: {ex.Message}");
                throw new ArrFetchFailedException($"Network error: {ex.Message}", ex);
            }
            catch (TaskCanceledException ex)
            {
                _logger.Error($"Timeout fetching Sonarr tags from {sonarrUrl}: {ex.Message}");
                throw new ArrFetchFailedException("Request timed out", ex);
            }
            catch (JsonException ex)
            {
                _logger.Error($"Invalid JSON from Sonarr tags endpoint {sonarrUrl}: {ex.Message}");
                throw new ArrFetchFailedException("Invalid JSON response", ex);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Unexpected error fetching Sonarr tags from {sonarrUrl}");
                throw new ArrFetchFailedException($"Unexpected error: {ex.Message}", ex);
            }
        }
    }
}
