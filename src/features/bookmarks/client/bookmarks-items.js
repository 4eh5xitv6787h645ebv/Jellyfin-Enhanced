// Bookmark item context and Jellyfin metadata/provider lookup with per-item cache.
// Internal exports are loaded before bookmarks.js; that entry owns the public API and lifecycle.
(function(JE) {
  'use strict';

  if (!JE.pluginConfig?.BookmarksEnabled) return;
  JE.internals = JE.internals || {};
  const internal = JE.internals.bookmarks = JE.internals.bookmarks || {};
  const logPrefix = '🪼 Jellyfin Enhanced: Bookmarks:';

  /**
   * Get current video item data (similar to osd-rating.js)
   */
  function getCurrentItemData() {
    try {
      // Get item ID from favorite/rating button
      const btnUserRating = document.querySelector('.videoOsdBottom .btnUserRating[data-id]');
      const itemId = btnUserRating?.dataset?.id || null;

      if (!itemId) {
        console.debug(`${logPrefix} No item ID found`);
        return null;
      }

      return { itemId };
    } catch (e) {
      console.warn(`${logPrefix} Error getting item data:`, e);
      return null;
    }
  }

  const itemDetailsCache = { itemId: null, data: null, pending: null };

  /**
   * Fetch full item details including TMDB/TVDB IDs (cached per item for a few seconds)
   */
  async function fetchItemDetails(itemId) {
    if (itemDetailsCache.itemId === itemId && itemDetailsCache.data) {
      return itemDetailsCache.data;
    }

    if (itemDetailsCache.pending && itemDetailsCache.itemId === itemId) {
      return itemDetailsCache.pending;
    }

    const fetchPromise = (async () => {
      try {
        const userId = ApiClient.getCurrentUserId?.();
        if (!userId) return null;

        const result = await ApiClient.ajax({
          type: 'GET',
          url: ApiClient.getUrl(`/Users/${userId}/Items`, {
            Ids: itemId,
            Fields: 'ProviderIds,Type,Name,SeriesId,ParentIndexNumber,IndexNumber'
          }),
          dataType: 'json'
        });

        const item = result?.Items?.[0];
        if (!item) return null;

        // For episodes/seasons, also get series TMDB/TVDB
        let sourceItem = item;
        if ((item.Type === 'Season' || item.Type === 'Episode') && item.SeriesId) {
          try {
            const seriesResult = await ApiClient.ajax({
              type: 'GET',
              url: ApiClient.getUrl(`/Users/${userId}/Items`, {
                Ids: item.SeriesId,
                Fields: 'ProviderIds,Type,Name'
              }),
              dataType: 'json'
            });
            const seriesItem = seriesResult?.Items?.[0];
            if (seriesItem) {
              // TMDB has no per-episode ID, so fall back to the series' ID. TVDB does
              // have a unique per-episode ID, so prefer the episode's own.
              sourceItem = {
                ...item,
                ProviderIds: {
                  ...(item.ProviderIds || {}),
                  Tmdb: seriesItem.ProviderIds?.Tmdb || item.ProviderIds?.Tmdb,
                  Tvdb: item.ProviderIds?.Tvdb || seriesItem.ProviderIds?.Tvdb
                }
              };
            }
          } catch (e) {
            console.warn(`${logPrefix} Failed to fetch series info:`, e);
          }
        }

        const tmdbId = sourceItem.ProviderIds?.Tmdb || null;
        const tvdbId = sourceItem.ProviderIds?.Tvdb || null;
        const mediaType = item.Type === 'Movie' ? 'movie'
          : (item.Type === 'Series' || item.Type === 'Episode' || item.Type === 'Season') ? 'tv'
          : (item.Type || '').toString().toLowerCase();

        // tmdbId is series-level for episodes, so track season/episode too for fallback matching.
        const seasonNumber = item.Type === 'Episode' ? (item.ParentIndexNumber ?? null) : null;
        const episodeNumber = item.Type === 'Episode' ? (item.IndexNumber ?? null) : null;

        const details = {
          itemId: item.Id,
          tmdbId,
          tvdbId,
          mediaType,
          name: item.Name || 'Unknown',
          type: item.Type,
          seasonNumber,
          episodeNumber
        };

        itemDetailsCache.data = details;
        return details;
      } catch (e) {
        console.warn(`${logPrefix} Error fetching item details:`, e);
        return null;
      } finally {
        itemDetailsCache.pending = null;
      }
    })();

    itemDetailsCache.itemId = itemId;
    itemDetailsCache.pending = fetchPromise;
    return fetchPromise;
  }

  Object.assign(internal, { getCurrentItemData, fetchItemDetails });

})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
