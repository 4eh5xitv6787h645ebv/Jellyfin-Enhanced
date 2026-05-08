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
  var consecutiveFailures = 0;
  // Re-warn at base-10 thresholds (3, 30, 300, 3000) so an admin who opens
  // DevTools mid-outage immediately sees the failure mode instead of an
  // empty console — and so a long outage's warning isn't a single message
  // buried hours ago.
  var WARN_THRESHOLDS = [3, 30, 300, 3000];

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

  function versionUrl() {
    var ApiClient = window.ApiClient;
    if (ApiClient && typeof ApiClient.getUrl === 'function') {
      return ApiClient.getUrl('JellyfinEnhanced/web/version');
    }
    return basePath() + '/JellyfinEnhanced/web/version';
  }

  function poll() {
    fetch(versionUrl(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('hot-reload poll status ' + r.status);
        return r.json();
      })
      .then(function (body) {
        consecutiveFailures = 0;
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
      .catch(function (err) {
        consecutiveFailures++;
        if (WARN_THRESHOLDS.indexOf(consecutiveFailures) !== -1) {
          console.warn('[JE HotReload] version poll has failed ' + consecutiveFailures + ' times in a row', err);
        }
      })
      .finally(schedule);
  }

  // Bring the next poll forward on user-attention signals — tab refocus,
  // window focus, hashchange. Debounced to coalesce burst events (e.g.
  // visibilitychange + focus arriving back-to-back when a user alt-tabs in).
  var pokeTimer = null;
  var POKE_DEBOUNCE_MS = 500;
  function poke() {
    if (pokeTimer) return;
    pokeTimer = setTimeout(function () {
      pokeTimer = null;
      clearTimeout(timer);
      poll();
    }, POKE_DEBOUNCE_MS);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') poke();
  });
  window.addEventListener('focus', poke);
  window.addEventListener('hashchange', poke);

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
