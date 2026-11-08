import { apiClient, hasApiClient, type TagRuntimeBridge, type UrlParams } from '../../../host/tag-runtime-host';
import { errorStatus, finite, idText, isRecord, memberRecord, members, normalizeItemId, record, records, stringList, type JsonRecord } from './dto';
import type { PipelineApi, PipelineRenderer, PipelineRendererConfig, RenderExtras } from './contract';
import type { SnapshotBase } from './tag-cache-store';

type EntryPairs = Array<[string, JsonRecord]>;
interface ItemFacts { entry: JsonRecord; fetchedAt: number; expires: number; seasonKey: string | null }
/** The token a card waits on while its look needs item data. */
type CardWait = false | undefined | { cardId: string; generation: number };
interface ScannedCard { el: HTMLElement; itemId: string; itemType: string | null; reuse: number }
interface QueuedCard extends ScannedCard { renderTarget: HTMLElement; cardId: string; awaiting: CardWait }
interface StoredStream { scope: string; token: string; count: number }
type FullLoad = { unbounded: true } | { unbounded?: false; resp: JsonRecord; entries: EntryPairs; pages: number; stored?: { scope: string; servedAt: number; count: number } };
interface AccessOutcome { applied: boolean; dropped: string[] }

/** Server entries are records keyed by item id; anything else cannot render. */
function entryPairs(items: unknown): EntryPairs {
    return Object.entries(record(items)).filter((pair): pair is [string, JsonRecord] => isRecord(pair[1]));
}
const servedAtOf = (resp: JsonRecord): number => (typeof resp.servedAt === 'number' ? resp.servedAt : 0);
const textOrEmpty = (value: unknown): string => (typeof value === 'string' ? value : '');
const cursorOf = (resp: JsonRecord): number => finite(resp.timestamp) ?? 0;
/**
 * @file Unified tag pipeline for Jellyfin Enhanced
 * Replaces the 5 independent scan/fetch/queue loops in the tag systems with a single
 * pipeline: ONE scan → ONE batch fetch → shared first-episode/series cache → fan out to renderers.
 *
 * Each tag module (genre, language, quality, rating) registers a pure renderer function.
 * The pipeline handles all scanning, fetching, caching, and scheduling.
 */
/** A response's first item. A later item never stands in for a first one that is not an item. */
function firstItem(response: JsonRecord): JsonRecord | null {
    const first: unknown = Array.isArray(response.Items) ? response.Items[0] : null;
    return isRecord(first) ? first : null;
}

