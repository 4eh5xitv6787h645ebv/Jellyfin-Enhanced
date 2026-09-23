// Owns the current query, cancellation key, pagination and collection insertion.
(function(JE) {
    'use strict';
    JE.seerrSearch = JE.seerrSearch || {};

    JE.seerrSearch.createResults = function(state) {
        const logPrefix = '🪼 Jellyfin Enhanced: Seerr:';
        const { search } = JE.jellyseerrAPI;
        const { renderJellyseerrResults, createJellyseerrCard, updateJellyseerrResults } = JE.jellyseerrUI;
        let lastProcessedQuery = null;
        let disposed = false;
        // Infinite scroll pagination state
        let searchCurrentPage = 0;
        let searchTotalPages = 0;
        let searchIsLoading = false;
        let searchHasMore = false;
        const searchScrollState = {};
        let searchDeduplicator = null;
        /** @type {AbortSignal|null} */
        let searchSignal = null;
        // True from the moment a navigation starts until the delayed teardown
        // check has run; no search load may start or re-arm in that window.
        // Exposed through the engine's hasMore check so the pause is never
        // mistaken for a run of empty pages.
        let searchSuspended = false;
        // Items fetched vs cards rendered for the current query (after hidden
        // content + dedup filtering); sizes the parallel page batches.
        const searchYield = { fetched: 0, rendered: 0 };
        const MAX_SEARCH_PAGES_PER_LOAD = 4;
        // TMDB refuses search pages beyond 500; never ask for them.
        const TMDB_MAX_PAGE = 500;


        /**
         * Resets search pagination state for a new query.
         */
        function resetSearchPagination() {
            searchCurrentPage = 0;
            searchTotalPages = 0;
            searchIsLoading = false;
            searchHasMore = false;
            searchYield.fetched = 0;
            searchYield.rendered = 0;
            if (searchDeduplicator) searchDeduplicator.clear();
            JE.seamlessScroll?.cleanupInfiniteScroll(searchScrollState);
        }

        /**
         * Warms the request cache with the next `count` result pages so the
         * following load-more is served instantly. Fire-and-forget.
         * @param {string} query
         * @param {number} count
         * @param {AbortSignal|null} signal
         */
        function prefetchSearchPages(query, count, signal) {
            if (!searchHasMore || signal?.aborted) return;
            const last = Math.min(searchTotalPages, searchCurrentPage + Math.max(1, count));
            for (let p = searchCurrentPage + 1; p <= last; p++) {
                search(query, p, { signal }).catch(() => {});
            }
        }

        /**
         * Inserts synthetic collection cards into the existing results row,
         * each right after the movie it belongs to, without rebuilding the
         * section (a rebuild would drop the pages appended by infinite scroll
         * and detach its sentinel).
         * @param {Array} enrichedResults Results with collection cards spliced in.
         */
        function insertCollectionCards(enrichedResults) {
            const container = document.querySelector('.jellyseerr-section .itemsContainer');
            if (!container) return;
            for (let i = 0; i < enrichedResults.length; i++) {
                const item = enrichedResults[i];
                if (item.mediaType !== 'collection') continue;
                if (searchDeduplicator && !searchDeduplicator.add(item)) continue;
                const prev = enrichedResults[i - 1];
                const anchor = prev
                    ? container.querySelector(`.jellyseerr-more-info-link[data-tmdb-id="${prev.id}"][data-media-type="${prev.mediaType}"]`)?.closest('.card')
                    : null;
                const card = createJellyseerrCard(item, state.active, state.userFound);
                if (anchor) anchor.after(card); else container.appendChild(card);
            }
        }

        /**
         * Fetches and renders search results (page 1), then sets up infinite scroll.
         * @param {string} query The search query.
         */
        async function fetchAndRenderResults(query, options = {}) {
            if (disposed) return;
            const { skipCache = false } = options;
            lastProcessedQuery = query;
            resetSearchPagination();
            searchDeduplicator = JE.seamlessScroll?.createDeduplicator() || null;

            // Cancel any still-in-flight search/collection requests from the
            // previous keystroke instead of letting them queue up.
            const signal = JE.requestManager?.getAbortSignal('jellyseerr-search') || null;
            searchSignal = signal;

            let data;
            try {
                data = await search(query, 1, { skipCache, signal });
            } catch (error) {
                if (error.name === 'AbortError') return; // superseded by a newer search
                throw error;
            }
            if (disposed || lastProcessedQuery !== query) return; // superseded by a newer search while this was in flight

            let results = data.results || [];
            searchCurrentPage = data.page || 1;
            searchTotalPages = Math.min(data.totalPages || 1, TMDB_MAX_PAGE);
            searchHasMore = searchCurrentPage < searchTotalPages;

            searchYield.fetched += results.length;
            if (JE.hiddenContent) results = JE.hiddenContent.filterJellyseerrResults(results, 'search');
            if (searchDeduplicator) results = searchDeduplicator.filter(results);
            searchYield.rendered += results.length;

            // Even an empty first page needs a section for the scroll engine:
            // parental/hidden-content filtering can remove every card while
            // later pages still contain results. Without a row, setup exits
            // before it can fetch those pages.
            if (results.length > 0 || searchHasMore) {
                renderJellyseerrResults(results, query, state.onlyMode, state.active, state.userFound);
            }

            if (results.length > 0) {
                // Enrich with collections in the background, then slot the
                // collection cards into the existing row.
                JE.seerrSearch.prepareResultsWithCollections(results, { signal }).then(enrichedResults => {
                    if (disposed || lastProcessedQuery !== query) return;
                    if (JE.hiddenContent) enrichedResults = JE.hiddenContent.filterJellyseerrResults(enrichedResults, 'search');
                    if (enrichedResults.length > results.length) {
                        insertCollectionCards(enrichedResults);
                    }
                }).catch(() => {});
            }

            // Start the engine whenever pages remain, even if this page rendered
            // nothing (everything filtered out): later pages may still have titles,
            // and the engine's empty-page valve decides when to stop. It fills the
            // row buffer immediately, so start it before the collection lookups
            // compete for request slots.
            if (searchHasMore) {
                setupSearchInfiniteScroll(query);
            }
        }

        /**
         * Loads the next page(s) of search results and appends cards to the
         * container. Several pages are fetched in parallel when the row buffer
         * deficit (or a low post-filter yield) calls for it, and the pages
         * after those are prefetched into the cache.
         * @param {string} query The current search query.
         * @param {{deficitPx?: number, horizontal?: boolean}} [hint] From the scroll engine.
         */
        async function loadMoreSearchResults(query, hint) {
            if (disposed || searchIsLoading || !searchHasMore || lastProcessedQuery !== query) return;

            // The global navigation abort cancels the query's signal. If the
            // search page is still visible with this very query (e.g. jellyfin-web
            // rewrote the URL's query param), re-arm a fresh signal for it;
            // otherwise the row is stale and must stop, not carry on unabortable.
            if (searchSuspended) return;
            if (searchSignal?.aborted) {
                const visibleInput = document.querySelector('#searchPage:not(.hide) #searchTextInput');
                if (!visibleInput || visibleInput.value !== query) {
                    searchHasMore = false;
                    return;
                }
                searchSignal = JE.requestManager?.getAbortSignal('jellyseerr-search') || null;
            }
            searchIsLoading = true;
            const signal = searchSignal || undefined;
            const firstPage = searchCurrentPage + 1;

            try {
                const itemsContainer = document.querySelector('.jellyseerr-section .itemsContainer');
                const wantCards = JE.seamlessScroll?.cardsNeeded?.(itemsContainer, hint, 20) || 20;
                const yieldRatio = searchYield.fetched >= 20
                    ? Math.min(1, Math.max(0.1, searchYield.rendered / searchYield.fetched))
                    : 0.9;
                const remaining = Math.max(1, searchTotalPages - searchCurrentPage);
                const pageBudget = Number.isFinite(hint?.pageBudget) ? Math.max(1, hint.pageBudget) : Infinity;
                const count = Math.min(MAX_SEARCH_PAGES_PER_LOAD, remaining, pageBudget, Math.max(1, Math.ceil(wantCards / (20 * yieldRatio))));
                const pages = [];
                for (let p = firstPage; p < firstPage + count; p++) pages.push(p);

                const settled = await Promise.allSettled(pages.map(p => search(query, p, { signal, throwOnError: true })));
                if (disposed || lastProcessedQuery !== query) return; // query changed during fetch

                // Commit pages in order up to the first failure; a flaky page must
                // not discard the ones that arrived (they are re-fetched next load).
                let results = [];
                let committed = 0;
                let firstError = null;
                for (let i = 0; i < settled.length; i++) {
                    const s = settled[i];
                    if (s.status !== 'fulfilled') {
                        if (s.reason?.name === 'AbortError') throw s.reason;
                        firstError = s.reason;
                        break;
                    }
                    const data = s.value;
                    results.push(...(data.results || []));
                    searchCurrentPage = data.page || pages[i];
                    if (data.totalPages) searchTotalPages = Math.min(data.totalPages, TMDB_MAX_PAGE);
                    committed++;
                }
                if (firstError && committed === 0) throw firstError;
                searchHasMore = searchCurrentPage < searchTotalPages;

                searchYield.fetched += results.length;
                if (JE.hiddenContent) results = JE.hiddenContent.filterJellyseerrResults(results, 'search');
                if (searchDeduplicator) results = searchDeduplicator.filter(results);
                searchYield.rendered += results.length;

                // Keep the cache warm for the next load while this one renders —
                // only once the viewer has actually started reading the row (a row
                // that is merely displayed costs no extra Seerr searches), and never
                // beyond the empty-page budget after a batch that rendered nothing.
                if (hint?.engaged) {
                    const remainingBudget = pageBudget === Infinity ? Infinity : Math.max(0, pageBudget - pages.length);
                    const prefetch = results.length > 0 ? count : Math.min(count, remainingBudget);
                    if (prefetch > 0) prefetchSearchPages(query, prefetch, signal);
                }

                if (results.length > 0 && itemsContainer) {
                    const fragment = document.createDocumentFragment();
                    results.forEach(item => {
                        const card = createJellyseerrCard(item, state.active, state.userFound);
                        fragment.appendChild(card);
                    });
                    itemsContainer.appendChild(fragment);
                }
                return { pages: committed, rendered: itemsContainer ? results.length : 0 };
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.warn(`${logPrefix} Failed to load more search results:`, error);
                    // Roll back so the retry fetches the same pages
                    searchCurrentPage = firstPage - 1;
                    searchHasMore = true;
                }
                throw error; // Re-throw for seamlessScroll retry handling
            } finally {
                searchIsLoading = false;
            }
        }

        /**
         * Sets up the infinite scroll observer for search results.
         * @param {string} query The current search query.
         */
        function setupSearchInfiniteScroll(query) {
            if (!JE.seamlessScroll) return;

            JE.seamlessScroll.setupInfiniteScroll(
                searchScrollState,
                '.jellyseerr-section',
                (hint) => loadMoreSearchResults(query, hint),
                () => searchHasMore && !searchSuspended,
                () => searchIsLoading,
                { horizontal: true, trackSelector: '.itemsContainer', scrollerSelector: '.emby-scroller' }
            );
        }

        /**
         * Fetches fresh data and updates the existing UI elements.
         * @param {string} query The current search query.
         */
        // Manual refresh handler
        async function manualRefreshJellyseerrData(query) {
            const section = document.querySelector('.jellyseerr-section');
            const itemsContainer = section?.querySelector('.itemsContainer');
            if (disposed || !query || !itemsContainer) return;

            console.log(`${logPrefix} Refreshing data for query: "${query}"`);
            try {
                resetSearchPagination();
                searchDeduplicator = JE.seamlessScroll?.createDeduplicator() || null;

                const signal = JE.requestManager?.getAbortSignal('jellyseerr-search') || null;
                searchSignal = signal;
                const data = await search(query, 1, { signal, skipCache: true });
                if (disposed) return;
                let results = await JE.seerrSearch.prepareResultsWithCollections(data.results || [], { signal });
                if (disposed) return;
                if (JE.hiddenContent) results = JE.hiddenContent.filterJellyseerrResults(results, 'search');

                searchCurrentPage = data.page || 1;
                searchTotalPages = Math.min(data.totalPages || 1, TMDB_MAX_PAGE);
                searchHasMore = searchCurrentPage < searchTotalPages;
                if (searchDeduplicator) searchDeduplicator.filter(results);

                JE.jellyseerrUI?.releasePosters?.(itemsContainer);
                while (itemsContainer.firstChild) itemsContainer.removeChild(itemsContainer.firstChild);
                results.forEach(item => {
                    const card = createJellyseerrCard(item, state.active, state.userFound);
                    itemsContainer.appendChild(card);
                });
                updateJellyseerrResults(results, state.active, state.userFound);

                if (searchHasMore) {
                    setupSearchInfiniteScroll(query);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.warn(`${logPrefix} Failed to refresh Seerr data:`, error);
                }
            }
        }


        return {
            get query() { return lastProcessedQuery; },
            set query(value) { lastProcessedQuery = value; },
            fetch: fetchAndRenderResults,
            refresh: manualRefreshJellyseerrData,
            reset: resetSearchPagination,
            suspend() { searchSuspended = true; },
            resume() { searchSuspended = false; },
            fill() { if (searchScrollState.fill) searchScrollState.fill(); },
            dispose() {
                disposed = true;
                lastProcessedQuery = null;
                JE.requestManager?.abortRequest('jellyseerr-search');
                resetSearchPagination();
            }
        };
    };

})(window.JellyfinEnhanced);
