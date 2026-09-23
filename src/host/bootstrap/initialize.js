// Private bootstrap source; regenerate artifacts/generated/plugin.js with npm run generate.
function createBootstrap(JE, loader, configuration, prelogin, allComponentScripts) {
    const { loadTranslationsModule, loadScripts } = loader;
    const { loadPluginData, loadTranslations, loadPrivateConfig, clearPrivateConfig,
        fetchUserScopedConfig, seedDisplayLanguage, registerSessionIntegration } = configuration;
    const { injectMetadataIcons } = prelogin;
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

        // Normal retry logic (no mismatch)
        if (typeof ApiClient === 'undefined' || !ApiClient.getCurrentUserId?.()) {
            setTimeout(initialize, 300);
            return;
        }

        // Reset mismatch counter on success
        mismatchRetryCount = 0;

        try {
            // Stage 1: Load base configs and translations
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

            // Check if server has triggered a translation cache clear
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
                // Reload translations with fresh data
                JE.translations = await loadTranslations() || {};
                JE.t = window.JellyfinEnhanced.t;
            }

            // Inject metadata icons CSS if enabled
            try {
                injectMetadataIcons(!!JE.pluginConfig?.MetadataIconsEnabled);
            } catch (e) {
                console.warn('🪼 Jellyfin Enhanced: Failed to inject Metadata icons CSS', e);
            }

            // Stage 2: Fetch user-specific settings
            let userId = ApiClient.getCurrentUserId();

            JE.userConfig = await fetchUserScopedConfig(userId);

            // Initialize splash screen
            if (typeof JE.initializeSplashScreen === 'function') {
                JE.initializeSplashScreen();
            }

            // Stage 3: Load ALL component scripts
            const basePath = '/JellyfinEnhanced/js';
            await loadScripts(allComponentScripts, basePath);
            console.log('🪼 Jellyfin Enhanced: All component scripts loaded.');

            // Wire user-switch detection → global reset → re-bootstrap.
            // Must happen after loadScripts so JE.session exists.
            registerSessionIntegration();

            // A user switch during the stage-1/2 fetches happens BEFORE the
            // session module exists, so it was adopted silently with no reset
            // — EVERYTHING fetched above belongs to the previous user.
            // Re-fetch it all for whoever is actually signed in now (mirrors
            // the je:user-changed re-bootstrap in registerSessionIntegration).
            const liveUserId = ApiClient.getCurrentUserId();
            if (liveUserId && liveUserId !== userId) {
                console.warn('🪼 Jellyfin Enhanced: User changed during boot — reloading user-scoped data.');
                userId = liveUserId;
                // Session exists now — epoch-guard this recovery too, so yet
                // another switch during these fetches can't restore this
                // user's data over the next user's reset.
                const recoveryEpoch = JE.session ? JE.session.getEpoch() : 0;
                const recoveryCurrent = () => !JE.session || JE.session.isCurrent(recoveryEpoch);
                const recoveredConfig = await fetchUserScopedConfig(liveUserId);
                if (recoveryCurrent()) {
                    JE.userConfig = recoveredConfig;
                    // Same for the admin-only private config fetched in stage 1.
                    clearPrivateConfig();
                    await loadPrivateConfig(); // internally epoch-guarded
                }
                // If ANOTHER switch happened during this recovery, the
                // je:user-changed re-bootstrap owns the repair — this stale
                // recovery must not touch the globals further.
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

            seedDisplayLanguage(userId);

            // Stage 5: Initialize theme system first
            if (typeof JE.themer?.init === 'function') {
                JE.themer.init();
                console.log('🪼 Jellyfin Enhanced: Theme system initialized.');
            }

            // Register unified cache save on page unload
            window.addEventListener('beforeunload', () => {
                JE._cacheManager.forceSave();
            });

            initializeFeatures(JE);

            console.log('🪼 Jellyfin Enhanced: All components initialized successfully.');

            // Programmatic boot-complete marker: every component script has executed
            // and every enabled initializeX() has run. Automation (E2E) waits on this
            // instead of racing individual JE.* properties that appear mid-boot.
            JE.initialized = true;

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
    return { initialize };
}
