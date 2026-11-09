# Step 3 log (backend half): P1-a, b, c, e, f, g, merged and re-gated (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 3 (backend P1-a, b, c, e, f, g; P1-d folded into P1-g), gates BE, INV, TOOL and H; [backend.md](../backend.md) §2 mapping table, §3 "Other readers", §4 Phase 1, §8 P1 brief. Machine: Lenovo worker. One dotnet build or test ran at a time. The sub-steps ran one after another on one branch, not in parallel worktrees. The frontend half of row 3 (S2) is not part of this log.

## Commits

Branch `restructure/be-p1`, from `restructure/integration` `f7c123e6`:

| Step | Commit | `.cs` changes | Moved |
|---|---|---|---|
| P1-a | `dfb2855f` | 7 × R100 | `Controllers/CatchUpController.cs` → `Features/Catchup/JeCatchupController.cs` (file name from the §2 table; the class is still `CatchUpController`, which S2.1 renames); `CatchUpLogService` → `Features/Catchup/Services/`; `ActivityService`, `ActivityFeedBuilder`, `ActivityFavoriteMonitor` → `Features/Activity/Services/`; `ActivityPlaybackConsumer` → `Features/Activity/Events/`; `Features/Bookmarks/BookmarkDocumentService.cs` → `Features/Bookmarks/Services/` |
| P1-b | `26250a4a` | 17 × R100 | `Services/SpoilerGuard/*` (15) → `Features/SpoilerGuard/Services/`; `SpoilerAutoEnableEvents` → `Features/SpoilerGuard/Events/`; `SpoilerApplyExistingTitlesTask` → `Features/SpoilerGuard/Tasks/` |
| P1-c | `d74b102d` | 25 × R100 | 11 Seerr services and `Helpers/Jellyseerr/*` (9) → `Features/Seerr/Services/`; `Model/Jellyseerr/*` (2) → `Features/Seerr/Models/`; the `JellyseerrWatchlistSyncTask` (partial), `JellyfinToSeerrWatchlistSyncTask` and `JellyseerrUserImportTask` tasks → `Features/Seerr/Tasks/` |
| P1-e | `252c76e2` | 77 × R100, 2 × M (test comments, below) | 11 TagCache files, including all 8 `TagCacheService` partials in one commit → `Features/MediaTags/Services/TagCache/`; 5 `StatusTags*` and `NativeStatusRefreshService` → `…/Services/Status/`; `AwardTagsService`, `LeavingSoonService`, `MediaNamingTags`, `SeriesQualityAggregation`, `TagLogoService` and the 5 tag helpers (`AudioLanguageTagHelper`, `MatroskaLanguageCache`, `MatroskaLanguageReader`, `MediaTagsPortable`, `TagEpisodeSelector`) → `…/Services/`; `Services/PosterTags/**` (44, with the `Rendering/` and `Resolution/` subtree) → `Features/MediaTags/PosterTags/**`; 6 tag models → `…/Models/`; 5 tag tasks → `…/Tasks/` |
| P1-f | `fc277e67` | 12 × R100 | `MaintenanceModeService`, `MaintenanceScheduleService`, `WhatsNewService` and `PluginConfigurationPatch` → `Features/Admin/Services/`; `WhatsNewData` → `…/Models/`; `MaintenancePlaybackReminder` → `…/Events/`; `MediaTagsPageFields` → `Features/MediaTags/Admin/`; `BrandingAssetStartupFilter` → `Features/Chrome/Services/`; `SettingsDocumentService` and `SettingsDocumentPatch` → `Features/Settings/Services/`; `HiddenContentResponseFilter` → `Features/HiddenContent/Services/`; `ContinueWatchingPlaybackEvents` → `…/Events/` |
| P1-g | `9ff813d2` | 44 × R100, 1 × R053 + 2 × A (the split) | `Model/Arr/*`, `SonarrService`, `RadarrService`, `ArrUrlGuard` → `Shared/Arr/`; `ItemLibraryResolver` → `Shared/Library/`; `TrackRoles`, `MediaStreamLanguageResolver`, `SubtitleAccessibility` → `Shared/Media/`; `PluralRules` → `Shared/Text/`; `UserHelper` → `Infrastructure/Auth/`; `RequestIdentityService` → `Infrastructure/Identity/`; `Extensions/*` (3) → `Infrastructure/Extensions/`; 7 Platform services and `BuildAttestation` → `Features/Platform/Services/`; `AnalyticsData` → `…/Models/`; `AnalyticsReportTask`, `RefreshCdnAssetsTask` → `…/Tasks/`. **P1-d (folded in):** 8 DetailsProviders services, `ReviewVisibility` and `ProviderHelper` → `Features/DetailsProviders/Services/`; `AwardsData`, `DoesTheDogDieData`, `MdblistRatings` → `…/Models/`; `ClearTranslationCacheTask` (partial; its only part), `MdblistRatingsFetchRunner`, `MdblistRatingsFetchTask`, `MdblistRatingsSyncTask` → `…/Tasks/`. **Split:** `EventHandlers/UserTopologyEvents.cs` → `Infrastructure/Identity/UserTopologyEvents.cs` (`UserCreated/DeletedIdentityInvalidator`) + `Features/MediaTags/Events/TagCacheAccessInvalidator.cs` + `Features/DetailsProviders/Events/ReviewAuthorCacheInvalidator.cs` |
| merge | `1b457a16` | | `merge: restructure step 3 backend (P1)` (`--no-ff` into `restructure/integration`, no conflicts) |

