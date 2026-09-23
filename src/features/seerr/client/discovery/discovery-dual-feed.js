// @ts-check
// Dual-feed discovery pagination: retry, sort generations, batching and prefetch.
(function(JE) {
    'use strict';

    /**
     * Genre/tag/network discovery: independently paged TV and movie feeds.
     * The lifecycle passes { spec, view, requests, complete, logPrefix }.
     * `requests` owns cancellation; this controller owns feed counters, cached
     * results, scroll subscriptions and load generations. Call cleanup after
     * aborting its signal. Only a successfully attached section calls complete.
     */
    function create({ spec, view, requests, complete, logPrefix }) {
        const key = spec.key;
        const { sectionSelector, createCardsFragment, createSectionContainer,
            waitForPageReady, keepAttached } = view;
        const scrollState = { activeScrollObserver: null };
        let isLoading = false;
        let hasMorePages = true;
        // dual-feed: separate page tracking for TV and Movies
        let tvCurrentPage = 1;
        let movieCurrentPage = 1;
        let tvHasMorePages = true;
        let movieHasMorePages = true;
        // Page counts reported by the feeds (Infinity until the first page answers).
        let tvTotalPages = Infinity;
        let movieTotalPages = Infinity;
        // Items fetched vs cards actually rendered (after library/hidden/dedup
        // filtering). Drives how many pages a load fetches in parallel.
        const yieldStats = { fetched: 0, rendered: 0 };
        // Upper bound on pages fetched per feed in one load; a run of batches
        // that render nothing (all filtered) doubles the batch up to the
        // escalated cap so a heavily-hidden stretch is crossed in few round trips.
        const MAX_PAGES_PER_FEED = 4;
        const MAX_PAGES_PER_FEED_ESCALATED = 8;
        // Prefetch per feed stays below the shared 8-slot request pool so a
        // demand batch never queues behind a wave of prefetches.
        const MAX_PREFETCH_PER_FEED = 3;
        // Bumped on every sort / filter change and cleanup: a batch that started
        // under an older generation must not write counters or flags.
        let loadGeneration = 0;
        // isLoading is owned by whichever load set it last; a stale load's
        // finally must not release a newer owner's flag.
        let loadingOwner = 0;
        const takeLoading = () => { isLoading = true; return ++loadingOwner; };
        const releaseLoading = (owner) => { if (loadingOwner === owner) isLoading = false; };
        // TMDB refuses discover pages beyond 500 (Seerr answers HTTP 500) even
        // though it reports totalPages in the thousands; never ask for them.
        const TMDB_MAX_PAGE = 500;
        /** @param {any} totalPages */
        const clampPages = (totalPages) => Math.min(Number(totalPages) || 1, TMDB_MAX_PAGE);
        let lastBatchPages = 0;
        let lastBatchRendered = -1;
        /** @type {{tvId: (number|null), movieId: (number|null)}|null} */
        let currentFeeds = null;
        /** @type {Array<any>} */
        let cachedTvResults = [];
        /** @type {Array<any>} */
        let cachedMovieResults = [];
        /** @type {{add: Function, filter: Function, clear: Function}|null} */
        let itemDeduplicator = null;

        const fetchWithManagedRequest = (path, options) =>
            JE.discoveryFilter.fetchWithManagedRequest(path, key, options);

        function resetBatchStatistics() {
            yieldStats.fetched = 0;
            yieldStats.rendered = 0;
            lastBatchPages = 0;
            lastBatchRendered = -1;
        }

        function resetFeedPages() {
            tvCurrentPage = 1;
            movieCurrentPage = 1;
            tvHasMorePages = true;
            movieHasMorePages = true;
            tvTotalPages = Infinity;
            movieTotalPages = Infinity;
            resetBatchStatistics();
        }

        /** Start both feeds together; a single unavailable feed stays retryable. */
        function fetchFirstPages(signal) {
            const pending = [];
            for (const type of ['tv', 'movie']) {
                const id = currentFeeds[`${type}Id`];
                if (id) pending.push(fetchFeedPage(type, id, 1, signal, true)
                    .then(data => ({ type, data })));
            }
            return pending;
        }

        function acceptInitialPages(results) {
            let anyFailed = false;
            results.forEach(r => {
                if (r.type === 'tv') {
                    cachedTvResults = r.data.results || [];
                    if (r.data.failed) { anyFailed = true; tvCurrentPage = 0; tvHasMorePages = true; }
                    else { tvTotalPages = clampPages(r.data.totalPages); tvHasMorePages = 1 < tvTotalPages; }
                } else {
                    cachedMovieResults = r.data.results || [];
                    if (r.data.failed) { anyFailed = true; movieCurrentPage = 0; movieHasMorePages = true; }
                    else { movieTotalPages = clampPages(r.data.totalPages); movieHasMorePages = 1 < movieTotalPages; }
                }
            });
            return anyFailed;
        }

        async function fetchFeedPage(kind, feedId, page = 1, signal, tolerant = false) {
            try {
                if (signal?.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }
                const sortBy = kind === 'tv'
                    ? (JE.discoveryFilter?.getTvSortMode(key) || '')
                    : (JE.discoveryFilter?.getSortMode(key) || '');
                let path = `${spec.buildDiscoverPath(kind, feedId)}?page=${page}`;
                if (sortBy) path += `&sortBy=${encodeURIComponent(sortBy)}`;
                const response = await fetchWithManagedRequest(path, { signal });
                if (signal?.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }
                return response || { results: [], totalPages: 1 };
            } catch (error) {
                if (error.name === 'AbortError' || !tolerant) throw error;
                // Mark the failure: the caller keeps the feed open so the scroll
                // engine re-fetches page 1 with retries instead of ending the feed.
                return { results: [], totalPages: 1, failed: true };
            }
        }

        function pageRange(start, count, total) {
            const pages = [];
            for (let p = start; p < start + count && p <= total; p++) pages.push(p);
            return pages;
        }

        function estimateYield() {
            if (yieldStats.fetched < 20) return 0.8;
            return Math.min(1, Math.max(0.05, yieldStats.rendered / yieldStats.fetched));
        }

        function prefetchAhead(filterMode, pagesPerFeed, signal) {
            if (!currentFeeds) return;
            const count = Math.max(1, Math.min(MAX_PREFETCH_PER_FEED, pagesPerFeed));
            if (currentFeeds.tvId && (filterMode === 'mixed' || filterMode === 'tv') && tvHasMorePages) {
                pageRange(tvCurrentPage + 1, count, tvTotalPages)
                    .forEach(p => fetchFeedPage('tv', currentFeeds.tvId, p, signal).catch(() => {}));
            }
            if (currentFeeds.movieId && (filterMode === 'mixed' || filterMode === 'movies') && movieHasMorePages) {
                pageRange(movieCurrentPage + 1, count, movieTotalPages)
                    .forEach(p => fetchFeedPage('movie', currentFeeds.movieId, p, signal).catch(() => {}));
            }
        }

        function getFilteredResults(mode) {
            const filter = JE.discoveryFilter;

            if (!filter) {
                // Fallback if utility not loaded
                return [...cachedTvResults, ...cachedMovieResults];
            }
            if (mode === filter.MODES.MOVIES) {
                return cachedMovieResults;
            }
            if (mode === filter.MODES.TV) {
                return cachedTvResults;
            }
            // Mixed mode - interleave
            return filter.interleaveArrays(cachedTvResults, cachedMovieResults);
        }

        function updateHasMorePages(mode) {
            const filter = JE.discoveryFilter;
            if (!filter) {
                hasMorePages = tvHasMorePages || movieHasMorePages;
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

        async function loadMoreItems(hint) {

            if (isLoading || !hasMorePages || !currentFeeds || (!currentFeeds.tvId && !currentFeeds.movieId)) {
                return;
            }

            const filterMode = JE.discoveryFilter?.getFilterMode(key) || 'mixed';
            const generation = loadGeneration;
            const owner = takeLoading();

            // Track page state before increment so we can roll back on failure
            const prevTvPage = tvCurrentPage;
            const prevMoviePage = movieCurrentPage;

            try {
                const signal = requests.signal();
                const itemsContainer = /** @type {HTMLElement|null} */ (
                    document.querySelector(`${sectionSelector} .itemsContainer`));

                // Determine which endpoints to fetch based on filter mode and available IDs
                const needTv = !!currentFeeds.tvId && (filterMode === 'mixed' || filterMode === 'tv') && tvHasMorePages;
                let needMovies = !!currentFeeds.movieId && (filterMode === 'mixed' || filterMode === 'movies') && movieHasMorePages;
                // With less budget left than feeds, fetch one feed only so the
                // empty-page valve is exact rather than overrun by a page.
                const pageBudget = Number.isFinite(hint?.pageBudget) ? Math.max(0, hint.pageBudget) : Infinity;
                if (needTv && needMovies && pageBudget < 2) needMovies = false;
                const feedCount = (needTv ? 1 : 0) + (needMovies ? 1 : 0);
                if (feedCount === 0) {
                    hasMorePages = false;
                    return;
                }

                // Size the batch from the buffer deficit and the observed yield:
                // a heavily filtered feed (library items, hidden content, single
                // media type) needs more pages per load to render the same rows.
                const wantCards = JE.seamlessScroll?.cardsNeeded?.(itemsContainer, hint, 40) || 40;
                const expectedPerPage = Math.max(1, 20 * feedCount * estimateYield());
                let pagesPerFeed = Math.min(MAX_PAGES_PER_FEED, Math.max(1, Math.ceil(wantCards / expectedPerPage)));
                if (lastBatchRendered === 0 && lastBatchPages > 0) {
                    // Everything in the last batch was filtered out: jump to a full
                    // batch at once, then double, so a hidden stretch costs at most
                    // a couple of round trips.
                    pagesPerFeed = Math.min(MAX_PAGES_PER_FEED_ESCALATED, Math.max(pagesPerFeed, MAX_PAGES_PER_FEED, lastBatchPages * 2));
                }
                // Never plan more pages than the scroll engine's empty-page budget allows.
                pagesPerFeed = Math.max(1, Math.min(pagesPerFeed, Math.floor(pageBudget / feedCount)));
                console.debug(`${logPrefix} load: deficit=${Math.round(hint?.deficitPx || 0)}px want=${wantCards} yield=${estimateYield().toFixed(2)} pagesPerFeed=${pagesPerFeed} budget=${pageBudget}`);

                const tvPages = needTv ? pageRange(tvCurrentPage + 1, pagesPerFeed, tvTotalPages) : [];
                const moviePages = needMovies ? pageRange(movieCurrentPage + 1, pagesPerFeed, movieTotalPages) : [];
                if (tvPages.length === 0 && moviePages.length === 0) {
                    tvHasMorePages = tvHasMorePages && tvCurrentPage < tvTotalPages;
                    movieHasMorePages = movieHasMorePages && movieCurrentPage < movieTotalPages;
                    updateHasMorePages(filterMode);
                    return { pages: 0, rendered: 0 };
                }
                const pagesFetched = tvPages.length + moviePages.length;

                const [tvSettled, movieSettled] = await Promise.all([
                    Promise.allSettled(tvPages.map(p => fetchFeedPage('tv', /** @type {number} */ (currentFeeds.tvId), p, signal))),
                    Promise.allSettled(moviePages.map(p => fetchFeedPage('movie', /** @type {number} */ (currentFeeds.movieId), p, signal)))
                ]);

                if (signal?.aborted) return;
                // Sort / filter changed while this batch was in flight: its pages are
                // cached for the new generation to reuse, but its bookkeeping is stale.
                if (generation !== loadGeneration) return;

                // Commit each feed's pages in order up to its first failure: a flaky
                // upstream (Seerr's TMDB call failing for one page) must not throw
                // away the pages that did arrive. The counters stop before the failed
                // page, so the next fill re-fetches from there.
                const newTvResults = [];
                const newMovieResults = [];
                let firstError = null;
                let committedPages = 0;

                const commit = (settled, pages, onPage) => {
                    for (let i = 0; i < settled.length; i++) {
                        const s = settled[i];
                        if (s.status !== 'fulfilled') {
                            if (s.reason?.name === 'AbortError') throw s.reason;
                            if (!firstError) firstError = s.reason;
                            return;
                        }
                        onPage(s.value, pages[i]);
                        committedPages++;
                    }
                };
                commit(tvSettled, tvPages, (r, page) => {
                    newTvResults.push(...(r.results || []));
                    tvTotalPages = clampPages(r.totalPages);
                    tvCurrentPage = page;
                    tvHasMorePages = tvCurrentPage < tvTotalPages;
                });
                if (newTvResults.length > 0) cachedTvResults = [...cachedTvResults, ...newTvResults];
                commit(movieSettled, moviePages, (r, page) => {
                    newMovieResults.push(...(r.results || []));
                    movieTotalPages = clampPages(r.totalPages);
                    movieCurrentPage = page;
                    movieHasMorePages = movieCurrentPage < movieTotalPages;
                });
                if (newMovieResults.length > 0) cachedMovieResults = [...cachedMovieResults, ...newMovieResults];

                if (firstError && committedPages === 0) {
                    throw firstError; // nothing arrived at all: let the engine retry with backoff
                }
                if (firstError) {
                    console.debug(`${logPrefix} ${committedPages} of ${pagesFetched} page(s) arrived; the rest will be retried on the next load (${firstError.message})`);
                }

                updateHasMorePages(filterMode);
                lastBatchPages = pagesPerFeed;

                // Get items to add based on filter mode
                let itemsToAdd;
                if (filterMode === 'tv') {
                    itemsToAdd = newTvResults;
                } else if (filterMode === 'movies') {
                    itemsToAdd = newMovieResults;
                } else {
                    itemsToAdd = JE.discoveryFilter?.interleaveArrays(newTvResults, newMovieResults) ||
                                 [...newTvResults, ...newMovieResults];
                }

                yieldStats.fetched += itemsToAdd.length;
                lastBatchRendered = 0;

                // Deduplicate items using deduplicator (if available)
                if (itemDeduplicator && itemsToAdd.length > 0) {
                    itemsToAdd = itemDeduplicator.filter(itemsToAdd);
                }

                if (itemsContainer && itemsToAdd.length > 0) {
                    const fragment = createCardsFragment(itemsToAdd);
                    yieldStats.rendered += fragment.childNodes.length;
                    lastBatchRendered = fragment.childNodes.length;
                    if (fragment.childNodes.length > 0) {
                        itemsContainer.appendChild(fragment);
                    }
                    ensureFilterControl(itemsContainer);
                }

                // Keep the cache warm for the next load while this one renders.
                // After a productive batch prefetch twice as deep; after an empty
                // batch (the next one will be bigger anyway) prefetch only what
                // the remaining empty-page budget still allows.
                const remainingBudget = pageBudget === Infinity ? Infinity : Math.max(0, pageBudget - pagesFetched);
                const prefetchPerFeed = lastBatchRendered > 0
                    ? pagesPerFeed * 2
                    : Math.min(pagesPerFeed, Math.floor(remainingBudget / feedCount));
                if (prefetchPerFeed > 0) prefetchAhead(filterMode, prefetchPerFeed, signal);

                return { pages: committedPages, rendered: lastBatchRendered };
            } catch (error) {
                if (generation === loadGeneration) {
                    // Roll back page counters on failure so retry fetches the same page
                    tvCurrentPage = prevTvPage;
                    movieCurrentPage = prevMoviePage;
                }
                if (error.name === 'AbortError') return;
                console.error(`${logPrefix} Error loading more items:`, error);
                throw error; // Re-throw for seamlessScroll retry handling
            } finally {
                releaseLoading(owner);
                // A filter change that re-armed the engine while this load was in
                // flight found isLoading true and stopped; wake it now.
                if (generation !== loadGeneration && scrollState.fill) scrollState.fill();
            }
        }

        async function handleSortChange() {
            const itemsContainer = /** @type {HTMLElement|null} */ (
                document.querySelector(`${sectionSelector} .itemsContainer`));

            if (!itemsContainer || !currentFeeds || (!currentFeeds.tvId && !currentFeeds.movieId)) return;

            // Clear existing cards and scroll observer
            JE.jellyseerrUI?.releasePosters?.(itemsContainer);
            while (itemsContainer.firstChild) itemsContainer.removeChild(itemsContainer.firstChild);
            cleanupScrollObserver();

            // Reset pagination state for fresh fetch
            loadGeneration++;
            resetFeedPages();
            // This re-fetch owns the loading flag until its page 1 lands, so a
            // filter change in the meantime can't start page 2 ahead of it. Its
            // own staleness is its abort signal (a newer sort or cleanup aborts
            // it); the load generation only tells it whether a filter change
            // means the engine needs waking afterwards.
            const generation = loadGeneration;
            let owner = 0;
            cachedTvResults = [];
            cachedMovieResults = [];
            if (itemDeduplicator) itemDeduplicator.clear();

            // Abort previous requests and create a fresh controller to prevent race conditions
            const signal = requests.replace();

            // Build fetch promises for available media types
            const fetchPromises = fetchFirstPages(signal);

            try {
                owner = takeLoading();
                const results = await Promise.all(fetchPromises);
                // Superseded (another sort change, navigation): nothing here is ours.
                if (signal.aborted) return;
                // Read the filter at commit time — it may have changed meanwhile.
                const filterMode = JE.discoveryFilter?.getFilterMode(key) || 'mixed';

                // Same failure handling as the first render: a feed whose page 1
                // failed stays at page 0 with more pages, so the engine re-fetches
                // it with backoff instead of the sort change ending the feed.
                acceptInitialPages(results);

                updateHasMorePages(filterMode);

                let displayResults = getFilteredResults(filterMode);
                if (displayResults.length === 0 && (cachedTvResults.length > 0 || cachedMovieResults.length > 0)) {
                    displayResults = [...cachedTvResults, ...cachedMovieResults];
                }

                if (displayResults.length > 0) {
                    const fragment = createCardsFragment(displayResults);
                    yieldStats.fetched += displayResults.length;
                    yieldStats.rendered += fragment.childNodes.length;
                    itemsContainer.appendChild(fragment);
                    if (itemDeduplicator) {
                        displayResults.forEach(item => itemDeduplicator.add(item));
                    }
                }

                JE.discoveryFilter.applyFilterVisibility(itemsContainer, filterMode);

                if (hasMorePages) {
                    setupInfiniteScroll();
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(`${logPrefix} Sort change error:`, error);
                }
            } finally {
                releaseLoading(owner);
                // A filter change re-armed the engine while page 1 was in flight; wake it.
                if (generation !== loadGeneration && scrollState.fill) scrollState.fill();
            }
        }

        function handleFilterChange(newMode) {
            const itemsContainer = /** @type {HTMLElement|null} */ (
                document.querySelector(`${sectionSelector} .itemsContainer`));
            if (!itemsContainer) return;

            // Use fast CSS-based visibility (no DOM rebuild)
            JE.discoveryFilter.applyFilterVisibility(itemsContainer, newMode);

            // A batch still in flight belongs to the old mode: retire its
            // bookkeeping, and start the new mode with fresh batch statistics.
            loadGeneration++;
            resetBatchStatistics();

            // Update hasMorePages based on filter mode
            updateHasMorePages(newMode);

            // Re-setup infinite scroll if needed
            if (hasMorePages) {
                setupInfiniteScroll();
            }
        }

        function setupInfiniteScroll() {
            JE.discoveryFilter.setupInfiniteScroll(
                scrollState,
                sectionSelector,
                loadMoreItems,
                () => hasMorePages,
                () => isLoading
            );
        }

        function cleanupScrollObserver() {
            JE.discoveryFilter.cleanupScrollObserver(scrollState);
        }

        function ensureFilterControl(itemsContainer) {
            if (!JE.discoveryFilter?.createFilterControl) return;
            const section = itemsContainer.closest(sectionSelector);
            const header = section?.querySelector('.jellyseerr-discovery-header');
            if (!header || header.querySelector('.jellyseerr-discovery-filter')) return;
            if (!JE.discoveryFilter.hasBothTypes(cachedTvResults, cachedMovieResults)) return;
            const title = header.querySelector('.sectionTitle');
            if (title) title.after(JE.discoveryFilter.createFilterControl(key, handleFilterChange));
        }

        async function renderDualFeed(id, signal, pageKey) {
            // The page wait runs alongside the feed resolution, on its own
            // controller: an early exit (nothing to show, Seerr off for this user)
            // must stop its polling rather than leave it running until the next
            // navigation aborts the render's signal.
            const pageReadyAbort = new AbortController();
            const stopPageWait = () => pageReadyAbort.abort();
            signal.addEventListener('abort', stopPageWait, { once: true });
            const pageReadyPromise = waitForPageReady(pageReadyAbort.signal);

            const resolved = await spec.resolveFeeds({ id, signal });
            if (signal.aborted) return;
            if (!resolved || (!resolved.tvId && !resolved.movieId)) { stopPageWait(); return; }

            // Reset pagination state
            resetFeedPages();
            isLoading = false;
            hasMorePages = true;
            loadGeneration++;
            currentFeeds = { tvId: resolved.tvId || null, movieId: resolved.movieId || null };

            // Clear cached results
            cachedTvResults = [];
            cachedMovieResults = [];

            // Initialize deduplicator for infinite scroll
            itemDeduplicator = JE.seamlessScroll?.createDeduplicator() || null;

            // (No prefetch alongside page 1: extra requests in flight at Seerr
            // slow page 1 down, and the engine's first fill fetches pages 2-3
            // the moment page 1 has rendered.)

            // Fetch TV and Movies separately (only if IDs available)
            const fetchPromises = fetchFirstPages(signal);

            // Show the section as soon as the page can hold it: the header goes
            // in now and the cards stream in when page 1 lands, so the first
            // visit doesn't sit on a blank page waiting for Seerr.
            const listPage = await pageReadyPromise;
            signal.removeEventListener('abort', stopPageWait);
            if (signal.aborted) return;
            let section = null;
            let itemsContainer = null;
            if (listPage) {
                const existing = document.querySelector(sectionSelector);
                if (existing) existing.remove();
                section = createSectionContainer(resolved.title, false, handleFilterChange, handleSortChange);
                itemsContainer = section.querySelector('.itemsContainer');
                const parentContainer = listPage.closest('.verticalSection') || listPage.parentElement;
                if (parentContainer?.parentElement) {
                    parentContainer.parentElement.appendChild(section);
                    keepAttached(section, listPage, signal);
                } else {
                    section = null;
                }
            }

            // A failure here tears the section down only while this render still
            // owns it: an abort means a sort change took the section over (its own
            // load fills the same container) or a navigation's cleanup already
            // removed it — removing it now would delete the successor's section.
            let fetchResults;
            try {
                fetchResults = await Promise.all(fetchPromises);
            } catch (error) {
                if (!signal.aborted) section?.remove();
                throw error;
            }

            if (signal.aborted) return;

            // Process results. A feed whose page 1 failed (Seerr/TMDB hiccup) is
            // left at page 0 with more pages, so the engine's first fill fetches
            // page 1 again with backoff and, if it keeps failing, a retry button —
            // rather than the section quietly never appearing.
            const anyFailed = acceptInitialPages(fetchResults);

            // Determine if we have both types (only show filter if BOTH have results)

            // Always start each section on defaults instead of persisting previous choice.
            JE.discoveryFilter?.resetFilterMode?.(key);
            JE.discoveryFilter?.resetSortMode?.(key);
            // Get current filter mode
            const filterMode = JE.discoveryFilter?.getFilterMode(key) || 'mixed';

            // Update hasMorePages
            updateHasMorePages(filterMode);

            // Get results based on filter mode
            let displayResults = getFilteredResults(filterMode);

            // If filtered results are empty but we have some content, fall back to showing all
            if (displayResults.length === 0 && (cachedTvResults.length > 0 || cachedMovieResults.length > 0)) {
                displayResults = [...cachedTvResults, ...cachedMovieResults];
            }

            if (!section || !itemsContainer) return;
            // An empty page 1 is not an empty feed: the parental filter and the
            // in-library/hidden filters can strip a page bare while later pages
            // still hold titles (upstream page counts are preserved). Only give up
            // when the feed itself says there is nothing more.
            const fragment = createCardsFragment(displayResults);
            if (fragment.childNodes.length === 0 && !anyFailed && !hasMorePages) {
                section.remove();
                return;
            }

            // Both media types present: add the All / Movies / Series control now.
            ensureFilterControl(itemsContainer);

            yieldStats.fetched += displayResults.length;
            yieldStats.rendered += fragment.childNodes.length;
            itemsContainer.appendChild(fragment);

            // Seed deduplicator with initial items to prevent duplicates on scroll
            if (itemDeduplicator) {
                displayResults.forEach(item => itemDeduplicator.add(item));
            }

            if (hasMorePages) {
                setupInfiniteScroll();
            }

            // Mark as successfully processed AFTER successful render
            complete(pageKey);
        }

        function cleanup() {
            loadGeneration++;
            cleanupScrollObserver();
            isLoading = false;
            hasMorePages = true;
            resetFeedPages();
            currentFeeds = null;
            cachedTvResults = [];
            cachedMovieResults = [];
            itemDeduplicator?.clear();
            itemDeduplicator = null;
        }

        return { render: renderDualFeed, cleanup };
    }

    JE.discoveryDualFeed = { create };

})(window.JellyfinEnhanced);
