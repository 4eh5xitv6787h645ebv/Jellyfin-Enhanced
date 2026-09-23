# Calendar

Owns the upcoming-media calendar, provider aggregation, calendar API, browser views, page adapters and settings.

ARR and Shoko inputs share a calendar contract but retain source identity. Preserve mixed-provider partial errors, restricted-content filtering and intentional duplicate entries.

## Find the implementation

| Directory | Responsibility |
| --- | --- |
| [api/](api/) | HTTP routes, authorization, binding and payloads; start with [CalendarController.cs](api/CalendarController.cs) |
| [server/](server/) | Application behavior, feature-owned state, transport and policy |
| [client/](client/) | Browser entry points, rendering, interactions and lifecycle |
| [settings/](settings/) | Persisted properties plus dashboard sections, scripts and styles |

## Registration and validation

[feature.json](feature.json) lists owned browser sources and named prerequisites, other embedded assets, and any private startup source. Existing delivery aliases and historical load order live in host compatibility files; ordinary module additions need only their source and dependencies here. Named startup functions are called explicitly by `src/host/bootstrap/feature-startup.js`. Do not edit generated global indexes.

Whole-plugin API/configuration/resource contracts cover this feature through `tests/compatibility/`. Add focused behavior tests in `tests/` here when changing feature behavior; do not place them in another feature.

Run `npm run generate` after asset/settings composition changes and `npm run check` before handing off. See [CONTRIBUTING](../../../CONTRIBUTING.md) and the [feature map](../../../docs/advanced/feature-layout.md).
