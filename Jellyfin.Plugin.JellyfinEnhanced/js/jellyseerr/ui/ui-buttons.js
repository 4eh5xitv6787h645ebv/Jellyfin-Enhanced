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
  function getButtonConfig(displayStatus) {
    switch (displayStatus) {
      case DISPLAY.AVAILABLE:
        return { labelKey: "jellyseerr_btn_available", cssClass: "jellyseerr-button-available", disabled: true, showSpinner: false, iconKey: "available" };
      case DISPLAY.AVAILABLE_UPDATING:
        return { labelKey: "jellyseerr_btn_available", cssClass: "jellyseerr-button-available-updating", disabled: true, showSpinner: true, iconKey: "available" };
      case DISPLAY.PENDING:
        return { labelKey: "jellyseerr_btn_pending", cssClass: "jellyseerr-button-pending", disabled: true, showSpinner: false, iconKey: "pending" };
      case DISPLAY.PROCESSING:
        return { labelKey: "jellyseerr_btn_processing", cssClass: "jellyseerr-button-processing", disabled: true, showSpinner: true, iconKey: "" };
      case DISPLAY.REQUESTED:
        return { labelKey: "jellyseerr_btn_requested", cssClass: "jellyseerr-button-pending", disabled: true, showSpinner: false, iconKey: "requested" };
      case DISPLAY.PARTIAL:
        return { labelKey: "jellyseerr_btn_partially_available", cssClass: "jellyseerr-button-partially-available", disabled: true, showSpinner: false, iconKey: "partially_available" };
      case DISPLAY.BLOCKED:
        return { labelKey: "jellyseerr_btn_blocklisted", cssClass: "jellyseerr-button-blocklisted", disabled: true, showSpinner: false, iconKey: "cancel" };
      default:
        return { labelKey: "jellyseerr_btn_request", cssClass: "jellyseerr-button-request", disabled: false, showSpinner: false, iconKey: "request" };
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
  function translated(JE, key, fallback, params) {
    const text2 = params ? JE.t(key, params) : JE.t(key);
    return text2 && text2 !== key ? text2 : fallback;
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
  function thrownProperty(error, key) {
    if (typeof error !== "object" || error === null) return void 0;
    const value = Reflect.get(error, key);
    return value;
  }
  function errorStatus(error) {
    const status = thrownProperty(error, "status");
    return isNumber(status) ? status : null;
  }
  function errorBody(error) {
    const body = thrownProperty(error, "responseJSON");
    if (!isRecord(body)) return { message: null, code: null, requestOutcome: null };
    return {
      message: isString(body.message) && body.message ? body.message : null,
      code: isString(body.code) && body.code ? body.code : null,
      requestOutcome: body.requestOutcome === "unknown" || body.requestOutcome === "rejected" || body.requestOutcome === "not_sent" ? body.requestOutcome : null
    };
  }
  var RequestNotSentError = class extends Error {
    constructor(reason, detail) {
      super(detail);
      this.reason = reason;
      this.name = "SeerrRequestNotSent";
    }
  };
  function classifyFailure(error, quotaEnabled) {
    if (error instanceof RequestNotSentError || error instanceof Error && error.name === "SeerrRequestNotSent") return "not-sent";
    const status = errorStatus(error);
    const { message, requestOutcome } = errorBody(error);
    if (requestOutcome === "unknown") return "uncertain";
    if (requestOutcome === "not_sent") return "not-sent";
    if (status === null || status >= 500 && requestOutcome !== "rejected") return "uncertain";
    if (status === 403 && quotaEnabled && /quota\s+exceeded/i.test(message || "")) return "quota";
    if (status === 404) return "user-not-found";
    if (status === 403) return "permission";
    return "rejected";
  }
  function uncertainMessage(JE) {
    return translated(JE, "jellyseerr_request_outcome_unknown", "Request status unknown. Check Seerr before requesting again.");
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

  // client/src/features/seerr/core/ui/buttons.ts
  var ARROW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clip-rule="evenodd" /></svg>';
  function installButtons(host) {
    const { JE, document: document2 } = host;
    if (!firstInstall(JE, "ui-buttons")) return;
    const ui = JE.jellyseerrUI || (JE.jellyseerrUI = {});
    const internals = groupInternals(JE);
    const state = internals.state;
    const escapeHtml = escapeWith(JE);
    const icons = () => internals.icons ?? ICONS;
    const requestHandlers = /* @__PURE__ */ new WeakMap();
    function configureRequestButton(button, value, isJellyseerrActive, jellyseerrUserFound) {
      const previous = requestHandlers.get(button);
      if (previous) {
        button.removeEventListener("click", previous);
        requestHandlers.delete(button);
      }
      internals.clearDownloadProgressHover?.(button);
      if (!isJellyseerrActive) {
        button.innerHTML = `<span>${JE.t("jellyseerr_btn_offline")}</span>${icons().cloud_off}`;
        button.disabled = true;
        button.classList.add("jellyseerr-button-offline");
        return;
      }
      if (!jellyseerrUserFound) {
        button.innerHTML = `<span>${JE.t("jellyseerr_btn_user_not_found")}</span>${icons().person_off}`;
        button.disabled = true;
        button.classList.add("jellyseerr-button-no-user");
        return;
      }
      if (!isMediaItem(value)) {
        button.innerHTML = `<span>${JE.t("jellyseerr_btn_error")}</span>${icons().error}`;
        button.disabled = true;
        return;
      }
      const item = value;
      if (item.mediaType === "collection") {
        configureCollectionButton(button, item);
      } else if (item.mediaType === "tv") {
        button.dataset.searchResultItem = JSON.stringify(item);
        button.classList.add("jellyseerr-button-tv");
        if (item.mediaInfo) button.dataset.mediaInfo = JSON.stringify(item.mediaInfo);
        const analysis = item.mediaInfo?.seasons ? analyzeSeasonStatuses(item.mediaInfo.seasons, JE.t) : null;
        const overall = analysis ? analysis.overallStatus : item.mediaInfo ? item.mediaInfo.status : 1;
        configureTvShowButton(button, overall, analysis, item);
      } else {
        configureMovieButton(button, item);
      }
    }
    function configureCollectionButton(button, item) {
      bindViewOrigin(host, button);
      button.dataset.searchResultItem = JSON.stringify(item);
      button.dataset.mediaType = "collection";
      button.dataset.collectionId = String(item.id);
      button.innerHTML = `${icons().request}<span>${JE.t("jellyseerr_modal_request_collection")}</span>`;
      button.className = "jellyseerr-request-button jellyseerr-button-request jellyseerr-button-collection";
      button.disabled = false;
    }
    function decorateArrow(arrow, item) {
      const display4k = resolveDisplayStatus(item.mediaInfo ? item.mediaInfo.status4k : 1, false);
      if (display4k === DISPLAY.AVAILABLE) {
        arrow.disabled = true;
        arrow.classList.add("jellyseerr-split-arrow-disabled", "jellyseerr-4k-available");
        arrow.title = "4K Available";
      } else if (display4k === DISPLAY.PENDING || display4k === DISPLAY.REQUESTED || display4k === DISPLAY.PROCESSING) {
        arrow.classList.add("jellyseerr-4k-pending");
        arrow.title = "4K Requested";
      } else {
        arrow.title = JE.t("jellyseerr_btn_request_4k");
      }
    }
    function arrowButton(item, group) {
      const arrow = document2.createElement("button");
      bindViewOrigin(host, arrow);
      arrow.className = "jellyseerr-split-arrow";
      arrow.innerHTML = ARROW_SVG;
      arrow.dataset.tmdbId = String(item.id);
      arrow.dataset.toggle4k = "true";
      decorateArrow(arrow, item);
      arrow.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!isViewCurrent(host, arrow)) return;
        if (state.active4KPopup && state.active4KPopup.parentElement === group) internals.hide4KPopup?.();
        else internals.show4KPopup?.(group, item);
      });
      return arrow;
    }
    function configureTvShowButton(button, overallStatus, seasonAnalysis, item) {
      bindViewOrigin(host, button);
      const setButton = (text2, icon, className, disabled = false, summary = seasonAnalysis?.statusSummary) => {
        button.innerHTML = `${icon || ""}<span>${text2}</span>`;
        if (summary) button.innerHTML += `<div class="jellyseerr-season-summary">${summary}</div>`;
        button.disabled = disabled;
        button.className = `jellyseerr-request-button jellyseerr-button-tv ${className}`;
      };
      const total = seasonAnalysis?.total ?? 0;
      switch (overallStatus) {
        case MEDIA.PENDING:
          setButton(JE.t("jellyseerr_btn_pending"), icons().pending, "jellyseerr-button-pending");
          break;
        case MEDIA.PROCESSING:
          setButton(JE.t("jellyseerr_btn_request"), icons().request, "jellyseerr-button-request");
          break;
        case MEDIA.DELETED:
          setButton(JE.t((seasonAnalysis?.availableCount ?? 0) > 0 ? "jellyseerr_btn_request_more" : "jellyseerr_btn_request"), icons().request, "jellyseerr-button-request");
          break;
        case MEDIA.PARTIALLY_AVAILABLE:
          setButton(JE.t("jellyseerr_btn_request_missing"), icons().request, "jellyseerr-button-partially-available");
          if (hasDownloads(item)) internals.addDownloadProgressHover?.(button, item);
          break;
        case MEDIA.AVAILABLE:
          setButton(
            JE.t("jellyseerr_btn_available"),
            icons().available,
            "jellyseerr-button-available",
            true,
            total > 1 ? JE.t("jellyseerr_all_seasons", { count: total }) : null
          );
          break;
        case MEDIA.BLOCKED:
          setButton(JE.t("jellyseerr_btn_blocklisted"), icons().cancel, "jellyseerr-button-blocklisted", true);
          break;
        default:
          setButton(
            JE.t("jellyseerr_btn_request"),
            icons().request,
            "jellyseerr-button-request",
            false,
            total > 1 ? JE.t("jellyseerr_seasons_available", { count: total }) : null
          );
      }
      if (JE.pluginConfig?.JellyseerrEnable4KTvRequests && !button.closest(".jellyseerr-button-group")) {
        const group = document2.createElement("div");
        group.className = "jellyseerr-button-group";
        const main = button.cloneNode(true);
        if (!(main instanceof HTMLButtonElement)) return;
        bindViewOrigin(host, main);
        main.classList.add("jellyseerr-split-main");
        main.dataset.tmdbId = String(item.id);
        main.dataset.mediaType = "tv";
        main.dataset.searchResultItem = JSON.stringify(item);
        group.appendChild(main);
        group.appendChild(arrowButton(item, group));
        button.replaceWith(group);
      }
    }
    const idleRequestHtml = () => `${icons().request}<span>${JE.t("jellyseerr_btn_request")}</span>`;
    function rejectionMessage(error, kind) {
      if (kind === "user-not-found") return JE.t("jellyseerr_btn_user_not_found");
      const { code, message } = errorBody(error);
      if (kind === "permission") {
        return JE.t(code ? `jellyseerr_err_${code}` : "jellyseerr_err_no_request_permission") || JE.t("jellyseerr_err_no_request_permission");
      }
      if (kind === "uncertain") return uncertainMessage(JE);
      return message || JE.t("jellyseerr_btn_error");
    }
    function movieRequestHandler(target, item, preventDefault) {
      const handler = async (event) => {
        if (preventDefault) event.preventDefault();
        event.stopPropagation();
        const api = JE.jellyseerrAPI;
        if (!api || !isViewCurrent(host, target)) return;
        if (api.shouldShowAdvanced()) {
          void ui.showMovieRequestModal?.(item.id, item.title || item.name || "", item, false);
          return;
        }
        const origin = captureOrigin(host);
        target.disabled = true;
        target.innerHTML = `<span>${JE.t("jellyseerr_btn_requesting")}</span><span class="jellyseerr-button-spinner"></span>`;
        const live = () => requestHandlers.get(target) === handler;
        try {
          await api.requestMedia(item.id, "movie", {}, false, item);
          if (!live()) return;
          if (!origin.current()) {
            target.disabled = false;
            target.innerHTML = idleRequestHtml();
            return;
          }
          if (!item.mediaInfo) item.mediaInfo = {};
          item.mediaInfo.status = MEDIA.PROCESSING;
          target.innerHTML = `<span>${JE.t("jellyseerr_btn_requested")}</span>${icons().requested}`;
          target.classList.remove("jellyseerr-button-request");
          target.classList.add("jellyseerr-button-pending");
        } catch (error) {
          if (!live()) return;
          target.disabled = false;
          if (!origin.current()) {
            target.innerHTML = idleRequestHtml();
            return;
          }
          if (ui.isQuotaError?.(error)) {
            await ui.showQuotaErrorDialog?.(error, "movie");
            if (!live()) return;
            target.innerHTML = idleRequestHtml();
            return;
          }
          const kind = classifyFailure(error, JE.pluginConfig?.JellyseerrShowQuotaInfo !== false);
          target.innerHTML = `<span>${escapeHtml(rejectionMessage(error, kind))}</span>${icons().error}`;
          target.classList.add("jellyseerr-button-error");
        }
      };
      return handler;
    }
    function configureMovieButton(button, item) {
      bindViewOrigin(host, button);
      button.dataset.searchResultItem = JSON.stringify(item);
      const status = item.mediaInfo ? item.mediaInfo.status : 1;
      const downloads = hasDownloads(item);
      if (JE.pluginConfig?.JellyseerrEnable4KRequests && !button.closest(".jellyseerr-button-group")) {
        const group = document2.createElement("div");
        group.className = "jellyseerr-button-group";
        const config2 = getButtonConfig(resolveDisplayStatus(status, downloads));
        const main = document2.createElement("button");
        bindViewOrigin(host, main);
        main.className = `jellyseerr-request-button jellyseerr-split-main ${config2.cssClass}`;
        main.disabled = config2.disabled;
        main.innerHTML = `${config2.iconKey ? icons()[config2.iconKey] : ""}<span>${JE.t(config2.labelKey)}</span>${config2.showSpinner ? '<span class="jellyseerr-button-spinner"></span>' : ""}`;
        main.dataset.tmdbId = String(item.id);
        main.dataset.mediaType = "movie";
        main.dataset.searchResultItem = JSON.stringify(item);
        if (downloads && config2.disabled) internals.addDownloadProgressHover?.(main, item);
        group.appendChild(main);
        group.appendChild(arrowButton(item, group));
        button.replaceWith(group);
        if (!config2.disabled) {
          const handler = movieRequestHandler(main, item, false);
          requestHandlers.set(main, handler);
          main.addEventListener("click", handler);
        }
        return;
      }
      const config = getButtonConfig(resolveDisplayStatus(status, downloads));
      const icon = config.iconKey ? icons()[config.iconKey] : "";
      if (config.showSpinner) {
        button.innerHTML = `${icon}<span>${JE.t(config.labelKey)}</span><span class="jellyseerr-button-spinner"></span>`;
        button.disabled = true;
        button.className = `jellyseerr-request-button ${config.cssClass}`;
        if (downloads) internals.addDownloadProgressHover?.(button, item);
      } else {
        button.innerHTML = `${icon}<span>${JE.t(config.labelKey)}</span>`;
        button.disabled = config.disabled;
        button.className = `jellyseerr-request-button ${config.cssClass}`;
      }
      if (!button.disabled && !button.closest(".jellyseerr-button-group")) {
        const handler = movieRequestHandler(button, item, true);
        requestHandlers.set(button, handler);
        button.addEventListener("click", handler);
      }
    }
    ui.configureRequestButton = configureRequestButton;
    internals.configureRequestButton = configureRequestButton;
    internals.configureCollectionButton = configureCollectionButton;
    internals.configureTvShowButton = configureTvShowButton;
    internals.configureMovieButton = configureMovieButton;
  }

  // client/src/features/seerr/core/ui/buttons-entry.ts
  installButtons(seerrCoreHost());
})();
})();
//# sourceMappingURL=ui-buttons.js.map
