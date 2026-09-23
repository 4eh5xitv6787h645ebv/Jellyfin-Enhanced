/** Dashboard connection cache boundary. */
function createDashboardConnectionCache({
    lifecycle,
    testJellyseerrBtn,
    renderServiceStatusDashboard,
    updateStatusDashboard,
    formatDateDMY,
}) {
    // ==============================================================
    // Connection-test cache + Integration Health checklist (phase 4).
    // The checklist on Overview is a live health view of every
    // integration the admin has turned on. It renders rows purely
    // from (live config) + (cached test results), so it doesn't
    // hammer external services on every render. TTL keeps results
    // fresh without forcing probes on every click. The "Re-test all"
    // Quick Action clears the cache and re-invokes every test.
    // ==============================================================
    var CONNECTION_TEST_CACHE_TTL_MS = 5 * 60 * 1000;

    var _jeConnectionTestCache = new Map();

    // Generation counter for the cache. Every clear bumps it; any
    // write that was captured (via beginConnectionTest) at a prior
    // generation is dropped. Closes the race where a user clicks a
    // per-service Test button, then clicks Re-test-all, then the
    // original click's async result resolves and writes a stale
    // ok/error over the fresh result. See design review H2.
    var _jeCacheGeneration = 0;

    /**
     * Capture the current cache generation. Tests call this at START
     * and pass the returned token to setConnectionTestResult. A token
     * older than the current generation means the cache was cleared
     * mid-test and this write is stale — it gets dropped.
     */
    function beginConnectionTest() {
        return _jeCacheGeneration;
    }

    // When true, per-service tests skip their own Dashboard.alert
    // success/failure dialog. The Re-test-all Quick Action sets this
    // for the duration of a batch and shows a single aggregate dialog
    // at the end, instead of stacking 8+ modal prompts the admin has
    // to dismiss one by one.
    var _jeSuppressTestAlerts = false;

    /**
     * Dashboard.alert that respects the batch-mode suppression flag.
     * Use inside any per-service test function where a Dashboard.alert
     * is part of the individual-test UX but would spam the admin when
     * the test fires as part of a batch re-test.
     */
    function jeTestAlert(opts) {
        if (_jeSuppressTestAlerts) return;
        try {
            Dashboard.alert(opts);
        } catch (e) {
            console.warn('[JE] Dashboard.alert threw:', e);
        }
    }

    /**
     * Write a test result into the cache and refresh the checklist.
     * Safe to call multiple times; last write wins within the same
     * generation. Cache-refresh is guarded against exceptions so a
     * bug in renderChecklist can't cascade and break the actual
     * test flow.
     * @param {string} key  e.g. 'tmdb', 'seerr', 'sonarr:<normalizedUrl>'
     * @param {'ok'|'error'} status
     * @param {string} detail short human message shown in the row
     * @param {number} [token] optional generation token from
     *   beginConnectionTest; stale tokens are silently dropped.
     */
    function setConnectionTestResult(key, status, detail, token) {
        if (token !== undefined && token !== _jeCacheGeneration) {
            // Stale write from a test that was issued before the last
            // cache clear. Drop it so a fresher (in-flight) test's
            // result isn't overwritten by a stale ok/error.
            return;
        }
        var now = Date.now();
        _jeConnectionTestCache.set(key, {
            status: status,
            detail: detail || '',
            at: now,
        });
        // Also persist to localStorage so the checklist can show "Last
        // tested <date>" after a page reload, instead of falling back
        // to "Configured — not yet verified" as if nothing was ever
        // checked. Wrapped in try/catch because localStorage is
        // best-effort (private mode, quota, disabled storage, etc.).
        try {
            localStorage.setItem(
                'je_conn_test_' + key,
                JSON.stringify({
                    status: status,
                    detail: detail || '',
                    at: now,
                }),
            );
        } catch (e) {
            /* persistence is best-effort */
        }
        try {
            renderChecklist();
        } catch (e) {
            console.warn('[JE] renderChecklist threw after setConnectionTestResult:', e);
        }
    }

    /**
     * Read a previously-persisted test result for a connection key.
     * Returns null if no record, malformed JSON, or storage unavailable.
     * Unlike the in-memory cache there is NO TTL — the persisted entry
     * is meant to outlive page reloads so the admin always sees the
     * date of the most recent verification, however long ago it was.
     */
    function getPersistedTestResult(key) {
        var storageKey = 'je_conn_test_' + key;
        try {
            var raw = localStorage.getItem(storageKey);
            if (!raw) return null;
            var rec = JSON.parse(raw);
            if (!rec || typeof rec.at !== 'number' || typeof rec.status !== 'string') {
                // Self-heal: drop the bad entry so subsequent renders don't keep
                // re-parsing it and so the row falls cleanly back to "not tested".
                try {
                    localStorage.removeItem(storageKey);
                } catch (e) {}
                return null;
            }
            return rec;
        } catch (e) {
            // Parse error → treat as corrupt and remove.
            try {
                localStorage.removeItem(storageKey);
            } catch (rmErr) {}
            return null;
        }
    }

    /**
     * Format a timestamp for the checklist's "Last tested" line:
     *   - same day  → "Last tested 3:45 PM"
     *   - other day → "Last tested Apr 20, 2026"
     */
    function formatLastTested(ts) {
        var d = new Date(ts);
        var now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return 'Last tested ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
        return 'Last tested ' + formatDateDMY(d);
    }

    /**
     * Build a checklist row from cached / persisted test data.
     *  - Fresh in-memory hit  → row reflects the live status + detail
     *  - Persisted-only hit   → row keeps the last known state but
     *    swaps the detail line for "Last tested <date>"
     *  - No data              → row stays 'pending' with the supplied
     *    fallback text
     */
    function checklistRowState(cacheKey, fallbackDetail) {
        var live = getConnectionTestResult(cacheKey);
        if (live) return { state: live.status, detail: live.detail };
        var persisted = getPersistedTestResult(cacheKey);
        if (persisted) return { state: persisted.status, detail: formatLastTested(persisted.at) };
        return { state: 'pending', detail: fallbackDetail };
    }

    /**
     * Read a test result from the cache. Returns null on miss OR on
     * expiry — callers render the row as "pending" in that case.
     */
    function getConnectionTestResult(key) {
        var entry = _jeConnectionTestCache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.at > CONNECTION_TEST_CACHE_TTL_MS) {
            _jeConnectionTestCache.delete(key);
            return null;
        }
        return entry;
    }

    /**
     * Drop every cached result. Used by the Re-test-all Quick Action
     * so rows immediately show "pending" while tests fire.
     */
    function clearConnectionTestCache() {
        _jeConnectionTestCache.clear();
        _jeCacheGeneration++;
        // Also drop persisted entries; otherwise checklistRowState falls back
        // to the "Last tested <date>" line and rows stay green/red instead of
        // showing pending while the new tests fire.
        try {
            var doomed = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf('je_conn_test_') === 0) doomed.push(k);
            }
            doomed.forEach(function (k) {
                localStorage.removeItem(k);
            });
        } catch (e) {
            /* private mode / quota — best-effort */
        }
        try {
            renderChecklist();
        } catch (e) {
            console.warn('[JE] renderChecklist threw after clearConnectionTestCache:', e);
        }
    }

    /**
     * Drop the persisted "Last tested <date>" entry for a given service when
     * the inputs that produced that test result change (new TMDB key, new Seerr
     * URL, etc.) — otherwise the checklist would keep claiming the old key
     * worked. Wired up in the load/change handlers for the relevant inputs.
     */
    function invalidatePersistedTest(key) {
        try {
            localStorage.removeItem('je_conn_test_' + key);
        } catch (e) {}
        // Clear in-memory copy too so the row immediately drops to pending.
        _jeConnectionTestCache.delete(key);
        try {
            renderChecklist();
        } catch (e) {}
    }

    /**
     * Normalize an arr-instance URL into a cache key fragment.
     * Trim, lowercase, strip trailing slashes so minor differences
     * don't fork the cache.
     */
    function _jeNormalizeArrUrl(url) {
        return (url || '').trim().toLowerCase().replace(/\/+$/, '');
    }

    /**
     * Build the Integration Health checklist inside #je-checklist.
     *
     * Row rules:
     *   - Only render a row when the integration is enabled.
     *   - Row state: 'ok' (green), 'amber' (warn), 'error' (red),
     *     'pending' (grey — enabled + complete config but no cached
     *     test result within TTL).
     *   - Zero rows is a valid outcome — render the empty hint.
     *   - Clicking a row jumps to the target tab.
     *
     * No HTML is injected from runtime data — every row is built with
     * createElement + textContent so untrusted instance names / URLs
     * can never inject markup into the checklist.
     */
    function renderChecklist() {
        // Thin delegator: the Integration Health checklist was merged into
        // Service Status, but multiple callers still reference this name —
        // keep the symbol to avoid breaking them. The original per-row
        // construction (#je-checklist + .je-checklist-* classes) was
        // removed along with its DOM host and CSS.
        renderServiceStatusDashboard();
    }

    /**
     * Quick Action: re-test every external-service connection by proxying
     * clicks to the existing per-service test buttons. Preserves the per-
     * button UX (spinners, toasts, status-card updates) without duplicating
     * logic. Does NOT fabricate a cache — Phase 4 layers a real test cache
     * on top.
     *
     * Services invoked:
     *   - TMDB: one `.testTmdbBtn` click (multiple copies exist across tabs
     *     but any one test updates the shared status card)
     *   - Seerr: `#testJellyseerrBtn` when Seerr is enabled + URL + key set
     *   - Sonarr / Radarr: every `.arr-instance-test` inside the instance
     *     lists that has a URL + API key populated
     *
     * Skipping an unconfigured service is intentional — clicking a test
     * button with empty fields would pop a Dashboard.alert per service,
     * which is noisy for a "one-shot retest" action.
     */
    // Client-side throttle + in-flight lock for the Re-test-all batch.
    // The button is disabled for the full cooldown window so rapid
    // clicks can't fire ~8 parallel external-API tests per click. This
    // is NOT a security boundary — a determined user could still spam
    // via devtools — it's a guardrail against well-intentioned double-
    // clicks and page-reload retries.
    // Minimum time the Re-test-all button stays disabled even if every
    // test finishes instantly. Acts as the rate-limit floor so rapid
    // re-clicks can't fire dozens of external API tests per second.
    var RETEST_ALL_MIN_COOLDOWN_MS = 4 * 1000;

    // Hard upper bound for the polling loop. If a test still hasn't
    // resolved after this long, we force-release anyway so the UI
    // doesn't sit "Retesting…" forever on a hung connection.
    var RETEST_ALL_MAX_WAIT_MS = 25 * 1000;

    var _jeRetestAllCooldownUntil = 0;

    var _jeRetestAllReenableTimer = null;

    var _jeRetestAllPollTimer = null;

    function _setRetestAllButtonLabel(btn, text) {
        if (!btn) return;
        var labelEl = btn.querySelector('.je-quick-action-title');
        if (labelEl) labelEl.textContent = text;
    }

    var retestAllConnectionsBtn = document.getElementById('retestAllConnectionsBtn');

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        if (retestAllConnectionsBtn) {
            var _retestAllOriginalLabel = retestAllConnectionsBtn.querySelector('.je-quick-action-title');
            _retestAllOriginalLabel = _retestAllOriginalLabel
                ? _retestAllOriginalLabel.textContent
                : 'Re-test all service connections';

            lifecycle.listen(retestAllConnectionsBtn, 'click', function () {
                // Throttle: block rapid re-clicks within the cooldown window.
                var now = Date.now();
                if (now < _jeRetestAllCooldownUntil) {
                    var remainSec = Math.ceil((_jeRetestAllCooldownUntil - now) / 1000);
                    try {
                        Dashboard.alert({
                            title: 'Please wait',
                            message: 'Re-test is rate-limited. Try again in ' + remainSec + ' s.',
                        });
                    } catch (e) {
                        /* ignore */
                    }
                    return;
                }

                // Invalidate the cache up front so every checklist row flips
                // to "pending" immediately; the individual test handlers will
                // repopulate it as they finish.
                try {
                    clearConnectionTestCache();
                } catch (e) {
                    /* renderChecklist logs */
                }

                // Suppress per-test Dashboard.alert dialogs for the duration
                // of this batch — per-service indicators + the Integration
                // Health rows already communicate results.
                _jeSuppressTestAlerts = true;
                _jeRetestAllCooldownUntil = now + RETEST_ALL_MIN_COOLDOWN_MS;
                retestAllConnectionsBtn.disabled = true;
                _setRetestAllButtonLabel(retestAllConnectionsBtn, 'Retesting…');

                var tested = 0;

                // TMDB — one click is enough; pages share the same backing key
                var tmdbBtn = document.querySelector('.testTmdbBtn');
                if (tmdbBtn && !tmdbBtn.disabled) {
                    tmdbBtn.click();
                    tested++;
                }

                // Seerr — only if enabled with a URL + key (otherwise button
                // would show a "missing info" toast, which is noisy for a
                // batch re-test action).
                var seerrEnabled = document.querySelector('#jellyseerrEnabled');
                var seerrUrls = document.querySelector('#jellyseerrUrls');
                var seerrKey = document.querySelector('#JellyseerrApiKey');
                if (
                    seerrEnabled &&
                    seerrEnabled.checked &&
                    seerrUrls &&
                    seerrUrls.value.trim() &&
                    seerrKey &&
                    seerrKey.value.trim() &&
                    testJellyseerrBtn &&
                    !testJellyseerrBtn.disabled
                ) {
                    testJellyseerrBtn.click();
                    tested++;
                }

                // Sonarr / Radarr — per-instance tests. The per-instance test
                // function itself guards against empty URL/API-key, so we
                // don't need to re-check here; we just skip already-disabled
                // buttons (mid-flight tests).
                var arrBtns = document.querySelectorAll('.arr-instance-test');
                arrBtns.forEach(function (btn) {
                    var card = btn.closest('.arr-instance-card');
                    if (!card) return;
                    var urlEl = card.querySelector('.arr-instance-url');
                    var keyEl = card.querySelector('.arr-instance-apikey');
                    if (!urlEl || !keyEl) return;
                    if (!urlEl.value.trim() || !keyEl.value.trim()) return;
                    if (btn.disabled) return;
                    btn.click();
                    tested++;
                });

                // Always refresh the dashboard dots so the user sees feedback
                // even when no service was re-tested.
                try {
                    updateStatusDashboard();
                } catch (e) {
                    /* logged inside */
                }

                if (tested === 0) {
                    _jeSuppressTestAlerts = false;
                    retestAllConnectionsBtn.disabled = false;
                    _setRetestAllButtonLabel(retestAllConnectionsBtn, _retestAllOriginalLabel);
                    _jeRetestAllCooldownUntil = 0; // reset cooldown — nothing fired
                    try {
                        Dashboard.alert({
                            title: 'Nothing to re-test',
                            message:
                                'Enable and configure at least one service (TMDB, Seerr, Sonarr, or Radarr) before running a re-test.',
                        });
                    } catch (e) {
                        /* ignore */
                    }
                    return;
                }

                // The individual test functions don't return promises
                // (they're event handlers fired via .click()), so we poll
                // the DOM for the "in-flight" signal each test sets on
                // start: the `.status-check` class on its status indicator.
                // When no indicators still carry that class, every test
                // has resolved — release the button immediately. Falls
                // back to a hard max-wait so a hung request doesn't leave
                // the button stuck on "Retesting…".
                lifecycle.clearTimeout(_jeRetestAllReenableTimer);
                lifecycle.clearInterval(_jeRetestAllPollTimer);
                var batchStartedAt = Date.now();
                function releaseRetestBatch() {
                    lifecycle.clearInterval(_jeRetestAllPollTimer);
                    lifecycle.clearTimeout(_jeRetestAllReenableTimer);
                    _jeSuppressTestAlerts = false;
                    retestAllConnectionsBtn.disabled = false;
                    _setRetestAllButtonLabel(retestAllConnectionsBtn, _retestAllOriginalLabel);
                    try {
                        renderChecklist();
                    } catch (e) {
                        /* logged */
                    }
                }
                _jeRetestAllPollTimer = lifecycle.setInterval(function () {
                    var elapsed = Date.now() - batchStartedAt;
                    // `.status-check` is applied on test START and removed on
                    // test RESOLVE (success or failure), so it's an accurate
                    // "in-flight" signal for the three test functions.
                    var inFlight = document.querySelectorAll('.status-check').length;
                    // Release when BOTH:
                    //  - no tests still in flight (UI has caught up), and
                    //  - the min-cooldown floor has elapsed (rate limit).
                    // The floor ensures a user who hits retest-all with zero
                    // real tests configured still has the button disabled long
                    // enough to prevent double-run, and covers the first-tick
                    // race where indicators haven't swapped to 'sync' yet.
                    if (inFlight === 0 && elapsed >= RETEST_ALL_MIN_COOLDOWN_MS) {
                        releaseRetestBatch();
                    } else if (elapsed >= RETEST_ALL_MAX_WAIT_MS) {
                        console.warn(
                            '[JE] retest-all: giving up on ' + inFlight + ' in-flight test(s) after ' + elapsed + 'ms',
                        );
                        releaseRetestBatch();
                    }
                }, 300);
                // Hard-stop safety net in case setInterval is suspended
                // (backgrounded tab, browser throttling, etc.).
                _jeRetestAllReenableTimer = lifecycle.setTimeout(releaseRetestBatch, RETEST_ALL_MAX_WAIT_MS + 500);
            });
        }
    }
    return {
        beginConnectionTest,
        jeTestAlert,
        setConnectionTestResult,
        checklistRowState,
        invalidatePersistedTest,
        _jeNormalizeArrUrl,
        initialize,
        dispose: () => lifecycle.dispose(),
    };
}
