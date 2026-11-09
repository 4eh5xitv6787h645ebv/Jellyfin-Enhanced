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

  // client/src/features/bookmarks/library-page.ts
  var { ctx, host, getApi } = bookmarksHost();
  function install(JE) {
    const lifetime = createLifetime(ctx, "library-page");
    const setInterval = lifetime.interval;
    const internal = ctx.own.bookmarksLibrary = ctx.own.bookmarksLibrary || {};
    if (!JE?.pluginConfig?.BookmarksEnabled) return;
    const renderIfSectionExists = (...args) => {
      const fn = internal.renderIfSectionExists;
      if (!fn) throw new Error("Missing bookmark module: renderIfSectionExists");
      return fn(...args);
    };
    const logPrefix = "🪼 Jellyfin Enhanced: Bookmarks Library:";
    const LOCATION_WATCH_INTERVAL_MS = 150;
    const pageState = {
      pageVisible: false,
      previousPage: null,
      locationSignature: null,
      locationTimer: null
    };
    function isPluginPagesActive() {
      const config = JE?.pluginConfig || {};
      if (!config.BookmarksUsePluginPages) return false;
      const sb = document.querySelector(".mainDrawer-scrollContainer");
      return !!sb?.querySelector('a[is="emby-linkbutton"][data-itemid="Jellyfin.Plugin.JellyfinEnhanced.BookmarksPage"]');
    }
    function createPageContainer() {
      let page = document.getElementById("je-bookmarks-standalone-page");
      if (!page) {
        page = document.createElement("div");
        page.id = "je-bookmarks-standalone-page";
        page.className = "page type-interior mainAnimatedPage hide";
        page.setAttribute("data-title", "Bookmarks");
        page.setAttribute("data-backbutton", "true");
        page.setAttribute("data-url", "#/bookmarks");
        page.setAttribute("data-type", "custom");
        const contentWrapper = document.createElement("div");
        contentWrapper.setAttribute("data-role", "content");
        const contentPrimary = document.createElement("div");
        contentPrimary.className = "content-primary je-bookmarks-page";
        const container = document.createElement("div");
        container.className = "sections bookmarks";
        contentPrimary.appendChild(container);
        contentWrapper.appendChild(contentPrimary);
        page.appendChild(contentWrapper);
        const mainContent = document.querySelector(".mainAnimatedPages");
        if (mainContent) {
          mainContent.appendChild(page);
        } else {
          document.body.appendChild(page);
        }
      }
      return page;
    }
    function showPage() {
      if (pageState.pageVisible) return;
      if (isPluginPagesActive()) return;
      if (JE?.pluginConfig?.BookmarksUseCustomTabs) return;
      if (JE?.pluginConfig?.BookmarksUseNativeTab) return;
      pageState.pageVisible = true;
      startLocationWatcher();
      const page = createPageContainer();
      const expectedHash = "#/bookmarks";
      if (window.location.hash !== expectedHash) {
        history.pushState({ page: "bookmarks" }, "Bookmarks", expectedHash);
      }
      const activePage = document.querySelector(".mainAnimatedPage:not(.hide):not(#je-bookmarks-standalone-page)");
      if (activePage) {
        pageState.previousPage = activePage;
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
          detail: {}
        })
      );
      renderIfSectionExists();
    }
    function hidePage() {
      if (!pageState.pageVisible) return;
      const page = document.getElementById("je-bookmarks-standalone-page");
      if (page) {
        page.classList.add("hide");
        page.dispatchEvent(
          new CustomEvent("viewhide", {
            bubbles: true,
            detail: { type: "custom" }
          })
        );
      }
      if (pageState.previousPage && !document.querySelector(".mainAnimatedPage:not(.hide):not(#je-bookmarks-standalone-page)")) {
        pageState.previousPage.classList.remove("hide");
        pageState.previousPage.dispatchEvent(
          new CustomEvent("viewshow", {
            bubbles: true,
            detail: { type: "interior", isRestored: true }
          })
        );
      }
      pageState.pageVisible = false;
      pageState.previousPage = null;
      stopLocationWatcher();
    }
    function startLocationWatcher() {
      if (pageState.locationTimer) return;
      pageState.locationSignature = `${window.location.pathname}${window.location.hash}`;
      pageState.locationTimer = setInterval(() => {
        const signature = `${window.location.pathname}${window.location.hash}`;
        if (signature !== pageState.locationSignature) {
          pageState.locationSignature = signature;
          handleNavigation();
        }
      }, LOCATION_WATCH_INTERVAL_MS);
    }
    function stopLocationWatcher() {
      if (pageState.locationTimer) {
        clearInterval(pageState.locationTimer);
        pageState.locationTimer = null;
      }
    }
    function handleNavigation() {
      const hash = window.location.hash;
      const path = window.location.pathname;
      if (hash.startsWith("#/bookmarks") || path === "/bookmarks") {
        showPage();
      } else if (pageState.pageVisible) {
        hidePage();
      }
    }
    function interceptNavigation(e) {
      const url = "newURL" in e && typeof e.newURL === "string" ? new URL(e.newURL) : window.location;
      const hash = url.hash;
      const path = url.pathname;
      if (hash.startsWith("#/bookmarks") || path === "/bookmarks") {
        if (e?.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e?.preventDefault) e.preventDefault();
        showPage();
      }
    }
    function handleViewShow(e) {
      const targetPage = e.target;
      if (pageState.pageVisible && targetPage instanceof Element && targetPage.id !== "je-bookmarks-standalone-page") {
        hidePage();
      }
    }
    function handleNavClick(e) {
      if (!(e.target instanceof Element)) return;
      if (!pageState.pageVisible) return;
      const btn = e.target.closest(".headerTabs button, .navMenuOption, .headerButton");
      if (btn && !btn.classList.contains("je-nav-bookmarks-item")) {
        hidePage();
      }
    }
    function injectNavigation() {
      if (!JE?.pluginConfig?.BookmarksEnabled) return;
      if (isPluginPagesActive()) return;
      if (JE?.pluginConfig?.BookmarksUseCustomTabs) return;
      if (JE?.pluginConfig?.BookmarksUseNativeTab) return;
      const sb = document.querySelector(".mainDrawer-scrollContainer");
      const pluginPageItem = sb?.querySelector(
        'a[is="emby-linkbutton"][data-itemid="Jellyfin.Plugin.JellyfinEnhanced.BookmarksPage"]'
      );
      if (pluginPageItem) {
        pluginPageItem.style.setProperty("display", "none", "important");
      }
      if (document.querySelector(".je-nav-bookmarks-item")) return;
      const jellyfinEnhancedSection = document.querySelector(".jellyfinEnhancedSection");
      if (jellyfinEnhancedSection) {
        const navItem = document.createElement("a");
        navItem.setAttribute("is", "emby-linkbutton");
        navItem.className = "navMenuOption lnkMediaFolder emby-button je-nav-bookmarks-item";
        navItem.href = "#";
        const iconSpan = document.createElement("span");
        iconSpan.className = "navMenuOptionIcon material-icons";
        iconSpan.textContent = "bookmarks";
        navItem.appendChild(iconSpan);
        const textSpan = document.createElement("span");
        textSpan.className = "sectionName navMenuOptionText";
        textSpan.textContent = JE.t("bookmarks_library_title") !== "bookmarks_library_title" ? JE.t("bookmarks_library_title") : "Bookmarks";
        navItem.appendChild(textSpan);
        navItem.addEventListener("click", (e) => {
          e.preventDefault();
          showPage();
        });
        const hiddenNav = jellyfinEnhancedSection.querySelector(".je-nav-hidden-content-item");
        const calendarNav = jellyfinEnhancedSection.querySelector(".je-nav-calendar-item");
        const insertAfter = hiddenNav || calendarNav;
        if (insertAfter && insertAfter.nextSibling) {
          jellyfinEnhancedSection.insertBefore(navItem, insertAfter.nextSibling);
        } else {
          jellyfinEnhancedSection.appendChild(navItem);
        }
        console.log(`${logPrefix} Navigation item injected`);
      }
    }
    function setupNavigationWatcher() {
      if (!JE?.pluginConfig?.BookmarksEnabled) return;
      if (isPluginPagesActive()) return;
      if (JE?.pluginConfig?.BookmarksUseCustomTabs) return;
      if (JE?.pluginConfig?.BookmarksUseNativeTab) return;
      lifetime.keep(JE.helpers.onSidebarRebuilt("bookmarks", ".je-nav-bookmarks-item", () => {
        if (isPluginPagesActive()) return;
        injectNavigation();
      }));
    }
    Object.assign(internal, {
      isPluginPagesActive,
      showPage,
      injectNavigation,
      setupNavigationWatcher,
      handleNavigation,
      interceptNavigation,
      handleViewShow,
      handleNavClick
    });
  }
  install(ctx.core);
})();
})();
//# sourceMappingURL=bookmarks-library-page.js.map
