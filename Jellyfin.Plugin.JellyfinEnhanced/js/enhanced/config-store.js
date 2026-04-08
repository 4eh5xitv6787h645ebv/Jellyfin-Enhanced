// /js/enhanced/config-store.js
// Reactive configuration store that detects server-side config changes
// and notifies subscribers so modules can re-initialize or tear down.
(function(JE) {
    'use strict';

    var subscribers = [];
    var lastHash = null;
    var reloadInProgress = false;
    // [CF1] When a broadcast arrives while another reload is in flight, set
    // this flag so the current reload's finally{} block can drain it — we
    // can't just drop broadcasts or they'd be lost until the next nav.
    var reloadPending = false;
    var minPollInterval = 2000; // don't re-check more than once per 2s
    var lastPollTime = 0;
    var channel = null;
    var pollingStarted = false; // [H13] guard against double startPolling()

    // [H14] Named handlers for BroadcastChannel and storage (removable in destroy())
    //
    // [H2] Broadcasts are not rate-limited. The 2s minPollInterval only protects
    // against redundant background polls (navigation bursts, visibilitychange
    // storms); a cross-tab broadcast represents a KNOWN config change that must
    // propagate immediately or it will be lost — there is no retry path for
    // dropped broadcasts.
    function onChannelMessage(event) {
        if (event.data && event.data.type === 'config-updated') {
            reloadConfig({ bypassThrottle: true });
        }
    }

    function onStorageEvent(event) {
        if (event.key === 'JE_config_updated') {
            reloadConfig({ bypassThrottle: true });
        }
    }

    // BroadcastChannel for cross-tab sync
    try {
        channel = new BroadcastChannel('jellyfin-enhanced-config');
        channel.onmessage = onChannelMessage;
    } catch (e) {
        // BroadcastChannel not supported; localStorage fallback below
    }

    // localStorage fallback for cross-tab sync
    window.addEventListener('storage', onStorageEvent);

    /**
     * Subscribe to config changes. Callback receives
     * { changedKeys, oldConfig, newConfig, oldSettings }.
     * @param {Function} callback
     * @returns {Function} unsubscribe function
     */
    function subscribe(callback) {
        subscribers.push(callback);
        return function() {
            var idx = subscribers.indexOf(callback);
            if (idx !== -1) subscribers.splice(idx, 1);
        };
    }

    /**
     * Compute a shallow diff of two config objects.
     * Returns array of keys whose values differ.
     */
    function diffKeys(oldObj, newObj) {
        var changed = [];
        var allKeys = {};
        var k;
        for (k in oldObj) { if (oldObj.hasOwnProperty(k)) allKeys[k] = true; }
        for (k in newObj) { if (newObj.hasOwnProperty(k)) allKeys[k] = true; }
        for (k in allKeys) {
            var a = oldObj[k], b = newObj[k];
            if (a !== b && (typeof a !== 'object' || typeof b !== 'object'
                || JSON.stringify(a) !== JSON.stringify(b))) {
                changed.push(k);
            }
        }
        return changed;
    }

    /**
     * Apply a fresh public config from the server.
     * Diffs against current config, updates JE.pluginConfig and JE.currentSettings,
     * fetches private config, merges everything ATOMICALLY, then notifies
     * subscribers with changed keys.
     *
     * [H4] The previous implementation assigned `JE.pluginConfig = freshPublicConfig`
     * BEFORE awaiting `loadPrivateConfig()`. During the network gap, any sync
     * consumer of JE.pluginConfig saw the new public fields paired with
     * undefined private admin fields (SonarrUrl, RadarrApiKey, JellyseerrUrls,
     * etc). Now we fetch private first and do the assignment in one sync step
     * after both are available.
     */
    async function applyUpdate(freshPublicConfig) {
        var oldConfig = {};
        var k;
        // Shallow copy current pluginConfig (public + private keys in their
        // current merged form) so the diff below reflects the user-visible state.
        for (k in JE.pluginConfig) {
            if (JE.pluginConfig.hasOwnProperty(k)) {
                oldConfig[k] = JE.pluginConfig[k];
            }
        }

        // Diff public config
        var changedKeys = diffKeys(oldConfig, freshPublicConfig);
        if (changedKeys.length === 0) return;

        console.log('🪼 Jellyfin Enhanced: Config changed: ' + changedKeys.join(', '));

        // Fetch private config BEFORE touching JE.pluginConfig so the window
        // where consumers could see a half-merged config is zero.
        var privateConfig = await fetchPrivateConfig();

        // Atomic swap: merge public + private into a new object in one step.
        // Subscribers and synchronous readers can never observe a state where
        // only one of (public, private) has been updated.
        //
        // [CF2] If fetchPrivateConfig returned null (transient error), preserve
        // the private fields from oldConfig instead of wiping them. Public
        // field keys always get the fresh value; any key not in the public
        // payload falls back to the old value. This means a 5xx on
        // /private-config won't suddenly erase SonarrUrl / RadarrUrl etc.
        // from the client's view.
        var merged = {};
        if (privateConfig === null) {
            // Start from the old config so private fields persist across
            // the transient failure...
            for (k in oldConfig) {
                if (Object.prototype.hasOwnProperty.call(oldConfig, k)) {
                    merged[k] = oldConfig[k];
                }
            }
        }
        // ...then overlay the fresh public values (always authoritative).
        for (k in freshPublicConfig) {
            if (Object.prototype.hasOwnProperty.call(freshPublicConfig, k)) {
                merged[k] = freshPublicConfig[k];
            }
        }
        // Overlay fresh private values when the fetch actually succeeded.
        if (privateConfig && typeof privateConfig === 'object') {
            for (k in privateConfig) {
                if (Object.prototype.hasOwnProperty.call(privateConfig, k)) {
                    merged[k] = privateConfig[k];
                }
            }
        }
        JE.pluginConfig = merged;

        // Clear Seerr cached user status so all modules re-check on next call
        if (typeof JE.jellyseerrAPI !== 'undefined' &&
            typeof JE.jellyseerrAPI.clearUserStatusCache === 'function') {
            JE.jellyseerrAPI.clearUserStatusCache();
        }

        // Recompute merged settings (user settings + plugin defaults + hardcoded)
        var oldSettings = JE.currentSettings || {};
        if (typeof JE.loadSettings === 'function') {
            JE.currentSettings = JE.loadSettings();
        }

        // Also diff currentSettings to catch user-level setting changes
        // (tags enabled, etc. where plugin defaults flow into currentSettings)
        var settingsChanged = diffKeys(oldSettings, JE.currentSettings || {});
        for (var i = 0; i < settingsChanged.length; i++) {
            if (changedKeys.indexOf(settingsChanged[i]) === -1) {
                changedKeys.push(settingsChanged[i]);
            }
        }

        // [H6-prep] Include oldSettings so module-registry can resolve camelCase keys symmetrically
        var event = {
            changedKeys: changedKeys,
            oldConfig: oldConfig,
            newConfig: freshPublicConfig,
            oldSettings: oldSettings
        };

        // [H5] Snapshot subscribers before iterating to prevent mutation during notification
        var snapshot = subscribers.slice();
        for (var s = 0; s < snapshot.length; s++) {
            try {
                snapshot[s](event);
            } catch (e) {
                console.error('🪼 Jellyfin Enhanced: ConfigStore subscriber error:', e);
            }
        }
    }

    /**
     * Fetch private config from the server WITHOUT mutating JE.pluginConfig.
     *
     * Return value semantics (important for applyUpdate merge logic):
     *   - `{}`       → expected no-private-config state: anonymous user,
     *                  non-admin (401/403), or server endpoint missing. Merge
     *                  overwrites previous private fields with emptiness,
     *                  which is correct — the current user genuinely has no
     *                  private config.
     *   - `null`     → unexpected error (5xx, network, parse failure). Merge
     *                  PRESERVES previously-loaded private fields instead of
     *                  wiping them, because a transient failure shouldn't
     *                  make Arr Links etc. suddenly think SonarrUrl is gone.
     *
     * [H4] Caller merges; this function no longer touches JE.pluginConfig.
     * [CF2] Transient errors now return null so callers can distinguish
     * "authoritatively empty" from "couldn't fetch — keep previous state".
     */
    function fetchPrivateConfig() {
        if (typeof ApiClient === 'undefined' || typeof ApiClient.ajax !== 'function') {
            return Promise.resolve({});
        }
        return ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/private-config'),
            dataType: 'json'
        }).then(function(privateConfig) {
            return privateConfig && typeof privateConfig === 'object' ? privateConfig : {};
        }).catch(function(err) {
            // Non-admin users get 401/403 — this is the expected empty state.
            if (err && (err.status === 401 || err.status === 403)) return {};
            console.error('🪼 Jellyfin Enhanced: fetchPrivateConfig failed:', err);
            return null; // transient — signal caller to preserve previous private fields
        });
    }

    /**
     * Fetch the lightweight config hash from the server.
     * Returns null if the fetch fails.
     *
     * [M3] Uses ApiClient.ajax for proper auth headers.
     */
    async function fetchHash() {
        if (typeof ApiClient === 'undefined' || typeof ApiClient.ajax !== 'function') return null;
        try {
            var resp = await ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/config-hash'),
                dataType: 'text'
            });
            return resp || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Fetch the full public config from the server.
     *
     * [M3] Uses ApiClient.ajax for proper auth headers.
     */
    async function fetchPublicConfig() {
        if (typeof ApiClient === 'undefined' || typeof ApiClient.ajax !== 'function') return null;
        try {
            var resp = await ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/public-config'),
                dataType: 'json'
            });
            return resp || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Check for config changes and apply if found.
     * Uses config-hash for lightweight detection, full fetch only on change.
     *
     * @param {object} [options]
     * @param {boolean} [options.bypassThrottle=false] - Skip the 2s
     *   minPollInterval gate. Use for cross-tab broadcasts and explicit
     *   post-save refreshes where the caller knows a change happened and
     *   dropping the request would lose data.
     */
    async function reloadConfig(options) {
        var bypassThrottle = !!(options && options.bypassThrottle);
        // [CF1] If a reload is already running, flag a pending retry instead
        // of dropping this call. The current reload's finally{} block will
        // drain it. Without this, a broadcast that lands during an in-flight
        // poll is lost until the next navigation.
        if (reloadInProgress) {
            if (bypassThrottle) reloadPending = true;
            return;
        }
        try {
            if (typeof ApiClient === 'undefined' || !ApiClient.getCurrentUserId || !ApiClient.getCurrentUserId()) return;
        } catch (e) { return; }

        var now = Date.now();
        if (!bypassThrottle && now - lastPollTime < minPollInterval) return;
        lastPollTime = now;
        reloadInProgress = true;

        try {
            var hash = await fetchHash();
            if (hash === null) return;

            if (lastHash !== null && hash === lastHash) return; // no change

            // Hash changed — fetch full config and apply.
            // [H1] Only commit `lastHash = hash` AFTER applyUpdate succeeds.
            // If we advanced it eagerly and the public-config fetch failed,
            // every subsequent poll would short-circuit as "no change" and
            // the tab would be permanently stuck on stale config.
            var freshConfig = await fetchPublicConfig();
            if (freshConfig) {
                await applyUpdate(freshConfig);
                lastHash = hash;
            }
        } catch (e) {
            // [M1] Surface so operators can diagnose reactive failures
            // instead of silently staying on stale config.
            console.error('🪼 Jellyfin Enhanced: ConfigStore reload failed:', e);
        } finally {
            reloadInProgress = false;
            // [CF1] Drain any broadcast that arrived during this reload.
            if (reloadPending) {
                reloadPending = false;
                Promise.resolve().then(function() { reloadConfig({ bypassThrottle: true }); });
            }
        }
    }

    /**
     * Set the initial hash from the current config (called once after first load).
     */
    function snapshotHash(hashValue) {
        lastHash = hashValue;
    }

    /**
     * Broadcast that config has changed (for cross-tab sync) AND schedule a
     * local reload on the originating tab.
     *
     * [H3] BroadcastChannel.postMessage does NOT deliver to the sender, and
     * storage events do not fire on the originating tab either. Without an
     * explicit local reload, the saving tab would stay on stale config until
     * its next navigation — defeating the whole reactive-update design. We
     * schedule reloadConfig via a microtask so any synchronous post-save
     * bookkeeping finishes first.
     */
    function broadcastChange() {
        // Reset poll timer / hash so the local reload goes through immediately
        // regardless of recent polling.
        lastPollTime = 0;
        lastHash = null;
        try {
            if (channel) {
                channel.postMessage({ type: 'config-updated', ts: Date.now() });
            }
        } catch (e) { /* ignore */ }
        try {
            localStorage.setItem('JE_config_updated', String(Date.now()));
        } catch (e) { /* ignore */ }
        // Self-refresh — bypass throttle because we KNOW a change just happened.
        Promise.resolve().then(function() { reloadConfig({ bypassThrottle: true }); });
    }

    // [H14] Named handlers for polling events (removable in destroy())
    function onVisibilityChange() {
        if (document.visibilityState === 'visible') {
            reloadConfig();
        }
    }

    function onPageShow(event) {
        if (event.persisted) {
            reloadConfig();
        }
    }

    function onHashChange() {
        reloadConfig();
    }

    function onPopState() {
        reloadConfig();
    }

    /**
     * Start listening for config change triggers:
     * - visibilitychange (tab refocus)
     * - pageshow (bfcache restoration)
     * - SPA navigation (hashchange/popstate)
     *
     * [H13] Guarded against double invocation.
     */
    var navigateUnsub = null;

    function startPolling() {
        if (pollingStarted) return;
        pollingStarted = true;

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('pageshow', onPageShow);
        window.addEventListener('hashchange', onHashChange);
        window.addEventListener('popstate', onPopState);

        if (JE.helpers && typeof JE.helpers.onNavigate === 'function') {
            navigateUnsub = JE.helpers.onNavigate(function() {
                reloadConfig();
            });
        }
    }

    /**
     * Tear down all event listeners and close the BroadcastChannel.
     * Call this if the plugin is dynamically unloaded.
     *
     * [H14] Provides full cleanup to prevent memory leaks and zombie behavior.
     */
    function destroy() {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pageshow', onPageShow);
        window.removeEventListener('hashchange', onHashChange);
        window.removeEventListener('popstate', onPopState);
        if (navigateUnsub) { navigateUnsub(); navigateUnsub = null; }
        pollingStarted = false;

        window.removeEventListener('storage', onStorageEvent);
        if (channel) { channel.close(); channel = null; }

        subscribers = [];
        lastHash = null;
        reloadInProgress = false;
        lastPollTime = 0;
    }

    // Export
    JE.configStore = {
        subscribe: subscribe,
        applyUpdate: applyUpdate,
        reloadConfig: reloadConfig,
        snapshotHash: snapshotHash,
        broadcastChange: broadcastChange,
        startPolling: startPolling,
        destroy: destroy,
        fetchHash: fetchHash
    };

})(window.JellyfinEnhanced);
