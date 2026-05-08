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
 * JE.pluginConfig.AutoReloadOnConfigChange. Crucially, the toggle is
 * re-read from the server inside the 'config' event handler, NOT at
 * init time — otherwise a client that loaded before the admin flipped
 * the toggle on would never auto-reload until it was refreshed once
 * manually, defeating the point on cross-device installs.
 */
(function (JE) {
  'use strict';

  if (JE.AutoReload) return;

  // Defaults that match Configuration/PluginConfiguration.cs constructor
  // values. Admins can override these on the Display tab → Live Updates →
  // Advanced timing. Effective values are read from JE.pluginConfig at
  // event time so a config change applies on the next reload cycle
  // without needing a separate fix-up step.
  var DEFAULT_IDLE_SECONDS  = 10;
  var DEFAULT_GRACE_SECONDS = 5;
  var DEFAULT_MAX_SECONDS   = 60;
  var POLL_INTERVAL_MS      = 2 * 1000;     // tick interval while a reload is pending — not user-tunable
  var RELOAD_LIMIT          = 3;
  var RELOAD_WINDOW_MS      = 60 * 1000;
  var RELOAD_LOG_KEY        = '__JE_AR_RELOADS__';

  function clampInt(v, def, min, max) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) return def;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }
  function idleThresholdMs() {
    var c = JE.pluginConfig || {};
    return clampInt(c.AutoReloadIdleSeconds, DEFAULT_IDLE_SECONDS, 0, 600) * 1000;
  }
  function initialGraceMs() {
    var c = JE.pluginConfig || {};
    return clampInt(c.AutoReloadGraceSeconds, DEFAULT_GRACE_SECONDS, 0, 600) * 1000;
  }
  function maxPendingMs() {
    var c = JE.pluginConfig || {};
    return clampInt(c.AutoReloadMaxWaitSeconds, DEFAULT_MAX_SECONDS, 5, 3600) * 1000;
  }

  var bootedAt = Date.now();
  var lastInputAt = bootedAt;
  var pendingReload = false;
  var pendingSetAt = 0;
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
    return (Date.now() - lastInputAt) >= idleThresholdMs();
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
      pendingSetAt = 0;
      stopTickPolling();
      showLoopGuardToast();
      return;
    }
    pendingReload = false;
    pendingSetAt = 0;
    stopTickPolling();
    try {
      console.log('🪼 Jellyfin Enhanced: AutoReload — admin config changed, reloading client.');
    } catch (_) { /* noop */ }
    location.reload();
  }

  function tick() {
    if (!pendingReload) return;
    if (isPlayingMedia()) return;
    var pendingFor = Date.now() - pendingSetAt;
    // Reload as soon as the user has been idle for the configured idle
    // threshold, OR force a reload after the configured max-wait — that
    // backstop ensures a phone user who keeps tapping the screen
    // eventually picks up the new settings instead of starving the
    // auto-reload indefinitely.
    if (isIdle() || pendingFor >= maxPendingMs()) performReload();
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

  // Re-check the toggle at event time, not at init time. A client that
  // loaded BEFORE the admin enabled AutoReloadOnConfigChange would
  // otherwise never see auto-reloads — its in-memory JE.pluginConfig
  // was captured at page load and doesn't change. We refresh the public
  // config from the server inside the handler so the toggle's *current*
  // state drives the decision.
  function fetchPublicConfig() {
    var base = window.__JE_BASE_PATH__ || '';
    var ApiClient = window.ApiClient;
    var url = (ApiClient && typeof ApiClient.getUrl === 'function')
      ? ApiClient.getUrl('JellyfinEnhanced/public-config')
      : base + '/JellyfinEnhanced/public-config';
    return fetch(url, { cache: 'no-store', credentials: 'include' })
      .then(function (r) { if (!r.ok) throw new Error('public-config ' + r.status); return r.json(); });
  }

  JE.AutoReload = {
    init: function () {
      if (!JE.HotReload) return;

      ['mousemove', 'keydown', 'touchstart', 'wheel', 'pointerdown'].forEach(function (evt) {
        window.addEventListener(evt, onActivity, { passive: true });
      });

      JE.HotReload.on('config', function () {
        var elapsed = Date.now() - bootedAt;
        if (elapsed < initialGraceMs()) return;
        if (loopGuardTripped) return;
        if (pendingReload) return;

        fetchPublicConfig().then(function (cfg) {
          // Refresh the in-memory copy so other JE features that read
          // JE.pluginConfig pick up the latest server state too.
          JE.pluginConfig = cfg;
          if (!cfg || cfg.AutoReloadOnConfigChange !== true) return;
          if (pendingReload) return; // re-check post-await
          pendingReload = true;
          pendingSetAt = Date.now();
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = setInterval(tick, POLL_INTERVAL_MS);
          requestAnimationFrame(tick);
        }).catch(function (err) {
          // Network blip — ignore this event; next config bump will retry.
          try { console.warn('🪼 Jellyfin Enhanced: AutoReload failed to refresh public-config:', err); } catch (_) { /* noop */ }
        });
      });

      document.addEventListener('viewshow', onViewShow);
      // Note: we deliberately do NOT treat visibilitychange as activity.
      // On mobile, the user's wakeup gesture (unlock + tap to focus the
      // app) fires touchstart and updates lastInputAt. Treating
      // visibility transitions as additional activity would push idle
      // out further, so a phone that just woke up would never reach the
      // idle threshold and never auto-reload.
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
