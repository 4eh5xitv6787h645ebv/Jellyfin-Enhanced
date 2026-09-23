// Private bootstrap source; regenerate artifacts/generated/plugin.js with npm run generate.
function createConfiguration(JE) {
    // Keep the original converter binding even if an extension replaces the public helper.
    const { toCamelCase } = JE;
    /**
     * Loads the appropriate language file based on the user's settings.
     * Attempts to fetch from GitHub first (with caching), falls back to bundled translations.
     * @returns {Promise<object>} A promise that resolves to the translations object.
     */
    async function loadTranslations() {
        if (typeof JE.loadTranslations === 'function') {
            return JE.loadTranslations();
        }
        console.warn('🪼 Jellyfin Enhanced: Translations module not loaded, falling back to empty translations');
        return {};
    }

     /**
     * Fetches plugin configuration and version from the server.
     * @returns {Promise<[object, string]>} A promise that resolves with config and version.
     */
     function loadPluginData() {
        const configPromise = ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/public-config'),
            dataType: 'json'
        }).catch((e) => {
            console.error("🪼 Jellyfin Enhanced: Failed to fetch public config", e);
            return {}; // Return empty object on error
        });

        const versionPromise = ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/version'),
            dataType: 'text'
        }).catch((e) => {
             console.error("🪼 Jellyfin Enhanced: Failed to fetch version", e);
            return 'unknown'; // Return placeholder on error
        });

        return Promise.all([configPromise, versionPromise]);
    }

    // Keys merged into JE.pluginConfig from /private-config. Tracked so the
    // user-switch reset can strip them again: the endpoint is admin-gated, so
    // an admin's private config (arr instance URLs etc.) must not survive
    // into a non-admin's session.
    let privateConfigKeys = [];

    /**
     * Fetches sensitive configuration from the authenticated endpoint.
     * @returns {Promise<void>}
     */
    async function loadPrivateConfig() {
        // A response resolving after a user switch was authorized as the
        // PREVIOUS user — merging it would leak admin config into the next
        // session and clobber the strip list the reset relies on.
        const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
        try {
            const privateConfig = await ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/private-config'),
                dataType: 'json'
            });
            if (JE.session && !JE.session.isCurrent(requestEpoch)) return;
            // Merge the sensitive keys into the main config object
            privateConfigKeys = Object.keys(privateConfig && typeof privateConfig === 'object' ? privateConfig : {});
            Object.assign(JE.pluginConfig, privateConfig);
        } catch (error) {
            console.warn('🪼 Jellyfin Enhanced: Could not load private configuration. Some features may be limited.', error);
            // Don't assign anything if it fails
        }
    }


    /**
     * Fetches the five per-user config files (settings, shortcuts, bookmark,
     * elsewhere, hidden-content) and assembles a fresh userConfig object.
     * Shared by first boot and by the user-switch re-bootstrap so both paths
     * build the object identically.
     * @param {string} userId - The user to load config for.
     * @returns {Promise<object>} A freshly-built userConfig object.
     */
    async function fetchUserScopedConfig(userId) {
        const fetchPromises = [
            ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl(`/JellyfinEnhanced/user-settings/${userId}/settings.json?_=${Date.now()}`), dataType: 'json' })
                     .then(data => ({ name: 'settings', status: 'fulfilled', value: data }))
                     .catch(e => ({ name: 'settings', status: 'rejected', reason: e })),
            ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl(`/JellyfinEnhanced/user-settings/${userId}/shortcuts.json?_=${Date.now()}`), dataType: 'json' })
                     .then(data => ({ name: 'shortcuts', status: 'fulfilled', value: data }))
                     .catch(e => ({ name: 'shortcuts', status: 'rejected', reason: e })),
            ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl(`/JellyfinEnhanced/user-settings/${userId}/bookmark.json?_=${Date.now()}`), dataType: 'json' })
                     .then(data => ({ name: 'bookmark', status: 'fulfilled', value: data }))
                     .catch(e => ({ name: 'bookmark', status: 'rejected', reason: e })),
            ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl(`/JellyfinEnhanced/user-settings/${userId}/elsewhere.json?_=${Date.now()}`), dataType: 'json' })
                     .then(data => ({ name: 'elsewhere', status: 'fulfilled', value: data }))
                     .catch(e => ({ name: 'elsewhere', status: 'rejected', reason: e })),
            ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl(`/JellyfinEnhanced/user-settings/${userId}/hidden-content.json?_=${Date.now()}`), dataType: 'json' })
                     .then(data => ({ name: 'hiddenContent', status: 'fulfilled', value: data }))
                     .catch(e => ({ name: 'hiddenContent', status: 'rejected', reason: e }))
        ];
        // Use allSettled to get results even if some fetches fail
        const results = await Promise.allSettled(fetchPromises);

        const userConfig = { settings: {}, shortcuts: { Shortcuts: [] }, bookmark: { bookmarks: {} }, elsewhere: {}, hiddenContent: { items: {}, settings: {} } };
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                const data = result.value;
                if (data.status === 'fulfilled' && data.value && typeof data.value === 'object') {
                    // *** CONVERT PASCALCASE TO CAMELCASE ***
                    if (data.name === 'settings' || data.name === 'bookmark' || data.name === 'hiddenContent') {
                        userConfig[data.name] = toCamelCase(data.value);
                    } else {
                        userConfig[data.name] = data.value;
                    }
                } else if (data.status === 'rejected') {
                    if (data.name === 'shortcuts') userConfig.shortcuts = { Shortcuts: [] };
                    else if (data.name === 'bookmark') userConfig.bookmark = { bookmarks: {} };
                    else if (data.name === 'elsewhere') userConfig.elsewhere = {};
                    else if (data.name === 'hiddenContent') userConfig.hiddenContent = { items: {}, settings: {} };
                    else userConfig[data.name] = {};
                } else {
                    if (data.name === 'shortcuts') userConfig.shortcuts = { Shortcuts: [] };
                    else if (data.name === 'bookmark') userConfig.bookmark = { bookmarks: {} };
                    else if (data.name === 'elsewhere') userConfig.elsewhere = {};
                    else if (data.name === 'hiddenContent') userConfig.hiddenContent = { items: {}, settings: {} };
                    else userConfig[data.name] = {};
                }
            } else {
                const name = result.value?.name || result.reason?.name || '';
                if (name === 'shortcuts') userConfig.shortcuts = { Shortcuts: [] };
                else if (name === 'bookmark') userConfig.bookmark = { bookmarks: {} };
                else if (name === 'elsewhere') userConfig.elsewhere = {};
                else if (name === 'hiddenContent') userConfig.hiddenContent = { items: {}, settings: {} };
                else if (name) userConfig[name] = {};
            }
        });
        return userConfig;
    }

    /**
     * Seeds the admin's default display language into the per-user
     * `${userId}-language` key — only when the user has no language set yet,
     * so a user's own choice is never overwritten.
     * @param {string} userId
     */
    function seedDisplayLanguage(userId) {
        if (!userId) return;
        const languageKey = `${userId}-language`;
        // Only seed the admin's default language if the user has no language set yet.
        // This prevents overwriting the user's own language choice on every page load.
        if (localStorage.getItem(languageKey) === null) {
            const desiredLanguage = (JE.currentSettings?.displayLanguage || '').trim();
            if (desiredLanguage) {
                const normalizeLangCode = (code) => {
                    if (!code) return '';
                    const parts = code.split('-');
                    if (parts.length === 1) return parts[0].toLowerCase();
                    if (parts.length === 2) return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
                    return code;
                };
                localStorage.setItem(languageKey, normalizeLangCode(desiredLanguage));
            }
        }
    }

    /**
     * Wires the plugin's own state into the identity-session machinery
     * (js/core/session.js): clears the boot-time per-user globals on any
     * identity transition, and re-loads them for the incoming user after a
     * switch — the SPA never reloads index.html on logout/login, so without
     * this every module keeps serving the previous user's data.
     * Called once, right after the component scripts (including session.js)
     * have loaded.
     */
    function registerSessionIntegration() {
        if (!JE.session) {
            console.error('🪼 Jellyfin Enhanced: session.js missing — user-switch handling disabled.');
            return;
        }

        // Synchronous reset: wipe every boot-time global the moment the
        // identity changes, so nothing can read user A's data under user B.
        JE.session.onUserChange('plugin-globals', () => {
            JE.userConfig = { settings: {}, shortcuts: { Shortcuts: [] }, bookmark: { bookmarks: {} }, elsewhere: {}, hiddenContent: { items: {}, settings: {} } };
            JE.currentSettings = {};
            // Cleared (not merged over) so user A's extra shortcuts don't
            // survive into user B's session — initializeShortcuts() merges.
            JE.state.activeShortcuts = {};
            // Strip the admin-only private config; re-fetched (admins only)
            // during the re-bootstrap below.
            clearPrivateConfig();
        });

        // Async re-bootstrap: after a switch to a signed-in user, reload that
        // user's config and re-derive settings/shortcuts/translations.
        document.addEventListener('je:user-changed', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail || {};
            const { userId, epoch } = detail;
            if (!userId) return; // logged out — stay reset until the next sign-in
            // Defer one macrotask: the transition fires from inside the
            // setAuthenticationInfo wrapper BEFORE the host installs the new
            // token; the fetches below need that token in place.
            setTimeout(async () => {
                if (!JE.session.isCurrent(epoch)) return; // switched again already
                try {
                    const userConfig = await fetchUserScopedConfig(userId);
                    if (!JE.session.isCurrent(epoch)) return; // stale result, drop it
                    JE.userConfig = userConfig;

                    // Re-fetch the admin-only private config for the incoming
                    // user (the reset stripped the previous user's copy; the
                    // server rejects non-admins, leaving the keys absent).
                    await loadPrivateConfig();
                    if (!JE.session.isCurrent(epoch)) return;

                    JE.currentSettings = JE.loadSettings();
                    JE.initializeShortcuts();
                    seedDisplayLanguage(userId);

                    // Per-user tag toggles can differ between users, and the
                    // boot-time conditional initialization only ran for the
                    // first user. The four base-renderer initializers are
                    // idempotent by design (they re-register with fresh
                    // settings), so re-run whichever the incoming user has
                    // enabled; renderers whose toggle is now off stop via
                    // their isEnabled gate and the pipeline invalidation
                    // removes stale overlays.
                    if (JE.currentSettings?.qualityTagsEnabled && typeof JE.initializeQualityTags === 'function') JE.initializeQualityTags();
                    if (JE.currentSettings?.genreTagsEnabled && typeof JE.initializeGenreTags === 'function') JE.initializeGenreTags();
                    if (JE.currentSettings?.ratingTagsEnabled && typeof JE.initializeRatingTags === 'function') JE.initializeRatingTags();
                    if (JE.currentSettings?.languageTagsEnabled && typeof JE.initializeLanguageTags === 'function') JE.initializeLanguageTags();

                    // Translations follow the per-user language choice.
                    try {
                        const translations = await loadTranslations();
                        if (!JE.session.isCurrent(epoch)) return;
                        if (translations) JE.translations = translations;
                    } catch (_) { /* keep previous translations */ }

                    // Announce that the new user's data is live so views
                    // (bookmarks, hidden content, …) can re-render from it.
                    document.dispatchEvent(new CustomEvent('je:user-data-loaded', { detail }));
                    console.log('🪼 Jellyfin Enhanced: Reloaded user-scoped data after user switch.');
                } catch (err) {
                    console.error('🪼 Jellyfin Enhanced: Failed to reload user data after user switch:', err);
                }
            }, 0);
        });
    }

    function clearPrivateConfig() {
        for (const key of privateConfigKeys) delete JE.pluginConfig[key];
        privateConfigKeys = [];
    }
    return { loadPluginData, loadTranslations, loadPrivateConfig, clearPrivateConfig, fetchUserScopedConfig, seedDisplayLanguage, registerSessionIntegration };
}
