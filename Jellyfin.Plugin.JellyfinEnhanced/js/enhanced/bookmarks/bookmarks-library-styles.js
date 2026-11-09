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

  // client/src/features/bookmarks/library.css
  var library_default = "\n    .je-bookmark-item[hidden] { display: none !important; }\n    .je-bookmarks-wrapper {\n      display: flex;\n      flex-direction: column;\n      gap: 0;\n      width: 100%;\n    }\n\n    .je-bookmark-tabs {\n      display: flex;\n      justify-content: center;\n      gap: 2px;\n      padding: 12px 3vw 8px 3vw;\n      border-bottom: 1px solid rgba(255, 255, 255, 0.08);\n    }\n\n    .je-tab {\n      padding: 12px 16px;\n      background: transparent;\n      color: rgba(200, 200, 200, .7);\n      border: none;\n      border-bottom: 2px solid transparent;\n      cursor: pointer;\n      font-size: 14px;\n      font-weight: 500;\n      transition: all 0.2s;\n      border-radius: 10px 10px 0 0;\n    }\n\n    .je-tab:hover {\n      background: rgba(255, 255, 255, 0.08);\n    }\n\n    .je-tab.active {\n      color: rgba(200, 200, 200, 1);\n      background: rgba(200, 200, 200, 0.1);\n      border-bottom-color: #fff;\n    }\n\n    .bookmarks-container {\n      padding: 12px 3vw;\n    }\n\n    .je-bookmarks-empty {\n      grid-column: 1 / -1;\n      width: 100%;\n      display: flex;\n      flex-direction: column;\n      align-items: center;\n      text-align: center;\n      padding: 60px 20px;\n      color: #888;\n    }\n\n    .je-bookmarks-empty-icon {\n      font-size: 32px;\n      margin-bottom: 12px;\n      opacity: 0.6;\n    }\n\n    .je-bookmarks-empty-title {\n      font-size: 18px;\n      font-weight: 600;\n      margin-bottom: 8px;\n    }\n\n    .je-bookmarks-empty-hint {\n      font-size: 14px;\n    }\n\n    .je-bookmarks-grid {\n      display: grid;\n      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));\n      gap: 16px;\n      width: 100%;\n    }\n\n    .je-bookmark-item {\n      background: rgba(0, 0, 0, 0.32);\n      border-radius: 10px;\n      border: 1px solid rgba(255, 255, 255, 0.06);\n      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.35);\n      display: flex;\n      flex-direction: column;\n      overflow: hidden;\n    }\n\n    .je-bookmark-item-orphaned {\n      border: 2px solid rgba(255, 193, 7, 0.5);\n      background: rgba(255, 193, 7, 0.03);\n    }\n\n    .je-bookmark-item-header {\n      display: flex;\n      gap: 14px;\n      padding: 12px 14px;\n      align-items: flex-start;\n      position: relative;\n    }\n\n    .je-offset-icon {\n      position: absolute;\n      top: 12px;\n      right: 14px;\n      background: rgba(33, 150, 243, 0.15);\n      border: 1px solid rgba(33, 150, 243, 0.3);\n      color: #2196f3;\n      border-radius: 50%;\n      width: 32px;\n      height: 32px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      cursor: pointer;\n      transition: all 0.2s;\n      font-size: 18px;\n    }\n\n    .je-offset-icon:hover {\n      background: rgba(33, 150, 243, 0.25);\n      border-color: rgba(33, 150, 243, 0.5);\n      transform: scale(1.1);\n    }\n\n    /* Modal styles */\n    .je-bm-library-modal-overlay {\n      position: fixed;\n      top: 0;\n      left: 0;\n      right: 0;\n      bottom: 0;\n      background: rgba(0,0,0,0.85);\n      z-index: 10000;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      opacity: 0;\n      transition: opacity 0.2s;\n    }\n\n    .je-bm-library-modal-container {\n      background: #181818;\n      border-radius: 12px;\n      padding: 24px;\n      position: relative;\n      box-shadow: 0 8px 32px rgba(0,0,0,0.8);\n    }\n\n    .je-bm-library-modal-close {\n      position: absolute;\n      top: 16px;\n      right: 16px;\n      background: transparent;\n      border: none;\n      color: #fff;\n      font-size: 32px;\n      cursor: pointer;\n      width: 40px;\n      height: 40px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      border-radius: 50%;\n      transition: background 0.2s;\n    }\n\n    .je-bm-library-modal-close:hover {\n      background: rgba(255,255,255,0.1);\n    }\n\n    .je-bookmarks-modal-header {\n      display: flex;\n      gap: 16px;\n      align-items: flex-start;\n      margin-bottom: 24px;\n    }\n\n    .je-modal-title {\n      margin: 0 0 8px 0;\n      font-size: 24px;\n      font-weight: 700;\n      color: #fff;\n    }\n\n    .je-modal-subtitle {\n      margin: 0;\n      font-size: 13px;\n      color: #aaa;\n    }\n\n    .je-modal-info-box {\n      background: rgba(33, 150, 243, 0.08);\n      border: 2px solid rgba(33, 150, 243, 0.3);\n      border-radius: 8px;\n      padding: 16px;\n      margin-bottom: 20px;\n    }\n\n    .je-modal-info-title {\n      font-size: 12px;\n      color: #64b5f6;\n      margin-bottom: 8px;\n    }\n\n    .je-modal-info-text {\n      font-size: 12px;\n      color: #ccc;\n      line-height: 1.4;\n    }\n\n    .je-modal-warning-box {\n      background: rgba(255,152,0,0.08);\n      border: 2px solid rgba(255,152,0,0.3);\n      border-radius: 8px;\n      padding: 16px;\n      margin-bottom: 24px;\n    }\n\n    .je-modal-warning-label {\n      font-size: 12px;\n      font-weight: 700;\n      color: #ff9800;\n      text-transform: uppercase;\n      letter-spacing: 0.5px;\n      margin-bottom: 8px;\n    }\n\n    .je-modal-item-name {\n      font-size: 16px;\n      font-weight: 600;\n      color: #fff;\n      margin-bottom: 6px;\n    }\n\n    .je-modal-item-meta {\n      font-size: 12px;\n      color: #ccc;\n    }\n\n    .je-modal-label {\n      display: block;\n      margin-bottom: 8px;\n      font-weight: 600;\n      color: #e0e0e0;\n      font-size: 13px;\n      text-transform: uppercase;\n      letter-spacing: 0.5px;\n    }\n\n    .je-modal-input {\n      width: 100%;\n      padding: 12px 16px;\n      border: 2px solid rgba(33, 150, 243, 0.3);\n      border-radius: 8px;\n      background: rgba(255,255,255,0.05);\n      color: #fff;\n      font-family: inherit;\n      font-size: 15px;\n      transition: all 0.2s;\n      box-sizing: border-box;\n    }\n\n    .je-modal-input:focus {\n      outline: none;\n      border-color: rgba(33, 150, 243, 0.5);\n    }\n\n    .je-modal-help-text {\n      font-size: 12px;\n      color: #999;\n      margin-top: 6px;\n      line-height: 1.4;\n    }\n\n    .je-modal-list-container {\n      background: rgba(255,255,255,0.03);\n      border-radius: 8px;\n      padding: 12px;\n      max-height: 200px;\n      overflow-y: auto;\n    }\n\n    .je-modal-list-title {\n      font-size: 12px;\n      font-weight: 600;\n      color: #aaa;\n      margin-bottom: 8px;\n      text-transform: uppercase;\n    }\n\n    .je-modal-list-item {\n      font-size: 13px;\n      color: #e0e0e0;\n      padding: 6px 0;\n      border-bottom: 1px solid rgba(255,255,255,0.05);\n    }\n\n    .je-modal-list-item-title {\n      font-weight: 600;\n    }\n\n    .je-modal-list-item-meta {\n      font-size: 11px;\n      color: #999;\n    }\n\n    .je-bookmark-modal-actions {\n      display: flex;\n      gap: 12px;\n      justify-content: flex-end;\n      margin-top: 24px;\n      padding-top: 16px;\n      border-top: 1px solid rgba(255,255,255,0.08);\n    }\n\n    .je-bookmark-btn-cancel {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      padding: 10px 20px;\n      background: rgba(255, 255, 255, 0.05);\n      color: #aaa;\n      border: 1px solid rgba(255, 255, 255, 0.1);\n      border-radius: 6px;\n      cursor: pointer;\n      font-size: 14px;\n      transition: all 0.2s;\n    }\n\n    .je-bookmark-btn-cancel:hover {\n      background: rgba(255, 255, 255, 0.08);\n    }\n\n    .je-modal-btn-primary {\n      padding: 10px 20px;\n      background: rgba(33, 150, 243, 0.2);\n      color: #2196f3;\n      border: 1px solid rgba(33, 150, 243, 0.3);\n      border-radius: 6px;\n      cursor: pointer;\n      font-size: 14px;\n      transition: all 0.2s;\n      display: flex;\n      align-items: center;\n      gap: 6px;\n    }\n\n    .je-modal-btn-primary:hover {\n      background: rgba(33, 150, 243, 0.3);\n    }\n\n    .je-modal-btn-primary:disabled {\n      opacity: 0.5;\n      cursor: not-allowed;\n    }\n\n    .je-btn-find-replacement {\n      position: absolute;\n      top: 12px;\n      right: 14px;\n      background: rgba(255, 152, 0, 0.15);\n      border: 1px solid rgba(255, 152, 0, 0.3);\n      color: #ff9800;\n      border-radius: 50%;\n      width: 32px;\n      height: 32px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      cursor: pointer;\n      transition: all 0.2s;\n      font-size: 18px;\n    }\n\n    .je-btn-find-replacement:hover {\n      background: rgba(255, 152, 0, 0.25);\n      border-color: rgba(255, 152, 0, 0.5);\n      transform: scale(1.1);\n    }\n\n    .je-bookmark-item-poster {\n      width: 86px;\n      height: 129px;\n      object-fit: cover;\n      border-radius: 6px;\n      cursor: pointer;\n      flex-shrink: 0;\n    }\n\n    .je-bookmark-item-placeholder {\n      width: 86px;\n      height: 129px;\n      background: rgba(255, 255, 255, 0.08);\n      border-radius: 6px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      color: #b0bec5;\n      font-size: 13px;\n      flex-shrink: 0;\n    }\n\n    .je-bookmark-item-info {\n      flex: 1;\n      display: flex;\n      flex-direction: column;\n      gap: 6px;\n    }\n\n    .je-bookmark-item-title {\n      color: #e3f2fd;\n      font-size: 18px;\n      font-weight: 700;\n      text-decoration: none;\n      display: block;\n    }\n\n    .je-bookmark-item-title:hover {\n      color: #fff;\n    }\n\n    .je-bookmark-item-meta {\n      color: #90a4ae;\n      font-size: 13px;\n    }\n\n    .je-bookmarks-list {\n      display: grid;\n      gap: 8px;\n      padding: 0 14px 12px 14px;\n    }\n\n    .je-bookmark-row {\n      display: flex;\n      flex-direction: column;\n      gap: 8px;\n      padding: 10px 12px;\n      background: rgba(255, 255, 255, 0.03);\n      border-radius: 8px;\n      border: 1px solid rgba(255, 255, 255, 0.06);\n    }\n\n    .je-bookmark-main {\n      display: flex;\n      align-items: center;\n      gap: 16px;\n    }\n\n    .je-bookmark-bar {\n      width: 2px;\n      height: 32px;\n      background: rgb(30, 144, 255);\n      border-radius: 2px;\n    }\n\n    .je-bookmark-info {\n      flex: 1;\n    }\n\n    .je-bookmark-label {\n      font-size: 15px;\n      color: #eceff1;\n      font-weight: 600;\n    }\n\n    .je-bookmark-time {\n      font-size: 13px;\n      color: #b0bec5;\n      cursor: pointer;\n      display: inline-flex;\n      align-items: center;\n      gap: 6px;\n    }\n\n    .je-bookmark-time:hover {\n      color: #ccc;\n    }\n\n    .je-bookmark-actions {\n      display: flex;\n      gap: 6px;\n      flex-wrap: wrap;\n    }\n\n    .je-btn {\n      padding: 6px 10px;\n      background: rgba(255, 255, 255, 0.08);\n      color: #fff;\n      border: 1px solid rgba(255, 255, 255, 0.12);\n      border-radius: 5px;\n      cursor: pointer;\n      display: inline-flex;\n      align-items: center;\n      gap: 4px;\n      transition: all 0.2s;\n      font-size: 12px;\n    }\n\n    .je-btn:hover {\n      background: rgba(255, 255, 255, 0.12);\n      border-color: rgba(255, 255, 255, 0.2);\n    }\n\n    .je-btn-delete {\n      background: rgba(200, 40, 40, 0.12);\n      color: #ff6b6b;\n      border-color: rgba(200, 40, 40, 0.25);\n    }\n\n    .je-btn-delete:hover {\n      background: rgba(200, 40, 40, 0.18);\n      border-color: rgba(200, 40, 40, 0.35);\n    }\n\n    .je-btn-edit-row {\n      display: none;\n      gap: 10px;\n      align-items: center;\n      flex-wrap: wrap;\n      padding-left: 20px;\n    }\n\n    .je-btn-edit-row.show {\n      display: flex;\n    }\n\n    .je-input {\n      padding: 8px 10px;\n      border-radius: 6px;\n      border: 1px solid rgba(255, 255, 255, 0.14);\n      background: rgba(255, 255, 255, 0.04);\n      color: #fff;\n      font-size: 13px;\n    }\n\n    .je-input::placeholder {\n      color: #777;\n    }\n\n    .je-input-label {\n      min-width: 200px;\n      flex: 1;\n    }\n\n    .je-btn-action {\n      padding: 8px 14px;\n      background: rgba(255, 255, 255, 0.1);\n      color: #fff;\n      border: 1px solid rgba(255, 255, 255, 0.2);\n      border-radius: 5px;\n      cursor: pointer;\n      display: inline-flex;\n      align-items: center;\n      gap: 6px;\n      transition: all 0.2s;\n      font-size: 13px;\n    }\n\n    .je-btn-action:hover {\n      background: rgba(255, 255, 255, 0.15);\n      border-color: rgba(255, 255, 255, 0.3);\n    }\n\n    .je-btn-cancel {\n      background: rgba(255, 255, 255, 0.05);\n      color: #aaa;\n      border-color: rgba(255, 255, 255, 0.1);\n    }\n\n    .je-btn-cancel:hover {\n      background: rgba(255, 255, 255, 0.08);\n    }\n\n    .je-bookmark-actions-footer {\n      display: flex;\n      gap: 12px;\n      justify-content: center;\n      padding: 24px 0 12px 0;\n      border-top: 1px solid rgba(255, 255, 255, 0.08);\n      margin-top: 24px;\n    }\n\n    .je-btn-footer {\n      padding: 10px 18px;\n      background: rgba(255, 255, 255, 0.08);\n      color: #fff;\n      border: 1px solid rgba(255, 255, 255, 0.14);\n      border-radius: 6px;\n      cursor: pointer;\n      display: inline-flex;\n      align-items: center;\n      gap: 8px;\n      font-size: 14px;\n      transition: all 0.2s;\n    }\n\n    .je-btn-footer:hover {\n      background: rgba(255, 255, 255, 0.12);\n    }\n\n    .je-btn-footer-delete {\n      background: rgba(200, 40, 40, 0.15);\n      color: #ff6b6b;\n      border-color: rgba(200, 40, 40, 0.3);\n    }\n\n    .je-btn-footer-delete:hover {\n      background: rgba(200, 40, 40, 0.22);\n    }\n\n    /* Replacement modal specific */\n    .je-replacement-modal-container {\n      max-width: 650px;\n      background: linear-gradient(135deg, rgba(20,20,30,0.95) 0%, rgba(25,25,35,0.95) 100%);\n      border: 1px solid rgba(76,175,80,0.3);\n    }\n\n    .je-replacement-section-title {\n      font-size: 13px;\n      font-weight: 700;\n      color: #4caf50;\n      text-transform: uppercase;\n      letter-spacing: 0.5px;\n      margin-bottom: 12px;\n    }\n\n    .je-replacement-options {\n      display: flex;\n      flex-direction: column;\n      gap: 12px;\n      margin-bottom: 24px;\n    }\n\n    .replacement-option {\n      display: flex;\n      gap: 12px;\n      background: rgba(76,175,80,0.05);\n      border: 2px solid rgba(76,175,80,0.2);\n      border-radius: 8px;\n      padding: 12px;\n      cursor: pointer;\n      transition: all 0.2s;\n      align-items: center;\n    }\n\n    .replacement-option:hover {\n      background: rgba(76,175,80,0.1);\n      border-color: rgba(76,175,80,0.4);\n    }\n\n    .replacement-option.selected {\n      background: rgba(76,175,80,0.15);\n      border-color: #4caf50;\n    }\n\n    .replacement-option img {\n      width: 60px;\n      height: 90px;\n      object-fit: cover;\n      border-radius: 6px;\n      flex-shrink: 0;\n    }\n\n    .replacement-option-placeholder {\n      width: 60px;\n      height: 90px;\n      background: rgba(255,255,255,0.05);\n      border-radius: 6px;\n      flex-shrink: 0;\n    }\n\n    .replacement-option-info {\n      flex: 1;\n    }\n\n    .replacement-option-name {\n      font-weight: 600;\n      margin-bottom: 4px;\n      color: #fff;\n      font-size: 15px;\n    }\n\n    .replacement-option-meta {\n      font-size: 12px;\n      color: #aaa;\n    }\n\n    .replacement-option-check {\n      color: #4caf50;\n      font-size: 28px;\n      display: none;\n      flex-shrink: 0;\n    }\n\n    .replacement-option.selected .replacement-option-check {\n      display: block;\n    }\n\n    .je-modal-actions-padded {\n      padding: 0 28px 28px 28px;\n      display: flex;\n      gap: 12px;\n      justify-content: flex-end;\n    }\n\n    .je-modal-btn-submit {\n      padding: 10px 24px;\n      background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);\n      color: #fff;\n      border: none;\n      border-radius: 6px;\n      cursor: pointer;\n      font-weight: 700;\n      transition: all 0.2s;\n      display: flex;\n      align-items: center;\n      gap: 8px;\n    }\n\n    .je-modal-btn-submit:disabled {\n      opacity: 0.6;\n      cursor: not-allowed;\n    }\n\n    .je-modal-btn-submit:not(:disabled):hover {\n      transform: translateY(-1px);\n      box-shadow: 0 4px 12px rgba(76,175,80,0.3);\n    }\n\n    .je-modal-btn-cancel-alt {\n      padding: 10px 20px;\n      background: rgba(255,255,255,0.08);\n      color: #fff;\n      border: 1px solid rgba(255,255,255,0.15);\n      border-radius: 6px;\n      cursor: pointer;\n      font-weight: 600;\n      transition: all 0.2s;\n    }\n\n    /* Episode title formatting */\n    .je-episode-title {\n      font-size: 0.85em;\n      font-weight: normal;\n      color: #b0bec5;\n    }\n\n    /* Duplicates modal */\n    .je-duplicates-modal-container {\n      max-width: 700px;\n      max-height: 85vh;\n      overflow-y: auto;\n    }\n\n    .je-duplicate-item {\n      background: rgba(255,255,255,0.03);\n      border: 1px solid rgba(255,255,255,0.08);\n      border-radius: 8px;\n      padding: 16px;\n      margin-bottom: 16px;\n    }\n\n    .je-duplicate-name {\n      font-weight: 600;\n      margin-bottom: 12px;\n      color: #ff9800;\n    }\n\n    .je-duplicate-meta {\n      font-size: 12px;\n      color: #888;\n      margin-bottom: 12px;\n    }\n\n    .je-duplicate-version {\n      background: rgba(255,255,255,0.02);\n      padding: 8px 12px;\n      margin-bottom: 8px;\n      border-radius: 4px;\n    }\n\n    .je-duplicate-version-primary {\n      border-left: 3px solid #4caf50;\n    }\n\n    .je-duplicate-version-secondary {\n      border-left: 3px solid #ff9800;\n    }\n\n    .je-duplicate-version-label {\n      font-size: 11px;\n      font-weight: 600;\n      margin-bottom: 4px;\n    }\n\n    .je-duplicate-version-primary .je-duplicate-version-label {\n      color: #4caf50;\n    }\n\n    .je-duplicate-version-secondary .je-duplicate-version-label {\n      color: #ff9800;\n    }\n\n    .je-duplicate-version-id {\n      font-size: 11px;\n      color: #999;\n    }\n\n    .je-duplicate-version-id code {\n      background: rgba(0,0,0,0.3);\n      padding: 2px 6px;\n      border-radius: 3px;\n      font-size: 11px;\n    }\n\n    .btnMergeDuplicates {\n      margin-top: 8px;\n      background: rgba(255, 152, 0, 0.15);\n      border-color: #ff9800;\n      color: #ff9800;\n    }\n\n    .je-bookmarks-wrapper .material-icons {\n      font-size: 18px;\n    }\n  ";

  // client/src/features/bookmarks/library-styles.ts
  var { ctx, host, getApi } = bookmarksHost();
  function install(JE) {
    const lifetime = createLifetime(ctx, "library-styles");
    ctx.own.bookmarksLibrary = ctx.own.bookmarksLibrary || {};
    if (!JE?.pluginConfig?.BookmarksEnabled) {
      console.log("🪼 Jellyfin Enhanced: Bookmarks library feature is disabled");
      return;
    }
    const style = document.createElement("style");
    style.textContent = library_default;
    document.head.appendChild(style);
    lifetime.keep(() => style.remove());
    const backdropStyle = document.createElement("style");
    backdropStyle.textContent = [
      ".backgroundContainer.withBackdrop:has(~ * #indexPage .tabContent.is-active .sections.bookmarks) {",
      "  background: rgba(0, 0, 0, 0.7) !important;",
      "  opacity: 1 !important;",
      "}"
    ].join("\n");
    document.head.appendChild(backdropStyle);
    lifetime.keep(() => backdropStyle.remove());
  }
  install(ctx.core);
})();
})();
//# sourceMappingURL=bookmarks-library-styles.js.map
