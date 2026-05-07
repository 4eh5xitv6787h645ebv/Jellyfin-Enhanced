/**
 * JE.TabsManager — adds custom tabs to the Jellyfin home page tab strip.
 * Re-injects on every SPA navigation back to the home view, so the tabs
 * survive any number of Dashboard / Library / Home round-trips without a
 * page refresh. Replaces the previous tabs-manager which scoped its
 * MutationObserver to `.mainAnimatedPages`; that container is destroyed
 * and rebuilt by Jellyfin on navigation, orphaning the observer.
 *
 * Trigger sources for the paint step (any one is enough):
 *  - Initial load: kicked from JE.WebKickoff.start().
 *  - SPA navigation: 'viewshow' event on document fires for every page.
 *  - Hot-reload tick: JE.HotReload.on('tabs', ...) for live config changes.
 *  - DOM mutation: a 1-Hz polling loop catches strip rebuilds Jellyfin
 *    performs without firing viewshow (rare but observed during library
 *    user-data refreshes). Cheap because each tick just runs a
 *    document.querySelector with no side effects unless the strip is in a
 *    state we need to fix.
 *
 * paint() is idempotent — if the strip already has our buttons it no-ops.
 *
 * ATTRIBUTION: written from scratch for this plugin. Does not adapt or
 * include code from any third-party Custom Tabs implementation.
 */
