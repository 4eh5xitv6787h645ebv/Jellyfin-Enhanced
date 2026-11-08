(() => {
"use strict";
(() => {
  // client/src/host/tag-runtime-host.ts
  function tagRuntimeHost() {
    const host = window;
    const bridge = host.JellyfinEnhanced ?? (host.JellyfinEnhanced = {});
    bridge.core ?? (bridge.core = {});
    return bridge;
  }
  function hasApiClient() {
    const host = window;
    return host.ApiClient !== void 0 && host.ApiClient !== null;
  }
  function apiClient() {
    const host = window;
    if (!host.ApiClient) throw new Error("Jellyfin ApiClient unavailable");
    return host.ApiClient;
  }

  // client/src/features/media-tags/runtime/dto.ts
  var EMPTY = Object.freeze({});
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function record(value) {
    return isRecord(value) ? value : EMPTY;
  }
  function records(value) {
    return Array.isArray(value) ? value.filter(isRecord) : [];
  }
  function stringList(value) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
  }
  function members(value) {
    if (!value) return [];
    if (!Array.isArray(value)) throw new TypeError("Expected a list");
    return value;
  }
  function memberRecord(value) {
    if (value === null || value === void 0) throw new TypeError("Read a missing list member");
    return record(value);
  }
  function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  function normalizeItemId(id) {
    return String(id).replace(/-/g, "").toLowerCase();
  }
  function idText(value) {
    return typeof value === "string" && value || typeof value === "number" && Number.isFinite(value) ? String(value) : null;
  }
  function errorStatus(error) {
    return isRecord(error) && typeof error.status === "number" ? error.status : 0;
  }

  // client/src/features/media-tags/runtime/tag-pipeline.ts
  function entryPairs(items) {
    return Object.entries(record(items)).filter((pair) => isRecord(pair[1]));
  }
  var servedAtOf = (resp) => typeof resp.servedAt === "number" ? resp.servedAt : 0;
  var textOrEmpty = (value) => typeof value === "string" ? value : "";
  var cursorOf = (resp) => finite(resp.timestamp) ?? 0;
  function firstItem(response) {
    const first = Array.isArray(response.Items) ? response.Items[0] : null;
    return isRecord(first) ? first : null;
  }
  function createTagPipeline(JE) {
    const MEDIA_TYPES = /* @__PURE__ */ new Set(["Movie", "Episode", "Series", "Season", "BoxSet", "Video"]);
    const isMediaType = (type) => typeof type === "string" && MEDIA_TYPES.has(type);
    const FETCH_DEBOUNCE_MS = 150;
    const NAV_REFRESH_MIN_INTERVAL_MS = 2e4;
    const SERVER_CACHE_WAIT_DELAYS = [2e3, 3e3, 5e3, 5e3, 1e4, 1e4, 15e3, 15e3, 3e4, 3e4, 3e4, 3e4, 6e4, 6e4];
    const logPrefix = "🪼 Jellyfin Enhanced [TagPipeline]:";
    let serverCache = null;
    let serverCacheComplete = false;
    let serverCacheVersion = 0;
    let serverCacheTimestamp = 0;
    let serverFilterRevision = null;
    let serverFilterBase = "";
    let cacheGeneration = 0;
    let storeGate = null;
    let openStoreGate = null;
    const deltaIds = /* @__PURE__ */ new Set();
    let deltaInFlight = null;
    let storeBaseServedAt = 0;
    let storeScope = null;
    let persistGeneration = 0;
    let persistChain = Promise.resolve();
    const storeMisses = /* @__PURE__ */ new Set();
    let skipStoreThisSession = false;
    let perCardThisSession = false;
    let loadInFlight = null;
    let loadInFlightEpoch = 0;
    let refreshInFlight = null;
    let serverCacheWait = 0;
    let lastNavigationRoute = null;
    let lastNavRefreshAt = -Infinity;
    let navRefreshTimer = null;
    let reviewRatings = null;
    let reviewRatingsRequestedAt = 0;
    const reviewRatingsListeners = /* @__PURE__ */ new Set();
    const PERSIST_SLICE = 250;
    const PERSIST_START_DELAY_MS = 1500;
    const STORED_ENTRY_SCHEMA = JE.tagCacheStore?.ENTRY_SCHEMA ?? 10;
    const MEMORY_SOFT_CAP = 2e4;
    const FULL_LOAD_PAGE = 2e3;
    const FULL_LOAD_RESTARTS = 2;
    const FULL_LOAD_RESTART_DELAYS = [0, 1500, 4e3];
    const TAG_SETTING_KEYS = ["qualityTagsEnabled", "genreTagsEnabled", "ratingTagsEnabled", "ageRatingTagsEnabled", "statusTagsEnabled", "languageTagsEnabled", "awardsTagsEnabled", "logoTagsEnabled", "customTagsEnabled"];
    const renderers = /* @__PURE__ */ new Map();
    let processedCards = /* @__PURE__ */ new WeakSet();
    const firstEpisodeCache = /* @__PURE__ */ new Map();
    const seasonFactIds = /* @__PURE__ */ new Map();
    const itemFacts = /* @__PURE__ */ new Map();
    const ITEM_FACTS_TTL_MS = 10 * 60 * 1e3;
    const parentSeriesCache = /* @__PURE__ */ new Map();
    let fetchTimer = null;
    let pipelineStarted = false;
    let startWhenRendererRegisters = false;
    let deferredLoad = null;
    let loadStartedForEpoch = null;
    let isProcessing = false;
    let batchGeneration = 0;
    let cancelBatchWait = null;
    function advanceBatchGeneration() {
      batchGeneration++;
      cancelBatchWait?.();
    }
    let activeBatch = [];
    let requestQueue = [];
    const cardReuse = /* @__PURE__ */ new WeakMap();
    let prefetchedStripRevision;
    try {
      prefetchedStripRevision = JE.takePrefetched?.("TagStripRevision");
    } catch {
    }
    let tagStripRevision = typeof prefetchedStripRevision === "string" ? prefetchedStripRevision : null;
    function forgetItemFacts(id) {
      const saved = itemFacts.get(id);
      if (saved?.seasonKey && seasonFactIds.get(saved.seasonKey) === id) seasonFactIds.delete(saved.seasonKey);
      itemFacts.delete(id);
    }
    function rememberItemFacts(entry, id = entry.Id, fetchedAt = Date.now()) {
      if (!id || entry.Type !== "Series" && entry.Type !== "Season") return;
      const itemId = normalizeItemId(id);
      if (!Number.isFinite(fetchedAt) || fetchedAt + ITEM_FACTS_TTL_MS <= Date.now() || (itemFacts.get(itemId)?.fetchedAt ?? -Infinity) > fetchedAt) return;
      forgetItemFacts(itemId);
      const seriesId = entry.SeriesId ? normalizeItemId(entry.SeriesId) : null;
      const seasonKey = entry.Type === "Season" && seriesId ? `${seriesId}:${entry.SeasonNumber ?? entry.IndexNumber}` : null;
      if (seasonKey) {
        const previousId = seasonFactIds.get(seasonKey);
        if (previousId) forgetItemFacts(previousId);
        seasonFactIds.set(seasonKey, itemId);
      }
      itemFacts.set(itemId, { entry, fetchedAt, expires: fetchedAt + ITEM_FACTS_TTL_MS, seasonKey });
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
    function peekItemFacts(id) {
      const entry = serverCache?.get(id);
      if (entry) return entry;
      const saved = itemFacts.get(id);
      if (saved && saved.expires > Date.now()) return saved.entry;
      forgetItemFacts(id);
      return null;
    }
    async function lookupItemFacts(ids) {
      const generation = cacheGeneration;
      const epoch = JE.session ? JE.session.getEpoch() : 0;
      await lookupServerEntries(ids);
      if (generation !== cacheGeneration || JE.session && !JE.session.isCurrent(epoch)) return;
      const missing = [...new Set(ids)].filter((id) => !peekItemFacts(id));
      const userId = apiClient().getCurrentUserId();
      if (!userId) return;
      for (let i = 0; i < missing.length; i += 200) {
        try {
          const response = record(await apiClient().ajax({
            type: "POST",
            url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`, { latestEpisode: true }),
            data: JSON.stringify(missing.slice(i, i + 200)),
            contentType: "application/json",
            dataType: "json"
          }));
          if (generation !== cacheGeneration || JE.session && !JE.session.isCurrent(epoch)) return;
          for (const entry of members(response.Items)) rememberItemFacts(memberRecord(entry));
        } catch {
        }
      }
    }
    function peekSeasonFacts(seriesId, season) {
      const id = seasonFactIds.get(`${seriesId}:${season}`);
      return id ? peekItemFacts(id) : null;
    }
    const PIPELINE_SKIP_SELECTORS = [
      ".chapterCardImageContainer",
      // Scenes / chapters
      "#indexPage .verticalSection.MyMedia .cardImageContainer",
      // My Media row
      ".formDialog .cardImageContainer",
      // Modal dialogs
      "#pluginsPage .cardImageContainer",
      // Admin pages
      "#pluginCatalogPage .cardImageContainer",
      "#devicesPage .cardImageContainer",
      "#mediaLibraryPage .cardImageContainer",
      ".listItemImage:not(.listItemImage-large)",
      // Small list rows (Playlists, Albums); listItemImage-large (e.g. episode lists) is big enough for overlays
      ".jellyseerr-card .cardImageContainer"
      // Seerr cards (search, discovery, recommendations): TMDB posters, no Jellyfin item id, so they can never get tags — mark them processed instead of re-walking them on every scan
    ];
    const PIPELINE_SKIP_SELECTOR = PIPELINE_SKIP_SELECTORS.join(", ");
    function shouldSkipElement(el) {
      return el.closest(PIPELINE_SKIP_SELECTOR) !== null;
    }
    function registerRenderer(name, config) {
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
        cleanup: config.cleanup || null
      });
      if (config.injectCss) {
        try {
          config.injectCss();
        } catch (e) {
          console.warn(`${logPrefix} Failed to inject CSS for ${name}:`, e);
        }
      }
      console.log(`${logPrefix} Renderer registered: ${name} (total: ${renderers.size})`);
      if (startWhenRendererRegisters && anyTagTypeEnabled()) {
        loadStartedForEpoch = JE.session?.getEpoch?.() ?? null;
        initialize();
        return;
      }
      if (deferredLoad && anyTagTypeEnabled()) {
        const { forceDownload } = deferredLoad;
        deferredLoad = null;
        loadStartedForEpoch = JE.session?.getEpoch?.() ?? null;
        api.invalidateServerCache({ reuseStored: !forceDownload }).catch(() => {
        });
        return;
      }
      processedCards = /* @__PURE__ */ new WeakSet();
      scheduleScan();
    }
    async function getFirstEpisode(userId, parentId, firstEpisodeId = null) {
      const cached = firstEpisodeCache.get(parentId);
      if (cached) return cached;
      const promise = (async () => {
        if (firstEpisodeId) {
          try {
            const enriched = record(await apiClient().ajax({
              type: "POST",
              url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`),
              data: JSON.stringify([firstEpisodeId]),
              contentType: "application/json",
              dataType: "json"
            }));
            const episode = firstItem(enriched);
            if (episode) return episode;
          } catch {
          }
        }
        try {
          const response = record(await apiClient().ajax({
            type: "GET",
            url: apiClient().getUrl("/Items", {
              ParentId: parentId,
              IncludeItemTypes: "Episode",
              IsVirtualItem: false,
              Recursive: true,
              SortBy: "PremiereDate",
              SortOrder: "Ascending",
              Limit: 1,
              Fields: "MediaStreams,MediaSources,Genres",
              userId
            }),
            dataType: "json"
          }));
          const episode = firstItem(response);
          if (!episode?.Id) return episode;
          try {
            const enriched = record(await apiClient().ajax({
              type: "POST",
              url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`),
              data: JSON.stringify([episode.Id]),
              contentType: "application/json",
              dataType: "json"
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
    async function getParentSeries(userId, seriesId) {
      const cached = parentSeriesCache.get(seriesId);
      if (cached) return cached;
      const promise = (async () => {
        try {
          const item = JE.helpers?.getItemCached ? await JE.helpers.getItemCached(seriesId, { userId }) : await apiClient().getItem(userId, seriesId);
          return isRecord(item) ? item : null;
        } catch {
          return null;
        }
      })();
      parentSeriesCache.set(seriesId, promise);
      return promise;
    }
    function cacheScope() {
      const userId = JE.session?.getUserId() || apiClient().getCurrentUserId();
      if (!userId) return null;
      return `${JE.session?.getServerId() || ""}:${userId}`;
    }
    function applyReviewRatings(resp, requestedAt) {
      if (requestedAt < reviewRatingsRequestedAt) return;
      reviewRatingsRequestedAt = requestedAt;
      const previous = reviewRatings;
      const raw = resp.reviewRatings;
      if (!isRecord(raw)) {
        reviewRatings = null;
      } else {
        const map = /* @__PURE__ */ new Map();
        for (const key in raw) {
          const value = raw[key];
          if (isRecord(value) && typeof value.average === "number" && Number.isFinite(value.average)) {
            map.set(key, value.average);
          }
        }
        reviewRatings = map;
      }
      notifyReviewRatingsChanged(previous, reviewRatings);
    }
    function notifyReviewRatingsChanged(previous, next) {
      if (reviewRatingsListeners.size === 0 || !previous && !next) return;
      let changed = null;
      if (previous && next) {
        changed = /* @__PURE__ */ new Set();
        for (const [key, value] of next) {
          if (previous.get(key) !== value) changed.add(key);
        }
        for (const key of previous.keys()) {
          if (!next.has(key)) changed.add(key);
        }
      }
      for (const listener of reviewRatingsListeners) {
        try {
          listener(changed);
        } catch (err) {
          console.warn(`${logPrefix} review ratings listener failed:`, err);
        }
      }
    }
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
    function releaseStoreGate(gate) {
      if (gate !== void 0 && gate !== storeGate) return;
      const open = openStoreGate;
      storeGate = null;
      openStoreGate = null;
      if (open) open();
    }
    function queuePersist(work) {
      persistChain = persistChain.then(work).catch((err) => {
        console.warn(`${logPrefix} Could not persist the server cache; keeping it in memory only:`, err);
      });
    }
    function persistFullCache(scope, resp, entries) {
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
        savedAt: Date.now()
      };
      storeScope = scope;
      const generation = ++persistGeneration;
      queuePersist(async () => {
        await new Promise((resolve) => setTimeout(resolve, PERSIST_START_DELAY_MS));
        if (generation !== persistGeneration) return;
        const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
    function releaseCompleteMemory(scope, servedAt) {
      if (!serverCacheComplete || !serverCache || serverCache.size <= MEMORY_SOFT_CAP || storeScope !== scope) return;
      const keep = /* @__PURE__ */ new Map();
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
    function persistDelta(entries, base, timestamp, servedAt, removed = []) {
      const scope = storeScope;
      if (!scope || !JE.tagCacheStore?.available()) return;
      const store = JE.tagCacheStore;
      const generation = persistGeneration;
      queuePersist(async () => {
        if (generation !== persistGeneration) return;
        await store.applyDelta(scope, base, entries, timestamp, servedAt, removed);
      });
    }
    async function restoreStoredCache() {
      const store = JE.tagCacheStore;
      if (!store?.available() || skipStoreThisSession) return false;
      const scope = cacheScope();
      if (!scope) return false;
      const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
      try {
        const meta = await store.getMeta(scope);
        queuePersist(() => store.clearOtherScopes(scope));
        if (JE.session && !JE.session.isCurrent(requestEpoch)) return false;
        const storedCursor = meta ? finite(meta.timestamp) : null;
        const storedFilter = meta?.filterRevision;
        const storedAt = meta?.servedAt;
        if (!meta || meta.pending || !(Number(meta.count) > 0) || !storedCursor || typeof storedFilter !== "string" || typeof storedAt !== "number") return false;
        if (meta.entrySchema !== store.ENTRY_SCHEMA) return false;
        const clearStamp = Number(JE.pluginConfig?.ClearLocalStorageTimestamp || 0);
        if (clearStamp > Number(meta.clearStamp || 0)) {
          console.log(`${logPrefix} Server triggered cache clear; dropping the stored copy`);
          await store.clearScope(scope);
          return false;
        }
        if (meta.schema !== STORED_ENTRY_SCHEMA) {
          console.log(`${logPrefix} Stored copy has entry schema ${String(meta.schema ?? "none")}, expected ${STORED_ENTRY_SCHEMA}; dropping it`);
          await store.clearScope(scope);
          return false;
        }
        serverCache = /* @__PURE__ */ new Map();
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
        releaseStoreGate();
        storeGate = new Promise((resolve) => {
          openStoreGate = resolve;
        });
        console.log(`${logPrefix} Server cache restored from IndexedDB: ${String(meta.count)} items (v${String(meta.version)}), awaiting confirmation`);
        return true;
      } catch (err) {
        console.warn(`${logPrefix} Could not read the stored server cache:`, err);
        return false;
      }
    }
    async function downloadFullCache(options) {
      const userId = apiClient().getCurrentUserId();
      if (!userId) return false;
      const scope = cacheScope();
      const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
      const requestedAt = performance.now();
      const fresh = options?.fresh || JE.tagCacheStore?.available() ? Date.now() : 0;
      const loaded = await fetchFullPages(userId, fresh, requestEpoch, scope);
      if (!loaded) return false;
      if (JE.session && !JE.session.isCurrent(requestEpoch)) return false;
      if (loaded.unbounded) {
        console.log(`${logPrefix} Server cache too large to hold without a stored copy; tags load per card this session`);
        dropServerCache();
        perCardThisSession = true;
        return false;
      }
      const { resp, entries, pages } = loaded;
      applyReviewRatings(resp, requestedAt);
      if (loaded.stored) {
        persistGeneration++;
        itemFacts.clear();
        seasonFactIds.clear();
        serverCache = /* @__PURE__ */ new Map();
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
        if (pages > 1) fetchDelta().catch(() => {
        });
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
      releaseStoreGate();
      console.log(`${logPrefix} Server cache loaded: ${serverCache.size} items (v${String(serverCacheVersion)}${pages > 1 ? `, ${pages} pages` : ""})`);
      if (scope) persistFullCache(scope, resp, entries);
      if (pages > 1) fetchDelta().catch(() => {
      });
      return true;
    }
    async function fetchFullPages(userId, fresh, requestEpoch, scope) {
      const get = async (params) => {
        const resp = await apiClient().ajax({ type: "GET", url: apiClient().getUrl(`/JellyfinEnhanced/tag-cache/${userId}`, params), dataType: "json" });
        return JE.session && !JE.session.isCurrent(requestEpoch) || !isRecord(resp) ? null : resp;
      };
      const base = fresh ? { fresh } : {};
      for (let attempt = 0; attempt <= FULL_LOAD_RESTARTS; attempt++) {
        if (FULL_LOAD_RESTART_DELAYS[attempt]) await new Promise((resolve) => setTimeout(resolve, FULL_LOAD_RESTART_DELAYS[attempt]));
        let entries = [];
        let stream = null;
        let first = null;
        let last = null;
        let pages = 0;
        let after = "";
        let consistent = true;
        for (; ; ) {
          const resp2 = await get({ ...base, limit: FULL_LOAD_PAGE, ...after ? { after } : {} });
          if (resp2 === null) return null;
          pages++;
          if (!first) first = resp2;
          else if (resp2.version !== first.version || resp2.filterRevision !== first.filterRevision) {
            consistent = false;
            break;
          }
          last = resp2;
          const pairs = entryPairs(resp2.items);
          if (stream) {
            if (!await streamEntries(stream, pairs)) return { unbounded: true };
          } else {
            for (const pair of pairs) entries.push(pair);
            if (entries.length > MEMORY_SOFT_CAP) {
              stream = await beginStream(scope, first);
              if (!stream || !await streamEntries(stream, entries)) return { unbounded: true };
              entries = [];
            }
          }
          if (typeof resp2.next !== "string" || !resp2.next) break;
          after = resp2.next;
        }
        if (!consistent) continue;
        const head = first ?? {};
        const resp = { ...head, items: null, count: stream ? stream.count : entries.length, reviewRatings: last?.reviewRatings ?? first?.reviewRatings };
        if (!stream) return { resp, entries, pages };
        const committed = await commitStream(stream, head);
        if (!committed) return { unbounded: true };
        return { resp, entries: [], pages, stored: { scope: stream.scope, servedAt: servedAtOf(head), count: stream.count } };
      }
      return null;
    }
    async function beginStream(scope, first) {
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
    async function streamEntries(stream, pairs) {
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
    async function commitStream(stream, first) {
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
          savedAt: Date.now()
        });
        if (ok) console.log(`${logPrefix} Server cache persisted: ${stream.count} items`);
        return ok;
      } catch (err) {
        console.warn(`${logPrefix} Could not commit the stored copy:`, err);
        return false;
      }
    }
    function loadServerCache(options) {
      if (!JE.pluginConfig?.TagCacheServerMode) {
        console.log(`${logPrefix} Server cache mode disabled`);
        return Promise.resolve();
      }
      if (perCardThisSession) return Promise.resolve();
      const epoch = JE.session ? JE.session.getEpoch() : 0;
      if (loadInFlight && !options?.forceDownload && loadInFlightEpoch === epoch) return loadInFlight;
      const previous = loadInFlight;
      const load = (async () => {
        if (previous) await previous;
        try {
          if (!apiClient().getCurrentUserId()) return;
          if (!options?.forceDownload && await restoreStoredCache()) {
            await fetchDelta();
            return;
          }
          await downloadFullCache({ fresh: !!options?.forceDownload });
        } catch (err) {
          releaseStoreGate();
          console.warn(`${logPrefix} Failed to load server cache, using batch fallback:`, err);
          if (!serverCache) skipStoreThisSession = true;
          if (errorStatus(err) === 404 && JE.tagCacheStore?.available()) {
            const scope = cacheScope();
            if (scope) JE.tagCacheStore.clearScope(scope).catch(() => {
            });
          }
        }
      })();
      loadInFlight = load;
      loadInFlightEpoch = epoch;
      load.finally(() => {
        if (loadInFlight === load) loadInFlight = null;
      });
      return load;
    }
    function refreshServerCache() {
      if (refreshInFlight) return refreshInFlight;
      const refresh = refreshServerCacheCore();
      refreshInFlight = refresh;
      refresh.finally(() => {
        if (refreshInFlight === refresh) refreshInFlight = null;
      });
      return refresh;
    }
    async function waitForServerCache(ready, options) {
      if (!JE.pluginConfig?.TagCacheServerMode) return false;
      const wait = ++serverCacheWait;
      const epoch = JE.session ? JE.session.getEpoch() : 0;
      const ended = () => wait !== serverCacheWait || JE.session && !JE.session.isCurrent(epoch);
      for (const delay of options?.delays || SERVER_CACHE_WAIT_DELAYS) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (ended()) return false;
        try {
          await refreshServerCache();
        } catch {
        }
        if (ended()) return false;
        if (serverCache && ready(serverCache.values())) return true;
      }
      return false;
    }
    function navigationRoute() {
      const url = new URL(window.location.href);
      const [hashPath, hashQuery = ""] = url.hash.split("?");
      const params = new URLSearchParams(hashQuery);
      for (const [name, value] of url.searchParams) params.append(name, value);
      params.delete("query");
      params.sort();
      return `${url.pathname}${hashPath}?${params}`;
    }
    function scheduleNavigationRefresh() {
      if (!anyTagTypeEnabled()) return;
      const now = performance.now();
      const elapsed = now - lastNavRefreshAt;
      if (!serverCache || elapsed >= NAV_REFRESH_MIN_INTERVAL_MS) {
        if (navRefreshTimer) {
          clearTimeout(navRefreshTimer);
          navRefreshTimer = null;
        }
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
      if (!serverCache) {
        if (loadInFlight) return;
        await loadServerCache();
        if (serverCache) {
          processedCards = /* @__PURE__ */ new WeakSet();
          runScan();
        }
        return;
      }
      await fetchDelta();
    }
    function fetchDelta() {
      const epoch = JE.session ? JE.session.getEpoch() : 0;
      if (deltaInFlight && deltaInFlight.epoch === epoch && deltaInFlight.generation === cacheGeneration) {
        return deltaInFlight.promise;
      }
      const entry = { epoch, generation: cacheGeneration, promise: fetchDeltaCore() };
      deltaInFlight = entry;
      entry.promise.finally(() => {
        if (deltaInFlight === entry) deltaInFlight = null;
      });
      return entry.promise;
    }
    async function reconcileAccess(resp, base, generation) {
      const revision = textOrEmpty(resp.filterRevision);
      if (!Array.isArray(resp.visible) || !serverFilterBase || resp.filterBase !== serverFilterBase || !revision || !serverCache) return false;
      const visible = new Set(stringList(resp.visible));
      const newEntries = entryPairs(resp.items);
      const carried = record(resp.items);
      const removed = stringList(resp.removed).filter((id) => !(id in carried));
      const next = { timestamp: cursorOf(resp), servedAt: servedAtOf(resp), filterRevision: revision, filterBase: serverFilterBase };
      let dropped;
      if (serverCacheComplete) {
        const held = new Set(serverCache.keys());
        for (const [id] of newEntries) held.add(id);
        for (const id of visible) if (!held.has(id)) return false;
        dropped = [...serverCache.keys()].filter((id) => !visible.has(id));
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
        const scope = storeScope;
        if (!scope || !JE.tagCacheStore?.available()) return false;
        const store = JE.tagCacheStore;
        const outcome = await new Promise((resolve) => {
          queuePersist(async () => {
            try {
              resolve(await store.reconcileAccess(scope, base, next, newEntries, removed, visible));
            } catch (err) {
              resolve({ applied: false, dropped: [] });
              throw err;
            }
          });
        });
        if (!outcome.applied || generation !== cacheGeneration || !serverCache) return false;
        dropped = [.../* @__PURE__ */ new Set([...outcome.dropped, ...[...serverCache.keys()].filter((id) => !visible.has(id))])];
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
      const changedIds = newEntries.map((e) => e[0]).concat(removed, dropped);
      if (changedIds.length > 0) {
        for (const [, renderer] of renderers) {
          if (renderer.onServerCacheRefresh) {
            try {
              renderer.onServerCacheRefresh(changedIds);
            } catch {
            }
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
      let settled = false;
      try {
        if (!serverCache || !serverCacheTimestamp) return;
        const userId = apiClient().getCurrentUserId();
        if (!userId) return;
        const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
        const generation = cacheGeneration;
        const base = { timestamp: serverCacheTimestamp, version: serverCacheVersion, filterRevision: serverFilterRevision };
        const requestedAt = performance.now();
        const resp = await apiClient().ajax({
          type: "GET",
          url: apiClient().getUrl(`/JellyfinEnhanced/tag-cache/${userId}?since=${base.timestamp}&known=${encodeURIComponent(base.filterRevision || "")}`),
          dataType: "json"
        });
        if (JE.session && !JE.session.isCurrent(requestEpoch)) return;
        if (!isRecord(resp) || !resp.items || !serverCache || generation !== cacheGeneration) return;
        applyReviewRatings(resp, requestedAt);
        const revision = textOrEmpty(resp.filterRevision);
        const rolledBack = typeof resp.timestamp === "number" && resp.timestamp < base.timestamp;
        if (resp.version === serverCacheVersion && !rolledBack && revision !== serverFilterRevision && await reconcileAccess(resp, base, generation)) {
          settled = true;
          if (confirming) console.log(`${logPrefix} Stored copy confirmed current after an access change`);
          return;
        }
        if (resp.version !== serverCacheVersion || revision !== serverFilterRevision || rolledBack) {
          const why = resp.version !== serverCacheVersion ? "Cache version changed" : rolledBack ? "Server cache went back in time" : "Access or Spoiler Guard filter changed";
          if (confirming) {
            console.log(`${logPrefix} ${why}; replacing the stored copy with a full download`);
            settled = await downloadFullCache({ fresh: true });
            for (const [, renderer] of renderers) {
              if (renderer.onServerCacheRefresh) {
                try {
                  renderer.onServerCacheRefresh(null, { replaced: true });
                } catch {
                }
              }
            }
          } else if (revision !== serverFilterRevision) {
            console.log(`${logPrefix} ${why}; reloading the full cache`);
            setTimeout(() => {
              api.invalidateServerCache().catch(() => {
              });
            }, 0);
          } else {
            console.log(`${logPrefix} ${why}, reloading full cache`);
            await downloadFullCache({ fresh: true });
            for (const [, renderer] of renderers) {
              if (renderer.onServerCacheRefresh) {
                try {
                  renderer.onServerCacheRefresh(null, { replaced: true });
                } catch {
                }
              }
            }
          }
          return;
        }
        const newEntries = entryPairs(resp.items);
        const carried = record(resp.items);
        const removed = stringList(resp.removed).filter((id) => !(id in carried));
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
            storeMisses.add(id);
          }
          serverCacheTimestamp = cursorOf(resp);
          persistDelta(newEntries, base, cursorOf(resp), servedAtOf(resp), removed);
          const changedIds = newEntries.map((e) => e[0]).concat(removed);
          for (const [, renderer] of renderers) {
            if (renderer.onServerCacheRefresh) {
              try {
                renderer.onServerCacheRefresh(changedIds);
              } catch {
              }
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
          if (!settled && cacheGeneration === startGeneration) dropServerCache();
          releaseStoreGate(gate);
        }
      }
    }
    function lookupServerEntries(ids) {
      if (storeGate) return storeGate.then(() => lookupServerEntries(ids));
      const found = /* @__PURE__ */ new Map();
      if (!serverCache) return found;
      let missing = null;
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
        if (storeScope !== scope || !serverCache || generation !== cacheGeneration) {
          return lookupServerEntries(ids);
        }
        const usable = !!meta && !meta.pending && meta.version === serverCacheVersion && meta.filterRevision === serverFilterRevision && Number(meta.servedAt || 0) >= storeBaseServedAt;
        const stored = usable ? read : /* @__PURE__ */ new Map();
        if (serverCache.size + stored.size > MEMORY_SOFT_CAP) {
          const keep = [];
          for (const id of deltaIds) {
            const entry = serverCache.get(id);
            if (entry) keep.push([id, entry]);
          }
          serverCache.clear();
          for (const [id, entry] of keep) serverCache.set(id, entry);
        }
        for (const id of wanted) {
          const current = serverCache.get(id);
          if (current) {
            found.set(id, current);
            continue;
          }
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
    function anyTagTypeEnabled() {
      return TAG_SETTING_KEYS.some((key) => !!JE.currentSettings?.[key]) || hasAnyEnabledRenderer();
    }
    function hasAnyEnabledRenderer() {
      for (const [, r] of renderers) {
        if (r.isEnabled()) return true;
      }
      return false;
    }
    let scanScheduled = false;
    const CHUNK_BUDGET_MS = 8;
    const CHUNK_MIN_CARDS = 4;
    const CHUNK_MAX_CARDS = 40;
    let msPerCard = 1.5;
    const RENDER_YIELD_CHUNK = 40;
    let scanGeneration = 0;
    const scheduleIdle = typeof requestIdleCallback === "function" ? (fn) => requestIdleCallback(fn, { timeout: 500 }) : (fn) => setTimeout(fn, 16);
    function idleYield() {
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
    function recordRenderCost(elapsedMs, cards) {
      if (cards <= 0) return;
      msPerCard = msPerCard * 0.5 + elapsedMs / cards * 0.5;
    }
    const LOOK_FACTS_KEY = "JE_tagLookFacts";
    const LOOK_FACTS_MAX = 3e3;
    const LOOK_FACT_FIELDS = ["Type", "SeriesId", "LibraryId", "Genres", "OfficialRating"];
    let lookFacts = null;
    let lookFactsSaveRegistered = false;
    function lookFactsPersist() {
      return JE.pluginConfig?.TagCacheServerMode === false || JE.pluginConfig?.EnableTagsLocalStorageFallback === true;
    }
    function lookFactsMap() {
      if (lookFacts) return lookFacts;
      lookFacts = /* @__PURE__ */ new Map();
      if (!lookFactsPersist()) return lookFacts;
      try {
        const ownerKey = `${LOOK_FACTS_KEY}:identity-owner`;
        const userId = JE.session?.getUserId?.() || (hasApiClient() ? apiClient().getCurrentUserId?.() : null) || "";
        const owner = `${JE.session?.getServerId?.() || ""}:${userId}`;
        if (localStorage.getItem(ownerKey) !== owner) {
          localStorage.removeItem(LOOK_FACTS_KEY);
          localStorage.setItem(ownerKey, owner);
          return lookFacts;
        }
        const stored = JSON.parse(localStorage.getItem(LOOK_FACTS_KEY) || "{}");
        const clearedAt = Number(JE.pluginConfig?.ClearLocalStorageTimestamp || 0);
        if (isRecord(stored)) {
          for (const [id, facts] of Object.entries(stored)) {
            if (isRecord(facts) && Number(facts.at) > clearedAt) lookFacts.set(id, facts);
          }
          if (lookFacts.size !== Object.keys(stored).length) saveLookFacts();
        }
      } catch (err) {
        console.warn(`${logPrefix} Ignoring unreadable tag look facts`, err);
      }
      return lookFacts;
    }
    function saveLookFacts() {
      if (!lookFacts || !lookFactsPersist()) return;
      try {
        localStorage.setItem(LOOK_FACTS_KEY, JSON.stringify(Object.fromEntries(lookFacts)));
      } catch (err) {
        console.warn(`${logPrefix} Failed to save tag look facts`, err);
      }
    }
    function rememberLookFacts(itemId, item, source = "tag-data") {
      if (!itemId || !item) return;
      const facts = { at: Date.now(), source };
      for (const field of LOOK_FACT_FIELDS) {
        if (item[field] !== void 0 && item[field] !== null) facts[field] = item[field];
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
    function enrichedLookFacts(facts) {
      return !!facts && (facts.source === "tag-data" || facts.source == null && /^[a-f0-9]{32}$/i.test(String(facts.LibraryId || "")));
    }
    function needsLibraryFacts() {
      return !!JE.core.tagLook?.read().rules.some((rule) => rule.enabled && rule.when.some((cond) => cond.field === "library"));
    }
    async function itemLookFacts(itemId) {
      const serverEntry = serverCache?.get(itemId);
      if (serverEntry) return serverEntry;
      const known = lookFactsMap().get(itemId);
      if (known && enrichedLookFacts(known)) return known;
      const userId = apiClient().getCurrentUserId();
      const epoch = JE.session?.getEpoch?.();
      const response = record(await apiClient().ajax({
        type: "POST",
        url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`),
        data: JSON.stringify([itemId]),
        contentType: "application/json",
        dataType: "json"
      }));
      if (userId !== apiClient().getCurrentUserId() || epoch !== JE.session?.getEpoch?.()) return null;
      const item = records(response.Items).find((i) => normalizeItemId(i.Id ?? "") === itemId) || null;
      if (item) rememberLookFacts(itemId, item);
      return item;
    }
    function renderCard(card, serverEntry, hosts) {
      const { el, itemId, itemType } = card;
      const renderTarget = resolveRenderTarget(el);
      const layout = JE.core.tagLayout;
      const cardId = layout?.cardIdentity?.(renderTarget) ?? "";
      const remembered = lookFactsMap().get(itemId);
      const known = serverEntry || (!needsLibraryFacts() || enrichedLookFacts(remembered) ? remembered : null);
      let awaiting = false;
      if (known) layout?.setCardContext?.(renderTarget, known, itemId, cardId);
      else awaiting = layout?.awaitCardContext?.(renderTarget, cardId, itemType);
      JE.core.tagLayout?.prepareCard(renderTarget);
      if (serverEntry) {
        for (const [, renderer] of renderers) {
          if (!renderer.isEnabled()) continue;
          if (renderer.renderFromServerCache) {
            try {
              renderer.renderFromServerCache(renderTarget, serverEntry, itemId);
            } catch {
            }
          }
        }
        hosts.push(renderTarget);
        return;
      }
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
    let isInvalidating = false;
    function runScan() {
      if (isInvalidating) return;
      if (!hasAnyEnabledRenderer()) return;
      if (!hasApiClient()) return;
      const elements = document.querySelectorAll(".cardImageContainer, div.listItemImage");
      const unprocessed = [];
      for (const el of elements) {
        if (!processedCards.has(el)) unprocessed.push(el);
        else JE.core.tagLayout?.resumePresentation?.(el.closest(".cardScalable") || el);
      }
      if (unprocessed.length === 0) return;
      const myGeneration = ++scanGeneration;
      let index = 0;
      function continueScan() {
        if (index < unprocessed.length) {
          scheduleIdle(processChunk);
        } else {
          scheduleFetch();
        }
      }
      function renderChunk(chunk, entries) {
        const started = performance.now();
        const hosts = [];
        for (const card of chunk) {
          if (!card.el.isConnected) {
            processedCards.delete(card.el);
            continue;
          }
          if (!stillShows(card)) continue;
          renderCard(card, entries.get(card.itemId), hosts);
        }
        JE.core.tagRenderer.applyCornerStacking(hosts);
        recordRenderCost(performance.now() - started, chunk.length);
        continueScan();
      }
      function processChunk() {
        if (myGeneration !== scanGeneration) return;
        const limit = Math.max(CHUNK_MIN_CARDS, Math.min(CHUNK_MAX_CARDS, Math.floor(CHUNK_BUDGET_MS / Math.max(msPerCard, 0.05))));
        const chunk = [];
        const ids = [];
        for (; index < unprocessed.length && chunk.length < limit; index++) {
          const el = unprocessed[index];
          if (!el || processedCards.has(el)) continue;
          if (!el.isConnected) continue;
          const card = el.closest(".card");
          if (card && card.classList.contains("je-hidden")) continue;
          const listItem = el.closest(".listItem");
          if (listItem && listItem.classList.contains("je-hidden")) continue;
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
            for (const card of chunk) processedCards.delete(card.el);
            scheduleScan();
            return;
          }
          renderChunk(chunk, entries);
        });
      }
      processChunk();
    }
    function resolveRenderTarget(el) {
      const scalable = el.closest(".cardScalable");
      if (!scalable) return el;
      const overlay = scalable.querySelector(".cardOverlayContainer");
      if (!overlay) return scalable;
      let tagHost = scalable.querySelector(".je-tag-host");
      if (!tagHost) {
        tagHost = document.createElement("div");
        tagHost.className = "je-tag-host";
        scalable.insertBefore(tagHost, overlay);
      }
      return tagHost;
    }
    function stillShows(card) {
      return (cardReuse.get(card.el) || 0) === card.reuse;
    }
    const CARD_IMAGE_SELECTOR = ".cardImageContainer, div.listItemImage";
    function imageItemId(text) {
      const match = text ? /Items\/([a-f0-9]{32})\//i.exec(text) : null;
      return match?.[1] ? match[1].toLowerCase() : "";
    }
    function isIdentityChange(record2) {
      const target = record2.target;
      if (!(target instanceof Element) || !record2.attributeName) return false;
      if (record2.attributeName === "style") {
        if (!target.matches(CARD_IMAGE_SELECTOR)) return false;
        const before = imageItemId(record2.oldValue);
        const after = imageItemId(target.getAttribute("style"));
        return !!before && !!after && before !== after;
      }
      const norm = (value) => (value || "").replace(/-/g, "").toLowerCase();
      return norm(target.getAttribute(record2.attributeName)) !== norm(record2.oldValue);
    }
    function releaseReusedCards(mutations) {
      let released = false;
      for (const record2 of mutations) {
        if (!isIdentityChange(record2)) continue;
        const target = record2.target;
        if (!(target instanceof HTMLElement)) continue;
        const images = target.matches(CARD_IMAGE_SELECTOR) ? [target] : Array.from(target.querySelectorAll(CARD_IMAGE_SELECTOR));
        for (const el of images) {
          const owner = el.closest(".cardScalable") || el;
          const hasHost = Array.from(owner.children).some((c) => c.classList.contains("je-tag-host"));
          if (!processedCards.has(el) && !hasHost) continue;
          processedCards.delete(el);
          cardReuse.set(el, (cardReuse.get(el) || 0) + 1);
          JE.core.tagLayout?.clearCard(owner);
          released = true;
        }
      }
      if (released) scheduleScan();
    }
    function getItemId(el) {
      const parent = el.closest("[data-id]") || el.closest("[data-itemid]");
      const attrId = parent?.getAttribute("data-id") || parent?.getAttribute("data-itemid");
      const itemId = attrId ? attrId.replace(/-/g, "").toLowerCase() : null;
      if (itemId && /^[a-f0-9]{32}$/.test(itemId)) return itemId;
      return imageItemId(el.style?.backgroundImage) || itemId;
    }
    function getItemType(el) {
      const parent = el.closest("[data-type]");
      return parent?.getAttribute("data-type") || null;
    }
    const SERVER_BATCH_LIMIT = 200;
    function scheduleFetch() {
      if (requestQueue.length === 0 || isProcessing) return;
      if (fetchTimer) clearTimeout(fetchTimer);
      fetchTimer = setTimeout(() => {
        fetchTimer = null;
        processQueue();
      }, FETCH_DEBOUNCE_MS);
    }
    async function processQueue() {
      if (isProcessing || requestQueue.length === 0) return;
      isProcessing = true;
      let cancel = () => {
      };
      const cancelled = new Promise((resolve) => {
        cancel = resolve;
      });
      cancelBatchWait = cancel;
      try {
        const myGeneration = batchGeneration;
        while (requestQueue.length > 0) {
          if (myGeneration !== batchGeneration) break;
          const batch = requestQueue.splice(0, SERVER_BATCH_LIMIT).filter((entry) => entry.el.isConnected);
          if (batch.length === 0) continue;
          activeBatch = batch;
          await Promise.race([processBatch(batch, myGeneration), cancelled]);
          if (myGeneration !== batchGeneration) break;
          activeBatch = [];
          for (const entry of batch) {
            if (entry.awaiting) JE.core.tagLayout?.releaseCardContext?.(entry.renderTarget, entry.awaiting);
          }
        }
      } finally {
        if (cancelBatchWait === cancel) cancelBatchWait = null;
        activeBatch = [];
        isProcessing = false;
        scheduleFetch();
      }
    }
    async function processBatch(batch, generation) {
      const userId = apiClient().getCurrentUserId();
      if (!userId) return;
      const epoch = JE.session?.getEpoch?.();
      const isCurrent = () => generation === batchGeneration && userId === apiClient().getCurrentUserId() && epoch === JE.session?.getEpoch?.();
      const elMap = /* @__PURE__ */ new Map();
      for (const b of batch) {
        const sameItem = elMap.get(b.itemId);
        if (sameItem) sameItem.push(b);
        else elMap.set(b.itemId, [b]);
      }
      const ids = [...elMap.keys()];
      let needsLatestEpisode = false;
      for (const [, r] of renderers) {
        if (r.isEnabled() && r.needsLatestEpisode) {
          needsLatestEpisode = true;
          break;
        }
      }
      try {
        const response = record(await apiClient().ajax({
          type: "POST",
          url: apiClient().getUrl(`/JellyfinEnhanced/tag-data/${userId}`, needsLatestEpisode ? { latestEpisode: true } : void 0),
          data: JSON.stringify(ids),
          contentType: "application/json",
          dataType: "json"
        }));
        const answered = members(response.Items);
        if (!isCurrent()) return;
        if (needsLatestEpisode) answered.forEach((item) => rememberItemFacts(memberRecord(item)));
        const items = answered.map(memberRecord);
        const stripRevision = typeof response.StripRevision === "string" ? response.StripRevision : null;
        tagStripRevision = stripRevision;
        const parentSeriesNeeded = /* @__PURE__ */ new Set();
        for (const item of items) {
          const seriesId = idText(item.SeriesId);
          if ((item.Type === "Season" || item.Type === "Episode") && seriesId && !item.CommunityRating && !item.CriticRating) {
            parentSeriesNeeded.add(seriesId);
          }
          if (item.Type === "Season" && seriesId) {
            parentSeriesNeeded.add(seriesId);
          }
        }
        const parentSeriesMap = /* @__PURE__ */ new Map();
        for (const item of items) {
          if (item.Id === void 0 || item.Id === null) throw new TypeError("A tag-data item has no id");
          parentSeriesMap.set(normalizeItemId(item.Id), item);
        }
        for (const seriesId of parentSeriesNeeded) {
          const normalizedId = normalizeItemId(seriesId);
          if (!parentSeriesMap.has(normalizedId)) {
            try {
              const parent = await getParentSeries(userId, seriesId);
              if (!isCurrent()) return;
              if (parent) parentSeriesMap.set(normalizedId, parent);
            } catch {
            }
          }
        }
        let pendingHosts = [];
        const stackPendingHosts = () => {
          if (pendingHosts.length === 0) return;
          JE.core.tagRenderer.applyCornerStacking(pendingHosts);
          pendingHosts = [];
        };
        const renderItem = (item, firstEpisode) => {
          if (!isCurrent()) return;
          const itemId = normalizeItemId(item.Id);
          const batchEntries = elMap.get(itemId);
          if (!batchEntries || batchEntries.length === 0) return;
          if (!isMediaType(item.Type)) return;
          rememberLookFacts(itemId, item);
          let parentSeries = null;
          let ratingParentSeries = null;
          if (item.SeriesId) {
            const parentId = normalizeItemId(item.SeriesId);
            parentSeries = parentSeriesMap.get(parentId) || null;
            if ((item.Type === "Season" || item.Type === "Episode") && !item.CommunityRating && !item.CriticRating) {
              ratingParentSeries = parentSeries;
            }
          }
          for (const entry of batchEntries) {
            let { el, renderTarget } = entry;
            if (!stillShows(entry)) continue;
            if (!renderTarget.isConnected) {
              if (!el.isConnected) continue;
              renderTarget = resolveRenderTarget(el);
            }
            const extras = { firstEpisode, parentSeries, ratingParentSeries, renderTarget, stripRevision };
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
        let anyNeedsFirstEp = false;
        for (const [, r] of renderers) {
          if (r.isEnabled() && r.needsFirstEpisode) {
            anyNeedsFirstEp = true;
            break;
          }
        }
        const pendingFirstEps = [];
        let renderedSinceYield = 0;
        for (const item of items) {
          const firstEpisode = isRecord(item.FirstEpisode) ? item.FirstEpisode : null;
          if (anyNeedsFirstEp && firstEpisode?.NeedsStreamFetch) {
            pendingFirstEps.push(
              getFirstEpisode(userId, String(item.Id), idText(firstEpisode.Id)).then((ep) => renderItem(item, ep)).catch(() => renderItem(item, null)).then(() => {
                for (const host of pendingHosts) JE.core.tagRenderer.scheduleCornerStacking(host);
                pendingHosts = [];
              })
            );
          } else {
            renderItem(item, firstEpisode);
            if (++renderedSinceYield >= RENDER_YIELD_CHUNK) {
              renderedSinceYield = 0;
              stackPendingHosts();
              await idleYield();
              if (!isCurrent()) return;
            }
          }
        }
        stackPendingHosts();
        if (pendingFirstEps.length > 0) {
          await Promise.all(pendingFirstEps);
        }
      } catch (err) {
        if (!isCurrent()) return;
        console.warn(`${logPrefix} Batch fetch failed, falling back to individual fetches:`, err);
        for (const queued of batch) {
          const { el, renderTarget: queuedRenderTarget, itemId, cardId } = queued;
          if (!isCurrent()) break;
          try {
            const item = JE.helpers?.getItemCached ? await JE.helpers.getItemCached(itemId, { userId }) : await apiClient().getItem(userId, itemId);
            if (!isCurrent()) return;
            if (!isRecord(item) || !isMediaType(item.Type)) continue;
            rememberLookFacts(itemId, item, "item");
            const firstEpisode = item.Type === "Series" || item.Type === "Season" ? await getFirstEpisode(userId, String(item.Id)) : null;
            if (!isCurrent()) break;
            if (!stillShows(queued)) continue;
            let renderTarget = queuedRenderTarget;
            if (!renderTarget.isConnected) {
              if (!el.isConnected) continue;
              renderTarget = resolveRenderTarget(el);
            }
            const extras = { firstEpisode, parentSeries: null, ratingParentSeries: null, renderTarget, stripRevision: null };
            const layout = JE.core.tagLayout;
            if (layout?.cardIdentity && layout.cardIdentity(renderTarget) !== cardId) continue;
            if (!needsLibraryFacts() && layout?.setCardContext?.(renderTarget, item, itemId, cardId) === false) continue;
            for (const [, renderer] of renderers) {
              if (!renderer.isEnabled()) continue;
              try {
                renderer.render(renderTarget, item, extras);
              } catch {
              }
            }
            JE.core.tagRenderer.applyCornerStacking(renderTarget);
          } catch {
          }
        }
      }
    }
    function initialize() {
      if (!JE.helpers?.onBodyMutation) {
        console.warn(`${logPrefix} helpers.onBodyMutation not available, retrying...`);
        setTimeout(initialize, 100);
        return;
      }
      if (pipelineStarted) return;
      if (!anyTagTypeEnabled()) {
        startWhenRendererRegisters = true;
        console.log(`${logPrefix} No tag renderers enabled; idle until one is`);
        return;
      }
      startWhenRendererRegisters = false;
      pipelineStarted = true;
      JE.helpers.onBodyMutation("tag-pipeline", (mutations) => {
        for (let i = 0; i < mutations.length; i++) {
          if (mutations[i]?.addedNodes.length) {
            scheduleScan();
            return;
          }
        }
      }, { priority: 0 });
      const createObserver = JE.core?.dom?.createObserver || JE.helpers?.createObserver;
      if (typeof createObserver === "function") {
        createObserver("tag-pipeline-card-identity", releaseReusedCards, document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-id", "data-itemid", "style"],
          attributeOldValue: true
        });
      }
      if (JE.helpers.onNavigate) {
        lastNavigationRoute = navigationRoute();
        JE.helpers.onNavigate(() => {
          const route = navigationRoute();
          if (route === lastNavigationRoute) return;
          lastNavigationRoute = route;
          advanceBatchGeneration();
          scanGeneration++;
          for (const entry of [...requestQueue, ...activeBatch]) processedCards.delete(entry.el);
          firstEpisodeCache.clear();
          parentSeriesCache.clear();
          requestQueue = [];
          if (fetchTimer) clearTimeout(fetchTimer);
          fetchTimer = null;
          scheduleNavigationRefresh();
          scheduleScan();
        });
      }
      if (JE.helpers?.addCSS) {
        JE.helpers.addCSS("je-tag-pipeline-perf", `
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
        JE.helpers.addCSS("je-tag-card-scale", JE.core.tagLayout?.preserveLegacySizing?.(scaleCss) || scaleCss);
        JE.helpers.addCSS("je-tag-hover-fade", `
                body.je-tags-hide-on-hover .card:hover .je-tag-host:not([data-je-layout="summary"]):not([data-je-layout="minimal"]) {
                    opacity: 0 !important;
                    transition: opacity 0.15s ease;
                }
            `);
        if (JE.currentSettings?.tagsHideOnHover) {
          document.body.classList.add("je-tags-hide-on-hover");
        }
      }
      loadServerCache().then(() => {
        processedCards = /* @__PURE__ */ new WeakSet();
        runScan();
      });
      console.log(`${logPrefix} Initialized`);
    }
    const api = {
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
      peekServerEntry(itemId) {
        return serverCache?.get(itemId) || null;
      },
      /** @param name - Renderer name (e.g. 'quality'). */
      getRenderer(name) {
        return renderers.get(name);
      },
      /** The item data an item's cards are matched on by tag look rules (server entry, remembered, else fetched). */
      itemLookFacts,
      /**
       * Every server tag-cache entry in memory (empty without one).
       * */
      serverEntries() {
        return serverCache ? serverCache.values() : [];
      },
      waitForServerCache,
      /** End the running waitForServerCache() (it resolves false). */
      stopWaitingForServerCache() {
        serverCacheWait++;
      },
      /**
       * Review rating averages that came with the server cache, once the
       * load or refresh in flight has settled: Map<"mediaType:tmdbKey",
       * average>, or null when the server cache (or the poster chips) is
       * off — the user review tags then ask /reviews/ratings themselves.
       * */
      getReviewRatings() {
        return (loadInFlight || refreshInFlight || Promise.resolve()).then(() => reviewRatings);
      },
      /**
       * The review rating averages already at hand, without waiting.
       * */
      peekReviewRatings() {
        return reviewRatings;
      },
      /** @returns Bumped each time the review rating averages are replaced. */
      /** @returns performance.now() when the request behind the current review averages started (0 = none). */
      getReviewRatingsRequestedAt() {
        return reviewRatingsRequestedAt;
      },
      /**
       * What Spoiler Guard's Hide tags strips from this user's /tag-data
       * answers: "none" for nothing, another string for a guard set, null
       * while unknown (before the first answer when the bootstrap did not
       * say, and after a user switch or Spoiler Guard change).
       * */
      tagStripRevision() {
        return tagStripRevision;
      },
      /**
       * Subscribe to accepted review averages maps.
       * @param listener - Receives the "mediaType:tmdbKey" keys whose value changed (possibly none), or null for all.
       */
      onReviewRatingsChanged(listener) {
        reviewRatingsListeners.add(listener);
      },
      // For reinitialize support
      clearProcessed() {
        processedCards = /* @__PURE__ */ new WeakSet();
        requestQueue = [];
        advanceBatchGeneration();
        scanGeneration++;
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
      async invalidateServerCache(options) {
        tagStripRevision = null;
        if (!pipelineStarted) return;
        isInvalidating = true;
        try {
          dropServerCache();
          tagStripRevision = null;
          processedCards = /* @__PURE__ */ new WeakSet();
          requestQueue = [];
          advanceBatchGeneration();
          scanGeneration++;
          firstEpisodeCache.clear();
          parentSeriesCache.clear();
          for (const [, renderer] of renderers) {
            if (renderer.onServerCacheRefresh) {
              try {
                renderer.onServerCacheRefresh(null);
              } catch {
              }
            }
          }
          try {
            document.querySelectorAll(
              ".quality-overlay-container, .rating-overlay-container, .genre-overlay-container, .language-overlay-container, .age-rating-overlay-container, .status-overlay-container, .awards-overlay-container, .logo-overlay-container, .custom-overlay-container"
            ).forEach(function(el) {
              el.remove();
            });
            document.querySelectorAll(
              "[data-je-quality-tagged], [data-je-rating-tagged], [data-je-genre-tagged], [data-je-language-tagged], [data-je-age-rating-tagged], [data-je-status-tagged], [data-je-awards-tagged], [data-je-logo-tagged], [data-je-custom-tagged]"
            ).forEach(function(el) {
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
            JE.core.tagLayout?.clearAll();
          } catch (domErr) {
            console.warn(`${logPrefix} overlay cleanup during invalidate failed:`, domErr);
          }
          const forceDownload = !options?.reuseStored;
          if (anyTagTypeEnabled()) {
            deferredLoad = null;
            await loadServerCache({ forceDownload });
            processedCards = /* @__PURE__ */ new WeakSet();
          } else {
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
      scheduleScan
    };
    JE.tagPipeline = api;
    JE.session?.onUserChange("tag-pipeline", () => {
      dropServerCache();
      tagStripRevision = null;
      lookFacts = null;
      reviewRatings = null;
      reviewRatingsRequestedAt = 0;
      skipStoreThisSession = false;
      perCardThisSession = false;
      api.clearProcessed();
    });
    document.addEventListener("je:user-data-loaded", () => {
      JE.reinitializeTagLayout?.();
      const startedThisSwitch = loadStartedForEpoch !== null && loadStartedForEpoch === JE.session?.getEpoch?.();
      loadStartedForEpoch = null;
      if (startedThisSwitch) return;
      api.invalidateServerCache({ reuseStored: true }).catch(() => {
      });
    });
    console.log(`${logPrefix} Module loaded`);
  }

  // client/src/features/media-tags/runtime/tag-pipeline-entry.ts
  createTagPipeline(tagRuntimeHost());
})();
})();
//# sourceMappingURL=tag-pipeline.js.map
