# Step 5 log: backend S2.0a → S2.0b, merged, re-gated, HOST checked (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 5, gates BE, INV, TOOL and HOST; [backend.md](../backend.md) §2 (DI), §3 "Shared base", §4 Phase 2 rows S2.0a/S2.0b, §6, §8 briefs. Machine: Lenovo worker. One dotnet build or test ran at a time, in the foreground. The two sub-steps ran one after another on one branch in the main checkout.

## Commits

Branch `restructure/be-s2-0`, from `restructure/integration` `9b56c5b7`:

| Step | Commit | Content |
|---|---|---|
| S2.0a | `ca6b4e61` | New `Infrastructure/Http/JeControllerBase.cs` (abstract, no class-level attributes, namespace `…Infrastructure.Http`) with the three `protected readonly` fields `_logger`, `_userManager`, `_userConfigurationManager` and a three-parameter constructor. Moved verbatim as `protected`: `AuthorizeUserConfigAccess`, `AuthorizeUserAccess`, `IsAdminUser` (with its comment), `LoadRevisionedSettings`, `CreateReviewVisibilityContext` and `GetCurrentUserId`. `CreateSettingsDefaults` moved verbatim to static `Features/Settings/Services/SettingsDefaults.Create()`; `LoadRevisionedSettings` passes `SettingsDefaults.Create` (it was the only caller). `JellyfinEnhancedController : JeControllerBase`, `: base(userManager, logger, userConfigurationManager)`, and its own copies of the three fields deleted. Text-scraping tests: `features-admin-tags-page-overview-layout.test.mjs` repointed to `SettingsDefaults.cs` with a not-found guard (`start >= 0 && end > start`) and `copied.length >= 65` (65 measured before the move); `features-admin-config-schema.test.mjs` got the guard `a >= 0 && b > a && c >= 0 && d > c` and `expected.size >= 98` (98 measured before). Inventory regenerated (2 new files). |
| S2.0b | `f21f1d7c` | See "S2.0b extractions" below. Inventory regenerated (7 new files). |
| merge | `062c5200` | `merge: restructure step 5 (S2.0a–b)` (`--no-ff` into `restructure/integration`, no conflicts) |

`JellyfinEnhancedController.cs` went from 13,988 to 13,358 lines. No tags were created and nothing was pushed.

### S2.0b extractions

All bodies verbatim; only access modifiers and the noted call sites changed.
- **`Features/Seerr/Services/SeerrCaches`** (`internal static`): every static in the controller's Seerr header (`_avatarCache`, `_avatarCacheDuration`, `_userIdCache(+Lock)`, `_userCache(+Lock)`, `_responseCache(+Lock)`, `_lastManualImport`, `_importThrottleLock`, `_seerrStatusCache(+Lock, Ttl)`, `TryGetCachedSeerrReachability`, `_tmdbEnrichmentCache(+Lock)`, `_tmdbEnrichmentInFlight`, `GetResponseCacheTtl`, `GetUserIdCacheTtl`, `GetTmdbEnrichmentCacheTtl`, the `TmdbEnrichmentResult` DTO the cache is typed with), plus `ClearUserCaches` and `ClearAllSeerrCachesOnConfigChange`, plus the four *arr queue/history cache fields (`_arrQueueCache(+Lock)`, `_arrHistoryCache(+Lock)`), which `ClearAllSeerrCachesOnConfigChange` clears (§6 R3: a field used by several features goes to one static class in the owning feature; Downloads→Seerr is an allowed edge). `IsSeerrReachableCached` stays on the controller: it is an instance method that calls `ProbeJellyseerrStatusAsync`. The controller reads the caches through `using static …Services.SeerrCaches;`, so none of the ~90 cache references changed. Forwarders left on the controller: `public static ClearAllSeerrCachesOnConfigChange()` (7 test call sites + `JellyfinEnhanced.cs:399`) and `internal static ClearUserCaches()` (`JellyseerrUserImportTask.cs:101`).
- **`Shared/Library/UserDisplayResolver`**: `ResolveUserDisplay` (135 call sites → `_userDisplayResolver.ResolveUserDisplay(…)`).
- **`Shared/Arr/ArrInstanceClient`** (`internal sealed`): `WarnIfArrInstancesCorrupt` with its static dedupe set, `FetchAndMapAsync<T>` (needed by the two fetchers and 7 other controller callers), `SingleItemOrNull`, `FetchSeriesInfoFromInstance`, `FetchMovieInfoFromInstance`, static `GetRootFolderFromPath`, and the `ArrFetchOutcome` struct (top-level `internal` in the same file).
- **`Shared/Arr/ArrUrlGuard`**: the logging `IsAllowedUrl(string, Logger)` / `IsAllowedUrlAsync(string, Logger, CancellationToken)` overloads appended to the existing static class (`_logger.Error` → `logger.Error`, the only body edit). The mutation anchor in this file still occurs once (TOOL passed).
- **`Shared/Text/IsoDates.TryParseIso`** and **`Shared/Library/LibraryItemLookup.FindLibraryItemByTmdb`**.
- **`Infrastructure/Hosting/MvcFilterRegistration.AddJeMvcFilters()`**: the `Configure<MvcOptions>` block, verbatim, called where it was (last line of `RegisterServices`).
- **`Infrastructure/Hosting/EventConsumerRegistration.AddJeEventConsumers()`**: all 11 `IEventConsumer<…>` registrations, verbatim and in original relative order, called at the position of the first one (old L131). The "Auto-enable spoiler mode…" comment moved with its line.

