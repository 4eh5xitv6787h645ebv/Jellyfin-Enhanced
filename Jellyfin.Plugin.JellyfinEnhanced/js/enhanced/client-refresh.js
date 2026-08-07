/**
 * @file Smart client refresh — keeps long-lived tabs converged with the server.
 *
 * A Jellyfin web session can stay open for days. When the plugin DLL is
 * replaced, the server process restarts, or an administrator edits the plugin
 * configuration, every open tab keeps running the JS bundle it loaded on the
 * day it was opened — the classic "tell your users to hard refresh" problem.
 *
 * This module tracks three independent server identities:
 *   - `BuildId`             — content hash of the plugin build this page loaded,
 *   - `JellyfinGeneration`  — the Jellyfin server *process* generation,
 *   - `ConfigurationRevision` / `ForceRevision` — live admin-config watermarks,
 * and reloads the page when they move — but only when a reload is provably
 * harmless (nothing playing, no dialog, no half-typed form, not on a settings
 * page) and the user has been idle for the admin-configured settle window.
 *
 * Design invariants, in rough order of importance:
 *   1. Never break JE boot. A server without the refresh endpoints, a hostile
 *      proxy, a WebView with no storage — all degrade to "do nothing".
 *   2. Never reload during playback or an edit. The safety gate is re-evaluated
 *      immediately before the irreversible `location.reload()`.
 *   3. Never loop. Reloads are rate-limited by a storage-backed budget that is
 *      written AND read back, because some embedded WebViews silently drop
 *      writes; an unverifiable budget fails closed (notice, no reload).
 *   4. Hidden tabs cost nothing. All polling stops while backgrounded and
 *      resumes with a catch-up check on foreground, floored so that repeated
 *      alt-tabbing cannot outpace the admin's poll interval. A signed-out tab
 *      takes the same path — the state endpoint is authenticated, so the login
 *      screen must not poll it at all.
 *   5. Nothing leaks across an identity change. The web client's logout/login
 *      is an SPA route change, so every per-session artefact (pending intent,
 *      the notice and its dismissal, the watermark they were derived from) is
 *      dropped and rebuilt via JE.session.onUserChange.
 *
 * Ported from the Jellyfin Canopy `core/live-update.ts` + `core/lifecycle.ts`
 * safety gate. Single-server simplification: JE runs one server per page, so
 * the multi-server identity machinery is replaced by a plain ServerId check.
 */
