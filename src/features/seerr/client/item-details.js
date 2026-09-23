// Navigation coordinator for independently cancellable Seerr detail-page workflows.
(function (JE) {
    'use strict';

    JE.internals = JE.internals || {};
    const details = JE.internals.jellyseerrItemDetails = JE.internals.jellyseerrItemDetails || {};

    const logPrefix = '🪼 Jellyfin Enhanced: Seerr Item Details:';

    /**
     * Handles item details page navigation
     */
    function handleItemDetailsPage() {
        // Get item ID from URL
        const hash = window.location.hash;
        if (!hash.includes('/details?id=')) {
            return;
        }

        try {
            const itemId = new URLSearchParams(hash.split('?')[1]).get('id');
            if (itemId) {
                // Use requestAnimationFrame instead of fixed timeout
                // This ensures we're in sync with the rendering cycle
                requestAnimationFrame(() => {
                    details.recommendations.render(itemId);
                    details.requestMore.render(itemId);
                });
            }
        } catch (error) {
            console.error(`${logPrefix} Error parsing item ID from URL:`, error);
        }
    }

    // Teardown both workflows before dispatching the next page. Each owns its
    // own controller so slower recommendations cannot cancel Request More.
    function cleanup() {
        details.recommendations.cleanup();
        details.requestMore.cleanup();
    }

    /**
     * Initializes the item details handler
     */
    function initialize() {
        console.debug(`${logPrefix} Initializing Recommendations and Similar sections`);
        details.requestMore.injectStyles();

        // Lifecycle: run cleanup() on EVERY navigation — hashchange, popstate
        // AND the pushState transitions the old raw hashchange listener
        // missed. Teardown wiring is registered first so cleanup always runs
        // before handleItemDetailsPage on a navigation.
        const lifecycle = JE.core.lifecycle.register('jellyseerr-item-details');
        lifecycle.onTeardown(cleanup);
        lifecycle.teardownOn('navigate');
        JE.core.navigation.onNavigate(() => handleItemDetailsPage());

        // Check current page on load
        handleItemDetailsPage();

        // Also react to view shows (Jellyfin's custom viewshow event)
        JE.core.navigation.onViewPage(() => handleItemDetailsPage());
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }


})(window.JellyfinEnhanced);
