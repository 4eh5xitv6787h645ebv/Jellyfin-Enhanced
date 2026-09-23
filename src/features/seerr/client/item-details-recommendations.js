// Similar/recommended sections: rendering, deduplication and cancellation.
(function (JE) {
    'use strict';

    JE.internals = JE.internals || {};
    const details = JE.internals.jellyseerrItemDetails = JE.internals.jellyseerrItemDetails || {};

    const logPrefix = '🪼 Jellyfin Enhanced: Seerr Item Details:';
    const processedItems = new Set();
    let currentAbortController = null;

    /**
     * Wait for the detail page content to be ready
     * @param {AbortSignal} [signal] - Optional abort signal
     * @returns {Promise<HTMLElement|null>}
     */
    function waitForDetailPageReady(signal) {
        return new Promise((resolve) => {
            // Check for abort
            if (signal?.aborted) {
                resolve(null);
                return;
            }

            const checkPage = () => {
                const activePage = document.querySelector('.libraryPage:not(.hide)');
                if (!activePage) return null;

                // Jellyfin 12 dropped the .detailPageContent wrapper; fall back to
                // .detailPageSecondaryContainer, then the page itself. #similarCollapsible
                // (our insertion anchor) still exists inside it on both lines.
                const detailPageContent = activePage.querySelector('.detailPageContent') ||
                                          activePage.querySelector('.detailPageSecondaryContainer') ||
                                          activePage;
                const moreLikeThisSection = detailPageContent?.querySelector('#similarCollapsible');

                if (detailPageContent && moreLikeThisSection) {
                    return { detailPageContent, moreLikeThisSection };
                }
                return null;
            };

            // Try immediately
            const immediate = checkPage();
            if (immediate) {
                resolve(immediate);
                return;
            }

            // Set up observer
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

            // Handle abort
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

            // Timeout fallback (3 seconds)
            timeoutId = setTimeout(() => {
                cleanup();
                const result = checkPage();
                resolve(result);
            }, 3000);
        });
    }

    /**
     * Creates a Jellyseerr section similar to search results
     * @param {Array} results - Array of Jellyseerr items
     * @param {string} title - Section title (already translated)
     * @returns {HTMLElement} - Section element
     */
    function createJellyseerrSection(results, title) {
        if (!results || results.length === 0) {
            return null;
        }

        // Filter out library items if configured
        const excludeLibraryItems = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
        let filteredResults = results;

        if (excludeLibraryItems) {
            filteredResults = results.filter(item => !item.mediaInfo?.jellyfinMediaId);
        }
        if (JE.hiddenContent) {
            filteredResults = JE.hiddenContent.filterJellyseerrResults(filteredResults, 'recommendations');
        }

        if (filteredResults.length === 0) {
            return null;
        }

        const section = document.createElement('div');
        section.className = 'verticalSection emby-scroller-container jellyseerr-details-section';
        section.setAttribute('data-jellyseerr-section', 'true');

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

        // Enable smooth native horizontal touch scrolling (from KefinTweaks)
        scrollerContainer.style.scrollSnapType = 'none';
        scrollerContainer.style.touchAction = 'auto';
        scrollerContainer.style.overscrollBehaviorX = 'contain';
        scrollerContainer.style.overscrollBehaviorY = 'auto';
        scrollerContainer.style.webkitOverflowScrolling = 'touch';

        const itemsContainer = document.createElement('div');
        itemsContainer.setAttribute('is', 'emby-itemscontainer');
        itemsContainer.className = 'focuscontainer-x itemsContainer scrollSlider animatedScrollX';
        itemsContainer.style.whiteSpace = 'nowrap';

        // Use DocumentFragment for batch DOM insertion
        const fragment = document.createDocumentFragment();

        // Add items to container
        for (const item of filteredResults) {
            const card = JE.jellyseerrUI && JE.jellyseerrUI.createJellyseerrCard
                ? JE.jellyseerrUI.createJellyseerrCard(item, true, true)
                : null;
            if (card) {
                const titleLink = card.querySelector('.cardText-first a');

                // If item exists in library, link to library item
                const jellyfinMediaId = item.mediaInfo?.jellyfinMediaId;
                if (jellyfinMediaId) {
                    card.setAttribute('data-library-item', 'true');
                    card.setAttribute('data-jellyfin-media-id', jellyfinMediaId);
                    card.classList.add('jellyseerr-card-in-library');
                    // Update title link to point to library item
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
        scrollerContainer.appendChild(itemsContainer);
        section.appendChild(scrollerContainer);
        return section;
    }

    /**
     * Renders Similar and Recommended sections for an item
     * @param {string} itemId - Jellyfin item ID
     */
    async function renderSimilarAndRecommended(itemId) {
        // Prevent duplicate renders (check only - add after success)
        if (processedItems.has(itemId)) {
            return;
        }

        // Cancel any previous in-flight requests
        if (currentAbortController) {
            currentAbortController.abort();
        }
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        // Start metrics if enabled
        if (JE.requestManager?.metrics?.enabled) {
            JE.requestManager.startMeasurement('similar-recommended');
        }

        try {
            // Check configuration settings early
            const showSimilar = JE.pluginConfig?.JellyseerrShowSimilar === true;
            const showRecommended = JE.pluginConfig?.JellyseerrShowRecommended === true;

            if (!showSimilar && !showRecommended) {
                console.debug(`${logPrefix} Both similar and recommended sections are disabled in settings`);
                return;
            }

            // Check if Jellyseerr is active
            const status = await JE.jellyseerrAPI.checkUserStatus();
            if (signal.aborted) return;

            if (!status || !status.active) {
                console.debug(`${logPrefix} Jellyseerr is not active, skipping`);
                return;
            }

            // Get TMDB ID and type
            const { tmdbId, type } = await details.getTmdbIdFromItem(itemId, signal);
            if (signal.aborted) return;

            if (!tmdbId || !type) {
                console.debug(`${logPrefix} No valid TMDB ID found for item, skipping`);
                return;
            }

            console.debug(`${logPrefix} Fetching similar and recommended content for TMDB ID ${tmdbId} (${type})`);

            // Fetch only the data that's enabled, passing signal for cancellation
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

            // Wait for page to be ready in parallel with data fetch
            const [similarData, recommendedData, pageReady] = await Promise.all([
                ...promises,
                waitForDetailPageReady(signal)
            ]);

            if (signal.aborted) return;

            const similarResults = similarData?.results || [];
            const recommendedResults = recommendedData?.results || [];

            if (similarResults.length === 0 && recommendedResults.length === 0) {
                console.debug(`${logPrefix} No similar or recommended content to display`);
                return;
            }

            // Check page readiness
            if (!pageReady) {
                console.warn(`${logPrefix} Page not ready for insertion`);
                return;
            }

            const { detailPageContent, moreLikeThisSection } = pageReady;

            // Filter items if configured to exclude library items or blocklisted items (status 6)
            const excludeLibraryItems = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
            const excludeBlocklistedItems = JE.pluginConfig?.JellyseerrExcludeBlocklistedItems === true;

            const filteredSimilarResults = similarResults.filter(item => {
                if (excludeLibraryItems && item.mediaInfo?.jellyfinMediaId) return false;
                if (excludeBlocklistedItems && item.mediaInfo?.status === JE.seerrStatus.MEDIA.BLOCKED) return false;
                return true;
            });

            const filteredRecommendedResults = recommendedResults.filter(item => {
                if (excludeLibraryItems && item.mediaInfo?.jellyfinMediaId) return false;
                if (excludeBlocklistedItems && item.mediaInfo?.status === JE.seerrStatus.MEDIA.BLOCKED) return false;
                return true;
            });

            if (filteredSimilarResults.length === 0 && filteredRecommendedResults.length === 0) {
                console.debug(`${logPrefix} No content to display after filtering library items`);
                return;
            }

            // Final abort check before DOM manipulation
            if (signal.aborted) return;

            // Remove any existing Jellyseerr sections to avoid duplicates (their
            // cards must be unobserved first: lazy posters hold strong references)
            JE.jellyseerrUI?.releasePosters?.(detailPageContent);
            detailPageContent.querySelectorAll('.jellyseerr-details-section').forEach(el => el.remove());

            // Create and insert sections
            if (filteredRecommendedResults.length > 0) {
                const recommendedTitle = JE.t ? (JE.t('jellyseerr_recommended_title') || 'Recommended') : 'Recommended';
                const recommendedSection = createJellyseerrSection(
                    filteredRecommendedResults.slice(0, 20),
                    recommendedTitle
                );
                if (recommendedSection) {
                    moreLikeThisSection.after(recommendedSection);
                    console.debug(`${logPrefix} Added Recommended section with ${filteredRecommendedResults.length} items`);
                }
            }

            if (filteredSimilarResults.length > 0) {
                const similarTitle = JE.t ? (JE.t('jellyseerr_similar_title') || 'Similar') : 'Similar';
                const similarSection = createJellyseerrSection(
                    filteredSimilarResults.slice(0, 20),
                    similarTitle
                );
                if (similarSection) {
                    const lastJellyseerrSection = detailPageContent.querySelector('.jellyseerr-details-section:last-of-type');
                    if (lastJellyseerrSection) {
                        lastJellyseerrSection.after(similarSection);
                    } else {
                        moreLikeThisSection.after(similarSection);
                    }
                    console.debug(`${logPrefix} Added Similar section with ${filteredSimilarResults.length} items`);
                }
            }

            // Mark as successfully processed AFTER successful render
            processedItems.add(itemId);

            // End metrics
            if (JE.requestManager?.metrics?.enabled) {
                JE.requestManager.endMeasurement('similar-recommended');
            }

        } catch (error) {
            // Silently ignore abort errors (don't mark as processed so retry is possible)
            if (error.name === 'AbortError') {
                console.debug(`${logPrefix} Request aborted for item ${itemId}`);
                return;
            }
            console.error(`${logPrefix} Error rendering similar and recommended sections:`, error);
        }
    }

    function cleanup() {
        currentAbortController?.abort();
        currentAbortController = null;
        processedItems.clear();
    }

    details.recommendations = { render: renderSimilarAndRecommended, cleanup };

})(window.JellyfinEnhanced);
