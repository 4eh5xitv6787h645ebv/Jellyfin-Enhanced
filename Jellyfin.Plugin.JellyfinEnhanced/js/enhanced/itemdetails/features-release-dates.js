(() => {
"use strict";
(() => {
  // client/src/host/details-providers-host.ts
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
  function hasApi() {
    return hostWindow().ApiClient !== void 0;
  }
  function currentUserId() {
    const id = hostWindow().ApiClient?.getCurrentUserId();
    return typeof id === "string" && id ? id : null;
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
  function int(value) {
    return typeof value === "number" && Number.isInteger(value) ? value : void 0;
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
  async function lookupDetailsItem(helpers, itemId, withUser, userId = currentUserId()) {
    return decodeDetailsItem(await lookupItem(helpers, itemId, withUser, userId));
  }
  function sessionLease(session) {
    const epoch = session?.getEpoch();
    const userId = currentUserId();
    const client = api();
    const root = client.getUrl("/");
    const token = client.accessToken();
    return () => hasApi() && api() === client && client.getUrl("/") === root && client.accessToken() === token && (!session || epoch === void 0 || session.isCurrent(epoch)) && currentUserId() === userId;
  }

  // client/src/features/details-providers/links.ts
  function pathSegment(id) {
    return encodeURIComponent(id);
  }

  // client/src/features/details-providers/release-domain.ts
  function todayIso(now) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  function formatReleaseDate(dateStr) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(String(dateStr));
    let d;
    if (parts) {
      const year = Number(parts[1]), month = Number(parts[2]) - 1, day = Number(parts[3]);
      d = new Date(year, month, day);
      if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return dateStr;
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(void 0, { year: "numeric", month: "short", day: "numeric" });
  }
  var MOVIE_RELEASE_BUCKETS = [
    { types: [1, 2, 3], icon: "local_movies", titleKey: "calendar_cinema_release", type: "cinema" },
    { types: [4], icon: "ondemand_video", titleKey: "calendar_digital_release", type: "digital" },
    { types: [5], icon: "album", titleKey: "calendar_physical_release", type: "physical" }
  ];
  function decodeCountries(value) {
    return list(field(value, "results")).map((entry) => ({
      iso: str(field(entry, "iso_3166_1")),
      dates: list(field(entry, "release_dates")).flatMap((date) => {
        const type = int(field(date, "type")), releaseDate = str(field(date, "release_date"));
        return type !== void 0 && releaseDate ? [{ type, release_date: releaseDate }] : [];
      })
    }));
  }
  function earliestOfBucket(dates, bucket) {
    const matches = dates.filter((date) => bucket.types.includes(date.type) && date.release_date);
    if (matches.length === 0) return null;
    return matches.reduce((a, b) => a.release_date < b.release_date ? a : b);
  }
  function movieReleaseInfo(data, configuredRegion) {
    const results = decodeCountries(data);
    if (results.length === 0) return [];
    const region = (configuredRegion || "US").toUpperCase();
    const preferredOrder = [region, "US"].filter((iso, i, arr) => iso && arr.indexOf(iso) === i);
    const infos = [];
    for (const bucket of MOVIE_RELEASE_BUCKETS) {
      let earliest = null;
      for (const iso of preferredOrder) {
        const entry = results.find((result) => result.iso === iso);
        earliest = entry ? earliestOfBucket(entry.dates, bucket) : null;
        if (earliest) break;
      }
      if (!earliest) {
        for (const entry of results) {
          earliest = earliestOfBucket(entry.dates, bucket);
          if (earliest) break;
        }
      }
      if (earliest) infos.push({ date: earliest.release_date, icon: bucket.icon, titleKey: bucket.titleKey, type: bucket.type });
    }
    return infos;
  }
  function episodeInfo(date) {
    return { date, icon: "tv_guide", titleKey: "calendar_episode", type: "episode" };
  }
  function seriesReleaseInfo(data) {
    const date = str(field(field(data, "next_episode_to_air"), "air_date")) || str(field(field(data, "last_episode_to_air"), "air_date"));
    return date ? [episodeInfo(date)] : [];
  }
  function seasonReleaseInfo(data, today) {
    const episodes = field(data, "episodes");
    if (!Array.isArray(episodes) || episodes.length === 0) return [];
    const withDates = episodes.map((episode) => str(field(episode, "air_date"))).filter((date2) => !!date2);
    if (withDates.length === 0) return [];
    const upcoming = withDates.find((date2) => date2 >= today);
    const date = upcoming ?? withDates[withDates.length - 1];
    return date ? [episodeInfo(date)] : [];
  }
  function episodeReleaseInfo(data) {
    const date = str(field(data, "air_date"));
    return date ? [episodeInfo(date)] : [];
  }
  function premiereDate(value) {
    const premiere = typeof value === "string" ? value.slice(0, 10) : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(premiere) ? premiere : null;
  }

  // client/src/features/details-providers/release-dates.ts
  var JE = bridge("Release dates");
  var internals = JE.internals ?? (JE.internals = {});
  var internal = internals.features ?? (internals.features = {});
  var RELEASEDATE_CACHE_TTL = 60 * 60 * 1e3;
  var RELEASEDATE_GUARDED_CACHE_TTL = 30 * 1e3;
  var cacheTtl = () => JE.spoilerBlur?.hasAnyState?.() ? RELEASEDATE_GUARDED_CACHE_TTL : RELEASEDATE_CACHE_TTL;
  var releaseDateCache = /* @__PURE__ */ new Map();
  var releaseLookups = /* @__PURE__ */ new Map();
  var guardRevision = 0;
  var releaseOwner = null;
  function resetReleaseOwner() {
    guardRevision++;
    releaseOwner = null;
    releaseDateCache.clear();
    dropUnclaimedLookups();
    document.querySelectorAll(".mediaInfoItem-releaseDate").forEach((chip) => chip.remove());
  }
  function currentReleaseOwner() {
    if (!releaseOwner || !releaseOwner()) {
      resetReleaseOwner();
      releaseOwner = sessionLease(JE.session);
    }
    return releaseOwner;
  }
  function dropUnclaimedLookups() {
    for (const entry of releaseLookups.values()) {
      if (entry.visit && !entry.claimed) entry.ctl?.abort();
    }
    releaseLookups.clear();
  }
  window.addEventListener("je:spoiler-state-changed", () => {
    guardRevision++;
    releaseDateCache.clear();
    dropUnclaimedLookups();
    document.querySelectorAll(".mediaInfoItem-releaseDate").forEach((chip) => chip.remove());
  });
  JE.session?.onUserChange("release-dates", resetReleaseOwner);
  function tmdbGet(path) {
    const client = api();
    const url = client.getUrl(`/JellyfinEnhanced/tmdb${path}`);
    return fetch(url, { headers: { Authorization: `MediaBrowser Token="${client.accessToken()}"`, "X-Emby-Token": client.accessToken() } }).then((response) => response.ok ? response.json() : Promise.reject(`API Error: ${response.status}`)).catch((error) => {
      console.error(`🪼 Jellyfin Enhanced: Release Date: TMDB request failed for ${path}`, error);
      return null;
    });
  }
  async function resolveReleaseInfo(item, userId) {
    const mediaType = item?.Type;
    if (!item) return [];
    if (mediaType === "Movie") {
      const tmdbId = item.ProviderIds.Tmdb;
      return tmdbId ? movieReleaseInfo(await tmdbGet(`/movie/${pathSegment(tmdbId)}/release_dates`), JE.pluginConfig?.DEFAULT_REGION) : [];
    }
    if (mediaType === "Series") {
      const tmdbId = item.ProviderIds.Tmdb;
      return tmdbId ? seriesReleaseInfo(await tmdbGet(`/tv/${pathSegment(tmdbId)}`)) : [];
    }
    if (mediaType === "Season" || mediaType === "Episode") {
      let seriesTmdbId;
      if (item.SeriesId) {
        try {
          const series = await lookupDetailsItem(JE.helpers, item.SeriesId, true, userId);
          seriesTmdbId = series?.ProviderIds.Tmdb;
        } catch {
        }
      }
      if (!seriesTmdbId) return [];
      const show = pathSegment(seriesTmdbId);
      if (mediaType === "Season") {
        return item.IndexNumber != null ? seasonReleaseInfo(await tmdbGet(`/tv/${show}/season/${item.IndexNumber}`), todayIso(/* @__PURE__ */ new Date())) : [];
      }
      const premiere = premiereDate(item.PremiereDate);
      if (premiere) return [episodeInfo(premiere)];
      return item.ParentIndexNumber != null && item.IndexNumber != null ? episodeReleaseInfo(await tmdbGet(`/tv/${show}/season/${item.ParentIndexNumber}/episode/${item.IndexNumber}`)) : [];
    }
    return [];
  }
  async function displayReleaseDate(itemId, container) {
    const owner = currentReleaseOwner();
    const existing = container.querySelectorAll(".mediaInfoItem-releaseDate");
    if (existing.length > 0) {
      if (existing[0]?.dataset.itemId === itemId) return;
      existing.forEach((element) => element.remove());
    }
    const now = Date.now();
    const cached = releaseDateCache.get(itemId);
    if (cached && now - cached.ts < cacheTtl()) {
      if (cached.infos.length > 0) renderReleaseDateChips(container, itemId, cached.infos);
      return;
    }
    const placeholder = document.createElement("div");
    placeholder.className = "mediaInfoItem mediaInfoItem-releaseDate";
    placeholder.dataset.itemId = itemId;
    placeholder.style.display = "none";
    container.appendChild(placeholder);
    const performFetch = async () => {
      let entry;
      const epoch = JE.session ? JE.session.getEpoch() : 0;
      const revision = guardRevision;
      let cutShort = false;
      try {
        const userId = currentUserId();
        const lookupNow = async () => resolveReleaseInfo(await lookupDetailsItem(JE.helpers, itemId, true, userId), userId);
        entry = releaseLookups.get(itemId);
        if (entry) entry.claimed = true;
        else releaseLookups.set(itemId, entry = { promise: lookupNow(), visit: null, claimed: true, ctl: null });
        const claimed = entry;
        const infos = claimed.visit ? await claimed.promise.catch((error) => {
          if (!owner() || JE.session && !JE.session.isCurrent(epoch)) {
            cutShort = true;
            throw error;
          }
          return lookupNow();
        }) : await claimed.promise;
        if (releaseLookups.get(itemId) === claimed) releaseLookups.delete(itemId);
        const superseded = !owner() || revision !== guardRevision || JE.session && !JE.session.isCurrent(epoch);
        if (superseded) {
          placeholder.remove();
          return;
        }
        releaseDateCache.set(itemId, { infos, ts: now });
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        if (!owner() || revision !== guardRevision || !placeholder.isConnected) {
          placeholder.remove();
          return;
        }
        if (infos.length > 0) fillReleaseDateChips(placeholder, infos);
        else placeholder.remove();
      } catch (error) {
        if (entry && releaseLookups.get(itemId) === entry) releaseLookups.delete(itemId);
        placeholder.remove();
        if (cutShort || !owner() || revision !== guardRevision || JE.session && !JE.session.isCurrent(epoch)) return;
        console.error(`🪼 Jellyfin Enhanced: Release Date: Error fetching release info for ${itemId}:`, error);
        releaseDateCache.set(itemId, { infos: [], ts: now });
      }
    };
    void performFetch();
  }
  var releaseDateIconFontInjected = false;
  function ensureReleaseDateIconFont() {
    if (releaseDateIconFontInjected) return;
    const addCSS = JE.helpers?.addCSS;
    if (!addCSS) throw new Error("Jellyfin Enhanced helpers unavailable");
    releaseDateIconFontInjected = true;
    addCSS("je-release-date-symbols", `
            .je-release-date-icon {
                font-family: 'JE Material Symbols Rounded';
                font-weight: normal;
                font-style: normal;
                line-height: 1;
                letter-spacing: normal;
                text-transform: none;
                display: inline-block;
                white-space: nowrap;
                word-wrap: normal;
                direction: ltr;
                -webkit-font-feature-settings: 'liga';
                -moz-font-feature-settings: 'liga';
                font-feature-settings: 'liga';
                -webkit-font-smoothing: antialiased;
            }
        `);
  }
  function fillReleaseDateChip(chip, info) {
    ensureReleaseDateIconFont();
    chip.classList.add(`je-release-date-${info.type}`);
    chip.title = JE.t(info.titleKey);
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "0.3em";
    chip.style.whiteSpace = "nowrap";
    chip.style.margin = "0 1em 0 0 !important";
    const icon = document.createElement("span");
    icon.className = "je-release-date-icon";
    icon.style.fontSize = "inherit";
    icon.textContent = info.icon;
    const date = document.createElement("span");
    date.textContent = formatReleaseDate(info.date);
    chip.replaceChildren(icon, date);
  }
  function fillReleaseDateChips(placeholder, infos) {
    const [first, ...rest] = infos;
    if (!first) return;
    fillReleaseDateChip(placeholder, first);
    let anchor = placeholder;
    for (const info of rest) {
      const chip = document.createElement("div");
      chip.className = "mediaInfoItem mediaInfoItem-releaseDate";
      chip.dataset.itemId = placeholder.dataset.itemId ?? "";
      fillReleaseDateChip(chip, info);
      anchor.after(chip);
      anchor = chip;
    }
  }
  function renderReleaseDateChips(container, itemId, infos) {
    for (const info of infos) {
      const chip = document.createElement("div");
      chip.className = "mediaInfoItem mediaInfoItem-releaseDate";
      chip.dataset.itemId = itemId;
      fillReleaseDateChip(chip, info);
      container.appendChild(chip);
    }
  }
  function prefetchReleaseDate(itemId, rawItem, visit) {
    currentReleaseOwner();
    const cached = releaseDateCache.get(itemId);
    if (cached && Date.now() - cached.ts < cacheTtl() || releaseLookups.has(itemId)) return;
    const ctl = new AbortController();
    const userId = currentUserId();
    const item = decodeDetailsItem(rawItem);
    const lookup = () => resolveReleaseInfo(item, userId);
    const manager = JE.core?.api?.manager;
    const promise = typeof manager?.withConcurrencyLimit === "function" ? manager.withConcurrencyLimit(lookup, { signal: ctl.signal }) : lookup();
    promise.catch(() => {
    });
    releaseLookups.set(itemId, { promise, visit, claimed: false, ctl });
  }
  function discardReleasePrefetch(visit) {
    for (const [itemId, entry] of releaseLookups) {
      if (entry.visit !== visit || entry.claimed) continue;
      entry.ctl?.abort();
      releaseLookups.delete(itemId);
    }
  }
  internal.displayReleaseDate = displayReleaseDate;
  internal.prefetchReleaseDate = prefetchReleaseDate;
  internal.discardReleasePrefetch = discardReleasePrefetch;
})();
})();
//# sourceMappingURL=features-release-dates.js.map