In total, 182 `.cs` files were renamed at 100% similarity. Namespaces did not change: §2 says namespaces change in Phase 2, and the P1 brief forbids changing them. No plugin `.cs` content changed apart from the split, and no controller was edited. After P1-g, the legacy folders (`Services/`, `Helpers/`, `Model/`, `ScheduledTasks/`, `EventHandlers/`, `Extensions/`, `Controllers/`) hold only `Controllers/JellyfinEnhancedController.cs`. No tags were created, nothing was pushed, and no containers were used.

## Path readers updated (same commit as the move)

- **P1-a:** `docs/advanced/api.md` (the CatchUp source link), `docs/advanced/project-structure.md`, `tests/docs/coverage-matrix.md`.
- **P1-b:** `project-structure.md` (also the "files in this table are under …" line and the namespace note), `coverage-matrix.md`.
- **P1-c:** **`tests/runner/mutations.py`** (`blocked-tags-precedence` `file` → `Features/Seerr/Services/ParentalTagDecision.cs`), `docs/rewrite/seerr-proxy-outcomes.md`, `project-structure.md` (the `Helpers/Jellyseerr/` and `Model/Jellyseerr/` rows), `coverage-matrix.md`.
- **P1-e:**
  - **`.github/workflows/regression.yml:215`**: added `Features/MediaTags/|Shared/|Infrastructure/` inside the `Jellyfin\.Plugin\.JellyfinEnhanced/(…)` group, keeping the old alternatives.
  - **`tests/history/backend-mutations.json`**: the NativeClientPolicy `file`.
  - **`tests/runner/tests/test_regression.py:82`**.
  - `tests/poster/parity/gen-resolution-data.mjs`: the L20 `join(…)` path and the L2 comment. The L260 namespace was not changed.
  - `scripts/tag-data.mjs:8` and `scripts/generate_technical_ratios.py:9`.
  - `scripts/build_poster_assets.py:5`: the docstring only (see notes).
  - The tests `tests/client-build/tag-data.test.mjs`, `tools/ClientContracts/boundary.test.mjs`, `features-tag-runtime-generators.test.mjs:53`, `core-tag-pipeline.test.mjs:207`, `features-rating-sources.test.mjs:79,87` and `bootstrap-media-tags-portable.test.mjs:357` (plus 2 comments).
  - Comments: `tests/poster/parity/colours-expected.mjs`, `tests/poster/parity/README.md`, `tests/poster/parity/PosterTagParity/Program.cs:1` and the `tests/backend/Api/ApiMediaTagsPortableTests.cs:19` doc comment. These two test `.cs` comment lines are the step's only non-rename `.cs` changes.
  - The `JellyfinEnhanced.csproj:54` XML comment.
  - Docs: `docs/advanced/{api,admin-media-tags,project-structure}.md`, `docs/enhanced/tags.md`, `coverage-matrix.md`.
