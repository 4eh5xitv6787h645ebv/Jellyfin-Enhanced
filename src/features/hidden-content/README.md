# Hidden content

Owns hidden-item defaults and storage contracts, server filtering, the management page and browser visibility controls.

The native-response filter and browser controls must agree on scope and user identity. Do not mutate a shared cached DTO when applying per-user visibility.

## Find the implementation

| Directory | Responsibility |
| --- | --- |
| [api/](api/) | HTTP routes, authorization, binding and payloads; start with [HiddenContentController.cs](api/HiddenContentController.cs) |
| [server/](server/) | Application behavior, feature-owned state, transport and policy |
| [client/](client/) | Browser entry points, rendering, interactions and lifecycle |
| [settings/](settings/) | Persisted properties plus dashboard sections, scripts and styles |
| [tests/](tests/) | Focused regression and behavior checks |

## Registration and validation

[feature.json](feature.json) lists owned browser sources and named prerequisites, other embedded assets, and any private startup source. Existing delivery aliases and historical load order live in host compatibility files; ordinary module additions need only their source and dependencies here. Named startup functions are called explicitly by `src/host/bootstrap/feature-startup.js`. Do not edit generated global indexes.

[HiddenContentFeature.cs](HiddenContentFeature.cs) owns backend registration phases; `src/host/FeatureRegistration.cs` invokes them in the established order.

Tests live in [tests/](tests/). Run `npm test` for Node cases and `npm run check:backend` for executable C# projects and compiled contracts.

Run `npm run generate` after asset/settings composition changes and `npm run check` before handing off. See [CONTRIBUTING](../../../CONTRIBUTING.md) and the [feature map](../../../docs/advanced/feature-layout.md).
