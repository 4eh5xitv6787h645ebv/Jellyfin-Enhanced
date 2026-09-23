// Video timeline bookmark marker rendering and current-video refresh.
// Internal exports are loaded before bookmarks.js; that entry owns the public API and lifecycle.
(function(JE) {
  'use strict';

  if (!JE.pluginConfig?.BookmarksEnabled) return;
  JE.internals = JE.internals || {};
  const internal = JE.internals.bookmarks = JE.internals.bookmarks || {};
  const { getCurrentItemData, fetchItemDetails, findBookmarksForItem, formatTimestamp } = internal;
  const logPrefix = '🪼 Jellyfin Enhanced: Bookmarks:';

  /**
   * Create visual bookmark markers in video OSD
   */
  function createBookmarkMarkers(video, bookmarksList) {
    console.log(`${logPrefix} createBookmarkMarkers called - video:`, !!video, 'bookmarks:', bookmarksList.length);

    if (!video || !bookmarksList.length) {
      console.log(`${logPrefix} Early return - no video or no bookmarks`);
      return;
    }

    // Find or create marker container
    const osdBottom = document.querySelector('.videoOsdBottom');
    if (!osdBottom) {
      console.log(`${logPrefix} No .videoOsdBottom found`);
      return;
    }

    // Find the position slider with expanded selectors
    const positionSlider = osdBottom.querySelector('.osdPositionSlider, .sliderBubble, .mdl-slider, input[type="range"]');
    if (!positionSlider) {
      console.log(`${logPrefix} No position slider found`);
      return;
    }

    const sliderContainer = positionSlider.closest('.osdPositionSliderContainer, .sliderContainer') || positionSlider.parentElement;
    if (!sliderContainer) {
      console.log(`${logPrefix} No slider container found`);
      return;
    }

    // Ensure markers position relative to the slider container
    const sliderPos = window.getComputedStyle(sliderContainer).position;
    if (sliderPos === 'static') {
      sliderContainer.style.position = 'relative';
    }

    // Remove existing markers
    const existingMarkers = sliderContainer.querySelectorAll('.je-bookmark-marker');
    console.log(`${logPrefix} Removing ${existingMarkers.length} existing markers`);
    existingMarkers.forEach(el => el.remove());

    const duration = video.duration;
    if (!duration || !isFinite(duration)) {
      console.log(`${logPrefix} Invalid duration:`, duration);
      return;
    }

    // Create markers for each bookmark
    bookmarksList.forEach(bookmark => {
      const percent = (bookmark.timestamp / duration) * 100;
      const markerColor = bookmark.exactMatch ? '#00d4ff' : '#ffa500';

      const marker = document.createElement('div');
      marker.className = 'je-bookmark-marker';
      marker.style.cssText = `
        position: absolute;
        left: ${percent}%;
        bottom: 0%;
        transform: translate(-50%, -50%);
        z-index: 1000;
        pointer-events: all;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      const icon = document.createElement('span');
      icon.className = 'material-icons';
      icon.textContent = 'location_pin';
      icon.style.cssText = `
        font-size: 24px;
        color: ${markerColor};
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
        pointer-events: none;
      `;

      marker.appendChild(icon);

      const labelText = bookmark.label || JE.t('bookmark_no_label');
      const versionNote = !bookmark.exactMatch ? ` ${JE.t('bookmark_file_changed')}` : '';
      marker.title = `${labelText} - ${formatTimestamp(bookmark.timestamp)}${versionNote}`;

      // Click to jump to bookmark
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        video.currentTime = bookmark.timestamp;
        JE.toast(`${JE.t('toast_jumped_to_bookmark')}: ${formatTimestamp(bookmark.timestamp)}`, 2000);
      });

      sliderContainer.appendChild(marker);
    });

    console.log(`${logPrefix} ✓ Created ${bookmarksList.length} bookmark markers`);
  }


  /**
   * Update bookmark markers for current video
   */
  async function updateBookmarkMarkersForCurrentVideo() {
    console.log(`${logPrefix} updateBookmarkMarkersForCurrentVideo called`);

    const video = document.querySelector('.videoPlayerContainer video');
    if (!video) {
      console.log(`${logPrefix} No video element found`);
      return;
    }

    const itemData = getCurrentItemData();
    if (!itemData) {
      console.log(`${logPrefix} No item data (no btnUserRating?)`);
      return;
    }

    console.log(`${logPrefix} Fetching details for item:`, itemData.itemId);
    const details = await fetchItemDetails(itemData.itemId);
    if (!details) {
      console.log(`${logPrefix} Failed to fetch item details`);
      return;
    }

    console.log(`${logPrefix} Item details:`, details);
    const { bookmarks: bookmarksList } = findBookmarksForItem(
      details.itemId,
      details.tmdbId,
      details.tvdbId,
      details.seasonNumber,
      details.episodeNumber
    );

    console.log(`${logPrefix} Found ${bookmarksList.length} bookmarks for this item`);
    createBookmarkMarkers(video, bookmarksList);
  }

  Object.assign(internal, { updateBookmarkMarkersForCurrentVideo });

})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
