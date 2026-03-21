/**
 * Bookmarks Custom Tab
 * Creates <div class="sections bookmarks"></div> for CustomTabs plugin
 *
 * Uses a persistent observer to remount whenever the home page DOM is rebuilt
 * (e.g. after SPA navigation). Only runs when on the home page; suspends
 * when navigated away.
 *
 * The bookmarks-library.js module watches for .sections.bookmarks containers
 * via MutationObserver and will automatically render into them.
 */

(function () {
  'use strict';

  if (!window.JellyfinEnhanced?.pluginConfig?.BookmarksEnabled) {
    return;
  }

  if (!window.JellyfinEnhanced?.pluginConfig?.BookmarksUseCustomTabs) {
    return;
  }

  var style = document.createElement('style');
  style.textContent = [
    '.jellyfinenhanced.bookmarks {',
    '  padding: 12px 3vw;',
    '}',
    '.backgroundContainer.withBackdrop:has(~ .mainAnimatedPages #indexPage .tabContent.is-active .jellyfinenhanced.bookmarks) {',
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
   * Find the bookmarks container inside the active (non-hidden) home page.
   * Returns null if no visible container exists.
   * @returns {HTMLElement|null}
   */
  function findActiveContainer() {
    var all = document.querySelectorAll('.jellyfinenhanced.bookmarks');
    for (var i = all.length - 1; i >= 0; i--) {
      var page = all[i].closest('.page');
      if (page && !page.classList.contains('hide')) return all[i];
    }
    return null;
  }

  /**
   * Render bookmarks into the given container by creating a
   * .sections.bookmarks child that bookmarks-library.js will detect.
   * @param {HTMLElement} container - The active .jellyfinenhanced.bookmarks element.
   */
  function renderBookmarks(container) {
    container.classList.remove('hide');
    container.style.display = '';

    var child = document.createElement('div');
    child.className = 'sections bookmarks';
    container.textContent = '';
    container.appendChild(child);

    lastMountedContainer = container;
  }

  /**
   * Persistent watcher — observes .mainAnimatedPages for DOM rebuilds and
   * remounts the bookmarks tab when a new active container appears. Suspends
   * checks when not on the home page.
   */
  function watchForContainer() {
    function tryMount() {
      if (!isOnHomePage()) return;

      var container = findActiveContainer();
      if (!container) {
        lastMountedContainer = null;
        return;
      }

      var shouldMount = container !== lastMountedContainer
        || !container.hasChildNodes()
        || (lastMountedContainer && !document.contains(lastMountedContainer));

      if (shouldMount) {
        renderBookmarks(container);
      }
    }

    tryMount();

    var observeTarget = document.querySelector('.mainAnimatedPages') || document.body;
    var mountPending = false;
    var observer = new MutationObserver(function () {
      if (!mountPending) {
        mountPending = true;
        requestAnimationFrame(function () {
          mountPending = false;
          tryMount();
        });
      }
    });
    observer.observe(observeTarget, { childList: true, subtree: true });
  }

  // Start watching immediately — bookmarks-library.js handles the actual
  // content rendering when it detects .sections.bookmarks in the DOM
  watchForContainer();

})();
