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
  var isUserQuota = (value) => matches(value, quotaChecks);
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
  function formatNextReset(resetAt, now, t) {
    if (!resetAt || !(isString(resetAt) || isNumber(resetAt))) return "";
    const ts = new Date(resetAt).getTime();
    if (!Number.isFinite(ts)) return "";
    const deltaMs = ts - now;
    if (deltaMs <= 0) return t("jellyseerr_quota_reset_now");
    const minutes = Math.round(deltaMs / 6e4);
    const hours = Math.round(deltaMs / 36e5);
    const days = Math.round(deltaMs / 864e5);
    if (minutes < 60) return t("jellyseerr_quota_reset_in_minutes", { minutes: Math.max(1, minutes) });
    if (hours < 36) return t("jellyseerr_quota_reset_in_hours", { hours });
    return t("jellyseerr_quota_reset_in_days", { days });
  }
  var numberOf = (value) => Number(value) || 0;
  function formatQuotaLine(quota, type, now, t) {
    if (!quota) return { text: "", restricted: false, unlimited: true, resetText: "" };
    const limit = numberOf(quota.limit);
    const used = numberOf(quota.used);
    const days = numberOf(quota.days);
    const label = t(type === "tv" ? "jellyseerr_quota_label_tv" : "jellyseerr_quota_label_movie");
    if (limit <= 0) return { text: t("jellyseerr_quota_unlimited", { label }), restricted: false, unlimited: true, resetText: "" };
    return {
      text: days > 0 ? t("jellyseerr_quota_usage_window", { label, used, limit, days }) : t("jellyseerr_quota_usage", { label, used, limit }),
      restricted: !!quota.restricted,
      unlimited: false,
      resetText: formatNextReset(quota.nextResetAt, now, t)
    };
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

  // client/src/features/seerr/core/ui/quota.ts
  function installQuota(host) {
    const { JE, document: document2 } = host;
    if (!firstInstall(JE, "ui-quota")) return;
    const ui = JE.jellyseerrUI || (JE.jellyseerrUI = {});
    const internals = groupInternals(JE);
    const escapeHtml = escapeWith(JE);
    const t = JE.t;
    const quotaEnabled = () => JE.pluginConfig?.JellyseerrShowQuotaInfo !== false;
    function isQuotaError(error) {
      return quotaEnabled() && classifyFailure(error, true) === "quota";
    }
    const nextReset = (resetAt) => formatNextReset(resetAt, Date.now(), t);
    const quotaLine = (quota, type) => formatQuotaLine(quota, type, Date.now(), t);
    function buildQuotaChip(value, mediaType) {
      if (!isUserQuota(value)) return null;
      const side = mediaType === "tv" ? value.tv : value.movie;
      const line = quotaLine(side, mediaType === "tv" ? "tv" : "movie");
      if (!line.text || line.unlimited) return null;
      const chip = document2.createElement("div");
      chip.className = "jellyseerr-quota-chip";
      const remaining = Number(side?.remaining);
      if (line.restricted) chip.classList.add("jellyseerr-quota-chip-restricted");
      else if (remaining > 0 && remaining <= 2) chip.classList.add("jellyseerr-quota-chip-warning");
      chip.textContent = line.text;
      const sub = (text2) => {
        const element = document2.createElement("div");
        element.className = "jellyseerr-quota-chip-sub";
        element.textContent = text2;
        chip.appendChild(element);
      };
      if (line.restricted) sub(t("jellyseerr_quota_restricted_hint"));
      if (line.resetText) sub(line.resetText);
      return chip;
    }
    async function showQuotaErrorDialog(error, mediaType) {
      const origin = captureOrigin(host);
      const quota = await JE.jellyseerrAPI?.fetchUserQuota?.({ skipCache: true }) ?? null;
      if (!origin.current()) return;
      const upstreamMessage = errorBody(error).message || "";
      const lines = [];
      if (upstreamMessage) lines.push(upstreamMessage);
      if (quota) {
        const movie = quotaLine(quota.movie, "movie");
        const tv = quotaLine(quota.tv, "tv");
        const [lead, other] = mediaType === "tv" ? [tv, movie] : [movie, tv];
        if (lead.text) lines.push(lead.text);
        if (lead.resetText) lines.push(lead.resetText);
        if (other.text) lines.push(other.text);
      }
      lines.push(t("jellyseerr_quota_dialog_hint"));
      const title = t("jellyseerr_quota_dialog_title");
      const message = lines.map((line) => escapeHtml(line)).join("<br><br>");
      const dashboard = host.window.Dashboard;
      if (typeof dashboard?.alert === "function") {
        try {
          dashboard.alert({ title, message });
          return;
        } catch (dialogError) {
          console.warn(`${LOG_UI} Dashboard.alert threw, falling back to toast:`, dialogError);
        }
      }
      if (!origin.current()) return;
      JE.toast?.(escapeHtml(`${title}: ${lines.join(" — ")}`), 8e3);
    }
    async function handleRequestError(error, mediaType, requestBtn, resetLabel) {
      const origin = captureOrigin(host);
      const kind = classifyFailure(error, quotaEnabled());
      if (isQuotaError(error)) {
        await showQuotaErrorDialog(error, mediaType);
      } else if (kind === "uncertain") {
        JE.toast?.(escapeHtml(uncertainMessage(JE)), 6e3);
      } else {
        const upstream = errorBody(error).message;
        JE.toast?.(upstream ? escapeHtml(upstream) : t("jellyseerr_modal_toast_request_fail"), 4e3);
      }
      if (!origin.current()) return;
      if (requestBtn) {
        requestBtn.disabled = false;
        requestBtn.textContent = resetLabel;
      }
    }
    ui.isQuotaError = isQuotaError;
    ui.showQuotaErrorDialog = showQuotaErrorDialog;
    ui.buildQuotaChip = buildQuotaChip;
    internals.isQuotaError = isQuotaError;
    internals.formatNextReset = nextReset;
    internals.formatQuotaLine = quotaLine;
    internals.buildQuotaChip = buildQuotaChip;
    internals.showQuotaErrorDialog = showQuotaErrorDialog;
    internals.handleRequestError = handleRequestError;
  }

  // client/src/features/seerr/core/ui/quota-entry.ts
  installQuota(seerrCoreHost());
})();
})();
//# sourceMappingURL=ui-quota.js.map
