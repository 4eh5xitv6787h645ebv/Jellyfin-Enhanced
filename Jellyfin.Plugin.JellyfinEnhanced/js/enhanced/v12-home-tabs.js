// /js/enhanced/v12-home-tabs.js
// Native home tabs for JE's pages on Jellyfin 12's experimental layout.
//
// On the experimental layout the legacy home tab bar (.headerTabs, inside the display:none skinHeader)
// is never shown — instead Jellyfin surfaces "Favourites" and each library as MUI nav buttons in the
// AppBar that deep-link to `#/home?tab=N`, and the home page swaps `.tabContent[data-index=N].is-active`
// by index. We mirror exactly that: for each enabled JE page we (1) append a `.tabContent` panel to
// #indexPage and (2) clone the native Favourites nav button into the AppBar with `href="#/home?tab=N"`.
// Activation is driven purely by the `?tab=N` URL (reconcileActive), so it works for clicks AND direct
// deep-links, needs no hidden tab buttons, and never triggers React's (indices 0/1 only) tab controller.
// Content is rendered through JE's existing per-page renderers. Gated to experimental + the home page;
// self-healing against React re-renders. No-op on the legacy layout.
(function () {
    'use strict';
    var JE = window.JellyfinEnhanced;
    if (!JE) { return; }

    var BASE = 2; // native home tabs: Home(0), Favorites(1); JE tabs start at 2 (home.tsx getTabs())

    function freshChild(hostEl) { hostEl.textContent = ''; var c = document.createElement('div'); hostEl.appendChild(c); return c; }

    // Tab order. `nav` = JE's existing drawer item (presence = enabled; source of label + icon).
    // `host` = the container class each page's renderer expects. `render` = (re)render into it.
    var REGISTRY = [
        { key: 'downloads', nav: '.je-nav-downloads-item', host: 'jellyfinenhanced requests',
          render: function (h) { var c = freshChild(h); if (JE.downloadsPage && JE.downloadsPage.renderForCustomTab) { JE.downloadsPage.renderForCustomTab(c); } } },
        { key: 'calendar', nav: '.je-nav-calendar-item', host: 'jellyfinenhanced calendar',
          render: function (h) { var c = freshChild(h); if (JE.calendarPage && JE.calendarPage.renderForCustomTab) { JE.calendarPage.renderForCustomTab(c); } } },
        { key: 'hidden-content', nav: '.je-nav-hidden-content-item', host: 'jellyfinenhanced hidden-content',
          render: function (h) { var c = freshChild(h); if (JE.hiddenContentPage && JE.hiddenContentPage.renderForCustomTab) { JE.hiddenContentPage.renderForCustomTab(c); } } },
        // Bookmarks exposes no renderForCustomTab; it auto-renders into a `.sections.bookmarks` host via
        // the viewshow hook it already listens on.
        { key: 'bookmarks', nav: '.je-nav-bookmarks-item', host: 'sections bookmarks',
          render: function (h) { try { document.dispatchEvent(new CustomEvent('viewshow', { detail: { view: h.closest('.tabContent') || h } })); } catch (e) {} } }
    ];

    function isExperimental() {
        if (JE.chrome && JE.chrome.isExperimental) { return JE.chrome.isExperimental(); }
        return !!document.querySelector('header.MuiAppBar-root .MuiToolbar-root');
    }
    function isHome() { var h = location.hash; return h === '' || h === '#/' || h === '#/home' || h.indexOf('#/home?') === 0 || h.indexOf('#/home.html') === 0; }
    function indexPage() { return document.querySelector('#indexPage'); }
    function tabParam() { var m = location.hash.match(/[?&]tab=(\d+)/); return m ? parseInt(m[1], 10) : 0; }
    function favNav() { return document.querySelector('header.MuiAppBar-root a[href="#/home?tab=1"], header.MuiAppBar-root a[href="/home?tab=1"]'); }

    // Enabled pages (drawer nav item present), with label + icon, assigned a stable tab index.
    function computePages() {
        var out = [];
        REGISTRY.forEach(function (p) {
            var n = document.querySelector(p.nav);
            if (!n) { return; }
            var label = ((n.querySelector('.navMenuOptionText') || {}).textContent || '').trim() || 'Tab';
            var icon = ((n.querySelector('.material-icons') || {}).textContent || '').trim() || 'tab';
            out.push({ key: p.key, host: p.host, render: p.render, label: label, icon: icon, _index: BASE + out.length });
        });
        JE.homeTabs._pages = out;
        return out;
    }

    // (1) Content panels inside #indexPage (one per page), in index/DOM order.
    function ensurePanels(pages) {
        var ip = indexPage(); if (!ip) { return; }
        pages.forEach(function (p) {
            var tc = ip.querySelector('#je-home-tab-content-' + p.key);
            if (!tc) {
                tc = document.createElement('div');
                tc.className = 'tabContent pageTabContent je-home-tabcontent';
                tc.id = 'je-home-tab-content-' + p.key;
                tc.setAttribute('data-je-key', p.key);
                var host = document.createElement('div');
                // Native page inset: `.padded-left`/`.padded-right` give max(3.3%, safe-area-inset)
                // horizontal padding — the same spacing native pages use, so content isn't flush to the
                // edge. (`.pageTabContent` itself only adds the bottom inset for the music controls.)
                host.className = p.host + ' padded-left padded-right';
                tc.appendChild(host);
                ip.appendChild(tc);
            }
            tc.setAttribute('data-index', p._index);
        });
    }

    // (2) Visible MUI nav buttons in the AppBar — cloned from the native Favourites button so styling
    // matches exactly — each linking to `#/home?tab=N`.
    function ensureNavLinks(pages) {
        var fav = favNav(); if (!fav) { return; }
        var host = fav.parentElement; if (!host) { return; }
        pages.forEach(function (p) {
            var existing = host.querySelector('a[data-je-nav="' + p.key + '"]');
            if (existing) { existing.setAttribute('href', '#/home?tab=' + p._index); return; }
            var a = fav.cloneNode(true);
            a.setAttribute('href', '#/home?tab=' + p._index);
            a.setAttribute('data-je-nav', p.key);
            a.removeAttribute('aria-label');
            var si = a.querySelector('[class*="startIcon"]');
            if (si) {
                si.textContent = '';
                var ic = document.createElement('span');
                ic.className = 'material-icons';
                ic.setAttribute('aria-hidden', 'true');
                ic.style.fontSize = '1.4rem';
                ic.textContent = p.icon; // JE-controlled glyph name; textContent keeps it XSS-safe
                si.appendChild(ic);
            }
            // Replace the label text node(s) with our label.
            Array.prototype.slice.call(a.childNodes).forEach(function (n) { if (n.nodeType === 3) { a.removeChild(n); } });
            if (si && si.nextSibling) { a.insertBefore(document.createTextNode(p.label), si.nextSibling); }
            else { a.appendChild(document.createTextNode(p.label)); }
            host.appendChild(a);
        });
    }

    // Mobile / below-md: the nav moves into the swipeable drawer (MainDrawerContent) as ListItemLinks.
    function drawerFav() {
        var links = document.querySelectorAll('a[href="#/home?tab=1"].MuiListItemButton-root, a[href="/home?tab=1"].MuiListItemButton-root');
        for (var i = 0; i < links.length; i++) { if (links[i].closest('.MuiList-root')) { return links[i]; } }
        return null;
    }
    function ensureDrawerLinks(pages) {
        var fav = drawerFav(); if (!fav) { return; }
        var li = fav.closest('li') || fav;
        var ul = li.parentElement; if (!ul) { return; }
        pages.forEach(function (p) {
            var existing = ul.querySelector('[data-je-dnav="' + p.key + '"]');
            if (existing) {
                var ea = existing.matches('a') ? existing : existing.querySelector('a[href]');
                if (ea) { ea.setAttribute('href', '#/home?tab=' + p._index); }
                return;
            }
            var cl = li.cloneNode(true);
            cl.setAttribute('data-je-dnav', p.key);
            var a = cl.matches('a') ? cl : cl.querySelector('a[href]');
            if (a) {
                a.setAttribute('href', '#/home?tab=' + p._index);
                a.removeAttribute('aria-label');
                a.classList.remove('Mui-selected');
                // The drawer auto-closes on tap: ResponsiveDrawer wraps content in
                // <Box role="presentation" onClick={onClose}>, so our click bubbles to it like the
                // native items — no manual close needed (and adding one would re-toggle it open).
            }
            var ic = cl.querySelector('[class*="ListItemIcon"]');
            if (ic) {
                ic.textContent = '';
                var sp = document.createElement('span');
                sp.className = 'material-icons';
                sp.setAttribute('aria-hidden', 'true');
                sp.textContent = p.icon; // JE-controlled glyph name; textContent keeps it XSS-safe
                ic.appendChild(sp);
            }
            var txt = cl.querySelector('[class*="ListItemText"]');
            if (txt) { var primary = txt.querySelector('.MuiListItemText-primary') || txt.querySelector('span') || txt; primary.textContent = p.label; }
            ul.appendChild(cl);
        });
    }

    function setNavActive(activeKey) {
        document.querySelectorAll('a[data-je-nav]').forEach(function (a) {
            a.style.color = (a.getAttribute('data-je-nav') === activeKey) ? 'var(--jf-palette-primary-main, #00a4dc)' : '';
        });
        document.querySelectorAll('[data-je-dnav]').forEach(function (li) {
            var a = li.matches('a') ? li : li.querySelector('a');
            if (a) { a.classList.toggle('Mui-selected', li.getAttribute('data-je-dnav') === activeKey); }
        });
    }

    function renderIndex(index) {
        var ip = indexPage(); if (!ip) { return; }
        var tc = ip.querySelector('.je-home-tabcontent[data-index="' + index + '"]');
        if (!tc) { return; }
        var page = (JE.homeTabs._pages || []).filter(function (p) { return p.key === tc.getAttribute('data-je-key'); })[0];
        if (!page) { return; }
        var hostEl = tc.querySelector('.' + page.host.split(' ').join('.'));
        if (!hostEl) { return; }
        requestAnimationFrame(function () { try { page.render(hostEl); } catch (e) { console.warn('[JE home-tabs] render ' + page.key, e); } });
    }

    // Drive `.is-active` + render + nav highlight purely from the `?tab` URL.
    var activeRendered = null;
    function reconcileActive() {
        var ip = indexPage(); if (!ip) { return; }
        var want = tabParam();
        var mine = (JE.homeTabs._pages || []).filter(function (p) { return p._index === want; })[0];
        if (mine) {
            Array.prototype.forEach.call(ip.querySelectorAll('.tabContent'), function (c) {
                c.classList.toggle('is-active', c.getAttribute('data-index') === String(want));
            });
            setNavActive(mine.key);
            if (activeRendered !== want) { activeRendered = want; renderIndex(want); }
        } else {
            // Native tab (Home/Favorites): hide our panels, clear highlight, let native machinery manage.
            Array.prototype.forEach.call(ip.querySelectorAll('.je-home-tabcontent'), function (c) { c.classList.remove('is-active'); });
            setNavActive(null);
            activeRendered = null;
        }
    }

    function ensure() {
        if (!isExperimental() || !isHome()) { activeRendered = null; return; }
        if (!indexPage()) { return; }
        var pages = computePages();
        if (!pages.length) { return; }
        ensurePanels(pages);
        ensureNavLinks(pages);     // AppBar nav (md+); no-op on mobile (anchor absent)
        ensureDrawerLinks(pages);  // swipeable drawer nav (below-md); no-op on desktop
        reconcileActive();
    }

    // Public API (used by the toolbar shim menu).
    JE.homeTabs = JE.homeTabs || {};
    JE.homeTabs._pages = [];
    JE.homeTabs.indexOf = function (key) {
        var p = (JE.homeTabs._pages || []).filter(function (x) { return x.key === key; })[0];
        if (p) { return p._index; }
        var idx = REGISTRY.map(function (r) { return r.key; }).indexOf(key);
        return idx === -1 ? null : BASE + idx;
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
