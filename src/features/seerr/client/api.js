// Public Seerr API facade. Endpoint transport is shared by the feature modules
// in api/: status, catalog, overrides, requests, and issues. Keep this public
// entry point and its method signatures stable for existing UI consumers.
(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Seerr API:';
    const api = {};

    /**
     * Internal fetch helper — delegates to the shared core API client, which
     * owns the auth headers, retry/backoff, in-flight dedup, response cache
     * and concurrency limiting (formerly duplicated here).
     * @param {string} url - The fully-qualified URL to fetch.
     * @param {object} [options] - Optional settings (signal, skipCache, skipRetry, cacheKey).
     * @returns {Promise<any>} - The parsed JSON response.
     */
    async function managedFetch(url, options = {}) {
        return JE.core.api.fetch(url, options);
    }

    /**
     * Performs a GET request to the TMDB proxy endpoint.
     * @param {string} path - The TMDB API path (e.g., '/movie/123').
     * @param {object} [options] - Optional settings (signal, skipCache, skipRetry).
     * @returns {Promise<any>} - The JSON response from the server.
     */
    async function tmdbGet(path, options = {}) {
        const url = ApiClient.getUrl(`/JellyfinEnhanced/tmdb${path}`);
        const cacheKey = options.skipCache ? null : `tmdb:${path}`;
        return managedFetch(url, { ...options, cacheKey });
    }

    /**
     * Performs a GET request to the Seerr proxy endpoint.
     * @param {string} path - The API path (e.g., '/search?query=...').
     * @param {object} [options] - Optional settings (signal, skipCache, skipRetry).
     * @returns {Promise<any>} - The JSON response from the server.
     */
    async function get(path, options = {}) {
        const url = ApiClient.getUrl(`/JellyfinEnhanced/jellyseerr${path}`);
        const cacheKey = options.skipCache ? null : `jellyseerr:${path}`;
        return managedFetch(url, { ...options, cacheKey });
    }

    /**
     * Performs a POST request to the Seerr proxy endpoint.
     * @param {string} path - The API path (e.g., '/request').
     * @param {object} body - The JSON body to send with the request.
     * @returns {Promise<any>} - The server's response.
     */
    async function post(path, body) {
        // skipRetry: POSTs are not idempotent — never auto-retry them.
        return JE.core.api.plugin(`/jellyseerr${path}`, { method: 'POST', body, skipRetry: true });
    }

    /**
     * Resolves the Seerr base URL based on URL mappings or falls back to the default base URL.
     * This function checks if there are URL mappings configured and matches the current Jellyfin server URL
     * against the mappings to determine the appropriate Seerr URL.
     * @returns {string} - The resolved Seerr base URL (without trailing slash), or empty string if none configured.
     */
    api.resolveJellyseerrBaseUrl = function() {
        let baseUrl = '';

        // Check if URL mappings are configured
        if (JE?.pluginConfig?.JellyseerrUrlMappings) {
            const serverAddress = (typeof ApiClient !== 'undefined' && ApiClient.serverAddress)
                ? ApiClient.serverAddress()
                : window.location.origin;

            const currentUrl = serverAddress.replace(/\/+$/, '').toLowerCase();
            const mappings = JE.pluginConfig.JellyseerrUrlMappings.toString().split('\n').map(line => line.trim()).filter(Boolean);

            for (const mapping of mappings) {
                const [jellyfinUrl, jellyseerrUrl] = mapping.split('|').map(s => s.trim());
                if (!jellyfinUrl || !jellyseerrUrl) continue;

                const normalizedJellyfinUrl = jellyfinUrl.replace(/\/+$/, '').toLowerCase();

                if (currentUrl === normalizedJellyfinUrl) {
                    baseUrl = jellyseerrUrl.replace(/\/$/, '');
                    break;
                }
            }
        }

        // Fallback to the default base URL if no mapping matched
        if (!baseUrl && JE?.pluginConfig?.JellyseerrBaseUrl) {
            baseUrl = JE.pluginConfig.JellyseerrBaseUrl.toString().trim().replace(/\/$/, '');
        }

        return baseUrl;
    };

    const dependencies = { api, get, tmdbGet, post, logPrefix };
    for (const name of ['status', 'catalog', 'overrides', 'requests', 'issues']) {
        JE.jellyseerrApiModules[name](dependencies);
    }

    JE.jellyseerrAPI = api;
})(window.JellyfinEnhanced);
