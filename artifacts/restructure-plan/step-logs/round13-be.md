# Round 13 log: backend follow-ups after the restructure (2026-11-09/10)

Plan: [PLAN.md](../PLAN.md) gates and Definition of done; [backend.md](../backend.md) §7 (§7.2, §7.3, §7.7, §7.8, §7.9); [CHANGELOG.md](../CHANGELOG.md) "Post-restructure follow-ups" and **R13-a…i**. Inputs: [step10-11.md](step10-11.md) (M2 residual, notes 3–8), [step12.md](step12.md) (follow-ups), and the coordinator addition from the independent review `/home/jake/projects/je-restructure-review/review-steps9-12.md`: **G1** (boundary gates key on namespace) and **A1** (AGENTS.md omissions).

Machine: Lenovo worker, main checkout, Node 26.2.0 (`/home/jake/.local/opt/node-v26.2.0-linux-x64/bin`) first on PATH. One dotnet build or test at a time; gates in the foreground, except BROWSER, which ran alone as a harness-tracked background task and was waited on. `JE_UPDATE_SNAPSHOTS` was never set. No containers. Nothing pushed, no tags, no attribution lines. The review clone `/home/jake/projects/je-rs-review` was not touched.

## Commits

Branch `restructure/r13-be` from `restructure/integration` `c0efd5af` (clean tree).

| SHA | Commit | Gates |
|---|---|---|
| `81882dd3` | test(backend): boundary gates attribute types by source folder (G1) | `be` (incl. INV, TOOL) |
| `14c7afc3` | M2: `TagCacheEntry` family → `Shared/MediaTags`, MDBList DTOs → `Shared/Mdblist` | `be`, `h` |
| `755249a2` | M2: settings document services → `Shared/Settings`, `ReviewAuthorCache` → `Shared/Reviews` | `be` |
| `378b1e11` | M2: SpoilerGuard policy services → `Shared/SpoilerGuard` | `be` |
| `4f73b6b3` | verbatim static extraction: `LeavingSoonService` source helpers → `Shared/MediaTags/LeavingSoonSources` | `be`, `h` |
| `d125c2e3` | M2: poster-rules cluster → `Shared/MediaTags/PosterTags`, with its generators | `be`, `h`, generator proof |
| `154d1841` | folder = namespace for `Shared/` and `Infrastructure/` | `be`, `h` |
| `7fdf4971` | PublicApi consistency | `be` |
| `691ab6c5` | trim unnecessary `using` directives in controller files | `be` (warning-identical) |
| `2b77505a` | ci: widen the `parity` job's path filter | `be` |
| `01b0f566` | test(backend): Downloads and Activity backend test folders (pure moves) | `be` |
| `0dd32152` | docs: AGENTS.md additions (A1) and `je up` findings | `be` |
| `b6bceea7` | chore(client): comment paths for the moved poster C# files | `all` |

Integration merge: **`7cfa3ab6`** `merge: round 13 backend follow-ups` (`--no-ff`); its tree equals `restructure/r13-be`. This log is the last commit on top of it.

**Order (coordinator addition).** The G1 instruction arrived after two M2 commits had been made on the branch. To measure the reductions honestly, the branch was reset to `c0efd5af`. The G1 measurement fix was committed first. The two M2 commits were then cherry-picked on top (`14c7afc3`, `755249a2`), with their baseline shrinks redone in the folder-keyed format and their messages corrected to the folder-keyed counts. The pre-G1 SHAs (`c2179171`, `8e769749`) were dropped.

Every refactor commit was proven to change only `using`, `namespace` and qualifier lines, plus the moved files (`git diff -M` filtered of those lines; `proof.sh` in the session scratchpad). Snapshots and baselines are unchanged: `git diff c0efd5af HEAD -- tests/backend/Architecture/*.snapshot.json tests/backend/Architecture/*.base.json artifacts/restructure-plan/baselines` is empty. The `r` gate found no stale references to any old namespace, path or member. `python3 tests/inventory/generate.py` was rerun in every commit that moved or added a plugin file; the route list is unchanged (202).

## G1: boundary gates measure by folder (`81882dd3`)

