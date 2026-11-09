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

  // client/src/features/downloads/host.ts
  function downloadsHost() {
    var _a;
    const host = window;
    const JE = host.JellyfinEnhanced;
    if (!JE) throw new Error("Downloads loaded before Jellyfin Enhanced");
    const ctx = featureContext("downloads", JE, {
      facades: ["downloadsPage", "initializeDownloadsPage"],
      internalSlots: ["requestsPage"],
      internalsObject: () => JE.internals || (JE.internals = {})
    });
    const P = (_a = ctx.own).requestsPage || (_a.requestsPage = {});
    return { JE, P, host, ctx, getApi: () => {
      if (!host.ApiClient) throw new Error("API client unavailable");
      return host.ApiClient;
    } };
  }

  // client/src/features/downloads/validation.ts
  function record(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  // client/src/features/downloads/runtime.ts
  function runtime(deps) {
    if (deps.P.runtime) return deps.P.runtime;
    const { JE, P, host } = deps;
    let generation = 0, disposed = false;
    const lanes = /* @__PURE__ */ new Map();
    const removers = [];
    const identityLease = () => {
      const api = host.ApiClient, epoch = JE.session?.getEpoch();
      const serverId = () => typeof api?.serverId === "function" ? api.serverId() : api?.serverId;
      const identity = api?.getCurrentUserId(), server = api?.serverAddress?.(), base = api?.getUrl("/"), token = api?.accessToken?.(), id = serverId();
      return { current: () => !disposed && host.ApiClient === api && (epoch === void 0 || JE.session?.isCurrent(epoch) === true) && api?.getCurrentUserId() === identity && api?.serverAddress?.() === server && api?.getUrl("/") === base && api?.accessToken?.() === token && serverId() === id };
    };
    const owner = {
      cleanup(callback) {
        removers.push(callback);
      },
      installed: /* @__PURE__ */ new Set(),
      mutations: /* @__PURE__ */ new Map(),
      captureIdentity: identityLease,
      capture(lane) {
        const version = generation, identity = identityLease();
        const route = host.location.pathname + host.location.hash;
        const container = P.state?._customTabContainer || document.getElementById("je-downloads-container");
        const serial = lane ? (lanes.get(lane) || 0) + 1 : 0;
        if (lane) lanes.set(lane, serial);
        return { current: () => !disposed && generation === version && (!lane || lanes.get(lane) === serial) && identity.current() && host.location.pathname + host.location.hash === route && (!container || container.isConnected && !container.closest(".hide, [hidden]") && (!container.closest(".tabContent") || container.closest(".tabContent")?.classList.contains("is-active") === true)) };
      },
      invalidate() {
        generation++;
        if (P.state) {
          P.state.isLoading = false;
          if (P.state.searchDebounceTimer !== null) {
            clearTimeout(P.state.searchDebounceTimer);
            P.state.searchDebounceTimer = null;
          }
        }
      },
      listen(target, event, callback, capture = false) {
        target.addEventListener(event, callback, capture);
        removers.push(() => target.removeEventListener(event, callback, capture));
      },
      dispose() {
        disposed = true;
        owner.invalidate();
        removers.splice(0).forEach((remove) => remove());
        if (P.state?.pollTimer) {
          clearInterval(P.state.pollTimer);
          P.state.pollTimer = null;
        }
      }
    };
    P.runtime = owner;
    owner.listen(host, "hashchange", () => owner.invalidate());
    owner.listen(host, "popstate", () => owner.invalidate());
    owner.listen(host, "je:navigate", () => owner.invalidate());
    owner.listen(document, "viewhide", (event) => {
      if (event.target instanceof Element && (event.target.id === "je-downloads-page" || event.target.contains(P.state?._customTabContainer || document.getElementById("je-downloads-container")))) owner.invalidate();
    });
    JE.core?.lifecycle?.register("arr-requests-page").track(() => owner.dispose());
    return owner;
  }

  // client/src/features/downloads/custom-tab.ts
  function install(deps) {
    const { JE, P, host, ctx, getApi } = deps;
    const life = runtime(deps);
    if (life.installed.has("custom-tab")) return;
    life.installed.add("custom-tab");
    if (!JE?.pluginConfig?.DownloadsPageEnabled) {
      return;
    }
    var useCustomTabs = !!JE?.pluginConfig?.DownloadsUseCustomTabs;
    var useNativeTab = !!JE?.pluginConfig?.DownloadsUseNativeTab;
    if (!useCustomTabs && !useNativeTab) {
      return;
    }
    if (useNativeTab) {
      JE.nativeTabs.register("requests", JE.t("requests_requests") || "Requests", function(panel) {
        var marker = document.createElement("div");
        marker.className = "jellyfinenhanced requests";
        panel.appendChild(marker);
      }, "download");
    }
    var style = document.createElement("style");
    style.textContent = [
      ".jellyfinenhanced.requests {",
      "  padding: 12px 3vw;",
      "}",
      ".backgroundContainer.withBackdrop:has(~ * #indexPage .tabContent.is-active .jellyfinenhanced.requests) {",
      "  background: rgba(0, 0, 0, 0.7) !important;",
      "  opacity: 1 !important;",
      "}"
    ].join("\n");
    document.head.appendChild(style);
    var lastMountedContainer = null;
    function isOnHomePage() {
      var hash = window.location.hash;
      return hash === "" || hash === "#/home" || hash === "#/home.html" || hash.indexOf("#/home?") !== -1 || hash.indexOf("#/home.html?") !== -1;
    }
    function waitForDownloads(callback) {
      var attempts = 0;
      var check = setInterval(function() {
        if (++attempts > 300) {
          clearInterval(check);
          return;
        }
        if (ctx.own.downloadsPage) {
          clearInterval(check);
          callback();
        }
      }, 100);
      life.cleanup(() => clearInterval(check));
    }
    function findActiveContainer() {
      var all = document.querySelectorAll(".jellyfinenhanced.requests");
      for (var i = all.length - 1; i >= 0; i--) {
        var el = all[i];
        if (el && JE.helpers.isActiveTabContainer(el)) return el;
      }
      return null;
    }
    function renderDownloads(container) {
      container.classList.remove("hide");
      container.style.display = "";
      var child = document.createElement("div");
      child.id = "je-downloads-container-tab";
      container.textContent = "";
      container.appendChild(child);
      ctx.own.downloadsPage.renderForCustomTab?.(child);
      lastMountedContainer = container;
    }
    function watchForContainer() {
      var wasOnHomePage = false;
      function tryMount() {
        var onHome = isOnHomePage();
        if (!onHome) {
          if (wasOnHomePage) {
            ctx.own.downloadsPage.stopPolling?.();
            if (ctx.own.downloadsPage._state) {
              ctx.own.downloadsPage._state._customTabMode = false;
            }
            lastMountedContainer = null;
          }
          wasOnHomePage = false;
          return;
        }
        var justReturned = !wasOnHomePage;
        wasOnHomePage = true;
        var container = findActiveContainer();
        if (!container) {
          if (lastMountedContainer) {
            ctx.own.downloadsPage.stopPolling?.();
            if (ctx.own.downloadsPage._state) {
              ctx.own.downloadsPage._state._customTabMode = false;
            }
          }
          lastMountedContainer = null;
          return;
        }
        var shouldMount = justReturned || container !== lastMountedContainer || !container.hasChildNodes() || lastMountedContainer && !document.contains(lastMountedContainer);
        if (shouldMount) {
          renderDownloads(container);
        }
      }
      tryMount();
      life.listen(window, "hashchange", tryMount);
      const unsubscribe = JE.helpers.observeTabContainers("arr-requests-custom-tab", ".jellyfinenhanced.requests", tryMount);
      if (typeof unsubscribe === "function") life.cleanup(() => unsubscribe());
      else if (record(unsubscribe) && typeof unsubscribe.teardown === "function") {
        const teardown = unsubscribe.teardown;
        life.cleanup(() => teardown.call(unsubscribe));
      }
    }
    waitForDownloads(function() {
      watchForContainer();
    });
  }

  // client/src/features/downloads/custom-tab-entry.ts
  install(downloadsHost());
})();
})();
//# sourceMappingURL=requests-custom-tab.js.map
