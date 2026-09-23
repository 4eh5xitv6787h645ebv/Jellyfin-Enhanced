# Feature ownership and extension guide

Start with the feature you are changing under `src/features/`. Its HTTP API, server behavior, browser UI, dashboard controls, persisted settings and focused tests belong together. A feature's root `README.md` names its entry points and any cross-feature dependencies.

## Directory responsibilities

```text
src/
  JellyfinEnhanced.csproj
  host/                       Jellyfin plugin composition and delivery
  shared/                     Reusable infrastructure with multiple consumers
  features/
    <feature>/
      api/                    Routes, authorization, binding, responses
      server/                 Application behavior, state, transport and policy
      client/                 Browser rendering, interactions and lifecycle
      settings/               Persisted properties and dashboard source parts
      events/                 Jellyfin event adapters
      tasks/                  Scheduled operations
      integrations/           Connections to other features or host page systems
      tests/                  Focused behavior and regression checks
locales/                      Translation files (registration lives in shared/localization)
tools/                        Build, validation and common test/runtime harnesses
artifacts/generated/          Composed, checked-in delivery resources
tests/compatibility/          Whole-plugin contracts, not feature implementation tests
tests/runtime/                Optional disposable Jellyfin/browser harness
docs/                         User and developer documentation
```

Only create subdirectories that have an owner and content. A browser-only feature does not need empty API and server folders. Feature tests live with the feature; reusable harnesses and whole-plugin contract checks live under `tools/` or the corresponding host/shared owner; whole-plugin fixtures remain under `tests/compatibility/`.

## Choose a feature

| Directory under `src/features/` | Owns |
| --- | --- |
| `spoiler-guard` | Opt-in and per-user spoiler settings, image/metadata filtering, watched-state policy, browser toggles and Seerr promotion |
| `bookmarks` | Playback bookmarks, saved positions, bookmark library and associated settings |
| `hidden-content` | Hidden-item persistence, filtering, management UI and user defaults |
| `playback` | Playback commands, seeking/tracks/segments, pause/OSD behavior, continuation rules and player settings |
| `item-details` | General detail-page information, metadata chips and external detail links |
| `tags` | Poster tag renderers, quality policy, server tag projection/cache and tag settings |
| `ratings` | External rating and awards lookups, synchronization and display |
| `reviews` | User/TMDB review transport, persistence, forms and rating aggregation |
| `streaming-availability` | Elsewhere regions, providers, availability lookups and panels |
| `activity` | Activity history, events, persistence, feeds and browser page |
| `active-streams` | Active session listing, administrator broadcast and stream dashboard |
| `seerr` | Seerr connection, search/discovery/recommendations, requests, issues, watchlists and parental policy |
| `arr` | ARR instance connections, external links, tag synchronization and integration clients |
| `calendar` | Merged upcoming-media calendar, source adapters, filters and page integrations |
| `downloads` | Download/request management page, queue/history presentation and related routes |
| `appearance` | Themes, colors, branding, metadata/plugin icons, splash and login presentation |
| `navigation` | Shared feature-page integration, navigation shortcuts and entry-point placement |
| `user-settings` | User preference/shortcut persistence and the Enhanced settings panel |
| `maintenance` | Maintenance mode policy and dashboard controls |
| `analytics` | Consent, usage counting, analytics projection and scheduled reporting |

A feature can display data in another feature's UI without moving ownership of its data policy. Keep such connections explicit in the feature README and use `integrations/` for a substantial adapter. Do not recreate global `Controllers`, `Services`, `js`, or `settings` buckets to avoid choosing an owner.

## Host and shared boundaries

`src/host/` owns plugin composition, dependency injection, plugin-wide endpoints, web asset delivery, bootstrap, dashboard composition and compatibility with Jellyfin versions. It may invoke features in an explicit order. It should not become the home of unrelated feature behavior.

`src/shared/` holds primitives used by multiple features: authenticated request identity, HTTP transport support, browser navigation/session/lifecycle infrastructure and shared persistence mechanics. Feature-specific defaults, cache keys, policy and user-visible rendering remain in the feature. Explain the actual consumers before adding something to shared code.

Persisted models retain their original namespaces, property names, XML/JSON shapes and defaults. Feature-owned schema parts can compose the existing flat public model. A directory move is not a data migration and must not introduce a new nested configuration shape.

## Source locations and public URLs are separate

The source path describes ownership. The resource registration describes delivery. Existing URLs such as `/JellyfinEnhanced/js/enhanced/bookmarks/bookmarks.js` and the existing embedded configuration page names continue to work even though their source files have moved.

Register a browser source under `modules` in its feature's `feature.json`, naming only the prerequisites it needs. A source such as `client/policy.js` in Spoiler Guard gets the module ID `spoiler-guard/policy`. New scripts use a feature-based public path. Existing resource/public names stay in `src/host/compatibility/asset-aliases.json`, while `src/host/bootstrap/module-order.json` protects the historical component sequence; ordinary new modules do not need entries in either compatibility file.

A descriptor's `assets` lists other embedded sources, and `standalone` records specially loaded scripts and their loading reason. Embedding a non-script asset does not create a generic public endpoint. A `startup` source contains private named initialization functions called explicitly by the host's `bootstrap/feature-startup.js`.

Host/shared descriptors and `src/shared/localization/resources.json` cover infrastructure. `tools/build/build-assets.mjs` generates the delivery maps in `artifacts/generated/`; do not edit those indexes directly. Dashboard sources compose into the original page and stylesheet; bootstrap sources compose into the existing entry script. Generated files stay checked in so .NET-only consumers can still build the plugin.

Run `npm run generate` after changing composition inputs. `npm run check:static` checks registration, generation freshness, translations, syntax and browser/policy regressions. `npm run check:backend` checks both host targets, actual assembly resources and backend contracts. Use `npm run check` for the combined gate.

## Make a cross-layer change

For a bookmark feature change, open `src/features/bookmarks/README.md`, then work in its `api/`, `client/`, `settings/` and `tests/` as required. You should not need to search an unrelated feature to find bookmark-specific code. Shared storage or host composition can still need a coordinated change when a common contract changes.

For a new feature:

1. Choose one owner and add a root README explaining its public entry points, state, dependencies and validation.
2. Add only the API/server/client/settings/event/integration pieces it needs. Keep HTTP authorization and serialized contracts explicit.
3. Register feature-owned service phases with host composition and browser sources in the feature descriptor. Add an explicit host call if the feature needs startup. Register dashboard markup and settings factories with the dashboard composition. Defaults stay inline beside properties; expose browser-visible settings deliberately through the host public-configuration projection.
4. Put regression tests beside the feature. Reuse the common test helpers; keep whole-plugin contract fixtures separate from a feature's internal implementation tests.
5. Regenerate assets and run the relevant checks. Test actual navigation, user switching, playback or external integrations when the change affects those boundaries.

For a concrete existing feature, follow the [Spoiler Guard walkthrough](spoiler-guard-development.md), including every registration required for a new helper or initializer.

See [CONTRIBUTING](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/CONTRIBUTING.md) for concrete commands and the [project structure](project-structure.md) for composition entry points. The earlier [maintainability plan](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/docs/advanced/maintainability-plan.md) and [validation record](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/docs/advanced/maintainability-validation.md) in the repository are historical evidence for the first refactor, before this layout was introduced.

The [feature-layout validation record](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/docs/advanced/feature-layout-validation.md) tracks the earlier directory migration. The subsequent [composition simplification record](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/docs/advanced/simplification-plan.md) records the current dashboard, registration, defaults and tooling changes, review fixes and executed checks.
