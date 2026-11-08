(() => {
"use strict";
(() => {
  // client/src/host/bookmarks-host.ts
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

  // client/src/features/bookmarks/domain.ts
  function displayBookmarks(input) {
    return Object.fromEntries(Object.entries(input ?? {}).filter((entry) => {
      const value = entry[1];
      return typeof value === "object" && value !== null && "itemId" in value && typeof value.itemId === "string" && ["name", "mediaType", "label", "tmdbId", "tvdbId", "syncedFrom"].every((key) => !Object.prototype.hasOwnProperty.call(value, key) || Reflect.get(value, key) == null || typeof Reflect.get(value, key) === "string") && "timestamp" in value && typeof value.timestamp === "number" && Number.isFinite(value.timestamp) && value.timestamp >= 0;
    }));
  }
  function formatTimestamp(seconds) {
    const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = Math.floor(value % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }
  function parseTimestampInput(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).trim();
    if (!/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){0,2}$/.test(text)) return null;
    const parts = text.split(":").map(Number);
    const result = parts.reduce((sum, part) => sum * 60 + part, 0);
    return Number.isFinite(result) ? result : null;
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

  // client/src/features/bookmarks/library-render.ts
  var { JE, host, getApi } = bookmarksHost();
  function install(JE2) {
    const lifetime = createLifetime(JE2, "library-render");
    const internal = JE2.internals.bookmarksLibrary = JE2.internals.bookmarksLibrary || {};
    if (!JE2?.pluginConfig?.BookmarksEnabled) return;
    const renderBookmarkItems = (...args) => {
      const fn = internal.renderBookmarkItems;
      if (!fn) throw new Error("Missing bookmark module: renderBookmarkItems");
      return fn(...args);
    };
    const showDuplicatesSyncModal = (...args) => {
      const fn = internal.showDuplicatesSyncModal;
      if (!fn) throw new Error("Missing bookmark module: showDuplicatesSyncModal");
      return fn(...args);
    };
    const logPrefix = "🪼 Jellyfin Enhanced: Bookmarks Library:";
    let isRendering = false;
    let lastMountedContainer = null;
    lifetime.keep(JE2.session?.onUserChange("bookmarks-library-render-state", () => {
      lastMountedContainer = null;
    }));
    function invalidateBookmarks() {
      lastMountedContainer = null;
      renderIfSectionExists();
    }
    lifetime.listen(document, "je:user-data-loaded", invalidateBookmarks);
    lifetime.listen(document, "je-bookmarks-updated", invalidateBookmarks);
    function renderIfSectionExists() {
      if (isRendering) return;
      const container = findActiveBookmarksContainer();
      if (!container) {
        lastMountedContainer = null;
        return;
      }
      const shouldRender = container !== lastMountedContainer || !container.hasChildNodes() || lastMountedContainer && !document.contains(lastMountedContainer);
      if (shouldRender) {
        revealSection(container);
        isRendering = true;
        lastMountedContainer = container;
        let completed = false;
        renderBookmarksLibrary(container).then(() => {
          completed = true;
        }).catch((error) => {
          console.error(`${logPrefix} Failed to render bookmarks:`, error);
        }).finally(() => {
          isRendering = false;
          if (lastMountedContainer !== container || findActiveBookmarksContainer() !== container || completed && !container.hasChildNodes()) {
            renderIfSectionExists();
          }
        });
      }
    }
    function findActiveBookmarksContainer() {
      const all = document.querySelectorAll(".sections.bookmarks");
      for (let i = all.length - 1; i >= 0; i--) {
        const el = all[i];
        if (el && JE2.helpers.isActiveTabContainer(el)) return el;
      }
      return null;
    }
    function hookViewEvents() {
      lifetime.keep(JE2.core.navigation.onViewPage((v, el, hash, itemPromise, rawEvent) => {
        const e = rawEvent;
        if (!e) return;
        if (isRendering) return;
        renderIfSectionExists();
      }));
    }
    function revealSection(container) {
      container.classList.remove("hide");
      container.style.removeProperty("display");
      container.style.removeProperty("visibility");
    }
    async function renderBookmarksLibrary(container) {
      const isCurrent = lifetime.current();
      console.log(`${logPrefix} Rendering bookmarks library...`);
      const bookmarks = displayBookmarks(JE2.userConfig?.bookmark?.bookmarks);
      const bookmarkEntries = Object.entries(bookmarks);
      const groupedByItem = /* @__PURE__ */ Object.create(null);
      const typeCounts = {
        tv: { items: 0, bookmarks: 0 },
        movie: { items: 0, bookmarks: 0 },
        other: { items: 0, bookmarks: 0 }
      };
      for (const [id, bm] of bookmarkEntries) {
        const key = bm.itemId || bm.tmdbId || bm.tvdbId || "unknown";
        const normalizedType = normalizeMediaType(bm.mediaType);
        if (!groupedByItem[key]) {
          groupedByItem[key] = {
            details: bm,
            bookmarks: [],
            type: normalizedType
          };
          if (typeCounts[normalizedType]) {
            typeCounts[normalizedType].items += 1;
          }
        }
        groupedByItem[key]?.bookmarks.push({ ...bm, id });
        typeCounts[normalizedType].bookmarks += 1;
      }
      Object.values(groupedByItem).forEach((group) => {
        group.bookmarks.sort((a, b) => a.timestamp - b.timestamp);
      });
      const totalBookmarks = bookmarkEntries.length;
      const tabOrder = ["movie", "tv", "other"];
      let currentTab = normalizeMediaType(container.dataset.currentTab || "movie");
      if (!typeCounts[currentTab] || typeCounts[currentTab].items === 0) {
        const fallback = tabOrder.find((t) => typeCounts[t].items > 0);
        if (fallback) currentTab = fallback;
      }
      container.dataset.currentTab = currentTab;
      container.innerHTML = `
      <div class="je-bookmarks-wrapper">
        <input type="search" class="je-bookmark-search je-input" aria-label="Search bookmarks" placeholder="Search bookmarks">
        <div class="je-bookmark-tabs">
          <button class="je-tab ${currentTab === "movie" ? "active" : ""}" data-tab="movie">
            ${JE2.t("bookmarks_library_tab_movies")}
          </button>
          <button class="je-tab ${currentTab === "tv" ? "active" : ""}" data-tab="tv">
            ${JE2.t("bookmarks_library_tab_series")}
          </button>
          <button class="je-tab ${currentTab === "other" ? "active" : ""}" data-tab="other">
            ${JE2.t("bookmarks_library_tab_others")}
          </button>
        </div>

        <div class="bookmarks-container">
          ${totalBookmarks === 0 ? `
            <div class="je-bookmarks-empty">
              <div class="je-bookmarks-empty-icon material-icons" aria-hidden="true">bookmark_border</div>
              <div class="je-bookmarks-empty-title">${JE2.t("bookmarks_library_empty_title")}</div>
              <div class="je-bookmarks-empty-hint">${JE2.t("bookmarks_library_empty_hint")}</div>
            </div>
          ` : `
            <div class="je-bookmarks-grid" id="bookmarks-items-container"></div>
            <div class="je-bookmark-actions-footer">
              <button class="btnFindDuplicates je-btn-footer">
                <span class="material-icons" aria-hidden="true">merge</span>
                <span>${JE2.t("bookmarks_library_button_find_duplicates")}</span>
              </button>
              <button class="btnCleanupBookmarks je-btn-footer">
                <span class="material-icons" aria-hidden="true">cleaning_services</span>
                <span>${JE2.t("bookmarks_library_button_cleanup")}</span>
              </button>
              <button class="btnDeleteAllBookmarks je-btn-footer je-btn-footer-delete">
                <span class="material-icons" aria-hidden="true">delete</span>
                <span>${JE2.t("bookmarks_library_button_delete_all")}</span>
              </button>
            </div>
          `}
        </div>
      </div>
    `;
      const search = container.querySelector(".je-bookmark-search");
      const applySearch = () => {
        const text = search?.value.trim().toLocaleLowerCase() || "";
        container.querySelectorAll(".je-bookmark-item").forEach((card) => {
          card.hidden = !(card.textContent || "").toLocaleLowerCase().includes(text);
        });
      };
      search?.addEventListener("input", applySearch);
      const findDuplicatesBtn = container.querySelector(".btnFindDuplicates");
      const cleanupBtn = container.querySelector(".btnCleanupBookmarks");
      const deleteAllBtn = container.querySelector(".btnDeleteAllBookmarks");
      findDuplicatesBtn?.addEventListener("click", async () => {
        if (!isCurrent()) return;
        findDuplicatesBtn.disabled = true;
        const label = findDuplicatesBtn.querySelector("span:last-child");
        if (!label) return;
        const origText = label.innerHTML;
        label.innerHTML = '<span class="material-icons" style="animation: spin 1s linear infinite;">refresh</span>';
        showDuplicatesSyncModal(bookmarks);
        findDuplicatesBtn.disabled = false;
        label.innerHTML = origText;
      });
      cleanupBtn?.addEventListener("click", async () => {
        if (!isCurrent()) return;
        cleanupBtn.disabled = true;
        const label = cleanupBtn.querySelector("span:last-child");
        const origText = label?.innerHTML;
        if (label) label.innerHTML = '<span class="material-icons" style="animation: spin 1s linear infinite;">refresh</span>';
        try {
          const result = await JE2.bookmarks.cleanupOrphaned();
          if (!isCurrent()) return;
          if (isCurrent()) JE2.toast(JE2.t("bookmark_cleanup_complete").replace("{count}", String(result.cleaned)), 4e3);
          renderBookmarksLibrary(container);
        } catch (error) {
          console.error("Cleanup failed:", error);
          if (isCurrent()) JE2.toast(JE2.t("bookmark_cleanup_failed"), 3e3);
        } finally {
          cleanupBtn.disabled = false;
          if (label && origText) label.innerHTML = origText;
        }
      });
      deleteAllBtn?.addEventListener("click", async () => {
        if (!isCurrent()) return;
        if (!confirm(JE2.t("bookmark_delete_all_confirm"))) return;
        deleteAllBtn.disabled = true;
        const label = deleteAllBtn.querySelector("span:last-child");
        const origText = label?.innerHTML;
        if (label) label.innerHTML = '<span class="material-icons" style="animation: spin 1s linear infinite;">refresh</span>';
        try {
          if (!await JE2.bookmarks.deleteAll() || !isCurrent()) return;
          if (isCurrent()) JE2.toast(JE2.t("bookmark_deleted_all"), 3e3);
          renderBookmarksLibrary(container);
        } catch (error) {
          console.error("Delete failed:", error);
          if (isCurrent()) JE2.toast(JE2.t("bookmark_delete_failed"), 3e3);
        } finally {
          deleteAllBtn.disabled = false;
          if (label && origText) label.innerHTML = origText;
        }
      });
      if (totalBookmarks > 0) {
        const itemsContainer = container.querySelector("#bookmarks-items-container");
        if (itemsContainer) {
          await renderBookmarkItems(itemsContainer, groupedByItem, currentTab);
          if (!isCurrent()) return;
          applySearch();
          container.querySelectorAll(".je-tab").forEach((btn) => {
            btn.addEventListener("click", async () => {
              if (!isCurrent()) return;
              const tab = normalizeMediaType(btn.dataset.tab);
              container.dataset.currentTab = tab;
              container.querySelectorAll(".je-tab").forEach((b) => {
                b.classList.toggle("active", b.dataset.tab === tab);
              });
              await renderBookmarkItems(itemsContainer, groupedByItem, tab);
              if (isCurrent()) applySearch();
            });
          });
        }
      }
    }
    function normalizeMediaType(mediaType) {
      const type = (mediaType || "").toLowerCase();
      if (type === "series" || type === "episode" || type === "tvshow" || type === "tv") return "tv";
      if (type === "movie" || type === "film") return "movie";
      return "other";
    }
    Object.assign(internal, {
      renderIfSectionExists,
      hookViewEvents,
      renderBookmarksLibrary,
      formatTimestamp,
      parseTimestampInput
    });
  }
  install(JE);
})();
})();
//# sourceMappingURL=bookmarks-library-render.js.map
