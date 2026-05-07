/**
 * JE.RouteHijacker — replaces the SPA routing patches that Plugin Pages
 * applied to the Jellyfin web bundle. We don't rewrite the bundle. Instead,
 * we listen for navigation events and intercept any URL of the shape
 *
 *   #/JellyfinEnhanced/<pageId>
 *
 * Jellyfin's router will fall back to the home view for unknown hashes —
 * we let it open the home shell, then take over its DOM and render our
 * page into it. When the user navigates away, the next viewshow tear-down
 * clears our DOM and the home shell repopulates normally.
 *
 * Hide/unhide bookkeeping notes:
 *  - We hide siblings of our route container by setting display:none AND
 *    tagging them with data-je-hidden. Untagging plus restoring display
 *    happens at unmount time.
 *  - We deliberately skip elements that were ALREADY display:none before
 *    we touched them, so leaving the route doesn't reveal nodes Jellyfin
 *    intentionally hid.
 *  - If the host element disappeared between mount and unmount (e.g. the
 *    home shell was rebuilt by Jellyfin's router), we still walk the
 *    whole document looking for stragglers tagged with data-je-hidden so
 *    they always get cleaned up.
 *
 * Eviction:
 *  - Active route + admin disables that feature → the next sidebar topic
 *    fire pulls a fresh list; if the active route id isn't in that list,
 *    we navigate the user back to #/home and clean up.
 */
