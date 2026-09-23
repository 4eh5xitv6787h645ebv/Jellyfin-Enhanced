# Maintainability overhaul

> Historical record of the first maintainability pass. Its layer-based directory layout has been superseded by the [feature-first layout](feature-layout.md). Paths and executed checks below describe that earlier pass; they are not current build instructions or validation evidence for the later move.

## Objective and compatibility boundaries

Refactor revision `cfa35a78986fa692a940214010563c44a7270710` into cohesive,
discoverable components while retaining JE's behavior. API routes, authorization,
response contracts, configuration defaults and serialization, saved data, script
URLs and execution order, embedded resources, and both Jellyfin targets are
compatibility boundaries. This work stays local; it does not publish or deploy
to an existing server.

## Baseline

- Clean starting tree; no repository or ancestor `AGENTS.md` applies.
- Backend targets: `jf12` / .NET 10 (default), `jf10` / .NET 9.
- .NET SDK 10, Node 26, Python 3, and Docker are available locally.
- Initial `jf12` build: succeeds, zero warnings/errors.
- Initial `jf10` build: succeeds, zero warnings/errors.
- Initial translation validation: every locale passes.
- No existing executable regression suite. Existing CI primarily covers static
  security analysis, translations, documentation, and release-manifest checks.
- Main hotspots: controller (10,562 lines), configuration HTML (10,140), tag
  cache service (1,623), playback (1,500), discovery (1,416), parental filtering
  (1,393), spoiler filters (1,305–1,387), active streams (1,288), reviews (1,237),
  and bookmarks (1,231).
- Hidden dependencies: manually ordered script array, path-derived resource
  names, shared controller caches, configuration-page parsing by WhatsNewService,
  and frontend globals read during script evaluation.

## Intended organization

```text
Jellyfin.Plugin.JellyfinEnhanced/
  Controllers/              feature-focused HTTP endpoints
  Services/Api/             extracted endpoint application collaborators
  Services/                 feature services and focused policy/cache helpers
  Configuration/Page/       authoritative admin markup, scripts, and styles
  Configuration/configPage.* generated compatibility resources
  js/core/                  shared runtime primitives
  js/<feature>/             feature policy, data, presentation, and entry points
frontend/bootstrap/         private bootstrap source factories
frontend/module-manifest.json ordered module/dependency contract
scripts/                    dependency-light generation and validation commands
tests/                      behavior, contract, and disposable runtime checks
docs/advanced/              architecture, contributor recipes, validation record
```

Keep generated compatibility entry points checked in so building the plugin
still works with .NET alone. Generated-file checks make authoritative sources
and artifacts agree. Avoid moving already cohesive modules merely for symmetry.

## Work stages and ownership

1. **Baseline and plan (root):** record builds, architecture, compatibility
   boundaries, and available environments.
2. **HTTP decomposition (backend_controllers):** feature controllers, narrow
   dependencies, application collaborators, and preserved action contracts.
3. **Admin UI (configuration):** deterministic composition of coherent source
   sections, with configuration/load/save characterization.
4. **Client foundation (frontend_bootstrap):** explicit module manifest,
   bootstrap concerns, dependency/resource checks, and core tests.
5. **Client features (frontend_features):** player, bookmarks, tags, extras,
   and audit of already modular features.
6. **Client integrations (frontend_integrations):** Seerr, Arr, Elsewhere,
   reviews, and integration presentation/data boundaries.
7. **Backend services (backend_services):** cache/projection/filter policies,
   preserving concurrency and authorization behavior.
8. **Integration (root and runtime_validation):** both build targets, assembled
   artifacts, Docker smoke tests, browser checks, CI, documentation, and review.

Agents own separate files. Shared project configuration, service registration,
root tooling, CI, and primary documentation belong to root. New frontend
registrations go through the bootstrap owner. Builds sharing intermediate
directories run sequentially.

## Validation and acceptance

- Characterize changed behavior before risky extractions; exercise resulting
  collaborators rather than only testing source layout.
- Build both supported targets, check generated assets and ordered dependencies,
  validate route/auth and embedded-resource contracts, and run frontend/backend
  regression checks.
- Exercise disposable Jellyfin instances and controlled external-service
  substitutes. Record unavailable versions/services and untested live flows.
- Review integrated changes for behavior drift and stale documentation.
- Completion means all planned areas reviewed, identified structural work
  implemented, appropriate checks passing, and remaining limits documented.

## Progress

- [x] Starting revision and architecture recorded.
- [x] Initial default-target build passed.
- [x] Independent implementation owners assigned.
- [x] Baseline alternate-target and translation results recorded.
- [x] Backend controller and service work integrated.
- [x] Configuration and frontend work integrated.
- [x] Unified local checks and CI implemented.
- [x] Disposable runtime validation completed.
- [x] Contributor documentation and independent review completed.

Final unified local checks pass: 162 Node tests, eleven executable C# projects,
both release targets (zero warnings/errors), 149 HTTP action contracts, and
200 legacy resource names / 258 current resource payloads. The strict
documentation build also passes. See [validation record](maintainability-validation.md)
for evidence and explicit coverage limits. Baseline and final Docker/Chromium
runs passed on both hosts, including complete component delivery, settings-form
submission and persistence across an actual restart. All planned stages are
complete; changes remain local for review.
