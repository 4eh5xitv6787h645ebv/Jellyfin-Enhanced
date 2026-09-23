// Collection enrichment shared by initial search and manual refresh.
(function(JE) {
    'use strict';
    JE.seerrSearch = JE.seerrSearch || {};

    const logPrefix = '🪼 Jellyfin Enhanced: Seerr:';
    /**
     * Adds collection data and synthetic collection cards to a raw result set.
     * @param {Array} rawResults Raw search results from Seerr.
     * @returns {Promise<Array>} Enriched results including collections and badges.
     */
    JE.seerrSearch.prepareResultsWithCollections = async function(rawResults, options = {}) {
        let results = rawResults || [];
        if (JE.pluginConfig.ShowCollectionsInSearch === false) {
            return results;
        }

        try {
            results = await JE.jellyseerrAPI.addCollections(results, options);
        } catch (e) {
            console.debug(`${logPrefix} Collection addition failed:`, e);
        }

        try {
            const collectionsMap = new Map();
            const collectionPositions = new Map();

            for (let i = 0; i < results.length; i++) {
                const item = results[i];
                if (item.mediaType === 'movie' && item.collection && item.collection.id) {
                    const key = String(item.collection.id);
                    if (!collectionsMap.has(key)) {
                        collectionsMap.set(key, {
                            id: item.collection.id,
                            mediaType: 'collection',
                            title: item.collection.name,
                            name: item.collection.name,
                            posterPath: item.collection.posterPath || null,
                            backdropPath: item.collection.backdropPath || null,
                            overview: `${item.collection.name} Collection`,
                            voteAverage: null,
                            releaseDate: null
                        });
                        collectionPositions.set(key, i);
                    }
                }
            }

            if (collectionsMap.size > 0) {
                const sortedCollections = Array.from(collectionPositions.entries())
                    .sort((a, b) => b[1] - a[1]);

                for (const [collectionId, position] of sortedCollections) {
                    const collectionCard = collectionsMap.get(collectionId);
                    results.splice(position + 1, 0, collectionCard);
                }
            }
        } catch (e) {
            console.debug(`${logPrefix} Failed injecting collections:`, e);
        }

        return results;
    };

})(window.JellyfinEnhanced);
