/**
 * Calendar Custom Tab
 * Creates <div class="jellyfinenhanced calendar"></div> for CustomTabs plugin
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

  if (!window.JellyfinEnhanced?.pluginConfig?.CalendarPageEnabled) {
    return;
  }

  if (!window.JellyfinEnhanced?.pluginConfig?.CalendarUseCustomTabs) {
    return;
  }

  var style = document.createElement('style');
  style.textContent = [
    '.jellyfinenhanced.calendar {',
    '  padding: 12px 3vw;',
    '}',
    '.backgroundContainer.withBackdrop.je-tab-backdrop-dim {',
    '  background: rgba(0, 0, 0, 0.7) !important;',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  /** The last DOM node we mounted into. */
  var lastMountedContainer = null;
  var clickHandlerAttached = false;

  /** Whether this module currently has the backdrop dim class asserted. */
  var backdropDimmed = false;

  /** Mirrors the old :has() rule: dim the backdrop while this tab's content
   *  is the active home tab. Class-toggled because the :has(~ ...) form cost
   *  ~250-500ms of selector matching per navigation (SelectorStats).
   *  Queries .backgroundContainer without .withBackdrop so the off-toggle
   *  still reaches the node after Jellyfin drops .withBackdrop mid-nav; the
   *  injected dim rule itself still requires .withBackdrop, like the old one. */
  function syncBackdropDim(active) {
    document.querySelectorAll('.backgroundContainer').forEach(function (bg) {
      bg.classList.toggle('je-tab-backdrop-dim', !!active);
    });
  }

  /** @returns {boolean} Whether the current URL hash is the home page. */
  function isOnHomePage() {
    var hash = window.location.hash;
    return hash === '' || hash === '#/home' || hash === '#/home.html'
      || hash.indexOf('#/home?') !== -1 || hash.indexOf('#/home.html?') !== -1;
  }

  /**
   * Find the calendar container inside the active (non-hidden) home page.
   * Returns null if no visible container exists -- never falls back to a
   * stale DOM-cached copy.
   *
   * Tries three anchors in order so the mount works regardless of how the
   * host plugin (Custom Tabs, Plugin Pages, etc.) wraps the content:
   *  1. Nearest `.page` ancestor that doesn't have `.hide`  (standard Jellyfin)
   *  2. Nearest `.tabContent` ancestor that has `.is-active`  (Custom Tabs fallback)
   *  3. Element is itself visible (offsetParent !== null)     (last resort)
   *
   * @returns {HTMLElement|null}
   */
  function findActiveContainer() {
    var all = document.querySelectorAll('.jellyfinenhanced.calendar');
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
   * Render calendar into the given container using a scoped child element.
   * @param {HTMLElement} container - The active .jellyfinenhanced.calendar element.
   * @param {Object} JE - The JellyfinEnhanced global object.
   */
  function renderCalendar(container, JE) {
    container.classList.remove('hide');
    container.style.display = '';

    var child = document.createElement('div');
    child.id = 'je-calendar-container-tab';
    container.textContent = '';
    container.appendChild(child);

    JE.calendarPage.renderForCustomTab?.(child);

    if (!clickHandlerAttached && typeof JE.calendarPage.handleEventClick === 'function') {
      document.addEventListener("click", JE.calendarPage.handleEventClick);
      clickHandlerAttached = true;
    }

    lastMountedContainer = container;
  }

  /**
   * Persistent watcher -- observes document.body (via shared observer) for
   * DOM rebuilds and remounts the calendar when a new active container
   * appears. Suspends checks when not on the home page.
   * @param {Object} JE - The JellyfinEnhanced global object.
   */
  function watchForContainer(JE) {
    function tryMount() {
      // Navigated away from home — drop the dim before suspending.
      if (!isOnHomePage()) {
        if (backdropDimmed) {
          backdropDimmed = false;
          syncBackdropDim(false);
        }
        return;
      }

      var container = findActiveContainer();
      if (!container) {
        lastMountedContainer = null;
        // Container unmounted / removed from DOM — never leak the dim.
        if (backdropDimmed) {
          backdropDimmed = false;
          syncBackdropDim(false);
        }
        return;
      }

      // Backdrop dim, scoped exactly like the old :has() rule: only while
      // this tab is the active Custom Tabs pane (.tabContent.is-active).
      // Re-asserted on every check (idempotent) so a rebuilt background
      // node picks the class back up; turned off only on this module's
      // active -> inactive transition, so a sibling custom tab that just
      // turned the shared class on is left alone.
      var dimTab = container.closest('.tabContent');
      if (dimTab && dimTab.classList.contains('is-active')) {
        syncBackdropDim(true);
        backdropDimmed = true;
      } else if (backdropDimmed) {
        backdropDimmed = false;
        syncBackdropDim(false);
      }

      var shouldMount = container !== lastMountedContainer
        || !container.hasChildNodes()
        || (lastMountedContainer && !document.contains(lastMountedContainer));

      if (shouldMount) {
        renderCalendar(container, JE);
      }
    }

    tryMount();

    // Observe document.body (not .mainAnimatedPages) because Jellyfin replaces
    // .mainAnimatedPages when navigating to the admin dashboard — an observer
    // bound to the old element would become orphaned after returning to home
    // (issue 536). Routes to the shared multiplexed body observer.
    var mountPending = false;
    JE.helpers.createObserver('arr-calendar-custom-tab', function () {
      if (!mountPending) {
        mountPending = true;
        requestAnimationFrame(function () {
          mountPending = false;
          tryMount();
        });
      }
    }, document.body, { childList: true, subtree: true });
  }

  // JE.calendarPage is exported at module scope by arr/calendar-page.js,
  // which always executes before this deferred body (bundle/load order), so a
  // single synchronous check replaces the old readiness poll. Absent means
  // the calendar-page module failed to load — bail quietly.
  var JEglobal = window.JE || window.JellyfinEnhanced;
  if (!JEglobal?.calendarPage) {
    console.debug('🪼 Jellyfin Enhanced: Calendar Custom Tab: JE.calendarPage unavailable; skipping.');
    return;
  }
  watchForContainer(JEglobal);

    });
})();
