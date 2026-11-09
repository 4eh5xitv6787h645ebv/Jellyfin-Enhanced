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
  function decodeProfiles(value) {
    return Array.isArray(value) ? value.filter((entry) => matches(entry, profileChecks)) : [];
  }
  function decodeFolders(value) {
    return Array.isArray(value) ? value.filter((entry) => matches(entry, folderChecks)) : [];
  }
  var serviceChecks = {
    id: isNumber,
    name: nullable(isString),
    isDefault: nullable(isBoolean),
    is4k: nullable(isBoolean),
    activeProfileId: nullable(isNumber),
    activeDirectory: nullable(isString)
  };
  var isServiceListing = (value) => matches(value, serviceChecks);
  function decodeAdvancedData(value) {
    if (!isRecord(value) || !Array.isArray(value.servers)) return { servers: [], tags: [] };
    const servers = [];
    for (const entry of value.servers) {
      if (!isServiceListing(entry)) continue;
      servers.push({ ...entry, qualityProfiles: decodeProfiles(entry.qualityProfiles), rootFolders: decodeFolders(entry.rootFolders) });
    }
    return { servers, tags: Array.isArray(value.tags) ? value.tags.filter(isNumber) : [] };
  }
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

  // client/src/features/seerr/core/modal.ts
  var LOG = "🪼 Jellyfin Enhanced: Jellyseerr Modal:";
  var FOCUSABLE_TRAP = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var FOCUSABLE_FIRST = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]';
  var TV_BACK_KEYS = ["Escape", "BrowserBack", "GoBack"];
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i] ?? "Bytes"}`;
  }
  function formatFolderLabel(folder) {
    return typeof folder.freeSpace === "number" ? `${folder.path} (${formatBytes(folder.freeSpace)})` : folder.path;
  }
  function installModal(host) {
    const { JE, document: document2, window: window2 } = host;
    if (!firstInstall(JE, "modal")) return;
    const escapeHtml = escapeWith(JE);
    const historyKey = "jeSeerrModal";
    let nextModal = 0;
    const retiredEntries = /* @__PURE__ */ new Map();
    const historyToken = () => {
      const state = window2.history.state;
      return isRecord(state) && typeof state[historyKey] === "string" ? state[historyKey] : null;
    };
    window2.addEventListener("popstate", () => {
      const token = historyToken();
      if (token && retiredEntries.get(token) === window2.location.href) {
        retiredEntries.delete(token);
        window2.history.back();
      }
    });
    function enableTvSelectPicker(modalElement, bodyEl) {
      let picker = null;
      let owner = null;
      const closePicker = (restoreFocus = true) => {
        if (!picker) return;
        document2.removeEventListener("keydown", onPickerKey, true);
        picker.remove();
        picker = null;
        if (restoreFocus) owner?.focus();
        owner = null;
      };
      function onPickerKey(event) {
        if (!TV_BACK_KEYS.includes(event.key) && event.keyCode !== 10009 && event.keyCode !== 461) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closePicker();
      }
      const openPicker = (select) => {
        closePicker();
        owner = select;
        const list = document2.createElement("div");
        list.className = "jellyseerr-tv-picker";
        list.setAttribute("role", "listbox");
        for (const option of Array.from(select.options)) {
          const item = document2.createElement("button");
          item.type = "button";
          item.className = "jellyseerr-tv-picker-option focusable";
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", String(option.value === select.value));
          item.textContent = option.textContent;
          item.addEventListener("click", () => {
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            closePicker();
          });
          list.appendChild(item);
        }
        picker = list;
        select.insertAdjacentElement("afterend", list);
        document2.addEventListener("keydown", onPickerKey, true);
        const selected = list.querySelector('[aria-selected="true"]') || list.firstElementChild;
        if (selected instanceof HTMLElement) selected.focus();
      };
      const intercept = (event) => {
        const select = event.target instanceof Element ? event.target.closest("select") : null;
        if (!select || !bodyEl.contains(select)) return;
        if (event.type === "keydown" && (!(event instanceof KeyboardEvent) || event.key !== "Enter")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type !== "mousedown") openPicker(select);
      };
      for (const type of ["mousedown", "click", "keydown"]) modalElement.addEventListener(type, intercept, true);
      return () => {
        document2.removeEventListener("keydown", onPickerKey, true);
        for (const type of ["mousedown", "click", "keydown"]) modalElement.removeEventListener(type, intercept, true);
        closePicker(false);
      };
    }
    function create(options) {
      const { title, subtitle, bodyHtml, backdropPath, backdropUrl, onSave, onClose, buttonText } = options;
      const modalElement = document2.createElement("div");
      modalElement.className = "jellyseerr-season-modal";
      modalElement.setAttribute("role", "dialog");
      modalElement.setAttribute("aria-modal", "true");
      modalElement.setAttribute("tabindex", "-1");
      let backdropImage;
      if (backdropUrl) backdropImage = `url('${escapeHtml(backdropUrl)}')`;
      else if (backdropPath && isSafeTmdbImagePath(backdropPath)) backdropImage = `url('https://image.tmdb.org/t/p/w1280${escapeHtml(backdropPath)}')`;
      else backdropImage = "linear-gradient(45deg, #3b82f6, #8b5cf6)";
      const contentEl = document2.createElement("div");
      contentEl.className = "jellyseerr-season-content";
      contentEl.setAttribute("role", "document");
      contentEl.setAttribute("aria-labelledby", "jellyseerr-modal-title");
      const headerEl = document2.createElement("div");
      headerEl.className = "jellyseerr-season-header";
      headerEl.style.cssText = `background-image: ${backdropImage}; background-size: cover; background-position: center;`;
      const titleEl = document2.createElement("div");
      titleEl.id = "jellyseerr-modal-title";
      titleEl.className = "jellyseerr-season-title";
      titleEl.textContent = title;
      const subtitleEl = document2.createElement("div");
      subtitleEl.className = "jellyseerr-season-subtitle";
      subtitleEl.textContent = subtitle;
      headerEl.append(titleEl, subtitleEl);
      const bodyEl = document2.createElement("div");
      bodyEl.className = "jellyseerr-modal-body";
      bodyEl.style.cssText = "padding: 24px; max-height: calc(80vh - 200px); overflow-y: auto;";
      bodyEl.innerHTML = bodyHtml;
      const footerEl = document2.createElement("div");
      footerEl.className = "jellyseerr-modal-footer";
      const cancelBtn = document2.createElement("button");
      cancelBtn.className = "jellyseerr-modal-button jellyseerr-modal-button-secondary";
      cancelBtn.setAttribute("aria-label", JE.t("jellyseerr_modal_cancel"));
      cancelBtn.textContent = JE.t("jellyseerr_modal_cancel");
      const primaryBtn = document2.createElement("button");
      primaryBtn.className = "jellyseerr-modal-button jellyseerr-modal-button-primary";
      const primaryLabel = buttonText || JE.t("jellyseerr_modal_request");
      primaryBtn.setAttribute("aria-label", primaryLabel);
      primaryBtn.textContent = primaryLabel;
      footerEl.append(cancelBtn, primaryBtn);
      contentEl.append(headerEl, bodyEl, footerEl);
      modalElement.appendChild(contentEl);
      const handleKeydown = (event) => {
        if (!ownsHistory()) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(modalElement.querySelectorAll(FOCUSABLE_TRAP));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey) {
          if (document2.activeElement === first || document2.activeElement === modalElement) {
            event.preventDefault();
            last.focus();
          }
        } else if (document2.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      const disposePicker = JE.core?.ui?.isTvLayout?.() ? enableTvSelectPicker(modalElement, bodyEl) : () => {
      };
      let isClosing = false;
      let shown = false;
      const token = String(Date.now()) + ":" + String(++nextModal);
      let openedUrl = "";
      const ownsHistory = () => shown && historyToken() === token && window2.location.href === openedUrl;
      const dismiss = (restoreHistory) => {
        if (isClosing) return;
        isClosing = true;
        disposePicker();
        if (typeof onClose === "function") {
          try {
            onClose();
          } catch (error) {
            console.error(LOG + " onClose handler failed:", error);
          }
        }
        window2.removeEventListener("popstate", onHistoryChange);
        document2.removeEventListener("keydown", handleKeydown);
        modalElement.classList.remove("show");
        modalElement.setAttribute("aria-hidden", "true");
        if (!document2.querySelector('.jellyseerr-season-modal:not([aria-hidden="true"])')) {
          document2.body.classList.remove("jellyseerr-modal-is-open");
        }
        window2.setTimeout(() => modalElement.remove(), 300);
        if (restoreHistory && shown) {
          if (ownsHistory()) window2.history.back();
          else retiredEntries.set(token, openedUrl);
        }
      };
      const close = () => dismiss(true);
      const onHistoryChange = (event) => {
        const state = event.state;
        if (!isRecord(state) || state[historyKey] !== token || !ownsHistory()) dismiss(false);
      };
      const show = () => {
        if (shown || isClosing) return;
        shown = true;
        openedUrl = window2.location.href;
        document2.body.appendChild(modalElement);
        document2.body.classList.add("jellyseerr-modal-is-open");
        const previous = window2.history.state;
        window2.history.pushState({ ...isRecord(previous) ? previous : {}, [historyKey]: token }, "", openedUrl);
        window2.addEventListener("popstate", onHistoryChange);
        document2.addEventListener("keydown", handleKeydown);
        window2.setTimeout(() => {
          if (isClosing || !modalElement.isConnected) return;
          modalElement.classList.add("show");
          const first = modalElement.querySelector(FOCUSABLE_FIRST);
          if (first instanceof HTMLElement) first.focus();
          else modalElement.focus();
        }, 10);
      };
      cancelBtn.addEventListener("click", close);
      modalElement.addEventListener("click", (event) => {
        if (event.target === modalElement) close();
      });
      primaryBtn.addEventListener("click", () => {
        void onSave(modalElement, primaryBtn, close);
      });
      return { modalElement, show, close };
    }
    function createAdvancedOptionsHTML(idPrefix) {
      const id = escapeHtml(idPrefix);
      return `
            <div class="jellyseerr-advanced-options">
                <h3>${JE.t("jellyseerr_advanced_options")}</h3>
                <div class="jellyseerr-form-row">
                    <div class="jellyseerr-form-group">
                        <label for="${id}-server">${JE.t("jellyseerr_server_select")}</label>
                        <select is="emby-select" id="${id}-server" class="emby-select"></select>
                    </div>
                    <div class="jellyseerr-form-group">
                        <label for="${id}-quality">${JE.t("jellyseerr_quality_select")}</label>
                        <select is="emby-select" id="${id}-quality" class="emby-select"></select>
                    </div>
                </div>
                <div class="jellyseerr-form-row">
                    <div class="jellyseerr-form-group">
                        <label for="${id}-folder">${JE.t("jellyseerr_folder_select")}</label>
                        <select is="emby-select" id="${id}-folder" class="emby-select"></select>
                    </div>
                </div>
            </div>
        `;
    }
    function populateAdvancedOptions(modalElement, value, idPrefix, is4k) {
      const data = decodeAdvancedData(value);
      if (!/^[A-Za-z0-9_-]+$/.test(idPrefix)) return;
      let attempts = 0;
      const maxAttempts = 50;
      const interval = window2.setInterval(() => {
        const find = (suffix) => {
          const element = modalElement.querySelector(`#${idPrefix}-${suffix}`);
          return element instanceof HTMLSelectElement ? element : null;
        };
        const serverSelect = find("server");
        const qualitySelect = find("quality");
        const folderSelect = find("folder");
        if (!serverSelect || !qualitySelect || !folderSelect) {
          attempts++;
          if (attempts > maxAttempts) {
            window2.clearInterval(interval);
            console.error(`${LOG} Could not find advanced options elements in modal after ${maxAttempts} attempts.`);
          }
          return;
        }
        window2.clearInterval(interval);
        serverSelect.innerHTML = '<option value="">Select Server...</option>';
        qualitySelect.innerHTML = '<option value="">Select Quality...</option>';
        folderSelect.innerHTML = '<option value="">Select Folder...</option>';
        const sorted = [...data.servers].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        for (const server of sorted) {
          const option = document2.createElement("option");
          option.value = String(server.id);
          option.textContent = server.name || `Server ${server.id}`;
          if (server.isDefault && (is4k === void 0 || !!server.is4k === !!is4k)) option.selected = true;
          serverSelect.appendChild(option);
        }
        const updateServerDependentOptions = () => {
          const selected = data.servers.find((server) => String(server.id) === serverSelect.value);
          qualitySelect.innerHTML = '<option value="">Select Quality...</option>';
          folderSelect.innerHTML = '<option value="">Select Folder...</option>';
          if (!selected) return;
          for (const profile of selected.qualityProfiles) {
            const option = document2.createElement("option");
            option.value = String(profile.id);
            option.textContent = profile.name || `Profile ${profile.id}`;
            if (profile.id === selected.activeProfileId) option.selected = true;
            qualitySelect.appendChild(option);
          }
          for (const folder of selected.rootFolders) {
            const option = document2.createElement("option");
            option.value = folder.path;
            option.textContent = formatFolderLabel(folder);
            if (folder.path === selected.activeDirectory) option.selected = true;
            folderSelect.appendChild(option);
          }
        };
        serverSelect.addEventListener("change", updateServerDependentOptions);
        if (serverSelect.value) updateServerDependentOptions();
      }, 100);
    }
    const modal = { create, createAdvancedOptionsHTML, populateAdvancedOptions };
    JE.jellyseerrModal = modal;
  }

  // client/src/features/seerr/core/modal-entry.ts
  installModal(seerrCoreHost());
})();
})();
//# sourceMappingURL=modal.js.map
