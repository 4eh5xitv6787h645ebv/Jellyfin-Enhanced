(() => {
"use strict";
(() => {
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
  function text(value) {
    return typeof value === "string" && value !== "" ? value : void 0;
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
  function hashItemId(hash = window.location.hash) {
    try {
      return new URLSearchParams(hash.split("?")[1] ?? "").get("id");
    } catch {
      return null;
    }
  }
  function visibleDetailPage() {
    return document.querySelector("#itemDetailPage:not(.hide)");
  }
  function lookupItem(helpers, itemId, withUser, userId = currentUserId()) {
    if (helpers?.getItemCached) {
      return withUser ? helpers.getItemCached(itemId, { userId }) : helpers.getItemCached(itemId);
    }
    return api().getItem(userId, itemId);
  }
  async function lookupDetailsItem(helpers, itemId, withUser, userId = currentUserId()) {
    return decodeDetailsItem(await lookupItem(helpers, itemId, withUser, userId));
  }
  function detailsLease(session, itemId, page) {
    const sameSession = sessionLease(session);
    return {
      itemId,
      page,
      current: () => sameSession() && hashItemId() === itemId && page.isConnected && visibleDetailPage() === page
    };
  }
  function sessionLease(session) {
    const epoch = session?.getEpoch();
    const userId = currentUserId();
    const client = api();
    const root = client.getUrl("/");
    const token = client.accessToken();
    return () => hasApi() && api() === client && client.getUrl("/") === root && client.accessToken() === token && (!session || epoch === void 0 || session.isCurrent(epoch)) && currentUserId() === userId;
  }
  function isDetailHook(element, hash) {
    const hasItemId = window.location.hash.includes("id=") || typeof hash === "string" && hash.includes("id=");
    const isItemDetailElement = !!element && (element.id === "itemDetailPage" || element.classList.contains("itemDetailPage"));
    return hasItemId || isItemDetailElement;
  }
  function detailPageHook(enabled2, unregister, process, retry) {
    return async (_view, element, hash) => {
      if (!enabled2()) {
        unregister();
        return;
      }
      if (!isDetailHook(element, hash)) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const page = visibleDetailPage();
      if (page) {
        process(page);
      } else if (retry) {
        setTimeout(() => {
          const retryPage = visibleDetailPage();
          if (retryPage) process(retryPage);
        }, 500);
      }
    };
  }
  function removeFirst(page, selector) {
    const root = page || visibleDetailPage() || document;
    const section = root.querySelector(selector);
    section?.parentNode?.removeChild(section);
  }

  // client/src/features/shared/url-domain.ts
  function safeExternalUrl(value, base) {
    try {
      const url = new URL(value, base);
      return ["http:", "https:", "mailto:", "tel:", "ftp:", "blob:"].includes(url.protocol) ? value : "#";
    } catch {
      return "#";
    }
  }

  // client/src/features/details-providers/links.ts
  function safeHref(url) {
    return safeExternalUrl(url, window.location.href);
  }
  function externalLink(helpers, url, options = {}) {
    const shared = helpers?.createExternalLink;
    if (shared) return shared(url, options);
    const anchor = document.createElement("a");
    anchor.setAttribute("is", "emby-linkbutton");
    anchor.href = safeHref(url);
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (options.title) anchor.title = options.title;
    if (options.className) anchor.className = options.className;
    if (options.text) anchor.textContent = options.text;
    if (options.resetStyle) anchor.style.cssText = "padding:0;background:none;border-radius:0;min-width:0;";
    if (typeof options.setup === "function") options.setup(anchor);
    return anchor;
  }
  function pathSegment(id) {
    return encodeURIComponent(id);
  }

  // client/src/features/details-providers/provider-domain.ts
  async function resolveProviderTarget(item, allowPerson, seriesLookup) {
    const type = item?.Type;
    if (!item) return { target: null, unsupported: true };
    if (type === "Movie") return { target: wrap(item.ProviderIds.Tmdb, "movie"), unsupported: false };
    if (type === "Person" && allowPerson) return { target: wrap(item.ProviderIds.Tmdb, "person"), unsupported: false };
    if (type === "Series" || type === "Season" || type === "Episode") {
      let tmdbId;
      if (type === "Series") tmdbId = item.ProviderIds.Tmdb;
      else if (item.SeriesId) {
        try {
          tmdbId = (await seriesLookup(item.SeriesId))?.ProviderIds.Tmdb;
        } catch {
        }
      }
      return { target: wrap(tmdbId, "tv"), unsupported: false };
    }
    return { target: null, unsupported: true };
  }
  function wrap(tmdbId, mediaType) {
    return tmdbId ? { tmdbId, mediaType } : null;
  }
  function isUnconfirmed(value) {
    return field(value, "Confirmed") === false;
  }
  function decodeMdblistEntry(value) {
    if (!isRecord(value) || !value.Found || !Array.isArray(value.Ratings) || value.Ratings.length === 0) return null;
    const ids = {};
    if (isRecord(value.Ids)) {
      for (const [key, id] of Object.entries(value.Ids)) {
        const decoded = typeof id === "number" && Number.isFinite(id) ? String(id) : text(id);
        if (decoded !== void 0) ids[key] = decoded;
      }
    }
    return {
      Found: true,
      Ids: ids,
      Ratings: value.Ratings.filter(isRecord).map((rating) => ({
        Source: str(rating.Source) ?? "",
        // Rendered into markup: only finite numbers are scores.
        Value: num(rating.Value) ?? null,
        Score: num(rating.Score) ?? null,
        Votes: num(rating.Votes) ?? null,
        Url: str(rating.Url) ?? null,
        Fresh: int(rating.Fresh) ?? null
      }))
    };
  }
  var MDBLIST_LABELS = {
    master: "Master",
    imdb: "IMDb",
    tmdb: "TMDB",
    trakt: "Trakt",
    letterboxd: "Letterboxd",
    tomatoes: "RT Critic",
    popcorn: "RT Audience",
    metacritic: "Metascore",
    metacriticuser: "Metacritic User",
    rogerebert: "Roger Ebert",
    myanimelist: "MAL",
    anilist: "AniList"
  };
  var MDBLIST_LOGOS = {
    master: "master.png",
    imdb: "imdb.png",
    tmdb: "tmdb.png",
    trakt: "trakt.png",
    letterboxd: "letterboxd.png",
    tomatoes: "rottentomatoes.png",
    popcorn: "rottentomatoes_audience.png",
    metacritic: "metacritic.png",
    metacriticuser: "metacritic_audience.png",
    rogerebert: "rogerebert.png",
    myanimelist: "myanimelist.png",
    anilist: "anilist.png"
  };
  var TOMATOES_STATUS_LOGOS = { 1: "rottentomatoes_fresh.png", 0: "rottentomatoes_rotten.png" };
  var MDBLIST_DEFAULT_ORDER = ["tmdb", "tomatoes", "popcorn", "imdb", "trakt", "metacritic"];
  var own = (map, key) => Object.prototype.hasOwnProperty.call(map, key) ? map[key] : void 0;
  var localSlug = (value) => (value || "").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  function mdblistLink(sourceKey, ids, apiUrl, mediaType, title) {
    const sLink = String(apiUrl || "");
    const safeTitle = encodeURIComponent(title || "");
    const safeType = mediaType === "tv" ? "tv" : "movie";
    const id = (key) => own(ids, key);
    const path = (value) => encodeURIComponent(value);
    if (sLink.startsWith("http") && sourceKey !== "metacriticuser" && sourceKey !== "rogerebert") return sLink;
    switch (sourceKey) {
      case "imdb": {
        const v = id("imdb");
        return v ? `https://www.imdb.com/title/${path(v)}/` : null;
      }
      case "tmdb": {
        const v = id("tmdb");
        return v ? `https://www.themoviedb.org/${safeType}/${path(v)}` : null;
      }
      case "trakt": {
        const v = id("trakt");
        return v ? `https://trakt.tv/${safeType === "tv" ? "shows" : "movies"}/${path(v)}` : null;
      }
      case "letterboxd":
        return sLink.includes("/film/") || sLink.includes("/slug/") ? `https://letterboxd.com${sLink.startsWith("/") ? "" : "/"}${sLink}` : null;
      case "metacritic":
      case "metacriticuser":
        return title ? `https://www.metacritic.com/${safeType}/${localSlug(title)}` : null;
      case "tomatoes":
      case "popcorn":
        if (sLink.startsWith("/")) return `https://www.rottentomatoes.com${sLink}`;
        return sLink.length > 2 ? `https://www.rottentomatoes.com/m/${sLink}` : null;
      case "anilist": {
        const v = id("anilist");
        return v ? `https://anilist.co/anime/${path(v)}` : title ? `https://anilist.co/search/anime?search=${safeTitle}` : null;
      }
      case "myanimelist": {
        const v = id("mal");
        return v ? `https://myanimelist.net/anime/${path(v)}` : title ? `https://myanimelist.net/anime.php?q=${safeTitle}` : null;
      }
      case "rogerebert":
        return sLink.length > 2 ? `https://www.rogerebert.com/reviews/${sLink}` : title ? `https://duckduckgo.com/?q=!ducky+site:rogerebert.com/reviews+${safeTitle}` : null;
      default:
        return null;
    }
  }
  function configuredSources(raw) {
    return (raw || "").split(",").map((source) => source.trim().toLowerCase()).filter(Boolean);
  }
  function mdblistBadges(entry, mediaType, title, sources, showPercent) {
    const order = sources.length ? sources : MDBLIST_DEFAULT_ORDER;
    const rank = (rating) => {
      const index = order.indexOf(rating.Source.toLowerCase());
      return index === -1 ? order.length : index;
    };
    return entry.Ratings.filter((rating) => rating.Score !== null || rating.Value !== null).filter((rating) => sources.length === 0 || sources.includes(rating.Source.toLowerCase())).sort((a, b) => rank(a) - rank(b)).map((rating) => {
      const normalized = rating.Score;
      const score = normalized ?? rating.Value ?? 0;
      const sourceKey = rating.Source.toLowerCase();
      const label = own(MDBLIST_LABELS, sourceKey) || rating.Source;
      const freshState = normalized !== null ? normalized >= 60 ? 1 : 0 : rating.Fresh;
      const freshLogo = sourceKey === "tomatoes" && freshState !== null ? own(TOMATOES_STATUS_LOGOS, String(freshState)) : void 0;
      return {
        label,
        logo: freshLogo || own(MDBLIST_LOGOS, sourceKey),
        link: mdblistLink(sourceKey, entry.Ids, rating.Url, mediaType, title),
        // A raw fallback Value keeps its precision (rogerebert's 3.5 stays 3.5).
        scoreText: normalized !== null ? Math.round(normalized) + (showPercent ? "%" : "") : String(score),
        score,
        votes: rating.Votes
      };
    });
  }
  var RUNTIME_PATTERN = /^\d+\s*(?:h(?:ours?)?)?\s*\d*\s*m(?:inutes?)?$/i;

  // client/src/features/details-providers/mdblist-ratings.ts
  var JE = bridge("MDBList ratings");
  var enabled = () => !!JE.pluginConfig?.MdblistRatingsEnabled && !!JE.pluginConfig.MdblistRatingsShowOnItemDetails;
  JE.initializeMdblistRatingsScript = function initializeMdblistRatingsScript() {
    if (!enabled()) {
      console.log("🪼 Jellyfin Enhanced: MDBList Ratings feature disabled.");
      return;
    }
    const logPrefix = "🪼 Jellyfin Enhanced: MDBList Ratings:";
    const sectionClass = "je-mdblist-ratings-section";
    const escapeHtml = (value) => typeof JE.escapeHtml === "function" ? JE.escapeHtml(value) : String(value);
    function injectCss() {
      const styleId = "je-mdblist-ratings-styles";
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
                .${sectionClass} {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 5px;
                    margin: 1em 0;
                    font-size: 1.05em;
                }
                .${sectionClass} .je-mdblist-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    text-decoration: none;
                    color: inherit;
                    font-size: inherit;
                }
                .${sectionClass} a.je-mdblist-badge {
                    cursor: pointer;
                }
                .${sectionClass} a.je-mdblist-badge:hover {
                    text-decoration: underline;
                }
                .${sectionClass} .je-mdblist-badge .je-mdblist-source {
                    opacity: 0.7;
                    font-size: 0.9em;
                }
                .${sectionClass} .je-mdblist-badge .je-mdblist-logo {
                    height: 22px;
                    width: auto;
                    object-fit: contain;
                }
            `;
      document.head.appendChild(style);
    }
    function removeSection(page) {
      try {
        removeFirst(page, `.${sectionClass}`);
      } catch (e) {
        console.warn(`${logPrefix} removeSection failed:`, e);
      }
    }
    function buildSection(entry, mediaType, title) {
      const wrap2 = document.createElement("div");
      wrap2.className = sectionClass;
      const badges = mdblistBadges(
        entry,
        mediaType,
        title,
        configuredSources(JE.pluginConfig?.MdblistRatingsSources),
        !!JE.pluginConfig?.MdblistRatingsShowPercentSymbol
      );
      for (const badge of badges) {
        const votesText = badge.votes ? ` (${JE.t("mdblist_ratings_votes", { count: badge.votes })})` : "";
        const badgeTitle = `${badge.label}: ${badge.score}${votesText}`;
        const iconHtml = badge.logo ? `<img class="je-mdblist-logo" src="${escapeHtml(JE.cdn.url("mdblist-logos", badge.logo))}" alt="${escapeHtml(badge.label)}" loading="lazy">` : `<span class="je-mdblist-source">${escapeHtml(badge.label)}</span>`;
        const badgeHtml = `${iconHtml}<span>${escapeHtml(badge.scoreText)}</span>`;
        const element = badge.link ? externalLink(JE.helpers, badge.link, { className: "je-mdblist-badge", title: badgeTitle, resetStyle: true, setup: (anchor) => {
          anchor.innerHTML = badgeHtml;
        } }) : Object.assign(document.createElement("span"), { className: "je-mdblist-badge", title: badgeTitle, innerHTML: badgeHtml });
        wrap2.appendChild(element);
      }
      return wrap2;
    }
    function findInsertionTarget(contextPage) {
      const official = contextPage.querySelector("div.mediaInfoItem.mediaInfoOfficialRating");
      if (official) return official;
      for (const element of contextPage.querySelectorAll("div.mediaInfoItem")) {
        if (RUNTIME_PATTERN.test((element.textContent ?? "").trim())) return element;
      }
      return null;
    }
    function insertSection(contextPage, entry, mediaType, title) {
      removeSection(contextPage);
      if (!entry) return;
      const section = buildSection(entry, mediaType, title);
      if (section.children.length === 0) return;
      const target = findInsertionTarget(contextPage);
      const scope = target && (target.closest(".detailRibbon") || target.closest(".mainDetailButtons") || target.closest(".itemMiscInfo")) || target?.parentNode;
      const extLinks = (scope && "querySelector" in scope ? scope.querySelector(".itemExternalLinks") : null) || contextPage.querySelector(".itemExternalLinks");
      if (extLinks?.parentNode) {
        extLinks.insertAdjacentElement("beforebegin", section);
        return;
      }
      if (target?.parentNode) {
        target.insertAdjacentElement("afterend", section);
        return;
      }
      const afterAnchor = contextPage.querySelector(".je-awards-section") || contextPage.querySelector(".tmdb-reviews-section") || contextPage.querySelector(".streaming-lookup-container") || contextPage.querySelector(".tagline");
      if (afterAnchor?.parentNode) {
        afterAnchor.parentNode.insertBefore(section, afterAnchor.nextSibling);
        return;
      }
      const beforeAnchor = contextPage.querySelector("#similarCollapsible");
      if (beforeAnchor?.parentNode) {
        beforeAnchor.parentNode.insertBefore(section, beforeAnchor);
        return;
      }
      console.warn(`${logPrefix} Could not find a suitable anchor to insert the ratings row.`);
    }
    async function fetchRatings(tmdbId, apiMediaType) {
      try {
        const cacheKey = `mdblist-ratings:/${apiMediaType}/${tmdbId}`;
        const data = await JE.core.api.plugin(`/mdblist-ratings/${apiMediaType}/${pathSegment(tmdbId)}`, { cacheKey });
        if (isUnconfirmed(data)) JE.core.api.manager.clearCacheMatching(cacheKey);
        return decodeMdblistEntry(data);
      } catch (e) {
        console.warn(`${logPrefix} Failed to fetch ratings.`, e);
        return null;
      }
    }
    async function processPage(visiblePage) {
      if (!enabled()) {
        removeSection(visiblePage);
        return;
      }
      try {
        const itemId = hashItemId();
        const userId = currentUserId();
        if (!itemId || !userId) return;
        const lease = detailsLease(JE.session, itemId, visiblePage);
        const item = await lookupDetailsItem(JE.helpers, itemId, true, userId);
        const { target } = await resolveProviderTarget(item, false, (seriesId) => lookupDetailsItem(JE.helpers, seriesId, true, userId));
        if (!lease.current()) return;
        if (!target) {
          if (lease.current()) removeSection(visiblePage);
          return;
        }
        const type = item?.Type;
        const title = type === "Season" || type === "Episode" ? item?.SeriesName || item?.Name : item?.Name;
        const entry = await fetchRatings(target.tmdbId, target.mediaType);
        if (lease.current()) insertSection(visiblePage, entry, target.mediaType, title);
      } catch (error) {
        console.error(`${logPrefix} Error processing page:`, error);
      }
    }
    injectCss();
    const unregister = JE.helpers.onViewPage(
      detailPageHook(enabled, () => unregister?.(), (page) => {
        void processPage(page);
      }, true),
      { pages: null, fetchItem: false, immediate: true }
    );
  };
})();
})();
//# sourceMappingURL=mdblist-ratings.js.map
