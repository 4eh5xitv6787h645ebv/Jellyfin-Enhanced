/**
 * @file Central view-lifecycle router.
 *
 * One capture-phase 'viewshow' listener classifies every navigation and gives
 * features three synchronous hook points instead of per-feature setTimeout /
 * polling loops:
 *
 *   onViewShow(fn, opts)        - synchronously at navigation, with a per-nav
 *                                 AbortSignal that aborts on the next nav
 *   onNativeDetailRender(fn)    - once per detail navigation, in the SAME
 *                                 mutation batch where jellyfin-web's own
 *                                 detail buttons become visible (the native
 *                                 controller un-hides them after its item
 *                                 fetch resolves; restored/cached views fire
 *                                 on a microtask since buttons are already
 *                                 visible)
 *   onChildrenRender(fn)        - once per detail navigation when the
 *                                 children section (#childrenCollapsible,
 *                                 season cards etc.) is populated
 *
 * Also maintains a persistent item-identity LRU (itemId -> tmdbId/type/series)
 * so warm navigations can start third-party fetches at viewshow without
 * waiting for the item DTO.
 */
(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: ViewRouter:';

    let navCounter = 0;
    let current = null;

    const viewShowHooks = [];
    const detailRenderHooks = [];
    const childrenRenderHooks = [];

    // ---------------------------------------------------------------- parsing

    function parseHash(hash) {
        const h = hash || '';
        const qIdx = h.indexOf('?');
        const path = (qIdx === -1 ? h : h.slice(0, qIdx)).replace(/^#!?\/?/, '').replace(/\.html$/, '');
        let params;
        try { params = new URLSearchParams(qIdx === -1 ? '' : h.slice(qIdx + 1)); } catch (e) { params = new URLSearchParams(); }
        return { path, params };
    }

    function classify(hash) {
        const { path, params } = parseHash(hash);
        const itemId = params.get('id');
        if (path === 'details' || path === 'item') return { viewType: 'detail', itemId, params };
        if (path === 'home' || path === '') return { viewType: 'home', itemId: null, params };
        if (path === 'search') return { viewType: 'search', itemId: null, params };
        if (path.indexOf('video') === 0) return { viewType: 'player', itemId: null, params };
        if (path === 'movies' || path === 'tv' || path === 'list' || path === 'music' || path === 'livetv') {
            return { viewType: 'library', itemId: null, params };
        }
        return { viewType: path || 'unknown', itemId, params };
    }

    // ------------------------------------------------------------- navigation

    function abortCurrent() {
        if (!current) return;
        try { current._abort.abort(); } catch (e) { /* already aborted */ }
        if (current.detailObserver) { current.detailObserver.disconnect(); current.detailObserver = null; }
        if (current.childrenObserver) { current.childrenObserver.disconnect(); current.childrenObserver = null; }
        if (current.fallbackTimer) clearTimeout(current.fallbackTimer);
    }

    function makeCtx() {
        if (!current) return null;
        return {
            token: current.token,
            view: current.view,
            viewType: current.viewType,
            itemId: current.itemId,
            params: current.params,
            signal: current.signal
        };
    }

    function beginNavigation(viewEl, hash, source) {
        const key = `${hash}`;
        const now = Date.now();
        // Both the DOM 'viewshow' event and the Emby.Page hook can report the
        // same navigation; collapse duplicates arriving close together.
        if (current && current.key === key && (now - current.startedAt) < 700 && !current.signal.aborted) {
            if (viewEl && !current.view) current.view = viewEl;
            return;
        }

        abortCurrent();
        const _abort = new AbortController();
        const cls = classify(hash);
        current = {
            token: ++navCounter,
            key,
            startedAt: now,
            view: viewEl || document.querySelector('.mainAnimatedPage:not(.hide)') || document.querySelector('.page:not(.hide)'),
            viewType: cls.viewType,
            itemId: cls.itemId,
            params: cls.params,
            signal: _abort.signal,
            _abort,
            detailFired: false,
            childrenFired: false,
            detailObserver: null,
            childrenObserver: null,
            fallbackTimer: null
        };

        const ctx = makeCtx();
        for (let i = 0; i < viewShowHooks.length; i++) {
            const h = viewShowHooks[i];
            if (h.viewTypes && h.viewTypes.indexOf(ctx.viewType) === -1) continue;
            try { h.fn(ctx); } catch (e) { console.error(`${logPrefix} onViewShow hook failed:`, e); }
        }

        if (ctx.viewType === 'detail') armDetailObservers();
    }

    // ------------------------------------------------- native render tracking

    function fireDetailRender() {
        if (!current || current.detailFired) return;
        current.detailFired = true;
        if (current.detailObserver) { current.detailObserver.disconnect(); current.detailObserver = null; }
        if (current.fallbackTimer) { clearTimeout(current.fallbackTimer); current.fallbackTimer = null; }
        const ctx = makeCtx();
        for (let i = 0; i < detailRenderHooks.length; i++) {
            try { detailRenderHooks[i].fn(ctx); } catch (e) { console.error(`${logPrefix} onNativeDetailRender hook failed:`, e); }
        }
        maybeFireChildren(); // children may already be populated in restored views
    }

    function childrenPopulated(root) {
        // 10.11.10 uses #listChildrenCollapsible for Series/Season/MusicAlbum/
        // Playlist and #childrenCollapsible for other folders; items land in
        // the .itemsContainer inside either (no .childrenItemsContainer class
        // exists in this version).
        const c = root.querySelector ? root.querySelector('#childrenCollapsible .itemsContainer, #listChildrenCollapsible .itemsContainer') : null;
        if (!c) return false;
        return !!c.querySelector('.card, .listItem');
    }

    function maybeFireChildren() {
        if (!current || current.childrenFired) return;
        const root = current.view || document;
        if (!childrenPopulated(root)) return;
        current.childrenFired = true;
        if (current.childrenObserver) { current.childrenObserver.disconnect(); current.childrenObserver = null; }
        const ctx = makeCtx();
        for (let i = 0; i < childrenRenderHooks.length; i++) {
            try { childrenRenderHooks[i].fn(ctx); } catch (e) { console.error(`${logPrefix} onChildrenRender hook failed:`, e); }
        }
    }

    function armDetailObservers() {
        const root = current.view || document.body;
        const hasVisibleButton = root.querySelector && root.querySelector('.mainDetailButtons .detailButton:not(.hide)');
        if (hasVisibleButton) {
            // Restored/cached view: native content is already rendered.
            const token = current.token;
            queueMicrotask(() => { if (current && current.token === token) fireDetailRender(); });
            return;
        }

        const target = root === document ? document.body : root;
        const obs = new MutationObserver((muts) => {
            if (!current || current.detailFired) {
                maybeFireChildren();
                return;
            }
            for (let i = 0; i < muts.length; i++) {
                const m = muts[i];
                if (m.type === 'attributes') {
                    const el = m.target;
                    if (el.classList && el.classList.contains('detailButton') && !el.classList.contains('hide')
                        && el.closest && el.closest('.mainDetailButtons')) {
                        fireDetailRender();
                        return;
                    }
                } else if (m.type === 'childList' && m.addedNodes.length) {
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        const n = m.addedNodes[j];
                        if (n.nodeType !== 1) continue;
                        try {
                            if ((n.matches && n.matches('.mainDetailButtons .detailButton:not(.hide)'))
                                || (n.querySelector && n.querySelector('.mainDetailButtons .detailButton:not(.hide)'))) {
                                fireDetailRender();
                                return;
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            }
            maybeFireChildren();
        });
        obs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        current.detailObserver = obs;
        // Children share the same observer batch via maybeFireChildren(); keep a
        // second cheap childList-only observer after detail fires.
        current.childrenObserver = obs;
        // Fail-open: never leave features waiting if jellyfin-web's structure drifts.
        current.fallbackTimer = setTimeout(() => {
            console.warn(`${logPrefix} native detail render not detected within 1500ms — firing hooks anyway (selector drift?)`);
            fireDetailRender();
        }, 1500);
    }

    // After detail fires, children may still be pending; keep watching with the
    // same MutationObserver (it stays connected until children fire or nav ends).

    // --------------------------------------------------------- identity cache

    const IDENTITY_LIMIT = 500;
    let identityMap = null; // itemId -> { t: tmdbId, ty: type, s: seriesId, ts: lastUsed }
    let identityDirty = false;

    function identityKey() {
        try {
            const serverId = (typeof ApiClient.serverId === 'function' ? ApiClient.serverId() : ApiClient._serverInfo?.Id) || 'srv';
            return `JE_identity:${serverId}`;
        } catch (e) { return 'JE_identity:srv'; }
    }

    function ensureIdentityMap() {
        if (identityMap) return identityMap;
        try { identityMap = JSON.parse(localStorage.getItem(identityKey()) || '{}') || {}; }
        catch (e) { identityMap = {}; }
        return identityMap;
    }

    function saveIdentityMap() {
        if (!identityDirty || !identityMap) return;
        identityDirty = false;
        try {
            const keys = Object.keys(identityMap);
            if (keys.length > IDENTITY_LIMIT) {
                keys.sort((a, b) => (identityMap[a].ts || 0) - (identityMap[b].ts || 0));
                const drop = keys.length - IDENTITY_LIMIT;
                for (let i = 0; i < drop; i++) delete identityMap[keys[i]];
            }
            localStorage.setItem(identityKey(), JSON.stringify(identityMap));
        } catch (e) { /* quota — identity cache is best-effort */ }
    }

    function recordIdentity(item) {
        if (!item || !item.Id) return;
        const map = ensureIdentityMap();
        const tmdb = item.ProviderIds && (item.ProviderIds.Tmdb || item.ProviderIds.tmdb);
        const entry = {
            t: tmdb || null,
            ty: item.Type || null,
            s: item.SeriesId || null,
            ts: Date.now()
        };
        const prev = map[item.Id];
        if (prev && prev.t === entry.t && prev.ty === entry.ty && prev.s === entry.s) {
            prev.ts = entry.ts;
        } else {
            map[item.Id] = entry;
        }
        identityDirty = true;
        JE._cacheManager.markDirty();
    }

    function getIdentity(itemId) {
        if (!itemId) return null;
        const e = ensureIdentityMap()[itemId];
        if (!e) return null;
        e.ts = Date.now();
        identityDirty = true;
        return { tmdbId: e.t, type: e.ty, seriesId: e.s };
    }

    JE._cacheManager.register(saveIdentityMap);

    // ------------------------------------------------------------------ wiring

    // 'viewshow' is a bubbling CustomEvent dispatched on the view element by
    // jellyfin-web's viewManager; capture phase sees it before app handlers.
    document.addEventListener('viewshow', function(e) {
        const viewEl = e.target && e.target.nodeType === 1 ? e.target : null;
        beginNavigation(viewEl, location.hash, 'viewshow');
    }, true);

    // pushState navigations that re-show cached views without a viewshow event
    // (rare) are covered by the je:navigate patch in helpers via kickstart calls.

    // ---------------------------------------------------------------- exports

    JE.viewRouter = {
        /**
         * @param {Function} fn - receives ctx {token, view, viewType, itemId, params, signal}
         * @param {Object} [opts]
         * @param {string[]} [opts.viewTypes] - only fire for these view types
         * @returns {Function} unregister
         */
        onViewShow(fn, opts) {
            const h = { fn, viewTypes: opts && opts.viewTypes ? opts.viewTypes : null };
            viewShowHooks.push(h);
            return () => { const i = viewShowHooks.indexOf(h); if (i !== -1) viewShowHooks.splice(i, 1); };
        },
        /** Fired once per detail navigation at the native render moment. */
        onNativeDetailRender(fn) {
            const h = { fn };
            detailRenderHooks.push(h);
            return () => { const i = detailRenderHooks.indexOf(h); if (i !== -1) detailRenderHooks.splice(i, 1); };
        },
        /** Fired once per detail navigation when the children section has content. */
        onChildrenRender(fn) {
            const h = { fn };
            childrenRenderHooks.push(h);
            return () => { const i = childrenRenderHooks.indexOf(h); if (i !== -1) childrenRenderHooks.splice(i, 1); };
        },
        getCurrent: makeCtx,
        getIdentity,
        recordIdentity,
        /**
         * Called by plugin.js after feature initialization so hooks fire for
         * the page the user is already on (deep links / boot landing page).
         */
        kickstart() {
            if (current) {
                // Re-fire detail hooks for late-registering features on the
                // current nav if the native render already happened.
                return;
            }
            beginNavigation(null, location.hash, 'kickstart');
        }
    };

    console.log(`${logPrefix} ready`);
})(window.JellyfinEnhanced);
