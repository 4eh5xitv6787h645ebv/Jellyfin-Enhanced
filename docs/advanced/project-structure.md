# Project structure

Jellyfin Enhanced is organized by feature. Start under `src/features/<feature>/` to find that feature's API, server behavior, browser code, settings and tests. The [feature ownership guide](feature-layout.md) lists every feature and explains where a new change belongs.

## Composition map

| Location | Responsibility |
| --- | --- |
| `src/JellyfinEnhanced.csproj` | Plugin project and supported Jellyfin build targets |
| `src/host/Plugin.cs` | Jellyfin plugin entry point, configuration updates and page registration |
| `src/host/PluginServiceRegistrator.cs` | Jellyfin's DI discovery entry point |
| `src/host/FeatureRegistration.cs` | Explicitly ordered composition of feature-owned registrations and response filters |
| `src/features/<feature>/` | Feature API, behavior, UI, settings, adapters and focused tests |
| `src/host/api/`, `assets/`, `server/` | Plugin infrastructure endpoints, embedded asset delivery, startup and compatibility |
| `src/host/bootstrap/` | Browser namespace, loading/configuration stages and early startup coordination |
| `src/host/dashboard/` | Dashboard shell, cross-feature form lifecycle and source composition |
| `src/shared/` | Reusable identity, browser, HTTP, logging and persistence mechanisms |
| `locales/` | Translation files; resource registration is in shared localization |
| `tools/build/`, `tools/checks/`, `tools/testing/` | Generators, validation entry points and common test helpers |
| `artifacts/generated/` | Checked-in composed assets and resource/module mappings |
| `tests/compatibility/`, `tests/runtime/` | Whole-plugin contract fixtures and optional real-host/browser harness |

Only the host composes the plugin. Feature root `*Feature.cs` classes own their services, events, tasks and filters where needed; the host invokes their phases in the established order. Controllers stay with their feature under `api/`, while small reusable HTTP/identity mechanics live in shared code. Historical C# namespaces are retained where they are part of compatibility; use physical feature paths to navigate the implementation.

## Feature descriptors and delivery contracts

Each `src/features/<feature>/feature.json` registers feature-relative sources. `modules` maps a browser script to its named prerequisites; `assets` lists other embedded files; `standalone` maps specially loaded scripts to a loading reason. The optional `startup` points to private named initializers. Host/shared descriptors register infrastructure, and `src/shared/localization/resources.json` lists translation sources.

An ordinary `client/policy.js` module in Spoiler Guard has the ID `spoiler-guard/policy` and, absent a legacy alias, the URL `/JellyfinEnhanced/js/features/spoiler-guard/policy.js`. Consumers name that ID as a dependency. The host's `compatibility/asset-aliases.json` preserves existing delivery names; `bootstrap/module-order.json` preserves the existing component sequence. Neither is a registry to update for every new module. Dependency ordering inserts new prerequisites before their consumers, and checks reject missing or cyclic dependencies.

Source ownership remains independent from existing public URLs and resource names: moving bookmarks under `src/features/bookmarks/client/` does not rename `/JellyfinEnhanced/js/enhanced/bookmarks/bookmarks.js`. Embedding a non-JavaScript file does not itself create a public route; its page registration or asset endpoint remains explicit.

`tools/build/build-assets.mjs` composes `ResourceMap.props`, `resource-map.json` and `module-manifest.json` in `artifacts/generated/`. These are generated indexes, not authoring locations. The project uses explicit logical resource names rather than deriving them from feature-directory spelling. Feature IDs containing hyphens therefore do not alter delivery names.

```sh
npm run generate       # Regenerate descriptors' delivery maps, bootstrap and dashboard
npm run check:static   # Validate registrations, freshness, syntax, translations and Node tests
npm run check:backend  # Build both targets, inspect artifacts and run backend regressions
npm run check          # Combined gate
```

Use .NET SDK 10 and Node.js 22 or later. No npm dependency installation is required. The optional documentation and Docker/browser smoke tools also use Python 3. Generated outputs are committed so a .NET-only build remains available. See [CONTRIBUTING](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/CONTRIBUTING.md) for detailed extension and test instructions.

## Browser startup and state ownership

`src/host/assets/ScriptInjectionStartupFilter.cs` injects the established entry script. Host asset endpoints continue serving the original `/JellyfinEnhanced/script` and `/JellyfinEnhanced/js/{path}` routes from explicit embedded resources.

Private factories under `src/host/bootstrap/` create the namespace, load early/login assets, coordinate configuration and authentication readiness, and drive startup. Feature-owned `client/startup.js` files define ordinary named functions with feature-specific conditions. `src/host/bootstrap/feature-startup.js` calls them explicitly in the established order. The descriptor identifies the private source; it does not contain numeric startup steps. The build composes these sources into `artifacts/generated/plugin.js`; they are not extra runtime fetches.

Ordinary component scripts still download together and execute in declared order using `async = false`. After registration and user settings initialization, startup runs the enabled feature steps and sets `JE.initialized = true`. Keep order, readiness and failure behavior intact when editing descriptors or startup steps.

`src/shared/browser/` owns navigation, identity/session epochs, disposable resource handles, shared DOM observation, request coordination and UI primitives. Each feature coordinator owns its listeners, observers, timers, requests and state. Register synchronous user-data resets with `JE.session.onUserChange`; check the captured epoch before applying asynchronous results. `je:user-changed` announces the transition and `je:user-data-loaded` announces completed settings reloads.

## Settings and persistence

Feature-specific server and user settings live in the feature's `settings/` directory. Partial declarations preserve the original flat public configuration types, serialized names and defaults. Defaults sit beside the corresponding properties as initializers; no host constructor or defaults helper needs updating. The host configuration core preserves the public type identity and base type; shared persistence supplies common per-user file access. Review and activity stores remain with their features and retain their own write/locking policies.

Dashboard markup and behavior are also feature-owned: `settings/sections/` supplies controls, `settings/settings.js` supplies load/read/dependency behavior, with substantial editors in named neighboring modules, and `settings/styles/` supplies feature CSS. `src/host/dashboard/` composes them into the unchanged public dashboard page and stylesheet under `artifacts/generated/`. The host `scripts.json` lists complete source modules; `initialize.js` constructs them and composes their explicit operations. An ordered `featureSettings` array supplies load/read behavior and dependency rules. The shell owns tabs, submit/reset, fresh-configuration merging and whole-page lifecycle.

Read the [dashboard source guide](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/src/host/dashboard/README.md) before changing composition or state. Settings factories receive explicit operations from the host and retain the existing synchronous page composition. The host controls form lifecycle and save sequencing. Browser-visible configuration is deliberately projected by `src/host/api/ConfigurationController.cs`; server settings are not automatically exposed. See the [Spoiler Guard walkthrough](spoiler-guard-development.md) for the setting-to-endpoint-to-browser test path.

## Validation ownership

Tests for a feature live in `src/features/<feature>/tests/`; host/shared tests stay with those owners. Common browser/API adapters live in `tools/testing/`. Compatibility fixtures under `tests/compatibility/` cover routes, serialized defaults, original resources, configuration composition and plugin page integration across features.

The optional [runtime harness](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/tests/runtime/README.md) runs isolated Docker Jellyfin instances and optional Chromium checks. It does not replace actual playback or live provider checks when a change affects those boundaries. The first refactor's [plan](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/docs/advanced/maintainability-plan.md) and [validation record](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/docs/advanced/maintainability-validation.md) in the repository remain explicitly historical; they do not claim validation of the subsequent feature-first move.