(function (JE) {
  'use strict';

  if (JE.TabsManager) return;

  var TAB_BUTTON_ATTR = 'data-je-tab';
  var TAB_PANE_ATTR = 'data-je-tab-pane';
  var TAB_BUTTON_CLASS = 'emby-tab-button je-custom-tab-button';
  var STYLE_ID = 'je-tabs-manager-styles';

  var entries = [];
  var stylesInjected = false;
  var pollTimer = null;
  var inFlight = false;

  function basePath() { return window.__JE_BASE_PATH__ || ''; }

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    // !important on .je-muted is needed because Jellyfin's tab switcher
    // sets display:block inline on the active native pane — without
    // !important the inline style wins and native content bleeds through
    // under our custom tab.
    style.textContent = [
      '.je-custom-tab-button.is-active { color: var(--mdc-theme-primary, #00a4dc); }',
      '.je-custom-tab-pane { display: none; padding: 12px 3vw; }',
      '.je-custom-tab-pane.is-active { display: block; }',
      '.je-custom-tab-pane > .je-custom-tab-mount { width: 100%; }',
      '.tabContent.je-muted { display: none !important; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // Find the active home-page tab strip. Jellyfin can have multiple
  // .headerTabs elements in the DOM at once (each non-active page is
  // hidden but kept around). We want the one inside the visible #indexPage.
  function findStrip() {
    var candidates = [
      '#indexPage:not(.hide) .headerTabs',
      '.mainAnimatedPage:not(.hide) #indexPage .headerTabs',
      '#indexPage .headerTabs',
      '.headerTabs',
    ];
    for (var i = 0; i < candidates.length; i++) {
      var el = document.querySelector(candidates[i]);
      if (el && document.contains(el)) return el;
    }
    return null;
  }

  function findPaneHost(strip) {
    // Pane host lives inside the same #indexPage as the strip we just
    // matched, NOT a sibling — otherwise on a multi-mainAnimatedPage
    // setup we'd append the pane to the wrong page.
    var indexPage = strip.closest('#indexPage') || document.querySelector('#indexPage:not(.hide)') || document.getElementById('indexPage');
    return indexPage || null;
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
    var buttons = document.querySelectorAll('[' + TAB_BUTTON_ATTR + ']');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-active', buttons[i].getAttribute(TAB_BUTTON_ATTR) === id);
    }
    var panes = document.querySelectorAll('[' + TAB_PANE_ATTR + ']');
    var renderedAny = false;
    for (var j = 0; j < panes.length; j++) {
      var p = panes[j];
      var match = p.getAttribute(TAB_PANE_ATTR) === id;
      p.classList.toggle('is-active', match);
      if (match) {
        var mount = p.querySelector('.je-custom-tab-mount');
        clear(mount);
        if (JE.WebHost && JE.WebHost.render(id, mount)) {
          renderedAny = true;
        } else {
          console.warn('[JE TabsManager] no render output for tab "' + id + '"');
          p.classList.remove('is-active');
        }
      }
    }
    var indexPage = document.getElementById('indexPage');
    if (indexPage) {
      var native = indexPage.querySelectorAll('.tabContent');
      for (var k = 0; k < native.length; k++) {
        native[k].classList.toggle('je-muted', renderedAny);
      }
    }
  }

  function unhideNative() {
    var muted = document.querySelectorAll('.tabContent.je-muted');
    for (var i = 0; i < muted.length; i++) muted[i].classList.remove('je-muted');
  }

  function paint() {
    if (inFlight) return;
    inFlight = true;
    try {
      injectStyles();
      var strip = findStrip();
      if (!strip) return;

      // Idempotent guard — every entry whose id already has a button +
      // pane in the DOM is left alone. We only do work when the strip is
      // missing one (which happens after a SPA rebuild).
      var allPresent = entries.length > 0 && entries.every(function (e) {
        return strip.querySelector('[' + TAB_BUTTON_ATTR + '="' + e.id + '"]');
      });
      if (allPresent) return;

      // Drop stale buttons (entry removed by hot-reload) and any nodes
      // pointing at a different #indexPage instance.
      strip.querySelectorAll('[' + TAB_BUTTON_ATTR + ']').forEach(function (b) {
        if (!entries.some(function (e) { return e.id === b.getAttribute(TAB_BUTTON_ATTR); })) {
          b.parentNode && b.parentNode.removeChild(b);
        }
      });

      // Drop stale panes anywhere in the document (a previous home-page
      // instance's panes may still be in the tree).
      document.querySelectorAll('[' + TAB_PANE_ATTR + ']').forEach(function (p) {
        var stillValid = entries.some(function (e) { return e.id === p.getAttribute(TAB_PANE_ATTR); });
        if (!stillValid) p.parentNode && p.parentNode.removeChild(p);
      });

      // Inject any missing buttons.
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (strip.querySelector('[' + TAB_BUTTON_ATTR + '="' + e.id + '"]')) continue;
        strip.appendChild(makeButton(e));
      }

      // Inject any missing panes into the active home page.
      var paneHost = findPaneHost(strip);
      if (paneHost) {
        for (var j = 0; j < entries.length; j++) {
          var ee = entries[j];
          if (paneHost.querySelector('[' + TAB_PANE_ATTR + '="' + ee.id + '"]')) continue;
          paneHost.appendChild(makePane(ee));
        }
      }

      // Wire native-tab clicks to deactivate our tabs / panes when the
      // user picks a built-in Jellyfin tab. Idempotent via _jeBound.
      strip.querySelectorAll('button.emby-tab-button:not(.je-custom-tab-button)').forEach(function (b) {
        if (b._jeBound) return;
        b._jeBound = true;
        b.addEventListener('click', function () {
          document.querySelectorAll('[' + TAB_BUTTON_ATTR + ']').forEach(function (x) { x.classList.remove('is-active'); });
          document.querySelectorAll('[' + TAB_PANE_ATTR + ']').forEach(function (x) { x.classList.remove('is-active'); });
          unhideNative();
        });
      });
    } finally {
      inFlight = false;
    }
  }

  function fetchEntries() {
    var ApiClient = window.ApiClient;
    if (!ApiClient || typeof ApiClient.ajax !== 'function') return Promise.resolve();
    return ApiClient.ajax({
      type: 'GET',
      url: ApiClient.getUrl('JellyfinEnhanced/web/tabs'),
      dataType: 'json'
    })
      .then(function (body) {
        if (body && Array.isArray(body.entries)) entries = body.entries;
      })
      .catch(function (err) {
        console.warn('[JE TabsManager] tabs fetch failed', err);
      });
  }

  function refreshAndPaint() { return fetchEntries().then(paint); }

  function startTriggers() {
    // Trigger 1: Jellyfin's own viewshow event. Fires after every SPA
    // navigation, BEFORE the tab content is fully mounted, so we paint
    // on a microtask to let the strip stabilise.
    document.addEventListener('viewshow', function () { setTimeout(paint, 50); });

    // Trigger 2: low-frequency safety net for cases viewshow misses
    // (Jellyfin async-builds the strip after viewshow on slow boxes).
    // 1 Hz keeps it cheap; paint() is idempotent.
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      paint();
    }, 1000);

    // Trigger 3: hot-reload topic (admin toggled a tab on/off).
    if (JE.HotReload) JE.HotReload.on('tabs', refreshAndPaint);
  }

  JE.TabsManager = {
    init: function () {
      injectStyles();
      startTriggers();
      refreshAndPaint();
    },
    refresh: refreshAndPaint,
    unhideNative: unhideNative,
    _paint: paint
  };
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