(function (JE) {
  'use strict';

  if (JE.RouteHijacker) return;

  var ATTR = 'data-je-route';
  var HIDDEN_ATTR = 'data-je-hidden';
  var HOST_SELECTOR = '#indexPage:not(.hide), .mainAnimatedPage:not(.hide) #indexPage, .page.libraryPage:not(.hide) #indexPage';
  var FALLBACK_SELECTOR = '#indexPage';
  var PREFIX = '#/JellyfinEnhanced/';
  var HOME_HASH = '#/home';

  var lastRouteId = null;
  var pending = null;
  var allowedIds = null; // null = trust WebHost, otherwise the live admin-enabled list
  var deferredRouteId = null; // captured on hash redirect; consumed when the home page mounts

  function getRouteId() {
    // Three sources, in priority order:
    //   1. A previously-captured pending id (we're mid-mount).
    //   2. sessionStorage — the inline preempt in <head> stashes the
    //      requested route there whenever it intercepts a JE hash.
    //      Drain it on every read so the next nav starts clean.
    //   3. The visible URL (user navigated directly to a JE route on
    //      a Jellyfin instance that doesn't have the inline preempt
    //      installed for some reason).
    if (deferredRouteId) return deferredRouteId;
    try {
      var stash = sessionStorage.getItem('__JE_PENDING_ROUTE__');
      if (stash) {
        sessionStorage.removeItem('__JE_PENDING_ROUTE__');
        deferredRouteId = stash;
        return stash;
      }
    } catch (_) { /* sessionStorage unavailable */ }

    var hash = location.hash || '';
    if (hash.indexOf(PREFIX) !== 0) return null;
    var rest = hash.slice(PREFIX.length);
    var stop = rest.indexOf('?');
    if (stop >= 0) rest = rest.slice(0, stop);
    return rest || null;
  }

  // Catch the hashchange BEFORE Jellyfin's router does. If the hash matches
  // a JE route, redirect to #/home (which Jellyfin recognises) and stash
  // the route id for our mount step. Without this, the SPA paints its
  // built-in "Page not found" view because /JellyfinEnhanced/<id> isn't a
  // real Jellyfin route.
  function preempt(e) {
    var hashSource = e && e.newURL ? e.newURL : window.location.href;
    var hashIdx = hashSource.indexOf('#');
    var hash = hashIdx >= 0 ? hashSource.slice(hashIdx) : '';
    if (hash.indexOf(PREFIX) !== 0) return;
    var rest = hash.slice(PREFIX.length);
    var stop = rest.indexOf('?');
    if (stop >= 0) rest = rest.slice(0, stop);
    if (!rest) return;
    deferredRouteId = rest;
    if (location.hash !== HOME_HASH) {
      location.replace(location.pathname + location.search + HOME_HASH);
    }
    if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function findHostElement() {
    return document.querySelector(HOST_SELECTOR) || document.querySelector(FALLBACK_SELECTOR);
  }

  function isAllowed(routeId) {
    if (allowedIds && allowedIds.indexOf(routeId) === -1) return false;
    return !!(JE.WebHost && JE.WebHost.has(routeId));
  }

  function unmount() {
    // Strip every JE container we added, anywhere in the tree, so a host
    // rebuild between mount and unmount can't strand them.
    var ours = document.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < ours.length; i++) ours[i].parentNode && ours[i].parentNode.removeChild(ours[i]);

    // Restore every sibling we hid. Walk the whole document because the
    // host may have been rebuilt; `data-je-hidden` is unique to our hide
    // set so a global query is safe.
    var hidden = document.querySelectorAll('[' + HIDDEN_ATTR + ']');
    for (var j = 0; j < hidden.length; j++) {
      hidden[j].style.removeProperty('display');
      hidden[j].removeAttribute(HIDDEN_ATTR);
    }
    // The user could have left a custom JE tab active on the home page
    // before navigating to a JE route. Tabs-manager doesn't know we're
    // about to leave so its .je-muted class persists — without explicit
    // teardown the home page returns with native panes still hidden.
    if (JE.TabsManager && typeof JE.TabsManager.unhideNative === 'function') {
      try { JE.TabsManager.unhideNative(); } catch (_) { /* noop */ }
    }
    lastRouteId = null;
  }

  function mount(routeId) {
    if (!isAllowed(routeId)) return false;

    var host = findHostElement();
    if (!host) return false;

    // Clean up any prior JE route's container before mounting the new one
    // (handles JE→JE transitions cleanly without leaving stale DOM).
    var existingRoutes = document.querySelectorAll('[' + ATTR + ']:not([' + ATTR + '="' + routeId + '"])');
    for (var i = 0; i < existingRoutes.length; i++) {
      existingRoutes[i].parentNode && existingRoutes[i].parentNode.removeChild(existingRoutes[i]);
    }

    // Hide siblings of our container that aren't already hidden by Jellyfin.
    // Skip nodes whose computed display is already 'none' so leaving the
    // route doesn't accidentally reveal something Jellyfin meant to hide.
    var prevChildren = Array.prototype.slice.call(host.children);
    for (var k = 0; k < prevChildren.length; k++) {
      var c = prevChildren[k];
      if (!c || (c.getAttribute && c.getAttribute(ATTR) === routeId)) continue;
      if (c.hasAttribute && c.hasAttribute(HIDDEN_ATTR)) continue;
      var inlineDisplay = c.style && c.style.display;
      if (inlineDisplay === 'none') continue;
      var computed;
      try { computed = window.getComputedStyle(c).display; } catch (_) { computed = ''; }
      if (computed === 'none') continue;
      c.style.display = 'none';
      c.setAttribute(HIDDEN_ATTR, '1');
    }

    var container = host.querySelector('[' + ATTR + '="' + routeId + '"]');
    if (!container) {
      container = document.createElement('div');
      container.setAttribute(ATTR, routeId);
      container.className = 'je-route-host';
      container.style.padding = '0';
      host.appendChild(container);
    }

    clear(container);
    var inner = document.createElement('div');
    inner.id = 'je-route-' + routeId;
    container.appendChild(inner);

    // Mark mount-in-progress before calling the renderer so a renderer-side
    // throw is caught by the unmount() cleanup path on the next navigate.
    // Without this, a thrown render leaves data-je-hidden siblings stranded.
    lastRouteId = routeId;
    if (JE.WebHost.render(routeId, inner)) {
      return true;
    }
    // Renderer reported failure (or threw and was caught). Roll back so we
    // don't leave the user staring at a hidden home page.
    unmount();
    return false;
  }

  function evaluate() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () {
      pending = null;
      var id = getRouteId();
      // Once we've consumed the deferred id, unstash so a subsequent
      // navigate-away clears state cleanly.
      var hashLooksJe = (location.hash || '').indexOf(PREFIX) === 0;
      if (!id || (!hashLooksJe && !deferredRouteId)) {
        if (lastRouteId !== null) {
          unmount();
          deferredRouteId = null;
        }
        return;
      }
      if (!isAllowed(id)) {
        if (lastRouteId !== null) unmount();
        deferredRouteId = null;
        if (location.hash !== HOME_HASH) location.replace(location.pathname + location.search + HOME_HASH);
        return;
      }
      if (id !== lastRouteId && lastRouteId !== null) {
        unmount();
      }
      var deadline = Date.now() + 1500;
      var tryMount = function () {
        if (mount(id)) {
          // Successful mount — the deferred id has been honored, the
          // visible URL is #/home, our content is showing.
          deferredRouteId = null;
          return;
        }
        if (Date.now() < deadline) requestAnimationFrame(tryMount);
      };
      tryMount();
    }, 30);
  }

  JE.RouteHijacker = {
    init: function () {
      // The inline preempt in <head> already installed capture-phase
      // hashchange / popstate listeners that redirect JE hashes to
      // #/home and stash the route id in sessionStorage. Our listeners
      // here are belt-and-braces (in case the inline preempt is missing
      // for any reason) and they're also responsible for triggering the
      // mount via evaluate().
      window.addEventListener('hashchange', preempt, true);
      window.addEventListener('popstate', preempt, true);

      window.addEventListener('hashchange', evaluate);
      window.addEventListener('popstate', evaluate);
      document.addEventListener('viewshow', evaluate);
      document.addEventListener('viewbeforeshow', evaluate);
      // The inline preempt fires this custom event whenever it stashes
      // a route id from a click / pushState that didn't change the URL
      // (sidebar click while already on #/home, etc.). Without this the
      // route never mounts because no native event triggers evaluate().
      window.addEventListener('je-route-pending', evaluate);

      preempt(null);
      evaluate();

      if (JE.HotReload) {
        // Fetch the live sidebar list on every hot-reload tick so we can
        // bounce the user out if the admin disabled the active page.
        JE.HotReload.on('sidebar', refreshAllowedFromServer);
        JE.HotReload.on('tabs', refreshAllowedFromServer);
        // Prime once on init.
        refreshAllowedFromServer();
      }
    },
    isJeRoute: function () { return getRouteId() !== null; },
    activeRouteId: function () { return lastRouteId; }
  };

  // Per-source "ever succeeded" tracking. Until BOTH sources have at least
  // one successful response we keep `allowedIds === null` (fail-open via
  // WebHost.has). After cold start, any source's transient failure
  // preserves the previous good entries from THAT source — a one-sided
  // 503/auth blip never combines with the other side's empty success to
  // evict the user from a working route.
  var allowedSidebar = null;       // last-good entries from the sidebar endpoint
  var allowedTabs = null;          // last-good entries from the tabs endpoint
  var sidebarEverSucceeded = false;
  var tabsEverSucceeded = false;
  var refreshFailures = 0;
  var REFRESH_WARN_THRESHOLDS = [3, 30, 300];

  function refreshAllowedFromServer() {
    var ApiClient = window.ApiClient;
    if (!ApiClient || typeof ApiClient.ajax !== 'function') return;

    var sidebarPromise = ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('JellyfinEnhanced/web/sidebar'), dataType: 'json' })
      .then(function (r) {
        if (r && Array.isArray(r.entries)) {
          allowedSidebar = r.entries;
          sidebarEverSucceeded = true;
          return true;
        }
        return false;
      })
      .catch(function () { return false; });

    var tabsPromise = ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('JellyfinEnhanced/web/tabs'), dataType: 'json' })
      .then(function (r) {
        if (r && Array.isArray(r.entries)) {
          allowedTabs = r.entries;
          tabsEverSucceeded = true;
          return true;
        }
        return false;
      })
      .catch(function () { return false; });

    Promise.all([sidebarPromise, tabsPromise]).then(function (results) {
      var anyOk = results[0] || results[1];
      if (!anyOk) {
        refreshFailures++;
        if (REFRESH_WARN_THRESHOLDS.indexOf(refreshFailures) !== -1) {
          console.warn('[JE RouteHijacker] sidebar/tabs refresh has failed ' + refreshFailures + ' times in a row — staying fail-open');
        }
        return;
      }
      refreshFailures = 0;

      // Wait for both endpoints to have produced a real response before
      // ever computing a concrete allowed-ids list. Otherwise a one-sided
      // success with empty entries combined with the other side never
      // having landed yet would falsely evict legitimate routes.
      if (!sidebarEverSucceeded || !tabsEverSucceeded) return;

      var ids = {};
      var sources = [allowedSidebar, allowedTabs];
      for (var i = 0; i < sources.length; i++) {
        var entries = sources[i] || [];
        for (var j = 0; j < entries.length; j++) {
          if (entries[j] && entries[j].id) ids[entries[j].id] = true;
        }
      }
      var nextAllowed = Object.keys(ids);
      var prevActive = lastRouteId;
      allowedIds = nextAllowed;

      // Only force re-evaluation when the active route was just evicted.
      // Otherwise an unrelated config change (e.g. an admin toggling a
      // feature the user isn't viewing) would re-render the active route
      // and clobber scroll position / form state.
      if (prevActive && nextAllowed.indexOf(prevActive) === -1) {
        evaluate();
      }
    });
  }
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
