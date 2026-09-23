// /js/arr/arr-links.js
(function (JE) {
    'use strict';

    JE.initializeArrLinksScript = async function () {
        const logPrefix = '🪼 Jellyfin Enhanced: Arr Links:';

        if (!JE?.pluginConfig?.ArrLinksEnabled) {
            console.log(`${logPrefix} Integration disabled in plugin settings.`);
            return;
        }

        // Identity epoch this initialization belongs to, for the async work
        // further below (arr instance lookups, observer setup): if the user
        // switches mid-flight, that stale invocation must stop.
        const initEpoch = JE.session ? JE.session.getEpoch() : 0;
        const initIsCurrent = () => !JE.session || JE.session.isCurrent(initEpoch);

        // Shared admin check (js/enhanced/helpers.js), same source every
        // admin-gated module in the plugin reads.
        const isAdmin = JE.helpers.isAdmin();
        console.log(`${logPrefix} Admin status: ${isAdmin}`);

        if (!isAdmin) {
            console.log(`${logPrefix} User is not an administrator. Links will not be shown.`);
            return;
        }

        console.log(`${logPrefix} Initializing...`);

        // Surface stored-config corruption to the admin on first init rather than waiting for
        // an action endpoint. The backend ships boolean flags in /private-config so the frontend
        // can toast without round-tripping an action call.
        if (JE?.pluginConfig?.SonarrInstancesCorrupt && typeof JE.toast === 'function') {
            JE.toast('⚠ Sonarr instance configuration is corrupt. Open the Jellyfin Enhanced config page to reset it.');
            console.error(`${logPrefix} SonarrInstances stored JSON is corrupt.`);
        }
        if (JE?.pluginConfig?.RadarrInstancesCorrupt && typeof JE.toast === 'function') {
            JE.toast('⚠ Radarr instance configuration is corrupt. Open the Jellyfin Enhanced config page to reset it.');
            console.error(`${logPrefix} RadarrInstances stored JSON is corrupt.`);
        }

        let isAddingLinks = false; // Lock to prevent concurrent runs
        let debounceTimer = null;
        let observer = null;
        try {
            const { sonarrInstances, radarrInstances, bazarrUrl, getSonarrSlugs, getRadarrInstances } =
                JE.arrLinks.createData(logPrefix);
            const { createLinkButton, createDropdown, formatBytes, getStatus } = JE.arrLinks.createView();

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

                // Capture the hash and item id at entry. Three awaits (getItemCached +
                // getSonarrSlugs + getRadarrInstances) can span several seconds on a slow
                // connection, during which the user may navigate away. After each await we
                // re-check that (a) the anchor is still in the DOM, (b) the same detail page
                // is still visible, (c) the hash still points at the same item, and bail out
                // if any of those changed (H6). This stops us from appending links to a page
                // the user already left or to a different item.
                const hashAtStart = window.location.hash;
                const isStillValidTarget = () =>
                    document.contains(anchorElement)
                    && !anchorElement.closest('#itemDetailPage.hide')
                    && window.location.hash === hashAtStart;

                isAddingLinks = true;
                try {
                    const itemId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
                    if (!itemId) return;

                    const item = JE.helpers?.getItemCached
                        ? await JE.helpers.getItemCached(itemId)
                        : await ApiClient.getItem(ApiClient.getCurrentUserId(), itemId);

                    if (!isStillValidTarget()) return;

                    // Only process movies and TV shows
                    if (item?.Type !== 'Movie' && item?.Type !== 'Series') return;

                    const ids = getExternalIds(visiblePage);

                    // Only add ARR links if we find a themoviedb link
                    if (!ids.hasTmdbLink) {
                        return;
                    }

                    // When only one instance matches, collapsing the episode count + status
                    // border to a plain link keeps the detail page tidy. Multi-instance dropdowns
                    // always show status because distinguishing between instances is their whole
                    // purpose. Admin can opt in to always-show via ArrLinksShowStatusSingle.
                    const showStatusOnSingle = JE?.pluginConfig?.ArrLinksShowStatusSingle === true;

                    if (item.Type === 'Series' && item.Name && sonarrInstances.length > 0) {
                        const slugMatches = await getSonarrSlugs(item);
                        if (!isStillValidTarget()) return;
                        const validMatches = slugMatches.filter(m => m.instanceUrl);
                        if (validMatches.length === 1) {
                            const m = validMatches[0];
                            const url = `${m.instanceUrl.replace(/\/$/, '')}/series/${m.titleSlug}`;
                            const haveStats = m.episodeFileCount >= 0;
                            const status = showStatusOnSingle && haveStats ? getStatus(m.episodeFileCount, m.episodeCount) : null;
                            const badge = showStatusOnSingle && haveStats ? `${m.episodeFileCount}/${m.episodeCount}` : '';
                            const size = formatBytes(m.sizeOnDisk);
                            // Tooltip still surfaces the detail — hiding the badge doesn't mean
                            // hiding information, just decluttering the pill itself.
                            const tipParts = [m.instanceName];
                            if (haveStats) tipParts.push(`${m.episodeFileCount}/${m.episodeCount} episodes`);
                            if (size) tipParts.push(size);
                            if (m.rootFolderPath) tipParts.push(m.rootFolderPath);
                            const tip = tipParts.join('\n');
                            anchorElement.appendChild(document.createTextNode(' '));
                            anchorElement.appendChild(createLinkButton('Sonarr', url, 'arr-link-sonarr', status, badge, tip));
                        } else if (validMatches.length > 1) {
                            const items = validMatches.map(m => {
                                const status = m.episodeFileCount < 0 ? null : getStatus(m.episodeFileCount, m.episodeCount);
                                const badge = m.episodeFileCount < 0 ? '' : `${m.episodeFileCount}/${m.episodeCount}`;
                                const size = formatBytes(m.sizeOnDisk);
                                const tip = [badge ? `${badge} episodes` : null, size, m.rootFolderPath].filter(Boolean).join(' \u2022 ');
                                return {
                                    name: m.instanceName,
                                    url: `${m.instanceUrl.replace(/\/$/, '')}/series/${m.titleSlug}`,
                                    status, badge, size, tip
                                };
                            });
                            anchorElement.appendChild(document.createTextNode(' '));
                            anchorElement.appendChild(createDropdown('Sonarr', 'arr-link-sonarr', items));
                        }
                    }

                    if (item.Type === 'Movie' && ids.tmdb && radarrInstances.length > 0) {
                        const matchingRadarrs = await getRadarrInstances(ids.tmdb);
                        if (!isStillValidTarget()) return;
                        const validMatches = matchingRadarrs.filter(m => m.url);
                        if (validMatches.length === 1) {
                            const m = validMatches[0];
                            const url = `${m.url.replace(/\/$/, '')}/movie/${ids.tmdb}`;
                            const statusValue = m.hasFile ? 'complete' : 'missing';
                            const badgeValue = m.hasFile ? 'Downloaded' : 'Missing';
                            const status = showStatusOnSingle ? statusValue : null;
                            const badge = showStatusOnSingle ? badgeValue : '';
                            const size = formatBytes(m.sizeOnDisk);
                            // Tooltip keeps the "Downloaded/Missing" detail regardless, so info
                            // isn't lost when the visible badge is suppressed.
                            const tip = [m.name, badgeValue, size, m.rootFolderPath].filter(Boolean).join('\n');
                            anchorElement.appendChild(document.createTextNode(' '));
                            anchorElement.appendChild(createLinkButton('Radarr', url, 'arr-link-radarr', status, badge, tip));
                        } else if (validMatches.length > 1) {
                            const items = validMatches.map(m => {
                                const status = m.hasFile ? 'complete' : 'missing';
                                const badge = m.hasFile ? 'Downloaded' : 'Missing';
                                const size = formatBytes(m.sizeOnDisk);
                                const tip = [badge, size, m.rootFolderPath].filter(Boolean).join(' \u2022 ');
                                return {
                                    name: m.name,
                                    url: `${m.url.replace(/\/$/, '')}/movie/${ids.tmdb}`,
                                    status, badge, size, tip
                                };
                            });
                            anchorElement.appendChild(document.createTextNode(' '));
                            anchorElement.appendChild(createDropdown('Radarr', 'arr-link-radarr', items));
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

            // A stale invocation must never register the shared 'arr-links'
            // observer: it would later self-disconnect and take the CURRENT
            // user's subscription down with it (shared subscriber name).
            if (!initIsCurrent()) return;

            // The admin check above was resolved for THIS user (initEpoch) —
            // after a user switch the observer must retire itself instead of
            // injecting admin-only links (with stale slugCache data) for the
            // next user.
            observer = JE.helpers.createObserver('arr-links', () => {
                if (JE.session && !JE.session.isCurrent(initEpoch)) {
                    if (observer) {
                        observer.disconnect();
                        console.log(`${logPrefix} Observer disconnected — user changed`);
                    }
                    return;
                }
                if (!JE?.pluginConfig?.ArrLinksEnabled) {
                    if (observer) {
                        observer.disconnect();
                        console.log(`${logPrefix} Observer disconnected — feature disabled`);
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
            }, document.body, {
                // childList + subtree is enough — Jellyfin re-renders the detail page children
                // on SPA navigation. The shared body observer's fast-path drops attribute-only
                // batches (see CLAUDE.md "Observer Multiplexer" notes), so attributeFilter
                // would be inert here.
                childList: true,
                subtree: true,
            });

            // Store observer reference for potential cleanup
            JE._arrLinksObserver = observer;

            console.log(`${logPrefix} Initialized successfully`);
        } catch (err) {
            console.error(`${logPrefix} Failed to initialize`, err);
        }
    };

    // Re-run the whole initialization for the incoming user after a switch:
    // the admin gate, the observer and the slug caches all live in the init
    // closure, so a fresh call rebuilds them for the new user (the previous
    // observer retires itself via the epoch guard above). Runs off
    // je:user-data-loaded so JE.currentSettings is already the new user's
    // when the admin check reads it.
    document.addEventListener('je:user-data-loaded', () => {
        if (!JE?.pluginConfig?.ArrLinksEnabled) return;
        try { JE._arrLinksObserver?.disconnect(); } catch (_) { /* already gone */ }
        JE.initializeArrLinksScript();
    });
})(window.JellyfinEnhanced);
