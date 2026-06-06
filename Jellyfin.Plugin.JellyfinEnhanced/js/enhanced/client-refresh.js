// /js/enhanced/client-refresh.js
/**
 * @file Detects server-side Jellyfin Enhanced config changes and refreshes the
 * web client according to the admin-configured Client Refresh mode.
 *
 * How it works:
 *  - The server bumps a monotonic `ClientConfigRevision` whenever the plugin
 *    configuration materially changes (see JellyfinEnhanced.UpdateConfiguration).
 *  - Each client persists the revision it loaded under a localStorage key scoped
 *    by server id AND user id, then polls the lightweight
 *    `/JellyfinEnhanced/config-revision` endpoint on an interval.
 *  - When the server reports a newer revision the client acts according to the
 *    mode: reload automatically when safe (Auto), show a persistent notice and
 *    reload on Home (SemiAuto), or show the notice with a manual button only
 *    (NotifyOnly). Disabled ignores ordinary config-change refreshes.
 *  - Polling and the lifecycle listeners run in EVERY mode (including Disabled),
 *    because the admin "Force all clients to refresh" override is always honoured
 *    so it can reach any connected client — only the AUTOMATIC refresh-on-change
 *    is gated by the mode.
 *
 * Safety rules (never violated by any mode):
 *  - Never auto-reload while the client is on the video player route.
 *  - Never auto-reload while any media element has something loaded — playing
 *    OR paused — unless the admin explicitly disabled playback suppression.
 *  - Refresh-loop protection: before reloading, the target revision is stored in
 *    sessionStorage; after the reload the freshly loaded page absorbs that
 *    revision instead of reloading again.
 *  - Reloads use a plain window.location.reload() (normal navigation reload,
 *    not a cache-bypassing hard refresh).
 */
