/**
 * Home Screen Sections (HSS) Discovery Handler
 * Intercepts discover card clicks and opens the Jellyseerr more-info modal
 * instead of navigating to the Jellyseerr website
 */

(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: HSS Discovery Handler:';

    function clickHandler(e) {
        // Don't intercept if clicking the request button
        if (e.target.closest('.discover-requestbutton')) {
            return;
        }

        // Target any click on the discover card (except the request button)
        const discoverCard = e.target.closest('.discover-card');

        if (!discoverCard) {
            return;
        }

        const tmdbId = discoverCard.dataset.tmdbId;
        const mediaType = discoverCard.dataset.mediaType;

        // Check if JE.jellyseerrMoreInfo is available
        if (!tmdbId || !mediaType || !JE?.jellyseerrMoreInfo?.open) {
            return;
        }

        console.log(`${logPrefix} Opening more-info modal for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

        e.preventDefault();
        e.stopPropagation();

        // Open the more-info modal
        JE.jellyseerrMoreInfo.open(tmdbId, mediaType);
    }

    var ctx = JE.helpers ? JE.helpers.createModuleContext('hss-discovery-handler') : null;
    let initialized = false;

    function initDiscoveryHandler() {
        if (initialized) return;
        if (ctx) {
            ctx.listen(document, 'click', clickHandler, true);
        } else {
            document.addEventListener('click', clickHandler, true);
        }
        initialized = true;
    }

    function teardown() {
        if (ctx) ctx.teardown();
        else document.removeEventListener('click', clickHandler, true);
        initialized = false;
    }

    if (JE.pluginConfig?.JellyseerrEnabled) {
        initDiscoveryHandler();
    }

    if (JE.moduleRegistry) {
        JE.moduleRegistry.register('hss-discovery-handler', {
            configKeys: ['JellyseerrEnabled'],
            init: initDiscoveryHandler,
            teardown: teardown
        });
    }

})(window.JellyfinEnhanced || {});
