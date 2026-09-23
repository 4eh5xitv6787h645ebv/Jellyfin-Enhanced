# Spoiler Guard

Owns spoiler opt-in, per-user protection state, image/metadata filtering, watched-state rules, browser controls and promotion of pending Seerr requests.

Preserve response-filter order, identity resolution and fail-open/fail-closed policy. The Seerr bridge lives in `integrations/seerr/`; image and metadata policy remain here.

## Find the implementation

| Directory | Responsibility |
| --- | --- |
| [api/](api/) | HTTP routes, authorization, binding and payloads; start with [SpoilerOptInController.cs](api/SpoilerOptInController.cs) |
| [server/](server/) | Application behavior, feature-owned state, transport and policy |
| [client/](client/) | Browser entry points, rendering, interactions and lifecycle |
| [settings/](settings/) | Persisted properties plus dashboard sections, scripts and styles |
| [events/](events/) | Jellyfin event adapters |
| [integrations/](integrations/) | Adapters to other features/providers |
| [tests/](tests/) | Focused regression and behavior checks |

## Registration and validation

[feature.json](feature.json) lists owned browser sources and named prerequisites, other embedded assets, and any private startup source. Existing delivery aliases and historical load order live in host compatibility files; ordinary module additions need only their source and dependencies here. Named startup functions are called explicitly by `src/host/bootstrap/feature-startup.js`. Do not edit generated global indexes.

[SpoilerGuardFeature.cs](SpoilerGuardFeature.cs) owns backend registration phases; `src/host/FeatureRegistration.cs` invokes them in the established order.

Tests live in [tests/](tests/). Run `npm test` for Node cases and `npm run check:backend` for executable C# projects and compiled contracts.

Run `npm run generate` after asset/settings composition changes and `npm run check` before handing off. See [CONTRIBUTING](../../../CONTRIBUTING.md) and the [feature map](../../../docs/advanced/feature-layout.md).

## Detailed ownership guides

- [server/README.md](server/README.md)

Follow the [setting-to-browser development walkthrough](../../../docs/advanced/spoiler-guard-development.md) for a concrete setting, endpoint, registration and test example.
