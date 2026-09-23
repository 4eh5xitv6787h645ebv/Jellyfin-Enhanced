// @ts-check
// /js/jellyseerr/discovery/discovery-base.js
//
// Shared state machine for the Seerr discovery sections (genre, tag,
// network, person, collection). Owns the chassis every module used to
// re-declare — processed-page dedup, re-entry guard, AbortController swap,
// metrics, error handling and lifecycle/navigation wiring. Pagination lives
// in discovery-dual-feed.js and discovery-client-pager.js; page anchoring and
// shared markup live in discovery-page-host.js. Supported modes:
//
//   mode 'dual-feed'    server-paginated TV + Movie feeds fetched page by
//                       page with interleaving, filter/sort controls and
//                       infinite scroll (genre / tag / network)
//   mode 'client-paged' one fetched result list chunk-rendered client-side
//                       with filter/sort and infinite scroll (person)
//   mode 'one-shot'     single render, no pagination (collection)
//
// This module is deliberately jellyseerr-scoped (not js/core/): everything
// it orchestrates — JE.discoveryFilter, JE.seamlessScroll, JE.jellyseerrAPI,
// JE.jellyseerrUI cards, JE.requestManager metrics — is Seerr plumbing and
// nothing outside js/jellyseerr consumes it.
//
// Public surface: JE.discoveryBase { createDiscovery, idFromDetailUrl, idFromListParam }.
(function(JE) {
    'use strict';

    /**
     * Extracts the item id from a detail-page URL (#!/details?id=...).
     * @returns {string|null}
     */
    function idFromDetailUrl() {
        const hash = window.location.hash;
        if (!hash.includes('/details') || !hash.includes('id=')) {
            return null;
        }
        try {
            const params = new URLSearchParams(hash.split('?')[1]);
            return params.get('id');
        } catch (error) {
            return null;
        }
    }

    /**
     * Builds a parser that extracts a query param from a list-page URL
     * (#!/list?<param>=...).
     * @param {string} param - e.g. 'genreId', 'studioId'
     * @returns {() => string|null}
     */
    function idFromListParam(param) {
        return function() {
            const hash = window.location.hash;
            if (!hash.includes('/list') || !hash.includes(param + '=')) {
                return null;
            }
            try {
                const params = new URLSearchParams(hash.split('?')[1]);
                return params.get(param);
            } catch (error) {
                return null;
            }
        };
    }

    /**
     * @typedef {object} DiscoverySpec
     * @property {string} key - Module key ('genre', 'tag', 'network', 'person',
     *   'collection'). Drives the section CSS class, request-cache prefix,
     *   metrics key, filter/sort state key and lifecycle feature name.
     * @property {'dual-feed'|'client-paged'|'one-shot'} mode
     * @property {string} logLabel - Human label for log prefixes, e.g. 'Genre Discovery'.
     * @property {string} configKey - JE.pluginConfig gate key.
     * @property {boolean} [defaultEnabled=true] - true: render unless the config
     *   key is explicitly false. false: render only when the key is truthy.
     * @property {() => string|null} getIdFromUrl - URL/hash contract: returns the
     *   page's id (or name) when the module applies to the current page.
     * @property {(id: string) => string} [pageKey] - Override the processed-page
     *   key. Default: `${key}-${id}-${location.hash}`.
     * @property {(ctx: {id: string, signal: AbortSignal}) => Promise<{tvId?: (number|null), movieId?: (number|null), title: string}|null>} [resolveFeeds]
     *   dual-feed only: check user status and resolve TMDB feed ids + section
     *   title. Return null (or no ids) to skip rendering.
     * @property {(kind: 'tv'|'movie', id: number) => string} [buildDiscoverPath]
     *   dual-feed only: API path for a feed page, before ?page/&sortBy.
     * @property {(ctx: {id: string, signal: AbortSignal}) => Promise<{items: Array<any>, title: string}|null>} [resolveItems]
     *   client-paged only: check user status and fetch the full (deduped)
     *   result list + section title. Return null to skip rendering.
     * @property {(ctx: {id: string, pageKey: string, signal: AbortSignal, waitForPageReady: (signal?: AbortSignal) => Promise<HTMLElement|null>}) => Promise<boolean|undefined>} [renderOneShot]
     *   one-shot only: perform the full render. Return true to mark the page
     *   as processed (and end metrics).
     * @property {number} [pageSize] - client-paged chunk size (default 40).
     * @property {() => void} [onCleanup] - Extra per-module cleanup (cache clears).
     */

    /**
     * Creates a discovery section controller from a spec.
     * @param {DiscoverySpec} spec
     * @returns {{initialize: () => void, cleanup: () => void, render: () => Promise<void>, handlePageNavigation: () => void, start: () => void}}
     */
    function createDiscovery(spec) {
        const key = spec.key;
        const logPrefix = `🪼 Jellyfin Enhanced: ${spec.logLabel}:`;
        const isClientPaged = spec.mode === 'client-paged';
        const view = JE.discoveryPageHost.create(spec);
        const { sectionSelector, waitForPageReady } = view;
        const processedPages = new Set();
        let currentAbortController = null;
        let currentRenderingPageKey = null;

        // The lifecycle owns cancellation. A sort can replace the active signal
        // without taking over the render's page-key guard.
        const requests = {
            signal: () => currentAbortController?.signal,
            replace() {
                currentAbortController?.abort();
                currentAbortController = new AbortController();
                return currentAbortController.signal;
            }
        };

        function complete(pageKey) {
            processedPages.add(pageKey);
            if (JE.requestManager?.metrics?.enabled) {
                JE.requestManager.endMeasurement(`${key}-discovery`);
            }
        }

        const context = { spec, view, requests, complete, logPrefix };
        const pager = spec.mode === 'dual-feed' ? JE.discoveryDualFeed.create(context)
            : isClientPaged ? JE.discoveryClientPager.create(context) : null;

        function isEnabled() {
            if (spec.defaultEnabled === false) {
                return !!JE.pluginConfig?.[spec.configKey];
            }
            return JE.pluginConfig?.[spec.configKey] !== false;
        }

        async function showClientPagedRetry(signal) {
            const detailSection = await waitForPageReady(signal);
            if (signal.aborted || !detailSection) return;

            document.querySelector(sectionSelector)?.remove();
            const section = document.createElement('div');
            section.className = `verticalSection jellyseerr-${key}-discovery-section je-retry-row`;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'raised emby-button';
            button.textContent = '⟳ Tap to retry';
            button.addEventListener('click', async () => {
                if (signal.aborted || button.disabled) return;
                button.disabled = true;
                try {
                    // render() creates a fresh controller and repeats the full
                    // lookup; failed responses have not been cached as empty.
                    await render();
                } finally {
                    section.remove();
                }
            }, { signal });
            section.appendChild(button);
            detailSection.appendChild(section);
            signal.addEventListener('abort', () => section.remove(), { once: true });
        }

        async function render() {
            const id = spec.getIdFromUrl();
            if (!id) return;

            const pageKey = spec.pageKey
                ? spec.pageKey(id)
                : `${key}-${id}-${window.location.hash}`;
            if (processedPages.has(pageKey)) return;

            // Prevent re-entry if already rendering this same page
            if (currentRenderingPageKey === pageKey) return;

            if (!isEnabled()) return;

            // Set rendering key before potentially aborting
            currentRenderingPageKey = pageKey;

            // Cancel any previous requests (for different pages)
            if (currentAbortController) {
                currentAbortController.abort();
            }
            currentAbortController = new AbortController();
            const signal = currentAbortController.signal;
            const myController = currentAbortController;

            // Start metrics if enabled
            if (JE.requestManager?.metrics?.enabled) {
                JE.requestManager.startMeasurement(`${key}-discovery`);
            }

            try {
                if (pager) {
                    await pager.render(id, signal, pageKey);
                } else {
                    const rendered = await spec.renderOneShot({
                        id,
                        pageKey,
                        signal,
                        waitForPageReady
                    });
                    if (signal.aborted) return;
                    if (rendered) {
                        complete(pageKey);
                    }
                }
            } catch (error) {
                // Don't mark as processed on failure so retry is possible
                if (error.name === 'AbortError') {
                    console.debug(`${logPrefix} Request aborted`);
                    return;
                }
                console.error(`${logPrefix} Error rendering ${key} discovery:`, error);
                if (isClientPaged && !signal.aborted) {
                    await showClientPagedRetry(signal);
                }
            } finally {
                // Clear the re-entry guard after completion (success, abort, or
                // failure) — unless a newer render has taken over: an aborted render
                // can settle after its successor started and must not clear its key.
                if (currentAbortController === myController) currentRenderingPageKey = null;
            }
        }

        /** Abort in-flight work before disposing the pager and its cached results. */
        function cleanup() {
            document.querySelectorAll(sectionSelector).forEach(el => el.remove());
            if (currentAbortController) {
                currentAbortController.abort();
                currentAbortController = null;
            }
            JE.jellyseerrUI?.releasePosters?.();
            pager?.cleanup();
            processedPages.clear();
            currentRenderingPageKey = null;
            if (pager) {
                JE.discoveryFilter?.resetFilterMode?.(key);
                JE.discoveryFilter?.resetSortMode?.(key);
            }
            spec.onCleanup?.();
        }

        // Cached results contain per-user request/availability state.
        JE.session?.onUserChange(`discovery-${key}`, cleanup);

        function handlePageNavigation(viewName, element) {
            const id = spec.getIdFromUrl();
            if (!id) return;
            view.showView(element);
            requestAnimationFrame(() => render());
        }

        function initialize() {
            // Lifecycle: run cleanup() on EVERY navigation — hashchange, popstate
            // AND the pushState transitions the old raw hashchange listener
            // missed. Registration order matters: the teardown wiring is
            // registered first so cleanup always runs before handlePageNavigation
            // on a navigation.
            const lifecycle = JE.core.lifecycle.register(`jellyseerr-${key}-discovery`);
            lifecycle.onTeardown(cleanup);
            lifecycle.teardownOn('navigate');
            view.listen();
            JE.core.navigation.onNavigate(handlePageNavigation);

            handlePageNavigation();
            JE.core.navigation.onViewPage(handlePageNavigation);
        }

        function start() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initialize);
            } else {
                initialize();
            }
        }

        return { initialize, cleanup, render, handlePageNavigation, start };
    }

    JE.discoveryBase = { createDiscovery, idFromDetailUrl, idFromListParam };

})(window.JellyfinEnhanced);
