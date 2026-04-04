/**
 * Home Screen Sections (HSS) Discovery Handler
 * Intercepts discover card clicks and opens the Jellyseerr more-info modal
 * instead of navigating to the Jellyseerr website
 */

(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: HSS Discovery Handler:';

    function initDiscoveryHandler() {

        document.addEventListener('click', function(e) {
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
        }, true);
    }

    // Prefetch on hover: when user hovers over a discover card, start loading
    // the media details into the cache so click-to-open is near-instant.
    let prefetchTimer = null;
    document.addEventListener('mouseover', function(e) {
        const card = e.target.closest('.discover-card');
        if (!card) return;

        const tmdbId = card.dataset.tmdbId;
        const mediaType = card.dataset.mediaType;
        if (!tmdbId || !mediaType || !JE?.jellyseerrMoreInfo?.prefetch) return;

        // Debounce: only prefetch after 150ms hover to avoid wasted requests
        clearTimeout(prefetchTimer);
        prefetchTimer = setTimeout(() => {
            JE.jellyseerrMoreInfo.prefetch(parseInt(tmdbId, 10), mediaType);
        }, 150);
    }, true);

    document.addEventListener('mouseout', function(e) {
        const card = e.target.closest('.discover-card');
        if (card) clearTimeout(prefetchTimer);
    }, true);

    initDiscoveryHandler();

})(window.JellyfinEnhanced || {});
