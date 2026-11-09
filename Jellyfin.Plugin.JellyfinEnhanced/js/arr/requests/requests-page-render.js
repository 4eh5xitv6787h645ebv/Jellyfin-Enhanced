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

  // client/src/features/downloads/render.ts
  function install(deps) {
    const { JE, P, host, ctx, getApi } = deps;
    const life = runtime(deps);
    if (life.installed.has("render")) return;
    life.installed.add("render");
    const state = P.state;
    const translateStatus = P.translateStatus;
    const getDownloadStatuses = P.getDownloadStatuses;
    const getFilteredDownloads = P.getFilteredDownloads;
    const groupDownloads = P.groupDownloads;
    const renderDownloadCard = P.renderDownloadCard;
    const renderRequestCard = P.renderRequestCard;
    const renderIssueCard = P.renderIssueCard;
    const renderHistoryCard = P.renderHistoryCard;
    const renderSeasonPackCard = P.renderSeasonPackCard;
    const clearAvatarObjectUrlCache = P.clearAvatarObjectUrlCache;
    const hydrateAvatarImages = P.hydrateAvatarImages;
    const hydrateExternalLinks = P.hydrateExternalLinks;
    const loadAllData = P.loadAllData;
    const handleRequestAction = P.handleRequestAction;
    function buildRequestsSection() {
      let html = "";
      if (JE.pluginConfig?.JellyseerrEnabled) {
        html += `<div class="je-downloads-section je-requests-section">`;
        const labelRequests = JE.t && JE.t("requests_requests") || "Requests";
        html += `<h2><span class="je-msym-rounded je-section-icon" aria-hidden="true">playlist_add_check</span>${labelRequests}</h2>`;
        const labelAll = JE.t && JE.t("jellyseerr_discover_all") || "All";
        const labelPending = JE.t && JE.t("jellyseerr_btn_pending") || "Pending Approval";
        const labelProcessing = JE.t && JE.t("jellyseerr_btn_processing") || "Processing";
        const labelAvailable = JE.t && JE.t("jellyseerr_btn_available") || "Available";
        const labelComingSoon = JE.t && JE.t("requests_coming_soon") || "Coming Soon";
        html += `
            <div class="je-requests-tabs">
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "all" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('all')">${labelAll}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "pending" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('pending')">${labelPending}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "processing" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('processing')">${labelProcessing}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "comingsoon" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('comingsoon')">${labelComingSoon}</button>
              <button is="emby-button" type="button" class="je-requests-tab emby-button ${state.requestsFilter === "available" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterRequests('available')">${labelAvailable}</button>
            </div>
          `;
        if (state.isLoading && state.requests.length === 0) {
          html += JE.core.ui.skeletonGridHtml(6);
        } else if (state.requestsError) {
          html += `<div class="je-empty-state">Unable to load requests</div>`;
        } else if (state.requests.length === 0) {
          html += `
                    <div class="je-empty-state">
                        <div>${JE.t?.("requests_no_requests_found") || "No requests found"}</div>
                    </div>
                `;
        } else {
          let filteredRequests = state.requests;
          const hiddenContent = ctx.peer("hiddenContent");
          if (hiddenContent) filteredRequests = hiddenContent.filterRequestItems(filteredRequests);
          if (state.requestsFilter === "processing") {
            filteredRequests = filteredRequests.filter((item) => {
              return item.mediaStatus !== "Partially Available";
            });
          }
          if (filteredRequests.length === 0) {
            html += `
                    <div class="je-empty-state">
                        <div>${JE.t?.("requests_no_requests_found") || "No requests found"}</div>
                    </div>
                `;
          } else {
            html += `<div class="je-downloads-grid je-requests-grid">`;
            filteredRequests.forEach((item) => {
              html += renderRequestCard(item);
            });
            html += `</div>`;
            if (state.requestsTotalPages > 1) {
              html += `
                        <div class="je-pagination">
                            <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.prevPage()" ${state.requestsPage <= 1 ? "disabled" : ""}><span class="material-icons">chevron_left</span></button>
                            <span>${state.requestsPage} / ${state.requestsTotalPages}</span>
                            <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.nextPage()" ${state.requestsPage >= state.requestsTotalPages ? "disabled" : ""}><span class="material-icons">chevron_right</span></button>
                        </div>
                    `;
            }
          }
        }
        html += `</div>`;
      }
      return html;
    }
    function buildIssuesSection() {
      let html = "";
      if (JE.pluginConfig?.JellyseerrEnabled && JE.pluginConfig?.DownloadsPageShowIssues) {
        html += `<div class="je-downloads-section je-issues-section">`;
        const labelIssues = JE.t && JE.t("jellyseerr_existing_issues") || "Issues";
        html += `<h2><span class="je-msym-rounded je-section-icon" aria-hidden="true">warning</span>${labelIssues}</h2>`;
        const labelOpen = JE.t && JE.t("jellyseerr_issue_open") || "Open";
        const labelResolved = JE.t && JE.t("jellyseerr_issue_resolved") || "Resolved";
        html += `
        <div class="je-issues-tabs">
          <button is="emby-button" type="button" class="je-issues-tab emby-button ${state.issuesFilter === "open" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterIssues('open')">${labelOpen}</button>
          <button is="emby-button" type="button" class="je-issues-tab emby-button ${state.issuesFilter === "resolved" ? "active" : ""}" onclick="window.JellyfinEnhanced.downloadsPage.filterIssues('resolved')">${labelResolved}</button>
        </div>
      `;
        if (state.isLoading && state.issues.length === 0) {
          html += JE.core.ui.skeletonGridHtml(6);
        } else if (state.issuesError) {
          html += `
          <div class="je-empty-state">
            <div>${JE.t?.("jellyseerr_load_issues_error") || "Unable to load issues"}</div>
          </div>
        `;
        } else if (state.issues.length === 0) {
          html += `
          <div class="je-empty-state">
            <div>${JE.t?.("jellyseerr_no_issues_yet") || "No issues found"}</div>
          </div>
        `;
        } else {
          html += `<div class="je-downloads-grid je-issues-grid">`;
          state.issues.forEach((issue) => {
            html += renderIssueCard(issue);
          });
          html += `</div>`;
          if (state.issuesTotalPages > 1) {
            html += `
            <div class="je-pagination">
              <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.prevIssuesPage()" ${state.issuesPage <= 1 ? "disabled" : ""}><span class="material-icons">chevron_left</span></button>
              <span>${state.issuesPage} / ${state.issuesTotalPages}</span>
              <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.nextIssuesPage()" ${state.issuesPage >= state.issuesTotalPages ? "disabled" : ""}><span class="material-icons">chevron_right</span></button>
            </div>
          `;
          }
        }
        html += `</div>`;
      }
      return html;
    }
    function buildHistorySection() {
      let html = "";
      if (JE.pluginConfig?.ShowDownloadsInRequests !== false && JE.pluginConfig?.DownloadsShowHistory !== false && state.historyVisible !== false) {
        html += `<div class="je-downloads-section je-history-section">`;
        const labelHistory = JE.t && JE.t("requests_history") || "History";
        html += `<h2><span class="je-msym-rounded je-section-icon" aria-hidden="true">history</span>${labelHistory}</h2>`;
        if (state.isLoading && state.history.length === 0) {
          html += JE.core.ui.skeletonGridHtml(6);
        } else if (state.historyError) {
          html += `<div class="je-empty-state">Unable to load history</div>`;
        } else if (state.history.length === 0) {
          const labelNoHistory = JE.t && JE.t("requests_no_history_found") || "No history found";
          html += `
          <div class="je-empty-state">
            <div>${labelNoHistory}</div>
          </div>
        `;
        } else {
          html += `<div class="je-downloads-grid je-history-grid">`;
          state.history.forEach((item) => {
            html += renderHistoryCard(item);
          });
          html += `</div>`;
          if (state.historyTotalPages > 1) {
            html += `
            <div class="je-pagination">
              <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.prevHistoryPage()" ${state.historyPage <= 1 ? "disabled" : ""}><span class="material-icons">chevron_left</span></button>
              <span>${state.historyPage} / ${state.historyTotalPages}</span>
              <button is="emby-button" type="button" class="emby-button" onclick="window.JellyfinEnhanced.downloadsPage.nextHistoryPage()" ${state.historyPage >= state.historyTotalPages ? "disabled" : ""}><span class="material-icons">chevron_right</span></button>
            </div>
          `;
          }
        }
        html += `</div>`;
      }
      return html;
    }
    function renderPage(targetContainer) {
      let container;
      if (targetContainer) {
        state._customTabContainer = targetContainer;
        container = targetContainer;
      } else if (state._customTabContainer && document.contains(state._customTabContainer) && window.location.hash.indexOf("userpluginsettings") === -1) {
        container = state._customTabContainer;
      } else {
        state._customTabContainer = null;
        container = document.getElementById("je-downloads-container");
        if (!container) return;
      }
      let html = "";
      const showDownloads = JE.pluginConfig?.ShowDownloadsInRequests !== false;
      if (showDownloads) {
        html += `<div class="je-downloads-section je-active-downloads-section" style="margin-top: 2em;">`;
        const labelActiveDownloads = JE.t && JE.t("requests_downloads") || "Downloads";
        html += `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1em;">
        <h2 style="margin: 0.5em 0 0 0;"><span class="je-msym-rounded je-section-icon" aria-hidden="true">download</span>${labelActiveDownloads}</h2>
        <button class="je-refresh-btn emby-button" style="background: transparent; border: 1px solid rgba(255,255,255,0.3); color: inherit; padding: 0.5em; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 0.5em; opacity: 0.8; transition: all 0.2s;">
          <span class="material-icons" style="font-size: 18px;">refresh</span>
        </button>
      </div>
    `;
        if (state.isLoading && state.downloads.length === 0) {
          html += JE.core.ui.skeletonGridHtml(6);
        } else if (state.downloadsError) {
          html += `<div class="je-empty-state">Unable to load downloads</div>`;
        } else if (state.downloads.length === 0) {
          const labelNoActiveDownloads = JE.t && JE.t("requests_no_active_downloads") || "No active downloads";
          html += `
        <div class="je-empty-state">
          <div>${labelNoActiveDownloads}</div>
        </div>
      `;
        } else {
          const statuses = getDownloadStatuses();
          const showSearchBar = state.downloads.length > 0;
          if (statuses.length > 1 || showSearchBar) {
            html += `<div class="je-downloads-controls">`;
            if (statuses.length > 0) {
              const totalGroupedCount = statuses.reduce((sum, [_, count]) => sum + count, 0);
              html += `<div class="je-downloads-tabs">`;
              html += `<button is="emby-button" type="button" class="je-downloads-tab emby-button ${state.downloadsActiveTab === "all" ? "active" : ""}" data-tab="all">
            <span>${translateStatus("All")}</span>
            <span class="je-downloads-tab-count">${totalGroupedCount}</span>
          </button>`;
              for (const [status, count] of statuses) {
                html += `<button is="emby-button" type="button" class="je-downloads-tab emby-button ${state.downloadsActiveTab === status ? "active" : ""}" data-tab="${JE.escapeHtml(status)}">
              <span>${JE.escapeHtml(translateStatus(status))}</span>
              <span class="je-downloads-tab-count">${count}</span>
            </button>`;
              }
              if (showSearchBar) {
                html += `<button class="je-downloads-search-toggle ${state.downloadsSearchVisible ? "active" : ""}">
              <span class="material-icons">search</span>
            </button>`;
              }
              html += `</div>`;
            }
            if (showSearchBar && state.downloadsSearchVisible) {
              html += `<div class="je-downloads-search-container">
            <span class="material-icons je-downloads-search-icon">search</span>
            <input type="text" class="je-downloads-search-input" value="${JE.escapeHtml(state.downloadsSearchQuery)}" autofocus>
          </div>`;
            }
            html += `</div>`;
          }
          const filteredDownloads = getFilteredDownloads();
          if (filteredDownloads.length === 0) {
            const labelNoMatches = JE.t && JE.t("requests_no_downloads_found") || "No downloads found";
            html += `
          <div class="je-empty-state">
            <div>${labelNoMatches}</div>
          </div>
        `;
          } else {
            const groupedDownloads = groupDownloads(filteredDownloads);
            html += `<div class="je-downloads-grid">`;
            for (const group of groupedDownloads) {
              if (group.type === "seasonPack") {
                html += renderSeasonPackCard(group);
              } else {
                html += renderDownloadCard(group.item);
              }
            }
            html += `</div>`;
          }
        }
        html += `</div>`;
      }
      html += buildRequestsSection();
      html += buildIssuesSection();
      html += buildHistorySection();
      clearAvatarObjectUrlCache();
      container.innerHTML = html;
      hydrateAvatarImages(container);
      hydrateExternalLinks(container);
      const refreshBtn = container.querySelector(".je-refresh-btn");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const icon = refreshBtn.querySelector(".material-icons");
          if (icon) {
            icon.style.animation = "spin 1s linear";
            setTimeout(() => {
              icon.style.animation = "";
            }, 1e3);
          }
          loadAllData();
        });
      }
      const downloadTabs = container.querySelectorAll(".je-downloads-tab");
      downloadTabs.forEach((tab) => {
        tab.addEventListener("click", (e) => {
          e.preventDefault();
          const tabName = tab.getAttribute("data-tab");
          state.downloadsActiveTab = tabName || "all";
          renderPage();
        });
      });
      const searchToggle = container.querySelector(".je-downloads-search-toggle");
      if (searchToggle) {
        searchToggle.addEventListener("click", (e) => {
          e.preventDefault();
          state.downloadsSearchVisible = !state.downloadsSearchVisible;
          if (!state.downloadsSearchVisible) {
            state.downloadsSearchQuery = "";
          }
          renderPage();
        });
      }
      const searchInput = container.querySelector(".je-downloads-search-input");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          const lease = life.capture();
          const query = searchInput.value;
          state.downloadsSearchQuery = query;
          if (state.searchDebounceTimer) {
            clearTimeout(state.searchDebounceTimer);
          }
          state.searchDebounceTimer = setTimeout(() => {
            if (!lease.current()) return;
            const currentInput = document.querySelector(".je-downloads-search-input");
            const cursorPosition = currentInput ? currentInput.selectionStart : 0;
            renderPage();
            const newInput = document.querySelector(".je-downloads-search-input");
            if (newInput) {
              newInput.focus();
              newInput.setSelectionRange(cursorPosition, cursorPosition);
            }
          }, 300);
        });
      }
      if (!container.dataset.jeRequestsActionsBound) {
        container.dataset.jeRequestsActionsBound = "true";
        container.addEventListener("click", (e) => {
          if (!(e.target instanceof Element)) return;
          const playBtn = e.target.closest(".je-request-watch-btn");
          if (playBtn) {
            e.preventDefault();
            e.stopPropagation();
            const mediaId = playBtn.getAttribute("data-media-id");
            if (mediaId && host.Emby?.Page?.showItem) {
              host.Emby.Page.showItem(mediaId);
            }
            return;
          }
          const approveBtn = e.target.closest(".je-request-approve-btn");
          if (approveBtn) {
            e.preventDefault();
            e.stopPropagation();
            handleRequestAction(approveBtn, "approve");
            return;
          }
          const declineBtn = e.target.closest(".je-request-decline-btn");
          if (declineBtn) {
            e.preventDefault();
            e.stopPropagation();
            handleRequestAction(declineBtn, "decline");
            return;
          }
          const viewIssueBtn = e.target.closest(".je-issue-view-btn");
          if (viewIssueBtn && !viewIssueBtn.classList.contains("is-disabled")) {
            e.preventDefault();
            e.stopPropagation();
            const tmdbId = viewIssueBtn.getAttribute("data-issue-tmdb-id");
            const mediaType = viewIssueBtn.getAttribute("data-issue-media-type");
            const title = viewIssueBtn.getAttribute("data-issue-title") || "";
            const issueReporter = ctx.peer("jellyseerrIssueReporter");
            if (tmdbId && mediaType && issueReporter?.showReportModal) {
              issueReporter.showReportModal(tmdbId, title, mediaType, null, null);
            }
            return;
          }
          const card = e.target.closest(".je-download-card, .je-request-card, .je-issue-card");
          if (card) {
            const mediaId = card.getAttribute("data-media-id");
            if (mediaId && host.Emby?.Page?.showItem) {
              host.Emby.Page.showItem(mediaId);
            }
          }
        });
      }
    }
    function createPageContainer() {
      let page = document.getElementById("je-downloads-page");
      if (!page) {
        page = document.createElement("div");
        page.id = "je-downloads-page";
        page.className = "page type-interior mainAnimatedPage hide";
        page.setAttribute("data-title", JE.t?.("requests_requests") || "Requests");
        page.setAttribute("data-backbutton", "true");
        page.setAttribute("data-url", "#/downloads");
        page.setAttribute("data-type", "custom");
        page.innerHTML = `
        <div data-role="content">
          <div class="content-primary je-downloads-page">
            <div id="je-downloads-container" style="padding-top: 5em;"></div>
          </div>
        </div>
      `;
        const mainContent = document.querySelector(".mainAnimatedPages");
        if (mainContent) {
          mainContent.appendChild(page);
        } else {
          document.body.appendChild(page);
        }
      }
      return page;
    }
    const SECTIONS = {
      requests: { selector: ".je-requests-section", build: buildRequestsSection },
      issues: { selector: ".je-issues-section", build: buildIssuesSection },
      history: { selector: ".je-history-section", build: buildHistorySection }
    };
    function renderSection(name) {
      const container = state._customTabContainer && document.contains(state._customTabContainer) && window.location.hash.indexOf("userpluginsettings") === -1 ? state._customTabContainer : document.getElementById("je-downloads-container");
      const current = container?.querySelector(SECTIONS[name].selector);
      if (!current) {
        renderPage();
        return;
      }
      const template = document.createElement("template");
      template.innerHTML = SECTIONS[name].build();
      const next = template.content.firstElementChild;
      if (!next) {
        current.remove();
        return;
      }
      current.replaceWith(next);
      hydrateAvatarImages(next);
      hydrateExternalLinks(next);
    }
    P.renderPage = renderPage;
    P.renderSection = renderSection;
    P.createPageContainer = createPageContainer;
  }

  // client/src/features/downloads/render-entry.ts
  install(downloadsHost());
})();
})();
//# sourceMappingURL=requests-page-render.js.map
