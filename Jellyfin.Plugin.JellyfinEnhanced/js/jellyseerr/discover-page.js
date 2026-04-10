// /js/jellyseerr/discover-page.js
// Standalone Discover page with Trending, Popular, and Upcoming sections from Seerr
(function() {
    'use strict';

    var JE = window.JellyfinEnhanced;
    if (!JE) return;

    var logPrefix = '🪼 Jellyfin Enhanced: Discover Page:';
    var sidebar = document.querySelector('.mainDrawer-scrollContainer');
    var pluginPagesExists = !!sidebar?.querySelector(
        'a[is="emby-linkbutton"][data-itemid="Jellyfin.Plugin.JellyfinEnhanced.DiscoverPage"]'
    );

    var state = {
        pageVisible: false,
        previousPage: null,
        _pluginPageVisible: false,
        _customTabContainer: null,
        loaded: false,
        loading: false
    };

    var SECTIONS = [
        { key: 'JellyseerrShowTrending', id: 'je-dp-trending', title: 'Trending', path: '/JellyfinEnhanced/jellyseerr/discover/trending' },
        { key: 'JellyseerrShowPopularMovies', id: 'je-dp-popular-movies', title: 'Popular Movies', path: '/JellyfinEnhanced/jellyseerr/discover/movies' },
        { key: 'JellyseerrShowPopularTv', id: 'je-dp-popular-tv', title: 'Popular TV', path: '/JellyfinEnhanced/jellyseerr/discover/tv' },
        { key: 'JellyseerrShowUpcoming', id: 'je-dp-upcoming-movies', title: 'Upcoming Movies', path: '/JellyfinEnhanced/jellyseerr/discover/movies/upcoming' },
        { key: 'JellyseerrShowUpcoming', id: 'je-dp-upcoming-tv', title: 'Upcoming TV', path: '/JellyfinEnhanced/jellyseerr/discover/tv/upcoming' }
    ];

    function getAuthHeaders() {
        return {
            'X-Jellyfin-User-Id': ApiClient.getCurrentUserId(),
            'X-Emby-Token': ApiClient.accessToken(),
            'Accept': 'application/json'
        };
    }

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
            return [];
        }
    }

    function createSectionElement(title, id, results) {
        var section = document.createElement('div');
        section.id = id;
        section.className = 'verticalSection verticalSection-extrabottompadding je-dp-section';

        var header = document.createElement('div');
        header.className = 'sectionTitleContainer sectionTitleContainer-cards';
        var h2 = document.createElement('h2');
        h2.className = 'sectionTitle sectionTitle-cards';
        h2.textContent = title;
        header.appendChild(h2);
        section.appendChild(header);

        var itemsContainer = document.createElement('div');
        itemsContainer.setAttribute('is', 'emby-itemscontainer');
        itemsContainer.className = 'vertical-wrap itemsContainer centered';

        var excludeLibrary = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
        var excludeBlocklisted = JE.pluginConfig?.JellyseerrExcludeBlocklistedItems === true;

        var filtered = JE.hiddenContent
            ? JE.hiddenContent.filterJellyseerrResults(results, 'discovery')
            : results;

        var seen = {};
        for (var i = 0; i < filtered.length; i++) {
            var item = filtered[i];
            if (item.mediaType === 'person') continue;
            var dedupKey = (item.mediaType || '') + '-' + item.id;
            if (seen[dedupKey]) continue;
            seen[dedupKey] = true;
            if (excludeLibrary && item.mediaInfo?.jellyfinMediaId) continue;
            if (excludeBlocklisted && item.mediaInfo?.status === 6) continue;

            var card = JE.jellyseerrUI?.createJellyseerrCard?.(item, true, true);
            if (!card) continue;
            card.classList.remove('overflowPortraitCard');
            card.classList.add('portraitCard');
            card.setAttribute('data-media-type', item.mediaType);
            itemsContainer.appendChild(card);
        }

        if (itemsContainer.childNodes.length === 0) return null;
        section.appendChild(itemsContainer);
        return section;
    }

    async function loadContent(container) {
        if (state.loading) return;
        state.loading = true;

        // Clear existing content
        while (container.firstChild) container.removeChild(container.firstChild);

        var status = await JE.jellyseerrAPI?.checkUserStatus();
        if (!status?.active) {
            var msg = document.createElement('p');
            msg.textContent = 'Seerr integration is not active or user is not linked.';
            msg.style.cssText = 'text-align:center;padding:2em;opacity:0.6;';
            container.appendChild(msg);
            state.loading = false;
            return;
        }

        var enabledSections = SECTIONS.filter(function(s) {
            return JE.pluginConfig?.[s.key] !== false;
        });

        try {
            var results = await Promise.all(enabledSections.map(function(s) {
                return fetchSection(s.path).then(function(r) { return { section: s, results: r }; });
            }));

            for (var i = 0; i < results.length; i++) {
                if (!results[i].results || results[i].results.length === 0) continue;
                var el = createSectionElement(results[i].section.title, results[i].section.id, results[i].results);
                if (el) container.appendChild(el);
            }

            state.loaded = true;
        } catch (e) {
            console.error(logPrefix, 'Error loading content:', e);
        }

        state.loading = false;
    }

    // ---- Page lifecycle ----

    function createPageContainer() {
        var page = document.getElementById('je-discover-page');
        if (!page) {
            page = document.createElement('div');
            page.id = 'je-discover-page';
            page.className = 'page type-interior mainAnimatedPage hide';
            page.setAttribute('data-title', 'Discover');
            page.setAttribute('data-backbutton', 'true');
            page.setAttribute('data-url', '#/discover');
            page.setAttribute('data-type', 'custom');

            var content = document.createElement('div');
            content.setAttribute('data-role', 'content');
            var primary = document.createElement('div');
            primary.className = 'content-primary je-discover-page';
            primary.style.cssText = 'padding-top:5em;';
            var container = document.createElement('div');
            container.id = 'je-discover-container';
            primary.appendChild(container);
            content.appendChild(primary);
            page.appendChild(content);

            var mainContent = document.querySelector('.mainAnimatedPages');
            if (mainContent) mainContent.appendChild(page);
            else document.body.appendChild(page);
        }
        return page;
    }

    function showPage() {
        if (state.pageVisible) return;
        state.pageVisible = true;

        var page = createPageContainer();
        if (!page) return;

        if (window.location.hash !== '#/discover') {
            history.pushState({ page: 'discover' }, 'Discover', '#/discover');
        }

        var activePage = document.querySelector('.mainAnimatedPage:not(.hide):not(#je-discover-page)');
        if (activePage) {
            state.previousPage = activePage;
            activePage.classList.add('hide');
            activePage.dispatchEvent(new CustomEvent('viewhide', { bubbles: true, detail: { type: 'interior' } }));
        }

        page.classList.remove('hide');
        page.dispatchEvent(new CustomEvent('viewshow', { bubbles: true, detail: { type: 'custom', isRestored: false, options: {} } }));

        var container = document.getElementById('je-discover-container');
        // Reset loaded state if container was recreated (Plugin Pages) or is empty
        if (container && state.loaded && !container.hasChildNodes()) {
            state.loaded = false;
        }
        if (container && !state.loaded) {
            loadContent(container);
        }
    }

    function hidePage() {
        if (!state.pageVisible) return;

        var page = document.getElementById('je-discover-page');
        if (page) {
            page.classList.add('hide');
            page.dispatchEvent(new CustomEvent('viewhide', { bubbles: true, detail: { type: 'custom' } }));
        }

        if (state.previousPage && document.contains(state.previousPage) && !document.querySelector('.mainAnimatedPage:not(.hide):not(#je-discover-page)')) {
            state.previousPage.classList.remove('hide');
            state.previousPage.dispatchEvent(new CustomEvent('viewshow', { bubbles: true, detail: { type: 'interior', isRestored: true } }));
        }

        state.pageVisible = false;
        state.previousPage = null;
    }

    function injectNavigation() {
        var config = JE.pluginConfig || {};
        if (!config.JellyseerrDiscoverPageEnabled) return;
        if (pluginPagesExists && config.JellyseerrDiscoverUsePluginPages) return;

        if (document.querySelector('.je-nav-discover-item')) return;

        var jellyfinEnhancedSection = document.querySelector('.jellyfinEnhancedSection');
        if (!jellyfinEnhancedSection) {
            // Try the main sidebar nav
            var navContainer = document.querySelector('.mainDrawer-scrollContainer .navMenuOptions');
            if (navContainer) jellyfinEnhancedSection = navContainer;
        }
        if (!jellyfinEnhancedSection) return;

        var navItem = document.createElement('a');
        navItem.setAttribute('is', 'emby-linkbutton');
        navItem.className = 'navMenuOption lnkMediaFolder emby-button je-nav-discover-item';
        navItem.href = '#';

        var icon = document.createElement('span');
        icon.className = 'navMenuOptionIcon material-icons';
        icon.textContent = 'explore';
        navItem.appendChild(icon);

        var label = document.createElement('span');
        label.className = 'sectionName navMenuOptionText';
        label.textContent = 'Discover';
        navItem.appendChild(label);

        navItem.addEventListener('click', function(e) {
            e.preventDefault();
            // Close sidebar on mobile
            var drawer = document.querySelector('.mainDrawer');
            if (drawer && drawer.classList.contains('mainDrawer-open')) {
                var closeBtn = document.querySelector('.mainDrawer-backdrop, .headerBackButton');
                if (closeBtn) closeBtn.click();
            }
            showPage();
        });

        jellyfinEnhancedSection.appendChild(navItem);
    }

    function handleNavigation() {
        var hash = window.location.hash;
        if (hash === '#/discover') {
            showPage();
        } else if (state.pageVisible) {
            hidePage();
        }
    }

    function interceptNavigation(e) {
        var url = e?.newURL ? new URL(e.newURL) : window.location;
        if (url.hash === '#/discover') {
            if (e?.stopImmediatePropagation) e.stopImmediatePropagation();
            if (e?.preventDefault) e.preventDefault();
            showPage();
        }
    }

    // ---- Rendering for Plugin Pages / Custom Tabs ----

    function renderPage(targetContainer) {
        var container;
        if (targetContainer) {
            state._customTabContainer = targetContainer;
            container = targetContainer;
        } else if (state._customTabContainer && document.contains(state._customTabContainer)
                   && window.location.hash.indexOf('userpluginsettings') === -1) {
            container = state._customTabContainer;
        } else {
            state._customTabContainer = null;
            createPageContainer();
            container = document.getElementById('je-discover-container');
        }

        // Reset if container was recreated or is empty
        if (container && state.loaded && !container.hasChildNodes()) {
            state.loaded = false;
        }
        if (container && !state.loaded) {
            loadContent(container);
        }
    }

    function renderForCustomTab(child) {
        renderPage(child);
    }

    function injectStyles() {
        if (document.querySelector('style[data-je-discover-page]')) return;
        var style = document.createElement('style');
        style.setAttribute('data-je-discover-page', 'true');
        style.textContent = [
            '.je-discover-page .je-dp-section { margin-bottom: 1em; }',
            '.je-discover-page .je-dp-section .sectionTitleContainer { padding-left: 0; }',
            '.je-discover-page .je-dp-section .itemsContainer { padding: 0; }',
            '.je-discover-page .je-dp-section .jellyseerr-card { margin: 0.3em; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function refresh() {
        state.loaded = false;
        state.loading = false;
        var container = document.getElementById('je-discover-container');
        if (container) loadContent(container);
    }

    // ---- Init ----

    function initialize() {
        var config = JE.pluginConfig || {};
        if (!config.JellyseerrDiscoverPageEnabled) return;
        if (!config.JellyseerrEnabled) return;

        injectStyles();

        var usingPluginPages = pluginPagesExists && config.JellyseerrDiscoverUsePluginPages;
        if (usingPluginPages) return;

        createPageContainer();
        injectNavigation();

        // Retry nav injection -- the JE sidebar section may not exist yet at load time
        var navRetries = 0;
        var navTimer = setInterval(function() {
            if (document.querySelector('.je-nav-discover-item') || ++navRetries > 50) {
                clearInterval(navTimer);
                return;
            }
            injectNavigation();
        }, 200);

        window.addEventListener('hashchange', interceptNavigation, true);
        window.addEventListener('popstate', interceptNavigation, true);
        window.addEventListener('hashchange', handleNavigation);
        window.addEventListener('popstate', handleNavigation);

        document.addEventListener('viewshow', function(e) {
            if (state.pageVisible && e.target?.id !== 'je-discover-page') {
                hidePage();
            }
        });

        handleNavigation();
    }

    JE.discoverPage = {
        initialize: initialize,
        showPage: showPage,
        hidePage: hidePage,
        renderPage: renderPage,
        renderForCustomTab: renderForCustomTab,
        injectStyles: injectStyles,
        refresh: refresh,
        loadContent: loadContent,
        get _pluginPageVisible() { return state._pluginPageVisible; },
        set _pluginPageVisible(v) { state._pluginPageVisible = v; }
    };

    JE.initializeDiscoverPage = initialize;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
