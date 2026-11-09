(() => {
"use strict";
(() => {
  // client/src/features/player/host.ts
  function playerHost() {
    const host = window;
    const JE2 = host.JellyfinEnhanced;
    if (!JE2) throw new Error("Player loaded before Jellyfin Enhanced");
    const requireApi = () => {
      if (!host.ApiClient) throw new Error("Jellyfin API unavailable");
      return host.ApiClient;
    };
    const ApiClient2 = {
      getCurrentUserId: () => host.ApiClient?.getCurrentUserId() ?? null,
      deviceId: () => host.ApiClient?.deviceId?.() ?? "",
      serverId: () => {
        const id = host.ApiClient?.serverId;
        return typeof id === "function" ? id.call(host.ApiClient) : id ?? "";
      },
      serverAddress: () => requireApi().serverAddress(),
      getUrl: (path, params) => requireApi().getUrl(path, params),
      ajax: (options) => requireApi().ajax(options),
      getItem: (userId, itemId) => requireApi().getItem(userId, itemId)
    };
    return { JE: JE2, ApiClient: ApiClient2 };
  }

  // client/src/features/player/wire.ts
  function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
  }
  var text = (v) => typeof v === "string" ? v : void 0;
  var number = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
  var strings = (v) => Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
  var list = (v) => Array.isArray(v) ? v : [];
  function stream(v) {
    const r = record(v);
    const fps = (v2) => typeof v2 === "string" ? v2 : number(v2);
    return { Type: text(r.Type), Index: number(r.Index), ReferenceFrameRate: fps(r.ReferenceFrameRate), RealFrameRate: fps(r.RealFrameRate), AverageFrameRate: fps(r.AverageFrameRate), DisplayTitle: text(r.DisplayTitle), Title: text(r.Title), Language: text(r.Language), Codec: text(r.Codec) };
  }
  function decodeItem(v) {
    const r = record(v);
    return { Id: text(r.Id), Type: text(r.Type), SeriesId: text(r.SeriesId), ParentId: text(r.ParentId), RunTimeTicks: number(r.RunTimeTicks), ProductionYear: number(r.ProductionYear), CommunityRating: number(r.CommunityRating), CriticRating: number(r.CriticRating), OfficialRating: text(r.OfficialRating), Overview: text(r.Overview), Container: text(r.Container), Genres: strings(r.Genres), Tags: strings(r.Tags), ImageTags: { Logo: text(record(r.ImageTags).Logo) }, MediaStreams: list(r.MediaStreams).map(stream), MediaSources: list(r.MediaSources).map((v2) => {
      const s = record(v2);
      return { Id: text(s.Id), MediaStreams: list(s.MediaStreams).map(stream) };
    }) };
  }
  var decodeItems = (v) => list(record(v).Items).map(decodeItem);

  // client/src/features/player/lifetime.ts
  function createPlayerLifetime(JE2, name) {
    let generation = 0;
    let controller = new AbortController();
    const cleanups = /* @__PURE__ */ new Set();
    const timers = /* @__PURE__ */ new Set();
    function reset() {
      generation++;
      controller.abort();
      controller = new AbortController();
      for (const cleanup of cleanups) cleanup();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    }
    JE2.session?.onUserChange(name + "-lifetime", reset);
    if (JE2.core?.navigation) JE2.core.navigation.onNavigate(reset);
    else window.addEventListener("hashchange", reset);
    function lease(video) {
      const captured = generation, hash = location.hash;
      const session = JE2.session?.createLease?.();
      const source = video ? video.currentSrc || video.src : null;
      return { signal: controller.signal, current: () => captured === generation && hash === location.hash && (!session || session.isCurrent()) && (!video || video.isConnected && (video.currentSrc || video.src) === source) };
    }
    return {
      lease,
      reset,
      onReset(cleanup) {
        cleanups.add(cleanup);
        return () => cleanups.delete(cleanup);
      },
      timeout(callback, delay) {
        const id = window.setTimeout(() => {
          timers.delete(id);
          callback();
        }, delay);
        timers.add(id);
        return id;
      },
      cancel(id) {
        if (id != null) {
          clearTimeout(id);
          timers.delete(id);
        }
      },
      sleep(delay, signal) {
        return new Promise((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          const done = () => {
            clearTimeout(id);
            signal.removeEventListener("abort", done);
            resolve();
          };
          const id = window.setTimeout(done, delay);
          signal.addEventListener("abort", done, { once: true });
        });
      }
    };
  }

  // client/src/features/player/osd-rating.ts
  var { JE, ApiClient } = playerHost();
  var lifetime = createPlayerLifetime(JE, "osd-rating");
  var logPrefix = "🪼 Jellyfin Enhanced: OSD Rating:";
  var CONTAINER_ID = "je-osd-rating-container";
  var ratingCache = /* @__PURE__ */ new Map();
  var pendingRatings = /* @__PURE__ */ new Map();
  JE.session?.onUserChange("osd-rating", () => {
    ratingCache.clear();
    pendingRatings.clear();
  });
  var scheduledUpdate = null;
  var osdObserver = null;
  function isEnabled() {
    return JE.pluginConfig?.ShowRatingInPlayer !== false;
  }
  function normalizeCriticPercent(raw) {
    if (raw === null || raw === void 0) return null;
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(100, Math.round(num)));
  }
  function createTomatoIcon(isRotten) {
    const span = document.createElement("span");
    span.className = `je-tomato ${isRotten ? "rotten" : "fresh"}`;
    return span;
  }
  function getCurrentItemId() {
    const favBtn = document.querySelector(".videoOsdBottom .btnUserRating[data-id]");
    return favBtn?.dataset?.id || null;
  }
  async function fetchItemRatings(userId, itemId) {
    try {
      const result = await ApiClient.ajax({
        type: "GET",
        url: ApiClient.getUrl(`/Users/${userId}/Items`, { Ids: itemId, Fields: "CommunityRating,CriticRating,Type" }),
        dataType: "json"
      });
      const item = decodeItems(result)[0];
      if (!item) return { tmdb: null, critic: null };
      let sourceItem = item;
      if ((item.Type === "Season" || item.Type === "Episode") && item.SeriesId && !item.CommunityRating && !item.CriticRating) {
        try {
          const seriesResult = await ApiClient.ajax({
            type: "GET",
            url: ApiClient.getUrl(`/Users/${userId}/Items`, { Ids: item.SeriesId, Fields: "CommunityRating,CriticRating,Type" }),
            dataType: "json"
          });
          sourceItem = decodeItems(seriesResult)[0] || item;
        } catch (e) {
          console.warn(`${logPrefix} Failed to fetch series rating for ${item.Type}`, e);
        }
      }
      const tmdb = sourceItem.CommunityRating != null ? Number(sourceItem.CommunityRating).toFixed(1) : null;
      const critic = normalizeCriticPercent(sourceItem.CriticRating);
      return { tmdb, critic };
    } catch (e) {
      console.warn(`${logPrefix} Failed to fetch rating for ${itemId}`, e);
      return { tmdb: null, critic: null };
    }
  }
  function ensureStyles() {
    if (document.getElementById("je-osd-rating-style")) return;
    const style = document.createElement("style");
    style.id = "je-osd-rating-style";
    style.textContent = `
      #${CONTAINER_ID} { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; vertical-align: middle; }
      #${CONTAINER_ID} .je-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-weight: 600; line-height: 1; }
      #${CONTAINER_ID} .je-chip.tmdb { color: #ffc107; }
      #${CONTAINER_ID} .je-chip.critic { color: #ffffff; }
      #${CONTAINER_ID} .je-star { font-family: 'Material Icons'; font-size: 16px; color: #ffc107; line-height: 1; }
      #${CONTAINER_ID} .je-text { font-size: 14px; color: inherit; font-weight: 600; line-height: 1; }
      #${CONTAINER_ID} .je-tomato { width: 16px; height: 16px; flex-shrink: 0; background-size: contain; background-repeat: no-repeat; background-position: center; display: inline-block; }
      #${CONTAINER_ID} .je-tomato.fresh { background-image: url(assets/img/fresh.svg); }
      #${CONTAINER_ID} .je-tomato.rotten { background-image: url(assets/img/rotten.svg); }
    `;
    document.head.appendChild(style);
  }
  function injectRating(osdRoot, rating, itemId) {
    if (!osdRoot || !rating.tmdb && rating.critic === null) return;
    ensureStyles();
    const osdTimeContainer = osdRoot.querySelector(".osdTimeText");
    if (!osdTimeContainer) return;
    osdRoot.querySelectorAll(`#${CONTAINER_ID}`).forEach((el) => el.remove());
    const container = document.createElement("span");
    container.id = CONTAINER_ID;
    container.dataset.itemId = itemId;
    if (rating.critic !== null) {
      const criticChip = document.createElement("span");
      criticChip.className = "je-chip critic";
      criticChip.appendChild(createTomatoIcon(rating.critic < 60));
      const criticText = document.createElement("span");
      criticText.className = "je-text";
      criticText.textContent = `${rating.critic}%`;
      criticChip.appendChild(criticText);
      container.appendChild(criticChip);
    }
    if (rating.tmdb) {
      const tmdbChip = document.createElement("span");
      tmdbChip.className = "je-chip tmdb";
      const star = document.createElement("span");
      star.className = "je-star";
      star.textContent = "star";
      const text2 = document.createElement("span");
      text2.className = "je-text";
      text2.textContent = rating.tmdb;
      tmdbChip.appendChild(star);
      tmdbChip.appendChild(text2);
      container.appendChild(tmdbChip);
    }
    if (container.children.length === 0) return;
    osdTimeContainer.insertAdjacentElement("beforebegin", container);
  }
  async function updateOsdRating() {
    const lease = lifetime.lease();
    if (!isEnabled()) {
      console.debug(`${logPrefix} Skipped - feature disabled`);
      return;
    }
    if (!JE.isVideoPage()) {
      return;
    }
    const osdRoot = document.querySelector(".videoOsdBottom");
    if (!osdRoot) return;
    const userId = ApiClient.getCurrentUserId?.();
    const itemId = getCurrentItemId();
    if (!userId || !itemId) return;
    const existing = osdRoot.querySelector(`#${CONTAINER_ID}`);
    if (existing && existing.dataset.itemId === itemId) return;
    if (existing) existing.remove();
    if (ratingCache.has(itemId)) {
      const cached = ratingCache.get(itemId);
      if (cached && (cached.tmdb || cached.critic !== null)) injectRating(osdRoot, cached, itemId);
      return;
    }
    if (pendingRatings.has(itemId)) {
      const rating = await pendingRatings.get(itemId);
      if (lease.current() && getCurrentItemId() === itemId && osdRoot.isConnected && rating && (rating.tmdb || rating.critic !== null)) injectRating(osdRoot, rating, itemId);
      return;
    }
    const promise = (async () => {
      const rating = await fetchItemRatings(userId, itemId);
      if (lease.current()) ratingCache.set(itemId, rating);
      return rating;
    })();
    pendingRatings.set(itemId, promise);
    try {
      const rating = await promise;
      if (lease.current() && getCurrentItemId() === itemId && osdRoot.isConnected && rating && (rating.tmdb || rating.critic !== null)) injectRating(osdRoot, rating, itemId);
    } finally {
      if (pendingRatings.get(itemId) === promise) pendingRatings.delete(itemId);
    }
  }
  function scheduleUpdate() {
    if (scheduledUpdate) return;
    scheduledUpdate = lifetime.timeout(() => {
      scheduledUpdate = null;
      if (JE.isVideoPage()) updateOsdRating();
    }, 200);
  }
  function observeOsd() {
    if (osdObserver) return;
    osdObserver = JE.helpers.onBodyMutation("osd-rating", () => {
      if (JE.isVideoPage()) scheduleUpdate();
    });
  }
  JE.initializeOsdRating = function() {
    if (!isEnabled()) {
      console.log(`${logPrefix} Feature is disabled in settings.`);
      return;
    }
    try {
      observeOsd();
      console.log(`${logPrefix} Initialized successfully.`);
    } catch (e) {
      console.warn(`${logPrefix} Init failed`, e);
    }
  };
  lifetime.onReset(() => {
    ratingCache.clear();
    pendingRatings.clear();
    scheduledUpdate = null;
    document.getElementById(CONTAINER_ID)?.remove();
  });
})();
})();
//# sourceMappingURL=osd-rating.js.map
