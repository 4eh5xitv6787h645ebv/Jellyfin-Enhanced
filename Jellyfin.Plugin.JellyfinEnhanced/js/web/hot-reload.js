/**
 * JE.HotReload — polls /JellyfinEnhanced/web/version every few seconds, fires
 * a topic event whenever a hash changes. Subsystems subscribe to the topics
 * they care about and reapply their UI changes without a page reload.
 *
 * Topics: sidebar | tabs | config | translations
 *
 * The polling interval is intentionally short (4s) but cheap — the response
 * is ~200 bytes and the server caches the hash for 2s. If a tab is hidden
 * we slow the loop down via Page Visibility API.
 */
(function (JE) {
  'use strict';

  if (JE.HotReload) return;

  var TOPICS = ['sidebar', 'tabs', 'config', 'translations'];
  var ACTIVE_INTERVAL_MS = 4000;
  var IDLE_INTERVAL_MS = 30000;

  var subscribers = Object.create(null);
  var current = Object.create(null);
  var primed = false;
  var timer = null;

  function basePath() {
    return window.__JE_BASE_PATH__ || '';
  }

  function subscribe(topic, fn) {
    (subscribers[topic] = subscribers[topic] || []).push(fn);
  }

  function emit(topic) {
    var list = subscribers[topic] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](); } catch (e) { console.error('[JE HotReload] subscriber error', e); }
    }
  }

  function schedule() {
    clearTimeout(timer);
    var ms = (document.visibilityState === 'hidden') ? IDLE_INTERVAL_MS : ACTIVE_INTERVAL_MS;
    timer = setTimeout(poll, ms);
  }

  function poll() {
    fetch(basePath() + '/JellyfinEnhanced/web/version', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        if (!body || !body.versions) return;
        var v = body.versions;
        for (var i = 0; i < TOPICS.length; i++) {
          var topic = TOPICS[i];
          var nextVal = v[topic];
          if (nextVal === undefined) continue;
          if (current[topic] !== nextVal) {
            var changed = primed; // first poll establishes baseline; don't fire
            current[topic] = nextVal;
            if (changed) emit(topic);
          }
        }
        primed = true;
      })
      .catch(function () { /* swallow — next tick will retry */ })
      .finally(schedule);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      // Force one immediate check on tab refocus.
      clearTimeout(timer);
      poll();
    }
  });

  JE.HotReload = {
    on: subscribe,
    emit: emit,
    start: function () {
      if (timer) return;
      poll();
    },
    snapshot: function () { return Object.assign({}, current); }
  };
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
