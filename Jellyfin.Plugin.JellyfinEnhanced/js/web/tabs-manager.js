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
  // hidden but kept around).
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

  // Pick the currently-visible #indexPage. Jellyfin's SPA keeps the
  // previous home instance around hidden when you navigate back to home
  // via the header home button, so a naive `getElementById('indexPage')`
  // returns the OLD one — our panes end up in the wrong page and the
  // user sees the JE tabs as "not working".
  function visibleIndexPage() {
    var pages = document.querySelectorAll('#indexPage');
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      if (p.classList.contains('hide')) continue;
      // Check the nearest mainAnimatedPage too — Jellyfin marks transitions
      // by hiding the wrapping page, not always the #indexPage child.
      var wrap = p.closest('.mainAnimatedPage');
      if (wrap && wrap.classList.contains('hide')) continue;
      // And check for inline `display:none` set during SPA transitions.
      try {
        if (getComputedStyle(p).display === 'none') continue;
      } catch (_) { /* fall through */ }
      return p;
    }
    return pages[0] || null;
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
    // Make sure pane state is fresh BEFORE rendering: this prunes panes
    // that are stuck in a stale (now-hidden) #indexPage and ensures the
    // visible indexPage has its own pane with id=<id>.
    paint();

    var buttons = document.querySelectorAll('[' + TAB_BUTTON_ATTR + ']');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-active', buttons[i].getAttribute(TAB_BUTTON_ATTR) === id);
    }

    // Only operate on panes inside the currently-visible #indexPage.
    // Without this guard, multiple #indexPages (Jellyfin keeps the old
    // home alive when you navigate back via the header home button)
    // produce duplicate panes — activate() finds the first one (which
    // may be in the hidden page) and the user sees the JE content
    // stacked under the Favourites pane in the visible page.
    var visible = visibleIndexPage();
    if (!visible) return;

    var panes = visible.querySelectorAll('[' + TAB_PANE_ATTR + ']');
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

    // Mute native panes ONLY in the visible indexPage so the home
    // page that the user is actually looking at switches to JE content.
    var native = visible.querySelectorAll('.tabContent');
    for (var k = 0; k < native.length; k++) {
      native[k].classList.toggle('je-muted', renderedAny);
    }

    // Strip leftover .je-muted from any other (hidden) #indexPage so
    // they're clean if Jellyfin transitions back to them later.
    var allPages = document.querySelectorAll('#indexPage');
    for (var m = 0; m < allPages.length; m++) {
      if (allPages[m] === visible) continue;
      var stale = allPages[m].querySelectorAll('.tabContent.je-muted');
      for (var n = 0; n < stale.length; n++) stale[n].classList.remove('je-muted');
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
      var visible = visibleIndexPage();
      // We need both: a strip to host buttons, and a visible #indexPage to
      // host panes. If either is missing this paint pass is a no-op.
      if (!strip || !visible) return;

      // BUTTONS — drop ones that aren't in the live entries list
      // (admin removed a feature). Idempotent insert for the rest.
      strip.querySelectorAll('[' + TAB_BUTTON_ATTR + ']').forEach(function (b) {
        if (!entries.some(function (e) { return e.id === b.getAttribute(TAB_BUTTON_ATTR); })) {
          b.parentNode && b.parentNode.removeChild(b);
        }
      });
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (strip.querySelector('[' + TAB_BUTTON_ATTR + '="' + e.id + '"]')) continue;
        strip.appendChild(makeButton(e));
      }

      // PANES — every pane must live inside the *currently-visible*
      // #indexPage. Strip any panes that ended up in a stale (hidden)
      // page, then add what's missing in the visible one. Without this
      // step, navigating back to home via the header home button leaves
      // the panes in the previous indexPage instance, and clicking a
      // JE tab activates a pane that's hidden — producing the user-
      // reported "tabs don't work" symptom.
      document.querySelectorAll('[' + TAB_PANE_ATTR + ']').forEach(function (p) {
        var inVisible = visible.contains(p);
        var stillValid = entries.some(function (ee) { return ee.id === p.getAttribute(TAB_PANE_ATTR); });
        if (!inVisible || !stillValid) {
          p.parentNode && p.parentNode.removeChild(p);
        }
      });
      for (var j = 0; j < entries.length; j++) {
        var ee = entries[j];
        if (visible.querySelector('[' + TAB_PANE_ATTR + '="' + ee.id + '"]')) continue;
        visible.appendChild(makePane(ee));
      }

      // Wire native-tab clicks (idempotent via _jeBound) so picking a
      // built-in Jellyfin tab clears our active state.
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
