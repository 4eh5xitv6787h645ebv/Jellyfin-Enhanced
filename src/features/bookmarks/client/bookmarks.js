// /js/enhanced/bookmarks/bookmarks.js
// Enhanced bookmarks system with multi-bookmark support, TMDB/TVDB tracking, and visual markers
(function(JE) {
  'use strict';

  if (!JE.pluginConfig?.BookmarksEnabled) {
    console.log('🪼 Jellyfin Enhanced: Bookmarks feature is disabled');
    return;
  }

  const logPrefix = '🪼 Jellyfin Enhanced: Bookmarks:';

  // These collaborators are registered in manifest order before this entry.
  const {
    addBookmark, updateBookmark, deleteBookmark, findBookmarksForItem,
    showBookmarkModal, updateBookmarkMarkersForCurrentVideo, formatTimestamp,
    syncBookmarks, cleanupOrphanedBookmarks, backfillEpisodeMetadata
  } = JE.internals.bookmarks;

  // Public API
  JE.bookmarks = {
    add: addBookmark,
    update: updateBookmark,
    delete: deleteBookmark,
    findForItem: findBookmarksForItem,
    showModal: showBookmarkModal,
    updateMarkers: updateBookmarkMarkersForCurrentVideo,
    formatTimestamp,
    syncBookmarks,
    cleanupOrphaned: cleanupOrphanedBookmarks,
    backfillEpisodeMetadata
  };

  /**
   * Add bookmark button to the video player OSD
   */
  function addOsdBookmarkButton() {
    // Don't add if already exists
    if (document.getElementById('jeBookmarkBtn')) return;

    const controlsContainer = document.querySelector('.videoOsdBottom .buttons.focuscontainer-x');
    if (!controlsContainer) return;

    // Find the native settings button to insert before
    const nativeSettingsButton = controlsContainer.querySelector('.btnVideoOsdSettings');
    if (!nativeSettingsButton) return;

    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.id = 'jeBookmarkBtn';
    bookmarkBtn.setAttribute('is', 'paper-icon-button-light');
    bookmarkBtn.className = 'autoSize paper-icon-button-light';
    bookmarkBtn.title = JE.t('shortcut_BookmarkCurrentTime');
    bookmarkBtn.innerHTML = '<span class="largePaperIconButton material-icons" aria-hidden="true">bookmark_add</span>';

    bookmarkBtn.onclick = (e) => {
      e.stopPropagation();
      showBookmarkModal('add');
    };

    // Insert before the settings button
    nativeSettingsButton.parentElement.insertBefore(bookmarkBtn, nativeSettingsButton);
    console.log(`${logPrefix} ✓ Added OSD bookmark button`);
  }

  /**
   * Initialize bookmarks system
   */
  JE.initializeBookmarks = (function() {
    let initialized = false;
    let cleanupFunctions = [];

    return function() {
      // Prevent multiple initializations
      if (initialized) {
        console.log(`${logPrefix} Already initialized, skipping...`);
        return;
      }
      initialized = true;

      console.log(`${logPrefix} Initializing enhanced bookmarks...`);

      // Fire-and-forget: backfill existing bookmarks with episode metadata.
      backfillEpisodeMetadata().catch(e => console.warn(`${logPrefix} Backfill failed:`, e));

      let lastInjectedOsdKey = null;
      const osdObserverId = 'je-bookmarks-osd';
      const videoObserverId = 'je-bookmarks-video-changes';

      function getOsdKey() {
        const video = document.querySelector('.videoPlayerContainer video');
        return video?.currentSrc || video?.src || window.location.href;
      }

      // Debounced OSD injection - prevents rapid re-injection
      const debouncedOsdInjection = JE.helpers.debounce(() => {
        if (!JE.isVideoPage()) return;

        const osdBottom = document.querySelector('.videoOsdBottom');
        const video = document.querySelector('.videoPlayerContainer video');
        const currentOsdKey = getOsdKey();

        // Only inject if OSD exists and we haven't already injected for this video
        if (osdBottom && video && currentOsdKey !== lastInjectedOsdKey) {
          updateBookmarkMarkersForCurrentVideo();
          addOsdBookmarkButton();
          lastInjectedOsdKey = currentOsdKey;
          console.log(`${logPrefix} Injected markers/button for ${currentOsdKey}`);
        }
      }, 200);

      // Managed observer: only watches when on video page
      function ensureOsdObserver() {
        if (!JE.isVideoPage()) {
          JE.helpers.disconnectObserver(osdObserverId);
          return;
        }

        // Create observer that watches for OSD appearance
        JE.helpers.createObserver(
          osdObserverId,
          debouncedOsdInjection,
          document.body,
          { childList: true, subtree: true }
        );
      }

      // Debounced handlers for video events
      const handlePlayingEvent = JE.helpers.debounce((e) => {
        if (e.target.tagName === 'VIDEO' && JE.isVideoPage()) {
          debouncedOsdInjection();
        }
      }, 300);

      const handleMetadataEvent = JE.helpers.debounce((e) => {
        if (e.target.tagName === 'VIDEO' && JE.isVideoPage()) {
          debouncedOsdInjection();
        }
      }, 300);

      const handleViewShow = () => {
        if (JE.isVideoPage()) {
          lastInjectedOsdKey = null; // Reset for new page
          ensureOsdObserver();
          debouncedOsdInjection();
        } else {
          // Clean up when leaving video page
          lastInjectedOsdKey = null;
          JE.helpers.disconnectObserver(osdObserverId);
          JE.helpers.disconnectObserver(videoObserverId);
        }
      };

      // Register event listeners with cleanup tracking
      document.addEventListener('playing', handlePlayingEvent, true);
      cleanupFunctions.push(() => document.removeEventListener('playing', handlePlayingEvent, true));

      document.addEventListener('loadedmetadata', handleMetadataEvent, true);
      cleanupFunctions.push(() => document.removeEventListener('loadedmetadata', handleMetadataEvent, true));

      document.addEventListener('viewshow', handleViewShow);
      cleanupFunctions.push(() => document.removeEventListener('viewshow', handleViewShow));

      // Initial setup if already on video page
      if (JE.isVideoPage()) {
        ensureOsdObserver();
        debouncedOsdInjection();
      }

      // Store cleanup function globally
      JE.cleanupBookmarks = function() {
        cleanupFunctions.forEach(fn => fn());
        cleanupFunctions = [];
        JE.helpers.disconnectObserver(osdObserverId);
        JE.helpers.disconnectObserver(videoObserverId);
        initialized = false;
        console.log(`${logPrefix} Cleaned up`);
      };

      console.log(`${logPrefix} ✓ Initialized`);
    };
  })();

})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
