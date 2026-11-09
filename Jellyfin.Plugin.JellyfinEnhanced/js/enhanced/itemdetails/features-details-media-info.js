(() => {
"use strict";
(() => {
  // client/src/host/context.ts
  function featureContext(feature, core, slots) {
    const shared = core.core?.featureContext;
    if (typeof shared !== "function") {
      throw new Error(`${feature}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);
    }
    return shared(feature, core, slots);
  }

  // client/src/features/details-providers/host.ts
  function hostWindow() {
    return window;
  }
  function bridge(feature) {
    const host = window;
    const JE2 = host.JellyfinEnhanced;
    if (!JE2) throw new Error(`${feature} loaded before Jellyfin Enhanced`);
    return JE2;
  }
  function api() {
    const client = hostWindow().ApiClient;
    if (!client) throw new Error("Jellyfin ApiClient unavailable");
    return client;
  }
  function currentUserId() {
    const id = hostWindow().ApiClient?.getCurrentUserId();
    return typeof id === "string" && id ? id : null;
  }
  function serverId() {
    const id = api().serverId();
    return typeof id === "string" ? id : "";
  }
  function dashboard() {
    return hostWindow().Dashboard;
  }
  function detailsContext(JE2) {
    const holder = JE2;
    return featureContext("details-providers", JE2, {
      internalSlots: ["features"],
      internalsObject: () => holder.internals ?? (holder.internals = {})
    });
  }

  // client/src/features/details-providers/wire.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function field(value, key) {
    return isRecord(value) ? value[key] : void 0;
  }
  function str(value) {
    return typeof value === "string" ? value : void 0;
  }
  function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function bool(value) {
    return typeof value === "boolean" ? value : void 0;
  }
  function list(value) {
    return Array.isArray(value) ? value : [];
  }
  function stringList(value) {
    return list(value).filter((entry) => typeof entry === "string");
  }
  function providerId(value) {
    if (typeof value === "string") return value || void 0;
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) return String(value);
    return void 0;
  }
  function decodeProviderIds(value) {
    const ids = {};
    if (!isRecord(value)) return ids;
    const tmdb = providerId(value.Tmdb), imdb = providerId(value.Imdb), tvdb = providerId(value.Tvdb);
    const aniList = providerId(value.AniList), anilist = providerId(value.Anilist);
    if (tmdb !== void 0) ids.Tmdb = tmdb;
    if (imdb !== void 0) ids.Imdb = imdb;
    if (tvdb !== void 0) ids.Tvdb = tvdb;
    if (aniList !== void 0) ids.AniList = aniList;
    if (anilist !== void 0) ids.Anilist = anilist;
    return ids;
  }
  function decodeStreams(value) {
    if (!Array.isArray(value)) return void 0;
    return value.filter(isRecord).map((stream) => {
      const result = {};
      const type = str(stream.Type), language = str(stream.Language);
      if (type !== void 0) result.Type = type;
      if (language !== void 0) result.Language = language;
      return result;
    });
  }
  function decodeSources(value) {
    if (!Array.isArray(value)) return void 0;
    return value.map((source) => {
      const result = {};
      const id = str(field(source, "Id")), streams = decodeStreams(field(source, "MediaStreams"));
      if (id !== void 0) result.Id = id;
      if (streams !== void 0) result.MediaStreams = streams;
      return result;
    });
  }
  function set(item, key, value) {
    if (value !== void 0) item[key] = value;
  }
  function decodeDetailsItem(value) {
    if (!isRecord(value)) return null;
    const item = { ProviderIds: decodeProviderIds(value.ProviderIds), SeriesProviderIds: decodeProviderIds(value.SeriesProviderIds) };
    set(item, "Id", str(value.Id));
    set(item, "Type", str(value.Type));
    set(item, "Name", str(value.Name));
    set(item, "SeriesId", str(value.SeriesId));
    set(item, "SeriesName", str(value.SeriesName));
    set(item, "IndexNumber", num(value.IndexNumber));
    set(item, "ParentIndexNumber", num(value.ParentIndexNumber));
    set(item, "PremiereDate", str(value.PremiereDate));
    set(item, "DisplayOrder", str(value.DisplayOrder));
    set(item, "MediaSources", decodeSources(value.MediaSources));
    set(item, "MediaStreams", decodeStreams(value.MediaStreams));
    set(item, "FirstEpisodeId", str(field(value.FirstEpisode, "Id")));
    if (Array.isArray(value.Tags)) item.Tags = stringList(value.Tags);
    const userData = value.UserData;
    set(item, "Played", bool(field(userData, "Played")));
    set(item, "UnplayedItemCount", num(field(userData, "UnplayedItemCount")));
    return item;
  }

  // client/src/features/details-providers/page.ts
  function lookupItem(helpers, itemId, withUser, userId = currentUserId()) {
    if (helpers?.getItemCached) {
      return withUser ? helpers.getItemCached(itemId, { userId }) : helpers.getItemCached(itemId);
    }
    return api().getItem(userId, itemId);
  }

  // client/src/features/details-providers/media-info-domain.ts
  function formatSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const formattedSize = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${formattedSize} ${sizes[i]}`;
  }
  function timeString(ticks, format) {
    const seconds = ticks / 1e7;
    const totalMinutes = Math.floor(seconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);
    const totalMonths = Math.floor(totalDays / 30);
    const totalYears = Math.floor(totalDays / 365);
    let result = "";
    if (format === "hours") {
      if (totalHours >= 1) {
        result += `${totalHours}h`;
        const minutes = totalMinutes % 60;
        if (minutes > 0) result += ` ${minutes}m`;
      } else if (totalMinutes > 0) {
        result = `${totalMinutes}m`;
      } else {
        result = "0m";
      }
    } else if (totalYears >= 1) {
      result += `${totalYears}y`;
      const months = Math.floor(totalDays % 365 / 30);
      if (months > 0) result += ` ${months}mo`;
    } else if (totalMonths >= 1) {
      result += `${totalMonths}mo`;
      const days = totalDays % 30;
      if (days > 0) result += ` ${days}d`;
    } else if (totalDays >= 1) {
      result += `${totalDays}d`;
      const hours = totalHours % 24;
      if (hours > 0) result += ` ${hours}h`;
    } else if (totalHours >= 1) {
      result += `${totalHours}h`;
      const minutes = totalMinutes % 60;
      if (minutes > 0) result += ` ${minutes}m`;
    } else if (totalMinutes > 0) {
      result = `${totalMinutes}m`;
    } else {
      result = "0m";
    }
    return result;
  }
  function watchProgressText(progress, mode, format) {
    const safeTotal = Math.max(0, progress.totalRuntimeTicks || 0);
    const safePlayed = Math.max(0, Math.min(safeTotal, progress.totalPlaybackTicks || 0));
    if (mode === "time") return `${timeString(safePlayed, format)} / ${timeString(safeTotal, format)}`;
    if (mode === "remaining") {
      const remaining = Math.max(0, safeTotal - safePlayed);
      return `-${timeString(remaining, format)} / ${timeString(safeTotal, format)}`;
    }
    return `${progress.progress}%`;
  }
  function nextWatchProgressMode(mode) {
    if (mode === "percentage") return "time";
    if (mode === "time") return "remaining";
    return "percentage";
  }
  function resolveWatchProgressMode(mode) {
    return mode === "time" || mode === "remaining" ? mode : "percentage";
  }
  function progressIconSvg(progress) {
    const circumference = 2 * Math.PI * 8;
    const offset = circumference - progress / 100 * circumference;
    if (progress >= 100) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" style="margin-right: 0.3em; display: inline-block; vertical-align: middle;">
                    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
                    <path d="M9.5 15.5l-3-3 1.4-1.4L9.5 12.7l5.6-5.6 1.4 1.4z" fill="currentColor"/>
                </svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" style="margin-right: 0.3em; display: inline-block; vertical-align: middle;">
                <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" opacity="0.2"/>
                <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"
                    style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset 0.3s ease;"/>
            </svg>`;
  }

  // client/src/features/details-providers/links.ts
  function tagListRoute(tag, serverId2) {
    return `list.html?type=tag&tag=${encodeURIComponent(tag)}&serverId=${serverId2}`;
  }
  function navigateRoute(route) {
    const host = dashboard();
    if (host && typeof host.navigate === "function") host.navigate(route);
    else window.location.hash = `!/${route}`;
  }

  // client/src/features/details-providers/media-info.ts
  var JE = bridge("Media info chips");
  var ctx = detailsContext(JE);
  var _a;
  var internal = (_a = ctx.own).features ?? (_a.features = {});
  var HOUR = 60 * 60 * 1e3;
  var WATCHPROGRESS_CACHE_TTL = HOUR;
  var FILESIZE_CACHE_TTL = HOUR;
  var LANGUAGE_CACHE_TTL = HOUR;
  var ITEMSTATS_CACHE_TTL = HOUR;
  var watchProgressCache = /* @__PURE__ */ new Map();
  var fileSizeCache = /* @__PURE__ */ new Map();
  var audioLanguageCache = /* @__PURE__ */ new Map();
  var itemStatsRequests = /* @__PURE__ */ new Map();
  var epochNow = () => JE.session ? JE.session.getEpoch() : 0;
  var isEpochCurrent = (epoch) => !JE.session || JE.session.isCurrent(epoch);
  JE.session?.onUserChange("details-media-info", () => {
    watchProgressCache.clear();
    fileSizeCache.clear();
    audioLanguageCache.clear();
    for (const entry of itemStatsRequests.values()) {
      if (entry.visit) entry.ctl?.abort();
    }
    itemStatsRequests.clear();
  });
  function decodeStats(value) {
    return {
      size: num(field(value, "size")) ?? 0,
      progress: num(field(value, "progress")) ?? 0,
      totalPlaybackTicks: num(field(value, "totalPlaybackTicks")) ?? 0,
      totalRuntimeTicks: num(field(value, "totalRuntimeTicks")) ?? 0
    };
  }
  function fetchItemStats(itemId, mediaSourceId, prefetchVisit = null) {
    const key = `${itemId}|${mediaSourceId || ""}`;
    const now = Date.now();
    const existing = itemStatsRequests.get(key);
    if (existing && now - existing.ts < ITEMSTATS_CACHE_TTL) {
      if (existing.prefetched && !prefetchVisit) {
        existing.visit = null;
        existing.ctl = null;
        const claimEpoch = epochNow();
        return existing.promise.catch((error) => {
          if (!isEpochCurrent(claimEpoch)) throw error;
          return fetchItemStats(itemId, mediaSourceId);
        });
      }
      return existing.promise;
    }
    const path = `/item-stats/${currentUserId()}/${itemId}${mediaSourceId ? `?mediaSourceId=${encodeURIComponent(mediaSourceId)}` : ""}`;
    const ctl = prefetchVisit ? new AbortController() : null;
    const plugin = JE.core?.api?.plugin;
    const promise = plugin ? plugin(path, ctl ? { skipRetry: true, signal: ctl.signal } : { skipRetry: true }) : api().ajax({ type: "GET", url: api().getUrl(`/JellyfinEnhanced${path}`), dataType: "json" });
    const entry = { promise, ts: now, prefetched: !!prefetchVisit, visit: prefetchVisit, ctl };
    itemStatsRequests.set(key, entry);
    promise.catch(() => {
      if (itemStatsRequests.get(key) === entry) itemStatsRequests.delete(key);
    });
    return promise;
  }
  function prefetchItemStats(itemId, mediaSourceId, { watchProgress, fileSize }, visit) {
    if (!JE.core?.api?.plugin) return;
    const now = Date.now();
    const progress = watchProgressCache.get(itemId);
    const size = fileSizeCache.get(`${itemId}|${mediaSourceId || ""}`);
    const needed = watchProgress && !(progress && now - progress.ts < WATCHPROGRESS_CACHE_TTL) || fileSize && !(size && now - size.ts < FILESIZE_CACHE_TTL);
    if (needed) fetchItemStats(itemId, mediaSourceId, visit).catch(() => {
    });
  }
  function discardItemStatsPrefetch(visit) {
    for (const [key, entry] of itemStatsRequests) {
      if (entry.visit !== visit) continue;
      entry.ctl?.abort();
      itemStatsRequests.delete(key);
    }
  }
  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  var LOADING_HTML = `<span class="material-icons" style="font-size: inherit; margin-right: 0.3em;">hourglass_empty</span> ...`;
  var timeFormat = () => JE.currentSettings?.watchProgressTimeFormat || "hours";
  function persistWatchProgressMode(mode) {
    const settings = JE.currentSettings ?? (JE.currentSettings = {});
    settings.watchProgressMode = mode;
    if (typeof JE.saveUserSettings === "function") JE.saveUserSettings("settings.json", settings);
  }
  async function displayWatchProgress(itemId, container, mediaSourceId = null) {
    if (container.classList.contains("hide")) container.classList.remove("hide");
    const existing = container.querySelector(".mediaInfoItem-watchProgress");
    if (existing) {
      if (existing.dataset.itemId === itemId) return;
      existing.remove();
    }
    const now = Date.now();
    const cached = watchProgressCache.get(itemId);
    const placeholder = document.createElement("div");
    placeholder.className = "mediaInfoItem mediaInfoItem-watchProgress";
    placeholder.dataset.itemId = itemId;
    placeholder.title = JE.t("watch_progress_tooltip");
    placeholder.style.display = "flex";
    placeholder.style.verticalAlign = "middle";
    placeholder.style.alignItems = "center";
    placeholder.style.margin = "0 1em 0 0 !important";
    placeholder.style.cursor = "pointer";
    placeholder.addEventListener("click", () => {
      const watchProgress = watchProgressCache.get(itemId);
      if (!watchProgress) return;
      const div = placeholder.querySelector(".mediaInfoItem-watchProgress-value");
      if (!div) return;
      const newMode = nextWatchProgressMode(div.dataset.type || "percentage");
      div.dataset.type = newMode;
      div.innerHTML = watchProgressText(watchProgress, newMode, timeFormat());
      persistWatchProgressMode(newMode);
    });
    placeholder.innerHTML = LOADING_HTML;
    container.appendChild(placeholder);
    const valueElement = (watchProgress) => {
      const valueDiv = document.createElement("div");
      valueDiv.className = "mediaInfoItem-watchProgress-value";
      const mode = resolveWatchProgressMode(JE.currentSettings?.watchProgressMode);
      valueDiv.dataset.type = mode;
      valueDiv.innerHTML = watchProgressText(watchProgress, mode, timeFormat());
      return valueDiv;
    };
    const render = (watchProgress) => {
      placeholder.innerHTML = progressIconSvg(watchProgress.progress);
      placeholder.appendChild(valueElement(watchProgress));
    };
    const renderUnavailable = () => render({ progress: 0, totalPlaybackTicks: 0, totalRuntimeTicks: 0 });
    const useCached = !!(cached && now - cached.ts < WATCHPROGRESS_CACHE_TTL);
    const statsPromise = useCached ? null : fetchItemStats(itemId, mediaSourceId);
    statsPromise?.catch(() => {
    });
    const performFetch = async () => {
      if (cached && useCached) {
        if (!cached.progress) {
          renderUnavailable();
          return;
        }
        render(cached);
        return;
      }
      const requestEpoch = epochNow();
      try {
        const stats = decodeStats(await statsPromise);
        await nextFrame();
        const watchProgress = {
          progress: stats.progress,
          totalPlaybackTicks: stats.totalPlaybackTicks,
          totalRuntimeTicks: stats.totalRuntimeTicks,
          ts: now
        };
        if (!isEpochCurrent(requestEpoch)) return;
        render(watchProgress);
        watchProgressCache.set(itemId, watchProgress);
      } catch (error) {
        console.error("🪼 Jellyfin Enhanced: Error fetching watch progress for ID %s:", itemId, error);
        if (!isEpochCurrent(requestEpoch)) return;
        renderUnavailable();
        watchProgressCache.set(itemId, { progress: 0, totalPlaybackTicks: 0, totalRuntimeTicks: 0, ts: now });
      }
    };
    void performFetch();
  }
  var SAVE_ICON = `<span class="material-icons" style="font-size: inherit; margin-right: 0.3em;">save</span>`;
  async function displayItemSize(itemId, container, mediaSourceId = null) {
    const requestEpoch = epochNow();
    const isCurrent = () => isEpochCurrent(requestEpoch);
    const cacheKey = `${itemId}|${mediaSourceId || ""}`;
    const existing = container.querySelector(".mediaInfoItem-fileSize");
    if (existing) {
      if (existing.dataset.itemId === itemId && existing.dataset.sourceId === (mediaSourceId || "")) return;
      existing.remove();
    }
    const now = Date.now();
    const cached = fileSizeCache.get(cacheKey);
    const placeholder = document.createElement("div");
    placeholder.className = "mediaInfoItem mediaInfoItem-fileSize";
    placeholder.dataset.itemId = itemId;
    placeholder.dataset.sourceId = mediaSourceId || "";
    placeholder.title = JE.t("file_size_tooltip");
    placeholder.style.display = "flex";
    placeholder.style.alignItems = "center";
    placeholder.style.margin = "0 1em 0 0 !important";
    placeholder.innerHTML = LOADING_HTML;
    container.appendChild(placeholder);
    const renderUnavailable = () => {
      placeholder.innerHTML = `${SAVE_ICON} -`;
    };
    const renderSize = (size) => {
      placeholder.style.verticalAlign = "middle";
      placeholder.innerHTML = `${SAVE_ICON}${formatSize(size)}`;
    };
    const useCached = !!(cached && now - cached.ts < FILESIZE_CACHE_TTL);
    const statsPromise = useCached ? null : fetchItemStats(itemId, mediaSourceId);
    statsPromise?.catch(() => {
    });
    const performFetch = async () => {
      if (cached && useCached) {
        if (cached.unavailable || !cached.size) {
          renderUnavailable();
          return;
        }
        renderSize(cached.size);
        return;
      }
      try {
        const stats = decodeStats(await statsPromise);
        await nextFrame();
        if (!isCurrent()) return;
        if (stats.size > 0) {
          renderSize(stats.size);
          fileSizeCache.set(cacheKey, { size: stats.size, unavailable: false, ts: now });
        } else {
          renderUnavailable();
          fileSizeCache.set(cacheKey, { size: null, unavailable: true, ts: now });
        }
      } catch (error) {
        if (!isCurrent()) return;
        console.error("🪼 Jellyfin Enhanced: Error fetching item size for ID %s:", itemId, error);
        renderUnavailable();
        fileSizeCache.set(cacheKey, { size: null, unavailable: true, ts: now });
      }
    };
    void performFetch();
  }
  function mediaLanguage() {
    const language = JE.core?.mediaLanguage;
    if (!language) throw new Error("Jellyfin Enhanced media-language module unavailable");
    return language;
  }
  async function fetchTagDataItem(userId, itemId, mediaSourceId = null) {
    try {
      const client = api();
      const response = await client.ajax({
        type: "POST",
        url: client.getUrl(`/JellyfinEnhanced/tag-data/${userId}`, mediaSourceId ? { mediaSourceId } : {}),
        data: JSON.stringify([itemId]),
        contentType: "application/json",
        dataType: "json"
      });
      return decodeDetailsItem(list(field(response, "Items"))[0]);
    } catch {
      return null;
    }
  }
  async function fetchFirstEpisodeForLanguage(userId, parentId, firstEpisodeId = null) {
    if (firstEpisodeId) {
      const enriched = await fetchTagDataItem(userId, firstEpisodeId);
      if (enriched) return enriched;
    }
    try {
      const client = api();
      const response = await client.ajax({
        type: "GET",
        url: client.getUrl("/Items", {
          ParentId: parentId,
          IncludeItemTypes: "Episode",
          IsVirtualItem: false,
          Recursive: true,
          SortBy: "PremiereDate",
          SortOrder: "Ascending",
          Limit: 1,
          Fields: "MediaStreams,MediaSources",
          userId: userId ?? ""
        }),
        dataType: "json"
      });
      const episode = decodeDetailsItem(list(field(response, "Items"))[0]);
      if (!episode?.Id) return episode;
      return await fetchTagDataItem(userId, episode.Id) || episode;
    } catch {
      return null;
    }
  }
  var languageTagNameCache = /* @__PURE__ */ new Map();
  async function loadLanguageTagMap(itemId, languages) {
    const map = /* @__PURE__ */ new Map();
    const cfg = JE.pluginConfig;
    if (!cfg?.AudioLanguageTagSyncEnabled || !cfg.AudioLanguageTagShowAsLinks) return map;
    try {
      const codes = [...new Set(languages.map((language) => language.code))];
      const unknown = codes.filter((code) => !languageTagNameCache.has(code));
      const client = api();
      const [item, names] = await Promise.all([
        lookupItem(JE.helpers, itemId, false),
        unknown.length ? client.ajax({ type: "GET", url: client.getUrl("/JellyfinEnhanced/audio-language-tags", { codes: unknown.join(",") }), dataType: "json" }) : Promise.resolve({})
      ]);
      if (isRecord(names)) {
        for (const [code, tags] of Object.entries(names)) {
          languageTagNameCache.set(code, {
            baseTag: str(field(tags, "baseTag")) ?? str(field(tags, "BaseTag")) ?? null,
            variantTag: str(field(tags, "variantTag")) ?? str(field(tags, "VariantTag")) ?? null
          });
        }
      }
      const itemTags = new Map((decodeDetailsItem(item)?.Tags ?? []).map((tag) => [tag.toLowerCase(), tag]));
      for (const code of codes) {
        const tags = languageTagNameCache.get(code);
        if (!tags) continue;
        const found = [tags.variantTag, tags.baseTag].filter((tag) => !!tag).map((tag) => itemTags.get(tag.toLowerCase())).find((tag) => !!tag);
        if (found) map.set(code, found);
      }
    } catch {
    }
    return map;
  }
  function createLanguageTagLink(tag) {
    const route = tagListRoute(tag, serverId());
    const link = document.createElement("a");
    link.className = "audio-language-link";
    link.href = `#!/${route}`;
    link.title = tag;
    link.style.color = "inherit";
    link.style.textDecoration = "none";
    link.addEventListener("mouseenter", () => {
      link.style.textDecoration = "underline";
    });
    link.addEventListener("mouseleave", () => {
      link.style.textDecoration = "none";
    });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigateRoute(route);
    });
    return link;
  }
  function collectLanguages(groups) {
    const languages = /* @__PURE__ */ new Map();
    for (const streams of groups) {
      for (const stream of streams ?? []) {
        if (stream.Type !== "Audio") continue;
        const code = stream.Language;
        if (!code || mediaLanguage().isLanguageless(code)) continue;
        let name;
        try {
          name = mediaLanguage().displayName(code);
        } catch {
          name = code.toUpperCase();
        }
        const language = { name, code };
        const key = JSON.stringify(language);
        if (!languages.has(key)) languages.set(key, language);
      }
    }
    return [...languages.values()];
  }
  async function displayAudioLanguages(itemId, container, mediaSourceId = null) {
    const requestEpoch = epochNow();
    const isCurrent = () => isEpochCurrent(requestEpoch);
    const cacheKey = `${itemId}|${mediaSourceId || ""}`;
    if (container.classList.contains("hide")) container.classList.remove("hide");
    const existing = container.querySelector(".mediaInfoItem-audioLanguage");
    if (existing) {
      if (existing.dataset.itemId === itemId && existing.dataset.sourceId === (mediaSourceId || "")) return;
      existing.remove();
    }
    const placeholder = document.createElement("div");
    placeholder.className = "mediaInfoItem mediaInfoItem-audioLanguage";
    placeholder.dataset.itemId = itemId;
    placeholder.dataset.sourceId = mediaSourceId || "";
    placeholder.title = JE.t("audio_language_tooltip");
    placeholder.style.display = "flex";
    placeholder.style.verticalAlign = "middle";
    placeholder.style.alignItems = "center";
    placeholder.style.margin = "0 1em 0 0 !important";
    placeholder.innerHTML = LOADING_HTML;
    container.appendChild(placeholder);
    const applyLangStyles = (el) => {
      el.title = JE.t("audio_language_tooltip");
      el.style.display = "flex";
      el.style.verticalAlign = "middle";
      el.style.alignItems = "center";
      el.style.flexDirection = "row";
      el.style.justifyContent = "center";
      el.style.flexWrap = "wrap";
      el.style.textAlign = "center";
      el.style.gap = "0.1em";
      try {
        el.style.setProperty("white-space", "normal", "important");
      } catch {
        el.style.whiteSpace = "normal";
      }
    };
    const renderUnavailable = () => {
      applyLangStyles(placeholder);
      placeholder.innerHTML = `<span class="material-icons" style="font-size: inherit; margin-right: 0.3em;">translate</span> -`;
    };
    const renderLanguages = (languages, tagMap = /* @__PURE__ */ new Map()) => {
      placeholder.innerHTML = "";
      placeholder.style.display = "flex";
      placeholder.style.alignItems = "center";
      placeholder.style.gap = "0.5em";
      placeholder.title = JE.t("audio_language_tooltip");
      const icon = document.createElement("span");
      icon.className = "material-icons";
      icon.style.fontSize = "inherit";
      icon.style.flexShrink = "0";
      icon.textContent = "translate";
      placeholder.appendChild(icon);
      const scrollContainer = document.createElement("div");
      scrollContainer.className = "audio-languages-container";
      scrollContainer.style.display = "flex";
      scrollContainer.style.flexWrap = "nowrap";
      scrollContainer.style.gap = "0.1em";
      scrollContainer.style.alignItems = "center";
      scrollContainer.style.overflowY = "hidden";
      if (languages.length > 3) {
        scrollContainer.style.overflowX = "auto";
        scrollContainer.style.scrollBehavior = "smooth";
        scrollContainer.style.whiteSpace = "nowrap";
        scrollContainer.style.maxWidth = "20em";
        scrollContainer.style.paddingBottom = "2px";
        scrollContainer.style.touchAction = "pan-x";
        scrollContainer.style.setProperty("-webkit-overflow-scrolling", "touch");
        scrollContainer.style.setProperty("scrollbar-width", "none");
        scrollContainer.style.setProperty("-ms-overflow-style", "none");
        scrollContainer.style.overflowY = "hidden";
        scrollContainer.addEventListener("wheel", (event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            scrollContainer.scrollLeft += event.deltaY;
            event.preventDefault();
          }
        }, { passive: false });
        scrollContainer.style.setProperty("::-webkit-scrollbar", "display: none");
        const indicator = document.createElement("span");
        indicator.className = "scroll-indicator";
        indicator.style.display = "inline-block";
        indicator.style.opacity = "0.7";
        indicator.style.fontSize = "0.9em";
        indicator.style.fontFamily = "sans-serif";
        indicator.textContent = "⇆";
        placeholder.appendChild(indicator);
      }
      languages.forEach((language, index) => {
        const langSpan = document.createElement("span");
        langSpan.className = "audio-language-item";
        langSpan.dataset.lang = language.code;
        langSpan.dataset.langName = language.name;
        langSpan.style.whiteSpace = "nowrap";
        const countryCode = mediaLanguage().resolveFlag(language);
        if (countryCode) {
          const flag = document.createElement("img");
          flag.src = mediaLanguage().flagSrc(countryCode);
          flag.alt = `${language.name} flag`;
          flag.style.width = "18px";
          flag.style.marginRight = "0.3em";
          flag.style.borderRadius = "2px";
          flag.onerror = () => flag.remove();
          langSpan.appendChild(flag);
        }
        const languageTag = tagMap.get(language.code);
        if (languageTag) {
          const link = createLanguageTagLink(languageTag);
          link.textContent = language.name;
          langSpan.appendChild(link);
        } else {
          langSpan.appendChild(document.createTextNode(language.name));
        }
        scrollContainer.appendChild(langSpan);
        if (index < languages.length - 1) {
          const separator = document.createElement("span");
          separator.style.margin = "0 0.25em";
          separator.textContent = ", ";
          separator.style.whiteSpace = "nowrap";
          scrollContainer.appendChild(separator);
        }
      });
      placeholder.appendChild(scrollContainer);
    };
    const renderUnavailableInFrame = () => nextFrame().then(() => {
      if (isCurrent() && placeholder.isConnected) renderUnavailable();
    });
    const renderLanguagesInFrame = async (languages) => {
      const tagMap = await loadLanguageTagMap(itemId, languages);
      await nextFrame();
      if (isCurrent() && placeholder.isConnected) renderLanguages(languages, tagMap);
    };
    const cacheUnavailable = () => audioLanguageCache.set(cacheKey, { languages: [], unavailable: true, ts: Date.now() });
    const performFetch = async () => {
      const now = Date.now();
      const cached = audioLanguageCache.get(cacheKey);
      if (cached && now - cached.ts < LANGUAGE_CACHE_TTL) {
        if (cached.unavailable || cached.languages.length === 0) {
          renderUnavailable();
          return;
        }
        const tagMap = await loadLanguageTagMap(itemId, cached.languages);
        if (isCurrent() && placeholder.isConnected) renderLanguages(cached.languages, tagMap);
        return;
      }
      try {
        const userId = currentUserId();
        const item = await fetchTagDataItem(userId, itemId, mediaSourceId) || decodeDetailsItem(await lookupItem(JE.helpers, itemId, true, userId));
        if (!isCurrent()) return;
        if (!item) throw new TypeError(`Item ${itemId} is unavailable`);
        let sourceItem = item;
        if (item.Type === "Series" || item.Type === "Season") {
          const episode = item.Id ? await fetchFirstEpisodeForLanguage(userId, item.Id, item.FirstEpisodeId ?? null) : null;
          if (!isCurrent()) return;
          if (!episode) {
            await renderUnavailableInFrame();
            if (!isCurrent()) return;
            cacheUnavailable();
            return;
          }
          sourceItem = episode;
        }
        const mediaSources = sourceItem.MediaSources;
        const selectedSource = mediaSourceId && mediaSources ? mediaSources.find((source) => source.Id === mediaSourceId) : void 0;
        const languages = selectedSource ? collectLanguages([selectedSource.MediaStreams]) : collectLanguages([sourceItem.MediaStreams, ...(mediaSources ?? []).map((source) => source.MediaStreams)]);
        if (languages.length > 0) {
          await renderLanguagesInFrame(languages);
          if (!isCurrent()) return;
          audioLanguageCache.set(cacheKey, { languages, unavailable: false, ts: Date.now() });
        } else {
          await renderUnavailableInFrame();
          if (!isCurrent()) return;
          cacheUnavailable();
        }
      } catch (error) {
        if (!isCurrent()) return;
        console.error("🪼 Jellyfin Enhanced: Error fetching audio languages for %s:", itemId, error);
        await renderUnavailableInFrame();
        if (!isCurrent()) return;
        cacheUnavailable();
      }
    };
    void performFetch();
  }
  internal.displayWatchProgress = displayWatchProgress;
  internal.displayItemSize = displayItemSize;
  internal.displayAudioLanguages = displayAudioLanguages;
  internal.prefetchItemStats = prefetchItemStats;
  internal.discardItemStatsPrefetch = discardItemStatsPrefetch;
})();
})();
//# sourceMappingURL=features-details-media-info.js.map
