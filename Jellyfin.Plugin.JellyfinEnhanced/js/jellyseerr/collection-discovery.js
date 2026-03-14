// /js/jellyseerr/collection-discovery.js
// Shows missing collection items on BoxSet detail pages with request buttons.
// Supports TMDB collections (fixed sets) and SmartList collections (MDBList/TMDB
// sources) with infinite scroll, filter, and sort controls.
(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Collection Discovery:';
    const MODULE_NAME = 'collection';

    const processedPages = new Set();
    const boxsetInfoCache = new Map();

    // Max concurrent Seerr lookups for MDBList batch processing
    const SEERR_CONCURRENCY = 5;

    // Items per "page" when batching MDBList Seerr lookups
    const MDBLIST_BATCH_SIZE = 20;

    // Pagination state (SmartList paths)
    let isLoading = false;
    let hasMorePages = true;

    // Separate page tracking for TV and Movies (TMDB SmartList path)
    let tvCurrentPage = 1;
    let movieCurrentPage = 1;
    let tvHasMorePages = true;
    let movieHasMorePages = true;

    // Cached results for filter switching
    let cachedTvResults = [];
    let cachedMovieResults = [];

    // MDBList state: full list of missing items not yet looked up in Seerr
    let mdblistPendingItems = [];

    // Set of TMDB IDs already in the library (shared across SmartList paths)
    let existingLibraryTmdbIds = new Set();

    // Deduplicator for infinite scroll
    let itemDeduplicator = null;

    // Abort controller for cancellation
    let currentAbortController = null;

    // Track current rendering to prevent duplicate renders
    let currentRenderingPageKey = null;

    // State object for scroll observer
    const scrollState = { activeScrollObserver: null };

    // Current SmartList context for loadMore
    let currentSmartListSource = null;
    let currentBoxsetInfo = null;
    let currentItemId = null;

    // Alias for shared utilities
    const fetchWithManagedRequest = (path, options) =>
        JE.discoveryFilter.fetchWithManagedRequest(path, 'collection', options);

    /**
     * Extracts item ID from the current URL (detail page)
     * @returns {string|null} The item ID or null if not on a detail page
     */
    function getItemIdFromUrl() {
        const hash = window.location.hash;
        if (!hash.includes('/details') || !hash.includes('id=')) {
            return null;
        }
        try {
            const params = new URLSearchParams(hash.split('?')[1]);
            return params.get('id');
        } catch (error) {
            return null;
        }
    }

    /**
     * Gets BoxSet information from Jellyfin (with caching)
     * @param {string} boxsetId - Jellyfin item ID
     * @param {AbortSignal} [signal]
     * @returns {Promise<object|null>}
     */
    async function getBoxSetInfo(boxsetId, signal) {
        if (boxsetInfoCache.has(boxsetId)) {
            return boxsetInfoCache.get(boxsetId);
        }
        try {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            const response = await fetchWithManagedRequest(`/JellyfinEnhanced/boxset/${boxsetId}`, { signal });

            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            if (response) {
                boxsetInfoCache.set(boxsetId, response);
            }
            return response;
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            return null;
        }
    }

    /**
     * Checks if the current detail page is a BoxSet
     * @param {string} itemId - Jellyfin item ID
     * @param {AbortSignal} [signal]
     * @returns {Promise<boolean>}
     */
    async function isBoxSetPage(itemId, signal) {
        try {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            const item = JE.helpers?.getItemCached
                ? await JE.helpers.getItemCached(itemId)
                : await ApiClient.getItem(ApiClient.getCurrentUserId(), itemId);

            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            return item && item.Type === 'BoxSet';
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            return false;
        }
    }

    /**
     * Creates a document fragment of media cards from results using shared utility
     * @param {Array} results - Array of media result objects
     * @returns {DocumentFragment} Fragment containing rendered card elements
     */
    function createCardsFragment(results) {
        return JE.discoveryFilter.createCardsFragment(results, { cardClass: 'portraitCard' });
    }

    /**
     * Creates the section container with optional filter and sort controls
     * @param {string} title - Section heading text
     * @param {boolean} showFilter - Whether to show All/Movies/Series filter
     * @param {Function} onFilterChange - Callback when filter changes
     * @param {Function} [onSortChange] - Callback when sort changes
     * @returns {HTMLElement} The section element
     */
    function createSectionContainer(title, showFilter, onFilterChange, onSortChange) {
        const section = document.createElement('div');
        section.className = 'verticalSection jellyseerr-collection-discovery-section padded-left padded-right';
        section.setAttribute('data-jellyseerr-collection-discovery', 'true');
        section.style.cssText = 'margin-top:2em;padding-top:1em;border-top:1px solid rgba(255,255,255,0.1)';

        if (JE.discoveryFilter?.createSectionHeader) {
            const header = JE.discoveryFilter.createSectionHeader(title, MODULE_NAME, showFilter, onFilterChange, onSortChange);
            section.appendChild(header);
        } else {
            const titleElement = document.createElement('h2');
            titleElement.className = 'sectionTitle sectionTitle-cards';
            titleElement.textContent = title;
            titleElement.style.marginBottom = '1em';
            section.appendChild(titleElement);
        }

        const itemsContainer = document.createElement('div');
        itemsContainer.setAttribute('is', 'emby-itemscontainer');
        itemsContainer.className = 'vertical-wrap itemsContainer centered';
        section.appendChild(itemsContainer);

        return section;
    }

    /**
     * Wait for the page to be ready using shared utility
     * @param {AbortSignal} [signal]
     * @returns {Promise<HTMLElement|null>}
     */
    function waitForPageReady(signal) {
        return JE.discoveryFilter.waitForPageReady(signal, { type: 'detail' });
    }

    /**
     * Gets TMDB IDs of all children in a BoxSet from the Jellyfin API
     * @param {string} boxsetId - Jellyfin BoxSet item ID
     * @param {AbortSignal} [signal]
     * @returns {Promise<Set<number>>} Set of TMDB IDs
     */
    async function getBoxSetChildrenTmdbIds(boxsetId, signal) {
        const tmdbIds = new Set();
        try {
            const userId = ApiClient.getCurrentUserId();
            const result = await ApiClient.getItems(userId, {
                ParentId: boxsetId,
                Fields: 'ProviderIds',
                Recursive: true,
                IncludeItemTypes: 'Movie,Series',
                Limit: 1000
            });

            if (signal?.aborted) return tmdbIds;

            if (result?.Items) {
                for (const item of result.Items) {
                    const tmdbId = item.ProviderIds?.Tmdb;
                    if (tmdbId) {
                        tmdbIds.add(parseInt(tmdbId, 10));
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            console.error(`${logPrefix} Failed to get BoxSet children TMDB IDs:`, error);
        }
        return tmdbIds;
    }

    /**
     * Looks up a single item in Seerr to get its status and details
     * @param {number} tmdbId - TMDB ID
     * @param {string} mediaType - 'movie' or 'tv'
     * @returns {Promise<object|null>} Seerr media details or null
     */
    async function lookupItemInSeerr(tmdbId, mediaType) {
        try {
            if (mediaType === 'tv') {
                return await JE.jellyseerrAPI.fetchTvShowDetails(tmdbId);
            }
            return await JE.jellyseerrAPI.fetchMovieDetails(tmdbId);
        } catch (error) {
            console.debug(`${logPrefix} Seerr lookup failed for ${mediaType}/${tmdbId}:`, error);
            return null;
        }
    }

    /**
     * Processes items in batches with concurrency control
     * @param {Array} items - Items to process
     * @param {Function} processFn - Async function to process each item
     * @param {number} concurrency - Max concurrent operations
     * @param {AbortSignal} [signal]
     * @returns {Promise<Array>} Results array (nulls filtered out)
     */
    async function processWithConcurrency(items, processFn, concurrency, signal) {
        const results = new Array(items.length).fill(null);
        let index = 0;

        async function worker() {
            while (index < items.length) {
                if (signal?.aborted) return;
                const currentIndex = index++;
                results[currentIndex] = await processFn(items[currentIndex]);
            }
        }

        const workers = Array.from(
            { length: Math.min(concurrency, items.length) },
            () => worker()
        );
        await Promise.all(workers);
        return results.filter(Boolean);
    }

    // ── MDBList SmartList ──────────────────────────────────────────────

    /**
     * Processes the next batch of MDBList pending items through Seerr lookups.
     * Called both for initial render and infinite scroll.
     * @param {AbortSignal} [signal]
     * @returns {Promise<Array>} Array of Seerr-enriched results for this batch
     */
    async function processNextMdblistBatch(signal) {
        if (mdblistPendingItems.length === 0) return [];

        const batch = mdblistPendingItems.slice(0, MDBLIST_BATCH_SIZE);
        mdblistPendingItems = mdblistPendingItems.slice(MDBLIST_BATCH_SIZE);

        const results = await processWithConcurrency(
            batch,
            async (item) => {
                if (signal?.aborted) return null;
                const details = await lookupItemInSeerr(item.tmdbId, item.mediaType);
                if (!details) return null;

                // Filter out items already available in Seerr (status 5)
                const status = details.mediaInfo?.status || 1;
                if (status === 5) return null;

                return { ...details, mediaType: item.mediaType };
            },
            SEERR_CONCURRENCY,
            signal
        );

        return results;
    }

    /**
     * Loads more MDBList items for infinite scroll
     */
    async function loadMoreMdblistItems() {
        if (isLoading || !hasMorePages) return;
        isLoading = true;

        // Snapshot pending items before consuming so we can restore on failure
        const pendingSnapshot = mdblistPendingItems;

        try {
            const signal = currentAbortController?.signal;

            const newResults = await processNextMdblistBatch(signal);
            if (signal?.aborted) return;

            // Separate into TV and movie for filter support
            const newTv = newResults.filter(r => r.mediaType === 'tv');
            const newMovies = newResults.filter(r => r.mediaType === 'movie');
            cachedTvResults = [...cachedTvResults, ...newTv];
            cachedMovieResults = [...cachedMovieResults, ...newMovies];

            hasMorePages = mdblistPendingItems.length > 0;

            const filterMode = JE.discoveryFilter?.getFilterMode(MODULE_NAME) || 'mixed';

            // Get items to add based on filter mode
            let itemsToAdd;
            if (filterMode === 'tv') {
                itemsToAdd = newTv;
            } else if (filterMode === 'movies') {
                itemsToAdd = newMovies;
            } else {
                itemsToAdd = JE.discoveryFilter?.interleaveArrays(newTv, newMovies) ||
                             [...newTv, ...newMovies];
            }

            if (itemsToAdd.length === 0) return;

            // Deduplicate
            if (itemDeduplicator) {
                itemsToAdd = itemDeduplicator.filter(itemsToAdd);
                if (itemsToAdd.length === 0) return;
            }

            const itemsContainer = document.querySelector('.jellyseerr-collection-discovery-section .itemsContainer');
            if (itemsContainer) {
                const fragment = createCardsFragment(itemsToAdd);
                if (fragment.childNodes.length > 0) {
                    itemsContainer.appendChild(fragment);
                }
            }
        } catch (error) {
            // Restore pending items so retry can re-fetch the same batch
            mdblistPendingItems = pendingSnapshot;
            if (error.name === 'AbortError') return;
            console.error(`${logPrefix} Error loading more MDBList items:`, error);
            throw error;
        } finally {
            isLoading = false;
        }
    }

    /**
     * Handles sort change for MDBList SmartLists.
     * Re-sorts the pending items list and re-fetches from scratch.
     */
    async function handleMdblistSortChange() {
        const itemsContainer = document.querySelector('.jellyseerr-collection-discovery-section .itemsContainer');
        if (!itemsContainer) return;

        // Clear existing cards and scroll observer
        while (itemsContainer.firstChild) itemsContainer.removeChild(itemsContainer.firstChild);
        cleanupScrollObserver();

        // Reset state
        isLoading = false;
        cachedTvResults = [];
        cachedMovieResults = [];
        if (itemDeduplicator) itemDeduplicator.clear();

        // Re-fetch the external items (cached on backend) and rebuild pending list
        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        try {
            const externalData = await fetchWithManagedRequest(
                `/JellyfinEnhanced/smartlist/${currentItemId}/external-items`, { signal }
            );
            if (signal.aborted) return;

            if (!externalData?.items) return;

            // Filter out items in library
            const missingItems = externalData.items.filter(
                item => !existingLibraryTmdbIds.has(item.tmdbId)
            );

            // Apply client-side sort based on current sort mode
            const sortMode = JE.discoveryFilter?.getSortMode(MODULE_NAME) || '';
            mdblistPendingItems = sortMdblistItems(missingItems, sortMode);
            hasMorePages = mdblistPendingItems.length > 0;

            // Process first batch
            const firstBatch = await processNextMdblistBatch(signal);
            if (signal.aborted) return;

            const newTv = firstBatch.filter(r => r.mediaType === 'tv');
            const newMovies = firstBatch.filter(r => r.mediaType === 'movie');
            cachedTvResults = newTv;
            cachedMovieResults = newMovies;

            hasMorePages = mdblistPendingItems.length > 0;
            const filterMode = JE.discoveryFilter?.getFilterMode(MODULE_NAME) || 'mixed';

            let displayResults = getFilteredResults(filterMode);
            if (displayResults.length === 0 && firstBatch.length > 0) {
                displayResults = firstBatch;
            }

            if (displayResults.length > 0) {
                const fragment = createCardsFragment(displayResults);
                itemsContainer.appendChild(fragment);
                if (itemDeduplicator) {
                    displayResults.forEach(item => itemDeduplicator.add(item));
                }
            }

            JE.discoveryFilter.applyFilterVisibility(itemsContainer, filterMode);

            if (hasMorePages) {
                setupInfiniteScroll(loadMoreMdblistItems);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(`${logPrefix} MDBList sort change error:`, error);
            }
        }
    }

    /**
     * Returns a new array of MDBList items sorted by the given mode
     * @param {Array} items - Items to sort
     * @param {string} sortMode - Sort mode value
     * @returns {Array} New sorted array
     */
    function sortMdblistItems(items, sortMode) {
        const sorted = [...items];
        switch (sortMode) {
            case 'release_date.desc':
                sorted.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
                break;
            case 'release_date.asc':
                sorted.sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
                break;
            case 'vote_average.desc':
                // MDBList rank is already a quality ordering; sort by it ascending
                // (rank 1 = best). For "Top Rated" we reverse rank order.
                sorted.sort((a, b) => (a.rank || 0) - (b.rank || 0));
                break;
            default:
                // Popular (default) — preserve MDBList rank order
                sorted.sort((a, b) => (a.rank || 0) - (b.rank || 0));
                break;
        }
        return sorted;
    }

    /**
     * Renders the SmartList discovery section for MDBList sources
     * @param {object} boxsetInfo - BoxSet info from the backend
     * @param {string} itemId - BoxSet Jellyfin item ID
     * @param {AbortSignal} signal
     * @param {Promise<HTMLElement|null>} pageReadyPromise
     * @returns {Promise<void>}
     */
    async function renderMdblistSmartList(boxsetInfo, itemId, signal, pageReadyPromise) {
        currentSmartListSource = 'mdblist';
        currentBoxsetInfo = boxsetInfo;
        currentItemId = itemId;

        // Fetch external items and BoxSet children in parallel
        const [externalData, existingTmdbIds] = await Promise.all([
            fetchWithManagedRequest(`/JellyfinEnhanced/smartlist/${itemId}/external-items`, { signal }),
            getBoxSetChildrenTmdbIds(itemId, signal)
        ]);

        if (signal.aborted) return;

        if (!externalData?.items || externalData.items.length === 0) {
            console.debug(`${logPrefix} No external items found for SmartList ${boxsetInfo.name}`);
            return;
        }

        // Store existing IDs for sort-change re-filtering
        existingLibraryTmdbIds = existingTmdbIds;

        // Filter out items already in the library
        const missingItems = externalData.items.filter(
            item => !existingTmdbIds.has(item.tmdbId)
        );

        if (missingItems.length === 0) {
            console.debug(`${logPrefix} All items from SmartList ${boxsetInfo.name} are in library`);
            return;
        }

        // Reset sort/filter to defaults for this section
        JE.discoveryFilter?.resetFilterMode?.(MODULE_NAME);
        JE.discoveryFilter?.resetSortMode?.(MODULE_NAME);

        // Store pending items sorted by default MDBList rank order
        mdblistPendingItems = sortMdblistItems(missingItems, '');

        // Initialize deduplicator
        itemDeduplicator = JE.seamlessScroll?.createDeduplicator() || null;

        // Process first batch through Seerr
        const firstBatch = await processNextMdblistBatch(signal);
        if (signal.aborted) return;

        // Separate into TV and movie
        cachedTvResults = firstBatch.filter(r => r.mediaType === 'tv');
        cachedMovieResults = firstBatch.filter(r => r.mediaType === 'movie');
        hasMorePages = mdblistPendingItems.length > 0;

        // Determine if we have both types
        const hasBoth = JE.discoveryFilter?.hasBothTypes(cachedTvResults, cachedMovieResults) || false;
        const filterMode = JE.discoveryFilter?.getFilterMode(MODULE_NAME) || 'mixed';

        let displayResults = getFilteredResults(filterMode);
        if (displayResults.length === 0 && firstBatch.length > 0) {
            displayResults = firstBatch;
        }

        if (displayResults.length === 0) {
            console.debug(`${logPrefix} No non-available items from SmartList ${boxsetInfo.name}`);
            return;
        }

        // Wait for page DOM
        const detailSection = await pageReadyPromise;
        if (signal.aborted) return;
        if (!detailSection) {
            console.debug(`${logPrefix} Could not find detail section to insert into`);
            return;
        }

        // Remove existing section
        const existing = document.querySelector('.jellyseerr-collection-discovery-section');
        if (existing) existing.remove();

        // Build section
        const totalExternal = externalData.totalItems;
        const inLibraryCount = existingTmdbIds.size;
        const sectionTitle = `Missing from ${boxsetInfo.name} (${inLibraryCount}/${totalExternal})`;

        const section = createSectionContainer(sectionTitle, hasBoth, handleFilterChange, handleMdblistSortChange);
        const itemsContainer = section.querySelector('.itemsContainer');

        const fragment = createCardsFragment(displayResults);
        if (fragment.childNodes.length === 0) return;

        itemsContainer.appendChild(fragment);

        // Seed deduplicator
        if (itemDeduplicator) {
            displayResults.forEach(item => itemDeduplicator.add(item));
        }

        detailSection.appendChild(section);

        if (hasMorePages) {
            setupInfiniteScroll(loadMoreMdblistItems);
        }

        console.debug(`${logPrefix} SmartList (MDBList) section added with ${displayResults.length} items, ${mdblistPendingItems.length} pending`);
    }

    // ── TMDB SmartList ─────────────────────────────────────────────────

    /**
     * Fetches TV discover results for TMDB SmartList
     * @param {number} page
     * @param {AbortSignal} [signal]
     * @returns {Promise<{results: Array, totalPages: number}>}
     */
    async function fetchTmdbDiscoverTv(page, signal) {
        try {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            const sortBy = JE.discoveryFilter?.getTvSortMode(MODULE_NAME) || '';
            let path = `/JellyfinEnhanced/jellyseerr/discover/tv?page=${page}`;
            if (sortBy) path += `&sortBy=${encodeURIComponent(sortBy)}`;
            const response = await fetchWithManagedRequest(path, { signal });
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            return response || { results: [], totalPages: 1 };
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            return { results: [], totalPages: 1 };
        }
    }

    /**
     * Fetches Movie discover results for TMDB SmartList
     * @param {number} page
     * @param {AbortSignal} [signal]
     * @returns {Promise<{results: Array, totalPages: number}>}
     */
    async function fetchTmdbDiscoverMovies(page, signal) {
        try {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            const sortBy = JE.discoveryFilter?.getSortMode(MODULE_NAME) || '';
            let path = `/JellyfinEnhanced/jellyseerr/discover/movies?page=${page}`;
            if (sortBy) path += `&sortBy=${encodeURIComponent(sortBy)}`;
            const response = await fetchWithManagedRequest(path, { signal });
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            return response || { results: [], totalPages: 1 };
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            return { results: [], totalPages: 1 };
        }
    }

    /**
     * Filters discover results to exclude items already in the library
     * @param {Array} results - Seerr discover results
     * @param {string} mediaType - 'tv' or 'movie'
     * @returns {Array} Filtered results with mediaType set
     */
    function filterDiscoverResults(results, mediaType) {
        return results
            .filter(item => {
                if (!item.id || existingLibraryTmdbIds.has(item.id)) return false;
                const status = item.mediaInfo?.status || 1;
                return status !== 5;
            })
            .map(item => ({ ...item, mediaType }));
    }

    /**
     * Loads more items for TMDB SmartList infinite scroll
     */
    async function loadMoreTmdbItems() {
        if (isLoading || !hasMorePages) return;

        const filterMode = JE.discoveryFilter?.getFilterMode(MODULE_NAME) || 'mixed';
        isLoading = true;

        const prevTvPage = tvCurrentPage;
        const prevMoviePage = movieCurrentPage;
        const discoverType = currentBoxsetInfo?.smartListMediaType || 'tv';

        try {
            const signal = currentAbortController?.signal;
            const promises = [];

            const needTv = (discoverType === 'tv' || filterMode === 'mixed' || filterMode === 'tv') &&
                           tvHasMorePages && discoverType !== 'movie';
            const needMovies = (discoverType === 'movie' || filterMode === 'mixed' || filterMode === 'movies') &&
                               movieHasMorePages && discoverType !== 'tv';

            if (needTv) {
                tvCurrentPage++;
                promises.push(
                    fetchTmdbDiscoverTv(tvCurrentPage, signal).then(r => ({ type: 'tv', data: r }))
                );
            }
            if (needMovies) {
                movieCurrentPage++;
                promises.push(
                    fetchTmdbDiscoverMovies(movieCurrentPage, signal).then(r => ({ type: 'movie', data: r }))
                );
            }

            if (promises.length === 0) {
                hasMorePages = false;
                return;
            }

            const results = await Promise.all(promises);
            if (signal?.aborted) return;

            let newTvResults = [];
            let newMovieResults = [];

            results.forEach(r => {
                if (r.type === 'tv') {
                    const filtered = filterDiscoverResults(r.data.results || [], 'tv');
                    newTvResults = filtered;
                    tvHasMorePages = tvCurrentPage < (r.data.totalPages || 1);
                    cachedTvResults = [...cachedTvResults, ...filtered];
                } else {
                    const filtered = filterDiscoverResults(r.data.results || [], 'movie');
                    newMovieResults = filtered;
                    movieHasMorePages = movieCurrentPage < (r.data.totalPages || 1);
                    cachedMovieResults = [...cachedMovieResults, ...filtered];
                }
            });

            updateHasMorePages(filterMode);

            let itemsToAdd;
            if (filterMode === 'tv') {
                itemsToAdd = newTvResults;
            } else if (filterMode === 'movies') {
                itemsToAdd = newMovieResults;
            } else {
                itemsToAdd = JE.discoveryFilter?.interleaveArrays(newTvResults, newMovieResults) ||
                             [...newTvResults, ...newMovieResults];
            }

            if (itemsToAdd.length === 0) return;

            if (itemDeduplicator) {
                itemsToAdd = itemDeduplicator.filter(itemsToAdd);
                if (itemsToAdd.length === 0) return;
            }

            const itemsContainer = document.querySelector('.jellyseerr-collection-discovery-section .itemsContainer');
            if (itemsContainer) {
                const fragment = createCardsFragment(itemsToAdd);
                if (fragment.childNodes.length > 0) {
                    itemsContainer.appendChild(fragment);
                }
            }
        } catch (error) {
            tvCurrentPage = prevTvPage;
            movieCurrentPage = prevMoviePage;
            if (error.name === 'AbortError') return;
            console.error(`${logPrefix} Error loading more TMDB items:`, error);
            throw error;
        } finally {
            isLoading = false;
        }
    }

    /**
     * Handles sort change for TMDB SmartLists
     */
    async function handleTmdbSortChange() {
        const itemsContainer = document.querySelector('.jellyseerr-collection-discovery-section .itemsContainer');
        if (!itemsContainer) return;

        while (itemsContainer.firstChild) itemsContainer.removeChild(itemsContainer.firstChild);
        cleanupScrollObserver();

        tvCurrentPage = 1;
        movieCurrentPage = 1;
        tvHasMorePages = true;
        movieHasMorePages = true;
        isLoading = false;
        cachedTvResults = [];
        cachedMovieResults = [];
        if (itemDeduplicator) itemDeduplicator.clear();

        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        const filterMode = JE.discoveryFilter?.getFilterMode(MODULE_NAME) || 'mixed';
        const discoverType = currentBoxsetInfo?.smartListMediaType || 'tv';

        const fetchPromises = [];
        if (discoverType !== 'movie') {
            fetchPromises.push(
                fetchTmdbDiscoverTv(1, signal).then(r => ({ type: 'tv', data: r }))
            );
        }
        if (discoverType !== 'tv') {
            fetchPromises.push(
                fetchTmdbDiscoverMovies(1, signal).then(r => ({ type: 'movie', data: r }))
            );
        }

        try {
            const results = await Promise.all(fetchPromises);
            if (signal.aborted) return;

            results.forEach(r => {
                if (r.type === 'tv') {
                    cachedTvResults = filterDiscoverResults(r.data.results || [], 'tv');
                    tvHasMorePages = 1 < (r.data.totalPages || 1);
                } else {
                    cachedMovieResults = filterDiscoverResults(r.data.results || [], 'movie');
                    movieHasMorePages = 1 < (r.data.totalPages || 1);
                }
            });

            updateHasMorePages(filterMode);

            let displayResults = getFilteredResults(filterMode);
            if (displayResults.length === 0 && (cachedTvResults.length > 0 || cachedMovieResults.length > 0)) {
                displayResults = [...cachedTvResults, ...cachedMovieResults];
            }

            if (displayResults.length > 0) {
                const fragment = createCardsFragment(displayResults);
                itemsContainer.appendChild(fragment);
                if (itemDeduplicator) {
                    displayResults.forEach(item => itemDeduplicator.add(item));
                }
            }

            JE.discoveryFilter.applyFilterVisibility(itemsContainer, filterMode);

            if (hasMorePages) {
                setupInfiniteScroll(loadMoreTmdbItems);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(`${logPrefix} TMDB sort change error:`, error);
            }
        }
    }

    /**
     * Renders the SmartList discovery section for TMDB sources
     * @param {object} boxsetInfo - BoxSet info from the backend
     * @param {string} itemId - BoxSet Jellyfin item ID
     * @param {AbortSignal} signal
     * @param {Promise<HTMLElement|null>} pageReadyPromise
     * @returns {Promise<void>}
     */
    async function renderTmdbSmartList(boxsetInfo, itemId, signal, pageReadyPromise) {
        currentSmartListSource = 'tmdb';
        currentBoxsetInfo = boxsetInfo;
        currentItemId = itemId;

        const discoverType = boxsetInfo.smartListMediaType || 'tv';

        // Get existing TMDB IDs from BoxSet children
        // (reuse existingLibraryTmdbIds for the filterDiscoverResults function)
        existingLibraryTmdbIds = await getBoxSetChildrenTmdbIds(itemId, signal);
        if (signal.aborted) return;

        // Reset pagination state
        tvCurrentPage = 1;
        movieCurrentPage = 1;
        tvHasMorePages = true;
        movieHasMorePages = true;
        isLoading = false;
        hasMorePages = true;
        cachedTvResults = [];
        cachedMovieResults = [];

        JE.discoveryFilter?.resetFilterMode?.(MODULE_NAME);
        JE.discoveryFilter?.resetSortMode?.(MODULE_NAME);

        itemDeduplicator = JE.seamlessScroll?.createDeduplicator() || null;

        // Fetch initial page(s)
        const fetchPromises = [];
        if (discoverType !== 'movie') {
            fetchPromises.push(
                fetchTmdbDiscoverTv(1, signal).then(r => ({ type: 'tv', data: r }))
            );
        }
        if (discoverType !== 'tv') {
            fetchPromises.push(
                fetchTmdbDiscoverMovies(1, signal).then(r => ({ type: 'movie', data: r }))
            );
        }

        const [fetchResults, detailSection] = await Promise.all([
            Promise.all(fetchPromises),
            pageReadyPromise
        ]);
        if (signal.aborted) return;

        fetchResults.forEach(r => {
            if (r.type === 'tv') {
                cachedTvResults = filterDiscoverResults(r.data.results || [], 'tv');
                tvHasMorePages = 1 < (r.data.totalPages || 1);
            } else {
                cachedMovieResults = filterDiscoverResults(r.data.results || [], 'movie');
                movieHasMorePages = 1 < (r.data.totalPages || 1);
            }
        });

        const hasBoth = JE.discoveryFilter?.hasBothTypes(cachedTvResults, cachedMovieResults) || false;
        const filterMode = JE.discoveryFilter?.getFilterMode(MODULE_NAME) || 'mixed';
        updateHasMorePages(filterMode);

        let displayResults = getFilteredResults(filterMode);
        if (displayResults.length === 0 && (cachedTvResults.length > 0 || cachedMovieResults.length > 0)) {
            displayResults = [...cachedTvResults, ...cachedMovieResults];
        }

        if (displayResults.length === 0) {
            console.debug(`${logPrefix} No missing TMDB discover items for SmartList ${boxsetInfo.name}`);
            return;
        }

        if (!detailSection) return;

        const existing = document.querySelector('.jellyseerr-collection-discovery-section');
        if (existing) existing.remove();

        const inLibraryCount = existingLibraryTmdbIds.size;
        const sectionTitle = `Missing from ${boxsetInfo.name} (${inLibraryCount} in library)`;

        const section = createSectionContainer(sectionTitle, hasBoth, handleFilterChange, handleTmdbSortChange);
        const itemsContainer = section.querySelector('.itemsContainer');

        const fragment = createCardsFragment(displayResults);
        if (fragment.childNodes.length === 0) return;

        itemsContainer.appendChild(fragment);

        if (itemDeduplicator) {
            displayResults.forEach(item => itemDeduplicator.add(item));
        }

        detailSection.appendChild(section);

        if (hasMorePages) {
            setupInfiniteScroll(loadMoreTmdbItems);
        }

        console.debug(`${logPrefix} TMDB SmartList section added with ${displayResults.length} items from ${boxsetInfo.name}`);
    }

    // ── TMDB Collection (existing, unchanged) ──────────────────────────

    /**
     * Renders the existing TMDB collection discovery section.
     * These are fixed, small sets — no pagination, sort, or filter needed.
     * @param {object} boxsetInfo - BoxSet info from the backend
     * @param {AbortSignal} signal
     * @param {Promise<HTMLElement|null>} pageReadyPromise
     * @returns {Promise<void>}
     */
    async function renderTmdbCollection(boxsetInfo, signal, pageReadyPromise) {
        const tmdbCollectionId = parseInt(boxsetInfo.tmdbId, 10);
        if (!tmdbCollectionId) return;

        const collectionDetails = await JE.jellyseerrAPI.fetchCollectionDetails(tmdbCollectionId);
        if (signal.aborted) return;

        if (!collectionDetails?.parts || collectionDetails.parts.length === 0) {
            console.debug(`${logPrefix} No parts found in collection ${tmdbCollectionId}`);
            return;
        }

        // Filter to missing movies (status !== 5)
        const missingMovies = collectionDetails.parts
            .map(movie => ({ ...movie, mediaType: movie.mediaType || 'movie' }))
            .filter(movie => (movie.mediaInfo?.status || 1) !== 5);

        missingMovies.sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''));

        if (missingMovies.length === 0) {
            console.debug(`${logPrefix} All movies in collection ${boxsetInfo.name} are available`);
            return;
        }

        const detailSection = await pageReadyPromise;
        if (signal.aborted) return;
        if (!detailSection) return;

        const existing = document.querySelector('.jellyseerr-collection-discovery-section');
        if (existing) existing.remove();

        const totalInCollection = collectionDetails.parts.length;
        const availableCount = totalInCollection - missingMovies.length;
        const sectionTitle = `Missing from ${boxsetInfo.name} (${availableCount}/${totalInCollection})`;

        // TMDB collections are small fixed sets — use simple container, no scroll/sort/filter
        const section = document.createElement('div');
        section.className = 'verticalSection jellyseerr-collection-discovery-section';
        section.setAttribute('data-jellyseerr-collection-discovery', 'true');
        section.style.cssText = 'margin-top:2em;padding-top:1em;border-top:1px solid rgba(255,255,255,0.1)';

        const titleElement = document.createElement('h2');
        titleElement.className = 'sectionTitle sectionTitle-cards padded-left';
        titleElement.textContent = sectionTitle;
        titleElement.style.marginBottom = '0.5em';
        section.appendChild(titleElement);

        const itemsContainer = document.createElement('div');
        itemsContainer.setAttribute('is', 'emby-itemscontainer');
        itemsContainer.className = 'itemsContainer padded-right vertical-wrap';
        section.appendChild(itemsContainer);

        const fragment = JE.discoveryFilter.createCardsFragment(missingMovies, { cardClass: 'overflowPortraitCard' });
        if (fragment.childNodes.length === 0) return;

        itemsContainer.appendChild(fragment);
        detailSection.appendChild(section);
        console.debug(`${logPrefix} Section added with ${missingMovies.length} missing movies from ${boxsetInfo.name}`);
    }

    // ── Shared helpers ─────────────────────────────────────────────────

    /**
     * Gets filtered/interleaved results based on current filter mode
     * @param {string} mode - 'mixed', 'movies', or 'tv'
     * @returns {Array}
     */
    function getFilteredResults(mode) {
        const filter = JE.discoveryFilter;
        if (!filter) return [...cachedTvResults, ...cachedMovieResults];

        if (mode === filter.MODES.MOVIES) return cachedMovieResults;
        if (mode === filter.MODES.TV) return cachedTvResults;
        return filter.interleaveArrays(cachedTvResults, cachedMovieResults);
    }

    /**
     * Updates hasMorePages based on current filter mode
     * @param {string} mode
     */
    function updateHasMorePages(mode) {
        const filter = JE.discoveryFilter;
        if (!filter) {
            hasMorePages = tvHasMorePages || movieHasMorePages;
            return;
        }

        if (currentSmartListSource === 'mdblist') {
            hasMorePages = mdblistPendingItems.length > 0;
            return;
        }

        if (mode === filter.MODES.TV) {
            hasMorePages = tvHasMorePages;
        } else if (mode === filter.MODES.MOVIES) {
            hasMorePages = movieHasMorePages;
        } else {
            hasMorePages = tvHasMorePages || movieHasMorePages;
        }
    }

    /**
     * Re-renders the section with the new filter mode (CSS-based, no refetch)
     * @param {string} newMode
     */
    function handleFilterChange(newMode) {
        const itemsContainer = document.querySelector('.jellyseerr-collection-discovery-section .itemsContainer');
        if (!itemsContainer) return;

        JE.discoveryFilter.applyFilterVisibility(itemsContainer, newMode);
        updateHasMorePages(newMode);

        if (hasMorePages) {
            const loadMoreFn = currentSmartListSource === 'mdblist'
                ? loadMoreMdblistItems
                : loadMoreTmdbItems;
            setupInfiniteScroll(loadMoreFn);
        }
    }

    /**
     * Sets up infinite scroll observer using shared utility
     * @param {Function} loadMoreFn - Function to call for loading more items
     */
    function setupInfiniteScroll(loadMoreFn) {
        JE.discoveryFilter.setupInfiniteScroll(
            scrollState,
            '.jellyseerr-collection-discovery-section',
            loadMoreFn,
            () => hasMorePages,
            () => isLoading
        );
    }

    /**
     * Cleanup scroll observer using shared utility
     */
    function cleanupScrollObserver() {
        JE.discoveryFilter.cleanupScrollObserver(scrollState);
    }

    // ── Main render & lifecycle ────────────────────────────────────────

    /**
     * Main function to render the collection discovery section
     * @returns {Promise<void>}
     */
    async function renderCollectionDiscovery() {
        const itemId = getItemIdFromUrl();
        if (!itemId) return;

        const pageKey = `collection-${itemId}-${window.location.hash}`;
        if (processedPages.has(pageKey)) return;
        if (currentRenderingPageKey === pageKey) return;
        if (JE.pluginConfig?.JellyseerrShowCollectionDiscovery === false) return;

        currentRenderingPageKey = pageKey;

        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        if (JE.requestManager?.metrics?.enabled) {
            JE.requestManager.startMeasurement('collection-discovery');
        }

        try {
            const isBoxSet = await isBoxSetPage(itemId, signal);
            if (signal.aborted) return;
            if (!isBoxSet) return;

            const boxsetInfoPromise = getBoxSetInfo(itemId, signal);
            const statusPromise = JE.jellyseerrAPI?.checkUserStatus();
            const pageReadyPromise = waitForPageReady(signal);

            const [boxsetInfo, status] = await Promise.all([boxsetInfoPromise, statusPromise]);
            if (signal.aborted) return;
            if (!status?.active) return;

            if (boxsetInfo?.tmdbId) {
                await renderTmdbCollection(boxsetInfo, signal, pageReadyPromise);
            } else if (boxsetInfo?.smartListSource && boxsetInfo.smartListSource !== 'unsupported') {
                console.debug(`${logPrefix} SmartList detected: source=${boxsetInfo.smartListSource}, url=${boxsetInfo.smartListExternalUrl}`);
                if (boxsetInfo.smartListSource === 'mdblist' || boxsetInfo.smartListSource === 'imdb') {
                    await renderMdblistSmartList(boxsetInfo, itemId, signal, pageReadyPromise);
                } else if (boxsetInfo.smartListSource === 'tmdb') {
                    await renderTmdbSmartList(boxsetInfo, itemId, signal, pageReadyPromise);
                }
            } else {
                console.debug(`${logPrefix} No TMDB collection ID or SmartList source for BoxSet ${itemId}`);
                return;
            }

            processedPages.add(pageKey);

            if (JE.requestManager?.metrics?.enabled) {
                JE.requestManager.endMeasurement('collection-discovery');
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.debug(`${logPrefix} Request aborted`);
                return;
            }
            console.error(`${logPrefix} Error rendering collection discovery:`, error);
        } finally {
            currentRenderingPageKey = null;
        }
    }

    /**
     * Cleanup function — aborts in-flight requests and resets all state
     * @returns {void}
     */
    function cleanup() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        cleanupScrollObserver();
        processedPages.clear();
        boxsetInfoCache.clear();
        currentRenderingPageKey = null;

        // Reset pagination
        tvCurrentPage = 1;
        movieCurrentPage = 1;
        isLoading = false;
        hasMorePages = true;
        tvHasMorePages = true;
        movieHasMorePages = true;

        // Clear cached results
        cachedTvResults = [];
        cachedMovieResults = [];
        mdblistPendingItems = [];
        existingLibraryTmdbIds = new Set();

        // Clear SmartList context
        currentSmartListSource = null;
        currentBoxsetInfo = null;
        currentItemId = null;

        // Clear deduplicator
        if (itemDeduplicator) itemDeduplicator.clear();
        itemDeduplicator = null;

        JE.discoveryFilter?.resetFilterMode?.(MODULE_NAME);
        JE.discoveryFilter?.resetSortMode?.(MODULE_NAME);
    }

    /**
     * Handles page navigation — triggers render if on a detail page
     * @returns {void}
     */
    function handlePageNavigation() {
        const itemId = getItemIdFromUrl();
        if (itemId) {
            requestAnimationFrame(() => renderCollectionDiscovery());
        }
    }

    /**
     * Initialize event listeners for collection discovery
     * @returns {void}
     */
    function initialize() {
        window.addEventListener('hashchange', () => {
            cleanup();
            handlePageNavigation();
        });

        handlePageNavigation();
        document.addEventListener('viewshow', handlePageNavigation);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})(window.JellyfinEnhanced);
