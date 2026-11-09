(() => {
"use strict";
(() => {
  // client/src/host/context.ts
  function featureContext(feature, core, slots) {
    const shared = core.core?.featureContext;
    if (typeof shared !== "function") {
      throw new Error(`${feature}: JE.core.featureContext is missing; core/ui-kit.js must load before feature scripts`);
    }
    return shared(feature, core, slots);
  }

  // client/src/features/bookmarks/host.ts
  function bookmarksHost() {
    const host2 = window;
    const JE = host2.JellyfinEnhanced;
    if (!JE) throw new Error("Bookmarks loaded before Jellyfin Enhanced");
    const ctx2 = featureContext("bookmarks", JE, {
      facades: ["bookmarks", "initializeBookmarks", "cleanupBookmarks"],
      internalSlots: ["bookmarksLibrary", "bookmarkLifetimes"],
      internalsObject: () => JE.internals ?? (JE.internals = {})
    });
    const getApi2 = () => {
      const api = host2.ApiClient || host2.ConnectionManager?.currentApiClient();
      if (!api) throw new Error("API client not available");
      return api;
    };
    return { ctx: ctx2, host: host2, getApi: getApi2 };
  }
  function findBridge(host2) {
    if (host2.JE) return host2.JE;
    if (host2.JellyfinEnhanced) return host2.JellyfinEnhanced;
    for (const frame of [window.parent, window.top]) {
      try {
        const parent = frame;
        const candidate = parent?.JE || parent?.JellyfinEnhanced;
        if (candidate) return candidate;
      } catch {
      }
    }
    return null;
  }
  function lease(JE) {
    const owner = JE.userConfig, epoch = JE.session?.getEpoch();
    return () => JE.userConfig === owner && (epoch === void 0 || JE.session?.isCurrent(epoch) === true);
  }

  // client/src/features/bookmarks/lifetime.ts
  function createLifetime(ctx2, name) {
    const JE = ctx2.core, own = ctx2.own;
    own.bookmarkLifetimes ?? (own.bookmarkLifetimes = {});
    own.bookmarkLifetimes[name]?.dispose();
    const cleanup = /* @__PURE__ */ new Set();
    const dialogs = /* @__PURE__ */ new Set();
    let disposed = false;
    let generation = 0;
    const pending = /* @__PURE__ */ new Set();
    const keep = (value) => {
      if (typeof value === "function") cleanup.add(() => value());
      else if (typeof value === "object" && value !== null && "unsubscribe" in value && typeof value.unsubscribe === "function") {
        const unsubscribe = value.unsubscribe.bind(value);
        cleanup.add(() => unsubscribe());
      }
    };
    const keepTeardown = (value) => {
      if (typeof value === "object" && value !== null && "teardown" in value && typeof value.teardown === "function") {
        const teardown = value.teardown.bind(value);
        cleanup.add(() => teardown());
      } else keep(value);
    };
    const listen = (target, event, callback, capture = false) => {
      target.addEventListener(event, callback, capture);
      cleanup.add(() => target.removeEventListener(event, callback, capture));
    };
    const timeout = (callback, delay) => {
      const current = lease(JE), version = generation;
      const cancel = () => {
        window.clearTimeout(id);
        cleanup.delete(cancel);
        pending.delete(cancel);
      };
      const id = window.setTimeout(() => {
        cleanup.delete(cancel);
        pending.delete(cancel);
        if (!disposed && generation === version && current()) callback();
      }, delay);
      cleanup.add(cancel);
      pending.add(cancel);
      return id;
    };
    const interval = (callback, delay) => {
      const id = window.setInterval(() => {
        if (!disposed) callback();
      }, delay);
      cleanup.add(() => window.clearInterval(id));
      return id;
    };
    const modal = (element) => {
      const previousFocus = document.activeElement;
      element.setAttribute("role", "dialog");
      element.setAttribute("aria-modal", "true");
      element.tabIndex = -1;
      const close = () => {
        element.remove();
        cleanup.delete(close);
        dialogs.delete(close);
        document.removeEventListener("viewshow", close);
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      };
      cleanup.add(close);
      dialogs.add(close);
      document.addEventListener("viewshow", close);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
        if (event.key !== "Tab") return;
        const controls = Array.from(element.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (!first || !last) {
          event.preventDefault();
          element.focus();
          return;
        }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      timeout(() => {
        if (element.isConnected) (element.querySelector("input") || element.querySelector("button") || element).focus();
      }, 0);
      return close;
    };
    const cancelPending = () => {
      generation++;
      for (const cancel of pending) cancel();
      for (const close of dialogs) close();
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelPending();
      for (const release of cleanup) release();
      cleanup.clear();
    };
    const result = { dispose, cancelPending, keep: keepTeardown, listen, timeout, interval, modal, current: () => {
      const current = lease(JE), version = generation;
      return () => !disposed && generation === version && current();
    } };
    own.bookmarkLifetimes[name] = result;
    keep(JE.session?.onUserChange("bookmarks-" + name, () => {
      for (const close of dialogs) close();
      document.querySelectorAll(".je-bm-player-modal-overlay, .je-bm-library-modal-overlay, .je-bookmark-marker").forEach((el) => el.remove());
      document.querySelectorAll(".sections.bookmarks").forEach((el) => el.replaceChildren());
    }));
    listen(window, "pagehide", dispose);
    return result;
  }

  // client/src/features/bookmarks/library-init.ts
  var { ctx, host, getApi } = bookmarksHost();
  function install(JE) {
    const lifetime = createLifetime(ctx, "library-init");
    const setInterval = lifetime.interval;
    const internal = ctx.own.bookmarksLibrary = ctx.own.bookmarksLibrary || {};
    if (!JE?.pluginConfig?.BookmarksEnabled) return;
    const {
      isPluginPagesActive,
      injectNavigation,
      setupNavigationWatcher,
      handleNavigation,
      interceptNavigation,
      handleViewShow,
      handleNavClick,
      renderIfSectionExists,
      hookViewEvents
    } = internal;
    if (!isPluginPagesActive || !injectNavigation || !setupNavigationWatcher || !handleNavigation || !interceptNavigation || !handleViewShow || !handleNavClick || !renderIfSectionExists || !hookViewEvents) throw new Error("Bookmarks library entry order invalid");
    const logPrefix = "🪼 Jellyfin Enhanced: Bookmarks Library:";
    function getJE() {
      return findBridge(host);
    }
    const init = () => {
      console.log(`${logPrefix} Initializing (build id: ${Date.now()})...`);
      let attempts = 0;
      const checkReady = setInterval(() => {
        attempts += 1;
        if (attempts > 300) {
          clearInterval(checkReady);
          return;
        }
        const je = getJE();
        const ready = !!(je && je.userConfig && je.bookmarks);
        if (attempts % 10 === 0 || attempts <= 5) {
          console.log(`${logPrefix} ready check #${attempts} (JE=${!!je}, userConfig=${!!(je && je.userConfig)}, bookmarks=${!!(je && je.bookmarks)})`);
        }
        if (ready) {
          clearInterval(checkReady);
          if (!host.JE && je) {
            host.JE = je;
          }
          hookViewEvents();
          if (!isPluginPagesActive() && !JE.pluginConfig?.BookmarksUseCustomTabs && !JE.pluginConfig?.BookmarksUseNativeTab) {
            injectNavigation();
            setupNavigationWatcher();
            lifetime.listen(window, "hashchange", interceptNavigation, true);
            lifetime.listen(window, "popstate", interceptNavigation, true);
            lifetime.listen(document, "click", handleNavClick);
            lifetime.keep(JE.core.navigation.onViewPage((view, element, hash, itemPromise, rawEvent) => {
              if (rawEvent) handleViewShow(rawEvent);
            }));
            lifetime.keep(JE.core.navigation.onNavigate(handleNavigation));
            handleNavigation();
          }
          if (JE.pluginConfig?.BookmarksUseNativeTab) {
            JE.nativeTabs.register("bookmarks", "Bookmarks", (panel) => {
              const marker = document.createElement("div");
              marker.className = "sections bookmarks";
              panel.appendChild(marker);
            }, "location_on");
          }
          lifetime.keep(JE.helpers.observeTabContainers("bookmarks-library-custom-tab", ".sections.bookmarks", renderIfSectionExists));
          renderIfSectionExists();
          console.log(`${logPrefix} ✓ Ready`);
        }
      }, 100);
    };
    if (document.readyState === "loading") {
      lifetime.listen(document, "DOMContentLoaded", init);
    } else {
      init();
    }
  }
  install(ctx.core);
})();
})();
//# sourceMappingURL=bookmarks-library-init.js.map
