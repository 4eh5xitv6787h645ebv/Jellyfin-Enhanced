/**
 * JE.SidebarManager — adds a "Jellyfin Enhanced" section to the main drawer
 * containing one entry per enabled JE page. Replaces the inject.js shipped
 * by the Plugin Pages plugin.
 *
 * Resilience requirements:
 *  - The drawer can be torn down and rebuilt on user switch and theme change
 *    — we use a MutationObserver to re-mount our section whenever the host
 *    element disappears.
 *  - Admins can toggle which entries appear at runtime — we subscribe to the
 *    "sidebar" hot-reload topic and re-fetch + re-render without a refresh.
 *
 * Defensive note: every entry value is rendered via DOM APIs (no innerHTML)
 * so even if a future server bug echoes user input we never inject markup.
 */
(function (JE) {
  'use strict';

  if (JE.SidebarManager) return;

  // We render into the same .jellyfinEnhancedSection that
  // JE.addPluginMenuButton creates for the "Enhanced Panel" link, so all JE
  // sidebar entries cluster under one header. Our own entries are tagged
  // with .je-managed-link so we can replace them without touching the
  // settings link (added by addPluginMenuButton).
  var SECTION_CLASS = 'jellyfinEnhancedSection';
  var ENTRY_CLASS = 'je-managed-link';
  var HOST_SELECTOR = '.mainDrawer-scrollContainer';
  var ANCHOR_SELECTOR = '.libraryMenuOptions';

  var entries = [];
  var observer = null;

  function basePath() { return window.__JE_BASE_PATH__ || ''; }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // Hash-fragment URLs only — defends against javascript:/data:/file: schemes
  // sneaking in if an attacker ever gets to write the server-side response
  // (e.g. via a corrupted JE config file with elevated access). Server-side
  // we only emit "#/JellyfinEnhanced/<id>", so this is defense in depth.
  function safeUrl(url) {
    return (typeof url === 'string' && /^#\//.test(url)) ? url : '#/home';
  }

  function makeLink(item) {
    var a = document.createElement('a');
    a.setAttribute('is', 'emby-linkbutton');
    a.setAttribute('data-itemid', 'je-' + item.id);
    a.className = 'lnkMediaFolder navMenuOption emby-button ' + ENTRY_CLASS;
    a.href = safeUrl(item.url);

    var iconSpan = document.createElement('span');
    iconSpan.className = 'material-icons navMenuOptionIcon ' + (item.icon || 'extension');
    iconSpan.setAttribute('aria-hidden', 'true');

    var textSpan = document.createElement('span');
    textSpan.className = 'sectionName navMenuOptionText';
    textSpan.textContent = item.title || '';

    a.appendChild(iconSpan);
    a.appendChild(textSpan);
    return a;
  }

  function paint() {
    var section = ensureSection();
    if (!section) return;

    var managed = section.querySelectorAll('.' + ENTRY_CLASS);
    for (var i = 0; i < managed.length; i++) managed[i].parentNode.removeChild(managed[i]);

    for (var j = 0; j < entries.length; j++) {
      section.appendChild(makeLink(entries[j]));
    }
  }

  function ensureSection() {
    var host = document.querySelector(HOST_SELECTOR);
    if (!host) return null;

    var section = host.querySelector('.' + SECTION_CLASS);
    if (section) return section;

    // js/enhanced/ui.js's addPluginMenuButton normally creates the section
    // when the user is admin. Provide a fallback for non-admin users so JE
    // pages still appear for them.
    section = document.createElement('div');
    section.className = SECTION_CLASS;
    var header = document.createElement('h3');
    header.className = 'sidebarHeader';
    header.textContent = (JE.t ? JE.t('SidebarHeader') : 'Jellyfin Enhanced');
    section.appendChild(header);

    var anchor = host.querySelector(ANCHOR_SELECTOR);
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(section, anchor);
    } else {
      host.appendChild(section);
    }
    return section;
  }

  function fetchEntries() {
    // ApiClient.ajax attaches Jellyfin's X-Emby-Token / X-MediaBrowser-Token
    // header automatically — raw fetch returns 401 because the [Authorize]
    // attribute on the controller refuses it.
    var ApiClient = window.ApiClient;
    if (!ApiClient || typeof ApiClient.ajax !== 'function') {
      return Promise.resolve();
    }
    return ApiClient.ajax({
      type: 'GET',
      url: ApiClient.getUrl('JellyfinEnhanced/web/sidebar'),
      dataType: 'json'
    })
      .then(function (body) {
        // Only replace entries on success. A transient 5xx / auth blip
        // would otherwise wipe the user's sidebar links until the next
        // hot-reload tick.
        if (body && Array.isArray(body.entries)) entries = body.entries;
      })
      .catch(function (err) {
        console.warn('[JE SidebarManager] sidebar fetch failed', err);
      });
  }

  // Two-phase observer to avoid burning CPU on every body mutation:
  //   1. A lightweight watcher waits for the drawer host to appear. The
  //      poll interval backs off but never gives up — Jellyfin's drawer
  //      can be lazily mounted if the user hasn't opened it yet, and we
  //      need to still attach if they open it minutes after login.
  //   2. Once we have the host, we observe ONLY its subtree, and repaint
  //      whenever the drawer is rebuilt (user switch / theme change) or
  //      our managed links are removed.
  function startObserver() {
    if (observer) return;

    function attach(host) {
      var hostObserver = new MutationObserver(function (records) {
        // Cheap pre-filter: only react when nodes were actually added or
        // removed. Class/text mutations on existing nodes don't matter.
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          if ((r.addedNodes && r.addedNodes.length) || (r.removedNodes && r.removedNodes.length)) {
            var section = host.querySelector('.' + SECTION_CLASS);
            if (!section) { paint(); return; }
            if (entries.length && !section.querySelector('.' + ENTRY_CLASS)) paint();
            return;
          }
        }
      });
      hostObserver.observe(host, { childList: true, subtree: true });
      observer = hostObserver;
    }

    var tries = 0;
    function tryBootstrap() {
      var host = document.querySelector(HOST_SELECTOR);
      if (host) { attach(host); paint(); return; }
      tries++;
      // 50ms for the first second, then 250ms, then 1s, then 5s indefinitely.
      // Drawer eventually gets mounted; we just don't burn CPU waiting.
      var delay = tries < 20 ? 50 : tries < 60 ? 250 : tries < 120 ? 1000 : 5000;
      setTimeout(tryBootstrap, delay);
    }
    tryBootstrap();
  }

  JE.SidebarManager = {
    init: function () {
      startObserver();
      fetchEntries().then(paint);
      if (JE.HotReload) {
        JE.HotReload.on('sidebar', function () { fetchEntries().then(paint); });
      }
    },
    refresh: function () { return fetchEntries().then(paint); }
  };
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
