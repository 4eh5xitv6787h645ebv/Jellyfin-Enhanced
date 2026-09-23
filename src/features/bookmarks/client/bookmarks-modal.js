// Player bookmark dialog rendering, input handling and dialog-scoped listeners.
// Internal exports are loaded before bookmarks.js; that entry owns the public API and lifecycle.
(function(JE) {
  'use strict';

  if (!JE.pluginConfig?.BookmarksEnabled) return;
  JE.internals = JE.internals || {};
  const internal = JE.internals.bookmarks = JE.internals.bookmarks || {};
  const { getCurrentItemData, fetchItemDetails, findBookmarksForItem, formatTimestamp, addBookmark, updateBookmark, deleteBookmark, updateBookmarkMarkersForCurrentVideo, modalStyles } = internal;

  const escapeHtml = JE.escapeHtml;

  /**
   * Show bookmark management modal
   */
  async function showBookmarkModal(mode = 'add', existingBookmark = null) {
    const video = document.querySelector('.videoPlayerContainer video');
    const currentTime = video?.currentTime || 0;

    const itemData = getCurrentItemData();
    if (!itemData) {
      JE.toast(JE.t('toast_bookmark_no_item'), 3000);
      return;
    }

    const details = await fetchItemDetails(itemData.itemId);
    if (!details) {
      JE.toast(JE.t('toast_bookmark_fetch_failed'), 3000);
      return;
    }

    const { bookmarks: existingBookmarks } = findBookmarksForItem(
      details.itemId,
      details.tmdbId,
      details.tvdbId,
      details.seasonNumber,
      details.episodeNumber
    );

    const isEdit = mode === 'edit' && existingBookmark;
    const title = isEdit ? JE.t('bookmark_edit_title') : (mode === 'view' ? 'Your Bookmarks' : JE.t('bookmark_add_title'));
    const timestamp = isEdit ? existingBookmark.timestamp : currentTime;
    const label = isEdit ? existingBookmark.label : '';

    const formHtml = `
      ${modalStyles}
      <div class="je-bookmark-modal">
        <div class="je-bookmark-hero">
          <div class="je-bookmark-hero-title">
            <span>${title}</span>
          </div>
          <div class="je-bookmark-hero-subtitle">${details.name}</div>
        </div>
        <div class="je-bookmark-form-grid">
          <div class="je-bookmark-input-group">
            <label for="bookmark-time">${JE.t('bookmark_time_label')}</label>
            <input
              type="text"
              id="bookmark-time"
              class="je-bookmark-input"
              value="${formatTimestamp(timestamp)}"
              readonly>
          </div>
          <div class="je-bookmark-input-group">
            <label for="bookmark-label">${JE.t('bookmark_label_label')}</label>
            <input
              type="text"
              id="bookmark-label"
              class="je-bookmark-input"
              placeholder="${JE.t('bookmark_label_placeholder')}"
              value="${label}"
              maxlength="100">
          </div>
        </div>
        ${existingBookmarks.length > 0 ? `
          <div class="je-bookmark-list">
            <div class="je-bookmark-list-header">
              <div class="je-bookmark-list-title">${JE.t('bookmark_existing_title')}</div>
              <div class="je-bookmark-list-count">${existingBookmarks.length}</div>
            </div>
            ${existingBookmarks.map(bm => `
              <div class="je-bookmark-item">
                <div class="je-bookmark-item-marker"></div>
                <div class="je-bookmark-item-content">
                  <div class="je-bookmark-item-time">${formatTimestamp(bm.timestamp)}</div>
                  ${bm.label ? `<div class="je-bookmark-item-label">${escapeHtml(bm.label)}</div>` : ''}
                  ${!bm.exactMatch ? `<div class="je-bookmark-item-warning">${JE.t('bookmark_file_changed')}</div>` : ''}
                </div>
                <div class="je-bookmark-item-actions">
                  <button class="je-bookmark-btn je-bookmark-btn-jump" data-bookmark-id="${bm.id}" title="${JE.t('bookmark_jump')}">
                    <span class="material-icons">forward</span>
                  </button>
                  <button class="je-bookmark-btn je-bookmark-btn-delete" data-bookmark-id="${bm.id}" title="${JE.t('bookmark_delete_confirm')}">
                    <span class="material-icons">delete</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="je-bookmark-empty">
            <div>${JE.t('bookmark_none')}</div>
          </div>
        `}
      </div>
    `;

    // Create custom modal
    const modal = document.createElement('div');
    modal.className = 'je-bm-player-modal-overlay';
    modal.innerHTML = `
      <div class="je-bm-player-modal-container">
        <button class="je-bookmark-modal-close">×</button>
        ${formHtml}
        <div class="je-bookmark-modal-actions">
          <button class="je-bookmark-btn-submit">${isEdit ? JE.t('bookmark_save') : JE.t('bookmark_add')}</button>
          <button class="je-bookmark-btn-cancel">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">close</span>
            <span>Cancel</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Prevent keyboard shortcuts and wheel events from affecting video player
    modal.addEventListener('keydown', (e) => e.stopPropagation());
    modal.addEventListener('keyup', (e) => e.stopPropagation());
    modal.addEventListener('keypress', (e) => e.stopPropagation());
    modal.addEventListener('wheel', (e) => e.stopPropagation());

    const closeDialog = () => {
      modal.style.opacity = '0';
      setTimeout(() => {
        modal.remove();
        // Remove navigation listener
        document.removeEventListener('viewshow', closeDialog);
      }, 200);
    };

    // Close modal when navigating away
    document.addEventListener('viewshow', closeDialog);

    // Close button
    modal.querySelector('.je-bookmark-modal-close').addEventListener('click', closeDialog);
    modal.querySelector('.je-bookmark-btn-cancel').addEventListener('click', closeDialog);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDialog();
    });

    // Focus label input after modal opens
    setTimeout(() => {
      const labelInput = modal.querySelector('#bookmark-label');
      if (labelInput) labelInput.focus();
      modal.style.opacity = '1';
    }, 10);

    // Submit
    modal.querySelector('.je-bookmark-btn-submit').addEventListener('click', async () => {
      const labelInput = modal.querySelector('#bookmark-label').value.trim();

      try {
        if (isEdit) {
          await updateBookmark(existingBookmark.id, { label: labelInput });
           JE.toast(JE.t('toast_bookmark_updated'), 2000);
        } else {
          await addBookmark(timestamp, labelInput);
           JE.toast(JE.t('toast_bookmark_updated'), 2000);
        }

        // Refresh markers
        updateBookmarkMarkersForCurrentVideo();
        closeDialog();
      } catch (e) {
        JE.toast(JE.t('toast_bookmark_save_failed'), 3000);
      }
    });

    // Jump to bookmark buttons
    modal.querySelectorAll('.je-bookmark-btn-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        const bookmarkId = btn.dataset.bookmarkId;
        const bookmark = existingBookmarks.find(bm => bm.id === bookmarkId);
        if (bookmark && video) {
          video.currentTime = bookmark.timestamp;
          JE.toast(`${JE.t('toast_jumped_to_bookmark')}: ${formatTimestamp(bookmark.timestamp)}`, 2000);
          closeDialog();
        }
      });
    });

    // Delete bookmark buttons
    modal.querySelectorAll('.je-bookmark-btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const bookmarkId = btn.dataset.bookmarkId;
        await deleteBookmark(bookmarkId);
        JE.toast(JE.t('toast_bookmark_deleted'), 2000);
        updateBookmarkMarkersForCurrentVideo();
        closeDialog();
        // Reopen modal to show updated list
        setTimeout(() => showBookmarkModal(mode, existingBookmark), 300);
      });
    });
  }

  Object.assign(internal, { showBookmarkModal });

})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
