(() => {
"use strict";
(() => {
  // client/src/features/chrome/host.ts
  function chromeBridge() {
    const host = window;
    if (!host.JellyfinEnhanced) throw new Error("Jellyfin Enhanced must initialize before chrome modules");
    return host.JellyfinEnhanced;
  }
  function hostClient() {
    const host = window;
    return host.ApiClient;
  }
  function idString(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  function readClientIdentity(client) {
    let userId = null;
    let serverId = null;
    try {
      userId = idString(client?.getCurrentUserId?.());
    } catch {
    }
    try {
      const raw = client?.serverId;
      serverId = idString(typeof raw === "function" ? raw.call(client) : raw) || idString(client?._serverInfo?.Id);
    } catch {
    }
    return { userId, serverId };
  }
  function captureIdentity(session, client) {
    const live = readClientIdentity(client);
    let epoch = null;
    try {
      epoch = typeof session?.getEpoch === "function" ? session.getEpoch() : null;
    } catch {
      epoch = null;
    }
    const read = (get) => {
      try {
        return idString(get());
      } catch {
        return null;
      }
    };
    const token = read(() => client?.accessToken?.());
    const root = read(() => client?.getUrl?.("/"));
    return {
      userId: live.userId,
      serverId: live.serverId,
      epoch,
      client,
      credentialsCurrent: () => read(() => client?.accessToken?.()) === token && read(() => client?.getUrl?.("/")) === root
    };
  }
  function isSameIdentity(owner, current) {
    return owner.client === current.client && owner.credentialsCurrent() && current.credentialsCurrent() && owner.userId === current.userId && owner.serverId === current.serverId && owner.epoch === current.epoch;
  }

  // client/src/features/chrome/events.ts
  var MODIFIER_ORDER = ["Meta", "Ctrl", "Alt", "Shift"];
  function canonicalCombo(combo) {
    if (typeof combo !== "string" || !combo) return combo;
    const modifiers = /* @__PURE__ */ new Set();
    let rest = combo;
    let match;
    while (match = /^(Meta|Ctrl|Alt|Shift)\+(?=.)/.exec(rest)) {
      modifiers.add(match[1] ?? "");
      rest = rest.slice(match[0].length);
    }
    const key = /^[a-zA-Z]$/.test(rest) ? rest.toUpperCase() : rest;
    return MODIFIER_ORDER.filter((name) => modifiers.has(name)).map((name) => name + "+").join("") + key;
  }
  function canonicalShortcuts(active) {
    const canonical = {};
    for (const [name, combo] of Object.entries(active || {})) canonical[name] = canonicalCombo(combo);
    return canonical;
  }
  var isTyping = () => ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "");
  var SHEET_SELECTOR = ".actionSheet, .actionSheetScroller, .dialogContainer";
  function createEvents(JE2) {
    let installed = false;
    function panelKeyListener(event) {
      if (document.getElementById("jellyfin-enhanced-panel") || isTyping()) return;
      if (event.key === "?") {
        event.preventDefault();
        event.stopPropagation();
        JE2.showEnhancedPanel?.();
      }
    }
    function playerActions(event) {
      return [
        ["BookmarkCurrentTime", () => {
          if (JE2.bookmarks?.showModal) JE2.bookmarks.showModal("add");
          else console.warn("🪼 Jellyfin Enhanced: New bookmark system not loaded, using fallback");
        }],
        ["CycleAspectRatio", () => JE2.cycleAspect?.()],
        // Toggles the plugin-rendered playback-info overlay; no host settings menu opens.
        ["ShowPlaybackInfo", () => JE2.togglePlaybackInfo?.()],
        ["SubtitleMenu", () => {
          const open = [...document.querySelectorAll(".actionSheetContent .actionSheetTitle")].find((el) => el.textContent === "Subtitles");
          if (open) {
            document.querySelector(".dialogBackdrop.dialogBackdropOpened")?.remove();
            document.querySelector(".dialogContainer")?.remove();
          } else {
            document.querySelector("button.btnSubtitles")?.click();
          }
        }],
        // Never on auto-repeat: each cycle is a real stream switch (transcode restarts).
        ["CycleSubtitleTracks", () => {
          if (!event.repeat) JE2.cycleSubtitleTrack?.();
        }],
        ["CycleAudioTracks", () => {
          if (!event.repeat) JE2.cycleAudioTrack?.();
        }],
        ["ResetPlaybackSpeed", () => JE2.resetPlaybackSpeed?.()],
        ["IncreasePlaybackSpeed", () => JE2.adjustPlaybackSpeed?.("increase")],
        ["DecreasePlaybackSpeed", () => JE2.adjustPlaybackSpeed?.("decrease")],
        ["OpenEpisodePreview", () => {
          const focus = document.getElementById("popupFocusContainer");
          if (focus?.classList.contains("opened")) {
            const popup = document.getElementById("previewPopup");
            if (popup) popup.remove();
            else {
              document.getElementById("dialogBackdropContainer")?.remove();
              document.getElementById("dialogContainer")?.remove();
            }
          } else {
            document.querySelector('button#popupPreviewButton.autoSize.paper-icon-button-light[is="paper-icon-button-light"]')?.click();
          }
        }],
        ["SkipIntroOutro", () => JE2.skipIntroOutro?.()],
        ["FrameStepBack", () => JE2.frameStep?.("back")],
        ["FrameStepForward", () => JE2.frameStep?.("forward")],
        ["JumpToLastPosition", () => JE2.jumpToLastPosition?.()]
      ];
    }
    function keyListener(event) {
      if (isTyping()) return;
      if (document.activeElement?.hasAttribute("data-je-key-recorder")) return;
      const key = event.key;
      const combo = JE2.keyCombo(event);
      const video = document.querySelector("video");
      const shortcuts = canonicalShortcuts(JE2.state.activeShortcuts);
      if (combo === shortcuts.OpenSearch) {
        event.preventDefault();
        document.querySelector("button.headerSearchButton")?.click();
        setTimeout(() => document.querySelector('input[type="search"]')?.focus(), 100);
        JE2.toast(JE2.t("toast_search"));
      } else if (combo === shortcuts.GoToHome) {
        event.preventDefault();
        window.location.hash = "#/home.html";
        JE2.toast(JE2.t("toast_home"));
      } else if (combo === shortcuts.GoToDashboard) {
        event.preventDefault();
        window.location.hash = "#/dashboard";
        JE2.toast(JE2.t("toast_dashboard"));
      } else if (combo === shortcuts.QuickConnect) {
        event.preventDefault();
        window.location.hash = "#/quickconnect";
        JE2.toast(`${JE2.icon?.(JE2.IconName?.LINK) ?? ""} Quick Connect`);
      } else if (combo === shortcuts.PlayRandomItem && !JE2.isVideoPage()) {
        event.preventDefault();
        document.getElementById("randomItemButton")?.click();
      }
      if (!JE2.isVideoPage() || !video) return;
      const action = playerActions(event).find(([name]) => combo === shortcuts[name]);
      if (action) {
        event.preventDefault();
        event.stopImmediatePropagation();
        action[1]();
      }
      if (shortcuts.JumpToPercentage !== "" && !event.altKey && !event.ctrlKey && !event.metaKey && /^[0-9]$/.test(key)) {
        JE2.jumpToPercentage?.(parseInt(key, 10) * 10);
      }
    }
    function setupDOMObserver() {
      const runPageSpecificFunctions = () => {
        if (JE2.isVideoPage()) {
          JE2.addOsdSettingsButton?.();
          JE2.initializeAutoSkipObserver?.();
          JE2.applySavedStylesWhenReady?.();
          const video = document.querySelector("video");
          if (video) JE2.attachSeekTracker?.(video);
        } else {
          JE2.stopAutoSkip?.();
        }
      };
      JE2.helpers.createObserver("dom-observer", JE2.helpers.throttle(() => {
        runPageSpecificFunctions();
        JE2.addRandomButton?.();
        JE2.addUserPreferencesLink?.();
      }, 100), document.body, { childList: true, subtree: true });
    }
    function observeActionSheets() {
      let scheduled = false;
      const runInjection = () => {
        scheduled = false;
        if (!JE2.currentSettings.removeContinueWatchingEnabled) return;
        if (typeof JE2.addRemoveButton === "function") JE2.addRemoveButton();
        else console.warn("🪼 Jellyfin Enhanced: addRemoveButton not available");
        if (typeof JE2.addMultiSelectRemoveButton === "function") JE2.addMultiSelectRemoveButton();
      };
      const touchesActionSheet = (mutations) => {
        for (const mutation of mutations) {
          if (mutation.target instanceof Element && mutation.target.closest(SHEET_SELECTOR)) return true;
          for (const node of mutation.addedNodes) {
            if (node instanceof Element && (node.matches(SHEET_SELECTOR) || node.querySelector(SHEET_SELECTOR))) return true;
          }
        }
        return false;
      };
      JE2.helpers.onBodyMutation("action-sheets", (mutations) => {
        if (scheduled || !touchesActionSheet(mutations)) return;
        scheduled = true;
        requestAnimationFrame(runInjection);
      }, { priority: 1 });
    }
    function addContextMenuListener() {
      const capture = (itemElement) => {
        if (!itemElement) {
          JE2.state.removeContext = null;
          return;
        }
        const card = itemElement.closest(".card") || itemElement;
        const itemId = (card instanceof HTMLElement ? card.dataset.id : void 0) || (itemElement instanceof HTMLElement ? itemElement.dataset.id : void 0) || null;
        if (!itemId) {
          JE2.state.removeContext = null;
          return;
        }
        const surface = typeof JE2.detectCardSurface === "function" ? JE2.detectCardSurface(card) : null;
        JE2.state.removeContext = { itemId, surface, card, ts: Date.now() };
        if (surface) console.log(`🪼 Jellyfin Enhanced: ${String(surface)} item detected for Remove action sheet:`, itemId);
      };
      const insideOpenMenu = (target) => !!target.closest(".actionSheetContent, .actionSheet, .dialogContainer, dialog");
      document.body.addEventListener("mousedown", (event) => {
        if (!JE2.currentSettings.removeContinueWatchingEnabled || !(event.target instanceof Element)) return;
        const menuButton = event.target.closest('button[data-action="menu"]');
        if (!menuButton) return;
        capture(menuButton.closest(".card[data-id]") || menuButton.closest("[data-id]"));
      }, true);
      document.body.addEventListener("contextmenu", (event) => {
        if (!JE2.currentSettings.removeContinueWatchingEnabled || !(event.target instanceof Element)) return;
        if (insideOpenMenu(event.target)) return;
        capture(event.target.closest(".card[data-id]"));
      }, true);
    }
    function clearLocalStorageIfRequested() {
      try {
        const serverClear = Number(JE2.pluginConfig.ClearLocalStorageTimestamp) || 0;
        const localCleared = parseInt(localStorage.getItem("jellyfinEnhancedLastCleared") || "0", 10);
        if (serverClear > localCleared) {
          localStorage.removeItem("jellyfinEnhancedSettings");
          localStorage.setItem("jellyfinEnhancedLastCleared", serverClear.toString());
        }
      } catch (error) {
        console.warn("🪼 Jellyfin Enhanced: Could not apply the local-storage reset request:", error);
      }
    }
    function installLongPress() {
      const onVideoPage = (name) => (event) => {
        if (!JE2.isVideoPage()) return;
        if (event.isTrusted === false) return;
        if (event.target instanceof Element && event.target.closest(".osdControls, .pause-screen-active, .jellyfin-enhanced-panel")) return;
        JE2[name]?.(event);
      };
      document.addEventListener("mousedown", onVideoPage("handleLongPressDown"), true);
      document.addEventListener("mouseup", onVideoPage("handleLongPressUp"), true);
      document.addEventListener("mousemove", onVideoPage("handleLongPressMove"), true);
      document.addEventListener("click", onVideoPage("handleLongPressClick"), true);
      document.addEventListener("mouseleave", onVideoPage("handleLongPressCancel"), true);
      document.addEventListener("touchstart", onVideoPage("handleLongPressDown"), { capture: true, passive: true });
      document.addEventListener("touchmove", onVideoPage("handleLongPressMove"), { capture: true, passive: true });
      document.addEventListener("touchend", onVideoPage("handleLongPressUp"), { capture: true, passive: false });
      document.addEventListener("touchcancel", onVideoPage("handleLongPressCancel"), { capture: true, passive: false });
    }
    function installVisibility() {
      const pausedOwners = /* @__PURE__ */ new Map();
      const mediaSource = (video) => video.currentSrc || video.getAttribute("src") || video.src;
      const clearPaused = (video) => {
        pausedOwners.delete(video);
        delete video.dataset.wasPlayingBeforeHidden;
      };
      for (const name of ["emptied", "loadstart"]) document.addEventListener(name, (event) => {
        if (event.target instanceof HTMLVideoElement) clearPaused(event.target);
      }, true);
      JE2.session?.onUserChange("chrome-auto-resume", () => {
        for (const video of pausedOwners.keys()) delete video.dataset.wasPlayingBeforeHidden;
        pausedOwners.clear();
      });
      let autoPipVideo = null;
      const canAutoPip = (video) => document.pictureInPictureEnabled && !video.disablePictureInPicture && video.readyState >= HTMLMediaElement.HAVE_METADATA;
      const exitAutoPip = () => {
        const pipVideo = autoPipVideo;
        autoPipVideo = null;
        if (pipVideo && document.pictureInPictureElement === pipVideo) {
          document.exitPictureInPicture().catch((error) => console.error("🪼 Jellyfin Enhanced: Auto PiP Error:", error));
        }
      };
      document.addEventListener("leavepictureinpicture", (event) => {
        if (event.target === autoPipVideo) autoPipVideo = null;
      }, true);
      document.addEventListener("visibilitychange", () => {
        const video = document.querySelector("video");
        if (!video) return;
        JE2.attachSeekTracker?.(video);
        if (document.hidden) {
          if (!video.paused && JE2.currentSettings.autoPauseEnabled) {
            pausedOwners.set(video, { identity: captureIdentity(JE2.session, hostClient()), source: mediaSource(video) });
            video.pause();
            video.dataset.wasPlayingBeforeHidden = "true";
          }
          if (JE2.currentSettings.autoPipEnabled && !document.pictureInPictureElement && canAutoPip(video)) {
            video.requestPictureInPicture().then(() => {
              autoPipVideo = video;
              if (!document.hidden) exitAutoPip();
            }).catch((error) => {
              if (error instanceof Error && error.name === "NotAllowedError") {
                console.debug("🪼 Jellyfin Enhanced: Auto PiP not allowed by the browser:", error.message);
              } else {
                console.error("🪼 Jellyfin Enhanced: Auto PiP Error:", error);
              }
            });
          }
        } else {
          const owner = pausedOwners.get(video);
          if (video.paused && video.dataset.wasPlayingBeforeHidden === "true" && JE2.currentSettings.autoResumeEnabled && owner && owner.source === mediaSource(video) && isSameIdentity(owner.identity, captureIdentity(JE2.session, hostClient()))) {
            Promise.resolve(video.play()).catch((error) => console.debug("🪼 Jellyfin Enhanced: Auto resume refused:", error));
          }
          clearPaused(video);
          exitAutoPip();
        }
      });
    }
    function initializeEnhancedScript() {
      clearLocalStorageIfRequested();
      JE2.injectGlobalStyles?.();
      JE2.addPluginMenuButton?.();
      JE2.addUserMenuLink?.();
      JE2.addRandomButton?.();
      JE2.applySavedStylesWhenReady?.();
      setupDOMObserver();
      observeActionSheets();
      if (installed) return;
      installed = true;
      addContextMenuListener();
      document.addEventListener("keydown", panelKeyListener);
      if (!JE2.pluginConfig.DisableAllShortcuts) document.addEventListener("keydown", keyListener, true);
      installLongPress();
      installVisibility();
    }
    return { keyListener, initializeEnhancedScript };
  }

  // client/src/features/chrome/events-entry.ts
  var JE = chromeBridge();
  JE.internals = JE.internals || {};
  JE.internals.canonicalCombo = canonicalCombo;
  var events = createEvents(JE);
  JE.keyListener = events.keyListener;
  JE.initializeEnhancedScript = events.initializeEnhancedScript;
})();
})();
//# sourceMappingURL=events.js.map
