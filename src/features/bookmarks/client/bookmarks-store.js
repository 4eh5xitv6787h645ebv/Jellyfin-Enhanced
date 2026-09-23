// Bookmark settings persistence, mutation notifications, migration and orphan maintenance.
// Internal exports are loaded before bookmarks.js; that entry owns the public API and lifecycle.
(function(JE) {
  'use strict';

  if (!JE.pluginConfig?.BookmarksEnabled) return;
  JE.internals = JE.internals || {};
  const internal = JE.internals.bookmarks = JE.internals.bookmarks || {};
  const { generateBookmarkId, matchBookmarks, getCurrentItemData, fetchItemDetails } = internal;
  const logPrefix = '🪼 Jellyfin Enhanced: Bookmarks:';

  // Notify other views (e.g., CustomTabs library) when bookmarks change
  function emitBookmarksUpdated(reason = 'updated') {
    try {
      document.dispatchEvent(new CustomEvent('je-bookmarks-updated', { detail: { reason } }));
    } catch (e) {
      console.warn(`${logPrefix} Failed to emit update event`, e);
    }
  }

  // Keep storage access here so matching can also be used with isolated data.
  function findBookmarksForItem(itemId, tmdbId, tvdbId, seasonNumber = null, episodeNumber = null) {
    return matchBookmarks(JE.userConfig?.bookmark?.bookmarks || {}, itemId, tmdbId, tvdbId, seasonNumber, episodeNumber);
  }

  /**
   * Add a new bookmark
   */
  async function addBookmark(timestamp, label = '') {
    const itemData = getCurrentItemData();
    if (!itemData) {
      JE.toast(JE.t('toast_bookmark_no_item'), 3000);
      return null;
    }

    // Fetch full details
    const details = await fetchItemDetails(itemData.itemId);
    if (!details) {
      JE.toast(JE.t('toast_bookmark_fetch_failed'), 3000);
      return null;
    }

    const bookmarkId = generateBookmarkId();
    const now = new Date().toISOString();

    const bookmark = {
      itemId: details.itemId || '',
      tmdbId: details.tmdbId || '',
      tvdbId: details.tvdbId || '',
      mediaType: details.mediaType || '',
      name: details.name || '',
      timestamp: timestamp,
      label: label || '',
      createdAt: now,
      updatedAt: now,
      syncedFrom: '',
      seasonNumber: details.seasonNumber ?? null,
      episodeNumber: details.episodeNumber ?? null
    };

    // Initialize bookmark structure if needed
    if (!JE.userConfig.bookmark) {
      JE.userConfig.bookmark = { bookmarks: {} };
    }
    if (!JE.userConfig.bookmark.bookmarks) {
      JE.userConfig.bookmark.bookmarks = {};
    }

    JE.userConfig.bookmark.bookmarks[bookmarkId] = bookmark;

    try {
      await JE.saveUserSettings('bookmark.json', JE.userConfig.bookmark);
      console.log(`${logPrefix} Bookmark added:`, bookmarkId, bookmark);
      emitBookmarksUpdated('add');
      return { id: bookmarkId, ...bookmark };
    } catch (e) {
      console.error(`${logPrefix} Failed to save bookmark:`, e);
      delete JE.userConfig.bookmark.bookmarks[bookmarkId];
      throw e;
    }
  }

  /**
   * Update an existing bookmark
   */
  async function updateBookmark(bookmarkId, updates) {
    if (!JE.userConfig?.bookmark?.bookmarks?.[bookmarkId]) {
      console.warn(`${logPrefix} Bookmark not found:`, bookmarkId);
      return false;
    }

    const bookmark = JE.userConfig.bookmark.bookmarks[bookmarkId];
    Object.assign(bookmark, updates, { updatedAt: new Date().toISOString() });

    try {
      await JE.saveUserSettings('bookmark.json', JE.userConfig.bookmark);
      console.log(`${logPrefix} Bookmark updated:`, bookmarkId);
      emitBookmarksUpdated('update');
      return true;
    } catch (e) {
      console.error(`${logPrefix} Failed to update bookmark:`, e);
      return false;
    }
  }

  /**
   * Delete a bookmark
   */
  async function deleteBookmark(bookmarkId) {
    if (!JE.userConfig?.bookmark?.bookmarks?.[bookmarkId]) {
      console.warn(`${logPrefix} Bookmark not found:`, bookmarkId);
      return false;
    }

    delete JE.userConfig.bookmark.bookmarks[bookmarkId];

    try {
      await JE.saveUserSettings('bookmark.json', JE.userConfig.bookmark);
      console.log(`${logPrefix} Bookmark deleted:`, bookmarkId);
      emitBookmarksUpdated('delete');
      return true;
    } catch (e) {
      console.error(`${logPrefix} Failed to delete bookmark:`, e);
      return false;
    }
  }

  /**
   * Sync bookmarks from old item ID to new item ID
   * Creates duplicates with new item ID, keeps old ones
   */
  async function syncBookmarks(oldBookmarks, newItemDetails, timeOffset = 0) {
    const synced = [];
    const now = new Date().toISOString();

    for (const oldBookmark of oldBookmarks) {
      const newBookmarkId = generateBookmarkId();
      const newTimestamp = Math.max(0, oldBookmark.timestamp + timeOffset);

      const newBookmark = {
        itemId: newItemDetails.itemId,
        tmdbId: newItemDetails.tmdbId,
        tvdbId: newItemDetails.tvdbId,
        mediaType: newItemDetails.mediaType,
        name: newItemDetails.name,
        timestamp: newTimestamp,
        label: oldBookmark.label || '',
        createdAt: oldBookmark.createdAt || now,
        updatedAt: now,
        syncedFrom: oldBookmark.itemId, // Track where it came from
        seasonNumber: newItemDetails.seasonNumber ?? null,
        episodeNumber: newItemDetails.episodeNumber ?? null
      };

      JE.userConfig.bookmark.bookmarks[newBookmarkId] = newBookmark;
      synced.push({ id: newBookmarkId, ...newBookmark });
    }

    try {
      await JE.saveUserSettings('bookmark.json', JE.userConfig.bookmark);
      console.log(`${logPrefix} Synced ${synced.length} bookmarks to new item ID`);
      emitBookmarksUpdated('sync');
      return synced;
    } catch (e) {
      console.error(`${logPrefix} Failed to sync bookmarks:`, e);
      // Rollback
      synced.forEach(bm => delete JE.userConfig.bookmark.bookmarks[bm.id]);
      throw e;
    }
  }

  /**
   * One-time backfill for TV bookmarks saved before per-episode tracking existed:
   * populates seasonNumber/episodeNumber and corrects tvdbId to the episode's own
   * per-episode ID (previously stored as the series-level value).
   */
  async function backfillEpisodeMetadata() {
    const allBookmarks = JE.userConfig?.bookmark?.bookmarks || {};
    const candidates = Object.entries(allBookmarks).filter(
      ([, bm]) => bm?.mediaType === 'tv' && bm.itemId && bm.episodeNumber == null
    );
    if (candidates.length === 0) return;

    let changed = false;
    for (const [, bm] of candidates) {
      try {
        const details = await fetchItemDetails(bm.itemId);
        if (details?.episodeNumber != null) {
          bm.seasonNumber = details.seasonNumber;
          bm.episodeNumber = details.episodeNumber;
          if (details.tvdbId) bm.tvdbId = details.tvdbId;
          changed = true;
        }
      } catch (e) {
        // Item may no longer exist; leave it for cleanupOrphanedBookmarks() to handle
      }
    }

    if (changed) {
      try {
        await JE.saveUserSettings('bookmark.json', JE.userConfig.bookmark);
        console.log(`${logPrefix} Backfilled episode metadata for ${candidates.length} bookmark(s)`);
      } catch (e) {
        console.warn(`${logPrefix} Failed to save backfilled episode metadata:`, e);
      }
    }
  }

  /**
   * Delete bookmarks for items that no longer exist in Jellyfin
   */
  async function cleanupOrphanedBookmarks() {
    const allBookmarks = JE.userConfig?.bookmark?.bookmarks || {};
    const itemIds = new Set();
    const toDelete = [];

    // Collect all unique item IDs
    for (const bookmark of Object.values(allBookmarks)) {
      if (bookmark?.itemId) itemIds.add(bookmark.itemId);
    }

    // Check which items still exist
    const userId = ApiClient.getCurrentUserId?.();
    if (!userId) return { cleaned: 0, errors: 0 };

    let cleaned = 0;
    let errors = 0;

    for (const itemId of itemIds) {
      try {
        await (JE.helpers?.getItemCached
          ? JE.helpers.getItemCached(itemId, { userId })
          : ApiClient.getItem(userId, itemId));
        // Item exists, keep bookmarks
      } catch (e) {
        // Item doesn't exist, mark bookmarks for deletion
        for (const [bookmarkId, bookmark] of Object.entries(allBookmarks)) {
          if (bookmark?.itemId === itemId) {
            toDelete.push(bookmarkId);
          }
        }
      }
    }

    // Delete orphaned bookmarks
    for (const bookmarkId of toDelete) {
      try {
        await deleteBookmark(bookmarkId);
        cleaned++;
      } catch (e) {
        errors++;
      }
    }

    console.log(`${logPrefix} Cleanup: ${cleaned} orphaned bookmarks removed, ${errors} errors`);
    return { cleaned, errors };
  }

  Object.assign(internal, { addBookmark, updateBookmark, deleteBookmark, findBookmarksForItem, syncBookmarks, backfillEpisodeMetadata, cleanupOrphanedBookmarks });

})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
