# Host composition

This directory connects feature-owned code to Jellyfin. Feature behavior belongs under `src/features/`; reusable mechanisms belong under `src/shared/`.

| Source | Owns |
| --- | --- |
| `Plugin.cs` | Plugin lifecycle, configuration updates and dashboard/feature page exposure |
| `PluginServiceRegistrator.cs`, `FeatureRegistration.cs` | Host discovery and ordered invocation of feature registration phases |
| [api/](api/README.md) | Plugin configuration, compatibility and asset endpoints |
| [assets/](assets/README.md) | Web injection, CDN resource catalog/cache and embedded asset delivery |
| `bootstrap/` | Browser namespace, configuration/session wiring, loading stages and early coordination |
| [dashboard/](dashboard/README.md) | Cross-feature dashboard shell, source composition and form lifecycle |
| `configuration/` | Flat configuration model construction and host-owned properties |
| `server/`, `events/`, `tasks/` | Startup, host compatibility and cross-feature adapters |
| [feature.json](feature.json) | Infrastructure sources and named module dependencies |

Feature registrations own their lifetimes and filters; `FeatureRegistration.cs` preserves their explicit call order. Filter post-processing can execute in reverse registration order, so moving a call is a behavior change even when its implementation is unchanged.

The generated bootstrap includes private feature `client/startup.js` sources declared in descriptors. `bootstrap/feature-startup.js` explicitly calls their named initializers; feature gates remain inside those functions. `compatibility/asset-aliases.json` and `bootstrap/module-order.json` preserve historical delivery names and module order, while new modules declare named prerequisites in their descriptors. The dashboard composes feature settings factories with explicit injected operations; its README describes the form lifecycle that remains shared.

Do not hand-edit generated resource/module indexes or delivery scripts. Run `npm run generate`, then the appropriate checks. Host-focused tests live alongside their owner; whole-plugin contracts remain under `tests/compatibility/`.
