// /js/enhanced/v12-chrome-shim.js
// Jellyfin 12 experimental-layout chrome re-home.
//
// On v12's default experimental (React/MUI) layout the legacy header/drawer that JE injects into is
// rendered empty + display:none, so JE's Enhanced settings button, custom tabs, and header buttons
// land in invisible DOM. JE still CREATES those elements (the hidden legacy chrome is present), and
// the custom-tab page content still mounts into the React-stable .mainAnimatedPages — only the entry
// points are invisible. This shim detects the MUI chrome and surfaces those entry points on the MUI
// toolbar: a "Jellyfin Enhanced" button opens the settings panel, and the standalone header buttons
// (random, active-streams) are re-parented into the toolbar. JE's pages get native AppBar nav tabs
// via v12-home-tabs.js. On the legacy layout this is a no-op (JE's normal injection is unchanged).
// Self-healing against MUI re-renders.
(function () {
    'use strict';
    var JE = window.JellyfinEnhanced;
    if (!JE) { return; }

    var BTN_ID = 'je-mui-enhanced';

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
                if (JE.showEnhancedPanel) { JE.showEnhancedPanel(); }
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