- **P1-f:** `tests/frontend/helpers/admin-tags-declarations.mjs`, `helpers/admin-tags-page.mjs`, `admin-tags-rewrite.test.mjs` (+ the `_source` in `.declarations.json`), `admin-config-rewrite.test.mjs` and `features-admin-tags-page-server.test.mjs`. All of these are comments, assertion messages or `_source` strings; none reads the C# file by path. Also `tests/fixtures/admin-tags-page-fields.json` (`_source`), `docs/rewrite/admin-tags.md`, `docs/advanced/{admin-media-tags,api,project-structure}.md` and `coverage-matrix.md`.
- **P1-g:**
  - **`tools/ClientContracts/ClientContracts.csproj`**: the `ArrInstance.cs` and `AnalyticsData.cs` `Compile Include`, with `Link` to match.
  - **`tests/runner/mutations.py`**: UserHelper and RequestIdentityService.
  - **`tests/history/backend-mutations.json`**: CdnAssetService and ArrUrlGuard.
  - `tests/inventory/generate.py:84`: the StartupService path comment only. Route discovery was already fixed in S0.
  - `tests/frontend/README.md`, `bootstrap-manifest.test.mjs:32` and `core-media-language.test.mjs:36` (comments).
  - The fixture metadata strings in `tests/fixtures/{track-roles,plural-categories}.json`.
  - `docs/rewrite/elsewhere-document.md`, `project-structure.md` and `coverage-matrix.md`.
  - `scripts/generate_config_flag_groups.py` names `CdnAssetService.cs` only in comments and reads no path from it, so it needed no change.
- **Every step:** ran `python3 tests/inventory/generate.py` and committed `tests/docs/production-inventory.json`. The file paths changed; the route list did not.
- The `sources`, `evidence` and `rationale` fields in the mutation JSON were not touched.

## Gates

Per sub-step, on the working tree that was then committed unchanged:
- `scripts/restructure-gates.sh inv` and `tool`, then `be`; all exited 0.
- `scripts/restructure-gates.sh h` for P1-e and P1-g; both exited 0 (see the Node note).
- `git add -A` then `git diff --cached -M --name-status -- '*.cs'`: every entry was R100, except the P1-e test comments and the P1-g split listed above.
- R: `git grep -nE` over the anchored old paths of the step's files, plus the old directories (`Services/SpoilerGuard`, `Helpers/Jellyseerr`, `Model/Jellyseerr`, `Services/PosterTags`, `Services/Identity`, `Model/Arr`, `EventHandlers/UserTopologyEvents`). The anchor keeps `Services/X.cs` from matching inside `Features/F/Services/X.cs`. It is clean except in files this step may not edit (see notes). P1-a, b and c passed `restructure-gates.sh r` outright.

The BE gate tail was identical for every sub-step and for the merged tree (`1b457a16`):
```
    1 Warning(s)                                        (the baselined CS8604 in Controllers/JellyfinEnhancedController.cs; no new pair)
    0 Error(s)
G: Passed!  - Failed: 0, Passed: 11, Skipped: 0, Total: 11
T: Failed!  - Failed: 1, Passed: 3192, Skipped: 0, Total: 3193
T (dotnet test): total 3193 (baseline 2980), passed 3192 (baseline 2979), failed 1 (baseline list 1)
coverage-jf12: passed
npm test: total 3756 (baseline 3745), passed 3747 (baseline 3736), failed 9 (baseline list 9)
Production inventory is current (this does not assert behavioral coverage).
== INV: route list vs artifacts/restructure-plan/baselines/inventory-routes.txt   (no diff)
Ran 16 tests ... OK
tooling: passed
restructure-gates: be passed
```
The one dotnet failure is the baselined `ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder`; the 9 npm failures are the baselined ones. Test counts equal step 2's, as §5 requires: no tests moved in Phase 1. `inv`: `Production inventory is current`, `restructure-gates: inv passed`. `tool`: `Ran 16 tests … OK`, `tooling: passed`, `restructure-gates: tool passed` (no mutation-check line beyond `baselines/mutation-check.txt`).

