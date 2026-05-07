/**
 * JE bootstrap loader — served at /JellyfinEnhanced/web/bootstrap.js and
 * referenced from the rewritten /web/index.html response. Kept tiny so the
 * critical path stays fast; the heavy plugin script loads as a deferred
 * side-effect, version-pinned for cache friendliness.
 *
 * No external dependencies and no top-level await — must run on the same
 * browsers Jellyfin web supports.
 */
(function () {
  'use strict';

  if (window.__JE_BOOTSTRAPPED__) return;
  window.__JE_BOOTSTRAPPED__ = true;

  var current = document.currentScript;
  var src = current ? current.src : '';
  var version = '';
  var match = src.match(/[?&]v=([^&]+)/);
  if (match) version = match[1];

  var basePath = '';
  var pathIdx = src.indexOf('/JellyfinEnhanced/web/bootstrap.js');
  if (pathIdx > 0) {
    var origin = location.origin;
    var afterOrigin = src.indexOf(origin) === 0 ? src.slice(origin.length) : src;
    basePath = afterOrigin.slice(0, afterOrigin.indexOf('/JellyfinEnhanced'));
  }

  function load(url) {
    var s = document.createElement('script');
    s.src = url;
    s.defer = true;
    document.head.appendChild(s);
  }

  var versionParam = version ? ('?v=' + encodeURIComponent(version)) : '';

  load(basePath + '/JellyfinEnhanced/script' + versionParam);

  window.__JE_BASE_PATH__ = basePath;
  window.__JE_CONFIG_VERSION__ = version;
})();
