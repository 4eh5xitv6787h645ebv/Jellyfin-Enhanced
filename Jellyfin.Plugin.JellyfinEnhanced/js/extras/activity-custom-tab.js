(() => {
"use strict";
(() => {
  // client/src/features/activity/host.ts
  function activityHost() {
    const host = window;
    return { host, JE: host.JellyfinEnhanced, getApi: () => host.ApiClient, Emby: host.Emby };
  }

  // client/src/features/activity/activity-custom-tab.ts
  (function() {
    "use strict";
    const { JE: candidate } = activityHost();
    if (!candidate) return;
    const JE = candidate;
    if (!JE?.pluginConfig?.ActivityFeedEnabled) {
      return;
    }
    var useCustomTabs = !!JE?.pluginConfig?.ActivityFeedUseCustomTabs;
    var useNativeTab = !!JE?.pluginConfig?.ActivityFeedUseNativeTab;
    if (!useCustomTabs && !useNativeTab) {
      return;
    }
    if (useNativeTab) {
      JE.nativeTabs.register("activity", JE.t("activity_title") || "Activity", function(panel) {
        var marker = document.createElement("div");
        marker.className = "jellyfinenhanced activity";
        panel.appendChild(marker);
      }, "history");
    }
    var style = document.createElement("style");
    style.textContent = [
      ".backgroundContainer.withBackdrop:has(~ * #indexPage .tabContent.is-active .jellyfinenhanced.activity) {",
      "  background: rgba(0, 0, 0, 0.7) !important;",
      "  opacity: 1 !important;",
      "}"
    ].join("\n");
    document.head.appendChild(style);
    var lastMountedContainer = null;
    function isOnHomePage() {
      var hash = window.location.hash.replace(/^#!/, "#");
      return hash === "" || hash === "#/home" || hash === "#/home.html" || hash.indexOf("#/home?") !== -1 || hash.indexOf("#/home.html?") !== -1;
    }
    function waitForActivity(callback) {
      var attempts = 0;
      var check = setInterval(function() {
        if (++attempts > 300) {
          clearInterval(check);
          return;
        }
        if (JE?.activityPage) {
          clearInterval(check);
          callback(JE);
        }
      }, 100);
    }
    function findActiveContainer() {
      var all = document.querySelectorAll(".jellyfinenhanced.activity");
      for (var i = all.length - 1; i >= 0; i--) {
        var el = all[i];
        if (el && JE.helpers.isActiveTabContainer(el)) return el;
      }
      return null;
    }
    function renderActivity(container, JE2) {
      container.classList.remove("hide");
      container.style.display = "";
      var child = document.createElement("div");
      child.id = "je-activity-container-tab";
      container.textContent = "";
      container.appendChild(child);
      JE2.activityPage?.injectStyles();
      JE2.activityPage?.renderForCustomTab(child);
      lastMountedContainer = container;
    }
    function watchForContainer(JE2) {
      var wasOnHomePage = false;
      function tryMount() {
        var onHome = isOnHomePage();
        if (!onHome) {
          if (wasOnHomePage) {
            JE2.activityPage?.stopPolling?.();
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
            JE2.activityPage?.stopPolling?.();
          }
          lastMountedContainer = null;
          return;
        }
        var shouldMount = justReturned || container !== lastMountedContainer || !container.hasChildNodes() || lastMountedContainer && !document.contains(lastMountedContainer);
        if (shouldMount) {
          renderActivity(container, JE2);
        }
      }
      tryMount();
      window.addEventListener("hashchange", tryMount);
      JE2.helpers.observeTabContainers("activity-custom-tab", ".jellyfinenhanced.activity", tryMount);
    }
    waitForActivity(function(JE2) {
      watchForContainer(JE2);
    });
  })();
})();
})();
//# sourceMappingURL=activity-custom-tab.js.map
