(() => {
"use strict";
(() => {
  // client/src/host/seerr-core-host.ts
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

  // client/src/features/seerr/core/display.ts
  function formatEtaText(downloadStatus, now) {
    if (!isRecord(downloadStatus)) return null;
    const rawEta = downloadStatus.estimatedCompletionTime;
    if (!rawEta || !(isString(rawEta) || isNumber(rawEta))) return null;
    const timeUntilMs = new Date(rawEta).getTime() - now;
    if (Number.isNaN(timeUntilMs)) return null;
    if (timeUntilMs <= 0) return "Estimated soon";
    const minutes = Math.round(timeUntilMs / 6e4);
    if (minutes >= 1440) {
      const days = Math.round(minutes / 1440);
      return `Estimated in ${days} day${days !== 1 ? "s" : ""}`;
    }
    if (minutes >= 60) {
      const hours = Math.round(minutes / 60);
      return `Estimated in ${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    return `Estimated in ${minutes} min`;
  }
  function progressPercent(size, sizeLeft) {
    if (!isNumber(size) || !isNumber(sizeLeft) || size <= 0) return null;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - sizeLeft / size))));
  }
  var capitalize = (value) => value.replace(/^./, (c) => c.toUpperCase());

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

  // client/src/features/seerr/core/ui/popover.ts
  function installPopover(host) {
    const { JE, document: document2, window: window2 } = host;
    if (!firstInstall(JE, "ui-popover")) return;
    const ui = JE.jellyseerrUI || (JE.jellyseerrUI = {});
    const internals = groupInternals(JE);
    const state = internals.state;
    const escapeHtml = escapeWith(JE);
    const icons = () => internals.icons ?? ICONS;
    function ensureHoverPopover() {
      if (!state.jellyseerrHoverPopover) {
        const popover = document2.createElement("div");
        popover.className = "jellyseerr-hover-popover";
        document2.body.appendChild(popover);
        state.jellyseerrHoverPopover = popover;
      }
      return state.jellyseerrHoverPopover;
    }
    const etaText = (downloadStatus) => {
      try {
        return formatEtaText(downloadStatus, Date.now());
      } catch {
        return null;
      }
    };
    function fillHoverPopover(item) {
      const downloads = [...item.mediaInfo?.downloadStatus || [], ...item.mediaInfo?.downloadStatus4k || []];
      if (downloads.length === 0) {
        console.debug(`${LOG_UI} No download status found`);
        return null;
      }
      const popover = ensureHoverPopover();
      let html = "";
      for (const download of downloads) {
        const percent = progressPercent(download.size, download.sizeLeft);
        const status = (download.status || "").toLowerCase();
        const isQueued = status === "queued";
        const isWarning = status === "warning";
        if (percent === null && !isQueued && !isWarning) continue;
        const title = escapeHtml(download.title ?? "") || JE.t("jellyseerr_popover_downloading");
        if (isQueued || download.size === null || typeof download.size === "number" && download.size <= 0) {
          html += `
                    <div class="jellyseerr-popover-item">
                        <div class="title">${title}</div>
                        <div class="jellyseerr-hover-progress"><div class="bar" style="width:0%;"></div></div>
                        <div class="row">
                            <div>0%</div>
                            <div class="status">Queued</div>
                        </div>
                    </div>`;
        } else {
          const shown = percent ?? 0;
          const statusDisplay = isWarning ? "Warning" : capitalize(download.status || "Downloading");
          const eta = etaText(download);
          html += `
                    <div class="jellyseerr-popover-item">
                        <div class="title">${title}</div>
                        <div class="jellyseerr-hover-progress"><div class="bar" style="width:${shown}%;"></div></div>
                        <div class="row">
                            <div>${shown}%</div>
                            <div class="status">${escapeHtml(statusDisplay)}</div>
                            ${eta ? `<div class="eta">${escapeHtml(eta)}</div>` : ""}
                        </div>
                    </div>`;
        }
      }
      popover.innerHTML = html;
      console.debug(`${LOG_UI} Popover filled for ${downloads.length} download item(s)`);
      return popover;
    }
    function positionHoverPopover(element, x, y) {
      const padding = 12;
      const rect = element.getBoundingClientRect();
      const newX = Math.min(Math.max(x + 14, padding), window2.innerWidth - rect.width - padding);
      const newY = Math.min(Math.max(y - rect.height - 14, padding), window2.innerHeight - rect.height - padding);
      element.style.transform = `translate(${newX}px, ${newY}px)`;
    }
    function showAt(popover, item, x, y) {
      positionHoverPopover(popover, x, y);
      popover.classList.add("show");
      popover.dataset.tmdbId = String(item.id);
      popover.dataset.clientX = String(x);
      popover.dataset.clientY = String(y);
    }
    function hideHoverPopover() {
      const popover = state.jellyseerrHoverPopover;
      if (popover && !state.jellyseerrHoverLock) {
        popover.classList.remove("show");
        delete popover.dataset.tmdbId;
        delete popover.dataset.clientX;
        delete popover.dataset.clientY;
      }
    }
    function toggleHoverPopoverLock(lockState) {
      state.jellyseerrHoverLock = typeof lockState === "boolean" ? lockState : !state.jellyseerrHoverLock;
    }
    function createInlineProgress(downloadStatus) {
      const percent = progressPercent(downloadStatus?.size, downloadStatus?.sizeLeft);
      if (!downloadStatus || percent === null) return null;
      const container = document2.createElement("div");
      container.className = "jellyseerr-inline-progress";
      container.innerHTML = `
            <div class="jellyseerr-inline-progress-bar"><div class="jellyseerr-inline-progress-fill" style="width: ${percent}%"></div></div>
            <div class="jellyseerr-inline-progress-text">${percent}% • ${escapeHtml(capitalize(downloadStatus.status || "downloading"))}</div>`;
      return container;
    }
    function hide4KPopup() {
      if (state.active4KPopup) {
        state.active4KPopup.remove();
        state.active4KPopup = null;
      }
    }
    function show4KPopup(buttonGroup, item) {
      if (!isViewCurrent(host, buttonGroup)) return;
      hide4KPopup();
      const popup = document2.createElement("div");
      bindViewOrigin(host, popup);
      popup.className = "jellyseerr-4k-popup";
      const button = document2.createElement("button");
      button.className = "jellyseerr-4k-popup-item";
      const display4k = resolveDisplayStatus(item.mediaInfo ? item.mediaInfo.status4k : 1, false);
      if (display4k === DISPLAY.AVAILABLE) {
        button.innerHTML = `<span>4K Available</span>${icons().available}`;
        button.disabled = true;
        button.classList.add("jellyseerr-4k-available", "chip-available");
      } else if (display4k === DISPLAY.PENDING || display4k === DISPLAY.REQUESTED || display4k === DISPLAY.PROCESSING) {
        button.innerHTML = `<span>4K Requested</span>${icons().pending}`;
        button.disabled = true;
        button.classList.add(display4k === DISPLAY.PROCESSING ? "chip-processing" : "chip-pending");
      } else if (display4k === DISPLAY.BLOCKED) {
        button.innerHTML = `<span>${JE.t("jellyseerr_btn_blocklisted")}</span>${icons().cancel}`;
        button.disabled = true;
        button.classList.add("chip-blocklisted");
      } else {
        button.innerHTML = `<span>${JE.t("jellyseerr_btn_request_4k")}</span>`;
        button.dataset.tmdbId = String(item.id);
        button.dataset.mediaType = item.mediaType || "movie";
        button.dataset.action = "request4k";
        button.classList.add("chip-requested");
      }
      popup.appendChild(button);
      document2.body.appendChild(popup);
      state.active4KPopup = popup;
      const rect = buttonGroup.getBoundingClientRect();
      popup.style.position = "fixed";
      popup.style.left = `${rect.left}px`;
      popup.style.top = `${rect.bottom + 4}px`;
      popup.style.width = `${rect.width}px`;
      window2.setTimeout(() => popup.classList.add("show"), 10);
    }
    const hoverItems = /* @__PURE__ */ new WeakMap();
    const hoverBound = /* @__PURE__ */ new WeakSet();
    function addDownloadProgressHover(button, item) {
      hoverItems.set(button, item);
      if (hoverBound.has(button)) return;
      hoverBound.add(button);
      const show = (event) => {
        const current = hoverItems.get(button);
        const popover = current ? fillHoverPopover(current) : null;
        if (!current || !popover) return;
        const target = event.target instanceof Element ? event.target : button;
        const clientX = event instanceof MouseEvent && event.clientX || target.getBoundingClientRect().right;
        const clientY = event instanceof MouseEvent && event.clientY || target.getBoundingClientRect().top - 8;
        showAt(popover, current, clientX, clientY);
      };
      button.addEventListener("mouseenter", show);
      button.addEventListener("mousemove", (event) => {
        const popover = state.jellyseerrHoverPopover;
        if (popover?.classList.contains("show") && !state.jellyseerrHoverLock) {
          popover.dataset.clientX = String(event.clientX);
          popover.dataset.clientY = String(event.clientY);
          positionHoverPopover(popover, event.clientX, event.clientY);
        }
      });
      button.addEventListener("mouseleave", () => ui.hideHoverPopover?.());
      button.addEventListener("focus", show);
      button.addEventListener("blur", () => {
        ui.toggleHoverPopoverLock?.(false);
        ui.hideHoverPopover?.();
      });
      JE.core?.ui?.addTouchTapListener?.(button, (event) => {
        event.preventDefault();
        const current = hoverItems.get(button);
        const popover = current ? fillHoverPopover(current) : null;
        if (!current || !popover) return;
        const rect = button.getBoundingClientRect();
        ui.toggleHoverPopoverLock?.();
        if (state.jellyseerrHoverLock) showAt(popover, current, rect.left + rect.width / 2, rect.top - 8);
        else popover.classList.remove("show");
      });
    }
    function clearDownloadProgressHover(button) {
      hoverItems.delete(button);
    }
    ui.hideHoverPopover = hideHoverPopover;
    ui.toggleHoverPopoverLock = toggleHoverPopoverLock;
    ui.formatEtaText = etaText;
    internals.ensureHoverPopover = ensureHoverPopover;
    internals.formatEtaText = etaText;
    internals.fillHoverPopover = fillHoverPopover;
    internals.positionHoverPopover = positionHoverPopover;
    internals.createInlineProgress = createInlineProgress;
    internals.hide4KPopup = hide4KPopup;
    internals.show4KPopup = show4KPopup;
    internals.addDownloadProgressHover = addDownloadProgressHover;
    internals.clearDownloadProgressHover = clearDownloadProgressHover;
  }

  // client/src/features/seerr/core/ui/popover-entry.ts
  installPopover(seerrCoreHost());
})();
})();
//# sourceMappingURL=ui-popover.js.map
