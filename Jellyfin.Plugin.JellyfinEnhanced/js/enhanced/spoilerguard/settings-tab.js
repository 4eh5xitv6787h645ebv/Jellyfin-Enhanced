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

  // client/src/host/context.ts
  function featureContext(feature, core, slots) {
    const own2 = {};
    const bind = (keys, target) => {
      for (const key of keys) {
        Object.defineProperty(own2, key, {
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
      own: own2,
      peer: (name) => core[name]
    };
  }

  // client/src/features/spoiler-guard/host.ts
  function spoilerHost() {
    var _a;
    const host = window;
    const JE2 = host.JellyfinEnhanced;
    if (!JE2) throw new Error("Spoiler Guard loaded before Jellyfin Enhanced");
    const ctx = featureContext("spoiler-guard", JE2, {
      facades: ["spoilerBlur"],
      internalSlots: ["spoilerGuard"],
      internalsObject: () => JE2.internals ?? (JE2.internals = {})
    });
    const registry = (_a = ctx.own).spoilerGuard ?? (_a.spoilerGuard = {});
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
    return { JE: JE2, internal: internal2, ApiClient, host, ctx };
  }

  // client/src/features/spoiler-guard/settings-tab.ts
  var { JE, internal } = spoilerHost();
  var owner = own(JE, "settings-tab", true);
  var logPrefix = "🪼 Jellyfin Enhanced [SpoilerGuard]:";
  internal.buildSettingsHtml = function(ctx) {
    if (JE.pluginConfig?.SpoilerBlurEnabled !== true) return "";
    const prefs = internal.getUserPrefs();
    const escape = typeof JE.escapeHtml === "function" ? JE.escapeHtml : (value) => String(value);
    const adminOn = {
      seriesOverview: JE.pluginConfig.SpoilerStripSeriesOverview !== false,
      overview: JE.pluginConfig.SpoilerStripOverview !== false,
      tags: JE.pluginConfig.SpoilerStripTags !== false,
      chapters: JE.pluginConfig.SpoilerStripChapters !== false,
      taglines: JE.pluginConfig.SpoilerStripTaglines !== false,
      ratings: JE.pluginConfig.SpoilerStripRatings !== false,
      premiereDate: JE.pluginConfig.SpoilerStripPremiereDate !== false,
      replaceTitle: JE.pluginConfig.SpoilerReplaceTitle !== false,
      cast: JE.pluginConfig.SpoilerStripCast !== false,
      reviews: JE.pluginConfig.SpoilerStripReviews !== false,
      // Trickplay seek previews (admin SpoilerBlurTrickplay, default on).
      trickplay: JE.pluginConfig.SpoilerBlurTrickplay !== false,
      // Advanced per-category reveals. Gated on the admin having
      // explicitly ENABLED advanced mode (not "not disabled" like the
      // strip categories above) — there is nothing to opt out of while
      // the uniform strip is in force. The row also runs the opposite
      // direction of effect from its neighbours: the same checkbox
      // mechanics (checked => null/inherit, unchecked => false) make
      // this user's Spoiler Guard STRICTER when unchecked, restoring
      // the uniform full strip instead of the admin's reveals.
      advanced: JE.pluginConfig.SpoilerAdvancedMode === true
    };
    const checked = (value) => value === false ? "" : "checked";
    const row = (id, pref, label, description, gate) => gate ? `
            <div style="margin-bottom:8px;padding:12px;background:${ctx.presetBoxBackground};border-radius:6px;border-left:3px solid rgba(255,255,255,0.15);">
                <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                    <input type="checkbox" id="${id}" ${checked(prefs[pref])} data-pref="${pref}" style="width:16px;height:16px;accent-color:${ctx.toggleAccentColor};cursor:pointer;">
                    <div><div style="font-weight:500;font-size:13px;">${escape(JE.t(label))}</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:1px;">${escape(JE.t(description))}</div></div>
                </label>
            </div>` : "";
    return `
            <section class="je-pane" data-pane="spoiler-guard">
                <h3 class="je-pane-title">${JE.icon(JE.IconName.BLUR_ON)} ${escape(JE.t("panel_settings_spoiler_guard"))}</h3>
                <div style="padding:0 16px 16px 16px;">
                    <div style="font-weight:500;font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:8px;padding-left:4px;">${escape(JE.t("panel_settings_spoiler_guard_overrides_section"))}</div>
                    ${row("sbPrefHideSeriesOverview", "HideSeriesDescriptions", "panel_settings_spoiler_guard_override_series_overview", "panel_settings_spoiler_guard_override_series_overview_desc", adminOn.seriesOverview)}
                    ${row("sbPrefHideOverview", "HideEpisodeDescriptions", "panel_settings_spoiler_guard_override_overview", "panel_settings_spoiler_guard_override_overview_desc", adminOn.overview)}
                    ${row("sbPrefReplaceTitle", "ReplaceEpisodeTitles", "panel_settings_spoiler_guard_override_titles", "panel_settings_spoiler_guard_override_titles_desc", adminOn.replaceTitle)}
                    ${row("sbPrefHideChapters", "HideChapterNames", "panel_settings_spoiler_guard_override_chapters", "panel_settings_spoiler_guard_override_chapters_desc", adminOn.chapters)}
                    ${row("sbPrefHideCast", "HideCast", "panel_settings_spoiler_guard_override_cast", "panel_settings_spoiler_guard_override_cast_desc", adminOn.cast)}
                    ${row("sbPrefHideRatings", "HideRatings", "panel_settings_spoiler_guard_override_ratings", "panel_settings_spoiler_guard_override_ratings_desc", adminOn.ratings)}
                    ${row("sbPrefHideAirDate", "HideAirDate", "panel_settings_spoiler_guard_override_air_date", "panel_settings_spoiler_guard_override_air_date_desc", adminOn.premiereDate)}
                    ${row("sbPrefHideTaglines", "HideTaglines", "panel_settings_spoiler_guard_override_taglines", "panel_settings_spoiler_guard_override_taglines_desc", adminOn.taglines)}
                    ${row("sbPrefHideTags", "HideTags", "panel_settings_spoiler_guard_override_tags", "panel_settings_spoiler_guard_override_tags_desc", adminOn.tags)}
                    ${row("sbPrefHideReviews", "HideReviews", "panel_settings_spoiler_guard_override_reviews", "panel_settings_spoiler_guard_override_reviews_desc", adminOn.reviews)}
                    ${row("sbPrefHideTrickplay", "HideTrickplay", "panel_settings_spoiler_guard_override_trickplay", "panel_settings_spoiler_guard_override_trickplay_desc", adminOn.trickplay)}
                    ${row("sbPrefUseAdvancedCategories", "UseAdvancedCategories", "panel_settings_spoiler_guard_override_advanced", "panel_settings_spoiler_guard_override_advanced_desc", adminOn.advanced)}
                    <div style="margin-top:12px;padding:12px;background:${ctx.presetBoxBackground};border-radius:6px;border-left:3px solid ${ctx.toggleAccentColor};">
                        <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                            <input type="checkbox" id="sbPrefSkipDisableConfirm" ${prefs.SkipDisableConfirm ? "checked" : ""} data-pref="SkipDisableConfirm" style="width:16px;height:16px;accent-color:${ctx.toggleAccentColor};cursor:pointer;">
                            <div><div style="font-weight:500;font-size:13px;">${escape(JE.t("panel_settings_spoiler_guard_skip_confirm"))}</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:1px;">${escape(JE.t("panel_settings_spoiler_guard_skip_confirm_desc"))}</div></div>
                        </label>
                    </div>
                </div>
            </section>`;
  };
  internal.wireSettings = function(ctx) {
    owner.reset();
    if (JE.pluginConfig?.SpoilerBlurEnabled !== true) return;
    const token = owner.lease();
    const current = () => token.current() && ctx.help.isConnected;
    ctx.onClose?.(() => {
      if (token.current()) owner.reset();
    });
    const boxes = Array.from(ctx.help.querySelectorAll('input[type="checkbox"][id^="sbPref"][data-pref]'));
    if (boxes.length === 0) return;
    const setDisabled = (disabled) => boxes.forEach((box) => {
      box.disabled = disabled;
    });
    async function save(changed, previousChecked) {
      setDisabled(true);
      try {
        await internal.whenLoaded();
        if (!current()) return;
        if (!internal.isLoadOk()) throw new Error("Initial Spoiler Guard load failed; refusing to overwrite preferences.");
        const prefs = internal.getUserPrefs();
        const key = changed.dataset.pref;
        if (!key) throw new Error("Missing preference key");
        prefs[key] = key === "SkipDisableConfirm" ? !!changed.checked : changed.checked ? null : false;
        await internal.setUserPrefs(prefs);
        if (!current()) return;
      } catch (e) {
        if (!current()) return;
        console.error(`${logPrefix} preference save failed:`, e);
        changed.checked = previousChecked;
        JE.toast?.(JE.t("spoiler_blur_error_toast"));
      } finally {
        if (current()) setDisabled(!internal.isLoadOk());
      }
    }
    boxes.forEach(function(box) {
      owner.listen(box, "change", function() {
        void save(box, !box.checked);
        ctx.resetAutoCloseTimer();
      });
    });
    void (async function() {
      try {
        await internal.whenLoaded();
        if (!current()) return;
        if (!internal.isLoadOk()) {
          setDisabled(true);
          return;
        }
        const prefs = internal.getUserPrefs();
        boxes.forEach(function(box) {
          const key = box.dataset.pref;
          if (!key) return;
          box.checked = key === "SkipDisableConfirm" ? !!prefs[key] : prefs[key] !== false;
        });
      } catch (e) {
        if (!current()) return;
        console.warn(`${logPrefix} preference sync failed:`, e);
        setDisabled(true);
      }
    })();
  };
})();
})();
//# sourceMappingURL=settings-tab.js.map