- **New `tests/backend/Architecture/SourceFolders.cs`.** It scans the plugin's `.cs` files, with comments and string literals blanked, and maps every top-level type to the file that declares it. It handles block and file-scoped namespaces and generic arity.
- **`FeatureBoundaryTests`.**
  - `FeatureOf`, `IsPublicApi` and `IsSharedOrInfrastructure` now use that folder map, not `type.Namespace`.
  - M2 edge keys are now `<folder>/<type> -> <folder>/<type>`, so a namespace rename doesn't re-key them. Item 2 then renamed 17 namespaces with the baseline unchanged.
  - New test `SourceFoldersPlaceEveryPluginType`: it fails if a top-level, non-compiler-generated plugin type isn't placed, or is placed in two folders. It also prints the namespace/folder disagreements and the not-ratcheted root/Configuration/Transport → Features edges.
  - Coverlet's injected tracker type is skipped, as `ServiceFactorySnapshotTests` already does. The first `be` run caught it under T's coverage collection.
- **`feature-dependencies.json`** gets a type-scoped `allowType` section. It is narrower than a feature edge and holds only the edges the fix made visible.
- **Negative probes** (temporary, reverted; tree clean afterwards):

  | Probe | Result |
  |---|---|
  | A helper in `Features/Seerr/Tasks/` in namespace `…ScheduledTasks` referencing `JeCalendarController` | `FeatureReferencesStayInsideTheAllowList` fails: `ZzProbe (Seerr) -> JeCalendarController (Calendar)` |
  | A `Shared/Media/` file in namespace `…Helpers` referencing `LeavingSoonService` | M2 fails: `Shared/Media/ZzProbe2 -> Features/MediaTags/Services/LeavingSoonService: new (1)` |

**Re-measurement (measurement fix; recorded before → after, reason as above):**

| Rule | Namespace-keyed (before) | Folder-keyed (after) |
|---|---|---|
| M2 Shared/Infrastructure → Features | 25 edges / 310 occurrences | **30 edges / 330 occurrences** |
| Feature rule, scanned types | 235 types in `Features.*` (step 12) | 250 types under `Features/` (incl. the 15 task/startup types) |
| Feature rule, findings | 0 | 9 hidden findings, recorded as `allowType` |

- **The 5 newly visible M2 edges:**
  - `Shared/Media/MediaStreamLanguageResolver → MatroskaLanguageCache (2), MatroskaLanguageReader (1)`;
  - `Shared/Media/SubtitleAccessibility → TagMediaStream (12), TagCacheService (1)`;
  - `Shared/Media/TrackRoles → TagMediaStream (4)`.
- **The 9 newly visible feature findings:**
  - `StartupService (Platform) →` Seerr `AutoSeasonRequestMonitor`, `AutoMovieRequestMonitor`, `WatchlistMonitor`, `SeerrScanTriggerService`; MediaTags `TagCacheService`, `TagCacheMonitor`; Activity `ActivityFavoriteMonitor`; Admin `WhatsNewService`;
  - `MdblistRatingsFetchTask (DetailsProviders) → TagCacheService (MediaTags)`.

`StartupService` receives all of these through its constructor so that DI builds them at startup. A static forwarder can't replace a constructor dependency, so it keeps a type-scoped `allowType` entry (`Features/Platform/Services/StartupService: Activity, Admin, MediaTags, Seerr`). The `MdblistRatingsFetchTask` entry was removed again in item 3. After that the ratchet is shrink-only.

**Gate blind spots found while measuring (recorded, not changed; they need a coordinator decision because closing them re-baselines again):**
1. **Constants are inlined**, so the IL scan doesn't see them. Shared code reads Features constants in four places:
   - `SpoilerBlurImageFilter.SpoilerBlurFileName` in `Shared/SpoilerGuard/{SpoilerPendingService, SpoilerSeerrPendingPromoter ×2, SpoilerUserResolver}`;
   - `PosterTagAssets.ResourcePrefix` in `Shared/MediaTags/PosterTags/TagStyles.cs`.

   The same SpoilerGuard const is also read by `Configuration/UserConfigurationManager` and by the MediaTags, Platform and Settings controllers (cross-feature, invisible to the feature rule).
