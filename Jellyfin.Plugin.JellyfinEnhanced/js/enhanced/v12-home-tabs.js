// /js/enhanced/v12-home-tabs.js
// Native home tabs for JE's pages on Jellyfin 12's experimental (React/MUI) layout.
//
// On the experimental layout the legacy home tab bar (.headerTabs, inside the display:none
// skinHeader) is never shown. Instead Jellyfin surfaces "Favourites" and each library as MUI
// nav entries — `<Button>`s in the AppBar on desktop (UserViewNav) and `<ListItemLink>`s in the
// swipeable drawer on mobile (MainDrawerContent) — that deep-link to `#/home?tab=N`, and the home
// page swaps `.tabContent[data-index=N].is-active` by index. We mirror exactly that: for each
// enabled JE page we (1) append a `.tabContent` panel to #indexPage and (2) clone the native
// Favourites nav entry (so styling matches the active theme exactly) into whichever nav the
// breakpoint shows, pointing it at `#/home?tab=N`.
//
// Why a config-driven registry (not the hidden `.je-nav-*-item` sidebar items): JE's legacy
// sidebar section (`.jellyfinEnhancedSection`) is only ever built inside the MUI drawer, which
// mounts on the *mobile* breakpoint only — on experimental DESKTOP there is no drawer, so those
// items never exist and a DOM-scraping approach surfaces zero tabs there. Reading the page's own
// config flags instead makes the tab set identical on desktop and mobile. The gating mirrors each
// page module's `injectNavigation()` (PageEnabled AND not delegated to the Plugin Pages / Custom
// Tabs / Native Tab delivery modes) so we only surface pages that use the standalone-sidebar mode.
//
// Activation is driven purely by the `?tab=N` URL (reconcileActive), so it works for clicks AND
// direct deep-links, needs no hidden tab buttons, and never relies on React's 2-tab (Home/Fav only)
// home controller. Content renders through JE's existing per-page renderers. Gated to experimental +
// the home page; self-healing against React re-renders. No-op on the legacy / v12-stable layout.
(function () {
    'use strict';
    var JE = window.JellyfinEnhanced;
    if (!JE) { return; }
    // Hard no-op (return before installing any observer/listener) on layouts where the experimental MUI
    // chrome can never appear: Jellyfin 10.11 — whose web client is not the React rewrite, so the static
    // `#reactRoot` element is absent from index.html — and an explicitly-selected legacy v12 layout
    // (desktop/mobile/tv; can't change without a reload). The default v12 layout IS experimental, so we
    // proceed there; the MUI-chrome DOM gate (isExperimental) then keeps us inert until the AppBar exists.
    try {
        if (!document.getElementById('reactRoot')) { return; }
        var _layout = (localStorage.getItem('layout') || '').toLowerCase();
        if (_layout === 'desktop' || _layout === 'mobile' || _layout === 'tv') { return; }
    } catch (e) {}

    // `?tab` index base for our pages. Native home tabs occupy 0 (Home) and 1 (Favorites) — see
    // home.tsx getTabs(); the legacy Custom-Tabs / native-tabs.js mechanism allocates from 2 upward.
    // We deliberately use a high, fixed base so our indices are STABLE (independent of the live DOM /
    // injection timing, which matters off the home page where the legacy tab strip isn't built yet) and
    // never collide with those low indices even in a config that mixes delivery modes. The value is only
    // a `?tab` URL parameter — never shown to the user — and the native 2-tab controller no-ops on any
    // index it doesn't own, so a high value is harmless.
    var BASE = 50;
    function freshChild(hostEl) { hostEl.textContent = ''; var c = document.createElement('div'); hostEl.appendChild(c); return c; }

    // Tab registry. `enabled`/`prefix` drive the same gating the page's own injectNavigation uses;
    // `labelKey`/`fallback` feed JE.t for an i18n label; `host` is the container class each page's
    // renderer expects; `render` (re)renders the page into that host.
    // Each `render` returns true once it has (re)rendered, false if its page module hasn't loaded yet
    // (scripts load async + out of order, so v12-home-tabs.js can run before a page module exports its
    // renderer). reconcileActive only marks a tab "rendered" on a true return, so a deep-link to a JE
    // tab on a cold load retries until the renderer is ready instead of locking in a blank panel.
    var REGISTRY = [
        // `stop` pauses any background work the page started while its tab was active. Downloads'
        // renderForCustomTab starts a backend poll loop (and sets a sticky _customTabMode) that would
        // otherwise run forever once the tab is opened; we stop it whenever the tab is inactive / left.
        { key: 'downloads', enabled: 'DownloadsPageEnabled', prefix: 'Downloads',
          labelKey: 'requests_requests', fallback: 'Requests', icon: 'download',
          host: 'jellyfinenhanced requests',
          render: function (h) { if (!(JE.downloadsPage && JE.downloadsPage.renderForCustomTab)) { return false; } JE.downloadsPage.renderForCustomTab(freshChild(h)); return true; },
          stop: function () { if (JE.downloadsPage && JE.downloadsPage.stopPolling) { JE.downloadsPage.stopPolling(); } } },
        { key: 'calendar', enabled: 'CalendarPageEnabled', prefix: 'Calendar',
          labelKey: 'calendar_title', fallback: 'Calendar', icon: 'calendar_today',
          host: 'jellyfinenhanced calendar',
          render: function (h) { if (!(JE.calendarPage && JE.calendarPage.renderForCustomTab)) { return false; } JE.calendarPage.renderForCustomTab(freshChild(h)); return true; } },
        { key: 'hidden-content', enabled: 'HiddenContentEnabled', prefix: 'HiddenContent',
          labelKey: 'hidden_content_manage_title', fallback: 'Hidden Content', icon: 'visibility_off',
          host: 'jellyfinenhanced hidden-content',
          render: function (h) { if (!(JE.hiddenContentPage && JE.hiddenContentPage.renderForCustomTab)) { return false; } JE.hiddenContentPage.renderForCustomTab(freshChild(h)); return true; } },
        // Bookmarks exposes no renderForCustomTab; bookmarks-library.js runs a persistent watcher that
        // renders into any `.sections.bookmarks` host inside an active tab whenever it becomes ready
        // (independent of our activeRendered bookkeeping). We just create that host and nudge it with a
        // viewshow event, so this is always "ready" — a not-yet-loaded watcher fills the host later.
        { key: 'bookmarks', enabled: 'BookmarksEnabled', prefix: 'Bookmarks',
          labelKey: 'bookmarks_library_title', fallback: 'Bookmarks', icon: 'bookmarks',
          host: 'sections bookmarks',
          render: function (h) { try { document.dispatchEvent(new CustomEvent('viewshow', { detail: { view: h.closest('.tabContent') || h } })); } catch (e) {} return true; } }
    ];

    function isExperimental() {
        if (JE.chrome && JE.chrome.isExperimental) { return JE.chrome.isExperimental(); }
        return !!document.querySelector('header.MuiAppBar-root .MuiToolbar-root');
    }
    function isHome() { var h = location.hash; return h === '' || h === '#/' || h === '#/home' || h.indexOf('#/home?') === 0 || h.indexOf('#/home.html') === 0; }
    function indexPage() { return document.querySelector('#indexPage'); }
    function tabParam() { var m = location.hash.match(/[?&]tab=(\d+)/); return m ? parseInt(m[1], 10) : 0; }
    function favNav() { return document.querySelector('header.MuiAppBar-root a[href="#/home?tab=1"], header.MuiAppBar-root a[href="/home?tab=1"]'); }

    // i18n label with a sensible English fallback (JE.t echoes the key back when untranslated).
    function labelFor(p) {
        if (JE.t) { var t = JE.t(p.labelKey); if (t && t !== p.labelKey) { return t; } }
        return p.fallback;
    }

    // A page uses the standalone-sidebar delivery mode (the one we re-home) when it's enabled and
    // not delegated to Plugin Pages / Custom Tabs / Native Tab. Mirrors each injectNavigation().
    // (plugin.js already clears the UsePluginPages flags when the Plugin Pages plugin is absent.)
    function usesSidebarMode(p) {
        var c = JE.pluginConfig || {};
        if (!c[p.enabled]) { return false; }
        if (c[p.prefix + 'UsePluginPages']) { return false; }
        if (c[p.prefix + 'UseCustomTabs']) { return false; }
        if (c[p.prefix + 'UseNativeTab']) { return false; }
        return true;
    }

    // Enabled pages (gated on config, not on the hidden legacy DOM) assigned consecutive tab indices
    // from the first free slot after any native / native-tabs.js tabs.
    function computePages() {
        var out = [];
        REGISTRY.forEach(function (p) {
            if (!usesSidebarMode(p)) { return; }
            out.push({ key: p.key, prefix: p.prefix, host: p.host, render: p.render, label: labelFor(p), icon: p.icon, _index: BASE + out.length });
        });
        JE.homeTabs._pages = out;
        return out;
    }

    // Remove nav entries + panels for pages that are no longer eligible (e.g. a page disabled, or its
    // delivery mode changed, after a live client-config refresh). We only ever ADD elsewhere, so without
    // this a deselected page's AppBar button / drawer item / panel would linger.
    function removeStale(pages) {
        var keep = {};
        pages.forEach(function (p) { keep[p.key] = true; });
        document.querySelectorAll('a[data-je-nav]').forEach(function (a) { if (!keep[a.getAttribute('data-je-nav')]) { a.remove(); } });
        document.querySelectorAll('[data-je-dnav]').forEach(function (li) { if (!keep[li.getAttribute('data-je-dnav')]) { li.remove(); } });
        var ip = indexPage();
        if (ip) { ip.querySelectorAll('.je-home-tabcontent').forEach(function (tc) { if (!keep[tc.getAttribute('data-je-key')]) { tc.remove(); } }); }
    }

    // (1) Content panels inside #indexPage (one per page), in index/DOM order.
    function ensurePanels(pages) {
        var ip = indexPage(); if (!ip) { return; }
        pages.forEach(function (p) {
            var tc = ip.querySelector('#je-home-tab-content-' + p.key);
            if (!tc) {
                // A freshly (re)created panel is empty. If React had dropped our panels while the URL
                // stayed on this tab, reconcileActive's "already rendered" guard would otherwise leave
                // the recreated panel blank — so force a re-render pass by clearing activeRendered.
                activeRendered = null;
                tc = document.createElement('div');
                tc.className = 'tabContent pageTabContent je-home-tabcontent';
                tc.id = 'je-home-tab-content-' + p.key;
                tc.setAttribute('data-je-key', p.key);
                var host = document.createElement('div');
                // Native page inset: `.padded-left`/`.padded-right` give max(3.3%, safe-area-inset)
                // horizontal padding — the same spacing native pages use, so content isn't flush to
                // the edge. (`.pageTabContent` itself only adds the bottom inset for music controls.)
                host.className = p.host + ' padded-left padded-right';
                tc.appendChild(host);
                ip.appendChild(tc);
            }
            tc.setAttribute('data-index', p._index);
        });
    }

    // Replace a cloned native button/list-item's icon with a Material Icons glyph rendered the same
    // way MUI's <Icon> renders it (the native menu-link icon path), so size/baseline match exactly.
    function setIcon(container, iconName) {
        if (!container) { return; }
        container.textContent = '';
        var ic = document.createElement('span');
        // `MuiIcon-root MuiIcon-fontSizeMedium` mirror <Icon fontSize="medium">; inside a MUI
        // startIcon / ListItemIcon they inherit the native sizing. `notranslate` matches MUI's Icon.
        ic.className = 'material-icons notranslate MuiIcon-root MuiIcon-fontSizeMedium';
        ic.setAttribute('aria-hidden', 'true');
        ic.textContent = iconName; // JE-controlled glyph name; textContent keeps it XSS-safe
        container.appendChild(ic);
    }

    // Replace a cloned MUI Button's trailing label text node with our label.
    function setButtonLabel(a, label) {
        Array.prototype.slice.call(a.childNodes).forEach(function (n) { if (n.nodeType === 3) { a.removeChild(n); } });
        a.appendChild(document.createTextNode(label));
    }

    // ---- Per-page placement (config-driven) ----------------------------------------------------
    // Where each JE page's nav entry sits relative to the native nav. Read live from config so an
    // admin change applies on the next pass. mode = afterHome | afterFavourites | afterLibraries
    // (default) | custom; position is the 1-based index (Home=1, Favourites=2, libraries follow)
    // used only for custom.
    function tabPlacement(prefix) {
        var c = JE.pluginConfig || {};
        var pos = parseInt(c[prefix + 'TabPosition'], 10);
        return { mode: c[prefix + 'TabPlacement'] || 'afterLibraries', position: isNaN(pos) ? 0 : pos };
    }
    // Given the ordered native nav nodes (homeIdx/favIdx locate Home & Favourites within them),
    // return the node this page should be inserted AFTER.
    function anchorNode(prefix, items, homeIdx, favIdx) {
        if (!items.length) { return null; }
        var pl = tabPlacement(prefix), k;
        if (pl.mode === 'afterHome') { k = homeIdx; }
        else if (pl.mode === 'afterFavourites') { k = favIdx; }
        else if (pl.mode === 'custom') { k = homeIdx + (Math.max(1, pl.position) - 1); }
        else { k = items.length - 1; } // afterLibraries (default)
        if (k < 0) { k = 0; }
        if (k > items.length - 1) { k = items.length - 1; }
        return items[k];
    }
    // Place each JE node after its placement anchor; pages sharing an anchor stack in tab order.
    // nodeFor(p) returns (creating if needed) the element to position; items = native nav nodes.
    function placeByConfig(pages, items, homeIdx, favIdx, nodeFor) {
        var lastAt = new Map();
        pages.forEach(function (p) {
            var node = nodeFor(p); if (!node) { return; }
            var anchor = anchorNode(p.prefix, items, homeIdx, favIdx); if (!anchor) { return; }
            var after = lastAt.get(anchor) || anchor;
            var parent = after.parentElement;
            if (parent && after.nextSibling !== node) { parent.insertBefore(node, after.nextSibling); }
            lastAt.set(anchor, node);
        });
    }

    // (2) Native MUI nav buttons in the AppBar — cloned from the native Favourites button so MUI
    // styling/theme tracking matches exactly; each links to `#/home?tab=N` and is positioned per its
    // page's placement config (default: after the libraries, so libraries stay next to Favourites).
    function nativeAppbarItems(host) {
        // Native nav <a> in the Stack (Home/logo, Favourites, libraries); exclude our own buttons.
        // The overflow "More" control is a <button>, so it's excluded by the tag check.
        return Array.prototype.filter.call(host.children, function (c) {
            return c.tagName === 'A' && !c.hasAttribute('data-je-nav');
        });
    }
    function ensureNavLinks(pages) {
        var fav = favNav(); if (!fav) { return; }
        var host = fav.parentElement; if (!host) { return; }
        var items = nativeAppbarItems(host); if (!items.length) { return; }
        var favIdx = items.indexOf(fav); if (favIdx < 0) { favIdx = Math.min(1, items.length - 1); }
        var homeIdx = 0;
        for (var i = 0; i < items.length; i++) { if (items[i].getAttribute('href') === '#/') { homeIdx = i; break; } }
        placeByConfig(pages, items, homeIdx, favIdx, function (p) {
            var a = host.querySelector('a[data-je-nav="' + p.key + '"]');
            if (a) { a.setAttribute('href', '#/home?tab=' + p._index); return a; }
            a = fav.cloneNode(true);
            a.setAttribute('href', '#/home?tab=' + p._index);
            a.setAttribute('data-je-nav', p.key);
            a.removeAttribute('aria-label');
            setIcon(a.querySelector('.MuiButton-startIcon'), p.icon);
            setButtonLabel(a, p.label);
            return a; // colour applied authoritatively by setNavActive
        });
    }

    // Mobile / below-md: the nav moves into the swipeable drawer (MainDrawerContent) as ListItemLinks.
    function drawerFav() {
        var links = document.querySelectorAll('a[href="#/home?tab=1"].MuiListItemButton-root, a[href="/home?tab=1"].MuiListItemButton-root');
        for (var i = 0; i < links.length; i++) { if (links[i].closest('.MuiList-root')) { return links[i]; } }
        return null;
    }
    // Native drawer nav <li>s (across the Home/Favourites + Libraries lists), excluding our own.
    function nativeDrawerItems(root) {
        var out = [];
        root.querySelectorAll('.MuiListItem-root').forEach(function (li) {
            if (li.hasAttribute('data-je-dnav')) { return; }
            if (li.querySelector('a.MuiListItemButton-root[href]')) { out.push(li); }
        });
        return out;
    }
    function ensureDrawerLinks(pages) {
        var fav = drawerFav(); if (!fav) { return; }
        var favLi = fav.closest('li') || fav;
        var root = favLi.closest('.MuiDrawer-root') || document;
        var items = nativeDrawerItems(root); if (!items.length) { return; }
        var favIdx = items.indexOf(favLi); if (favIdx < 0) { favIdx = Math.min(1, items.length - 1); }
        var homeIdx = 0;
        for (var i = 0; i < items.length; i++) { var ha = items[i].querySelector('a[href]'); var hh = ha && ha.getAttribute('href'); if (hh === '#/home' || hh === '/home') { homeIdx = i; break; } }
        placeByConfig(pages, items, homeIdx, favIdx, function (p) {
            var cl = root.querySelector('[data-je-dnav="' + p.key + '"]');
            if (cl) { var ea = cl.matches('a') ? cl : cl.querySelector('a[href]'); if (ea) { ea.setAttribute('href', '#/home?tab=' + p._index); } return cl; }
            cl = favLi.cloneNode(true);
            cl.setAttribute('data-je-dnav', p.key);
            var a = cl.matches('a') ? cl : cl.querySelector('a[href]');
            if (a) {
                a.setAttribute('href', '#/home?tab=' + p._index);
                a.removeAttribute('aria-label');
                a.classList.remove('Mui-selected');
                // The drawer auto-closes on tap: ResponsiveDrawer wraps content in
                // <Box role="presentation" onClick={onClose}>, so our click bubbles to it like the
                // native items — no manual close needed (adding one would re-toggle it open).
            }
            setIcon(cl.querySelector('.MuiListItemIcon-root'), p.icon);
            var txt = cl.querySelector('.MuiListItemText-primary') || cl.querySelector('[class*="ListItemText"] span') || cl.querySelector('[class*="ListItemText"]');
            if (txt) { txt.textContent = p.label; }
            return cl;
        });
    }

    function setNavActive(activeKey) {
        // AppBar: tint the active button with the theme's primary colour (what MUI's color="primary"
        // text button resolves to); label + icon inherit it. Forced !important so it overrides whatever
        // colour the cloned native button baked in — if Favourites was the active/primary tab when we
        // cloned it, its emotion class carries a primary colour we can't clear by class alone. Inactive
        // => inherit (the toolbar's text colour), matching a native color="inherit" nav button.
        document.querySelectorAll('a[data-je-nav]').forEach(function (a) {
            var active = a.getAttribute('data-je-nav') === activeKey;
            a.style.setProperty('color', active ? 'var(--jf-palette-primary-main, #00a4dc)' : 'inherit', 'important');
        });
        // Drawer: the native selected state (Mui-selected on the ListItemButton).
        document.querySelectorAll('[data-je-dnav]').forEach(function (li) {
            var a = li.matches('a') ? li : li.querySelector('a');
            if (a) { a.classList.toggle('Mui-selected', li.getAttribute('data-je-dnav') === activeKey); }
        });
    }

    // Returns true once the page actually rendered, false if its renderer isn't loaded yet (caller
    // leaves the tab un-marked so a later pass retries). The panel is already .is-active (visible) when
    // this runs — reconcileActive toggles is-active first — so no rAF deferral is needed.
    function renderIndex(index) {
        var ip = indexPage(); if (!ip) { return false; }
        var tc = ip.querySelector('.je-home-tabcontent[data-index="' + index + '"]');
        if (!tc) { return false; }
        var page = (JE.homeTabs._pages || []).filter(function (p) { return p.key === tc.getAttribute('data-je-key'); })[0];
        if (!page) { return false; }
        var hostEl = tc.querySelector('.' + page.host.split(' ').join('.'));
        if (!hostEl) { return false; }
        try { return page.render(hostEl) === true; } catch (e) { console.warn('[JE home-tabs] render ' + page.key, e); return false; }
    }

    // Drive `.is-active` + render + nav highlight purely from the `?tab` URL. JE owns which home panel
    // is active on the experimental layout: we toggle is-active for the wanted index across the panels
    // WE manage — the native Home/Favourites panels plus our own — so returning from a JE tab to Home
    // re-shows the native panel even though the 2-tab React controller never tracked us. We deliberately
    // do NOT touch other `.tabContent` (e.g. panels owned by native-tabs.js for Native-Tab-mode pages),
    // which manage their own activation. (A page is only ever in one delivery mode, so the tab SETS are
    // disjoint; in the rare config that mixes Native-Tab and sidebar modes the `?tab` index space is
    // shared — a pre-existing limitation of the `?tab=N` convention.)
    var activeRendered = null;
    function managedPanels(ip) {
        var list = [];
        var ht = ip.querySelector('#homeTab'); if (ht) { list.push(ht); }
        var ft = ip.querySelector('#favoritesTab'); if (ft) { list.push(ft); }
        Array.prototype.push.apply(list, Array.prototype.slice.call(ip.querySelectorAll('.je-home-tabcontent')));
        return list;
    }
    // Pause background work (e.g. the Downloads backend poll) for the JE pages WE currently render
    // (the computePages output) except `exceptKey` (pass null to stop them all). Scoped to our own
    // sidebar-mode pages so we never stop a poll that a differently-delivered copy of the page (Plugin
    // Pages / the standalone legacy page) legitimately runs. Idempotent — each stop() clears its timer.
    function stopBackground(exceptKey) {
        var managed = {};
        (JE.homeTabs._pages || []).forEach(function (p) { managed[p.key] = true; });
        REGISTRY.forEach(function (p) {
            if (p.stop && managed[p.key] && p.key !== exceptKey) { try { p.stop(); } catch (e) {} }
        });
    }

    // Bounded retry backstop: a page module can finish loading (its script runs in <head>) and expose
    // its renderer WITHOUT mutating document.body — so the body MutationObserver / viewshow / hashchange
    // wouldn't re-fire ensure(), and a deep-linked active tab whose renderer wasn't ready could stay
    // blank past the 800/2000ms one-shots. When renderIndex defers (renderer not loaded yet), poll a few
    // more times; cancelled as soon as the active tab renders or the user leaves it.
    var retryTimer = null, retryCount = 0;
    function scheduleRenderRetry() {
        if (retryTimer || retryCount >= 20) { return; }
        retryTimer = setTimeout(function () { retryTimer = null; retryCount++; ensure(); }, 1000);
    }
    function cancelRenderRetry() { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } retryCount = 0; }

    function reconcileActive() {
        var ip = indexPage(); if (!ip) { return; }
        var want = tabParam();
        managedPanels(ip).forEach(function (c) {
            c.classList.toggle('is-active', c.getAttribute('data-index') === String(want));
        });
        var mine = (JE.homeTabs._pages || []).filter(function (p) { return p._index === want; })[0];
        if (mine) {
            setNavActive(mine.key);
            // Only mark rendered once the renderer actually ran; otherwise retry (body mutations may not
            // fire when a module becomes ready, so drive our own bounded retry).
            if (activeRendered !== want) {
                if (renderIndex(want)) { activeRendered = want; cancelRenderRetry(); }
                else { scheduleRenderRetry(); }
            }
            stopBackground(mine.key);   // the active tab keeps running; pause every other tab's work
        } else {
            // Native tab (Home/Favorites): clear our highlight; native controller owns its content.
            setNavActive(null);
            stopBackground(null);
            cancelRenderRetry();
            activeRendered = null;
        }
    }

    function ensure() {
        // Off the experimental layout (e.g. the AppBar-less #/video playback route): pause our tabs'
        // background work so a tab we rendered isn't left polling during playback. stopBackground is
        // scoped to the pages WE rendered (JE.homeTabs._pages), which is only ever populated on the
        // experimental layout — so this can't touch a standalone legacy page's polling (10.11 never
        // reaches this module at all; it bailed at load via the #reactRoot guard).
        if (!isExperimental()) { stopBackground(null); cancelRenderRetry(); activeRendered = null; return; }
        var pages = computePages();
        removeStale(pages); // drop nav/panels for pages that became ineligible (live config change)
        if (!pages.length) { cancelRenderRetry(); activeRendered = null; return; }
        // Nav entries are surfaced on EVERY experimental route (like the native Favourites/library nav),
        // so JE's tabs are reachable from any page — not only after the user is already on home.
        ensureNavLinks(pages);     // AppBar nav (md+); no-op on mobile (anchor absent)
        ensureDrawerLinks(pages);  // swipeable drawer nav (below-md); no-op on desktop
        if (isHome() && indexPage()) {
            ensurePanels(pages);   // content panels only exist on the home page (#indexPage)
            reconcileActive();     // activate + render the URL's tab; pause the other tabs' background work
        } else {
            // Off the home page nothing of ours is shown: clear the highlight + pause background work.
            setNavActive(null);
            stopBackground(null);
            cancelRenderRetry();
            activeRendered = null;
        }
    }

    // Public API (used by the toolbar shim menu to jump to a tab by key).
    JE.homeTabs = JE.homeTabs || {};
    JE.homeTabs._pages = [];
    JE.homeTabs.indexOf = function (key) {
        var p = (JE.homeTabs._pages || []).filter(function (x) { return x.key === key; })[0];
        return p ? p._index : null;
    };
    JE.homeTabs.goTo = function (key) {
        var idx = JE.homeTabs.indexOf(key);
        if (idx != null) { location.hash = '#/home?tab=' + idx; }
    };

    // Lifecycle: self-healing against React re-renders.
    var t = null;
    function schedule() { clearTimeout(t); t = setTimeout(ensure, 120); }
    var obs = new MutationObserver(schedule);
    function start() { obs.observe(document.body, { childList: true, subtree: true }); ensure(); }
    document.addEventListener('viewshow', schedule, true);
    window.addEventListener('hashchange', schedule);
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
    setTimeout(ensure, 800);
    setTimeout(ensure, 2000);

    console.log('🪼 Jellyfin Enhanced: v12 native home tabs active.');
})();
