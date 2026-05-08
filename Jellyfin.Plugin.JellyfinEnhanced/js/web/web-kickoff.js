/**
 * JE.Web.Kickoff — registers each JE feature with JE.WebHost and starts
 * the sidebar / route / tabs / hot-reload subsystems.
 *
 * Loaded after web/{page-host,hot-reload,sidebar-manager,route-hijacker,tabs-manager}.js
 * and before any feature module — feature modules call into JE.WebHost when
 * they register their own renderForCustomTab functions on the JE namespace.
 *
 * The actual page renderers live in:
 *   - JE.calendarPage.renderForCustomTab
 *   - JE.downloadsPage.renderForCustomTab     (the "Requests" feature)
 *   - JE.hiddenContentPage.renderForCustomTab
 *   - JE.bookmarksLibrary.renderForCustomTab  (added in bookmarks-library.js)
 */
(function (JE) {
  'use strict';

  if (JE.WebKickoff) return;

  function bind(id, getter) {
    JE.WebHost.register(id, function (el) {
      var fn = getter();
      if (typeof fn === 'function') fn(el);
      else el.textContent = '';
    });
  }

  function attachAfterReady() {
    bind('calendar',      function () { return JE.calendarPage && JE.calendarPage.renderForCustomTab; });
    bind('downloads',     function () { return JE.downloadsPage && JE.downloadsPage.renderForCustomTab; });
    bind('hiddenContent', function () { return JE.hiddenContentPage && JE.hiddenContentPage.renderForCustomTab; });
    bind('bookmarks',     function () { return JE.bookmarksLibrary && JE.bookmarksLibrary.renderForCustomTab; });
  }

  JE.WebKickoff = {
    start: function () {
      attachAfterReady();
      if (JE.HotReload) JE.HotReload.start();
      if (JE.SidebarManager) JE.SidebarManager.init();
      if (JE.RouteHijacker) JE.RouteHijacker.init();
      if (JE.TabsManager) JE.TabsManager.init();
      if (JE.AutoReload) JE.AutoReload.init();
    }
  };
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