export function createTagPipeline(JE: TagRuntimeBridge) {

    // ── Configuration ──────────────────────────────────────────────────

    const MEDIA_TYPES = new Set(['Movie', 'Episode', 'Series', 'Season', 'BoxSet', 'Video']);
    const isMediaType = (type: unknown): boolean => typeof type === 'string' && MEDIA_TYPES.has(type);
    const FETCH_DEBOUNCE_MS = 150; // Debounce only the batch API call, not the scan
    // Minimum spacing between the `?since=` deltas that navigations trigger.
    // Each delta is a full walk of the server's cache for this user, and a
    // browsing burst (a few pages in quick succession) can't have new library
    // items on every step: one delta per 20 s picks them up within a page or
    // two of being added, while rapid navigation collapses to a single
    // request. Explicit refreshes (invalidation, user switch, a cache that was
    // empty at startup) are not spaced out — see the navigation handler.
    const NAV_REFRESH_MIN_INTERVAL_MS = 20000;
    // waitForServerCache: milliseconds before each delta (about five minutes in
    // all; the server's background warm is rate-limited, so a large library
    // takes a while).
    const SERVER_CACHE_WAIT_DELAYS = [2000, 3000, 5000, 5000, 10000, 10000, 15000, 15000, 30000, 30000, 30000, 30000, 60000, 60000];
    const logPrefix = '🪼 Jellyfin Enhanced [TagPipeline]:';

    // ── Server cache state ─────────────────────────────────────────────
    //
    // Entries come from the server's pre-computed cache and live in two places:
    // `serverCache` in memory and, when the browser allows it, a per-user copy
    // in IndexedDB (tags/tag-cache-store.js). The first load downloads the
    // whole cache — memory then holds every entry (serverCacheComplete) — and
    // persists it in idle slices. Every later page load restores from the
    // stored copy instead: memory starts empty and fills from IndexedDB as
    // cards ask for entries, while a `?since=` request fetches only what
    // changed. The stored copy is scoped to server + user because the payload
    // is filtered (library access) and spoiler-stripped for the user who
    // fetched it, and it records the filter revision it was made under: a
    // restored copy renders nothing until that first `?since=` answer confirms
    // the revision (and version) still match — access or Spoiler Guard changed
    // (possibly elsewhere) means a full download instead, so a stale filter or
    // strip never reaches a card. Without IndexedDB
    // (private mode, quota, errors) this is exactly the old behaviour: one full
    // download per page load, memory only.

    let serverCache: Map<string, JsonRecord> | null = null;          // Map<itemId, TagCacheEntry>; null = not in use (batch fallback)
    let serverCacheComplete = false; // memory holds every entry the server has for this user
    let serverCacheVersion: unknown = 0;
    let serverCacheTimestamp = 0;
    let serverFilterRevision: string | null = null; // filter revision memory was made under (access + Spoiler Guard, from the server)
    let serverFilterBase = '';       // the same without access: equal across an access-only change, which a delta can reconcile
    let cacheGeneration = 0;         // bumped whenever memory is replaced or dropped
    let storeGate: Promise<void> | null = null;            // Promise while a restored copy awaits confirmation; lookups wait on it
    let openStoreGate: (() => void) | null = null;        // resolves storeGate
    const deltaIds = new Set<string>();      // ids memory holds from a delta (newer than the stored copy until persisted)
    let deltaInFlight: { epoch: number; generation: number; promise: Promise<void> } | null = null;        // { promise, epoch, generation } of the running fetchDelta(), shared by load and refresh
    let storeBaseServedAt = 0;       // capture time of the stored snapshot this page restored and confirmed
    let storeScope: string | null = null;           // `${serverId}:${userId}` while the stored copy backs lookups/writes
    let persistGeneration = 0;       // bumped whenever queued stored-copy writes must stop
    let persistChain: Promise<void> = Promise.resolve(); // stored-copy writes run one after another
    const storeMisses = new Set<string>();   // ids the stored copy has no entry for (never ask IndexedDB twice)
    let skipStoreThisSession = false; // server answered empty or disabled: don't restore a stored copy
    let perCardThisSession = false;   // a full load could not stay bounded (no stored copy for a large library): cards ask per batch
    let loadInFlight: Promise<void> | null = null;         // Promise of the running loadServerCache(), shared by concurrent callers
    let loadInFlightEpoch = 0;       // session epoch that load was started for
    let refreshInFlight: Promise<void> | null = null;      // Promise of the running refreshServerCache()
    let serverCacheWait = 0;         // bumped to end the running waitForServerCache()
    let lastNavigationRoute: string | null = null;  // route key of the last navigation the pipeline acted on (see navigationRoute)
    let lastNavRefreshAt = -Infinity; // performance.now() of the last navigation-triggered delta
    let navRefreshTimer: ReturnType<typeof setTimeout> | null = null;      // trailing delta for navigations that fell inside the minimum interval
    let reviewRatings: Map<string, number> | null = null;        // Map<"mediaType:tmdbKey", average> from the payload; null = unavailable
    let reviewRatingsRequestedAt = 0; // performance.now() when the request behind reviewRatings started
    const reviewRatingsListeners = new Set<(changed: Set<string> | null) => void>(); // called with the changed keys (Set, or null = all) when averages change
    const PERSIST_SLICE = 250;       // entries per idle-slice write (each put clones its entry on this thread)
    const PERSIST_START_DELAY_MS = 1500; // let the page's first tag scans have the idle time before persisting
    // Shape of the stored entries (the server's tag cache schema they were
    // written under). A stored copy of another shape is dropped on restore and
    // downloaded in full, so new entry fields never wait for a server rebuild
    // that happens to change the cache version. Current schema: Awards, Logos and Custom matches.
    // Use the store identity in the bundle; standalone fallback has the same entry schema.
    const STORED_ENTRY_SCHEMA = JE.tagCacheStore?.ENTRY_SCHEMA ?? 10;
    const MEMORY_SOFT_CAP = 20000;
    // A full load comes in pages of this many entries (GET tag-cache?limit=&after=): no response, parse or
    // string holds the whole library. A server without paging answers the first request in full.
    const FULL_LOAD_PAGE = 2000;
    // Every page must come from one cache generation and filter; a load that saw them change starts over at
    // most this many times (after a short pause), then leaves the cards to the batch route until the next
    // navigation tries again. It never asks for the whole cache in one response.
    const FULL_LOAD_RESTARTS = 2;
    const FULL_LOAD_RESTART_DELAYS = [0, 1500, 4000];
    const TAG_SETTING_KEYS = ['qualityTagsEnabled', 'genreTagsEnabled', 'ratingTagsEnabled', 'ageRatingTagsEnabled', 'statusTagsEnabled', 'languageTagsEnabled', 'awardsTagsEnabled', 'logoTagsEnabled', 'customTagsEnabled'];   // entries kept in memory on the stored-copy path before it is reset

    // ── State ──────────────────────────────────────────────────────────

    const renderers = new Map<string, PipelineRenderer>();        // name → { render, isEnabled, needsFirstEpisode, needsParentSeries }
    let processedCards = new WeakSet<Element>(); // let, not const — needs reassignment on reinit
    const firstEpisodeCache = new Map<string, Promise<JsonRecord | null>>(); // seriesId → Promise<item|null>
    // Caller-filtered Series/Season facts from /tag-data, shared with server-cache readers.
    const seasonFactIds = new Map<string, string>(); // seriesId:season → normalized season id
    const itemFacts = new Map<string, ItemFacts>(); // normalized id → { entry, fetchedAt, expires, seasonKey }
    const ITEM_FACTS_TTL_MS = 10 * 60 * 1000;
    const parentSeriesCache = new Map<string, Promise<JsonRecord | null>>(); // seriesId → Promise<item|null>
    let fetchTimer: ReturnType<typeof setTimeout> | null = null;
    let pipelineStarted = false;           // initialize() has wired the observers and loaded the server cache
    let startWhenRendererRegisters = false; // initialize() ran with no tag type enabled
    let deferredLoad: { forceDownload: boolean } | null = null;               // { forceDownload } of an invalidation that skipped its reload (no tag type on)
    let loadStartedForEpoch: number | null = null;        // session epoch in which a renderer registration started the load
    let isProcessing = false;
    let batchGeneration = 0; // Incremented on navigation to cancel stale in-flight batches
    /** Release a retired drain even if a first-episode request is still pending. */
    let cancelBatchWait: (() => void) | null = null;
    function advanceBatchGeneration() {
        batchGeneration++;
        cancelBatchWait?.();
    }
    let activeBatch: QueuedCard[] = [];               // entries whose request is currently in flight
    let requestQueue: QueuedCard[] = [];               // { el, renderTarget, itemId, itemType, cardId, awaiting, reuse }
    const cardReuse = new WeakMap<Element, number>();     // card image → times its card was reused for another item (see releaseReusedCards)
    // The server's effective data-affecting strip policy for /tag-data answers
    // ("none": nothing; SpoilerTagDataStripper.TagStripRevision): the page-load
    // bootstrap's value, then that of the latest batch answer (batches run one
    // at a time, and a cancelled one's answer is dropped). Null while unknown:
    // after a user switch or Spoiler Guard change until the next answer.
    // Renderers keeping /tag-data results across page loads stamp them with it
    // and fetch again when it differs (core/tag-renderer-base.js).
    let prefetchedStripRevision: unknown;
    try { prefetchedStripRevision = JE.takePrefetched?.('TagStripRevision'); } catch { /* Unknown until an authoritative answer. */ }
    let tagStripRevision = typeof prefetchedStripRevision === 'string' ? prefetchedStripRevision : null;

    /**
     * Remove a container fact and the season lookup owned by it.
     * @param id - Normalized item id.
     * */
    function forgetItemFacts(id: string): void {
        const saved = itemFacts.get(id);
        if (saved?.seasonKey && seasonFactIds.get(saved.seasonKey) === id) seasonFactIds.delete(saved.seasonKey);
        itemFacts.delete(id);
    }

    /**
     * Retain only caller-filtered container projections, including stripped facts.
     * @param entry - A server entry or /tag-data item.
     * @param id - Its item id.
     * @param [fetchedAt] - Original fetch time; cached redraws retain it.
     * */
    function rememberItemFacts(entry: JsonRecord, id: unknown = entry.Id, fetchedAt: number = Date.now()): void {
        if (!id || (entry.Type !== 'Series' && entry.Type !== 'Season')) return;
        const itemId = normalizeItemId(id);
        // A redraw cannot revive an expired fetch or replace newer shared facts.
        if (!Number.isFinite(fetchedAt) || fetchedAt + ITEM_FACTS_TTL_MS <= Date.now()
            || (itemFacts.get(itemId)?.fetchedAt ?? -Infinity) > fetchedAt) return;
        forgetItemFacts(itemId);
        const seriesId = entry.SeriesId ? normalizeItemId(entry.SeriesId) : null;
        const seasonKey = entry.Type === 'Season' && seriesId ? `${seriesId}:${entry.SeasonNumber ?? entry.IndexNumber}` : null;
        if (seasonKey) {
            const previousId = seasonFactIds.get(seasonKey);
            if (previousId) forgetItemFacts(previousId);
            seasonFactIds.set(seasonKey, itemId);
        }
        itemFacts.set(itemId, { entry, fetchedAt, expires: fetchedAt + ITEM_FACTS_TTL_MS, seasonKey });
        // Map insertion order implements oldest-first eviction for each store.
        for (const oldest of itemFacts.keys()) {
            if (itemFacts.size <= MEMORY_SOFT_CAP) break;
            forgetItemFacts(oldest);
        }
        for (const [key, seasonId] of seasonFactIds) {
            if (seasonFactIds.size <= MEMORY_SOFT_CAP) break;
            seasonFactIds.delete(key);
            forgetItemFacts(seasonId);
        }
    }

    /** @param id @returns A fresh, caller-filtered projection. */
    function peekItemFacts(id: string): JsonRecord|null {
        const entry = serverCache?.get(id);
        if (entry) return entry;
        const saved = itemFacts.get(id);
        if (saved && saved.expires > Date.now()) return saved.entry;
        forgetItemFacts(id);
        return null;
    }

    /**
     * Warm parent facts through the confirmed server cache or the same filtered
     * /tag-data projection used for cards. Native parent DTOs lack these aggregates.
     * @param ids - Normalized parent ids.
     * */
    async function lookupItemFacts(ids: readonly string[]): Promise<void> {
        const generation = cacheGeneration;
        const epoch = JE.session ? JE.session.getEpoch() : 0;
        await lookupServerEntries(ids);
        if (generation !== cacheGeneration || (JE.session && !JE.session.isCurrent(epoch))) return;
        const missing = [...new Set(ids)].filter(id => !peekItemFacts(id));
        const userId = apiClient().getCurrentUserId();
        if (!userId) return;
        for (let i = 0; i < missing.length; i += 200) {
            try {
                const response = record(await apiClient().ajax({
                    type: 'POST',
                    url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`, { latestEpisode: true }),
                    data: JSON.stringify(missing.slice(i, i + 200)),
                    contentType: 'application/json', dataType: 'json'
                }));
                if (generation !== cacheGeneration || (JE.session && !JE.session.isCurrent(epoch))) return;
                for (const entry of members(response.Items)) rememberItemFacts(memberRecord(entry));
            } catch { /* Missing or inaccessible parents never supply a fallback. */ }
        }
    }

    /**
     * A season aggregate already fetched for this caller, as a local fallback.
     * @param seriesId @param {number} season
     * */
    function peekSeasonFacts(seriesId: string, season: number): JsonRecord|null {
        const id = seasonFactIds.get(`${seriesId}:${season}`);
        return id ? peekItemFacts(id) : null;
    }

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
        '.listItemImage:not(.listItemImage-large)', // Small list rows (Playlists, Albums); listItemImage-large (e.g. episode lists) is big enough for overlays
        '.jellyseerr-card .cardImageContainer',  // Seerr cards (search, discovery, recommendations): TMDB posters, no Jellyfin item id, so they can never get tags — mark them processed instead of re-walking them on every scan
    ];
    // One ancestor walk per card: closest() with a selector list matches the
    // element itself or any ancestor against every selector in one pass, which
    // is what matches()||closest() per selector did in eight passes.
    const PIPELINE_SKIP_SELECTOR = PIPELINE_SKIP_SELECTORS.join(', ');

    /**
     * Check if an element should be skipped by the pipeline entirely.
     * @param el - The cardImageContainer element.
     * */
    function shouldSkipElement(el: HTMLElement): boolean {
        return el.closest(PIPELINE_SKIP_SELECTOR) !== null;
    }

    // ── Renderer Registration ──────────────────────────────────────────

    /**
     * Register a tag renderer with the pipeline.
     * @param name - Unique renderer name (e.g., 'genre', 'quality')
     * @param config.render - (el, item, extras) => void. Renders the overlay.
     *   `extras` contains: { firstEpisode, parentSeries, ratingParentSeries, renderTarget,
     *   stripRevision } (stripRevision: the answer's Spoiler Guard tag strip revision, null
     *   when the item did not come from /tag-data)
     * @param config.isEnabled - () => boolean. Checked before rendering.
     * @param [config.renderFromCache] - (el, itemId) => boolean. Try to render from
     *   localStorage/hot cache without any API call. Returns true if rendered successfully.
     *   This is called BEFORE any batch fetch to handle revisited pages instantly.
     * @param [config.needsFirstEpisode=false] - Whether Series/Season items need first episode data.
     * @param [config.needsParentSeries=false] - Whether Season items need parent Series data.
     * @param [config.needsLatestEpisode=false] - Whether the /tag-data batch should resolve
     *   Series/Season LatestEpisodeAdded (one extra server query per container, so only on request).
     * @param [config.injectCss] - Called once on registration to inject styles.
     * @param [config.cleanup] - Called to clean up old overlays before re-render.
     */
    function registerRenderer(name: string, config: PipelineRendererConfig) {
        renderers.set(name, {
            render: config.render,
            renderFromCache: config.renderFromCache || null,
            renderFromServerCache: config.renderFromServerCache || null,
            onServerCacheRefresh: config.onServerCacheRefresh || null,
            isEnabled: config.isEnabled,
            needsFirstEpisode: config.needsFirstEpisode || false,
            needsParentSeries: config.needsParentSeries || false,
            needsLatestEpisode: config.needsLatestEpisode || false,
            injectCss: config.injectCss || null,
            cleanup: config.cleanup || null,
        });
        if (config.injectCss) {
            try { config.injectCss(); } catch (e) {
                console.warn(`${logPrefix} Failed to inject CSS for ${name}:`, e);
            }
        }
        console.log(`${logPrefix} Renderer registered: ${name} (total: ${renderers.size})`);
        // Starting now: initialize() scans once the server cache is loaded.
        // (A renderer can register late, after its user switched to one with
        // every tag type off: then there is still nothing to start.)
        if (startWhenRendererRegisters && anyTagTypeEnabled()) {
            loadStartedForEpoch = JE.session?.getEpoch?.() ?? null;
            initialize();
            return;
        }
        // The last invalidation skipped its reload while every tag type was off:
        // run it now, as that invalidation (scans held, fresh download if needed).
        if (deferredLoad && anyTagTypeEnabled()) {
            const { forceDownload } = deferredLoad;
            deferredLoad = null;
            loadStartedForEpoch = JE.session?.getEpoch?.() ?? null;
            api.invalidateServerCache({ reuseStored: !forceDownload }).catch(() => {});
            return;
        }

        // If cards are already on the page (renderer registered after initial scan),
        // clear processed set and rescan so existing cards get this renderer's tags.
        processedCards = new WeakSet();
        scheduleScan();
    }

    // ── Shared Data Fetching ───────────────────────────────────────────

    /**
     * Get the first episode of a series/season (cached, shared across all renderers).
     * @param userId The user ID.
     * @param parentId The series or season ID.
     * @param [firstEpisodeId=null] Known first episode ID, when available.
     * @returns The first episode item or null.
     */
    async function getFirstEpisode(userId: string, parentId: string, firstEpisodeId: string|null = null): Promise<JsonRecord|null> {
        const cached = firstEpisodeCache.get(parentId);
        if (cached) return cached;

        const promise = (async () => {
            // /tag-data already returns the first episode ID for Series/Season.
            // Use it directly so the normal path stays entirely inside the
            // region-aware Enhanced projection and avoids an extra /Items call.
            if (firstEpisodeId) {
                try {
                    const enriched = record(await apiClient().ajax({
                        type: 'POST',
                        url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`),
                        data: JSON.stringify([firstEpisodeId]),
                        contentType: 'application/json',
                        dataType: 'json'
                    }));

                    const episode = firstItem(enriched);
                    if (episode) return episode;
                } catch {
                    // Fall through to the native Jellyfin lookup below.
                }
            }

            try {
                const response = record(await apiClient().ajax({
                    type: 'GET',
                    url: apiClient().getUrl('/Items', {
                        ParentId: parentId,
                        IncludeItemTypes: 'Episode',
                        IsVirtualItem: false,
                        Recursive: true,
                        SortBy: 'PremiereDate',
                        SortOrder: 'Ascending',
                        Limit: 1,
                        Fields: 'MediaStreams,MediaSources,Genres',
                        userId: userId
                    }),
                    dataType: 'json'
                }));

                const episode = firstItem(response);
                if (!episode?.Id) return episode;

                // Native Jellyfin may have reduced an explicit Matroska BCP-47
                // language to its base ISO-639 code. Enrich it when possible.
                try {
                    const enriched = record(await apiClient().ajax({
                        type: 'POST',
                        url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`),
                        data: JSON.stringify([episode.Id]),
                        contentType: 'application/json',
                        dataType: 'json'
                    }));

                    return firstItem(enriched) || episode;
                } catch {
                    return episode;
                }
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
    async function getParentSeries(userId: string, seriesId: string): Promise<JsonRecord | null> {
        const cached = parentSeriesCache.get(seriesId);
        if (cached) return cached;

        const promise = (async () => {
            try {
                const item = JE.helpers?.getItemCached
                    ? await JE.helpers.getItemCached(seriesId, { userId })
                    : await apiClient().getItem(userId, seriesId);
                return isRecord(item) ? item : null;
            } catch {
                return null;
            }
        })();

        parentSeriesCache.set(seriesId, promise);
        return promise;
    }

    // ── Server Cache ───────────────────────────────────────────────────

    /**
     * Storage scope of the signed-in user's cache copy.
     * @returns `${serverId}:${userId}`, or null before sign-in.
     */
    function cacheScope(): string|null {
        const userId = JE.session?.getUserId() || apiClient().getCurrentUserId();
        if (!userId) return null;
        return `${JE.session?.getServerId() || ''}:${userId}`;
    }

    /**
     * Take the review rating averages that ride on a tag-cache response
     * (full or delta). Absent (chips off, or an older server) means the user
     * review tags ask /reviews/ratings themselves. A response whose request
     * started before the one behind the current map is older data and is
     * ignored; the start time also tells the review tags whether the map can
     * reflect a review the viewer just edited (see getReviewRatingsRequestedAt).
     * @param resp - Tag-cache response body.
     * @param requestedAt - performance.now() when its request started.
     */
    function applyReviewRatings(resp: JsonRecord, requestedAt: number) {
        if (requestedAt < reviewRatingsRequestedAt) return;
        reviewRatingsRequestedAt = requestedAt;
        const previous = reviewRatings;
        const raw = resp.reviewRatings;
        if (!isRecord(raw)) {
            reviewRatings = null;
        } else {
            const map = new Map<string, number>();
            for (const key in raw) {
                const value = raw[key];
                if (isRecord(value) && typeof value.average === 'number' && Number.isFinite(value.average)) {
                    map.set(key, value.average);
                }
            }
            reviewRatings = map;
        }
        notifyReviewRatingsChanged(previous, reviewRatings);
    }

    /**
     * Tell the review tags a newer averages map was accepted and which of its
     * values changed, so chips already on cards are updated in place. Called
     * even when no value changed: the newer map can still supersede values the
     * review tags looked up on their own (they decide; usually nothing to do).
     */
    function notifyReviewRatingsChanged(previous: Map<string, number>|null, next: Map<string, number>|null) {
        if (reviewRatingsListeners.size === 0 || (!previous && !next)) return;
        let changed: Set<string> | null = null; // null = every key (one side unavailable)
        if (previous && next) {
            changed = new Set();
            for (const [key, value] of next) {
                if (previous.get(key) !== value) changed.add(key);
            }
            for (const key of previous.keys()) {
                if (!next.has(key)) changed.add(key);
            }
        }
        for (const listener of reviewRatingsListeners) {
            try { listener(changed); } catch (err) { console.warn(`${logPrefix} review ratings listener failed:`, err); }
        }
    }

    /**
     * Forget the server cache (memory and the stored copy as a lookup source).
     * Queued stored-copy writes stop at their next slice.
     */
    function dropServerCache() {
        itemFacts.clear();
        seasonFactIds.clear();
        serverCache = null;
        serverCacheComplete = false;
        serverCacheVersion = 0;
        serverCacheTimestamp = 0;
        serverFilterRevision = null;
        cacheGeneration++;
        storeBaseServedAt = 0;
        storeScope = null;
        storeMisses.clear();
        deltaIds.clear();
        persistGeneration++;
        releaseStoreGate();
    }

    /**
     * Let lookups waiting on a restored copy proceed (it was confirmed,
     * replaced or dropped).
     */
    function releaseStoreGate(gate?: Promise<void> | null): void {
        // A confirmation only ever releases the gate it was confirming.
        if (gate !== undefined && gate !== storeGate) return;
        const open = openStoreGate;
        storeGate = null;
        openStoreGate = null;
        if (open) open();
    }

    /**
     * Queue a stored-copy write after the ones already queued. A failure gives
     * up on persistence (the store marks itself unavailable); memory is
     * unaffected either way.
     */
    function queuePersist(work: () => Promise<void>) {
        persistChain = persistChain.then(work).catch((err) => {
            console.warn(`${logPrefix} Could not persist the server cache; keeping it in memory only:`, err);
        });
    }

    /**
     * Write a freshly downloaded full cache to the stored copy in idle slices:
     * clear the scope, put the entries a slice at a time, then the meta record
     * (its presence is what marks the stored copy complete, so an interrupted
     * write is never restored). Memory already holds everything, so nothing
     * waits for this.
     * @param resp - Full tag-cache response body.
     */
    function persistFullCache(scope: string, resp: JsonRecord, entries: EntryPairs): void {
        const servedAt = servedAtOf(resp);
        if (!JE.tagCacheStore?.available()) return;
        const store = JE.tagCacheStore;
        const memoryGeneration = cacheGeneration;
        const meta = {
            schema: STORED_ENTRY_SCHEMA,
            version: resp.version,
            timestamp: resp.timestamp,
            filterRevision: textOrEmpty(resp.filterRevision),
            filterBase: textOrEmpty(resp.filterBase),
            count: entries.length,
            clearStamp: JE.pluginConfig?.ClearLocalStorageTimestamp || 0,
            servedAt,
            savedAt: Date.now(),
        };
        storeScope = scope;
        const generation = ++persistGeneration;
        queuePersist(async () => {
            // Not urgent: the page's own tag scans get the idle slices first.
            // A page closed before this runs simply downloads in full next time.
            await new Promise((resolve) => setTimeout(resolve, PERSIST_START_DELAY_MS));
            if (generation !== persistGeneration) return;
            // Claim the scope; another tab rewriting it later takes it over and
            // this write stops (every slice and the final meta check the claim).
            const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            // Another tab already stored newer data: keep it.
            if (!await store.beginFullWrite(scope, token, { servedAt })) return;
            for (let i = 0; i < entries.length; i += PERSIST_SLICE) {
                await idleYield();
                if (generation !== persistGeneration) return;
                if (!await store.putManyIfOwner(scope, token, entries.slice(i, i + PERSIST_SLICE))) return;
            }
            if (generation !== persistGeneration) return;
            if (await store.commitFullWrite(scope, token, meta)) {
                console.log(`${logPrefix} Server cache persisted: ${entries.length} items`);
                if (generation === persistGeneration && memoryGeneration === cacheGeneration) releaseCompleteMemory(scope, servedAt);
            }
        });
    }

    /**
     * Once the stored copy holds everything memory holds, a large library need not stay in memory: keep at
     * most MEMORY_SOFT_CAP entries (those deltas installed, then the most recently read) and read the rest
     * from the stored copy on demand, exactly as after a restore. Small libraries stay whole in memory.
     * @param scope - The stored copy's scope, just committed.
     * @param servedAt - Its capture time.
     */
    function releaseCompleteMemory(scope: string, servedAt: number) {
        if (!serverCacheComplete || !serverCache || serverCache.size <= MEMORY_SOFT_CAP || storeScope !== scope) return;
        const keep = new Map();
        for (const id of deltaIds) {
            const entry = serverCache.get(id);
            if (entry) keep.set(id, entry);
        }
        serverCache = keep;
        serverCacheComplete = false;
        storeBaseServedAt = servedAt;
        storeMisses.clear();
        console.log(`${logPrefix} Server cache kept in the stored copy; memory holds ${keep.size} entries`);
    }

    /**
     * Write delta entries to the stored copy and advance its cursor. Runs after
     * any full persist still queued, and applies only on top of exactly the
     * copy the delta was fetched against (see tagCacheStore.applyDelta): if
     * another tab moved the copy on, or a rewrite is in progress, nothing is
     * written and memory alone carries this delta.
     * @param entries - [itemId, entry] pairs
     * @param base - What the delta was requested against.
     * @param timestamp - The delta response's timestamp.
     * @param servedAt - When the server captured the delta (ms, server clock).
     */
    function persistDelta(entries: EntryPairs, base: SnapshotBase, timestamp: number, servedAt: number, removed: readonly string[] = []): void {
        const scope = storeScope;
        if (!scope || !JE.tagCacheStore?.available()) return;
        const store = JE.tagCacheStore;
        const generation = persistGeneration;
        queuePersist(async () => {
            if (generation !== persistGeneration) return;
            await store.applyDelta(scope, base, entries, timestamp, servedAt, removed);
        });
    }

    /**
     * Restore the stored copy for the current user, if there is a complete one
     * (other users' copies are deleted on the way). Lookups then read from it;
     * the caller fetches the delta.
     * @returns true when lookups now run against the stored copy
     */
    async function restoreStoredCache(): Promise<boolean> {
        const store = JE.tagCacheStore;
        if (!store?.available() || skipStoreThisSession) return false;
        const scope = cacheScope();
        if (!scope) return false;
        const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
        try {
            const meta = await store.getMeta(scope);
            // Other users' copies go in the background (queued ahead of any
            // persist, and only ever touching keys outside this scope), so a
            // first load isn't held up by a second transaction before its
            // full download can start.
            queuePersist(() => store.clearOtherScopes(scope));
            if (JE.session && !JE.session.isCurrent(requestEpoch)) return false;
            // Complete copies only (a pending record is a rewrite in progress),
            // written with a filter revision and capture time (older copies
            // predate them).
            const storedCursor = meta ? finite(meta.timestamp) : null;
            const storedFilter = meta?.filterRevision;
            const storedAt = meta?.servedAt;
            if (!meta || meta.pending || !(Number(meta.count) > 0) || !storedCursor
                || typeof storedFilter !== 'string' || typeof storedAt !== 'number') return false;
            // Entries stored before the entry fields last changed (server
            // schema) lack fields the renderers and tag look rules read.
            if (meta.entrySchema !== store.ENTRY_SCHEMA) return false;
            // The admin's "Clear All Client Caches" applies to this copy too.
            const clearStamp = Number(JE.pluginConfig?.ClearLocalStorageTimestamp || 0);
            if (clearStamp > Number(meta.clearStamp || 0)) {
                console.log(`${logPrefix} Server triggered cache clear; dropping the stored copy`);
                await store.clearScope(scope);
                return false;
            }
            // Written under an older entry shape (missing fields a renderer reads).
            if (meta.schema !== STORED_ENTRY_SCHEMA) {
                console.log(`${logPrefix} Stored copy has entry schema ${String(meta.schema ?? 'none')}, expected ${STORED_ENTRY_SCHEMA}; dropping it`);
                await store.clearScope(scope);
                return false;
            }
            serverCache = new Map();
            serverCacheComplete = false;
            serverCacheVersion = meta.version;
            serverCacheTimestamp = storedCursor;
            storeBaseServedAt = storedAt || 0;
            serverFilterRevision = storedFilter;
            serverFilterBase = textOrEmpty(meta.filterBase);
            cacheGeneration++;
            storeScope = scope;
            storeMisses.clear();
            deltaIds.clear();
            // Nothing renders from the copy until the first delta confirms its
            // strip revision and version (fetchDelta releases the gate).
            releaseStoreGate();
            storeGate = new Promise<void>((resolve) => { openStoreGate = resolve; });
            console.log(`${logPrefix} Server cache restored from IndexedDB: ${String(meta.count)} items (v${String(meta.version)}), awaiting confirmation`);
            return true;
        } catch (err) {
            console.warn(`${logPrefix} Could not read the stored server cache:`, err);
            return false;
        }
    }

    /**
     * Download the whole cache for the current user and make it the live copy.
     * Up to MEMORY_SOFT_CAP entries memory holds every entry and the stored
     * copy is rewritten in the background; a larger library is streamed into
     * the stored copy as it arrives and read from there as cards ask (see
     * fetchFullPages). Resolves once lookups can be answered.
     * @param [options] - fresh bypasses HTTP revalidation (always done when IndexedDB is available).
     * @returns true when the server had entries
     */
    async function downloadFullCache(options?: {fresh?: boolean}): Promise<boolean> {
        const userId = apiClient().getCurrentUserId();
        if (!userId) return false;
        const scope = cacheScope();

        // The response is spoiler-stripped for THIS user — drop it if the
        // signed-in user changed while the request was in flight.
        const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
        const requestedAt = performance.now();
        // A download that will be persisted must carry a current capture time
        // (servedAt): revalidating the browser's HTTP-cached body (304) hands
        // back the capture time of an identical older response, and a stored
        // copy (complete or an interrupted write) could look newer and refuse
        // it on every reload. With IndexedDB, full downloads are rare (first
        // load, replacements), so they always bypass revalidation; without it
        // the cache downloads on every page load and revalidation still pays.
        const fresh = (options?.fresh || JE.tagCacheStore?.available()) ? Date.now() : 0;
        const loaded = await fetchFullPages(userId, fresh, requestEpoch, scope);
        if (!loaded) return false;
        // The account changed while the load ran (its last page, or the stored copy's commit, was still on its
        // way): nothing it read or wrote may become the incoming account's memory, review averages or fallback.
        // A copy it committed stays in the outgoing account's own scope.
        if (JE.session && !JE.session.isCurrent(requestEpoch)) return false;
        if (loaded.unbounded) {
            // More than MEMORY_SOFT_CAP entries and no stored copy to put them in (private mode, storage
            // refused or full): holding the whole library would be unbounded, so cards ask per batch instead
            // for the rest of this session.
            console.log(`${logPrefix} Server cache too large to hold without a stored copy; tags load per card this session`);
            dropServerCache();
            perCardThisSession = true;
            return false;
        }
        const { resp, entries, pages } = loaded;

        applyReviewRatings(resp, requestedAt);
        if (loaded.stored) {
            // Streamed into the stored copy as it arrived: memory starts empty and fills from the copy as cards
            // ask, exactly as after a restore (the copy is this page's own, so no confirmation is needed).
            persistGeneration++;
            itemFacts.clear();
            seasonFactIds.clear();
            serverCache = new Map();
            serverCacheComplete = false;
            serverCacheVersion = resp.version;
            serverCacheTimestamp = cursorOf(resp);
            serverFilterRevision = textOrEmpty(resp.filterRevision);
            serverFilterBase = textOrEmpty(resp.filterBase);
            storeScope = loaded.stored.scope;
            storeBaseServedAt = loaded.stored.servedAt;
            cacheGeneration++;
            storeMisses.clear();
            deltaIds.clear();
            skipStoreThisSession = false;
            releaseStoreGate();
            console.log(`${logPrefix} Server cache loaded into the stored copy: ${loaded.stored.count} items (v${String(serverCacheVersion)}, ${pages} pages); memory holds what cards read`);
            if (pages > 1) fetchDelta().catch(() => {});
            return true;
        }
        if (!(entries.length > 0)) {
            console.log(`${logPrefix} Server cache empty, using batch fallback`);
            dropServerCache();
            skipStoreThisSession = true;
            return false;
        }

        persistGeneration++;
        itemFacts.clear();
        seasonFactIds.clear();
        serverCache = new Map(entries);
        serverCacheComplete = true;
        serverCacheVersion = resp.version;
        serverCacheTimestamp = cursorOf(resp);
        serverFilterRevision = textOrEmpty(resp.filterRevision);
        serverFilterBase = textOrEmpty(resp.filterBase);
        cacheGeneration++;
        storeMisses.clear();
        deltaIds.clear();
        skipStoreThisSession = false;
        // Memory is complete and current: nothing needs the stored copy now.
        releaseStoreGate();
        console.log(`${logPrefix} Server cache loaded: ${serverCache.size} items (v${String(serverCacheVersion)}${pages > 1 ? `, ${pages} pages` : ''})`);
        if (scope) persistFullCache(scope, resp, entries);
        // Entries changed or removed while later pages were read come with a delta since the first page.
        if (pages > 1) fetchDelta().catch(() => {});
        return true;
    }

    /**
     * Read the whole cache in pages of FULL_LOAD_PAGE (one response when the server does not page).
     * Every page must carry the first page's version and filter revision; otherwise the generation or
     * the user's filter changed underneath and the load starts over (at most FULL_LOAD_RESTARTS times,
     * after FULL_LOAD_RESTART_DELAYS; then null, and the cards use the batch route). Memory is bounded
     * throughout: pages accumulate up to MEMORY_SOFT_CAP entries, then the load streams what it holds and
     * every later page into the stored copy (a claimed rewrite, committed after the last page) and holds
     * none of them; without a usable stored copy it stops there ({unbounded: true}). The result carries
     * the first page's cursor (timestamp, capture time), so the caller's delta since then picks up whatever
     * changed during the load.
     * @param fresh - Cache-busting stamp (0: allow HTTP revalidation).
     * @param requestEpoch - Session epoch the load belongs to.
     * @param scope - The stored copy's scope for this user, if any.
     *   null when the user changed or every try saw the cache change.
     */
    async function fetchFullPages(userId: string, fresh: number, requestEpoch: number, scope: string | null): Promise<FullLoad | null> {
        const get = async (params: UrlParams): Promise<JsonRecord | null> => {
            const resp = await apiClient().ajax({ type: 'GET', url: apiClient().getUrl(`/JellyfinEnhanced/tag-cache/${userId}`, params), dataType: 'json' });
            return (JE.session && !JE.session.isCurrent(requestEpoch)) || !isRecord(resp) ? null : resp;
        };
        const base = fresh ? { fresh } : {};
        for (let attempt = 0; attempt <= FULL_LOAD_RESTARTS; attempt++) {
            if (FULL_LOAD_RESTART_DELAYS[attempt]) await new Promise((resolve) => setTimeout(resolve, FULL_LOAD_RESTART_DELAYS[attempt]));
            let entries: EntryPairs = [];
            // The stored copy this load writes into, once past the cap.
            let stream: StoredStream | null = null;
            let first: JsonRecord | null = null;
            let last: JsonRecord | null = null;
            let pages = 0;
            let after = '';
            let consistent = true;
            for (;;) {
                const resp = await get({ ...base, limit: FULL_LOAD_PAGE, ...(after ? { after } : {}) });
                if (resp === null) return null;
                pages++;
                if (!first) first = resp;
                else if (resp.version !== first.version || resp.filterRevision !== first.filterRevision) { consistent = false; break; }
                last = resp;
                const pairs = entryPairs(resp.items);
                if (stream) {
                    if (!await streamEntries(stream, pairs)) return { unbounded: true };
                } else {
                    for (const pair of pairs) entries.push(pair);
                    if (entries.length > MEMORY_SOFT_CAP) {
                        // Past the cap: what memory holds goes into the stored copy, and so does every later page.
                        stream = await beginStream(scope, first);
                        if (!stream || !await streamEntries(stream, entries)) return { unbounded: true };
                        entries = [];
                    }
                }
                if (typeof resp.next !== 'string' || !resp.next) break;
                after = resp.next;
            }
            if (!consistent) continue;
            // The first page's cursor; the review averages of the last page read.
            const head: JsonRecord = first ?? {};
            const resp = { ...head, items: null, count: stream ? stream.count : entries.length, reviewRatings: last?.reviewRatings ?? first?.reviewRatings };
            if (!stream) return { resp, entries, pages };
            const committed = await commitStream(stream, head);
            if (!committed) return { unbounded: true };
            return { resp, entries: [], pages, stored: { scope: stream.scope, servedAt: servedAtOf(head), count: stream.count } };
        }
        return null;
    }

    /**
     * Claim the stored copy for a full load streamed into it (pending until commitStream), after any write
     * already queued; writes queued for older memory stop. Null when there is no usable stored copy, or
     * another tab has stored newer data.
     * @param first - The load's first page.
     * */
    async function beginStream(scope: string | null, first: JsonRecord): Promise<StoredStream | null> {
        const store = JE.tagCacheStore;
        if (!scope || !store?.available() || skipStoreThisSession) return null;
        persistGeneration++;
        await persistChain;
        const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        try {
            return await store.beginFullWrite(scope, token, { servedAt: servedAtOf(first) }) ? { scope, token, count: 0 } : null;
        } catch (err) {
            console.warn(`${logPrefix} Could not start the stored copy:`, err);
            return null;
        }
    }

    /**
     * Put entries into the claimed stored copy, PERSIST_SLICE at a time.
     * @returns false when the claim was lost or the write failed (quota).
     */
    async function streamEntries(stream: StoredStream, pairs: EntryPairs): Promise<boolean> {
        try {
            for (let i = 0; i < pairs.length; i += PERSIST_SLICE) {
                if (!await JE.tagCacheStore?.putManyIfOwner(stream.scope, stream.token, pairs.slice(i, i + PERSIST_SLICE))) return false;
            }
            stream.count += pairs.length;
            return true;
        } catch (err) {
            console.warn(`${logPrefix} Could not write the stored copy:`, err);
            return false;
        }
    }

    /**
     * Commit a streamed full load: the meta record that makes the stored copy complete and restorable.
     * @param first - The load's first page (its cursor and capture time).
     * */
    async function commitStream(stream: StoredStream, first: JsonRecord): Promise<boolean> {
        const servedAt = servedAtOf(first);
        try {
            const ok = !!await JE.tagCacheStore?.commitFullWrite(stream.scope, stream.token, {
                schema: STORED_ENTRY_SCHEMA,
                version: first.version,
                timestamp: first.timestamp,
                filterRevision: textOrEmpty(first.filterRevision),
                filterBase: textOrEmpty(first.filterBase),
                count: stream.count,
                clearStamp: JE.pluginConfig?.ClearLocalStorageTimestamp || 0,
                servedAt,
                savedAt: Date.now(),
            });
            if (ok) console.log(`${logPrefix} Server cache persisted: ${stream.count} items`);
            return ok;
        } catch (err) {
            console.warn(`${logPrefix} Could not commit the stored copy:`, err);
            return false;
        }
    }

    /**
     * Load the pre-computed tag cache from the server: restore the stored copy
     * and catch up with a delta, or download it in full. Tags then render
     * entirely from the cache with zero batch API calls; falls back to the
     * existing batch POST pipeline if the cache is empty or unavailable.
     * Concurrent callers share one load, unless the one in flight was started
     * for another user or the caller needs a full download; then it is
     * allowed to finish (its identity guards discard its result) before the
     * new one starts, rather than racing it.
     * @param [options] - forceDownload skips the
     *   stored copy (its per-user strip may be stale, e.g. after a Spoiler
     *   Guard toggle) and rewrites it from a full download.
     * */
    function loadServerCache(options?: {forceDownload?: boolean}): Promise<void> {
        if (!JE.pluginConfig?.TagCacheServerMode) {
            console.log(`${logPrefix} Server cache mode disabled`);
            return Promise.resolve();
        }
        // A large library without a stored copy: cards ask per batch until the session changes.
        if (perCardThisSession) return Promise.resolve();
        const epoch = JE.session ? JE.session.getEpoch() : 0;
        if (loadInFlight && !options?.forceDownload && loadInFlightEpoch === epoch) return loadInFlight;
        const previous = loadInFlight;
        const load = (async () => {
            if (previous) await previous; // never rejects
            try {
                if (!apiClient().getCurrentUserId()) return;
                if (!options?.forceDownload && await restoreStoredCache()) {
                    // Cards render from the stored copy once the delta confirms
                    // it (what changed since, and the review ratings, come with
                    // it). The delta is fetched directly, never through
                    // refreshServerCache: a refresh may itself be waiting for
                    // this load.
                    await fetchDelta();
                    return;
                }
                // A forced download replaces a copy (a Spoiler Guard toggle, a
                // filter change noticed mid-session): it needs a current servedAt.
                await downloadFullCache({ fresh: !!options?.forceDownload });
            } catch (err) {
                releaseStoreGate();
                console.warn(`${logPrefix} Failed to load server cache, using batch fallback:`, err);
                if (!serverCache) skipStoreThisSession = true;
                // Server-side cache switched off (404): the stored copy has
                // nothing to catch up to any more, so don't keep it around.
                if (errorStatus(err) === 404 && JE.tagCacheStore?.available()) {
                    const scope = cacheScope();
                    if (scope) JE.tagCacheStore.clearScope(scope).catch(() => {});
                }
            }
        })();
        loadInFlight = load;
        loadInFlightEpoch = epoch;
        load.finally(() => { if (loadInFlight === load) loadInFlight = null; });
        return load;
    }

    /**
     * Fetch incremental server cache updates since last load (navigation).
     * */
    function refreshServerCache(): Promise<void> {
        if (refreshInFlight) return refreshInFlight;
        const refresh = refreshServerCacheCore();
        refreshInFlight = refresh;
        refresh.finally(() => { if (refreshInFlight === refresh) refreshInFlight = null; });
        return refresh;
    }

    /**
     * Wait until the server tag cache in memory satisfies `ready`, fetching a
     * delta now and then (a full download when the server's cache version
     * moved): for data the server fills in after a setting changed, such as
     * the logos it looks up and republishes once the first user turns the
     * Logos group on. Bounded by SERVER_CACHE_WAIT_DELAYS; a later call or
     * stopWaitingForServerCache() ends an earlier wait, and so does a user
     * switch. Nothing is redrawn here: the caller decides.
     * @param ready - Checked after each delta.
     * @param [options] - Milliseconds before each delta (tests).
     * @returns True once `ready` holds; false when the server
     *   cache is off, the wait ended, or the bound ran out.
     */
    async function waitForServerCache(ready: (entries: Iterable<JsonRecord>) => boolean, options?: { delays?: readonly number[] }): Promise<boolean> {
        if (!JE.pluginConfig?.TagCacheServerMode) return false;
        const wait = ++serverCacheWait;
        const epoch = JE.session ? JE.session.getEpoch() : 0;
        const ended = () => wait !== serverCacheWait || (JE.session && !JE.session.isCurrent(epoch));
        for (const delay of options?.delays || SERVER_CACHE_WAIT_DELAYS) {
            await new Promise(resolve => setTimeout(resolve, delay));
            if (ended()) return false;
            try { await refreshServerCache(); } catch { /* the next attempt retries */ }
            if (ended()) return false;
            if (serverCache && ready(serverCache.values())) return true;
        }
        return false;
    }

    /**
     * Key identifying the page the current URL shows, for telling a page
     * change from the search page rewriting its `query` parameter: path and
     * hash route plus every query parameter except `query`, which only the
     * search box uses (a details page's identity lives in `id`, a list's in
     * `parentId`/`genreId`/..., so those still count as a change).
     * */
    function navigationRoute(): string {
        const url = new URL(window.location.href);
        const [hashPath, hashQuery = ''] = url.hash.split('?');
        const params = new URLSearchParams(hashQuery);
        for (const [name, value] of url.searchParams) params.append(name, value);
        params.delete('query');
        params.sort();
        return `${url.pathname}${hashPath}?${params}`;
    }

    /**
     * The navigation-triggered delta, at most once per
     * NAV_REFRESH_MIN_INTERVAL_MS: a navigation inside the interval arms one
     * trailing delta for when it ends, so every navigation is still followed
     * by a delta within the interval. Not spaced out while the server cache
     * is not loaded (empty at startup): that path retries the full load, and
     * each navigation is its chance to do so.
     * */
    function scheduleNavigationRefresh(): void {
        // Every tag type is off: nothing reads the cache until one is turned on.
        if (!anyTagTypeEnabled()) return;
        // Monotonic: a system clock change must not stretch the interval.
        const now = performance.now();
        const elapsed = now - lastNavRefreshAt;
        if (!serverCache || elapsed >= NAV_REFRESH_MIN_INTERVAL_MS) {
            if (navRefreshTimer) { clearTimeout(navRefreshTimer); navRefreshTimer = null; }
            lastNavRefreshAt = now;
            refreshServerCache();
            return;
        }
        if (navRefreshTimer) return;
        navRefreshTimer = setTimeout(() => {
            navRefreshTimer = null;
            if (!anyTagTypeEnabled()) return;
            lastNavRefreshAt = performance.now();
            refreshServerCache();
        }, Math.min(NAV_REFRESH_MIN_INTERVAL_MS, NAV_REFRESH_MIN_INTERVAL_MS - elapsed));
    }

    async function refreshServerCacheCore() {
        // If server cache was never loaded (e.g. cache was empty at startup),
        // retry the full load — the scheduled task may have built it since then.
        if (!serverCache) {
            // A load already in flight (boot, user switch) brings the cache and
            // its own delta.
            if (loadInFlight) return;
            await loadServerCache();
            if (serverCache) {
                // Cache is now available — rescan cards to render from it
                processedCards = new WeakSet();
                runScan();
            }
            return;
        }
        await fetchDelta();
    }

    /**
     * Fetch what changed since the cursor and apply it; shared by concurrent
     * callers. Never waits for a load or a refresh (both wait for this), so
     * they can't deadlock. Also the confirmation step for a restored copy:
     * whatever the outcome, the store gate is released at the end.
     * */
    function fetchDelta(): Promise<void> {
        // Only share a fetch made for this session and this memory: one from
        // before a sign-out or a restore answers for a cursor that's gone (and
        // can't confirm the new copy), so it's left to discard its own result.
        const epoch = JE.session ? JE.session.getEpoch() : 0;
        if (deltaInFlight && deltaInFlight.epoch === epoch && deltaInFlight.generation === cacheGeneration) {
            return deltaInFlight.promise;
        }
        const entry = { epoch, generation: cacheGeneration, promise: fetchDeltaCore() };
        deltaInFlight = entry;
        entry.promise.finally(() => { if (deltaInFlight === entry) deltaInFlight = null; });
        return entry.promise;
    }

    /**
     * Apply a delta whose only filter change is access, when it can correct the copy: the response
     * carries the same filter base and every id the user can see (`visible`), and the copy already
     * holds each of them (a newly visible item needs a full download). Entries the user can no
     * longer see are dropped from memory and the stored copy; the cursor and filter move on.
     * @param resp - The delta response.
     * @param base - What the delta was requested against.
     * @param generation - cacheGeneration when the delta was requested.
     * @returns whether the copy was reconciled (false: the caller replaces it)
     */
    async function reconcileAccess(resp: JsonRecord, base: SnapshotBase, generation: number): Promise<boolean> {
        const revision = textOrEmpty(resp.filterRevision);
        if (!Array.isArray(resp.visible) || !serverFilterBase || resp.filterBase !== serverFilterBase || !revision || !serverCache) return false;
        const visible = new Set(stringList(resp.visible));
        const newEntries = entryPairs(resp.items);
        const carried = record(resp.items);
        const removed = stringList(resp.removed).filter(id => !(id in carried));
        const next = { timestamp: cursorOf(resp), servedAt: servedAtOf(resp), filterRevision: revision, filterBase: serverFilterBase };
        let dropped: string[];
        if (serverCacheComplete) {
            const held = new Set(serverCache.keys());
            for (const [id] of newEntries) held.add(id);
            for (const id of visible) if (!held.has(id)) return false;
            dropped = [...serverCache.keys()].filter(id => !visible.has(id));
            const scope = storeScope;
            if (scope && JE.tagCacheStore?.available()) {
                const store = JE.tagCacheStore;
                const persistAt = persistGeneration;
                queuePersist(async () => {
                    if (persistAt !== persistGeneration) return;
                    await store.reconcileAccess(scope, base, next, newEntries, removed, visible);
                });
            }
        } else {
            // A restored copy lives in the store: it decides, in one transaction, after any write still queued.
            const scope = storeScope;
            if (!scope || !JE.tagCacheStore?.available()) return false;
            const store = JE.tagCacheStore;
            const outcome = await new Promise<AccessOutcome>((resolve) => {
                queuePersist(async () => {
                    try { resolve(await store.reconcileAccess(scope, base, next, newEntries, removed, visible)); }
                    catch (err) { resolve({ applied: false, dropped: [] }); throw err; }
                });
            });
            if (!outcome.applied || generation !== cacheGeneration || !serverCache) return false;
            dropped = [...new Set([...outcome.dropped, ...[...serverCache.keys()].filter(id => !visible.has(id))])];
        }
        for (const id of dropped) {
            forgetItemFacts(id);
            serverCache.delete(id);
            deltaIds.delete(id);
            storeMisses.add(id);
        }
        for (const [id, entry] of newEntries) {
            forgetItemFacts(id);
            serverCache.set(id, entry);
            storeMisses.delete(id);
            deltaIds.add(id);
        }
        for (const id of removed) {
            forgetItemFacts(id);
            serverCache.delete(id);
            deltaIds.delete(id);
            storeMisses.add(id);
        }
        serverCacheTimestamp = cursorOf(resp);
        serverFilterRevision = revision;
        const changedIds = newEntries.map(e => e[0]).concat(removed, dropped);
        if (changedIds.length > 0) {
            for (const [, renderer] of renderers) {
                if (renderer.onServerCacheRefresh) {
                    try { renderer.onServerCacheRefresh(changedIds); } catch {}
                }
            }
        }
        console.log(`${logPrefix} Access changed: +${newEntries.length} items, -${removed.length + dropped.length} no longer visible`);
        return true;
    }

    async function fetchDeltaCore() {
        const gate = storeGate;
        const confirming = !!gate;
        const startGeneration = cacheGeneration;
        // Set once the restored copy is confirmed current or replaced; any
        // other exit drops the unconfirmed copy from memory (finally below).
        let settled = false;
        try {
            if (!serverCache || !serverCacheTimestamp) return;
            const userId = apiClient().getCurrentUserId();
            if (!userId) return;

            // Same identity guard as loadServerCache: incremental entries are
            // spoiler-stripped for the user that requested them.
            const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
            const generation = cacheGeneration;
            const base = { timestamp: serverCacheTimestamp, version: serverCacheVersion, filterRevision: serverFilterRevision };
            const requestedAt = performance.now();
            const resp = await apiClient().ajax({
                type: 'GET',
                url: apiClient().getUrl(`/JellyfinEnhanced/tag-cache/${userId}?since=${base.timestamp}&known=${encodeURIComponent(base.filterRevision || '')}`),
                dataType: 'json'
            });
            if (JE.session && !JE.session.isCurrent(requestEpoch)) return;
            // Memory was replaced while this was in flight (full download,
            // invalidation): the answer is relative to a cursor that's gone.
            if (!isRecord(resp) || !resp.items || !serverCache || generation !== cacheGeneration) return;

            applyReviewRatings(resp, requestedAt);

            // Full rebuild (a new generation, or more removals than the server
            // keeps for deltas), or this user's filter changed since memory was made
            // (library access revoked, Spoiler Guard list or policy changed,
            // possibly on another device): the copy can't be patched — replace it.
            const revision = textOrEmpty(resp.filterRevision);
            // A cursor older than the one asked about means the server's cache
            // went back (restored from an older save or backup): entries this
            // copy got since may disagree with it, and a delta can't say which.
            const rolledBack = typeof resp.timestamp === 'number' && resp.timestamp < base.timestamp;
            // Only access changed (an item this user cannot see was added, or one they could see was
            // hidden): drop what they can no longer see instead of downloading everything again.
            if (resp.version === serverCacheVersion && !rolledBack && revision !== serverFilterRevision
                && await reconcileAccess(resp, base, generation)) {
                settled = true;
                if (confirming) console.log(`${logPrefix} Stored copy confirmed current after an access change`);
                return;
            }
            if (resp.version !== serverCacheVersion || revision !== serverFilterRevision || rolledBack) {
                const why = resp.version !== serverCacheVersion ? 'Cache version changed'
                    : rolledBack ? 'Server cache went back in time' : 'Access or Spoiler Guard filter changed';
                if (confirming) {
                    // A restored copy that never rendered: download instead.
                    // Cards may still show what the batch fallback drew while
                    // the copy was being restored, so this is a replacement
                    // under them too.
                    console.log(`${logPrefix} ${why}; replacing the stored copy with a full download`);
                    // Only a replacement settles the copy: if none arrived, its strip stays unconfirmed.
                    settled = await downloadFullCache({ fresh: true });
                    for (const [, renderer] of renderers) {
                        if (renderer.onServerCacheRefresh) {
                            try { renderer.onServerCacheRefresh(null, { replaced: true }); } catch {}
                        }
                    }
                } else if (revision !== serverFilterRevision) {
                    // Cards already show entries stripped the old way: the full
                    // invalidation also removes their overlays. Not awaited — it
                    // runs its own load, which may wait for this delta.
                    console.log(`${logPrefix} ${why}; reloading the full cache`);
                    setTimeout(() => { api.invalidateServerCache().catch(() => {}); }, 0);
                } else {
                    console.log(`${logPrefix} ${why}, reloading full cache`);
                    await downloadFullCache({ fresh: true });
                    // Clear all derived caches on full rebuild. The cards on the
                    // page keep what they show (nothing is re-rendered here), so
                    // a renderer that must not go stale is told the cache under
                    // them was replaced and can redraw itself.
                    for (const [, renderer] of renderers) {
                        if (renderer.onServerCacheRefresh) {
                            try { renderer.onServerCacheRefresh(null, { replaced: true }); } catch {}
                        }
                    }
                }
                return;
            }

            const newEntries = entryPairs(resp.items);
            // Items removed after the cursor (the server leaves out any stored again since).
            const carried = record(resp.items);
            const removed = stringList(resp.removed).filter(id => !(id in carried));
            if (newEntries.length > 0 || removed.length > 0) {
                for (const [id, entry] of newEntries) {
                    forgetItemFacts(id);
                    serverCache.set(id, entry);
                    storeMisses.delete(id);
                    deltaIds.add(id);
                }
                for (const id of removed) {
                    forgetItemFacts(id);
                    serverCache.delete(id);
                    deltaIds.delete(id);
                    // Never read back from the stored copy, which may not have the removal yet.
                    storeMisses.add(id);
                }
                serverCacheTimestamp = cursorOf(resp);
                persistDelta(newEntries, base, cursorOf(resp), servedAtOf(resp), removed);
                // Notify renderers to invalidate derived caches for updated and removed items
                const changedIds = newEntries.map(e => e[0]).concat(removed);
                for (const [, renderer] of renderers) {
                    if (renderer.onServerCacheRefresh) {
                        try { renderer.onServerCacheRefresh(changedIds); } catch {}
                    }
                }
                console.log(`${logPrefix} Server cache updated: +${newEntries.length} items, -${removed.length} removed`);
            }
            settled = true;
            if (confirming) console.log(`${logPrefix} Stored copy confirmed current`);
        } catch (err) {
            console.warn(`${logPrefix} Failed to refresh server cache:`, err);
        } finally {
            if (confirming) {
                // Unconfirmed (request failed, empty answer, signed out): its
                // strip may be stale, so drop it from memory and let cards use
                // the batch path. The copy itself stays for the next page load
                // to confirm. Memory someone else replaced meanwhile is theirs.
                if (!settled && cacheGeneration === startGeneration) dropServerCache();
                releaseStoreGate(gate);
            }
        }
    }

    /**
     * Server cache entries for a set of item ids: from memory, then from the
     * stored copy for ids memory hasn't seen. Ids without an entry are absent
     * from the result. Returns the Map itself when no IndexedDB read is needed
     * (the common case once entries are in memory) so the caller can render
     * synchronously, and a Promise of it otherwise.
     * */
    function lookupServerEntries(ids: readonly string[]): Map<string, JsonRecord>|Promise<Map<string, JsonRecord>> {
        // A restored copy renders nothing until the delta confirms it.
        if (storeGate) return storeGate.then(() => lookupServerEntries(ids));
        const found = new Map<string, JsonRecord>();
        if (!serverCache) return found;
        let missing: string[] | null = null;
        for (const id of ids) {
            const entry = serverCache.get(id);
            if (entry) {
                found.set(id, entry);
            } else if (!serverCacheComplete && storeScope && !storeMisses.has(id)) {
                (missing = missing || []).push(id);
            }
        }
        if (!missing) return found;

        const scope = storeScope;
        const store = JE.tagCacheStore;
        const generation = cacheGeneration;
        if (!scope || !store) return found;
        const wanted = missing;
        return store.getMany(scope, wanted).then(({ entries: read, meta }) => {
            // Memory was replaced (user switch, full download, invalidation)
            // while reading: what was read may predate it. Answer again from
            // the current state instead.
            if (storeScope !== scope || !serverCache || generation !== cacheGeneration) {
                return lookupServerEntries(ids);
            }
            // Only use the stored entries while the stored snapshot is the one
            // this page confirmed (same version and filter revision, complete):
            // another tab may be rewriting it or may have replaced it with data
            // filtered differently. Anything else counts as not stored.
            // Never captured before the snapshot this page restored (older
            // entries could miss updates its deltas already skipped).
            const usable = !!meta && !meta.pending
                && meta.version === serverCacheVersion
                && meta.filterRevision === serverFilterRevision
                && Number(meta.servedAt || 0) >= storeBaseServedAt;
            const stored = usable ? read : new Map<string, JsonRecord>();
            if (serverCache.size + stored.size > MEMORY_SOFT_CAP) {
                // Reset, but keep what deltas installed: the stored copy may
                // not have those yet (its write is queued, or another tab owns it).
                const keep: EntryPairs = [];
                for (const id of deltaIds) {
                    const entry = serverCache.get(id);
                    if (entry) keep.push([id, entry]);
                }
                serverCache.clear();
                for (const [id, entry] of keep) serverCache.set(id, entry);
            }
            for (const id of wanted) {
                // A delta that landed while reading is newer than the copy.
                const current = serverCache.get(id);
                if (current) {
                    found.set(id, current);
                    continue;
                }
                // So is a removal that landed while reading.
                if (storeMisses.has(id)) continue;
                const entry = stored.get(id);
                if (entry) {
                    found.set(id, entry);
                    serverCache.set(id, entry);
                } else {
                    storeMisses.add(id);
                }
            }
            return found;
        }).catch((err) => {
            console.warn(`${logPrefix} Stored server cache read failed:`, err);
            return found;
        });
    }

    // ── Card Scanning ──────────────────────────────────────────────────

    /**
     * Check whether at least one registered renderer is currently enabled.
     * @returns True if any renderer reports enabled.
     */
    /**
     * Whether the user has any poster tag type on. Read from the settings as
     * well as the registered renderers, because a renderer can register after
     * the pipeline starts (quality tags wait for Jellyfin's audio preference).
     * */
    function anyTagTypeEnabled(): boolean {
        return TAG_SETTING_KEYS.some((key) => !!JE.currentSettings?.[key]) || hasAnyEnabledRenderer();
    }

    function hasAnyEnabledRenderer() {
        for (const [, r] of renderers) {
            if (r.isEnabled()) return true;
        }
        return false;
    }

    let scanScheduled = false;
    // Cards per idle slice are sized from the measured render cost so a slice
    // stays around CHUNK_BUDGET_MS on this device: a fast desktop renders
    // dozens per slice, a slow phone a handful. The first slice assumes the
    // pre-measurement cost.
    const CHUNK_BUDGET_MS = 8;
    const CHUNK_MIN_CARDS = 4;
    const CHUNK_MAX_CARDS = 40;
    let msPerCard = 1.5;
    // Separate, much larger threshold for yielding during batch render (see processBatch).
    const RENDER_YIELD_CHUNK = 40;
    let scanGeneration = 0; // Incremented on each new scan to cancel stale chunk chains

    /**
     * Schedule scan. Coalesces multiple mutations into a single scan start.
     */
    // Use requestIdleCallback for all tag work so it never competes with
    // user interactions (hover, scroll, click). Falls back to setTimeout
    // for browsers without requestIdleCallback support.
    const scheduleIdle = typeof requestIdleCallback === 'function'
        ? (fn: () => void) => requestIdleCallback(fn, { timeout: 500 })
        : (fn: () => void) => setTimeout(fn, 16);

    /**
     * Resolves on the next idle slot. Used to break up long synchronous
     * render loops (e.g. a batch fetch response covering many search
     * results) so they don't block the main thread in one tick.
     * */
    function idleYield(): Promise<void> {
        return new Promise((resolve) => scheduleIdle(resolve));
    }

    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        scheduleIdle(() => {
            scanScheduled = false;
            runScan();
        });
    }

    /**
     * Fold a measured per-card render cost into the running estimate that
     * sizes the next slice.
     */
    function recordRenderCost(elapsedMs: number, cards: number) {
        if (cards <= 0) return;
        msPerCard = msPerCard * 0.5 + (elapsedMs / cards) * 0.5;
    }

    // ── Tag look facts ─────────────────────────────────────────────────
    //
    // What item data said about an item that tag look rules and locks match
    // on (type, series, library, genres, official rating; see factsFrom in
    // core/tag-look.js), remembered from every /tag-data answer. A card
    // rendered later from the renderers' local caches alone (no fetch) is
    // matched on these, so library/genre/age rules apply to it and a season
    // or episode inherits its series' lock. Kept in memory, and in
    // localStorage alongside the renderers' caches when those persist (same
    // server:user owner rule and admin clear). A card with nothing
    // remembered is fetched when a rule or lock needs its data.

    const LOOK_FACTS_KEY = 'JE_tagLookFacts';
    const LOOK_FACTS_MAX = 3000;
    const LOOK_FACT_FIELDS = ['Type', 'SeriesId', 'LibraryId', 'Genres', 'OfficialRating'];
    /** itemId → { Type, SeriesId, LibraryId, Genres, OfficialRating, at }; null = not loaded */
    let lookFacts: Map<string, JsonRecord>|null = null;
    let lookFactsSaveRegistered = false;

    /** @returns The renderers' local caches persist, so the facts do too. */
    function lookFactsPersist(): boolean {
        return JE.pluginConfig?.TagCacheServerMode === false || JE.pluginConfig?.EnableTagsLocalStorageFallback === true;
    }

    /** @returns The remembered facts, loaded on first use. */
    function lookFactsMap(): Map<string, JsonRecord> {
        if (lookFacts) return lookFacts;
        lookFacts = new Map();
        if (!lookFactsPersist()) return lookFacts;
        try {
            const ownerKey = `${LOOK_FACTS_KEY}:identity-owner`;
            const userId = JE.session?.getUserId?.()
                || (hasApiClient() ? apiClient().getCurrentUserId?.() : null) || '';
            const owner = `${JE.session?.getServerId?.() || ''}:${userId}`;
            if (localStorage.getItem(ownerKey) !== owner) {
                localStorage.removeItem(LOOK_FACTS_KEY);
                localStorage.setItem(ownerKey, owner);
                return lookFacts;
            }
            const stored = JSON.parse(localStorage.getItem(LOOK_FACTS_KEY) || '{}');
            const clearedAt = Number(JE.pluginConfig?.ClearLocalStorageTimestamp || 0);
            if (isRecord(stored)) {
                for (const [id, facts] of Object.entries(stored)) {
                    if (isRecord(facts) && Number(facts.at) > clearedAt) lookFacts.set(id, facts);
                }
                // Admin clears must erase the stored payload now, even when
                // every renderer hits its cache and no later save is scheduled.
                if (lookFacts.size !== Object.keys(stored).length) saveLookFacts();
            }
        } catch (err) {
            console.warn(`${logPrefix} Ignoring unreadable tag look facts`, err);
        }
        return lookFacts;
    }

    /** Write the remembered facts (registered with JE._cacheManager). */
    function saveLookFacts() {
        if (!lookFacts || !lookFactsPersist()) return;
        try {
            localStorage.setItem(LOOK_FACTS_KEY, JSON.stringify(Object.fromEntries(lookFacts)));
        } catch (err) {
            console.warn(`${logPrefix} Failed to save tag look facts`, err);
        }
    }

    /**
     * Remember what an item's data says for tag looks (newest last; past
     * LOOK_FACTS_MAX the oldest go).
     * @param itemId - Normalised item id.
     * @param item - /tag-data or /Items item.
     * @param [source] - Whether library membership was resolved.
     */
    function rememberLookFacts(itemId: string, item: JsonRecord, source: 'tag-data'|'item' = 'tag-data') {
        if (!itemId || !item) return;
        const facts: Record<string, unknown> = { at: Date.now(), source };
        for (const field of LOOK_FACT_FIELDS) {
            if (item[field] !== undefined && item[field] !== null) facts[field] = item[field];
        }
        const map = lookFactsMap();
        map.delete(itemId);
        map.set(itemId, facts);
        for (const oldest of map.keys()) {
            if (map.size <= LOOK_FACTS_MAX) break;
            map.delete(oldest);
        }
        if (!lookFactsPersist() || !JE._cacheManager) return;
        if (!lookFactsSaveRegistered) {
            JE._cacheManager.register(saveLookFacts);
            lookFactsSaveRegistered = true;
        }
        JE._cacheManager.markDirty();
    }

    /**
     * Whether remembered data came from the enriched endpoint. Older facts
     * without provenance are complete only when they include a library id.
     * */
    function enrichedLookFacts(facts: JsonRecord|undefined): boolean {
        return !!facts && (facts.source === 'tag-data' || (facts.source == null && /^[a-f0-9]{32}$/i.test(String(facts.LibraryId || ''))));
    }

    /** @returns An enabled rule needs enriched library membership. */
    function needsLibraryFacts(): boolean {
        return !!JE.core.tagLook?.read().rules.some((rule) => rule.enabled && rule.when.some((cond) => cond.field === 'library'));
    }

    /**
     * An item's data for tag look rules and locks, the way its cards are
     * matched: its server tag-cache entry, else the remembered facts, else
     * fetched from /tag-data (and remembered).
     * @param itemId - Normalised item id.
     * @returns Null when the server has no such item.
     */
    async function itemLookFacts(itemId: string): Promise<JsonRecord|null> {
        const serverEntry = serverCache?.get(itemId);
        if (serverEntry) return serverEntry;
        const known = lookFactsMap().get(itemId);
        if (known && enrichedLookFacts(known)) return known;
        const userId = apiClient().getCurrentUserId();
        const epoch = JE.session?.getEpoch?.();
        const response = record(await apiClient().ajax({
            type: 'POST',
            url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`),
            data: JSON.stringify([itemId]),
            contentType: 'application/json',
            dataType: 'json'
        }));
        if (userId !== apiClient().getCurrentUserId() || epoch !== JE.session?.getEpoch?.()) return null;
        const item = records(response.Items).find((i) => normalizeItemId(i.Id ?? '') === itemId) || null;
        if (item) rememberLookFacts(itemId, item);
        return item;
    }

    /**
     * Render one classified card from its server entry, or from the local
     * caches with a batch-fetch fallback. The host is collected for one
     * corner-stacking pass over the whole slice instead of a layout per card.
     */
    function renderCard(card: ScannedCard, serverEntry: JsonRecord | undefined, hosts: HTMLElement[]): void {
        const { el, itemId, itemType } = card;
        const renderTarget = resolveRenderTarget(el);
        const layout = JE.core.tagLayout;
        // Tag look rules match on the item data (library, genres, age
        // rating, series): the server entry, else what an earlier fetch
        // said. Without either, a card a rule or lock could restyle waits
        // for the batch fetch below before showing its tags.
        const cardId = layout?.cardIdentity?.(renderTarget) ?? '';
        const remembered = lookFactsMap().get(itemId);
        const known = serverEntry || (!needsLibraryFacts() || enrichedLookFacts(remembered) ? remembered : null);
        let awaiting: CardWait = false;
        if (known) layout?.setCardContext?.(renderTarget, known, itemId, cardId);
        else awaiting = layout?.awaitCardContext?.(renderTarget, cardId, itemType);
        // Caption layout: reserve the strip below the image now, before the
        // tag data (possibly a batch fetch away) arrives.
        JE.core.tagLayout?.prepareCard(renderTarget);

        // Server cache first (all tag data pre-computed in one object)
        if (serverEntry) {
            for (const [, renderer] of renderers) {
                if (!renderer.isEnabled()) continue;
                if (renderer.renderFromServerCache) {
                    try { renderer.renderFromServerCache(renderTarget, serverEntry, itemId); } catch {}
                }
            }
            hosts.push(renderTarget);
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
        hosts.push(renderTarget);

        if (!allCacheHits || awaiting) {
            requestQueue.push({ el, renderTarget, itemId, itemType, cardId, awaiting, reuse: card.reuse });
        }
    }

    /**
     * Scan all unprocessed cards. Uses chunked processing to avoid jank:
     * each idle slice classifies a chunk of cards (cheap DOM reads), looks up
     * their server entries (synchronously from memory, or from the stored copy)
     * and renders them, then yields. A generation counter ensures stale chunk
     * chains from previous scans are cancelled when a new scan starts (e.g.,
     * rapid page changes); a chain cancelled while waiting for the stored copy
     * releases its cards so the newer scan picks them up.
     */
    let isInvalidating = false;
    function runScan() {
        // While a server-cache invalidation is in flight (after a Spoiler Guard
        // toggle), suppress concurrent scans so cards aren't processed against a
        // half-loaded cache and marked done before the fresh data arrives.
        if (isInvalidating) return;
        if (!hasAnyEnabledRenderer()) return;
        if (!hasApiClient()) return;

        const elements = document.querySelectorAll<HTMLElement>('.cardImageContainer, div.listItemImage');
        const unprocessed: HTMLElement[] = [];
        for (const el of elements) {
            if (!processedCards.has(el)) unprocessed.push(el);
            else JE.core.tagLayout?.resumePresentation?.(el.closest<HTMLElement>('.cardScalable') || el);
        }
        if (unprocessed.length === 0) return;

        // Cancel any in-progress chunk chain from a previous scan
        const myGeneration = ++scanGeneration;
        let index = 0;

        /** Continue with the next slice, or schedule the batch fetch once every card is done. */
        function continueScan() {
            if (index < unprocessed.length) {
                // More cards to process — yield and continue when browser is idle
                scheduleIdle(processChunk);
            } else {
                // All cards processed — schedule batch fetch for cache misses
                scheduleFetch();
            }
        }

        /**
         * Render a classified chunk from the looked-up entries.
         */
        function renderChunk(chunk: ScannedCard[], entries: Map<string, JsonRecord>): void {
            const started = performance.now();
            const hosts: HTMLElement[] = [];
            for (const card of chunk) {
                // Gone since classification (page changed): release it in case
                // it comes back, exactly like a card skipped before marking.
                if (!card.el.isConnected) {
                    processedCards.delete(card.el);
                    continue;
                }
                // Reused for another item while its entry was looked up: it was
                // released then, and the next scan renders the new item.
                if (!stillShows(card)) continue;
                renderCard(card, entries.get(card.itemId), hosts);
            }
            // One coalesced layout pass for the slice instead of one per card.
            JE.core.tagRenderer.applyCornerStacking(hosts);
            recordRenderCost(performance.now() - started, chunk.length);
            continueScan();
        }

        function processChunk() {
            // Abort if a newer scan has started
            if (myGeneration !== scanGeneration) return;

            const limit = Math.max(CHUNK_MIN_CARDS, Math.min(CHUNK_MAX_CARDS, Math.floor(CHUNK_BUDGET_MS / Math.max(msPerCard, 0.05))));
            const chunk: ScannedCard[] = [];
            const ids: string[] = [];

            for (; index < unprocessed.length && chunk.length < limit; index++) {
                const el = unprocessed[index];
                if (!el || processedCards.has(el)) continue;
                // Skip elements no longer in the DOM (page changed)
                if (!el.isConnected) continue;

                const card = el.closest('.card');
                if (card && card.classList.contains('je-hidden')) continue;
                const listItem = el.closest('.listItem');
                if (listItem && listItem.classList.contains('je-hidden')) continue;

                // Skip contexts that should never have tags
                if (shouldSkipElement(el)) {
                    processedCards.add(el);
                    continue;
                }

                const itemId = getItemId(el);
                if (!itemId) continue;

                const itemType = getItemType(el);
                if (itemType && !isMediaType(itemType)) {
                    processedCards.add(el);
                    continue;
                }

                processedCards.add(el);
                chunk.push({ el, itemId, itemType, reuse: cardReuse.get(el) || 0 });
                ids.push(itemId);
            }

            if (chunk.length === 0) {
                continueScan();
                return;
            }

            const lookup = lookupServerEntries(ids);
            if (lookup instanceof Map) {
                renderChunk(chunk, lookup);
                return;
            }
            lookup.then((entries) => {
                if (myGeneration !== scanGeneration) {
                    // Superseded while waiting: release the cards and scan again.
                    // The newer scan took its snapshot while these were still
                    // marked processed, so it won't pick them up by itself.
                    for (const card of chunk) processedCards.delete(card.el);
                    scheduleScan();
                    return;
                }
                renderChunk(chunk, entries);
            });
        }

        processChunk();
    }

    /**
     * Resolves the element tags should render into for a given card: a
     * `.je-tag-host` div inserted before the card's hover-overlay container
     * (so Jellyfin's own overlay naturally covers tags in DOM order), falling
     * back to `.cardScalable` or the card element itself when no overlay
     * container exists. Never render into `.cardImageContainer` directly —
     * it triggers Jellyfin's lazy-load to reset opacity:0, breaking the image.
     * Cheap (a couple of DOM queries) and idempotent, so it's safe to call
     * again later to re-resolve a card whose subtree Jellyfin rebuilt.
     * @param el - Card image container element.
     * @returns The element to render tags into.
     */
    function resolveRenderTarget(el: HTMLElement): HTMLElement {
        const scalable = el.closest<HTMLElement>('.cardScalable');
        if (!scalable) return el;
        const overlay = scalable.querySelector('.cardOverlayContainer');
        if (!overlay) return scalable;
        let tagHost = scalable.querySelector<HTMLElement>('.je-tag-host');
        if (!tagHost) {
            tagHost = document.createElement('div');
            tagHost.className = 'je-tag-host';
            scalable.insertBefore(tagHost, overlay);
        }
        return tagHost;
    }

    /**
     * Whether a scanned or queued card still shows the item it was scanned
     * for (it has not been reused for another item since).
     * */
    function stillShows(card: {el: HTMLElement, reuse: number}): boolean {
        return (cardReuse.get(card.el) || 0) === card.reuse;
    }

    /** Card images whose item id lives on an ancestor's data-id / data-itemid. */
    const CARD_IMAGE_SELECTOR = '.cardImageContainer, div.listItemImage';

    /**
     * The item id in an image URL (".../Items/<id>/Images/..."), or ''.
     * @param text - A style attribute or background-image value.
     * */
    function imageItemId(text: string | null | undefined): string {
        const match = text ? /Items\/([a-f0-9]{32})\//i.exec(text) : null;
        return match?.[1] ? match[1].toLowerCase() : '';
    }

    /**
     * Whether an attribute record says a card now shows another item: its
     * data-id / data-itemid changed, or the artwork of a card image or list
     * row image (a list row can be reused with only its artwork rewritten)
     * moved from one item's image to another's. The artwork's first load
     * (from no image) is not a change: the scan may have read the id from
     * data-id before it, and the artwork can name the series of an episode
     * card.
     * */
    function isIdentityChange(record: MutationRecord): boolean {
        const target = record.target;
        if (!(target instanceof Element) || !record.attributeName) return false;
        if (record.attributeName === 'style') {
            if (!target.matches(CARD_IMAGE_SELECTOR)) return false;
            const before = imageItemId(record.oldValue);
            const after = imageItemId(target.getAttribute('style'));
            return !!before && !!after && before !== after;
        }
        const norm = (value: string | null) => (value || '').replace(/-/g, '').toLowerCase();
        return norm(target.getAttribute(record.attributeName)) !== norm(record.oldValue);
    }

    /**
     * A virtualised list reuses a card for another item by rewriting it in
     * place: no node is added, so the body subscriber never hears of it and
     * the card stays processed with the previous item's tags. Release every
     * scanned card under a changed identity (its layout controller, slots,
     * caption outlet and review key go with it, and lookups still in flight
     * for it are dropped by stillShows), then scan again so the new item
     * renders.
     * @param mutations - Attribute records with old values.
     */
    function releaseReusedCards(mutations: MutationRecord[]) {
        let released = false;
        for (const record of mutations) {
            if (!isIdentityChange(record)) continue;
            const target = record.target;
            if (!(target instanceof HTMLElement)) continue;
            const images = target.matches(CARD_IMAGE_SELECTOR)
                ? [target]
                : Array.from(target.querySelectorAll<HTMLElement>(CARD_IMAGE_SELECTOR));
            for (const el of images) {
                const owner = el.closest<HTMLElement>('.cardScalable') || el;
                const hasHost = Array.from(owner.children).some((c) => c.classList.contains('je-tag-host'));
                if (!processedCards.has(el) && !hasHost) continue;
                processedCards.delete(el);
                cardReuse.set(el, (cardReuse.get(el) || 0) + 1);
                JE.core.tagLayout?.clearCard(owner);
                released = true;
            }
        }
        if (released) scheduleScan();
    }

    /**
     * Extract the Jellyfin item ID from a card element.
     * @param el - Card image container element.
     * @returns The item ID or null if not found.
     */
    function getItemId(el: HTMLElement): string|null {
        // The card identifies the item; an episode can borrow a season or
        // series poster. Keep that identity stable as lazy artwork loads.
        const parent = el.closest('[data-id]') || el.closest('[data-itemid]');
        const attrId = parent?.getAttribute('data-id') || parent?.getAttribute('data-itemid');
        const itemId = attrId ? attrId.replace(/-/g, '').toLowerCase() : null;
        if (itemId && /^[a-f0-9]{32}$/.test(itemId)) return itemId;
        // Cards without a valid item attribute can still identify their artwork.
        return imageItemId(el.style?.backgroundImage) || itemId;
    }

    /**
     * Extract the item type from a card element's data-type attribute.
     * @param el - Card image container element.
     * @returns The item type or null if not found.
     */
    function getItemType(el: HTMLElement): string|null {
        const parent = el.closest('[data-type]');
        return parent?.getAttribute('data-type') || null;
    }

    // ── Queue Processing ───────────────────────────────────────────────

    const SERVER_BATCH_LIMIT = 200;

    /**
     * Debounce a drain of the request queue. No-op while a drain is running:
     * that drain picks the queued cards up itself, or, when it was cancelled
     * by a generation bump, schedules the next one as it exits.
     * */
    function scheduleFetch(): void {
        if (requestQueue.length === 0 || isProcessing) return;
        if (fetchTimer) clearTimeout(fetchTimer);
        fetchTimer = setTimeout(() => {
            fetchTimer = null;
            processQueue();
        }, FETCH_DEBOUNCE_MS);
    }

    /**
     * Drain the request queue in SERVER_BATCH_LIMIT-sized chunks.
     * */
    async function processQueue(): Promise<void> {
        if (isProcessing || requestQueue.length === 0) return;
        isProcessing = true;
        let cancel: () => void = () => {};
        const cancelled = new Promise<void>(resolve => { cancel = resolve; });
        cancelBatchWait = cancel;

        try {
            const myGeneration = batchGeneration;

            // Chunk into batches of SERVER_BATCH_LIMIT to avoid 400 errors
            while (requestQueue.length > 0) {
                if (myGeneration !== batchGeneration) break; // navigation happened
                const batch = requestQueue.splice(0, SERVER_BATCH_LIMIT)
                    // Drop cards removed from the DOM since they were queued (e.g. a
                    // page like search re-renders its whole result set on every
                    // keystroke, on the same generation). Skipping them here avoids
                    // fetching and rendering tag data nobody will ever see.
                    .filter((entry) => entry.el.isConnected);
                if (batch.length === 0) continue;
                activeBatch = batch;
                // The transport can finish in the background, but a retired
                // generation must not hold fresh guard/user work behind it.
                // processBatch checks its generation after every await and before writes.
                await Promise.race([processBatch(batch, myGeneration), cancelled]);
                if (myGeneration !== batchGeneration) break;
                activeBatch = [];
                // Cards still waiting for item data the batch didn't bring
                // (failed, or no such item) show their tags without it.
                for (const entry of batch) {
                    if (entry.awaiting) JE.core.tagLayout?.releaseCardContext?.(entry.renderTarget, entry.awaiting);
                }
            }
        } finally {
            if (cancelBatchWait === cancel) cancelBatchWait = null;
            activeBatch = [];
            isProcessing = false;
            // Cancelled by a generation bump (a reinitialize or navigation
            // while a batch was in flight): the scan that followed queued its
            // cache misses but could not start a drain while this one ran.
            scheduleFetch();
        }
    }

    /**
     * Fetch item data for a batch of cards and fan out to all enabled renderers.
     * @param batch - Queued card entries.
     * @param generation - Batch generation counter to detect stale navigations.
     * */
    async function processBatch(batch: QueuedCard[], generation: number): Promise<void> {
        const userId = apiClient().getCurrentUserId();
        if (!userId) return;
        const epoch = JE.session?.getEpoch?.();
        /** @returns This batch still belongs to the active navigation and session. */
        const isCurrent = (): boolean => generation === batchGeneration
            && userId === apiClient().getCurrentUserId() && epoch === JE.session?.getEpoch?.();

        // Use arrays per ID to handle duplicate items (same movie in multiple rows)
        const elMap = new Map<string, QueuedCard[]>();
        for (const b of batch) {
            const sameItem = elMap.get(b.itemId);
            if (sameItem) sameItem.push(b);
            else elMap.set(b.itemId, [b]);
        }
        const ids = [...elMap.keys()];

        // Series/Season "latest episode added" costs the server a query per
        // container, so it is only asked for when an enabled renderer reads it.
        let needsLatestEpisode = false;
        for (const [, r] of renderers) {
            if (r.isEnabled() && r.needsLatestEpisode) { needsLatestEpisode = true; break; }
        }

        try {
            // Single API call for ALL cache-miss items via POST (no URL length limit)
            const response = record(await apiClient().ajax({
                type: 'POST',
                url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`, needsLatestEpisode ? { latestEpisode: true } : undefined),
                data: JSON.stringify(ids),
                contentType: 'application/json',
                dataType: 'json'
            }));

            const answered = members(response.Items);

            // Abort if navigation happened while we were waiting for the API response
            if (!isCurrent()) return;
            if (needsLatestEpisode) answered.forEach(item => rememberItemFacts(memberRecord(item)));
            const items = answered.map(memberRecord);
            const stripRevision = typeof response.StripRevision === 'string' ? response.StripRevision : null;
            tagStripRevision = stripRevision;

            // Build parent series lookup for rating fallback
            const parentSeriesNeeded = new Set<string>();
            for (const item of items) {
                const seriesId = idText(item.SeriesId);
                if ((item.Type === 'Season' || item.Type === 'Episode') && seriesId &&
                    !item.CommunityRating && !item.CriticRating) {
                    parentSeriesNeeded.add(seriesId);
                }
                // Genre also needs parent series for Season items
                if (item.Type === 'Season' && seriesId) {
                    parentSeriesNeeded.add(seriesId);
                }
            }

            // Batch-fetch any parent series items we need (these are likely already in the same response)
            const parentSeriesMap = new Map<string, JsonRecord>();
            for (const item of items) {
                // An item without an id fails the batch here: nothing in it could be matched to a card.
                if (item.Id === undefined || item.Id === null) throw new TypeError('A tag-data item has no id');
                parentSeriesMap.set(normalizeItemId(item.Id), item);
            }
            // For parent series not in this batch, fetch individually
            for (const seriesId of parentSeriesNeeded) {
                const normalizedId = normalizeItemId(seriesId);
                if (!parentSeriesMap.has(normalizedId)) {
                    try {
                        const parent = await getParentSeries(userId, seriesId);
                        if (!isCurrent()) return;
                        if (parent) parentSeriesMap.set(normalizedId, parent);
                    } catch {}
                }
            }

            // Render each item as soon as its data is ready.
            // Items that DON'T need first-episode data (Movies, Episodes) render immediately.
            // Items that DO (Series, Season) render after their first-episode fetch completes.
            // This way a slow first-episode lookup doesn't block everything else.

            // Hosts rendered since the last corner-stacking pass: measured once
            // per yield chunk (below) rather than once per card.
            let pendingHosts: HTMLElement[] = [];
            const stackPendingHosts = () => {
                if (pendingHosts.length === 0) return;
                JE.core.tagRenderer.applyCornerStacking(pendingHosts);
                pendingHosts = [];
            };

            const renderItem = (item: JsonRecord, firstEpisode: JsonRecord | null): void => {
                // Re-check per render: first-episode/parent-series awaits can
                // span a navigation OR a user switch (clearProcessed bumps the
                // generation) — stale data must not be rendered or persisted.
                if (!isCurrent()) return;
                const itemId = normalizeItemId(item.Id);
                const batchEntries = elMap.get(itemId);
                if (!batchEntries || batchEntries.length === 0) return;
                if (!isMediaType(item.Type)) return;
                rememberLookFacts(itemId, item);

                let parentSeries: JsonRecord | null = null;
                let ratingParentSeries: JsonRecord | null = null;
                if (item.SeriesId) {
                    const parentId = normalizeItemId(item.SeriesId);
                    parentSeries = parentSeriesMap.get(parentId) || null;
                    if ((item.Type === 'Season' || item.Type === 'Episode') &&
                        !item.CommunityRating && !item.CriticRating) {
                        ratingParentSeries = parentSeries;
                    }
                }

                // Render to ALL cards with this ID (same item can appear in multiple rows)
                for (const entry of batchEntries) {
                    let { el, renderTarget } = entry;
                    if (!stillShows(entry)) continue; // the card now shows another item
                    // The queued renderTarget can go stale between scan and render
                    // (Series/Season wait on a first-episode fetch first, giving
                    // Jellyfin time to rebuild the card's subtree). Re-resolve from
                    // the still-tracked card element rather than dropping the tag —
                    // resolveRenderTarget is a couple of cheap DOM queries, not a fetch.
                    if (!renderTarget.isConnected) {
                        if (!el.isConnected) continue; // card itself is gone
                        renderTarget = resolveRenderTarget(el);
                    }
                    const extras: RenderExtras = { firstEpisode, parentSeries, ratingParentSeries, renderTarget, stripRevision };
                    // Dropped by the layout when the card shows another item by now.
                    if (JE.core.tagLayout?.setCardContext?.(renderTarget, item, itemId, entry.cardId) === false) continue;
                    for (const [name, renderer] of renderers) {
                        if (!renderer.isEnabled()) continue;
                        try {
                            renderer.render(renderTarget, item, extras);
                        } catch (err) {
                            console.warn(`${logPrefix} Renderer "${name}" failed for item ${itemId}:`, err);
                        }
                    }
                    pendingHosts.push(renderTarget);
                }
            };

            // Check if ANY enabled renderer actually needs first-episode data
            let anyNeedsFirstEp = false;
            for (const [, r] of renderers) {
                if (r.isEnabled() && r.needsFirstEpisode) { anyNeedsFirstEp = true; break; }
            }

            // Process all items: render immediately what we can, fetch first episodes in parallel.
            // Yield every RENDER_YIELD_CHUNK items so a large batch (e.g. a
            // broad search) can't block the main thread in one long synchronous stretch.
            const pendingFirstEps: Promise<void>[] = [];
            let renderedSinceYield = 0;
            for (const item of items) {
                const firstEpisode = isRecord(item.FirstEpisode) ? item.FirstEpisode : null;
                if (anyNeedsFirstEp && firstEpisode?.NeedsStreamFetch) {
                    // Series/Season: fetch first episode in background, render when ready.
                    // These land one at a time, so their hosts are stacked in one
                    // batched frame rather than measured individually.
                    pendingFirstEps.push(
                        getFirstEpisode(userId, String(item.Id), idText(firstEpisode.Id))
                            .then(ep => renderItem(item, ep))
                            .catch(() => renderItem(item, null))
                            .then(() => {
                                for (const host of pendingHosts) JE.core.tagRenderer.scheduleCornerStacking(host);
                                pendingHosts = [];
                            })
                    );
                } else {
                    // Movies, Episodes, etc: render immediately (no extra fetch needed)
                    renderItem(item, firstEpisode);
                    if (++renderedSinceYield >= RENDER_YIELD_CHUNK) {
                        renderedSinceYield = 0;
                        stackPendingHosts();
                        await idleYield();
                        if (!isCurrent()) return; // navigation or user switch while yielded
                    }
                }
            }
            stackPendingHosts();

            // Wait for all first-episode renders to complete before marking batch done
            if (pendingFirstEps.length > 0) {
                await Promise.all(pendingFirstEps);
            }
        } catch (err) {
            if (!isCurrent()) return;
            console.warn(`${logPrefix} Batch fetch failed, falling back to individual fetches:`, err);
            // Fallback: process items individually
            for (const queued of batch) {
                const { el, renderTarget: queuedRenderTarget, itemId, cardId } = queued;
                if (!isCurrent()) break; // navigation or user switch
                try {
                    const item = JE.helpers?.getItemCached
                        ? await JE.helpers.getItemCached(itemId, { userId })
                        : await apiClient().getItem(userId, itemId);
                    if (!isCurrent()) return;
                    if (!isRecord(item) || !isMediaType(item.Type)) continue;
                    rememberLookFacts(itemId, item, 'item');

                    const firstEpisode = (item.Type === 'Series' || item.Type === 'Season')
                        ? await getFirstEpisode(userId, String(item.Id)) : null;
                    if (!isCurrent()) break; // switched during the awaits above
                    if (!stillShows(queued)) continue; // the card now shows another item
                    let renderTarget = queuedRenderTarget;
                    if (!renderTarget.isConnected) {
                        if (!el.isConnected) continue; // card itself is gone
                        renderTarget = resolveRenderTarget(el);
                    }
                    const extras: RenderExtras = { firstEpisode, parentSeries: null, ratingParentSeries: null, renderTarget, stripRevision: null };
                    const layout = JE.core.tagLayout;
                    if (layout?.cardIdentity && layout.cardIdentity(renderTarget) !== cardId) continue;
                    if (!needsLibraryFacts() && layout?.setCardContext?.(renderTarget, item, itemId, cardId) === false) continue;

                    for (const [, renderer] of renderers) {
                        if (!renderer.isEnabled()) continue;
                        try { renderer.render(renderTarget, item, extras); } catch {}
                    }
                    JE.core.tagRenderer.applyCornerStacking(renderTarget);
                } catch {}
            }
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────

    /**
     * Initialize the tag pipeline: register mutation observer, navigation handler, and inject base CSS.
     * */
    function initialize(): void {
        if (!JE.helpers?.onBodyMutation) {
            console.warn(`${logPrefix} helpers.onBodyMutation not available, retrying...`);
            setTimeout(initialize, 100);
            return;
        }
        if (pipelineStarted) return;
        // No tag type is enabled, so nothing would ever be drawn: don't download
        // the server cache, store it, or refresh it on every navigation. Turning
        // a tag type on later registers its renderer, which starts the pipeline.
        if (!anyTagTypeEnabled()) {
            startWhenRendererRegisters = true;
            console.log(`${logPrefix} No tag renderers enabled; idle until one is`);
            return;
        }
        startWhenRendererRegisters = false;
        pipelineStarted = true;

        // Register as body mutation subscriber at priority 0 (after hidden-content and prefetch).
        // Only trigger scans when nodes were actually added to the DOM — ignore attribute
        // changes, text changes, and hover/focus effects which cause jank if we scan on each.
        JE.helpers.onBodyMutation('tag-pipeline', (mutations) => {
            for (let i = 0; i < mutations.length; i++) {
                if (mutations[i]?.addedNodes.length) {
                    scheduleScan();
                    return;
                }
            }
        }, { priority: 0 });

        // Cards reused in place for another item (see releaseReusedCards):
        // one attribute observer for the page, never one per card.
        const createObserver = JE.core?.dom?.createObserver || JE.helpers?.createObserver;
        if (typeof createObserver === 'function') {
            createObserver('tag-pipeline-card-identity', releaseReusedCards, document.body, {
                subtree: true, attributes: true, attributeFilter: ['data-id', 'data-itemid', 'style'], attributeOldValue: true,
            });
        }

        // Also trigger on navigation
        if (JE.helpers.onNavigate) {
            lastNavigationRoute = navigationRoute();
            JE.helpers.onNavigate(() => {
                // jellyfin-web rewrites the URL's `query` parameter on every
                // keystroke in the search box (#/search?query=a → ?query=ab),
                // which the navigation layer reports like any other navigation.
                // Nothing below is needed for that: the page is the same, its
                // new result cards reach the scan through the body observer,
                // and the batch in flight for cards still on screen may as well
                // finish. Anything else (another path, another item id) is a
                // real page change.
                const route = navigationRoute();
                if (route === lastNavigationRoute) return;
                lastNavigationRoute = route;
                // Invalidate any in-flight batch processing (don't reset isProcessing
                // directly — let stale batches finish naturally and discard results)
                advanceBatchGeneration();
                scanGeneration++;
                // Cancelled work is not processed: surviving/re-attached cards
                // must be eligible for the scan scheduled below.
                for (const entry of [...requestQueue, ...activeBatch]) processedCards.delete(entry.el);
                firstEpisodeCache.clear();
                parentSeriesCache.clear();
                requestQueue = [];
                // The discarded queue must not leave a debounce behind. The
                // next scan schedules a fresh fetch for its released cards.
                if (fetchTimer) clearTimeout(fetchTimer);
                fetchTimer = null;
                // Pick up any new items added since last load
                scheduleNavigationRefresh();
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
                .je-tag-host .rating-overlay-container,
                .je-tag-host .age-rating-overlay-container,
                .je-tag-host .status-overlay-container,
                .je-tag-host .logo-overlay-container {
                    contain: layout style;
                    pointer-events: none;
                    z-index: auto !important;
                }
                /* The top-right indicator offset (unwatched count, played check) is a
                   stable slot rule in tags/tag-layout-styles.js. */
            `);

            // Card-width sizing; mobile layout and browsers without container queries keep the per-tag rules.
            const scaleCss = `
                @supports (container-type: inline-size) {
                    .je-tag-host { container-type: inline-size; }
                    html:not(.layout-mobile) .je-tag-host .quality-overlay-container { gap: calc(clamp(1px, 1.8cqw, 4px) * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                    html:not(.layout-mobile) .je-tag-host :is(.quality-overlay-label, .language-chip) {
                        font-size: calc(clamp(9px, 6.6cqw, 13.6px) * var(--je-tag-scale, 1));
                        padding: calc(clamp(0px, 0.6cqw, 2px) * var(--je-tag-scale, 1)) calc(clamp(4px, 4.2cqw, 10px) * var(--je-tag-scale, 1));
                        border-radius: calc(clamp(2px, 2.4cqw, 5px) * var(--je-tag-scale, 1));
                    }
                    html:not(.layout-mobile) .je-tag-host .language-overlay-container { gap: calc(clamp(1px, 1.8cqw, 3px) * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                    html:not(.layout-mobile) .je-tag-host .language-flag { width: calc(clamp(16px, 15cqw, 32px) * var(--je-tag-scale, 1)); }
                    html:not(.layout-mobile) .je-tag-host .rating-overlay-container { gap: calc(clamp(2px, 1.8cqw, 3px) * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                    html:not(.layout-mobile) .je-tag-host .rating-tag {
                        font-size: calc(clamp(9px, 6.8cqw, 13px) * var(--je-tag-scale, 1));
                        padding: calc(clamp(2px, 2cqw, 4px) * var(--je-tag-scale, 1)) calc(clamp(4px, 4.5cqw, 8px) * var(--je-tag-scale, 1));
                        gap: calc(clamp(2px, 2.2cqw, 4px) * var(--je-tag-scale, 1));
                    }
                    html:not(.layout-mobile) .je-tag-host .rating-star-icon { font-size: calc(clamp(9px, 7cqw, 14px) * var(--je-tag-scale, 1)) !important; }
                    html:not(.layout-mobile) .je-tag-host .rating-tomato-icon { width: calc(clamp(9px, 7cqw, 14px) * var(--je-tag-scale, 1)); height: calc(clamp(9px, 7cqw, 14px) * var(--je-tag-scale, 1)); }
                    html:not(.layout-mobile) .je-tag-host .genre-overlay-container { gap: calc(clamp(2px, 1.8cqw, 4px) * var(--je-tag-scale, 1) * var(--je-tag-gap, 1)); }
                    html:not(.layout-mobile) .je-tag-host .genre-tag {
                        width: calc(clamp(18px, 15cqw, 30px) * var(--je-tag-scale, 1));
                        height: calc(clamp(18px, 15cqw, 30px) * var(--je-tag-scale, 1));
                        min-width: calc(clamp(18px, 15cqw, 30px) * var(--je-tag-scale, 1));
                    }
                    html:not(.layout-mobile) .je-tag-host .genre-tag .je-msym-outlined { font-size: calc(clamp(11px, 9.5cqw, 20px) * var(--je-tag-scale, 1)); }
                }
            `;
            JE.helpers.addCSS('je-tag-card-scale', JE.core.tagLayout?.preserveLegacySizing?.(scaleCss) || scaleCss);

            // "Hide Tags on Hover" setting: fully hides the tag layer on hover.
            // Without this, Jellyfin's overlay already covers tags (they're behind it).
            // This setting makes them completely invisible for users who want zero clutter.
            // Summary and minimal reveal their full chips on hover instead, so
            // there it hides every slot but that reveal (tag-layout-styles.js).
            JE.helpers.addCSS('je-tag-hover-fade', `
                body.je-tags-hide-on-hover .card:hover .je-tag-host:not([data-je-layout="summary"]):not([data-je-layout="minimal"]) {
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

    const api: PipelineApi = {
        registerRenderer,
        initialize,
        getFirstEpisode,
        getParentSeries,
        lookupServerEntries,
        rememberItemFacts,
        peekItemFacts,
        lookupItemFacts,
        peekSeasonFacts,
        /**
         * The caller-filtered server tag-cache entry already in memory for an
         * item, without fetching (the status renderer reads parent facts, the
         * tag look lock reads an item's library and genres). The shared entry
         * is read-only; a memory miss is null.
         * @param itemId - Normalised item id.
         * */
        peekServerEntry(itemId: string): JsonRecord|null { return serverCache?.get(itemId) || null; },
        /** @param name - Renderer name (e.g. 'quality'). */
        getRenderer(name: string) { return renderers.get(name); },
        /** The item data an item's cards are matched on by tag look rules (server entry, remembered, else fetched). */
        itemLookFacts,
        /**
         * Every server tag-cache entry in memory (empty without one).
         * */
        serverEntries(): Iterable<JsonRecord> { return serverCache ? serverCache.values() : []; },
        waitForServerCache,
        /** End the running waitForServerCache() (it resolves false). */
        stopWaitingForServerCache() { serverCacheWait++; },
        /**
         * Review rating averages that came with the server cache, once the
         * load or refresh in flight has settled: Map<"mediaType:tmdbKey",
         * average>, or null when the server cache (or the poster chips) is
         * off — the user review tags then ask /reviews/ratings themselves.
         * */
        getReviewRatings(): Promise<Map<string, number>|null> {
            return (loadInFlight || refreshInFlight || Promise.resolve()).then(() => reviewRatings);
        },
        /**
         * The review rating averages already at hand, without waiting.
         * */
        peekReviewRatings(): Map<string, number>|null { return reviewRatings; },
        /** @returns Bumped each time the review rating averages are replaced. */
        /** @returns performance.now() when the request behind the current review averages started (0 = none). */
        getReviewRatingsRequestedAt(): number { return reviewRatingsRequestedAt; },
        /**
         * What Spoiler Guard's Hide tags strips from this user's /tag-data
         * answers: "none" for nothing, another string for a guard set, null
         * while unknown (before the first answer when the bootstrap did not
         * say, and after a user switch or Spoiler Guard change).
         * */
        tagStripRevision(): string|null { return tagStripRevision; },
        /**
         * Subscribe to accepted review averages maps.
         * @param listener - Receives the "mediaType:tmdbKey" keys whose value changed (possibly none), or null for all.
         */
        onReviewRatingsChanged(listener: (changed: Set<string>|null) => void) { reviewRatingsListeners.add(listener); },
        // For reinitialize support
        clearProcessed() {
            processedCards = new WeakSet(); // Create fresh WeakSet so all cards get re-scanned
            requestQueue = [];
            advanceBatchGeneration();
            scanGeneration++; // a scan chain waiting on the stored copy would render into the old set
            firstEpisodeCache.clear();
            parentSeriesCache.clear();
        },
        // Bust the server cache so the next scan re-fetches everything through the
        // spoiler-strip pipeline. Used after toggling Spoiler Guard so newly-eligible
        // items lose their cached unstripped tag data.
        /**
         * @param [options] - reuseStored keeps the
         *   browser's stored copy as the source (a user switch: the incoming
         *   user's own copy is still theirs); by default the copy is dropped
         *   and rewritten from a full download, because its per-user strip is
         *   what a Spoiler Guard toggle just changed.
         */
        async invalidateServerCache(options?: {reuseStored?: boolean}) {
            // Not started (no tag type enabled): no cache or overlays to replace.
            tagStripRevision = null;
            if (!pipelineStarted) return;
            // Hold a flag for the duration of the reload so concurrent scheduleScan()
            // calls (from the body MutationObserver during the await) no-op instead of
            // processing cards against the empty cache. processedCards is reset a
            // SECOND time after load so cards partially marked during await re-scan.
            isInvalidating = true;
            try {
                dropServerCache();
                tagStripRevision = null;
                processedCards = new WeakSet();
                requestQueue = [];
                advanceBatchGeneration();
                scanGeneration++;
                firstEpisodeCache.clear();
                parentSeriesCache.clear();
                // Clear each renderer's derived cache (e.g. quality's serverQualityCache)
                // so it recomputes from the refreshed, spoiler-stripped server data.
                for (const [, renderer] of renderers) {
                    if (renderer.onServerCacheRefresh) {
                        try { renderer.onServerCacheRefresh(null); } catch {}
                    }
                }
                // Remove overlays ALREADY in the DOM and clear the per-card "tagged"
                // markers. Without this the re-scan skips cards it considers processed,
                // so genre/quality/rating overlays inserted BEFORE Spoiler Guard was
                // enabled linger on unwatched-episode cards until a full page reload.
                // Mirrors what each feature's own reinitialize does.
                try {
                    document.querySelectorAll(
                        '.quality-overlay-container, .rating-overlay-container, '
                        + '.genre-overlay-container, .language-overlay-container, '
                        + '.age-rating-overlay-container, .status-overlay-container, .awards-overlay-container, .logo-overlay-container, .custom-overlay-container'
                    ).forEach(function (el) { el.remove(); });
                    document.querySelectorAll<HTMLElement>(
                        '[data-je-quality-tagged], [data-je-rating-tagged], '
                        + '[data-je-genre-tagged], [data-je-language-tagged], '
                        + '[data-je-age-rating-tagged], [data-je-status-tagged], [data-je-awards-tagged], [data-je-logo-tagged], [data-je-custom-tagged]'
                    ).forEach(function (el) {
                        delete el.dataset.jeQualityTagged;
                        delete el.dataset.jeRatingTagged;
                        delete el.dataset.jeGenreTagged;
                        delete el.dataset.jeLanguageTagged;
                        delete el.dataset.jeAgeRatingTagged;
                        delete el.dataset.jeStatusTagged;
                        delete el.dataset.jeAwardsTagged;
                        delete el.dataset.jeLogoTagged;
                        delete el.dataset.jeCustomTagged;
                    });
                    // Pills, dots, hover copies and caption outlets carry no
                    // group wrapper class: the layout controller drops them.
                    JE.core.tagLayout?.clearAll();
                } catch (domErr) {
                    console.warn(`${logPrefix} overlay cleanup during invalidate failed:`, domErr);
                }
                const forceDownload = !options?.reuseStored;
                if (anyTagTypeEnabled()) {
                    deferredLoad = null;
                    await loadServerCache({ forceDownload });
                    processedCards = new WeakSet();
                } else {
                    // Every tag type is off: load when one is turned on (registerRenderer),
                    // still as a fresh download if any skipped reload needed one.
                    deferredLoad = { forceDownload: forceDownload || !!deferredLoad?.forceDownload };
                }
            } catch (e) {
                console.warn(`${logPrefix} invalidateServerCache failed:`, e);
            } finally {
                isInvalidating = false;
            }
            try {
                runScan();
            } catch (e) {
                console.warn(`${logPrefix} post-invalidate scan failed:`, e);
            }
        },
        scheduleScan,
    };
    JE.tagPipeline = api;

    // The server tag cache is fetched per user (spoiler-stripped for that
    // user), so it must not survive a user switch. Reset synchronously here;
    // the full invalidate-and-reload (which also strips stale DOM overlays)
    // runs once the new user's data is live — reloading at reset time would
    // race the credential swap. The stored copy is per user as well: the
    // outgoing user's is deleted when the incoming user's opens.
    JE.session?.onUserChange('tag-pipeline', () => {
        dropServerCache();
        tagStripRevision = null;
        // The outgoing user's remembered tag look facts; the incoming user's
        // stored copy loads (owner checked) on first use.
        lookFacts = null;
        reviewRatings = null;
        reviewRatingsRequestedAt = 0;
        skipStoreThisSession = false;
        perCardThisSession = false;
        api.clearProcessed();
    });
    document.addEventListener('je:user-data-loaded', () => {
        // The incoming user's layout, density and hide-on-hover choice.
        JE.reinitializeTagLayout?.();
        // The incoming user's tag types registered during the switch and
        // already started loading their cache: don't drop it and load again.
        const startedThisSwitch = loadStartedForEpoch !== null && loadStartedForEpoch === JE.session?.getEpoch?.();
        loadStartedForEpoch = null;
        if (startedThisSwitch) return;
        api.invalidateServerCache({ reuseStored: true }).catch(() => {});
    });

    console.log(`${logPrefix} Module loaded`);
}
