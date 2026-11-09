# Step 9 log: backend S2.14 → S2.15, merged, re-gated, full HOST smoke (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 9, gates BE/INV/TOOL (+H), BROWSER at the merge, HOST, Rollback, Definition of done; [backend.md](../backend.md) §1–§4 (S2.14, S2.15 rows and the post-S2.15 smoke test), §6, §7 (incl. §7.7 PublicApi / policy / shared-infrastructure rules, §7.8 scheduled-task namespaces); [step8-backend.md](step8-backend.md) "Notes for S2.14 / S2.15"; [step8.md](step8.md) HOST procedure. Coordinator decisions: D3 (S2.14 Shared placements), D4 (S2.15 trim + resolutions, no Platform wildcard), option A (feature-neutral shared infrastructure → `Shared/<Area>/`, after the stop below). Previous step: [step8.md](step8.md).

Machine: Lenovo worker, main checkout. One dotnet build/test at a time, gates in the foreground (the second `browser` run hit the tool's 600 s foreground limit, kept running in the background and was waited on before this log was committed). Node 26.2.0 (`/home/jake/.local/opt/node-v26.2.0-linux-x64/bin`) first on PATH. `JE_UPDATE_SNAPSHOTS` never set. 192.168.0.84 never contacted.

## Commits

Branch `restructure/be-s2-d` from `restructure/integration` `2abd5e3d`:

| Step | Commit | Content |
|---|---|---|
| S2.14 prep | `82f8c9b4` | §7.7 "first": pure renames (namespace + `using` lines). `Shared/Parental/`: `SeerrParentalFilter` (policy service injected into Downloads; still registered in `PluginServiceRegistrator` where it was) with its stateless decision helpers `ParentalRatingDecision`, `ParentalTagDecision`, `SeerrCertificationExtractor`, `SeerrTagSignatureExtractor` (used only by the filter). `Shared/Seerr/`: `SeerrHttpHelper` (+ `SeerrError`, `SeerrErrorCode`), `SeerrRequestOutcome` (+ `SeerrRequestOutcomes`, `SeerrProxyErrorResponse`; `SeerrError.ToProxyErrorResponse` uses them), `JellyseerrPermission`, `JellyseerrPermissionHelper`, `JellyseerrUser`. `Shared/Tmdb/`: `WatchProvidersBatch`. Path readers: `tests/runner/mutations.py` (`blocked-tags-precedence` `file`), `tests/docs/coverage-matrix.md`, `docs/rewrite/seerr-proxy-outcomes.md`. |
| S2.14 pre-move | `9f6fd391` | D3: `SeerrUserLookup` and `SeerrCaches` (with `TmdbEnrichmentResult` and the *arr queue/history caches) → `Shared/Seerr/` (pure renames). |
| — | — | **Stop (first attempt):** with Seerr's namespace changed, FeatureBoundaryTests had 9 MediaTags → Seerr findings, all `TmdbResponseCache`/`TmdbResponse` (4 MediaTags services receive it through DI; the MediaTags controller calls its static `IfNoneMatchMatches`). Stateful, so not Shared under the rules then; a PublicApi forwarder would have needed new DI registrations. Stopped at `9f6fd391` and reported; the experiment was saved as a patch and discarded. **Coordinator: option A.** |
| S2.14 pre-move | `1af59722` | Option A: `TmdbResponseCache` (+ nested `TmdbResponse`) → `Shared/Tmdb/` (pure rename; registration line unchanged). New rule written into backend.md §7.7 and CHANGELOG S9-a, S9-b. |
| S2.14 | `afb73ff2` | `Features/Seerr/JeSeerrController.cs` + partials `.Status/.Requests/.Discover/.Users/.Tmdb/.Issues.cs` (details below). `Features/Seerr/Services/**` → `Features.Seerr.Services`; the 3 Seerr task types keep `…ScheduledTasks`. Forwarders `ClearAllSeerrCachesOnConfigChange` and `ClearUserCaches` removed: `JellyfinEnhanced.cs`, `JellyseerrUserImportTask` and the tests call `Shared.Seerr.SeerrCaches` directly. PublicApi: `SeerrApi.Status.{TryBuildSeerrUserStatusWithoutLookup, SeerrStatusResponse}` (Platform bootstrap; both `private` → `internal` on the controller) and `SpoilerGuardApi.AutoEnableFilter.AllowsType` (the Seerr request hook; D4 names this forwarder, needed one step early because the call moved with Seerr). `AddJeSeerr()` at the first Seerr registration line. Seerr enforced in FeatureBoundaryTests. `tests/history/backend-mutations.json` `StripAdvancedRequestOptions` anchor → `Features/Seerr/JeSeerrController.cs` (anchor text unchanged). Tests moved (below). |
| S2.15 prep | `58a53dfe` | D4 step 1: removed the 27 old-controller fields that appeared only in their declaration and assignment, and the 23 constructor parameters that only fed them (`sessionManager` stays: it builds `ActiveSessionsService`). Test harness: `ApiAssetTests.SiblingOf<T>(controller)` rebuilds a feature controller from the fixture and services recorded when `ApiAssetTests.Controller(...)` built the controller (a `ConditionalWeakTable`), not from the main controller's fields. Every feature constructor parameter type was a parameter of the old main constructor, so each sibling receives the same instances as before; the field-based path stays for controllers built another way. |
| S2.15 pre-move | `f8fc92ac` | D4 step 2 (pure renames, registrations unchanged): `MaintenanceModeService` (+ `MaintenanceState`) → `Shared/Maintenance/` (policy service; still in `AddJeAdmin()`), `ActiveSessionsService` → `Shared/Sessions/`, `HiddenContentDocumentService` → `Shared/HiddenContent/`, `HostCompatibilityService` → `Shared/Host/` (shared infrastructure: Admin + Platform). Static PublicApi forwarders `MediaTagsApi.LeavingSoon.Configured` and new `BookmarksApi.Documents.Read`. Path readers: `docs/advanced/project-structure.md`, `tests/docs/coverage-matrix.md`. |
| S2.15 | `951a3496` | `git mv Controllers/JellyfinEnhancedController.cs Features/Platform/JePlatformController.cs`; class and constructor renamed, namespace `Features.Platform`, the 18 Platform route bodies unchanged. **`Controllers/` is gone.** `Features/Platform/**` → `Features.Platform.{Services,Models}`; `AnalyticsReportTask`/`RefreshCdnAssetsTask` keep `…ScheduledTasks`, and **`StartupService` keeps `Jellyfin.Plugin.JellyfinEnhanced.Services`** (it is the "Jellyfin Enhanced Startup" scheduled task, §7.8; see HOST). `UsageEventCounterService` → `Shared/Analytics/` (shared-infrastructure rule), static forwarders `MediaTagsApi.TagStyles.{ParseIsEmpty, NormalizePreset}` and `MediaTagsApi.NativeClients.BuiltInWebClients`. `AddJePlatform()` at `StartupService`'s line. Platform enforced. Tests moved (below). backend.md §7.7/§7.8 and CHANGELOG S9-c, S9-d. |
| S2.15 follow-up | `02eb5fd8` | Removed 18 stray `using …Features.Platform;` lines that the S2.15 rename script had added to files whose only mention of the old controller was a provenance comment (the comments were restored, the usings were not). Using lines only. |

Merge: **`9a7177ba`** `merge: restructure step 9 (S2.14–S2.15)` (`--no-ff`). A first merge `6fb2af18` (without `02eb5fd8`) was gated (`all`, `browser`) and HOST-checked; after the stray usings were found it was replaced locally (never pushed: `git branch -f restructure/integration 2abd5e3d`, then the merge above) and `all` and `browser` were rerun on `9a7177ba`. The plugin DLL built from `9a7177ba` and from `6fb2af18` have the same size and differ only in build metadata (577 bytes: the commit SHA in `AssemblyInformationalVersion`, the PDB path and ids), so the HOST evidence below applies to `9a7177ba`.

No tags, nothing pushed, no attribution lines.

## Gates

Every commit: `python3 tests/inventory/generate.py` (step action), `r <old names/paths>`, `be` (B, G, T ∥ frontend suite, rest of F, INV, TOOL) under `env -u JE_UPDATE_SNAPSHOTS`; `h` on S2.15 and its follow-up (S2.15 and `02eb5fd8` edit `tests/poster/parity/PosterTagParity/Program.cs`; S2.14 moves no MediaTags/PosterTags namespace).

`be` tail, identical for every commit and both merges:
```
1 Warning(s)                         (the baselined CS8604, Features/Bookmarks/JeBookmarksController.cs(50,45))
G: Passed!  - Failed: 0, Passed: 11, Skipped: 0, Total: 11
T (dotnet test): total 3193 (baseline 2980), passed 3192 (baseline 2979), failed 1 (baseline list 1)
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
Production inventory is current …; INV route list: no diff; tooling: passed; TOOL path check: no new line
restructure-gates: be passed
```
`h`: 3 harness builds 0 errors, `ResolutionData.g.cs is up to date.`, `restructure-gates: h passed`.

Two first runs failed and were fixed before the commit was final (amended, then `be` rerun green):
- **S2.14, INV:** `Inventory is stale` — `SpoilerGuardApi.cs` was added after the regeneration. Regenerated.
- **S2.15, F `contracts:check`:** `tools/ClientContracts` compiles `Configuration/PluginConfiguration.cs` and `Features/Platform/Models/AnalyticsData.cs` by path, and the rename script had added `using …Features.Platform.Services;` to both because their doc comments mention `AnalyticsReportingService`. Removed every comment-only using the script added in that commit.

Merged tree `9a7177ba`:

| gate | result |
|---|---|
| `restructure-gates.sh all` | **PASS** (same B/G/T/npm numbers; INV, TOOL, FE G passed; `component-scripts.json` and `client/entries` output keys match restructure-base; working tree clean afterwards) |
| `restructure-gates.sh browser` | **PASS**, see below |

BROWSER: on `6fb2af18` **PASS** first run, 693 tests at 6 workers: 638 passed, 52 failed (exactly `baselines/browser-failures.txt`), 3 skipped, 8.5 min, no "listed but did not fail" note. On `9a7177ba`: **PASS** first run, 638 passed, 52 failed (exactly the list), 3 skipped, 8.4 min, no note. The known flakes (`ApiSeerrProxyOutcomeTests.RealSocketWriteOnAReusedConnectionIsSentOnce`, `discovery-recommendations-rewrite.spec.cjs:70`, `tag-fit-monotonic.spec.cjs:93`) did not fail in any run. No baseline changed.

**Snapshots unchanged:** `git diff 2abd5e3d 9a7177ba -- tests/backend/Architecture/*.snapshot.json` is empty (route/auth, auth-helper, registration). `JE_UPDATE_SNAPSHOTS` never set. `baselines/build-warnings.txt` unchanged (the CS8604 is still in Bookmarks). Route list: 202 routes, 12 anonymous, equal to `baselines/inventory-routes.txt`.

**FeatureBoundaryTests** (merged tree): 240 types in `Features.*`, 7 edges, **0 findings**, every feature enforced (`… DetailsProviders, SpoilerGuard, Seerr, Platform`). Edges: `MediaTags -> DetailsProviders` and `SpoilerGuard -> MediaTags` (existing allow-list), and five `(PublicApi)` edges: `Platform -> Bookmarks`, `Platform -> MediaTags`, `Platform -> Seerr`, `Seerr -> SpoilerGuard`, `Settings -> MediaTags`. **Platform wildcard (D4):** also run with the `"Platform": ["*"]` allow-list entry deleted (local check, not committed): still 0 findings, so nothing relies on it. The entry is left in the JSON (now unused, like `SpoilerGuard -> HiddenContent`). No allow-list entry added; the controller rule is unchanged.

**Verbatim:** the Seerr partials are byte-for-byte cuts of the old controller's blocks (L103–118, L201–2874, L3672–3895, L4200–4261, L4273–4277, L4285–4312 and the top-level `TmdbPersonData`), plus the two `private` → `internal`, the `SpoilerGuardApi` call and the class/constructor head. `JePlatformController` differs from the trimmed old controller only in the namespace, class/constructor name, `using` lines, re-qualified `Features.Platform.Services.*`/`Shared.Analytics.*` names and the `MediaTagsApi.TagStyles.*` calls. Moved Shared files differ only in namespace/`using` lines. `ClientScriptBundle.cs` changed only its namespace line (bundle rule (b)(2)).

## Routes moved and controller removal

| Controller | Routes | Lines |
|---|---:|---:|
| `Features/Seerr/JeSeerrController.cs` (fields, ctor, proxy core, polling-log dedup) | 0 | 735 |
| `JeSeerrController.Status.cs` (status, validate, recently-added scan, user-status, permission-audit) | 5 | 493 |
| `JeSeerrController.Requests.cs` (search, sonarr/radarr, settings/{type}, {type}/{serverId}, request POST/GET, quota) | 10 | 466 |
| `JeSeerrController.Discover.cs` (tv/movie details, collections, similar/recommendations/ratings, discover*, studio/boxset/person/people/genre info, Seerr person, genre/keyword discover, tmdb search/genres, genre sliders, overrideRule, collection) | 39 | 985 |
| `JeSeerrController.Users.cs` (user list, TV seasons request, watchlist, sync-watchlist, import-users, partial-requests, tmdb/validate) | 7 | 393 |
| `JeSeerrController.Tmdb.cs` (`tmdb/{**apiPath}`, `watch-providers`; `TmdbPersonData`) | 2 | 293 |
| `JeSeerrController.Issues.cs` (`jellyseerr/issue` GET/POST, `issue/{id}`) | 3 | 125 |
| `Features/Platform/JePlatformController.cs` | 18 | 1,401 |

Seerr 63 + Platform 18 = the 81 routes the old controller had. Every partial is under the 1,200-line cap. `JePlatformController` (1,401) is over it (report-only until S3): add it to the §7.9 S3 split list (e.g. `.Bootstrap`/`.Assets`).

**`JellyfinEnhancedController` is deleted.** `Jellyfin.Plugin.JellyfinEnhanced/Controllers/` no longer exists; no type, `typeof`, path or namespace reference remains. The repointed `typeof(JellyfinEnhancedController)` lookups: `ApiAssetTests.Controller(fixture, …)` (asset helper) and `BootstrapContractTests` (`GetBootstrap`) now use `JePlatformController`. `docs/advanced/api.md` (controller paragraph), `docs/advanced/project-structure.md`, `tests/docs/coverage-matrix.md`, two stale code comments (`MdblistService`, `SpoilerTagDataStripper`) and the `PosterTagParity` comment point at the new controllers. Remaining mentions of the name are history only: 14 "moved verbatim from JellyfinEnhancedController" provenance comments in plugin code, one in `ApiRoutingTests`, the `manifest.json` changelog, and three frontend-owned comments in `client/src` (`features/downloads/render-cards.ts`, `features/media-tags/admin/admin-tags.ts`, `features/shared/helpers.ts`) with their built `js/**` maps — left for the step-12 path sweep, because editing them would change the bundle in a backend-only span.

Tests moved: `ApiSeerrTests`, `ApiSeerrProxyOutcomeTests`, `SeerrCsrfHandlerTests`, `TaskSeerrSyncTests`, `TaskAutoRequestTests`, `IntegrationTmdbTests`, `IntegrationCompanyDiscoverTests` → `tests/backend/Features/Seerr` (`JE.Tests.Features.Seerr`); `ApiCdnRefreshTests`, `ApiMiddlewareTests`, `BootstrapContractTests`, `CoreUsageTests`, `IntegrationAnalyticsTests` → `tests/backend/Features/Platform` (`JE.Tests.Features.Platform`); `SeerrRequestOutcomeContractTests`, `IntegrationWatchProvidersTests`, `CoreHostCompatibilityTests` → `tests/backend/Shared` (namespace `JE.Tests`, as `UrlPolicyTests`). `tests/history/early-triage.json` paths rewritten in place. `ApiAssetTests` stays in `tests/backend/Api` (namespace `JE.Tests`): it is the shared controller helper, and its baselined failure (`JE.Tests.ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder`) would change identity under a new namespace. Seerr tests drive `JeSeerrController` directly; `ApiSeerrTests` gained a `SpoilerGuard()` fixture helper (same pattern as its `Calendar()`/`Downloads()`). Total dotnet test count unchanged (3193).

## Cross-feature resolutions (backend.md §7.7)

| Reference | Resolution | Rule |
|---|---|---|
| Downloads controller → `SeerrParentalFilter` | `Shared/Parental/` (+ its 4 decision helpers) | policy service (D3) |
| Downloads, Admin, DetailsProviders controllers; MediaTags `StatusTagsTrendingService` → `SeerrHttpHelper`, `SeerrError*` | `Shared/Seerr/` | stateless helper / DTO (D3) |
| Downloads → `JellyseerrPermission*`, `JellyseerrUser` | `Shared/Seerr/` | DTO / stateless (D3) |
| Downloads → `SeerrUserLookup`, `SeerrCaches` (`TmdbEnrichmentResult`, *arr caches) | `Shared/Seerr/` | D3 |
| MediaTags services/controller → `TmdbResponseCache` | `Shared/Tmdb/` | shared infrastructure (option A) |
| MediaTags `TagLogoService`, `MediaTagsPageFields`, Configuration → `WatchProvidersBatch` | `Shared/Tmdb/` | stateless |
| Seerr controller → `SpoilerAutoEnableFilter.AllowsType` | `SpoilerGuardApi.AutoEnableFilter.AllowsType` | static PublicApi (D4) |
| Platform bootstrap → Seerr user/status helpers | `SeerrApi.Status.*` | static PublicApi |
| Platform → `LeavingSoonService.Configured`, `TagStyleSet`/`TagStyleKeys`, `NativeClientPolicy.BuiltInWebClients` | `MediaTagsApi.{LeavingSoon, TagStyles, NativeClients}` | static PublicApi (D4 + same pattern) |
| Platform → `BookmarkDocumentService` | `BookmarksApi.Documents.Read` | static PublicApi (D4) |
| Platform → `ActiveSessionsService`, `HiddenContentDocumentService` | `Shared/Sessions/`, `Shared/HiddenContent/` | pure rename (D4) |
| Platform → `MaintenanceModeService` | `Shared/Maintenance/` | policy service (D4) |
| Admin controller, Platform → `HostCompatibilityService` | `Shared/Host/` | shared infrastructure (option A) |
| HiddenContent `ContinueWatchingPlaybackConsumer`, Platform → `UsageEventCounterService` | `Shared/Analytics/` | shared infrastructure (option A): stateful, received through DI by two features, counts usage for every feature |
| Settings → `SpoilerBlurImageFilter.SpoilerBlurFileName` | no change needed | a `const`, compiled inline; never a finding (step 8 decision 8) |
| Platform `StartupService` → monitors of Seerr, MediaTags, Activity, Admin | no change needed | `StartupService` keeps its legacy namespace (scheduled task), so it is outside `Features.*` |

Registrations: `AddJeSeerr()` and `AddJePlatform()` hold only their features' lines, in original order; every Shared service stays registered exactly where it was (`TmdbResponseCache`, `SeerrParentalFilter`, `UsageEventCounterService`, `HostCompatibilityService` in `PluginServiceRegistrator`; `MaintenanceModeService` in `AddJeAdmin()`). `ScriptInjectionStartupFilter` is still registered before Chrome's `BrandingAssetStartupFilter`. The registration snapshot (multiset, per-type order, MVC filter order) is unchanged.

**Residuals for S3** (not findings; FeatureBoundaryTests checks only `Features.*` types):
- `Shared/Seerr/SeerrUserLookup` → `Features.Seerr.Services.JellyseerrUserImportHelper` (coordinator: known residual).
- `Shared/Analytics/UsageEventCounterService` → `Features.Platform.Models` (`UsageEventEntry`, `UsageCounterDiskFormat`); a doc-comment `using Features.MediaTags.Services`.
- `StartupService` lives in `Features/Platform/Services/` with namespace `…Services`: S3's `FolderNamespaceTests` exemption must cover `IScheduledTask` types outside `…ScheduledTasks` (backend.md §7.8, CHANGELOG S9-d). Today FolderNamespaceTests reports exactly the 15 scheduled-task files as mismatches.
- `JePlatformController` over the 1,200-line cap (above).
- Each `JeSeerrController.*.cs` partial carries a copy of the old controller's full `using` block (unused usings compile to nothing); trim in S3.
- `docs/advanced/project-structure.md`'s tree still shows `Helpers/Jellyseerr/` etc. (step-12 path sweep).

## HOST (full smoke, step-9 checkpoint)

- `scripts/restructure-gates.sh image`: `jellyfin/jellyfin:12.4 = jellyfin/jellyfin@sha256:b45218a461bf9663a4076d467e57f168ea54bc62bc20c7481ab43c4ba338575d`, passed.
- **Server:** `je up rs9host 18569 --image jellyfin/jellyfin:12.4 --no-warm` created the disposable `je-lab-rs9host` (golden lab snapshot, `127.0.0.1:18569`). Its own deploy build failed before touching the server, as at steps 1–8 (S1-d).
- **Plugin:** built from the merged checkout (clean, `6fb2af18`) with `dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf12 --no-incremental -o <scratch>`: 0 errors, 1 warning (the baselined CS8604), DLL sha1 `d3943ca9…`. Installed by hand as `je deploy` does: `docker stop`, DLL to `config/plugins/JellyfinEnhanced_12.8.0.0/` (sha1 identical), the skill's `meta.json`, `docker start`. `/health` Healthy and `public-config` 200 after 5 s.
- **Disposable-server config** (this container only, removed with it), set while it was stopped and before the plugin was installed or any page opened: `SonarrUrl`/`RadarrUrl` and both API keys emptied, `SonarrInstances`/`RadarrInstances` set to `Enabled=false` with empty URL/key (the golden snapshot points them at 192.168.0.84; the server's only earlier run, from `je up`, had no JE plugin installed); `ActivityFeedUseNativeTab`, `CatchUpEnabled`, `CatchUpUseNativeTab` true. No log line mentions 192.168.0.84. One bookmark for `real-admin` (*101 Dalmatians II*, 754 s, "HOST step 9 check") via `POST /JellyfinEnhanced/user-settings/{id}/bookmark.json/add`. Seerr: the lab `je-perf-real-seerr` (`127.0.0.1:18491`, another session's container, untouched) was up. Nothing was requested.

| Check | Result | Evidence |
|---|---|---|
| Plugin loads, no JE errors | **PASS** | Server log: `Jellyfin Enhanced v12.14.0.0 initialized`, `Loaded plugin: "Jellyfin Enhanced" "12.8.0.0"`, `Jellyfin Enhanced Startup Task run successfully` / `completed successfully`. 0 JE `[ERR]`/`[WRN]` in the server log; the JE plugin log (82 lines) has no error or warning. `GET /Plugins`: `Jellyfin Enhanced 12.14.0.0 Active`. Server `[ERR]` lines (17) are all lab data: missing `/tv/…/poster.jpg` for *Smoking Behind the Supermarket with You* and *Love, Death & Robots* (as at steps 1, 5, 8). Other warnings: StartupCheck health check, DataProtection key, `WebRootPath /wwwroot`. Browser: no JE console or page error. Failed requests: lab poster/Disc image 404s, `403` from `api.github.com/…/js/locales` (external rate limit), an HLS `otherError` (non-fatal) during playback. |
| Bundle check | **(a) PASS; (b) PASS, identical stable hash** | Served `GET /JellyfinEnhanced/bundle.js` (200, 4,428,836 bytes) and the in-process `restructure-gates.sh bundle` dump: stable `6e9cd2af…444d`, comment-stripped `e1e42dfc…6231`, identical. The span since step 8 has no frontend step, so rule (b) needs the identical stable hash: equal to the `step8` line. Both step-9 merges leave `js/` and `client/` unchanged (`git diff --quiet M^1 M -- Jellyfin.Plugin.JellyfinEnhanced/js client`); `ClientScriptBundle.cs` changed its namespace line only. Appended `step9 6e9cd2af…444d e1e42dfc…6231` to `baselines/bundle-checkpoints.txt`. |
| Admin page renders | **PASS** | `#/configurationpage?name=Jellyfin%20Enhanced`: v12.14.0.0, 14 section tabs (Overview … Docs). [step9-host-admin-page.png](step9-host-admin-page.png) |
| BUG-001 (admin Media Tags section) | **Unchanged** | Still "Loading Media Tags settings…" after 15 s, 0 `.je-tag-admin [role="tab"]`. Not investigated. [step9-host-admin-media-tags.png](step9-host-admin-media-tags.png) |
| User settings panel | **PASS** | `JE.showEnhancedPanel()`: 12.14.0.0, 11 tabs (shortcuts … about). [step9-host-settings-panel.png](step9-host-settings-panel.png) |
| Media Tags hub | **PASS** | `#jeMediaTagsHub` visible: Layout, Groups, Status badges, Rules & locks, Colours, Server (Admin). [step9-host-media-tags-hub.png](step9-host-media-tags-hub.png) |
| Media Tags poster | **PASS** | Movies library: 100 of 100 rendered cards have tag hosts. *101 Dalmatians II*: 1080p, WEB, H264, Dolby Digital+ 5.1, genre chips, 67 %, star 6.0. [step9-host-tagged-poster.png](step9-host-tagged-poster.png) |
| Details page (plan smoke test) | **PASS** | `#/details?id=…` *A Bug's Life*: renders with JE's styles/sections loaded (spoiler guard, more-info, mdblist ratings, people tags, awards, tag pipeline …). [step9-host-details-page.png](step9-host-details-page.png) |
| Hidden Content settings | **PASS** | Panel → Hidden Content: Enable Content Hiding, Show Hide Buttons, Show Confirmation Dialog, Hide Button Visibility. [step9-host-hidden-content-settings.png](step9-host-hidden-content-settings.png) |
| Bookmarks | **PASS** | Opened the way the sidebar item does (`JE.internals.bookmarksLibrary.showPage()`; this layout has no visible drawer at 1400 px): *101 Dalmatians II*, "1 bookmark(s)", the "HOST step 9 check" row at 12:34, Find Duplicates / Cleanup Orphaned / Delete All. A cold deep load or a bare hash change to `#/bookmarks` shows jellyfin-web's "Page not found" instead; the step-8 build (`2abd5e3d`, A/B on this server) does the same, so it is the navigation method, not this step. [step9-host-bookmarks.png](step9-host-bookmarks.png) |
| Calendar | **PASS** (no *arr) | `#/calendar`: Agenda/Day/Week/Month, "No upcoming releases", no `.je-calendar-error`. [step9-host-calendar.png](step9-host-calendar.png) |
| Downloads / BUG-003 | **Unchanged** | `#/downloads`: section headers render, 28 skeleton cards after 30 s. Data calls 200: `arr/queue` `{"items":[],"errors":[]}`, `arr/history` `{"items":[],"totalPages":0,"visible":true}`, `arr/requests` returns *Steven Universe*, `jellyseerr/issue` 0 results (as at step 8). Not investigated. [step9-host-downloads.png](step9-host-downloads.png) |
| Activity | **PASS** | `#/home?tab=3&jeTab=activity`: Active Streams ("No Active Streams"), Watch History, Reviews. [step9-host-activity.png](step9-host-activity.png) |
| Catch Up | **PASS** | `#/home?tab=2&jeTab=catchup`: Catch Up deck (Movies/Shows). [step9-host-catchup.png](step9-host-catchup.png) |
| Seerr discover | **PASS** | `#/search?query=Odyssey`: "Discover on Seerr" row, 37 cards (movie/series/collection). [step9-host-seerr-search.png](step9-host-seerr-search.png) |
| Seerr details | **PASS** | More Info modal for *The Odyssey* (2026): status, ratings (RT, IMDb, TMDB), facts table, links, overview, director/writers, cast, and the "Enable Spoiler Guard" toggle (the request hook's `SpoilerGuardApi` path is server-side; nothing was requested). [step9-host-seerr-details.png](step9-host-seerr-details.png) |
| Player OSD | **PASS** | *A Bug's Life* playing at `#/video` (`currentTime` 12.5 s, readyState 4), `#je-osd-rating-container` "92 % star 7.0", active-streams indicator present. [step9-host-player-osd.png](step9-host-player-osd.png) |
| Moved routes over HTTP | **PASS** | As `real-admin`: `version`, `jellyseerr/status` (`{"active":true}`), `jellyseerr/user-status` (linked, `canRequestAdvanced`), `jellyseerr/discover/trending`, `tmdb/genres/movie`, `jellyseerr/issue`, `arr/*`, `private-config`, `locales` all 200; `bootstrap` returns `Prefetched` and the bookmark snapshot (through `BookmarksApi`). Anonymous `jellyseerr/status` 401. `real-viewer` `private-config` 200 `{}` (the documented non-admin answer, body identical to restructure-base). |
| JE scheduled tasks, original names | **PASS** | `GET /ScheduledTasks`: 15 in "Jellyfin Enhanced"; the sorted multiset of 15 Keys + 15 Names equals the 30 `Key =>`/`Name =>` literals in `restructure-base` (`diff` empty). |
| Scheduled-task identity (§6 R7, §7.8) | **PASS** | `JellyfinEnhancedStartup` Id `246a7417a79b8e7b54849a6fe59734e7` = MD5(UTF-16) of `Jellyfin.Plugin.JellyfinEnhanced.Services.StartupService`; the namespace change S2.15 first made (reverted before commit) would have given `99b80b72fb3855135dc9a97238377db6` and reset the task's schedule and history. The three Seerr tasks (S2.14) and `AnalyticsReport` still find their last-result files from the golden snapshot (`data/ScheduledTasks/<id>.js`, dated 2026-09-25/26). |
| `/api-docs/openapi.json` | **PASS** | 200, OpenAPI 3.0.4, 474 paths, **180** under `/JellyfinEnhanced` (same as steps 1, 6, 7, 8). |

Screenshots: 1400×900 headless Chromium at scale 2, as `real-admin`, with the skill's `docs-shots.mjs` and scratch step scripts (not committed). Shots over 1.5 MB were scaled to 1400 px wide (as at step 8).

**Browser observation (not JE):** after the bare `location.hash = '#/bookmarks'` (jellyfin-web 404 view), a following deep load of `#/home?tab=3&jeTab=activity` threw `TypeError: Cannot read properties of undefined (reading 'classList')`. Its stack is entirely jellyfin-web (`main.jellyfin.bundle.js` `parentWithClass` ← tabs chunk ← `home` chunk), with `[Home] failed to get tab controller` as noted at step 8. It does not occur on a normal load of the same tab.

### Cleanup

- `je rm rs9host` removed `je-lab-rs9host` and `/home/jake/je-lab/rs9host` (with its *arr/tab config and the test bookmark). Confirmed: `docker ps -a --filter name=rs9host` empty, the directory gone, nothing listens on 18569, `curl 127.0.0.1:18569/health` cannot connect (exit 7).
- Container names, volumes (42) and networks (4) equal the snapshots taken before `je up`. The only running `je.lab=1` container afterwards is `je-lab-i1022`, another session's, which was already running before this step; it and `je-perf-real-seerr` were not touched.
- Temporary auth state removed: `.notes/tok-admin`, `.notes/.tok-admin.lock`, `.notes/tok-viewer`, `.notes/.tok-viewer.lock` (created by `je api`), `/tmp/je-docs/tools/state-real-admin-18569.json`. `.notes/` is back to `je.json` and `step1/`; `je.json` names `rs9host` as the last server (no credentials).
- Caches: this checkout's je build cache `~/.cache/je-lab/build/9fa5bbccb3f2` (from `je up`'s failed build) removed; the cache list equals the before snapshot.
- Scratch worktrees for the step-8 A/B build and the `6fb2af18` comparison build were removed (`git worktree list` shows only the main checkout); scratch plugin builds, bundle dumps and raw screenshots were deleted from the session scratchpad.
- The BROWSER fixture servers stopped with each run.

## Product bugs

**No new product bug.** BUG-001 (admin Media Tags section stuck on "Loading Media Tags settings…") and BUG-003 (Downloads page stuck on 28 skeleton cards) are unchanged and were not investigated.

## Deviations and decisions

1. **Stop and option A** (above): the first attempt stopped at `9f6fd391` on `TmdbResponseCache`; the coordinator chose option A and the new shared-infrastructure rule (backend.md §7.7, CHANGELOG S9-b). Under it this step also moved `HostCompatibilityService` and `UsageEventCounterService` (the latter not named by the coordinator; it meets every condition of the rule, see the resolutions table).
2. **`StartupService` keeps `Jellyfin.Plugin.JellyfinEnhanced.Services`** although its file is under `Features/Platform/Services/`: it implements `IScheduledTask`, and §7.8's reason applies to its original namespace, not only to `…ScheduledTasks` (CHANGELOG S9-d). Caught before committing S2.15; confirmed on HOST by the task Id.
3. **`SpoilerGuardApi` added in S2.14**, not S2.15: the `AllowsType` call is in the Seerr request route, so it became a controller → SpoilerGuard finding when Seerr was enforced.
4. **Extra placements beyond D3/D4** (approved after the stop): the parental decision helpers, `SeerrRequestOutcome*` and `WatchProvidersBatch`; plus the static forwarders `MediaTagsApi.TagStyles`/`NativeClients` (same pattern as D4's `LeavingSoon`).
5. **`ApiAssetTests.SiblingOf` harness change** (S2.15 prep): equivalent by construction (see the commit row); needed because D4's trim removes the fields it read.
6. **Re-merge** of step 9 to include `02eb5fd8` (local only, never pushed); `all` and `browser` rerun on the final merge.
7. **Platform wildcard:** unused and verified unnecessary, but left in `feature-dependencies.json` (removing an allow-list entry was not asked for).