2. **Generic method arguments are not expanded.** `Infrastructure/Hosting/EventConsumerRegistration` (six feature event consumers) and `MvcFilterRegistration` (`PosterTagImageFilter`, `SpoilerBlurImageFilter`, `SpoilerIdentityTagFilter`) reference features only through `AddSingleton<T>`-style arguments, which M2 does not count.
3. Several Shared files keep `using …Features…` lines that only `cref`s use. They create no IL edge and were left alone.

## Item 1: M2 residual, 30 → 3 edges (folder-keyed)

| Commit | Move (`git mv` + namespace/using/qualifier lines unless noted) | Edges | Occurrences |
|---|---|---|---|
| G1 | (re-measured) | 30 | 330 |
| `14c7afc3` | `TagCacheEntry.cs` (`TagCacheEntry`, `TagStreamData`, `TagMediaStream`, `TagMediaSource`, `TagStreamQuality`, `TagEpisodeIndex`, `TagSeasonPremiere`, `TagAddedSpan`, `TagScenes`), `TagLeaving`, `TagLogo`, `TagSourceRatings` → `Shared/MediaTags/`; `MdblistRatings.cs` (all six MDBList DTOs) → `Shared/Mdblist/`. Closed set: no moved type references a Features type. | 19 | 91 |
| `755249a2` | `SettingsDefaults`, `SettingsDocumentService`, `SettingsDocumentPatch` (stateless, built with `new`, not registered) → `Shared/Settings/`; `ReviewAuthorCache` (static cache read by `JeControllerBase`, cleared by DetailsProviders' event consumer) → `Shared/Reviews/` | 16 | 87 |
| `378b1e11` | `SpoilerFieldStripFilter`, `SpoilerNextUnwatchedService` (+ `SpoilerEpisodeCategory`), `SpoilerSeerrPendingPromoter` → `Shared/SpoilerGuard/` as policy services (§7.7 option B). Their only Features references were each other. Registrations, MVC filter order and hosted-service order are unchanged (snapshots keyed by short name). | 12 | 49 |
| `4f73b6b3` | **Verbatim static extraction** (the S2.12 AwardLists precedent): `Configured`, `IsMaintainerrUrl`, `CollectionNames`, `IsCollectionList`, `MaxCollectionNames`, `MaxCollectionNameLength` → static `Shared/MediaTags/LeavingSoonSources`. `LeavingSoonService` keeps every call line unchanged via `using static`; external call sites are re-qualified. This was needed because `PosterTagSettings` (in the poster cluster) calls `Configured`. | 11 | 47 |
| `d125c2e3` | Poster-rules cluster → `Shared/MediaTags/PosterTags[/Resolution,/Rendering]` (details below) | **3** | **4** |

**The poster-rules cluster.** Its closure was computed from the IL graph of the built plugin, via a temporary uncommitted test that dumped every type → type reference.
- **Moved:**
  - `PosterTagModel` (all tag records/enums), `PosterTagSettings`, `PosterTagLookFacts`, `TagStyles`, `TagStylePalettes`, `PosterColour`;
  - `Rendering/PosterTagCss` (+ `CssColor`);
  - `Resolution/{AgeRatingRules, GenreIcons, JsText, LanguageFlagRules, LanguageNames, QualityTagRules, ScoreNumbers, StatusRules (+ PosterStatusContext, StatusThresholds), TechnicalQualityRules}` and the generated `QualityCompactLabels.g.cs` and `ResolutionData.g.cs`;
  - `Services/MediaNamingTags` → `Shared/MediaTags/`;
  - `SeriesSchedule` and `SeriesEpisodeRef`, cut verbatim from `StatusTagsSeriesService.cs` into `Shared/MediaTags/SeriesSchedule.cs` (checked line for line).
- **Not moved:** `LogoRules` and `RatingRules` stay in `Features/MediaTags/PosterTags/Resolution/` (not in the closure).
- **Const read:** `TagStyles` reads the const `PosterTagAssets.ResourcePrefix`, now fully qualified (blind spot 1).
- **Size allow-list:** `TagCacheService.cs` shrank to 4,126 lines through removed `using` lines, so its shrink-only `FileSizeTests` entry was lowered from 4,128.

**Generators (proof of byte-identical output):**
- **Repointed:**
  - `scripts/tag-data.mjs`: `nativePath` and the emitted namespace;
  - `tests/poster/parity/gen-resolution-data.mjs`: target path, emitted namespace, header comment;
  - `scripts/generate_technical_ratios.py`: source path;
  - the tests that name those paths: `tests/client-build/tag-data.test.mjs`, `tools/ClientContracts/boundary.test.mjs`, `features-tag-runtime-generators.test.mjs`.
- **Proof steps:**
  1. Before the move, all three generators were run in write mode on the stashed tree: `git status` stayed clean, so they were no-ops.
  2. After the move, they were run in write mode again. `QualityCompactLabels.g.cs` and `ResolutionData.g.cs` equal the moved files, and `diff` against the pre-move copies shows only the namespace line (`Features.MediaTags.PosterTags.Resolution` → `Shared.MediaTags.PosterTags.Resolution`).
  3. `compact-quality.ts` and `quality-data.ts` (the web outputs) are byte-identical.
  4. `tag-data.mjs --quality --check`, `gen-resolution-data.mjs --check` and `generate_technical_ratios.py --check` pass.
  5. `h` passed on every commit that moved a MediaTags/PosterTags namespace.

**Left (3 edges / 4 occurrences), with the reason:** `Shared/Media/MediaStreamLanguageResolver → MatroskaLanguageCache (2), MatroskaLanguageReader (1)` and `Shared/Media/SubtitleAccessibility → TagCacheService (1)` (`NormalizeStreamLanguage`).
- `MediaStreamLanguageResolver` and `SubtitleAccessibility` are used only by MediaTags (`TagCacheService`, `JeMediaTagsController.TagCache`).
- Moving their targets into Shared doesn't meet the shared-infrastructure rule (two or more features). `MatroskaLanguageCache` is a stateful, registered MediaTags service.
- The natural fix is to move these MediaTags-only helpers into `Features/MediaTags/`. That reverses a backend.md §2 placement (`Shared/Media/`), so it's a coordinator decision, not a pure rename.

The original 25 namespace-keyed edges are all gone; the 3 left are G1-revealed ones.

## Item 2: folder = namespace for `Shared/` and `Infrastructure/` (`154d1841`)

| Files | Namespace before → after |
|---|---|
| `Infrastructure/Auth/UserHelper.cs` | `…Helpers` → `…Infrastructure.Auth` |
| `Infrastructure/Extensions/{ItemRepositoryExtensions, JellyfinDbContextExtensions, UserManagerExtensions}.cs` | `…Extensions` → `…Infrastructure.Extensions` |
| `Infrastructure/Identity/RequestIdentityService.cs` (+ `RequestIdentity`, `IdentityConfidence`) | `…Services` → `…Infrastructure.Identity` |
| `Infrastructure/Identity/UserTopologyEvents.cs` (two event consumers) | `…EventHandlers` → `…Infrastructure.Identity` |
| `Shared/Arr/{ArrInstance, ArrItem, ArrType}.cs` | `…Model.Arr` → `…Shared.Arr` |
| `Shared/Arr/ArrUrlGuard.cs` | `…Helpers` → `…Shared.Arr` |
| `Shared/Arr/{RadarrService, SonarrService}.cs` (+ their DTOs) | `…Services` → `…Shared.Arr` |
| `Shared/Library/ItemLibraryResolver.cs` | `…Services` → `…Shared.Library` |
| `Shared/Media/{MediaStreamLanguageResolver (+ ResolvedMediaStream), SubtitleAccessibility, TrackRoles}.cs` | `…Helpers` → `…Shared.Media` |
| `Shared/Text/PluralRules.cs` | `…Helpers` → `…Shared.Text` |

- **Namespaces after the rename:**
  - `…Helpers`, `…Model`, `…Extensions` and `…EventHandlers` no longer exist; their now-dead `using` lines were removed.
  - `…Services` holds only `StartupService`.
  - `…ScheduledTasks` holds only the 14 tasks.
- **New test** `FolderNamespaceTests.LayerFilesDeclareTheirFolderNamespace`:
  - `Shared/<Area>/**` must declare `…Shared.<Area>[.*]`, and `Infrastructure/<Area>/**` must declare `…Infrastructure.<Area>[.*]`;
  - stale exemptions fail;
  - probe: a `Shared/Media/` file in `…Helpers` fails it.

**Exemptions kept and why:**
- **The §7.8 scheduled-task exemption:**
  - 14 `IScheduledTask` types in `…ScheduledTasks` and `StartupService` in `…Services`, all under `Features/`, unchanged.
  - Jellyfin keys a task's saved triggers and history by the MD5 of its full type name, so renaming them would reset admins' schedules.
- **`LayerExemptions` (Shared/Infrastructure) is empty**, because none of the 17 renamed types has a persisted or reflected full name. Checked:
  - none is a scheduled or startup task;
  - none takes `ILogger<T>` (no logger category);
  - no `TypeNameHandling`, `JsonDerivedType`, `XmlType`, `XmlInclude`, `DataContract`, `Type.GetType` or `typeof(…).FullName` on them;
  - `PluginConfiguration`'s XML names `ArrInstance` elements by property and type name, without the namespace;
  - `tools/ClientContracts` compiles `ArrInstance.cs` by path and emits no namespace (`contracts:check` passes);
  - the registration, route/auth, auth-helper and M1/M4 base snapshots are keyed by short names and unchanged.

## Item 3: PublicApi (`7fdf4971`)

- **The one static reach** into another feature's stateful service outside PublicApi was `MdblistRatingsFetchTask → TagCacheService.Instance?.RefreshRatingSourceAvailability()`, made visible by G1. It now calls the new forwarder `MediaTagsApi.TagCache.RefreshRatingSourceAvailability()`, whose body is that call, and its `allowType` entry is removed.
- **Retired forwarders:** `MediaTagsApi.LeavingSoon.Configured` and `MediaTagsApi.TagStyles.{ParseIsEmpty, NormalizePreset}` forwarded to members item 1 moved to Shared. They were removed; the Platform bootstrap uses the forwarders' exact expressions on `LeavingSoonSources`, `TagStyleSet` and `TagStyleKeys`.
- **Left as visible allow entries:** constructor-injected cross-feature dependencies can't become static forwarders without a DI change. They are:
  - `StartupService` (`allowType`);
  - `SpoilerIdentityTagFilter → NativePosterTagStamper` (`allow` SpoilerGuard→MediaTags);
  - `AwardTagsService`/`TagCacheService` → `MdblistService`, `WikidataAwardsService` (`allow` MediaTags→DetailsProviders).
- **Review comment:** "only MediaTags has a backend PublicApi" is out of date. Bookmarks, Seerr and SpoilerGuard have one too (S2.15). No PublicApi was added where no cross-feature caller exists.
- **End state:** 12 cross-feature edges, 0 findings.

## Item 4: controller `using` blocks (`691ab6c5`)

- **Tool:** Roslyn IDE0005 via `dotnet format style --diagnostics IDE0005`, scoped to the 27 `Je*Controller*.cs` files.
  - It was run with `GenerateDocumentationFile=true` in the environment, so `cref`-only usings count as used.
  - A temporary `Features/.editorconfig` raised IDE0005's severity; it was deleted before the commit.
- **Result:** 740 `using` lines removed, nothing else changed.
- **Warnings:** the `--no-incremental` build is warning-identical. The single baselined CS8604 in `JeBookmarksController.cs` moved from line 50 to 49; gate B is keyed by code and file.
- The production inventory did not change.

## Item 5: CI (`2b77505a`)

The `parity` job's filter in `.github/workflows/regression.yml` now also triggers on:
- `Features/SpoilerGuard/` and `Features/DetailsProviders/`;
- all of `js/locales/` (the harness reads every locale, not only `en.json`);
- `js/enhanced/config.js` (loaded by `web-expected.mjs`);
- `JellyfinEnhanced.csproj` (the harness builds the plugin project).

The YAML parses, and sample paths were checked against the regex.

## Item 6: test moves (`01b0f566`)

- **`tests/backend/Features/Downloads/ApiDownloadsTests.cs`:**
  - Content: `DownloadsHideGuardedEpisodeTitlesPerUserOverTheSharedCache`, `HistoryHidesGuardedEpisodeTitlesAndLeavesOtherRowsWhole` and `RequestRowsHideGuardedDatesWhileComingSoonStillWorks`, moved verbatim from `Features/Seerr/ApiSeerrTests.cs` (checked as an ordered subsequence).
  - `SeerrFixture`, `GuardedSeerr` and `Rows` changed from `private` to `internal` only, and are imported with `using static`.
- **`tests/backend/Features/Activity/ActivityFeedTests.cs`:**
  - Content: the three `ActivityFeedBuilder` tests, moved verbatim from `Features/DetailsProviders/ReviewActivityVisibilityTests.cs`.
  - It carries a copy of that file's one-line `User` helper; `using static` would have clashed with the `User` entity type.
- **Docs and parity:** `docs/feature-map.json` maps both folders, and their notes are updated. The CONTRIBUTING table and its backend paragraph match. `FeatureMapParityTests` and `feature-map.test.mjs` pass.
- **Not moved:**
  - `Core/CoreSharedStoresTests.cs`: it tests `Configuration/UserConfigurationManager`'s activity store, not Activity feature code.
  - The Calendar test in `ApiSeerrTests` (out of scope).
  - Catchup still has no backend test folder.
- **Count:** dotnet tests stay at 3206; the filtered run of the two new folders passes 11/11.

## Item 7: `je up` deployability (tooling, outside the product code)

`je` is `~/.claude/skills/jellyfin-enhanced/scripts/je`; that directory is not a git repository, and the originals were backed up to the session scratchpad first.
- **Finding 1, missing `node_modules`.** `je up` calls `deploy(head=True)`, which builds in `snapshot()`. That is a shared clone checked out at HEAD and cleaned with `git clean -fdx -e node_modules`, so it has no `node_modules` on first use. `deploy()` never called `ensure_npm()`, and `je deploy --base` has the same gap. The plugin build runs `node scripts/client-build.mjs --check` through `Directory.Build.targets`, so it fails.
  - Reproduced with the unmodified `je` on a clean snapshot of HEAD: `Directory.Build.targets(15,5): error : Frontend verification failed. Install Node >=22.12, run npm ci …`.
- **Finding 2, strict warnings.** `je`'s `build()` passes `-p:TreatWarningsAsErrors=true -warnaserror` and also rejects any warning line.
  - Reproduced after `npm ci` in the same snapshot: `JeBookmarksController.cs(49,45): error CS8604`.
  - `je deploy` without `--base` builds in the checkout itself, where `node_modules` exists, so only finding 2 affects it.
- **Fix in `je`:**
  1. `deploy()` runs `ensure_npm(snapshot)` before building a snapshot, and aborts with "npm ci failed in the build snapshot" if that fails.
  2. `build()` looks for a committed `artifacts/restructure-plan/baselines/build-warnings.txt` in the tree it builds. If one exists, it builds without `-warnaserror` and tolerates exactly the listed `<code> <file>` warnings, printing them. Any other warning or any error still fails.
  3. Trees without that file (upstream `main`) keep the strict build.
- **Verified:** the patched `snapshot → ensure_npm → build` path passes on a clean snapshot of HEAD (`jf12: ok, 1 baselined warning(s)`, DLL produced). A non-listed warning, a different code or an error does not match the baseline key (checked).
  - A full `je up` was **not** run, because this round starts no containers. The next HOST checkpoint should confirm it end to end.
  - The test snapshots and the empty build-cache directory were removed afterwards.
- **Docs:** the skill's SKILL.md restructured-tree note and AGENTS.md HOST step 4 describe the fix and keep the manual route.
  - `meta.json` comes from `je`'s `META` constant (`targetAbi` 12.0.0.0), which `je` writes to `JellyfinEnhanced_12.8.0.0/`; the repository has none.
- **The CS8604 itself** (`TransportJson.Create(object)` given a possibly-null value in `JeBookmarksController.cs`) is product code. It was **not** fixed here; it belongs to the bug-fix phase.

## A1: AGENTS.md (`0dd32152`)

AGENTS.md now covers:
- the `TagCacheService.cs` allow-list (4,126 lines, shrink-only) and why it exists;
- the Shared/Infrastructure namespace convention, and that a legacy namespace fails `FolderNamespaceTests`;
- the scheduled-task/startup exemption and why;
- that the boundary gate scans by folder (`allow`/`allowType`);
- the gate's IL-only blind spots;
- where `je`, the lab scripts and `meta.json` come from;
- the known load-sensitive tests (dotnet, browser and npm) and the flake protocol;
- that `verify:restructure` and `browser` exceed a 10-minute foreground limit.

The file stays at 80 lines.

## Gates

| Tree | Gate | Result |
|---|---|---|
| Each branch commit | `be` (B, G, T + frontend suite, F, INV, TOOL) | pass. G 23 → 24 tests (the new `SourceFoldersPlaceEveryPluginType`, `LayerFilesDeclareTheirFolderNamespace`); T 3204 → 3206 total, 1 listed failure (`ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder`); npm 3794 / 3785, 9 listed |
| `14c7afc3`, `4f73b6b3`, `d125c2e3`, `154d1841` | `h` | pass (3 harness builds, 0 warnings; `ResolutionData.g.cs is up to date`) |
| `b6bceea7` | `all` | pass; built `.js` byte-identical (check O: only two `.js.map` files and `client/generated-manifest.json` changed) |
| `restructure/r13-be` | `r` (old namespaces, paths and members) | pass |
| Merge `7cfa3ab6` | `all` | **pass** (B 1 baselined warning; G 24/24; T 3206 / 3205 / 1 listed; npm 3794 / 3785 / 9 listed; `component-scripts.json` and `client/entries` keys = restructure-base; INV, TOOL) |
| Merge `7cfa3ab6` | `browser` | **pass**: 693 tests, 638 passed, 52 failed (exactly `baselines/browser-failures.txt`), 3 skipped, 8.5 min, 6 workers; no "listed but did not fail" note. Ran alone in the background (it is close to the 10-minute foreground limit) and was waited on before this log was committed |

**Flake, recorded under the protocol:** on `755249a2`'s first `be` run (pre-reorder SHA `8e769749`), the npm test `tests/frontend/core/core-api-runtime.test.mjs` "retry budget aborts a transport that never settles" failed (`Time budget exceeded (5ms)` instead of `AbortError`). An isolated rerun passed 5/5, and a clean full `be` rerun passed. It was not added to any baseline, and it is now listed in AGENTS.md.

## Product bugs

No new product bug was found. The baselined CS8604 in `JeBookmarksController.cs` (a possible null reference passed to `TransportJson.Create`) was not fixed (bug-fix phase). BUG-001, BUG-003 and the bookmarks-after-details observation are unchanged and were not investigated (no HOST this round).

## Left over / for the coordinator

1. **M2: 3 edges.** `Shared/Media` → MediaTags (`MatroskaLanguageCache`, `MatroskaLanguageReader`, `TagCacheService.NormalizeStreamLanguage`). This needs a placement decision: move the MediaTags-only `Shared/Media` helpers into `Features/MediaTags/`, or keep them.
2. **Gate blind spots:**
   - inlined consts: the `SpoilerBlurFileName` and `PosterTagAssets.ResourcePrefix` reads, including cross-feature controller reads of the SpoilerGuard const;
   - generic method arguments: `Infrastructure/Hosting/{EventConsumerRegistration, MvcFilterRegistration}`.

   Counting them would re-baseline M2 and the feature rule a second time.
3. **Design tension (review D1):** item 1 moved more feature-shaped code into `Shared/` (`Shared/SpoilerGuard` now holds the spoiler MVC filter and its next-unwatched service; `Shared/MediaTags/PosterTags` holds the poster model, settings and rules). Each move follows §7.7, but `Shared/` now carries a large share of MediaTags and SpoilerGuard.
4. **`Platform` root files** reference features by design (`PluginServiceRegistrator` → every `Add<Feature>()`; `JellyfinEnhanced.cs` → MediaTags/Platform services; `Configuration/LanguageTagPriority` → `LanguageFlagRules` before the move, now Shared). `SourceFoldersPlaceEveryPluginType` prints them; they are not ratcheted.
5. **Stale text in a shipped data file.** `js/tags/genre-icons.json` `_about` still names the pre-restructure `Services/PosterTags/Resolution/GenreIcons.cs` (now `Shared/MediaTags/PosterTags/Resolution/GenreIcons.cs`). It is shipped data, so it was left alone.
6. **`je up` end to end** is unverified (no containers this round); run it at the next HOST checkpoint.
7. **The CS8604** in `JeBookmarksController.cs` is for the bug-fix phase.
