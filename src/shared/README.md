# Shared infrastructure

Keep feature behavior under `src/features/<feature>`. This directory holds the small set of
mechanisms used across feature boundaries:

| Directory | Responsibility |
| --- | --- |
| `identity` | Authenticated request/user resolution, display formatting, authorization helpers, and Jellyfin user-manager compatibility |
| `http` | Outbound URL safety policy and common integration diagnostics |
| `logging` | Plugin logging adapter |
| `persistence` | Shared per-user file access, Jellyfin repository and database compatibility helpers |
| `browser` | Navigation/session epochs, lifecycle handles, DOM observation, request coordination, UI and translation primitives |
| `assets` | Shared font resources |
| `localization` | Resource registration for translation JSON stored in root `locales/` |

The host under `src/host` owns plugin discovery, startup, registration, configuration access,
web injection, embedded assets, and events that connect otherwise separate features.
Feature folders own their APIs, application logic, models, event consumers, scheduled tasks,
and provider integrations. General source categories such as Controllers, Models, and
Services are no longer separate navigation roots.

Existing public C# namespaces and type names remain stable during the physical migration.
A file's namespace can therefore reflect its historical API location rather than its current
feature folder. Follow the physical feature boundary when choosing where to add code.

Cross-feature integrations stay with the feature whose behavior they implement. Pending
Spoiler Guard protection and Seerr promotion live in
`src/features/spoiler-guard/integrations/seerr`; Arr tag synchronization lives in
`src/features/tags/integrations/arr`. Seerr owns automatic movie/season requests and their
client caches in `src/features/seerr/server/auto-requests`.

Shared cache scope is an observable behavior. Preserve keys, TTLs, locking, cancellation,
negative caching, and configuration invalidation when moving or extracting an owner. The
Seerr cache owner still coordinates the existing merged download caches; per-user visibility
is applied after reading shared results. Monitors own their subscriptions and disposal.
Small collaborators generally share their owning service's lifetime.

Backend contract suites live in `tests/compatibility/api` and `src/features/<feature>/tests/server`.
Run the repository check command for both supported Jellyfin targets after changes involving
host APIs. Prefer tests around observable payloads, persisted snapshots, filtering decisions,
and HTTP behavior over tests coupled to private method placement.


Browser features own their actual state, subscriptions and initialization. Shared lifecycle handles track disposables; session resets synchronously clear outgoing-user state, and asynchronous consumers check session epochs before applying results. Tests for those primitives live in `browser/tests/`.

[feature.json](feature.json) lists shared sources and named module prerequisites. The host compatibility alias map preserves their established resource names and public paths. A historical `core/...` URL can therefore remain stable without retaining a global `js/core` source tree. Run `npm run generate` after descriptor changes.
