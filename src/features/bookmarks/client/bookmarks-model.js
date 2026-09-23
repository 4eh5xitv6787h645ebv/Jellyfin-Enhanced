// Bookmark domain rules: identifiers, provider/episode matching and timestamp display.
// Internal exports are loaded before bookmarks.js; that entry owns the public API and lifecycle.
(function(JE) {
  'use strict';

  if (!JE.pluginConfig?.BookmarksEnabled) return;
  JE.internals = JE.internals || {};
  const internal = JE.internals.bookmarks = JE.internals.bookmarks || {};

  /**
   * Generate unique bookmark ID
   */
  function generateBookmarkId() {
    return `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Find bookmarks for current item (by itemId or TMDB/TVDB fallback)
   * Returns both exact matches and provider ID matches separately
   */
  function matchBookmarks(allBookmarks, itemId, tmdbId, tvdbId, seasonNumber = null, episodeNumber = null) {
    const exactMatches = [];
    const providerMatches = [];
    // tmdbId is series-level for episodes, so fallback matching must also require the
    // same episode number or it pulls in bookmarks from unrelated episodes.
    const isEpisode = episodeNumber !== null;

    for (const [bookmarkId, bookmark] of Object.entries(allBookmarks)) {
      // Skip invalid bookmarks
      if (typeof bookmark !== 'object' || bookmark === null) continue;

      // Direct itemId match (preferred)
      if (bookmark.itemId === itemId) {
        exactMatches.push({ id: bookmarkId, ...bookmark, exactMatch: true });
        continue;
      }

      // Only bookmarks with episode metadata get the stricter check; legacy bookmarks
      // (no episodeNumber) fall back to the old provider-only matching behavior.
      if (isEpisode && bookmark.episodeNumber != null) {
        const bookmarkIsSameEpisode = bookmark.episodeNumber === episodeNumber
          && (bookmark.seasonNumber ?? null) === (seasonNumber ?? null);
        if (!bookmarkIsSameEpisode) continue;
      }

      // Fallback: TMDB/TVDB match (different item ID)
      if (tmdbId && bookmark.tmdbId === tmdbId) {
        providerMatches.push({ id: bookmarkId, ...bookmark, exactMatch: false });
        continue;
      }

      if (tvdbId && bookmark.tvdbId === tvdbId) {
        providerMatches.push({ id: bookmarkId, ...bookmark, exactMatch: false });
      }
    }

    // Use exact matches if available, otherwise use provider matches
    const bookmarks = exactMatches.length > 0 ? exactMatches : providerMatches;
    const hasIdMismatch = exactMatches.length === 0 && providerMatches.length > 0;

    return { bookmarks, hasIdMismatch, exactMatches, providerMatches };
  }

  /**
   * Format timestamp as HH:MM:SS or MM:SS
   */
  function formatTimestamp(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  }

  Object.assign(internal, { generateBookmarkId, matchBookmarks, formatTimestamp });

})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
