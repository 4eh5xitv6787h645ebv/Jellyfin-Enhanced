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

  function makeLink(item) {
    var a = document.createElement('a');
    a.setAttribute('is', 'emby-linkbutton');
    a.setAttribute('data-itemid', 'je-' + item.id);
    a.className = 'lnkMediaFolder navMenuOption emby-button ' + ENTRY_CLASS;
    a.href = item.url;

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
    return fetch(basePath() + '/JellyfinEnhanced/web/sidebar', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { entries: [] }; })
      .then(function (body) {
        entries = (body && body.entries) || [];
      })
      .catch(function () { entries = []; });
  }

  // Two-phase observer to avoid burning CPU on every body mutation:
  //   1. A lightweight watcher waits for the drawer host to appear.
  //   2. Once we have the host, we observe ONLY its subtree, and repaint
  //      whenever the drawer is rebuilt (user switch / theme change) or
  //      our managed links are removed.
  function startObserver() {
    if (observer) return;

    var hostObserver = null;
    var bootstrapTries = 0;

    function attach(host) {
      hostObserver = new MutationObserver(function (records) {
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

    function tryBootstrap() {
      var host = document.querySelector(HOST_SELECTOR);
      if (host) { attach(host); paint(); return; }
      if (++bootstrapTries > 600) return; // ~30s
      setTimeout(tryBootstrap, 50);
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
