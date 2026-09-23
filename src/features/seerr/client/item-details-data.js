// Shared Jellyfin item lookup for the independent detail-page workflows.
(function (JE) {
    'use strict';

    JE.internals = JE.internals || {};
    const details = JE.internals.jellyseerrItemDetails = JE.internals.jellyseerrItemDetails || {};

    const logPrefix = '🪼 Jellyfin Enhanced: Seerr Item Details:';

    /**
     * Gets the TMDB ID from a Jellyfin item
     * @param {string} itemId - Jellyfin item ID
     * @param {AbortSignal} [signal] - Optional abort signal
     * @returns {Promise<{tmdbId: number|null, type: string|null}>}
     */
    async function getTmdbIdFromItem(itemId, signal) {
        try {
            // Check for abort before making request
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            const userId = ApiClient.getCurrentUserId();
            const item = JE.helpers?.getItemCached
                ? await JE.helpers.getItemCached(itemId, { userId })
                : await ApiClient.getItem(userId, itemId);

            // Check for abort after request
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            if (!item) {
                console.warn(`${logPrefix} Item not found:`, itemId);
                return { tmdbId: null, type: null };
            }

            // Check if item is Movie or Series
            const itemType = item.Type;
            if (itemType !== 'Movie' && itemType !== 'Series') {
                return { tmdbId: null, type: null };
            }

            // Get TMDB ID from provider IDs
            const tmdbId = item.ProviderIds?.Tmdb;
            if (!tmdbId) {
                console.warn(`${logPrefix} No TMDB ID found for item:`, item.Name);
                return { tmdbId: null, type: null };
            }

            const type = itemType === 'Movie' ? 'movie' : 'tv';
            return { tmdbId: parseInt(tmdbId), type };
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            console.error(`${logPrefix} Error getting TMDB ID:`, error);
            return { tmdbId: null, type: null };
        }
    }

    details.getTmdbIdFromItem = getTmdbIdFromItem;

})(window.JellyfinEnhanced);
