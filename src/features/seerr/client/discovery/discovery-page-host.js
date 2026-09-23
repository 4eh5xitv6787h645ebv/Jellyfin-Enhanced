// @ts-check
// Page anchoring and shared discovery section markup; no result or pagination state.
(function(JE) {
    'use strict';

    /** Owns router snapshots, page readiness, and the section's DOM contract. */
    function create(spec) {
        const key = spec.key;
        const isDualFeed = spec.mode === 'dual-feed';
        const cardClass = isDualFeed ? 'portraitCard' : 'overflowPortraitCard';
        const sectionSelector = `.jellyseerr-${key}-discovery-section`;
        let visibleAtNavigation = null;
        let visibleContentAtNavigation = '';
        let shownView = null;
        let shownViewHash = null;
        let snapshotHash = null;
        let keepAttachedSeq = 0;

        function listSignature(pageEl) {
            const container = pageEl?.querySelector('.itemsContainer');
            if (!container) return '';
            const first = container.firstElementChild;
            return `${container.childElementCount}|${first?.getAttribute('data-id') || first?.getAttribute('data-index') || first?.textContent?.trim().slice(0, 40) || ''}`;
        }

        function rememberShownView(e) {
            const target = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
            if (!target) return;
            shownView = target;
            shownViewHash = window.location.hash;
        }

        function currentShownView() {
            return shownView && shownView.isConnected && !shownView.classList.contains('hide') && shownViewHash === window.location.hash
                ? shownView
                : null;
        }

        function createCardsFragment(results) {
            return JE.discoveryFilter.createCardsFragment(results, { cardClass });
        }

        function createSectionContainer(title, showFilter, onFilterChange, onSortChange) {
            const section = document.createElement('div');
            section.className = isDualFeed
                ? `verticalSection jellyseerr-${key}-discovery-section padded-left padded-right`
                : `verticalSection jellyseerr-${key}-discovery-section`;
            section.setAttribute(`data-jellyseerr-${key}-discovery`, 'true');
            section.style.cssText = 'margin-top:2em;padding-top:1em;border-top:1px solid rgba(255,255,255,0.1)';

            // Use shared header helper if available, otherwise create basic header
            if (JE.discoveryFilter?.createSectionHeader) {
                const header = JE.discoveryFilter.createSectionHeader(title, key, showFilter, onFilterChange, onSortChange);
                section.appendChild(header);
            } else {
                const titleElement = document.createElement('h2');
                titleElement.className = 'sectionTitle sectionTitle-cards';
                titleElement.textContent = title;
                titleElement.style.marginBottom = '1em';
                section.appendChild(titleElement);
            }

            const itemsContainer = document.createElement('div');
            itemsContainer.setAttribute('is', 'emby-itemscontainer');
            itemsContainer.className = isDualFeed
                ? 'vertical-wrap itemsContainer centered'
                : 'itemsContainer padded-right vertical-wrap';
            section.appendChild(itemsContainer);

            return section;
        }

        function waitForPageReady(signal) {
            return JE.discoveryFilter.waitForPageReady(signal, {
                type: isDualFeed ? 'list' : 'detail',
                getView: currentShownView,
                isStalePage: (pageEl) => !!pageEl && pageEl === visibleAtNavigation
                    && listSignature(pageEl) === visibleContentAtNavigation
            });
        }

        function keepAttached(section, listPage, signal) {
            if (!JE.helpers?.onBodyMutation) return;
            // Unique id per call: body subscribers are keyed by id, so a stale
            // handle unsubscribing a shared id would silently drop the successor's.
            const handle = JE.helpers.onBodyMutation(`jellyseerr-${key}-discovery-keepattached-${++keepAttachedSeq}`, () => {
                if (signal.aborted) return;
                const detached = !section.isConnected;
                const onHiddenPage = !detached && !!section.closest('.page.hide');
                if (!detached && !onHiddenPage) return;
                const view = currentShownView();
                const container = view?.querySelector('.itemsContainer') ||
                                  document.querySelector('.page:not(.hide) .itemsContainer') ||
                                  document.querySelector('.libraryPage:not(.hide) .itemsContainer') || listPage;
                const parent = container?.closest('.verticalSection') || container?.parentElement;
                if (parent?.parentElement && !parent.parentElement.contains(section)) parent.parentElement.appendChild(section);
            });
            const timer = setTimeout(() => handle?.unsubscribe?.(), 6000);
            signal.addEventListener('abort', () => { clearTimeout(timer); handle?.unsubscribe?.(); }, { once: true });
        }

        function snapshotVisiblePage() {
            if (window.location.hash === snapshotHash) return; // same navigation, second event
            snapshotHash = window.location.hash;
            visibleAtNavigation = document.querySelector('.page:not(.hide)');
            visibleContentAtNavigation = listSignature(visibleAtNavigation);
        }

        function showView(element) {
            if (element instanceof HTMLElement) {
                shownView = element;
                shownViewHash = window.location.hash;
            }
        }

        function listen() {
            ['je:navigate', 'hashchange', 'popstate'].forEach(type => window.addEventListener(type, snapshotVisiblePage, true));
            document.addEventListener('viewshow', rememberShownView, true);
        }

        return { sectionSelector, createCardsFragment, createSectionContainer,
            waitForPageReady, keepAttached, showView, listen };
    }

    JE.discoveryPageHost = { create };

})(window.JellyfinEnhanced);
