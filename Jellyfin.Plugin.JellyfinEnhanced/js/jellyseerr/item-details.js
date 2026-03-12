// /js/jellyseerr/item-details.js
// Adds Similar and Recommended sections to item details pages using Jellyseerr API
(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Jellyseerr Recommendations:';

    // Track processed items to avoid duplicate renders
    const processedItems = new Set();

    // Current abort controller for cancellation
    let currentAbortController = null;

    /**
     * Gets the TMDB ID from a Jellyfin item
     * @param {string} itemId - Jellyfin item ID
     * @param {AbortSignal} [signal] - Optional abort signal
     * @returns {Promise<{tmdbId: number|null, type: string|null}>}
     */
    async function getTmdbIdFromItem(itemId, signal) {
        try {
            // Check for abort before making request
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            const userId = ApiClient.getCurrentUserId();
            const item = await ApiClient.getItem(userId, itemId);

            // Check for abort after request
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            if (!item) {
                console.warn(`${logPrefix} Item not found:`, itemId);
                return { tmdbId: null, type: null };
            }

            // Check if item is Movie or Series
            const itemType = item.Type;
            if (itemType !== 'Movie' && itemType !== 'Series') {
                return { tmdbId: null, type: null };
            }

            // Get TMDB ID from provider IDs
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

                const detailPageContent = activePage.querySelector('.detailPageContent');
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
            let observer = null;
            let timeoutId = null;

            const cleanup = () => {
                if (observer) {
                    observer.disconnect();
                    observer = null;
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

            observer = new MutationObserver(() => {
                const result = checkPage();
                if (result) {
                    cleanup();
                    resolve(result);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

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
            const { tmdbId, type } = await getTmdbIdFromItem(itemId, signal);
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
                if (excludeBlocklistedItems && item.mediaInfo?.status === 6) return false; // Status 6 = Blocklisted
                return true;
            });

            const filteredRecommendedResults = recommendedResults.filter(item => {
                if (excludeLibraryItems && item.mediaInfo?.jellyfinMediaId) return false;
                if (excludeBlocklistedItems && item.mediaInfo?.status === 6) return false; // Status 6 = Blocklisted
                return true;
            });

            if (filteredSimilarResults.length === 0 && filteredRecommendedResults.length === 0) {
                console.debug(`${logPrefix} No content to display after filtering library items`);
                return;
            }

            // Final abort check before DOM manipulation
            if (signal.aborted) return;

            // Remove any existing Jellyseerr sections to avoid duplicates
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

    // ================================
    // MISSING SEASONS "REQUEST MORE" BUTTON
    // ================================

    const missingSeasonsLogPrefix = '🪼 Jellyfin Enhanced: Missing Seasons:';
    const REQUEST_MORE_BTN_CLASS = 'je-request-more-btn';

    /**
     * Checks if a TV show has missing released seasons that can be requested.
     * A season is "missing" if it has aired, has episodes, is not a special (season 0),
     * and has not been requested or made available in Jellyseerr.
     * @param {object} tvDetails - TV show details from Jellyseerr API
     * @returns {boolean} - True if there are unrequested released seasons
     */
    function hasMissingReleasedSeasons(tvDetails) {
        if (!tvDetails?.seasons) return false;

        const now = new Date();
        const seasonStatusMap = {};

        // Build status map from mediaInfo seasons
        tvDetails.mediaInfo?.seasons?.forEach(s => {
            if (!seasonStatusMap[s.seasonNumber] || s.status > seasonStatusMap[s.seasonNumber]) {
                seasonStatusMap[s.seasonNumber] = s.status;
            }
        });

        // Also include request statuses (may have higher status than mediaInfo)
        tvDetails.mediaInfo?.requests?.forEach(r => {
            r.seasons?.forEach(sr => {
                if (!seasonStatusMap[sr.seasonNumber] || sr.status > seasonStatusMap[sr.seasonNumber]) {
                    seasonStatusMap[sr.seasonNumber] = sr.status;
                }
            });
        });

        for (const season of tvDetails.seasons) {
            if (season.seasonNumber <= 0) continue;
            if (!season.episodeCount || season.episodeCount <= 0) continue;

            // Only consider released seasons
            if (!season.airDate) continue;
            if (new Date(season.airDate) > now) continue;

            // Status 1 or undefined = not requested; anything higher means requested/available
            const status = seasonStatusMap[season.seasonNumber];
            if (!status || status === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * Renders a "Request More" button on the Series detail page
     * when the show has missing released seasons that can be requested via Jellyseerr.
     * @param {string} itemId - Jellyfin item ID
     */
    async function renderMissingSeasonsButton(itemId) {
        try {
            if (!JE.pluginConfig?.JellyseerrEnabled) return;

            const status = await JE.jellyseerrAPI.checkUserStatus();
            if (!status?.active) return;

            const userId = ApiClient.getCurrentUserId();
            const item = await ApiClient.getItem(userId, itemId);
            if (!item || item.Type !== 'Series') return;

            const tmdbId = item.ProviderIds?.Tmdb;
            if (!tmdbId) return;

            const tvDetails = await JE.jellyseerrAPI.fetchTvShowDetails(parseInt(tmdbId));
            if (!tvDetails) return;

            if (!hasMissingReleasedSeasons(tvDetails)) {
                console.debug(`${missingSeasonsLogPrefix} No missing released seasons for "${item.Name}"`);
                return;
            }

            console.debug(`${missingSeasonsLogPrefix} Found missing released seasons for "${item.Name}"`);

            const activePage = document.querySelector('.libraryPage:not(.hide)');
            if (!activePage) return;

            // Prevent duplicate button
            if (activePage.querySelector(`.${REQUEST_MORE_BTN_CLASS}`)) return;

            // Find the detail page button container
            const buttonSelectors = ['.detailButtons', '.mainDetailButtons', '.detailButtonsContainer'];
            let buttonContainer = null;
            for (const sel of buttonSelectors) {
                const found = activePage.querySelector(sel);
                if (found) {
                    buttonContainer = found;
                    break;
                }
            }
            if (!buttonContainer) return;

            // Create button matching Jellyfin's native detail button style
            const button = document.createElement('button');
            button.setAttribute('is', 'emby-button');
            button.className = `button-flat detailButton emby-button ${REQUEST_MORE_BTN_CLASS}`;
            button.type = 'button';
            button.title = JE.t('jellyseerr_btn_request_more') || 'Request More';

            const content = document.createElement('div');
            content.className = 'detailButton-content';

            const icon = document.createElement('span');
            icon.className = 'material-icons detailButton-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = 'download';

            const textSpan = document.createElement('span');
            textSpan.className = 'detailButton-icon-text';
            textSpan.textContent = JE.t('jellyseerr_btn_request_more') || 'Request More';

            content.appendChild(icon);
            content.appendChild(textSpan);
            button.appendChild(content);

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (JE.jellyseerrUI?.showSeasonSelectionModal) {
                    JE.jellyseerrUI.showSeasonSelectionModal(parseInt(tmdbId), 'tv', item.Name, tvDetails);
                }
            });

            // Insert before the "more" button if present, otherwise append
            const moreButton = buttonContainer.querySelector('.btnMoreCommands');
            if (moreButton) {
                buttonContainer.insertBefore(button, moreButton);
            } else {
                buttonContainer.appendChild(button);
            }

            console.debug(`${missingSeasonsLogPrefix} Added "Request More" button for "${item.Name}"`);
        } catch (error) {
            console.error(`${missingSeasonsLogPrefix} Error rendering missing seasons button:`, error);
        }
    }

    /**
     * Handles item details page navigation
     */
    function handleItemDetailsPage() {
        // Get item ID from URL
        const hash = window.location.hash;
        if (!hash.includes('/details?id=')) {
            return;
        }

        try {
            const itemId = new URLSearchParams(hash.split('?')[1]).get('id');
            if (itemId) {
                // Use requestAnimationFrame instead of fixed timeout
                // This ensures we're in sync with the rendering cycle
                requestAnimationFrame(() => {
                    renderSimilarAndRecommended(itemId);
                    renderMissingSeasonsButton(itemId);
                });
            }
        } catch (error) {
            console.error(`${logPrefix} Error parsing item ID from URL:`, error);
        }
    }

    /**
     * Cleanup function for navigation
     */
    function cleanup() {
        // Abort any in-flight requests
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        // Clear processed items cache
        processedItems.clear();
    }

    /**
     * Initializes the item details handler
     */
    function initialize() {
        console.debug(`${logPrefix} Initializing Recommendations and Similar sections`);

        // Listen for hash changes (navigation)
        window.addEventListener('hashchange', () => {
            cleanup();
            handleItemDetailsPage();
        });

        // Check current page on load
        handleItemDetailsPage();

        // Also listen for viewshow events (Jellyfin's custom event)
        document.addEventListener('viewshow', () => {
            handleItemDetailsPage();
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})(window.JellyfinEnhanced);
