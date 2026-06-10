// /js/enhanced/live-update.js
//
// Live convergence for already-open sessions — the "no hard refresh" floor.
//
// Why this exists: jellyfin-web's index.html is served `no-cache`, its service worker
// does NOT cache (no fetch handler / Cache Storage), and JE's scripts are loaded with a
// `?v={cacheKey}` that changes every build. So a *hard* reload (cache clear / Ctrl+Shift+R)
// is never technically required — a NORMAL reload already picks up new code. The only thing
// missing was convergence: nothing tells an open tab that a new plugin build or a config
// change happened. This module adds that, cheaply:
//
//   • poll /JellyfinEnhanced/runtime-version (tiny, non-sensitive, no-store)
//   • new build (buildId changed) / config saved (configVersion changed) -> converge per the
//     admin settings below.
//   • admin force-refresh (forceReloadId changed) -> hard reload immediately, overriding
//     everything (the "Force refresh all clients" button on the config page).
//   • BroadcastChannel fans a detection out to sibling tabs.
//
// What counts as "a new build": the server decides via `buildId` — normally the plugin
// Version (reload on real updates only); in Dev Mode the Version+DLL-timestamp cache-key
// (reload on every redeploy). The client just compares whatever buildId the server returns.
//
// Auto-reload BLOCKERS (apply to automatic reloads only, NOT the manual Refresh button or the
// admin force-refresh): never auto-reload while a video is actively playing or while the user
// is on the JE config page. The reload is deferred (not dropped) and fires once the blocker
// clears (playback ends / navigate away).
//
// Admin settings (from public-config -> JE.pluginConfig):
//   LiveUpdateEnabled    master switch (default ON). When off, start() is a no-op.
//   LiveUpdateAutoReload reload automatically on a change instead of showing a "Refresh"
//                        prompt (default OFF).
//
// Everything here is fully torn down by JE.liveUpdate.stop().
(function () {
    'use strict';

    const JE = window.JellyfinEnhanced;
    if (!JE || JE.liveUpdate) return; // idempotent

    const POLL_MS = 60000;                  // convergence floor; visibility/nav refine it
    const CHANNEL_NAME = 'jellyfin-enhanced';
    const BANNER_ID = 'je-update-banner';
    const LOG = '🪼 Jellyfin Enhanced [live-update]:';

    const state = {
        started: false,
        stopped: false,
        baseBuildId: null,         // build identity the running code came from (seeded from server)
        baseConfigVersion: null,   // configVersion observed when this tab started
        baseForceReloadId: null,   // admin force-refresh token observed when this tab started
        pendingReload: null,       // reason string while a reload waits for a blocker to clear
        timer: null,
        channel: null,
        onVisibility: null,
        offNavigate: null,
    };

    // --- admin settings (read live from JE.pluginConfig so changes are honored) ---
    function pcfg() { return (JE && JE.pluginConfig) || {}; }
    function isEnabled() { return pcfg().LiveUpdateEnabled !== false; }   // default ON
    function autoReload() { return pcfg().LiveUpdateAutoReload === true; }

    /**
     * Reads a property from a server JSON object case-insensitively, so the module is
     * robust to Jellyfin MVC's PascalCase serialization regardless of policy.
     */
    function pick(obj, camel) {
        if (!obj || typeof obj !== 'object') return undefined;
        if (obj[camel] !== undefined) return obj[camel];
        const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
        return obj[pascal];
    }

    /** i18n helper: translation if present, else English fallback. */
    function tr(key, fallback) {
        try {
            const v = JE.t ? JE.t(key) : key;
            return (v && v !== key) ? v : fallback;
        } catch (_) { return fallback; }
    }

    async function fetchRuntimeVersion() {
        if (typeof ApiClient === 'undefined') return null;
        try {
            return await ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/runtime-version'),
                dataType: 'json'
            }) || null;
        } catch (_) { return null; }
    }

    /** True while a <video> is actively playing (so we don't reload mid-watch). */
    function isPlaying() {
        try {
            const vids = document.querySelectorAll('video');
            for (let i = 0; i < vids.length; i++) {
                const v = vids[i];
                if (v && !v.paused && !v.ended && v.readyState > 2 && v.currentTime > 0) return true;
            }
        } catch (_) {}
        return false;
    }

    /**
     * True when the user is on the Jellyfin Enhanced plugin config page
     * (#/configurationpage?name=Jellyfin%20Enhanced). Auto-reloading there would interrupt an
     * admin editing settings — and a config save is exactly what would trigger it.
     */
    function isOnConfigPage() {
        try {
            const h = (window.location.hash || '').toLowerCase();
            if (h.indexOf('configurationpage') === -1) return false;
            return decodeURIComponent(h).indexOf('name=jellyfin enhanced') !== -1;
        } catch (_) { return false; }
    }

    /**
     * Auto-reload blockers: never auto-reload while a video is actively playing or while the
     * user is on the JE config page. The reload is deferred (not dropped) and fires once the
     * blocker clears. The manual Refresh button and the admin force-refresh bypass this.
     */
    function shouldDeferReload() {
        return isPlaying() || isOnConfigPage();
    }

    /**
     * Reload the page to pick up the change. Soft by default (which fully updates the app:
     * the shell is no-cache and every script URL carries the NEW cacheKey). When `hard`, first
     * drop Cache Storage + service workers so even stubborn clients load fresh (admin force-refresh).
     */
    function triggerReload(reason, hard) {
        console.log(LOG, 'reloading (' + (hard ? 'hard' : 'soft') + ') [' + (reason || 'manual') + ']');
        const doReload = () => { try { location.reload(); } catch (_) { window.location.href = window.location.href; } };
        if (!hard) { doReload(); return; }
        const clearCaches = (window.caches && caches.keys)
            ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : Promise.resolve();
        const dropSW = (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
            ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))) : Promise.resolve();
        Promise.allSettled([clearCaches, dropSW]).then(doReload);
    }

    /** Auto-reload now (soft), or defer until the blocker (playback / config page) clears. */
    function scheduleReload(reason) {
        if (shouldDeferReload()) {
            state.pendingReload = reason;
            console.log(LOG, 'reload deferred (playback or config page) [' + reason + ']');
            return;
        }
        triggerReload(reason, false);
    }

    /**
     * Unobtrusive, dismissible banner offering a manual refresh (shown only when auto-reload
     * is OFF). The Refresh button does a soft reload (which fully updates the app).
     */
    function showRefreshBanner(message) {
        if (state.stopped) return;
        if (document.getElementById(BANNER_ID)) return; // idempotent

        const theme = (JE.themer && JE.themer.getThemeVariables && JE.themer.getThemeVariables()) || {};
        const bg = theme.secondaryBg || 'linear-gradient(135deg, rgba(0,0,0,0.92), rgba(40,40,40,0.92))';
        const border = '1px solid ' + (theme.primaryAccent || 'rgba(255,255,255,0.15)');
        const blur = theme.blur || '30px';
        const accent = theme.primaryAccent || '#00a4dc';

        const wrap = document.createElement('div');
        wrap.id = BANNER_ID;
        wrap.setAttribute('role', 'status');
        Object.assign(wrap.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 100000,
            display: 'flex', alignItems: 'center', gap: '12px',
            maxWidth: 'clamp(280px, 80vw, 380px)', padding: '12px 14px', borderRadius: '10px',
            background: bg, border: border, color: '#fff',
            font: '500 clamp(13px,2vw,15px)/1.35 inherit',
            boxShadow: '0 6px 24px rgba(0,0,0,0.4)', backdropFilter: 'blur(' + blur + ')',
            transform: 'translateX(120%)', transition: 'transform .3s ease-out'
        });

        const text = document.createElement('span');
        text.style.flex = '1';
        text.textContent = message;

        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.textContent = tr('live_update_refresh', 'Refresh');
        Object.assign(refresh.style, {
            cursor: 'pointer', border: 'none', borderRadius: '6px', padding: '6px 12px',
            fontWeight: '600', color: '#fff', background: accent, whiteSpace: 'nowrap'
        });
        refresh.addEventListener('click', function () { triggerReload('banner', false); });

        const close = document.createElement('button');
        close.type = 'button';
        close.setAttribute('aria-label', tr('live_update_dismiss', 'Dismiss'));
        close.textContent = '✕';
        Object.assign(close.style, {
            cursor: 'pointer', border: 'none', background: 'transparent',
            color: 'rgba(255,255,255,0.7)', fontSize: '16px', lineHeight: '1', padding: '2px 4px'
        });
        close.addEventListener('click', removeBanner);

        wrap.appendChild(text);
        wrap.appendChild(refresh);
        wrap.appendChild(close);
        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.style.transform = 'translateX(0)'; });
    }

    function removeBanner() {
        const el = document.getElementById(BANNER_ID);
        if (el) el.remove();
    }

    /**
     * Re-fetch the public plugin config and live-apply the safe, idempotent subset (used when
     * auto-reload is OFF). Structural feature mount/unmount is NOT re-run here; those settle on
     * the next navigation/reload.
     */
    async function applyConfigChange() {
        if (typeof ApiClient === 'undefined') return;
        try {
            const cfg = await ApiClient.ajax({
                type: 'GET', url: ApiClient.getUrl('/JellyfinEnhanced/public-config'), dataType: 'json'
            });
            if (cfg && typeof cfg === 'object') JE.pluginConfig = Object.assign({}, JE.pluginConfig, cfg);
        } catch (_) { /* converge next tick */ }
        try { if (JE.themer && typeof JE.themer.init === 'function') JE.themer.init(); } catch (_) {}
        try {
            document.dispatchEvent(new CustomEvent('JellyfinEnhanced:configChanged', { detail: { config: JE.pluginConfig } }));
        } catch (_) {}
    }

    /**
     * One convergence check. Cheap: a single tiny GET, skipped while hidden.
     */
    async function check(reason) {
        if (state.stopped) return;
        if (document.hidden) return;        // hidden tabs converge on visibilitychange
        const rv = await fetchRuntimeVersion();
        if (!rv || state.stopped) return;

        const serverBuildId = pick(rv, 'buildId');
        const serverConfigVersion = pick(rv, 'configVersion');
        const serverForceId = pick(rv, 'forceReloadId');
        if (state.baseBuildId == null && serverBuildId != null) state.baseBuildId = serverBuildId;
        if (state.baseConfigVersion == null && serverConfigVersion != null) state.baseConfigVersion = serverConfigVersion;
        if (state.baseForceReloadId == null && serverForceId != null) state.baseForceReloadId = serverForceId;

        // 1. Admin force-refresh — HARD reload immediately, overriding every blocker (playback,
        //    config page) and the auto-reload setting. "Refresh everyone now, no matter what."
        if (serverForceId != null && state.baseForceReloadId != null && String(serverForceId) !== String(state.baseForceReloadId)) {
            console.log(LOG, 'admin force-refresh [' + reason + ']');
            state.baseForceReloadId = serverForceId;
            broadcast({ type: 'force' });
            triggerReload('force', true);
            return;
        }

        // 2. A reload was deferred by a blocker — fire it once the blocker clears.
        if (state.pendingReload) {
            if (!shouldDeferReload()) { const why = state.pendingReload; state.pendingReload = null; triggerReload(why, false); }
            return;
        }

        // 3. New build (Version bump, or any redeploy in Dev Mode) => running code is stale.
        if (serverBuildId != null && state.baseBuildId != null && String(serverBuildId) !== String(state.baseBuildId)) {
            console.log(LOG, 'new build detected (' + state.baseBuildId + ' -> ' + serverBuildId + ') [' + reason + ']');
            broadcast({ type: 'build', buildId: serverBuildId });
            if (autoReload()) scheduleReload('update');
            else showRefreshBanner(tr('live_update_new_version', 'Jellyfin Enhanced was updated.'));
            return; // a reload will pick up config too
        }

        // 4. Config saved.
        if (serverConfigVersion != null && state.baseConfigVersion != null && String(serverConfigVersion) !== String(state.baseConfigVersion)) {
            console.log(LOG, 'config change detected [' + reason + ']');
            state.baseConfigVersion = serverConfigVersion;
            broadcast({ type: 'config', configVersion: serverConfigVersion });
            if (autoReload()) { scheduleReload('config'); return; }
            await applyConfigChange();
            if (!isEnabled()) { console.log(LOG, 'disabled via config; stopping.'); stop(); }
        }
    }

    function broadcast(msg) {
        if (state.channel) { try { state.channel.postMessage(msg); } catch (_) {} }
    }

    function onChannelMessage(ev) {
        const data = ev && ev.data;
        if (!data || state.stopped) return;
        if (data.type === 'force') {
            triggerReload('force-broadcast', true); // sibling tab forced -> we force too
        } else if (data.type === 'build' && state.baseBuildId != null && String(data.buildId) !== String(state.baseBuildId)) {
            if (autoReload()) scheduleReload('broadcast-update');
            else showRefreshBanner(tr('live_update_new_version', 'Jellyfin Enhanced was updated.'));
        } else if (data.type === 'config') {
            check('broadcast'); // re-check against the authoritative server
        }
    }

    /** Begin converging this session. Idempotent; no-op when disabled by config. */
    function start() {
        if (state.started || state.stopped) return;
        if (!isEnabled()) { console.log(LOG, 'live updates disabled by config; not starting.'); return; }
        state.started = true;

        // Seed baselines from the authoritative endpoint (the build/config/force-token the
        // SERVER is on when this page loaded). We do NOT read the injected <script> tag.
        fetchRuntimeVersion().then(function (rv) {
            if (state.stopped || !rv) return;
            const bid = pick(rv, 'buildId'); if (bid != null && state.baseBuildId == null) state.baseBuildId = bid;
            const cv = pick(rv, 'configVersion'); if (cv != null && state.baseConfigVersion == null) state.baseConfigVersion = cv;
            const fr = pick(rv, 'forceReloadId'); if (fr != null && state.baseForceReloadId == null) state.baseForceReloadId = fr;
            console.log(LOG, 'baseline build ' + state.baseBuildId + ' (autoReload=' + autoReload() + ')');
        });

        state.timer = setInterval(function () { check('poll'); }, POLL_MS);

        state.onVisibility = function () { if (document.visibilityState === 'visible') check('visible'); };
        document.addEventListener('visibilitychange', state.onVisibility);

        if (JE.helpers && typeof JE.helpers.onNavigate === 'function') {
            try { state.offNavigate = JE.helpers.onNavigate(function () { check('nav'); }); } catch (_) {}
        }

        try {
            if (typeof BroadcastChannel !== 'undefined') {
                state.channel = new BroadcastChannel(CHANNEL_NAME);
                state.channel.onmessage = onChannelMessage;
            }
        } catch (_) { state.channel = null; }

        console.log(LOG, 'started.');
    }

    /** Tear everything down — interval, listeners, channel, banner. Leaves no residue. */
    function stop() {
        state.stopped = true;
        state.started = false;
        state.pendingReload = null;
        if (state.timer) { clearInterval(state.timer); state.timer = null; }
        if (state.onVisibility) { document.removeEventListener('visibilitychange', state.onVisibility); state.onVisibility = null; }
        if (typeof state.offNavigate === 'function') { try { state.offNavigate(); } catch (_) {} state.offNavigate = null; }
        if (state.channel) { try { state.channel.close(); } catch (_) {} state.channel = null; }
        removeBanner();
    }

    JE.liveUpdate = { start: start, stop: stop, check: check, _state: state };

})();
