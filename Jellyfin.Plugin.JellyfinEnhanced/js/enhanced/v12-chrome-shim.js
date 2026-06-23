// /js/enhanced/v12-chrome-shim.js
// Jellyfin 12 experimental-layout chrome re-home.
//
// On v12's default experimental (React/MUI) layout the legacy header/drawer that JE injects into is
// rendered empty + display:none, so JE's Enhanced settings button, custom tabs, and header buttons
// land in invisible DOM. JE still CREATES those elements (the hidden legacy chrome is present), and
// the custom-tab page content still mounts into the React-stable .mainAnimatedPages — only the entry
// points are invisible. This shim detects the MUI chrome and surfaces those entry points on the MUI
// toolbar: a single "Jellyfin Enhanced" toolbar button opens a menu (Enhanced Panel + each custom
// tab), and the standalone header buttons are re-parented into the toolbar. On the legacy layout it
// is a no-op (JE's normal injection is unchanged). Self-healing against MUI re-renders.
(function () {
    'use strict';
    var JE = window.JellyfinEnhanced;
    if (!JE) { return; }

    var BTN_ID = 'je-mui-enhanced';
    var MENU_ID = 'je-mui-enhanced-menu';

    function muiToolbar() { return document.querySelector('header.MuiAppBar-root .MuiToolbar-root'); }

    // Shared chrome helpers (other modules may use these; fall back to legacy on the legacy layout).
    JE.chrome = JE.chrome || {};
    JE.chrome.isExperimental = function () { return !!muiToolbar(); };
    JE.chrome.getHeaderHeight = function () {
        var bar = document.querySelector('header.MuiAppBar-root');
        if (bar) { return bar.getBoundingClientRect().height; }
        var sh = document.querySelector('.skinHeader');
        return sh ? sh.getBoundingClientRect().height : 0;
    };

    function muiIconButton(id, icon, title) {
        var b = document.createElement('button');
        b.id = id;
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.className = 'MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeLarge je-mui-toolbar-btn';
        b.style.cssText = 'color:inherit;padding:12px;border-radius:50%;background:transparent;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;';
        b.innerHTML = '<span class="material-icons" aria-hidden="true">' + icon + '</span>';
        return b;
    }

    // Discover JE's custom-tab nav items (created in the hidden legacy drawer) so we can mirror them.
    function customTabItems() {
        var sels = ['.je-nav-downloads-item', '.je-nav-calendar-item', '.je-nav-hidden-content-item', '.je-nav-bookmarks-item'];
        var out = [];
        sels.forEach(function (s) {
            document.querySelectorAll(s).forEach(function (el) {
                if (out.some(function (o) { return o.el === el; })) { return; }
                var label = (el.querySelector('.navMenuOptionText') || {}).textContent || el.textContent || 'Tab';
                var iconEl = el.querySelector('.material-icons');
                out.push({ el: el, label: label.trim(), icon: (iconEl ? iconEl.textContent.trim() : 'tab') });
            });
        });
        return out;
    }

    function closeMenu() {
        var m = document.getElementById(MENU_ID);
        if (m) { m.remove(); }
        document.removeEventListener('click', onDocClick, true);
    }
    function onDocClick(e) {
        var m = document.getElementById(MENU_ID);
        if (m && !m.contains(e.target) && e.target.id !== BTN_ID && !(e.target.closest && e.target.closest('#' + BTN_ID))) {
            closeMenu();
        }
    }

    function openMenu(anchor) {
        closeMenu();
        var paper = 'var(--jf-palette-background-paper, #202020)';
        var text = 'var(--jf-palette-text-primary, #fff)';
        var hover = 'var(--jf-palette-action-hover, rgba(255,255,255,0.08))';
        var accent = 'var(--jf-palette-primary-main, #00a4dc)';
        var menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.setAttribute('role', 'menu');
        var r = anchor.getBoundingClientRect();
        menu.style.cssText = 'position:fixed;z-index:100000;min-width:15em;top:' + (r.bottom + 4) + 'px;right:' +
            Math.max(8, (window.innerWidth - r.right)) + 'px;background:' + paper + ';color:' + text +
            ';border-radius:0.4em;box-shadow:0 6px 24px rgba(0,0,0,0.5);padding:0.4em 0;contain:layout style paint;' +
            'opacity:0;transform:translateY(-4px);transition:opacity .15s ease-out,transform .15s ease-out;';

        var items = [{ icon: 'tune', label: 'Enhanced Panel', action: function () { if (JE.showEnhancedPanel) { JE.showEnhancedPanel(); } } }];
        customTabItems().forEach(function (t) {
            items.push({ icon: t.icon, label: t.label, action: function () { t.el.click(); } });
        });

        items.forEach(function (it) {
            var row = document.createElement('button');
            row.type = 'button';
            row.setAttribute('role', 'menuitem');
            row.style.cssText = 'display:flex;align-items:center;gap:0.7em;width:100%;padding:0.65em 1.1em;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer;text-align:left;';
            row.innerHTML = '<span class="material-icons" aria-hidden="true" style="color:' + accent + ';font-size:1.3em;">' + it.icon + '</span><span></span>';
            row.lastChild.textContent = it.label;
            row.addEventListener('mouseenter', function () { row.style.background = hover; });
            row.addEventListener('mouseleave', function () { row.style.background = 'transparent'; });
            row.addEventListener('click', function (e) { e.stopPropagation(); closeMenu(); try { it.action(); } catch (err) { console.warn('[JE v12 shim]', err); } });
            menu.appendChild(row);
        });

        document.body.appendChild(menu);
        requestAnimationFrame(function () { menu.style.opacity = '1'; menu.style.transform = 'none'; });
        setTimeout(function () { document.addEventListener('click', onDocClick, true); }, 0);
    }

    // Re-home: only on the experimental layout (MUI toolbar present); no-op on legacy.
    function rehome() {
        var bar = muiToolbar();
        if (!bar) { return; }
        // C-3: v12 removed --primary-accent-color; map it to the MUI palette so JE's accents track
        // the active v12 theme. Only runs on experimental (where --primary-accent-color is undefined),
        // so 10.11 community-theme accents are untouched.
        if (!document.getElementById('je-v12-accent-fix')) {
            var st = document.createElement('style');
            st.id = 'je-v12-accent-fix';
            st.textContent = 'html{--primary-accent-color:var(--jf-palette-primary-main, #00a4dc);}';
            document.head.appendChild(st);
        }
        if (!bar.querySelector('#' + BTN_ID)) {
            var btn = muiIconButton(BTN_ID, 'tune', 'Jellyfin Enhanced');
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (document.getElementById(MENU_ID)) { closeMenu(); } else { openMenu(btn); }
            });
            bar.appendChild(btn);
        }
        // Re-parent the standalone header buttons (created in the hidden legacy .headerRight).
        ['#randomItemButtonContainer', '#je-active-streams'].forEach(function (sel) {
            var el = document.querySelector(sel);
            if (el && el.parentElement !== bar && !bar.contains(el)) {
                bar.insertBefore(el, bar.querySelector('#' + BTN_ID) || null);
            }
        });
    }

    // Self-healing: MUI reconciles the toolbar, so re-assert (debounced + idempotent).
    var t = null;
    function schedule() { clearTimeout(t); t = setTimeout(rehome, 120); }
    var obs = new MutationObserver(schedule);
    function start() {
        var host = document.querySelector('header.MuiAppBar-root') || document.body;
        obs.observe(host, { childList: true, subtree: true });
        rehome();
    }
    document.addEventListener('viewshow', schedule, true);
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
    // Re-check shortly after load (MUI mounts asynchronously).
    setTimeout(rehome, 800);
    setTimeout(rehome, 2000);

    console.log('🪼 Jellyfin Enhanced: v12 chrome shim active (experimental layout re-home).');
})();
