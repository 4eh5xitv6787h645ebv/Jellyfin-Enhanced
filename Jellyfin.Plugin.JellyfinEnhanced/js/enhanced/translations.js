// /js/enhanced/translations.js
(function(JE) {
    'use strict';

    // Newer-than-bundled locales are fetched via the plugin's local CDN route
    // (JE.cdn source 'locales'), which server-side proxies + caches the upstream repo's
    // raw locale JSON. The client never contacts raw.githubusercontent.com directly.
    const remoteLocaleUrl = (code) => JE.cdn.url('locales', `${code}.json`);
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    function normalizeLangCode(code) {
        if (!code) return code;
        const parts = code.split('-');
        if (parts.length === 1) return parts[0].toLowerCase();
        if (parts.length === 2) return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
        return code;
    }

    function buildLanguageChain(primaryLang) {
        const normalizedLang = normalizeLangCode(primaryLang);
        const langCodes = [];

        if (normalizedLang) {
            langCodes.push(normalizedLang);
        }

        if (normalizedLang && normalizedLang.includes('-')) {
            const baseLang = normalizedLang.split('-')[0];
            if (!langCodes.includes(baseLang)) {
                langCodes.push(baseLang);
            }
        }

        if (langCodes[langCodes.length - 1] !== 'en') {
            langCodes.push('en');
        }

        return Array.from(new Set(langCodes.filter(Boolean)));
    }

    async function getPluginVersion() {
        let pluginVersion = JE?.pluginVersion;
        if (pluginVersion && pluginVersion !== 'unknown') return pluginVersion;

        try {
            const versionResponse = await fetch(ApiClient.getUrl('/JellyfinEnhanced/version'));
            if (versionResponse.ok) {
                pluginVersion = await versionResponse.text();
                if (JE) {
                    JE.pluginVersion = pluginVersion;
                }
                return pluginVersion;
            }
        } catch (e) {
            console.warn('🪼 Jellyfin Enhanced: Failed to fetch plugin version', e);
        }

        return 'unknown';
    }

    /**
     * Resolves the cache-busting suffix used for translation localStorage keys.
     *
     * Prefers the `version` attribute of the injected plugin script tag, which
     * carries the full script cache key (plugin version + DLL build timestamp)
     * baked in at server startup — the same value plugin.js's getScriptVersion()
     * uses. The bare plugin version alone does not change on a same-version
     * rebuild, which would leave stale translations cached indefinitely.
     * Falls back to the bare plugin version when the tag is unavailable.
     *
     * @returns {Promise<string>}
     */
    async function getTranslationCacheKey() {
        try {
            const scriptEl = document.querySelector('script[plugin="Jellyfin Enhanced"]');
            const tagVersion = scriptEl?.getAttribute('version');
            if (tagVersion) return tagVersion;
        } catch (e) {
            console.warn('🪼 Jellyfin Enhanced: Failed to read script cache key, falling back to plugin version', e);
        }
        return getPluginVersion();
    }

    /**
     * Drops every cached translation that does not belong to the current cache
     * key generation. Matching on the exact `_<cacheKey>` suffix (rather than a
     * substring) means entries from the older bare-version scheme
     * (JE_translation_de_1.2.3) are removed as well as stale cache-key
     * generations (JE_translation_de_1.2.3-638900000000000000).
     *
     * @param {string} cacheKey Current translation cache key generation.
     */
    function cleanOldTranslationCache(cacheKey) {
        try {
            const currentSuffix = `_${cacheKey}`;
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('JE_translation_') || key.startsWith('JE_translation_ts_'))) {
                    if (!key.endsWith(currentSuffix)) {
                        localStorage.removeItem(key);
                        console.log(`🪼 Jellyfin Enhanced: Removed old translation cache: ${key}`);
                    }
                }
            }
        } catch (e) {
            console.warn('🪼 Jellyfin Enhanced: Failed to clean up old translation caches', e);
        }
    }

    async function tryLoadSingleLanguage(code, generation) {
        const cacheKey = `JE_translation_${code}_${generation}`;
        const timestampKey = `JE_translation_ts_${code}_${generation}`;
        const cachedTranslations = localStorage.getItem(cacheKey);
        const cachedTimestamp = localStorage.getItem(timestampKey);

        if (cachedTranslations && cachedTimestamp) {
            const age = Date.now() - parseInt(cachedTimestamp, 10);
            if (age < CACHE_DURATION) {
                console.log(`🪼 Jellyfin Enhanced: Using cached translations for ${code} (age: ${Math.round(age / 1000 / 60)} minutes, cache key: ${generation})`);
                try {
                    return { translations: JSON.parse(cachedTranslations), usedLang: code };
                } catch (e) {
                    console.warn('🪼 Jellyfin Enhanced: Failed to parse cached translations, will fetch fresh', e);
                }
            }
        }

        console.log(`🪼 Jellyfin Enhanced: Loading bundled translations for ${code}...`);
        try {
            const bundledResponse = await fetch(ApiClient.getUrl(`/JellyfinEnhanced/locales/${code}.json`, { v: generation }));
            if (bundledResponse.ok) {
                const translations = await bundledResponse.json();
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(translations));
                    localStorage.setItem(timestampKey, Date.now().toString());
                    console.log(`🪼 Jellyfin Enhanced: Successfully loaded and cached bundled translations for ${code} (cache key: ${generation})`);
                } catch (e) { /* ignore */ }
                return { translations, usedLang: code };
            }
        } catch (bundledError) {
            console.warn('🪼 Jellyfin Enhanced: Bundled translations failed, falling back to GitHub:', bundledError.message);
        }

        try {
            console.log(`🪼 Jellyfin Enhanced: Fetching translations for ${code} from GitHub...`);
            const githubResponse = await fetch(remoteLocaleUrl(code), {
                method: 'GET',
                cache: 'no-cache',
                headers: { 'Accept': 'application/json' }
            });

            if (githubResponse.ok) {
                const translations = await githubResponse.json();
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(translations));
                    localStorage.setItem(timestampKey, Date.now().toString());
                    console.log(`🪼 Jellyfin Enhanced: Successfully fetched and cached translations for ${code} from GitHub (cache key: ${generation})`);
                } catch (storageError) {
                    console.warn('🪼 Jellyfin Enhanced: Failed to cache translations (localStorage full?)', storageError);
                }
                return { translations, usedLang: code };
            }

            if (githubResponse.status === 404 && code !== 'en') {
                console.warn(`🪼 Jellyfin Enhanced: Language ${code} not found on GitHub, falling back to English`);
                const englishResponse = await fetch(remoteLocaleUrl('en'), {
                    method: 'GET',
                    cache: 'no-cache',
                    headers: { 'Accept': 'application/json' }
                });

                if (englishResponse.ok) {
                    const translations = await englishResponse.json();
                    try {
                        const enCacheKey = `JE_translation_en_${generation}`;
                        const enTimestampKey = `JE_translation_ts_en_${generation}`;
                        localStorage.setItem(enCacheKey, JSON.stringify(translations));
                        localStorage.setItem(enTimestampKey, Date.now().toString());
                    } catch (e) { /* ignore */ }
                    return { translations, usedLang: 'en' };
                }
            }

            if (githubResponse.status === 403) {
                console.warn('🪼 Jellyfin Enhanced: GitHub rate limit detected, using bundled fallback');
            } else if (githubResponse.status >= 500) {
                console.warn(`🪼 Jellyfin Enhanced: GitHub server error (${githubResponse.status}), using bundled fallback`);
            }

            throw new Error(`GitHub fetch failed with status ${githubResponse.status}`);
        } catch (githubError) {
            console.warn('🪼 Jellyfin Enhanced: GitHub fetch failed, falling back to bundled translations:', githubError.message);
        }

        console.log(`🪼 Jellyfin Enhanced: Loading bundled translations for ${code}...`);
        let response = await fetch(ApiClient.getUrl(`/JellyfinEnhanced/locales/${code}.json`, { v: generation }));

        if (response.ok) {
            const translations = await response.json();
            try {
                localStorage.setItem(cacheKey, JSON.stringify(translations));
                localStorage.setItem(timestampKey, Date.now().toString());
            } catch (e) { /* ignore */ }
            return { translations, usedLang: code };
        }

        console.warn(`🪼 Jellyfin Enhanced: Bundled ${code} not found, falling back to bundled English`);
        response = await fetch(ApiClient.getUrl('/JellyfinEnhanced/locales/en.json', { v: generation }));
        if (response.ok) {
            return { translations: await response.json(), usedLang: 'en' };
        }

        throw new Error('Failed to load English fallback translations');
    }

    JE.loadTranslations = async function() {
        try {
            const cacheGeneration = await getTranslationCacheKey();

            let user = ApiClient.getCurrentUser ? ApiClient.getCurrentUser() : null;
            if (user instanceof Promise) {
                user = await user;
            }

            const userId = user?.Id;
            let lang = 'en';
            if (userId) {
                const storageKey = `${userId}-language`;
                const storedLang = localStorage.getItem(storageKey);
                if (storedLang) {
                    lang = normalizeLangCode(storedLang);
                } else {
                    // Fall back to the HTML lang attribute set by Jellyfin's web client.
                    // This covers the Android app and other clients where the localStorage
                    // key may not exist but Jellyfin has already resolved the user's
                    // preferred language from server-side settings.
                    const docLang = document.documentElement.lang;
                    if (docLang) {
                        lang = normalizeLangCode(docLang);
                    }
                }
            }

            cleanOldTranslationCache(cacheGeneration);

            const langCodes = buildLanguageChain(lang);
            for (const code of langCodes) {
                try {
                    const result = await tryLoadSingleLanguage(code, cacheGeneration);
                    if (result && result.translations) {
                        return result.translations;
                    }
                } catch (e) {
                    console.warn(`🪼 Jellyfin Enhanced: Failed to load translations for ${code}`, e);
                }
            }

            console.error('🪼 Jellyfin Enhanced: Failed to load translations from any source');
            return {};
        } catch (error) {
            console.error('🪼 Jellyfin Enhanced: Failed to load translations:', error);
            return {};
        }
    };
})(window.JellyfinEnhanced);
