# Streaming availability browser ownership

Elsewhere keeps its existing public entry point and asset URLs. Supporting scripts register factories; initialization happens only when the feature is enabled. Register their sources and named prerequisites in the feature's [descriptor](../feature.json); the host compatibility alias map retains original URLs. Then run `npm run generate`.

| File | Responsibility |
| --- | --- |
| `elsewhere.js` | Feature gate, settings initialization, deferred startup, detail-page observer and insertion anchors |
| `elsewhere-settings.js` | Provider/region catalogs and fallback, per-user preferences, settings modal and autocomplete |
| `elsewhere-api.js` | TMDB streaming-provider requests and user-visible error mapping |
| `elsewhere-panel.js` | Provider badges, availability panels, branding and region search interactions |

The settings factory owns mutable state. Panel code reads its getters each time it renders or searches; do not destructure preference values into a snapshot. The `je:user-data-loaded` listener reloads those values after an SPA account change. The modal retains the established `elsewhere.json` save contract.

Run `node --test src/features/streaming-availability/tests/client/*.test.cjs` from the repository root. These controlled API/DOM tests cover account switching, catalog fallback, error mapping and entry-point wiring. Check modal interactions and live TMDB availability separately when relevant.

Review transport and UI belong to [reviews](../../reviews/README.md), even though both features historically shared the `js/elsewhere/` URL directory.
