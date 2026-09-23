// Private bootstrap source; regenerate artifacts/generated/plugin.js with npm run generate.
function createScriptLoader(JE) {
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
     * Loads an array of scripts dynamically.
     * @param {string[]} scripts - Array of script filenames.
     * @param {string} basePath - The base URL path for the scripts.
     * @returns {Promise<void>} - A promise that resolves when all scripts attempt to load.
     */
    function loadScripts(scripts, basePath) {
        const promises = scripts.map(scriptName => {
            return new Promise((resolve) => { // Always resolve so one failure doesn't stop others
                const script = document.createElement('script');
                // Dynamically-inserted scripts are async by default (execute in
                // arrival order). async=false keeps parallel download but forces
                // execution in array order, so js/core/* is guaranteed to run
                // before every module that depends on it.
                script.async = false;
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
    return { getScriptVersion, loadTranslationsModule, loadScripts };
}
