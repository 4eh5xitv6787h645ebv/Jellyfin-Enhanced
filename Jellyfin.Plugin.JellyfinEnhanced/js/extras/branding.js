// /js/extras/branding.js
/**
 * @file Applies admin-uploaded custom branding images (favicon, apple touch
 * icon, header logo, login banners) to the web client at runtime, served from
 * Jellyfin Enhanced's own /JellyfinEnhanced/BrandingImage endpoint.
 *
 * This replaces the previous hard dependency on the third-party File
 * Transformation plugin for branding. When File Transformation IS installed it
 * still rewrites the default asset bytes at request time (covering edge cases
 * like the pre-JS favicon request); this module works either way.
 *
 * Honest limitations (documented in the config page too): assets referenced
 * outside the live DOM cannot be replaced at runtime — the PWA manifest icon
 * used by installed web apps, and icons baked into native apps. Those still
 * require modifying jellyfin-web's files on disk (or File Transformation).
 */
(function() {
    'use strict';

    // Loaded both pre-login (early branding) and in the main component batch —
    // keep a single instance so observers/listeners are never doubled.
    if (window.JellyfinEnhanced?.initializeBranding) return;

    const RETRY_DELAYS_MS = [0, 500, 1500, 3000, 6000, 12000];

    let brandingFiles = {};   // fileName -> last-write ticks (cache buster), from public-config
    let sweepsArmed = false;  // one-time retry sweeps after the first init
    let observerWiring = 'none'; // 'none' | 'fallback' | 'helpers'

    /** Builds the cache-busted URL for an uploaded branding file. */
    function brandingUrl(fileName) {
        return ApiClient.getUrl('/JellyfinEnhanced/BrandingImage') +
            `?fileName=${encodeURIComponent(fileName)}&v=${brandingFiles[fileName]}`;
    }

    function has(fileName) {
        return Object.prototype.hasOwnProperty.call(brandingFiles, fileName);
    }

    /**
     * Points every <link rel="icon"/"shortcut icon"> at the uploaded favicon,
     * creating a link element if the page somehow has none.
     */
    function applyFavicon() {
        if (!has('favicon.ico')) return;
        const url = brandingUrl('favicon.ico');
        const links = document.querySelectorAll('link[rel~="icon"]');
        if (links.length === 0) {
            const link = document.createElement('link');
            link.rel = 'icon';
            link.href = url;
            document.head.appendChild(link);
            return;
        }
        links.forEach((link) => {
            if (link.dataset.jeBranded === String(brandingFiles['favicon.ico'])) return;
            link.dataset.jeBranded = String(brandingFiles['favicon.ico']);
            link.href = url;
        });
    }

    /** Same as applyFavicon but for the iOS home-screen icon. */
    function applyAppleTouchIcon() {
        if (!has('apple-touch-icon.png')) return;
        const url = brandingUrl('apple-touch-icon.png');
        const links = document.querySelectorAll('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]');
        if (links.length === 0) {
            const link = document.createElement('link');
            link.rel = 'apple-touch-icon';
            link.href = url;
            document.head.appendChild(link);
            return;
        }
        links.forEach((link) => {
            if (link.dataset.jeBranded === String(brandingFiles['apple-touch-icon.png'])) return;
            link.dataset.jeBranded = String(brandingFiles['apple-touch-icon.png']);
            link.href = url;
        });
    }

    /**
     * Rewrites <img> tags whose src points at one of Jellyfin's stock logo
     * assets to the uploaded replacement. Marks processed elements via a data
     * attribute so repeated sweeps stay cheap and never loop on our own URLs.
     */
    function applyImgSwaps() {
        const swaps = [
            { file: 'icon-transparent.png', match: 'icon-transparent' },
            { file: 'banner-light.png', match: 'banner-light' },
            { file: 'banner-dark.png', match: 'banner-dark' }
        ];
        swaps.forEach((swap) => {
            if (!has(swap.file)) return;
            const stamp = String(brandingFiles[swap.file]);
            document.querySelectorAll('img').forEach((img) => {
                if (img.dataset.jeBranded === stamp) return;
                const src = img.getAttribute('src') || '';
                if (!src || src.indexOf('BrandingImage') !== -1) return; // never rewrite our own URLs
                if (src.indexOf(swap.match) === -1) return;
                img.dataset.jeBranded = stamp;
                img.src = brandingUrl(swap.file);
            });
        });
    }

    /**
     * Some pages render the header logo as a CSS background
     * (.pageTitleWithDefaultLogo) rather than an <img>. Inject one small
     * override using that stable jellyfin-web class. No generated/MUI class
     * names are targeted.
     */
    function applyCssOverrides() {
        if (!has('icon-transparent.png')) return;
        const styleId = 'je-branding-css';
        const css = `.pageTitleWithDefaultLogo { background-image: url("${brandingUrl('icon-transparent.png')}") !important; }`;
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            (document.head || document.documentElement).appendChild(style);
        }
        if (style.textContent !== css) style.textContent = css;
    }

    /** Runs every replacement pass once. Safe to call repeatedly. */
    function applyAll() {
        try {
            applyFavicon();
            applyAppleTouchIcon();
            applyImgSwaps();
            applyCssOverrides();
        } catch (e) {
            console.warn('🪼 Jellyfin Enhanced: branding apply failed:', e);
        }
    }

    /**
     * Entry point. Called pre-login by plugin.js with the public config (so the
     * login page logo/favicon are branded before authentication) and again after
     * the main initialization to wire SPA re-render coverage.
     * @param {object} publicConfig - The /JellyfinEnhanced/public-config payload.
     */
    function initializeBranding(publicConfig) {
        const files = publicConfig?.BrandingFiles;
        if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
            return; // nothing uploaded — leave stock branding untouched
        }
        brandingFiles = files;

        applyAll();

        if (!sweepsArmed) {
            sweepsArmed = true;
            // The login page renders asynchronously; sweep a few times instead of
            // attaching a standing observer before the app is even up.
            RETRY_DELAYS_MS.forEach((delay) => setTimeout(applyAll, delay));
            console.log(`🪼 Jellyfin Enhanced: Custom branding applied at runtime (${Object.keys(brandingFiles).join(', ')}).`);
        }

        // SPA navigations re-render header/login logos. Use JE's shared
        // multiplexed body observer when available; pre-login (helpers not yet
        // loaded) fall back to plain navigation events, then upgrade to the
        // shared observer when this is called again post-login.
        const JE = window.JellyfinEnhanced;
        if (observerWiring !== 'helpers' && typeof JE?.helpers?.onBodyMutation === 'function') {
            const debounced = typeof JE.helpers.debounce === 'function'
                ? JE.helpers.debounce(applyAll, 250)
                : applyAll;
            JE.helpers.onBodyMutation('je-branding', debounced);
            observerWiring = 'helpers';
        } else if (observerWiring === 'none') {
            window.addEventListener('hashchange', () => setTimeout(applyAll, 250));
            window.addEventListener('popstate', () => setTimeout(applyAll, 250));
            observerWiring = 'fallback';
        }
    }

    window.JellyfinEnhanced = window.JellyfinEnhanced || {};
    window.JellyfinEnhanced.initializeBranding = initializeBranding;
    window.JellyfinEnhanced.branding = { apply: applyAll, getUrl: brandingUrl };

})();
