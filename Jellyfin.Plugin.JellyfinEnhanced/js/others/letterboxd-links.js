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
  function sessionLease(session) {
    const epoch = session?.getEpoch();
    const userId = currentUserId();
    const client = api();
    const root = client.getUrl("/");
    const token = client.accessToken();
    return () => hasApi() && api() === client && client.getUrl("/") === root && client.accessToken() === token && (!session || epoch === void 0 || session.isCurrent(epoch)) && currentUserId() === userId;
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

  // client/src/features/details-providers/letterboxd-links.ts
  var JE = bridge("Letterboxd links");
  function personSlug(name) {
    if (!name) return null;
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || null;
  }
  JE.initializeLetterboxdLinksScript = async function initializeLetterboxdLinksScript() {
    const logPrefix = "🪼 Jellyfin Enhanced: Letterboxd Links:";
    if (!JE.pluginConfig?.LetterboxdEnabled) {
      console.log(`${logPrefix} Integration disabled in plugin settings.`);
      return;
    }
    console.log(`${logPrefix} Initializing...`);
    let isAddingLinks = false;
    let rescan = false;
    const processedItemIds = /* @__PURE__ */ new Set();
    let lastVisibleItemId = null;
    JE.session?.onUserChange("letterboxd-links", () => {
      processedItemIds.clear();
      lastVisibleItemId = null;
    });
    const LETTERBOXD_ICON_URL = JE.cdn.selfhst("svg/letterboxd.svg");
    const styleId = "letterboxd-links-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
                .letterboxd-link-icon::before {
                    content: "";
                    display: inline-block;
                    width: var(--je-icon-size, 25px);
                    height: var(--je-icon-size, 25px);
                    background-image: url(${LETTERBOXD_ICON_URL});
                    background-size: contain;
                    background-repeat: no-repeat;
                    vertical-align: middle;
                    margin-right: 5px;
                }
            `;
      document.head.appendChild(style);
    }
    function createLinkButton(label, url) {
      const button = externalLink(JE.helpers, url, { title: label });
      if (JE.pluginConfig?.ShowLetterboxdLinkAsText) {
        button.textContent = label;
        button.className = "button-link emby-button letterboxd-link";
      } else {
        button.className = "button-link emby-button letterboxd-link letterboxd-link-icon";
        button.style.setProperty("--je-icon-size", `${JE.helpers.getExternalLinkIconSize()}px`);
      }
      return button;
    }
    async function addLetterboxdLinks() {
      if (isAddingLinks) {
        rescan = true;
        return;
      }
      const visiblePage = visibleDetailPage();
      if (!visiblePage) return;
      const itemId = hashItemId();
      if (!itemId) return;
      if (processedItemIds.has(itemId)) return;
      if (lastVisibleItemId && lastVisibleItemId !== itemId) processedItemIds.clear();
      lastVisibleItemId = itemId;
      const anchorElement = visiblePage.querySelector(".itemExternalLinks");
      document.querySelectorAll("#itemDetailPage.hide .letterboxd-link").forEach((staleLink) => {
        if (staleLink.previousSibling?.nodeType === Node.TEXT_NODE) staleLink.previousSibling.remove();
        staleLink.remove();
      });
      if (!anchorElement || anchorElement.querySelector(".letterboxd-link")) return;
      isAddingLinks = true;
      const session = sessionLease(JE.session);
      try {
        const item = decodeDetailsItem(await lookupItem(JE.helpers, itemId, false));
        if (hashItemId() !== itemId || !anchorElement.isConnected || visibleDetailPage() !== visiblePage || !session()) return;
        if (!item?.Type) return;
        if (item.Type !== "Movie" && item.Type !== "Person") {
          console.log(`${logPrefix} Skipping ${item.Type} - Letterboxd links not supported.`);
          processedItemIds.add(itemId);
          return;
        }
        let letterboxdUrl;
        if (item.Type === "Person") {
          const slug = personSlug(item.Name);
          if (!slug) {
            console.log(`${logPrefix} Could not derive a Letterboxd slug for ${item.Name}.`);
            processedItemIds.add(itemId);
            return;
          }
          letterboxdUrl = `https://letterboxd.com/actor/${slug}`;
        } else {
          const imdbId = item.ProviderIds.Imdb;
          if (!imdbId) {
            console.log(`${logPrefix} No IMDb ID found for ${item.Type}.`);
            processedItemIds.add(itemId);
            return;
          }
          letterboxdUrl = `https://letterboxd.com/imdb/${pathSegment(imdbId)}`;
        }
        anchorElement.appendChild(document.createTextNode(" "));
        anchorElement.appendChild(createLinkButton("Letterboxd", letterboxdUrl));
      } catch (err) {
        console.error(`${logPrefix} Error adding Letterboxd link:`, err);
      } finally {
        isAddingLinks = false;
        if (rescan) {
          rescan = false;
          scheduleLetterboxdLinks();
        }
      }
    }
    let processingLetterboxd = false;
    let letterboxdObserver;
    function scheduleLetterboxdLinks() {
      if (!JE.pluginConfig?.LetterboxdEnabled) {
        letterboxdObserver?.disconnect();
        console.log(`${logPrefix} Stopped - feature disabled`);
        return;
      }
      if (processingLetterboxd) return;
      processingLetterboxd = true;
      const run = () => {
        void addLetterboxdLinks();
        processingLetterboxd = false;
      };
      if (typeof requestIdleCallback !== "undefined") requestIdleCallback(run, { timeout: 500 });
      else setTimeout(run, 100);
    }
    letterboxdObserver = JE.helpers.createObserver("letterboxd-links", scheduleLetterboxdLinks, document.body, { childList: true, subtree: true });
    JE.helpers.onViewPage(scheduleLetterboxdLinks);
    if (typeof requestIdleCallback !== "undefined") requestIdleCallback(() => addLetterboxdLinks(), { timeout: 1e3 });
    else setTimeout(() => addLetterboxdLinks(), 500);
    console.log(`${logPrefix} Letterboxd links integration initialized successfully.`);
  };
})();
})();
//# sourceMappingURL=letterboxd-links.js.map
