using System;
using System.Globalization;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr
{
    /// <summary>Retrieves user-neutral certification/tag data, retaining TMDB preference and Seerr failover.</summary>
    internal sealed class SeerrParentalMetadataClient
    {
        internal static readonly TimeSpan PerFetchTimeout = TimeSpan.FromSeconds(8);
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        internal SeerrParentalMetadataClient(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        // Rating-only lookups prefer TMDB's dedicated cert endpoints (tiny payload)
        // when a TMDB key is set and fall back to Seerr's full detail. When tag
        // rules are active the Seerr full detail is required: it is the one body
        // carrying certifications AND keywords/genres. Certification and keyword
        // data don't vary per user, so X-Api-User is deliberately omitted — that
        // is what keeps the cache shareable. Returns whether the body carries tags.
        internal async Task<(JsonElement? Detail, bool HasTagData)> FetchDetailAsync(string mediaType, int tmdbId, bool needTags, CancellationToken ct)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return (null, false);
            }

            if (!needTags && !string.IsNullOrEmpty(config.TMDB_API_KEY))
            {
                var fromTmdb = await FetchCertFromTmdbAsync(mediaType, tmdbId, config.TMDB_API_KEY, ct).ConfigureAwait(false);
                if (fromTmdb != null)
                {
                    return (fromTmdb, false);
                }
            }

            var fromSeerr = await FetchDetailFromSeerrAsync(mediaType, tmdbId, config, ct).ConfigureAwait(false);
            // "Has tag data" means the body carries a keyword container, not merely
            // that the call succeeded: an empty set from a body without one would
            // let a blocked-tag rule pass instead of failing closed.
            return (fromSeerr, fromSeerr != null && SeerrTagSignatureExtractor.HasKeywordData(fromSeerr.Value));
        }

        private async Task<JsonElement?> FetchCertFromTmdbAsync(string mediaType, int tmdbId, string apiKey, CancellationToken ct)
        {
            var subResource = mediaType == "tv" ? "content_ratings" : "release_dates";
            var requestUri = $"https://api.themoviedb.org/3/{mediaType}/{tmdbId.ToString(CultureInfo.InvariantCulture)}/{subResource}?api_key={apiKey}";
            try
            {
                var httpClient = _httpClientFactory.CreateClient();
                httpClient.Timeout = PerFetchTimeout;
                using var response = await httpClient.GetAsync(requestUri, ct).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                if (string.IsNullOrEmpty(body))
                {
                    return null;
                }

                using var parsed = JsonDocument.Parse(body);
                return parsed.RootElement.Clone();
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.Debug($"Parental filter: TMDB certification fetch failed for {mediaType}/{tmdbId}: {ex.Message}");
                return null;
            }
        }

        private async Task<JsonElement?> FetchDetailFromSeerrAsync(string mediaType, int tmdbId, Configuration.PluginConfiguration config, CancellationToken ct)
        {
            if (!config.JellyseerrEnabled || string.IsNullOrEmpty(config.JellyseerrUrls) || string.IsNullOrEmpty(config.JellyseerrApiKey))
            {
                return null;
            }

            var relative = $"/api/v1/{mediaType}/{tmdbId.ToString(CultureInfo.InvariantCulture)}";
            var httpClient = SeerrHttpHelper.CreateClient(_httpClientFactory);
            httpClient.Timeout = PerFetchTimeout;

            foreach (var url in config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var requestUri = $"{url.Trim().TrimEnd('/')}{relative}";
                try
                {
                    using var request = SeerrHttpHelper.BuildRequest(HttpMethod.Get, requestUri, config.JellyseerrApiKey);
                    using var response = await httpClient.SendAsync(request, ct).ConfigureAwait(false);
                    var (body, error) = await SeerrHttpHelper.ReadResponseAsync(response, requestUri, ct).ConfigureAwait(false);
                    if (error != null || string.IsNullOrEmpty(body))
                    {
                        continue;
                    }

                    using var parsed = JsonDocument.Parse(body);
                    return parsed.RootElement.Clone();
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    _logger.Debug($"Parental filter: Seerr detail fetch failed for {mediaType}/{tmdbId} at {url}: {ex.Message}");
                }
            }

            return null;
        }

    }
}