(function(JE) {
    'use strict';

    const MODE_DISABLED = 'Disabled';
    const MODE_AUTO = 'Auto';
    const MODE_SEMI_AUTO = 'SemiAuto';
    const MODE_NOTIFY_ONLY = 'NotifyOnly';

    const NOTICE_ID = 'je-refresh-notice';
    const ACTIVITY_THROTTLE_MS = 1000;     // collapse activity events to 1/sec
    // Keep "wake-up" re-checks (visibility/focus/navigation) snappy so a client that
    // was hidden/asleep catches a pending refresh almost the instant it comes back —
    // this is what makes a force from another device land on a phone immediately.
    const FORCED_CHECK_MIN_GAP_MS = 800;
    // Reload-loop safety net (mirrors the File Transformation auto-refresh approach):
    // never reload more than MAX_RELOADS_PER_WINDOW times within RELOAD_WINDOW_MS. If a
    // genuine loop ever occurs, fall back to showing the notice instead of reloading.
    const RELOAD_WINDOW_MS = 60000;
    const MAX_RELOADS_PER_WINDOW = 3;

    // JE.t returns the raw key on miss; substitute the inline fallback. Mirrors enhanced/ui.js.
    function tWithFallback(key, fallback) {
        let result;
        try { result = JE.t(key); } catch (e) { result = null; }
        return (!result || result === key) ? fallback : result;
    }

    const state = {
        initialized: false,
        mode: MODE_DISABLED,
        pollSeconds: 45,
        idleSeconds: 60,
        homeOnly: true,
        suppressDuringPlayback: true,
        debounceSeconds: 5,
        toastMessage: '',
        showManualButton: true,
        serverRevision: 0,        // config revision reported by the server (from init or polling)
        serverForceRevision: 0,   // force-refresh counter reported by the server
        pendingRevision: null,    // newer-than-seen revision waiting for a safe reload
        pendingReason: null,      // what first triggered the pending state (for the debounce re-check)
        lastActivityTs: Date.now(),
        lastForcedCheckTs: 0,
        pollTimer: null,
        reloadTimer: null,
        reloadingNow: false,
        noticeEl: null
    };

    // ---------------------------------------------------------------------
    // Storage keys — scoped by server AND user so one browser talking to two
    // Jellyfin servers (or two users sharing a profile) never cross-pollute.
    // ---------------------------------------------------------------------

    function getServerId() {
        try {
            return ApiClient._serverInfo?.Id ||
                (typeof ApiClient.serverId === 'function' ? ApiClient.serverId() : ApiClient.serverId) ||
                'unknown-server';
        } catch (e) {
            return 'unknown-server';
        }
    }

    function getUserId() {
        try {
            return ApiClient.getCurrentUserId() || 'unknown-user';
        } catch (e) {
            return 'unknown-user';
        }
    }

    function seenKey() {
        return `JE_client_config_revision_seen:${getServerId()}:${getUserId()}`;
    }

    // sessionStorage survives a same-tab reload but not a closed tab — exactly
    // the lifetime needed for "did THIS tab just reload for revision N?".
    function attemptedKey() {
        return `JE_client_config_revision_attempted:${getServerId()}:${getUserId()}`;
    }

    // Force-refresh bookkeeping (separate channel from the config revision).
    function forceSeenKey() {
        return `JE_client_force_refresh_seen:${getServerId()}:${getUserId()}`;
    }
    function forceAttemptedKey() {
        return `JE_client_force_refresh_attempted:${getServerId()}:${getUserId()}`;
    }

    /** @returns {boolean} True when the current page load was a reload (F5, location.reload) rather than a fresh navigation. */
    function navigationWasReload() {
        try {
            const entries = performance.getEntriesByType?.('navigation');
            if (entries && entries.length) return entries[0].type === 'reload';
            return performance.navigation?.type === 1; // deprecated fallback for older WebViews
        } catch (e) {
            return false;
        }
    }

    function readNumber(storage, key) {
        try {
            const raw = storage.getItem(key);
            if (raw === null || raw === '') return null;
            const n = Number(raw);
            return Number.isFinite(n) ? n : null;
        } catch (e) {
            return null;
        }
    }

    function writeNumber(storage, key, value) {
        try { storage.setItem(key, String(value)); } catch (e) { /* storage full/blocked — non-fatal */ }
    }

    // ---------------------------------------------------------------------
    // Route / playback / idle predicates
    // ---------------------------------------------------------------------

    /** @returns {boolean} True when the client is on the Home screen. */
    function isHomeRoute() {
        return window.location.hash.startsWith('#/home');
    }

    /** @returns {boolean} True when the client is on the video player route. */
    function isPlaybackRoute() {
        // Same definition as JE.isVideoPage(), duplicated so this module keeps
        // working even if ui.js failed to load.
        return window.location.hash.startsWith('#/video');
    }

    /**
     * True when any media element has something loaded — playing OR paused both
     * count as protected. A media element that already ended (and post-credits
     * idle states) does not block.
     * @returns {boolean}
     */
    function hasActiveOrPausedMedia() {
        const mediaEls = document.querySelectorAll('video, audio');
        for (let i = 0; i < mediaEls.length; i++) {
            const el = mediaEls[i];
            const src = el.currentSrc || el.src;
            if (!src || el.ended) continue;
            if (!el.paused) return true;                          // actively playing
            if (el.readyState > 0 || el.currentTime > 0) return true; // loaded but paused
        }
        // Best-effort: ask Jellyfin's playback manager too (covers cast/remote
        // sessions controlled from this client, where no local <video> exists).
        try {
            const pm = window.playbackManager;
            if (pm && typeof pm.isPlaying === 'function' && pm.isPlaying()) return true;
        } catch (e) { /* playbackManager not exposed on this build — media element check above still applies */ }
        return false;
    }

    /** @returns {boolean} True when no idle-timeout has elapsed since the last user input. */
    function isIdle() {
        return (Date.now() - state.lastActivityTs) >= state.idleSeconds * 1000;
    }

    /**
     * Global safety gate used by every auto-reload path.
     * The video player route is a hard block regardless of settings; media
     * presence and fullscreen are blocked unless the admin explicitly turned
     * playback suppression off.
     * @returns {boolean}
     */
    function isSafeToRefresh() {
        if (isPlaybackRoute()) return false;
        if (state.suppressDuringPlayback) {
            if (hasActiveOrPausedMedia()) return false;
            if (document.fullscreenElement) return false; // user is immersed in something
        }
        return true;
    }

    // ---------------------------------------------------------------------
    // Persistent notice (deliberately NOT JE.toast — that one auto-removes)
    // ---------------------------------------------------------------------

    function noticeMessage() {
        const custom = (state.toastMessage || '').trim();
        if (custom) return custom;
        return tWithFallback('client_refresh_notice_message', 'Jellyfin Enhanced settings have changed — refresh to apply the update.');
    }

    /**
     * Shows (or updates) the persistent "refresh needed" notice. Idempotent:
     * repeated calls re-use the same element. Hidden automatically while the
     * user is on the video player route so it never overlays playback.
     */
    function showRefreshNeededNotice() {
        if (state.mode === MODE_DISABLED) return;

        let el = document.getElementById(NOTICE_ID);
        if (!el) {
            const themeVars = JE.themer?.getThemeVariables?.() || {};
            el = document.createElement('div');
            el.id = NOTICE_ID;
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            Object.assign(el.style, {
                position: 'fixed',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: themeVars.secondaryBg || 'linear-gradient(135deg, rgba(0,0,0,0.92), rgba(40,40,40,0.92))',
                color: '#fff',
                padding: '12px 16px',
                borderRadius: '8px',
                zIndex: 99998, // just below JE.toast so transient toasts stay readable
                fontSize: 'clamp(13px, 2vw, 15px)',
                fontWeight: '500',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                backdropFilter: `blur(${themeVars.blur || '30px'})`,
                border: `1px solid ${themeVars.primaryAccent || 'rgba(255,255,255,0.15)'}`,
                maxWidth: 'min(92vw, 560px)'
            });

            const icon = document.createElement('i');
            icon.className = 'material-icons';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = 'refresh';
            Object.assign(icon.style, { fontSize: '20px', flexShrink: '0' });
            el.appendChild(icon);

            const text = document.createElement('span');
            text.className = 'je-refresh-notice-text';
            el.appendChild(text);

            // NotifyOnly always gets the button (the notice would otherwise be a
            // dead end); other modes honour the admin toggle.
            if (state.showManualButton || state.mode === MODE_NOTIFY_ONLY) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'je-refresh-notice-btn';
                btn.textContent = tWithFallback('client_refresh_notice_button', 'Refresh now');
                Object.assign(btn.style, {
                    background: themeVars.primaryAccent || 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.25)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    font: 'inherit',
                    flexShrink: '0'
                });
                btn.addEventListener('click', () => refreshNow('manual-button'));
                el.appendChild(btn);
            }

            document.body.appendChild(el);
            state.noticeEl = el;
        }

        const textEl = el.querySelector('.je-refresh-notice-text');
        if (textEl) textEl.textContent = noticeMessage();

        // Suppress visually while on the player; shown again on the next
        // navigation away (updateNoticeVisibility runs on every navigate event).
        el.style.display = isPlaybackRoute() ? 'none' : 'flex';
    }

    /** Removes the persistent notice entirely. */
    function hideRefreshNeededNotice() {
        const el = document.getElementById(NOTICE_ID);
        if (el) el.remove();
        state.noticeEl = null;
    }

    function updateNoticeVisibility() {
        if (!state.pendingRevision) return;
        if (state.mode === MODE_SEMI_AUTO || state.mode === MODE_NOTIFY_ONLY) {
            showRefreshNeededNotice();
        }
    }

    // ---------------------------------------------------------------------
    // Reload machinery
    // ---------------------------------------------------------------------

    /**
     * Rolling-window reload-loop guard (same shape as the File Transformation
     * auto-refresh): returns false once more than MAX_RELOADS_PER_WINDOW reloads
     * have been attempted within RELOAD_WINDOW_MS, so a genuine loop can never spin
     * the page forever. Counts are kept in sessionStorage (per-tab, cleared on close).
     */
    function reloadRateLimitOk() {
        try {
            const now = Date.now();
            const s = window.sessionStorage;
            let count = parseInt(s.getItem('JE_reload_count') || '0', 10);
            let start = parseInt(s.getItem('JE_reload_start') || '0', 10);
            if (!Number.isFinite(start) || start === 0 || now - start > RELOAD_WINDOW_MS) {
                count = 0;
                start = now;
            }
            count += 1;
            s.setItem('JE_reload_count', String(count));
            s.setItem('JE_reload_start', String(start));
            if (count > MAX_RELOADS_PER_WINDOW) {
                console.warn(`🪼 Jellyfin Enhanced (client refresh): reload-loop guard tripped (${count} reloads in ${RELOAD_WINDOW_MS / 1000}s) — showing notice instead of reloading.`);
                return false;
            }
            return true;
        } catch (e) {
            return true; // sessionStorage blocked — don't let the guard itself break refresh
        }
    }

    /** Marks the page as reloaded-for-this-revision and performs a normal reload. */
    function refreshNow(reason) {
        if (state.reloadingNow) return;
        const target = state.pendingRevision || state.serverRevision;
        // Loop-guard: if we've reloaded too many times recently, surface the notice
        // and mark this revision seen so we stop trying, rather than spinning.
        if (!reloadRateLimitOk()) {
            writeNumber(window.localStorage, seenKey(), target);
            showRefreshNeededNotice();
            return;
        }
        state.reloadingNow = true;
        // Loop protection: the post-reload page reads this marker and absorbs the
        // revision instead of reloading again.
        writeNumber(window.sessionStorage, attemptedKey(), target);
        console.log(`🪼 Jellyfin Enhanced (client refresh): reloading for config revision ${target} (${reason}).`);
        window.location.reload();
    }

    /**
     * Admin-forced reload. Reloads IMMEDIATELY, bypassing every safety gate —
     * playback, paused media, idle, home-only and debounce. Triggered only by the
     * admin "Force all clients to refresh" action (a higher force-revision than the
     * one this client last recorded). Loop-protected by stamping the seen + attempted
     * markers before reloading so the reloaded page absorbs the value instead of
     * forcing again.
     */
    function forceReloadNow() {
        if (state.reloadingNow) return;
        const target = state.serverForceRevision;
        // Loop-guard: mark the force seen (so we don't keep retrying it) and show the
        // notice instead of reloading if we've already reloaded too many times.
        if (!reloadRateLimitOk()) {
            writeNumber(window.localStorage, forceSeenKey(), target);
            showRefreshNeededNotice();
            return;
        }
        state.reloadingNow = true;
        writeNumber(window.localStorage, forceSeenKey(), target);
        writeNumber(window.sessionStorage, forceAttemptedKey(), target);
        console.log(`🪼 Jellyfin Enhanced (client refresh): FORCED reload by admin (force revision ${target}).`);
        window.location.reload();
    }

    /**
     * True when the current mode/route/idle/safety state permits an automatic
     * reload right now. `reason` distinguishes user navigation (which is allowed
     * to reload immediately on arrival at an eligible route) from background
     * triggers like polling (which additionally require the client to be idle).
     */
    function canAutoReloadNow(reason) {
        if (!state.pendingRevision) return false;
        if (state.mode !== MODE_AUTO && state.mode !== MODE_SEMI_AUTO) return false;
        if (!isSafeToRefresh()) return false;

        const navigationTriggered = reason === 'navigate' || reason === 'init';

        if (state.mode === MODE_AUTO) {
            if (state.homeOnly && !isHomeRoute()) return false;
            return navigationTriggered || isIdle();
        }

        // SemiAuto reloads only on the Home screen — either because the user just
        // navigated there, or because they have been idling on it.
        return isHomeRoute() && (navigationTriggered || isIdle());
    }

    /**
     * Debounced reload: waits ClientRefreshDebounceSeconds after the trigger so
     * several rapid admin saves collapse into a single reload, then re-checks
     * safety before actually pulling the trigger. If conditions changed (user
     * started playback, navigated into the player...), the reload is dropped and
     * will be re-attempted by the next poll/navigation event.
     */
    function scheduleReload(reason) {
        if (state.reloadTimer || state.reloadingNow) return;
        state.pendingReason = reason;
        const delayMs = Math.max(0, state.debounceSeconds) * 1000;
        state.reloadTimer = setTimeout(() => {
            state.reloadTimer = null;
            if (canAutoReloadNow(state.pendingReason)) {
                refreshNow(state.pendingReason);
            }
        }, delayMs);
    }

    /**
     * Records a newer server revision as pending. Latest revision wins; the
     * notice and any scheduled reload are shared, so rapid consecutive saves
     * never stack up duplicate notices or extra reloads.
     */
    function markPending(revision, reason) {
        if (!revision) return;
        state.pendingRevision = Math.max(state.pendingRevision || 0, revision);
        state.serverRevision = Math.max(state.serverRevision, revision);
        maybeRefresh(reason || 'poll');
    }

    /**
     * Central decision point — called on poll results, navigation, visibility
     * changes and init. Updates the persistent notice and schedules an automatic
     * reload when the mode and safety rules allow one.
     */
    function maybeRefresh(reason) {
        if (state.mode === MODE_DISABLED || !state.pendingRevision) return;

        updateNoticeVisibility();

        if (state.mode === MODE_NOTIFY_ONLY) return; // never auto-reload

        if (!canAutoReloadNow(reason)) return;

        // Navigating ONTO the Home screen reloads straight away — no debounce wait —
        // so the user sees the new config the moment they land on Home. Every other
        // trigger (sitting idle on Home, background poll, etc.) still goes through the
        // debounced path so rapid admin saves collapse into a single reload.
        if (isImmediateHomeNavigation(reason)) {
            refreshNow(reason);
            return;
        }

        scheduleReload(reason);
    }

    /**
     * True when this trigger is the user actively navigating onto the Home route in a
     * mode that reloads on Home (Auto or SemiAuto). Such an arrival reloads immediately
     * instead of waiting out the debounce window. A first page load ('init') is excluded
     * — that page is already fresh, so it uses the normal debounced path.
     */
    function isImmediateHomeNavigation(reason) {
        return reason === 'navigate'
            && isHomeRoute()
            && (state.mode === MODE_AUTO || state.mode === MODE_SEMI_AUTO);
    }

    // ---------------------------------------------------------------------
    // Revision polling
    // ---------------------------------------------------------------------

    function fetchServerRevision() {
        return ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl(`/JellyfinEnhanced/config-revision?_=${Date.now()}`),
            dataType: 'json'
        }).then((data) => {
            const rev = Number(data?.Revision ?? data?.revision ?? 0);
            const force = Number(data?.ForceRevision ?? data?.forceRevision ?? 0);
            return {
                rev: Number.isFinite(rev) ? rev : 0,
                force: Number.isFinite(force) ? force : 0
            };
        });
    }

    function checkForNewRevision(reason) {
        fetchServerRevision().then(({ rev, force }) => {
            // Admin force takes priority and ignores every safety gate.
            const forceSeen = readNumber(window.localStorage, forceSeenKey()) ?? 0;
            if (force > forceSeen) {
                state.serverForceRevision = Math.max(state.serverForceRevision, force);
                forceReloadNow();
                return;
            }
            const seen = readNumber(window.localStorage, seenKey()) ?? 0;
            if (rev > seen) {
                if (state.mode === MODE_DISABLED) {
                    // Off: ignore ordinary config-change refreshes — adopt the revision so
                    // it isn't re-evaluated every poll. (The force channel above still acts.)
                    writeNumber(window.localStorage, seenKey(), rev);
                } else {
                    markPending(rev, reason);
                }
            }
        }).catch(() => { /* offline or auth hiccup — next poll/online event will retry */ });
    }

    function startPolling() {
        if (state.pollTimer) return;
        const intervalMs = state.pollSeconds * 1000;
        state.pollTimer = setInterval(() => {
            // Skip network work for hidden tabs; the visibilitychange handler
            // below runs an immediate catch-up check when the tab is shown again.
            if (document.hidden) return;
            checkForNewRevision('poll');
        }, intervalMs);
    }

    function forcedCheck(reason) {
        const now = Date.now();
        if (now - state.lastForcedCheckTs < FORCED_CHECK_MIN_GAP_MS) return;
        state.lastForcedCheckTs = now;
        checkForNewRevision(reason);
    }

    // ---------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------

    function readSettingsFromConfig() {
        const cfg = JE.pluginConfig || {};
        const mode = String(cfg.ClientRefreshMode || MODE_DISABLED);
        // Tolerate "Manual" as an alias for NotifyOnly.
        state.mode = (mode === 'Manual') ? MODE_NOTIFY_ONLY : mode;
        if ([MODE_DISABLED, MODE_AUTO, MODE_SEMI_AUTO, MODE_NOTIFY_ONLY].indexOf(state.mode) === -1) {
            console.warn(`🪼 Jellyfin Enhanced (client refresh): unknown mode '${mode}', treating as Disabled.`);
            state.mode = MODE_DISABLED;
        }
        const clamp = (v, min, max, dflt) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return dflt;
            return Math.min(max, Math.max(min, n));
        };
        // Fast default poll (5s, like the File Transformation auto-refresh) so a force
        // or config change lands quickly on active clients; backgrounded clients catch
        // up instantly via the visibility/focus/navigation re-checks above.
        state.pollSeconds = clamp(cfg.ClientRefreshPollSeconds, 5, 3600, 5);
        state.idleSeconds = clamp(cfg.ClientRefreshIdleSeconds, 5, 3600, 10);
        state.debounceSeconds = clamp(cfg.ClientRefreshDebounceSeconds, 0, 300, 5);
        state.homeOnly = cfg.ClientRefreshHomeOnly !== false;
        state.suppressDuringPlayback = cfg.ClientRefreshSuppressDuringPlayback !== false;
        state.showManualButton = cfg.ClientRefreshShowManualButton !== false;
        state.toastMessage = typeof cfg.ClientRefreshToastMessage === 'string' ? cfg.ClientRefreshToastMessage : '';
        state.serverRevision = Number(cfg.ClientConfigRevision) || 0;
        state.serverForceRevision = Number(cfg.ClientForceRefreshRevision) || 0;
    }

    /**
     * A fresh page load already reflects any prior force, so adopt the current
     * force value without reloading. The only force-reload path is the live poll
     * (forceReloadNow) for already-open clients — this prevents a forced reload
     * from looping on the page it just produced.
     */
    function reconcileForceRevision() {
        try { window.sessionStorage.removeItem(forceAttemptedKey()); } catch (e) { /* ignore */ }
        writeNumber(window.localStorage, forceSeenKey(), state.serverForceRevision);
    }

    function bindActivityTracking() {
        let lastStamp = 0;
        const onActivity = () => {
            const now = Date.now();
            if (now - lastStamp < ACTIVITY_THROTTLE_MS) return;
            lastStamp = now;
            state.lastActivityTs = now;
        };
        ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'click'].forEach((ev) => {
            window.addEventListener(ev, onActivity, { passive: true, capture: true });
        });
    }

    function bindNavigationAndLifecycle() {
        const onNavigated = () => {
            updateNoticeVisibility();
            // Act on anything already pending right away (e.g. immediate reload when
            // landing on Home), AND re-poll the server (FT-style hashchange→check) so a
            // client that was hidden/asleep picks up a change or force the moment the
            // user starts moving around the app.
            maybeRefresh('navigate');
            forcedCheck('navigate');
        };
        if (typeof JE.helpers?.onNavigate === 'function') {
            JE.helpers.onNavigate(onNavigated);
        } else {
            // helpers.js failed to load — fall back to the raw events it wraps.
            window.addEventListener('hashchange', onNavigated);
            window.addEventListener('popstate', onNavigated);
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                forcedCheck('visibility');
                maybeRefresh('visibility');
            }
        });
        window.addEventListener('online', () => forcedCheck('online'));
        window.addEventListener('focus', () => forcedCheck('focus'));
    }

    /**
     * Reconciles the freshly loaded page against the stored seen/attempted
     * revisions:
     *  - First run (no stored value): adopt the server revision without reloading.
     *  - This tab just reloaded for revision N (sessionStorage marker): absorb N —
     *    this is the refresh-loop protection.
     *  - Stored revision is older and no reload was attempted (tab was closed or
     *    offline while the config changed): mark pending and follow mode rules.
     */
    function reconcileInitialRevision() {
        const serverRev = state.serverRevision;
        const seen = readNumber(window.localStorage, seenKey());
        const attempted = readNumber(window.sessionStorage, attemptedKey());

        if (attempted !== null) {
            try { window.sessionStorage.removeItem(attemptedKey()); } catch (e) { /* ignore */ }
        }

        if (seen === null) {
            // Feature's first run on this client — initialise quietly.
            writeNumber(window.localStorage, seenKey(), serverRev);
            return;
        }

        if (seen === serverRev) return; // fully up to date

        if (seen > serverRev) {
            // Revision went backwards (config restored from backup?) — adopt it.
            writeNumber(window.localStorage, seenKey(), serverRev);
            return;
        }

        // seen < serverRev:
        if (attempted !== null && attempted >= serverRev) {
            // We reloaded for this exact (or newer) revision moments ago — absorb.
            writeNumber(window.localStorage, seenKey(), serverRev);
            console.log(`🪼 Jellyfin Enhanced (client refresh): reloaded page absorbed config revision ${serverRev}.`);
            return;
        }

        if (navigationWasReload()) {
            // The user refreshed the page themselves (F5 / pull-to-refresh) — that
            // IS the refresh we wanted, so absorb instead of nagging again.
            writeNumber(window.localStorage, seenKey(), serverRev);
            console.log(`🪼 Jellyfin Enhanced (client refresh): manual page reload absorbed config revision ${serverRev}.`);
            return;
        }

        if (state.mode === MODE_DISABLED) {
            // Off: ignore ordinary config-change refreshes — adopt silently so nothing
            // lingers. (An explicit admin force is handled by reconcileForceRevision /
            // the force channel, independent of mode.)
            writeNumber(window.localStorage, seenKey(), serverRev);
            return;
        }

        // The tab was closed/offline while the config changed and this load has
        // NOT already reloaded for it. Even though the config payload itself was
        // fetched fresh, the app shell and scripts may have been served from
        // cache — mark the refresh as pending and let the mode rules decide
        // (Auto/SemiAuto reload once safe; NotifyOnly shows the notice). The
        // attempted-marker written before that reload guarantees the follow-up
        // page load takes the absorb branch above instead of looping.
        console.log(`🪼 Jellyfin Enhanced (client refresh): server config revision ${serverRev} is newer than last seen ${seen} — pending refresh.`);
        markPending(serverRev, 'init');
    }

    function initialize() {
        if (state.initialized) return;
        state.initialized = true;

        readSettingsFromConfig();

        // NOTE: we set up polling + lifecycle even when the mode is Disabled. The mode
        // gates only the AUTOMATIC refresh-on-config-change behaviour (handled in
        // maybeRefresh, which no-ops on Disabled). The admin "Force all clients to
        // refresh" override is always honoured so it can reach every client that has
        // loaded the plugin — including one that loaded while the mode was Off. This is
        // why a force from another device reliably lands on a phone.
        reconcileInitialRevision();
        reconcileForceRevision();
        bindActivityTracking();
        bindNavigationAndLifecycle();
        startPolling();

        if (state.mode === MODE_DISABLED) {
            console.log(`🪼 Jellyfin Enhanced: Client refresh mode is Off — automatic refresh disabled, but still listening for an admin force (poll=${state.pollSeconds}s).`);
        } else {
            console.log(`🪼 Jellyfin Enhanced: Client refresh initialized (mode=${state.mode}, poll=${state.pollSeconds}s, idle=${state.idleSeconds}s, homeOnly=${state.homeOnly}, suppressPlayback=${state.suppressDuringPlayback}).`);
        }
    }

    JE.clientRefresh = {
        initialize,
        isHomeRoute,
        isPlaybackRoute,
        hasActiveOrPausedMedia,
        isSafeToRefresh,
        markPending,
        maybeRefresh,
        refreshNow,
        forceReloadNow,
        checkNow: () => checkForNewRevision('manual'),
        showRefreshNeededNotice,
        hideRefreshNeededNotice,
        // Exposed for diagnostics and runtime tests; not a stable API.
        _state: state
    };

    // Spec'd convenience aliases.
    JE.showRefreshNeededNotice = showRefreshNeededNotice;
    JE.hideRefreshNeededNotice = hideRefreshNeededNotice;

})(window.JellyfinEnhanced);
