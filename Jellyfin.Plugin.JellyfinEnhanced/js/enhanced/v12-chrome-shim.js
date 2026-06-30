// /js/enhanced/v12-chrome-shim.js
// Jellyfin 12 experimental-layout (React/MUI) chrome re-home.
//
// On v12's default experimental layout the legacy header/drawer JE injects into is rendered empty +
// display:none, so JE's Enhanced-settings entry point and standalone header buttons land in invisible
// DOM. This shim surfaces them natively on the MUI toolbar: a "Jellyfin Enhanced" IconButton (built
// to match the native toolbar buttons — same classes/size/ripple, placed in the right-hand action
// group beside Search, before the user-menu avatar) opens the settings panel, and the standalone
// header buttons (random, active-streams) are re-parented into that same group. JE's pages get native
// AppBar/drawer nav via v12-home-tabs.js; to avoid a duplicate, the legacy "Jellyfin Enhanced"
// sidebar section (which on experimental ends up inside the MUI mobile drawer) is hidden here.
//
// Self-healing against MUI re-renders. No-op on the legacy / v12-stable layout (no MUI toolbar) so
// the 10.11 path is byte-identical.
(function () {
    'use strict';
    var JE = window.JellyfinEnhanced;
    if (!JE) { return; }

    // Hard no-op (return before installing any observer/listener) where the experimental MUI chrome can
    // never appear: Jellyfin 10.11 — not the React rewrite, so the static `#reactRoot` is absent — and an
    // explicitly-selected legacy v12 layout (desktop/mobile/tv; can't change without a reload). The
    // default v12 layout is experimental, so we proceed; the muiToolbar() gate then keeps this inert.
    try {
        if (!document.getElementById('reactRoot')) { return; }
        var _layout = (localStorage.getItem('layout') || '').toLowerCase();
        if (_layout === 'desktop' || _layout === 'mobile' || _layout === 'tv') { return; }
    } catch (e) {}

    var BTN_ID = 'je-mui-enhanced';

    function muiToolbar() { return document.querySelector('header.MuiAppBar-root .MuiToolbar-root'); }

    // Shared chrome helpers (other modules use these; fall back to legacy on the legacy layout).
    JE.chrome = JE.chrome || {};
    JE.chrome.isExperimental = function () { return !!muiToolbar(); };
    JE.chrome.getHeaderHeight = function () {
        var bar = document.querySelector('header.MuiAppBar-root');
        if (bar) { return bar.getBoundingClientRect().height; }
        var sh = document.querySelector('.skinHeader');
        return sh ? sh.getBoundingClientRect().height : 0;
    };

    // A native toolbar IconButton to mirror (Search / SyncPlay / Cast — NOT the user-menu avatar,
    // which sits in its own trailing box). Cloning its class list copies the emotion-generated sizing
    // class so our button gets native padding/hover/shape for free, version-agnostically.
    function refIconButton(bar) {
        return bar.querySelector('header.MuiAppBar-root .MuiIconButton-root:not([aria-label="User Menu"])') ||
               document.querySelector('header.MuiAppBar-root .MuiIconButton-root:not([aria-label="User Menu"])');
    }

    // The right-hand action group (the Box that holds Search/SyncPlay/Cast). The user-menu avatar
    // lives in a separate trailing Box, so appending here keeps our button to the LEFT of the avatar.
    function actionGroup(bar, ref) {
        if (ref) { var box = ref.closest('.MuiBox-root'); if (box) { return box; } }
        return null;
    }

    function buildEnhancedButton(ref) {
        var b = document.createElement('button');
        b.id = BTN_ID;
        b.type = 'button';
        b.title = 'Jellyfin Enhanced';
        b.setAttribute('aria-label', 'Jellyfin Enhanced');
        // Inherit the native IconButton classes (incl. the emotion sizing class) when we have a
        // reference; otherwise fall back to the stable MUI marker classes + a minimal approximation.
        b.className = (ref ? ref.className + ' ' : 'MuiButtonBase-root MuiIconButton-root MuiIconButton-colorInherit MuiIconButton-sizeLarge ') + 'je-mui-toolbar-btn';
        if (!ref) { b.style.cssText = 'color:inherit;padding:12px;border-radius:50%;background:transparent;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;'; }
        var icon = document.createElement('span');
        icon.className = 'material-icons notranslate';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'tune';
        b.appendChild(icon);
        // Match the DOM shape of a native IconButton (the ripple container) when we can.
        if (ref) { var ripple = ref.querySelector('.MuiTouchRipple-root'); if (ripple) { var r = ripple.cloneNode(false); r.textContent = ''; b.appendChild(r); } }
        b.addEventListener('click', function (e) {
            e.stopPropagation();
            if (JE.showEnhancedPanel) { JE.showEnhancedPanel(); }
        });
        return b;
    }

    function ensureDedupStyle() {
        if (document.getElementById('je-v12-dedup-style')) { return; }
        var st = document.createElement('style');
        st.id = 'je-v12-dedup-style';
        // The legacy "Jellyfin Enhanced" sidebar section is, on experimental, injected into the MUI
        // mobile drawer (the only place getSidebarContainer resolves). v12-home-tabs.js provides the
        // native nav + this shim provides the settings button, so hide the legacy duplicate. Scoped
        // to .MuiDrawer-root so it only ever matches the experimental layout (legacy has no MUI drawer).
        st.textContent = '.MuiDrawer-root .jellyfinEnhancedSection{display:none !important;}';
        document.head.appendChild(st);
    }

    function ensureAccentVar() {
        // v12 removed --primary-accent-color; map it to the MUI palette so JE's accents track the
        // active v12 theme. Experimental-only (where it's undefined), so 10.11 community-theme accents
        // are untouched.
        if (document.getElementById('je-v12-accent-fix')) { return; }
        var st = document.createElement('style');
        st.id = 'je-v12-accent-fix';
        st.textContent = 'html{--primary-accent-color:var(--jf-palette-primary-main, #00a4dc);}';
        document.head.appendChild(st);
    }

    // Re-home: only on the experimental layout (MUI toolbar present); no-op on legacy.
    function rehome() {
        var bar = muiToolbar();
        if (!bar) { return; }
        ensureAccentVar();
        ensureDedupStyle();

        var ref = refIconButton(bar);
        // Prefer JE's own helper — it returns the toolbar's native action group (the Search/SyncPlay
        // Box, before the user-menu avatar) and is the SAME container features.js / active-streams.js
        // place the random + active-streams buttons into, so our button sits beside them. Fall back to
        // locating the group ourselves.
        var group = (JE.helpers && JE.helpers.getHeaderRightContainer && JE.helpers.getHeaderRightContainer()) || actionGroup(bar, ref) || bar;

        // Belt-and-suspenders: if the standalone header buttons ended up in the hidden legacy chrome
        // (rather than the action group), pull them into the group. Guarded so we never fight the
        // placement features.js / active-streams.js already perform via getHeaderRightContainer().
        ['#randomItemButtonContainer', '#je-active-streams'].forEach(function (sel) {
            var el = document.querySelector(sel);
            if (el && el.parentElement !== group && !group.contains(el)) { group.appendChild(el); }
        });

        var btn = document.getElementById(BTN_ID);
        if (!btn) { btn = buildEnhancedButton(ref); }
        // Keep our button last within the action group (rightmost before the avatar).
        if (btn.parentElement !== group || group.lastElementChild !== btn) { group.appendChild(btn); }
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
