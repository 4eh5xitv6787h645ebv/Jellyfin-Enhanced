// /js/arr/arr-links.js
(function (JE) {
    'use strict';

    JE.initializeArrLinksScript = async function () {
        const logPrefix = '🪼 Jellyfin Enhanced: Arr Links:';

        if (!JE?.pluginConfig?.ArrLinksEnabled) {
            console.log(`${logPrefix} Integration disabled in plugin settings.`);
            return;
        }

        // Check admin status on every script initialization
        let isAdmin = false;

        try {
            // Use the user object pre-fetched during plugin.js init (Stage 2) when available.
            // Falls back to a short direct fetch so the module isn't blocked for up to 10 s.
            let user = JE.currentUser || null;
            if (!user) {
                for (let i = 0; i < 5; i++) {  // shortened retry window (~2.5s)
                    try {
                        user = await ApiClient.getCurrentUser();
                        if (user) break;
                    } catch (e) {
                        // swallow error, retry
                    }
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            if (!user) {
                console.error(`${logPrefix} Could not get current user after retries.`);
                return;
            }

            isAdmin = user?.Policy?.IsAdministrator === true;

            // Update settings.json if the value changed
            if (JE?.currentSettings && JE.currentSettings.isAdmin !== isAdmin && typeof JE.saveUserSettings === 'function') {
                JE.currentSettings.isAdmin = isAdmin;
                await JE.saveUserSettings('settings.json', JE.currentSettings);
                console.log(`${logPrefix} Updated admin status in settings.json: ${isAdmin}`);
            } else if (JE?.currentSettings) {
                JE.currentSettings.isAdmin = isAdmin;
                console.log(`${logPrefix} Admin status: ${isAdmin}`);
            }
        } catch (err) {
            console.error(`${logPrefix} Error checking admin status:`, err);
            return;
        }

        if (!isAdmin) {
            console.log(`${logPrefix} User is not an administrator. Links will not be shown.`);
            return;
        }

        console.log(`${logPrefix} Initializing...`);

        let isAddingLinks = false; // Lock to prevent concurrent runs
        let debounceTimer = null;
        let observer = null;
        const slugCache = new Map(); // Cache Sonarr titleSlugs by TVDB ID

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

        try {
            const SONARR_ICON_URL = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/sonarr.svg';
            const RADARR_ICON_URL = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/radarr-light-hybrid-light.svg';
            const BAZARR_ICON_URL = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/bazarr.svg';

            // Multi-instance support: read instance arrays from private-config, fall back to legacy single fields
            const sonarrInstances = (JE.pluginConfig.SonarrInstances || []).map(i => ({
                name: i.Name || 'Sonarr',
                url: getMappedUrl(parseUrlMappings(i.UrlMappings || ''), i.Url),
                rawUrl: i.Url,
                urlMappings: i.UrlMappings || ''
            })).filter(i => i.url);

            const radarrInstances = (JE.pluginConfig.RadarrInstances || []).map(i => ({
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

            const hasMultipleSonarr = sonarrInstances.length > 1;
            const hasMultipleRadarr = radarrInstances.length > 1;

            const styleId = 'arr-links-styles';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    .arr-link-sonarr::before,
                    .arr-link-radarr::before,
                    .arr-link-bazarr::before {
                        content: "";
                        display: inline-block;
                        width: 25px;
                        height: 25px;
                        background-size: contain;
                        background-repeat: no-repeat;
                        vertical-align: middle;
                        margin-right: 5px;
                    }
                    .arr-link-sonarr::before { background-image: url(${SONARR_ICON_URL}); }
                    .arr-link-radarr::before { background-image: url(${RADARR_ICON_URL}); }
                    .arr-link-bazarr::before { background-image: url(${BAZARR_ICON_URL}); }
                `;
                document.head.appendChild(style);
            }

            function getExternalIds(context) {
                const ids = { tmdb: null, hasTmdbLink: false };
                const links = context.querySelectorAll('.itemExternalLinks a, .externalIdLinks a');
                links.forEach(link => {
                    const href = link.href;
                    if (href.includes('themoviedb.org/movie/')) {
                        ids.tmdb = href.match(/\/movie\/(\d+)/)?.[1];
                        ids.hasTmdbLink = true;
                    } else if (href.includes('themoviedb.org/tv/')) {
                        ids.tmdb = href.match(/\/tv\/(\d+)/)?.[1];
                        ids.hasTmdbLink = true;
                    }
                });
                return ids;
            }

            /**
             * Converts a title string into a URL-friendly slug.
             * Strips diacritics, replaces '&' with 'and', removes non-alphanumeric
             * characters, and trims leading/trailing hyphens.
             * @param {string|null} text - The title to slugify
             * @returns {string} URL-safe slug (e.g., "Modern Love" -> "modern-love")
             */
            function slugify(text) {
                if (!text) return '';
                return text
                    .toString()
                    .normalize('NFD')                   // Decompose accented characters
                    .replace(/[\u0300-\u036f]/g, '')   // Strip diacritical marks
                    .replace(/&/g, 'and')               // Replace ampersands
                    .toLowerCase()
                    .trim()
                    .replace(/\s+/g, '-')               // Whitespace to hyphens
                    .replace(/[^\w-]+/g, '')            // Remove non-word characters
                    .replace(/--+/g, '-')               // Collapse consecutive hyphens
                    .replace(/^-+|-+$/g, '');           // Trim leading/trailing hyphens
            }

            /**
             * Resolves the Sonarr URL slugs across all configured instances.
             * Returns an array of { instanceName, instanceUrl, titleSlug } matches.
             * Falls back to the legacy single-instance endpoint if the multi-instance
             * endpoint is unavailable.
             * @param {Object} item - Jellyfin item object with Name, OriginalTitle, and ProviderIds
             * @returns {Promise<Array>} Array of { instanceName, instanceUrl, titleSlug } matches
             */
            async function getSonarrSlugs(item) {
                const tvdbId = String(item.ProviderIds?.Tvdb || '');
                const cacheKey = `slugs-${tvdbId}`;

                if (tvdbId && slugCache.has(cacheKey)) {
                    return slugCache.get(cacheKey);
                }

                if (tvdbId) {
                    try {
                        // Try multi-instance endpoint first
                        const resp = await fetch(ApiClient.getUrl(`/JellyfinEnhanced/arr/series-slugs?tvdbId=${encodeURIComponent(tvdbId)}`), {
                            headers: { 'X-MediaBrowser-Token': ApiClient.accessToken() }
                        });
                        if (resp.ok) {
                            const data = await resp.json();
                            if (data.matches && data.matches.length > 0) {
                                // Resolve mapped URLs for each match
                                const results = data.matches.map(m => ({
                                    instanceName: m.instanceName,
                                    instanceUrl: getMappedUrl(parseUrlMappings(m.urlMappings || ''), m.instanceUrl),
                                    titleSlug: m.titleSlug
                                }));
                                slugCache.set(cacheKey, results);
                                return results;
                            }
                        }
                    } catch (e) {
                        console.warn(`${logPrefix} Failed to fetch series slugs from multi-instance endpoint`, e);
                    }
                }

                // Fallback: use configured instances with generated slug
                const fallbackSlug = slugify(item.OriginalTitle || item.Name);
                const results = sonarrInstances.map(inst => ({
                    instanceName: inst.name,
                    instanceUrl: inst.url,
                    titleSlug: fallbackSlug
                }));
                if (tvdbId) slugCache.set(cacheKey, results);
                return results;
            }

            /**
             * Looks up which Radarr instances have a given movie by TMDB ID.
             * Returns an array of { instanceName, instanceUrl } for instances that have it.
             * Falls back to all configured instances if the lookup endpoint fails.
             * @param {string} tmdbId - TMDB ID of the movie
             * @returns {Promise<Array>} Array of matching instances
             */
            async function getRadarrInstances(tmdbId) {
                const cacheKey = `radarr-${tmdbId}`;
                if (slugCache.has(cacheKey)) {
                    return slugCache.get(cacheKey);
                }

                if (tmdbId) {
                    try {
                        const resp = await fetch(ApiClient.getUrl(`/JellyfinEnhanced/arr/movie-instances?tmdbId=${encodeURIComponent(tmdbId)}`), {
                            headers: { 'X-MediaBrowser-Token': ApiClient.accessToken() }
                        });
                        if (resp.ok) {
                            const data = await resp.json();
                            if (data.matches) {
                                const results = data.matches.map(m => ({
                                    name: m.instanceName,
                                    url: getMappedUrl(parseUrlMappings(m.urlMappings || ''), m.instanceUrl)
                                }));
                                slugCache.set(cacheKey, results);
                                return results;
                            }
                        }
                    } catch (e) {
                        console.warn(`${logPrefix} Failed to fetch Radarr movie instances`, e);
                    }
                }

                // Fallback: return all Radarr instances
                const results = radarrInstances.map(i => ({ name: i.name, url: i.url }));
                if (tmdbId) slugCache.set(cacheKey, results);
                return results;
            }

            async function addArrLinks() {
                if (isAddingLinks) {
                    return;
                }

                const visiblePage = document.querySelector('#itemDetailPage:not(.hide)');
                if (!visiblePage) return;

                const anchorElement = visiblePage.querySelector('.itemExternalLinks');

                // Cleanup stale links from any non-visible pages to prevent future conflicts
                document.querySelectorAll('#itemDetailPage.hide .arr-link').forEach(staleLink => {
                    if (staleLink.previousSibling && staleLink.previousSibling.nodeType === Node.TEXT_NODE) {
                       staleLink.previousSibling.remove();
                    }
                    staleLink.remove();
                });

                if (!anchorElement || anchorElement.querySelector('.arr-link')) {
                    return;
                }

                isAddingLinks = true;
                try {
                    const itemId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
                    if (!itemId) return;

                    const item = JE.helpers?.getItemCached
                        ? await JE.helpers.getItemCached(itemId)
                        : await ApiClient.getItem(ApiClient.getCurrentUserId(), itemId);

                    // Only process movies and TV shows
                    if (item?.Type !== 'Movie' && item?.Type !== 'Series') return;

                    const ids = getExternalIds(visiblePage);

                    // Only add ARR links if we find a themoviedb link
                    if (!ids.hasTmdbLink) {
                        return;
                    }

                    if (item.Type === 'Series' && item.Name && sonarrInstances.length > 0) {
                        const slugMatches = await getSonarrSlugs(item);
                        for (const match of slugMatches) {
                            if (match.instanceUrl) {
                                const url = `${match.instanceUrl.replace(/\/$/, '')}/series/${match.titleSlug}`;
                                const label = hasMultipleSonarr ? match.instanceName : 'Sonarr';
                                anchorElement.appendChild(document.createTextNode(' '));
                                anchorElement.appendChild(createLinkButton(label, url, "arr-link-sonarr"));
                            }
                        }
                    }

                    if (item.Type === 'Movie' && ids.tmdb && radarrInstances.length > 0) {
                        const matchingRadarrs = await getRadarrInstances(ids.tmdb);
                        for (const inst of matchingRadarrs) {
                            if (inst.url) {
                                const url = `${inst.url.replace(/\/$/, '')}/movie/${ids.tmdb}`;
                                const label = hasMultipleRadarr ? inst.name : 'Radarr';
                                anchorElement.appendChild(document.createTextNode(' '));
                                anchorElement.appendChild(createLinkButton(label, url, "arr-link-radarr"));
                            }
                        }
                    }

                    if (item.Type === 'Series' && bazarrUrl) {
                        const url = `${bazarrUrl}/series/`;
                        anchorElement.appendChild(document.createTextNode(' '));
                        anchorElement.appendChild(createLinkButton("Bazarr", url, "arr-link-bazarr"));
                    } else if (item.Type === 'Movie' && bazarrUrl) {
                        const url = `${bazarrUrl}/movies/`;
                        anchorElement.appendChild(document.createTextNode(' '));
                        anchorElement.appendChild(createLinkButton("Bazarr", url, "arr-link-bazarr"));
                    }
                } finally {
                    isAddingLinks = false;
                }
            }

            function createLinkButton(text, url, iconClass) {
                const button = document.createElement('a');
                button.setAttribute('is', 'emby-linkbutton');
                if (JE.pluginConfig.ShowArrLinksAsText) {
                    button.textContent = text;
                    button.className = 'button-link emby-button arr-link';
                } else {
                    button.className = `button-link emby-button arr-link ${iconClass}`;
                }
                button.href = url;
                button.target = '_blank';
                button.rel = 'noopener noreferrer';
                button.title = text;
                return button;
            }

            observer = new MutationObserver(() => {
                if (!JE?.pluginConfig?.ArrLinksEnabled) {
                    // Feature disabled - disconnect observer
                    if (observer) {
                        observer.disconnect();
                        console.log(`${logPrefix} Observer disconnected - feature disabled`);
                    }
                    return;
                }

                // Debounce to avoid excessive processing on rapid DOM changes
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }

                debounceTimer = setTimeout(() => {
                    addArrLinks();
                }, 100); // Wait 100ms after last mutation before processing
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });

            // Store observer reference for potential cleanup
            JE._arrLinksObserver = observer;

            // Listen for configuration changes
            window.addEventListener('JE:configUpdated', () => {
                const isEnabled = JE?.pluginConfig?.ArrLinksEnabled;

                if (!isEnabled) {
                    // Disable: disconnect observer
                    if (observer) {
                        observer.disconnect();
                        console.log(`${logPrefix} Observer disconnected - feature disabled via config update`);
                    }
                }
            });

            console.log(`${logPrefix} Initialized successfully`);
        } catch (err) {
            console.error(`${logPrefix} Failed to initialize`, err);
        }
    };
})(window.JellyfinEnhanced);
