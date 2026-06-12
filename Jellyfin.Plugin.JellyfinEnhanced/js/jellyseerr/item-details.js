// /js/jellyseerr/item-details.js
// Adds Similar and Recommended sections to item details pages using Jellyseerr API.
// Also adds a "Request More" button next to the Seasons section heading on
// Series detail pages when the show has unrequested seasons in Seerr.
//
// Timing model (router-driven, primary path): network fetches start at
// viewshow via JE.viewRouter.onViewShow; the row sections are inserted at the
// native detail render moment (onNativeDetailRender) and the Request More
// button when the seasons/children section renders (onChildrenRender).
// No polling loops. A legacy hashchange/viewshow path remains as a fallback
// for the (unexpected) case that the view router is unavailable.
(function(JE) {
    'use strict';

    // Body deferred via onBootReady: top-level code here reads plugin/user
    // config, which is not loaded yet when the server-side bundle executes.
    JE.onBootReady(function() {

    const logPrefix = '🪼 Jellyfin Enhanced: Jellyseerr Recommendations:';
    const requestMoreLogPrefix = '🪼 Jellyfin Enhanced: Series Request More:';

    // Track processed items to avoid duplicate renders within one navigation
    // (consulted by the legacy fallback path; cleared on every navigation).
    const processedItems = new Set();
    const processedRequestMoreItems = new Set();

    // CSS class used to mark and dedupe the injected Request More button
    const REQUEST_MORE_BTN_CLASS = 'je-series-request-more-btn';

    // Session cache of fetched rows so warm revisits render synchronously at
    // the native render moment. itemId -> { similar, recommended, ts }
    const ROW_CACHE_TTL_MS = 10 * 60 * 1000;
    const rowCache = new Map();

    // Per-navigation state for the router-driven path, keyed by ctx.token.
    // All promises inside are abort-bound to ctx.signal.
    let navState = null;

    // Abort controllers for the legacy fallback path only. Separate
    // controllers prevent the slower similar/recommended fetch from
    // cancelling the Request More check (and vice versa) when the user
    // navigates between detail pages.
    let currentAbortController = null;
    let requestMoreAbortController = null;

    /**
     * Returns fresh cached rows for an item, or null. Expired entries are
     * pruned lazily on read.
     * @param {string} itemId
     * @returns {{similar: Array, recommended: Array}|null}
     */
    function getCachedRows(itemId) {
        const entry = rowCache.get(itemId);
        if (!entry) return null;
        if (Date.now() - entry.ts > ROW_CACHE_TTL_MS) {
            rowCache.delete(itemId);
            return null;
        }
        return { similar: entry.similar, recommended: entry.recommended };
    }

    /**
     * Resolves whether Jellyseerr is active. Prefers the shared single-flight
     * status cache (60s TTL) from issue-reporter.js — that module loads after
     * this one in the bundle, so it is read lazily at call time — falling
     * back to this module's original direct status check.
     * @returns {Promise<boolean>}
     */
    function checkJellyseerrActive() {
        const shared = JE.jellyseerrStatus?.get?.();
        if (shared) return Promise.resolve(shared).then((active) => !!active);
        return JE.jellyseerrAPI.checkUserStatus().then((status) => !!(status && status.active));
    }

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
            const item = JE.helpers?.getItemCached
                ? await JE.helpers.getItemCached(itemId, { userId })
                : await ApiClient.getItem(userId, itemId);

            // Check for abort after request
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            if (!item) {
                console.warn(`${logPrefix} Item not found:`, itemId);
                return { tmdbId: null, type: null };
            }

            // Feed the router's persistent identity cache so future
            // navigations resolve TMDB ids without an item DTO round-trip.
            JE.viewRouter?.recordIdentity?.(item);

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
     * Normalizes media type spellings (router identity cache stores raw
     * Jellyfin item types) to Jellyseerr's 'movie' | 'tv'.
     * @param {string|null} type
     * @returns {string|null}
     */
    function normalizeMediaType(type) {
        if (type === 'movie' || type === 'Movie') return 'movie';
        if (type === 'tv' || type === 'Series' || type === 'series') return 'tv';
        return null;
    }

    /**
     * Resolves { tmdbId, type } for an item: the router's persistent identity
     * cache first (synchronous hit, no network), then the item DTO via the
     * single-flight item cache (warmed by the native detail controller's own
     * viewshow fetch).
     * @param {string} itemId
     * @param {AbortSignal} [signal]
     * @returns {Promise<{tmdbId: number|null, type: string|null}>}
     */
    function resolveIdentity(itemId, signal) {
        const cached = JE.viewRouter?.getIdentity?.(itemId);
        if (cached) {
            const type = normalizeMediaType(cached.type);
            const tmdbId = parseInt(cached.tmdbId, 10);
            if (type && !Number.isNaN(tmdbId)) {
                return Promise.resolve({ tmdbId, type });
            }
        }
        return getTmdbIdFromItem(itemId, signal);
    }

    /**
     * Finds the rows insertion anchor on the (active) detail page.
     * @param {HTMLElement} [viewEl] - Known view element (router ctx.view)
     * @returns {{detailPageContent: HTMLElement, moreLikeThisSection: HTMLElement}|null}
     */
    function findRowsAnchor(viewEl) {
        const root = viewEl && viewEl.querySelector
            ? viewEl
            : document.querySelector('.libraryPage:not(.hide)');
        if (!root) return null;
        const detailPageContent = root.querySelector('.detailPageContent');
        const moreLikeThisSection = detailPageContent?.querySelector('#similarCollapsible');
        if (!detailPageContent || !moreLikeThisSection) return null;
        return { detailPageContent, moreLikeThisSection };
    }

    /**
     * Wait for the detail page content to be ready. Legacy fallback path only
     * — the router path gets this moment from onNativeDetailRender. Purely
     * event-driven (shared body MutationObserver + one 3s timeout fallback),
     * not an interval poll.
     * @param {AbortSignal} [signal] - Optional abort signal
     * @returns {Promise<object|null>}
     */
    function waitForDetailPageReady(signal) {
        return new Promise((resolve) => {
            if (signal?.aborted) {
                resolve(null);
                return;
            }

            // Try immediately
            const immediate = findRowsAnchor();
            if (immediate) {
                resolve(immediate);
                return;
            }

            let observerHandle = null;
            let timeoutId = null;

            const cleanupWait = () => {
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
                    cleanupWait();
                    resolve(null);
                }, { once: true });
            }

            observerHandle = JE.helpers.onBodyMutation('jellyseerr-item-details-page-detect', () => {
                const result = findRowsAnchor();
                if (result) {
                    cleanupWait();
                    resolve(result);
                }
            });

            // Timeout fallback (3 seconds)
            timeoutId = setTimeout(() => {
                cleanupWait();
                resolve(findRowsAnchor());
            }, 3000);
        });
    }

    /**
     * Outer result filter applied before slicing: drops in-library items and
     * blocklisted items per plugin config.
     * @param {Array} results
     * @returns {Array}
     */
    function preFilterRowResults(results) {
        const excludeLibraryItems = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
        const excludeBlocklistedItems = JE.pluginConfig?.JellyseerrExcludeBlocklistedItems === true;
        return results.filter(item => {
            if (excludeLibraryItems && item.mediaInfo?.jellyfinMediaId) return false;
            if (excludeBlocklistedItems && item.mediaInfo?.status === 6) return false; // Status 6 = Blocklisted
            return true;
        });
    }

    /**
     * Inner section filter: library-item exclusion plus hidden-content hooks.
     * @param {Array} results
     * @returns {Array}
     */
    function applyRowFilters(results) {
        const excludeLibraryItems = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
        let filteredResults = results;
        if (excludeLibraryItems) {
            filteredResults = filteredResults.filter(item => !item.mediaInfo?.jellyfinMediaId);
        }
        if (JE.hiddenContent) {
            filteredResults = JE.hiddenContent.filterJellyseerrResults(filteredResults, 'recommendations');
        }
        return filteredResults;
    }

    /**
     * Creates the empty section container markup (title + scroller + items
     * container, no cards). Markup/classes/styles identical to the final
     * rendered section; cards are appended by fillSectionCards.
     * @param {string} title - Section title (already translated)
     * @returns {HTMLElement}
     */
    function createSectionShell(title) {
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
        // Plain container on purpose: the native emby-itemscontainer upgrade
        // pulls in MultiSelect, Sortable, context-menu handlers and seven
        // server-event subscriptions per row — none of which these custom
        // cards use (they ship their own click handlers). The classes alone
        // provide the layout/scroll styling.
        itemsContainer.className = 'focuscontainer-x itemsContainer scrollSlider animatedScrollX';
        itemsContainer.style.whiteSpace = 'nowrap';

        scrollerContainer.appendChild(itemsContainer);
        section.appendChild(scrollerContainer);
        return section;
    }

    /**
     * Builds cards for the given (already filtered) results. The first few
     * cards (one visible row width) build synchronously so warm renders paint
     * with the native frame; the off-screen remainder builds cooperatively via
     * scheduleChunked so a 20-card row can never produce a long task.
     * @param {HTMLElement} section - Shell from createSectionShell
     * @param {Array} filteredResults
     * @param {number} [syncFirst=6] - Cards built synchronously up front
     * @returns {{initial: number, done: Promise<number>}} initial = cards
     *   appended in this frame; done resolves with the final total.
     */
    function fillSectionCards(section, filteredResults, syncFirst = 6) {
        const itemsContainer = section.querySelector('.itemsContainer');
        if (!itemsContainer || !filteredResults.length) {
            return { initial: 0, done: Promise.resolve(0) };
        }

        let added = 0;
        const buildInto = (item, fragment) => {
            const card = JE.jellyseerrUI && JE.jellyseerrUI.createJellyseerrCard
                ? JE.jellyseerrUI.createJellyseerrCard(item, true, true)
                : null;
            if (!card) return;
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
            added++;
        };

        const firstBatch = filteredResults.slice(0, syncFirst);
        const rest = filteredResults.slice(syncFirst);

        const fragment = document.createDocumentFragment();
        for (const item of firstBatch) buildInto(item, fragment);
        itemsContainer.appendChild(fragment);
        const initial = added;

        let done;
        if (rest.length > 0 && typeof JE.helpers?.scheduleChunked === 'function') {
            // Flush to the live container every few cards instead of one big
            // append at the end: the custom-element upgrades and style/layout
            // of ~14 rich cards in a single batch was itself a long task.
            // content-visibility on the section keeps each flush cheap while
            // the row is below the fold.
            const restFragment = document.createDocumentFragment();
            let sinceFlush = 0;
            done = JE.helpers.scheduleChunked(rest, (item) => {
                buildInto(item, restFragment);
                if (++sinceFlush >= 5 && section.isConnected) {
                    itemsContainer.appendChild(restFragment);
                    sinceFlush = 0;
                }
            }, { budgetMs: 8 })
                .then(() => {
                    if (section.isConnected) itemsContainer.appendChild(restFragment);
                    return added;
                });
        } else if (rest.length > 0) {
            for (const item of rest) buildInto(item, fragment);
            itemsContainer.appendChild(fragment);
            done = Promise.resolve(added);
        } else {
            done = Promise.resolve(added);
        }
        return { initial, done };
    }

    /**
     * Creates a fully built Jellyseerr section (shell + cards), or null when
     * nothing remains after filtering. Used by the legacy fallback path; the
     * router path inserts shells first and fills them as data resolves.
     * @param {Array} results - Array of Jellyseerr items
     * @param {string} title - Section title (already translated)
     * @returns {HTMLElement|null}
     */
    function createJellyseerrSection(results, title) {
        if (!results || results.length === 0) {
            return null;
        }
        const filteredResults = applyRowFilters(results);
        if (filteredResults.length === 0) {
            return null;
        }
        const section = createSectionShell(title);
        // Cards stream in (first row synchronously, remainder chunked).
        void fillSectionCards(section, filteredResults).done;
        return section;
    }

    /**
     * Renders Similar and Recommended sections for an item.
     * Legacy fallback path (no view router): fetches and page-readiness are
     * awaited together, then sections are built and inserted in one go.
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

            let similarData, recommendedData, pageReady;

            const cached = getCachedRows(itemId);
            if (cached) {
                similarData = { results: cached.similar };
                recommendedData = { results: cached.recommended };
                pageReady = await waitForDetailPageReady(signal);
            } else {
                // Check if Jellyseerr is active
                const active = await checkJellyseerrActive();
                if (signal.aborted) return;

                if (!active) {
                    console.debug(`${logPrefix} Jellyseerr is not active, skipping`);
                    return;
                }

                // Get TMDB ID and type
                const { tmdbId, type } = await resolveIdentity(itemId, signal);
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
                [similarData, recommendedData, pageReady] = await Promise.all([
                    ...promises,
                    waitForDetailPageReady(signal)
                ]);

                if (signal.aborted) return;

                rowCache.set(itemId, {
                    similar: similarData?.results || [],
                    recommended: recommendedData?.results || [],
                    ts: Date.now()
                });
            }

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
            const filteredSimilarResults = preFilterRowResults(similarResults);
            const filteredRecommendedResults = preFilterRowResults(recommendedResults);

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

    /**
     * Builds the Request More button DOM. Reuses the .jellyseerr-request-button
     * styling already injected by ui.js so visuals match the rest of Seerr UI.
     * Uses textContent / DOM construction (no innerHTML) for safety.
     * @param {object} tvDetails - TV show details from Seerr
     * @returns {HTMLButtonElement}
     */
    function buildSeriesRequestMoreButton(tvDetails) {
        // Defensive: i18n table may not be initialized yet on first navigation;
        // match the fallback pattern used elsewhere in this file.
        const labelText = (JE.t && JE.t('jellyseerr_btn_request_more')) || 'Request More';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `jellyseerr-request-button jellyseerr-button-request ${REQUEST_MORE_BTN_CLASS}`;
        button.title = labelText;
        // Inline overrides so the button sits comfortably next to the h2 text
        // without inheriting the heading's font size or block layout.
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.verticalAlign = 'middle';
        button.style.fontSize = '0.85rem';
        button.style.padding = '0.4em 0.9em';
        button.style.marginLeft = '1em';

        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'download';
        icon.style.marginRight = '0.4em';
        icon.style.fontSize = '1.1em';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = labelText;

        button.appendChild(icon);
        button.appendChild(labelSpan);

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (JE.jellyseerrUI?.showSeasonSelectionModal) {
                JE.jellyseerrUI.showSeasonSelectionModal(
                    tvDetails.id,
                    'tv',
                    tvDetails.name || tvDetails.title,
                    tvDetails
                );
            }
        });

        return button;
    }

    /**
     * Finds the visible Seasons section heading on a Series detail page.
     * Series pages render the seasons list inside #listChildrenCollapsible;
     * #childrenCollapsible is used for other layouts, so take whichever is
     * present and visible. Synchronous: callers invoke this at a moment the
     * section is known to be rendered (router onChildrenRender), so no
     * waiting/polling is needed.
     * @param {HTMLElement} [viewEl] - Known view element (router ctx.view)
     * @returns {HTMLElement|null}
     */
    function findSeasonsHeading(viewEl) {
        const root = viewEl && viewEl.querySelector
            ? viewEl
            : document.querySelector('.libraryPage:not(.hide)');
        if (!root) return null;
        const collapsible = ['#listChildrenCollapsible', '#childrenCollapsible']
            .map((sel) => root.querySelector(sel))
            .find((el) => el && !el.classList.contains('hide'));
        if (!collapsible) return null;
        const heading = collapsible.querySelector('h2.sectionTitle.sectionTitle-cards');
        if (!heading || heading.classList.contains('hide')) return null;
        // Jellyfin populates the title span in the same render pass as the
        // children items; an empty span means the heading is not ready.
        const span = heading.querySelector('span');
        if (!span || !span.textContent.trim()) return null;
        return heading;
    }

    /**
     * Injects the Request More button next to the Seasons heading. Dedupes
     * via REQUEST_MORE_BTN_CLASS, so it is safe to call repeatedly.
     * @param {string} itemId
     * @param {object} tvDetails - TV show details from Seerr
     * @param {HTMLElement} [viewEl] - Known view element (router ctx.view)
     */
    function injectRequestMoreButton(itemId, tvDetails, viewEl) {
        const heading = findSeasonsHeading(viewEl);
        if (!heading) {
            console.debug(`${requestMoreLogPrefix} Seasons heading not found, skipping`);
            return;
        }

        // Dedup: bail if we already injected a button into this heading.
        if (heading.querySelector(`.${REQUEST_MORE_BTN_CLASS}`)) {
            processedRequestMoreItems.add(itemId);
            return;
        }

        // Lay the button out inline next to the heading text via a class
        // (instead of mutating heading.style directly) so the override is
        // discoverable in CSS, easy to remove, and doesn't permanently
        // overwrite Jellyfin's inline display value on the heading.
        heading.classList.add('je-series-request-more-heading');
        heading.appendChild(buildSeriesRequestMoreButton(tvDetails));

        processedRequestMoreItems.add(itemId);
        console.debug(`${requestMoreLogPrefix} Added Request More button for "${tvDetails.name || tvDetails.title}"`);
    }

    /**
     * Renders a "Request More" button next to the Seasons section heading on
     * a Series detail page when the show has unrequested seasons in Seerr.
     * Legacy fallback path (no view router). Reuses checkForUnrequestedSeasons
     * from more-info-modal.js so the detection logic stays in one place; the
     * bundle's deterministic load order guarantees it is defined before any
     * navigation happens.
     * @param {string} itemId - Jellyfin item ID
     */
    async function renderSeriesRequestMoreButton(itemId) {
        if (processedRequestMoreItems.has(itemId)) return;

        // Cancel any in-flight Request More check from a previous navigation.
        if (requestMoreAbortController) {
            requestMoreAbortController.abort();
        }
        requestMoreAbortController = new AbortController();
        const signal = requestMoreAbortController.signal;

        try {
            if (!JE.pluginConfig?.JellyseerrEnabled) return;
            if (JE.pluginConfig?.JellyseerrShowRequestMoreOnSeries === false) return;

            const active = await checkJellyseerrActive();
            if (signal.aborted) return;
            if (!active) return;

            const { tmdbId, type } = await resolveIdentity(itemId, signal);
            if (signal.aborted) return;
            if (!tmdbId || type !== 'tv') return;

            const tvDetails = await JE.jellyseerrAPI.fetchTvShowDetails(tmdbId);
            if (signal.aborted) return;
            if (!tvDetails) return;

            const checker = JE.jellyseerrMoreInfo?.checkForUnrequestedSeasons;
            if (typeof checker !== 'function') {
                console.warn(`${requestMoreLogPrefix} checkForUnrequestedSeasons unavailable, skipping`);
                return;
            }
            const hasUnrequested = await checker(tvDetails);
            if (signal.aborted) return;
            if (!hasUnrequested) {
                // Dedupe negative results too. Each call to checker() runs an
                // HTTP request to /JellyfinEnhanced/jellyseerr/request, so we
                // don't want to repeat it on every viewshow for the same item.
                // cleanup() clears this set on real navigation.
                processedRequestMoreItems.add(itemId);
                console.debug(`${requestMoreLogPrefix} No unrequested seasons for "${tvDetails.name || tvDetails.title}"`);
                return;
            }

            // By the time the eligibility checks above have completed, the
            // seasons section is rendered on any realistic connection; if the
            // heading is still missing, skip quietly (fallback path only).
            injectRequestMoreButton(itemId, tvDetails);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.debug(`${requestMoreLogPrefix} Aborted for item ${itemId}`);
                return;
            }
            console.error(`${requestMoreLogPrefix} Error rendering button:`, error);
        }
    }

    // ------------------------------------------------------------------------
    // Router-driven pipeline (primary path)
    // ------------------------------------------------------------------------

    /**
     * True when the navigation that produced `state` is no longer current.
     * @param {object} state
     * @returns {boolean}
     */
    function isStaleNav(state) {
        return state.signal.aborted || navState !== state;
    }

    /**
     * onViewShow: reset per-navigation state, then start all network work
     * immediately so data is in flight while the native page renders.
     * @param {object} ctx - Router context {token, view, viewType, itemId, params, signal}
     */
    function handleViewShow(ctx) {
        cleanup();
        if (!ctx.itemId) {
            navState = null;
            return;
        }

        const state = {
            token: ctx.token,
            itemId: ctx.itemId,
            signal: ctx.signal,
            statusPromise: null,
            identityPromise: null,
            showSimilar: false,
            showRecommended: false,
            rowsEnabled: false,
            rowsPromise: null,
            rowsResolved: undefined,
            requestMorePromise: null,
            metricsStarted: false
        };
        navState = state;
        ctx.signal.addEventListener('abort', () => {
            if (navState === state) navState = null;
        }, { once: true });

        // Shared upstream promises (status + identity) feed both pipelines so
        // each navigation pays for them at most once.
        state.statusPromise = checkJellyseerrActive().catch((error) => {
            console.debug(`${logPrefix} Status check failed:`, error);
            return false;
        });
        state.identityPromise = resolveIdentity(ctx.itemId, ctx.signal).catch((error) => {
            if (error?.name !== 'AbortError') {
                console.error(`${logPrefix} Identity resolution failed:`, error);
            }
            return { tmdbId: null, type: null };
        });

        startRowsPipeline(state);
        startRequestMorePipeline(state);
    }

    /**
     * Starts the Similar/Recommended data pipeline for the current navigation.
     * Resolves to { similar, recommended } raw result arrays, or null when
     * there is nothing to render (disabled, inactive, no TMDB id, error).
     * @param {object} state - Per-navigation state
     */
    function startRowsPipeline(state) {
        state.showSimilar = JE.pluginConfig?.JellyseerrShowSimilar === true;
        state.showRecommended = JE.pluginConfig?.JellyseerrShowRecommended === true;
        state.rowsEnabled = state.showSimilar || state.showRecommended;
        if (!state.rowsEnabled) {
            console.debug(`${logPrefix} Both similar and recommended sections are disabled in settings`);
            return;
        }

        // Warm revisit: rows already in the session cache resolve
        // synchronously so onNativeDetailRender can build in-frame.
        const cached = getCachedRows(state.itemId);
        if (cached) {
            state.rowsResolved = cached;
            state.rowsPromise = Promise.resolve(cached);
            return;
        }

        if (JE.requestManager?.metrics?.enabled) {
            JE.requestManager.startMeasurement('similar-recommended');
            state.metricsStarted = true;
        }

        state.rowsPromise = (async () => {
            const active = await state.statusPromise;
            if (state.signal.aborted) return null;
            if (!active) {
                console.debug(`${logPrefix} Jellyseerr is not active, skipping`);
                return null;
            }

            const { tmdbId, type } = await state.identityPromise;
            if (state.signal.aborted) return null;
            if (!tmdbId || !type) {
                console.debug(`${logPrefix} No valid TMDB ID found for item, skipping`);
                return null;
            }

            console.debug(`${logPrefix} Fetching similar and recommended content for TMDB ID ${tmdbId} (${type})`);

            const fetchOptions = { signal: state.signal };
            const [similarData, recommendedData] = await Promise.all([
                state.showSimilar
                    ? (type === 'movie'
                        ? JE.jellyseerrAPI.fetchSimilarMovies(tmdbId, fetchOptions)
                        : JE.jellyseerrAPI.fetchSimilarTvShows(tmdbId, fetchOptions))
                    : Promise.resolve({ results: [] }),
                state.showRecommended
                    ? (type === 'movie'
                        ? JE.jellyseerrAPI.fetchRecommendedMovies(tmdbId, fetchOptions)
                        : JE.jellyseerrAPI.fetchRecommendedTvShows(tmdbId, fetchOptions))
                    : Promise.resolve({ results: [] })
            ]);
            if (state.signal.aborted) return null;

            const rows = {
                similar: similarData?.results || [],
                recommended: recommendedData?.results || []
            };
            rowCache.set(state.itemId, {
                similar: rows.similar,
                recommended: rows.recommended,
                ts: Date.now()
            });
            state.rowsResolved = rows;
            return rows;
        })().catch((error) => {
            if (error?.name === 'AbortError') {
                console.debug(`${logPrefix} Request aborted for item ${state.itemId}`);
            } else {
                console.error(`${logPrefix} Error fetching similar and recommended content:`, error);
            }
            return null;
        });
    }

    /**
     * Starts the series Request More eligibility pipeline for the current
     * navigation. Resolves to { tvDetails } when the button should render,
     * or null otherwise. The DOM moment is handled by onChildrenRender.
     * @param {object} state - Per-navigation state
     */
    function startRequestMorePipeline(state) {
        if (!JE.pluginConfig?.JellyseerrEnabled) return;
        if (JE.pluginConfig?.JellyseerrShowRequestMoreOnSeries === false) return;

        state.requestMorePromise = (async () => {
            const active = await state.statusPromise;
            if (state.signal.aborted || !active) return null;

            const { tmdbId, type } = await state.identityPromise;
            if (state.signal.aborted) return null;
            if (!tmdbId || type !== 'tv') return null;

            const tvDetails = await JE.jellyseerrAPI.fetchTvShowDetails(tmdbId);
            if (state.signal.aborted) return null;
            if (!tvDetails) return null;

            // Deterministic bundle order guarantees more-info-modal.js has
            // defined the checker before any navigation happens.
            const checker = JE.jellyseerrMoreInfo?.checkForUnrequestedSeasons;
            if (typeof checker !== 'function') {
                console.warn(`${requestMoreLogPrefix} checkForUnrequestedSeasons unavailable, skipping`);
                return null;
            }
            const hasUnrequested = await checker(tvDetails);
            if (state.signal.aborted) return null;
            if (!hasUnrequested) {
                processedRequestMoreItems.add(state.itemId);
                console.debug(`${requestMoreLogPrefix} No unrequested seasons for "${tvDetails.name || tvDetails.title}"`);
                return null;
            }
            return { tvDetails };
        })().catch((error) => {
            if (error?.name === 'AbortError') {
                console.debug(`${requestMoreLogPrefix} Aborted for item ${state.itemId}`);
            } else {
                console.error(`${requestMoreLogPrefix} Error preparing button:`, error);
            }
            return null;
        });
    }

    /**
     * Inserts hidden section shells at the insertion point in final order
     * (#similarCollapsible -> Recommended -> Similar), one per enabled
     * section. Hidden until filled so an empty shell never flashes.
     * @param {object} state - Per-navigation state
     * @param {object} anchor - From findRowsAnchor
     * @returns {{recommended: HTMLElement|undefined, similar: HTMLElement|undefined}}
     */
    function insertRowShells(state, anchor) {
        const shells = {};
        let insertAfter = anchor.moreLikeThisSection;
        if (state.showRecommended) {
            const recommendedTitle = JE.t ? (JE.t('jellyseerr_recommended_title') || 'Recommended') : 'Recommended';
            shells.recommended = createSectionShell(recommendedTitle);
            shells.recommended.classList.add('hide');
            insertAfter.after(shells.recommended);
            insertAfter = shells.recommended;
        }
        if (state.showSimilar) {
            const similarTitle = JE.t ? (JE.t('jellyseerr_similar_title') || 'Similar') : 'Similar';
            shells.similar = createSectionShell(similarTitle);
            shells.similar.classList.add('hide');
            insertAfter.after(shells.similar);
        }
        return shells;
    }

    /**
     * Removes inserted shells (aborted navigation or empty results).
     */
    function removeRowShells(shells) {
        if (shells.recommended) shells.recommended.remove();
        if (shells.similar) shells.similar.remove();
    }

    /**
     * Fills inserted shells with cards (or removes the ones that end up
     * empty after filtering). Synchronous, so a warm cache hit renders in
     * the same frame as the native detail render.
     * @param {object} state - Per-navigation state
     * @param {object} shells - From insertRowShells
     * @param {{similar: Array, recommended: Array}|null} rows
     */
    function fillRowShells(state, shells, rows) {
        if (!rows) {
            removeRowShells(shells);
            return;
        }

        const fillShell = (shell, results, label) => {
            const filtered = applyRowFilters(preFilterRowResults(results || []).slice(0, 20));
            if (filtered.length === 0) {
                shell.remove();
                return;
            }
            const fill = fillSectionCards(shell, filtered);
            if (fill.initial > 0) {
                shell.classList.remove('hide');
                console.debug(`${logPrefix} Added ${label} section with ${filtered.length} items (${fill.initial} in-frame)`);
            }
            // If the entire build produced nothing (abnormal), drop the shell;
            // also covers the initial-batch-empty case once the tail finishes.
            fill.done.then(total => {
                if (total === 0) shell.remove();
                else shell.classList.remove('hide');
            });
        };

        if (shells.recommended) fillShell(shells.recommended, rows.recommended, 'Recommended');
        if (shells.similar) fillShell(shells.similar, rows.similar, 'Similar');

        if (state.metricsStarted && JE.requestManager?.metrics?.enabled) {
            JE.requestManager.endMeasurement('similar-recommended');
            state.metricsStarted = false;
        }
    }

    /**
     * onNativeDetailRender: insert the section shells at the native render
     * moment, then fill them as the data promises resolve. Warm data (session
     * cache or already-settled fetch) builds fully in this frame.
     * @param {object} ctx - Router context
     */
    async function handleNativeDetailRender(ctx) {
        const state = navState;
        if (!state || state.token !== ctx.token || !state.rowsEnabled || !state.rowsPromise) return;

        // These rows live below the fold: yield one frame so the native render
        // batch (and the above-the-fold JE buttons) paint without us in it.
        await new Promise(requestAnimationFrame);
        if (isStaleNav(state) || state.token !== (navState && navState.token)) return;

        const anchor = findRowsAnchor(ctx.view);
        if (!anchor) {
            console.debug(`${logPrefix} Detail anchor (#similarCollapsible) not found, skipping rows`);
            return;
        }

        // Restored views keep the DOM from the previous visit: when the
        // existing sections already belong to THIS item and have content,
        // rebuilding them is pure waste (measured ~1s of card building on
        // warm restores). Keep them as-is.
        const existing = anchor.detailPageContent.querySelectorAll('.jellyseerr-details-section');
        if (existing.length > 0) {
            let sameItemWithContent = true;
            for (const el of existing) {
                if (el.getAttribute('data-je-item-id') !== String(state.itemId) || !el.querySelector('.card')) {
                    sameItemWithContent = false;
                    break;
                }
            }
            if (sameItemWithContent) {
                console.debug(`${logPrefix} Restored view already has current sections, skipping rebuild`);
                return;
            }
            existing.forEach(el => el.remove());
        }

        const shells = insertRowShells(state, anchor);
        if (shells.recommended) shells.recommended.setAttribute('data-je-item-id', String(state.itemId));
        if (shells.similar) shells.similar.setAttribute('data-je-item-id', String(state.itemId));

        if (state.rowsResolved !== undefined) {
            // Warm: build and insert fully in this frame.
            fillRowShells(state, shells, state.rowsResolved);
            return;
        }

        const rows = await state.rowsPromise;
        if (isStaleNav(state)) {
            removeRowShells(shells);
            return;
        }
        fillRowShells(state, shells, rows);
    }

    /**
     * onChildrenRender: the seasons section just rendered — inject the
     * Request More button as soon as the eligibility pipeline allows it.
     * @param {object} ctx - Router context
     */
    async function handleChildrenRender(ctx) {
        const state = navState;
        if (!state || state.token !== ctx.token || !state.requestMorePromise) return;

        const prepared = await state.requestMorePromise;
        if (!prepared || isStaleNav(state)) return;

        injectRequestMoreButton(state.itemId, prepared.tvDetails, ctx.view);
    }

    // ------------------------------------------------------------------------
    // Legacy fallback wiring + shared bootstrap
    // ------------------------------------------------------------------------

    /**
     * Handles item details page navigation (legacy fallback path).
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
                    renderSeriesRequestMoreButton(itemId);
                });
            }
        } catch (error) {
            console.error(`${logPrefix} Error parsing item ID from URL:`, error);
        }
    }

    /**
     * Cleanup function for navigation. Router path: per-nav fetches are
     * cancelled by the router aborting ctx.signal; this clears the legacy
     * controllers and the per-navigation dedupe sets.
     */
    function cleanup() {
        // Abort any in-flight requests
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        if (requestMoreAbortController) {
            requestMoreAbortController.abort();
            requestMoreAbortController = null;
        }
        // Clear processed items caches
        processedItems.clear();
        processedRequestMoreItems.clear();
    }

    /**
     * Injects the CSS used by the Series "Request More" button. Kept tiny so
     * it can live alongside the JS module instead of needing a separate file.
     */
    function injectRequestMoreStyles() {
        if (document.getElementById('je-series-request-more-styles')) return;
        const style = document.createElement('style');
        style.id = 'je-series-request-more-styles';
        style.textContent = `
            h2.sectionTitle.sectionTitle-cards.je-series-request-more-heading {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
            }
            /* These rows sit below the fold on detail pages. content-visibility
               lets the browser skip their layout/paint (and the upgrade-render
               cost of dozens of freshly appended cards) until scrolled near;
               the intrinsic-size placeholder matches one card row so nothing
               shifts when they materialize. */
            .jellyseerr-details-section {
                content-visibility: auto;
                contain-intrinsic-size: auto 21em;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Initializes the item details handler
     */
    function initialize() {
        console.debug(`${logPrefix} Initializing Recommendations and Similar sections`);
        injectRequestMoreStyles();

        if (JE.viewRouter?.onViewShow) {
            // Router-driven timing: fetches start at viewshow; rows insert at
            // the native detail render moment; the Request More button lands
            // when the seasons/children section renders. The router fires a
            // kickstart for the page the user is already on at boot.
            JE.viewRouter.onViewShow(handleViewShow, { viewTypes: ['detail'] });
            JE.viewRouter.onNativeDetailRender(handleNativeDetailRender);
            JE.viewRouter.onChildrenRender(handleChildrenRender);
            return;
        }

        // Legacy fallback when the view router is unavailable.
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

    });
})(window.JellyfinEnhanced);
