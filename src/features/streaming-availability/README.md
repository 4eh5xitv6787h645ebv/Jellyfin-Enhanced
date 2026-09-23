# Streaming availability

Owns Elsewhere provider/region preferences, streaming availability transport/presentation and dashboard controls.

TMDB provider requests use the generic proxy in item-details/api/TmdbController.cs. Per-user Elsewhere persistence uses shared file mechanics; review behavior belongs to reviews.

## Find the implementation

| Directory | Responsibility |
| --- | --- |
| [client/](client/) | Browser entry points, rendering, interactions and lifecycle |
| [settings/](settings/) | Persisted properties plus dashboard sections, scripts and styles |
| [tests/](tests/) | Focused regression and behavior checks |

## Registration and validation

[feature.json](feature.json) lists owned browser sources and named prerequisites, other embedded assets, and any private startup source. Existing delivery aliases and historical load order live in host compatibility files; ordinary module additions need only their source and dependencies here. Named startup functions are called explicitly by `src/host/bootstrap/feature-startup.js`. Do not edit generated global indexes.

Tests live in [tests/](tests/). Run `npm test` for Node cases and `npm run check:backend` for executable C# projects and compiled contracts.

Run `npm run generate` after asset/settings composition changes and `npm run check` before handing off. See [CONTRIBUTING](../../../CONTRIBUTING.md) and the [feature map](../../../docs/advanced/feature-layout.md).

## Detailed ownership guides

- [client/README.md](client/README.md)
