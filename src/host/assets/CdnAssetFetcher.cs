using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using CdnAsset = Jellyfin.Plugin.JellyfinEnhanced.Services.CdnAssetService.CdnAsset;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>Downloads an allowed asset, enforcing response type and byte limits.</summary>
    internal sealed class CdnAssetFetcher
    {
        private readonly Logger _logger;
        private readonly IHttpClientFactory _httpClientFactory;

        internal CdnAssetFetcher(Logger logger, IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _httpClientFactory = httpClientFactory;
        }

        // Hard cap on a single asset so a hostile/misbehaving CDN can't fill the disk.
        private const long MaxAssetBytes = 8 * 1024 * 1024; // 8 MB

        // Browser-like UA so CDNs behind bot protection (Cloudflare) return the real
        // asset instead of an HTML challenge page.
        private const string UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        /// <summary>
        /// Downloads a single asset from its fixed upstream base, validating the
        /// content-type against the source whitelist and enforcing the size cap.
        /// </summary>
        internal async Task<CdnAsset?> FetchAsync(CdnAssetCatalog.CdnSource src, string source, string path, CancellationToken cancellationToken)
        {
            try
            {
                // Sources with a fixed-path map resolve the whole URL from the key (their
                // real URL isn't a simple base+path append); all others append the path.
                string url;
                if (src.FixedPaths != null)
                {
                    if (!src.FixedPaths.TryGetValue(path, out var fixedUrl))
                    {
                        _logger.Warning($"[CDN] Unknown fixed-path key for source '{source}'.");
                        return null;
                    }

                    url = fixedUrl;
                }
                else
                {
                    url = $"{src.BaseUrl}/{path}";
                }

                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(20);

                var fallbackUrl = src.FixedPaths == null && src.NotFoundFallbackBaseUrl != null
                    ? $"{src.NotFoundFallbackBaseUrl}/{path}"
                    : null;
                using var response = await SendWithNotFoundFallbackAsync(client, url, fallbackUrl, cancellationToken).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.Debug($"[CDN] Upstream returned {(int)response.StatusCode} for source '{source}'.");
                    return null;
                }

                var contentType = response.Content.Headers.ContentType?.MediaType ?? string.Empty;
                if (!src.AllowedTypes.Contains(contentType))
                {
                    _logger.Warning($"[CDN] Upstream content-type '{contentType}' not allowed for source '{source}'.");
                    return null;
                }

                // Enforce the size cap even when the server lies about / omits Content-Length.
                var declared = response.Content.Headers.ContentLength;
                if (declared.HasValue && declared.Value > MaxAssetBytes)
                {
                    _logger.Warning($"[CDN] Asset for source '{source}' exceeds size cap ({declared.Value} bytes).");
                    return null;
                }

                var bytes = await ReadCappedAsync(response, cancellationToken).ConfigureAwait(false);
                if (bytes == null)
                {
                    _logger.Warning($"[CDN] Asset for source '{source}' exceeded the size cap while streaming.");
                    return null;
                }

                var etag = $"\"{Convert.ToHexString(SHA256.HashData(bytes))}\"";
                return new CdnAsset(bytes, contentType, etag);
            }
            // HttpClient timeouts also throw OperationCanceledException. Only
            // caller cancellation should abort the refresh or bypass stale cache.
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.Warning($"[CDN] Fetch failed for source '{source}': {ex.Message}");
                return null;
            }
        }

        // Only repository layout changes justify a second URL. Both URLs come from
        // the server-owned catalog and the response follows the same type/size checks.
        private static async Task<HttpResponseMessage> SendWithNotFoundFallbackAsync(
            HttpClient client, string url, string? fallbackUrl, CancellationToken cancellationToken)
        {
            var response = await SendAsync(url).ConfigureAwait(false);
            if (response.StatusCode != HttpStatusCode.NotFound || fallbackUrl == null)
            {
                return response;
            }

            response.Dispose();
            return await SendAsync(fallbackUrl).ConfigureAwait(false);

            async Task<HttpResponseMessage> SendAsync(string requestUrl)
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
                request.Headers.UserAgent.ParseAdd(UserAgent);
                return await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            }
        }

        /// <summary>Reads the response body, aborting if it grows past the size cap.</summary>
        private static async Task<byte[]?> ReadCappedAsync(HttpResponseMessage response, CancellationToken cancellationToken)
        {
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var buffer = new MemoryStream();
            var chunk = new byte[81920];
            int read;
            while ((read = await stream.ReadAsync(chunk, cancellationToken).ConfigureAwait(false)) > 0)
            {
                if (buffer.Length + read > MaxAssetBytes)
                {
                    return null;
                }

                buffer.Write(chunk, 0, read);
            }

            return buffer.ToArray();
        }

    }
}
