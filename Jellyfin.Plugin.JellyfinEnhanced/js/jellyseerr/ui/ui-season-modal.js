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
  var isTvSeason = (value) => matches(value, tvSeasonChecks);
  function decodeTvDetails(value) {
    if (!isRecord(value) || !Array.isArray(value.seasons)) return null;
    const externalIds = value.externalIds;
    const externalTvdbId = isRecord(externalIds) && isNumber(externalIds.tvdbId) && externalIds.tvdbId > 0 ? externalIds.tvdbId : null;
    const view = {
      seasons: value.seasons.filter(isTvSeason),
      externalTvdbId,
      mediaInfo: isMediaInfo(value.mediaInfo) ? value.mediaInfo : null
    };
    if (isString(value.name)) view.name = value.name;
    if (isString(value.title)) view.title = value.title;
    if (isString(value.backdropPath)) view.backdropPath = value.backdropPath;
    if (value.jeSpoilerGuard === true) view.jeSpoilerGuard = true;
    return view;
  }
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
  function isRequestable(mediaStatus) {
    return !mediaStatus || mediaStatus === MEDIA.UNKNOWN || mediaStatus === MEDIA.DELETED;
  }
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
  function getDisplayInfo(mediaStatus, hasActiveDownloads = false) {
    switch (mediaStatus) {
      case MEDIA.PENDING:
      case MEDIA.PROCESSING:
        return { labelKey: hasActiveDownloads ? "jellyseerr_season_status_processing" : "jellyseerr_season_status_requested", cssClass: "processing" };
      case MEDIA.PARTIALLY_AVAILABLE:
        return { labelKey: "jellyseerr_season_status_partial", cssClass: "partially-available" };
      case MEDIA.AVAILABLE:
        return { labelKey: "jellyseerr_season_status_available", cssClass: "available" };
      case MEDIA.BLOCKED:
        return { labelKey: "jellyseerr_status_blocked", cssClass: "blocked" };
      default:
        return { labelKey: "jellyseerr_season_status_not_requested", cssClass: "not-requested" };
    }
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
  function hashQuery(location) {
    const query = location.hash.split("?")[1];
    return new URLSearchParams(query).get("query");
  }

  // client/src/features/seerr/core/ui/season-modal.ts
  var isValidDate = (value) => isString(value) && /^\d{4}-\d{2}-\d{2}/.test(value);
  function readManualTvdbId(root) {
    const input = root.querySelector("#jellyseerr-tvdb-id");
    const raw = String(input instanceof HTMLInputElement ? input.value : "").trim();
    if (!/^\d+$/.test(raw)) return null;
    const id = parseInt(raw, 10);
    return id > 0 && id <= 2147483647 ? id : null;
  }
  function seasonDisplayName(season, t) {
    const trimmed = (season.name || "").trim();
    const numericOnly = trimmed === String(season.seasonNumber) || /^0*\d+$/.test(trimmed);
    if (trimmed && !numericOnly) return trimmed;
    return season.seasonNumber === 0 ? t("jellyseerr_season_specials") : t("jellyseerr_season_name", { number: season.seasonNumber });
  }
  function installSeasonModal(host) {
    const { JE, document: document2, window: window2 } = host;
    if (!firstInstall(JE, "ui-season-modal")) return;
    const ui = JE.jellyseerrUI || (JE.jellyseerrUI = {});
    const internals = groupInternals(JE);
    const escapeHtml = escapeWith(JE);
    let refreshModalInterval;
    const stopPolling = () => {
      if (refreshModalInterval !== void 0) window2.clearInterval(refreshModalInterval);
      refreshModalInterval = void 0;
    };
    function updateSeasonList(seasonListElement, value, partialRequestsEnabled = true, enableSpecialEpisodes = false, is4kMode = false, jellyfinSeasonMap = null) {
      const details = isTvView(value) ? value : decodeTvDetails(value);
      if (!seasonListElement || !details) return;
      const showJellyfinId = is4kMode ? details.mediaInfo?.jellyfinMediaId4k || null : details.mediaInfo?.jellyfinMediaId || null;
      const statusBySeason = /* @__PURE__ */ new Map();
      for (const season of details.mediaInfo?.seasons || []) {
        const status = is4kMode ? season.status4k : season.status;
        if (status !== void 0 && status !== null && isNumber(season.seasonNumber)) statusBySeason.set(
          season.seasonNumber,
          effectiveMediaStatus(status, showJellyfinId, jellyfinSeasonMap, season.seasonNumber)
        );
      }
      for (const request of details.mediaInfo?.requests || []) {
        if (!!request.is4k !== !!is4kMode) continue;
        for (const season of request.seasons || []) {
          if (!isNumber(season.seasonNumber)) continue;
          const active = season.status === REQUEST.PENDING ? MEDIA.PENDING : season.status === REQUEST.APPROVED ? MEDIA.PROCESSING : null;
          const media = statusBySeason.get(season.seasonNumber);
          if (active !== null && (isRequestable(media) || media === MEDIA.PENDING && active === MEDIA.PROCESSING)) {
            statusBySeason.set(season.seasonNumber, active);
          }
        }
      }
      const seasons = details.seasons.filter((s) => !!s.episodeCount && s.episodeCount > 0).filter((s) => s.seasonNumber !== 0 || enableSpecialEpisodes).slice().sort((a, b) => (a.seasonNumber || 0) - (b.seasonNumber || 0));
      const downloads = (is4kMode ? details.mediaInfo?.downloadStatus4k : details.mediaInfo?.downloadStatus) || [];
      for (const season of seasons) {
        const seasonNumber = season.seasonNumber;
        let item = seasonListElement.querySelector(`.jellyseerr-season-item[data-season-number="${seasonNumber}"]`);
        if (!(item instanceof HTMLElement)) {
          const created = document2.createElement("div");
          created.className = "jellyseerr-season-item";
          created.dataset.seasonNumber = String(seasonNumber);
          seasonListElement.appendChild(created);
          item = created;
        }
        const seasonItem = item;
        const effective = statusBySeason.get(seasonNumber) ?? MEDIA.UNKNOWN;
        const canRequest = isRequestable(effective);
        const seasonDownloads = downloads.filter((download) => download.episode?.seasonNumber === seasonNumber);
        const { labelKey, cssClass } = getDisplayInfo(effective, seasonDownloads.length > 0);
        const existing = seasonItem.querySelector(".jellyseerr-season-checkbox");
        const wasChecked = existing instanceof HTMLInputElement ? existing.checked : false;
        const disabled = !partialRequestsEnabled || !canRequest;
        const episodes = season.episodeCount || 0;
        seasonItem.innerHTML = `
                <input type="checkbox" class="jellyseerr-season-checkbox" data-season-number="${escapeHtml(seasonNumber)}" ${disabled ? "disabled" : ""} style="${!partialRequestsEnabled ? "cursor: not-allowed;" : ""}">
                <div class="jellyseerr-season-info">
                    <div class="jellyseerr-season-name">${escapeHtml(seasonDisplayName(season, JE.t))}</div>
                    <div class="jellyseerr-season-meta">${escapeHtml((season.airDate || season.jeYear || "").substring(0, 4))}<span class="jellyseerr-meta-eps"> &middot; ${escapeHtml(episodes)} ep</span></div>
                </div>
                <div class="jellyseerr-season-episodes">${escapeHtml(episodes)} ep</div>
                <div class="jellyseerr-season-status jellyseerr-season-status-${escapeHtml(cssClass)}">${escapeHtml(JE.t(labelKey))}</div>
            `;
        if (existing instanceof HTMLInputElement) {
          const checkbox = seasonItem.querySelector(".jellyseerr-season-checkbox");
          if (checkbox instanceof HTMLInputElement) checkbox.checked = wasChecked && !disabled;
        }
        seasonItem.classList.toggle("disabled", !canRequest);
        seasonItem.querySelector(".jellyseerr-inline-progress")?.remove();
        if (seasonDownloads.length > 0) {
          const size = seasonDownloads.reduce((sum, d) => sum + (d.size || 0), 0);
          const sizeLeft = seasonDownloads.reduce((sum, d) => sum + (d.sizeLeft || 0), 0);
          if (size > 0) {
            const progress = internals.createInlineProgress?.({ size, sizeLeft, status: `${seasonDownloads.length} episode(s) downloading` });
            if (progress) seasonItem.appendChild(progress);
          }
        }
      }
    }
    function isTvView(value) {
      return isRecord(value) && Array.isArray(value.seasons) && "externalTvdbId" in value && "mediaInfo" in value;
    }
    function buildTvdbMatchHTML() {
      return `
            <div class="jellyseerr-tvdb-match">
                <div class="jellyseerr-tvdb-match-notice">${JE.t("jellyseerr_tvdb_match_notice")}</div>
                <div class="jellyseerr-tvdb-match-results"><div class="jellyseerr-tvdb-match-hint">${JE.t("jellyseerr_tvdb_match_searching")}</div></div>
                <div class="jellyseerr-form-group">
                    <label for="jellyseerr-tvdb-id">${JE.t("jellyseerr_tvdb_id_label")}</label>
                    <input type="number" id="jellyseerr-tvdb-id" inputmode="numeric" min="1" step="1" autocomplete="off" placeholder="${escapeHtml(JE.t("jellyseerr_tvdb_id_placeholder"))}">
                </div>
            </div>`;
    }
    async function populateTvdbMatches(modalEl, tmdbId) {
      const resultsEl = modalEl.querySelector(".jellyseerr-tvdb-match-results");
      const input = modalEl.querySelector("#jellyseerr-tvdb-id");
      const api = JE.jellyseerrAPI;
      if (!(resultsEl instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !api) return;
      let candidates = [];
      let hintKey = "jellyseerr_tvdb_match_none";
      try {
        candidates = (await api.fetchSonarrLookup(tmdbId)).filter((c) => Number.isInteger(c.tvdbId) && c.tvdbId > 0).slice(0, 6);
      } catch (error) {
        if (errorStatus(error) !== 404) {
          hintKey = "jellyseerr_tvdb_match_failed";
          console.warn(`${LOG_UI} Sonarr lookup failed for TMDB ID ${tmdbId}:`, error);
        }
      }
      if (!document2.body.contains(modalEl)) return;
      if (candidates.length === 0) {
        resultsEl.innerHTML = `<div class="jellyseerr-tvdb-match-hint">${JE.t(hintKey)}</div>`;
        return;
      }
      const fallbackPoster = JE.cdn?.url?.("ibb", "fdbkXQdP/jellyseerr-poster-not-found.png") ?? "";
      resultsEl.innerHTML = candidates.map((c) => {
        const poster = /^https?:\/\//i.test(c.remotePoster || "") && c.remotePoster ? c.remotePoster : fallbackPoster;
        const year = c.year ?? "";
        return `
                <button type="button" class="jellyseerr-tvdb-match-row" data-tvdb-id="${escapeHtml(c.tvdbId)}">
                    <img src="${escapeHtml(poster)}" alt="" loading="lazy">
                    <div>
                        <div class="title">${escapeHtml(c.title || "")}</div>
                        <div class="meta">${escapeHtml(year)}${year ? " · " : ""}TVDB ${escapeHtml(c.tvdbId)}</div>
                        ${c.overview ? `<div class="overview">${escapeHtml(c.overview)}</div>` : ""}
                    </div>
                </button>`;
      }).join("");
      for (const img of resultsEl.querySelectorAll("img")) {
        img.addEventListener("error", () => {
          if (img.getAttribute("src") !== fallbackPoster) img.src = fallbackPoster;
        }, { once: true });
      }
      const syncSelection = () => {
        const current = String(input.value || "").trim();
        for (const row of resultsEl.querySelectorAll(".jellyseerr-tvdb-match-row")) row.classList.toggle("selected", row.dataset.tvdbId === current);
      };
      resultsEl.addEventListener("click", (event) => {
        const row = event.target instanceof Element ? event.target.closest(".jellyseerr-tvdb-match-row") : null;
        if (!(row instanceof HTMLElement)) return;
        input.value = row.dataset.tvdbId || "";
        syncSelection();
      });
      input.addEventListener("input", syncSelection);
      syncSelection();
    }
    async function jellyfinSeasons(seriesId) {
      const client = host.apiClient();
      const userId = client?.getCurrentUserId?.();
      if (!client?.ajax || !isString(userId) || !userId) return null;
      try {
        const response = await client.ajax({
          type: "GET",
          url: client.getUrl(`/Users/${userId}/Items`, { ParentId: seriesId, IncludeItemTypes: "Season", Recursive: false, Fields: "IndexNumber" }),
          dataType: "json"
        });
        const map = {};
        const items = isRecord(response) && Array.isArray(response.Items) ? response.Items : [];
        for (const season of items) {
          const index = isRecord(season) ? Number(season.IndexNumber) : NaN;
          if (Number.isFinite(index) && index >= 0) map[index] = true;
        }
        return map;
      } catch {
        return null;
      }
    }
    async function showSeasonSelectionModal(tmdbId, mediaType, showTitle, searchResultItem = null, is4k = false) {
      if (mediaType !== "tv") return;
      stopPolling();
      const modal = JE.jellyseerrModal;
      const api = JE.jellyseerrAPI;
      if (!modal || !api) return;
      const origin = captureOrigin(host);
      let partialRequestsEnabled = false;
      let enableSpecialEpisodes = false;
      try {
        const settings = await api.fetchRequestSettings();
        partialRequestsEnabled = settings.partialRequestsEnabled;
        enableSpecialEpisodes = settings.enableSpecialEpisodes;
      } catch {
      }
      const singleSeasonOnly = partialRequestsEnabled && JE.pluginConfig?.JellyseerrSingleSeasonRequestOnly === true;
      const rawDetails = await api.fetchTvShowDetails(tmdbId, { skipCache: true });
      const tvDetails = decodeTvDetails(rawDetails);
      if (!origin.current()) return;
      if (!tvDetails) {
        JE.toast?.(JE.t("jellyseerr_toast_no_season_info"), 4e3);
        return;
      }
      const seriesId = (is4k ? tvDetails.mediaInfo?.jellyfinMediaId4k : tvDetails.mediaInfo?.jellyfinMediaId) || null;
      const jellyfinSeasonMap = seriesId ? await jellyfinSeasons(seriesId) : null;
      if (!origin.current()) return;
      const normalizedTitle = String(showTitle || "").trim();
      const genericTitle = ["this show", "this movie", "this collection"].includes(normalizedTitle.toLowerCase());
      const fromItem = (key) => isRecord(searchResultItem) && isString(searchResultItem[key]) && searchResultItem[key] ? String(searchResultItem[key]) : null;
      const resolvedShowTitle = !genericTitle && normalizedTitle || tvDetails.name || tvDetails.title || fromItem("name") || fromItem("title") || fromItem("originalName") || fromItem("originalTitle") || normalizedTitle || "Unknown Show";
      const showAdvanced = api.shouldShowAdvanced();
      const storedTvdbId = isNumber(tvDetails.mediaInfo?.tvdbId) && Number.isInteger(tvDetails.mediaInfo.tvdbId) && tvDetails.mediaInfo.tvdbId > 0 ? tvDetails.mediaInfo.tvdbId : null;
      const needsTvdbMatch = !tvDetails.externalTvdbId && !storedTvdbId;
      const resetLabel = () => is4k ? JE.t("jellyseerr_btn_request_4k") || "Request in 4K" : partialRequestsEnabled ? JE.t("jellyseerr_modal_request_selected") : JE.t("jellyseerr_modal_request");
      const bodyHtml = `${needsTvdbMatch ? buildTvdbMatchHTML() : ""}<div class="jellyseerr-season-list">
            ${partialRequestsEnabled && !singleSeasonOnly ? '<div class="jellyseerr-season-header-row"><input type="checkbox" class="jellyseerr-season-checkbox" id="jellyseerr-select-all-seasons"><label class="jellyseerr-season-header-label" for="jellyseerr-select-all-seasons">' + JE.t("jellyseerr_select_all_seasons") + "</label><div></div><div></div></div>" : ""}
        </div>${showAdvanced ? modal.createAdvancedOptionsHTML("tv") : ""}`;
      let latestDetails = tvDetails;
      const instance = modal.create({
        title: is4k ? `${JE.t("jellyseerr_modal_title")} - 4K` : JE.t("jellyseerr_modal_title"),
        subtitle: resolvedShowTitle,
        bodyHtml,
        backdropPath: tvDetails.backdropPath,
        buttonText: is4k ? JE.t("jellyseerr_btn_request_4k") || "Request in 4K" : void 0,
        onClose: stopPolling,
        onSave: async (modalEl, requestBtn, closeFn) => {
          if (!origin.current()) {
            closeFn();
            return;
          }
          requestBtn.disabled = true;
          requestBtn.innerHTML = `${JE.t("jellyseerr_modal_requesting")}<span class="jellyseerr-button-spinner"></span>`;
          const restore = () => {
            requestBtn.disabled = false;
            requestBtn.textContent = resetLabel();
          };
          let manualTvdbId = tvDetails.externalTvdbId ? null : storedTvdbId;
          if (needsTvdbMatch) {
            manualTvdbId = readManualTvdbId(modalEl);
            if (!manualTvdbId) {
              JE.toast?.(JE.t("jellyseerr_modal_toast_tvdb_required"), 4e3);
              restore();
              const input = modalEl.querySelector("#jellyseerr-tvdb-id");
              if (input instanceof HTMLElement) input.focus();
              return;
            }
          }
          let settings = {};
          if (showAdvanced) {
            const value = (id) => {
              const el = modalEl.querySelector(`#${id}`);
              return el instanceof HTMLSelectElement ? el.value : "";
            };
            const server = value("tv-server");
            const quality = value("tv-quality");
            const folder = value("tv-folder");
            if (!server || !quality || !folder) {
              JE.toast?.(JE.t("jellyseerr_modal_toast_options_missing"), 3e3);
              restore();
              return;
            }
            settings = { serverId: parseInt(server, 10), profileId: parseInt(quality, 10), rootFolder: folder, tags: [] };
          }
          try {
            if (partialRequestsEnabled) {
              const selected = Array.from(modalEl.querySelectorAll(".jellyseerr-season-item .jellyseerr-season-checkbox:checked:not(:disabled)")).map((checkbox) => parseInt(checkbox.dataset.seasonNumber || "", 10));
              if (selected.length === 0) {
                JE.toast?.(JE.t("jellyseerr_modal_toast_select_season"), 3e3);
                requestBtn.disabled = false;
                requestBtn.textContent = is4k ? JE.t("jellyseerr_btn_request_4k") || "Request in 4K" : JE.t("jellyseerr_modal_request_selected");
                return;
              }
              await api.requestTvSeasons(tmdbId, [...new Set(selected)], settings, searchResultItem, is4k, manualTvdbId);
              if (!origin.current()) {
                closeFn();
                return;
              }
              JE.toast?.(JE.t("jellyseerr_modal_toast_request_success", { count: new Set(selected).size, title: resolvedShowTitle }), 4e3);
            } else {
              const all = tvDetails.seasons.map((s) => s.seasonNumber).filter((n) => Number.isFinite(n) && n > 0);
              if (all.length > 0) await api.requestTvSeasons(tmdbId, all, settings, searchResultItem, is4k, manualTvdbId);
              else await api.requestMedia(tmdbId, "tv", settings, is4k, searchResultItem, manualTvdbId);
              if (!origin.current()) {
                closeFn();
                return;
              }
              JE.toast?.(JE.t("jellyseerr_modal_toast_request_success", { count: "all", title: resolvedShowTitle }), 4e3);
            }
            host.document.dispatchEvent(new CustomEvent("jellyseerr-tv-requested", { detail: { tmdbId, mediaType: "tv", is4k } }));
            host.document.dispatchEvent(new CustomEvent("jellyseerr-media-requested", { detail: { tmdbId, mediaType: "tv", is4k } }));
            internals.markCardRequested?.(String(tmdbId), "tv", is4k);
            closeFn();
            const query = hashQuery(window2.location);
            window2.setTimeout(() => {
              if (query && origin.current()) void JE.jellyseerr?.fetchAndRenderResults(query, { skipCache: true });
            }, 1e3);
          } catch (error) {
            if (!origin.current() || classifyFailure(error, true) === "not-sent") {
              closeFn();
              return;
            }
            await internals.handleRequestError?.(error, "tv", requestBtn, resetLabel());
          }
        }
      });
      const seasonList = instance.modalElement.querySelector(".jellyseerr-season-list");
      updateSeasonList(seasonList, tvDetails, partialRequestsEnabled, enableSpecialEpisodes, is4k, jellyfinSeasonMap);
      instance.show();
      if (needsTvdbMatch) void populateTvdbMatches(instance.modalElement, tmdbId);
      const body = instance.modalElement.querySelector(".jellyseerr-modal-body");
      if (body) {
        api.fetchUserQuota().then((quota) => {
          const chip = internals.buildQuotaChip?.(quota, "tv") ?? null;
          if (chip && document2.body.contains(instance.modalElement)) body.insertBefore(chip, body.firstChild);
        }).catch((error) => console.warn(`${LOG_UI} Quota chip render failed:`, error));
      }
      const airDateCache = /* @__PURE__ */ new Map();
      const seasonNameCache = /* @__PURE__ */ new Map();
      const applyBackfill = (details) => ({
        ...details,
        seasons: details.seasons.map((s) => ({
          ...s,
          airDate: s.airDate || airDateCache.get(s.seasonNumber) || null,
          // Only while protected: without a guard the details carry the real name.
          name: details.jeSpoilerGuard && seasonNameCache.get(s.seasonNumber) || s.name || null
        }))
      });
      const render = (details) => {
        if (!origin.current() || !seasonList?.isConnected) return;
        updateSeasonList(seasonList, applyBackfill(details), partialRequestsEnabled, enableSpecialEpisodes, is4k, jellyfinSeasonMap);
      };
      const followUp = api.followUpOptions(rawDetails);
      const needingDates = tvDetails.seasons.filter((s) => (s.episodeCount ?? 0) > 0 && (!s.airDate && !s.jeYear || tvDetails.jeSpoilerGuard && s.seasonNumber > 1));
      if (needingDates.length > 0) {
        const seasonFetches = needingDates.map((season) => api.fetchTvSeasonDetails(tmdbId, season.seasonNumber, followUp).then((detail) => {
          const first = isRecord(detail) && Array.isArray(detail.episodes) ? detail.episodes[0] : void 0;
          const date = isRecord(first) ? isValidDate(first.airDate) ? first.airDate : isString(first.jeYear) ? first.jeYear : null : null;
          if (date) airDateCache.set(season.seasonNumber, date);
          if (tvDetails.jeSpoilerGuard && isRecord(detail) && isString(detail.name) && detail.name) seasonNameCache.set(season.seasonNumber, detail.name);
        }).catch(() => void 0));
        const tmdbFetch = JE.pluginConfig?.TmdbEnabled ? api.fetchTmdbTvDetails(tmdbId, followUp).then((tmdb) => {
          if (!isRecord(tmdb) || !Array.isArray(tmdb.seasons)) return;
          for (const s of tmdb.seasons) {
            if (!isRecord(s) || !isNumber(s.season_number)) continue;
            const date = isValidDate(s.air_date) ? s.air_date : isString(s.jeYear) ? s.jeYear : null;
            if (date && !airDateCache.has(s.season_number)) airDateCache.set(s.season_number, date);
          }
        }).catch(() => void 0) : Promise.resolve();
        void Promise.all([...seasonFetches, tmdbFetch]).then(() => render(latestDetails));
      }
      if (singleSeasonOnly && seasonList) {
        seasonList.addEventListener("change", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement) || !target.classList.contains("jellyseerr-season-checkbox") || !target.checked) return;
          for (const box of seasonList.querySelectorAll(".jellyseerr-season-checkbox:checked")) if (box !== target) box.checked = false;
        });
      }
      let updateSelectAllState = null;
      const selectAll = instance.modalElement.querySelector("#jellyseerr-select-all-seasons");
      if (partialRequestsEnabled && seasonList && selectAll instanceof HTMLInputElement) {
        const regular = '.jellyseerr-season-item:not([data-season-number="0"]) .jellyseerr-season-checkbox:not(:disabled)';
        const update = () => {
          const all = seasonList.querySelectorAll(regular).length;
          const checked = seasonList.querySelectorAll(`${regular}:checked`).length;
          selectAll.checked = checked > 0 && checked === all;
          selectAll.indeterminate = checked > 0 && checked < all;
        };
        selectAll.addEventListener("change", () => {
          for (const box of seasonList.querySelectorAll(regular)) box.checked = selectAll.checked;
        });
        seasonList.addEventListener("change", (event) => {
          const target = event.target;
          if (target instanceof HTMLElement && target.classList.contains("jellyseerr-season-checkbox") && target.id !== "jellyseerr-select-all-seasons") update();
        });
        update();
        updateSelectAllState = update;
      }
      refreshModalInterval = window2.setInterval(async () => {
        if (!origin.current()) {
          stopPolling();
          instance.close?.();
          return;
        }
        const fresh = decodeTvDetails(await api.fetchTvShowDetails(tmdbId, { skipCache: true }));
        if (!fresh || !origin.current()) return;
        latestDetails = fresh;
        render(fresh);
        updateSelectAllState?.();
      }, 1e4);
      if (showAdvanced) {
        try {
          const data = await api.fetchAdvancedRequestData("tv");
          if (origin.current()) modal.populateAdvancedOptions(instance.modalElement, data, "tv", is4k);
        } catch (error) {
          console.error(`${LOG_UI} Failed to load TV advanced options:`, error);
          JE.toast?.(JE.t("jellyseerr_err_load_server_options"), 3e3);
        }
      }
    }
    ui.showSeasonSelectionModal = showSeasonSelectionModal;
    internals.updateSeasonList = updateSeasonList;
  }

  // client/src/features/seerr/core/ui/season-modal-entry.ts
  installSeasonModal(seerrCoreHost());
})();
})();
//# sourceMappingURL=ui-season-modal.js.map
