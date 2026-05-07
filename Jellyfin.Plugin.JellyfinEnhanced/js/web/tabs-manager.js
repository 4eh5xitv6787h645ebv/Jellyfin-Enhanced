/**
 * JE.TabsManager — adds custom tabs to the Jellyfin home page tab strip.
 * Replaces the customTabs.js shipped by the Custom Tabs plugin.
 *
 * Strategy:
 *  - MutationObserver waits for the home tab strip to appear
 *    (.headerTabs or fallback .emby-tabs-slider).
 *  - Fetches the tab list from /JellyfinEnhanced/web/tabs.
 *  - Injects custom tab buttons after Jellyfin's native tabs and a matching
 *    pane in the home page's tab content area.
 *  - Hooks the existing emby-tabs change event so toggling between native
 *    and custom tabs works without any client-side router gymnastics.
 *  - Hot-reloads on the "tabs" topic.
 *
 * The actual page rendering is delegated to JE.WebHost — same renderer that
 * the route hijacker uses for full pages, so adding a new feature is a one
 * line WebHost.register() call regardless of how it's surfaced.
 */
(function (JE) {
  'use strict';

  if (JE.TabsManager) return;

  var TAB_BUTTON_ATTR = 'data-je-tab';
  var TAB_PANE_ATTR = 'data-je-tab-pane';
  var TAB_BUTTON_CLASS = 'emby-tab-button je-custom-tab-button';
  var STRIP_SELECTOR = '#indexPage .headerTabs, .headerTabs, .emby-tabs-slider';

  var entries = [];
  var observer = null;
  var stylesInjected = false;

  function basePath() { return window.__JE_BASE_PATH__ || ''; }

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var style = document.createElement('style');
    style.id = 'je-tabs-manager-styles';
    // !important on .tabContent.je-muted is needed because Jellyfin sets
    // display:block inline on the active native pane — without !important
    // the inline style wins and the native pane bleeds through under our
    // custom tab content.
    style.textContent = [
      '.je-custom-tab-button.is-active { color: var(--mdc-theme-primary, #00a4dc); }',
      '.je-custom-tab-pane { display: none; padding: 12px 3vw; }',
      '.je-custom-tab-pane.is-active { display: block; }',
      '.je-custom-tab-pane > .je-custom-tab-mount { width: 100%; }',
      '#indexPage .tabContent.je-muted { display: none !important; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function getStrip() { return document.querySelector(STRIP_SELECTOR); }
  function getPaneHost() {
    return document.querySelector('#indexPage .pageTabContent, #indexPage');
  }

  function makeButton(item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = TAB_BUTTON_CLASS;
    btn.setAttribute(TAB_BUTTON_ATTR, item.id);
    btn.setAttribute('is', 'emby-button');

    var label = document.createElement('span');
    label.className = 'emby-button-foreground';
    label.textContent = item.title || item.id;
    btn.appendChild(label);

    btn.addEventListener('click', function () { activate(item.id); });
    return btn;
  }

  function makePane(item) {
    var pane = document.createElement('div');
    pane.className = 'je-custom-tab-pane';
    pane.setAttribute(TAB_PANE_ATTR, item.id);

    var mount = document.createElement('div');
    mount.className = 'je-custom-tab-mount';
    pane.appendChild(mount);
    return pane;
  }

  function activate(id) {
    // Deactivate native tabs the same way Jellyfin does — let it run, then
    // raise our own button to active.
    var buttons = document.querySelectorAll('[' + TAB_BUTTON_ATTR + ']');
    var panes = document.querySelectorAll('[' + TAB_PANE_ATTR + ']');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var match = b.getAttribute(TAB_BUTTON_ATTR) === id;
      b.classList.toggle('is-active', match);
    }
    var renderedAny = false;
    for (var j = 0; j < panes.length; j++) {
      var p = panes[j];
      var matchP = p.getAttribute(TAB_PANE_ATTR) === id;
      p.classList.toggle('is-active', matchP);
      if (matchP) {
        var mount = p.querySelector('.je-custom-tab-mount');
        clear(mount);
        // Use the render() return value, not has(): a registered renderer
        // that throws would otherwise leave us with the native panes muted
        // and the custom pane empty.
        if (JE.WebHost && JE.WebHost.render(id, mount)) {
          renderedAny = true;
        } else {
          console.warn('[JE TabsManager] no render output for tab "' + id + '" — leaving native tab visible');
          p.classList.remove('is-active');
        }
      }
    }

    // Mute native panes while a custom tab is active — restore on next render.
    var indexPage = document.getElementById('indexPage');
    if (indexPage) {
      var nativePanes = indexPage.querySelectorAll('.tabContent');
      for (var k = 0; k < nativePanes.length; k++) {
        nativePanes[k].classList.toggle('je-muted', renderedAny);
      }
    }
  }

  function unhideNative() {
    var indexPage = document.getElementById('indexPage');
    if (!indexPage) return;
    var nativePanes = indexPage.querySelectorAll('.tabContent.je-muted');
    for (var i = 0; i < nativePanes.length; i++) nativePanes[i].classList.remove('je-muted');
  }

  function injectButtonsAndPanes() {
    var strip = getStrip();
    if (!strip) return false;

    // If the user is currently viewing a custom tab whose id is no longer
    // in the entries list (admin disabled it), surface the native panes
    // again before we tear down the dead button. Without this the user
    // sees a blank area until they manually click a native tab.
    var activeId = null;
    var activeBtn = strip.querySelector('[' + TAB_BUTTON_ATTR + '].is-active');
    if (activeBtn) activeId = activeBtn.getAttribute(TAB_BUTTON_ATTR);
    if (activeId && !entries.some(function (e) { return e.id === activeId; })) {
      unhideNative();
    }

    var existing = strip.querySelectorAll('[' + TAB_BUTTON_ATTR + ']');
    for (var x = 0; x < existing.length; x++) existing[x].parentNode.removeChild(existing[x]);

    for (var i = 0; i < entries.length; i++) {
      strip.appendChild(makeButton(entries[i]));
    }

    var paneHost = getPaneHost();
    if (paneHost) {
      var existingPanes = paneHost.querySelectorAll('[' + TAB_PANE_ATTR + ']');
      for (var y = 0; y < existingPanes.length; y++) existingPanes[y].parentNode.removeChild(existingPanes[y]);
      for (var k = 0; k < entries.length; k++) {
        paneHost.appendChild(makePane(entries[k]));
      }
    }

    // Wire native tab clicks so they revert to the normal home view.
    strip.querySelectorAll('button.emby-tab-button:not(.je-custom-tab-button)').forEach(function (b) {
      if (b._jeBound) return;
      b._jeBound = true;
      b.addEventListener('click', function () {
        var customs = document.querySelectorAll('[' + TAB_BUTTON_ATTR + ']');
        for (var i = 0; i < customs.length; i++) customs[i].classList.remove('is-active');
        var panes = document.querySelectorAll('[' + TAB_PANE_ATTR + ']');
        for (var j = 0; j < panes.length; j++) panes[j].classList.remove('is-active');
        unhideNative();
      });
    });

    return true;
  }

  function fetchEntries() {
    var ApiClient = window.ApiClient;
    if (!ApiClient || typeof ApiClient.ajax !== 'function') {
      return Promise.resolve();
    }
    return ApiClient.ajax({
      type: 'GET',
      url: ApiClient.getUrl('JellyfinEnhanced/web/tabs'),
      dataType: 'json'
    })
      .then(function (body) {
        // Only replace on success — preserve last-good entries on a
        // transient 5xx / auth blip.
        if (body && Array.isArray(body.entries)) entries = body.entries;
      })
      .catch(function (err) {
        console.warn('[JE TabsManager] tabs fetch failed', err);
      });
  }

  // The home page tab strip is replaced when the user navigates between
  // libraries, so we watch the SPA's mainAnimatedPages container — far
  // narrower than document.body and only fires on real navigation.
  function startObserver() {
    if (observer) return;

    var tries = 0;
    function tryBootstrap() {
      var spaContainer = document.querySelector('.mainAnimatedPages, .skinBody');
      if (spaContainer) {
        observer = new MutationObserver(function () {
          var strip = getStrip();
          if (!strip) return;
          if (!strip.querySelector('[' + TAB_BUTTON_ATTR + ']')) injectButtonsAndPanes();
        });
        observer.observe(spaContainer, { childList: true, subtree: true });
        injectButtonsAndPanes();
        return;
      }
      tries++;
      // Backoff but never give up — see sidebar-manager.js for the rationale.
      var delay = tries < 20 ? 50 : tries < 60 ? 250 : tries < 120 ? 1000 : 5000;
      setTimeout(tryBootstrap, delay);
    }
    tryBootstrap();
  }

  JE.TabsManager = {
    init: function () {
      injectStyles();
      startObserver();
      fetchEntries().then(injectButtonsAndPanes);
      if (JE.HotReload) {
        JE.HotReload.on('tabs', function () {
          fetchEntries().then(injectButtonsAndPanes);
        });
      }
    },
    refresh: function () { return fetchEntries().then(injectButtonsAndPanes); },
    // Public hook so route-hijacker can drop the .je-muted state when its
    // mount fails — without this, leaving a JE route with a still-active
    // custom tab would leave the home page with no visible content.
    unhideNative: unhideNative
  };
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
