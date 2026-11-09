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
  function serverId() {
    const id = api().serverId();
    return typeof id === "string" ? id : "";
  }
  function dashboard() {
    return hostWindow().Dashboard;
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
  function tagListRoute(tag, serverId2) {
    return `list.html?type=tag&tag=${encodeURIComponent(tag)}&serverId=${serverId2}`;
  }
  function navigateRoute(route) {
    const host = dashboard();
    if (host && typeof host.navigate === "function") host.navigate(route);
    else window.location.hash = `!/${route}`;
  }

  // client/src/features/details-providers/arr-domain.ts
  function slugifyTagName(name) {
    try {
      return name.toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "-").replace(/--+/g, "-").replace(/^-+|-+$/g, "");
    } catch {
      return name;
    }
  }
  var lines = (raw, prefix) => raw.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).map((line) => `${prefix}${line}`);
  function relevantArrTags(tags, prefix, allowRaw, hideRaw) {
    const allowed = lines(allowRaw, prefix).map((tag) => tag.toLowerCase());
    const hidden = lines(hideRaw, prefix).map((tag) => tag.toLowerCase());
    let relevant = tags.filter((tag) => tag.startsWith(prefix));
    if (hidden.length > 0) relevant = relevant.filter((tag) => !hidden.includes(tag.toLowerCase()));
    if (allowed.length > 0) relevant = relevant.filter((tag) => allowed.includes(tag.toLowerCase()));
    return relevant;
  }

  // client/src/features/details-providers/arr-tag-links.ts
  var JE = bridge("Arr tag links");
  JE.initializeArrTagLinksScript = async function initializeArrTagLinksScript() {
    const logPrefix = "🪼 Jellyfin Enhanced: Arr Tag Links:";
    if (!JE.pluginConfig?.ArrTagsShowAsLinks) {
      console.log(`${logPrefix} Tag links display disabled in plugin settings.`);
      return;
    }
    console.log(`${logPrefix} Initializing...`);
    let isAddingLinks = false;
    let rescan = false;
    const withoutTags = /* @__PURE__ */ new Set();
    JE.session?.onUserChange("arr-tag-links", () => withoutTags.clear());
    function removeLinks(container) {
      container.querySelectorAll(".arr-tag-link").forEach((link) => {
        if (link.previousSibling?.nodeType === Node.TEXT_NODE) link.previousSibling.remove();
        link.remove();
      });
    }
    async function addTagLinks(itemId, externalLinksContainer) {
      if (isAddingLinks) {
        rescan = true;
        return;
      }
      const existing = externalLinksContainer.querySelector(".arr-tag-link");
      if (existing && existing.dataset.itemId === itemId) return;
      removeLinks(externalLinksContainer);
      if (withoutTags.has(itemId)) return;
      isAddingLinks = true;
      const session = sessionLease(JE.session);
      const stillValid = () => session() && hashItemId() === itemId && externalLinksContainer.isConnected && visibleDetailPage()?.contains(externalLinksContainer) === true;
      try {
        const item = await lookupDetailsItem(JE.helpers, itemId, false);
        if (!stillValid()) return;
        const tags = item?.Tags ?? [];
        const tagPrefix = JE.pluginConfig?.ArrTagsPrefix || "JE Arr Tag: ";
        const relevantTags = tags.length === 0 ? [] : relevantArrTags(
          tags,
          tagPrefix,
          JE.pluginConfig?.ArrTagsLinksFilter || "",
          JE.pluginConfig?.ArrTagsLinksHideFilter || ""
        );
        if (relevantTags.length === 0) {
          withoutTags.add(itemId);
          return;
        }
        if (externalLinksContainer.querySelector(".arr-tag-link")) return;
        const server = serverId();
        for (const tag of relevantTags) {
          externalLinksContainer.appendChild(document.createTextNode(" "));
          const tagName = tag.slice(tagPrefix.length).trim();
          const slug = slugifyTagName(tagName);
          const route = tagListRoute(tag, server);
          const link = document.createElement("a");
          link.setAttribute("is", "emby-linkbutton");
          link.className = "button-link emby-button arr-tag-link";
          link.href = `#!/${route}`;
          link.title = `View all items with tag: ${tag}`;
          link.addEventListener("click", (event) => {
            event.preventDefault();
            navigateRoute(route);
          });
          link.dataset.itemId = itemId;
          link.dataset.id = slug;
          link.dataset.tag = tag;
          link.dataset.tagName = tagName;
          link.dataset.tagPrefix = tagPrefix;
          const icon = document.createElement("span");
          icon.className = "arr-tag-link-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.innerHTML = JE.icon(JE.IconName.TAG);
          icon.style.marginRight = "5px";
          const label = document.createElement("span");
          label.className = "arr-tag-link-text";
          label.dataset.id = slug;
          label.dataset.tag = tag;
          label.dataset.tagName = tagName;
          label.dataset.tagPrefix = tagPrefix;
          label.textContent = tag;
          link.append(icon, label);
          externalLinksContainer.appendChild(link);
        }
      } catch (err) {
        console.error(`${logPrefix} Error adding tag links:`, err);
      } finally {
        isAddingLinks = false;
        if (rescan) {
          rescan = false;
          scheduleCheck();
        }
      }
    }
    function checkAndAddLinks() {
      const externalLinksContainer = visibleDetailPage()?.querySelector(".itemExternalLinks");
      if (!externalLinksContainer) return;
      const itemId = hashItemId();
      if (itemId) void addTagLinks(itemId, externalLinksContainer);
    }
    const scheduleCheck = JE.helpers.debounce(checkAndAddLinks, 100);
    JE.helpers.createObserver("arr-tag-links", () => {
      if (!JE.pluginConfig?.ArrTagsShowAsLinks) return;
      scheduleCheck();
    }, document.body, { childList: true, subtree: true });
    const lifecycle = JE.core.lifecycle.register("arr-tag-links");
    lifecycle.track(JE.core.navigation.onNavigate(scheduleCheck));
    lifecycle.track(JE.core.navigation.onViewPage(scheduleCheck));
    setTimeout(checkAndAddLinks, 500);
    console.log(`${logPrefix} Initialized successfully`);
  };
})();
})();
//# sourceMappingURL=arr-tag-links.js.map
