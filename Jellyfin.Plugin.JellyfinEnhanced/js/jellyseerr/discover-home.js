// /js/jellyseerr/discover-home.js
// Injects Trending, Popular, and Upcoming sections from Seerr onto the Jellyfin home page
(function(JE) {
    'use strict';

    var logPrefix = '🪼 Jellyfin Enhanced: Discover Home:';
    var injected = false;
    var currentAbortController = null;

    /** Section definitions -- each maps to a Seerr endpoint */
    var SECTIONS = [
        { key: 'JellyseerrShowTrending', id: 'je-discover-trending', title: 'Trending', path: '/JellyfinEnhanced/jellyseerr/discover/trending' },
        { key: 'JellyseerrShowPopularMovies', id: 'je-discover-popular-movies', title: 'Popular Movies', path: '/JellyfinEnhanced/jellyseerr/discover/movies' },
        { key: 'JellyseerrShowPopularTv', id: 'je-discover-popular-tv', title: 'Popular TV', path: '/JellyfinEnhanced/jellyseerr/discover/tv' },
        { key: 'JellyseerrShowUpcoming', id: 'je-discover-upcoming-movies', title: 'Upcoming Movies', path: '/JellyfinEnhanced/jellyseerr/discover/movies/upcoming' },
        { key: 'JellyseerrShowUpcoming', id: 'je-discover-upcoming-tv', title: 'Upcoming TV', path: '/JellyfinEnhanced/jellyseerr/discover/tv/upcoming' }
    ];

    function isOnHomePage() {
        var hash = window.location.hash;
        return hash === '' || hash === '#/' || hash === '#/home' || hash === '#/home.html'
            || hash.indexOf('#/home?') !== -1 || hash.indexOf('#/home.html?') !== -1;
    }

    function getAuthHeaders() {
        return {
            'X-Jellyfin-User-Id': ApiClient.getCurrentUserId(),
            'X-Emby-Token': ApiClient.accessToken(),
            'Accept': 'application/json'
        };
    }

    /**
     * Fetches discover data from a Seerr endpoint.
     * @param {string} path - API path
     * @param {AbortSignal} [signal]
     * @returns {Promise<Array>} Results array
     */
    async function fetchSection(path, signal) {
        try {
            var url = ApiClient.getUrl(path + '?page=1');
            var response = await fetch(url, { headers: getAuthHeaders(), signal: signal });
            if (!response.ok) {
                console.debug(logPrefix, 'HTTP', response.status, 'for', path);
                return [];
            }
            var data = await response.json();
            return data.results || [];
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            console.debug(logPrefix, 'Fetch failed for', path, e.message);
            return [];
        }
    }

    /**
     * Creates a horizontal scrolling card row section.
     * @param {string} title - Section title
     * @param {string} id - DOM id for the section
     * @param {Array} results - Media items from Seerr
     * @returns {HTMLElement}
     */
    function createSection(title, id, results) {
        var section = document.createElement('div');
        section.id = id;
        section.className = 'verticalSection verticalSection-extrabottompadding je-discover-home-section';

        var header = document.createElement('div');
        header.className = 'sectionTitleContainer sectionTitleContainer-cards padded-left';
        var h2 = document.createElement('h2');
        h2.className = 'sectionTitle sectionTitle-cards';
        h2.textContent = title;
        header.appendChild(h2);
        section.appendChild(header);

        var scroller = document.createElement('div');
        scroller.setAttribute('is', 'emby-scroller');
        scroller.className = 'padded-top-focusscale padded-bottom-focusscale emby-scroller';
        scroller.dataset.horizontal = 'true';
        scroller.dataset.centerfocus = 'card';

        var itemsContainer = document.createElement('div');
        itemsContainer.setAttribute('is', 'emby-itemscontainer');
        itemsContainer.className = 'focuscontainer-x itemsContainer scrollSlider';

        var excludeLibrary = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
        var excludeBlocklisted = JE.pluginConfig?.JellyseerrExcludeBlocklistedItems === true;

        // Filter hidden content
        var filtered = JE.hiddenContent
            ? JE.hiddenContent.filterJellyseerrResults(results, 'discovery')
            : results;

        var seen = {};
        for (var i = 0; i < filtered.length; i++) {
            var item = filtered[i];
            var dedupKey = (item.mediaType || '') + '-' + item.id;
            if (seen[dedupKey]) continue;
            seen[dedupKey] = true;

            if (excludeLibrary && item.mediaInfo?.jellyfinMediaId) continue;
            if (excludeBlocklisted && item.mediaInfo?.status === 6) continue;

            var card = JE.jellyseerrUI?.createJellyseerrCard?.(item, true, true);
            if (!card) continue;

            // Ensure correct card class for horizontal scroller
            card.classList.remove('portraitCard');
            card.classList.add('overflowPortraitCard');
            card.setAttribute('data-media-type', item.mediaType);

            itemsContainer.appendChild(card);
        }

        if (itemsContainer.childNodes.length === 0) return null;

        scroller.appendChild(itemsContainer);
        section.appendChild(scroller);
        return section;
    }

    /**
     * Injects all enabled discover sections into the home page.
     */
    async function injectSections() {
        if (!isOnHomePage()) return;
        if (injected) return;
        if (!JE.pluginConfig?.JellyseerrEnabled) return;

        // Check Seerr user status
        var status = await JE.jellyseerrAPI?.checkUserStatus();
        if (!status?.active) return;

        // Find the home page container
        var homeContainer = document.querySelector('.homeSectionsContainer');
        if (!homeContainer) {
            // Fallback: look for the active home page content area
            var homePage = document.querySelector('#indexPage .padded-top-focusscale, .mainAnimatedPage:not(.hide) .homeSectionsContainer');
            if (homePage) homeContainer = homePage;
        }
        if (!homeContainer) {
            console.debug(logPrefix, 'Home container not found');
            return;
        }

        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();
        var signal = currentAbortController.signal;

        injected = true;

        // Determine which sections are enabled
        var enabledSections = SECTIONS.filter(function(s) {
            return JE.pluginConfig?.[s.key] !== false;
        });

        if (enabledSections.length === 0) return;

        // Fetch all enabled sections in parallel
        var fetchPromises = enabledSections.map(function(s) {
            return fetchSection(s.path, signal).then(function(results) {
                return { section: s, results: results };
            });
        });

        try {
            var allResults = await Promise.all(fetchPromises);
            if (signal.aborted) return;

            for (var i = 0; i < allResults.length; i++) {
                var entry = allResults[i];
                if (!entry.results || entry.results.length === 0) continue;

                // Don't re-inject if already present
                if (document.getElementById(entry.section.id)) continue;

                var sectionEl = createSection(entry.section.title, entry.section.id, entry.results);
                if (sectionEl) {
                    homeContainer.appendChild(sectionEl);
                }
            }

            console.debug(logPrefix, 'Injected discover sections onto home page');
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.error(logPrefix, 'Error injecting sections:', e);
        }
    }

    /**
     * Cleanup on navigation away from home page.
     */
    function cleanup() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        // Remove injected sections
        var sections = document.querySelectorAll('.je-discover-home-section');
        sections.forEach(function(s) { s.remove(); });
        injected = false;
    }

    /**
     * Handle navigation.
     */
    function handleNavigation() {
        if (isOnHomePage()) {
            // Wait for home page DOM to be ready before injecting
            requestAnimationFrame(function() {
                setTimeout(function() { injectSections(); }, 500);
            });
        } else {
            cleanup();
        }
    }

    function initialize() {
        window.addEventListener('hashchange', handleNavigation);
        document.addEventListener('viewshow', function() {
            if (isOnHomePage()) handleNavigation();
        });
        // Initial check
        handleNavigation();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})(window.JellyfinEnhanced || {});
