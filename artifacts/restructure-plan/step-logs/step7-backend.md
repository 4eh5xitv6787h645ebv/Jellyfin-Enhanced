# Step 7 log, backend track: gate speed-up, S2.6 → S2.7 → S2.8 → S2.9, merged and re-gated (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 7, gates BE, INV, TOOL and BROWSER, Rollback; [backend.md](../backend.md) §1, §2 (DI), §3, §4 Commands and the S2.6–S2.9 rows, §6, §7, §8 briefs; [step5.md](step5.md), [step6-backend.md](step6-backend.md) and [step6-frontend.md](step6-frontend.md) notes. Machine: Lenovo worker (10 cores, 14 GB), main checkout. Gates ran in the foreground, one at a time, except the two Part 0 browser verifications, which ran in the background with nothing else running. No containers. The frontend track (C1 → C2) and the step-7 HOST checkpoint are not part of this log.

## Commits

Branch `restructure/be-s2-b`, from `restructure/integration` `5f62106c`:

| Step | Commit | Content |
|---|---|---|
| Part 0 | `a6e198d4` | `chore(restructure): faster gates` (below). |
| S2.6 | `2d87cf03` | New `Features/Chrome/JeChromeController.cs` with the 6 Chrome routes, `BrandingFileNames`, `TryResolveBrandingFilePath` and the top-level `BroadcastMessageRequest` DTO. `BuildActiveSessionList` moves verbatim to `Features/Chrome/Services/ActiveSessionsService` (made `public`), which the Chrome controller and the Platform bootstrap construct with `new` (Platform → Chrome; no DI line, so the registration snapshot is unchanged). `CanReadActiveSessions` stays: only the bootstrap uses it. `BrandingAssetStartupFilter` → `…Features.Chrome.Services`; `ChromeServiceRegistration.AddJeChrome()` replaces its `IStartupFilter` line in place. Test moved: `Api/ApiBrandingTests.cs` → `Features/Chrome/` (`JE.Tests.Features.Chrome`, builds `JeChromeController`). |
| S2.7 | `d42e5ed9` | New `Features/Admin/JeAdminController.cs` with the 12 Admin routes, `GetJellyfinInternalUrl`/`GetJellyfinExternalUrl` (used only by `jellyfin-urls`), `ValidateArrService`, `FormatUtcOffset`, the nested `MaintenanceBroadcastRequest` and the top-level `MaintenanceModeRequest`. `ConfigurationPatchRequest` becomes a top-level type in `Features/Admin/Models` (§4 row). `Features/Admin/**` → `…Features.Admin.{Services,Models,Events}` (incl. `PluginConfigurationPatch`, formerly `…Helpers`). `AddJeAdmin()` (`WhatsNewService`, `MaintenanceModeService`) sits at the old `WhatsNewService` line; `AddHostedService<MaintenanceScheduleService>()` stays where it was, because moving it would reorder `IHostedService` (§2 DI item 4). Tests: `PatchConfiguration`/`GetWhatsNew` callers build `JeAdminController` (`ApiMediaTagsPageTests`, including the `typeof(...).GetMethod("PatchConfiguration")` lookup at L382, and `ApiMediaTagsPortableTests` through an `Admin(f, controller)` sibling helper); `ApiItemLookMutationTests`' HTTP activator builds `ControllerTypeInfo` (as S0 did for `ApiRoutingTests`); `Core/CoreMaintenanceTests`, `Core/CoreWhatsNewTests` → `Features/Admin/`; `tests/docs/maintenance-recovery.md` path updated. |
| S2.8 | `f2671290` | New `Features/Settings/JeSettingsController.cs` with the 8 Settings routes, `LoadUserSettingsDocument` (now used only by `settings.json`; the bootstrap calls `LoadRevisionedSettings`), `ApplyUserSettingsRequest` and `UserSettingAliases`. `BuildHcDefaultSettings` → `Shared/HiddenContent/HiddenContentDefaults` (helper move 1). `Features/Settings/Services/*` → `…Features.Settings.Services`; `SettingsDefaults`' `Services.SeriesQualityAggregation` and `JeControllerBase.LoadRevisionedSettings`' `new Services.SettingsDocumentService` are re-qualified (step 5 note; review-r3 #5). `scripts/generate_per_user_props.py` and `tests/frontend/features/features-admin-config-schema.test.mjs` read the new files; the generator re-ran and `client/src/admin/config/per-user-props.ts` is unchanged (98 properties). No Settings registration (it has no DI line). Tests: 13 files drive the moved actions on `JeSettingsController`, directly where the controller served only Settings actions, otherwise through the new `ApiAssetTests.Sibling<T>(controller, fixture, services…)` (same `ControllerContext`); `Api/RevisionedSettingsTests.cs` → `Features/Settings/`. |
| S2.9 | `0b343e02` | New `Features/HiddenContent/JeHiddenContentController.cs` with the 10 HiddenContent routes, both section comments, and `WiderScope`, `ScopeRank`, `EarliestHiddenAt`, `MergeHomeScope`, `HideFromHomeSurface`, `UnhideFromHomeSurface` (used only there; `Clamp` is a local function of `AdminHideForUser`). `LoadUserHiddenContentDocument` → `Features/HiddenContent/Services/HiddenContentDocumentService` (§4 row), built with `new` by the controller and the Platform bootstrap. `HiddenContentResponseFilter` → `Shared/HiddenContent/` by `git mv` (helper move 2). `ContinueWatchingPlaybackEvents` → `…Features.HiddenContent.Events`. `AddJeHiddenContent()` replaces the filter and `ContinueWatchingLibraryHook` lines in place (contiguous, so `IHostedService` order holds). Test moved: `Privacy/PrivacyHiddenContentTests.cs` → `Features/HiddenContent/` (`JE.Tests.Features.HiddenContent`); its `tests/history/early-triage.json` entry rewritten in place; `tests/docs/coverage-matrix.md` filter path updated. |
| merge | `cb6fd240` | `merge: restructure step 7 backend (S2.6–S2.9)` (`--no-ff` into `restructure/integration`, no conflicts) |

Every step also regenerated `tests/docs/production-inventory.json` (step action), added its feature to `"enforced"` in `tests/backend/Architecture/feature-dependencies.json` (now `[Catchup, Activity, Bookmarks, Calendar, Chrome, Admin, Settings, HiddenContent]`; no allow-list edge added), and extended the controller paragraph at the end of `docs/advanced/api.md`. No tags, nothing pushed, no `Co-Authored-By`.

## Part 0: gate speed-up (`a6e198d4`)

- `tests/frontend/helpers/discovery.mjs`: `--test-concurrency=${JE_TEST_CONCURRENCY or max(4, availableParallelism() - 1)}` (9 here, still 4 on the four-core CI runner). `tests/frontend/README.md` says so.
- `tests/browser/playwright.config.cjs`: `workers` = `JE_BROWSER_WORKERS` when set, else the old `CI ? 2 : 3`. `tests/browser/README.md` says so.
- `scripts/restructure-gates.sh`:
  - `be` is now B+G, then **T ∥ F's frontend suite** (`be_t_and_frontend`: two background subshells with separate logs, `wait` on each, prints a summary and tail of each, fails if either failed), then the rest of F, INV, TOOL. Every ratchet check is unchanged. The frontend suite runs no dotnet, so dotnet still builds and tests one process at a time.
  - New `all`: `be`, then `fe` without the second frontend-suite run, for merge points. It fails if `fe`'s regeneration changes the working tree after `be` ran, because `be`'s results would then not cover that tree.
  - New `browser` (below).

**Timings (`be`, unchanged tree `5f62106c`):**

| run | wall | T (`dotnet test` full) | frontend suite |
|---|---:|---:|---:|
| before (old script, sequential, concurrency 4) | **255 s** | 48 s | 88.3 s |
| after, run 1 (new script, concurrency 9) | **189 s** | 1 m 7 s (shares the CPU) | ≈ 73 s |
| after, run 2 | **190 s** | 1 m 7 s | 73.5 s |

Both after-runs: T total 3193, passed 3192, failed 1 (= the baselined `ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder`); npm total 3787, passed 3778, failed 9 (= the 9 baselined), with no "listed but did not fail" note, so both failure sets equal the baselines. Same as the before-run. Every later `be` in this step was 188–199 s.

**Flakes: none.** The default concurrency of 9 was never lowered. Two clean runs on the unchanged tree, then five more `be` runs (S2.6, S2.7, S2.8, S2.9, merged) all had the identical 1 + 9 failures. The one red `be` (S2.7's first run, 18 failures) was a real harness bug, not a flake (deviation 3 below).

**BROWSER ratchet (coordinator decision, records existing state only).** `baselines/browser-failures.txt` holds the 52 identities from `step6-browser-failures.txt`, with the 4-space indent stripped and `LC_ALL=C` sorted. `restructure-gates.sh browser` runs `npm run test:browser -- --reporter=list,json` with `JE_BROWSER_WORKERS=6`. It rebuilds `[project] › <file>:<line>:<col> › <title path>` from the JSON report and fails on any failing test not in the list; a listed test that passes is a note. PLAN.md's BROWSER row and `baselines/README.md` describe it. Verified twice on the unchanged tree at 6 workers, both times `BROWSER: 693 tests, passed 638, failed 52 (baseline list 52), skipped 3`, exact match, no note, **397 s** each. The 3-worker wall time was not re-measured in this session (step 6 did not record it). Only failures are ratcheted: there is no `browser-tests.txt` count floor, because only the failure list was authorised.

## Gates

Per sub-step, on the tree then committed unchanged: `python3 tests/inventory/generate.py` (step action), `scripts/restructure-gates.sh r <old names/paths>`, then `be`, which runs INV and TOOL at its end. Every run was under `env -u JE_UPDATE_SNAPSHOTS`. R patterns:
- S2.6: `JellyfinEnhanced\.Services\.BrandingAssetStartupFilter|Api/ApiBrandingTests|[^.]BuildActiveSessionList\(|Controllers\.BroadcastMessageRequest`.
- S2.7: `JellyfinEnhanced\.Services\.(MaintenanceModeService|MaintenanceScheduleService|WhatsNewService)|JellyfinEnhanced\.Helpers\.PluginConfigurationPatch|JellyfinEnhanced\.Model\.(WhatsNewState|ConfigSchemaSnapshot)|EventHandlers\.MaintenancePlaybackReminder|JellyfinEnhancedController\.ConfigurationPatchRequest|Core/CoreMaintenanceTests|Core/CoreWhatsNewTests|Controllers\.MaintenanceModeRequest`. Its one hit, in `tests/docs/maintenance-recovery.md`, was fixed.
- S2.8: `BuildHcDefaultSettings`, `…Services.SettingsDocument*`, `JellyfinEnhancedController.ApplyUserSettingsRequest`, `Api/RevisionedSettingsTests`. What remains is only the new home and its intended readers.
- S2.9: `JellyfinEnhanced\.Services\.HiddenContentResponseFilter|[( !]Services\.HiddenContentResponseFilter|EventHandlers\.ContinueWatching|HiddenContent/Services/HiddenContentResponseFilter|Privacy/PrivacyHiddenContentTests|[^.]LoadUserHiddenContentDocument\(`.

**H was not run.** It is required only when MediaTags/PosterTags namespaces move (PLAN.md gate BE), and none did. S2.7/S2.8 only added `using` lines to `MediaTagsPortable.cs`.

`be` on the merged `restructure/integration` (`cb6fd240`), 188 s, tail:
```
    1 Warning(s)                                         (the baselined CS8604, Features/Bookmarks/JeBookmarksController.cs(50,45))
G: Passed!  - Failed: 0, Passed: 11, Skipped: 0, Total: 11
== T log: summary and tail (exit 0)
Failed!  - Failed:     1, Passed:  3192, Skipped:     0, Total:  3193, Duration: 1 m 6 s - JE.Tests.dll (net10.0)
T (dotnet test): total 3193 (baseline 2980), passed 3192 (baseline 2979), failed 1 (baseline list 1)
coverage-jf12: passed
== F frontend suite log: summary and tail (exit 0)
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
Production inventory is current (this does not assert behavioral coverage).
== INV: route list vs artifacts/restructure-plan/baselines/inventory-routes.txt   (no diff)
Ran 16 tests ... OK
tooling: passed
restructure-gates: be passed
```
Test counts equal step 6's (3193 dotnet, 3787 npm): the moved test classes kept every test.

**Snapshots unchanged: yes.**
- `JE_UPDATE_SNAPSHOTS` was never set: `env | grep -c` = 0, and the `no_snapshot_updates` guard passed every run.
- `git diff 5f62106c cb6fd240 -- 'tests/backend/Architecture/*.snapshot.json'` is empty: `route-auth.snapshot.json`, `auth-helper-calls.snapshot.json` and `service-registrations.snapshot.json` are byte-identical.
- G passed at every step. FeatureBoundaryTests reports `findings: 0`, `cross-feature edges: 0` over 47 types in `Features.*`.

**HOST bundle rule (b)(2) for this backend merge:** `git diff --quiet 5f62106c cb6fd240 -- Jellyfin.Plugin.JellyfinEnhanced/js client` exits 0, and `ClientScriptBundle.cs` is untouched. The only `baselines/*` changes are the authorised `browser-failures.txt` and its README row.

**Verbatim check** (a script compares every removed controller line with the new files, per step). Every line cut from `JellyfinEnhancedController.cs` reappears in the new controller or service. The only exceptions are listed here:
- re-qualified names, where `Services.` would bind to the new `Features.<F>.Services`: S2.7 `Services.HostCompatibilityService` ×2; S2.8 `Services.TagCacheService` ×6, `…HiddenContentResponseFilter` ×2, `…SpoilerBlurImageFilter` ×2, `…SeriesQualityAggregation` ×1; S2.9 `Services.HiddenContentResponseFilter.` ×5, now `HiddenContentResponseFilter.` from `Shared.HiddenContent`;
- the service calls replacing private helpers (`_activeSessionsService.BuildActiveSessionList`, `HiddenContentDefaults.BuildHcDefaultSettings`, `_hiddenContentDocumentService.LoadUserHiddenContentDocument`), with those helpers made `public`;
- `ConfigurationPatchRequest` de-indented to top level;
- in the main controller, the re-qualified `Features.Admin.Services.*` field and constructor types.

Bodies, attributes, method names and route templates are otherwise unchanged.

## Routes moved and remaining size

| Controller | Routes | Lines |
|---|---:|---:|
| `Features/Chrome/JeChromeController.cs` | 6 | 329 |
| `Features/Admin/JeAdminController.cs` | 12 | 401 |
| `Features/Settings/JeSettingsController.cs` | 8 | 552 |
| `Features/HiddenContent/JeHiddenContentController.cs` | 10 | 618 |
| `Controllers/JellyfinEnhancedController.cs` | **153** (was 189) | **10,542** (was 12,402; −1,860) |

The total is still 202 routes, 12 of them anonymous. None of the moved routes is anonymous.

## Cross-feature helper moves (coordinator decision; backend.md §7.7, CHANGELOG S7-c/S7-d)

1. **S2.8: `BuildHcDefaultSettings` → `Shared/HiddenContent/HiddenContentDefaults`**, not the §4 row's `Features/HiddenContent/Services/`. The Settings controller (`reset-all-users-settings`) and HiddenContent (seeding, continue-watching hide) both call it. A `Features.HiddenContent.Services` namespace would have failed the Settings controller's enforcement in S2.8 itself, and a legacy namespace would only have deferred the failure to S2.9. It is a new extraction, so it was created there directly.
2. **S2.9: `HiddenContentResponseFilter` → `Shared/HiddenContent/`** (pure rename, body identical). The enforced Settings controller calls its static `InvalidateUser`. `AddJeHiddenContent()` still registers it, and its MVC filter position is unchanged. The `SpoilerGuard → HiddenContent` allow-list edge is now unused; it was left alone.

The controller rule was not widened, and no allow-list entry was added.

## Deviations and decisions

1. **One frontend test edited despite "don't touch tests/frontend".** The S2.8 brief requires repointing `tests/frontend/features/features-admin-config-schema.test.mjs`, and PLAN.md bars frontend steps from that file while S2.8 is open. The change is limited to its two file paths and the end anchor; the not-found guard and the ≥ 98 count are kept. Part 0's authorised edits are `tests/frontend/helpers/discovery.mjs`, `tests/frontend/README.md`, `tests/browser/playwright.config.cjs` and `tests/browser/README.md`. Nothing else under `client/src`, `tests/frontend` or `tests/browser` changed.
2. **`AddHostedService<MaintenanceScheduleService>()` stays in `PluginServiceRegistrator`** (§2 DI item 4). `AddJeAdmin()` holds only the two singletons.
3. **`ApiItemLookMutationTests` activator** (S2.7). Its HTTP harness always built `JellyfinEnhancedController`, so `POST admin/configuration` failed with 500 in 18 tests on the first S2.7 run. It now builds `context.ActionDescriptor.ControllerTypeInfo`, like `ApiRoutingTests` since S0. This is a test harness fix, not a ratchet change.
4. **`ApiAssetTests.Sibling<T>`** is a new test helper: a feature controller sharing an existing controller's `ControllerContext`. It is used where one test drives moved and unmoved actions on one signed-in controller.
5. Moved DTOs stay nested, except `ConfigurationPatchRequest`, which the plan promotes. `BroadcastMessageRequest` and `MaintenanceModeRequest` were already top-level, so they move as top-level types in their controller files.
6. **`JellyfinEnhancedController`'s constructor is unchanged** (step 6 decision 5). `_hostCompatibility`, `_whatsNewService`, `_networkManager` and `_serverConfigurationManager` are now assigned but unread there. Trim them in S2.15.
7. Test moves follow §5 only for classes that belong wholly to the feature. `SettingsPreservationTests` (§5: "unverified, may be Settings") and `ApiConfigurationTests` (Platform config tests) stay in `Api/`.

## Notes for S2.10+

- **S2.11 needs a coordinator decision first.** When MediaTags' namespace changes, these become findings for features enforced in this step:
  - controller → MediaTags: `JeAdminController` → `MediaTagsPageFields`; `JeSettingsController` → `TagCacheService.Instance` (6 calls), `MediaTagsPortable.TryNormalizeUser`, `MediaTagsPageFields`;
  - service → MediaTags: Admin's `PluginConfigurationPatch` → `MediaTagsPortable`/`MediaTagsPageFields`; Settings' `SettingsDefaults` → `SeriesQualityAggregation`. Neither edge is allow-listed.
  - `MediaTagsPortable` → `PluginConfigurationPatch` is a MediaTags → Admin edge, so the two are cyclic.

  Under the step-7 rule these helpers would go to `Shared/<area>/`. That works for `MediaTagsPageFields`, `MediaTagsPortable`, `SeriesQualityAggregation` and probably `PluginConfigurationPatch`. It does not work for `TagCacheService`, an 8-file partial class of about 6k lines, whose `OnLogoSettingsChanged`/`OnRatingSourceSettingsChanged` hooks the Settings controller calls.
- **S2.13:** `JeSettingsController` → `SpoilerBlurImageFilter.SpoilerBlurFileName` (reset clears Spoiler Guard prefs) joins the step-6 note (`JeCalendarController` → `SpoilerSeerrRedactor`).
- **S2.14:** `JeAdminController.ValidateArrService` → `Helpers.Jellyseerr.SeerrHttpHelper.CreateClient` (Seerr).
- **S2.15:** `JeAdminController.GetHostCompatibility` → `HostCompatibilityService` (Platform, still root `…Services`).
- **S2.12:** `ElsewhereDocumentTests`' HTTP activator (L46) always builds the main controller; generalise it like `ApiItemLookMutationTests`. Repoint `ElsewhereDocumentTests:701–702` (`Get/SaveUserSettingsElsewhere`).
- **Remaining `typeof(JellyfinEnhancedController)` lookups:** `ApiAssetTests:13` (helper, S2.15), `BootstrapContractTests:176` (`GetBootstrap`, S2.15), `ElsewhereDocumentTests:701–702` (S2.12). `PatchConfiguration`'s was repointed in S2.7.
- **Re-qualify root `Services.` names in moved bodies.** Every feature with its own `Services` namespace hits this: `Services.X` binds to `Features.<F>.Services`.
- **Main-controller code that now delegates to feature services:**
  - the bootstrap calls `_activeSessionsService.BuildActiveSessionList` (Chrome) and `_hiddenContentDocumentService.LoadUserHiddenContentDocument` (HiddenContent);
  - `CanReadActiveSessions` stays private there.
- **New gate modes:** `restructure-gates.sh all` (merge points) and `browser`. `JE_TEST_CONCURRENCY` and `JE_BROWSER_WORKERS` override the defaults, 9 and 6 here.
- **Step-7 HOST** runs after both tracks merge. Build and install by hand as in step 1 (S1-d).
