// Series Request More workflow: readiness, button UI, deduplication and cancellation.
(function (JE) {
    'use strict';

    JE.internals = JE.internals || {};
    const details = JE.internals.jellyseerrItemDetails = JE.internals.jellyseerrItemDetails || {};

    const requestMoreLogPrefix = '🪼 Jellyfin Enhanced: Series Request More:';
    const REQUEST_MORE_BTN_CLASS = 'je-series-request-more-btn';
    const processedRequestMoreItems = new Set();
    let requestMoreAbortController = null;

    /**
     * Polls a predicate until it returns a truthy value, the abort signal
     * fires, or the timeout is reached. Returns the truthy value, or null
     * on abort/timeout. Used instead of MutationObserver subscriptions for
     * conditions that depend on attribute/characterData changes — the
     * project's shared body observer only dispatches on childList mutations
     * (helpers.js fast-paths attribute/text mutations at line 38), so an
     * observer-based wait would miss a `classList.remove('hide')` or a
     * `span.textContent = 'Series'` mutation entirely unless some unrelated
     * childList mutation happened to fire around the same time.
     * @param {() => any} predicate - Called repeatedly; truthy return resolves.
     * @param {object} [opts]
     * @param {number} [opts.intervalMs=100]
     * @param {number} [opts.timeoutMs=5000]
     * @param {AbortSignal} [opts.signal]
     * @returns {Promise<any|null>}
     */
    function pollUntil(predicate, opts = {}) {
        const { intervalMs = 100, timeoutMs = 5000, signal } = opts;
        return new Promise((resolve) => {
            if (signal?.aborted) {
                resolve(null);
                return;
            }
            const immediate = predicate();
            if (immediate) {
                resolve(immediate);
                return;
            }
            const deadline = Date.now() + timeoutMs;
            let timerId = null;
            const finish = (value) => {
                if (timerId) clearTimeout(timerId);
                if (signal) signal.removeEventListener('abort', onAbort);
                resolve(value);
            };
            const onAbort = () => finish(null);
            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            const tick = () => {
                if (signal?.aborted) return finish(null);
                const result = predicate();
                if (result) return finish(result);
                if (Date.now() >= deadline) return finish(null);
                timerId = setTimeout(tick, intervalMs);
            };
            timerId = setTimeout(tick, intervalMs);
        });
    }

    /**
     * Waits for the Seasons section heading on a Series detail page to become
     * visible. On a Series page Jellyfin renders the seasons list inside
     * #listChildrenCollapsible (NOT #childrenCollapsible — that variant is
     * used for non-Series item types and stays hidden). The heading inside
     * is an h2.sectionTitle.sectionTitle-cards with a child <span> whose
     * text reads "Series" once Jellyfin has populated it.
     *
     * Uses polling instead of a MutationObserver because the readiness
     * conditions are attribute (`hide` class removal) and characterData
     * (span text set) mutations, which the project's shared body observer
     * does not dispatch on.
     *
     * @param {AbortSignal} [signal]
     * @returns {Promise<HTMLElement|null>}
     */
    function waitForSeasonsHeading(signal) {
        return pollUntil(() => {
            const activePage = document.querySelector('.libraryPage:not(.hide)');
            if (!activePage) return null;
            const collapsible = activePage.querySelector('#listChildrenCollapsible');
            if (!collapsible || collapsible.classList.contains('hide')) return null;
            const heading = collapsible.querySelector('h2.sectionTitle.sectionTitle-cards');
            if (!heading || heading.classList.contains('hide')) return null;
            // Wait until Jellyfin has populated the title span (initially empty)
            const span = heading.querySelector('span');
            if (!span || !span.textContent.trim()) return null;
            return heading;
        }, { intervalMs: 100, timeoutMs: 5000, signal });
    }

    /**
     * Waits for `JE.jellyseerrMoreInfo.checkForUnrequestedSeasons` to become
     * available. The Jellyseerr modules are loaded in parallel by plugin.js
     * via dynamically-inserted <script> tags, so on a cold page load
     * item-details.js may execute before moreinfo/more-info-modal-init.js has finished
     * parsing and attached its API. The checker is required for deciding
     * whether to render the Request More button.
     * @param {AbortSignal} [signal]
     * @returns {Promise<Function|null>}
     */
    function waitForChecker(signal) {
        return pollUntil(
            () => {
                const fn = JE.jellyseerrMoreInfo && JE.jellyseerrMoreInfo.checkForUnrequestedSeasons;
                return typeof fn === 'function' ? fn : null;
            },
            { intervalMs: 50, timeoutMs: 3000, signal }
        );
    }

    /**
     * Builds the Request More button DOM. Reuses the .jellyseerr-request-button
     * styling injected by ui/ui-styles.js so visuals match the rest of Seerr UI.
     * Uses textContent / DOM construction (no innerHTML) for safety.
     * @param {object} tvDetails - TV show details from Seerr
     * @returns {HTMLButtonElement}
     */
    function buildSeriesRequestMoreButton(tvDetails) {
        // Defensive: i18n table may not be initialized yet on first navigation;
        // match the fallback pattern used elsewhere in this file.
        const labelText = (JE.t && JE.t('jellyseerr_btn_request_more')) || 'Request More';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `jellyseerr-request-button jellyseerr-button-request ${REQUEST_MORE_BTN_CLASS}`;
        button.title = labelText;
        // Inline overrides so the button sits comfortably next to the h2 text
        // without inheriting the heading's font size or block layout.
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.verticalAlign = 'middle';
        button.style.fontSize = '0.85rem';
        button.style.padding = '0.4em 0.9em';
        button.style.marginLeft = '1em';

        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'download';
        icon.style.marginRight = '0.4em';
        icon.style.fontSize = '1.1em';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = labelText;

        button.appendChild(icon);
        button.appendChild(labelSpan);

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (JE.jellyseerrUI?.showSeasonSelectionModal) {
                JE.jellyseerrUI.showSeasonSelectionModal(
                    tvDetails.id,
                    'tv',
                    tvDetails.name || tvDetails.title,
                    tvDetails
                );
            }
        });

        return button;
    }

    /**
     * Renders a "Request More" button next to the Seasons section heading on
     * a Series detail page when the show has unrequested seasons in Seerr.
     * Reuses checkForUnrequestedSeasons from moreinfo/more-info-modal-init.js so the
     * detection logic stays in one place.
     * @param {string} itemId - Jellyfin item ID
     */
    async function renderSeriesRequestMoreButton(itemId) {
        if (processedRequestMoreItems.has(itemId)) return;

        // Cancel any in-flight Request More check from a previous navigation.
        if (requestMoreAbortController) {
            requestMoreAbortController.abort();
        }
        requestMoreAbortController = new AbortController();
        const signal = requestMoreAbortController.signal;

        try {
            if (!JE.pluginConfig?.JellyseerrEnabled) return;
            if (JE.pluginConfig?.JellyseerrShowRequestMoreOnSeries === false) return;

            const status = await JE.jellyseerrAPI.checkUserStatus();
            if (signal.aborted) return;
            if (!status?.active) return;

            const { tmdbId, type } = await details.getTmdbIdFromItem(itemId, signal);
            if (signal.aborted) return;
            if (!tmdbId || type !== 'tv') return;

            const tvDetails = await JE.jellyseerrAPI.fetchTvShowDetails(tmdbId);
            if (signal.aborted) return;
            if (!tvDetails) return;

            // Wait for the checker to become available — the Jellyseerr
            // modules load in parallel via dynamically-inserted <script>
            // tags, so moreinfo/more-info-modal-init.js may still be parsing when we get
            // here on a cold load. Polling up to 3s avoids a one-shot race
            // where the button would otherwise never appear until the user
            // navigates away and back.
            const checker = await waitForChecker(signal);
            if (signal.aborted) return;
            if (!checker) {
                console.warn(`${requestMoreLogPrefix} checkForUnrequestedSeasons unavailable after 3s, skipping`);
                return;
            }
            const hasUnrequested = await checker(tvDetails);
            if (signal.aborted) return;
            if (!hasUnrequested) {
                // Dedupe negative results too. Each call to checker() runs an
                // HTTP request to /JellyfinEnhanced/jellyseerr/request, so we
                // don't want to repeat it on every viewshow for the same item.
                // cleanup() clears this set on real navigation.
                processedRequestMoreItems.add(itemId);
                console.debug(`${requestMoreLogPrefix} No unrequested seasons for "${tvDetails.name || tvDetails.title}"`);
                return;
            }

            const heading = await waitForSeasonsHeading(signal);
            if (signal.aborted) return;
            if (!heading) {
                console.debug(`${requestMoreLogPrefix} Seasons heading not found, skipping`);
                return;
            }

            // Dedup: bail if we already injected a button into this heading.
            if (heading.querySelector(`.${REQUEST_MORE_BTN_CLASS}`)) {
                processedRequestMoreItems.add(itemId);
                return;
            }

            // Lay the button out inline next to the heading text via a class
            // (instead of mutating heading.style directly) so the override is
            // discoverable in CSS, easy to remove, and doesn't permanently
            // overwrite Jellyfin's inline display value on the heading.
            heading.classList.add('je-series-request-more-heading');

            const button = buildSeriesRequestMoreButton(tvDetails);
            heading.appendChild(button);

            processedRequestMoreItems.add(itemId);
            console.debug(`${requestMoreLogPrefix} Added Request More button for "${tvDetails.name || tvDetails.title}"`);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.debug(`${requestMoreLogPrefix} Aborted for item ${itemId}`);
                return;
            }
            console.error(`${requestMoreLogPrefix} Error rendering button:`, error);
        }
    }

    /**
     * Injects the CSS used by the Series "Request More" button. Kept tiny so
     * it can live alongside the JS module instead of needing a separate file.
     */
    function injectRequestMoreStyles() {
        if (document.getElementById('je-series-request-more-styles')) return;
        const style = document.createElement('style');
        style.id = 'je-series-request-more-styles';
        style.textContent = `
            h2.sectionTitle.sectionTitle-cards.je-series-request-more-heading {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
            }
        `;
        document.head.appendChild(style);
    }

    function cleanup() {
        requestMoreAbortController?.abort();
        requestMoreAbortController = null;
        processedRequestMoreItems.clear();
    }

    details.requestMore = { render: renderSeriesRequestMoreButton, cleanup, injectStyles: injectRequestMoreStyles };

})(window.JellyfinEnhanced);
