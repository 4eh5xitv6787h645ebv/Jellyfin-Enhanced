// /js/jellyseerr/library-home-discovery.js
// Injects Seerr Trending and Upcoming sections into library home page tabs
(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Library Home Discovery:';

    // Tab index constants (match Jellyfin's tab ordering)
    const TV_TABS = { SHOWS: 0, SUGGESTIONS: 1, UPCOMING: 2, GENRES: 3, NETWORKS: 4, EPISODES: 5 };
    const MOVIE_TABS = { MOVIES: 0, SUGGESTIONS: 1, FAVORITES: 2, COLLECTIONS: 3, GENRES: 4 };

    let currentAbortController = null;
    let currentLibraryType = null; // 'tv' or 'movies'
    let tabChangeListener = null;

    /**
     * Translate with fallback. JE.t() returns the key itself when not found.
     * @param {string} key
     * @param {string} fallback
     * @returns {string}
     */
    function t(key, fallback) {
        if (!JE.t) return fallback;
        const val = JE.t(key);
        return (val && val !== key) ? val : fallback;
    }

    /**
     * Detects if we're on a TV or Movies library home page
     * @returns {'tv'|'movies'|null}
     */
    function getLibraryType() {
        const hash = window.location.hash;
        if (hash.includes('/tv') && hash.includes('collectionType=tvshows')) return 'tv';
        if (hash.includes('/movies') && hash.includes('collectionType=movies')) return 'movies';
        // React router format
        if (hash.includes('/tv?') || hash.match(/#\/tv\b/)) return 'tv';
        if (hash.includes('/movies?') || hash.match(/#\/movies\b/)) return 'movies';
        return null;
    }

    /**
     * Gets the currently active tab index
     * @returns {number}
     */
    function getActiveTabIndex() {
        const activeBtn = document.querySelector('.emby-tab-button-active');
        if (activeBtn) return parseInt(activeBtn.dataset.index || '0');
        const tabs = document.querySelector('[is="emby-tabs"]');
        if (tabs) return parseInt(tabs.dataset.index || '0');
        return 0;
    }

    /**
     * Gets the content pane for a given tab index
     * @param {number} tabIndex
     * @returns {HTMLElement|null}
     */
    function getTabPane(tabIndex) {
        return document.querySelector(`.pageTabContent[data-index="${tabIndex}"]`);
    }

    /**
     * Creates a horizontal scrolling section with Seerr cards
     * @param {Array} results - Seerr API results
     * @param {string} title - Section title
     * @param {string} sectionId - Unique ID to prevent duplicates
     * @returns {HTMLElement|null}
     */
    function createSection(results, title, sectionId) {
        if (!results || results.length === 0) return null;

        // Filter out library items if configured
        const excludeLibrary = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
        let filtered = results;
        if (excludeLibrary) {
            filtered = results.filter(item => !item.mediaInfo?.jellyfinMediaId);
        }
        if (JE.hiddenContent) {
            filtered = JE.hiddenContent.filterJellyseerrResults(filtered, 'recommendations');
        }
        if (filtered.length === 0) return null;

        const section = document.createElement('div');
        section.className = 'verticalSection emby-scroller-container jellyseerr-library-home-section';
        section.setAttribute('data-jellyseerr-section', sectionId);
        section.setAttribute('role', 'group');
        section.setAttribute('aria-label', title);

        const titleEl = document.createElement('h2');
        titleEl.className = 'sectionTitle sectionTitle-cards focuscontainer-x padded-right';
        titleEl.textContent = title;
        section.appendChild(titleEl);

        const scroller = document.createElement('div');
        scroller.setAttribute('is', 'emby-scroller');
        scroller.className = 'padded-top-focusscale padded-bottom-focusscale no-padding emby-scroller';
        scroller.dataset.horizontal = 'true';
        scroller.dataset.centerfocus = 'card';
        scroller.dataset.scrollModeX = 'custom';
        scroller.style.scrollSnapType = 'none';
        scroller.style.touchAction = 'auto';
        scroller.style.overscrollBehaviorX = 'contain';
        scroller.style.webkitOverflowScrolling = 'touch';

        const items = document.createElement('div');
        items.setAttribute('is', 'emby-itemscontainer');
        items.className = 'focuscontainer-x itemsContainer scrollSlider animatedScrollX';
        items.style.whiteSpace = 'nowrap';

        const fragment = document.createDocumentFragment();
        for (const item of filtered.slice(0, 20)) {
            const card = JE.jellyseerrUI?.createJellyseerrCard?.(item, true, true);
            if (card) {
                const jellyfinMediaId = item.mediaInfo?.jellyfinMediaId;
                if (jellyfinMediaId) {
                    card.classList.add('jellyseerr-card-in-library');
                    const titleLink = card.querySelector('.cardText-first a');
                    if (titleLink) {
                        titleLink.textContent = item.title || item.name;
                        titleLink.title = item.title || item.name;
                        titleLink.href = `#!/details?id=${jellyfinMediaId}`;
                        titleLink.removeAttribute('target');
                        titleLink.removeAttribute('rel');
                    }
                }
                fragment.appendChild(card);
            }
        }

        if (fragment.childNodes.length === 0) return null;

        items.appendChild(fragment);
        scroller.appendChild(items);
        section.appendChild(scroller);
        return section;
    }

    /**
     * Checks if a section has already been injected into a specific pane
     * @param {HTMLElement} pane
     * @param {string} sectionId
     * @returns {boolean}
     */
    function hasSectionInPane(pane, sectionId) {
        return !!pane?.querySelector(`[data-jellyseerr-section="${sectionId}"]`);
    }

    /**
     * Injects a section into a tab pane, appending after existing content
     * @param {HTMLElement} pane - The tab pane element
     * @param {HTMLElement} section - The section to inject
     * @param {string} sectionId - Unique ID for dedup tracking
     */
    function injectSection(pane, section, sectionId) {
        if (!pane || !section) return;

        // Remove existing section with same ID in THIS pane to avoid duplicates
        const existing = pane.querySelector(`[data-jellyseerr-section="${sectionId}"]`);
        if (existing) existing.remove();

        pane.appendChild(section);
    }

    /**
     * Injects trending content into the Suggestions tab
     * @param {AbortSignal} signal
     */
    async function injectTrending(signal) {
        const tabIndex = currentLibraryType === 'tv' ? TV_TABS.SUGGESTIONS : MOVIE_TABS.SUGGESTIONS;
        const pane = getTabPane(tabIndex);
        if (!pane) return;

        const sectionId = `trending-${currentLibraryType}`;
        if (hasSectionInPane(pane, sectionId)) return;

        try {
            const data = await JE.jellyseerrAPI.fetchTrending({ signal });
            if (signal.aborted) return;

            const mediaType = currentLibraryType === 'tv' ? 'tv' : 'movie';
            const filtered = (data?.results || []).filter(item => item.mediaType === mediaType);

            const title = currentLibraryType === 'tv'
                ? t('discovery_trending_tv', 'Trending TV Shows')
                : t('discovery_trending_movies', 'Trending Movies');

            const section = createSection(filtered, title, sectionId);
            injectSection(pane, section, sectionId);

            if (section) {
                console.debug(`${logPrefix} Added ${title} (${filtered.length} items) to Suggestions tab`);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.debug(`${logPrefix} Failed to load trending:`, error);
            }
        }
    }

    /**
     * Injects upcoming content into the Upcoming tab (TV) or Suggestions tab (Movies)
     * @param {AbortSignal} signal
     */
    async function injectUpcoming(signal) {
        let tabIndex;
        if (currentLibraryType === 'tv') {
            tabIndex = TV_TABS.UPCOMING;
        } else {
            tabIndex = MOVIE_TABS.SUGGESTIONS;
        }

        const pane = getTabPane(tabIndex);
        if (!pane) return;

        const sectionId = `upcoming-${currentLibraryType}`;
        if (hasSectionInPane(pane, sectionId)) return;

        try {
            const data = currentLibraryType === 'tv'
                ? await JE.jellyseerrAPI.fetchUpcomingTv({ signal })
                : await JE.jellyseerrAPI.fetchUpcomingMovies({ signal });
            if (signal.aborted) return;

            const title = currentLibraryType === 'tv'
                ? t('discovery_upcoming_tv_title', 'Upcoming TV Shows')
                : t('discovery_upcoming_movies_title', 'Upcoming Movies');

            const section = createSection(data?.results || [], title, sectionId);
            injectSection(pane, section, sectionId);

            if (section) {
                console.debug(`${logPrefix} Added ${title} to ${currentLibraryType === 'tv' ? 'Upcoming' : 'Suggestions'} tab`);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.debug(`${logPrefix} Failed to load upcoming:`, error);
            }
        }
    }

    /**
     * Handles tab changes - injects content when a relevant tab becomes active
     * @param {number} tabIndex
     */
    async function onTabChange(tabIndex) {
        if (!currentLibraryType || !currentAbortController) return;
        const signal = currentAbortController.signal;
        if (signal.aborted) return;

        if (currentLibraryType === 'tv') {
            if (tabIndex === TV_TABS.SUGGESTIONS) {
                await injectTrending(signal);
            } else if (tabIndex === TV_TABS.UPCOMING) {
                await injectUpcoming(signal);
            }
        } else if (currentLibraryType === 'movies') {
            if (tabIndex === MOVIE_TABS.SUGGESTIONS) {
                await injectTrending(signal);
                await injectUpcoming(signal);
            }
        }
    }

    /**
     * Sets up a listener for tab change events on the emby-tabs element
     */
    function setupTabListener() {
        removeTabListener();

        const tabsEl = document.querySelector('[is="emby-tabs"]');
        if (!tabsEl) return;

        tabChangeListener = (e) => {
            const newIndex = e.detail?.selectedTabIndex ?? getActiveTabIndex();
            onTabChange(newIndex);
        };

        tabsEl.addEventListener('tabchange', tabChangeListener);
    }

    function removeTabListener() {
        if (tabChangeListener) {
            const tabsEl = document.querySelector('[is="emby-tabs"]');
            if (tabsEl) tabsEl.removeEventListener('tabchange', tabChangeListener);
            tabChangeListener = null;
        }
    }

    /**
     * Waits for the emby-tabs element to be present in the DOM.
     * Jellyfin rebuilds this element on every library page view via setTabs().
     * @param {AbortSignal} signal
     * @returns {Promise<boolean>}
     */
    function waitForTabs(signal) {
        return new Promise(resolve => {
            if (signal.aborted) { resolve(false); return; }

            const check = () => !!document.querySelector('[is="emby-tabs"] .emby-tab-button');
            if (check()) { resolve(true); return; }

            let observerHandle = null;
            let timeoutId = null;

            const done = (result) => {
                if (observerHandle) { observerHandle.unsubscribe(); observerHandle = null; }
                if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                resolve(result);
            };

            if (signal) {
                signal.addEventListener('abort', () => done(false), { once: true });
            }

            if (JE.helpers?.onBodyMutation) {
                observerHandle = JE.helpers.onBodyMutation('library-home-tabs-detect', () => {
                    if (check()) done(true);
                });
            }

            timeoutId = setTimeout(() => done(check()), 3000);
        });
    }

    /**
     * Main handler for library page detection
     */
    async function handleLibraryPage() {
        const libraryType = getLibraryType();
        if (!libraryType) return;

        const status = await JE.jellyseerrAPI?.checkUserStatus();
        if (!status?.active) return;

        currentLibraryType = libraryType;

        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        console.debug(`${logPrefix} Detected ${libraryType} library page`);

        // Wait for Jellyfin to finish rendering tabs (setTabs rebuilds on every view)
        const tabsReady = await waitForTabs(signal);
        if (!tabsReady || signal.aborted) return;

        // Set up tab change listener
        setupTabListener();

        // Inject into the currently active tab
        const activeTab = getActiveTabIndex();
        onTabChange(activeTab);
    }

    function cleanup() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        removeTabListener();
        injectedSections.clear();
        currentLibraryType = null;
    }

    function initialize() {
        console.debug(`${logPrefix} Initializing library home discovery`);

        window.addEventListener('hashchange', () => {
            cleanup();
            handleLibraryPage();
        });

        document.addEventListener('viewshow', () => {
            cleanup();
            handleLibraryPage();
        });

        handleLibraryPage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})(window.JellyfinEnhanced);
