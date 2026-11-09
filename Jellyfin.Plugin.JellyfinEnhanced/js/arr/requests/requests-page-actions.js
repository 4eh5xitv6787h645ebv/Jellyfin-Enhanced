(() => {
"use strict";
(() => {
  // client/src/host/context.ts
  function featureContext(feature, core, slots) {
    const own = {};
    const bind = (keys, target) => {
      for (const key of keys) {
        Object.defineProperty(own, key, {
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
      own,
      peer: (name) => core[name]
    };
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

  // client/src/features/downloads/actions.ts
  function install(deps) {
    const { JE, P, host, getApi } = deps;
    const life = runtime(deps);
    if (life.installed.has("actions")) return;
    life.installed.add("actions");
    const state = P.state;
    const renderPage = P.renderPage;
    const renderSection = P.renderSection;
    const fetchRequests = () => {
      const lease = life.capture();
      return P.fetchRequests().then(() => lease);
    };
    const fetchIssues = () => {
      const lease = life.capture();
      return P.fetchIssues().then(() => lease);
    };
    const fetchHistory = () => {
      const lease = life.capture();
      return P.fetchHistory().then(() => lease);
    };
    function filterDownloads(status) {
      state.downloadsActiveTab = status;
      state.downloadsSearchQuery = "";
      renderPage();
    }
    function searchDownloads(query) {
      state.downloadsSearchQuery = query;
      renderPage();
    }
    function filterRequests(filter) {
      state.requestsFilter = filter;
      state.requestsPage = 1;
      fetchRequests().then((lease) => {
        if (lease.current()) renderSection("requests");
      });
    }
    function filterIssues(filter) {
      if (!filter || filter !== "open" && filter !== "resolved") return;
      if (state.issuesFilter === filter) return;
      state.issuesFilter = filter;
      state.issuesPage = 1;
      fetchIssues().then((lease) => {
        if (lease.current()) renderSection("issues");
      });
    }
    function nextPage() {
      if (state.requestsPage < state.requestsTotalPages) {
        state.requestsPage++;
        fetchRequests().then((lease) => {
          if (lease.current()) renderSection("requests");
        });
      }
    }
    function prevPage() {
      if (state.requestsPage > 1) {
        state.requestsPage--;
        fetchRequests().then((lease) => {
          if (lease.current()) renderSection("requests");
        });
      }
    }
    function nextIssuesPage() {
      if (state.issuesPage < state.issuesTotalPages) {
        state.issuesPage++;
        fetchIssues().then((lease) => {
          if (lease.current()) renderSection("issues");
        });
      }
    }
    function prevIssuesPage() {
      if (state.issuesPage > 1) {
        state.issuesPage--;
        fetchIssues().then((lease) => {
          if (lease.current()) renderSection("issues");
        });
      }
    }
    function nextHistoryPage() {
      if (state.historyPage < state.historyTotalPages) {
        state.historyPage++;
        fetchHistory().then((lease) => {
          if (lease.current()) renderSection("history");
        });
      }
    }
    function prevHistoryPage() {
      if (state.historyPage > 1) {
        state.historyPage--;
        fetchHistory().then((lease) => {
          if (lease.current()) renderSection("history");
        });
      }
    }
    P.filterDownloads = filterDownloads;
    P.searchDownloads = searchDownloads;
    P.filterRequests = filterRequests;
    P.filterIssues = filterIssues;
    P.nextPage = nextPage;
    P.prevPage = prevPage;
    P.nextIssuesPage = nextIssuesPage;
    P.prevIssuesPage = prevIssuesPage;
    P.nextHistoryPage = nextHistoryPage;
    P.prevHistoryPage = prevHistoryPage;
  }

  // client/src/features/downloads/actions-entry.ts
  install(downloadsHost());
})();
})();
//# sourceMappingURL=requests-page-actions.js.map
