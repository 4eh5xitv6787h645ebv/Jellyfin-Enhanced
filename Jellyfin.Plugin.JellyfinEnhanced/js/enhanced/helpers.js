/**
 * @file Centralized helper utilities for Jellyfin Enhanced
 * Provides standardized functionality for hooking into page views and managing MutationObservers
 */
(function(JE) {
    'use strict';

    // Store the original onViewShow function
    let originalOnViewShow = null;

    // Tracks whether the MUI-toolbar button-sizing CSS fix has been injected (see
    // getHeaderRightContainer below) so it's only added once.
    let muiHeaderButtonCSSInjected = false;

    // Same, for the MUI-drawer alignment fix (see getSidebarContainer below).
    let muiDrawerCSSInjected = false;

    // Array to store registered handlers
    const handlers = [];

    // Active observers registry for lifecycle management (non-body targets only)
    const activeObservers = new Map();

    // --- Protected avatar image resolution ---
    // Seerr avatar URLs are proxied through /JellyfinEnhanced/proxy/avatar, which requires the
    // same auth headers as any other plugin endpoint — a plain <img src> can't send those, so
    // avatars are fetched as an authenticated blob and swapped in. Shared across every module
    // that renders a requester's avatar (Requests page, Seerr more-info modal) so the same
    // avatar isn't downloaded twice and both share one cache.
    const avatarObjectUrlCache = new Map();
    const avatarFetchPromises = new Map();

    function getAvatarAuthHeaders() {
        const token = ApiClient.accessToken ? ApiClient.accessToken() : '';
        return {
            'Authorization': 'MediaBrowser Token="' + token + '"',
            'X-MediaBrowser-Token': token,
        };
    }

    function isSafeAvatarUrl(url) {
        if (!url || typeof url !== 'string') return false;

        // Relative paths are resolved by the browser against current origin and are allowed.
        if (url.startsWith('/')) return true;

        if (url.startsWith('blob:')) return true;

        try {
            const parsed = new URL(url, window.location.origin);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return true;
            }

            // Only allow image data URLs.
            if (parsed.protocol === 'data:') {
                return /^data:image\//i.test(url);
            }
        } catch {
            return false;
        }

        return false;
    }

    /**
     * Resolve a protected avatar URL (our /JellyfinEnhanced/proxy/avatar path) to a blob object
     * URL. Deduplicates concurrent fetches so multiple callers referencing the same avatar
     * share a single network request, and caches the result.
     * @param {string} avatarUrl - The avatar proxy URL to resolve
     * @returns {Promise<string>} A blob: object URL, or "" on failure
     */
    async function resolveProtectedAvatarUrl(avatarUrl) {
        if (!avatarUrl) return '';

        if (!isSafeAvatarUrl(avatarUrl)) {
            return '';
        }

        if (!avatarUrl.startsWith('/JellyfinEnhanced/proxy/avatar')) return avatarUrl;

        if (avatarObjectUrlCache.has(avatarUrl)) {
            return avatarObjectUrlCache.get(avatarUrl);
        }

        if (avatarFetchPromises.has(avatarUrl)) {
            return avatarFetchPromises.get(avatarUrl);
        }

        const fetchPromise = (async () => {
            try {
                const response = await fetch(ApiClient.getUrl(avatarUrl), { headers: getAvatarAuthHeaders() });
                if (!response.ok) return '';
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                avatarObjectUrlCache.set(avatarUrl, objectUrl);
                return objectUrl;
            } catch {
                return '';
            } finally {
                avatarFetchPromises.delete(avatarUrl);
            }
        })();

        avatarFetchPromises.set(avatarUrl, fetchPromise);
        return fetchPromise;
    }

    /**
     * Hydrates every `img.je-request-avatar[data-avatar-src]` inside container: resolves the
     * protected proxy URL to a blob and swaps it in, hiding the image entirely on failure.
     * @param {HTMLElement} container
     */
    function hydrateAvatarImages(container) {
        const avatarImgs = container.querySelectorAll('img.je-request-avatar[data-avatar-src]');
        avatarImgs.forEach(async (img) => {
            const sourceUrl = img.getAttribute('data-avatar-src');
            if (!sourceUrl) {
                img.style.display = 'none';
                return;
            }

            const resolvedUrl = await resolveProtectedAvatarUrl(sourceUrl);
            if (!img.isConnected) return;

            if (!resolvedUrl) {
                img.style.display = 'none';
                return;
            }

            if (!isSafeAvatarUrl(resolvedUrl)) {
                img.style.display = 'none';
                return;
            }

            img.src = resolvedUrl;
            img.style.display = '';
        });
    }

    /**
     * Revoke all cached avatar blob URLs and clear the result cache.
     * @param {boolean} [includeInFlight] - If true, also cancel pending fetch promises.
     *   Pass true on page teardown; omit on re-render to let in-flight fetches complete.
     */
    function clearAvatarObjectUrlCache(includeInFlight) {
        avatarObjectUrlCache.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
        avatarObjectUrlCache.clear();
        // Only clear in-flight promises on page teardown, not on re-render.
        // Clearing mid-flight would cause duplicate downloads for the same avatar.
        if (includeInFlight) {
            avatarFetchPromises.clear();
        }
    }

    // --- Multiplexed Body Observer ---
    // Single MutationObserver on document.body that dispatches to all registered subscribers.
    // This replaces the previous pattern of N separate observers on document.body,
    // reducing browser overhead from cloning MutationRecord lists N times and scheduling
    // N separate microtask callbacks down to a single observer + single dispatch loop.
    const bodySubscribers = new Map();
    let bodyObserver = null;

    function ensureBodyObserver() {
        if (bodyObserver) return;
        bodyObserver = new MutationObserver((mutations) => {
            // Fast-path: skip dispatch entirely if no nodes were added or removed.
            // This filters out attribute changes, text changes, hover effects, focus
            // changes, etc. that fire frequently but never add new content.
            let hasStructuralChange = false;
            for (let i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 0 || mutations[i].removedNodes.length > 0) {
                    hasStructuralChange = true;
                    break;
                }
            }
            if (!hasStructuralChange) return;

            // NOTE: Callbacks may call unsubscribe()/disconnect(), deleting from this Map
            // during iteration. ES spec guarantees Map iteration handles concurrent deletion.
            for (const [id, sub] of bodySubscribers) {
                try {
                    sub.callback(mutations);
                } catch (err) {
                    console.error(`🪼 Jellyfin Enhanced: Error in body observer subscriber "${id}":`, err);
                }
            }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
        console.log('🪼 Jellyfin Enhanced: Shared body observer started');
    }

    function stopBodyObserverIfEmpty() {
        if (bodyObserver && bodySubscribers.size === 0) {
            bodyObserver.disconnect();
            bodyObserver = null;
            console.log('🪼 Jellyfin Enhanced: Shared body observer stopped (no subscribers)');
        }
    }

    /**
     * Re-sort bodySubscribers Map by priority (highest first).
     * Called when a subscriber with non-default priority is added.
     */
    function resortBodySubscribers() {
        const sorted = [...bodySubscribers.entries()].sort((a, b) => b[1].priority - a[1].priority);
        bodySubscribers.clear();
        for (const [id, sub] of sorted) {
            bodySubscribers.set(id, sub);
        }
    }

    /**
     * Register a callback with the shared body MutationObserver.
     * All subscribers share a single observer on document.body with { childList: true, subtree: true }.
     * @param {string} id - Unique identifier for this subscriber
     * @param {Function} callback - Called with (mutations) on each body mutation batch
     * @param {Object} [options] - Options
     * @param {number} [options.priority=0] - Execution priority. Higher values run first.
     *   Use priority > 0 for subscribers that should filter/hide content before others process it.
     * @returns {{ unsubscribe: Function, disconnect: Function }} Handle to remove this subscriber.
     *   Both unsubscribe() and disconnect() do the same thing -- provided so callers can use
     *   either the subscription convention or the MutationObserver convention consistently.
     */
    function onBodyMutation(id, callback, options) {
        const priority = (options && typeof options.priority === 'number') ? options.priority : 0;
        if (bodySubscribers.has(id)) {
            console.warn(`🪼 Jellyfin Enhanced: Replacing body observer subscriber: ${id}`);
        }
        bodySubscribers.set(id, { callback, priority });
        if (priority !== 0) {
            resortBodySubscribers();
        }
        ensureBodyObserver();
        console.log(`🪼 Jellyfin Enhanced: Body subscriber registered: ${id} (priority: ${priority}, total: ${bodySubscribers.size})`);
        const cleanup = () => {
            if (!bodySubscribers.has(id)) return;
            bodySubscribers.delete(id);
            console.log(`🪼 Jellyfin Enhanced: Body subscriber removed: ${id} (remaining: ${bodySubscribers.size})`);
            stopBodyObserverIfEmpty();
        };
        return { unsubscribe: cleanup, disconnect: cleanup };
    }

    /**
     * Remove a subscriber from the shared body observer.
     * @param {string} id - The subscriber ID
     * @returns {boolean} True if found and removed
     */
    function removeBodySubscriber(id) {
        const removed = bodySubscribers.delete(id);
        if (removed) {
            console.log(`🪼 Jellyfin Enhanced: Body subscriber removed: ${id} (remaining: ${bodySubscribers.size})`);
            stopBodyObserverIfEmpty();
        }
        return removed;
    }

    // Shared cache for item payloads to deduplicate cross-module ApiClient.getItem calls
    const itemCache = new Map();
    const ITEM_CACHE_TTL_MS = 30000; // 30s -- long enough for batch prefetch to warm cache before tag systems scan

    /**
     * Deduplicated item fetch with short TTL cache.
     * Prevents multiple modules from requesting the same item concurrently on detail page navigation.
     * @param {string} itemId
     * @param {Object} [options]
     * @param {string} [options.userId]
     * @param {number} [options.ttlMs]
     * @param {boolean} [options.forceRefresh]
     * @returns {Promise<object|null>}
     */
    async function getItemCached(itemId, options = {}) {
        if (!itemId) return null;

        const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : ITEM_CACHE_TTL_MS;
        const userId = options.userId || ApiClient.getCurrentUserId();
        const key = `${userId}:${itemId}`;
        const now = Date.now();
        const entry = itemCache.get(key);

        if (!options.forceRefresh && entry) {
            if (entry.promise) {
                return entry.promise;
            }
            if (entry.item && (now - entry.ts) < ttlMs) {
                return entry.item;
            }
        }

        const promise = ApiClient.getItem(userId, itemId)
            .then((item) => {
                itemCache.set(key, { item, ts: Date.now(), promise: null });
                return item;
            })
            .catch((err) => {
                itemCache.delete(key);
                throw err;
            });

        itemCache.set(key, { item: null, ts: now, promise });
        return promise;
    }


    /**
     * Patch history.pushState / history.replaceState to emit a 'je:navigate' event.
     * Jellyfin's SPA router calls pushState for some transitions without changing
     * location.hash, so hashchange/popstate are never fired for those navigations.
     * This single patch lets all modules listen to one synthetic event instead of polling.
     */
    function patchNavigationEvents() {
        if (history.__jePushed) return; // only patch once
        history.__jePushed = true;

        const _push = history.pushState.bind(history);
        const _replace = history.replaceState.bind(history);

        // Some host pages (e.g. third-party custom-tabs plugins reacting to DOM
        // mutations) call pushState repeatedly for a URL that hasn't changed.
        // Skip the synthetic event in that case so we don't re-trigger our own
        // navigation-driven rescans, which would mutate the DOM and risk feeding
        // back into whatever observer caused the redundant pushState in the first place.
        history.pushState = function(...args) {
            const before = window.location.href;
            _push(...args);
            if (window.location.href !== before) {
                window.dispatchEvent(new Event('je:navigate'));
            }
        };
        history.replaceState = function(...args) {
            const before = window.location.href;
            _replace(...args);
            if (window.location.href !== before) {
                window.dispatchEvent(new Event('je:navigate'));
            }
        };
    }

    /**
     * Subscribe to all navigation events: pushState, replaceState, hashchange, popstate.
     * @param {Function} callback - Called on every navigation.
     * @returns {Function} Unsubscribe function.
     */
    function onNavigate(callback) {
        window.addEventListener('je:navigate', callback);
        window.addEventListener('hashchange', callback);
        window.addEventListener('popstate', callback);
        return () => {
            window.removeEventListener('je:navigate', callback);
            window.removeEventListener('hashchange', callback);
            window.removeEventListener('popstate', callback);
        };
    }

    /**
     * Initialize the utils by hooking into Emby.Page.onViewShow
     */
    function initialize() {
        if (!window.Emby?.Page) {
            console.warn('🪼 Jellyfin Enhanced: Emby.Page not available, retrying in 100ms');
            setTimeout(initialize, 100);
            return;
        }

        // Patch navigation history methods so pushState fires je:navigate
        patchNavigationEvents();

        // Store original onViewShow if it exists
        originalOnViewShow = window.Emby.Page.onViewShow;

        // Override onViewShow to intercept page view changes
        window.Emby.Page.onViewShow = function(view, element, hash) {
            // Call original handler first
            if (originalOnViewShow) {
                try {
                    originalOnViewShow.call(this, view, element, hash);
                } catch (err) {
                    console.warn('🪼 Jellyfin Enhanced: Error in original onViewShow:', err);
                }
            }

            // Notify all registered handlers
            notifyHandlers(view, element, hash);
        };

        console.log('🪼 Jellyfin Enhanced: Successfully hooked into Emby.Page.onViewShow');
    }

    /**
     * Notify all registered handlers about a view change
     * @param {string} view - The view name
     * @param {HTMLElement} element - The view element
     * @param {string} hash - The URL hash
     */
    function notifyHandlers(view, element, hash) {
        handlers.forEach(handlerConfig => {
            try {
                const { callback, options } = handlerConfig;

                // Check if this handler should be called for this page
                if (options.pages && !options.pages.includes(view)) {
                    return;
                }

                // Get item promise if needed
                let itemPromise = null;
                if (options.fetchItem) {
                    itemPromise = getItemFromHash(hash);
                }

                // Call the handler
                callback(view, element, hash, itemPromise);
            } catch (err) {
                console.error('🪼 Jellyfin Enhanced: Error in handler:', err);
            }
        });
    }

    /**
     * Get item from URL hash (cached)
     * @param {string} hash - The URL hash
     * @returns {Promise<object|null>}
     */
    async function getItemFromHash(hash) {
        try {
            const params = new URLSearchParams(hash.split('?')[1]);
            const itemId = params.get('id');

            if (!itemId) return null;
            return await getItemCached(itemId);
        } catch (err) {
            console.error('🪼 Jellyfin Enhanced: Error fetching item:', err);
            return null;
        }
    }

    /**
     * Register a callback to be called when page view changes
     * @param {Function} callback - Function to call when page view changes
     * @param {Object} options - Options for the handler
     * @param {string[]} options.pages - Array of page names to trigger on (optional)
     * @param {boolean} options.fetchItem - Whether to fetch item from hash (default: false)
     * @param {boolean} options.immediate - Whether to call immediately if on matching page (default: false)
     * @returns {Function} Unregister function
     */
    function onViewPage(callback, options = {}) {
        const handlerConfig = {
            callback,
            options: {
                pages: options.pages || null,
                fetchItem: options.fetchItem || false,
                immediate: options.immediate || false
            }
        };

        handlers.push(handlerConfig);
        console.log(`🪼 Jellyfin Enhanced: Registered onViewPage handler (total: ${handlers.length})`);

        // Call immediately if requested and we're on a matching page
        if (options.immediate) {
            try {
                const currentView = getCurrentView();
                const currentHash = window.location.hash;

                if (!options.pages || options.pages.includes(currentView)) {
                    const element = document.querySelector('.libraryPage:not(.hide)');
                    let itemPromise = null;
                    if (options.fetchItem) {
                        itemPromise = getItemFromHash(currentHash);
                    }
                    callback(currentView, element, currentHash, itemPromise);
                }
            } catch (err) {
                console.error('🪼 Jellyfin Enhanced: Error in immediate handler call:', err);
            }
        }

        // Return unregister function
        return () => {
            const index = handlers.indexOf(handlerConfig);
            if (index !== -1) {
                handlers.splice(index, 1);
                console.log(`🪼 Jellyfin Enhanced: Unregistered onViewPage handler (remaining: ${handlers.length})`);
            }
        };
    }

    /**
     * Get current view name
     * @returns {string|null}
     */
    function getCurrentView() {
        const visiblePage = document.querySelector('.libraryPage:not(.hide)');
        if (!visiblePage) return null;

        // Try to get view from data attributes or id
        return visiblePage.dataset.type ||
               visiblePage.id ||
               visiblePage.getAttribute('data-role') ||
               null;
    }

    /**
     * Create a managed MutationObserver that can be properly cleaned up.
     * If target is document.body with { childList: true, subtree: true }, the callback
     * is automatically routed to the shared multiplexed body observer instead of
     * creating a separate MutationObserver instance.
     * @param {string} id - Unique identifier for this observer
     * @param {Function} callback - The mutation callback
     * @param {HTMLElement} target - The element to observe
     * @param {MutationObserverInit} config - The observer configuration
     * @returns {MutationObserver|{ disconnect: Function }} Observer handle
     */
    function createObserver(id, callback, target, config) {
        // Route body observers to the shared multiplexed observer
        const isBodyTarget = target === document.body || target === document.documentElement || target === document;
        const isSubtreeWatch = config && config.childList && config.subtree;

        if (isBodyTarget && isSubtreeWatch && !config.attributes && !config.attributeFilter && !config.characterData) {
            // Use shared body observer
            const handle = onBodyMutation(id, callback);
            // Return a duck-typed object compatible with both MutationObserver and subscription conventions
            const cleanup = () => handle.disconnect();
            const proxy = {
                disconnect: cleanup,
                unsubscribe: cleanup,
                observe() { /* no-op, already observing via shared observer */ },
                takeRecords() { return []; }
            };
            activeObservers.set(id, proxy);
            return proxy;
        }

        // For non-body targets or complex configs (attributes, characterData),
        // create a dedicated observer as before
        if (activeObservers.has(id)) {
            const existing = activeObservers.get(id);
            existing.disconnect();
            console.warn(`🪼 Jellyfin Enhanced: Replacing existing observer: ${id}`);
        }

        const observer = new MutationObserver(callback);
        observer.observe(target, config);

        activeObservers.set(id, observer);
        console.log(`🪼 Jellyfin Enhanced: Created dedicated observer: ${id} (total: ${activeObservers.size})`);

        return observer;
    }

    /**
     * Disconnect and remove a managed observer (or body subscriber)
     * @param {string} id - The observer ID
     * @returns {boolean} True if observer was found and disconnected
     */
    function disconnectObserver(id) {
        // Check body subscribers first
        if (bodySubscribers.has(id)) {
            removeBodySubscriber(id);
            activeObservers.delete(id);
            return true;
        }
        if (activeObservers.has(id)) {
            const observer = activeObservers.get(id);
            observer.disconnect();
            activeObservers.delete(id);
            console.log(`🪼 Jellyfin Enhanced: Disconnected observer: ${id} (remaining: ${activeObservers.size})`);
            return true;
        }
        return false;
    }

    /**
     * Disconnect all managed observers and body subscribers
     */
    function disconnectAllObservers() {
        activeObservers.forEach((observer, id) => {
            observer.disconnect();
        });
        activeObservers.clear();
        bodySubscribers.clear();
        if (bodyObserver) {
            bodyObserver.disconnect();
            bodyObserver = null;
        }
        console.log('🪼 Jellyfin Enhanced: All observers and body subscribers disconnected');
    }

    /**
     * Wait for an element to appear in the DOM
     * @param {string} selector - CSS selector
     * @param {number} timeout - Maximum wait time in ms (default: 10000)
     * @returns {Promise<HTMLElement|null>}
     */
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve) => {
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }

            const observerId = `wait-${selector}-${Date.now()}`;
            let timeoutId = null;

            const handle = onBodyMutation(observerId, () => {
                const element = document.querySelector(selector);
                if (element) {
                    if (timeoutId) clearTimeout(timeoutId);
                    handle.unsubscribe();
                    resolve(element);
                }
            });

            // Set timeout
            timeoutId = setTimeout(() => {
                handle.unsubscribe();
                console.warn(`🪼 Jellyfin Enhanced: Timeout waiting for element: ${selector}`);
                resolve(null);
            }, timeout);
        });
    }

    /**
     * Debounce a function call
     * @param {Function} func - The function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function}
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- Generic request concurrency limiter ---
    // Shared by any module that fires one fetch per card (rating chips, provider
    // icons, etc.) so a page full of results doesn't open one connection per card.
    const CONCURRENCY_LIMIT = 6;
    let activeRequestCount = 0;
    const concurrencyQueue = [];

    /**
     * Run fn once fewer than CONCURRENCY_LIMIT calls are in flight; queues callers beyond that.
     * @param {Function} fn - Async function to run.
     * @returns {Promise<any>}
     */
    async function withConcurrencyLimit(fn) {
        if (activeRequestCount >= CONCURRENCY_LIMIT) {
            await new Promise((resolve) => concurrencyQueue.push(resolve));
        }
        activeRequestCount++;
        try {
            return await fn();
        } finally {
            activeRequestCount--;
            const next = concurrencyQueue.shift();
            if (next) next();
        }
    }

    /**
     * Throttle a function call
     * @param {Function} func - The function to throttle
     * @param {number} limit - Time limit in ms
     * @returns {Function}
     */
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Retry a function with exponential backoff
     * @param {Function} fn - The async function to retry
     * @param {number} maxAttempts - Maximum retry attempts (default: 5)
     * @param {number} baseDelay - Base delay in ms (default: 1000)
     * @returns {Promise<any>}
     */
    async function retry(fn, maxAttempts = 5, baseDelay = 1000) {
        let lastError;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                if (attempt === maxAttempts) {
                    console.error(`🪼 Jellyfin Enhanced: Failed after ${maxAttempts} attempts:`, error);
                    throw error;
                }

                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.warn(`🪼 Jellyfin Enhanced: Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * Check if an element is visible in the viewport
     * @param {HTMLElement} element - The element to check
     * @returns {boolean}
     */
    function isElementVisible(element) {
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    /**
     * Finds (or creates) the container plugin buttons should be injected into.
     *
     * Jellyfin 12's "experimental" layout (now the default) replaces the legacy
     * AngularJS header with a React/MUI AppBar+Toolbar. The legacy `.headerRight`
     * element is still present in the DOM for backwards compatibility, but it sits
     * inside a `display:none` wrapper, so injecting into it silently produces
     * invisible buttons. When that's detected, this reuses the toolbar's own
     * SyncPlay/RemotePlay/Search button tray (a `flexGrow:1; justifyContent:flex-end`
     * Box) as the container — it's the functional equivalent of `.headerRight`, and
     * injecting into it (rather than next to it) keeps plugin buttons right-aligned
     * with the native ones instead of stranding them as a separate flex item further
     * left in the toolbar.
     * @returns {HTMLElement|null} The container, or null if no header is ready yet.
     */
    /**
     * Marks a resolved header-tray container so the shared stylesheet below can
     * scope its single-row/scroll-containment rules to exactly the element the
     * plugin injects buttons into.
     */
    function markHeaderTray(el) {
        el.classList.add('je-header-tray');
        return el;
    }

    /**
     * Installs the one-time header-tray stylesheet. Two concerns share it:
     *
     * 1. MUI button sizing — the legacy .headerButton/.paper-icon-button-light
     *    classes size themselves with `em` units relative to the *inherited*
     *    font-size, tuned for the old .skinHeader context. Inside the MUI toolbar
     *    the ambient font-size differs, so icons come out oversized/misaligned
     *    next to native MUI IconButtons. Pin them to MUI's ~48px button / 24px
     *    icon convention. !important beats callers (e.g. active-streams.js) that
     *    set a fixed size via an #id selector, which otherwise outranks this.
     *
     * 2. Single-row scroll containment — the plugin owns no bar element: buttons
     *    are injected into a native container that inherits Jellyfin's own wrap
     *    behaviour, so many buttons wrap to 2-3 rows (worst on mobile, where the
     *    MUI toolbar pushed the profile avatar onto a second row). Force the
     *    resolved tray to a single horizontally-scrollable row with non-shrinking
     *    children. The scrollbar is suppressed so an overflowing tray never grows
     *    a gutter (which would shrink the content box and clip the buttons).
     *    justify-content is overridden to flex-start because with nowrap the
     *    native flex-end packs leading buttons into unreachable negative overflow
     *    once the row overflows; in the fit case the rules below keep the buttons
     *    right-packed so nothing visibly moves.
     *
     *    Modern (MUI) only — the tray is a flex sibling of the profile Box inside
     *    a flex-wrap:wrap Toolbar. Lines are collected from each child's
     *    hypothetical main size BEFORE flex-shrink resolves, so an auto (content)
     *    basis claims a full line and pushes the avatar onto a second row. A
     *    0 flex-basis (flex:1 1 0 + min-width:0) collapses the tray during line
     *    collection, then grows it back into exactly the space left of the pinned
     *    avatar. An auto inline-start margin on the visually-leading child keeps
     *    the buttons packed against the avatar while the row fits (auto margins
     *    absorb free space before justify-content) and resolves to 0 on overflow.
     *    The visually-leading child is the native-tabs group (order:-1) when
     *    present, else the DOM first child — exactly one child carries the margin.
     *
     *    Legacy only — the resolved tray IS the native .headerRight, which
     *    CONTAINS the profile button as a trailing child of the scrollport.
     *    Sticky-pin it to the inline-end edge so it stays visible while the
     *    other buttons scroll beneath it (the pinned-avatar behaviour the modern
     *    layout gets for free from its separate sibling Box). In the fit case
     *    .headerRight is content-sized, so sticky is inert and nothing moves.
     */
    function ensureHeaderTrayCSS() {
        if (muiHeaderButtonCSSInjected) return;
        addCSS('je-mui-header-button-fix', `
            .MuiToolbar-root .headerButton.paper-icon-button-light {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                width: 48px !important;
                height: 48px !important;
                padding: 0 !important;
                margin: 0 !important;
                font-size: 16px !important;
            }
            .MuiToolbar-root .headerButton.paper-icon-button-light > .material-icons {
                font-size: 24px !important;
            }
            /* The repeated class bumps specificity to (0,5,0): site custom CSS is
               known to pin flex-wrap:wrap on this exact Box with !important at
               (0,4,0) as a wrap-to-second-row workaround for the old overflow bug,
               which this scroll containment supersedes. Both are !important, so
               only higher specificity can win. */
            .je-header-tray.je-header-tray.je-header-tray.je-header-tray.je-header-tray {
                display: flex !important;
                flex-wrap: nowrap !important;
                align-items: center !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow-x: auto !important;
                justify-content: flex-start !important;
                scrollbar-width: none !important;
            }
            .je-header-tray::-webkit-scrollbar {
                display: none !important;
            }
            .je-header-tray > * {
                flex: 0 0 auto !important;
            }
            /* Legacy: the tray IS .headerRight and contains the profile button. */
            .headerRight.je-header-tray > .headerUserButton {
                position: sticky !important;
                inset-inline-end: 0 !important;
                z-index: 1 !important;
            }
            /* Modern (MUI): tray is a sibling of the profile Box in the toolbar.
               Repeated class beats the (0,4,0) site-CSS flex-grow:0 override. */
            .MuiToolbar-root .je-header-tray.je-header-tray.je-header-tray.je-header-tray {
                flex: 1 1 0 !important;
            }
            /* Right-pack the buttons against the avatar while the row fits: an auto
               inline-start margin on the visually-leading child absorbs the free
               space (resolving to 0 on overflow, where flex-start takes over). The
               visually-leading child is the native-tabs group (order:-1) when
               present, else the DOM first child. The plain first-child rule is the
               :has()-free fallback for older engines; on modern engines the :has()
               rule zeroes it whenever the tabs group is the one that should carry
               the auto margin, so exactly one child ever does. */
            .MuiToolbar-root .je-header-tray > *:first-child {
                margin-inline-start: auto !important;
            }
            .MuiToolbar-root .je-header-tray > #je-native-tabs-group {
                margin-inline-start: auto !important;
            }
            .MuiToolbar-root .je-header-tray:has(> #je-native-tabs-group) > *:first-child:not(#je-native-tabs-group) {
                margin-inline-start: 0 !important;
            }
        `);
        muiHeaderButtonCSSInjected = true;
    }

    function getHeaderRightContainer() {
        // Install before any early return so legacy-only sessions get it too.
        ensureHeaderTrayCSS();

        const legacy = document.querySelector('.headerRight');
        if (legacy && legacy.offsetParent !== null) return markHeaderTray(legacy);

        const userMenuButton = document.querySelector('[aria-controls="app-user-menu"]');
        const toolbar = userMenuButton?.closest('.MuiToolbar-root') || document.querySelector('.MuiAppBar-root .MuiToolbar-root');
        if (!toolbar) return null;

        let userMenuBox = userMenuButton;
        while (userMenuBox && userMenuBox.parentElement !== toolbar) {
            userMenuBox = userMenuBox.parentElement;
        }
        const buttonsTray = userMenuBox?.previousElementSibling;
        if (buttonsTray) return markHeaderTray(buttonsTray);

        // No user-menu available (e.g. public/video pages) - fall back to a
        // synthetic container appended to the toolbar itself.
        let container = toolbar.querySelector(':scope > .headerRight');
        if (!container) {
            container = document.createElement('div');
            container.className = 'headerRight';
            toolbar.appendChild(container);
        }
        return markHeaderTray(container);
    }

    /**
     * Finds the container plugin sidebar nav links should be injected into.
     *
     * The legacy `.mainDrawer-scrollContainer` is hidden the same way `.headerRight`
     * is under Jellyfin 12's experimental layout (both live inside the
     * `display:none`-wrapped legacy AppHeader). Unlike the header, there's no
     * always-present replacement: the new drawer (`AppDrawer`/`MainDrawerContent`,
     * a MUI `SwipeableDrawer`) is itself only ever rendered at all on narrow/mobile
     * viewports - desktop has no drawer in the new layout at all, nav lives inline
     * in the toolbar instead (see getHeaderRightContainer). So on desktop there is
     * no sidebar equivalent to fall back to; this returns null there, same as if
     * nothing existed yet, and callers' existing "wait and retry" logic covers it.
     * @returns {HTMLElement|null}
     */
    function getSidebarContainer() {
        const legacy = document.querySelector('.mainDrawer-scrollContainer');
        if (legacy && legacy.offsetParent !== null) return legacy;

        // The dashboard/settings pages render their own MUI drawer (admin nav),
        // which also matches `.MuiDrawer-paper` - there's nothing in the class
        // name that distinguishes it from the home/library drawer. Plugin nav
        // links belong in the home sidebar only, so bail out here rather than
        // injecting into the admin drawer.
        if (document.body.classList.contains('dashboardDocument')) {
            return null;
        }

        // MUI's global stable class for the drawer's sliding panel. `keepMounted`
        // on the SwipeableDrawer means this exists in the DOM even while closed.
        const muiDrawerPanel = document.querySelector('.MuiDrawer-paper');
        if (!muiDrawerPanel) return null;

        // The injected section reuses the legacy navMenuOption markup, whose
        // em-based padding and icon sizing were tuned for the legacy drawer. The
        // MUI drawer's native NAV rows (Libraries etc.) are ListItemButtons with
        // 8px 16px padding and a 36px ListItemIcon box starting at x=26 (text at
        // x=62 — measured; the taller server row above them uses a different 56px
        // slot). Untouched legacy rows sit visibly indented and cramped next to
        // them. Align the injected rows to the nav-row geometry — scoped to the
        // MUI drawer so the legacy drawer keeps its native look.
        if (!muiDrawerCSSInjected) {
            addCSS('je-mui-drawer-fix', `
                .MuiDrawer-paper .jellyfinEnhancedSection a.navMenuOption {
                    display: flex !important;
                    align-items: center !important;
                    padding: 8px 16px !important;
                    min-height: 45px !important;
                }
                .MuiDrawer-paper .jellyfinEnhancedSection .navMenuOptionIcon {
                    min-width: 36px !important;
                    width: auto !important;
                    margin: 0 0 0 10px !important;
                    font-size: 24px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: flex-start !important;
                }
                .MuiDrawer-paper .jellyfinEnhancedSection .sidebarHeader {
                    padding-left: 16px !important;
                }
            `);
            muiDrawerCSSInjected = true;
        }

        return muiDrawerPanel.querySelector('[role="presentation"]') || muiDrawerPanel;
    }

    /**
     * Wait for a condition to be true
     * @param {Function} condition - Function that returns boolean
     * @param {number} timeout - Maximum wait time in ms (default: 5000)
     * @param {number} interval - Check interval in ms (default: 100)
     * @returns {Promise<boolean>}
     */
    function waitForCondition(condition, timeout = 5000, interval = 100) {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const checkCondition = () => {
                if (condition()) {
                    resolve(true);
                    return;
                }

                if (Date.now() - startTime >= timeout) {
                    console.warn('🪼 Jellyfin Enhanced: Timeout waiting for condition');
                    resolve(false);
                    return;
                }

                setTimeout(checkCondition, interval);
            };

            checkCondition();
        });
    }

    /**
     * Add custom CSS to the page
     * @param {string} id - Unique ID for the style element
     * @param {string} css - The CSS content
     */
    function addCSS(id, css) {
        // Remove existing style with same ID
        const existing = document.getElementById(id);
        if (existing) {
            existing.remove();
        }

        const style = document.createElement('style');
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);

        console.log(`🪼 Jellyfin Enhanced: Added CSS: ${id}`);
    }

    /**
     * Remove CSS by ID
     * @param {string} id - The style element ID
     * @returns {boolean} True if removed
     */
    function removeCSS(id) {
        const existing = document.getElementById(id);
        if (existing) {
            existing.remove();
            console.log(`🪼 Jellyfin Enhanced: Removed CSS: ${id}`);
            return true;
        }
        return false;
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        disconnectAllObservers();
    });

    // HTML-escape user-controlled strings before passing to JE.toast (which uses innerHTML)
    // or other innerHTML sinks. Call from any module instead of redefining per-IIFE.
    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Creates an external-link <a> that Jellyfin's native apps open in the system
     * browser (iOS SFSafariViewController, Android Custom Tabs) via `is="emby-linkbutton"`.
     *
     * Use this for every external URL in the plugin — one place, consistent behaviour.
     *
     * @param {string} url
     * @param {object} [options]
     * @param {string}   [options.text]       - Text content.
     * @param {string}   [options.title]      - Tooltip.
     * @param {string}   [options.className]  - CSS class(es).
     * @param {boolean}  [options.resetStyle] - Strip emby-button chrome for plain-link appearance.
     * @param {Function} [options.setup]      - Callback(el) for extra DOM work.
     * @returns {HTMLAnchorElement}
     */
    function createExternalLink(url, options = {}) {
        const a = document.createElement('a');
        // This attribute is what tells Jellyfin's native app shell to open the URL
        // in the system browser instead of the in-app WebView.
        a.setAttribute('is', 'emby-linkbutton');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        if (options.title)     a.title = options.title;
        if (options.className) a.className = options.className;
        if (options.text)      a.textContent = options.text;
        if (options.resetStyle) {
            // Strip the default emby-button chrome (padding, background, border-radius)
            // so the element renders as a plain unstyled link.
            a.style.cssText = 'padding:0;background:none;border-radius:0;min-width:0;';
        }
        if (typeof options.setup === 'function') options.setup(a);
        return a;
    }

    // Expose helpers
    JE.helpers = {
        onViewPage,
        onNavigate,
        getItemCached,
        getCurrentView,
        createObserver,
        onBodyMutation,
        removeBodySubscriber,
        disconnectObserver,
        disconnectAllObservers,
        getHeaderRightContainer,
        getSidebarContainer,
        waitForElement,
        waitForCondition,
        debounce,
        throttle,
        withConcurrencyLimit,
        retry,
        isElementVisible,
        addCSS,
        removeCSS,
        escHtml,
        createExternalLink,
        isSafeAvatarUrl,
        resolveProtectedAvatarUrl,
        hydrateAvatarImages,
        clearAvatarObjectUrlCache,
        getHandlerCount: () => handlers.length,
        getObserverCount: () => activeObservers.size,
        getBodySubscriberCount: () => bodySubscribers.size
    };

    console.log('🪼 Jellyfin Enhanced: Helpers initialized successfully');

})(window.JellyfinEnhanced);
