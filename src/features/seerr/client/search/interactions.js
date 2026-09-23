// Delegated card/request actions; all event handlers belong to the search lifecycle.
(function(JE) {
    'use strict';
    JE.seerrSearch = JE.seerrSearch || {};

    JE.seerrSearch.bindInteractions = function(results, scope) {
        const logPrefix = '🪼 Jellyfin Enhanced: Seerr:';
        const escapeHtml = JE.escapeHtml;
        const { requestMedia } = JE.jellyseerrAPI;
        const { showMovieRequestModal, showSeasonSelectionModal, showCollectionRequestModal,
            hideHoverPopover, toggleHoverPopoverLock } = JE.jellyseerrUI;
        // Hide popover when touching outside request buttons or scrolling
        scope.addListener(document, 'touchstart', (e) => {
            if (!e.target.closest('.jellyseerr-request-button')) {
                toggleHoverPopoverLock(false);
                hideHoverPopover();
            }
        }, { passive: true });
        // Scrolling moves the button away from the fixed-position popover, so a
        // tap-locked popover must unlock too or it would float at stale coordinates.
        scope.addListener(document, 'scroll', () => {
            toggleHoverPopoverLock(false);
            hideHoverPopover();
        }, true);

        // Remove touch overlay when touching outside cards
        scope.addListener(document.body, 'touchstart', (e) => {
            if (!e.target.closest('.jellyseerr-card')) {
                document.querySelectorAll('.jellyseerr-card.is-touch').forEach(card => card.classList.remove('is-touch'));
            }
        }, { passive: true });

        // Close 4K popup when clicking outside
        scope.addListener(document.body, 'click', (e) => {
            if (!e.target.closest('.jellyseerr-button-group') && !e.target.closest('.jellyseerr-4k-popup')) {
                const popup = document.querySelector('.jellyseerr-4k-popup');
                if (popup) popup.remove();
            }
        });

        // Main click handler for request buttons and 4K popup items
        scope.addListener(document.body, 'click', async function(event) {
            // Handle 4K popup item clicks
            if (event.target.closest('.jellyseerr-4k-popup-item')) {
                const item = event.target.closest('.jellyseerr-4k-popup-item');
                const action = item.dataset.action;
                const tmdbId = item.dataset.tmdbId;
                const mediaType = String(item.dataset.mediaType || 'movie').toLowerCase();

                if (action === 'request4k' && tmdbId) {
                    const popup = item.closest('.jellyseerr-4k-popup');
                    item.disabled = true;
                    item.innerHTML = `<span>Requesting...</span><span class="jellyseerr-button-spinner"></span>`;

                    // Find the original item data from the card
                    const card = event.target.closest('.jellyseerr-card');
                    const button = card?.querySelector('.jellyseerr-request-button');
                    const searchResultItem = button?.dataset.searchResultItem ? JSON.parse(button.dataset.searchResultItem) : null;
                    const titleText = card?.querySelector('.cardText-first bdi')?.textContent
                        || searchResultItem?.name
                        || searchResultItem?.title
                        || searchResultItem?.originalName
                        || searchResultItem?.originalTitle
                        || (mediaType === 'tv' ? 'this show' : 'this movie');

                    try {
                        if (mediaType === 'tv') {
                            if (popup) popup.remove();
                            showSeasonSelectionModal(tmdbId, 'tv', titleText, searchResultItem, true);
                            return;
                        }

                        if (JE.pluginConfig.JellyseerrShowAdvanced) {
                            // Close popup and show advanced modal
                            if (popup) popup.remove();
                            showMovieRequestModal(tmdbId, titleText, searchResultItem, true);
                        } else {
                            const response = await requestMedia(tmdbId, 'movie', {}, true, searchResultItem); // true for 4K, pass searchResultItem for override rules
                            console.debug(`${logPrefix} Seerr 4K request response:`, response);
                            if (searchResultItem) {
                                if (!searchResultItem.mediaInfo) searchResultItem.mediaInfo = {};
                                searchResultItem.mediaInfo.status4k = 3;
                            }
                            JE.toast('4K request submitted successfully!', 3000);
                            if (popup) popup.remove();

                            // Refresh the results to update the UI
                            const query = new URLSearchParams(window.location.hash.split('?')[1])?.get('query');
                            if (query) {
                                scope.delay(() => results.fetch(query, { skipCache: true }), 1000);
                            }
                        }
                    } catch (error) {
                        // Quota errors get a themed dialog with usage + reset info.
                        if (JE.jellyseerrUI?.isQuotaError?.(error)) {
                            await JE.jellyseerrUI.showQuotaErrorDialog(error, 'movie');
                        } else {
                            let errorMessage = 'Failed to request 4K version';
                            if (error.status === 404) {
                                errorMessage = 'User not found';
                            } else if (error.responseJSON?.message) {
                                errorMessage = error.responseJSON.message;
                            }
                            // Escape API error before display to prevent reflected XSS
                            JE.toast(escapeHtml(errorMessage), 4000);
                        }
                        item.disabled = false;
                        item.innerHTML = `<span>Request in 4K</span>`;
                    }
                }
                return;
            }

            const button = event.target.closest('.jellyseerr-request-button');
            if (!button || button.disabled) return;

            const mediaType = button.dataset.mediaType;
            const tmdbId = button.dataset.tmdbId;
            const collectionId = button.dataset.collectionId;
            const searchResultItem = button.dataset.searchResultItem ? JSON.parse(button.dataset.searchResultItem) : null;
            const card = button.closest('.jellyseerr-card');
            const titleText = card?.querySelector('.cardText-first bdi')?.textContent
                || searchResultItem?.name
                || searchResultItem?.title
                || searchResultItem?.originalName
                || searchResultItem?.originalTitle
                || (mediaType === 'movie' ? 'this movie' : mediaType === 'collection' ? 'this collection' : 'this show');

            if (mediaType === 'collection' && collectionId) {
                showCollectionRequestModal(collectionId, titleText, searchResultItem);
                return;
            }

            if (mediaType === 'tv') {
                showSeasonSelectionModal(tmdbId, mediaType, titleText, searchResultItem);
                return;
            }

            if (mediaType === 'movie') {
                if (JE.pluginConfig.JellyseerrShowAdvanced) {
                    showMovieRequestModal(tmdbId, titleText, searchResultItem);
                } else {
                    button.disabled = true;
                    button.innerHTML = `<span>${JE.t('jellyseerr_btn_requesting')}</span><span class="jellyseerr-button-spinner"></span>`;
                    try {
                        await requestMedia(tmdbId, mediaType, {}, false, searchResultItem); // Pass searchResultItem for override rules
                        button.innerHTML = `<span>${JE.t('jellyseerr_btn_requested')}</span>${JE.jellyseerrUI.icons.requested}`;
                        button.classList.remove('jellyseerr-button-request');
                        button.classList.add('jellyseerr-button-pending');
                    } catch (error) {
                        button.disabled = false;
                        // Quota errors get a themed dialog; restore button to idle.
                        if (JE.jellyseerrUI?.isQuotaError?.(error)) {
                            await JE.jellyseerrUI.showQuotaErrorDialog(error, 'movie');
                            button.innerHTML = `${JE.jellyseerrUI.icons.request}<span>${JE.t('jellyseerr_btn_request')}</span>`;
                            return;
                        }
                        let errorMessage;
                        if (error.status === 404) {
                            errorMessage = JE.t('jellyseerr_btn_user_not_found');
                        } else if (error.responseJSON?.message) {
                            errorMessage = error.responseJSON.message;
                        } else {
                            errorMessage = JE.t('jellyseerr_btn_error');
                        }
                        // Escape API error before innerHTML to prevent reflected XSS
                        button.innerHTML = `<span>${escapeHtml(errorMessage)}</span>${JE.jellyseerrUI.icons.error}`;
                        button.classList.add('jellyseerr-button-error');
                    }
                }
            }
        });

    };

})(window.JellyfinEnhanced);