H (P1-e, P1-g):
```
Build succeeded.  0 Warning(s)  0 Error(s)     (×3: PosterTagsHarness, PosterTagsPipelineHarness, PosterTagParity)
ResolutionData.g.cs is up to date.
restructure-gates: h passed
```

**Snapshots unchanged: yes.** `JE_UPDATE_SNAPSHOTS` was never set: `env | grep -c JE_UPDATE_SNAPSHOTS` printed `0` before the first run, nothing set it afterwards, and the `no_snapshot_updates` guard passed in every `be` and `h` run. G (11 Architecture tests: route/auth, auth-helper and registration snapshots, controller activation and others) passed at every step. `git diff f7c123e6 1b457a16 -- tests/backend/Architecture` is empty, so `route-auth.snapshot.json`, `auth-helper-calls.snapshot.json` and `service-registrations.snapshot.json` are byte-identical. That includes the per-type order of the `IEventConsumer<UserUpdated/UserDeleted…>` registrations whose classes moved in the split. `artifacts/restructure-plan/baselines/**`, `client/src/**`, `Jellyfin.Plugin.JellyfinEnhanced/js/**` and `Configuration/**` are also unchanged from `f7c123e6`. The tree stayed clean after every gate's regenerating build.

**UserTopologyEvents split check** (backend.md §4 exception): run against `restructure/integration` `f7c123e6`, it printed `split-check: original == concatenation (blank lines ignored)`.
```bash
strip() { grep -vE '^(using |namespace )' | grep -vE '^[{}]$'; }
diff -B <(git show f7c123e6:Jellyfin.Plugin.JellyfinEnhanced/EventHandlers/UserTopologyEvents.cs | strip) \
  <(cat …/Infrastructure/Identity/UserTopologyEvents.cs …/Features/MediaTags/Events/TagCacheAccessInvalidator.cs \
        …/Features/DetailsProviders/Events/ReviewAuthorCacheInvalidator.cs | strip)
```
Besides `using`/`namespace` lines, it also strips the column-0 `{`/`}` lines, which are the namespace block's own braces: three files have three pairs, the original one. No class line is at column 0, so no code line is dropped. Each new file has the original's four `using`s and the same block namespace `Jellyfin.Plugin.JellyfinEnhanced.EventHandlers`, so every type keeps its full name.

## Notes and deviations

1. **H needs Node 26.2.0 (pre-existing).** `gen-resolution-data.mjs --check` compares the whole file, and `ResolutionData.g.cs`'s header records the generating Node (`// Source: Node 26.2.0, ICU 78.3, …`). This machine's Node is 24.22.2, which has the same ICU 78.3, CLDR 48.0 and Unicode 17.0. On untouched `restructure/integration` (`f7c123e6`, throwaway worktree) the check fails, and regenerating changes only that header line. So the failure is environmental and predates this step: H had not run on this machine before (steps 1–2 did not need it). The gate was not changed. Node 26.2.0 was installed from nodejs.org (SHA-256 checked against `SHASUMS256.txt`) to `/home/jake/.local/opt/node-v26.2.0-linux-x64`, and H ran as `PATH=/home/jake/.local/opt/node-v26.2.0-linux-x64/bin:$PATH scripts/restructure-gates.sh h`. With it, `f7c123e6` passes too. All other gates ran on the default Node 24.22.2, as in steps 1–2. **Later H runs (S2.11, any step touching MediaTags/PosterTags namespaces) need the same PATH prefix.**
2. **P1-d is folded into P1-g.** P1-g includes all of P1-d's DetailsProviders moves as well as its `ReviewAuthorCacheInvalidator` split, in one commit (PLAN.md row 3).
3. **R is clean except in files the step must not edit.** These still name an old path, all in comments or generated text. They are left for the steps that own them:
   - **Plugin C# comments:**
     - `Configuration/PluginConfiguration.cs:994` (`Helpers/MediaTagsPortable.cs`)
     - `Features/MediaTags/Models/TagCacheEntry.cs:448` (`Helpers/TrackRoles.cs`)
     - `Features/SpoilerGuard/Services/SpoilerUserResolver.cs:14` (`Services/Identity`)
     - `Infrastructure/Identity/RequestIdentityService.cs:153` (`EventHandlers/UserTopologyEvents`)

     Phase 1 forbids C# content changes and requires 100% renames. These files are edited anyway in their Phase 2 steps (S2.x namespace changes), which can fix the comments.
   - **`client/src` comments (this step may not touch `client/src`):**
     - `features/media-tags/admin/sections/*.ts`, 17 files: the `/*! Lexical index …` banner names `Helpers/MediaTagsPageFields.cs` and `Services/WhatsNewService.cs`.
     - `features/media-tags/admin/{admin-tags,page}.ts`, `features/media-tags/runtime/quality-rules.ts`, `features/media-tags/settings/{portable-model,ui-panel-tag-portable}.ts`, `admin/config/sections-entry.ts` and `host/bootstrap-pages-host.ts`.

     Their built copies in `js/**` and `Configuration/admin/sections.js` (with `.map` `sourcesContent`) follow from them. `/*!` banners survive into the built JS and are not `// client/src/` lines, so editing them changes the built output and the comment-stripped bundle hash. The step that edits them must account for that under HOST rule (b). **Frontend B2** (media-tags, after P1-e) or a later FE step is the natural owner.
   - **Embedded asset:** `Assets/PosterTags/THIRD_PARTY_NOTICES.md:4` and its generator template `scripts/build_poster_assets.py:537` name `Services/PosterTags/Rendering`. The notices file is an embedded resource written by `build_poster_assets.py` (`--check` is tested), so changing it changes the plugin DLL's resources. It was left. Only the generator's docstring (L5) was updated.
