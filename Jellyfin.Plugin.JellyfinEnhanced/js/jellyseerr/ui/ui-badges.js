(() => {
"use strict";
(() => {
  // client/src/host/context.ts
  function featureContext(feature, core, slots) {
    const own = {};
    const bind = (keys, target) => {
      for (const key of keys) {
        Object.defineProperty(own, key, {
          enumerable: true,
          get: () => target()[key],
          set: (value) => {
            target()[key] = value;
          }
        });
      }
    };
    bind(slots.facades ?? [], () => core);
    const internalsObject = slots.internalsObject;
    if (slots.internalSlots?.length) {
      if (!internalsObject) throw new Error(`${feature}: internal slots need the host's internalsObject accessor`);
      bind(slots.internalSlots, internalsObject);
    }
    return {
      feature,
      core,
      own,
      peer: (name) => core[name]
    };
  }

  // client/src/features/seerr/host-core.ts
  var coreContexts = /* @__PURE__ */ new WeakMap();
  function seerrCoreContext(JE) {
    let ctx = coreContexts.get(JE);
    if (!ctx) {
      ctx = featureContext("seerr", JE, {
        internalSlots: ["jellyseerrUi"],
        internalsObject: () => JE.internals || (JE.internals = {})
      });
      coreContexts.set(JE, ctx);
    }
    return ctx;
  }
  function seerrCoreHost() {
    const host = window;
    const JE = host.JellyfinEnhanced;
    if (!JE) throw new Error("Jellyfin Enhanced must be initialized before the Seerr core group");
    return { JE, window: host, document, apiClient: () => host.ApiClient, liveBridge: () => host.JellyfinEnhanced };
  }

  // client/src/features/seerr/core/decode.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
  var isString = (value) => typeof value === "string";
  var isSafeTmdbImagePath = (path) => typeof path === "string" && /^\/[A-Za-z0-9_\-.]+\.(jpg|jpeg|png|webp|avif)$/i.test(path);
  var isBoolean = (value) => typeof value === "boolean";
  var optional = (check) => (value) => value === void 0 || check(value);
  var nullable = (check) => (value) => value === void 0 || value === null || check(value);
  var listOf = (check) => (value) => Array.isArray(value) && value.every(check);
  var either = (...checks) => (value) => checks.some((check) => check(value));
  function matches(value, checks) {
    if (!isRecord(value)) return false;
    const table = checks;
    for (const [key, check] of Object.entries(table)) {
      if (!check(value[key])) return false;
    }
    return true;
  }
  var seasonStatusChecks = {
    seasonNumber: optional(isNumber),
    status: nullable(isNumber),
    status4k: nullable(isNumber)
  };
  var isSeasonStatus = (value) => matches(value, seasonStatusChecks);
  var downloadChecks = {
    title: nullable(isString),
    status: nullable(isString),
    size: nullable(isNumber),
    sizeLeft: nullable(isNumber),
    estimatedCompletionTime: nullable(isString),
    episode: nullable((value) => matches(value, { seasonNumber: nullable(isNumber) }))
  };
  var isDownload = (value) => matches(value, downloadChecks);
  var requestSummaryChecks = {
    is4k: nullable(isBoolean),
    seasons: nullable(listOf((value) => matches(value, {
      seasonNumber: optional(isNumber),
      status: nullable(isNumber)
    })))
  };
  var mediaInfoChecks = {
    id: nullable(isNumber),
    tvdbId: nullable(isNumber),
    status: nullable(isNumber),
    status4k: nullable(isNumber),
    jellyfinMediaId: nullable(isString),
    jellyfinMediaId4k: nullable(isString),
    seasons: nullable(listOf(isSeasonStatus)),
    downloadStatus: nullable(listOf(isDownload)),
    downloadStatus4k: nullable(listOf(isDownload)),
    requests: nullable(listOf((value) => matches(value, requestSummaryChecks)))
  };
  var isMediaInfo = (value) => matches(value, mediaInfoChecks);
  var collectionChecks = {
    id: nullable(isNumber),
    name: nullable(isString),
    posterPath: nullable(isString),
    backdropPath: nullable(isString)
  };
  var isCollectionRef = (value) => matches(value, collectionChecks);
  var mediaItemChecks = {
    id: isNumber,
    mediaType: isString,
    title: nullable(isString),
    name: nullable(isString),
    originalTitle: nullable(isString),
    originalName: nullable(isString),
    posterPath: nullable(isString),
    backdropPath: nullable(isString),
    overview: nullable(isString),
    voteAverage: nullable(isNumber),
    releaseDate: nullable(isString),
    firstAirDate: nullable(isString),
    mediaInfo: nullable(isMediaInfo),
    collection: nullable(isCollectionRef)
  };
  var userStatusChecks = {
    active: isBoolean,
    userFound: isBoolean,
    reason: optional(isString),
    message: optional(isString),
    jellyseerrUserId: optional(either(isString, isNumber)),
    canRequestAdvanced: optional(isBoolean)
  };
  var quotaSideChecks = {
    limit: nullable(isNumber),
    used: nullable(isNumber),
    remaining: nullable(isNumber),
    days: nullable(isNumber),
    restricted: nullable(isBoolean),
    nextResetAt: nullable(isString)
  };
  var quotaChecks = {
    movie: nullable((value) => matches(value, quotaSideChecks)),
    tv: nullable((value) => matches(value, quotaSideChecks))
  };
  var overrideRuleChecks = {
    id: nullable(either(isNumber, isString)),
    radarrServiceId: nullable(isNumber),
    sonarrServiceId: nullable(isNumber),
    language: nullable(isString),
    genre: nullable(isString),
    keywords: nullable(isString),
    users: nullable(isString),
    profileId: nullable(isNumber),
    rootFolder: nullable(isString),
    tags: nullable(either(listOf(either(isNumber, isString)), isNumber, isString))
  };
  var profileChecks = { id: isNumber, name: nullable(isString) };
  var folderChecks = { path: isString, freeSpace: nullable(isNumber) };
  var serviceChecks = {
    id: isNumber,
    name: nullable(isString),
    isDefault: nullable(isBoolean),
    is4k: nullable(isBoolean),
    activeProfileId: nullable(isNumber),
    activeDirectory: nullable(isString)
  };
  var candidateChecks = {
    tvdbId: isNumber,
    title: nullable(isString),
    year: nullable(either(isNumber, isString)),
    overview: nullable(isString),
    remotePoster: nullable(isString)
  };
  var movieCollectionChecks = {
    id: isNumber,
    name: nullable(isString),
    posterPath: nullable(isString),
    backdropPath: nullable(isString)
  };
  var issueChecks = {
    id: nullable(isNumber),
    media: nullable((value) => matches(value, {
      tmdbId: nullable(either(isNumber, isString)),
      mediaType: nullable(isString)
    }))
  };
  var tvSeasonChecks = {
    seasonNumber: isNumber,
    name: nullable(isString),
    episodeCount: nullable(isNumber),
    airDate: nullable(isString),
    jeYear: nullable(isString)
  };
  var collectionPartChecks = {
    id: isNumber,
    title: nullable(isString),
    posterPath: nullable(isString),
    releaseDate: nullable(isString),
    mediaInfo: nullable(isMediaInfo)
  };

  // client/src/features/seerr/core/status.ts
  var MEDIA = Object.freeze({
    UNKNOWN: 1,
    PENDING: 2,
    PROCESSING: 3,
    PARTIALLY_AVAILABLE: 4,
    AVAILABLE: 5,
    BLOCKED: 6,
    DELETED: 7
  });
  var REQUEST = Object.freeze({
    PENDING: 1,
    APPROVED: 2,
    DECLINED: 3,
    FAILED: 4,
    COMPLETED: 5
  });
  var DISPLAY = Object.freeze({
    AVAILABLE: "available",
    AVAILABLE_UPDATING: "available-updating",
    PENDING: "pending",
    PROCESSING: "processing",
    REQUESTED: "requested",
    PARTIAL: "partial",
    BLOCKED: "blocked",
    DELETED: "deleted",
    NONE: "none"
  });
  function resolveDisplayStatus(status, hasActiveDownloads = false) {
    switch (status) {
      case MEDIA.AVAILABLE:
        return hasActiveDownloads ? DISPLAY.AVAILABLE_UPDATING : DISPLAY.AVAILABLE;
      case MEDIA.PENDING:
        return DISPLAY.PENDING;
      case MEDIA.PROCESSING:
        return hasActiveDownloads ? DISPLAY.PROCESSING : DISPLAY.REQUESTED;
      case MEDIA.PARTIALLY_AVAILABLE:
        return DISPLAY.PARTIAL;
      case MEDIA.BLOCKED:
        return DISPLAY.BLOCKED;
      case MEDIA.DELETED:
        return DISPLAY.DELETED;
      default:
        return DISPLAY.NONE;
    }
  }
  var AVAILABLE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>`;
  var BADGE_ICONS = {
    [DISPLAY.AVAILABLE]: AVAILABLE_ICON,
    [DISPLAY.AVAILABLE_UPDATING]: AVAILABLE_ICON,
    [DISPLAY.PENDING]: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0 25.057 25.057 0 01-4.496 0z" clip-rule="evenodd" /></svg>`,
    [DISPLAY.PROCESSING]: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>`,
    [DISPLAY.REQUESTED]: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clip-rule="evenodd"></path></svg>`,
    [DISPLAY.PARTIAL]: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.75 9.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clip-rule="evenodd" /></svg>`,
    [DISPLAY.BLOCKED]: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" /></svg>`,
    [DISPLAY.DELETED]: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>`
  };
  var BADGE_CSS = {
    [DISPLAY.AVAILABLE]: "status-available",
    [DISPLAY.AVAILABLE_UPDATING]: "status-available",
    [DISPLAY.PENDING]: "status-pending",
    [DISPLAY.PROCESSING]: "status-processing",
    [DISPLAY.REQUESTED]: "status-requested",
    [DISPLAY.PARTIAL]: "status-partially-available",
    [DISPLAY.BLOCKED]: "status-blocklisted",
    [DISPLAY.DELETED]: "status-deleted"
  };
  function getBadgeConfig(displayStatus) {
    const icon = BADGE_ICONS[displayStatus];
    const cssClass = BADGE_CSS[displayStatus];
    if (!icon || !cssClass) return null;
    return { icon, cssClass };
  }

  // client/src/features/seerr/core/display.ts
  function analyzeSeasonStatuses(seasons, t) {
    if (!Array.isArray(seasons) || seasons.length === 0) return { overallStatus: MEDIA.UNKNOWN, statusSummary: null, total: 0 };
    const entries = seasons.filter(isRecord);
    const regular = entries.filter((s) => isNumber(s.seasonNumber) && s.seasonNumber > 0);
    const total = regular.length;
    if (total === 0) return { overallStatus: MEDIA.UNKNOWN, statusSummary: null, total: 0 };
    const count = (status) => regular.filter((s) => s.status === status).length;
    const available = count(MEDIA.AVAILABLE);
    const pending = count(MEDIA.PENDING);
    const processing = count(MEDIA.PROCESSING);
    const partiallyAvailable = count(MEDIA.PARTIALLY_AVAILABLE);
    const notRequested = count(MEDIA.UNKNOWN);
    const requestedCount = pending + processing;
    const availableCount = available + partiallyAvailable;
    const accountedForCount = requestedCount + availableCount;
    let overallStatus;
    let statusSummary = null;
    if (notRequested === 0) {
      overallStatus = availableCount === total ? MEDIA.AVAILABLE : MEDIA.DELETED;
      if (overallStatus === MEDIA.DELETED) statusSummary = t("jellyseerr_seasons_accounted_for", { count: accountedForCount, total });
    } else if (accountedForCount > 0) {
      overallStatus = availableCount > 0 ? MEDIA.PARTIALLY_AVAILABLE : MEDIA.PROCESSING;
      statusSummary = availableCount > 0 ? t("jellyseerr_seasons_available_count", { count: availableCount, total }) : t("jellyseerr_seasons_requested_count", { count: requestedCount, total });
    } else {
      overallStatus = MEDIA.UNKNOWN;
    }
    if (overallStatus === MEDIA.AVAILABLE) {
      const specials = entries.find((s) => s.seasonNumber === 0);
      if (specials && specials.status === MEDIA.UNKNOWN) {
        overallStatus = MEDIA.DELETED;
        statusSummary = t("jellyseerr_seasons_accounted_for", { count: accountedForCount, total });
      }
    }
    return { overallStatus, statusSummary, total, availableCount };
  }
  function hasDownloads(item) {
    return (item.mediaInfo?.downloadStatus?.length ?? 0) > 0 || (item.mediaInfo?.downloadStatus4k?.length ?? 0) > 0;
  }

  // client/src/features/seerr/core/runtime.ts
  var LOG_UI = "🪼 Jellyfin Enhanced: Seerr UI:";
  function groupInternals(JE) {
    const own = seerrCoreContext(JE).own;
    return own.jellyseerrUi || (own.jellyseerrUi = { state: { jellyseerrHoverPopover: null, jellyseerrHoverLock: false, active4KPopup: null } });
  }
  function firstInstall(JE, name) {
    const internals = groupInternals(JE);
    const installed = internals.installed || (internals.installed = /* @__PURE__ */ new Set());
    if (installed.has(name)) return false;
    installed.add(name);
    return true;
  }
  var ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  function escapeWith(JE) {
    return (value) => {
      const escape = JE.escapeHtml;
      if (typeof escape === "function") return escape(value);
      return String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
    };
  }
  function thrownProperty(error, key) {
    if (typeof error !== "object" || error === null) return void 0;
    const value = Reflect.get(error, key);
    return value;
  }
  function isAbortError(error) {
    return thrownProperty(error, "name") === "AbortError";
  }

  // client/src/features/seerr/core/ui/badges.ts
  function sanitizeProviders(list) {
    if (!Array.isArray(list)) return null;
    const providers = [];
    for (const entry of list) {
      if (isRecord(entry) && isString(entry.provider_name) && isSafeTmdbImagePath(entry.logo_path)) {
        providers.push({ ...entry, provider_name: entry.provider_name, logo_path: entry.logo_path });
      }
    }
    return providers;
  }
  var configList = (value) => value ? String(value).replace(/'/g, "").replace(/\n/g, ",").split(",").map((s) => s.trim()).filter(Boolean) : [];
  var PROVIDER_BATCH_DELAY_MS = 50;
  var PROVIDER_BATCH_MAX = 100;
  function installBadges(host) {
    const { JE, document: document2, window: window2 } = host;
    if (!firstInstall(JE, "ui-badges")) return;
    const internals = groupInternals(JE);
    const escapeHtml = escapeWith(JE);
    const badgeIconTemplates = /* @__PURE__ */ new Map();
    function appendBadgeIcon(badge, iconHtml) {
      let template = badgeIconTemplates.get(iconHtml);
      if (!template) {
        template = document2.createElement("template");
        template.innerHTML = iconHtml;
        badgeIconTemplates.set(iconHtml, template);
      }
      badge.appendChild(document2.importNode(template.content, true));
    }
    function setStatusBadge(card, item, seasonAnalysis) {
      const badge = card.querySelector(".jellyseerr-status-badge");
      const info = item.mediaInfo;
      if (!badge || !info) {
        if (badge) badge.style.display = "none";
        return;
      }
      let status;
      if (item.mediaType === "tv" && info.seasons) {
        const analysis = seasonAnalysis || analyzeSeasonStatuses(info.seasons, JE.t);
        status = analysis ? analysis.overallStatus : info.status;
      } else {
        status = info.status || 1;
      }
      const downloads = hasDownloads(item);
      const displayStatus = resolveDisplayStatus(status, downloads);
      const config = getBadgeConfig(displayStatus);
      if (!config) {
        badge.style.display = "none";
        return;
      }
      if (!badge.firstChild) appendBadgeIcon(badge, config.icon);
      else badge.innerHTML = config.icon;
      badge.className = `jellyseerr-status-badge ${config.cssClass}`;
      badge.style.display = "flex";
      if (displayStatus === DISPLAY.PARTIAL && item.mediaType === "tv" && downloads) {
        badge.style.cursor = "pointer";
        internals.addDownloadProgressHover?.(badge, item);
      }
    }
    const providerLookups = /* @__PURE__ */ new Map();
    let queuedLookups = [];
    let providerFlushTimer = null;
    const providerRegion = () => {
      const region = String(JE.pluginConfig?.DEFAULT_REGION || "US").trim().toUpperCase();
      return /^[A-Z]{2}$/.test(region) ? region : "US";
    };
    const abortError = () => {
      const error = new Error("Request aborted");
      error.name = "AbortError";
      return error;
    };
    function settleLookup(lookup, settle) {
      if (providerLookups.get(lookup.lookupKey) === lookup) providerLookups.delete(lookup.lookupKey);
      for (const waiter of [...lookup.waiters]) {
        lookup.waiters.delete(waiter);
        waiter.detach();
        settle(waiter);
      }
    }
    function releaseLookup(lookup) {
      if (lookup.waiters.size > 0) return;
      const batch = lookup.batch;
      if (!batch) {
        providerLookups.delete(lookup.lookupKey);
        queuedLookups = queuedLookups.filter((l) => l !== lookup);
        return;
      }
      if (batch.lookups.some((l) => l.waiters.size > 0)) return;
      for (const l of batch.lookups) if (providerLookups.get(l.lookupKey) === l) providerLookups.delete(l.lookupKey);
      batch.controller.abort();
    }
    function flushProviderBatch() {
      if (providerFlushTimer !== null) window2.clearTimeout(providerFlushTimer);
      providerFlushTimer = null;
      const first = queuedLookups[0];
      if (!first) return;
      const region = first.region;
      const lookups = [];
      const rest = [];
      for (const lookup of queuedLookups) (lookup.region === region && lookups.length < PROVIDER_BATCH_MAX ? lookups : rest).push(lookup);
      queuedLookups = rest;
      if (rest.length > 0) providerFlushTimer = window2.setTimeout(flushProviderBatch, PROVIDER_BATCH_DELAY_MS);
      const batch = { controller: new AbortController(), lookups };
      for (const lookup of lookups) lookup.batch = batch;
      const epoch = JE.session?.getEpoch();
      const items = lookups.map((l) => l.key).join(",");
      const api = JE.core?.api;
      const pending = api ? api.plugin(`/watch-providers?items=${items}&region=${region}`, { signal: batch.controller.signal, priority: "low" }) : Promise.reject(new Error("core API unavailable"));
      pending.then((data) => {
        const results = isRecord(data) && isRecord(data.results) ? data.results : {};
        const cacheable = !JE.session || epoch === void 0 || JE.session.isCurrent(epoch);
        for (const lookup of lookups) {
          const providers = sanitizeProviders(results[lookup.key]);
          if (providers && cacheable) {
            try {
              JE.core?.api?.manager?.setCache?.(lookup.cacheKey, providers);
            } catch (error) {
              console.debug(`${LOG_UI} Provider cache write skipped:`, error);
            }
          }
          settleLookup(lookup, (waiter) => waiter.resolve(providers));
        }
      }, (error) => {
        if (batch.controller.signal.aborted) return;
        if (!isAbortError(error)) console.warn(`${LOG_UI} Could not fetch provider icons for ${lookups.length} title(s):`, error);
        for (const lookup of lookups) settleLookup(lookup, (waiter) => waiter.resolve(null));
      });
    }
    function getFlatrateProviders(mediaType, tmdbId, signal) {
      const region = providerRegion();
      const key = `${mediaType}:${tmdbId}`;
      const cacheKey = `providers:${region}:${key}`;
      const cached = sanitizeProviders(JE.core?.api?.manager?.getCached?.(cacheKey));
      if (cached) return Promise.resolve(cached);
      if (signal?.aborted) return Promise.reject(abortError());
      return new Promise((resolve, reject) => {
        const lookupKey = `${region}:${key}`;
        let lookup = providerLookups.get(lookupKey);
        if (!lookup) {
          lookup = { lookupKey, region, key, cacheKey, waiters: /* @__PURE__ */ new Set(), batch: null };
          providerLookups.set(lookupKey, lookup);
          queuedLookups.push(lookup);
          if (queuedLookups.length >= PROVIDER_BATCH_MAX) flushProviderBatch();
          else if (providerFlushTimer === null) providerFlushTimer = window2.setTimeout(flushProviderBatch, PROVIDER_BATCH_DELAY_MS);
        }
        const owner = lookup;
        const onAbort = () => {
          owner.waiters.delete(waiter);
          reject(abortError());
          releaseLookup(owner);
        };
        const waiter = { resolve, reject, detach: () => signal?.removeEventListener("abort", onAbort) };
        owner.waiters.add(waiter);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    function setHasIcons(container, hasIcons) {
      container.classList.toggle("has-icons", hasIcons);
      container.closest(".cardImageContainer")?.classList.toggle("jellyseerr-has-provider-icons", hasIcons);
    }
    async function fetchProviderIcons(container, tmdbId, mediaType, signal) {
      if (!container || !tmdbId || !mediaType) return;
      const config = JE.pluginConfig;
      if (!config?.TmdbEnabled) return;
      const defaults = configList(config.DEFAULT_PROVIDERS);
      const ignored = configList(config.IGNORE_PROVIDERS);
      try {
        let providers = await getFlatrateProviders(mediaType, tmdbId, signal);
        if (signal && !container.isConnected) return;
        if (!providers || providers.length === 0) return;
        if (defaults.length > 0) providers = providers.filter((p) => defaults.includes(p.provider_name));
        if (ignored.length > 0) {
          try {
            const patterns = ignored.map((pattern) => new RegExp(pattern, "i"));
            providers = providers.filter((p) => !patterns.some((regex) => regex.test(p.provider_name)));
          } catch (error) {
            console.error(`${LOG_UI} Invalid regex in IGNORE_PROVIDERS setting.`, error);
          }
        }
        providers = providers.filter((p) => isSafeTmdbImagePath(p.logo_path));
        for (const provider of providers.slice(0, 4)) {
          const img = document2.createElement("img");
          img.loading = "lazy";
          img.decoding = "async";
          if ("fetchPriority" in img) img.fetchPriority = "low";
          img.width = 92;
          img.height = 92;
          img.alt = provider.provider_name || "";
          img.src = `https://image.tmdb.org/t/p/w92${provider.logo_path}`;
          img.title = provider.provider_name;
          img.onerror = () => {
            img.remove();
            if (container.childElementCount === 0) setHasIcons(container, false);
          };
          container.appendChild(img);
        }
        if (container.childElementCount > 0) setHasIcons(container, true);
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) return;
        console.warn(`${LOG_UI} Could not fetch provider icons for TMDB ID ${tmdbId}:`, error);
      }
    }
    function addMediaTypeBadge(card, item, imageContainer, label) {
      if (item.mediaType !== "movie" && item.mediaType !== "tv" && item.mediaType !== "collection") return;
      const container = imageContainer || card.querySelector(".cardImageContainer");
      if (!container) return;
      const badge = document2.createElement("div");
      if (item.mediaType === "movie") {
        badge.className = "jellyseerr-media-badge jellyseerr-media-badge-movie";
        badge.textContent = label ?? JE.t("jellyseerr_card_badge_movie");
      } else if (item.mediaType === "tv") {
        badge.className = "jellyseerr-media-badge jellyseerr-media-badge-series";
        badge.textContent = label ?? JE.t("jellyseerr_card_badge_series");
      } else {
        badge.className = "jellyseerr-media-badge jellyseerr-media-badge-collection";
        badge.textContent = label ?? JE.t("jellyseerr_card_badge_collection");
      }
      container.appendChild(badge);
    }
    function addCollectionMembershipBadge(card, item, imageContainer) {
      if (!item.collection || item.mediaType !== "movie") return;
      const container = imageContainer || card.querySelector(".cardImageContainer");
      if (!container) return;
      const badge = document2.createElement("div");
      badge.className = "jellyseerr-collection-badge";
      badge.innerHTML = `<span class="material-icons">collections</span><span>${escapeHtml(item.collection.name ?? "") || JE.t("jellyseerr_card_badge_collection")}</span>`;
      badge.title = `Part of ${item.collection.name || "collection"}`;
      container.appendChild(badge);
    }
    internals.setStatusBadge = setStatusBadge;
    internals.fetchProviderIcons = fetchProviderIcons;
    internals.isSafeTmdbImagePath = isSafeTmdbImagePath;
    internals.addMediaTypeBadge = addMediaTypeBadge;
    internals.addCollectionMembershipBadge = addCollectionMembershipBadge;
  }

  // client/src/features/seerr/core/ui/badges-entry.ts
  installBadges(seerrCoreHost());
})();
})();
//# sourceMappingURL=ui-badges.js.map
