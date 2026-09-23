// @ts-check
// Client-side sorting, filtering and chunked paging of a resolved discovery list.
(function(JE) {
    'use strict';

    /**
     * Person discovery: a full result list rendered in local chunks.
     * `spec.resolveItems` supplies the list; `view` owns section markup and page
     * readiness. This controller owns cached results, ordering, chunk position
     * and the scroll subscription. `complete` records successful attachment.
     */
    function create({ spec, view, complete, logPrefix }) {
        const key = spec.key;
        const PAGE_SIZE = spec.pageSize || 40;
        const { sectionSelector, createCardsFragment, createSectionContainer, waitForPageReady } = view;
        const scrollState = { activeScrollObserver: null };
        let isLoading = false;
        let hasMorePages = true;
        let clientListActive = false;
        let cachedAllResults = [];
        let currentPagedResults = [];
        let renderedCount = 0;

        function applySortOrder(results) {
            const sortBy = JE.discoveryFilter?.getSortMode(key) || '';
            if (!sortBy) return results; // default order from API (popularity)

            const sorted = [...results];
            if (sortBy === 'vote_average.desc') {
                sorted.sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0));
            } else if (sortBy === 'release_date.desc') {
                sorted.sort((a, b) => {
                    const dateA = a.releaseDate || a.firstAirDate || '';
                    const dateB = b.releaseDate || b.firstAirDate || '';
                    return dateB.localeCompare(dateA);
                });
            } else if (sortBy === 'release_date.asc') {
                sorted.sort((a, b) => {
                    const dateA = a.releaseDate || a.firstAirDate || '';
                    const dateB = b.releaseDate || b.firstAirDate || '';
                    return dateA.localeCompare(dateB);
                });
            }
            return sorted;
        }

        function getFilteredResults(mode) {
            const filter = JE.discoveryFilter;
            const sorted = applySortOrder(cachedAllResults);
            if (!filter) {
                return sorted;
            }
            if (mode === filter.MODES.MOVIES || mode === filter.MODES.TV) {
                return filter.filterByMediaType(sorted, mode);
            }
            // Mixed mode - interleave TV and Movies for balanced display
            const tvResults = sorted.filter(item => item.mediaType === 'tv');
            const movieResults = sorted.filter(item => item.mediaType === 'movie');
            return filter.interleaveArrays(tvResults, movieResults);
        }

        function getPagedResultsForMode(mode) {
            let results = getFilteredResults(mode);
            if (results.length === 0 && cachedAllResults.length > 0) {
                results = cachedAllResults;
            }
            return results;
        }

        function renderChunk(itemsContainer, mode, reset = false, chunkSize = PAGE_SIZE) {
            if (!itemsContainer) return;

            if (reset) {
                JE.jellyseerrUI?.releasePosters?.(itemsContainer);
                while (itemsContainer.firstChild) itemsContainer.removeChild(itemsContainer.firstChild);
                renderedCount = 0;
            }

            currentPagedResults = getPagedResultsForMode(mode);
            const nextChunk = currentPagedResults.slice(renderedCount, renderedCount + chunkSize);
            if (nextChunk.length === 0) {
                hasMorePages = false;
                return;
            }

            const fragment = createCardsFragment(nextChunk);
            if (fragment.childNodes.length > 0) {
                itemsContainer.appendChild(fragment);
            }

            renderedCount += nextChunk.length;
            hasMorePages = renderedCount < currentPagedResults.length;
        }

        async function loadMoreItems(hint) {
            if (isLoading || !hasMorePages || !clientListActive) return;

            isLoading = true;
            try {
                const filterMode = JE.discoveryFilter?.getFilterMode(key) || 'mixed';
                const itemsContainer = /** @type {HTMLElement|null} */ (
                    document.querySelector(`${sectionSelector} .itemsContainer`));
                const chunk = Math.max(PAGE_SIZE, JE.seamlessScroll?.cardsNeeded?.(itemsContainer, hint, PAGE_SIZE) || PAGE_SIZE);
                const before = renderedCount;
                renderChunk(itemsContainer, filterMode, false, chunk);
                return { pages: 1, rendered: renderedCount - before };
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error(`${logPrefix} Error loading more items:`, error);
                throw error; // Re-throw for seamlessScroll retry handling
            } finally {
                isLoading = false;
            }
        }

        function handleFilterChange(mode) {
            const itemsContainer = document.querySelector(`${sectionSelector} .itemsContainer`);
            if (!itemsContainer) return;
            renderChunk(itemsContainer, mode, true);
            cleanupScrollObserver();
            if (hasMorePages) setupInfiniteScroll();
        }

        async function handleSortChange() {
            handleFilterChange(JE.discoveryFilter?.getFilterMode(key) || 'mixed');
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

        async function renderClientPaged(id, signal, pageKey) {
            const resolved = await spec.resolveItems({ id, signal });
            if (signal.aborted) return;
            if (!resolved || !resolved.items || resolved.items.length === 0) return;

            // Store all results for filter switching
            cachedAllResults = resolved.items;
            clientListActive = true;

            // Check if we have both media types
            const hasBoth = JE.discoveryFilter?.resultHasBothTypes(cachedAllResults) || false;

            // Always start each section on defaults instead of persisting previous choice.
            JE.discoveryFilter?.resetFilterMode?.(key);
            JE.discoveryFilter?.resetSortMode?.(key);
            // Get current filter mode
            const filterMode = JE.discoveryFilter?.getFilterMode(key) || 'mixed';

            // Get filtered results
            let displayResults = getFilteredResults(filterMode);

            // If filtered results are empty but we have some content, fall back to showing all
            if (displayResults.length === 0 && cachedAllResults.length > 0) {
                displayResults = cachedAllResults;
            }

            // Wait for page content
            const detailSection = await waitForPageReady(signal);
            if (signal.aborted) return;

            if (!detailSection) {
                console.debug(`${logPrefix} Could not find detail section to insert into`);
                return;
            }

            // Remove existing section
            const existing = document.querySelector(sectionSelector);
            if (existing) existing.remove();

            // Create and insert section
            const section = createSectionContainer(resolved.title, hasBoth, handleFilterChange, handleSortChange);
            const itemsContainer = section.querySelector('.itemsContainer');

            // Seed first page and let seamless scroll load the rest.
            const initialItems = displayResults.slice(0, PAGE_SIZE);
            const fragment = createCardsFragment(initialItems);
            if (fragment.childNodes.length === 0) {
                console.debug(`${logPrefix} No cards created from results`);
                return;
            }

            itemsContainer.appendChild(fragment);
            currentPagedResults = displayResults;
            renderedCount = initialItems.length;
            hasMorePages = renderedCount < currentPagedResults.length;

            detailSection.appendChild(section);
            console.debug(`${logPrefix} Section added with ${fragment.childNodes.length} cards`);

            if (hasMorePages) {
                setupInfiniteScroll();
            }

            // Mark as successfully processed AFTER successful render
            complete(pageKey);
        }

        function cleanup() {
            cleanupScrollObserver();
            isLoading = false;
            hasMorePages = true;
            clientListActive = false;
            cachedAllResults = [];
            currentPagedResults = [];
            renderedCount = 0;
        }

        return { render: renderClientPaged, cleanup };
    }

    JE.discoveryClientPager = { create };

})(window.JellyfinEnhanced);
