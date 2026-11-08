(() => {
"use strict";
(() => {
  // client/src/host/downloads-host.ts
  function downloadsHost() {
    var _a;
    const host = window;
    const JE = host.JellyfinEnhanced;
    if (!JE) throw new Error("Downloads loaded before Jellyfin Enhanced");
    JE.internals || (JE.internals = {});
    const P = (_a = JE.internals).requestsPage || (_a.requestsPage = {});
    return { JE, P, host, getApi: () => {
      if (!host.ApiClient) throw new Error("API client unavailable");
      return host.ApiClient;
    } };
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

  // client/src/features/downloads/init.ts
  function install(deps) {
    const { JE, P, host, getApi } = deps;
    const life = runtime(deps);
    if (life.installed.has("init")) return;
    life.installed.add("init");
    const state = P.state;
    const injectStyles = P.injectStyles;
    const createPageContainer = P.createPageContainer;
    const renderPage = P.renderPage;
    const loadAllData = P.loadAllData;
    const clearAvatarObjectUrlCache = P.clearAvatarObjectUrlCache;
    const lifecycle = JE.core.lifecycle.register("arr-requests-page");
    const sidebar = document.querySelector(".mainDrawer-scrollContainer");
    const pluginPagesExists = !!sidebar?.querySelector(
      'a[is="emby-linkbutton"][data-itemid="Jellyfin.Plugin.JellyfinEnhanced.DownloadsPage"]'
    );
    const logPrefix = "🪼 Jellyfin Enhanced: Requests Page:";
    function showPage() {
      if (state.pageVisible) return;
      state.pageVisible = true;
      startLocationWatcher();
      const page = createPageContainer();
      if (!page) {
        console.error(`${logPrefix} Failed to create page container`);
        state.pageVisible = false;
        return;
      }
      if (window.location.hash !== "#/downloads") {
        history.pushState({ page: "downloads" }, "Requests", "#/downloads");
      }
      const activePage = document.querySelector(
        ".mainAnimatedPage:not(.hide):not(#je-downloads-page)"
      );
      if (activePage) {
        state.previousPage = activePage;
        activePage.classList.add("hide");
        activePage.dispatchEvent(
          new CustomEvent("viewhide", {
            bubbles: true,
            detail: { type: "interior" }
          })
        );
      }
      page.classList.remove("hide");
      page.dispatchEvent(
        new CustomEvent("viewshow", {
          bubbles: true,
          detail: {
            type: "custom",
            isRestored: false,
            options: {}
          }
        })
      );
      page.dispatchEvent(
        new CustomEvent("pageshow", {
          bubbles: true,
          detail: {
            type: "custom",
            isRestored: false
          }
        })
      );
      if (!state.isLoading) {
        loadAllData();
        startPolling();
      }
    }
    function hidePage() {
      if (!state.pageVisible) return;
      const page = document.getElementById("je-downloads-page");
      if (page) {
        page.classList.add("hide");
        page.dispatchEvent(
          new CustomEvent("viewhide", {
            bubbles: true,
            detail: { type: "custom" }
          })
        );
      }
      if (state.previousPage && !document.querySelector(
        ".mainAnimatedPage:not(.hide):not(#je-downloads-page)"
      )) {
        state.previousPage.classList.remove("hide");
        state.previousPage.dispatchEvent(
          new CustomEvent("viewshow", {
            bubbles: true,
            detail: { type: "interior", isRestored: true }
          })
        );
      }
      state.pageVisible = false;
      state.previousPage = null;
      clearAvatarObjectUrlCache(true);
      stopPolling();
    }
    function viewIsVisible() {
      const container = state._customTabMode ? state._customTabContainer : document.getElementById("je-downloads-container");
      if (!container?.isConnected || container.closest(".hide, [hidden]")) return false;
      const tab = container.closest(".tabContent");
      if (tab && !tab.classList.contains("is-active")) return false;
      return !!(state.pageVisible || state._pluginPageVisible || state._customTabMode);
    }
    function startPolling() {
      stopPolling(false);
      const config = JE.pluginConfig || {};
      if (!config.DownloadsPagePollingEnabled) {
        return;
      }
      const intervalSeconds = config.DownloadsPollIntervalSeconds !== void 0 ? config.DownloadsPollIntervalSeconds : 30;
      const isVisible = viewIsVisible();
      if (!isVisible) {
        return;
      }
      const interval = (Number.isFinite(intervalSeconds) ? Math.max(1, intervalSeconds) : 30) * 1e3;
      state.pollTimer = lifecycle.track(setInterval(() => {
        const currentlyVisible = viewIsVisible();
        if (!currentlyVisible) {
          stopPolling();
          return;
        }
        if (document.visibilityState === "hidden") return;
        if (!state.isLoading) {
          loadAllData();
        }
      }, interval));
    }
    function stopPolling(invalidate = true) {
      if (invalidate) life.invalidate();
      if (state.pollTimer) {
        lifecycle.untrack(state.pollTimer);
        clearInterval(state.pollTimer);
        state.pollTimer = null;
      }
    }
    function injectNavigation() {
      const config = JE.pluginConfig || {};
      if (!config.DownloadsPageEnabled) return;
      if (pluginPagesExists && config.DownloadsUsePluginPages) return;
      if (config.DownloadsUseCustomTabs) return;
      if (config.DownloadsUseNativeTab) return;
      const pluginPageItem = sidebar?.querySelector(
        'a[is="emby-linkbutton"][data-itemid="Jellyfin.Plugin.JellyfinEnhanced.DownloadsPage"]'
      );
      if (pluginPageItem) {
        pluginPageItem.style.setProperty("display", "none", "important");
      }
      if (document.querySelector(".je-nav-downloads-item")) {
        return;
      }
      const jellyfinEnhancedSection = document.querySelector(".jellyfinEnhancedSection");
      if (jellyfinEnhancedSection) {
        const navItem = document.createElement("a");
        navItem.setAttribute("is", "emby-linkbutton");
        navItem.className = "navMenuOption lnkMediaFolder emby-button je-nav-downloads-item";
        navItem.href = "#";
        const labelRequests = JE.t && JE.t("requests_requests") || "Requests";
        navItem.innerHTML = `
        <span class="navMenuOptionIcon material-icons">download</span>
        <span class="sectionName navMenuOptionText">${labelRequests}</span>
      `;
        navItem.addEventListener("click", (e) => {
          e.preventDefault();
          showPage();
        });
        jellyfinEnhancedSection.appendChild(navItem);
        console.log(`${logPrefix} Navigation item injected`);
      } else {
        console.log(`${logPrefix} jellyfinEnhancedSection not found, will wait for it`);
      }
    }
    function setupNavigationWatcher() {
      const config = JE.pluginConfig || {};
      if (!config.DownloadsPageEnabled) return;
      if (pluginPagesExists && config.DownloadsUsePluginPages) return;
      if (config.DownloadsUseCustomTabs) return;
      if (config.DownloadsUseNativeTab) return;
      const unsubscribe = JE.helpers.onSidebarRebuilt("downloads", ".je-nav-downloads-item", () => {
        const currentConfig = JE.pluginConfig || {};
        if (currentConfig.DownloadsUseCustomTabs) return;
        if (currentConfig.DownloadsUseNativeTab) return;
        if (pluginPagesExists && currentConfig.DownloadsUsePluginPages) return;
        console.log(`${logPrefix} Sidebar rebuilt, re-injecting navigation`);
        injectNavigation();
      });
      if (typeof unsubscribe === "function") life.cleanup(() => unsubscribe());
    }
    function handleNavigation() {
      const hash = window.location.hash;
      const path = window.location.pathname;
      if (hash === "#/downloads" || path === "/downloads") {
        console.log(`${logPrefix} handleNavigation matched downloads (hash=${hash} path=${path})`);
        showPage();
      } else if (state.pageVisible || state._pluginPageVisible) {
        console.log(`${logPrefix} handleNavigation hiding page (hash=${hash} path=${path})`);
        hidePage();
        state._pluginPageVisible = false;
        stopPolling();
      }
    }
    let initialized = false;
    function initialize() {
      console.log(`${logPrefix} Initializing downloads page module`);
      if (initialized) return;
      const config = JE.pluginConfig || {};
      if (!config.DownloadsPageEnabled) {
        console.log(`${logPrefix} Downloads page is disabled`);
        return;
      }
      initialized = true;
      injectStyles();
      const usingPluginPages = pluginPagesExists && config.DownloadsUsePluginPages;
      if (usingPluginPages) {
        console.log(`${logPrefix} Downloads page is injected via Plugin Pages`);
        return;
      }
      createPageContainer();
      injectNavigation();
      setupNavigationWatcher();
      life.listen(window, "hashchange", interceptNavigation, true);
      life.listen(window, "popstate", interceptNavigation, true);
      life.listen(window, "hashchange", handleNavigation);
      life.listen(window, "popstate", handleNavigation);
      startLocationWatcher();
      life.listen(document, "viewshow", (e) => {
        const targetPage = e.target;
        if (state.pageVisible && targetPage instanceof Element && targetPage.id !== "je-downloads-page") {
          hidePage();
        }
      });
      life.listen(
        document,
        "click",
        (e) => {
          if (!state.pageVisible || !(e.target instanceof Element)) return;
          const playBtn = e.target.closest(".je-request-watch-btn");
          if (playBtn) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const mediaId = playBtn.getAttribute("data-media-id");
            if (mediaId && host.Emby?.Page?.showItem) {
              host.Emby.Page.showItem(mediaId);
            }
            return;
          }
          const titleLink = e.target.closest(".je-request-title-link");
          if (titleLink) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const mediaId = titleLink.getAttribute("data-media-id");
            if (mediaId && host.Emby?.Page?.showItem) {
              host.Emby.Page.showItem(mediaId);
            }
            return;
          }
          const externalLink = e.target.closest(".je-request-external-link");
          if (externalLink) {
            if (JE.core.ui.isTvLayout()) e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
          }
          const btn = e.target.closest(
            ".headerTabs button, .navMenuOption, .headerButton"
          );
          if (btn && !btn.classList.contains("je-nav-downloads-item")) {
            hidePage();
          }
        },
        true
      );
      handleNavigation();
      console.log(`${logPrefix} Downloads page module initialized`);
    }
    function interceptNavigation(e) {
      const url = e instanceof HashChangeEvent && e.newURL ? new URL(e.newURL) : window.location;
      const hash = url.hash;
      const path = url.pathname;
      const matches = hash === "#/downloads" || path === "/downloads";
      if (matches) {
        if (e?.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e?.preventDefault) e.preventDefault();
        showPage();
      }
    }
    function startLocationWatcher() {
      if (state.locationUnsubscribe) return;
      state.locationSignature = `${window.location.pathname}${window.location.hash}`;
      const check = () => {
        const signature = `${window.location.pathname}${window.location.hash}`;
        if (signature !== state.locationSignature) {
          state.locationSignature = signature;
          handleNavigation();
        }
      };
      state.locationUnsubscribe = lifecycle.track(
        JE.helpers?.onNavigate ? JE.helpers.onNavigate(check) : (() => {
          const t = setInterval(check, 150);
          return () => clearInterval(t);
        })()
      );
    }
    function stopLocationWatcher() {
      if (state.locationUnsubscribe) {
        lifecycle.untrack(state.locationUnsubscribe);
        state.locationUnsubscribe();
        state.locationUnsubscribe = null;
      }
    }
    function renderForCustomTab(targetContainer) {
      life.invalidate();
      state._customTabMode = true;
      injectStyles();
      renderPage(targetContainer);
      loadAllData();
      startPolling();
    }
    JE.downloadsPage = {
      initialize,
      showPage,
      hidePage,
      refresh: loadAllData,
      startPolling,
      stopPolling,
      filterDownloads: P.filterDownloads,
      searchDownloads: P.searchDownloads,
      filterRequests: P.filterRequests,
      filterIssues: P.filterIssues,
      nextPage: P.nextPage,
      prevPage: P.prevPage,
      nextIssuesPage: P.nextIssuesPage,
      prevIssuesPage: P.prevIssuesPage,
      nextHistoryPage: P.nextHistoryPage,
      prevHistoryPage: P.prevHistoryPage,
      renderPage,
      renderForCustomTab,
      injectStyles,
      _state: state
    };
    JE.initializeDownloadsPage = initialize;
  }

  // client/src/features/downloads/init-entry.ts
  install(downloadsHost());
})();
})();
//# sourceMappingURL=requests-page-init.js.map
