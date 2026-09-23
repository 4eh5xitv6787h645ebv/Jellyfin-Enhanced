# Active streams

Owns active session listing, the administrator broadcast API and the browser stream dashboard.

Preserve administrator gates and broadcast payloads. Session identifiers and display mappings are observable behavior; rendering and modal lifetimes remain separate.

## Find the implementation

| Directory | Responsibility |
| --- | --- |
| [api/](api/) | HTTP routes, authorization, binding and payloads; start with [SessionsController.cs](api/SessionsController.cs) |
| [client/](client/) | Browser entry points, rendering, interactions and lifecycle |
| [settings/](settings/) | Persisted properties plus dashboard sections, scripts and styles |
| [tests/](tests/) | Focused regression and behavior checks |

## Registration and validation

[feature.json](feature.json) lists owned browser sources and named prerequisites, other embedded assets, and any private startup source. Existing delivery aliases and historical load order live in host compatibility files; ordinary module additions need only their source and dependencies here. Named startup functions are called explicitly by `src/host/bootstrap/feature-startup.js`. Do not edit generated global indexes.

Tests live in [tests/](tests/). Run `npm test` for Node cases and `npm run check:backend` for executable C# projects and compiled contracts.

Run `npm run generate` after asset/settings composition changes and `npm run check` before handing off. See [CONTRIBUTING](../../../CONTRIBUTING.md) and the [feature map](../../../docs/advanced/feature-layout.md).

## Detailed ownership guides

- [client/README.md](client/README.md)
