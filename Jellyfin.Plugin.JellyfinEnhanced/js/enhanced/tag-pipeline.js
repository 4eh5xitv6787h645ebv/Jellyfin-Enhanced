/**
 * @file Unified tag pipeline for Jellyfin Enhanced
 * Replaces the 5 independent scan/fetch/queue loops in the tag systems with a single
 * pipeline: ONE scan → ONE batch fetch → shared first-episode/series cache → fan out to renderers.
 *
 * Each tag module (genre, language, quality, rating) registers a pure renderer function.
 * The pipeline handles all scanning, fetching, caching, and scheduling.
 */
(function(JE) {
    'use strict';

    // ── Configuration ──────────────────────────────────────────────────

    const MEDIA_TYPES = new Set(['Movie', 'Episode', 'Series', 'Season', 'BoxSet']);
    const FETCH_DEBOUNCE_MS = 150; // Debounce only the batch API call, not the scan
    const logPrefix = '🪼 Jellyfin Enhanced [TagPipeline]:';
    let serverCache = null; // Map<itemId, TagCacheEntry> loaded from server
    let serverCacheVersion = 0;
    let serverCacheTimestamp = 0;

    // ── State ──────────────────────────────────────────────────────────

    const renderers = new Map();        // name → { render, isEnabled, needsFirstEpisode, needsParentSeries }
    let processedCards = new WeakSet(); // let, not const — needs reassignment on reinit
    const firstEpisodeCache = new Map(); // seriesId → Promise<item|null>
    const parentSeriesCache = new Map(); // seriesId → Promise<item|null>
    let fetchTimer = null;
    let isProcessing = false;
    let batchGeneration = 0; // Incremented on navigation to cancel stale in-flight batches
    let requestQueue = [];               // { el, itemId, itemType }

    // ── Pipeline-level exclusions ─────────────────────────────────────
    // Elements matching these selectors are skipped before any renderer runs.
    // This catches contexts where tags should never appear regardless of which
    // renderers are enabled, and avoids the cardScalable vs cardImageContainer
    // mismatch that can cause renderer-level shouldIgnoreElement to miss.
    const PIPELINE_SKIP_SELECTORS = [
        '.chapterCardImageContainer',           // Scenes / chapters
        '#indexPage .verticalSection.MyMedia .cardImageContainer', // My Media row
        '.formDialog .cardImageContainer',       // Modal dialogs
        '#pluginsPage .cardImageContainer',      // Admin pages
        '#pluginCatalogPage .cardImageContainer',
        '#devicesPage .cardImageContainer',
        '#mediaLibraryPage .cardImageContainer',
    ];

    /**
     * Check if an element should be skipped by the pipeline entirely.
     * @param {HTMLElement} el - The cardImageContainer element.
     * @returns {boolean}
     */
    function shouldSkipElement(el) {
        return PIPELINE_SKIP_SELECTORS.some(sel => el.matches(sel) || el.closest(sel));
    }

    // ── Renderer Registration ──────────────────────────────────────────

    /**
     * Register a tag renderer with the pipeline.
     * @param {string} name - Unique renderer name (e.g., 'genre', 'quality')
     * @param {Object} config
     * @param {Function} config.render - (el, item, extras) => void. Renders the overlay.
     *   `extras` contains: { firstEpisode, parentSeries }
     * @param {Function} config.isEnabled - () => boolean. Checked before rendering.
     * @param {Function} [config.renderFromCache] - (el, itemId) => boolean. Try to render from
     *   localStorage/hot cache without any API call. Returns true if rendered successfully.
     *   This is called BEFORE any batch fetch to handle revisited pages instantly.
     * @param {boolean} [config.needsFirstEpisode=false] - Whether Series/Season items need first episode data.
     * @param {boolean} [config.needsParentSeries=false] - Whether Season items need parent Series data.
     * @param {Function} [config.injectCss] - Called once on registration to inject styles.
     * @param {Function} [config.cleanup] - Called to clean up old overlays before re-render.
     */
    function registerRenderer(name, config) {
        renderers.set(name, {
            render: config.render,
            renderFromCache: config.renderFromCache || null,
            renderFromServerCache: config.renderFromServerCache || null,
            onServerCacheRefresh: config.onServerCacheRefresh || null,
            isEnabled: config.isEnabled,
            needsFirstEpisode: config.needsFirstEpisode || false,
            needsParentSeries: config.needsParentSeries || false,
            injectCss: config.injectCss || null,
            cleanup: config.cleanup || null,
        });
        if (config.injectCss) {
            try { config.injectCss(); } catch (e) {
                console.warn(`${logPrefix} Failed to inject CSS for ${name}:`, e);
            }
        }
        console.log(`${logPrefix} Renderer registered: ${name} (total: ${renderers.size})`);

        // If cards are already on the page (renderer registered after initial scan),
        // clear processed set and rescan so existing cards get this renderer's tags.
        if (processedCards && typeof scheduleScan === 'function') {
            processedCards = new WeakSet();
            scheduleScan();
        }
    }

    // ── Shared Data Fetching ───────────────────────────────────────────

    /**
     * Get the first episode of a series/season (cached, shared across all renderers).
     */
    async function getFirstEpisode(userId, parentId) {
        if (firstEpisodeCache.has(parentId)) return firstEpisodeCache.get(parentId);

        const promise = (async () => {
            try {
                const response = await ApiClient.ajax({
                    type: 'GET',
                    url: ApiClient.getUrl('/Items', {
                        ParentId: parentId,
                        IncludeItemTypes: 'Episode',
                        Recursive: true,
                        SortBy: 'PremiereDate',
                        SortOrder: 'Ascending',
                        Limit: 1,
                        Fields: 'MediaStreams,MediaSources,Genres',
                        userId: userId
                    }),
                    dataType: 'json'
                });
                return response?.Items?.[0] || null;
            } catch {
                return null;
            }
        })();

        firstEpisodeCache.set(parentId, promise);
        return promise;
    }

    /**
     * Get the parent series item (cached, shared across all renderers).
     */
    async function getParentSeries(userId, seriesId) {
        if (parentSeriesCache.has(seriesId)) return parentSeriesCache.get(seriesId);

        const promise = (async () => {
            try {
                return JE.helpers?.getItemCached
                    ? await JE.helpers.getItemCached(seriesId, { userId })
                    : await ApiClient.getItem(userId, seriesId);
            } catch {
                return null;
            }
        })();

        parentSeriesCache.set(seriesId, promise);
        return promise;
    }

    // ── Server Cache ───────────────────────────────────────────────────

    /**
     * Load the pre-computed tag cache from the server.
     * If available, tags render entirely from this cache with zero batch API calls.
     * Falls back to the existing batch POST pipeline if the cache is empty or unavailable.
     * @returns {Promise<void>}
     */
    async function loadServerCache() {
        if (!JE.pluginConfig?.TagCacheServerMode) {
            console.log(`${logPrefix} Server cache mode disabled`);
            return;
        }
        try {
            const userId = ApiClient.getCurrentUserId();
            if (!userId) return;

            const resp = await ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl(`/JellyfinEnhanced/tag-cache/${userId}`),
                dataType: 'json'
            });

            if (resp && resp.items && resp.count > 0) {
                serverCache = new Map(Object.entries(resp.items));
                serverCacheVersion = resp.version;
                serverCacheTimestamp = resp.timestamp;
                console.log(`${logPrefix} Server cache loaded: ${serverCache.size} items (v${serverCacheVersion})`);
            } else {
                console.log(`${logPrefix} Server cache empty, using batch fallback`);
            }
        } catch (err) {
            console.warn(`${logPrefix} Failed to load server cache, using batch fallback:`, err);
        }
    }

    /**
     * Fetch incremental server cache updates since last load.
     * @returns {Promise<void>}
     */
    async function refreshServerCache() {
        // If server cache was never loaded (e.g. cache was empty at startup),
        // retry the full load — the scheduled task may have built it since then
        if (!serverCache) {
            await loadServerCache();
            if (serverCache) {
                // Cache is now available — rescan cards to render from it
                processedCards = new WeakSet();
                runScan();
            }
            return;
        }
        if (!serverCacheTimestamp) return;
        try {
            const userId = ApiClient.getCurrentUserId();
            if (!userId) return;

            const resp = await ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl(`/JellyfinEnhanced/tag-cache/${userId}?since=${serverCacheTimestamp}`),
                dataType: 'json'
            });

            if (resp && resp.items) {
                const newEntries = Object.entries(resp.items);
                if (newEntries.length > 0) {
                    for (const [id, entry] of newEntries) {
                        serverCache.set(id, entry);
                    }
                    serverCacheTimestamp = resp.timestamp;
                    // Notify renderers to invalidate derived caches for updated items
                    for (const [, renderer] of renderers) {
                        if (renderer.onServerCacheRefresh) {
                            try { renderer.onServerCacheRefresh(newEntries.map(e => e[0])); } catch {}
                        }
                    }
                    console.log(`${logPrefix} Server cache updated: +${newEntries.length} items`);
                }
                // Full rebuild detected — reload everything
                if (resp.version !== serverCacheVersion) {
                    console.log(`${logPrefix} Cache version changed, reloading full cache`);
                    await loadServerCache();
                    // Clear all derived caches on full rebuild
                    for (const [, renderer] of renderers) {
                        if (renderer.onServerCacheRefresh) {
                            try { renderer.onServerCacheRefresh(null); } catch {}
                        }
                    }
                }
            }
        } catch (err) {
            console.warn(`${logPrefix} Failed to refresh server cache:`, err);
        }
    }

    // ── Card Scanning ──────────────────────────────────────────────────

    /**
     * Check whether at least one registered renderer is currently enabled.
     * @returns {boolean} True if any renderer reports enabled.
     */
    function hasAnyEnabledRenderer() {
        for (const [, r] of renderers) {
            if (r.isEnabled()) return true;
        }
        return false;
    }

    let scanScheduled = false;
    let scanGeneration = 0; // Incremented on navigation/clearProcessed to cancel stale chunked card work
    let scanAbort = new AbortController(); // Aborted alongside scanGeneration bumps — stops chunked loops at their next yield

    /**
     * Schedule scan. Coalesces multiple mutations into a single scan start.
     */
    // Use requestIdleCallback for all tag work so it never competes with
    // user interactions (hover, scroll, click). Falls back to setTimeout
    // for browsers without requestIdleCallback support.
    const scheduleIdle = typeof requestIdleCallback === 'function'
        ? (fn) => requestIdleCallback(fn, { timeout: 500 })
        : (fn) => setTimeout(fn, 16);

    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        scheduleIdle(() => {
            scanScheduled = false;
            runScan();
        });
    }

    // ── Viewport Gating ────────────────────────────────────────────────
    // Cards discovered by a scan but outside the expanded viewport are NOT
    // processed eagerly. They are handed to a single IntersectionObserver
    // (rootMargin pre-loads the next screenful) and enter the pipeline only
    // when they first approach the viewport. On huge library pages this cuts
    // the eager tag work from "every card on the page" to "what the user can
    // actually see", and the chunked queue below keeps even that work under
    // the frame budget.

    const VIEWPORT_ROOT_MARGIN = '50% 0px'; // Pre-process one extra half-screen above and below
    let cardObserver = null;            // Module-level IntersectionObserver for offscreen cards
    let observedCards = new WeakSet();  // Cards currently registered with cardObserver (never double-observe)
    let pendingCards = [];              // Discovered cards awaiting chunked processing
    let drainActive = false;            // Single-drain guard for drainPendingCards

    /**
     * Lazily create the shared IntersectionObserver for offscreen cards.
     * Fired cards are unobserved and enqueued into the normal pipeline.
     * @returns {IntersectionObserver}
     */
    function ensureCardObserver() {
        if (cardObserver) return cardObserver;
        cardObserver = new IntersectionObserver((entries, obs) => {
            const revealed = [];
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (!entry.isIntersecting) continue;
                obs.unobserve(entry.target);
                observedCards.delete(entry.target); // Allow re-observe if this batch gets cancelled
                if (!processedCards.has(entry.target)) revealed.push(entry.target);
            }
            if (revealed.length > 0) enqueueCards(revealed);
        }, { root: null, rootMargin: VIEWPORT_ROOT_MARGIN, threshold: 0 });
        return cardObserver;
    }

    /**
     * Disconnect and drop the card IntersectionObserver (recreated lazily on
     * the next scan) so stale cards from a previous page are not retained.
     */
    function resetCardObserver() {
        if (cardObserver) {
            cardObserver.disconnect();
            cardObserver = null;
        }
        observedCards = new WeakSet();
    }

    /**
     * Cancel all pending/in-flight card work: bumps the scan generation,
     * aborts chunked loops at their next yield, clears the pending queue,
     * and recreates the viewport observer.
     */
    function cancelCardWork() {
        scanGeneration++;
        scanAbort.abort();
        scanAbort = new AbortController();
        pendingCards = [];
        resetCardObserver();
    }

    /**
     * Cheap synchronous mirror of the observer's expanded viewport (viewport
     * plus half a screen above/below, matching VIEWPORT_ROOT_MARGIN).
     * Zero-size elements (cards on hidden/cached pages) report not-near so
     * they defer to the observer until actually shown.
     * @param {HTMLElement} el - Card element to test.
     * @returns {boolean} True if the card should be processed eagerly.
     */
    function isNearViewport(el) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const margin = vh * 0.5; // Matches VIEWPORT_ROOT_MARGIN
        return rect.bottom >= -margin && rect.top <= vh + margin &&
               rect.right >= 0 && rect.left <= vw;
    }

    /**
     * Run a card loop through JE.helpers.scheduleChunked so no main-thread
     * task exceeds the frame budget, wired to the current scan abort signal.
     * Falls back to a synchronous pass if helpers are not loaded yet
     * (should not happen in practice — initialize() waits for them).
     * @param {Array} items - Items to iterate.
     * @param {Function} fn - Called with (item, index).
     * @returns {Promise<boolean>} True if completed, false if aborted.
     */
    function runChunked(items, fn) {
        if (JE.helpers?.scheduleChunked) {
            return JE.helpers.scheduleChunked(items, fn, { budgetMs: 8, signal: scanAbort.signal });
        }
        for (let i = 0; i < items.length; i++) fn(items[i], i);
        return Promise.resolve(true);
    }

    /**
     * Add discovered cards to the pending queue and ensure a drain is running.
     * @param {HTMLElement[]} cards - Card elements ready for processing.
     */
    function enqueueCards(cards) {
        for (let i = 0; i < cards.length; i++) pendingCards.push(cards[i]);
        scheduleDrain();
    }

    /**
     * Start a single idle-scheduled drain of the pending card queue.
     * Re-arms itself if cards arrived while the previous drain was winding down.
     */
    function scheduleDrain() {
        if (drainActive) return;
        drainActive = true;
        scheduleIdle(() => {
            drainPendingCards()
                .catch((err) => console.warn(`${logPrefix} Card drain failed:`, err))
                .finally(() => {
                    drainActive = false;
                    if (pendingCards.length > 0) scheduleDrain();
                });
        });
    }

    /**
     * Drain the pending card queue in budget-bounded chunks, then arm the
     * debounced batch fetch for any cache misses queued by processCard.
     * Stale drains (navigation happened) stop at the next yield point; the
     * post-navigation scan re-collects any survivors.
     * @returns {Promise<void>}
     */
    async function drainPendingCards() {
        const myGeneration = scanGeneration;
        while (pendingCards.length > 0) {
            if (myGeneration !== scanGeneration) return;
            const batch = pendingCards;
            pendingCards = [];
            const completed = await runChunked(batch, processCard);
            if (!completed) return; // Aborted — cancelCardWork already cleared the queue
        }
        if (myGeneration !== scanGeneration) return;

        // All discovered cards processed — schedule batch fetch for cache misses.
        // The debounce coalesces rapid successive drains (scroll bursts) into one POST.
        if (requestQueue.length > 0 && !isProcessing) {
            if (fetchTimer) clearTimeout(fetchTimer);
            fetchTimer = setTimeout(() => {
                fetchTimer = null;
                processQueue();
            }, FETCH_DEBOUNCE_MS);
        }
    }

    /**
     * Process a single card through the pipeline: skip checks, server cache,
     * localStorage/hot cache, then queue a batch fetch for misses. Mirrors the
     * previous inline scan loop body — one card per call so it can run under
     * scheduleChunked without ever blocking the main thread.
     * @param {HTMLElement} el - The cardImageContainer/listItemImage element.
     * @returns {void}
     */
    function processCard(el) {
        if (processedCards.has(el)) return;
        // Skip elements no longer in the DOM (page changed)
        if (!document.contains(el)) return;

        const card = el.closest('.card');
        if (card && card.classList.contains('je-hidden')) return;
        const listItem = el.closest('.listItem');
        if (listItem && listItem.classList.contains('je-hidden')) return;

        // Skip contexts that should never have tags
        if (shouldSkipElement(el)) {
            processedCards.add(el);
            return;
        }

        const itemId = getItemId(el);
        if (!itemId) return;

        const itemType = getItemType(el);
        if (itemType && !MEDIA_TYPES.has(itemType)) {
            processedCards.add(el);
            return;
        }

        processedCards.add(el);
        // Render into cardScalable but INSERT BEFORE the overlay container
        // so Jellyfin's hover overlay naturally covers tags (DOM order).
        // Don't render into cardImageContainer — it triggers Jellyfin's
        // lazy-load to reset opacity:0, breaking image display.
        const scalable = el.closest('.cardScalable');
        let renderTarget = scalable || el;
        if (scalable) {
            const overlay = scalable.querySelector('.cardOverlayContainer');
            if (overlay) {
                // Create a tag container BEFORE the overlay
                let tagHost = scalable.querySelector('.je-tag-host');
                if (!tagHost) {
                    tagHost = document.createElement('div');
                    tagHost.className = 'je-tag-host';
                    scalable.insertBefore(tagHost, overlay);
                }
                renderTarget = tagHost;
            }
        }

        // Try server cache first (all tag data pre-computed in one object)
        const serverEntry = serverCache?.get(itemId);
        if (serverEntry) {
            for (const [, renderer] of renderers) {
                if (!renderer.isEnabled()) continue;
                if (renderer.renderFromServerCache) {
                    try { renderer.renderFromServerCache(renderTarget, serverEntry, itemId); } catch {}
                }
            }
            return; // Fully rendered from server cache, skip queue
        }

        // Fall back to localStorage/hot cache, then batch fetch for misses
        let allCacheHits = true;
        for (const [, renderer] of renderers) {
            if (!renderer.isEnabled()) continue;
            if (renderer.renderFromCache) {
                if (!renderer.renderFromCache(renderTarget, itemId)) allCacheHits = false;
            } else {
                allCacheHits = false;
            }
        }

        if (!allCacheHits) {
            requestQueue.push({ el, renderTarget, itemId, itemType });
        }
    }

    /**
     * Scan all unprocessed cards and partition by viewport proximity.
     * Near-viewport cards (current screen plus one extra half-screen each way,
     * mirroring the observer's rootMargin) are queued for immediate
     * budget-bounded processing; offscreen cards are handed to the
     * IntersectionObserver and enter the pipeline on first intersection.
     * The partition itself runs through scheduleChunked so even discovery
     * never blocks the main thread on huge pages.
     */
    function runScan() {
        if (!hasAnyEnabledRenderer()) return;
        if (typeof ApiClient === 'undefined') return;

        const elements = document.querySelectorAll('.cardImageContainer, div.listItemImage');
        const unprocessed = [];
        for (const el of elements) {
            if (!processedCards.has(el)) unprocessed.push(el);
        }
        if (unprocessed.length === 0) return;

        const observer = ensureCardObserver();
        const eager = [];
        runChunked(unprocessed, (el) => {
            if (processedCards.has(el)) return; // Drained by a concurrent batch meanwhile
            if (isNearViewport(el)) {
                eager.push(el);
            } else if (!observedCards.has(el)) {
                observedCards.add(el);
                observer.observe(el);
            }
        }).then((completed) => {
            if (completed && eager.length > 0) enqueueCards(eager);
        }).catch((err) => {
            console.warn(`${logPrefix} Card partition failed:`, err);
        });
    }

    /**
     * Extract the Jellyfin item ID from a card element.
     * @param {HTMLElement} el - Card image container element.
     * @returns {string|null} The item ID or null if not found.
     */
    function getItemId(el) {
        // From background image URL
        if (el.style?.backgroundImage) {
            const match = el.style.backgroundImage.match(/Items\/([a-f0-9]{32})\//i);
            if (match) return match[1];
        }
        // From parent data-id or data-itemid attribute (normalize to 32-char lowercase hex)
        const parent = el.closest('[data-id]') || el.closest('[data-itemid]');
        const attrId = parent?.getAttribute('data-id') || parent?.getAttribute('data-itemid');
        return attrId ? attrId.replace(/-/g, '').toLowerCase() : null;
    }

    /**
     * Extract the item type from a card element's data-type attribute.
     * @param {HTMLElement} el - Card image container element.
     * @returns {string|null} The item type or null if not found.
     */
    function getItemType(el) {
        const parent = el.closest('[data-type]');
        return parent?.getAttribute('data-type') || null;
    }

    // ── Queue Processing ───────────────────────────────────────────────

    const SERVER_BATCH_LIMIT = 200;

    /**
     * Drain the request queue in SERVER_BATCH_LIMIT-sized chunks.
     * @returns {Promise<void>}
     */
    async function processQueue() {
        if (isProcessing || requestQueue.length === 0) return;
        isProcessing = true;

        try {
            const myGeneration = batchGeneration;

            // Chunk into batches of SERVER_BATCH_LIMIT to avoid 400 errors
            while (requestQueue.length > 0) {
                if (myGeneration !== batchGeneration) break; // navigation happened
                const batch = requestQueue.splice(0, SERVER_BATCH_LIMIT);
                await processBatch(batch, myGeneration);
            }
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Fetch item data for a batch of cards and fan out to all enabled renderers.
     * @param {Array<{el: HTMLElement, renderTarget: HTMLElement, itemId: string, itemType: string}>} batch - Queued card entries.
     * @param {number} generation - Batch generation counter to detect stale navigations.
     * @returns {Promise<void>}
     */
    async function processBatch(batch, generation) {
        const userId = ApiClient.getCurrentUserId();
        if (!userId) return;

        // Use arrays per ID to handle duplicate items (same movie in multiple rows)
        const elMap = new Map();
        for (const b of batch) {
            if (!elMap.has(b.itemId)) elMap.set(b.itemId, []);
            elMap.get(b.itemId).push(b);
        }
        const ids = [...elMap.keys()];

        try {
            // Single API call for ALL cache-miss items via POST (no URL length limit)
            const response = await ApiClient.ajax({
                type: 'POST',
                url: ApiClient.getUrl(`/JellyfinEnhanced/tag-data/${userId}`),
                data: JSON.stringify(ids),
                contentType: 'application/json',
                dataType: 'json'
            });

            const items = response?.Items || [];

            // Abort if navigation happened while we were waiting for the API response
            if (generation !== batchGeneration) return;

            // Build parent series lookup for rating fallback
            const parentSeriesNeeded = new Set();
            for (const item of items) {
                if ((item.Type === 'Season' || item.Type === 'Episode') && item.SeriesId &&
                    !item.CommunityRating && !item.CriticRating) {
                    parentSeriesNeeded.add(item.SeriesId);
                }
                // Genre also needs parent series for Season items
                if (item.Type === 'Season' && item.SeriesId) {
                    parentSeriesNeeded.add(item.SeriesId);
                }
            }

            // Batch-fetch any parent series items we need (these are likely already in the same response)
            const parentSeriesMap = new Map();
            for (const item of items) {
                parentSeriesMap.set(item.Id.toString().replace(/-/g, '').toLowerCase(), item);
            }
            // For parent series not in this batch, fetch individually
            for (const seriesId of parentSeriesNeeded) {
                const normalizedId = seriesId.toString().replace(/-/g, '').toLowerCase();
                if (!parentSeriesMap.has(normalizedId)) {
                    try {
                        const parent = await getParentSeries(userId, seriesId);
                        if (parent) parentSeriesMap.set(normalizedId, parent);
                    } catch {}
                }
            }

            // Render each item as soon as its data is ready.
            // Items that DON'T need first-episode data (Movies, Episodes) render immediately.
            // Items that DO (Series, Season) render after their first-episode fetch completes.
            // This way a slow first-episode lookup doesn't block everything else.

            const renderItem = (item, firstEpisode) => {
                const itemId = item.Id.toString().replace(/-/g, '').toLowerCase();
                const batchEntries = elMap.get(itemId);
                if (!batchEntries || batchEntries.length === 0) return;
                if (!MEDIA_TYPES.has(item.Type)) return;

                let parentSeries = null;
                let ratingParentSeries = null;
                if (item.SeriesId) {
                    const parentId = item.SeriesId.toString().replace(/-/g, '').toLowerCase();
                    parentSeries = parentSeriesMap.get(parentId) || null;
                    if ((item.Type === 'Season' || item.Type === 'Episode') &&
                        !item.CommunityRating && !item.CriticRating) {
                        ratingParentSeries = parentSeries;
                    }
                }

                // Render to ALL cards with this ID (same item can appear in multiple rows)
                for (const entry of batchEntries) {
                    const { renderTarget } = entry;
                    const extras = { firstEpisode, parentSeries, ratingParentSeries, renderTarget };
                    for (const [name, renderer] of renderers) {
                        if (!renderer.isEnabled()) continue;
                        try {
                            renderer.render(renderTarget, item, extras);
                        } catch (err) {
                            console.warn(`${logPrefix} Renderer "${name}" failed for item ${itemId}:`, err);
                        }
                    }
                }
            };

            // Check if ANY enabled renderer actually needs first-episode data
            let anyNeedsFirstEp = false;
            for (const [, r] of renderers) {
                if (r.isEnabled() && r.needsFirstEpisode) { anyNeedsFirstEp = true; break; }
            }

            // Process all items: render immediately what we can, fetch first episodes in parallel
            const pendingFirstEps = [];
            for (const item of items) {
                if (anyNeedsFirstEp && item.FirstEpisode?.NeedsStreamFetch) {
                    // Series/Season: fetch first episode in background, render when ready
                    pendingFirstEps.push(
                        getFirstEpisode(userId, item.Id)
                            .then(ep => renderItem(item, ep))
                            .catch(() => renderItem(item, null))
                    );
                } else {
                    // Movies, Episodes, etc: render immediately (no extra fetch needed)
                    renderItem(item, item.FirstEpisode || null);
                }
            }

            // Wait for all first-episode renders to complete before marking batch done
            if (pendingFirstEps.length > 0) {
                await Promise.all(pendingFirstEps);
            }
        } catch (err) {
            console.warn(`${logPrefix} Batch fetch failed, falling back to individual fetches:`, err);
            // Fallback: process items individually
            for (const { renderTarget, itemId } of batch) {
                try {
                    const item = JE.helpers?.getItemCached
                        ? await JE.helpers.getItemCached(itemId, { userId })
                        : await ApiClient.getItem(userId, itemId);
                    if (!item || !MEDIA_TYPES.has(item.Type)) continue;

                    const firstEpisode = (item.Type === 'Series' || item.Type === 'Season')
                        ? await getFirstEpisode(userId, item.Id) : null;
                    const extras = { firstEpisode, parentSeries: null, ratingParentSeries: null, renderTarget };

                    for (const [, renderer] of renderers) {
                        if (!renderer.isEnabled()) continue;
                        try { renderer.render(renderTarget, item, extras); } catch {}
                    }
                } catch {}
            }
        }
    }

    // ── Indicator Offset ────────────────────────────────────────────────

    /**
     * Build CSS rules that offset top-right tag containers below Jellyfin's
     * card indicators (unwatched count, played badge). Only tags configured
     * for the top-right corner get the offset. Other positions are untouched.
     * @returns {string} CSS rules string
     */
    function buildIndicatorOffsetCSS() {
        const posMap = {
            'genre-overlay-container': JE.currentSettings?.genreTagsPosition || JE.pluginConfig?.GenreTagsPosition || 'top-right',
            'quality-overlay-container': JE.currentSettings?.qualityTagsPosition || JE.pluginConfig?.QualityTagsPosition || 'top-left',
            'language-overlay-container': JE.currentSettings?.languageTagsPosition || JE.pluginConfig?.LanguageTagsPosition || 'bottom-left',
            'rating-overlay-container': JE.currentSettings?.ratingTagsPosition || JE.pluginConfig?.RatingTagsPosition || 'bottom-right',
        };
        const topRightContainers = Object.entries(posMap)
            .filter(([, pos]) => pos === 'top-right')
            .map(([cls]) => `.cardScalable:has(.countIndicator, .playedIndicator) > .je-tag-host > .${cls}`)
            .join(',\n                ');

        if (!topRightContainers) return '';
        return `${topRightContainers} { margin-top: clamp(20px, 3vw, 30px); }`;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────

    /**
     * Initialize the tag pipeline: register mutation observer, navigation handler, and inject base CSS.
     * @returns {void}
     */
    function initialize() {
        if (!JE.helpers?.onBodyMutation) {
            console.warn(`${logPrefix} helpers.onBodyMutation not available, retrying...`);
            setTimeout(initialize, 100);
            return;
        }

        // Register as body mutation subscriber at priority 0 (after hidden-content and prefetch).
        // Only trigger scans when nodes were actually added to the DOM — ignore attribute
        // changes, text changes, and hover/focus effects which cause jank if we scan on each.
        JE.helpers.onBodyMutation('tag-pipeline', (mutations) => {
            for (let i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 0) {
                    scheduleScan();
                    return;
                }
            }
        }, { priority: 0 });

        // Also trigger on navigation
        if (JE.helpers.onNavigate) {
            JE.helpers.onNavigate(() => {
                // Invalidate any in-flight batch processing (don't reset isProcessing
                // directly — let stale batches finish naturally and discard results)
                batchGeneration++;
                firstEpisodeCache.clear();
                parentSeriesCache.clear();
                requestQueue = [];
                // Abort chunked card loops and recreate the viewport observer
                // so cards from the previous page are never retained/processed
                cancelCardWork();
                // Pick up any new items added since last load
                refreshServerCache();
                scheduleScan();
            });
        }

        // Inject CSS containment for all tag overlay containers.
        // This tells the browser these elements are independent from the rest of the
        // card layout, so hover transforms don't trigger re-layout/re-paint of overlays.
        // will-change:transform promotes each container to its own compositor layer.
        if (JE.helpers?.addCSS) {
            // Base CSS: tag host and containment
            JE.helpers.addCSS('je-tag-pipeline-perf', `
                .je-tag-host {
                    position: absolute !important;
                    top: 0; left: 0; right: 0; bottom: 0;
                    pointer-events: none;
                    overflow: visible;
                    z-index: 0;
                }
                .je-tag-host .genre-overlay-container,
                .je-tag-host .quality-overlay-container,
                .je-tag-host .language-overlay-container,
                .je-tag-host .rating-overlay-container {
                    contain: layout style;
                    pointer-events: none;
                    z-index: auto !important;
                }
                /* Offset top-right positioned tag containers when card has visible indicators
                   (unwatched count badge, played checkmark). Indicators are always top-right in Jellyfin.
                   Only affects containers configured for the top-right position. */
                ${buildIndicatorOffsetCSS()}
            `);

            // "Hide Tags on Hover" setting: fully hides the tag layer on hover.
            // Without this, Jellyfin's overlay already covers tags (they're behind it).
            // This setting makes them completely invisible for users who want zero clutter.
            JE.helpers.addCSS('je-tag-hover-fade', `
                body.je-tags-hide-on-hover .card:hover .je-tag-host {
                    opacity: 0 !important;
                    transition: opacity 0.15s ease;
                }
            `);
            // Apply the class based on current setting
            if (JE.currentSettings?.tagsHideOnHover) {
                document.body.classList.add('je-tags-hide-on-hover');
            }
        }

        // Load server cache then do initial scan.
        // Cards may have been processed during the async load (via mutation observer),
        // so clear processedCards after load to rescan with the server cache available.
        loadServerCache().then(() => {
            processedCards = new WeakSet();
            runScan();
        });

        console.log(`${logPrefix} Initialized`);
    }

    // ── Expose API ─────────────────────────────────────────────────────

    JE.tagPipeline = {
        registerRenderer,
        initialize,
        getFirstEpisode,
        getParentSeries,
        /** @param {string} name - Renderer name (e.g. 'quality'). */
        getRenderer(name) { return renderers.get(name); },
        // For reinitialize support
        clearProcessed() {
            processedCards = new WeakSet(); // Create fresh WeakSet so all cards get re-scanned
            requestQueue = [];
            batchGeneration++;
            firstEpisodeCache.clear();
            parentSeriesCache.clear();
            cancelCardWork(); // Abort chunked loops, drop pending queue, recreate viewport observer
        },
        scheduleScan,
    };

    console.log(`${logPrefix} Module loaded`);

})(window.JellyfinEnhanced);
