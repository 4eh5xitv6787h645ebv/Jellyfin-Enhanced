(() => {
"use strict";
(() => {
  // client/src/features/bookmarks/host.ts
  function bookmarksHost() {
    const host2 = window;
    const JE2 = host2.JellyfinEnhanced;
    if (!JE2) throw new Error("Bookmarks loaded before Jellyfin Enhanced");
    const getApi2 = () => {
      const api = host2.ApiClient || host2.ConnectionManager?.currentApiClient();
      if (!api) throw new Error("API client not available");
      return api;
    };
    return { JE: JE2, host: host2, getApi: getApi2 };
  }
  function lease(JE2) {
    const owner = JE2.userConfig, epoch = JE2.session?.getEpoch();
    return () => JE2.userConfig === owner && (epoch === void 0 || JE2.session?.isCurrent(epoch) === true);
  }

  // client/src/features/bookmarks/lifetime.ts
  function createLifetime(JE2, name) {
    var _a;
    JE2.internals ?? (JE2.internals = {});
    (_a = JE2.internals).bookmarkLifetimes ?? (_a.bookmarkLifetimes = {});
    JE2.internals.bookmarkLifetimes[name]?.dispose();
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
      const current = lease(JE2), version = generation;
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
      const current = lease(JE2), version = generation;
      return () => !disposed && generation === version && current();
    } };
    JE2.internals.bookmarkLifetimes[name] = result;
    keep(JE2.session?.onUserChange("bookmarks-" + name, () => {
      for (const close of dialogs) close();
      document.querySelectorAll(".je-bm-player-modal-overlay, .je-bm-library-modal-overlay, .je-bookmark-marker").forEach((el) => el.remove());
      document.querySelectorAll(".sections.bookmarks").forEach((el) => el.replaceChildren());
    }));
    listen(window, "pagehide", dispose);
    return result;
  }

  // client/src/features/bookmarks/library-init.ts
  var { JE, host, getApi } = bookmarksHost();
  function install(JE2) {
    const lifetime = createLifetime(JE2, "library-init");
    const setInterval = lifetime.interval;
    const internal = JE2.internals.bookmarksLibrary = JE2.internals.bookmarksLibrary || {};
    if (!JE2?.pluginConfig?.BookmarksEnabled) return;
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
      if (host.JE) return host.JE;
      if (host.JellyfinEnhanced) return host.JellyfinEnhanced;
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
          if (!isPluginPagesActive() && !JE2.pluginConfig?.BookmarksUseCustomTabs && !JE2.pluginConfig?.BookmarksUseNativeTab) {
            injectNavigation();
            setupNavigationWatcher();
            lifetime.listen(window, "hashchange", interceptNavigation, true);
            lifetime.listen(window, "popstate", interceptNavigation, true);
            lifetime.listen(document, "click", handleNavClick);
            lifetime.keep(JE2.core.navigation.onViewPage((view, element, hash, itemPromise, rawEvent) => {
              if (rawEvent) handleViewShow(rawEvent);
            }));
            lifetime.keep(JE2.core.navigation.onNavigate(handleNavigation));
            handleNavigation();
          }
          if (JE2.pluginConfig?.BookmarksUseNativeTab) {
            JE2.nativeTabs.register("bookmarks", "Bookmarks", (panel) => {
              const marker = document.createElement("div");
              marker.className = "sections bookmarks";
              panel.appendChild(marker);
            }, "location_on");
          }
          lifetime.keep(JE2.helpers.observeTabContainers("bookmarks-library-custom-tab", ".sections.bookmarks", renderIfSectionExists));
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
  install(JE);
})();
})();
//# sourceMappingURL=bookmarks-library-init.js.map
