// /js/jellyseerr/item-details.js
// Adds Similar and Recommended sections to item details pages using Jellyseerr API
(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Jellyseerr Recommendations:';

    // Track processed items to avoid duplicate renders
    const processedItems = new Set();

    // Current abort controller for cancellation
    let currentAbortController = null;

    // Track the last item ID scheduled via rAF to prevent duplicate calls
    // when both hashchange and viewshow fire for the same navigation
    let pendingItemId = null;

    /**
     * Gets the TMDB ID from a Jellyfin item
     * @param {string} itemId - Jellyfin item ID
     * @param {AbortSignal} [signal] - Optional abort signal
     * @returns {Promise<{tmdbId: number|null, type: string|null}>}
     */
    async function getTmdbIdFromItem(itemId, signal) {
        try {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            const userId = ApiClient.getCurrentUserId();
            const item = JE.helpers?.getItemCached
                ? await JE.helpers.getItemCached(itemId, { userId })
                : await ApiClient.getItem(userId, itemId);

            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            if (!item) {
                console.warn(`${logPrefix} Item not found:`, itemId);
                return { tmdbId: null, type: null };
            }

            const itemType = item.Type;
            if (itemType !== 'Movie' && itemType !== 'Series') {
                return { tmdbId: null, type: null };
            }

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

    /**
     * Wait for the detail page content to be ready.
     * Returns the detail page container and an anchor element to insert sections after.
     * Prefers #similarCollapsible but falls back to the last .verticalSection in the
     * detail page, so sections still render even if Jellyfin's "More Like This" is disabled.
     * @param {AbortSignal} [signal] - Optional abort signal
     * @returns {Promise<{detailPageContent: HTMLElement, insertAfter: HTMLElement}|null>}
     */
    function waitForDetailPageReady(signal) {
        return new Promise((resolve) => {
            if (signal?.aborted) {
                resolve(null);
                return;
            }

            const checkPage = () => {
                const activePage = document.querySelector('.libraryPage:not(.hide)');
                if (!activePage) return null;

                const detailPageContent = activePage.querySelector('.detailPageContent');
                if (!detailPageContent) return null;

                // Prefer #similarCollapsible as anchor, fall back to last vertical section
                const moreLikeThis = detailPageContent.querySelector('#similarCollapsible');
                const insertAfter = moreLikeThis || detailPageContent.querySelector('.verticalSection:last-of-type');

                if (insertAfter) {
                    return { detailPageContent, insertAfter };
                }
                return null;
            };

            const immediate = checkPage();
            if (immediate) {
                resolve(immediate);
                return;
            }

            let observerHandle = null;
            let timeoutId = null;

            const cleanup = () => {
                if (observerHandle) {
                    observerHandle.unsubscribe();
                    observerHandle = null;
                }
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };

            if (signal) {
                signal.addEventListener('abort', () => {
                    cleanup();
                    resolve(null);
                }, { once: true });
            }

            observerHandle = JE.helpers.onBodyMutation('jellyseerr-item-details-page-detect', () => {
                const result = checkPage();
                if (result) {
                    cleanup();
                    resolve(result);
                }
            });

            timeoutId = setTimeout(() => {
                cleanup();
                const result = checkPage();
                resolve(result);
            }, 3000);
        });
    }

    /**
     * Applies all configured filters to a results array.
     * Consolidates library exclusion, blocklist exclusion, and hidden content filtering.
     * @param {Array} results - Raw Seerr results
     * @param {boolean} excludeLibraryItems - Whether to exclude items already in Jellyfin library
     * @param {boolean} excludeBlocklistedItems - Whether to exclude blocklisted items (status 6)
     * @returns {Array} Filtered results
     */
    function applyFilters(results, excludeLibraryItems, excludeBlocklistedItems) {
        let filtered = results.filter(item => {
            if (excludeLibraryItems && item.mediaInfo?.jellyfinMediaId) return false;
            if (excludeBlocklistedItems && item.mediaInfo?.status === 6) return false;
            return true;
        });
        if (JE.hiddenContent) {
            filtered = JE.hiddenContent.filterJellyseerrResults(filtered, 'recommendations');
        }
        return filtered;
    }

    /**
     * Removes items from the second array that already appear in the first.
     * Uses item.id which is the TMDB ID in Seerr similar/recommendations responses.
     * @param {Array} primary - The primary results (kept as-is)
     * @param {Array} secondary - The secondary results (duplicates removed)
     * @returns {Array} Deduplicated secondary results
     */
    function deduplicateAgainst(primary, secondary) {
        const primaryIds = new Set(primary.map(item => item.id));
        return secondary.filter(item => !primaryIds.has(item.id));
    }

    /**
     * Creates a Jellyseerr section for the detail page.
     * Expects pre-filtered results (no internal filtering).
     * @param {Array} results - Pre-filtered array of Seerr items
     * @param {string} title - Section title (already translated)
     * @returns {HTMLElement|null} Section element, or null if no cards
     */
    function createJellyseerrSection(results, title) {
        if (!results || results.length === 0) {
            return null;
        }

        const section = document.createElement('div');
        section.className = 'verticalSection emby-scroller-container jellyseerr-details-section';
        section.setAttribute('data-jellyseerr-section', 'true');
        section.setAttribute('role', 'group');
        section.setAttribute('aria-label', title || 'Recommended');

        const titleElement = document.createElement('h2');
        titleElement.className = 'sectionTitle sectionTitle-cards focuscontainer-x padded-right';
        titleElement.textContent = title || 'Recommended';
        section.appendChild(titleElement);

        const scrollerContainer = document.createElement('div');
        scrollerContainer.setAttribute('is', 'emby-scroller');
        scrollerContainer.className = 'padded-top-focusscale padded-bottom-focusscale no-padding emby-scroller';
        scrollerContainer.dataset.horizontal = "true";
        scrollerContainer.dataset.centerfocus = "card";
        scrollerContainer.dataset.scrollModeX = "custom";

        scrollerContainer.style.scrollSnapType = 'none';
        scrollerContainer.style.touchAction = 'auto';
        scrollerContainer.style.overscrollBehaviorX = 'contain';
        scrollerContainer.style.overscrollBehaviorY = 'auto';
        scrollerContainer.style.webkitOverflowScrolling = 'touch';

        const itemsContainer = document.createElement('div');
        itemsContainer.setAttribute('is', 'emby-itemscontainer');
        itemsContainer.className = 'focuscontainer-x itemsContainer scrollSlider animatedScrollX';
        itemsContainer.style.whiteSpace = 'nowrap';

        const fragment = document.createDocumentFragment();

        for (const item of results) {
            const card = JE.jellyseerrUI?.createJellyseerrCard?.(item, true, true);
            if (card) {
                const jellyfinMediaId = item.mediaInfo?.jellyfinMediaId;
                if (jellyfinMediaId) {
                    card.setAttribute('data-library-item', 'true');
                    card.setAttribute('data-jellyfin-media-id', jellyfinMediaId);
                    card.classList.add('jellyseerr-card-in-library');
                    const titleLink = card.querySelector('.cardText-first a');
                    if (titleLink) {
                        const itemName = item.title || item.name;
                        titleLink.textContent = itemName;
                        titleLink.title = itemName;
                        titleLink.href = `#!/details?id=${jellyfinMediaId}`;
                        titleLink.removeAttribute('target');
                        titleLink.removeAttribute('rel');
                    }
                }
                fragment.appendChild(card);
            }
        }

        itemsContainer.appendChild(fragment);
        if (itemsContainer.children.length === 0) {
            return null;
        }
        scrollerContainer.appendChild(itemsContainer);
        section.appendChild(scrollerContainer);
        return section;
    }

    /**
     * Renders Similar and Recommended sections for an item
     * @param {string} itemId - Jellyfin item ID
     */
    async function renderSimilarAndRecommended(itemId) {
        if (processedItems.has(itemId)) {
            return;
        }

        if (currentAbortController) {
            currentAbortController.abort();
        }
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        const perfStart = performance.now();

        if (JE.requestManager?.metrics?.enabled) {
            JE.requestManager.startMeasurement('similar-recommended');
        }

        try {
            const showSimilar = JE.pluginConfig?.JellyseerrShowSimilar === true;
            const showRecommended = JE.pluginConfig?.JellyseerrShowRecommended === true;

            if (!showSimilar && !showRecommended) {
                console.debug(`${logPrefix} Both similar and recommended sections are disabled in settings`);
                return;
            }

            const status = await JE.jellyseerrAPI.checkUserStatus();
            if (signal.aborted) return;

            if (!status || !status.active) {
                console.debug(`${logPrefix} Jellyseerr is not active, skipping`);
                return;
            }

            const { tmdbId, type } = await getTmdbIdFromItem(itemId, signal);
            if (signal.aborted) return;

            if (!tmdbId || !type) {
                console.debug(`${logPrefix} No valid TMDB ID found for item, skipping`);
                return;
            }

            const fetchStart = performance.now();
            console.debug(`${logPrefix} Fetching similar and recommended content for TMDB ID ${tmdbId} (${type})`);

            const fetchOptions = { signal };
            const promises = [];

            if (showSimilar) {
                promises.push(
                    type === 'movie'
                        ? JE.jellyseerrAPI.fetchSimilarMovies(tmdbId, fetchOptions)
                        : JE.jellyseerrAPI.fetchSimilarTvShows(tmdbId, fetchOptions)
                );
            } else {
                promises.push(Promise.resolve({ results: [] }));
            }

            if (showRecommended) {
                promises.push(
                    type === 'movie'
                        ? JE.jellyseerrAPI.fetchRecommendedMovies(tmdbId, fetchOptions)
                        : JE.jellyseerrAPI.fetchRecommendedTvShows(tmdbId, fetchOptions)
                );
            } else {
                promises.push(Promise.resolve({ results: [] }));
            }

            const [similarData, recommendedData, pageReady] = await Promise.all([
                ...promises,
                waitForDetailPageReady(signal)
            ]);

            if (signal.aborted) return;

            const fetchMs = (performance.now() - fetchStart).toFixed(1);

            const similarResults = similarData?.results || [];
            const recommendedResults = recommendedData?.results || [];

            if (similarResults.length === 0 && recommendedResults.length === 0) {
                console.debug(`${logPrefix} No similar or recommended content to display`);
                return;
            }

            if (!pageReady) {
                console.warn(`${logPrefix} Page not ready for insertion`);
                return;
            }

            const { detailPageContent, insertAfter } = pageReady;

            // Single-pass filtering for both arrays
            const excludeLibraryItems = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
            const excludeBlocklistedItems = JE.pluginConfig?.JellyseerrExcludeBlocklistedItems === true;

            let filteredRecommended = applyFilters(recommendedResults, excludeLibraryItems, excludeBlocklistedItems);
            let filteredSimilar = applyFilters(similarResults, excludeLibraryItems, excludeBlocklistedItems);

            // Cap Recommended first, then deduplicate Similar against only visible items
            filteredRecommended = filteredRecommended.slice(0, 20);

            const preDedupeCount = filteredSimilar.length;
            if (filteredRecommended.length > 0 && filteredSimilar.length > 0) {
                filteredSimilar = deduplicateAgainst(filteredRecommended, filteredSimilar);
            }
            const removedDupes = preDedupeCount - filteredSimilar.length;

            filteredSimilar = filteredSimilar.slice(0, 20);

            if (filteredSimilar.length === 0 && filteredRecommended.length === 0) {
                console.debug(`${logPrefix} No content to display after filtering`);
                return;
            }

            if (signal.aborted) return;

            // Remove existing sections before inserting new ones
            detailPageContent.querySelectorAll('.jellyseerr-details-section').forEach(el => el.remove());

            const domStart = performance.now();

            // Build all sections off-DOM first, then insert in a single operation
            // to trigger only one forced reflow instead of one per section.
            // Each .after() triggers emby-scroller's connectedCallback which
            // synchronously reads layout properties (offsetWidth, scrollWidth).
            const sectionsToInsert = [];

            if (filteredRecommended.length > 0) {
                const recommendedTitle = JE.t ? (JE.t('jellyseerr_recommended_title') || 'Recommended') : 'Recommended';
                const recommendedSection = createJellyseerrSection(filteredRecommended, recommendedTitle);
                if (recommendedSection) {
                    sectionsToInsert.push(recommendedSection);
                }
            }

            if (filteredSimilar.length > 0) {
                const similarTitle = JE.t ? (JE.t('jellyseerr_similar_title') || 'Similar') : 'Similar';
                const similarSection = createJellyseerrSection(filteredSimilar, similarTitle);
                if (similarSection) {
                    sectionsToInsert.push(similarSection);
                }
            }

            // Single DOM insertion: .after() accepts multiple nodes
            if (sectionsToInsert.length > 0) {
                insertAfter.after(...sectionsToInsert);
            }

            const domMs = (performance.now() - domStart).toFixed(1);
            const totalMs = (performance.now() - perfStart).toFixed(1);

            processedItems.add(itemId);

            if (JE.requestManager?.metrics?.enabled) {
                JE.requestManager.endMeasurement('similar-recommended');
            }

            console.debug(
                `${logPrefix} Rendered: ${filteredRecommended.length} recommended + ${filteredSimilar.length} similar` +
                ` (${removedDupes} cross-section dupes removed)` +
                ` | fetch=${fetchMs}ms dom=${domMs}ms total=${totalMs}ms`
            );

        } catch (error) {
            if (error.name === 'AbortError') {
                console.debug(`${logPrefix} Request aborted for item ${itemId}`);
                return;
            }
            console.error(`${logPrefix} Error rendering similar and recommended sections:`, error);
        }
    }

    /**
     * Handles item details page navigation
     */
    function handleItemDetailsPage() {
        const hash = window.location.hash;
        if (!hash.includes('/details?id=')) {
            return;
        }

        try {
            const itemId = new URLSearchParams(hash.split('?')[1]).get('id');
            if (!itemId) return;

            // Deduplicate: both hashchange and viewshow may fire for the same
            // navigation. Only schedule one rAF per item ID.
            if (pendingItemId === itemId) return;
            pendingItemId = itemId;

            requestAnimationFrame(() => {
                pendingItemId = null;
                renderSimilarAndRecommended(itemId);
            });
        } catch (error) {
            console.error(`${logPrefix} Error parsing item ID from URL:`, error);
        }
    }

    /**
     * Cleanup function for navigation
     */
    function cleanup() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        processedItems.clear();
    }

    /**
     * Initializes the item details handler
     */
    function initialize() {
        console.debug(`${logPrefix} Initializing Recommendations and Similar sections`);

        window.addEventListener('hashchange', () => {
            cleanup();
            handleItemDetailsPage();
        });

        handleItemDetailsPage();

        // viewshow fires on Jellyfin SPA navigation (pushState), which does NOT
        // trigger hashchange. Must also cleanup here to clear processedItems,
        // otherwise revisiting a detail page via "More Like This" skips rendering.
        document.addEventListener('viewshow', () => {
            cleanup();
            handleItemDetailsPage();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})(window.JellyfinEnhanced);
