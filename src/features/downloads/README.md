# Downloads and request management

Owns download queue/history routes, the request/download management browser page, page integration and settings.

Seerr owns requesting and upstream request identity; ARR owns its connection configuration. Keep the legacy `requests-page-*` browser filenames and JE.downloadsPage surface compatible.

## Find the implementation

| Directory | Responsibility |
| --- | --- |
| [api/](api/) | HTTP routes, authorization, binding and payloads; start with [DownloadsController.cs](api/DownloadsController.cs) |
| [client/](client/) | Browser entry points, rendering, interactions and lifecycle |
| [settings/](settings/) | Persisted properties plus dashboard sections, scripts and styles |

## Registration and validation

[feature.json](feature.json) lists owned browser sources and named prerequisites, other embedded assets, and any private startup source. Existing delivery aliases and historical load order live in host compatibility files; ordinary module additions need only their source and dependencies here. Named startup functions are called explicitly by `src/host/bootstrap/feature-startup.js`. Do not edit generated global indexes.

Whole-plugin API/configuration/resource contracts cover this feature through `tests/compatibility/`. Add focused behavior tests in `tests/` here when changing feature behavior; do not place them in another feature.

Run `npm run generate` after asset/settings composition changes and `npm run check` before handing off. See [CONTRIBUTING](../../../CONTRIBUTING.md) and the [feature map](../../../docs/advanced/feature-layout.md).
