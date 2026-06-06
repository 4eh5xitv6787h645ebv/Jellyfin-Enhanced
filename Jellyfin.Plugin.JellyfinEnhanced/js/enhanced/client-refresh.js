// /js/enhanced/client-refresh.js
/**
 * @file Detects server-side Jellyfin Enhanced config changes and refreshes the
 * web client according to the admin-configured Client Refresh mode.
 *
 * How it works:
 *  - The server bumps a monotonic `ClientConfigRevision` whenever the plugin
 *    configuration materially changes (see JellyfinEnhanced.UpdateConfiguration).
 *  - Every page load boots with the CURRENT revision (public-config is fetched
 *    fresh by plugin.js on each load), so the revision this page booted with is
 *    the per-tab baseline. The module then polls the lightweight
 *    `/JellyfinEnhanced/config-revision` endpoint and compares against that
 *    baseline — entirely in memory, per tab. A reload re-boots with the new
 *    revision, which absorbs it naturally; no cross-tab storage is involved, so
 *    every tab acts on every change independently (one tab's reload can never
 *    swallow another tab's).
 *  - When the server reports a newer revision the client acts according to the
 *    mode: reload automatically once the user is idle and it is safe (Auto),
 *    show a persistent notice and reload on Home (SemiAuto), or show the notice
 *    with a manual button only (NotifyOnly). Disabled ignores ordinary
 *    config-change refreshes.
 *  - Polling and the lifecycle listeners run in EVERY mode (including Disabled),
 *    because the admin "Force all clients to refresh" override is always honoured
 *    so it can reach any connected client — only the AUTOMATIC refresh-on-change
 *    is gated by the mode.
 *
 * Safety rules for AUTOMATIC (config-change) reloads — never violated:
 *  - Never auto-reload while the client is on the video player route.
 *  - Never auto-reload while any media element has something loaded — playing
 *    OR paused — unless the admin explicitly disabled playback suppression.
 *  - Never auto-reload while the user is active (idle timeout), except at the
 *    moment they navigate onto the Home screen (the reload IS the navigation).
 *
 * The admin FORCE channel is the deliberate exception: it reloads immediately,
 * bypassing playback/idle/home/debounce, because the admin explicitly asked for
 * it. The only carve-out: editing surfaces (the dashboard, plugin configuration
 * pages, the Metadata Manager and user preference/profile pages) show the
 * persistent notice instead of reloading, so the force can never destroy
 * unsaved edits — including the very form it was triggered from. The deferred
 * reload happens on the next navigation away.
 *
 * Refresh-loop protection: a fresh boot always adopts the booted revision, so a
 * reload can only loop if the server keeps reporting a newer revision than the
 * page boots with (e.g. a proxy serving stale public-config). A per-tab
 * sessionStorage reload budget (3 automatic reloads per rolling 60s window)
 * bounds that pathological case — and also paces a burst of legitimate rapid
 * admin saves. A tab that exhausts the budget shows the persistent notice and
 * AUTOMATICALLY resumes once the window expires; only a tab whose
 * sessionStorage is unusable (the budget cannot be counted) stays notice-only
 * for the whole session.
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
    // Reload budget: at most MAX_RELOADS_PER_WINDOW automatic reloads per rolling
    // RELOAD_WINDOW_MS window (counted in sessionStorage, so it spans reloads).
    // Every successful automatic reload consumes one — a runaway loop (stale
    // public-config proxy) is bounded, and a burst of legitimate rapid admin
    // saves is paced. A blocked tab shows the notice and resumes automatically
    // when the window expires; the manual button never counts against it.
    const RELOAD_WINDOW_MS = 60000;
    const MAX_RELOADS_PER_WINDOW = 3;
    // Escalate the quiet fetch-failure handling to a single console.warn after this
    // many consecutive failures (~5 minutes at the default 5s poll).
    const FAILURES_BEFORE_WARN = 60;

    // Initial values are placeholders; initialize() overwrites the tunables from
    // the server config. They mirror the shipped defaults.
    const state = {
        initialized: false,
        armed: false,             // false when the config payload was missing/old-server — module stays inert
        mode: MODE_DISABLED,
        pollSeconds: 5,
        idleSeconds: 10,
        homeOnly: false,
        suppressDuringPlayback: true,
        debounceSeconds: 5,
        toastMessage: '',
        showManualButton: true,
        // Per-tab revision floors. ack* = the highest revision this tab has acted
        // on (booted with, reloaded for, or deliberately ignored). All in memory:
        // a reload re-boots with the current server values, which IS the absorb.
        ackRevision: 0,
        ackForceRevision: 0,
        serverRevision: 0,        // latest revision reported by the server
        serverForceRevision: 0,   // latest force counter reported by the server
        pendingRevision: null,    // newer-than-acked revision waiting for a safe reload
        pendingForceRevision: null, // force deferred because the user is on an editing surface
        storageBroken: false,     // sessionStorage unusable — budget uncountable, no automatic reloads this session
        reloadBlocked: false,     // a reload attempt was budget-blocked — notice must carry the button
        budgetWarned: false,      // one-time console.warn when the budget first blocks
        lastActivityTs: Date.now(),
        lastForcedCheckTs: 0,
        pollTimer: null,
        reloadTimer: null,
        reloadingNow: false,
        consecutiveFetchFailures: 0,
        fetchFailureWarned: false
    };

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
     * True on editing surfaces — pages built around forms whose unsaved state a
     * reload would destroy: the admin dashboard, plugin configuration pages,
     * the Metadata Manager, and the user preference/profile pages. Even a
     * forced reload defers to a notice on these.
     * @returns {boolean}
     */
    function isEditingSurface() {
        const hash = window.location.hash;
        return hash.startsWith('#/dashboard')
            || hash.startsWith('#/configurationpage')
            || hash.startsWith('#/metadata')
            || hash.startsWith('#/mypreferences')
            || hash.startsWith('#/userprofile');
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

    /** @returns {boolean} True when the idle-timeout has elapsed since the last user input. */
    function isIdle() {
        return (Date.now() - state.lastActivityTs) >= state.idleSeconds * 1000;
    }

    /**
     * Global safety gate used by every automatic-reload path.
     * The video player route is a hard block regardless of settings; media
     * presence and fullscreen are blocked unless the admin explicitly turned
     * playback suppression off.
     * @returns {boolean}
     */
    function isSafeToRefresh() {
        if (isPlaybackRoute()) return false;
        // Editing surfaces hold unsaved form state (config edits, branding
        // uploads, dashboard/user settings) — an automatic reload would destroy
        // them. The notice/next-navigation path covers these.
        if (isEditingSurface()) return false;
        // An open modal dialog (Edit Metadata, Identify, Add to Collection,
        // subtitle search...) holds form state on ordinary routes too — and a
        // user reading one looks exactly like an idle user. Probe the OPEN STATE
        // (the `.opened` class jellyfin-web adds on open and removes at close),
        // not the layout: dialogHelper can keep a closed container in the DOM
        // (so bare `.dialogContainer` over-blocks), and a `dialog-fixedSize`
        // dialog is `position:fixed` on small viewports (so an `offsetParent`
        // check under-blocks — it reports null for fixed elements even when
        // visible). `.dialog.opened` is exact in both cases. Same precedent as
        // js/enhanced/features.js.
        if (document.querySelector('.dialogContainer .dialog.opened')) return false;
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
        return JE.t('client_refresh_notice_message');
    }

    /**
     * Shows (or updates) the persistent "refresh needed" notice. Idempotent:
     * repeated calls re-use the same element (rebuilt if the force flavour
     * changed, because the force variant always needs the button). Hidden
     * automatically while the user is on the video player route so it never
     * overlays playback.
     * @param {boolean} [isForce] - True when shown for a deferred/blocked admin force.
     */
    function showRefreshNeededNotice(isForce) {
        // Ordinary config-change notices are mode-gated; a force notice is not —
        // the force channel works even when the mode is Disabled.
        if (!isForce && state.mode === MODE_DISABLED) return;

        let el = document.getElementById(NOTICE_ID);
        // Rebuild an existing element when it is missing a button it now needs:
        // the force flavour and a loop-latched session both guarantee one (the
        // notice is the only way forward), but the element may have been built
        // earlier without it (e.g. SemiAuto with the manual button turned off).
        if (el && (isForce || state.reloadBlocked) && !el.querySelector('button')) {
            el.remove();
            el = null;
        }
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

            // NotifyOnly, the force flavour and a loop-latched session always get
            // the button (the notice would otherwise be a dead end); other modes
            // honour the admin toggle.
            if (state.showManualButton || state.mode === MODE_NOTIFY_ONLY || isForce || state.reloadBlocked) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'je-refresh-notice-btn';
                btn.textContent = JE.t('client_refresh_notice_button');
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
    }

    function updateNoticeVisibility() {
        if (state.pendingForceRevision) {
            showRefreshNeededNotice(true);
            return;
        }
        if (!state.pendingRevision) return;
        if (state.mode === MODE_SEMI_AUTO || state.mode === MODE_NOTIFY_ONLY || state.reloadBlocked) {
            showRefreshNeededNotice();
        }
    }

    // ---------------------------------------------------------------------
    // Reload machinery
    // ---------------------------------------------------------------------

    /**
     * Peeks at the rolling reload budget WITHOUT consuming it: true while fewer
     * than MAX_RELOADS_PER_WINDOW automatic reloads happened within the current
     * RELOAD_WINDOW_MS window. Counts live in sessionStorage (per-tab, survives
     * the reload, cleared on tab close) — exactly the lifetime the budget needs.
     * Self-healing: once the window expires the budget is available again, so a
     * blocked tab resumes automatically. If sessionStorage is unusable the
     * budget cannot be counted, so this fails CLOSED for the whole session.
     * @returns {boolean}
     */
    function reloadBudgetAvailable() {
        if (state.storageBroken) return false;
        try {
            const now = Date.now();
            const s = window.sessionStorage;
            const count = parseInt(s.getItem('JE_reload_count') || '0', 10);
            const start = parseInt(s.getItem('JE_reload_start') || '0', 10);
            if (!Number.isFinite(start) || start === 0 || now - start > RELOAD_WINDOW_MS) return true;
            return !Number.isFinite(count) || count < MAX_RELOADS_PER_WINDOW;
        } catch (e) {
            state.storageBroken = true;
            console.error('🪼 Jellyfin Enhanced (client refresh): sessionStorage unavailable — automatic reloads disabled for this session (cannot guarantee loop protection).', e);
            return false;
        }
    }

    /**
     * Records one automatic reload against the rolling budget. Returns false —
     * and fails the session CLOSED — when the write does not stick: a reload
     * that cannot be counted must not happen, or a tab whose storage accepts
     * reads but rejects writes could loop without the budget ever filling up.
     * @returns {boolean} True when the reload was recorded and may proceed.
     */
    function consumeReloadBudget() {
        try {
            const now = Date.now();
            const s = window.sessionStorage;
            let count = parseInt(s.getItem('JE_reload_count') || '0', 10);
            let start = parseInt(s.getItem('JE_reload_start') || '0', 10);
            if (!Number.isFinite(count)) count = 0;
            if (!Number.isFinite(start) || start === 0 || now - start > RELOAD_WINDOW_MS) {
                count = 0;
                start = now;
            }
            s.setItem('JE_reload_count', String(count + 1));
            s.setItem('JE_reload_start', String(start));
            return true;
        } catch (e) {
            state.storageBroken = true;
            console.error('🪼 Jellyfin Enhanced (client refresh): sessionStorage write failed — automatic reloads disabled for this session (cannot count the reload budget).', e);
            return false;
        }
    }

    /**
     * Shared budget-blocked handling for both reload paths: marks the session so
     * the notice always carries the button, warns once, and shows the notice.
     * @param {boolean} isForce - Which notice flavour to show.
     */
    function noteReloadBlocked(isForce) {
        state.reloadBlocked = true;
        // storageBroken already logged its own console.error and means reloads do
        // NOT resume — don't follow it with a contradictory "resumes when the
        // window expires" line. The budget-exhausted case is the one that resumes.
        if (!state.budgetWarned && !state.storageBroken) {
            state.budgetWarned = true;
            console.warn(`🪼 Jellyfin Enhanced (client refresh): reload budget exhausted (${MAX_RELOADS_PER_WINDOW}/${RELOAD_WINDOW_MS / 1000}s) — showing the notice; automatic reloads resume when the window expires.`);
        }
        showRefreshNeededNotice(isForce);
    }

    /**
     * Reloads the page for the newest pending revision. The manual button bypasses
     * the budget (a human click is not a loop, and never counts against it);
     * automatic callers are budget-gated — when blocked, the revision stays
     * pending and the notice is shown, so the reload happens automatically once
     * the rolling window expires.
     * @param {string} reason - What triggered the reload (for the console log).
     */
    function refreshNow(reason) {
        if (state.reloadingNow) return;
        const target = state.pendingRevision || state.serverRevision;
        const manual = reason === 'manual-button';
        if (!manual) {
            // Peek enforces the cap; consume records the reload and fails closed
            // when the write doesn't stick — a reload that cannot be counted must
            // not happen, or a write-broken tab could loop uncounted. The revision
            // stays pending either way, so it retries when the window frees up.
            if (!reloadBudgetAvailable() || !consumeReloadBudget()) {
                noteReloadBlocked(false);
                return;
            }
        }
        state.reloadingNow = true;
        console.log(`🪼 Jellyfin Enhanced (client refresh): reloading for config revision ${target} (${reason}).`);
        window.location.reload();
    }

    /**
     * Admin-forced reload. Reloads IMMEDIATELY, bypassing playback, idle,
     * home-only and debounce — the admin explicitly asked for it. Exception:
     * editing surfaces defer to a notice (see actOnPendingForce). Loop-safe
     * because the reloaded page boots with the new force value as its floor.
     * @returns {boolean} True when a reload is in flight (started now or already underway).
     */
    function forceReloadNow() {
        if (state.reloadingNow) return true;
        const target = state.serverForceRevision;
        // Peek + consume BEFORE acking: if the budget is exhausted OR the count
        // can't be written, keep the force pending (NOT acknowledged) so every
        // poll retries and updateNoticeVisibility re-shows the notice after the
        // user navigates — e.g. off the video route, where it is hidden. Acking
        // before a failed consume would drop the force for this tab forever.
        if (!reloadBudgetAvailable() || !consumeReloadBudget()) {
            noteReloadBlocked(true);
            return false;
        }
        state.ackForceRevision = Math.max(state.ackForceRevision, target);
        state.pendingForceRevision = null;
        state.reloadingNow = true;
        console.log(`🪼 Jellyfin Enhanced (client refresh): FORCED reload by admin (force revision ${target}).`);
        window.location.reload();
        return true;
    }

    /**
     * Acts on a deferred admin force: reloads unless the user is on an admin
     * work surface (then the persistent notice is shown and the reload happens
     * on the next navigation away).
     * @returns {boolean} True when a reload is in flight (budget-blocked attempts return false).
     */
    function actOnPendingForce() {
        if (!state.pendingForceRevision) return false;
        if (state.pendingForceRevision <= state.ackForceRevision) {
            state.pendingForceRevision = null;
            return false;
        }
        if (isEditingSurface()) {
            showRefreshNeededNotice(true);
            return false;
        }
        return forceReloadNow();
    }

    /**
     * True when the current mode/route/idle/safety state permits an automatic
     * reload right now. Idle is ALWAYS required here — the only idle exemption
     * is the immediate reload-on-Home-arrival path in maybeRefresh, where the
     * reload rides the navigation the user just made.
     * @returns {boolean}
     */
    function canAutoReloadNow() {
        if (!state.pendingRevision || state.storageBroken) return false;
        if (state.mode !== MODE_AUTO && state.mode !== MODE_SEMI_AUTO) return false;
        if (!isSafeToRefresh()) return false;

        if (state.mode === MODE_AUTO) {
            if (state.homeOnly && !isHomeRoute()) return false;
            return isIdle();
        }

        // SemiAuto reloads only while idling on the Home screen.
        return isHomeRoute() && isIdle();
    }

    /**
     * Debounced reload: waits ClientRefreshDebounceSeconds after the trigger so
     * several rapid admin saves collapse into a single reload, then re-checks
     * safety before actually pulling the trigger. If conditions changed (user
     * started playback, began clicking around, navigated into the player...),
     * the reload is dropped and re-attempted by the next poll/navigation event.
     * @param {string} reason - What triggered the schedule (for the eventual log line).
     */
    function scheduleReload(reason) {
        if (state.reloadTimer || state.reloadingNow) return;
        const delayMs = Math.max(0, state.debounceSeconds) * 1000;
        state.reloadTimer = setTimeout(() => {
            state.reloadTimer = null;
            if (canAutoReloadNow()) {
                refreshNow(reason);
            }
        }, delayMs);
    }

    /**
     * Records a newer server revision as pending. Latest revision wins; the
     * notice and any scheduled reload are shared, so rapid consecutive saves
     * never stack up duplicate notices or extra reloads.
     * @param {number} revision - The server revision to act on.
     * @param {string} reason - What surfaced it (poll, navigate, visibility...).
     */
    function markPending(revision, reason) {
        if (!revision) return;
        state.pendingRevision = Math.max(state.pendingRevision || 0, revision);
        state.serverRevision = Math.max(state.serverRevision, revision);
        maybeRefresh(reason || 'poll');
    }

    /**
     * Central decision point — called on poll results, navigation and visibility
     * changes. Updates the persistent notice and starts/schedules an automatic
     * reload when the mode and safety rules allow one.
     * @param {string} reason - What triggered the evaluation.
     */
    function maybeRefresh(reason) {
        if (state.mode === MODE_DISABLED || !state.pendingRevision) return;

        updateNoticeVisibility();

        if (state.mode === MODE_NOTIFY_ONLY || state.storageBroken) return; // never auto-reload

        // Navigating ONTO the Home screen reloads straight away — no debounce, no
        // idle wait — the reload rides the navigation the user just made, so they
        // see the new config the moment they land. Every other trigger requires
        // the user to be idle and goes through the debounced path.
        if (reason === 'navigate' && isHomeRoute() && isSafeToRefresh()) {
            refreshNow('navigate-home');
            return;
        }

        if (!canAutoReloadNow()) return;

        scheduleReload(reason);
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

    /**
     * One quiet console.debug on the first failure, one console.info on
     * recovery, and a single console.warn if the endpoint stays unreachable —
     * so routine server restarts stay silent but a permanently dead endpoint is
     * eventually visible without spamming every 5 seconds. The rejection reason
     * is included so a 404 (route gone), 503 and a network drop are
     * distinguishable from the one log line.
     * @param {*} err - The fetch rejection reason.
     */
    function noteFetchFailure(err) {
        state.consecutiveFetchFailures += 1;
        if (state.consecutiveFetchFailures === 1) {
            console.debug('🪼 Jellyfin Enhanced (client refresh): revision poll failed (offline or server restarting?) — retrying quietly.', err);
        } else if (state.consecutiveFetchFailures === FAILURES_BEFORE_WARN && !state.fetchFailureWarned) {
            state.fetchFailureWarned = true;
            console.warn(`🪼 Jellyfin Enhanced (client refresh): revision poll has failed ${FAILURES_BEFORE_WARN} times in a row — client refresh is inactive until the endpoint recovers. Last error:`, err);
        }
    }

    function noteFetchRecovery() {
        if (state.consecutiveFetchFailures === 0) return;
        if (state.consecutiveFetchFailures >= FAILURES_BEFORE_WARN) {
            console.info('🪼 Jellyfin Enhanced (client refresh): revision poll recovered.');
        }
        state.consecutiveFetchFailures = 0;
        state.fetchFailureWarned = false;
    }

    function checkForNewRevision(reason) {
        // Never act without a trustworthy baseline: an un-armed page (config
        // fetch failed / pre-feature server) has zero floors, and comparing the
        // live server values against them would mis-fire reloads.
        if (!state.armed) return;
        // Two-argument then: the failure handler covers ONLY the fetch, so a bug
        // in the decision pipeline below surfaces normally instead of being
        // swallowed as a phantom network error.
        fetchServerRevision().then(({ rev, force }) => {
            noteFetchRecovery();

            // Admin force takes priority and ignores the mode and safety gates
            // (except editing surfaces — see actOnPendingForce).
            if (force > state.ackForceRevision) {
                state.serverForceRevision = Math.max(state.serverForceRevision, force);
                state.pendingForceRevision = state.serverForceRevision;
                if (actOnPendingForce()) return;
            }

            if (rev > state.ackRevision) {
                if (state.mode === MODE_DISABLED) {
                    // Off: ignore ordinary config-change refreshes — acknowledge so
                    // it isn't re-evaluated every poll. (The force channel above
                    // still acts.)
                    state.ackRevision = rev;
                } else {
                    markPending(rev, reason);
                }
            }
        }, noteFetchFailure);
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

    /**
     * Reads the tunables from the server config payload.
     * @param {object} cfg - The JE.pluginConfig payload.
     */
    function readSettingsFromConfig(cfg) {
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
        // Fast default poll (5s) so a force or config change lands quickly on
        // active clients; backgrounded clients catch up instantly via the
        // visibility/focus/navigation re-checks.
        state.pollSeconds = clamp(cfg.ClientRefreshPollSeconds, 5, 3600, 5);
        state.idleSeconds = clamp(cfg.ClientRefreshIdleSeconds, 5, 3600, 10);
        state.debounceSeconds = clamp(cfg.ClientRefreshDebounceSeconds, 0, 300, 5);
        // Absent fields match the shipped C# defaults (homeOnly=false; the two
        // suppress/button toggles=true).
        state.homeOnly = cfg.ClientRefreshHomeOnly === true;
        state.suppressDuringPlayback = cfg.ClientRefreshSuppressDuringPlayback !== false;
        state.showManualButton = cfg.ClientRefreshShowManualButton !== false;
        state.toastMessage = typeof cfg.ClientRefreshToastMessage === 'string' ? cfg.ClientRefreshToastMessage : '';
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
            // A force deferred on an editing surface fires the moment the
            // user navigates away from it.
            if (actOnPendingForce()) return;
            // Act on anything already pending right away (e.g. immediate reload
            // when landing on Home), AND re-poll the server so a client that was
            // hidden/asleep picks up a change or force the moment the user starts
            // moving around the app.
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
                if (actOnPendingForce()) return;
                forcedCheck('visibility');
                maybeRefresh('visibility');
            }
        });
        window.addEventListener('online', () => forcedCheck('online'));
        window.addEventListener('focus', () => forcedCheck('focus'));
    }

    function initialize() {
        if (state.initialized) return;
        state.initialized = true;

        const cfg = JE.pluginConfig;
        // No revision in the payload means the config fetch failed (plugin.js
        // falls back to {}) or the server predates this feature. Without a
        // trustworthy baseline, arming the poller could mis-fire reloads off
        // garbage floors — stay inert for this page load; the next full load
        // re-evaluates.
        if (!cfg || cfg.ClientConfigRevision === undefined) {
            console.info('🪼 Jellyfin Enhanced: Client refresh inactive — plugin config unavailable for this page load.');
            return;
        }
        state.armed = true;

        readSettingsFromConfig(cfg);

        // This page just booted from the current server config, so the booted
        // revisions ARE the per-tab baseline: everything up to them is reflected
        // by definition, and anything newer arrived after this page loaded.
        state.ackRevision = Number(cfg.ClientConfigRevision) || 0;
        state.ackForceRevision = Number(cfg.ClientForceRefreshRevision) || 0;
        state.serverRevision = state.ackRevision;
        state.serverForceRevision = state.ackForceRevision;

        // NOTE: polling + lifecycle run even when the mode is Disabled. The mode
        // gates only the AUTOMATIC refresh-on-config-change behaviour (handled in
        // maybeRefresh, which no-ops on Disabled). The admin "Force all clients to
        // refresh" override is always honoured so it can reach every client that
        // has loaded the plugin — including one that loaded while the mode was Off.
        bindActivityTracking();
        bindNavigationAndLifecycle();
        startPolling();

        if (state.mode === MODE_DISABLED) {
            console.log(`🪼 Jellyfin Enhanced: Client refresh mode is Off — automatic refresh disabled, but still listening for an admin force (poll=${state.pollSeconds}s).`);
        } else {
            console.log(`🪼 Jellyfin Enhanced: Client refresh initialized (mode=${state.mode}, poll=${state.pollSeconds}s, idle=${state.idleSeconds}s, homeOnly=${state.homeOnly}, suppressPlayback=${state.suppressDuringPlayback}, revision=${state.ackRevision}).`);
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
