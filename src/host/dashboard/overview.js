/** Dashboard overview boundary. */
function createDashboardOverview({
    lifecycle,
    describeItemDetails,
    describeTags,
    describeNavigation,
    describePlayback,
    describeBookmarks,
    describeHiddenContent,
    describeDownloads,
    describeCalendar,
    describeAppearance,
    describeStreamingAvailability,
    describeSeerr,
    describeArr,
    describeStatusStreamingAvailability,
    describeStatusSeerr,
    describeStatusArr,
    jeJumpToTab,
}) {
    /**
     * Overview → Features
     * Renders a row per JE feature with one of three states:
     *   - on   (green)   : enabled and all required deps/config present
     *   - warn (amber)   : enabled but missing a dep or required config
     *   - off  (faded)   : disabled
     * Clicking a row jumps to the tab where the feature lives.
     *
     * Rules reference form inputs (live DOM) rather than a snapshot so this
     * updates correctly after every dependency re-evaluation.
     */
    function renderFeaturesDashboard() {
        var root = document.getElementById('je-features-dashboard');
        if (!root) return;

        function bool(id) {
            var el = document.getElementById(id);
            return !!(el && el.checked);
        }
        function val(id) {
            var el = document.getElementById(id);
            return el ? (el.value || '').trim() : '';
        }

        var features = [];
        function feat(name, enabled, tab, detail, warn) {
            if (!enabled) {
                features.push({ name: name, state: 'off', tab: tab, detail: 'Disabled' });
                return;
            }
            features.push({ name: name, state: warn ? 'warn' : 'on', tab: tab, detail: detail });
        }

        // Display
        describeItemDetails(bool, feat);
        describeTags(bool, feat);

        describeNavigation(bool, feat);

        // Playback
        describePlayback(bool, feat);

        // Pages
        describeBookmarks(bool, feat);

        describeHiddenContent(bool, feat);

        describeDownloads(bool, feat);

        describeCalendar(bool, feat);

        // Custom splash screen / branding. Both the splash screen and the
        // branding image uploads (icons/favicon/logos) are handled by Jellyfin
        // Enhanced itself at request time, so no extra plugin is required.
        describeAppearance(bool, feat);

        // Extras
        describeStreamingAvailability(bool, val, feat);

        // Seerr
        describeSeerr(bool, feat);

        // Watchlist (Seerr tab). Sync and "add requested → watchlist" both
        // need KefinTweaks to actually render the watchlist UI in Jellyfin;
        // the feature writes the data either way, but the user can't see
        // it without KefinTweaks.

        // *arr
        describeArr(bool, feat);

        // Stable ordering: warnings first, then on, then off
        features.sort(function (a, b) {
            var ord = { warn: 0, on: 1, off: 2 };
            return ord[a.state] - ord[b.state];
        });

        root.textContent = '';
        if (features.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'je-checklist-empty';
            empty.textContent = 'No features configured yet.';
            root.appendChild(empty);
            return;
        }
        features.forEach(function (f) {
            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'je-feature-row je-state-' + f.state;
            row.setAttribute('data-target', f.tab);
            var icon = document.createElement('i');
            icon.className = 'material-icons je-feature-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent =
                f.state === 'on' ? 'check_circle' : f.state === 'warn' ? 'warning' : 'radio_button_unchecked';
            row.appendChild(icon);
            var body = document.createElement('div');
            body.className = 'je-feature-body';
            var name = document.createElement('div');
            name.className = 'je-feature-name';
            name.textContent = f.name;
            body.appendChild(name);
            var detail = document.createElement('div');
            detail.className = 'je-feature-detail';
            detail.textContent = f.detail;
            body.appendChild(detail);
            row.appendChild(body);
            lifecycle.listen(row, 'click', function () {
                var targetTab = f.tab;
                var tabBtn = document.querySelector('.jellyfin-tab-button[data-tab="' + targetTab + '"]');
                if (tabBtn) tabBtn.click();
            });
            root.appendChild(row);
        });
    }

    /**
     * Reads `.value` from a selector, returning '' if the element is missing.
     * Logs once per missing selector so DOM/JS mismatches surface in devtools
     * instead of throwing silently through a querySelector chain.
     * @param {string} sel - CSS selector
     * @returns {string} Trimmed value, or '' if element not found
     */
    var _jeMissingSelectorsWarned = Object.create(null);

    function readFieldValue(sel) {
        var el = document.querySelector(sel);
        if (!el) {
            if (!_jeMissingSelectorsWarned[sel]) {
                _jeMissingSelectorsWarned[sel] = true;
                console.warn('[JE] status dashboard: selector "' + sel + '" not found');
            }
            return '';
        }
        return (el.value || '').trim();
    }

    /**
     * Merged Service Status renderer.
     *
     * Replaces the legacy status-card grid + Integration Health checklist
     * with a single card list that sources:
     *   - config state from the live form (key/URL/API-key presence, *arr
     *     instance counts, Seerr URL list),
     *   - test-result state from the connection-test cache (so a green
     *     "connected" or red "failed" card reflects the latest probe).
     *
     * Card states (drive the left-border accent and icon):
     *   - 'ok'      green    — configured; latest test passed (or no test
     *                           run yet but no negative signal)
     *   - 'warn'    amber    — configured partially (e.g. Seerr URL but no
     *                           API key) OR connection-test returned
     *                           amber (reachable but not healthy)
     *   - 'error'   red      — connection-test returned error
     *   - 'pending' grey dot — enabled + complete config, no cached result
     *   - 'off'     faded    — disabled / no config entered yet
     *
     * Each card is a <button> that jumps to the relevant settings tab.
     */
    function renderServiceStatusDashboard() {
        var root = document.getElementById('je-service-dashboard');
        if (!root) return;

        var cards = [];
        function pushCard(opts) {
            cards.push(opts);
        }

        // TMDB — no dedicated test endpoint; presence-based state only.
        describeStatusStreamingAvailability(pushCard);

        // Seerr
        describeStatusSeerr(pushCard);

        // Sonarr / Radarr — one card per instance, reusing test-cache keys
        describeStatusArr(pushCard);

        // Bazarr — no test endpoint; URL presence is the best signal

        // Shoko — no test endpoint; URL + API key presence is the best signal

        root.textContent = '';
        if (cards.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'je-checklist-empty';
            empty.textContent = 'Configure TMDB, Seerr, or an *arr instance to see its status here.';
            root.appendChild(empty);
            return;
        }

        // Order: warn/error first, then pending, then ok, then off (faded)
        var ord = { error: 0, warn: 1, pending: 2, ok: 3, off: 4 };
        cards.sort(function (a, b) {
            return (ord[a.state] || 99) - (ord[b.state] || 99);
        });

        cards.forEach(function (c) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'je-service-card je-state-' + c.state;
            btn.setAttribute('data-target', c.tab);
            btn.setAttribute('data-status-id', c.id);
            var iconEl = document.createElement('i');
            iconEl.className = 'material-icons je-service-icon';
            iconEl.setAttribute('aria-hidden', 'true');
            iconEl.textContent =
                c.state === 'ok'
                    ? 'check_circle'
                    : c.state === 'warn'
                      ? 'warning'
                      : c.state === 'error'
                        ? 'error'
                        : c.state === 'pending'
                          ? 'hourglass_empty'
                          : c.icon || 'radio_button_unchecked';
            btn.appendChild(iconEl);
            var body = document.createElement('div');
            body.className = 'je-service-body';
            var nameEl = document.createElement('div');
            nameEl.className = 'je-service-name';
            nameEl.textContent = c.name;
            body.appendChild(nameEl);
            var detail = document.createElement('div');
            detail.className = 'je-service-detail';
            detail.textContent = c.detail;
            body.appendChild(detail);
            btn.appendChild(body);
            lifecycle.listen(btn, 'click', function () {
                jeJumpToTab(c.tab, c.scrollTo);
            });
            root.appendChild(btn);
        });
    }

    // Back-compat: older code paths still call these by name. Delegate both
    // to the unified renderer instead of maintaining dead duplicates.
    function updateStatusDashboard() {
        renderServiceStatusDashboard();
    }

    return {
        renderFeaturesDashboard,
        readFieldValue,
        renderServiceStatusDashboard,
        updateStatusDashboard,
        dispose: () => lifecycle.dispose(),
    };
}
