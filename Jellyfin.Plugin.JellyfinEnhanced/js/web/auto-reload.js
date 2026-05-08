/**
 * JE.AutoReload — refresh signed-in clients when the admin saves a
 * config change. Driven by HotReload's "config" topic, which fires
 * whenever ConfigVersion.Current bumps server-side.
 *
 * Reload guards (in priority order):
 *   1. NEVER reload during media playback — observable DOM signals only,
 *      since modern Jellyfin web doesn't expose playbackManager on window.
 *      Covers local <video>/<audio>, the visible video player container,
 *      the visible Now Playing bar (Cast / remote playback), and any
 *      hash on a /video|/audio playback view. A reload would break the
 *      watcher's session.
 *   2. PREFER reload during idle — 30 s with no mousemove / keydown /
 *      touchstart / wheel input on document. Most users idle frequently.
 *   3. FALLBACK reload on home navigation — viewshow on #indexPage,
 *      provided guard 1 still passes.
 *
 * Loop-guard: belt-and-suspenders against the pathological case where
 * something post-reload immediately bumps the config version again. We
 * cap reloads at RELOAD_LIMIT per RELOAD_WINDOW_MS in sessionStorage; if
 * that fires we degrade to a one-shot toast and stop reloading until the
 * user manually refreshes.
 *
 * The opt-in toggle lives in the plugin config (AutoReloadOnConfigChange)
 * and propagates to clients via /JellyfinEnhanced/public-config →
 * JE.pluginConfig.AutoReloadOnConfigChange.
 */
(function (JE) {
  'use strict';

  if (JE.AutoReload) return;

  var IDLE_THRESHOLD_MS = 30 * 1000;
  var POLL_INTERVAL_MS = 5 * 1000;
  var INITIAL_GRACE_MS = 30 * 1000; // ignore config bumps in the first 30s after page load
  var RELOAD_LIMIT = 3;
  var RELOAD_WINDOW_MS = 60 * 1000;
  var RELOAD_LOG_KEY = '__JE_AR_RELOADS__';

  var bootedAt = Date.now();
  var lastInputAt = bootedAt;
  var pendingReload = false;
  var pollTimer = null;
  var loopGuardTripped = false;

  // True when something playback-related is on screen. We intentionally
  // bias toward "playing" — a false positive only delays a reload, but a
  // false negative reloads someone mid-stream.
  //
  // Modern Jellyfin web (10.10+) uses the playbackmanager.js ES module and
  // does NOT expose it on window, so we check observable DOM state
  // instead: any non-paused <video>/<audio> element, the visible video
  // player container, the visible Now Playing bar (covers Cast / remote
  // playback where there's no local <video>), or a hash that lands on a
  // playback view.
  function isPlayingMedia() {
    var medias = document.querySelectorAll('video, audio');
    for (var i = 0; i < medias.length; i++) {
      var m = medias[i];
      if (!m.paused && !m.ended && m.readyState > 0) return true;
    }
    if (document.querySelector('.videoPlayerContainer:not(.hide), .nowPlayingBar:not(.hide)')) return true;
    if (document.body && document.body.classList.contains('osdShown')) return true;
    var hash = (location.hash || '').toLowerCase();
    if (hash.indexOf('#/video') === 0 || hash.indexOf('#/audio') === 0) return true;
    return false;
  }

  function isIdle() {
    return (Date.now() - lastInputAt) >= IDLE_THRESHOLD_MS;
  }

  function isOnHomePage() {
    var hash = location.hash || '';
    return hash === '' || hash === '#/' || hash === '#/home' || hash.indexOf('#/home?') === 0
      || hash.indexOf('#/home/') === 0;
  }

  function loadReloadLog() {
    try {
      var raw = sessionStorage.getItem(RELOAD_LOG_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveReloadLog(log) {
    try {
      sessionStorage.setItem(RELOAD_LOG_KEY, JSON.stringify(log));
    } catch (_) { /* noop */ }
  }

  // Returns true when this reload should be allowed; false when the loop
  // guard has tripped. Records the attempt in sessionStorage either way.
  function reserveReloadSlot() {
    var now = Date.now();
    var recent = loadReloadLog().filter(function (t) { return (now - t) < RELOAD_WINDOW_MS; });
    if (recent.length >= RELOAD_LIMIT) {
      saveReloadLog(recent);
      return false;
    }
    recent.push(now);
    saveReloadLog(recent);
    return true;
  }

  function showLoopGuardToast() {
    if (typeof JE.toast === 'function') {
      try { JE.toast('Plugin config changed, but auto-reload is paused (too many reloads). Refresh manually to apply.', 'warning'); return; } catch (_) { /* fall through */ }
    }
    try { console.warn('🪼 Jellyfin Enhanced: AutoReload paused — too many reloads in 60s. Refresh manually.'); } catch (_) { /* noop */ }
  }

  function stopTickPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function performReload() {
    if (!pendingReload) return;
    if (isPlayingMedia()) return;
    if (loopGuardTripped) return;
    if (!reserveReloadSlot()) {
      loopGuardTripped = true;
      pendingReload = false;
      stopTickPolling();
      showLoopGuardToast();
      return;
    }
    pendingReload = false;
    stopTickPolling();
    try {
      console.log('🪼 Jellyfin Enhanced: AutoReload — admin config changed, reloading client.');
    } catch (_) { /* noop */ }
    location.reload();
  }

  function tick() {
    if (!pendingReload) return;
    if (isPlayingMedia()) return;
    if (isIdle()) performReload();
  }

  function onActivity() {
    lastInputAt = Date.now();
  }

  function onViewShow(e) {
    if (!pendingReload) return;
    if (isPlayingMedia()) return;
    var view = e && e.target;
    if (view && view.id === 'indexPage') performReload();
    else if (isOnHomePage()) performReload();
  }

  JE.AutoReload = {
    init: function () {
      if (!JE.pluginConfig || JE.pluginConfig.AutoReloadOnConfigChange !== true) return;
      if (!JE.HotReload) return;

      ['mousemove', 'keydown', 'touchstart', 'wheel', 'pointerdown'].forEach(function (evt) {
        window.addEventListener(evt, onActivity, { passive: true });
      });

      JE.HotReload.on('config', function () {
        var elapsed = Date.now() - bootedAt;
        if (elapsed < INITIAL_GRACE_MS) return;
        if (loopGuardTripped) return;
        if (pendingReload) return;
        pendingReload = true;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(tick, POLL_INTERVAL_MS);
        requestAnimationFrame(tick);
      });

      document.addEventListener('viewshow', onViewShow);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') onActivity();
      });
    },
    _state: function () {
      return {
        pendingReload: pendingReload,
        idle: isIdle(),
        playing: isPlayingMedia(),
        loopGuardTripped: loopGuardTripped
      };
    }
  };
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
