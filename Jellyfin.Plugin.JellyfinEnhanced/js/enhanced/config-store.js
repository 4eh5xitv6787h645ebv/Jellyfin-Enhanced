// /js/enhanced/config-store.js
// Reactive configuration store that detects server-side config changes
// and notifies subscribers so modules can re-initialize or tear down.
(function(JE) {
    'use strict';

    var subscribers = [];
    var lastHash = null;
    var reloadInProgress = false;
    var minPollInterval = 2000; // don't re-check more than once per 2s
    var lastPollTime = 0;
    var channel = null;
    var pollingStarted = false; // [H13] guard against double startPolling()

    // [H14] Named handlers for BroadcastChannel and storage (removable in destroy())
    function onChannelMessage(event) {
        if (event.data && event.data.type === 'config-updated') {
            reloadConfig();
        }
    }

    function onStorageEvent(event) {
        if (event.key === 'JE_config_updated') {
            reloadConfig();
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
     * awaits private config merge, then notifies all subscribers with changed keys.
     *
     * [H4] Made async — awaits loadPrivateConfig() so subscribers see fully-merged config.
     */
    async function applyUpdate(freshPublicConfig) {
        var oldConfig = {};
        var k;
        // Shallow copy current pluginConfig (public keys only, before private merge)
        for (k in JE.pluginConfig) {
            if (JE.pluginConfig.hasOwnProperty(k)) {
                oldConfig[k] = JE.pluginConfig[k];
            }
        }

        // Diff public config
        var changedKeys = diffKeys(oldConfig, freshPublicConfig);
        if (changedKeys.length === 0) return;

        console.log('🪼 Jellyfin Enhanced: Config changed: ' + changedKeys.join(', '));

        // Update JE.pluginConfig with fresh public values
        JE.pluginConfig = freshPublicConfig;

        // [H4] Await private config merge so subscribers see complete config
        await loadPrivateConfig();

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
     * Re-load private config from server (admin-only fields).
     * Uses ApiClient.ajax for proper auth handling.
     * Returns a promise so callers can await the merge.
     *
     * [H4] Now returns the promise chain.
     * [M4] Distinguishes expected 401/403 from real server errors.
     */
    function loadPrivateConfig() {
        if (typeof ApiClient === 'undefined' || typeof ApiClient.ajax !== 'function') {
            return Promise.resolve();
        }
        return ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/private-config'),
            dataType: 'json'
        }).then(function(privateConfig) {
            if (privateConfig && typeof privateConfig === 'object') {
                Object.assign(JE.pluginConfig, privateConfig);
            }
        }).catch(function(err) {
            // Non-admin users get 401/403 — this is expected
            if (err && (err.status === 401 || err.status === 403)) return;
            console.warn('🪼 Jellyfin Enhanced: loadPrivateConfig failed:', err);
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
     */
    async function reloadConfig() {
        if (reloadInProgress) return;
        try {
            if (typeof ApiClient === 'undefined' || !ApiClient.getCurrentUserId || !ApiClient.getCurrentUserId()) return;
        } catch (e) { return; }

        var now = Date.now();
        if (now - lastPollTime < minPollInterval) return;
        lastPollTime = now;
        reloadInProgress = true;

        try {
            var hash = await fetchHash();
            if (hash === null) return;

            if (lastHash !== null && hash === lastHash) return; // no change
            lastHash = hash;

            // Hash changed — fetch full config and apply
            var freshConfig = await fetchPublicConfig();
            if (freshConfig) {
                await applyUpdate(freshConfig);
            }
        } catch (e) {
            // Silently ignore — background refresh
        } finally {
            reloadInProgress = false;
        }
    }

    /**
     * Set the initial hash from the current config (called once after first load).
     */
    function snapshotHash(hashValue) {
        lastHash = hashValue;
    }

    /**
     * Broadcast that config has changed (for cross-tab sync).
     */
    function broadcastChange() {
        // Reset poll timer so the next navigation check goes through immediately
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
