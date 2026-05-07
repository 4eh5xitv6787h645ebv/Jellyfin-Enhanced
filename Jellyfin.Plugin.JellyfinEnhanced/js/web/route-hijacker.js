/**
 * JE.RouteHijacker — replaces the SPA routing patches that Plugin Pages
 * applied to the Jellyfin web bundle. We don't rewrite the bundle. Instead,
 * we listen for navigation events and intercept any URL of the shape
 *
 *   #/JellyfinEnhanced/<pageId>
 *
 * Jellyfin's router will fall back to the home view for unknown hashes —
 * we let it open the home shell, then take over its DOM and render our page
 * into it. When the user navigates away, the next viewshow tear-down clears
 * our DOM and the home shell repopulates normally.
 *
 * The hijack is idempotent and reentrant-safe: if we re-render into the same
 * container twice (e.g. duplicate hashchange events) the second pass replaces
 * the first.
 */
(function (JE) {
  'use strict';

  if (JE.RouteHijacker) return;

  var ATTR = 'data-je-route';
  var HOST_SELECTOR = '#indexPage:not(.hide), .mainAnimatedPage:not(.hide) #indexPage, .page.libraryPage:not(.hide) #indexPage';
  var FALLBACK_SELECTOR = '#indexPage';
  var PREFIX = '#/JellyfinEnhanced/';

  var lastRouteId = null;
  var pending = null;

  function getRouteId() {
    var hash = location.hash || '';
    if (hash.indexOf(PREFIX) !== 0) return null;
    var rest = hash.slice(PREFIX.length);
    var stop = rest.indexOf('?');
    if (stop >= 0) rest = rest.slice(0, stop);
    return rest || null;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function findHostElement() {
    var el = document.querySelector(HOST_SELECTOR);
    if (el) return el;
    return document.querySelector(FALLBACK_SELECTOR);
  }

  function mount(routeId) {
    if (!JE.WebHost || !JE.WebHost.has(routeId)) return false;

    var host = findHostElement();
    if (!host) return false;

    // Hide the rest of the home page contents while our route is active so
    // we don't double up with the normal home tab content.
    var prevChildren = Array.prototype.slice.call(host.children);
    for (var i = 0; i < prevChildren.length; i++) {
      var c = prevChildren[i];
      if (c.getAttribute && c.getAttribute(ATTR) === routeId) continue;
      c.style.display = 'none';
      c.setAttribute('data-je-hidden', '1');
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

    JE.WebHost.render(routeId, inner);
    lastRouteId = routeId;
    return true;
  }

  function unmount() {
    if (lastRouteId === null) return;
    var host = findHostElement();
    if (!host) { lastRouteId = null; return; }

    var ours = host.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < ours.length; i++) ours[i].parentNode.removeChild(ours[i]);

    var hidden = host.querySelectorAll('[data-je-hidden="1"]');
    for (var j = 0; j < hidden.length; j++) {
      hidden[j].style.display = '';
      hidden[j].removeAttribute('data-je-hidden');
    }
    lastRouteId = null;
  }

  function evaluate() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () {
      pending = null;
      var id = getRouteId();
      if (id === lastRouteId) {
        if (id) mount(id); // re-render in case host was rebuilt
        return;
      }
      if (!id) { unmount(); return; }
      // Defer slightly so Jellyfin's router has a chance to swap to the home
      // view before we render into it.
      var deadline = Date.now() + 1500;
      var tryMount = function () {
        if (mount(id)) return;
        if (Date.now() < deadline) requestAnimationFrame(tryMount);
      };
      tryMount();
    }, 30);
  }

  JE.RouteHijacker = {
    init: function () {
      window.addEventListener('hashchange', evaluate);
      window.addEventListener('popstate', evaluate);
      document.addEventListener('viewshow', evaluate);
      document.addEventListener('viewbeforeshow', evaluate);
      evaluate();

      if (JE.HotReload) {
        // If the page was deleted from config while we're viewing it,
        // bounce the user back to home so they don't see a stale render.
        JE.HotReload.on('sidebar', function () {
          var id = getRouteId();
          if (id && JE.WebHost && !JE.WebHost.has(id)) {
            location.hash = '#/home';
          }
        });
      }
    },
    isJeRoute: function () { return getRouteId() !== null; },
    activeRouteId: function () { return lastRouteId; }
  };
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
