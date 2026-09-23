/** Dashboard navigation boundary. */
function createDashboardNavigation({ lifecycle, form }) {
    const tabs = document.querySelectorAll('.jellyfin-tab-button');

    const tabContents = document.querySelectorAll('.jellyfin-tab-content');

    // Docs iframe URL — kept in JS rather than hardcoded in the
    // <iframe src> attribute so we can lazy-load on first Docs
    // activation (saves the GitHub Pages fetch for admins who
    // never open this tab).
    const DOCS_URL = 'https://n00bcodr.github.io/Jellyfin-Enhanced/';

    // Per-tab scroll memory. When the admin switches tabs we save the
    // current scrollY under the outgoing tab's id, and when they come
    // back to a tab we restore whatever they were reading. Defaults to
    // scroll-to-top on first visit to a tab so the Overview / long
    // sections always start at the tab's own header.
    const _jeTabScroll = Object.create(null);

    let _jePrevTabId = null;

    function _jeGetScrollTop() {
        return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    function _jeSetScrollTop(y) {
        try {
            window.scrollTo({ top: y, behavior: 'instant' });
        } catch (e) {
            // Old Safari missing behavior:'instant' or iframe contexts.
            window.scrollTo(0, y);
        }
    }

    function activateTab(tabId) {
        if (_jePrevTabId && _jePrevTabId !== tabId) {
            _jeTabScroll[_jePrevTabId] = _jeGetScrollTop();
        }
        tabs.forEach((t) => {
            const isActive = t.dataset.tab === tabId;
            if (isActive) {
                t.classList.add('active');
                // Override with the live accent color — CSS fallback covers initial render
                t.style.color = 'var(--primary-accent-color, #fff)';
                t.style.borderBottomColor = 'var(--primary-accent-color, #fff)';
            } else {
                t.classList.remove('active');
                t.style.color = '';
                t.style.borderBottomColor = '';
            }
        });
        tabContents.forEach((content) => {
            const isActive = content.id === tabId;
            content.classList.toggle('active', isActive);
        });
        // Restore (or reset) the scroll position after the new tab's
        // content is in the DOM. rAF waits for the layout pass so the
        // saved scrollY actually addresses the right document height.
        // NOTE: load-bearing for the service-status card deep-link at
        // renderServiceStatusDashboard (scrollTo handler uses a
        // double-rAF to run after this restore). If this rAF goes
        // away or gains an extra frame, update that handler to match.
        const saved = _jeTabScroll[tabId];
        lifecycle.requestAnimationFrame(() => _jeSetScrollTop(saved || 0));
        _jePrevTabId = tabId;
        // Lazy-load the Docs iframe the first time the user opens
        // the Docs tab. Using `about:blank` as the initial src
        // prevents the GitHub Pages fetch for admins who never
        // click into it. We set the real src once and never
        // reset it, so subsequent tab switches re-reveal the
        // already-loaded page (keeps the admin's scroll position
        // and any in-page nav state).
        if (tabId === 'docs') {
            try {
                var f = document.getElementById('docsFrame');
                if (f && (!f.src || f.src === 'about:blank' || /about:blank/.test(f.src))) {
                    // Set up a load-timeout fallback before assigning src so
                    // a silently-blank iframe (DNS/CSP/X-Frame-Options/CDN
                    // outage) becomes a visible "couldn't load — open in
                    // new tab" message instead of an empty gray box.
                    var loaded = false;
                    lifecycle.listen(
                        f,
                        'load',
                        function onLoad() {
                            loaded = true;
                            f.removeEventListener('load', onLoad);
                        },
                        undefined,
                        'documentation-load',
                    );
                    lifecycle.setTimeout(function () {
                        if (loaded) return;
                        var parent = f.parentNode;
                        if (!parent) return;
                        var fb = document.createElement('div');
                        fb.className = 'je-docs-fallback';
                        fb.style.cssText = 'padding: 24px; text-align: center; color: #ccc; font-size: 0.95em;';
                        var msg = document.createElement('div');
                        msg.textContent = "Couldn't load the embedded documentation. Open it in a new tab instead:";
                        msg.style.marginBottom = '12px';
                        var link = document.createElement('a');
                        link.href = DOCS_URL;
                        link.target = '_blank';
                        link.rel = 'noopener';
                        link.textContent = DOCS_URL;
                        link.style.color = 'var(--primary-accent-color, #00a4dc)';
                        fb.appendChild(msg);
                        fb.appendChild(link);
                        parent.replaceChild(fb, f);
                    }, 8000);
                    f.src = DOCS_URL;
                }
            } catch (e) {
                console.warn('[JE] docs iframe lazy-load failed:', e);
            }
        }
    }

    /** Scrolls a fieldset's top just below .je-sticky-header (sticky title/search/tab bar). */
    function jeScrollFieldsetIntoView(fieldset) {
        const headerEl = document.querySelector('.je-sticky-header');
        const offset = (headerEl ? headerEl.offsetHeight : 0) + 12;
        const targetY = window.scrollY + fieldset.getBoundingClientRect().top - offset;
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }

    /** Flash the rounded card wrapping a control, not the bare control itself. */
    function jeResolveFlashTarget(rawEl) {
        return rawEl && rawEl.tagName !== 'FIELDSET'
            ? rawEl.closest('.checkboxContainer, .inputContainer, .selectContainer') || rawEl
            : rawEl;
    }

    function jeFlashElement(el) {
        el.classList.add('je-jump-flash');
        lifecycle.setTimeout(() => el.classList.remove('je-jump-flash'), 3000);
    }

    /** Switches to tabId, scrolls to selector, and flashes it plus every element in extraSelectors. */
    function jeJumpToTab(tabId, selector, extraSelectors) {
        const tabBtn = document.querySelector('.jellyfin-tab-button[data-tab="' + tabId + '"]');
        if (tabBtn) tabBtn.click();
        if (!selector) return;
        // Double rAF: lands after activateTab's own scroll-memory restore.
        lifecycle.requestAnimationFrame(() => {
            lifecycle.requestAnimationFrame(() => {
                const rawTarget = document.querySelector(selector);
                const target = jeResolveFlashTarget(rawTarget);
                if (target) {
                    if (target.tagName === 'FIELDSET') {
                        jeScrollFieldsetIntoView(target);
                    } else {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    jeFlashElement(target);
                } else {
                    console.warn('[JE] jeJumpToTab: target not found:', selector);
                }
                (extraSelectors || []).forEach((extraSelector) => {
                    if (extraSelector === selector) return;
                    const extraTarget = jeResolveFlashTarget(document.querySelector(extraSelector));
                    if (extraTarget && extraTarget !== target) jeFlashElement(extraTarget);
                });
            });
        });
    }

    // Map legacy tab IDs (pre-redesign) to the closest new tab, so users with
    // a saved sessionStorage value from the old layout don't land on a missing tab.
    const LEGACY_TAB_MAP = {
        enhanced: 'display',
        jellyseerr: 'seerr',
        'arr-links': 'arr',
    };

    // === Settings Search ===
    const searchInput = document.getElementById('settingsSearchInput');

    const searchClear = document.getElementById('settingsSearchClear');

    const searchCount = document.getElementById('settingsSearchCount');

    const tabButtonsContainer = tabs[0] ? tabs[0].parentElement : null;

    let isSearchMode = false;

    const savedDetailsStates = new Map();

    const SKIP_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'SCRIPT', 'STYLE']);

    let currentMatchIdx = -1;

    let allMatches = [];

    let searchDebounce;

    /**
     * Collects searchable text from an element, including IDs, names, and data attributes.
     * @param {HTMLElement} element - The DOM element to extract text from
     * @returns {string} Lowercase concatenation of text content and attribute values
     */
    function getSearchableText(element) {
        var text = element.textContent.toLowerCase();
        element.querySelectorAll('[id], [name], [data-text], [data-icon]').forEach(function (el) {
            if (el.id) text += ' ' + el.id.toLowerCase();
            if (el.name) text += ' ' + el.name.toLowerCase();
            if (el.dataset.text) text += ' ' + el.dataset.text.toLowerCase();
            if (el.dataset.icon) text += ' ' + el.dataset.icon.toLowerCase();
        });
        return text;
    }

    /**
     * Removes all search highlight marks and restores original text nodes.
     */
    function clearHighlights() {
        form.querySelectorAll('.je-search-match').forEach((mark) => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
        // Unwrap the flex/grid protection spans added by
        // highlightTextIn. After the marks above were unwrapped,
        // the wrapper contains only text nodes — move them up to
        // the parent and drop the wrapper, so normalize() can
        // merge back into a single text node identical to before
        // the search.
        form.querySelectorAll('.je-search-wrap').forEach((wrap) => {
            const parent = wrap.parentNode;
            while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
            parent.removeChild(wrap);
            parent.normalize();
        });
        allMatches = [];
        currentMatchIdx = -1;
    }

    /**
     * Walks text nodes in an element and wraps query matches in highlight mark elements.
     * @param {HTMLElement} element - The container to search within
     * @param {string} query - Lowercase search term to highlight
     */
    function highlightTextIn(element, query) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (SKIP_TAGS.has(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
                if (
                    node.parentElement.closest(
                        '.je-search-match, .je-search-tab-label, .dep-hint-text, .dep-required-icon, .je-dep-banner, [class*="parent-hint-"]',
                    )
                )
                    return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        var textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        // Per-parent display cache. getComputedStyle forces style
        // recomputation and — called naively once per text node during
        // a big search — caused the settings search to feel
        // extremely laggy on every keystroke. Most matches in a
        // fieldset share a parent (e.g., all text nodes inside one
        // .fieldDescription), so a WeakMap keyed on the parent
        // element cuts the call count to one per distinct parent.
        var parentDisplayCache = new WeakMap();
        function isFlexOrGridParent(parent) {
            if (parentDisplayCache.has(parent)) return parentDisplayCache.get(parent);
            var d = getComputedStyle(parent).display;
            var flex = /(flex|grid)$/.test(d);
            parentDisplayCache.set(parent, flex);
            return flex;
        }

        textNodes.forEach(function (node) {
            var text = node.textContent;
            var lower = text.toLowerCase();
            if (!lower.includes(query)) return;

            var frag = document.createDocumentFragment();
            var last = 0;
            var idx;
            while ((idx = lower.indexOf(query, last)) !== -1) {
                if (idx > last) frag.appendChild(document.createTextNode(text.substring(last, idx)));
                var mark = document.createElement('mark');
                mark.className = 'je-search-match';
                mark.textContent = text.substring(idx, idx + query.length);
                frag.appendChild(mark);
                last = idx + query.length;
            }
            if (last < text.length) frag.appendChild(document.createTextNode(text.substring(last)));

            // If the text node lives directly inside a flex/grid
            // container, splitting it into mark + remainder nodes
            // creates multiple flex/grid items. Those items then
            // get repositioned by justify-content / align-items on
            // the parent — e.g. a <summary> with space-between
            // would spread the <mark> to the start and the
            // trailing text to the end, splitting "Auto Season
            // Requests" into "Auto Sea" . "son Requests" on a
            // search for "auto sea". Wrap in an inline span so
            // the parent still sees a single child.
            //
            // Order the checks cheap-first: childNodes.length is
            // an O(1) lookup with no style side-effects, while
            // isFlexOrGridParent triggers getComputedStyle on a
            // cache miss. If the fragment has only one child
            // (the whole text matched exactly), no splitting
            // happens and we can skip the style check entirely.
            var parent = node.parentNode;
            if (frag.childNodes.length > 1 && isFlexOrGridParent(parent)) {
                var wrapper = document.createElement('span');
                wrapper.className = 'je-search-wrap';
                wrapper.appendChild(frag);
                parent.replaceChild(wrapper, node);
            } else {
                parent.replaceChild(frag, node);
            }
        });
    }

    /**
     * Navigates to a specific search match by index and scrolls it into view.
     * @param {number} index - Zero-based index of the match to navigate to
     */
    function goToMatch(index) {
        if (allMatches.length === 0) return;
        if (currentMatchIdx >= 0 && currentMatchIdx < allMatches.length) {
            allMatches[currentMatchIdx].classList.remove('je-search-match-active');
        }
        if (index >= allMatches.length) index = 0;
        if (index < 0) index = allMatches.length - 1;
        currentMatchIdx = index;
        allMatches[currentMatchIdx].classList.add('je-search-match-active');
        allMatches[currentMatchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        searchCount.textContent = currentMatchIdx + 1 + ' of ' + allMatches.length;
    }

    /**
     * Enters search mode: saves detail open/closed states, hides tab buttons, and adds tab labels.
     */
    function enterSearchMode() {
        if (isSearchMode) return;
        isSearchMode = true;
        form.classList.add('je-search-mode');
        form.querySelectorAll('details').forEach((d) => {
            savedDetailsStates.set(d, d.open);
        });
        if (tabButtonsContainer) tabButtonsContainer.style.display = 'none';
        tabContents.forEach((tc) => {
            const btn = document.querySelector('.jellyfin-tab-button[data-tab="' + tc.id + '"]');
            // btn.textContent would include Material Icons font
            // ligature names ("dashboard", "view_list", …) which
            // render as glyphs but read as raw strings in
            // textContent. That leaked into tab headers like
            // "dashboardOverview" / "view_listPages". Clone the
            // button, strip out the icon elements, then read.
            let label = tc.id;
            if (btn) {
                const clone = btn.cloneNode(true);
                clone.querySelectorAll('i.material-icons, img').forEach((el) => el.remove());
                label = clone.textContent.trim() || tc.id;
            }
            const labelEl = document.createElement('div');
            labelEl.className = 'je-search-tab-label';
            labelEl.textContent = label;
            tc.insertBefore(labelEl, tc.firstChild);
        });
    }

    /**
     * Exits search mode: restores tab visibility, detail states, and clears highlights.
     */
    function exitSearchMode() {
        isSearchMode = false;
        form.classList.remove('je-search-mode');
        form.querySelectorAll('.je-tab-name-match').forEach((tc) => tc.classList.remove('je-tab-name-match'));
        clearHighlights();
        form.querySelectorAll('.je-search-tab-label').forEach((el) => el.remove());
        if (tabButtonsContainer) tabButtonsContainer.style.display = '';
        // Clear inline display from every tab content. performSearch sets
        // `style.display = 'block'|'none'` per tab; without this reset the
        // inline value wins over `.jellyfin-tab-content.active { display: grid }`,
        // collapsing matched tabs to single-column or hiding tabs that had no
        // match the next time the user clicks them. The .active class alone
        // owns visibility outside of search mode.
        form.querySelectorAll('.jellyfin-tab-content').forEach((tc) => {
            tc.style.display = '';
        });
        form.querySelectorAll('.je-search-hidden').forEach((el) => el.classList.remove('je-search-hidden'));
        form.querySelectorAll('details').forEach((d) => {
            if (savedDetailsStates.has(d)) d.open = savedDetailsStates.get(d);
        });
        savedDetailsStates.clear();
        let savedTab = 'overview';
        try {
            savedTab = sessionStorage.getItem('jellyfinEnhancedActiveTab') || 'overview';
            if (LEGACY_TAB_MAP[savedTab]) savedTab = LEGACY_TAB_MAP[savedTab];
            if (!document.getElementById(savedTab)) savedTab = 'overview';
        } catch (e) {
            // Ignore if sessionStorage is not available
        }
        activateTab(savedTab);
        searchCount.style.display = 'none';
        searchClear.style.display = 'none';
    }

    /**
     * Filters visible sections by query, highlights matches, and updates the match counter.
     * @param {string} query - The search term entered by the user
     */
    function performSearch(query) {
        query = query.toLowerCase().trim();

        if (!query) {
            if (isSearchMode) exitSearchMode();
            return;
        }

        // 1-character queries like "a" or "e" match ~2000–4000 text
        // nodes across the entire settings page, each triggering a
        // DOM mutation. That costs 3–6 s and feels like the page
        // froze. A 2-char minimum keeps the search responsive and
        // still lets short feature names (e.g. "ui", "tv", "4k")
        // through. If the user is mid-edit (backspaced a longer
        // query down to 1 char), exit search mode and clear stale
        // highlights, then surface a hint via the counter so the
        // search UI doesn't look broken.
        if (query.length < 2) {
            if (isSearchMode) exitSearchMode();
            searchCount.textContent = 'Type 2+ characters to search';
            searchCount.style.display = 'block';
            searchClear.style.display = 'block';
            return;
        }

        if (!isSearchMode) enterSearchMode();

        clearHighlights();
        let sectionCount = 0;

        tabContents.forEach((tabContent) => {
            let tabHasMatch = false;
            const fieldsets = tabContent.querySelectorAll(':scope > fieldset');

            fieldsets.forEach((fieldset) => {
                const fullText = getSearchableText(fieldset);

                if (!fullText.includes(query)) {
                    fieldset.classList.add('je-search-hidden');
                    return;
                }

                fieldset.classList.remove('je-search-hidden');
                tabHasMatch = true;
                sectionCount++;

                const detailsEls = fieldset.querySelectorAll('details');
                detailsEls.forEach((detail) => {
                    if (getSearchableText(detail).includes(query)) {
                        detail.classList.remove('je-search-hidden');
                        detail.open = true;
                    } else {
                        detail.classList.add('je-search-hidden');
                    }
                });

                highlightTextIn(fieldset, query);
            });

            tabContent.style.display = tabHasMatch ? 'block' : 'none';

            // Rank tab-contents whose tab button's label itself
            // contains the query above tabs that matched only by
            // buried content. Searching "elsewhere" now surfaces
            // the Elsewhere tab first even though other tabs
            // (Overview service-status, Seerr) reference it too.
            // The CSS .je-tab-name-match rule (flex order: -1)
            // does the actual reordering in the form container.
            const btn = document.querySelector('.jellyfin-tab-button[data-tab="' + tabContent.id + '"]');
            let tabLabel = tabContent.id.toLowerCase();
            if (btn) {
                const clone = btn.cloneNode(true);
                clone.querySelectorAll('i.material-icons, img').forEach((el) => el.remove());
                tabLabel = clone.textContent.trim().toLowerCase();
            }
            tabContent.classList.toggle('je-tab-name-match', tabHasMatch && tabLabel.includes(query));
        });

        allMatches = Array.from(form.querySelectorAll('.je-search-match'));
        currentMatchIdx = -1;

        if (allMatches.length > 0) {
            searchCount.textContent = '0 of ' + allMatches.length;
        } else {
            searchCount.textContent =
                sectionCount > 0
                    ? sectionCount + ' section' + (sectionCount !== 1 ? 's' : '') + ' found'
                    : 'No results';
        }
        searchCount.style.display = 'block';
        searchClear.style.display = 'block';
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Drag-to-scroll on the tab bar so mouse users can pan the tab strip
        // the same way touch users do on mobile (the overflow-x auto strip
        // has no visible scrollbar). Threshold at 5 px before we consider it
        // a drag, so a normal click through to a tab still registers.
        (function wireTabBarDrag() {
            const bar = document.querySelector('.je-tab-bar');
            if (!bar) return;
            let isDown = false;
            let startX = 0;
            let startScroll = 0;
            let dragged = false;

            // Edge fade: signals there are more tabs to scroll to, since the strip's scrollbar is hidden.
            function updateScrollFade() {
                const maxScroll = bar.scrollWidth - bar.clientWidth;
                bar.classList.toggle('je-scroll-fade-left', bar.scrollLeft > 1);
                bar.classList.toggle('je-scroll-fade-right', bar.scrollLeft < maxScroll - 1);
            }
            lifecycle.listen(bar, 'scroll', updateScrollFade, { passive: true });
            lifecycle.listen(window, 'resize', updateScrollFade);
            updateScrollFade();
            lifecycle.setTimeout(updateScrollFade, 300); // re-verify after late-loading fonts/icons can change scrollWidth

            lifecycle.listen(bar, 'mousedown', (e) => {
                if (e.button !== 0) return;
                isDown = true;
                dragged = false;
                startX = e.pageX;
                startScroll = bar.scrollLeft;
            });
            lifecycle.listen(bar, 'mousemove', (e) => {
                if (!isDown) return;
                const dx = e.pageX - startX;
                if (!dragged && Math.abs(dx) > 5) {
                    dragged = true;
                    bar.classList.add('je-dragging');
                }
                if (dragged) {
                    bar.scrollLeft = startScroll - dx;
                    e.preventDefault();
                }
            });
            const end = () => {
                if (!isDown) return;
                isDown = false;
                // Keep `dragged` set briefly so the synthesized click that
                // follows a drag-end can be suppressed by the capture-phase
                // click listener below. Cleared on next mousedown.
                bar.classList.remove('je-dragging');
            };
            lifecycle.listen(bar, 'mouseup', end);
            lifecycle.listen(bar, 'mouseleave', end);

            // Capture-phase click listener cancels the click that mouseup
            // would otherwise fire on the tab button at the cursor's final
            // position — prevents accidental tab activation at drag-end.
            lifecycle.listen(
                bar,
                'click',
                (e) => {
                    if (dragged) {
                        e.preventDefault();
                        e.stopPropagation();
                        dragged = false;
                    }
                },
                true,
            );
        })();

        tabs.forEach((tab) => {
            lifecycle.listen(tab, 'click', () => {
                const tabId = tab.dataset.tab;
                activateTab(tabId);
                // Store active tab in sessionStorage to persist across refreshes
                try {
                    sessionStorage.setItem('jellyfinEnhancedActiveTab', tabId);
                } catch (e) {
                    // Ignore if sessionStorage is not available
                }
            });
        });

        // In-tab section quick-nav: a pill row built from each tab's own <legend> text, for tabs with many fieldsets.
        (function buildSectionNavs() {
            const MIN_SECTIONS = 4;
            tabContents.forEach((tabContent) => {
                const fieldsets = Array.from(tabContent.querySelectorAll(':scope > fieldset')).filter((fs) =>
                    fs.querySelector(':scope > legend.sectionTitle'),
                );
                if (fieldsets.length < MIN_SECTIONS) return;

                const nav = document.createElement('div');
                nav.className = 'je-section-nav';
                fieldsets.forEach((fieldset, i) => {
                    const legend = fieldset.querySelector(':scope > legend.sectionTitle');
                    const clone = legend.cloneNode(true);
                    clone.querySelectorAll('i.material-icons, img').forEach((el) => el.remove());
                    const label = clone.textContent.trim();
                    if (!label) return;
                    if (!fieldset.id) fieldset.id = tabContent.id + '-section-' + i;

                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'je-section-nav-chip';
                    chip.textContent = label;
                    lifecycle.listen(chip, 'click', () => {
                        jeScrollFieldsetIntoView(fieldset);
                        fieldset.classList.add('je-jump-flash-nav');
                        lifecycle.setTimeout(() => fieldset.classList.remove('je-jump-flash-nav'), 3000);
                    });
                    nav.appendChild(chip);
                });
                if (nav.children.length < 2) return;

                // Land after the tab's own intro banner when present, otherwise at the top.
                const intro = tabContent.querySelector(':scope > .je-info-banner');
                if (intro) {
                    intro.insertAdjacentElement('afterend', nav);
                } else {
                    tabContent.insertBefore(nav, tabContent.firstChild);
                }
            });
        })();

        // Cross-tab "jump to X" links inside banners, delegated so future ones need no extra wiring.
        lifecycle.listen(form, 'click', (e) => {
            const link = e.target.closest('.je-jump-link');
            if (!link) return;
            e.preventDefault();
            jeJumpToTab(link.dataset.jumpTab, link.dataset.jumpTarget);
        });

        // Restore tab from sessionStorage on page load
        try {
            let savedTab = sessionStorage.getItem('jellyfinEnhancedActiveTab');
            if (savedTab && LEGACY_TAB_MAP[savedTab]) {
                savedTab = LEGACY_TAB_MAP[savedTab];
                sessionStorage.setItem('jellyfinEnhancedActiveTab', savedTab);
            }
            if (savedTab && document.getElementById(savedTab)) {
                activateTab(savedTab);
            } else if (savedTab) {
                // Saved tab doesn't match any current tab and isn't a legacy key —
                // probably a tab that was later renamed or a stray value. Clear it
                // so the user stops silently getting ignored on every page load.
                console.info('[JE] discarding unknown saved tab: ' + savedTab);
                sessionStorage.removeItem('jellyfinEnhancedActiveTab');
            }
        } catch (e) {
            // sessionStorage unavailable (private mode / quota / security) — skip restore.
        }

        lifecycle.listen(searchInput, 'input', () => {
            lifecycle.clearTimeout(searchDebounce);
            searchDebounce = lifecycle.setTimeout(() => performSearch(searchInput.value), 150);
        });

        lifecycle.listen(searchInput, 'keydown', (e) => {
            if (e.key === 'Escape') {
                lifecycle.clearTimeout(searchDebounce); // kill the debounce so a stale non-empty query can't re-enter search mode after we exit
                searchInput.value = '';
                performSearch('');
                searchInput.blur();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (allMatches.length > 0) {
                    goToMatch(currentMatchIdx + (e.shiftKey ? -1 : 1));
                }
            }
        });

        lifecycle.listen(searchClear, 'click', () => {
            lifecycle.clearTimeout(searchDebounce); // kill the debounce — see Escape handler
            searchInput.value = '';
            performSearch('');
            searchInput.focus();
        });
    }
    return { jeJumpToTab, initialize, dispose: () => lifecycle.dispose() };
}
