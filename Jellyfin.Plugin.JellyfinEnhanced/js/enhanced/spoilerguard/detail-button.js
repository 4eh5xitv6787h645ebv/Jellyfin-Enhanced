(() => {
"use strict";
(() => {
  // client/src/features/spoiler-guard/ownership.ts
  function own(JE2, name, navigation = true) {
    let controller = new AbortController();
    let disposed = false;
    const resources = /* @__PURE__ */ new Set();
    function reset() {
      controller.abort();
      controller = new AbortController();
      for (const dispose of resources) dispose();
      resources.clear();
    }
    const unregister = JE2.session?.onUserChange(`spoilerguard-${name}-ownership`, reset);
    const life = JE2.core?.lifecycle?.register(`spoiler-guard-${name}`);
    if (navigation) life?.teardownOn("navigate");
    life?.onTeardown(reset);
    function lease() {
      const signal = controller.signal;
      const epoch = JE2.session?.getEpoch();
      const sessionLease = JE2.session?.createLease?.();
      const current = () => !disposed && !signal.aborted && (sessionLease ? sessionLease.isCurrent() : epoch === void 0 || JE2.session?.isCurrent(epoch) === true);
      return { signal, current, check() {
        if (!current()) throw new DOMException("Stale Spoiler Guard operation", "AbortError");
      } };
    }
    function track(dispose) {
      resources.add(dispose);
      return () => {
        resources.delete(dispose);
        dispose();
      };
    }
    function later(callback, ms) {
      const token = lease();
      const timer = window.setTimeout(() => {
        resources.delete(cancel);
        if (token.current()) callback();
      }, ms);
      const cancel = () => window.clearTimeout(timer);
      resources.add(cancel);
      return () => {
        resources.delete(cancel);
        cancel();
      };
    }
    function listen(target, event, callback, capture = false) {
      target.addEventListener(event, callback, capture);
      return track(() => target.removeEventListener(event, callback, capture));
    }
    return { lease, reset, track, later, listen, dispose() {
      disposed = true;
      reset();
      unregister?.();
    } };
  }

  // client/src/features/spoiler-guard/host.ts
  function spoilerHost() {
    var _a;
    const host = window;
    const JE2 = host.JellyfinEnhanced;
    if (!JE2) throw new Error("Spoiler Guard loaded before Jellyfin Enhanced");
    const registry = (_a = JE2.internals ?? (JE2.internals = {})).spoilerGuard ?? (_a.spoilerGuard = {});
    function required(key) {
      const value = registry[key];
      if (value == null) throw new Error(`Spoiler Guard loader dependency missing: ${key}`);
      return value;
    }
    const internal2 = {
      get normalizeId() {
        return required("normalizeId");
      },
      set normalizeId(value) {
        registry.normalizeId = value;
      },
      get pendingKey() {
        return required("pendingKey");
      },
      set pendingKey(value) {
        registry.pendingKey = value;
      },
      get kindOf() {
        return required("kindOf");
      },
      set kindOf(value) {
        registry.kindOf = value;
      },
      get loadState() {
        return required("loadState");
      },
      set loadState(value) {
        registry.loadState = value;
      },
      get whenLoaded() {
        return required("whenLoaded");
      },
      set whenLoaded(value) {
        registry.whenLoaded = value;
      },
      get isStateLoaded() {
        return required("isStateLoaded");
      },
      set isStateLoaded(value) {
        registry.isStateLoaded = value;
      },
      get isLoadOk() {
        return required("isLoadOk");
      },
      set isLoadOk(value) {
        registry.isLoadOk = value;
      },
      get isLoaded() {
        return required("isLoaded");
      },
      set isLoaded(value) {
        registry.isLoaded = value;
      },
      get hasAnyState() {
        return required("hasAnyState");
      },
      set hasAnyState(value) {
        registry.hasAnyState = value;
      },
      get isDisableSnoozed() {
        return required("isDisableSnoozed");
      },
      set isDisableSnoozed(value) {
        registry.isDisableSnoozed = value;
      },
      get isEnabledFor() {
        return required("isEnabledFor");
      },
      set isEnabledFor(value) {
        registry.isEnabledFor = value;
      },
      get isMovieEnabledFor() {
        return required("isMovieEnabledFor");
      },
      set isMovieEnabledFor(value) {
        registry.isMovieEnabledFor = value;
      },
      get isCollectionEnabledFor() {
        return required("isCollectionEnabledFor");
      },
      set isCollectionEnabledFor(value) {
        registry.isCollectionEnabledFor = value;
      },
      get isMovieInScope() {
        return required("isMovieInScope");
      },
      set isMovieInScope(value) {
        registry.isMovieInScope = value;
      },
      get isEnabledForKind() {
        return required("isEnabledForKind");
      },
      set isEnabledForKind(value) {
        registry.isEnabledForKind = value;
      },
      get enableForSeries() {
        return required("enableForSeries");
      },
      set enableForSeries(value) {
        registry.enableForSeries = value;
      },
      get disableForSeries() {
        return required("disableForSeries");
      },
      set disableForSeries(value) {
        registry.disableForSeries = value;
      },
      get enableForMovie() {
        return required("enableForMovie");
      },
      set enableForMovie(value) {
        registry.enableForMovie = value;
      },
      get disableForMovie() {
        return required("disableForMovie");
      },
      set disableForMovie(value) {
        registry.disableForMovie = value;
      },
      get enableForCollection() {
        return required("enableForCollection");
      },
      set enableForCollection(value) {
        registry.enableForCollection = value;
      },
      get disableForCollection() {
        return required("disableForCollection");
      },
      set disableForCollection(value) {
        registry.disableForCollection = value;
      },
      get isTmdbPending() {
        return required("isTmdbPending");
      },
      set isTmdbPending(value) {
        registry.isTmdbPending = value;
      },
      get isTmdbEnabled() {
        return required("isTmdbEnabled");
      },
      set isTmdbEnabled(value) {
        registry.isTmdbEnabled = value;
      },
      get enableForTmdb() {
        return required("enableForTmdb");
      },
      set enableForTmdb(value) {
        registry.enableForTmdb = value;
      },
      get disableForTmdb() {
        return required("disableForTmdb");
      },
      set disableForTmdb(value) {
        registry.disableForTmdb = value;
      },
      get getUserPrefs() {
        return required("getUserPrefs");
      },
      set getUserPrefs(value) {
        registry.getUserPrefs = value;
      },
      get setUserPrefs() {
        return required("setUserPrefs");
      },
      set setUserPrefs(value) {
        registry.setUserPrefs = value;
      },
      get setDisableSnooze() {
        return required("setDisableSnooze");
      },
      set setDisableSnooze(value) {
        registry.setDisableSnooze = value;
      },
      get setIdentityCookie() {
        return required("setIdentityCookie");
      },
      set setIdentityCookie(value) {
        registry.setIdentityCookie = value;
      },
      get primeIdentityCookie() {
        return required("primeIdentityCookie");
      },
      set primeIdentityCookie(value) {
        registry.primeIdentityCookie = value;
      },
      get injectStyles() {
        return required("injectStyles");
      },
      set injectStyles(value) {
        registry.injectStyles = value;
      },
      get installWatchedRefresh() {
        return required("installWatchedRefresh");
      },
      set installWatchedRefresh(value) {
        registry.installWatchedRefresh = value;
      },
      get refreshSpoilerableImages() {
        return required("refreshSpoilerableImages");
      },
      set refreshSpoilerableImages(value) {
        registry.refreshSpoilerableImages = value;
      },
      get scheduleFullReload() {
        return required("scheduleFullReload");
      },
      set scheduleFullReload(value) {
        registry.scheduleFullReload = value;
      },
      get bustSpoilerImageUrl() {
        return required("bustSpoilerImageUrl");
      },
      set bustSpoilerImageUrl(value) {
        registry.bustSpoilerImageUrl = value;
      },
      get confirmDisableSpoiler() {
        return required("confirmDisableSpoiler");
      },
      set confirmDisableSpoiler(value) {
        registry.confirmDisableSpoiler = value;
      },
      get addSpoilerBlurButton() {
        return required("addSpoilerBlurButton");
      },
      set addSpoilerBlurButton(value) {
        registry.addSpoilerBlurButton = value;
      },
      get buildSeerrToggle() {
        return required("buildSeerrToggle");
      },
      set buildSeerrToggle(value) {
        registry.buildSeerrToggle = value;
      },
      get appendSeerrToggle() {
        return required("appendSeerrToggle");
      },
      set appendSeerrToggle(value) {
        registry.appendSeerrToggle = value;
      },
      get buildSettingsHtml() {
        return required("buildSettingsHtml");
      },
      set buildSettingsHtml(value) {
        registry.buildSettingsHtml = value;
      },
      get wireSettings() {
        return required("wireSettings");
      },
      set wireSettings(value) {
        registry.wireSettings = value;
      }
    };
    const ApiClient = { getCurrentUserId: () => host.ApiClient?.getCurrentUserId() ?? null };
    return { JE: JE2, internal: internal2, ApiClient, host };
  }

  // client/src/features/spoiler-guard/detail-button.ts
  var { JE, internal } = spoilerHost();
  var owner = own(JE, "detail-button", true);
  var logPrefix = "🪼 Jellyfin Enhanced [SpoilerGuard]:";
  function renderButton(button, enabled) {
    const label = JE.t(enabled ? "spoiler_blur_button_on" : "spoiler_blur_button_off");
    button.classList.toggle("je-spoiler-blur-on", enabled);
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.title = label;
    button.setAttribute("aria-label", label);
    button.replaceChildren();
    const content = document.createElement("div");
    content.className = "detailButton-content";
    const icon = document.createElement("span");
    icon.className = "material-icons detailButton-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = enabled ? "blur_on" : "blur_off";
    content.appendChild(icon);
    button.appendChild(content);
  }
  function placeButton(button, container) {
    const moreButton = container.querySelector(".btnMoreCommands");
    if (moreButton) {
      if (button.nextElementSibling !== moreButton) container.insertBefore(button, moreButton);
    } else if (button.parentNode !== container) {
      container.appendChild(button);
    }
  }
  function performToggle(button, itemId, kind, page, enable) {
    const token = owner.lease();
    const current = () => token.current() && button.isConnected && button.getAttribute("data-je-item-id") === itemId && button.getAttribute("data-je-spoiler-kind") === kind;
    let displayName = "";
    if ((kind === "movie" || kind === "collection") && page) {
      try {
        const title = page.querySelector("h1.itemName-name, h1.itemName, .itemName, h2.itemName-name");
        displayName = title?.textContent?.trim() || "";
      } catch (e) {
        console.warn(`${logPrefix} ${kind} title lookup failed:`, e);
      }
    }
    let operation;
    if (kind === "movie") operation = enable ? internal.enableForMovie(itemId, displayName) : internal.disableForMovie(itemId);
    else if (kind === "collection") operation = enable ? internal.enableForCollection(itemId, displayName) : internal.disableForCollection(itemId);
    else operation = enable ? internal.enableForSeries(itemId) : internal.disableForSeries(itemId);
    operation.then(function() {
      if (!current()) return;
      renderButton(button, enable);
      button.setAttribute("data-je-spoiler-state", enable ? "on" : "off");
      let key;
      if (enable) {
        key = kind === "movie" ? "spoiler_blur_enabled_movie_toast" : kind === "collection" ? "spoiler_blur_enabled_collection_toast" : "spoiler_blur_enabled_toast";
      } else {
        key = kind === "movie" ? "spoiler_blur_disabled_movie_toast" : kind === "collection" ? "spoiler_blur_disabled_collection_toast" : "spoiler_blur_disabled_toast";
      }
      JE.toast?.(JE.t(key));
      try {
        void JE.tagPipeline?.invalidateServerCache?.();
      } catch (e) {
        console.warn(`${logPrefix} tag cache invalidation failed:`, e);
      }
      try {
        if (enable && JE.pluginConfig?.SpoilerStripReviews !== false && internal.getUserPrefs().HideReviews !== false) {
          const reviews = document.querySelector("#itemDetailPage:not(.hide) .tmdb-reviews-section") || document.querySelector(".tmdb-reviews-section");
          reviews?.parentNode?.removeChild(reviews);
        }
      } catch (e) {
        console.warn(`${logPrefix} reviews cleanup failed:`, e);
      }
      try {
        internal.refreshSpoilerableImages();
      } catch (e) {
        console.warn(`${logPrefix} image refresh failed:`, e);
      }
      if (JE.pluginConfig?.SpoilerBlurStrictRefresh === true) internal.scheduleFullReload();
    }).catch(function(err) {
      if (!current()) return;
      console.error(`${logPrefix} toggle failed:`, err);
      JE.toast?.(JE.t("spoiler_blur_error_toast"));
    }).finally(function() {
      if (current()) button.disabled = false;
    });
  }
  function onToggle(button, itemId, kind, page) {
    if (button.disabled || !internal.isLoadOk()) return;
    const token = owner.lease();
    const enable = !internal.isEnabledForKind(kind, itemId);
    button.disabled = true;
    if (enable) {
      performToggle(button, itemId, kind, page, true);
      return;
    }
    internal.confirmDisableSpoiler().then(function(proceed) {
      if (!token.current() || button.getAttribute("data-je-item-id") !== itemId) return;
      if (proceed) performToggle(button, itemId, kind, page, false);
      else button.disabled = false;
    }).catch(function(err) {
      if (!token.current()) return;
      console.warn(`${logPrefix} disable confirmation failed:`, err);
      button.disabled = false;
    });
  }
  internal.addSpoilerBlurButton = function(itemId, visiblePage, itemType) {
    if (JE.pluginConfig?.SpoilerBlurEnabled !== true || !itemId || !visiblePage) return;
    if (!internal.isStateLoaded() || !internal.isLoadOk()) return;
    const kind = internal.kindOf(itemType);
    const container = [".detailButtons", ".itemActionsBottom", ".mainDetailButtons", ".detailButtonsContainer"].map((selector) => visiblePage.querySelector(selector)).find(Boolean);
    if (!container) return;
    const enabled = internal.isEnabledForKind(kind, itemId);
    const state = enabled ? "on" : "off";
    let button = visiblePage.querySelector(".je-spoiler-blur-btn");
    if (!button) {
      button = document.createElement("button");
      button.setAttribute("is", "emby-button");
      button.className = "button-flat detailButton emby-button je-spoiler-blur-btn";
      button.type = "button";
      placeButton(button, container);
      const targetButton = button;
      owner.track(() => targetButton.remove());
      owner.listen(button, "click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        const liveId = targetButton.getAttribute("data-je-item-id") || "";
        const liveKind = targetButton.getAttribute("data-je-spoiler-kind") || "series";
        const livePage = targetButton.closest("#itemDetailPage:not(.hide)") || visiblePage;
        onToggle(targetButton, liveId, liveKind, livePage);
      });
      button.setAttribute("data-je-item-id", itemId);
      button.setAttribute("data-je-spoiler-kind", kind);
      button.setAttribute("data-je-spoiler-state", state);
      renderButton(button, enabled);
      return;
    }
    placeButton(button, container);
    const previousId = button.getAttribute("data-je-item-id");
    const previousKind = button.getAttribute("data-je-spoiler-kind");
    button.setAttribute("data-je-item-id", itemId);
    button.setAttribute("data-je-spoiler-kind", kind);
    if (button.getAttribute("data-je-spoiler-state") !== state || previousId !== itemId || previousKind !== kind) {
      button.setAttribute("data-je-spoiler-state", state);
      renderButton(button, enabled);
    }
  };
})();
})();
//# sourceMappingURL=detail-button.js.map
