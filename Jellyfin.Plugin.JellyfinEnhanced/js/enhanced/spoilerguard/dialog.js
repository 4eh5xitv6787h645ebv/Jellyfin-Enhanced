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
    const host2 = window;
    const JE2 = host2.JellyfinEnhanced;
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
    const ApiClient = { getCurrentUserId: () => host2.ApiClient?.getCurrentUserId() ?? null };
    return { JE: JE2, internal: internal2, ApiClient, host: host2 };
  }

  // client/src/features/spoiler-guard/dialog.ts
  var { JE, internal, host } = spoilerHost();
  var owner = own(JE, "dialog", true);
  var logPrefix = "🪼 Jellyfin Enhanced [SpoilerGuard]:";
  function showConfirmDialog() {
    const token = owner.lease();
    const title = JE.t("spoiler_disable_confirm_title");
    const body = JE.t("spoiler_disable_confirm_body");
    const snoozeLabel = JE.t("spoiler_disable_confirm_snooze");
    const marker = `je-sb-snooze-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
    const escape = typeof JE.escapeHtml === "function" ? JE.escapeHtml : (value) => String(value);
    const html = `<div>${escape(body)}</div><label class="${marker}" style="display:flex;align-items:center;gap:.5em;margin-top:1em;cursor:pointer;"><input type="checkbox"><span>${escape(snoozeLabel)}</span></label>`;
    return new Promise(function(resolve) {
      if (!host.Dashboard || typeof host.Dashboard.confirm !== "function") {
        console.warn(`${logPrefix} Dashboard.confirm unavailable; using native confirm without snooze`);
        resolve(token.current() && window.confirm(`${title}

${body}`));
        return;
      }
      if (!token.current()) {
        resolve(false);
        return;
      }
      const cancel = () => {
        cleanup();
        resolve(false);
      };
      token.signal.addEventListener("abort", cancel, { once: true });
      let snoozeChecked = false;
      function captureChange(event) {
        try {
          const target = event.target;
          if (target instanceof HTMLInputElement && target.type === "checkbox" && target.closest(`.${marker}`)) {
            snoozeChecked = !!target.checked;
          }
        } catch (_) {
        }
      }
      function cleanup() {
        document.removeEventListener("change", captureChange, true);
        token.signal.removeEventListener("abort", cancel);
      }
      document.addEventListener("change", captureChange, true);
      try {
        host.Dashboard.confirm(html, title, function(ok) {
          try {
            const checkbox = document.querySelector(`.${marker} input[type="checkbox"]`);
            if (checkbox) snoozeChecked = !!checkbox.checked;
          } catch (_) {
          }
          cleanup();
          const confirmed = !!ok && token.current();
          if (confirmed && snoozeChecked) internal.setDisableSnooze();
          resolve(confirmed);
        });
      } catch (e) {
        cleanup();
        console.warn(`${logPrefix} Dashboard.confirm failed; using native confirm:`, e);
        resolve(token.current() && window.confirm(`${title}

${body}`));
      }
    });
  }
  internal.confirmDisableSpoiler = function() {
    const token = owner.lease();
    return internal.whenLoaded().then(function() {
      if (!token.current() || !internal.isLoadOk()) return false;
      if (internal.getUserPrefs().SkipDisableConfirm) return true;
      if (internal.isDisableSnoozed()) return true;
      return showConfirmDialog();
    });
  };
})();
})();
//# sourceMappingURL=dialog.js.map
