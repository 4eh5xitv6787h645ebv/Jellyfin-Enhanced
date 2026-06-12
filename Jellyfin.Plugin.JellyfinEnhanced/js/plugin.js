// /js/plugin.js
(function() {
    'use strict';

    // Create the global namespace immediately with placeholders
    window.JellyfinEnhanced = {
        pluginConfig: {},
        userConfig: { settings: {}, shortcuts: { Shortcuts: [] }, bookmarks: { Bookmarks: {} }, elsewhere: {}, hiddenContent: { items: {}, settings: {} } },
        translations: {},
        pluginVersion: 'unknown',
        // Stub functions that will be overwritten by modules
        icon: (name) => {
            // Fallback icon function until icons.js loads
            // Returns the token unchanged so t() can keep the placeholder
            return name ? `{{ICON_PENDING:${name}}}` : '';
        },
        IconName: {}, // Will be replaced by icons.js
        state: {
            activeShortcuts: {},
            currentContextItemId: null,
            isContinueWatchingContext: false,
            skipToastShown: false,
            pauseScreenClickTimer: null
         },
        // Unified cache manager for tag systems
        _cacheManager: {
            callbacks: new Set(),
            dirty: false,
            scheduleId: null,
            register(saveCallback) {
                this.callbacks.add(saveCallback);
            },
            unregister(saveCallback) {
                this.callbacks.delete(saveCallback);
            },
            markDirty() {
                this.dirty = true;
                if (!this.scheduleId) {
                    // Use requestIdleCallback to defer cache saves
                    if (typeof requestIdleCallback !== 'undefined') {
                        this.scheduleId = requestIdleCallback(() => this._flush(), { timeout: 5000 });
                    } else {
                        this.scheduleId = setTimeout(() => this._flush(), 1000);
                    }
                }
            },
            _flush() {
                if (this.dirty) {
                    this.callbacks.forEach(cb => {
                        try { cb(); } catch (e) { console.error('Cache save error:', e); }
                    });
                    this.dirty = false;
                }
                this.scheduleId = null;
            },
            forceSave() {
                this.dirty = true;
                this._flush();
            }
        },
        /**
         * Escapes HTML special characters to prevent XSS when interpolating into HTML strings.
         * @param {string} str - The value to escape.
         * @returns {string} The escaped string safe for HTML interpolation.
         */
        escapeHtml: (str) => {
            if (typeof str !== 'string') return String(str ?? '');
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        },
        // Placeholder functions
        t: (key, params = {}) => { // Actual implementation defined later
            const translations = window.JellyfinEnhanced?.translations || {};
            let text = translations[key] || key;
            if (params) {
                for (const [param, value] of Object.entries(params)) {
                    text = text.replace(new RegExp(`{${param}}`, 'g'), value);
                }
            }
            // Replace {{icon:name}} tokens with JE.icon() calls
            text = text.replace(/\{\{icon:([a-zA-Z]+)\}\}/g, (match, iconName) => {
                const iconKey = iconName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
                const iconConstant = window.JellyfinEnhanced.IconName?.[iconKey];

                // If IconName not loaded yet, keep the placeholder
                if (!iconConstant) {
                    console.debug(`[JE.t] IconName.${iconKey} not available yet, keeping placeholder`);
                    return match;
                }

                const iconResult = window.JellyfinEnhanced.icon?.(iconConstant);

                // If icon function returns a pending token, keep original placeholder
                if (iconResult && iconResult.startsWith('{{ICON_PENDING:')) {
                    console.debug(`[JE.t] Icon system not ready, keeping placeholder for ${iconName}`);
                    return match;
                }

                return iconResult || match;
            });

            return text;
        },
        loadSettings: () => { console.warn("🪼 Jellyfin Enhanced: loadSettings called before config.js loaded"); return {}; },
        initializeShortcuts: () => { console.warn("🪼 Jellyfin Enhanced: initializeShortcuts called before config.js loaded"); },
        saveUserSettings: async (fileName) => { console.warn(`🪼 Jellyfin Enhanced: saveUserSettings(${fileName}) called before config.js loaded`); }
    };

    const JE = window.JellyfinEnhanced; // Alias for internal use

    // Deferred-boot latch. In bundled mode every module executes before any
    // config has been fetched, so modules whose top-level body reads
    // JE.pluginConfig/JE.userConfig register it here instead. The queue is
    // flushed (in registration = bundle order) right after Stage 2, which is
    // exactly when module bodies executed in the legacy per-file loading flow.
    // After the flush, late registrations (unbundled fallback path) run
    // immediately.
    const bootReadyQueue = [];
    let bootReadyFlushed = false;
    JE.onBootReady = function(fn) {
        if (bootReadyFlushed) {
            try { fn(); } catch (e) { console.error('🪼 Jellyfin Enhanced: onBootReady callback failed:', e); }
        } else {
            bootReadyQueue.push(fn);
        }
    };
    async function flushBootReady() {
        bootReadyFlushed = true;
        const t0 = performance.now();
        let sliceStart = t0;
        while (bootReadyQueue.length) {
            const fn = bootReadyQueue.shift();
            try { fn(); } catch (e) { console.error('🪼 Jellyfin Enhanced: onBootReady callback failed:', e); }
            // Cooperative flush: in bundled mode nearly every module body runs
            // from this queue (the bundler wraps them), so yield between time
            // slices to keep each task well under the 50ms long-task threshold.
            if (bootReadyQueue.length && (performance.now() - sliceStart) > 24) {
                await (window.scheduler?.yield ? scheduler.yield() : new Promise(r => setTimeout(r, 0)));
                sliceStart = performance.now();
            }
        }
        try { performance.measure('je:flushBootReady', { start: t0, duration: performance.now() - t0 }); } catch (e) { /* old browser */ }
    }

    /**
     * Times a synchronous init step and records it as a je:init:* performance
     * measure so the perf harness (and devtools) can attribute boot-time main
     * thread work per feature.
     */
    function timeInit(label, fn) {
        const t0 = performance.now();
        try {
            fn();
        } finally {
            const dur = performance.now() - t0;
            try { performance.measure(`je:init:${label}`, { start: t0, duration: dur }); } catch (e) { /* old browser */ }
            if (dur > 50) console.warn(`🪼 Jellyfin Enhanced: init '${label}' blocked the main thread for ${dur.toFixed(0)}ms`);
        }
    }

    /**
     * Converts PascalCase object keys to camelCase recursively.
     * @param {object} obj - The object to convert.
     * @returns {object} - A new object with camelCase keys.
     */
    function toCamelCase(obj) {
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            return obj; // Return primitives and arrays as-is
        }
        const camelCased = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
                camelCased[camelKey] = toCamelCase(obj[key]); // Recursive for nested objects
            }
        }
        return camelCased;
    }
    JE.toPascalCase = toPascalCase;
    JE.toCamelCase = toCamelCase;
    /**
     * Converts object keys from camelCase to PascalCase (recursively).
     * @param {object} obj - The object to convert.
     * @returns {object} - A new object with PascalCase keys.
     */
    function toPascalCase(obj) {
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            return obj; // Return primitives and arrays as-is
        }
        const pascalCased = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
                pascalCased[pascalKey] = toPascalCase(obj[key]); // Recursive for nested objects
            }
        }
        return pascalCased;
    }

    /**
     * Injects Druidblack metadata icons CSS.
     * @param {boolean} enabled
     */
    function injectMetadataIcons(enabled) {
        const existing = document.getElementById('metadataIconsCss');
        if (enabled && !existing) {
            const link = document.createElement('link');
            link.id = 'metadataIconsCss';
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/gh/Druidblack/jellyfin-icon-metadata/public-icon.css';
            document.head.appendChild(link);
        } else if (!enabled && existing) {
            existing.remove();
        }
    }

    /**
     * Returns the plugin version for use as a cache-busting query parameter.
     * Reads synchronously from the injected script tag's version attribute so it
     * is available before the async version fetch resolves. Falls back to
     * JE.pluginVersion when already set (post-init calls), and to Date.now() if
     * neither source is available.
     * @returns {string}
     */
    function getScriptVersion() {
        const scriptEl = document.querySelector('script[plugin="Jellyfin Enhanced"]');
        if (scriptEl?.getAttribute('dev') === 'true') return Date.now();
        // Always prefer the script tag's version attribute, it holds the full
        // cacheKey (version + DLL timestamp) baked in at server startup.
        // JE.pluginVersion is just the bare version number from the API and
        // does not include the timestamp component.
        return scriptEl?.getAttribute('version') || JE.pluginVersion || Date.now();
    }

    /**
     * Loads the translation module and exposes JE.loadTranslations.
     * @returns {Promise<void>}
     */
    async function loadTranslationsModule() {
        if (typeof JE.loadTranslations === 'function') return;
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = ApiClient.getUrl(`/JellyfinEnhanced/js/enhanced/translations.js?v=${getScriptVersion()}`);
            script.onload = () => resolve();
            script.onerror = (e) => {
                console.error('🪼 Jellyfin Enhanced: Failed to load translations module', e);
                resolve();
            };
            document.head.appendChild(script);
        });
    }

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

    /**
     * Fetches sensitive configuration from the authenticated endpoint.
     * @returns {Promise<void>}
     */
    async function loadPrivateConfig() {
        try {
            const privateConfig = await ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/private-config'),
                dataType: 'json'
            });
            // Merge the sensitive keys into the main config object
            Object.assign(JE.pluginConfig, privateConfig);
        } catch (error) {
            console.warn('🪼 Jellyfin Enhanced: Could not load private configuration. Some features may be limited.', error);
            // Don't assign anything if it fails
        }
    }


    /**
     * Loads an array of scripts dynamically.
     * @param {string[]} scripts - Array of script filenames.
     * @param {string} basePath - The base URL path for the scripts.
     * @returns {Promise<void>} - A promise that resolves when all scripts attempt to load.
     */
    function loadScripts(scripts, basePath) {
        const promises = scripts.map(scriptName => {
            return new Promise((resolve) => { // Always resolve so one failure doesn't stop others
                const script = document.createElement('script');
                script.src = ApiClient.getUrl(`${basePath}/${scriptName}?v=${getScriptVersion()}`);
                script.onload = () => {
                    resolve({ status: 'fulfilled', script: scriptName });
                };
                script.onerror = (e) => {
                    console.error(`🪼 Jellyfin Enhanced: Failed to load script '${scriptName}'`, e);
                    resolve({ status: 'rejected', script: scriptName, error: e }); // Resolve even on error
                };
                document.head.appendChild(script);
            });
        });
        // Wait for all promises to settle (either fulfilled or rejected)
        return Promise.allSettled(promises);
    }

     /**
     * Loads the splash screen script early.
     */
     function loadSplashScreenEarly() {
        if (typeof ApiClient === 'undefined') {
            setTimeout(loadSplashScreenEarly, 50);
            return;
        }
        const splashScript = document.createElement('script');
        splashScript.src = ApiClient.getUrl('/JellyfinEnhanced/js/others/splashscreen.js?v=' + getScriptVersion());
        splashScript.onload = () => {
            if (typeof JE.initializeSplashScreen === 'function') {
                JE.initializeSplashScreen(); // Initialize if available
            }
        };
         splashScript.onerror = () => console.error('🪼 Jellyfin Enhanced: Failed to load splash screen script.');
        document.head.appendChild(splashScript);
    }

    /**
     * Injects a maintenance banner at the top of the page.
     */
    function injectMaintenanceBanner(message) {
        if (document.getElementById('je-maintenance-banner')) return;
        const text = (message || '').trim() || 'This server is currently undergoing maintenance. Please try again later.';
        const banner = document.createElement('div');
        banner.id = 'je-maintenance-banner';
        banner.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
            'background:#b71c1c', 'color:#fff', 'text-align:center',
            'padding:10px 16px', 'font-size:14px', 'font-weight:600',
            'letter-spacing:0.02em', 'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
            'font-family:inherit'
        ].join(';');
        banner.textContent = text;
        document.body.appendChild(banner);
        // Inject a stylesheet that shifts Jellyfin's fixed header + body down by the banner height.
        // We use a <style> tag so the rule applies even if Jellyfin re-renders its header.
        requestAnimationFrame(function() {
            const h = banner.offsetHeight;
            if (h <= 0) return;
            const existing = document.getElementById('je-maintenance-banner-style');
            if (existing) return;
            const style = document.createElement('style');
            style.id = 'je-maintenance-banner-style';
            style.textContent = [
                'body { padding-top: ' + h + 'px !important; }',
                '.skinHeader { top: ' + h + 'px !important; }',
                '.mainDrawer { top: ' + h + 'px !important; }',
                '.videoOsdBottom { bottom: 0 !important; }'
            ].join('\n');
            document.head.appendChild(style);
        });
    }

    function removeMaintenanceBanner() {
        document.getElementById('je-maintenance-banner')?.remove();
        document.getElementById('je-maintenance-banner-style')?.remove();
    }

    let loginImageScriptLoaded = false;
    function applyEarlyPublicConfig(config) {
        if (config?.MaintenanceModeEnabled === true) {
            injectMaintenanceBanner(config.MaintenanceModeMessage);
        } else {
            removeMaintenanceBanner();
        }

        // Only load login image if enabled (default to false)
        if (config?.EnableLoginImage === true && !loginImageScriptLoaded) {
            loginImageScriptLoaded = true;
            const loginImageScript = document.createElement('script');
            loginImageScript.src = ApiClient.getUrl('/JellyfinEnhanced/js/extras/login-image.js?v=' + getScriptVersion());
            loginImageScript.onerror = () => console.error('🪼 Jellyfin Enhanced: Failed to load login image script.');
            document.head.appendChild(loginImageScript);
        }
    }

    /**
     * Loads the login image script early and injects the maintenance banner.
     * Applies instantly from a small cached copy of the public config (works
     * pre-login where the boot snapshot is unavailable), then reconciles
     * against a fresh fetch in the background.
     */
    function loadLoginImageEarly() {
        if (typeof ApiClient === 'undefined') {
            setTimeout(loadLoginImageEarly, 50);
            return;
        }

        const serverId = (typeof ApiClient.serverId === 'function' ? ApiClient.serverId() : ApiClient._serverInfo?.Id) || 'srv';
        const cacheKey = `JE_pubcfg:${serverId}`;
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (e) { /* corrupted cache */ }
        if (cached) applyEarlyPublicConfig(cached);

        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/public-config'),
            dataType: 'json'
        }).then((config) => {
            try {
                localStorage.setItem(cacheKey, JSON.stringify({
                    MaintenanceModeEnabled: config?.MaintenanceModeEnabled === true,
                    MaintenanceModeMessage: config?.MaintenanceModeMessage || '',
                    EnableLoginImage: config?.EnableLoginImage === true
                }));
            } catch (e) { /* quota */ }
            applyEarlyPublicConfig(config);
        }).catch(() => {
            console.warn('🪼 Jellyfin Enhanced: Could not fetch config for login image, skipping.');
        });
    }

    /**
     * Checks if there's a server ID mismatch (stale credentials from previous server)
     * @returns {boolean}
     */
    function hasServerIdMismatch() {
        try {
            if (typeof ApiClient === 'undefined') return false;

            const creds = localStorage.getItem('jellyfin_credentials');
            if (!creds) return false;

            const servers = JSON.parse(creds)?.Servers;
            if (!Array.isArray(servers) || servers.length === 0) return false;

            const currentServerId = ApiClient._serverInfo?.Id ||
                (typeof ApiClient.serverId === 'function' ? ApiClient.serverId() : ApiClient.serverId);
            if (!currentServerId) return false;

            // Check if stored server matches current server
            const hasMatch = servers.some(s => s.Id === currentServerId || s.ServerId === currentServerId);
            return !hasMatch;
        } catch (e) {
            return false;
        }
    }

    // =========================================================================
    // Boot snapshot (stale-while-revalidate)
    //
    // The processed boot state (pluginConfig incl. private merge and plugin-
    // presence fixups, camelCased userConfig, translations) is persisted per
    // server+user, keyed to the script cacheKey. On the next boot it hydrates
    // synchronously — zero round trips before features initialize — while a
    // background revalidation fetches /JellyfinEnhanced/boot-payload, diffs,
    // re-persists, and emits 'je:config-updated' on change. A new plugin build
    // changes the cacheKey, and DevMode uses a per-load cacheKey, so both
    // automatically fall back to revalidate-first boots.
    // =========================================================================
    const BOOT_SNAPSHOT_VERSION = 1;

    function getSnapshotKey() {
        try {
            const serverId = (typeof ApiClient.serverId === 'function' ? ApiClient.serverId() : ApiClient._serverInfo?.Id) || 'srv';
            const userId = ApiClient.getCurrentUserId();
            if (!userId) return null;
            return `JE_boot:${BOOT_SNAPSHOT_VERSION}:${serverId}:${userId}`;
        } catch (e) {
            return null;
        }
    }

    function readBootSnapshot(cacheKey) {
        try {
            const key = getSnapshotKey();
            if (!key) return null;
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const snap = JSON.parse(raw);
            if (!snap || snap.cacheKey !== cacheKey || !snap.pluginConfig || !snap.userConfig) return null;
            return snap;
        } catch (e) {
            return null;
        }
    }

    function persistBootSnapshot(cacheKey) {
        try {
            const key = getSnapshotKey();
            if (!key) return;
            localStorage.setItem(key, JSON.stringify({
                savedAt: Date.now(),
                cacheKey,
                pluginVersion: JE.pluginVersion,
                pluginConfig: JE.pluginConfig,
                userConfig: JE.userConfig,
                translations: JE.translations
            }));
        } catch (e) { /* quota exceeded / privacy mode — snapshot boots just stay disabled */ }
    }

    function fetchBootPayload() {
        return ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/boot-payload'),
            dataType: 'json'
        });
    }

    /** Merges public+private config and applies plugin-presence fixups. */
    function applyPluginConfigFromPayload(payload) {
        const cfg = (payload.PublicConfig && typeof payload.PublicConfig === 'object') ? payload.PublicConfig : {};
        Object.assign(cfg, payload.PrivateConfig && typeof payload.PrivateConfig === 'object' ? payload.PrivateConfig : {});
        if (!payload.HasCustomTabs) {
            cfg.BookmarksUseCustomTabs = false;
            cfg.CalendarUseCustomTabs = false;
            cfg.HiddenContentUseCustomTabs = false;
            cfg.DownloadsUseCustomTabs = false;
        }
        if (!payload.HasPluginPages) {
            cfg.BookmarksUsePluginPages = false;
            cfg.HiddenContentUsePluginPages = false;
            cfg.DownloadsUsePluginPages = false;
            cfg.CalendarUsePluginPages = false;
        }
        JE.pluginConfig = cfg;
        JE.pluginVersion = payload.Version || 'unknown';
    }

    /** Builds the processed userConfig from a boot payload (same conversions as the per-file path). */
    function buildUserConfigFromPayload(payload) {
        const us = payload.UserSettings || {};
        return {
            settings: us.Settings && typeof us.Settings === 'object' ? toCamelCase(us.Settings) : {},
            shortcuts: us.Shortcuts && typeof us.Shortcuts === 'object' ? us.Shortcuts : { Shortcuts: [] },
            bookmark: us.Bookmark && typeof us.Bookmark === 'object' ? toCamelCase(us.Bookmark) : { bookmarks: {} },
            elsewhere: us.Elsewhere && typeof us.Elsewhere === 'object' ? us.Elsewhere : {},
            hiddenContent: us.HiddenContent && typeof us.HiddenContent === 'object' ? toCamelCase(us.HiddenContent) : { items: {}, settings: {} }
        };
    }

    /** Server-triggered translation cache invalidation (rare admin action). */
    async function handleTranslationCacheClear() {
        const serverTranslationClearTs = JE.pluginConfig.ClearTranslationCacheTimestamp || 0;
        const localTranslationClearTs = parseInt(localStorage.getItem('JE_translation_clear_ts') || '0', 10);
        if (serverTranslationClearTs > localTranslationClearTs) {
            console.log(`🪼 Jellyfin Enhanced: Server-triggered translation cache clear (${new Date(serverTranslationClearTs).toISOString()})`);
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('JE_translation_') || key.startsWith('JE_translation_ts_'))) {
                    localStorage.removeItem(key);
                }
            }
            localStorage.setItem('JE_translation_clear_ts', serverTranslationClearTs.toString());
            JE.translations = await loadTranslations() || {};
            JE.t = window.JellyfinEnhanced.t;
        }
    }

    /** Background revalidation for snapshot boots. */
    async function revalidateBootData(cacheKey) {
        try {
            const userConfigAtBoot = JSON.stringify(JE.userConfig);
            const pluginConfigAtBoot = JSON.stringify(JE.pluginConfig);
            await loadTranslationsModule();
            const payload = await fetchBootPayload();
            if (!payload || typeof payload !== 'object' || !payload.PublicConfig) return;

            applyPluginConfigFromPayload(payload);
            const serverUserConfig = buildUserConfigFromPayload(payload);
            // Don't clobber user edits made since boot; otherwise adopt server state.
            if (JSON.stringify(JE.userConfig) === userConfigAtBoot) {
                JE.userConfig = serverUserConfig;
            }
            JE.translations = (await loadTranslations()) || JE.translations;
            JE.t = window.JellyfinEnhanced.t;
            await handleTranslationCacheClear();
            try { injectMetadataIcons(!!JE.pluginConfig?.MetadataIconsEnabled); } catch (e) { /* non-fatal */ }
            persistBootSnapshot(cacheKey);

            if (JSON.stringify(JE.pluginConfig) !== pluginConfigAtBoot
                || JSON.stringify(JE.userConfig) !== userConfigAtBoot) {
                document.dispatchEvent(new CustomEvent('je:config-updated'));
                console.debug('🪼 Jellyfin Enhanced: Boot config changed on revalidation; features converge on next navigation.');
            }
        } catch (e) {
            console.debug('🪼 Jellyfin Enhanced: Boot revalidation failed (will retry next load):', e);
        }
    }

    /**
     * Legacy boot fetch fan-out (pre boot-payload servers): public-config +
     * version + private-config + /Plugins + five user-settings files.
     */
    async function legacyBootLoad() {
        await loadTranslationsModule();
        const [[config, version], translations] = await Promise.all([
            loadPluginData(),
            loadTranslations() // Load translations first
        ]);

        JE.pluginConfig = config && typeof config === 'object' ? config : {};
        JE.pluginVersion = version || 'unknown';
        JE.translations = translations || {};
        JE.t = window.JellyfinEnhanced.t; // Ensure the real function is assigned
        await loadPrivateConfig();

        // Clear stale UseCustomTabs / UsePluginPages config flags when those
        // plugins are not installed.  Settings persist after uninstall, which
        // causes sidebar injection to be skipped even though the delivery
        // plugin is no longer present.
        try {
            const installedPlugins = await ApiClient.ajax({
                type: 'GET', url: ApiClient.getUrl('/Plugins'), dataType: 'json'
            });
            if (!Array.isArray(installedPlugins)) throw new Error('Unexpected /Plugins response');
            const hasCustomTabs = installedPlugins.some(p => p.Name === 'Custom Tabs');
            const hasPluginPages = installedPlugins.some(p => p.Name === 'Plugin Pages');
            if (!hasCustomTabs) {
                JE.pluginConfig.BookmarksUseCustomTabs = false;
                JE.pluginConfig.CalendarUseCustomTabs = false;
                JE.pluginConfig.HiddenContentUseCustomTabs = false;
                JE.pluginConfig.DownloadsUseCustomTabs = false;
            }
            if (!hasPluginPages) {
                JE.pluginConfig.BookmarksUsePluginPages = false;
                JE.pluginConfig.HiddenContentUsePluginPages = false;
                JE.pluginConfig.DownloadsUsePluginPages = false;
                JE.pluginConfig.CalendarUsePluginPages = false;
            }
        } catch (e) {
            console.warn('🪼 Jellyfin Enhanced: Could not verify installed plugins:', e);
        }

        await handleTranslationCacheClear();

        const userId = ApiClient.getCurrentUserId();
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

        JE.userConfig = { settings: {}, shortcuts: { Shortcuts: [] }, bookmark: { bookmarks: {} }, elsewhere: {}, hiddenContent: { items: {}, settings: {} } };
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                const data = result.value;
                if (data.status === 'fulfilled' && data.value && typeof data.value === 'object') {
                    // *** CONVERT PASCALCASE TO CAMELCASE ***
                    if (data.name === 'settings' || data.name === 'bookmark' || data.name === 'hiddenContent') {
                        JE.userConfig[data.name] = toCamelCase(data.value);
                    } else {
                        JE.userConfig[data.name] = data.value;
                    }
                } else if (data.status === 'rejected') {
                    if (data.name === 'shortcuts') JE.userConfig.shortcuts = { Shortcuts: [] };
                    else if (data.name === 'bookmark') JE.userConfig.bookmark = { bookmarks: {} };
                    else if (data.name === 'elsewhere') JE.userConfig.elsewhere = {};
                    else if (data.name === 'hiddenContent') JE.userConfig.hiddenContent = { items: {}, settings: {} };
                    else JE.userConfig[data.name] = {};
                } else {
                    if (data.name === 'shortcuts') JE.userConfig.shortcuts = { Shortcuts: [] };
                    else if (data.name === 'bookmark') JE.userConfig.bookmark = { bookmarks: {} };
                    else if (data.name === 'elsewhere') JE.userConfig.elsewhere = {};
                    else if (data.name === 'hiddenContent') JE.userConfig.hiddenContent = { items: {}, settings: {} };
                    else JE.userConfig[data.name] = {};
                }
            } else {
                const name = result.value?.name || result.reason?.name || '';
                if (name === 'shortcuts') JE.userConfig.shortcuts = { Shortcuts: [] };
                else if (name === 'bookmark') JE.userConfig.bookmark = { bookmarks: {} };
                else if (name === 'elsewhere') JE.userConfig.elsewhere = {};
                else if (name === 'hiddenContent') JE.userConfig.hiddenContent = { items: {}, settings: {} };
                else if (name) JE.userConfig[name] = {};
            }
        });
    }

    let mismatchRetryCount = 0;
    const MAX_MISMATCH_RETRIES = 100; // ~30s at 300ms intervals

    /**
     * Main initialization function.
     */
    async function initialize() {
        // Check for server ID mismatch - stop retrying if credentials are stale
        if (hasServerIdMismatch()) {
            mismatchRetryCount++;
            if (mismatchRetryCount >= MAX_MISMATCH_RETRIES) {
                console.warn('🪼 Jellyfin Enhanced: Server ID mismatch detected - stopping to allow re-authentication');
                window.JE?.hideSplashScreen?.();
                return;
            }
            setTimeout(initialize, 300);
            return;
        }

        // Normal retry logic (no mismatch). 50ms keeps boot latency low — with
        // the deferred bundle, ApiClient is usually ready on the first check.
        if (typeof ApiClient === 'undefined' || !ApiClient.getCurrentUserId?.()) {
            setTimeout(initialize, 50);
            return;
        }

        // Reset mismatch counter on success
        mismatchRetryCount = 0;

        try {
            // Stage 1+2: boot data. Snapshot boot hydrates synchronously (zero
            // RTTs before features initialize) and revalidates in the
            // background; otherwise one aggregated boot-payload request
            // replaces the old fan-out (public-config + version + private-config
            // + /Plugins + five user-settings files), with that fan-out kept as
            // a fallback for older servers.
            const bootCacheKey = String(getScriptVersion());
            const bootSnapshot = readBootSnapshot(bootCacheKey);

            // Prefetch full user object once (needed for admin check in arr-links etc.)
            // Fire-and-forget alongside boot; result available as JE.currentUser
            ApiClient.getCurrentUser().then(u => { JE.currentUser = u; }).catch(() => {});

            if (bootSnapshot) {
                JE.bootMode = 'snapshot';
                JE.pluginConfig = bootSnapshot.pluginConfig;
                JE.userConfig = bootSnapshot.userConfig;
                JE.translations = bootSnapshot.translations || {};
                JE.pluginVersion = bootSnapshot.pluginVersion || 'unknown';
                JE.t = window.JellyfinEnhanced.t;
                revalidateBootData(bootCacheKey); // fire-and-forget
            } else {
                JE.bootMode = 'network';
                await loadTranslationsModule();
                let bootPayload = null;
                try {
                    bootPayload = await fetchBootPayload();
                } catch (e) {
                    console.warn('🪼 Jellyfin Enhanced: boot-payload unavailable, falling back to legacy boot fetches:', e);
                }
                if (bootPayload && typeof bootPayload === 'object' && bootPayload.PublicConfig) {
                    applyPluginConfigFromPayload(bootPayload);
                    JE.userConfig = buildUserConfigFromPayload(bootPayload);
                    JE.translations = (await loadTranslations()) || {};
                    JE.t = window.JellyfinEnhanced.t;
                    await handleTranslationCacheClear();
                } else {
                    await legacyBootLoad();
                }
                persistBootSnapshot(bootCacheKey);
            }

            // Inject metadata icons CSS if enabled
            try {
                injectMetadataIcons(!!JE.pluginConfig?.MetadataIconsEnabled);
            } catch (e) {
                console.warn('🪼 Jellyfin Enhanced: Failed to inject Metadata icons CSS', e);
            }


            // Configs and user settings are loaded: run deferred module bodies
            // (bundled mode). Must happen before Stage 4 so their exports exist
            // for loadSettings/initializers below. The flush is time-sliced.
            await flushBootReady();

            // Initialize splash screen
            if (typeof JE.initializeSplashScreen === 'function') {
                JE.initializeSplashScreen();
            }

            // Stage 3: Load ALL component scripts.
            // When served as the server-side bundle (window.__JE_BUNDLED), every
            // module already executed in load-order.json order before initialize()
            // resumed, so no network loading is needed. This array is the fallback
            // load order when the bundle is unavailable — keep it in sync with
            // js/load-order.json.
            const basePath = '/JellyfinEnhanced/js';
            const allComponentScripts = [
                // enhanced
                'enhanced/config.js',
                'enhanced/helpers.js',
                'enhanced/view-router.js',
                'enhanced/tag-pipeline.js',
                'enhanced/icons.js',
                'enhanced/features.js',
                'enhanced/events.js',
                'enhanced/playback.js',
                'enhanced/hidden-content.js',
                'enhanced/hidden-content-page.js',
                'enhanced/hidden-content-custom-tab.js',
                'enhanced/subtitles.js',
                'enhanced/themer.js',
                'enhanced/ui.js',
                'enhanced/bookmarks.js',
                'enhanced/bookmarks-library.js',
                'enhanced/osd-rating.js',
                'enhanced/pausescreen.js',

                // elsewhere
                'elsewhere/elsewhere.js',
                'elsewhere/reviews.js',

                // jellyseerr
                'jellyseerr/request-manager.js',
                'jellyseerr/api.js',
                'jellyseerr/jellyseerr.js',
                'jellyseerr/ui.js',
                'jellyseerr/modal.js',
                'jellyseerr/more-info-modal.js',
                'jellyseerr/hss-discovery-handler.js',
                'jellyseerr/item-details.js',
                'jellyseerr/issue-reporter.js',
                'jellyseerr/seamless-scroll.js',
                'jellyseerr/discovery-filter-utils.js',
                'jellyseerr/network-discovery.js',
                'jellyseerr/person-discovery.js',
                'jellyseerr/genre-discovery.js',
                'jellyseerr/tag-discovery.js',
                'jellyseerr/collection-discovery.js',

                // tags
                'tags/genretags.js',
                'tags/languagetags.js',
                'tags/peopletags.js',
                'tags/qualitytags.js',
                'tags/ratingtags.js',
                'tags/userreviewtags.js',

                // arr
                'arr/arr-links.js',
                'arr/arr-tag-links.js',
                'arr/requests-page.js',
                'arr/calendar-page.js',
                'arr/requests-custom-tab.js',
                'arr/calendar-custom-tab.js',

                // extras
                'extras/colored-activity-icons.js',
                'extras/colored-ratings.js',
                'extras/plugin-icons.js',
                'extras/theme-selector.js',
                'extras/active-streams.js',

                // others
                'others/letterboxd-links.js',
            ];
            if (!window.__JE_BUNDLED) {
                await loadScripts(allComponentScripts, basePath);
                console.log('🪼 Jellyfin Enhanced: All component scripts loaded.');
            }

            // Stage 4: Initialize core settings/shortcuts using potentially defined functions
            if (typeof JE.loadSettings === 'function' && typeof JE.initializeShortcuts === 'function') {
                JE.currentSettings = JE.loadSettings(); // This happens AFTER config.js is loaded
                JE.initializeShortcuts();
            } else {
                 console.error("🪼 Jellyfin Enhanced: FATAL - config.js functions not defined after script loading.");
                 if (typeof JE.hideSplashScreen === 'function') JE.hideSplashScreen();
                 return;
            }

            const userId = ApiClient.getCurrentUserId();
            if (userId) {
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

            // Stage 5: Initialize theme system first
            if (typeof JE.themer?.init === 'function') {
                JE.themer.init();
                console.log('🪼 Jellyfin Enhanced: Theme system initialized.');
            }

            // Native CLS reservation: jellyfin-web hides the detail-page button
            // row with display:none and un-hides it after the item fetch, so the
            // row snaps 0 -> ~3.4em and shifts the whole page below it (the
            // single largest native layout-shift contributor on detail pages).
            // Reserving its height is pure CSS and benefits native UI too.
            try {
                if (!document.getElementById('je-cls-reserve')) {
                    const clsStyle = document.createElement('style');
                    clsStyle.id = 'je-cls-reserve';
                    clsStyle.textContent = '#itemDetailPage .mainDetailButtons, .itemDetailPage .mainDetailButtons { min-height: 3.4em; }';
                    document.head.appendChild(clsStyle);
                }
            } catch (e) { /* cosmetic only */ }

            // Register unified cache save on page unload
            window.addEventListener('beforeunload', () => {
                JE._cacheManager.forceSave();
            });

            // Stage 6: Initialize feature modules (each timed as je:init:* for attribution)
            if (typeof JE.initializeEnhancedScript === 'function') timeInit('enhanced', () => JE.initializeEnhancedScript());
            if (typeof JE.initializeElsewhereScript === 'function' && JE.pluginConfig?.ElsewhereEnabled) timeInit('elsewhere', () => JE.initializeElsewhereScript());
            if (typeof JE.initializeJellyseerrScript === 'function' && JE.pluginConfig?.JellyseerrEnabled && JE.pluginConfig?.JellyseerrShowSearchResults !== false) timeInit('jellyseerr', () => JE.initializeJellyseerrScript());
            if (typeof JE.jellyseerrIssueReporter?.initialize === 'function' && JE.pluginConfig?.JellyseerrEnabled && JE.pluginConfig?.JellyseerrShowReportButton) timeInit('issueReporter', () => JE.jellyseerrIssueReporter.initialize());
            if (typeof JE.initializePauseScreen === 'function') timeInit('pauseScreen', () => JE.initializePauseScreen());
            if (typeof JE.initializeBookmarks === 'function') timeInit('bookmarks', () => JE.initializeBookmarks());
            if (typeof JE.initializeQualityTags === 'function' && JE.currentSettings?.qualityTagsEnabled) timeInit('qualityTags', () => JE.initializeQualityTags());
            if (typeof JE.initializeGenreTags === 'function' && JE.currentSettings?.genreTagsEnabled) timeInit('genreTags', () => JE.initializeGenreTags());
            if (typeof JE.initializeRatingTags === 'function' && JE.currentSettings?.ratingTagsEnabled) timeInit('ratingTags', () => JE.initializeRatingTags());
            if (typeof JE.initializeUserReviewTags === 'function' && JE.pluginConfig?.ShowUserReviews && JE.pluginConfig?.ShowUserRatingOnPosters && JE.currentSettings?.ratingTagsEnabled) timeInit('userReviewTags', () => JE.initializeUserReviewTags());
            if (typeof JE.initializeArrLinksScript === 'function' && JE.pluginConfig?.ArrLinksEnabled) timeInit('arrLinks', () => JE.initializeArrLinksScript());
            if (typeof JE.initializeArrTagLinksScript === 'function' && JE.pluginConfig?.ArrTagsShowAsLinks) timeInit('arrTagLinks', () => JE.initializeArrTagLinksScript());
            if (typeof JE.initializeLetterboxdLinksScript === 'function' && JE.pluginConfig?.LetterboxdEnabled) timeInit('letterboxd', () => JE.initializeLetterboxdLinksScript());
            if (typeof JE.initializeReviewsScript === 'function' && (JE.pluginConfig?.ShowReviews || JE.pluginConfig?.ShowUserReviews)) timeInit('reviews', () => JE.initializeReviewsScript());
            if (typeof JE.initializeLanguageTags === 'function' && JE.currentSettings?.languageTagsEnabled) timeInit('languageTags', () => JE.initializeLanguageTags());
            if (typeof JE.initializePeopleTags === 'function' && JE.currentSettings?.peopleTagsEnabled) timeInit('peopleTags', () => JE.initializePeopleTags());
            // Initialize the unified tag pipeline AFTER all tag renderers have registered
            if (typeof JE.tagPipeline?.initialize === 'function') timeInit('tagPipeline', () => JE.tagPipeline.initialize());
            if (typeof JE.initializeOsdRating === 'function') timeInit('osdRating', () => JE.initializeOsdRating());
            // Skip hidden content initialization when feature is disabled server-wide — JE.hiddenContent stays undefined, safely disabling all downstream consumers
            if (typeof JE.initializeHiddenContent === 'function' && JE.pluginConfig?.HiddenContentEnabled) timeInit('hiddenContent', () => JE.initializeHiddenContent());

            if (JE.pluginConfig?.ColoredRatingsEnabled && typeof JE.initializeColoredRatings === 'function') {
                timeInit('coloredRatings', () => JE.initializeColoredRatings());
            }
            if (JE.pluginConfig?.ThemeSelectorEnabled && typeof JE.initializeThemeSelector === 'function') {
                timeInit('themeSelector', () => JE.initializeThemeSelector());
            }
            if (JE.pluginConfig?.ColoredActivityIconsEnabled && typeof JE.initializeActivityIcons === 'function') {
                timeInit('activityIcons', () => JE.initializeActivityIcons());
            }
            if (JE.pluginConfig?.PluginIconsEnabled && typeof JE.initializePluginIcons === 'function') {
                timeInit('pluginIcons', () => JE.initializePluginIcons());
            }
            if (JE.pluginConfig?.ActiveStreamsEnabled && typeof JE.activeStreams?.initialize === 'function') {
                timeInit('activeStreams', () => JE.activeStreams.initialize());
            }
            if (JE.pluginConfig?.DownloadsPageEnabled && typeof JE.initializeDownloadsPage === 'function') {
                timeInit('downloadsPage', () => JE.initializeDownloadsPage());
            }
            if (JE.pluginConfig?.CalendarPageEnabled && typeof JE.initializeCalendarPage === 'function') {
                timeInit('calendarPage', () => JE.initializeCalendarPage());
            }
            if (JE.pluginConfig?.HiddenContentEnabled && typeof JE.initializeHiddenContentPage === 'function') {
                timeInit('hiddenContentPage', () => JE.initializeHiddenContentPage());
            }

            // Fire lifecycle hooks for the page the user is already on
            // (deep links / the boot landing page).
            try { JE.viewRouter?.kickstart(); } catch (e) { console.warn('🪼 Jellyfin Enhanced: viewRouter kickstart failed:', e); }

            console.log('🪼 Jellyfin Enhanced: All components initialized successfully.');

            // Final Stage: Hide splash screen
            if (typeof JE.hideSplashScreen === 'function') {
                JE.hideSplashScreen();
            }

        } catch (error) {
            console.error('🪼 Jellyfin Enhanced: CRITICAL INITIALIZATION FAILURE:', error);
             if (typeof JE.hideSplashScreen === 'function') {
                JE.hideSplashScreen();
            }
        }
    }

    if (window.__JE_BUNDLED) {
        // Bundled mode: every module in this file executes within the current
        // task, so defer boot one microtask until all of them have defined
        // their JE.* exports. translations.js and splashscreen.js are part of
        // the bundle; login-image.js stays dynamically loaded (conditional,
        // pre-login path).
        queueMicrotask(() => {
            if (typeof JE.initializeSplashScreen === 'function') JE.initializeSplashScreen();
            loadLoginImageEarly();
            initialize();
        });
    } else {
        // Load splash screen immediately (before main initialization)
        loadSplashScreenEarly();

        // Load login image immediately (before main initialization)
        loadLoginImageEarly();

        // Then start main initialization
        initialize();
    }

})();
