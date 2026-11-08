(() => {
"use strict";
(() => {
  // client/src/features/spoiler-guard/wire.ts
  function record(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid Spoiler Guard object");
    return Object.fromEntries(Object.entries(value));
  }
  function decodeSeerr(value) {
    const input = record(value);
    const id = input.id;
    if (typeof id !== "number" && typeof id !== "string") throw new Error("Invalid Seerr ID");
    const media = input.mediaInfo == null ? {} : record(input.mediaInfo);
    const items = input.jeSpoilerGuardItems ?? [];
    if (!Array.isArray(items)) throw new Error("Invalid guarded item list");
    const guarded = [];
    for (const item of items) {
      if (typeof item !== "string") throw new Error("Invalid guarded item");
      guarded.push(item);
    }
    for (const key of ["jeSpoilerGuard", "jeSpoilerGuardInherited"]) {
      if (input[key] !== void 0 && typeof input[key] !== "boolean") throw new Error("Invalid guard verdict");
    }
    if (media.jellyfinMediaId != null && typeof media.jellyfinMediaId !== "string") throw new Error("Invalid Jellyfin ID");
    return {
      id,
      title: typeof input.title === "string" ? input.title : "",
      name: typeof input.name === "string" ? input.name : "",
      mediaInfo: { jellyfinMediaId: typeof media.jellyfinMediaId === "string" ? media.jellyfinMediaId : null },
      jeSpoilerGuard: input.jeSpoilerGuard === true,
      jeSpoilerGuardInherited: input.jeSpoilerGuardInherited === true,
      jeSpoilerGuardItems: guarded
    };
  }

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

  // client/src/host/spoiler-host.ts
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

  // client/src/features/spoiler-guard/seerr-toggle.ts
  var { JE, internal } = spoilerHost();
  var owner = own(JE, "seerr-toggle", true);
  var logPrefix = "🪼 Jellyfin Enhanced [SpoilerGuard]:";
  internal.buildSeerrToggle = function(raw, mediaType) {
    const data = decodeSeerr(raw);
    const token = owner.lease();
    if (JE.pluginConfig?.SpoilerBlurEnabled !== true) return null;
    if (mediaType !== "tv" && mediaType !== "movie") return null;
    const tmdbId = data?.id;
    if (!tmdbId) return null;
    const jellyfinMediaId = data?.mediaInfo?.jellyfinMediaId || null;
    const displayName = data?.title || data?.name || "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "je-spoiler-pending-btn";
    button.dataset.jeTmdbId = String(tmdbId);
    button.dataset.jeMediaType = mediaType;
    const icon = document.createElement("span");
    icon.className = "material-icons";
    const label = document.createElement("span");
    button.appendChild(icon);
    button.appendChild(label);
    const inherited = data?.jeSpoilerGuardInherited === true;
    function isEnabled() {
      return data?.jeSpoilerGuard === true || internal.isTmdbEnabled(mediaType, tmdbId, jellyfinMediaId);
    }
    function refresh() {
      if (!token.current()) {
        button.disabled = true;
        return;
      }
      const enabled = isEnabled();
      const onLabel = internal.isTmdbPending(mediaType, tmdbId) ? "spoiler_blur_pending_button_on" : "spoiler_blur_button_on";
      const text = JE.t(enabled ? onLabel : "spoiler_blur_pending_button_off");
      button.classList.toggle("je-spoiler-pending-on", enabled);
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
      const hint = JE.t("spoiler_blur_inherited_hint");
      button.title = inherited && hint !== "spoiler_blur_inherited_hint" ? hint : text;
      button.disabled = inherited || internal.isStateLoaded() && !internal.isLoadOk();
      icon.textContent = enabled ? "blur_on" : "blur_off";
      label.textContent = text;
    }
    refresh();
    internal.whenLoaded().then(refresh).catch(function() {
    });
    owner.listen(button, "click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      let wasEnabled = isEnabled();
      const modal = button.closest(".je-more-info-modal");
      const epoch = JE.session ? JE.session.getEpoch() : 0;
      const sameUser = () => token.current() && (!JE.session || JE.session.isCurrent(epoch));
      const sameView = () => sameUser() && button.isConnected && modal?.isConnected === true && button.closest(".je-more-info-modal") === modal && !("_isClosing" in modal && modal._isClosing === true);
      void (async function() {
        let changed = false;
        try {
          await internal.whenLoaded();
          if (!sameView() || !internal.isLoadOk()) return;
          wasEnabled = isEnabled();
          if (wasEnabled) {
            if (!sameView() || !await internal.confirmDisableSpoiler() || !sameView()) return;
            const result = await internal.disableForTmdb(mediaType, tmdbId);
            if (!sameView()) return;
            const items = data?.jeSpoilerGuardItems || [];
            const outcomes = await Promise.allSettled(items.map((id) => sameView() ? mediaType === "tv" ? internal.disableForSeries(id) : internal.disableForMovie(id) : Promise.resolve()));
            if (!sameView()) return;
            const removed = result?.removed !== false || outcomes.some((outcome) => outcome.status === "fulfilled");
            const failed = !removed || outcomes.some((outcome) => outcome.status === "rejected");
            JE.toast?.(JE.t(failed ? "spoiler_blur_pending_error_toast" : "spoiler_blur_pending_disabled_toast"));
            if (!removed) return;
          } else {
            const result = await internal.enableForTmdb(mediaType, tmdbId, displayName);
            if (!sameView()) return;
            JE.toast?.(JE.t(result?.promoted === "pending" ? "spoiler_blur_pending_enabled_toast" : "spoiler_blur_enabled_toast"));
          }
          changed = true;
        } catch (e) {
          if (!sameView()) return;
          console.warn(`${logPrefix} Seerr toggle failed:`, e);
          JE.toast?.(JE.t("spoiler_blur_pending_error_toast"));
        } finally {
          if (sameView()) refresh();
          button.disabled = inherited || !sameView() || !internal.isLoadOk();
        }
        if (changed && sameView()) {
          try {
            await JE.jellyseerrMoreInfo?.open?.(tmdbId, mediaType);
          } catch (error) {
            if (sameView()) console.warn(`${logPrefix} Seerr refresh failed:`, error);
          }
        }
      })();
    });
    return button;
  };
  internal.appendSeerrToggle = function(mount, raw, mediaType) {
    if (!mount) return;
    try {
      const button = internal.buildSeerrToggle(raw, mediaType);
      if (button) mount.appendChild(button);
    } catch (e) {
      console.warn(`${logPrefix} Seerr toggle render failed:`, e);
    }
  };
})();
})();
//# sourceMappingURL=seerr-toggle.js.map
