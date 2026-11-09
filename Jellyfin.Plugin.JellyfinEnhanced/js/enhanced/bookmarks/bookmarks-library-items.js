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
  function readSessions(value) {
    if (!Array.isArray(value)) throw new Error("Invalid sessions response");
    return value.flatMap((entry) => record(entry) && typeof entry.Id === "string" && typeof entry.DeviceId === "string" ? [{ Id: entry.Id, DeviceId: entry.DeviceId }] : []);
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

  // client/src/features/bookmarks/library-items.ts
  var { JE, host, getApi } = bookmarksHost();
  function install(JE2) {
    const lifetime = createLifetime(JE2, "library-items");
    const setTimeout = lifetime.timeout;
    const internal = JE2.internals.bookmarksLibrary = JE2.internals.bookmarksLibrary || {};
    if (!JE2?.pluginConfig?.BookmarksEnabled) return;
    const formatTimestamp = (...args) => {
      const fn = internal.formatTimestamp;
      if (!fn) throw new Error("Missing bookmark module: formatTimestamp");
      return fn(...args);
    };
    const parseTimestampInput = (...args) => {
      const fn = internal.parseTimestampInput;
      if (!fn) throw new Error("Missing bookmark module: parseTimestampInput");
      return fn(...args);
    };
    const renderBookmarksLibrary = (...args) => {
      const fn = internal.renderBookmarksLibrary;
      if (!fn) throw new Error("Missing bookmark module: renderBookmarksLibrary");
      return fn(...args);
    };
    const findAndOfferReplacement = (...args) => {
      const fn = internal.findAndOfferReplacement;
      if (!fn) throw new Error("Missing bookmark module: findAndOfferReplacement");
      return fn(...args);
    };
    const showOffsetAdjustmentModal = (...args) => {
      const fn = internal.showOffsetAdjustmentModal;
      if (!fn) throw new Error("Missing bookmark module: showOffsetAdjustmentModal");
      return fn(...args);
    };
    const renderSerial = /* @__PURE__ */ new WeakMap();
    const logPrefix = "🪼 Jellyfin Enhanced: Bookmarks Library:";
    const escapeHtml = JE2.escapeHtml;
    async function renderBookmarkItems(container, groupedByItem, currentTab) {
      const isCurrent = lifetime.current();
      const serial = (renderSerial.get(container) ?? 0) + 1;
      renderSerial.set(container, serial);
      container.innerHTML = "";
      const apiClient = getApi();
      if (!apiClient) {
        container.innerHTML = "<p>API client not available</p>";
        return;
      }
      const userId = apiClient.getCurrentUserId();
      const itemPromises = [];
      for (const [key, group] of Object.entries(groupedByItem)) {
        const itemId = group.details.itemId;
        if (itemId) {
          itemPromises.push(
            (JE2.helpers?.getItemCached ? JE2.helpers.getItemCached(itemId, { userId }) : apiClient.getItem(userId, itemId)).then((value) => ({ key, group, item: readItem(value), orphaned: false })).catch((err) => {
              console.warn(`Failed to fetch item ${itemId}:`, err);
              return { key, group, item: null, orphaned: true };
            })
          );
        } else {
          itemPromises.push(Promise.resolve({ key, group, item: null, orphaned: true }));
        }
      }
      const results = await Promise.all(itemPromises);
      if (!isCurrent() || renderSerial.get(container) !== serial) return;
      const filtered = results.filter(({ group }) => {
        if (currentTab === "tv") return group.type === "tv";
        if (currentTab === "movie") return group.type === "movie";
        if (currentTab === "other") return group.type === "other";
        return true;
      });
      if (filtered.length === 0) {
        const emptyTitle = currentTab === "tv" ? JE2.t("bookmark_empty_tv") : currentTab === "movie" ? JE2.t("bookmark_empty_movie") : JE2.t("bookmark_empty_other");
        const emptyHint = JE2.t("bookmark_empty_hint");
        container.innerHTML = `
        <div class="je-bookmarks-empty">
          <div class="je-bookmarks-empty-icon material-icons" aria-hidden="true">bookmark_border</div>
          <div class="je-bookmarks-empty-title">${emptyTitle}</div>
          <div class="je-bookmarks-empty-hint">${emptyHint}</div>
        </div>`;
        return;
      }
      for (const { key, group, item, orphaned } of filtered) {
        const itemCard = document.createElement("div");
        itemCard.className = "je-bookmark-item";
        if (orphaned) {
          itemCard.classList.add("je-bookmark-item-orphaned");
        }
        const posterUrl = item ? apiClient.getImageUrl(item.Id, {
          type: "Primary",
          maxWidth: 260,
          tag: item.ImageTags?.Primary
        }) : "";
        let titleDisplay = escapeHtml(group.details.name || "Unknown Item");
        if (group.type === "tv" && item && item.Type === "Episode" && item.SeriesName) {
          titleDisplay = `${escapeHtml(item.SeriesName)}<br><small class="je-episode-title">S${item.ParentIndexNumber || "?"}:E${item.IndexNumber || "?"} ${item.Name ? escapeHtml(item.Name) : ""}</small>`;
        }
        const headerHtml = `
        <div class="je-bookmark-item-header">
          ${posterUrl ? `
            <img src="${escapeHtml(posterUrl)}"
                 class="je-bookmark-item-poster"
                 data-item-id="${escapeHtml(group.details.itemId)}">
          ` : `
            <div class="je-bookmark-item-placeholder"><span class="material-icons" style="font-size: 48px; opacity: 0.3;">image_not_supported</span></div>
          `}
          <div class="je-bookmark-item-info">
            <a href="/web/#/details?id=${encodeURIComponent(group.details.itemId || "")}" class="je-bookmark-item-title">${titleDisplay}</a>
            <div class="je-bookmark-item-meta">
              ${JE2.t("bookmark_count").replace("{count}", String(group.bookmarks.length))}
              ${orphaned ? ` • <span style="color: #ff9800;">${JE2.t("bookmark_orphaned")}</span>` : ""}
            </div>
          </div>
          ${orphaned && (group.details.tmdbId || group.details.tvdbId) ? `
            <button class="btnFindReplacement je-btn-find-replacement" data-group-key="${escapeHtml(key)}" title="${JE2.t("bookmark_find_replacement")}">
              <span class="material-icons" aria-hidden="true">find_replace</span>
            </button>
          ` : ""}
          ${!orphaned && group.bookmarks.some((bm) => bm.syncedFrom) ? `
            <button class="btnAdjustOffset je-offset-icon" data-group-key="${escapeHtml(key)}" title="${JE2.t("bookmark_adjust_offset")}">
              <span class="material-icons" aria-hidden="true">schedule</span>
            </button>
          ` : ""}
        </div>
        <div class="je-bookmarks-list"></div>
      `;
        itemCard.innerHTML = headerHtml;
        container.appendChild(itemCard);
        const findBtn = itemCard.querySelector(".btnFindReplacement");
        if (findBtn) {
          findBtn.addEventListener("click", async () => {
            if (!isCurrent()) return;
            await findAndOfferReplacement(group, findBtn);
          });
        }
        const offsetBtn = itemCard.querySelector(".btnAdjustOffset");
        if (offsetBtn) {
          offsetBtn.addEventListener("click", () => {
            if (!isCurrent()) return;
            showOffsetAdjustmentModal(group);
          });
        }
        const poster = itemCard.querySelector(".je-bookmark-item-poster");
        if (poster) {
          poster.addEventListener("click", () => {
            if (!isCurrent()) return;
            const itemId = poster.dataset.itemId;
            if (itemId) {
              host.Emby?.Page?.show(`/details?id=${itemId}`);
            }
          });
        }
        const bookmarksList = itemCard.querySelector(".je-bookmarks-list");
        if (bookmarksList) {
          group.bookmarks.forEach((bm) => {
            const bmEl = document.createElement("div");
            bmEl.className = "je-bookmark-row";
            const row = document.createElement("div");
            row.className = "je-bookmark-main";
            const bar = document.createElement("div");
            bar.className = "je-bookmark-bar";
            const info = document.createElement("div");
            info.className = "je-bookmark-info";
            info.innerHTML = `
            ${bm.label ? `<div class="je-bookmark-label">${escapeHtml(bm.label)}</div>` : ""}
            <div class="je-bm-time" data-item-id="${escapeHtml(bm.itemId)}" data-time="${bm.timestamp}">
              <span>${bm.progress ? `${bm.progress}% • ` : ""}${formatTimestamp(bm.timestamp)}</span>
            </div>
          `;
            const actions = document.createElement("div");
            actions.className = "je-bookmark-actions";
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btnDeleteBookmark je-btn je-btn-delete";
            deleteBtn.innerHTML = '<span class="material-icons" aria-hidden="true">delete</span>';
            deleteBtn.dataset.bookmarkId = bm.id;
            if (!orphaned) {
              const playBtn2 = document.createElement("button");
              playBtn2.className = "btnPlayBookmark je-btn";
              playBtn2.innerHTML = '<span class="material-icons" aria-hidden="true">play_arrow</span>';
              playBtn2.dataset.itemId = bm.itemId;
              playBtn2.dataset.time = String(bm.timestamp);
              const editBtn2 = document.createElement("button");
              editBtn2.className = "btnEditBookmark je-btn";
              editBtn2.innerHTML = '<span class="material-icons" aria-hidden="true">edit</span>';
              actions.appendChild(playBtn2);
              actions.appendChild(editBtn2);
            }
            actions.appendChild(deleteBtn);
            row.appendChild(bar);
            row.appendChild(info);
            row.appendChild(actions);
            const editRow = document.createElement("div");
            editRow.className = "je-btn-edit-row";
            const timeInput = document.createElement("input");
            timeInput.type = "text";
            timeInput.className = "je-input";
            timeInput.value = formatTimestamp(bm.timestamp);
            timeInput.placeholder = JE2.t("bookmark_time_placeholder");
            const labelInput = document.createElement("input");
            labelInput.type = "text";
            labelInput.className = "je-input je-input-label";
            labelInput.value = bm.label || "";
            labelInput.placeholder = JE2.t("bookmark_label_placeholder");
            labelInput.maxLength = 100;
            const saveBtn = document.createElement("button");
            saveBtn.className = "je-btn-action";
            saveBtn.innerHTML = '<span class="material-icons" aria-hidden="true">save</span>';
            const cancelBtn = document.createElement("button");
            cancelBtn.className = "je-btn-action je-btn-cancel";
            cancelBtn.innerHTML = '<span class="material-icons" aria-hidden="true">close</span>';
            editRow.appendChild(timeInput);
            editRow.appendChild(labelInput);
            editRow.appendChild(saveBtn);
            editRow.appendChild(cancelBtn);
            bmEl.appendChild(row);
            bmEl.appendChild(editRow);
            bookmarksList.appendChild(bmEl);
            const playBtn = actions.querySelector(".btnPlayBookmark");
            if (playBtn) {
              playBtn.addEventListener("click", async () => {
                if (!isCurrent()) return;
                const itemId = playBtn.dataset.itemId;
                const time = Number(playBtn.dataset.time);
                await playItemAtTime(itemId, time);
              });
            }
            const editBtn = actions.querySelector(".btnEditBookmark");
            if (editBtn) {
              editBtn.addEventListener("click", () => {
                if (!isCurrent()) return;
                editRow.classList.toggle("show");
                if (editRow.classList.contains("show")) {
                  timeInput.focus();
                }
              });
            }
            cancelBtn.addEventListener("click", () => {
              if (!isCurrent()) return;
              editRow.classList.remove("show");
              timeInput.value = formatTimestamp(bm.timestamp);
              labelInput.value = bm.label || "";
            });
            saveBtn.addEventListener("click", async () => {
              if (!isCurrent()) return;
              const parsedTime = parseTimestampInput(timeInput.value);
              if (parsedTime === null) {
                if (isCurrent()) JE2.toast(JE2.t("bookmark_time_format_hint"), 3e3);
                return;
              }
              saveBtn.disabled = true;
              if (editBtn) editBtn.disabled = true;
              try {
                const ok = await JE2.bookmarks.update(bm.id, {
                  timestamp: parsedTime,
                  label: labelInput.value.trim()
                });
                if (!isCurrent()) return;
                if (ok) {
                  if (isCurrent()) JE2.toast(JE2.t("toast_bookmark_updated"), 2e3);
                  const bookmarksSection = document.querySelector(".sections.bookmarks");
                  if (bookmarksSection) {
                    renderBookmarksLibrary(bookmarksSection);
                  }
                } else {
                  if (isCurrent()) JE2.toast(JE2.t("toast_bookmark_save_failed"), 3e3);
                }
              } catch (err) {
                console.error("Bookmark update failed", err);
                if (isCurrent()) JE2.toast(JE2.t("toast_bookmark_save_failed"), 3e3);
              } finally {
                saveBtn.disabled = false;
                if (editBtn) editBtn.disabled = false;
              }
            });
            deleteBtn.addEventListener("click", async () => {
              if (!isCurrent()) return;
              const bookmarkId = deleteBtn.dataset.bookmarkId;
              if (!bookmarkId) return;
              deleteBtn.disabled = true;
              let deleted;
              try {
                deleted = await JE2.bookmarks.delete(bookmarkId);
              } finally {
                deleteBtn.disabled = false;
              }
              if (!isCurrent() || deleted === null) return;
              if (!deleted) {
                if (isCurrent()) JE2.toast(JE2.t("toast_bookmark_delete_failed"), 3e3);
                return;
              }
              if (isCurrent()) JE2.toast(JE2.t("toast_bookmark_deleted"), 2e3);
              const bookmarksSection = document.querySelector(".sections.bookmarks");
              if (bookmarksSection) {
                renderBookmarksLibrary(bookmarksSection);
              }
            });
            const ts = info.querySelector(".je-bm-time");
            ts?.addEventListener("click", async () => {
              if (!isCurrent()) return;
              const t = Number(ts.dataset.time);
              await playItemAtTime(ts.dataset.itemId, t);
            });
          });
        }
      }
    }
    async function playItemAtTime(itemId, startTime) {
      const isCurrent = lifetime.current();
      if (!itemId || !Number.isFinite(startTime)) return;
      try {
        console.log(`${logPrefix} Attempting playback: itemId=${itemId}, startTime=${startTime}`);
        const apiClient = getApi();
        if (!apiClient) {
          console.warn(`${logPrefix} API client not available`);
          if (isCurrent()) JE2.toast(JE2.t("toast_api_client_unavailable"), 3e3);
          return;
        }
        const deviceId = apiClient._deviceId || apiClient.deviceId();
        console.log(`${logPrefix} Device ID: ${deviceId}`);
        const sessionsUrl = apiClient.getUrl("Sessions");
        const sessions = readSessions(await apiClient.ajax({
          type: "GET",
          url: sessionsUrl,
          dataType: "json"
        }));
        console.log(`${logPrefix} Available sessions:`, sessions);
        if (!isCurrent()) return;
        const currentSession = sessions.find((s) => s.DeviceId === deviceId);
        if (!currentSession) {
          console.warn(`${logPrefix} Could not find current session`);
          if (isCurrent()) JE2.toast(JE2.t("toast_session_not_found"), 3e3);
          return;
        }
        const sessionId = currentSession.Id;
        console.log(`${logPrefix} Found session ID: ${sessionId}`);
        const startTicks = Math.floor(startTime * 1e7);
        const url = `Sessions/${sessionId}/Playing?playCommand=PlayNow&itemIds=${itemId}&startPositionTicks=${startTicks}`;
        console.log(`${logPrefix} Sending playback request:`, url);
        await apiClient.ajax({
          type: "POST",
          url: apiClient.getUrl(url)
        });
        if (!isCurrent()) return;
        console.log(`${logPrefix} Playback started successfully`);
        if (isCurrent()) JE2.toast(JE2.t("toast_playing"), 2e3);
        setTimeout(() => {
          if (host.JE?.isVideoPage?.() && typeof host.JE.bookmarks?.updateMarkers === "function") {
            console.log(`${logPrefix} Triggering bookmark marker update after playback start`);
            host.JE.bookmarks.updateMarkers();
          }
        }, 1500);
      } catch (e) {
        console.error(`${logPrefix} Failed to play item:`, e);
        if (isCurrent()) JE2.toast(JE2.t("toast_playback_failed").replace("{error}", e instanceof Error ? e.message : "Unknown error"), 3e3);
      }
    }
    Object.assign(internal, { renderBookmarkItems });
  }
  install(JE);
})();
})();
//# sourceMappingURL=bookmarks-library-items.js.map
