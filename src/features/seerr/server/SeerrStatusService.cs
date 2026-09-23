using static Jellyfin.Plugin.JellyfinEnhanced.Services.Api.SeerrCacheState;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Api
{
    /// <summary>
    /// Probes configured Seerr instances and shares short-lived reachability results with proxy requests.
    /// </summary>
    public sealed class SeerrStatusService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public SeerrStatusService(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        public async Task<bool> IsReachableAsync()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.JellyseerrEnabled || string.IsNullOrEmpty(config.JellyseerrApiKey) || string.IsNullOrEmpty(config.JellyseerrUrls))
            {
                return false;
            }

            var urls = config.JellyseerrUrls.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var httpClient = Helpers.Jellyseerr.SeerrHttpHelper.CreateClient(_httpClientFactory);
            httpClient.Timeout = TimeSpan.FromSeconds(15);

            foreach (var url in urls)
            {
                var requestUri = $"{url.Trim().TrimEnd('/')}/api/v1/status";
                try
                {
                    using var request = Helpers.Jellyseerr.SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get, requestUri, config.JellyseerrApiKey);
                    using var response = await httpClient.SendAsync(request);
                    var (_, error) = await Helpers.Jellyseerr.SeerrHttpHelper.ReadResponseAsync(response, requestUri);
                    if (error == null)
                    {
                        return true;
                    }
                    _logger.Warning($"Seerr status check failed at {url}: code={error.Code} status={error.HttpStatus} cf-ray={error.CfRay} — {error.Message}");
                }
                catch
                {
                    // Ignore and try next URL
                }
            }

            _logger.Warning("Could not establish a connection with any configured Seerr URL. Status is inactive.");
            return false;
        }

        public async Task<bool> IsReachableCachedAsync()
        {
            lock (_seerrStatusCacheLock)
            {
                if (_seerrStatusCache.HasValue
                    && DateTime.UtcNow - _seerrStatusCache.Value.CachedAt < _seerrStatusCacheTtl)
                {
                    return _seerrStatusCache.Value.Active;
                }
            }

            var active = await IsReachableAsync();
            lock (_seerrStatusCacheLock)
            {
                _seerrStatusCache = (active, DateTime.UtcNow);
            }
            return active;
        }
    }
}