(function(JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Smart Refresh:';

    /** Storage key holding the recent-reload timestamps (loop budget). */
    const RELOAD_BUDGET_KEY = 'je-smart-refresh-budget-v1';
    /** Sliding window the reload budget is counted over. */
    const RELOAD_BUDGET_WINDOW_MS = 60000;
    /** Maximum automatic reloads allowed inside one window. */
    const RELOAD_BUDGET_LIMIT = 3;
    /** If the document is still alive this long after reload(), it failed. */
    const RELOAD_SURVIVAL_WATCHDOG_MS = 3000;
    /** Floor for the post-interaction settle window, even when admin idle = 0. */
    const MIN_INTERACTION_SETTLE_MS = 1000;
    /** Hard timeout for a single state poll. Never retried — the next poll is the retry. */
    const STATE_TIMEOUT_MS = 10000;
    /** How long a transient refresh toast stays on screen. */
    const NOTICE_DURATION_MS = 8000;
    /** Id of the single persistent, actionable refresh notice. */
    const NOTICE_ELEMENT_ID = 'je-client-refresh-notice';
    /** Id of the stylesheet backing that notice. */
    const NOTICE_STYLE_ID = 'je-client-refresh-notice-css';
    /** Content-addressed identities are always lowercase SHA-256 hex. */
    const SHA256_HEX = /^[a-f0-9]{64}$/;

    /**
     * Policy used until a valid state has been observed. Everything off: an
     * unparseable or missing payload must never be able to trigger a reload.
     * @type {Readonly<object>}
     */
    const FAIL_CLOSED_POLICY = Object.freeze({
        Mode: 'Disabled',
        OnPluginUpdate: false,
        OnJellyfinUpdate: false,
        OnConfigChange: false,
        ShowNotices: true,
        PollSeconds: 30,
        IdleSeconds: 5
    });

    /** Jellyfin top-level routes on which a reload would destroy user work. */
    const EDITING_ROUTES = new Set([
        'dashboard',
        'configurationpage',
        'metadata',
        'edititemmetadata',
        'settings',
        'profile',
        'userprofile'
    ]);

    // ── Module state ─────────────────────────────────────────────────────────

    /** @type {Set<string>} Refresh reasons detected but not yet acted on. */
    const pendingSources = new Set();

    /** Build id of the bundle THIS page is running (script tag `build` attr). */
    const loadedBuildId = typeof JE.loadedBuildId === 'string' ? JE.loadedBuildId : '';

    /** @type {object|null} Last validated state — the comparison watermark. */
    let baseline = null;
    /** @type {string|null} Canonical server id the baseline was captured from. */
    let baselineServerId = null;
    /** @type {object} Live policy, replaced wholesale by every validated state. */
    let policy = FAIL_CLOSED_POLICY;

    /** @type {AbortController|null} In-flight state poll. */
    let checkController = null;
    /** @type {Promise<void>|null} Active coalescing drain. */
    let checkDrain = null;
    /** Epoch ms when the last poll drain finished — floors foreground-signal refetches. */
    let lastDrainCompletedAt = 0;
    /** Another check was requested while one was in flight. */
    let checkRequested = false;

    /** @type {*} */ let pollTimer = null;
    /** @type {*} */ let decisionTimer = null;
    /** @type {*} */ let retryTimer = null;
    /** @type {*} */ let reloadRecoveryTimer = null;

    let lastInteractionAt = Date.now();
    let reloadCommitted = false;
    let listenersInstalled = false;
    let started = false;
    /** True only while the policy in `policy` came from a completed foreground drain. */
    let foregroundStateFresh = false;
    /**
     * The startup baseline capture failed, so this client's view of the server
     * generation is unknown. The first valid state is then treated
     * conservatively (see detectConservativeFirstStateSources).
     */
    let conservativeFirstState = false;
    /** Cordova/WebView app-level pause (document 'pause'/'resume' events). */
    let nativeAppPaused = false;

    /** @type {string|null} Watermark the currently-shown toasts belong to. */
    let noticeWatermark = null;
    /** @type {Set<string>} Toast texts already shown for `noticeWatermark`. */
    const shownNotices = new Set();
    /** @type {HTMLElement|null} The one persistent, actionable notice, when shown. */
    let notice = null;
    /**
     * Watermark whose notice the user dismissed. The same unchanged mismatch is
     * re-detected on every poll, so dismissal is owned by the full state
     * watermark — not by DOM existence — and a genuinely newer
     * build/generation/revision raises the notice again.
     * @type {string|null}
     */
    let dismissedNoticeStateKey = null;
    /**
     * The user pressed Reload on the notice. Consent outranks the mode gate (via
     * the 'force' source it queues) and the admin idle window, but never the
     * safety gate — a reload must still not land on playback or a half-typed form.
     */
    let userRequestedReload = false;
    /** Epoch ms of the Reload click — the waiver only holds briefly (see evaluatePending). */
    let userRequestedReloadAt = 0;

    const handle = JE.core?.lifecycle?.register
        ? JE.core.lifecycle.register('client-refresh')
        : null;

    // ── Payload validation (the client trust boundary) ────────────────────────

    /**
     * @param {*} value
     * @returns {boolean} True for a plain (non-array) object.
     */
    function isRecord(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * Canonicalize a server id for comparison: Jellyfin reports the same id
     * both dashed and undashed depending on the API surface.
     * @param {*} value
     * @returns {string|null} Canonical id, or null when unusable.
     */
    function canonicalServerId(value) {
        if (typeof value !== 'string') return null;
        const normalized = value.trim().split('-').join('').toLowerCase();
        return normalized.length > 0 && normalized.length <= 256 ? normalized : null;
    }

    /**
     * The server this page is actually talking to. Read fresh every time —
     * the host can swap ApiClient wholesale.
     * @returns {string|null} Canonical active server id.
     */
    function activeServerId() {
        try {
            const fromSession = JE.session && typeof JE.session.getServerId === 'function'
                ? JE.session.getServerId()
                : null;
            if (fromSession) return canonicalServerId(fromSession);
            if (typeof ApiClient === 'undefined' || !ApiClient) return null;
            const raw = (typeof ApiClient.serverId === 'function' ? ApiClient.serverId() : ApiClient.serverId)
                || ApiClient._serverInfo?.Id
                || null;
            return canonicalServerId(raw);
        } catch (_) {
            return null;
        }
    }

    /**
     * Whether a validated state was issued by the server this page is bound to.
     * Both sides must be resolvable — "cannot tell" is treated as "no".
     * @param {object} state - A normalized state.
     * @param {*} serverId - Canonical or raw active server id.
     * @returns {boolean}
     */
    function stateBelongsToServer(state, serverId) {
        const stateServerId = canonicalServerId(state.ServerId);
        const activeId = canonicalServerId(serverId);
        return stateServerId !== null && activeId !== null && stateServerId === activeId;
    }

    /**
     * Validate a refresh-state payload. Anything even slightly off returns
     * null: an error page, an HTML login redirect or a captive-portal body must
     * never be able to become a reload trigger.
     *
     * @param {*} value - Raw parsed JSON (or the injected bootstrap object).
     * @param {*} [authenticatedSourceServerId] - Only for the authenticated
     *   state-endpoint lane: a payload with a *truly absent* ServerId may
     *   inherit the already-authenticated transport's server. The anonymous
     *   bootstrap lane passes nothing, so it stays strict. A present but
     *   malformed/mismatched ServerId is fatal on both lanes.
     * @returns {object|null} A fresh normalized state, or null when invalid.
     */
    function normalizeRefreshState(value, authenticatedSourceServerId) {
        if (!isRecord(value)
            || value.SchemaVersion !== 1
            || typeof value.BuildId !== 'string'
            || !SHA256_HEX.test(value.BuildId)
            || typeof value.JellyfinGeneration !== 'string'
            || !SHA256_HEX.test(value.JellyfinGeneration)
            || !Number.isSafeInteger(value.ConfigurationRevision)
            || value.ConfigurationRevision < 0
            || !Number.isSafeInteger(value.ForceRevision)
            || value.ForceRevision < 0
            || !isRecord(value.Policy)) {
            return null;
        }

        const responseServerId = canonicalServerId(value.ServerId);
        const inheritedServerId = value.ServerId === undefined
            ? canonicalServerId(authenticatedSourceServerId)
            : null;
        const normalizedServerId = responseServerId || inheritedServerId;
        if (normalizedServerId === null) return null;

        const p = value.Policy;
        if (p.Mode !== 'Smart' && p.Mode !== 'HomeOnly' && p.Mode !== 'Notify' && p.Mode !== 'Disabled') {
            return null;
        }
        if (typeof p.OnPluginUpdate !== 'boolean'
            || typeof p.OnJellyfinUpdate !== 'boolean'
            || typeof p.OnConfigChange !== 'boolean'
            // Additive schema-1 field: absent means the original visible
            // behavior; present-but-not-a-boolean is a malformed payload.
            || (p.ShowNotices !== undefined && typeof p.ShowNotices !== 'boolean')
            || !Number.isSafeInteger(p.PollSeconds)
            || p.PollSeconds < 5
            || p.PollSeconds > 3600
            || !Number.isSafeInteger(p.IdleSeconds)
            || p.IdleSeconds < 0
            || p.IdleSeconds > 300) {
            return null;
        }

        return {
            SchemaVersion: 1,
            ServerId: responseServerId ? String(value.ServerId).trim() : normalizedServerId,
            BuildId: value.BuildId,
            JellyfinGeneration: value.JellyfinGeneration,
            ConfigurationRevision: value.ConfigurationRevision,
            ForceRevision: value.ForceRevision,
            Policy: {
                Mode: p.Mode,
                OnPluginUpdate: p.OnPluginUpdate,
                OnJellyfinUpdate: p.OnJellyfinUpdate,
                OnConfigChange: p.OnConfigChange,
                ShowNotices: p.ShowNotices === undefined ? true : p.ShowNotices,
                PollSeconds: p.PollSeconds,
                IdleSeconds: p.IdleSeconds
            }
        };
    }

    // ── Change detection ─────────────────────────────────────────────────────

    /**
     * Reject a rollback inside one server process. Behind a load balancer a
     * peer that has not yet seen an admin edit would otherwise flip the
     * watermark back and forth, reloading every tab on every flip. A NEW
     * generation is the legitimate reset boundary.
     * @param {object|null} previous
     * @param {object} next
     * @returns {boolean} True when `next` may be adopted as the new baseline.
     */
    function isMonotonicRefreshTransition(previous, next) {
        return !previous
            || next.JellyfinGeneration !== previous.JellyfinGeneration
            || (next.ConfigurationRevision >= previous.ConfigurationRevision
                && next.ForceRevision >= previous.ForceRevision);
    }

    /**
     * Pure comparison of two watermarks.
     * @param {object|null} previous - Last adopted state (null on first sight).
     * @param {object} current - Freshly validated state.
     * @param {string} buildId - Build id this page actually loaded.
     * @returns {Set<string>} Any of 'plugin' | 'jellyfin' | 'config' | 'force'.
     */
    function detectRefreshSources(previous, current, buildId) {
        const sources = new Set();
        // Only meaningful when the loaded build is known; an old server that
        // does not stamp `build` on the script tag must not look "outdated".
        if (buildId && current.BuildId !== buildId) sources.add('plugin');
        if (!previous) return sources;
        if (current.JellyfinGeneration !== previous.JellyfinGeneration) {
            sources.add('jellyfin');
            // ConfigurationRevision/ForceRevision are process-scoped counters:
            // comparing them across a restart would read their reset as a new
            // config signal. A positive force revision is different — it proves
            // an admin asked for a refresh AFTER the new process started, so it
            // must survive the restart boundary.
            if (current.ForceRevision > 0) sources.add('force');
            return sources;
        }
        if (current.ConfigurationRevision > previous.ConfigurationRevision) sources.add('config');
        if (current.ForceRevision > previous.ForceRevision) sources.add('force');
        return sources;
    }

    /**
     * First valid state seen after the startup capture FAILED. The server
     * generation was never observed, so prefer one policy-filtered refresh over
     * silently adopting an unknown generation as the baseline.
     * @param {object} current
     * @param {string} buildId
     * @returns {Set<string>}
     */
    function detectConservativeFirstStateSources(current, buildId) {
        const sources = detectRefreshSources(null, current, buildId);
        sources.add('jellyfin');
        if (current.ConfigurationRevision > 0) sources.add('config');
        if (current.ForceRevision > 0) sources.add('force');
        return sources;
    }

    // ── Route helpers ────────────────────────────────────────────────────────

    /**
     * Resolve Jellyfin's top-level route from a URL. Jellyfin is hash-routed
     * (`#/home.html`, `#!/video`), but dashboard/plugin pages can also be plain
     * paths, so both shapes are handled.
     * @param {string} href
     * @returns {string} Lowercase route name ('' when undeterminable).
     */
    function topLevelRoute(href) {
        try {
            const url = new URL(href, window.location.href);
            const hashMatch = /^#!?\/([^/?#]+)/i.exec(url.hash);
            const pathSegments = url.pathname.split('/').filter(Boolean);
            const normalizedSegments = pathSegments.map(
                (segment) => segment.toLowerCase().replace(/\.html$/i, '')
            );
            const webIndex = normalizedSegments.lastIndexOf('web');
            const dashboardIndex = normalizedSegments.indexOf('dashboard');
            const pathRoute = webIndex >= 0
                ? pathSegments[webIndex + 1]
                : (dashboardIndex >= 0 ? pathSegments[dashboardIndex] : pathSegments[pathSegments.length - 1]);
            const raw = (hashMatch && hashMatch[1]) || pathRoute || '';
            return decodeURIComponent(raw).toLowerCase().replace(/\.html$/i, '');
        } catch (_) {
            return '';
        }
    }

    /**
     * @param {string} href
     * @returns {boolean} True on a route where the user may be editing data.
     */
    function isEditingRoute(href) {
        const route = topLevelRoute(href);
        // Every `mypreferences*` view is a user-settings form; matched by
        // prefix so new Jellyfin preference pages are covered automatically.
        return EDITING_ROUTES.has(route) || route.indexOf('mypreferences') === 0;
    }

    /**
     * @param {string} href
     * @returns {boolean} True on the Home route.
     */
    function isHomeRoute(href) {
        return topLevelRoute(href) === 'home';
    }

    // ── Safety gate ──────────────────────────────────────────────────────────

    /**
     * @param {HTMLMediaElement} element
     * @returns {boolean} True when the element holds a real, unfinished media session.
     */
    function hasLoadedMedia(element) {
        try {
            const source = element.currentSrc
                || element.getAttribute('src')
                || element.querySelector('source[src]')?.getAttribute('src')
                || '';
            // Paused-but-loaded counts: "not currently advancing" is still an
            // active session whose position and queue must survive.
            return Boolean(source)
                && !element.ended
                && (!element.paused || element.readyState > 0);
        } catch (_) {
            // Unreadable element — assume it is live rather than reload over it.
            return true;
        }
    }

    /**
     * Stable reason why reloading right now would be unsafe, or null when safe.
     * Order matters: the cheapest and most decisive checks come first, and
     * 'background' is special-cased by callers (it must never show UI).
     *
     * JE has no refresh-hold registry, so the DOM dialog probe takes the place
     * Canopy's hold registry occupied — an open modal is the observable proxy
     * for "a feature is mid-write".
     *
     * @param {Document} [documentValue]
     * @param {string} [href]
     * @returns {string|null} Block reason key, or null when a reload is safe.
     */
    function refreshSafetyBlockReason(documentValue, href) {
        const doc = documentValue || document;
        const url = href || window.location.href;
        try {
            if (nativeAppPaused || doc.visibilityState === 'hidden') return 'background';

            // Native web-client dialogs plus JE's own overlays. JE overlays are
            // plain divs with no role/aria-modal (the settings panel is a bare
            // #jellyfin-enhanced-panel), so they declare themselves with the
            // data-je-refresh-hold attribute — the minimal JE stand-in for
            // Canopy's refresh-safety hold registry. Any future JE overlay that
            // must block an automatic reload just sets that attribute on its
            // root element.
            const dialogs = doc.querySelectorAll(
                '.dialog.opened, .actionSheet.opened, [role="dialog"], [aria-modal="true"], [data-je-refresh-hold], #jellyfin-enhanced-panel'
            );
            for (const element of dialogs) {
                // A closed-but-retained dialog stays in the DOM inside an
                // aria-hidden/hidden subtree; only visible ones block.
                if (!element.closest('[aria-hidden="true"], [hidden]')) return 'dialog';
            }

            if (isEditingRoute(url)) return 'editing_route';
            if (topLevelRoute(url) === 'video') return 'playback_route';
            if (doc.fullscreenElement || doc.pictureInPictureElement) return 'fullscreen_media';

            const mediaSessionState = navigator.mediaSession?.playbackState;
            if (mediaSessionState === 'playing' || mediaSessionState === 'paused') return 'media_session';

            for (const element of doc.querySelectorAll('video, audio')) {
                if (hasLoadedMedia(/** @type {HTMLMediaElement} */ (element))) return 'media_element';
            }

            const active = doc.activeElement;
            if (active instanceof HTMLElement
                && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) {
                return 'active_editor';
            }
            return null;
        } catch (err) {
            // A probe that throws leaves safety unknown — refuse the reload.
            console.debug(`${logPrefix} safety probe failed:`, err);
            return 'probe_failed';
        }
    }

    /**
     * Final mode/idle arbitration. `force` bypasses the mode gate but never the
     * safety or idle gates.
     * @param {string} mode
     * @param {boolean} force
     * @param {boolean} safe
     * @param {boolean} home
     * @param {boolean} idle
     * @returns {boolean}
     */
    function mayCommitRefresh(mode, force, safe, home, idle) {
        if (!safe || !idle) return false;
        if (force) return true;
        if (mode === 'Disabled' || mode === 'Notify') return false;
        return mode === 'Smart' || home;
    }

    // ── Reload-loop budget ───────────────────────────────────────────────────

    /**
     * Pure budget arithmetic: keep the live stamps inside the window and decide
     * whether one more reload fits.
     * @param {number[]} history - Known reload timestamps (any order).
     * @param {number} now
     * @returns {{allowed: boolean, history: number[]}}
     */
    function nextReloadBudget(history, now) {
        const live = history
            .filter((stamp) => Number.isFinite(stamp) && stamp >= now - RELOAD_BUDGET_WINDOW_MS && stamp <= now)
            .slice(-RELOAD_BUDGET_LIMIT);
        if (live.length >= RELOAD_BUDGET_LIMIT) return { allowed: false, history: live };
        return { allowed: true, history: live.concat([now]) };
    }

    /**
     * @param {'sessionStorage'|'localStorage'} name
     * @returns {Storage|null} The storage, or null when unavailable (private mode, sandboxed iframe).
     */
    function safeStorage(name) {
        try {
            const storage = window[name];
            // Touching the object is what throws in locked-down browsers.
            return storage && typeof storage.getItem === 'function' ? storage : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * @param {Storage} storage
     * @returns {number[]|null} Stored stamps, [] when absent, null when unreadable/invalid.
     */
    function readReloadBudget(storage) {
        try {
            const raw = storage.getItem(RELOAD_BUDGET_KEY);
            if (raw === null || raw === undefined) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)
                || parsed.length > RELOAD_BUDGET_LIMIT
                || !parsed.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
                return null;
            }
            return parsed;
        } catch (_) {
            return null;
        }
    }

    /**
     * Write the budget and prove it stuck. Some embedded WebViews accept
     * setItem without throwing and then drop the value; only a read-after-write
     * match proves this reload was actually counted.
     * @param {Storage} storage
     * @param {string} serialized
     * @param {number[]} expected
     * @returns {boolean} True when the write was verified.
     */
    function writeReloadBudget(storage, serialized, expected) {
        try {
            storage.setItem(RELOAD_BUDGET_KEY, serialized);
        } catch (_) {
            return false;
        }
        const verified = readReloadBudget(storage);
        return Boolean(verified)
            && verified.length === expected.length
            && verified.every((stamp, index) => stamp === expected[index]);
    }

    /**
     * Reserve one reload against the budget. Fails closed: if no storage can be
     * read, or no write can be verified, the reload does NOT happen.
     * @returns {boolean} True when a reload may proceed.
     */
    function reserveReload() {
        const adapters = [safeStorage('sessionStorage'), safeStorage('localStorage')].filter(Boolean);
        const readable = adapters
            .map((storage) => ({ storage, history: readReloadBudget(/** @type {Storage} */ (storage)) }))
            .filter((entry) => entry.history !== null);
        if (readable.length === 0) return false;

        // Both adapters normally mirror the same reservation; de-duplicate exact
        // stamps so mirroring cannot consume the budget twice.
        const combined = [];
        const seen = new Set();
        for (const entry of readable) {
            for (const stamp of /** @type {number[]} */ (entry.history)) {
                if (!seen.has(stamp)) { seen.add(stamp); combined.push(stamp); }
            }
        }

        const budget = nextReloadBudget(combined, Date.now());
        if (!budget.allowed) return false;

        const serialized = JSON.stringify(budget.history);
        let persisted = false;
        for (const entry of readable) {
            if (writeReloadBudget(/** @type {Storage} */ (entry.storage), serialized, budget.history)) {
                persisted = true;
            }
        }
        return persisted;
    }

    // ── Notices ──────────────────────────────────────────────────────────────

    /**
     * Full-state watermark. A genuinely newer build/generation/revision is a new
     * notice event; the SAME unchanged mismatch is re-detected on every poll and
     * must not re-notify.
     * @returns {string}
     */
    function noticeStateKey() {
        return baseline
            ? JSON.stringify([
                canonicalServerId(baseline.ServerId),
                baseline.BuildId,
                baseline.JellyfinGeneration,
                baseline.ConfigurationRevision,
                baseline.ForceRevision
            ])
            : 'no-refresh-state';
    }

    /**
     * Human-readable list of everything currently pending.
     * @returns {string} Localized, comma-joined reason list.
     */
    function pendingLabel() {
        const labels = [];
        if (pendingSources.has('plugin')) labels.push(JE.t('client_refresh_source_plugin'));
        if (pendingSources.has('jellyfin')) labels.push(JE.t('client_refresh_source_jellyfin'));
        if (pendingSources.has('config')) labels.push(JE.t('client_refresh_source_config'));
        if (pendingSources.has('force')) labels.push(JE.t('client_refresh_source_force'));
        return labels.join(', ') || JE.t('client_refresh_source_generic');
    }

    /**
     * Localized clause describing what the refresh is waiting for.
     * @param {string} reason - Block reason from refreshSafetyBlockReason.
     * @returns {string}
     */
    function blockLabel(reason) {
        return JE.t(`client_refresh_block_${reason}`);
    }

    /**
     * Show a transient notice through JE's standard toast. Used for states the
     * user cannot act on — a policy check in flight, an exhausted reload budget,
     * a host that refused `location.reload()`. Deduped by the full state
     * watermark + text, because evaluatePending re-runs every second while
     * waiting for the safety gate to clear.
     *
     * Notices are informational only: they never clear pending intent, and
     * `Policy.ShowNotices === false` suppresses ALL notice UI while the
     * decision ladder keeps running underneath.
     *
     * @param {string} message - Already-localized text.
     */
    function showTransientNotice(message) {
        try {
            if (!policy.ShowNotices || !message) return;
            const stateKey = noticeStateKey();
            if (noticeWatermark !== stateKey) {
                noticeWatermark = stateKey;
                shownNotices.clear();
            }
            if (shownNotices.has(message)) return;
            shownNotices.add(message);
            // Strings come from JE.t and carry no user-controlled interpolation;
            // JE.toast renders HTML so that {{icon:…}} tokens keep working.
            if (typeof JE.core?.ui?.toast === 'function') {
                JE.core.ui.toast(message, NOTICE_DURATION_MS);
            }
        } catch (err) {
            console.debug(`${logPrefix} notice failed:`, err);
        }
    }

    /**
     * Stylesheet for the persistent notice. Colour comes from the active
     * Jellyfin theme (`.paperList` is themed by every bundled theme) and the
     * buttons carry the stock `emby-button` classes, so the bar inherits the
     * client's own look instead of hardcoding one. Layout is fixed-position and
     * animates only `opacity`/`transform`, so showing it never reflows the page.
     */
    function ensureNoticeStyles() {
        if (document.getElementById(NOTICE_STYLE_ID)) return;
        const css = `
            #${NOTICE_ELEMENT_ID} {
                position: fixed;
                left: max(1em, env(safe-area-inset-left));
                right: max(1em, env(safe-area-inset-right));
                bottom: max(1em, env(safe-area-inset-bottom));
                z-index: 99000;
                box-sizing: border-box;
                margin: 0 auto;
                max-width: 42em;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: flex-end;
                gap: 0.4em;
                padding: 0.6em 0.7em;
                border-radius: 0.2em;
                box-shadow: 0 16px 24px 2px rgba(0, 0, 0, 0.14), 0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.4);
                opacity: 0;
                transform: translateY(0.5em);
                transition: opacity 0.2s ease-out, transform 0.2s ease-out;
            }
            #${NOTICE_ELEMENT_ID}.je-client-refresh-notice-visible {
                opacity: 1;
                transform: none;
            }
            #${NOTICE_ELEMENT_ID} .je-client-refresh-notice-message {
                flex: 1 1 16em;
                padding: 0 0.5em;
                line-height: 1.4;
            }
            #${NOTICE_ELEMENT_ID} .je-client-refresh-notice-actions {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: flex-end;
            }
            #${NOTICE_ELEMENT_ID} .je-client-refresh-notice-btn {
                margin: 0 0 0 0.3em;
                padding: 0.7em 1em;
                white-space: nowrap;
            }
            @media (prefers-reduced-motion: reduce) {
                #${NOTICE_ELEMENT_ID} {
                    transition: none;
                }
            }
        `;
        if (typeof JE.core?.ui?.injectCss === 'function') {
            JE.core.ui.injectCss(NOTICE_STYLE_ID, css);
            return;
        }
        const style = document.createElement('style');
        style.id = NOTICE_STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    /** Take the persistent notice off the page. Safe to call at any time. */
    function removeNotice() {
        try {
            notice?.remove();
            // A previous instance can outlive `notice` if something else moved
            // or replaced the body; one instance max, always.
            document.getElementById(NOTICE_ELEMENT_ID)?.remove();
        } catch (err) {
            console.debug(`${logPrefix} notice removal failed:`, err);
        }
        notice = null;
    }

    /**
     * Build the notice element. Markup is parsed from a static HTML string with
     * no interpolation at all (labels and message are assigned as text
     * afterwards) so the custom-element upgrade sees real `is="emby-button"`
     * buttons and no string can reach an HTML sink.
     * @returns {HTMLElement|null} The connected notice, or null when unavailable.
     */
    function buildNotice() {
        if (!document.body) return null;
        removeNotice();
        ensureNoticeStyles();

        const root = document.createElement('div');
        root.id = NOTICE_ELEMENT_ID;
        // `paperList` is the web client's own themed surface colour.
        root.className = 'paperList';
        root.innerHTML = '<span class="je-client-refresh-notice-message" data-role="message" role="status" aria-live="polite" aria-atomic="true"></span>'
            + '<span class="je-client-refresh-notice-actions">'
            + '<button is="emby-button" type="button" class="raised button-submit je-client-refresh-notice-btn" data-role="reload"></button>'
            + '<button is="emby-button" type="button" class="button-flat je-client-refresh-notice-btn" data-role="dismiss"></button>'
            + '</span>';

        const reloadButton = /** @type {HTMLButtonElement|null} */ (root.querySelector('[data-role="reload"]'));
        const dismissButton = /** @type {HTMLButtonElement|null} */ (root.querySelector('[data-role="dismiss"]'));
        if (!reloadButton || !dismissButton) return null;
        reloadButton.textContent = JE.t('client_refresh_action_reload');
        dismissButton.textContent = JE.t('client_refresh_action_dismiss');

        reloadButton.addEventListener('click', () => {
            // Explicit consent: queue the same source an administrator's refresh
            // button queues, and waive the idle wait. The safety gate is
            // untouched — commitReload re-checks it immediately before reloading.
            userRequestedReload = true;
            userRequestedReloadAt = Date.now();
            pendingSources.add('force');
            evaluatePending();
        });
        dismissButton.addEventListener('click', dismissNotice);
        // Keyboard dismissal, scoped to the notice: a document-level Escape hook
        // would fight the web client's own back/close handling.
        root.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' && event.key !== 'Esc') return;
            event.preventDefault();
            event.stopPropagation();
            dismissNotice();
        });

        document.body.appendChild(root);
        // Customized built-ins are upgraded by the web client's v0 polyfill; if
        // it is absent the class is applied by hand so the button still looks
        // native. Both paths leave exactly one `emby-button` class behind.
        try { window.CustomElements?.upgradeSubtree?.(root); } catch (_) { /* no polyfill */ }
        for (const button of [reloadButton, dismissButton]) {
            if (!button.classList.contains('emby-button')) button.classList.add('emby-button');
        }
        // Fade in on the next frame — opacity/transform only, so nothing reflows.
        window.requestAnimationFrame(() => root.classList.add('je-client-refresh-notice-visible'));
        return root;
    }

    /** Dismiss the notice for the current watermark, keeping pending intent. */
    function dismissNotice() {
        dismissedNoticeStateKey = noticeStateKey();
        // A dismissed notice withdraws the reload consent too — the user chose
        // "not now", so a later automatic commit uses the normal settle window.
        userRequestedReload = false;
        removeNotice();
    }

    /**
     * Show (or update in place) the persistent, actionable notice. Used for the
     * states where the refresh is waiting on the user: the Notify-mode prompt, a
     * closed safety gate, and Home-only waiting for the Home route.
     *
     * Like the toasts, this is informational plus opt-in: it never clears
     * pending intent, dismissal only hides it for the current watermark, and
     * `Policy.ShowNotices === false` suppresses it entirely while the decision
     * ladder keeps running underneath.
     *
     * @param {string} message - Already-localized text.
     */
    function showNotice(message) {
        try {
            if (!policy.ShowNotices || !message) {
                removeNotice();
                return;
            }
            if (dismissedNoticeStateKey === noticeStateKey()) {
                removeNotice();
                return;
            }
            if (!notice || !notice.isConnected) {
                notice = buildNotice();
                if (!notice) return;
            }
            const label = notice.querySelector('[data-role="message"]');
            if (label && label.textContent !== message) label.textContent = message;
        } catch (err) {
            console.debug(`${logPrefix} notice failed:`, err);
        }
    }

    /** Allow every notice to be raised again once the state moves on. */
    function resetNotices() {
        noticeWatermark = null;
        shownNotices.clear();
        dismissedNoticeStateKey = null;
        userRequestedReload = false;
        removeNotice();
    }

    // ── Timers ───────────────────────────────────────────────────────────────

    /**
     * @param {'poll'|'decision'|'retry'} name
     */
    function clearTimer(name) {
        const value = name === 'poll' ? pollTimer : (name === 'decision' ? decisionTimer : retryTimer);
        if (value !== null) window.clearTimeout(value);
        if (name === 'poll') pollTimer = null;
        else if (name === 'decision') decisionTimer = null;
        else retryTimer = null;
    }

    /**
     * Re-run the decision ladder later (safety gate still closed, budget spent).
     * @param {number} delayMs
     */
    function scheduleRetry(delayMs) {
        clearTimer('retry');
        retryTimer = window.setTimeout(() => {
            retryTimer = null;
            evaluatePending();
        }, Math.max(250, delayMs));
    }

    // ── Foreground detection ─────────────────────────────────────────────────

    /**
     * @returns {boolean} True when the tab is visible and the host app is not paused.
     */
    function isForeground() {
        try {
            return !nativeAppPaused && document.visibilityState !== 'hidden';
        } catch (_) {
            return false;
        }
    }

    /**
     * Whether somebody is signed in. The state endpoint is `[Authorize]`d, so
     * polling it from the login screen only produces a 401 every PollSeconds.
     *
     * The live client is asked first (the same `getCurrentUserId() &&
     * accessToken()` pair the rest of JE uses), because session.js's snapshot
     * can lag by up to one reconcile tick on hosts where the auth hook could
     * not be installed. A host that can answer neither question keeps the
     * pre-session behaviour rather than silently disabling the feature.
     *
     * @returns {boolean} True when the page may talk to an authenticated endpoint.
     */
    function hasSignedInUser() {
        try {
            if (typeof ApiClient !== 'undefined' && ApiClient
                && typeof ApiClient.getCurrentUserId === 'function'
                && typeof ApiClient.accessToken === 'function') {
                return Boolean(ApiClient.getCurrentUserId() && ApiClient.accessToken());
            }
            if (typeof JE.session?.getUserId === 'function') {
                return Boolean(JE.session.getUserId());
            }
            return true;
        } catch (_) {
            // Unknowable — never let a probe failure disable convergence.
            return true;
        }
    }

    /**
     * @returns {boolean} True when a state poll is worth making right now.
     */
    function isPollable() {
        return isForeground() && hasSignedInUser();
    }

    // ── Reload commit ────────────────────────────────────────────────────────

    /**
     * Start a reload and arm a watchdog. Some hosts block or ignore
     * `location.reload()`; the document surviving the watchdog window proves it.
     * @param {() => void} reload
     * @param {() => void} onDocumentSurvived
     * @returns {*} Watchdog timer id, or null when reload threw synchronously.
     */
    function beginReloadAttempt(reload, onDocumentSurvived) {
        try {
            reload();
        } catch (_) {
            onDocumentSurvived();
            return null;
        }
        return window.setTimeout(onDocumentSurvived, RELOAD_SURVIVAL_WATCHDOG_MS);
    }

    /** Watchdog callback: the page is still here, so the reload did not happen. */
    function recoverFailedReload() {
        reloadRecoveryTimer = null;
        if (!reloadCommitted) return;
        reloadCommitted = false;
        if (pendingSources.size > 0) showTransientNotice(JE.t('client_refresh_reload_failed'));
    }

    /**
     * Perform the irreversible step, after re-proving it is safe and affordable.
     */
    function commitReload() {
        if (reloadCommitted) return;
        // Deliberately repeated immediately before the point of no return: a
        // play event or dialog can land while the idle timer was queued.
        const block = refreshSafetyBlockReason();
        if (block !== null) {
            if (block !== 'background') scheduleRetry(1000);
            return;
        }
        if (!reserveReload()) {
            // Persistent, not transient: a safety-block notice may already be on
            // screen with a now-false reason, and this path can hold for a full
            // budget window. Updating the bar in place keeps the message true
            // and keeps the Reload/Dismiss actions available (Canopy raises the
            // persistent notice on this state too).
            showNotice(JE.t('client_refresh_loop_stopped'));
            scheduleRetry(RELOAD_BUDGET_WINDOW_MS);
            return;
        }

        reloadCommitted = true;
        // The page is going away: drop the notice now so it cannot flash over
        // the unload, and so a blocked reload starts from a clean surface.
        removeNotice();
        if (reloadRecoveryTimer !== null) window.clearTimeout(reloadRecoveryTimer);
        console.log(`${logPrefix} reloading (${[...pendingSources].join(', ')})`);
        reloadRecoveryTimer = beginReloadAttempt(
            () => window.location.reload(),
            recoverFailedReload
        );
    }

    // ── Decision ladder ──────────────────────────────────────────────────────

    /**
     * Decide what to do about the currently pending refresh sources. Cheap and
     * idempotent — called from polls, interactions, navigation and timers.
     */
    function evaluatePending() {
        try {
            if (typeof window === 'undefined' || !started) return;
            clearTimer('decision');

            if (pendingSources.size === 0 || reloadCommitted) {
                if (pendingSources.size === 0) resetNotices();
                else removeNotice();
                return;
            }

            const force = pendingSources.has('force');

            // The policy that would be applied is from before the current
            // in-flight drain: hold every decision until it completes. Explicit
            // consent is exempt — a force commit never consults policy.Mode or
            // the update-source toggles (see mayCommitRefresh), so holding it
            // here would leave the notice's Reload button dead for a whole poll
            // interval whenever the last poll failed (server restarting is
            // precisely when users press Reload). The safety gate below still
            // protects a force commit.
            if (!foregroundStateFresh && !force) {
                showTransientNotice(JE.t('client_refresh_checking_policy'));
                return;
            }

            if (!force && policy.Mode === 'Disabled') {
                pendingSources.clear();
                resetNotices();
                return;
            }
            if (!force && policy.Mode === 'Notify') {
                showNotice(JE.t('client_refresh_notify_prompt', { reason: pendingLabel() }));
                return;
            }

            const block = refreshSafetyBlockReason();
            if (block !== null) {
                // Backgrounded tabs wait silently — no timers, no UI; the
                // foreground signal restarts the ladder.
                if (block !== 'background') {
                    showNotice(JE.t('client_refresh_waiting', { reason: blockLabel(block) }));
                    scheduleRetry(1000);
                }
                return;
            }

            const home = isHomeRoute(window.location.href);
            if (!force && policy.Mode === 'HomeOnly' && !home) {
                showNotice(JE.t('client_refresh_return_home'));
                return;
            }

            // Even an idle window of zero needs one task for the host's own
            // click handler plus a short dispatch window for Jellyfin's
            // fire-and-forget Favorite/Played mutations. A user who pressed
            // Reload is the exception: their click IS the settle signal, and
            // waiting out the admin idle window after it would read as a dead
            // button.
            const idleMs = Math.max(policy.IdleSeconds * 1000, MIN_INTERACTION_SETTLE_MS);
            // The waiver is scoped to the click itself: fresh consent commits
            // immediately (the button must not read as dead), but consent given
            // while the safety gate was closed expires, so when the block
            // clears much later the normal settle window protects whatever
            // interaction cleared it (e.g. the click on a Favorite button whose
            // fire-and-forget POST a same-task reload would abort).
            const consentFresh = userRequestedReload
                && (Date.now() - userRequestedReloadAt) <= Math.max(MIN_INTERACTION_SETTLE_MS, 2000);
            const remaining = consentFresh
                ? 0
                : Math.max(0, lastInteractionAt + idleMs - Date.now());
            if (!mayCommitRefresh(policy.Mode, force, true, home, remaining === 0)) {
                decisionTimer = window.setTimeout(() => {
                    decisionTimer = null;
                    evaluatePending();
                }, Math.max(50, remaining));
                return;
            }

            commitReload();
        } catch (err) {
            console.debug(`${logPrefix} evaluation failed:`, err);
        }
    }

    // ── Pending-source bookkeeping ───────────────────────────────────────────

    /**
     * @param {string} source
     * @returns {boolean} Whether the live policy admits this source.
     */
    function isSourceEnabled(source) {
        return source === 'force'
            || (policy.Mode !== 'Disabled'
                && (source !== 'plugin' || policy.OnPluginUpdate)
                && (source !== 'jellyfin' || policy.OnJellyfinUpdate)
                && (source !== 'config' || policy.OnConfigChange));
    }

    /**
     * Admit newly-detected sources. 'force' is unconditional — an administrator
     * pressing the button outranks the per-source toggles.
     * @param {Set<string>} sources
     */
    function queueSources(sources) {
        for (const source of sources) {
            if (source === 'force' || isSourceEnabled(source)) pendingSources.add(source);
        }
    }

    /** Drop intent an admin has since disabled (policy is re-read every poll). */
    function reconcilePendingSources() {
        for (const source of [...pendingSources]) {
            if (!isSourceEnabled(source)) pendingSources.delete(source);
        }
    }

    // ── Polling ──────────────────────────────────────────────────────────────

    /**
     * Arm the next poll. No-op while backgrounded or signed out.
     * @param {number} [delayMs] Override for the delay — used by the foreground
     *     floor to schedule a near-term catch-up instead of a full interval.
     */
    function schedulePoll(delayMs) {
        if (typeof window === 'undefined') return;
        clearTimer('poll');
        if (!started || !isPollable()) return;
        pollTimer = window.setTimeout(() => {
            pollTimer = null;
            if (isPollable()) requestStateCheck();
        }, typeof delayMs === 'number' ? Math.max(250, delayMs) : policy.PollSeconds * 1000);
    }

    /**
     * One state poll: fetch, validate, adopt, detect.
     * @returns {Promise<boolean>} True when a valid response was applied.
     */
    async function performStateCheck() {
        const serverId = activeServerId();
        if (!started || !isPollable() || !serverId) return false;
        if (typeof JE.core?.api?.plugin !== 'function') return false;

        const controller = new AbortController();
        checkController = controller;
        try {
            // A server switch invalidates the watermark entirely: revisions and
            // generations from server A mean nothing on server B. Re-run the
            // baseline capture for the new server instead of assuming the worst
            // — the injected bootstrap describes the server this document was
            // loaded from, so only the authenticated lane can speak for the new
            // one. Conservative mode is armed ONLY when that capture fails;
            // otherwise the mere act of switching servers could queue 'force'
            // (see detectConservativeFirstStateSources) and reload the page.
            if (baselineServerId && baselineServerId !== serverId) {
                console.debug(`${logPrefix} server changed — recapturing the baseline`);
                pendingSources.clear();
                resetNotices();
                baseline = null;
                baselineServerId = null;
                policy = FAIL_CLOSED_POLICY;
                conservativeFirstState = false;

                const recaptured = await captureBaselineFromServer(serverId, controller.signal);
                // The switch may have been followed by another one, or the tab
                // may have gone away, while that request was in flight.
                if (!started || !isPollable() || activeServerId() !== serverId) return false;
                conservativeFirstState = !recaptured;
                return recaptured;
            }

            const raw = await JE.core.api.plugin(`/client-refresh-state?_=${Date.now()}`, {
                signal: controller.signal,
                skipCache: true,
                skipRetry: true,
                timeoutMs: STATE_TIMEOUT_MS
            });
            if (!started || !isPollable()) return false;

            const next = normalizeRefreshState(raw, serverId);
            if (!next || !stateBelongsToServer(next, serverId)) return false;

            const previous = baseline;
            const firstStateAfterFailedCapture = previous === null && conservativeFirstState;
            if (!isMonotonicRefreshTransition(previous, next)) {
                console.debug(`${logPrefix} ignored a non-monotonic same-generation state response`);
                return false;
            }

            // Apply state + policy atomically BEFORE reconciling old intent or
            // admitting new sources, so both are judged by the same policy.
            baseline = next;
            baselineServerId = canonicalServerId(next.ServerId);
            policy = next.Policy;
            reconcilePendingSources();
            // The loaded build matches again (admin rolled the update back) —
            // the stale 'plugin' intent no longer describes reality.
            if (next.BuildId === loadedBuildId) pendingSources.delete('plugin');

            queueSources(firstStateAfterFailedCapture
                ? detectConservativeFirstStateSources(next, loadedBuildId)
                : detectRefreshSources(previous, next, loadedBuildId));
            if (firstStateAfterFailedCapture) conservativeFirstState = false;
            return true;
        } catch (error) {
            if (!controller.signal.aborted) {
                console.debug(`${logPrefix} state check failed:`, error);
            }
            return false;
        } finally {
            if (checkController === controller) checkController = null;
        }
    }

    /**
     * Coalesce concurrent checks into one in-flight fetch plus one queued rerun.
     * The freshness barrier covers the WHOLE drain, so no foreground event can
     * act on pending intent between an old and a newly-requested response.
     * @returns {Promise<void>}
     */
    function requestStateCheck() {
        if (!started || !isPollable()) return Promise.resolve();
        checkRequested = true;
        foregroundStateFresh = false;
        if (checkDrain) return checkDrain;

        const drain = (async () => {
            let finalResponseApplied = false;
            while (checkRequested && started && isPollable()) {
                checkRequested = false;
                finalResponseApplied = await performStateCheck();
            }
            if (started && isPollable()) {
                foregroundStateFresh = finalResponseApplied;
                // Re-run the ladder even after a failed drain: a pending force
                // source may proceed regardless of policy freshness, and its
                // safety-retry loop must not stay frozen until the next poll.
                evaluatePending();
            }
        })().catch((err) => {
            console.debug(`${logPrefix} drain failed:`, err);
        }).finally(() => {
            if (checkDrain !== drain) return;
            checkDrain = null;
            lastDrainCompletedAt = Date.now();
            schedulePoll();
        });
        checkDrain = drain;
        return drain;
    }

    // ── Interaction + foreground listeners ───────────────────────────────────

    /** Stamp "the user is doing something" and re-arm the idle gate. */
    function markInteraction() {
        lastInteractionAt = Date.now();
        if (pendingSources.size > 0) {
            // Capture-phase interaction runs BEFORE the target's own handler can
            // start a write, open a modal or start playback. Defer one task so
            // that handler establishes its safety owner before a zero-idle
            // refresh is reconsidered.
            clearTimer('decision');
            decisionTimer = window.setTimeout(() => {
                decisionTimer = null;
                evaluatePending();
            }, 0);
        }
    }

    /**
     * Continuous-event variant: stamps the idle clock WITHOUT re-arming the
     * decision ladder. pointermove/wheel/touchmove/scroll fire at frame rate,
     * and running evaluatePending() (two document-wide safety-probe
     * querySelectorAll calls plus route parsing) once per event while a refresh
     * is pending is sustained main-thread work — exactly the hover/scroll jank
     * JE forbids. The idle gate's own decision timer and scheduleRetry(1000)
     * already re-evaluate on a bounded cadence; the stamp alone keeps the idle
     * window honest.
     */
    function markContinuousInteraction() {
        lastInteractionAt = Date.now();
    }

    /** Stop every timer and abort any in-flight poll (backgrounded tab, signed-out tab). */
    function suspendBackgroundWork() {
        foregroundStateFresh = false;
        checkRequested = false;
        try { checkController?.abort(); } catch (_) { /* already settled */ }
        clearTimer('poll');
        clearTimer('decision');
        clearTimer('retry');
    }

    /**
     * Foreground/visibility/connectivity signal: either suspend everything, or
     * catch up immediately. This is the path mobile app WebViews rely on —
     * they are hidden far more often than they are polled.
     *
     * A signed-out tab takes exactly the same suspend path as a hidden one:
     * the login screen has no token to poll the state endpoint with.
     */
    function handleForegroundSignal() {
        try {
            if (!isPollable()) {
                suspendBackgroundWork();
                return;
            }
            // Foreground events (focus/visibilitychange/online/pageshow) can
            // arrive many times a minute while a user alt-tabs, and each check
            // is a real authenticated round trip the ?_= buster defeats every
            // cache for. A short floor keeps the admin's poll interval an
            // honest upper bound on request rate.
            const floorMs = Math.min(5000, policy.PollSeconds * 1000);
            const sinceDrain = Date.now() - lastDrainCompletedAt;
            if (sinceDrain >= floorMs) {
                requestStateCheck();
            } else if (!checkDrain && (!foregroundStateFresh || pollTimer === null)) {
                // Floored, and nothing else will lift the freshness barrier: a
                // hide (or a check that never landed) cleared it, so the whole
                // ladder — including the notice's Reload button — is barred
                // until a drain completes. Arm the catch-up at the REMAINING
                // floor time rather than a full poll interval, which would
                // freeze the pending refresh for up to PollSeconds. The same
                // arm covers the (narrow) case of fresh state with no timer.
                schedulePoll(floorMs - sinceDrain);
            }
            // Otherwise the state is fresh AND the regular poll is already
            // armed, so nothing is barred and no request is due: the decision
            // below acts on state at most floorMs old, exactly as every other
            // ladder entry point does. Deliberately neither re-armed (that
            // would reset the admin's poll phase on every alt-tab) nor barred
            // by clearing foregroundStateFresh (that would swallow this
            // user's Reload click for a whole floor and toast "checking
            // policy" at them on every focus while a notice is up).
            if (pendingSources.size > 0) evaluatePending();
        } catch (err) {
            console.debug(`${logPrefix} foreground signal failed:`, err);
        }
    }

    // ── Identity re-scoping ──────────────────────────────────────────────────

    /**
     * Rebuild this module's per-session state for the user who just signed in.
     *
     * Deliberately deferred out of the reset handler: session.js runs reset
     * handlers BEFORE the host installs the new credentials, so capturing here
     * synchronously would send the request unauthenticated (or with the
     * outgoing user's token).
     *
     * @param {number|null} changeEpoch - Identity epoch this re-scope belongs to.
     * @param {boolean} hadBaseline - Whether a server watermark was known before the switch.
     * @returns {Promise<void>}
     */
    async function rescopeToCurrentUser(changeEpoch, hadBaseline) {
        try {
            // The epoch guard closes the race where a second switch (or a
            // logout) lands while the capture below is in flight.
            const isCurrentEpoch = () => changeEpoch === null
                || typeof JE.session?.isCurrent !== 'function'
                || JE.session.isCurrent(changeEpoch);
            if (!started || !isCurrentEpoch() || !isPollable()) return;

            const serverId = activeServerId();
            const controller = new AbortController();
            checkController = controller;
            let captured = false;
            try {
                captured = await captureBaselineFromServer(serverId, controller.signal);
            } finally {
                if (checkController === controller) checkController = null;
            }
            if (!started || !isCurrentEpoch() || !isPollable()) return;

            // A failed capture means "this client never observed the server
            // generation" — which is only true when it never had a baseline at
            // all. After a plain user switch the pre-switch watermark did
            // describe this server, so arming conservative mode here would
            // reload the page for merely signing in.
            conservativeFirstState = !captured && !hadBaseline;
            // Signing in IS an interaction; give the new session a full settle
            // window before anything can reload under it.
            lastInteractionAt = Date.now();
            requestStateCheck();
        } catch (err) {
            console.debug(`${logPrefix} user re-scope failed:`, err);
        }
    }

    /**
     * JE.session reset handler. The web client logs out and back in without
     * ever reloading index.html, so every per-session artefact this module
     * owns has to be dropped and rebuilt for the incoming identity: pending
     * intent detected for the previous user, the notice plus the dismissal
     * watermark that was that user's answer, the timers, the in-flight poll,
     * and the server watermark the pending intent was derived from.
     *
     * @param {{userId?: string|null, epoch?: number}} [change]
     */
    function handleUserChange(change) {
        try {
            pendingSources.clear();
            resetNotices();
            // Timers, the in-flight poll and the freshness barrier all belong
            // to the outgoing identity — reuse the suspend path verbatim.
            suspendBackgroundWork();

            const hadBaseline = baseline !== null;
            // The watermark is server-scoped, not user-scoped, but the pending
            // intent derived from it has just been dropped: keeping it would
            // let the new user's first poll re-detect the previous user's
            // change. Recapture instead. `loadedBuildId` is deliberately NOT
            // touched — this document really is running the bundle it loaded,
            // whoever is signed in, so 'plugin' detection survives the switch.
            baseline = null;
            baselineServerId = null;
            policy = FAIL_CLOSED_POLICY;
            conservativeFirstState = false;

            if (!started) return;

            // session.js's view of the INCOMING identity is authoritative here;
            // the live ApiClient still holds the outgoing credentials at reset
            // time. Signed out ⇒ stay fully suspended rather than 401-ing the
            // [Authorize] state endpoint every PollSeconds behind the login
            // screen; the next transition re-arms everything.
            const signedIn = change && Object.prototype.hasOwnProperty.call(change, 'userId')
                ? Boolean(change.userId)
                : hasSignedInUser();
            if (!signedIn) {
                console.debug(`${logPrefix} signed out — polling suspended`);
                return;
            }

            const changeEpoch = typeof change?.epoch === 'number' ? change.epoch : null;
            window.setTimeout(() => { rescopeToCurrentUser(changeEpoch, hadBaseline); }, 0);
        } catch (err) {
            console.debug(`${logPrefix} user change handling failed:`, err);
        }
    }

    /**
     * Install every listener the module needs. All handlers are individually
     * fail-safe; none may ever propagate an error into a host event.
     */
    function installListeners() {
        if (listenersInstalled) return;
        listenersInstalled = true;

        const listen = (target, type, fn, opts) => {
            const safeFn = (event) => {
                try { fn(event); } catch (err) { console.debug(`${logPrefix} listener error:`, err); }
            };
            if (handle) handle.addListener(target, type, safeFn, opts);
            else target.addEventListener(type, safeFn, opts);
        };

        // Interaction stamping. Capture phase so nested Jellyfin handlers cannot
        // swallow the signal; passive where the handler never preventDefaults.
        for (const type of ['pointerdown', 'keydown', 'input', 'change', 'click']) {
            listen(document, type, markInteraction, {
                capture: true,
                passive: type === 'pointerdown' || type === 'click'
            });
        }
        for (const type of ['pointermove', 'wheel', 'touchstart', 'touchmove']) {
            listen(document, type, markContinuousInteraction, { capture: true, passive: true });
        }
        // scroll does not bubble — capture it from nested Jellyfin scrollers.
        listen(document, 'scroll', markContinuousInteraction, { capture: true, passive: true });
        // Media transitions change the safety verdict, so they re-arm the ladder.
        for (const type of ['play', 'pause', 'ended', 'emptied']) {
            listen(document, type, markInteraction, { capture: true, passive: true });
        }

        // Cordova/WebView app lifecycle: a paused native app is background even
        // though its document may still report itself visible.
        listen(document, 'pause', (event) => {
            if (event.target !== document) return;
            nativeAppPaused = true;
            handleForegroundSignal();
        }, true);
        listen(document, 'resume', (event) => {
            if (event.target !== document) return;
            nativeAppPaused = false;
            handleForegroundSignal();
        }, true);

        listen(document, 'visibilitychange', handleForegroundSignal);
        for (const type of ['focus', 'online', 'pageshow']) {
            listen(window, type, handleForegroundSignal);
        }

        // Identity re-scoping. Everything below the transport is per-session,
        // and JE's SPA logout/login never reloads the document. Optional at
        // every step: on a core without session.js the module simply keeps its
        // previous (page-lifetime) scoping rather than failing to boot.
        try {
            const unregisterSession = JE.session?.onUserChange?.('client-refresh', handleUserChange);
            if (handle && typeof unregisterSession === 'function') handle.track(unregisterSession);
        } catch (err) {
            console.debug(`${logPrefix} session registration failed:`, err);
        }

        // SPA navigation can clear the safety gate (leaving a settings page) or
        // satisfy HomeOnly, so re-run the ladder on every route change.
        if (typeof JE.core?.navigation?.onNavigate === 'function') {
            JE.core.navigation.onNavigate(() => {
                // Backstop for a login that no identity detector surfaced (or
                // one that landed before this module was listening): every
                // login navigates, and re-arming is a no-op when the poll is
                // already armed or a drain is running.
                if (started && pollTimer === null && !checkDrain && isPollable()) requestStateCheck();
                if (pendingSources.size > 0) evaluatePending();
            });
        }
    }

    // ── Startup ──────────────────────────────────────────────────────────────

    /**
     * Adopt a validated state as the comparison baseline without treating it as
     * a change (it describes the page that is already loaded).
     * @param {object} state
     */
    function adoptBaseline(state) {
        baseline = state;
        baselineServerId = canonicalServerId(state.ServerId);
        policy = state.Policy;
    }

    /**
     * Authenticated baseline-capture lane: ask the server itself for its
     * current watermark and adopt it. Tolerates a legacy payload with no
     * ServerId, because the transport itself already proves the server.
     *
     * This is the only lane that can speak for a server other than the one that
     * served this document, so it is what a mid-session server switch re-runs.
     *
     * @param {string|null} serverId - Canonical id of the server to capture from.
     * @param {AbortSignal} [signal] - Optional signal for the in-flight request.
     * @returns {Promise<boolean>} True when a baseline was captured.
     */
    async function captureBaselineFromServer(serverId, signal) {
        try {
            if (!serverId || typeof JE.core?.api?.plugin !== 'function') return false;
            const raw = await JE.core.api.plugin(`/client-refresh-state?_=${Date.now()}`, {
                signal,
                skipCache: true,
                skipRetry: true,
                timeoutMs: STATE_TIMEOUT_MS
            });
            const state = normalizeRefreshState(raw, serverId);
            if (state && stateBelongsToServer(state, serverId)) {
                adoptBaseline(state);
                return true;
            }
            console.warn(`${logPrefix} state endpoint returned an unusable payload; continuing with conservative polling.`);
        } catch (error) {
            // A server without this feature legitimately has no endpoint. Boot
            // must continue — a missing baseline only means the first valid
            // state is treated conservatively.
            console.warn(`${logPrefix} refresh baseline unavailable; continuing with conservative polling.`, error);
        }
        return false;
    }

    /**
     * Capture the startup watermark. The injected bootstrap is preferred
     * because it is load-coupled: it describes the exact server state that
     * produced THIS page, so an edge landing during boot is detected by the
     * first poll instead of being absorbed into the baseline.
     * @returns {Promise<boolean>} True when a baseline was captured.
     */
    async function captureBaseline() {
        const serverId = activeServerId();

        // Bootstrap lane: strict — the anonymous document payload must carry
        // explicit, matching provenance.
        const bootstrap = normalizeRefreshState(JE.clientRefreshBootstrap);
        if (bootstrap && stateBelongsToServer(bootstrap, serverId)) {
            adoptBaseline(bootstrap);
            return true;
        }
        if (JE.clientRefreshBootstrap) {
            console.debug(`${logPrefix} injected bootstrap rejected (invalid or foreign server)`);
        }

        return captureBaselineFromServer(serverId);
    }

    /**
     * Boot the module: capture a baseline, install listeners, start polling.
     * Everything is wrapped — this feature must never break JE initialization.
     * @returns {Promise<void>}
     */
    async function initialize() {
        try {
            if (started) return;
            const captured = await captureBaseline();
            // Capture failed ⇒ this client never observed the server generation.
            conservativeFirstState = !captured;
            started = true;
            lastInteractionAt = Date.now();
            installListeners();
            if (isPollable()) requestStateCheck();
            console.log(`${logPrefix} initialized (mode ${policy.Mode}, build ${loadedBuildId ? loadedBuildId.slice(0, 12) : 'unknown'})`);
        } catch (err) {
            console.error(`${logPrefix} failed to initialize:`, err);
        }
    }

    // Diagnostics + unit-testable surface. Deliberately small: the module owns
    // its own lifecycle and needs no external driver.
    JE.clientRefresh = {
        normalizeRefreshState,
        detectRefreshSources,
        detectConservativeFirstStateSources,
        isMonotonicRefreshTransition,
        refreshSafetyBlockReason,
        mayCommitRefresh,
        nextReloadBudget,
        topLevelRoute,
        isEditingRoute,
        isHomeRoute,
        /** @returns {object} Current runtime snapshot (debugging aid). */
        getState: () => ({
            started,
            loadedBuildId,
            baseline,
            policy,
            pending: [...pendingSources],
            foregroundStateFresh,
            conservativeFirstState,
            reloadCommitted,
            signedIn: hasSignedInUser(),
            pollArmed: pollTimer !== null,
            noticeShown: Boolean(notice?.isConnected),
            noticeDismissedFor: dismissedNoticeStateKey,
            userRequestedReload
        })
    };

    initialize();

})(window.JellyfinEnhanced);
