# Activity

Owns activity events, history storage, feed projection, API, browser page and settings.

ActivityStore retains its existing bounded history and atomic-write behavior. Favorite/playback event adapters belong here; host-wide event routing stays in host.

## Find the implementation

| Directory | Responsibility |
| --- | --- |
| [api/](api/) | HTTP routes, authorization, binding and payloads; start with [ActivityController.cs](api/ActivityController.cs) |
| [server/](server/) | Application behavior, feature-owned state, transport and policy |
| [client/](client/) | Browser entry points, rendering, interactions and lifecycle |
| [settings/](settings/) | Persisted properties plus dashboard sections, scripts and styles |
| [events/](events/) | Jellyfin event adapters |

## Registration and validation

[feature.json](feature.json) lists owned browser sources and named prerequisites, other embedded assets, and any private startup source. Existing delivery aliases and historical load order live in host compatibility files; ordinary module additions need only their source and dependencies here. Named startup functions are called explicitly by `src/host/bootstrap/feature-startup.js`. Do not edit generated global indexes.

[ActivityFeature.cs](ActivityFeature.cs) owns backend registration phases; `src/host/FeatureRegistration.cs` invokes them in the established order.

Whole-plugin API/configuration/resource contracts cover this feature through `tests/compatibility/`. Add focused behavior tests in `tests/` here when changing feature behavior; do not place them in another feature.

Run `npm run generate` after asset/settings composition changes and `npm run check` before handing off. See [CONTRIBUTING](../../../CONTRIBUTING.md) and the [feature map](../../../docs/advanced/feature-layout.md).
