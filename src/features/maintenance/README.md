# Maintenance mode

Owns maintenance policy, administration API, persisted defaults and dashboard controls.

The prelogin banner is composed by host bootstrap from public configuration. Keep access restrictions and public status behavior aligned.

## Find the implementation

| Directory | Responsibility |
| --- | --- |
| [api/](api/) | HTTP routes, authorization, binding and payloads; start with [MaintenanceController.cs](api/MaintenanceController.cs) |
| [server/](server/) | Application behavior, feature-owned state, transport and policy |
| [settings/](settings/) | Persisted properties plus dashboard sections, scripts and styles |

## Registration and validation

[feature.json](feature.json) lists owned browser sources and named prerequisites, other embedded assets, and any private startup source. Existing delivery aliases and historical load order live in host compatibility files; ordinary module additions need only their source and dependencies here. Named startup functions are called explicitly by `src/host/bootstrap/feature-startup.js`. Do not edit generated global indexes.

[MaintenanceFeature.cs](MaintenanceFeature.cs) owns backend registration phases; `src/host/FeatureRegistration.cs` invokes them in the established order.

Whole-plugin API/configuration/resource contracts cover this feature through `tests/compatibility/`. Add focused behavior tests in `tests/` here when changing feature behavior; do not place them in another feature.

Run `npm run generate` after asset/settings composition changes and `npm run check` before handing off. See [CONTRIBUTING](../../../CONTRIBUTING.md) and the [feature map](../../../docs/advanced/feature-layout.md).
