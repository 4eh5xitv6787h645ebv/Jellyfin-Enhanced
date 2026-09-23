// Streaming-provider transport and the existing user-facing error mapping.
(function (JE) {
    'use strict';

    function createElsewhereApi() {
        // Fetch streaming data
        function fetchStreamingData(tmdbId, mediaType, callback) {
            const url = ApiClient.getUrl(`/JellyfinEnhanced/tmdb/${mediaType}/${tmdbId}/watch/providers`);
            JE.core.api.fetch(url)
                .then(data => callback(null, data))
                .catch(error => {
                    let errorMessage;
                    const errorMessageText = error.message || '';

                    // Check 1: Network error (browser couldn't connect)
                    if (error instanceof TypeError && errorMessageText === 'Failed to fetch') {
                        errorMessage = 'TMDB API is unreachable.';

                    // Check 2: JSON parse error — server returned non-JSON with a 200 status
                    // (e.g. a reverse proxy error page, or a Jellyfin middleware intercept)
                    } else if (error instanceof SyntaxError) {
                        errorMessage = 'Received an unexpected response from the server. Check your reverse proxy or Jellyfin configuration.';

                    // Check 3: Invalid API Key error
                    } else if (errorMessageText.includes('401')) {
                        errorMessage = 'Invalid TMDB API Key.';

                    // Check 4: Item not found
                    } else if (errorMessageText.includes('404')) {
                        errorMessage = 'The requested item could not be found on TMDB.';

                    // Check 5: Rate limit error
                    } else if (errorMessageText.includes('429')) {
                        errorMessage = 'Too many requests. Please wait a moment and try again.';

                    // Check 6: TMDB server-side issues (e.g., 500, 502, 503, 504) —
                    // JE.core.api throws Error('HTTP <status>') for non-OK responses
                    } else if (errorMessageText.startsWith('HTTP 5')) {
                        errorMessage = 'The TMDB service is temporarily unavailable. Please try again later.';

                    // Fallback: All other errors
                    } else {
                        errorMessage = errorMessageText || 'An unknown error occurred';
                    }

                    callback(errorMessage);
                });
        }

        return { fetchStreamingData };
    }

    JE.elsewhereApi = { create: createElsewhereApi };
})(window.JellyfinEnhanced);
