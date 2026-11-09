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
  function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function readItem(value) {
    if (!record(value) || typeof value.Id !== "string") throw new Error("Invalid item response");
    const text = (key) => typeof value[key] === "string" ? value[key] : void 0;
    const number = (key) => typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] : void 0;
    const providers = record(value.ProviderIds) ? value.ProviderIds : {};
    const tags = record(value.ImageTags) ? value.ImageTags : {};
    const user = record(value.UserData) ? value.UserData : {};
    return {
      Id: value.Id,
      Name: text("Name"),
      Type: text("Type"),
      SeriesId: text("SeriesId"),
      SeriesName: text("SeriesName"),
      ProductionYear: number("ProductionYear"),
      ParentIndexNumber: number("ParentIndexNumber"),
      IndexNumber: number("IndexNumber"),
      ProviderIds: { Tmdb: typeof providers.Tmdb === "string" ? providers.Tmdb : void 0, Tvdb: typeof providers.Tvdb === "string" ? providers.Tvdb : void 0 },
      ImageTags: { Primary: typeof tags.Primary === "string" ? tags.Primary : void 0 },
      UserData: { Key: typeof user.Key === "string" ? user.Key : void 0 }
    };
  }
  function readItems(value) {
    if (typeof value === "string") return readItems(JSON.parse(value));
    if (!record(value) || !Array.isArray(value.Items)) throw new Error("Invalid items response");
    return value.Items.map(readItem);
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

  // client/src/features/bookmarks/library-replacements.ts
  var { JE, host, getApi } = bookmarksHost();
  function install(JE2) {
    const lifetime = createLifetime(JE2, "library-replacements");
    lifetime.listen(document, "viewshow", lifetime.cancelPending, true);
    const setTimeout = lifetime.timeout;
    const internal = JE2.internals.bookmarksLibrary = JE2.internals.bookmarksLibrary || {};
    if (!JE2?.pluginConfig?.BookmarksEnabled) return;
    const renderBookmarksLibrary = (...args) => {
      const fn = internal.renderBookmarksLibrary;
      if (!fn) throw new Error("Missing bookmark module: renderBookmarksLibrary");
      return fn(...args);
    };
    const escapeHtml = JE2.escapeHtml;
    async function searchForReplacementItem(tmdbId, tvdbId, mediaType, seasonNumber = null, episodeNumber = null) {
      const isCurrent = lifetime.current();
      const apiClient = getApi();
      if (!apiClient) return null;
      const userId = apiClient.getCurrentUserId();
      try {
        const itemTypes = mediaType === "tv" ? "Series,Episode" : mediaType === "movie" ? "Movie" : null;
        const items = [];
        const seen = /* @__PURE__ */ new Set();
        for (let start = 0; ; start += 500) {
          const url = `Users/${encodeURIComponent(userId || "")}/Items?Recursive=true${itemTypes ? `&IncludeItemTypes=${itemTypes}` : ""}&Fields=ProviderIds&SortBy=DateCreated&SortOrder=Descending&Limit=500&StartIndex=${start}`;
          const response = await JE2.core.api.fetch(apiClient.getUrl(url));
          if (!isCurrent()) return null;
          const batch = readItems(response);
          const unseen = batch.filter((item) => !seen.has(item.Id));
          for (const item of unseen) {
            seen.add(item.Id);
            items.push(item);
          }
          if (batch.length < 500 || unseen.length === 0) break;
        }
        const matches = items.filter((item) => {
          const providerIds = item.ProviderIds || {};
          const userData = item.UserData || {};
          let providerMatch = false;
          if (tmdbId) {
            if (providerIds.Tmdb === String(tmdbId)) providerMatch = true;
            if (userData.Key === String(tmdbId)) providerMatch = true;
          }
          if (!providerMatch && tvdbId) {
            if (providerIds.Tvdb === String(tvdbId)) providerMatch = true;
          }
          if (!providerMatch) return false;
          if (episodeNumber != null) {
            return item.Type === "Episode" && item.ParentIndexNumber === seasonNumber && item.IndexNumber === episodeNumber;
          }
          return true;
        });
        console.log(`🪼 Jellyfin Enhanced: Bookmarks Library: Found ${matches.length} matches for ${tmdbId ? "TMDB:" + tmdbId : "TVDB:" + tvdbId}`, matches);
        return matches.length > 0 ? matches : null;
      } catch (e) {
        console.error("Failed to search for replacement:", e);
        return null;
      }
    }
    async function findAndOfferReplacement(group, triggerBtn) {
      const isCurrent = lifetime.current();
      triggerBtn.disabled = true;
      const matches = await searchForReplacementItem(
        group.details.tmdbId,
        group.details.tvdbId,
        group.details.mediaType,
        group.details.seasonNumber ?? null,
        group.details.episodeNumber ?? null
      );
      if (!isCurrent()) return;
      if (!matches || matches.length === 0) {
        if (isCurrent()) JE2.toast(JE2.t("bookmark_no_replacement"), 3e3);
        triggerBtn.disabled = false;
        return;
      }
      showReplacementSelectionModal(group, matches);
      triggerBtn.disabled = false;
    }
    function showReplacementSelectionModal(oldGroup, replacementItems) {
      const currentView = lifetime.current();
      const apiClient = getApi();
      if (!apiClient) return;
      const modal = document.createElement("div");
      const isCurrent = () => currentView() && modal.isConnected;
      modal.className = "je-bm-library-modal-overlay";
      modal.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;";
      modal.innerHTML = `
      <div class="je-bm-library-modal-container je-replacement-modal-container">
        <button class="je-bm-library-modal-close">×</button>
        <div class="je-bm-library-modal-content" style="padding: 28px;">
          <div class="je-bookmarks-modal-header">
            <span class="material-icons" aria-hidden="true" style="font-size: 48px; color: #4caf50; flex-shrink: 0;">find_replace</span>
            <div style="flex: 1;">
              <h2 class="je-modal-title">Replacement Found</h2>
              <p class="je-modal-subtitle">Migrate ${oldGroup.bookmarks.length} bookmark(s) from the old item to a new version</p>
            </div>
          </div>

          <div class="je-modal-warning-box">
            <div class="je-modal-warning-label">Old Item (Missing)</div>
            <div class="je-modal-item-name">${escapeHtml(oldGroup.details.name)}</div>
            <div class="je-modal-item-meta">TMDB: ${escapeHtml(oldGroup.details.tmdbId || "N/A")} • Item ID: ${escapeHtml(oldGroup.details.itemId.substring(0, 16))}...</div>
          </div>

          <div class="je-replacement-section-title">Select Replacement:</div>
          <div class="je-replacement-options">
            ${replacementItems.map((item, idx) => {
        const posterUrl = apiClient.getImageUrl(item.Id, {
          type: "Primary",
          maxWidth: 120,
          tag: item.ImageTags?.Primary
        });
        return `
                <div class="replacement-option" data-item-index="${idx}" style="display: flex; gap: 12px; background: rgba(76,175,80,0.05); border: 2px solid rgba(76,175,80,0.2); border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.2s; align-items: center;">
                  ${posterUrl ? `<img src="${escapeHtml(posterUrl)}" style="width: 60px; height: 90px; object-fit: cover; border-radius: 6px; flex-shrink: 0;">` : '<div style="width: 60px; height: 90px; background: rgba(255,255,255,0.05); border-radius: 6px; flex-shrink: 0;"></div>'}
                  <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #fff; font-size: 15px;">${escapeHtml(item.Name)}</div>
                    <div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">${item.ProductionYear || ""}</div>
                    <div style="font-size: 11px; color: #888;">Item ID: ${escapeHtml(item.Id.substring(0, 16))}...</div>
                  </div>
                  <span class="material-icons" aria-hidden="true" style="color: #4caf50; font-size: 28px; display: none; flex-shrink: 0;">check_circle</span>
                </div>
              `;
      }).join("")}
          </div>
        </div>
        <div class="je-modal-actions-padded">
          <button class="je-modal-btn-cancel-alt je-bookmark-btn-cancel">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">close</span>
            <span>Cancel</span>
          </button>
          <button class="je-modal-btn-submit je-bookmark-btn-submit" disabled>
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">swap_horiz</span>
            <span>Migrate Bookmarks</span>
          </button>
        </div>
      </div>
    `;
      document.body.appendChild(modal);
      let selectedItem = null;
      const closeDialog = lifetime.modal(modal);
      required(modal, ".je-bm-library-modal-close").addEventListener("click", closeDialog);
      required(modal, ".je-bookmark-btn-cancel").addEventListener("click", closeDialog);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeDialog();
      });
      modal.querySelectorAll(".replacement-option").forEach((option) => {
        option.addEventListener("click", () => {
          if (!isCurrent()) return;
          const idx = Number(option.dataset.itemIndex);
          selectedItem = replacementItems[idx] ?? null;
          modal.querySelectorAll(".replacement-option").forEach((opt) => {
            opt.style.borderColor = "rgba(76,175,80,0.2)";
            opt.style.background = "rgba(76,175,80,0.05)";
            required(opt, ".material-icons").style.display = "none";
          });
          option.style.borderColor = "#4caf50";
          option.style.background = "rgba(76,175,80,0.15)";
          required(option, ".material-icons").style.display = "block";
          const submitBtn = required(modal, ".je-bookmark-btn-submit");
          submitBtn.disabled = false;
          submitBtn.style.opacity = "1";
        });
      });
      required(modal, ".je-bookmark-btn-submit").addEventListener("click", async () => {
        if (!isCurrent()) return;
        if (!selectedItem) return;
        const btn = required(modal, ".je-bookmark-btn-submit");
        btn.disabled = true;
        required(btn, "span:last-child").textContent = "Migrating...";
        try {
          const userId = apiClient.getCurrentUserId();
          const fullItem = readItem(JE2.helpers?.getItemCached ? await JE2.helpers.getItemCached(selectedItem.Id, { userId }) : await apiClient.getItem(userId, selectedItem.Id));
          if (!isCurrent()) return;
          const newDetails = {
            itemId: fullItem.Id,
            tmdbId: fullItem.ProviderIds?.Tmdb || oldGroup.details.tmdbId,
            tvdbId: fullItem.ProviderIds?.Tvdb || oldGroup.details.tvdbId,
            mediaType: oldGroup.details.mediaType,
            name: fullItem.Name,
            seasonNumber: fullItem.Type === "Episode" ? fullItem.ParentIndexNumber ?? null : null,
            episodeNumber: fullItem.Type === "Episode" ? fullItem.IndexNumber ?? null : null
          };
          const synced = await JE2.bookmarks.syncBookmarks(oldGroup.bookmarks, newDetails, 0, { replaceOriginals: true });
          if (!isCurrent()) return;
          if (isCurrent()) JE2.toast(JE2.t("bookmark_migrated").replace("{count}", String(synced.length)).replace("{name}", fullItem.Name || ""), 4e3);
          closeDialog();
          const container = document.querySelector(".sections.bookmarks");
          if (container) {
            setTimeout(() => renderBookmarksLibrary(container), 500);
          }
        } catch (e) {
          console.error("Migration failed:", e);
          if (isCurrent()) JE2.toast(JE2.t("bookmark_migration_failed"), 3e3);
          btn.disabled = false;
          required(btn, "span:last-child").textContent = JE2.t("bookmark_migrate");
        }
      });
      setTimeout(() => modal.style.opacity = "1", 10);
    }
    Object.assign(internal, { findAndOfferReplacement });
  }
  install(JE);
})();
})();
//# sourceMappingURL=bookmarks-library-replacements.js.map
