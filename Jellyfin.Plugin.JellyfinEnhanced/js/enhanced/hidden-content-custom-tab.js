/**
 * Hidden Content Custom Tab
 * Creates <div class="jellyfinenhanced hidden-content"></div> for CustomTabs plugin
 *
 * Uses a persistent observer to remount whenever the home page DOM is rebuilt
 * (e.g. after SPA navigation). Only runs when on the home page; suspends
 * when navigated away.
 */

(function () {
  'use strict';

    // Body deferred via onBootReady: top-level code here reads plugin/user
    // config, which is not loaded yet when the server-side bundle executes.
    window.JellyfinEnhanced.onBootReady(function() {

  if (!window.JellyfinEnhanced?.pluginConfig?.HiddenContentEnabled) {
    return;
  }

  if (!window.JellyfinEnhanced?.pluginConfig?.HiddenContentUseCustomTabs) {
    return;
  }

  var style = document.createElement('style');
  style.textContent = [
    '.jellyfinenhanced.hidden-content {',
    '  padding: 12px 3vw;',
    '}',
    '.backgroundContainer.withBackdrop:has(~ .mainAnimatedPages #indexPage .tabContent.is-active .jellyfinenhanced.hidden-content) {',
    '  background: rgba(0, 0, 0, 0.7) !important;',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  /** The last DOM node we mounted into. */
  var lastMountedContainer = null;

  /** @returns {boolean} Whether the current URL hash is the home page. */
  function isOnHomePage() {
    var hash = window.location.hash;
    return hash === '' || hash === '#/home' || hash === '#/home.html'
      || hash.indexOf('#/home?') !== -1 || hash.indexOf('#/home.html?') !== -1;
  }

  /**
   * Find the hidden content container inside the active (non-hidden) home page.
   * Returns null if no visible container exists -- never falls back to a
   * stale DOM-cached copy.
   * @returns {HTMLElement|null}
   */
  function findActiveContainer() {
    var all = document.querySelectorAll('.jellyfinenhanced.hidden-content');
    for (var i = all.length - 1; i >= 0; i--) {
      var el = all[i];
      // 1. Standard Jellyfin page structure
      var page = el.closest('.page');
      if (page && !page.classList.contains('hide')) return el;
      // 2. Custom Tabs wraps content in .tabContent.is-active (no .page ancestor)
      var tabContent = el.closest('.tabContent');
      if (tabContent && tabContent.classList.contains('is-active')) return el;
      // 3. Last resort: element is simply visible in the document
      if (!page && !tabContent && el.offsetParent !== null) return el;
    }
    return null;
  }

  /**
   * Render hidden content into the given container using a scoped child element.
   * @param {HTMLElement} container - The active .jellyfinenhanced.hidden-content element.
   * @param {Object} JE - The JellyfinEnhanced global object.
   */
  function renderHiddenContent(container, JE) {
    if (!container || !JE.hiddenContentPage) return;

    container.classList.remove('hide');
    container.style.display = '';

    var child = document.createElement('div');
    child.id = 'je-hidden-content-container-tab';
    container.textContent = '';
    container.appendChild(child);

    JE.hiddenContentPage.renderForCustomTab?.(child);

    lastMountedContainer = container;
  }

  /**
   * Persistent watcher -- observes document.body (via shared observer) for
   * DOM rebuilds and remounts the hidden content tab when a new active
   * container appears. Suspends checks when not on the home page.
   * @param {Object} JE - The JellyfinEnhanced global object.
   */
  function watchForContainer(JE) {
    function tryMount() {
      if (!isOnHomePage()) return;

      // JE.hiddenContent is created by initializeHiddenContent() in plugin.js
      // Stage 6, which runs after this deferred body. Skip mounting until it
      // exists — the body observer re-runs tryMount on later DOM changes, and
      // the microtask retry below covers the boot landing page.
      if (!JE.hiddenContent) return;

      var container = findActiveContainer();
      if (!container) {
        lastMountedContainer = null;
        return;
      }

      var shouldMount = container !== lastMountedContainer
        || !container.hasChildNodes()
        || (lastMountedContainer && !document.contains(lastMountedContainer));

      if (shouldMount) {
        renderHiddenContent(container, JE);
      }
    }

    tryMount();

    // Re-check once the current task completes: in bundled mode Stage 6
    // (which defines JE.hiddenContent) runs synchronously after this body,
    // so a microtask retry catches a container already on screen at boot.
    queueMicrotask(tryMount);

    // Observe document.body (not .mainAnimatedPages) because Jellyfin replaces
    // .mainAnimatedPages when navigating to the admin dashboard — an observer
    // bound to the old element would become orphaned after returning to home
    // (issue 536). Routes to the shared multiplexed body observer.
    var mountPending = false;
    JE.helpers.createObserver('hidden-content-custom-tab', function () {
      if (!mountPending) {
        mountPending = true;
        requestAnimationFrame(function () {
          mountPending = false;
          tryMount();
        });
      }
    }, document.body, { childList: true, subtree: true });
  }

  // JE.hiddenContentPage is exported at module scope by hidden-content-page.js,
  // which always executes before this deferred body (bundle/load order), so a
  // single synchronous check suffices for it. JE.hiddenContent is assigned
  // later (plugin.js Stage 6) and is therefore guarded lazily inside tryMount.
  var JEglobal = window.JE || window.JellyfinEnhanced;
  if (!JEglobal?.hiddenContentPage) {
    console.debug('🪼 Jellyfin Enhanced: Hidden Content Custom Tab: JE.hiddenContentPage unavailable; skipping.');
    return;
  }
  watchForContainer(JEglobal);

    });
})();