4. **Non-rename `.cs` edits outside the plugin:** one comment line each in `tests/poster/parity/PosterTagParity/Program.cs` (listed by the plan for P1-e) and `tests/backend/Api/ApiMediaTagsPortableTests.cs` (an R hit of the same kind). Neither is plugin code.
5. **Things the plan asked to take care over:**
   - The P1-e and P1-g mutation `file` rewrites and the `regression.yml:215` filter landed in the same commit as their moves, and TOOL passed after each.
   - The generator self-test fixture (`test_regression.py` `Controllers/Feature.cs`) is synthetic and was not touched. Only its L82 real path changed, in P1-e.
   - `InternalsVisibleTo` (JellyfinEnhanced.csproj L68–71) names assemblies, not paths, so it needed no change; the H harness builds and JE.Tests prove it still applies.
   - No `typeof(JellyfinEnhancedController)` lookup is affected: the controller did not move, and `CatchUpController` kept its type name.

## For later steps

- **B2** is based on a tree containing P1-e: `scripts/tag-data.mjs`, `tests/client-build/tag-data.test.mjs` and `features-tag-runtime-generators.test.mjs` now point at `Features/MediaTags/PosterTags/Resolution/…`. B2 can also fix the `client/src/features/media-tags/**` comments in note 3.
- **S2.x**:
  - The legacy folders now hold only `Controllers/JellyfinEnhancedController.cs`.
  - Every file under `Features/`, `Shared/` and `Infrastructure/` still has its old namespace (`…Services`, `…Helpers`, `…Model`, `…ScheduledTasks`, `…EventHandlers`, `…Extensions`, `…Controllers`, `…Services.PosterTags[.Rendering|.Resolution]`, `…Services.SpoilerGuard` etc.). `FolderNamespaceTests` (report-only) will list them all until Phase 2.
  - The class in `Features/Catchup/JeCatchupController.cs` is still `CatchUpController`; S2.1 renames it.
  - The three event-consumer classes from the split keep namespace `…EventHandlers`. S2.0b moves their registrations verbatim into `EventConsumerRegistration.cs`.
- **S2.11 (MediaTags)** must run H with Node 26.2.0 on PATH (note 1). It also updates `gen-resolution-data.mjs` L260 and the harness namespaces when the namespace changes.
- `baselines/build-warnings.txt` still keys the one CS8604 on `Controllers/JellyfinEnhancedController.cs`. P1 did not move that file; the S2 step that changes it must re-key it.