## Gates

Per sub-step, on the tree that was then committed unchanged: `scripts/restructure-gates.sh inv`, `tool`, then `be`; all exited 0. `r 'CreateSettingsDefaults'` passed after S2.0a. H was not run: no MediaTags/PosterTags namespace moved (PLAN.md gate BE). `be` on the merged tree (`062c5200`), tail:
```
    1 Warning(s)                                         (the baselined CS8604; still in Controllers/JellyfinEnhancedController.cs, now L5744)
    0 Error(s)
G: Passed!  - Failed: 0, Passed: 11, Skipped: 0, Total: 11
T: Failed!  - Failed: 1, Passed: 3192, Skipped: 0, Total: 3193
T (dotnet test): total 3193 (baseline 2980), passed 3192 (baseline 2979), failed 1 (baseline list 1)
coverage-jf12: passed
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
Production inventory is current (this does not assert behavioral coverage).
== INV: route list vs artifacts/restructure-plan/baselines/inventory-routes.txt   (no diff)
Ran 16 tests ... OK
tooling: passed
restructure-gates: be passed
```
S2.0a and S2.0b each gave the same tail. The one dotnet failure and the 9 npm failures are the baselined ones. Test counts equal step 4's.

**Build-warning baseline.** The CS8604 moved from L6090 to L5899 (S2.0a) and L5744 (S2.0b) as code above it left the file. Its file did not change, and `baselines/build-warnings.txt` is keyed `<code> <file>` with no line, so gate B needs nothing (PLAN.md gate B). Not edited.

**Snapshots unchanged: yes.** `JE_UPDATE_SNAPSHOTS` was never set (`env | grep -c` = 0; every `be` ran under `env -u JE_UPDATE_SNAPSHOTS` and its `no_snapshot_updates` guard passed). G passed at every step. `git diff 9b56c5b7 062c5200 -- tests/backend/Architecture artifacts client/src Jellyfin.Plugin.JellyfinEnhanced/js` is empty, so `route-auth.snapshot.json`, `auth-helper-calls.snapshot.json` and `service-registrations.snapshot.json` are byte-identical, as are `baselines/**`. The auth-helper tolerance is exactly the plan's: helpers matched by name on any plugin `ControllerBase` type (so the moves into `JeControllerBase` are invisible), and the S2.0b extractions contain no helper calls, so following them or not changes no count.

## HOST (step-5 checkpoint)

- `scripts/restructure-gates.sh image`: `jellyfin/jellyfin:12.4 = jellyfin/jellyfin@sha256:b45218a461bf…` (passed).
- Server: `je up rs5host 18565 --image jellyfin/jellyfin:12.4 --no-warm` made the disposable `je-lab-rs5host` from the golden lab snapshot, bound to `127.0.0.1:18565`. As in step 1 (CHANGELOG S1-d), `je up`'s own deploy build failed before touching the server (clean clone without `node_modules`). The 192.168.0.84 real-media server and live installs were not used.
- Plugin: built from the merged checkout (clean tree, `062c5200`) with `dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf12 -o <scratch>`, 0 errors. Installed as `je deploy` does: stop the container, copy the DLL into `config/plugins/JellyfinEnhanced_12.8.0.0/` (sha1 `a2322fed…`, same as the build), write the skill's `meta.json`, start. `/health` Healthy and `public-config` 200 within ~6 s.

