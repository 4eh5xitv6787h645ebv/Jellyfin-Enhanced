(() => {
"use strict";
(() => {
  // client/src/host/context.ts
  function featureContext(feature, core, slots) {
    const own = {};
    const bind = (keys, target) => {
      for (const key of keys) {
        Object.defineProperty(own, key, {
          enumerable: true,
          get: () => target()[key],
          set: (value) => {
            target()[key] = value;
          }
        });
      }
    };
    bind(slots.facades ?? [], () => core);
    const internalsObject = slots.internalsObject;
    if (slots.internalSlots?.length) {
      if (!internalsObject) throw new Error(`${feature}: internal slots need the host's internalsObject accessor`);
      bind(slots.internalSlots, internalsObject);
    }
    return {
      feature,
      core,
      own,
      peer: (name) => core[name]
    };
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
  function hasApi() {
    return hostWindow().ApiClient !== void 0;
  }
  function currentUserId() {
    const id = hostWindow().ApiClient?.getCurrentUserId();
    return typeof id === "string" && id ? id : null;
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

  // client/src/features/details-providers/details-page.ts
  var JE = bridge("Details page features");
  var ctx = detailsContext(JE);
  void ctx.own.features;
  var features = () => {
    var _a;
    return (_a = ctx.own).features ?? (_a.features = {});
  };
  var lastDetailsItemId = null;
  var lastDetailsLease = null;
  var lastDetailsItemType = null;
  var lastDetailsDefaultSourceId = null;
  var itemTypeFetch = null;
  var FEATURES_SUPPORTED_TYPES = ["Episode", "Season", "Series", "Movie", "BoxSet", "Playlist"];
  var AUDIO_LANGUAGES_SUPPORTED_TYPES = ["Episode", "Season", "Series", "Movie"];
  var HIDE_SUPPORTED_TYPES = ["Movie", "Series", "Episode", "Season"];
  function label(key, fallback) {
    const value = JE.t(key);
    return value !== key ? value : fallback;
  }
  function singleSourceId(item) {
    const sources = item?.MediaSources;
    return sources?.length === 1 ? sources[0]?.Id || null : null;
  }
  function addHideContentButton(hidden, itemId, visiblePage, itemType) {
    const settings = hidden.getSettings();
    if (!settings.enabled || !settings.showHideButtons) return;
    if (itemType === "Person") {
      if (!settings.showButtonCast) return;
    } else {
      if (settings.showButtonDetails === false) return;
      if (!itemType || !HIDE_SUPPORTED_TYPES.includes(itemType)) return;
    }
    if (visiblePage.querySelector(".je-detail-hide-btn")) return;
    let buttonContainer = null;
    for (const selector of [".detailButtons", ".itemActionsBottom", ".mainDetailButtons", ".detailButtonsContainer"]) {
      buttonContainer = visiblePage.querySelector(selector);
      if (buttonContainer) break;
    }
    if (!buttonContainer) return;
    const buttonLease = detailsLease(JE.session, itemId, visiblePage);
    const button = document.createElement("button");
    button.setAttribute("is", "emby-button");
    button.className = "button-flat detailButton emby-button je-detail-hide-btn";
    button.type = "button";
    const hideLabel = label("hidden_content_hide_button", "Hide");
    const hiddenLabel = label("hidden_content_already_hidden", "Hidden");
    const unhideLabel = label("hidden_content_unhide", "Unhide");
    const content = document.createElement("div");
    content.className = "detailButton-content";
    button.appendChild(content);
    const renderContent = (text, iconName) => {
      content.replaceChildren();
      const icon = document.createElement("span");
      icon.className = "material-icons detailButton-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = iconName || "visibility";
      content.appendChild(icon);
      if (text) {
        const textSpan = document.createElement("span");
        textSpan.className = "detailButton-icon-text";
        textSpan.textContent = text;
        content.appendChild(textSpan);
      }
    };
    const setHiddenState = () => {
      button.classList.add("je-already-hidden");
      button.setAttribute("aria-label", hiddenLabel);
      button.title = hiddenLabel;
      renderContent("", "visibility_off");
      button.onmouseenter = () => {
        button.title = unhideLabel;
      };
      button.onmouseleave = () => {
        button.title = hiddenLabel;
      };
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!buttonLease.current()) return;
        hidden.unhideItem(itemId);
        setHideState();
      };
    };
    const setHideState = () => {
      button.classList.remove("je-already-hidden");
      button.setAttribute("aria-label", hideLabel);
      button.title = hideLabel;
      renderContent("", "visibility");
      button.onmouseenter = null;
      button.onmouseleave = null;
      button.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!buttonLease.current()) return;
        const clickLease = detailsLease(JE.session, itemId, visiblePage);
        const nameEl = visiblePage.querySelector('.itemName, h1, h2, [class*="itemName"]');
        const itemName = nameEl?.textContent?.trim() || "Unknown";
        let tmdbId = "", seriesId = "", seriesName = "";
        let seasonNumber = null, episodeNumber = null;
        try {
          const item = await lookupDetailsItem(JE.helpers, itemId, true);
          tmdbId = item?.ProviderIds.Tmdb || "";
          seriesId = item?.SeriesId || "";
          seriesName = item?.SeriesName || "";
          seasonNumber = item?.ParentIndexNumber ?? null;
          episodeNumber = item?.IndexNumber ?? null;
        } catch (err) {
          console.warn("🪼 Jellyfin Enhanced: Could not fetch item metadata for hide button", err);
        }
        if (!clickLease.current()) return;
        const baseItemData = {
          itemId,
          name: itemName,
          type: itemType ?? "",
          tmdbId,
          seriesId,
          seriesName,
          seasonNumber,
          episodeNumber
        };
        if (itemType === "Episode" && seriesId) {
          hidden.confirmAndHide(baseItemData, () => {
            if (clickLease.current()) setHiddenState();
          }, {
            showEpisodeChoice: true,
            onChooseShow: async () => {
              if (!clickLease.current()) return;
              let seriesTmdbId = "";
              try {
                const series = decodeDetailsItem(await api().getItem(currentUserId(), seriesId));
                seriesTmdbId = series?.ProviderIds.Tmdb || "";
              } catch (err) {
                console.warn("🪼 Jellyfin Enhanced: Could not fetch series metadata for hide-show action", err);
              }
              if (!clickLease.current()) return;
              hidden.hideItem({ itemId: seriesId, name: seriesName || itemName, type: "Series", tmdbId: seriesTmdbId, posterPath: "" });
              setHiddenState();
            }
          });
        } else {
          hidden.confirmAndHide(baseItemData, () => {
            if (clickLease.current()) setHiddenState();
          });
        }
      };
    };
    if (hidden.isHidden(itemId)) setHiddenState();
    else setHideState();
    const moreButton = buttonContainer.querySelector(".btnMoreCommands");
    if (moreButton) buttonContainer.insertBefore(button, moreButton);
    else buttonContainer.appendChild(button);
  }
  var JE_INFO_CHIP = /\bmediaInfoItem-(watchProgress|fileSize|audioLanguage|releaseDate)\b/;
  function hasJellyfinInfo(container) {
    for (const child of container.children) {
      if (!JE_INFO_CHIP.test(child.className)) return true;
    }
    return false;
  }
  function runItemDetails(settled) {
    const visiblePage = visibleDetailPage();
    if (!visiblePage) return;
    const container = visiblePage.querySelector(".itemMiscInfo.itemMiscInfo-primary");
    if (!container) return;
    try {
      const itemId = hashItemId();
      if (!itemId) return;
      if (lastDetailsItemId !== itemId || !lastDetailsLease?.current()) {
        visiblePage.querySelectorAll(".je-detail-hide-btn").forEach((button) => button.remove());
        lastDetailsLease = detailsLease(JE.session, itemId, visiblePage);
        lastDetailsItemId = itemId;
        lastDetailsItemType = null;
        lastDetailsDefaultSourceId = null;
      }
      if (!lastDetailsItemType) {
        if (itemTypeFetch?.itemId !== itemId || !itemTypeFetch.current()) {
          const lease = detailsLease(JE.session, itemId, visiblePage);
          const lookup = { itemId, current: lease.current };
          itemTypeFetch = lookup;
          lookupItem(JE.helpers, itemId, true).then((raw) => {
            if (itemTypeFetch === lookup) itemTypeFetch = null;
            if (lastDetailsItemId !== itemId || !lease.current()) return;
            const item = decodeDetailsItem(raw);
            if (!item?.Type) return;
            lastDetailsItemType = item?.Type || null;
            lastDetailsDefaultSourceId = singleSourceId(item);
            runItemDetails(false);
          }).catch(() => {
            if (itemTypeFetch === lookup) itemTypeFetch = null;
          });
        }
        return;
      }
      const itemType = lastDetailsItemType;
      const hiddenContent = ctx.peer("hiddenContent");
      if (hiddenContent) addHideContentButton(hiddenContent, itemId, visiblePage, itemType);
      const spoilerBlur = ctx.peer("spoilerBlur");
      const addSpoilerButton = spoilerBlur?.addSpoilerBlurButton;
      if ((itemType === "Series" || itemType === "Movie" || itemType === "BoxSet") && typeof addSpoilerButton === "function") {
        addSpoilerButton.call(spoilerBlur, itemId, visiblePage, itemType);
      }
      if (!FEATURES_SUPPORTED_TYPES.includes(itemType)) return;
      if (!settled && !hasJellyfinInfo(container)) return;
      if (visit && visit.itemId === itemId && visit.view === visiblePage) startPeoplePrefetch(visit);
      const sourceSelect = visiblePage.querySelector(".selectSource");
      const selectedSourceId = sourceSelect?.value || (sourceSelect && sourceSelect.options.length === 0 ? lastDetailsDefaultSourceId : null);
      const settings = JE.currentSettings;
      const chips = features();
      if (settings?.showWatchProgress) chips.displayWatchProgress?.(itemId, container, selectedSourceId);
      if (settings?.showFileSizes) chips.displayItemSize?.(itemId, container, selectedSourceId);
      if (settings?.showAudioLanguages && AUDIO_LANGUAGES_SUPPORTED_TYPES.includes(itemType)) {
        chips.displayAudioLanguages?.(itemId, container, selectedSourceId);
      }
      if (JE.pluginConfig?.ShowReleaseDates && JE.pluginConfig.TmdbEnabled && AUDIO_LANGUAGES_SUPPORTED_TYPES.includes(itemType)) {
        chips.displayReleaseDate?.(itemId, container);
      }
    } catch (e) {
      console.warn("🪼 Jellyfin Enhanced: Error in item details handler", e);
    }
  }
  var settledItemDetails = JE.helpers.debounce(() => runItemDetails(true), 100);
  var earlyItemDetails = JE.helpers.debounce(() => runItemDetails(false), 16, { maxWait: 100 });
  var handleItemDetails = () => {
    earlyItemDetails();
    settledItemDetails();
  };
  var visit = null;
  function endDetailsVisit() {
    const ended = visit;
    if (!ended) return;
    visit = null;
    features().discardItemStatsPrefetch?.(ended);
    features().discardReleasePrefetch?.(ended);
    ctx.peer("peopleTags")?.leave?.(ended.itemId);
  }
  function beginDetailsVisit(view, detail) {
    endDetailsVisit();
    const itemId = hashItemId();
    const paramsId = field(field(detail, "params"), "id");
    if (!itemId || paramsId && paramsId !== itemId) return;
    const settings = JE.currentSettings || {};
    const config = JE.pluginConfig || {};
    if (!(settings.showWatchProgress || settings.showFileSizes || config.ShowReleaseDates && config.TmdbEnabled || settings.peopleTagsEnabled && ctx.peer("peopleTags"))) return;
    if (lastDetailsItemId === itemId && lastDetailsItemType) return;
    const userId = currentUserId();
    const getItemCached = JE.helpers.getItemCached;
    if (!userId || !getItemCached) return;
    const current = visit = { itemId, view, epoch: JE.session ? JE.session.getEpoch() : 0, item: null, peopleStarted: false };
    getItemCached.call(JE.helpers, itemId, { userId }).then((item) => {
      if (visit !== current || !item) return;
      current.item = item;
      setTimeout(() => prefetchChipData(current), 0);
    }).catch(() => {
    });
  }
  function visitLive(current) {
    return visit === current && (!JE.session || JE.session.isCurrent(current.epoch)) && hashItemId() === current.itemId && current.view.isConnected && !current.view.classList.contains("hide");
  }
  function prefetchChipData(current) {
    if (!visitLive(current)) return;
    const item = decodeDetailsItem(current.item);
    const settings = JE.currentSettings || {};
    const config = JE.pluginConfig || {};
    const sources = item?.MediaSources;
    const type = item?.Type ?? "";
    if (FEATURES_SUPPORTED_TYPES.includes(type) && (settings.showWatchProgress || settings.showFileSizes) && (!sources || sources.length <= 1)) {
      features().prefetchItemStats?.(
        current.itemId,
        sources?.length === 1 ? sources[0]?.Id || null : null,
        { watchProgress: !!settings.showWatchProgress, fileSize: !!settings.showFileSizes },
        current
      );
    }
    if (config.ShowReleaseDates && config.TmdbEnabled && AUDIO_LANGUAGES_SUPPORTED_TYPES.includes(type)) {
      features().prefetchReleaseDate?.(current.itemId, current.item, current);
    }
    const row = current.view.querySelector(".itemMiscInfo.itemMiscInfo-primary");
    if (row && hasJellyfinInfo(row)) startPeoplePrefetch(current);
  }
  function startPeoplePrefetch(current) {
    if (current.peopleStarted || !current.item || !visitLive(current)) return;
    current.peopleStarted = true;
    ctx.peer("peopleTags")?.prefetch?.(current.itemId, current.item, current.view, current.epoch);
  }
  JE.core.navigation.onViewPage((_view, _element, _hash, _itemPromise, rawEvent) => {
    const target = rawEvent?.target;
    if (target instanceof Element && target.id === "itemDetailPage" && field(eventDetail(rawEvent), "isRestored") !== true) {
      beginDetailsVisit(target, eventDetail(rawEvent));
    }
  });
  JE.core.navigation.onNavigate(() => {
    if (visit && hashItemId() !== visit.itemId) endDetailsVisit();
  });
  JE.session?.onUserChange("details-prefetch", () => {
    endDetailsVisit();
    lastDetailsItemId = null;
    lastDetailsLease = null;
    lastDetailsItemType = null;
    lastDetailsDefaultSourceId = null;
    itemTypeFetch = null;
    document.querySelectorAll(".je-detail-hide-btn").forEach((button) => button.remove());
  });
  function eventDetail(event) {
    return event && "detail" in event ? event.detail : void 0;
  }
  JE.helpers.createObserver("item-details-info", () => handleItemDetails(), document.body, { childList: true, subtree: true });
  JE.helpers.onViewPage(() => handleItemDetails());
})();
})();
//# sourceMappingURL=features-details-page.js.map
