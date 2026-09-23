// Seerr requests: registered before api.js and composed with its shared transport.
(function(JE) {
    'use strict';

    JE.jellyseerrApiModules = JE.jellyseerrApiModules || {};
    JE.jellyseerrApiModules.requests = function({ api, get, post, logPrefix }) {
        /**
         * Invalidate Seerr/TMDB caches impacted by a successful request.
         * Keeps UI surfaces in sync without waiting for a hard refresh.
         * @param {number|string} tmdbId
         * @param {'movie'|'tv'} mediaType
         */
        function invalidateRequestCaches(tmdbId, mediaType) {
            if (!JE.requestManager) {
                return;
            }

            const id = String(tmdbId);
            const type = String(mediaType || '').toLowerCase();
            if (!id || (type !== 'movie' && type !== 'tv')) {
                return;
            }

            const patterns = [
                // Item detail responses used by modals/cards.
                `jellyseerr:/${type}/${id}`,
                // Generic result surfaces that may include this media item.
                'jellyseerr:/search?',
                'jellyseerr:/discover/',
                // Request lists and watchlist views can reflect new state.
                'jellyseerr:/request?',
                'jellyseerr:/watchlist?',
                'jellyseerr:/quota'
            ];

            // Movie requests can affect collection rendering.
            if (type === 'movie') {
                patterns.push(`tmdb:/movie/${id}`);
            }

            patterns.forEach(pattern => JE.requestManager.clearCacheMatching(pattern));
        }

        /**
         * Broadcast successful request events so all UI surfaces can update immediately.
         * @param {number|string} tmdbId
         * @param {'movie'|'tv'} mediaType
         * @param {boolean} is4k
         */
        function emitMediaRequested(tmdbId, mediaType, is4k = false) {
            document.dispatchEvent(new CustomEvent('jellyseerr-media-requested', {
                detail: { tmdbId: String(tmdbId), mediaType: String(mediaType || '').toLowerCase(), is4k: !!is4k }
            }));

            if (String(mediaType || '').toLowerCase() === 'tv') {
                document.dispatchEvent(new CustomEvent('jellyseerr-tv-requested', {
                    detail: { tmdbId: String(tmdbId), mediaType: 'tv' }
                }));
            }
        }

        // All request variants share the same successful-request side effects.
        // Watchlist failure must never turn a submitted request into a failure.
        async function completeRequest(result, tmdbId, mediaType, is4k) {
            // Add to watchlist after successful request
            if (result) {
                invalidateRequestCaches(tmdbId, mediaType);
                emitMediaRequested(tmdbId, mediaType, is4k);
                JE.helpers.trackUsage('seerr.request_submitted');
                try {
                    await api.addToWatchlist(tmdbId, mediaType);
                } catch (error) {
                    // Don't fail the request if watchlist addition fails
                    console.warn(`${logPrefix} Failed to add to watchlist:`, error);
                }
            }

            return result;
        }

        /**
         * Submits a request for a movie or an entire TV series.
         * @param {number} tmdbId - The TMDB ID of the media.
         * @param {string} mediaType - 'movie' or 'tv'.
         * @param {object} [advancedSettings={}] - Optional advanced settings (server, quality, folder).
         * @param {boolean} [is4k=false] - Whether this is a 4K request.
         * @param {object} [mediaData=null] - Optional media data for override rule evaluation.
         * @returns {Promise<any>}
         */
        api.requestMedia = async function(tmdbId, mediaType, advancedSettings = {}, is4k = false, mediaData = null) {
            // Apply override rules if no advanced settings are provided and media data is available
            if (Object.keys(advancedSettings).length === 0 && mediaData) {
                const overrideSettings = await api.evaluateOverrideRules(mediaData, mediaType, is4k);
                if (overrideSettings) {
                    console.debug(`${logPrefix} Applying override rule settings:`, overrideSettings);
                    advancedSettings = { ...overrideSettings };
                }
            }

            const body = {
                mediaType,
                mediaId: parseInt(tmdbId),
                ...advancedSettings,
                ...(mediaType === 'tv' ? { seasons: 'all' } : {}),
                ...(is4k ? { is4k: true } : {})
            };

            const result = await post('/request', body);

            return completeRequest(result, tmdbId, mediaType, is4k);
        };

        /**
         * Submits a request for specific seasons of a TV series.
         * @param {number} tmdbId - The TMDB ID of the TV show.
         * @param {number[]} seasonNumbers - An array of season numbers to request.
         * @param {object} [advancedSettings={}] - Optional advanced settings (server, quality, folder).
         * @param {object} [mediaData=null] - Optional media data for override rule evaluation.
         * @param {boolean} [is4k=false] - Whether this is a 4K request.
         * @returns {Promise<any>}
         */
        api.requestTvSeasons = async function(tmdbId, seasonNumbers, advancedSettings = {}, mediaData = null, is4k = false) {
            // Apply override rules if no advanced settings are provided and media data is available
            if (Object.keys(advancedSettings).length === 0 && mediaData) {
                const overrideSettings = await api.evaluateOverrideRules(mediaData, 'tv', is4k);
                if (overrideSettings) {
                    console.debug(`${logPrefix} Applying override rule settings for TV seasons:`, overrideSettings);
                    advancedSettings = { ...overrideSettings };
                }
            }

            const body = {
                mediaType: 'tv',
                mediaId: parseInt(tmdbId),
                seasons: seasonNumbers,
                ...advancedSettings,
                ...(is4k ? { is4k: true } : {})
            };
            const result = await post('/request', body);

            return completeRequest(result, tmdbId, 'tv', is4k);
        };

        /**
         * Fetches the necessary data for advanced request options (servers, profiles, folders).
         * @param {string} mediaType - 'movie' for Radarr, 'tv' for Sonarr.
         * @returns {Promise<{servers: Array, tags: Array}>}
         */
        api.fetchAdvancedRequestData = async function(mediaType) {
            const serverType = mediaType === 'movie' ? 'radarr' : 'sonarr';
            try {
                const servers = await get(`/${serverType}`);
                const serverList = Array.isArray(servers) ? servers : [servers];

                const validServers = await Promise.all(
                    serverList
                        .filter(server => server && typeof server.id === 'number')
                        .map(async (server) => {
                            try {
                                const details = await get(`/${serverType}/${server.id}`);
                                return {
                                    ...server,
                                    qualityProfiles: details.profiles || [],
                                    rootFolders: details.rootFolders || []
                                };
                            } catch (e) {
                                console.error(`${logPrefix} Could not fetch details for ${serverType} server ID ${server.id}:`, e);
                                return { ...server, qualityProfiles: [], rootFolders: [] };
                            }
                        })
                );
                return { servers: validServers, tags: [] };
            } catch (error) {
                console.error(`${logPrefix} Failed to fetch ${serverType} servers:`, error);
                return { servers: [], tags: [] };
            }
        };


        // Returns { movie, tv } quota with nextResetAt, or null when disabled / on failure.
        api.fetchUserQuota = async function(options = {}) {
            if (window.JellyfinEnhanced?.pluginConfig?.JellyseerrShowQuotaInfo === false) {
                return null;
            }
            try {
                return await get('/quota', options);
            } catch (error) {
                // 404 = user not linked, 503 = Seerr disabled — both expected, debug only.
                // Anything else (5xx, network, parse) is unexpected and admins need to see it.
                const expected = error?.status === 404 || error?.status === 503;
                (expected ? console.debug : console.warn)(`${logPrefix} Quota fetch failed:`, error);
                return null;
            }
        };

        /**
         * Fetches Seerr request settings (partial requests + special episodes).
         * @returns {Promise<{partialRequestsEnabled: boolean, enableSpecialEpisodes: boolean}>}
         */
        // keep last-known good settings across a Seerr outage so
        // the request modal doesn't silently flip to whole-season UI when admin
        // had partial requests enabled. The backend now returns 503 on outage
        // (was 200+false). Cache the last successful response in module scope.
        let _lastRequestSettings = null;
        api.fetchRequestSettings = async function() {
            try {
                const result = await get('/settings/partial-requests', { skipCache: true });
                const settings = {
                    partialRequestsEnabled: !!(result && result.partialRequestsEnabled),
                    enableSpecialEpisodes: !!(result && result.enableSpecialEpisodes)
                };
                _lastRequestSettings = settings;
                return settings;
            } catch (error) {
                console.warn(`${logPrefix} Failed to fetch request settings:`, error);
                // Return last known good if we have one — better than flipping the
                // UI to "no partial requests" when Seerr is briefly unreachable.
                if (_lastRequestSettings) return _lastRequestSettings;
                return { partialRequestsEnabled: false, enableSpecialEpisodes: false };
            }
        };

        /**
         * Adds requested media to the pending watchlist.
         * The item will be automatically added to the watchlist when it appears in the library.
         * @param {number} tmdbId - The TMDB ID of the media.
         * @param {string} mediaType - 'movie' or 'tv'.
         * @returns {Promise<boolean>} - True if successfully queued, false otherwise.
         */
        api.addToWatchlist = async function(tmdbId, mediaType) {
            try {
                // Check if watchlist feature is enabled in plugin config
                const JE = window.JellyfinEnhanced;
                if (!JE || !JE.pluginConfig) {
                    console.debug(`${logPrefix} Plugin config not loaded yet`);
                    return false;
                }

                if (!JE.pluginConfig.AddRequestedMediaToWatchlist || !JE.pluginConfig.JellyseerrEnabled) {
                    console.debug(`${logPrefix} Watchlist auto-add is disabled (AddRequestedMediaToWatchlist: ${JE.pluginConfig.AddRequestedMediaToWatchlist}, JellyseerrEnabled: ${JE.pluginConfig.JellyseerrEnabled})`);
                    return false;
                }

                // WatchlistMonitor service automatically handles adding requested items to watchlist
                console.debug(`${logPrefix} Request tracked - WatchlistMonitor will automatically add TMDB ${tmdbId} (${mediaType}) to watchlist when it appears in library`);
                return true;
            } catch (error) {
                console.error(`${logPrefix} Error queuing item for watchlist:`, error);
                return false;
            }
        };
    };
})(window.JellyfinEnhanced);