| Check | Result | Evidence |
|---|---|---|
| Plugin loads, no JE errors | **PASS** | Server log: `Loaded plugin: "Jellyfin Enhanced" "12.8.0.0"`, `Jellyfin Enhanced v12.14.0.0 initialized`, `Jellyfin Enhanced Startup Task completed successfully`. `GET /Plugins`: `Jellyfin Enhanced 12.14.0.0 Active`. JE plugin log: 26 lines, 0 ERR/WRN/exception. The server log's `[ERR]` lines are all Jellyfin core `Could not find file '/tv/…/poster.jpg'` for *Smoking Behind the Supermarket with You* and *Love, Death & Robots*, the same lab-data gap step 1 recorded (the plain image URL without JE's tag also 404s). Those two image 404s on home are the only HTTP errors in the browser. Other WRN lines: startup health check, DataProtection key, `WebRootPath /wwwroot`. |
| Bundle check | **PASS** | Rule (a): served `GET /JellyfinEnhanced/bundle.js` (200, 4,313,243 bytes) and the in-process `restructure-gates.sh bundle` dump on `062c5200` have the same hashes: stable `129fe7f3…6096`, comment-stripped `d77bd132…4d77f23`. Rule (b), against the `step1` line: the span (A0–A3, S2, B1, B2, P1, S2.0a–b) holds only backend steps, frontend pure moves that passed check O, and types/doc-only S2, so the comment-stripped hash must be identical, and it is (`d77bd132…4d77f23`, as step4.md note 4 predicted). The stable hash differs from step 1 (`533b5133…`) only through `// client/src/` comment lines, which that rule allows. The step-5 line was **not** appended to `baselines/bundle-checkpoints.txt` (see deviations): `step5 129fe7f398422e1b16ceb11424cc0d0568fa701be0ac2df45400922ea0ff6096 d77bd132a2663d92e72e9ccc3d858aff828daab604664b7b408535dcb4d77f23`. |
| Admin page renders | **PASS** | v12.14.0.0 header, section nav, What's New list. [step5-host-admin-page.png](step5-host-admin-page.png) |
| Media Tags hub renders | **PASS** | Settings panel → Media Tags: `#jeMediaTagsHub` visible with tabs Layout, Groups, Status badges, Rules & locks, Colours, Server (Admin) and the live preview. [step5-host-media-tags-hub.png](step5-host-media-tags-hub.png) |
| Poster with tags renders | **PASS** | Movies library: 100 of 100 rendered cards have tag hosts; *101 Dalmatians II* shows 1080p, WEB, H264, Dolby Digital+ 5.1, flags and ratings. [step5-host-tagged-poster.png](step5-host-tagged-poster.png) |
| JE scheduled tasks, original names | **PASS** | `GET /ScheduledTasks`: 15 tasks in "Jellyfin Enhanced"; the (Key, Name) pairs are exactly step 1's list (`JellyfinEnhancedAnalyticsReport` … `JellyfinEnhancedStartup`). |
| `/api-docs/openapi.json` | **PASS** | 200, OpenAPI 3.0.4, 474 paths, 180 under `/JellyfinEnhanced` (step 1: 180). |

Screenshots: 1400×900 headless Chromium as `real-admin`, with step 1's `docs-shots.mjs` scripts.

### Cleanup

