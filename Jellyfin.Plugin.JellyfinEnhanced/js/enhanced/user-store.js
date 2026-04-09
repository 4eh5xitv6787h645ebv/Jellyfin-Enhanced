// /js/enhanced/user-store.js
// Phase 1: Reactive per-user settings store.
// Parallel to config-store.js (which handles server-wide plugin config),
// this store polls a per-user hash endpoint and notifies subscribers when
// per-user settings change — enabling cross-tab and cross-device sync
// without a page refresh.
//
// The same poll triggers fire: tab refocus, SPA navigation, BroadcastChannel
// message, and localStorage storage event. The hash is a 16-char hex
// fingerprint of all per-user JSON files on the server.
(function(JE) {
    'use strict';

    var subscribers = [];
    var lastHash = null;
    var reloadInProgress = false;
    var reloadPending = false;
    var minPollInterval = 3000; // slightly longer than config-store (2s)
    var lastPollTime = 0;
    var channel = null;
    var pollingStarted = false;

    // BroadcastChannel for cross-tab user-settings sync
    function onChannelMessage(event) {
        if (event.data && event.data.type === 'user-settings-updated') {
            reloadUserConfig({ bypassThrottle: true });
        }
    }
    function onStorageEvent(event) {
        if (event.key === 'JE_user_settings_updated') {
            reloadUserConfig({ bypassThrottle: true });
        }
    }
    try {
        channel = new BroadcastChannel('jellyfin-enhanced-user-settings');
        channel.onmessage = onChannelMessage;
    } catch (e) { /* fallback to storage events */ }
    window.addEventListener('storage', onStorageEvent);

    function subscribe(callback) {
        subscribers.push(callback);
        return function() {
            var idx = subscribers.indexOf(callback);
            if (idx !== -1) subscribers.splice(idx, 1);
        };
    }

    /**
     * Fetch the per-user settings hash from the server.
     */
    async function fetchUserHash() {
        if (typeof ApiClient === 'undefined' || typeof ApiClient.ajax !== 'function') return null;
        try {
            var userId = ApiClient.getCurrentUserId();
            if (!userId) return null;
            var resp = await ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/user-settings/' + userId + '/hash'),
                dataType: 'text'
            });
            return resp || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Re-fetch all per-user settings files and update JE.userConfig
     * atomically. Notifies subscribers with the list of changed file keys.
     */
    async function applyUserUpdate() {
        if (typeof ApiClient === 'undefined' || typeof ApiClient.ajax !== 'function') return;
        var userId = ApiClient.getCurrentUserId();
        if (!userId) return;

        var oldConfig = JE.userConfig || {};
        var files = {
            settings: '/JellyfinEnhanced/user-settings/' + userId + '/settings.json',
            shortcuts: '/JellyfinEnhanced/user-settings/' + userId + '/shortcuts.json',
            bookmarks: '/JellyfinEnhanced/user-settings/' + userId + '/bookmark.json',
            elsewhere: '/JellyfinEnhanced/user-settings/' + userId + '/elsewhere.json',
            hiddenContent: '/JellyfinEnhanced/user-settings/' + userId + '/hidden-content.json'
        };

        var newConfig = {};
        var changedKeys = [];
        for (var key in files) {
            try {
                var data = await ApiClient.ajax({
                    type: 'GET',
                    url: ApiClient.getUrl(files[key] + '?_=' + Date.now()),
                    dataType: 'json'
                });
                newConfig[key] = data || {};
            } catch (e) {
                // [CF2 pattern] Preserve old value on transient failure
                // (5xx, network error) rather than overwriting with {}.
                // Same distinction as config-store's fetchPrivateConfig:
                // a 404 is "file doesn't exist yet" = genuine empty;
                // a 5xx is "server hiccup" = keep what we had.
                if (e && (e.status === 404 || e.status === 403)) {
                    newConfig[key] = {};
                } else {
                    newConfig[key] = oldConfig[key] || {};
                }
            }
            // Simple object comparison via JSON
            if (JSON.stringify(newConfig[key]) !== JSON.stringify(oldConfig[key] || {})) {
                changedKeys.push(key);
            }
        }

        if (changedKeys.length === 0) return;

        console.log('🪼 Jellyfin Enhanced: User settings changed: ' + changedKeys.join(', '));

        // Atomic swap
        JE.userConfig = newConfig;

        // Recompute merged currentSettings
        var oldSettings = JE.currentSettings || {};
        if (typeof JE.loadSettings === 'function') {
            JE.currentSettings = JE.loadSettings();
        }

        var event = {
            changedKeys: changedKeys,
            oldConfig: oldConfig,
            newConfig: newConfig,
            oldSettings: oldSettings
        };

        var snapshot = subscribers.slice();
        for (var s = 0; s < snapshot.length; s++) {
            try {
                snapshot[s](event);
            } catch (e) {
                console.error('🪼 Jellyfin Enhanced: UserStore subscriber error:', e);
            }
        }
    }

    /**
     * Check for user-settings changes and apply if found.
     */
    async function reloadUserConfig(options) {
        var bypassThrottle = !!(options && options.bypassThrottle);
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
            var hash = await fetchUserHash();
            if (hash === null) return;
            if (lastHash !== null && hash === lastHash) return;

            await applyUserUpdate();
            lastHash = hash; // advance only on success
        } catch (e) {
            console.error('🪼 Jellyfin Enhanced: UserStore reload failed:', e);
        } finally {
            reloadInProgress = false;
            if (reloadPending) {
                reloadPending = false;
                Promise.resolve().then(function() { reloadUserConfig({ bypassThrottle: true }); });
            }
        }
    }

    function broadcastChange() {
        lastPollTime = 0;
        lastHash = null;
        try {
            if (channel) channel.postMessage({ type: 'user-settings-updated', ts: Date.now() });
        } catch (e) { /* ignore */ }
        try {
            localStorage.setItem('JE_user_settings_updated', String(Date.now()));
        } catch (e) { /* ignore */ }
        Promise.resolve().then(function() { reloadUserConfig({ bypassThrottle: true }); });
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible') reloadUserConfig();
    }
    function onPageShow(event) {
        if (event.persisted) reloadUserConfig();
    }
    function onHashChange() { reloadUserConfig(); }
    function onPopState() { reloadUserConfig(); }

    function startPolling() {
        if (pollingStarted) return;
        pollingStarted = true;
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('pageshow', onPageShow);
        window.addEventListener('hashchange', onHashChange);
        window.addEventListener('popstate', onPopState);
        if (JE.helpers && typeof JE.helpers.onNavigate === 'function') {
            JE.helpers.onNavigate(function() { reloadUserConfig(); });
        }
    }

    function snapshotHash(hashValue) { lastHash = hashValue; }

    function destroy() {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pageshow', onPageShow);
        window.removeEventListener('hashchange', onHashChange);
        window.removeEventListener('popstate', onPopState);
        window.removeEventListener('storage', onStorageEvent);
        if (channel) { channel.close(); channel = null; }
        pollingStarted = false;
        subscribers = [];
        lastHash = null;
        reloadInProgress = false;
        lastPollTime = 0;
    }

    JE.userStore = {
        subscribe: subscribe,
        reloadUserConfig: reloadUserConfig,
        broadcastChange: broadcastChange,
        snapshotHash: snapshotHash,
        startPolling: startPolling,
        fetchUserHash: fetchUserHash,
        destroy: destroy
    };

})(window.JellyfinEnhanced);
