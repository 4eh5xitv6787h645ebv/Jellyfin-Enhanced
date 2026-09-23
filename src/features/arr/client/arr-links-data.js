// Arr link configuration, URL mapping and per-session backend lookups.
(function (JE) {
    'use strict';

    JE.arrLinks = JE.arrLinks || {};

    // Parse URL mappings from config
    function parseUrlMappings(mappingsString) {
        const mappings = [];
        if (!mappingsString) return mappings;

        mappingsString.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            const parts = trimmed.split('|').map(p => p.trim());
            if (parts.length === 2 && parts[0] && parts[1]) {
                mappings.push({
                    jellyfinUrl: parts[0],
                    arrUrl: parts[1]
                });
            }
        });

        return mappings;
    }

    // Get the appropriate *arr URL based on how Jellyfin is being accessed
    function getMappedUrl(urlMappings, defaultUrl) {
        if (!defaultUrl) {
            return null;
        }

        if (!urlMappings || urlMappings.length === 0) {
            return defaultUrl;
        }

        const serverAddress = (typeof ApiClient !== 'undefined' && ApiClient.serverAddress)
            ? ApiClient.serverAddress()
            : window.location.origin;

        const currentUrl = serverAddress.replace(/\/+$/, '').toLowerCase();

        // Check if current Jellyfin URL matches any mapping
        for (const mapping of urlMappings) {
            const normalizedJellyfinUrl = mapping.jellyfinUrl.replace(/\/+$/, '').toLowerCase();

            if (currentUrl === normalizedJellyfinUrl) {
                return mapping.arrUrl.replace(/\/$/, '');
            }
        }

        // No mapping matched, return default URL
        return defaultUrl;
    }

    // Construct a fresh data owner at each user initialization; caches and error
    // deduplication must never survive an identity change.
    JE.arrLinks.createData = function (logPrefix) {
        // Cache Sonarr titleSlugs + Radarr instance matches by ID. Per-session only;
        // admin must hard-reload the web client after changing instance config for
        // this cache to drop (same constraint every other JE module has today).
        const slugCache = new Map();

        // Multi-instance support: read instance arrays from private-config, drop disabled
        // entries so the dropdown never offers a link to an instance the admin has toggled
        // off. Backend fan-out already skips disabled instances, so no match would appear
        // for them anyway — but this keeps the dropdown tidy when only disabled instances
        // would otherwise show for a given item. Falls back to legacy single fields below.
        const sonarrInstances = (JE.pluginConfig.SonarrInstances || [])
            .filter(i => i && i.Enabled !== false)
            .map(i => ({
                name: i.Name || 'Sonarr',
                url: getMappedUrl(parseUrlMappings(i.UrlMappings || ''), i.Url),
                rawUrl: i.Url,
                urlMappings: i.UrlMappings || ''
            })).filter(i => i.url);

        const radarrInstances = (JE.pluginConfig.RadarrInstances || [])
            .filter(i => i && i.Enabled !== false)
            .map(i => ({
                name: i.Name || 'Radarr',
                url: getMappedUrl(parseUrlMappings(i.UrlMappings || ''), i.Url),
                rawUrl: i.Url,
                urlMappings: i.UrlMappings || ''
            })).filter(i => i.url);

        // Fall back to legacy single-instance config if no instances available
        if (sonarrInstances.length === 0 && JE.pluginConfig.SonarrUrl) {
            const legacyMappings = parseUrlMappings(JE.pluginConfig.SonarrUrlMappings || '');
            const legacyUrl = getMappedUrl(legacyMappings, JE.pluginConfig.SonarrUrl);
            if (legacyUrl) {
                sonarrInstances.push({ name: 'Sonarr', url: legacyUrl, rawUrl: JE.pluginConfig.SonarrUrl, urlMappings: '' });
            }
        }
        if (radarrInstances.length === 0 && JE.pluginConfig.RadarrUrl) {
            const legacyMappings = parseUrlMappings(JE.pluginConfig.RadarrUrlMappings || '');
            const legacyUrl = getMappedUrl(legacyMappings, JE.pluginConfig.RadarrUrl);
            if (legacyUrl) {
                radarrInstances.push({ name: 'Radarr', url: legacyUrl, rawUrl: JE.pluginConfig.RadarrUrl, urlMappings: '' });
            }
        }

        const bazarrMappings = parseUrlMappings(JE.pluginConfig.BazarrUrlMappings || '');
        const bazarrUrl = getMappedUrl(bazarrMappings, JE.pluginConfig.BazarrUrl);

        // Track whether we've already toasted about a backend fetch failure in this session —
        // otherwise every card render on the item page would re-toast. Also track already-toasted
        // per-instance errors so a misconfigured instance doesn't flood the user with toasts.
        const _toastedGlobalFailure = { sonarr: false, radarr: false };
        const _toastedInstanceErrors = new Set();

        // Alias the shared helper so the toast concatenations read short. JE.toast renders
        // via innerHTML, so any caller-controlled field (admin-set instance name, upstream
        // error reason) must pass through escape() to prevent stored XSS.
        // The inline fallback is a real escaper so XSS is blocked even if helpers.js
        // hasn't loaded yet (e.g. a load-order race on first init).
        const esc = (s) => {
            if (JE.helpers?.escHtml) return JE.helpers.escHtml(s);
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        };

        function surfaceInstanceErrors(kind, errors) {
            if (!Array.isArray(errors) || errors.length === 0) {
                // Empty-errors fetch means everything that was failing has recovered. Drop any
                // memo entries whose kind matches so the same error can re-toast if it returns.
                Array.from(_toastedInstanceErrors).forEach(function(k) {
                    if (k.startsWith(kind + '|')) _toastedInstanceErrors.delete(k);
                });
                return;
            }
            const seenThisTick = new Set();
            errors.forEach(function(err) {
                const key = kind + '|' + err.instanceName + '|' + err.reason;
                seenThisTick.add(key);
                if (_toastedInstanceErrors.has(key)) return;
                _toastedInstanceErrors.add(key);
                if (typeof JE.toast === 'function') {
                    JE.toast('⚠ ' + esc(kind) + ' instance "' + esc(err.instanceName || 'unknown') + '" failed: ' + esc(err.reason));
                }
                console.warn(`${logPrefix} ${kind} instance "${err.instanceName}" error: ${err.reason}`);
            });
            // Self-heal: drop memo entries for errors that didn't reappear this tick.
            Array.from(_toastedInstanceErrors).forEach(function(k) {
                if (k.startsWith(kind + '|') && !seenThisTick.has(k)) _toastedInstanceErrors.delete(k);
            });
        }

        function surfaceGlobalFailure(kind, detail) {
            if (_toastedGlobalFailure[kind.toLowerCase()]) return;
            _toastedGlobalFailure[kind.toLowerCase()] = true;
            if (typeof JE.toast === 'function') {
                JE.toast('⚠ ' + esc(kind) + ' lookup failed; links unavailable. See console for details.');
            }
            console.warn(`${logPrefix} ${kind} lookup backend failed:`, detail);
        }

        /**
         * Resolves the Sonarr URL slugs across all configured instances.
         * On backend failure, returns an empty array (no links) and surfaces a toast — never
         * fabricates per-instance entries with guessed slugs, which would produce dropdown links
         * pointing at instances that may not contain the series at all (H3).
         * @param {Object} item - Jellyfin item object with Name, OriginalTitle, and ProviderIds
         * @returns {Promise<Array>} Array of { instanceName, instanceUrl, titleSlug, ... } matches
         */
        async function getSonarrSlugs(item) {
            const tvdbId = String(item.ProviderIds?.Tvdb || '');
            const cacheKey = `slugs-${tvdbId}`;

            if (tvdbId && slugCache.has(cacheKey)) {
                return slugCache.get(cacheKey);
            }

            if (!tvdbId) {
                // Without a TVDB ID the multi-instance lookup would fail anyway — return empty
                // so we render no link instead of guessing which instance has the series.
                return [];
            }

            try {
                // Core throws Error('HTTP <status>') on non-OK responses, which the
                // catch below surfaces exactly like the old !resp.ok branch did.
                const data = await JE.core.api.plugin(`/arr/series-slugs?tvdbId=${encodeURIComponent(tvdbId)}`);
                // Reset the once-per-session toast guards on successful fetch so a transient
                // failure that has since cleared up isn't permanently silenced for real
                // future failures.
                _toastedGlobalFailure.sonarr = false;
                surfaceInstanceErrors('Sonarr', data.errors);
                const matches = Array.isArray(data.matches) ? data.matches : [];
                const results = matches.map(m => ({
                    instanceName: m.instanceName,
                    instanceUrl: getMappedUrl(parseUrlMappings(m.urlMappings || ''), m.instanceUrl),
                    titleSlug: m.titleSlug,
                    episodeFileCount: m.episodeFileCount || 0,
                    episodeCount: m.episodeCount || 0,
                    sizeOnDisk: m.sizeOnDisk || 0,
                    rootFolderPath: m.rootFolderPath || ''
                }));
                slugCache.set(cacheKey, results);
                return results;
            } catch (e) {
                surfaceGlobalFailure('Sonarr', e);
                return [];
            }
        }

        /**
         * Looks up which Radarr instances have a given movie by TMDB ID.
         * On backend failure, returns an empty array and surfaces a toast — never fabricates a
         * fake "all instances have it" result, which would render dropdown links pointing at
         * instances that don't actually contain the movie (H3).
         * @param {string} tmdbId - TMDB ID of the movie
         * @returns {Promise<Array>} Array of matching instances
         */
        async function getRadarrInstances(tmdbId) {
            if (!tmdbId) return [];

            const cacheKey = `radarr-${tmdbId}`;
            if (slugCache.has(cacheKey)) {
                return slugCache.get(cacheKey);
            }

            try {
                // Core throws Error('HTTP <status>') on non-OK responses — handled
                // by the catch below, same as the old !resp.ok branch.
                const data = await JE.core.api.plugin(`/arr/movie-instances?tmdbId=${encodeURIComponent(tmdbId)}`);
                _toastedGlobalFailure.radarr = false;  // reset on success; see Sonarr version above
                surfaceInstanceErrors('Radarr', data.errors);
                const matches = Array.isArray(data.matches) ? data.matches : [];
                const results = matches.map(m => ({
                    name: m.instanceName,
                    url: getMappedUrl(parseUrlMappings(m.urlMappings || ''), m.instanceUrl),
                    hasFile: m.hasFile || false,
                    sizeOnDisk: m.sizeOnDisk || 0,
                    rootFolderPath: m.rootFolderPath || ''
                }));
                slugCache.set(cacheKey, results);
                return results;
            } catch (e) {
                surfaceGlobalFailure('Radarr', e);
                return [];
            }
        }

        return { sonarrInstances, radarrInstances, bazarrUrl, getSonarrSlugs, getRadarrInstances };
    };
})(window.JellyfinEnhanced);