- `je rm rs5host` removed `je-lab-rs5host` and `/home/jake/je-lab/rs5host`. Confirmed: `docker ps -a --filter name=rs5host` is empty, `docker ps --filter label=je.lab=1` is empty, the directory is gone.
- Port: nothing listens on 18565 (`ss -ltn`), `curl 127.0.0.1:18565/health` fails to connect.
- Volumes: none created (`docker volume ls` 42 before and after); networks: none created (4).
- Temporary auth state and caches removed: the browser login state `/tmp/je-docs/tools/state-real-admin-18565.json`, the `je api` token and lock in `.notes/`, the je build cache for this checkout (`~/.cache/je-lab/build/9fa5bbccb3f2`), and the scratch plugin build output.
- Unrelated containers (`je-perf-real-seerr` and other sessions' stopped `je-lab-*`) were not touched.

## Deviations and decisions (plan gaps)

1. **No DI registration for the S2.0b instance helpers.** §3 calls `UserDisplayResolver` an "injected singleton", but registering it (or `ArrInstanceClient`/`LibraryItemLookup`) adds a line to the registration multiset, and the brief, the BE gate and this step require the registration snapshot unchanged. So the controller builds the three from dependencies it already receives (`new UserDisplayResolver(userManager)`, `new ArrInstanceClient(httpClientFactory, logger)`, `new LibraryItemLookup(libraryManager, logger)`); its constructor signature, and so `ControllerActivationTests`, is unchanged. Registering them later is a snapshot change and needs its own justification.
2. **`ReviewVisibilityContext` moved into `JeControllerBase`** as a `protected sealed` nested class. It was a `private` nested class of the controller and is the return type of `CreateReviewVisibilityContext`, which the plan puts on the base, so it can't stay private to the derived class. Its body is unchanged; S2.11 still moves it to `Shared/Reviews/`.
3. **`IsAllowedUrl(Async)` in `ArrUrlGuard` take a `Logger` parameter.** `ArrUrlGuard` is a static class, so the wrappers' `_logger` became a parameter. `FetchAndMapAsync` now calls `ArrUrlGuard.IsAllowedUrlAsync(instance.Url, _logger, ct)`.
4. **S2.0b moved more than its list, where verbatim moves needed it:** `FetchAndMapAsync`, `SingleItemOrNull` and `ArrFetchOutcome` (the fetchers call them), `ClearUserCaches` and the *arr queue/history cache fields (`ClearAllSeerrCachesOnConfigChange` uses them), `TmdbEnrichmentResult` (the enrichment cache's type), and the TTL getters just after L160 in the same header block.
5. **Namespaces of new files:** files in `Shared/` and `Infrastructure/` take their folder namespace (`…Shared.Arr`, `…Shared.Library`, `…Shared.Text`, `…Infrastructure.Http`, `…Infrastructure.Hosting`). Files in a feature folder take that folder's current pre-rename namespace (`SettingsDefaults`, `SeerrCaches` → `Jellyfin.Plugin.JellyfinEnhanced.Services`), so the feature's Phase 2 step renames them with their siblings and their `Services.` qualifiers keep compiling until then.
6. **Bundle checkpoint line not appended.** PLAN.md says to append `<step> <hashes>` to `baselines/bundle-checkpoints.txt` at every HOST checkpoint, but this step's instructions said not to edit `baselines/*`. The line is recorded in the bundle row above for the coordinator to append. Step 6's rule (b) uses BROWSER and the backend-merge `git diff` check rather than the hash, so the missing line doesn't block it.
7. `production-inventory.json` log literals now read `{_userDisplayResolver.ResolveUserDisplay(…)}`; the runtime messages are unchanged.

## Notes for S2.1+

- **Base class:** new feature controllers derive from `JeControllerBase` and pass `(userManager, logger, userConfigurationManager)` to `base(…)`; they must not redeclare `_logger`, `_userManager` or `_userConfigurationManager` (CS0108). `IsAdminUser`, `AuthorizeUserConfigAccess`, `AuthorizeUserAccess`, `GetCurrentUserId`, `LoadRevisionedSettings` and `CreateReviewVisibilityContext` are already there.
- **Shared helpers:** a controller that needs `ResolveUserDisplay`, `FindLibraryItemByTmdb` or the *arr calls creates `UserDisplayResolver`/`LibraryItemLookup`/`ArrInstanceClient` in its constructor the same way (decision 1). `IsoDates.TryParseIso` and `ArrInstanceClient.GetRootFolderFromPath` are static (S2.5 Calendar uses the latter, already done). `ArrUrlGuard.IsAllowedUrl(url, _logger)` replaces the old private wrapper.
- **Seerr state:** code that touches the Seerr or *arr caches needs `using static Jellyfin.Plugin.JellyfinEnhanced.Services.SeerrCaches;` (Seerr S2.14, Downloads S2.10, Platform's `TryGetCachedSeerrReachability` in S2.15). **S2.14** removes both forwarders (`ClearAllSeerrCachesOnConfigChange` and also `ClearUserCaches`), repoints the 7 test call sites and `JellyseerrUserImportTask.cs:101`; S2.15 repoints `JellyfinEnhanced.cs:399`. When S2.14 renames the `Features/Seerr/**` namespace, `SeerrCaches` moves with it and the `using static` lines change.
- **S2.8 (Settings):** `SettingsDefaults.cs` is in `Features/Settings/Services/` with namespace `…Services`; renaming it to `…Features.Settings.Services` breaks its `Services.SeriesQualityAggregation.Normalize` qualifier (MediaTags keeps `…Services` until S2.11), so qualify it fully or add a `using` then. The overview-layout test already reads `SettingsDefaults.cs`; only `features-admin-config-schema` and `generate_per_user_props.py` still read the controller.
- **S2.11 (MediaTags):** move `ReviewVisibilityContext` out of `JeControllerBase` to `Shared/Reviews/` (decision 2) and make it accessible to the base.
- **Registrations:** `AddJeEventConsumers()` sits at old L131 and `AddJeMvcFilters()` at the end of `RegisterServices`. `AddJe<F>()` must never register an event consumer; add new consumers to `EventConsumerRegistration` in order.
- `PluginServiceRegistrator.cs` still has `using`s for `MediaBrowser.Controller.Events`/`Library` and `Microsoft.AspNetCore.Mvc` that the moves made unused; harmless, left to keep the diff minimal.
- The build-warning baseline still keys CS8604 on `Controllers/JellyfinEnhancedController.cs`. It is now L5744, `return TransportJson.Create(receipt);` in `POST user-settings/{userId}/bookmark-document` (Bookmarks), so **S2.3** moves it to `Features/Bookmarks/JeBookmarksController.cs` and must re-key that path in `baselines/build-warnings.txt` in the same commit (path only, PLAN.md gate B).
- HOST procedure: same as step 1 (S1-d). `je up`'s deploy still fails; build and install by hand.
