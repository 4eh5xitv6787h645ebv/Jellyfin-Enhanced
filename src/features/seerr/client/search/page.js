// Owns search-page listeners, debounce/navigation timers and filter presentation.
(function(JE) {
    'use strict';
    JE.seerrSearch = JE.seerrSearch || {};

    JE.seerrSearch.createPage = function(state, results, scope) {
        const logPrefix = '🪼 Jellyfin Enhanced: Seerr:';
        const { updateJellyseerrIcon, clearInjectedSearchResults } = JE.jellyseerrUI;
        let debounceTimeout = null;
        let navigateSettleTimer = null;
        let hiddenSections = [];
        let jellyseerrOriginalPosition = null;
        /**
         * Toggles between showing all search results vs only Seerr results.
         */
        function toggleJellyseerrOnlyMode() {
            state.onlyMode = !state.onlyMode;

            const searchPage = document.querySelector('#searchPage');
            if (!searchPage) return;

            if (state.onlyMode) {
                const allSections = searchPage.querySelectorAll('.verticalSection:not(.jellyseerr-section)');
                hiddenSections = Array.from(allSections);
                allSections.forEach(section => section.classList.add('section-hidden'));

                const jellyseerrSection = searchPage.querySelector('.jellyseerr-section');
                if (jellyseerrSection) {
                    jellyseerrOriginalPosition = document.createElement('div');
                    jellyseerrOriginalPosition.id = 'jellyseerr-placeholder';
                    jellyseerrSection.parentNode.insertBefore(jellyseerrOriginalPosition, jellyseerrSection);
                    const searchResults = searchPage.querySelector('.searchResults, [class*="searchResults"], .padded-top.padded-bottom-page');
                    if (searchResults) {
                        searchResults.insertBefore(jellyseerrSection, searchResults.firstChild);
                    }
                }
                searchPage.querySelectorAll('.noItemsMessage').forEach(el => el.classList.add('section-hidden'));

                JE.toast(JE.t('jellyseerr_toast_filter_on'), 3000);

            } else {
                hiddenSections.forEach(section => section.classList.remove('section-hidden'));
                const jellyseerrSection = searchPage.querySelector('.jellyseerr-section');
                if (jellyseerrSection && jellyseerrOriginalPosition?.parentNode) {
                    jellyseerrOriginalPosition.parentNode.insertBefore(jellyseerrSection, jellyseerrOriginalPosition);
                    jellyseerrOriginalPosition.remove();
                    jellyseerrOriginalPosition = null;
                }
                searchPage.querySelectorAll('.noItemsMessage').forEach(el => el.classList.remove('section-hidden'));

                hiddenSections = [];
                JE.toast(JE.t('jellyseerr_toast_filter_off'), 3000);
            }

            const jellyseerrSection = searchPage.querySelector('.jellyseerr-section');
            if (jellyseerrSection) {
                const titleElement = jellyseerrSection.querySelector('.sectionTitle');
                if (titleElement) {
                    titleElement.textContent = state.onlyMode ? JE.t('jellyseerr_results_title') : JE.t('jellyseerr_discover_title');
                }
            }
            updateJellyseerrIcon(state.active, state.userFound, state.onlyMode, toggleJellyseerrOnlyMode);
        }

        /**
         * Sets up DOM observation for search page changes.
         */
        function initializePageObserver() {
            const handleSearch = () => {
                const searchInput = document.querySelector('#searchPage #searchTextInput');
                const isSearchPage = searchInput !== null;
                const currentQuery = isSearchPage ? searchInput.value : null;

                if (isSearchPage && currentQuery?.trim()) {
                    scope.cancelDelay(debounceTimeout);
                    debounceTimeout = scope.delay(() => {
                        if (!state.active) {
                            clearInjectedSearchResults();
                            return;
                        }
                        const latestQuery = searchInput.value;
                        if (latestQuery === results.query) return;

                        if (state.onlyMode) {
                            state.onlyMode = false;
                            hiddenSections = [];
                            jellyseerrOriginalPosition = null;
                            updateJellyseerrIcon(state.active, state.userFound, false, toggleJellyseerrOnlyMode);
                        }
                        results.query = latestQuery;
                        results.reset();
                        clearInjectedSearchResults();
                        results.fetch(latestQuery);
                    }, 200);
                } else {
                    scope.cancelDelay(debounceTimeout);
                    results.query = null;
                    state.onlyMode = false;
                    results.reset();
                    clearInjectedSearchResults();
                }
            };

            /**
             * Attempts to attach the search input listener if the search page is visible.
             * Called by the MutationObserver, navigation events, and on initial setup.
             * Idempotent — sets data-jellyseerr-listener on the input to prevent
             * duplicate attachment, and adds a permanent 'input' event handler.
             */
            function tryAttachSearchListener() {
                updateJellyseerrIcon(state.active, state.userFound, state.onlyMode, toggleJellyseerrOnlyMode);

                const searchInput = document.querySelector('#searchPage #searchTextInput');
                if (searchInput && !searchInput.dataset.jellyseerrListener) {
                    console.debug(`${logPrefix} Search input found, attaching listener.`);
                    scope.addListener(searchInput, 'input', handleSearch);
                    searchInput.dataset.jellyseerrListener = 'true';
                    scope.track(() => { delete searchInput.dataset.jellyseerrListener; });

                    // Add a click listener for the alphabet picker
                    const alphaPicker = document.querySelector('.alphaPicker');
                    if (alphaPicker) {
                        scope.addListener(alphaPicker, 'click', () => {
                            // Use a short delay to ensure the input value has updated before we read it
                            scope.delay(handleSearch, 100);
                        });
                    }

                    // Also handle the case where the page loads with a query already in the box
                    handleSearch();
                }
            }

            /**
             * Called on every SPA navigation. If we've navigated away from the search
             * page entirely, tear down pagination/infinite-scroll state so stale
             * scroll listeners don't keep hitting the search endpoint from other pages.
             * Otherwise, (re)attach the search listener as usual.
             */
            function handleNavigate() {
                // Only a *visible* search page keeps the row alive; jellyfin-web may
                // keep the view in the DOM with .hide after navigating away.
                const searchInput = document.querySelector('#searchPage:not(.hide) #searchTextInput');
                if (!searchInput) {
                    scope.cancelDelay(debounceTimeout);
                    results.query = null;
                    state.onlyMode = false;
                    results.reset();
                    clearInjectedSearchResults();
                    return;
                }
                tryAttachSearchListener();
                // The row itself was removed (e.g. by a view re-render) while the
                // query is unchanged: handleSearch would skip it as already
                // processed, so rebuild it here.
                if (state.active && searchInput.value.trim() && searchInput.value === results.query
                    && !document.querySelector('.jellyseerr-section')) {
                    results.reset();
                    results.fetch(searchInput.value);
                }
            }

            // Listen for manual refresh events from the UI
            scope.addListener(document, 'jellyseerr-manual-refresh', function(e) {
                const searchInput = document.querySelector('#searchPage #searchTextInput');
                const query = searchInput ? searchInput.value : null;
                results.refresh(query);
            });

            scope.track(JE.helpers.onBodyMutation('jellyseerr-search-listener', tryAttachSearchListener));

            // Immediately check if the search page is already rendered (handles the
            // case where the observer was set up after the search page loaded, e.g.
            // when the user navigates directly to /search before plugin init completes).
            tryAttachSearchListener();

            // Listen for SPA navigation events as a backup — MutationObserver may
            // miss the search page if no further DOM mutations occur after render.
            // Uses the shared je:navigate event (from helpers.js) which already
            // patches pushState/replaceState, plus popstate and hashchange.
            const onNav = () => {
                results.suspend();
                // One timer for overlapping navigations: only the latest one settles.
                scope.cancelDelay(navigateSettleTimer);
                navigateSettleTimer = scope.delay(() => {
                    results.resume();
                    handleNavigate();
                    // Still on the same search: resume filling where we paused.
                    results.fill();
                }, 200);
            };
            if (JE.helpers?.onNavigate) {
                scope.track(JE.helpers.onNavigate(onNav));
            } else {
                // Fallback if helpers.js hasn't loaded yet — may double-fire with
                // onNavigate if helpers loads later, but tryAttachSearchListener is
                // idempotent (guarded by dataset.jellyseerrListener) so this is safe.
                scope.addListener(window, 'popstate', onNav);
                scope.addListener(window, 'hashchange', onNav);
            }
        }


        return { initialize: initializePageObserver };
    };

})(window.JellyfinEnhanced);
