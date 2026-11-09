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

  // client/src/features/spoiler-guard/image-refresh.ts
  var { JE, internal } = spoilerHost();
  var owner = own(JE, "image-refresh", true);
  var logPrefix = "🪼 Jellyfin Enhanced [SpoilerGuard]:";
  var imagePath = /\/Items\/[a-f0-9-]+\/Images\//i;
  var cancelReload;
  internal.bustSpoilerImageUrl = function(url, cacheBuster) {
    if (typeof url !== "string" || !url || !imagePath.test(url)) return url;
    const cleaned = url.replace(/([?&])_sbcb=\d+&?/g, "$1").replace(/[?&]$/, "");
    return `${cleaned}${cleaned.includes("?") ? "&" : "?"}${cacheBuster}`;
  };
  internal.refreshSpoilerableImages = function() {
    const cacheBuster = `_sbcb=${Date.now()}`;
    const bust = (url) => internal.bustSpoilerImageUrl(url, cacheBuster);
    document.querySelectorAll('img[src*="/Items/"], img[srcset*="/Items/"]').forEach(function(img) {
      const src = img.getAttribute("src") || "";
      if (imagePath.test(src)) img.setAttribute("src", bust(src));
      const srcset = img.getAttribute("srcset");
      if (srcset && imagePath.test(srcset)) {
        img.setAttribute("srcset", srcset.replace(
          /([^\s,]+)(?=\s*[\d.]+[wx]|\s*,|\s*$)/g,
          (url) => imagePath.test(url) ? bust(url) : url
        ));
      }
    });
    document.querySelectorAll('source[srcset*="/Items/"]').forEach(function(source) {
      const srcset = source.getAttribute("srcset") || "";
      if (imagePath.test(srcset)) {
        source.setAttribute("srcset", srcset.replace(
          /([^\s,]+)(?=\s*[\d.]+[wx]|\s*,|\s*$)/g,
          (url) => imagePath.test(url) ? bust(url) : url
        ));
      }
    });
    document.querySelectorAll('[style*="/Items/"]').forEach(function(element) {
      const style = element.getAttribute("style") || "";
      if (!imagePath.test(style)) return;
      const next = style.replace(
        /url\((["']?)([^"')]+)\1\)/gi,
        (_match, quote, url) => `url(${quote}${bust(url)}${quote})`
      );
      if (next !== style) element.setAttribute("style", next);
    });
  };
  internal.scheduleFullReload = function() {
    cancelReload?.();
    cancelReload = owner.later(function() {
      cancelReload = void 0;
      try {
        location.reload();
      } catch (e) {
        console.warn(`${logPrefix} reload failed:`, e);
      }
    }, 600);
  };
})();
})();
//# sourceMappingURL=image-refresh.js.map
