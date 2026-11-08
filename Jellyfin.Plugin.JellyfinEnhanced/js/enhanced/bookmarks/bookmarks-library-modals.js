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

  // client/src/features/bookmarks/dom.ts
  function required(root, selector) {
    const element = root.querySelector(selector);
    if (!element) throw new Error("Missing bookmark control: " + selector);
    return element;
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

  // client/src/features/bookmarks/library-modals.ts
  var { JE, host, getApi } = bookmarksHost();
  function install(JE2) {
    const lifetime = createLifetime(JE2, "library-modals");
    const setTimeout = lifetime.timeout;
    const internal = JE2.internals.bookmarksLibrary = JE2.internals.bookmarksLibrary || {};
    if (!JE2?.pluginConfig?.BookmarksEnabled) return;
    const formatTimestamp = (...args) => {
      const fn = internal.formatTimestamp;
      if (!fn) throw new Error("Missing bookmark module: formatTimestamp");
      return fn(...args);
    };
    const renderBookmarksLibrary = (...args) => {
      const fn = internal.renderBookmarksLibrary;
      if (!fn) throw new Error("Missing bookmark module: renderBookmarksLibrary");
      return fn(...args);
    };
    const escapeHtml = JE2.escapeHtml;
    function showOffsetAdjustmentModal(group) {
      const isCurrent = lifetime.current();
      const syncedBookmarks = group.bookmarks.filter((bm) => bm.syncedFrom);
      if (syncedBookmarks.length === 0) {
        if (isCurrent()) JE2.toast(JE2.t("bookmark_no_synced"), 2e3);
        return;
      }
      const modal = document.createElement("div");
      modal.className = "je-bm-library-modal-overlay";
      modal.innerHTML = `
      <div class="je-bm-library-modal-container" style="max-width: 550px;">
        <button class="je-bm-library-modal-close">×</button>
        <div class="je-bm-library-modal-content">
          <div class="je-bookmarks-modal-header">
            <span class="material-icons" aria-hidden="true" style="font-size: 48px; color: #2196f3; flex-shrink: 0;">schedule</span>
            <div style="flex: 1;">
              <h2 class="je-modal-title">${JE2.t("bookmark_adjust_offset")}</h2>
              <p class="je-modal-subtitle">${JE2.t("bookmark_synced_count").replace("{count}", String(syncedBookmarks.length))} ${JE2.t("bookmark_for_item").replace("{name}", escapeHtml(group.details.name))}</p>
            </div>
          </div>

          <div class="je-modal-info-box">
            <div class="je-modal-info-title"><span class="material-icons" style="font-size: 14px; vertical-align: middle;">info</span> ${JE2.t("bookmark_synced_info_title")}</div>
            <div class="je-modal-info-text">${JE2.t("bookmark_synced_info_body")}</div>
          </div>

          <div style="margin-bottom: 24px;">
            <label for="offset-adjustment-input" class="je-modal-label"><span class="material-icons" style="font-size: 14px; vertical-align: middle;">schedule</span> ${JE2.t("bookmark_offset_label")}</label>
            <input type="number" id="offset-adjustment-input" value="0" step="0.1" placeholder="0" class="je-modal-input">
            <div class="je-modal-help-text">${JE2.t("bookmark_offset_help")}</div>
          </div>

          <div class="je-modal-list-container">
            <div class="je-modal-list-title">${JE2.t("bookmark_offset_affected")}</div>
            ${syncedBookmarks.map((bm) => `
              <div class="je-modal-list-item">
                <div class="je-modal-list-item-title">${escapeHtml(bm.label || JE2.t("bookmark_unlabeled"))}</div>
                <div class="je-modal-list-item-meta">${formatTimestamp(bm.timestamp)} • ${JE2.t("bookmark_from").replace("{source}", escapeHtml(bm.syncedFrom || ""))}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="je-bookmark-modal-actions">
          <button class="je-bookmark-btn-cancel">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">close</span>
            <span>Cancel</span>
          </button>
          <button class="btnApplyOffset je-modal-btn-primary">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">check</span>
            <span>${JE2.t("bookmark_apply_offset")}</span>
          </button>
        </div>
      </div>
    `;
      document.body.appendChild(modal);
      const closeDialog = lifetime.modal(modal);
      required(modal, ".je-bm-library-modal-close").addEventListener("click", closeDialog);
      required(modal, ".je-bookmark-btn-cancel").addEventListener("click", closeDialog);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeDialog();
      });
      required(modal, ".btnApplyOffset").addEventListener("click", async () => {
        if (!isCurrent()) return;
        const offset = parseFloat(required(modal, "#offset-adjustment-input").value) || 0;
        const btn = required(modal, ".btnApplyOffset");
        btn.disabled = true;
        required(btn, "span:last-child").innerHTML = '<span class="material-icons" style="animation: spin 1s linear infinite; font-size: 18px;">refresh</span>';
        try {
          const updatedCount = await JE2.bookmarks.adjustOffsets(syncedBookmarks, offset);
          if (!isCurrent()) return;
          if (updatedCount > 0) {
            const message = offset === 0 ? JE2.t("bookmark_offset_cleared").replace("{count}", String(updatedCount)) : JE2.t("bookmark_offset_applied").replace("{count}", String(updatedCount)).replace("{offset}", `${offset > 0 ? "+" : ""}${offset}s`);
            if (isCurrent()) JE2.toast(message, 3e3);
            closeDialog();
            const container = document.querySelector(".sections.bookmarks");
            if (container) {
              setTimeout(() => renderBookmarksLibrary(container), 300);
            }
          } else {
            if (isCurrent()) JE2.toast(JE2.t("bookmark_update_failed"), 3e3);
            btn.disabled = false;
            required(btn, "span:last-child").textContent = JE2.t("bookmark_apply_offset");
          }
        } catch (e) {
          console.error("Failed to apply offset:", e);
          if (isCurrent()) JE2.toast(JE2.t("bookmark_offset_failed"), 3e3);
          btn.disabled = false;
          required(btn, "span:last-child").textContent = JE2.t("bookmark_apply_offset");
        }
      });
      setTimeout(() => modal.style.opacity = "1", 10);
    }
    function findDuplicateBookmarks(bookmarks) {
      const byProvider = /* @__PURE__ */ Object.create(null);
      const duplicateGroups = [];
      for (const [id, bm] of Object.entries(bookmarks)) {
        const episodeSuffix = bm.episodeNumber != null ? `:s${bm.seasonNumber ?? "x"}e${bm.episodeNumber}` : "";
        const tmdbKey = bm.tmdbId ? `tmdb:${bm.tmdbId}${episodeSuffix}` : null;
        const tvdbKey = bm.tvdbId ? `tvdb:${bm.tvdbId}${episodeSuffix}` : null;
        for (const key of [tmdbKey, tvdbKey].filter((key2) => key2 !== null)) {
          if (!byProvider[key]) {
            byProvider[key] = {};
          }
          const items = byProvider[key];
          if (!items) continue;
          const list = items[bm.itemId] ?? (items[bm.itemId] = []);
          list.push({ ...bm, id });
        }
      }
      for (const [providerKey, itemGroups] of Object.entries(byProvider)) {
        const itemIds = Object.keys(itemGroups);
        if (itemIds.length > 1) {
          duplicateGroups.push({
            providerKey,
            itemGroups,
            totalBookmarks: Object.values(itemGroups).flat().length,
            name: Object.values(itemGroups)[0]?.[0]?.name || "Unknown"
          });
        }
      }
      return duplicateGroups;
    }
    function showDuplicatesSyncModal(bookmarks) {
      const isCurrent = lifetime.current();
      const duplicates = findDuplicateBookmarks(bookmarks);
      if (duplicates.length === 0) {
        if (isCurrent()) JE2.toast(JE2.t("bookmark_no_duplicates"), 3e3);
        return;
      }
      const modal = document.createElement("div");
      modal.className = "je-bm-library-modal-overlay";
      modal.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;";
      modal.innerHTML = `
      <div class="je-bm-library-modal-container" style="max-width: 700px; background: #181818; border-radius: 12px; padding: 24px; position: relative; box-shadow: 0 8px 32px rgba(0,0,0,0.8); max-height: 85vh; overflow-y: auto;">
        <button class="je-bm-library-modal-close" style="position: absolute; top: 16px; right: 16px; background: transparent; border: none; color: #fff; font-size: 32px; cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background 0.2s;">×</button>
        <div class="je-bm-library-modal-content">
          <div class="je-bookmarks-modal-header" style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 24px;">
            <span class="material-icons" aria-hidden="true" style="font-size: 48px; color: #ff9800; flex-shrink: 0;">merge</span>
            <div style="flex: 1;">
              <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #fff;">${JE2.t("bookmark_duplicate_title")}</h2>
              <p style="margin: 0; font-size: 13px; color: #aaa;">${JE2.t("bookmark_duplicate_subtitle").replace("{count}", String(duplicates.length))}</p>
            </div>
          </div>
          <div style="margin-top: 20px;">
            ${duplicates.map((dup, idx) => {
        const itemIds = Object.keys(dup.itemGroups);
        return `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                  <div style="font-weight: 600; margin-bottom: 12px; color: #ff9800;">${escapeHtml(dup.name)}</div>
                  <div style="font-size: 12px; color: #888; margin-bottom: 12px;">
                    ${JE2.t("bookmark_split_versions").replace("{count}", String(dup.totalBookmarks)).replace("{versions}", String(itemIds.length))}
                  </div>
                  ${itemIds.map((itemId, versionIdx) => {
          const bms = dup.itemGroups[itemId] ?? [];
          return `
                      <div style="background: rgba(255,255,255,0.02); border-left: 3px solid ${versionIdx === 0 ? "#4caf50" : "#ff9800"}; padding: 8px 12px; margin-bottom: 8px; border-radius: 4px;">
                        <div style="font-size: 11px; color: ${versionIdx === 0 ? "#4caf50" : "#ff9800"}; font-weight: 600; margin-bottom: 4px;">
                          ${versionIdx === 0 ? JE2.t("bookmark_primary_version") : JE2.t("bookmark_old_version")}
                        </div>
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 6px;">
                          ${JE2.t("bookmark_item_id")}: <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px; font-size: 11px;">${escapeHtml(itemId.substring(0, 16))}...</code>
                        </div>
                        <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">
                          ${JE2.t("bookmark_bookmark_count").replace("{count}", String(bms.length))} ${bms.map((b) => formatTimestamp(b.timestamp)).join(", ")}
                        </div>
                        <button class="je-btn" data-sync-from="${versionIdx}" data-dup-index="${idx}" style="background: rgba(33, 150, 243, 0.15); border-color: #2196f3; color: #2196f3; font-size: 11px;">
                          <span class="material-icons" aria-hidden="true" style="font-size: 14px;">schedule</span>
                          <span>${JE2.t("bookmark_adjust_offset")}</span>
                        </button>
                      </div>
                    `;
        }).join("")}
                  <button class="je-btn" data-dup-index="${idx}" style="margin-top: 8px; background: rgba(255, 152, 0, 0.15); border-color: #ff9800; color: #ff9800;">
                    <span class="material-icons" aria-hidden="true" style="font-size: 16px;">merge</span>
                    <span>${JE2.t("bookmark_merge_primary")}</span>
                  </button>
                </div>
              `;
      }).join("")}
          </div>
        </div>
        <div class="je-bookmark-modal-actions">
          <button class="je-bookmark-btn-cancel">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">close</span>
            <span>Close</span>
          </button>
        </div>
      </div>
    `;
      document.body.appendChild(modal);
      const closeDialog = lifetime.modal(modal);
      required(modal, ".je-bm-library-modal-close").addEventListener("click", closeDialog);
      required(modal, ".je-bookmark-btn-cancel").addEventListener("click", closeDialog);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeDialog();
      });
      modal.querySelectorAll("[data-sync-from]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!isCurrent()) return;
          const dupIndex = Number(btn.dataset.dupIndex);
          const versionIndex = Number(btn.dataset.syncFrom);
          const dup = duplicates[dupIndex];
          if (!dup) return;
          const itemIds = Object.keys(dup.itemGroups);
          const targetItemId = itemIds[versionIndex];
          if (!targetItemId) return;
          const bookmarksForItem = dup.itemGroups[targetItemId] ?? [];
          closeDialog();
          const groupObj = {
            bookmarks: bookmarksForItem,
            details: { name: dup.name }
          };
          showOffsetAdjustmentModal(groupObj);
        });
      });
      modal.querySelectorAll("button.je-btn:not([data-sync-from])").forEach((btn) => {
        if (!btn.dataset.dupIndex) return;
        btn.addEventListener("click", async () => {
          if (!isCurrent()) return;
          const dupIndex = Number(btn.dataset.dupIndex);
          const dup = duplicates[dupIndex];
          if (!dup) return;
          const itemIds = Object.keys(dup.itemGroups);
          if (itemIds.length < 2) return;
          const primaryItemId = itemIds[0];
          const oldItemIds = itemIds.slice(1);
          if (!primaryItemId) return;
          const primary = dup.itemGroups[primaryItemId]?.[0];
          if (!primary) return;
          const oldBookmarks = oldItemIds.flatMap((id) => dup.itemGroups[id] ?? []);
          if (!confirm(JE2.t("bookmark_merge_confirm").replace("{count}", String(oldBookmarks.length)))) {
            return;
          }
          btn.disabled = true;
          required(btn, "span:last-child").innerHTML = '<span class="material-icons" style="animation: spin 1s linear infinite; font-size: 18px;">refresh</span>';
          try {
            const primaryDetails = {
              itemId: primaryItemId,
              tmdbId: primary.tmdbId,
              tvdbId: primary.tvdbId,
              mediaType: primary.mediaType,
              name: primary.name,
              seasonNumber: primary.seasonNumber ?? null,
              episodeNumber: primary.episodeNumber ?? null
            };
            const synced = await JE2.bookmarks.syncBookmarks(oldBookmarks, primaryDetails, 0);
            if (!isCurrent()) return;
            if (isCurrent()) JE2.toast(JE2.t("bookmark_merge_success").replace("{count}", String(synced.length)), 3e3);
            closeDialog();
            const container = document.querySelector(".sections.bookmarks");
            if (container) {
              setTimeout(() => renderBookmarksLibrary(container), 500);
            }
          } catch (e) {
            console.error("Merge failed:", e);
            if (isCurrent()) JE2.toast(JE2.t("bookmark_merge_failed"), 3e3);
            btn.disabled = false;
            required(btn, "span:last-child").textContent = JE2.t("bookmark_merge_primary");
          }
        });
      });
      setTimeout(() => modal.style.opacity = "1", 10);
    }
    Object.assign(internal, { showOffsetAdjustmentModal, showDuplicatesSyncModal });
  }
  install(JE);
})();
})();
//# sourceMappingURL=bookmarks-library-modals.js.map
