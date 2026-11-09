(() => {
"use strict";
(() => {
  // client/src/features/seerr/host-core.ts
  function seerrCoreHost() {
    const host = window;
    const JE = host.JellyfinEnhanced;
    if (!JE) throw new Error("Jellyfin Enhanced must be initialized before the Seerr core group");
    return { JE, window: host, document, apiClient: () => host.ApiClient };
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
  var isMediaItem = (value) => matches(value, mediaItemChecks);
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
  function effectiveMediaStatus(rawStatus, jellyfinId, jellyfinSeasonMap = null, seasonNumber = null) {
    const status = rawStatus ?? MEDIA.UNKNOWN;
    if (status !== MEDIA.AVAILABLE) return status;
    if (jellyfinSeasonMap !== null && seasonNumber !== null) return jellyfinSeasonMap[seasonNumber] ? MEDIA.AVAILABLE : MEDIA.DELETED;
    return jellyfinId ? MEDIA.AVAILABLE : MEDIA.DELETED;
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

  // client/src/features/seerr/core/runtime.ts
  var LOG_UI = "🪼 Jellyfin Enhanced: Seerr UI:";
  function groupInternals(JE) {
    const internals = JE.internals || (JE.internals = {});
    return internals.jellyseerrUi || (internals.jellyseerrUi = { state: { jellyseerrHoverPopover: null, jellyseerrHoverLock: false, active4KPopup: null } });
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
  function text(read) {
    try {
      const value = read();
      return isString(value) && value ? value : null;
    } catch {
      return null;
    }
  }
  function captureOrigin(host) {
    const session = host.JE.session;
    const epoch = session ? session.getEpoch() : null;
    const user = () => text(() => host.apiClient()?.getCurrentUserId?.());
    const server = () => text(() => {
      const client = host.apiClient();
      const id = client?.serverId;
      return typeof id === "function" ? Reflect.apply(id, client, []) : id;
    });
    const startClient = host.apiClient();
    const root = () => text(() => host.apiClient()?.getUrl("/"));
    const token = () => text(() => host.apiClient()?.accessToken?.());
    const startRoot = root();
    const startToken = token();
    const startUser = user();
    const startServer = server();
    return {
      epoch,
      current: () => host.apiClient() === startClient && root() === startRoot && token() === startToken && (!session || epoch === null || session.isCurrent(epoch)) && user() === startUser && server() === startServer
    };
  }
  function bindViewOrigin(host, element) {
    const internals = groupInternals(host.JE);
    const owners = internals.viewOrigins || (internals.viewOrigins = /* @__PURE__ */ new WeakMap());
    owners.set(element, captureOrigin(host));
  }
  function isViewCurrent(host, element) {
    const owners = groupInternals(host.JE).viewOrigins;
    for (let node = element; node; node = node.parentElement) {
      if (owners?.get(node)?.current() === false) return false;
    }
    return true;
  }

  // client/src/features/seerr/core/ui/icon-markup.ts
  var ICONS = Object.freeze({
    star: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="color:#ffc107;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>',
    available: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="margin-left:0.5em;"><polygon points="20.13,5.41 18.72,4 9.53,13.19 5.28,8.95 3.87,10.36 9.53,16.02"/><rect height="2" width="14" x="5" y="18"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="margin-left:0.5em;"><path d="M12 7c.55 0 1 .45 1 1v4c0 .55-.45 1-1 1s-1-.45-1-1V8c0-.55.45-1 1-1zm-.01-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm1-3h-2v-2h2v2z"/></svg>',
    cloud_off: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="margin-left:0.5em;"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4 3 5.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73z"></path></svg>',
    person_off: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="margin-left:0.5em;"><path d="M8.65,5.82C9.36,4.72,10.6,4,12,4c2.21,0,4,1.79,4,4c0,1.4-0.72,2.64-1.82,3.35L8.65,5.82z M20,17.17 c-0.02-1.1-0.63-2.11-1.61-2.62c-0.54-0.28-1.13-0.54-1.77-0.76L20,17.17z M20.49,20.49L3.51,3.51c-0.39-0.39-1.02-0.39-1.41,0l0,0 c-0.39,0.39-0.39,1.02,0,1.41l8.18,8.18c-1.82,0.23-3.41,0.8-4.7,1.46C4.6,15.08,4,16.11,4,17.22L4,20h13.17l1.9,1.9 c0.39,0.39,1.02,0.39,1.41,0l0,0C20.88,21.51,20.88,20.88,20.49,20.49z"/></svg>',
    pending: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="margin-left:0.5em;"><path d="M12,2C6.48,2,2,6.48,2,12c0,5.52,4.48,10,10,10s10-4.48,10-10C22,6.48,17.52,2,12,2z M12,20c-4.42,0-8-3.58-8-8 c0-4.42,3.58-8,8-8s8,3.58,8,8C20,16.42,16.42,20,12,20z"/><circle cx="7" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="12" r="1.5"/></svg>',
    requested: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clip-rule="evenodd"></path></svg>',
    partially_available: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="margin-left:0.5em;"><path d="M9.71 11.29a1 1 0 0 0-1.42 1.42l3 3A1 1 0 0 0 12 16a1 1 0 0 0 .72-.34l7-8a1 1 0 0 0-1.5-1.32L12 13.54z"/><path d="M21 11a1 1 0 0 0-1 1 8 8 0 0 1-8 8A8 8 0 0 1 6.33 6.36 7.93 7.93 0 0 1 12 4a8.79 8.79 0 0 1 1.9.22 1 1 0 1 0 .47-1.94A10.54 10.54 0 0 0 12 2a10 10 0 0 0-7 17.09A9.93 9.93 0 0 0 12 22a10 10 0 0 0 10-10 1 1 0 0 0-1-1z"/></svg>',
    cancel: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="margin-left:0.5em;"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"></path></svg>',
    request: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" style="margin-right:0.5em;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg>'
  });

  // client/src/features/seerr/core/ui/cards.ts
  var linkableBase = (base) => /^https?:\/\//i.test(base) || base.startsWith("/") ? base : "";
  function part(parent, index) {
    const element = parent?.children[index];
    if (!(element instanceof HTMLElement)) throw new Error("Seerr card template is missing a part");
    return element;
  }
  function installCards(host) {
    const { JE, document: document2, window: window2 } = host;
    if (!firstInstall(JE, "ui-cards")) return;
    const ui = JE.jellyseerrUI || (JE.jellyseerrUI = {});
    const internals = groupInternals(JE);
    const escapeHtml = escapeWith(JE);
    const isTvLayout = () => JE.core?.ui?.isTvLayout?.() === true;
    const POSTER_DATA_KEY = "jePoster";
    let posterObserver = null;
    const observedPosters = /* @__PURE__ */ new Set();
    const posterReadiness = /* @__PURE__ */ new WeakMap();
    function getPosterReadiness(el) {
      let record = posterReadiness.get(el);
      if (!record) {
        let resolve = () => void 0;
        const promise = new Promise((r) => {
          resolve = r;
        });
        record = { promise, resolve: () => resolve() };
        posterReadiness.set(el, record);
      }
      return record;
    }
    function applyPoster(el) {
      const url = el.dataset[POSTER_DATA_KEY];
      try {
        posterObserver?.unobserve(el);
      } catch {
      }
      observedPosters.delete(el);
      if (!url) return;
      delete el.dataset[POSTER_DATA_KEY];
      el.style.backgroundImage = `url("${url.replace(/["\\]/g, "\\$&")}")`;
      const probe = new Image();
      probe.onload = probe.onerror = () => getPosterReadiness(el).resolve();
      probe.src = url;
    }
    function getPosterObserver() {
      if (posterObserver) return posterObserver;
      if (typeof IntersectionObserver === "undefined") return null;
      try {
        posterObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if ((entry.isIntersecting || entry.intersectionRatio > 0) && entry.target instanceof HTMLElement) applyPoster(entry.target);
          }
        }, { root: null, rootMargin: "800px", threshold: 0 });
      } catch {
        posterObserver = null;
      }
      return posterObserver;
    }
    function observePoster(el, url) {
      el.dataset[POSTER_DATA_KEY] = url;
      const observer = getPosterObserver();
      if (!observer) {
        applyPoster(el);
        return;
      }
      try {
        observer.observe(el);
        observedPosters.add(el);
      } catch {
        applyPoster(el);
      }
    }
    const ICON_POSTER_WAIT_MS = 3e3;
    const ICON_IDLE_TIMEOUT_MS = 1e3;
    let iconObserver = null;
    const iconJobs = /* @__PURE__ */ new Map();
    function runWhenIdle(fn) {
      if (typeof window2.requestIdleCallback === "function") {
        const id2 = window2.requestIdleCallback(() => fn(), { timeout: ICON_IDLE_TIMEOUT_MS });
        return () => window2.cancelIdleCallback(id2);
      }
      const id = window2.setTimeout(fn, 0);
      return () => window2.clearTimeout(id);
    }
    function cancelIconJob(el, job) {
      job.cancelled = true;
      if (job.timer !== null) window2.clearTimeout(job.timer);
      job.cancelIdle?.();
      job.controller?.abort();
      try {
        iconObserver?.unobserve(el);
      } catch {
      }
      iconJobs.delete(el);
    }
    function startProviderIcons(el, job) {
      job.started = true;
      const bound = new Promise((resolve) => {
        job.timer = window2.setTimeout(resolve, ICON_POSTER_WAIT_MS);
      });
      void Promise.race([getPosterReadiness(el).promise, bound]).then(() => {
        if (job.timer !== null) window2.clearTimeout(job.timer);
        if (job.cancelled) return;
        job.cancelIdle = runWhenIdle(() => {
          job.cancelIdle = null;
          if (job.cancelled) return;
          if (!job.visible || !job.container.isConnected) {
            job.started = false;
            return;
          }
          try {
            iconObserver?.unobserve(el);
          } catch {
          }
          const controller = new AbortController();
          job.controller = controller;
          const lookup = internals.fetchProviderIcons?.(job.container, job.tmdbId, job.mediaType, controller.signal) ?? Promise.resolve();
          void lookup.finally(() => {
            if (iconJobs.get(el) === job) iconJobs.delete(el);
          });
        });
      });
    }
    function getIconObserver() {
      if (iconObserver) return iconObserver;
      if (typeof IntersectionObserver === "undefined") return null;
      try {
        iconObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!(entry.target instanceof HTMLElement)) continue;
            const job = iconJobs.get(entry.target);
            if (!job || job.controller) continue;
            job.visible = entry.isIntersecting || entry.intersectionRatio > 0;
            if (job.visible && !job.started) startProviderIcons(entry.target, job);
          }
        }, { root: null, rootMargin: "0px", threshold: 0 });
      } catch {
        iconObserver = null;
      }
      return iconObserver;
    }
    function observeProviderIcons(el, container, tmdbId, mediaType) {
      const observer = getIconObserver();
      if (!observer) {
        void internals.fetchProviderIcons?.(container, tmdbId, mediaType);
        return;
      }
      iconJobs.set(el, { container, tmdbId, mediaType, visible: false, started: false, cancelled: false, timer: null, cancelIdle: null, controller: null });
      try {
        observer.observe(el);
      } catch {
        iconJobs.delete(el);
        void internals.fetchProviderIcons?.(container, tmdbId, mediaType);
      }
    }
    function releasePosters(root) {
      const isReleased = (el) => !!root && root.contains(el) || !el.isConnected && !(el.getRootNode() instanceof DocumentFragment);
      if (posterObserver) {
        for (const el of [...observedPosters]) {
          if (!isReleased(el)) continue;
          try {
            posterObserver.unobserve(el);
          } catch {
          }
          observedPosters.delete(el);
        }
      }
      for (const [el, job] of [...iconJobs]) if (isReleased(el)) cancelIconJob(el, job);
    }
    function getLibraryAvailability(item, seasonAnalysis) {
      const info = item.mediaInfo;
      const jellyfinMediaId = info?.jellyfinMediaId || info?.jellyfinMediaId4k || null;
      let effective;
      if (item.mediaType === "tv" && info?.seasons?.length) {
        const analysis = seasonAnalysis || analyzeSeasonStatuses(info.seasons, JE.t);
        effective = analysis.overallStatus;
      } else {
        effective = effectiveMediaStatus(info?.status, jellyfinMediaId);
      }
      const isAvailable = !!jellyfinMediaId && (effective === MEDIA.AVAILABLE || effective === MEDIA.PARTIALLY_AVAILABLE);
      return { isAvailable, jellyfinMediaId };
    }
    const cardStates = /* @__PURE__ */ new WeakMap();
    const boundContainers = /* @__PURE__ */ new WeakSet();
    let cardTemplate = null;
    let cardTemplateIconUrl = null;
    function getCardTemplate(seerrIconUrl) {
      if (cardTemplate && cardTemplateIconUrl === seerrIconUrl) return cardTemplate;
      const template = document2.createElement("template");
      template.innerHTML = `<div class="card overflowPortraitCard card-hoverable card-withuserdata jellyseerr-card"><div class="cardBox cardBox-bottompadded"><div class="cardScalable"><div class="cardPadder cardPadder-overflowPortrait"></div><div class="cardImageContainer coveredImage cardContent jellyseerr-poster-image focusable" style="cursor: pointer;" tabindex="0"><div class="jellyseerr-status-badge"></div><div class="jellyseerr-elsewhere-icons"></div><div class="cardIndicators"></div></div><div class="cardOverlayContainer" style="pointer-events: none;"></div></div><div class="cardText cardTextCentered cardText-first"><a is="emby-linkbutton" class="jellyseerr-more-info-link"><bdi></bdi></a></div><div class="cardText cardTextCentered cardText-secondary jellyseerr-meta"><img class="jellyseerr-icon-on-card" alt="Seerr"><bdi></bdi><div class="jellyseerr-rating">${(internals.icons ?? ICONS).star}<span></span></div></div></div></div>`;
      const root = template.content.firstElementChild;
      if (!(root instanceof HTMLElement)) throw new Error("Seerr card template did not parse");
      root.querySelector(".jellyseerr-icon-on-card")?.setAttribute("src", seerrIconUrl);
      cardTemplate = root;
      cardTemplateIconUrl = seerrIconUrl;
      return root;
    }
    let batchContext = null;
    function getBatchContext() {
      if (batchContext) return batchContext;
      const config = JE.pluginConfig;
      const hiddenSettings = JE.hiddenContent?.getSettings?.() ?? null;
      const showHideButtons = !!(hiddenSettings && hiddenSettings.enabled && hiddenSettings.showHideButtons !== false && hiddenSettings.showButtonJellyseerr !== false);
      const translatedOr = (key, fallback) => JE.t(key) !== key ? JE.t(key) : fallback;
      const mediaBadgeKeys = { movie: "jellyseerr_card_badge_movie", tv: "jellyseerr_card_badge_series", collection: "jellyseerr_card_badge_collection" };
      const mediaBadgeLabels = /* @__PURE__ */ new Map();
      let viewLabel = null;
      const ctx = {
        seerrBase: JE.jellyseerrAPI?.resolveJellyseerrBaseUrl() || "",
        // A TV app has no new window to open Seerr in, so it always uses the modal.
        useMoreInfoModal: !!config?.JellyseerrUseMoreInfoModal || isTvLayout(),
        moreInfoLoaded: !!JE.jellyseerrMoreInfo,
        availablePostersLinkToJellyfin: !!config?.JellyseerrAvailablePosterLinksToJellyfin,
        showProviderIcons: !!(config?.ShowElsewhereOnJellyseerr && config.TmdbEnabled),
        posterNotFoundUrl: JE.cdn?.url?.("ibb", "fdbkXQdP/jellyseerr-poster-not-found.png") ?? "",
        seerrIconUrl: JE.cdn?.selfhst?.("svg/seerr.svg") ?? "",
        showHideButtons,
        hiddenLabel: showHideButtons ? translatedOr("hidden_content_already_hidden", "Hidden") : null,
        unhideLabel: showHideButtons ? translatedOr("hidden_content_unhide", "Unhide") : null,
        hideLabel: showHideButtons ? translatedOr("hidden_content_hide_button", "Hide") : null,
        viewOnJellyseerrLabel() {
          if (viewLabel === null) viewLabel = JE.t("jellyseerr_card_view_on_jellyseerr") || "View on Jellyseerr";
          return viewLabel;
        },
        mediaBadgeLabel(mediaType) {
          const key = mediaBadgeKeys[mediaType];
          if (!key) return void 0;
          let label = mediaBadgeLabels.get(mediaType);
          if (label === void 0) {
            label = JE.t(key);
            mediaBadgeLabels.set(mediaType, label);
          }
          return label;
        }
      };
      batchContext = ctx;
      queueMicrotask(() => {
        if (batchContext === ctx) batchContext = null;
      });
      return ctx;
    }
    function cardItemInputs(item) {
      const info = item.mediaInfo;
      return [
        item.id,
        item.mediaType,
        item.title,
        item.name,
        item.posterPath,
        item.voteAverage,
        item.releaseDate,
        item.firstAirDate,
        item.collection ? [item.collection.name] : null,
        info ? [
          info.status,
          info.jellyfinMediaId,
          info.jellyfinMediaId4k,
          Array.isArray(info.seasons) ? info.seasons.map((s) => [s?.seasonNumber, s?.status]) : !!info.seasons,
          info.downloadStatus?.length,
          info.downloadStatus4k?.length
        ] : null
      ];
    }
    function cardInputsKey(items) {
      const ctx = getBatchContext();
      return JSON.stringify([
        ctx.seerrBase,
        ctx.useMoreInfoModal,
        ctx.moreInfoLoaded,
        ctx.availablePostersLinkToJellyfin,
        ctx.showProviderIcons,
        ctx.posterNotFoundUrl,
        ctx.seerrIconUrl,
        ctx.showHideButtons,
        ctx.hiddenLabel,
        ctx.unhideLabel,
        ctx.hideLabel,
        ctx.viewOnJellyseerrLabel(),
        ctx.mediaBadgeLabel("movie"),
        ctx.mediaBadgeLabel("tv"),
        ctx.mediaBadgeLabel("collection"),
        items.map((item) => isMediaItem(item) ? cardItemInputs(item) : null),
        ctx.showHideButtons ? items.map((item) => isMediaItem(item) ? JE.hiddenContent?.isHiddenByTmdbId?.(item.id) ?? false : null) : null
      ]);
    }
    function setHideButtonState(hideBtn, hidden, ctx) {
      hideBtn.className = hidden ? "je-hide-btn je-already-hidden" : "je-hide-btn";
      hideBtn.title = (hidden ? ctx.hiddenLabel : ctx.hideLabel) ?? "";
      hideBtn.replaceChildren();
      const icon = document2.createElement("span");
      icon.className = "material-icons";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = hidden ? "visibility_off" : "visibility";
      hideBtn.appendChild(icon);
    }
    function createJellyseerrCard(value, isJellyseerrActive, jellyseerrUserFound) {
      if (!isMediaItem(value)) {
        console.debug(`${LOG_UI} Skipped a malformed Seerr result`, value);
        return null;
      }
      const item = value;
      const ctx = getBatchContext();
      const isCollection = item.mediaType === "collection";
      const year = item.releaseDate?.substring(0, 4) || item.firstAirDate?.substring(0, 4) || (isCollection ? "" : "N/A");
      const posterUrl = isSafeTmdbImagePath(item.posterPath) ? `https://image.tmdb.org/t/p/w400${item.posterPath}` : ctx.posterNotFoundUrl;
      const rating = item.voteAverage ? item.voteAverage.toFixed(1) : isCollection ? "" : "N/A";
      const title = String((item.title || item.name) ?? "");
      const base = linkableBase(ctx.seerrBase);
      const jellyseerrUrl = base ? `${base}/${encodeURIComponent(item.mediaType)}/${item.id}` : null;
      const useMoreInfoModal = ctx.useMoreInfoModal;
      const seasons = item.mediaType === "tv" ? item.mediaInfo?.seasons : null;
      const seasonAnalysis = seasons ? analyzeSeasonStatuses(seasons, JE.t) : null;
      const { isAvailable, jellyfinMediaId } = getLibraryAvailability(item, seasonAnalysis);
      const jellyfinHref = isAvailable ? `#!/details?id=${jellyfinMediaId}` : null;
      const linksAvailableToJellyfin = isAvailable && item.mediaType !== "collection" && ctx.availablePostersLinkToJellyfin;
      const card = document2.importNode(getCardTemplate(ctx.seerrIconUrl), true);
      bindViewOrigin(host, card);
      if (isAvailable) card.classList.add("jellyseerr-card-in-library");
      const cardBox = part(card, 0);
      const cardScalable = part(cardBox, 0);
      const imageContainer = part(cardScalable, 1);
      const titleLink = part(part(cardBox, 1), 0);
      const meta = part(cardBox, 2);
      if (jellyfinHref) {
        titleLink.setAttribute("href", jellyfinHref);
      } else if (useMoreInfoModal || !jellyseerrUrl) {
        titleLink.setAttribute("href", "#");
      } else {
        titleLink.setAttribute("href", jellyseerrUrl);
        titleLink.setAttribute("target", "_blank");
        titleLink.setAttribute("rel", "noopener noreferrer");
      }
      titleLink.setAttribute("data-tmdb-id", String(item.id));
      titleLink.setAttribute("data-media-type", item.mediaType);
      titleLink.setAttribute("title", jellyfinHref || useMoreInfoModal || !jellyseerrUrl ? title : ctx.viewOnJellyseerrLabel());
      const titleText = titleLink.firstElementChild;
      if (titleText) titleText.textContent = title;
      titleLink.addEventListener("click", onTitleLinkCaptureClick, true);
      const ratingElement = part(meta, 2);
      if (rating) {
        const value2 = ratingElement.lastElementChild;
        if (value2) value2.textContent = rating;
      } else ratingElement.remove();
      const yearElement = part(meta, 1);
      if (year) yearElement.textContent = year;
      else yearElement.remove();
      observePoster(imageContainer, posterUrl);
      internals.setStatusBadge?.(card, item, seasonAnalysis);
      internals.addMediaTypeBadge?.(card, item, imageContainer, ctx.mediaBadgeLabel(item.mediaType));
      internals.addCollectionMembershipBadge?.(card, item, imageContainer);
      if (ctx.showProviderIcons && item.mediaType !== "collection") observeProviderIcons(imageContainer, part(imageContainer, 1), item.id, item.mediaType);
      if (ctx.showHideButtons) {
        const hideBtn = document2.createElement("button");
        setHideButtonState(hideBtn, JE.hiddenContent?.isHiddenByTmdbId?.(item.id) ?? false, ctx);
        cardBox.style.position = "relative";
        cardBox.appendChild(hideBtn);
      }
      cardStates.set(card, {
        item,
        isJellyseerrActive,
        jellyseerrUserFound,
        ctx,
        useMoreInfoModal,
        jellyseerrUrl,
        jellyfinMediaId,
        jellyfinHref,
        linksAvailableToJellyfin,
        posterOpensModal: useMoreInfoModal && ctx.moreInfoLoaded,
        // Without the modal, an item outside the library links its overview text to Seerr.
        navigatesExternally: !useMoreInfoModal && !jellyfinMediaId && !!jellyseerrUrl && item.mediaType !== "collection",
        cardScalable,
        imageContainer,
        overview: null,
        button: null,
        outsideClick: null,
        tapNavigatedAt: 0
      });
      return card;
    }
    function goToJellyfinItem(state) {
      try {
        const page = host.window.Emby?.Page;
        if (page?.showItem && state.jellyfinMediaId) {
          page.showItem(state.jellyfinMediaId);
          return;
        }
      } catch {
      }
      if (state.jellyfinHref) window2.location.hash = state.jellyfinHref;
    }
    const openMoreInfo = (tmdbId, mediaType) => {
      if (tmdbId && mediaType) void JE.jellyseerrMoreInfo?.open(tmdbId, mediaType);
    };
    function createOverview(state) {
      const item = state.item;
      const overview = document2.createElement("div");
      overview.className = "jellyseerr-overview";
      overview.style.cursor = "pointer";
      const text2 = escapeHtml((item.overview || JE.t("jellyseerr_card_no_info")).slice(0, 500));
      const contentHtml = state.navigatesExternally && state.jellyseerrUrl ? `<a is="emby-linkbutton" href="${escapeHtml(state.jellyseerrUrl)}" target="_blank" rel="noopener noreferrer" class="content jellyseerr-overview-link" style="text-decoration:none;color:inherit;">${text2}</a>` : `<div class="content">${text2}</div>`;
      overview.innerHTML = `
                    ${contentHtml}
                    <button type="button" class="jellyseerr-request-button" data-tmdb-id="${item.id}" data-media-type="${escapeHtml(item.mediaType)}"></button>
                `;
      state.overview = overview;
      state.cardScalable.appendChild(overview);
      const button = overview.querySelector(".jellyseerr-request-button");
      state.button = button instanceof HTMLButtonElement ? button : null;
      if (state.button) internals.configureRequestButton?.(state.button, item, state.isJellyseerrActive, state.jellyseerrUserFound);
      return overview;
    }
    function removeOverview(state) {
      const overview = state.overview;
      if (overview?.parentNode) {
        overview.parentNode.removeChild(overview);
        state.overview = null;
        state.button = null;
      }
      if (state.outsideClick) document2.removeEventListener("click", state.outsideClick);
    }
    function closeOverviewOnOutsideClick(card, state) {
      const handler = state.outsideClick || (state.outsideClick = (event) => {
        if (!(event.target instanceof Node) || !card.contains(event.target)) removeOverview(state);
      });
      window2.setTimeout(() => {
        if (state.overview) document2.addEventListener("click", handler);
      }, 0);
    }
    function cardEventTarget(container, event) {
      const target = event.target;
      if (!(target instanceof Element)) return null;
      const card = target.closest(".jellyseerr-card");
      if (!(card instanceof HTMLElement) || card.parentElement !== container || !isViewCurrent(host, card)) return null;
      const state = cardStates.get(card);
      return state ? { card, state, target } : null;
    }
    function inCard(card, target, selector) {
      const el = target.closest(selector);
      return el instanceof HTMLElement && card.contains(el) ? el : null;
    }
    function onTitleLinkCaptureClick(event) {
      const link = event.currentTarget instanceof HTMLElement ? event.currentTarget : this;
      const card = link.closest(".jellyseerr-card");
      const state = card instanceof HTMLElement ? cardStates.get(card) : void 0;
      if (!state || !card || !isViewCurrent(host, card)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const item = state.item;
      const href = link.getAttribute("href");
      if (href && href.startsWith("#!/details?id=")) return;
      if (item.mediaType === "collection") {
        event.preventDefault();
        event.stopPropagation();
        void ui.showCollectionRequestModal?.(item.id, item.name || item.title || "", item);
        return;
      }
      if (state.useMoreInfoModal && JE.jellyseerrMoreInfo) {
        event.preventDefault();
        event.stopPropagation();
        openMoreInfo(parseInt(link.dataset.tmdbId || "", 10), link.dataset.mediaType || "");
      }
    }
    function onHideButtonClick(event, hideBtn, card, state) {
      const item = state.item;
      event.preventDefault();
      event.stopPropagation();
      if (hideBtn.classList.contains("je-already-hidden")) {
        JE.hiddenContent?.unhideItem?.(state.jellyfinMediaId || `tmdb-${item.id}`);
        setHideButtonState(hideBtn, false, state.ctx);
        return;
      }
      JE.hiddenContent?.confirmAndHide?.({
        itemId: state.jellyfinMediaId || "",
        name: escapeHtml(item.title || item.name),
        type: item.mediaType === "tv" ? "Series" : "Movie",
        tmdbId: item.id,
        posterPath: item.posterPath || ""
      }, () => {
        card.style.display = "none";
      });
    }
    function onOverviewClick(event, state) {
      const item = state.item;
      const target = event.target;
      if (target instanceof Element && (target.closest(".jellyseerr-request-button") || target.closest(".jellyseerr-overview-link"))) return;
      event.preventDefault();
      event.stopPropagation();
      if (state.linksAvailableToJellyfin) goToJellyfinItem(state);
      else if (item.mediaType === "collection") void ui.showCollectionRequestModal?.(item.id, item.name || item.title || "", item);
      else if (state.useMoreInfoModal && JE.jellyseerrMoreInfo) openMoreInfo(item.id, item.mediaType);
    }
    const TAP_CLICK_FOLLOW_MS = 1e3;
    function onPosterClick(event, card, state) {
      if (!("ontouchstart" in window2)) {
        if (state.linksAvailableToJellyfin) {
          event.preventDefault();
          event.stopPropagation();
          goToJellyfinItem(state);
          return;
        } else if (!state.overview) {
          event.preventDefault();
          event.stopPropagation();
          createOverview(state);
          closeOverviewOnOutsideClick(card, state);
        }
      }
      if (state.linksAvailableToJellyfin) {
        event.preventDefault();
        event.stopPropagation();
        const followsTap = state.tapNavigatedAt > 0 && performance.now() - state.tapNavigatedAt < TAP_CLICK_FOLLOW_MS;
        state.tapNavigatedAt = 0;
        if (!followsTap) goToJellyfinItem(state);
      } else if (state.posterOpensModal) {
        event.preventDefault();
        event.stopPropagation();
        openMoreInfo(state.item.id, state.item.mediaType);
      }
    }
    function onCardClick(container, event) {
      const hit = cardEventTarget(container, event);
      if (!hit) return;
      const { card, state, target } = hit;
      const hideBtn = inCard(card, target, ".je-hide-btn");
      if (hideBtn instanceof HTMLButtonElement) {
        onHideButtonClick(event, hideBtn, card, state);
        return;
      }
      if (inCard(card, target, ".jellyseerr-collection-badge")) {
        const collection = state.item.collection;
        event.preventDefault();
        event.stopPropagation();
        if (collection?.id) void ui.showCollectionRequestModal?.(collection.id, collection.name || "", state.item);
        return;
      }
      if (inCard(card, target, ".jellyseerr-overview")) {
        onOverviewClick(event, state);
        return;
      }
      if (inCard(card, target, ".jellyseerr-poster-image") === state.imageContainer) onPosterClick(event, card, state);
    }
    function onCardKeydown(container, event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const hit = cardEventTarget(container, event);
      if (!hit || inCard(hit.card, hit.target, ".jellyseerr-poster-image") !== hit.state.imageContainer) return;
      const state = hit.state;
      event.preventDefault();
      if (state.linksAvailableToJellyfin) {
        goToJellyfinItem(state);
      } else if (!state.overview) {
        const overview = createOverview(state);
        if (isTvLayout()) overview.querySelector(".jellyseerr-request-button")?.focus();
      } else {
        removeOverview(state);
      }
    }
    function onCardHoverBoundary(container, event, entering) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const isScalable = target.classList.contains("cardScalable");
      if (!isScalable && !target.classList.contains("je-hide-btn")) return;
      const hit = cardEventTarget(container, event);
      if (!hit) return;
      const state = hit.state;
      if (isScalable) {
        if (target !== state.cardScalable) return;
        if (!entering) removeOverview(state);
        else if (!state.overview && !state.linksAvailableToJellyfin) createOverview(state);
      } else if (target.classList.contains("je-already-hidden")) {
        target.title = (entering ? state.ctx.unhideLabel : state.ctx.hiddenLabel) ?? "";
      }
    }
    function onPosterTap(event, imageContainer) {
      const card = imageContainer.closest(".jellyseerr-card");
      const state = card instanceof HTMLElement ? cardStates.get(card) : void 0;
      if (!card || !(card instanceof HTMLElement) || !state) return;
      const target = event.target;
      if (target instanceof Element && (target.closest(".jellyseerr-overview") || target.closest(".jellyseerr-request-button"))) return;
      if (state.linksAvailableToJellyfin) {
        goToJellyfinItem(state);
        state.tapNavigatedAt = performance.now();
        return;
      }
      if (!state.overview) {
        event.preventDefault();
        createOverview(state);
        closeOverviewOnOutsideClick(card, state);
      }
    }
    function bindCardContainer(container) {
      if (boundContainers.has(container)) return;
      boundContainers.add(container);
      container.addEventListener("click", (event) => onCardClick(container, event));
      container.addEventListener("keydown", (event) => onCardKeydown(container, event));
      container.addEventListener("mouseenter", (event) => onCardHoverBoundary(container, event, true), true);
      container.addEventListener("mouseleave", (event) => onCardHoverBoundary(container, event, false), true);
      JE.core?.ui?.addDelegatedTouchTapListener?.(container, (el) => {
        const card = el.closest(".jellyseerr-card");
        const state = card instanceof HTMLElement && card.parentElement === container ? cardStates.get(card) : void 0;
        return state && state.imageContainer.contains(el) ? state.imageContainer : null;
      }, onPosterTap);
    }
    function bindCardContainersFrom(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest(".jellyseerr-card");
      const container = card?.parentElement;
      if (card instanceof HTMLElement && container instanceof HTMLElement && !boundContainers.has(container) && cardStates.has(card)) {
        bindCardContainer(container);
      }
    }
    for (const type of ["mouseover", "touchstart", "focusin", "keydown", "click"]) {
      document2.addEventListener(type, bindCardContainersFrom, { capture: true, passive: true });
    }
    ui.releasePosters = releasePosters;
    ui.isInLibrary = (item) => isMediaItem(item) && getLibraryAvailability(item).isAvailable;
    ui.cardInputsKey = cardInputsKey;
    ui.createJellyseerrCard = createJellyseerrCard;
    internals.createJellyseerrCard = createJellyseerrCard;
  }

  // client/src/features/seerr/core/ui/cards-entry.ts
  installCards(seerrCoreHost());
})();
})();
//# sourceMappingURL=ui-cards.js.map
