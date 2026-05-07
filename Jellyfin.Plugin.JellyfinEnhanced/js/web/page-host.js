/**
 * JE.WebHost — registry of page renderers shared by the route hijacker
 * (standalone pages) and the tabs manager (home-page tabs).
 *
 * Each JE feature registers a render function that takes a host element and
 * mounts itself there. The same function is reused whether the feature is
 * shown as a tab or as a full page — that's the contract that lets us drop
 * Plugin Pages and Custom Tabs without losing any feature surface.
 */
(function (JE) {
  'use strict';

  if (JE.WebHost) return;

  var renderers = Object.create(null);

  JE.WebHost = {
    register: function (id, renderFn) {
      renderers[id] = renderFn;
    },
    has: function (id) {
      return Object.prototype.hasOwnProperty.call(renderers, id);
    },
    render: function (id, el) {
      var fn = renderers[id];
      if (typeof fn !== 'function') return false;
      try {
        fn(el);
        return true;
      } catch (e) {
        console.error('[JE WebHost] render failed for "' + id + '"', e);
        return false;
      }
    },
    ids: function () {
      return Object.keys(renderers);
    }
  };
})(window.JellyfinEnhanced = window.JellyfinEnhanced || {});
