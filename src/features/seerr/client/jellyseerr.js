// /js/jellyseerr/jellyseerr.js
(function(JE) {
    'use strict';

    /**
     * Main initialization function for Seerr search integration.
     * This function sets up the state, observers, and event listeners.
     */
    JE.initializeJellyseerrScript = function() {
        // Early exit if Seerr integration or search results are disabled in plugin settings
        if (!JE.pluginConfig.JellyseerrEnabled) {
            console.log('🪼 Jellyfin Enhanced: Seerr Search: Integration is disabled in plugin settings.');
            return;
        }
        if (JE.pluginConfig.JellyseerrShowSearchResults === false) {
            console.log('🪼 Jellyfin Enhanced: Seerr Search: Search results are disabled in plugin settings.');
            return;
        }

        const logPrefix = '🪼 Jellyfin Enhanced: Seerr:';
        const { checkUserStatus } = JE.jellyseerrAPI;
        const { addMainStyles, addSeasonModalStyles } = JE.jellyseerrUI;
        const lifecycle = JE.core.lifecycle.register('jellyseerr-search');
        lifecycle.teardown();
        let disposed = false;
        const timers = new Map();
        lifecycle.track(() => { disposed = true; timers.clear(); });
        // The feature survives navigation, but reinitialization/hard teardown owns
        // every listener, observer, timer and the current search request.
        const scope = {
            track: resource => lifecycle.track(resource),
            addListener: (...args) => lifecycle.addListener(...args),
            delay(callback, milliseconds) {
                if (disposed) return null;
                const timer = { timeoutId: null };
                timer.timeoutId = setTimeout(() => {
                    lifecycle.untrack(timer);
                    timers.delete(timer.timeoutId);
                    if (!disposed) callback();
                }, milliseconds);
                lifecycle.track(timer);
                timers.set(timer.timeoutId, timer);
                return timer.timeoutId;
            },
            cancelDelay(id) {
                clearTimeout(id);
                const timer = timers.get(id);
                if (timer) lifecycle.untrack(timer);
                timers.delete(id);
            }
        };
        const state = { active: false, userFound: false, onlyMode: false };
        const results = JE.seerrSearch.createResults(state);
        lifecycle.track(() => results.dispose());
        const page = JE.seerrSearch.createPage(state, results, scope);

        /**
         * Waits for the user session to be available before initializing the main logic.
         */
        function waitForUserAndInitialize() {
            const startTime = Date.now();
            const timeout = 20000;

            const checkForUser = async () => {
                if (disposed) return;
                if (ApiClient.getCurrentUserId() && ApiClient.accessToken()) {
                    console.log(`${logPrefix} User session found. Initializing...`);
                    const status = await checkUserStatus();
                    if (disposed) return;
                    state.active = status.active;
                    state.userFound = status.userFound;
                    console.debug(`${logPrefix} Status: active=${state.active}, userFound=${state.userFound}`);
                    page.initialize();

                    // Prefetch TMDB genres in the background for instant discovery
                    if (state.active && JE.pluginConfig?.JellyseerrShowGenreDiscovery !== false) {
                        Promise.all([
                            JE.discoveryFilter?.fetchWithManagedRequest?.('/JellyfinEnhanced/tmdb/genres/tv', 'genre', {})?.catch(() => {}),
                            JE.discoveryFilter?.fetchWithManagedRequest?.('/JellyfinEnhanced/tmdb/genres/movie', 'genre', {})?.catch(() => {})
                        ]).catch(() => {});
                    }
                } else if (Date.now() - startTime > timeout) {
                    console.warn(`${logPrefix} Timed out waiting for user session. Features may be limited.`);
                    page.initialize();
                } else {
                    scope.delay(checkForUser, 300);
                }
            };
            checkForUser();
        }


        addMainStyles();
        addSeasonModalStyles();
        waitForUserAndInitialize();
        JE.seerrSearch.bindInteractions(results, scope);
        console.log(`${logPrefix} Initialization complete.`);
    };
})(window.JellyfinEnhanced);
