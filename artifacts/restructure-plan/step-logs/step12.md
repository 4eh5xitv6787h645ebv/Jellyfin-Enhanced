# Step 12 log: final step: path sweep (Z), AGENTS.md, skill notes, final gates and HOST (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 12, gates, HOST bundle check, Definition of done; [backend.md](../backend.md) §7.4, §7.6; [frontend.md](../frontend.md) §3 Z, §4 (stale-path sweep); [CHANGELOG.md](../CHANGELOG.md) S12-a…d and "Post-restructure follow-ups". Inputs: [step10-11.md](step10-11.md) "Notes for step 12", [lane-lm.md](lane-lm.md) item 5, [lane-ld.md](lane-ld.md), [step9.md](step9.md) (HOST page list). Previous step: [step10-11.md](step10-11.md).

Coordinator decisions applied (step10-11.md notes):
- **Note 3:** the M2 residual of 25 edges stays ratcheted, shrink-only. It is recorded as a follow-up.
- **Note 4:** the unused allow-list entries were removed.
- **Note 5:** the duplicated `using` blocks were left alone.
- **Note 7:** the legacy namespaces outside `Features/` were left alone. They are recorded as a follow-up.
- **Note 8:** the feature map now records truthfully where the backend tests are.

Machine: Lenovo worker, main checkout. Node 26.2.0 (`/home/jake/.local/opt/node-v26.2.0-linux-x64/bin`) was first on PATH. One dotnet build or test ran at a time. `JE_UPDATE_SNAPSHOTS` was never set. 192.168.0.84 was never contacted. Nothing was pushed, nothing was tagged, and no commit has attribution lines.

## Commits and merge

Branch `restructure/s12` from `restructure/integration` `b59afa91` (clean tree).

| Commit | Content | Gates |
|---|---|---|
| `bf00b9b6` | `chore(client): step 12 path sweep in client/src comments`: comment-only edits in 25 `client/src` files and 5 test helpers/fixtures, plus the regenerated outputs (`js/**` and `Configuration/admin/sections.js` + maps, `PluginPages/*.html`, `client/generated-manifest.json`, `docs/rewrite/migration-inventory.json`) | `all`, `inv`, `tool` pass |
| `6097faa3` | `docs(restructure): step 12 path sweep (Z)`: docs, READMEs, CONTRIBUTING, bug ledger, the docs/rewrite pages, three backend comments, poster-asset notice, CI path filter, feature-map notes | `all`, `inv`, `tool` pass (after one fix, below) |
| `707d9ecd` | `test(backend): step 12 remove unused feature-dependencies allow-list entries` | `be`, `inv`, `tool` pass |
| `b970d69a` | `docs: AGENTS.md for coding agents; step 12 CHANGELOG notes and follow-ups` | `fe`, `inv`, `tool` pass |
| `690a671c` | `docs(restructure): step 12 path sweep of tests/history/early-triage.json` (8 test paths) | `fe`, `inv`, `tool` pass |

Integration merge: **`c412e9ba`** `merge: restructure step 12 (final)` (`--no-ff`). Its tree is identical to `690a671c` (`git diff --quiet 690a671c c412e9ba`), because integration had not moved. This log, the `step12` bundle checkpoint line and the screenshots are the last commit on top of it.

**Fix inside `6097faa3`, before it was final.** The first `all` run on that commit failed with one new npm failure: `features-source-edition-tags.test.mjs` :: "the tag cache service documentation names the current schema constant". The test finds the `project-structure.md` row that starts with ``| `TagCacheService.cs`, `TagCacheMonitor.cs` |``, and I had prefixed that cell with its folder. The fix restored the cell exactly and moved the folder into the description ("In `Features/MediaTags/Services/TagCache/`. Builds/persists …"). The test was not changed. The commit was amended (it was not merged yet), and `all`, `inv` and `tool` were rerun green on the amended commit.

## Path sweep (frontend Z)

Patterns searched outside `artifacts/`:
- `rg` for the listed patterns: `Controllers/`, `Services/`, `Helpers/`, `Model/`, `ScheduledTasks/`, `EventHandlers/`, `JellyfinEnhancedController`, `features/admin-tags`, `media-tags/runtime/` and `media-tags/rules/`;
- two scripts:
  - every file renamed between `restructure-base` and HEAD, searched for its old path, in both repo-relative and plugin-relative forms;
  - every path-like token under `Features/`, `Shared/`, `Infrastructure/`, `client/src/`, `client/entries/`, `tests/frontend/`, `tests/backend/` or the plugin root, checked against `git ls-files`. This found intermediate paths that the base-to-HEAD diff cannot show, such as `Features/MediaTags/Admin/MediaTagsPageFields.cs`, which S2.11 emptied.

| Area | What changed |
|---|---|
| `docs/advanced/project-structure.md` | Plugin file tree: `Features/`, `Shared/` (by area), `Infrastructure/`, `Transport/` replace `Helpers/`, `Extensions/`, `EventHandlers/`, `Model/`, `ScheduledTasks/`, `Services/`. Namespace note rewritten (folder = namespace under `Features/`; tasks keep `…ScheduledTasks`/`…Services`; legacy namespaces remain under `Shared`/`Infrastructure`). "Root services: `Services/`" → "Server services by feature" with every file's current path; Spoiler Guard table marks the `Shared/SpoilerGuard/` files; "Helpers, extensions and models", event consumers and scheduled-task tables use current paths (tasks in `Features/<F>/Tasks/`, with the namespace reason); Shoko → `Features/Calendar/JeCalendarController.cs`; tests trees (backend `Architecture/`, `Features/<F>/`, `Shared/`, `Persistence/`; frontend `admin/`, `architecture/`, `chrome/`, `contracts/`, `features/<f>/`); 3 moved test paths; `compact-quality.ts` path. |
| `CONTRIBUTING.md` | "Key directories" now describes `client/src`, `client/entries`, `js/` as build output, `Features/`, `Shared/` etc. and the guardrail folders. "Adding a client module" now: TypeScript in `client/src/features/<f>/`, boundary rule, manifest mapping in `client/entries`, `component-scripts.json` registration for a *new* output (never rename/reorder existing ones), `client:build` and what to commit. Fonts item kept (points at `ui-styles.ts`). |
| `client/entries/README.md` | Checked against every manifest's sources: already accurate, unchanged. |
| Three `JellyfinEnhancedController` frontend comments | `features/shared/helpers.ts` → `Features/Settings/JeSettingsController.cs`; `features/downloads/render-cards.ts` → `JeDetailsProvidersController.Arr.cs`; `features/media-tags/admin/admin-tags.ts` → `Features/Settings/JeSettingsController.cs` (+ its `MediaTagsPageFields` path). |
| Other `client/src` comments | 17 `media-tags/admin/sections/*.ts` lexical-index banners (`Shared/MediaTags/MediaTagsPageFields.cs`, F1 test path), `admin/config/sections-entry.ts` (`Features/Admin/Services/WhatsNewService.cs`, F1 test path), `media-tags/settings/{portable-model,ui-panel-tag-portable}.ts` (`Shared/MediaTags/MediaTagsPortable.cs`), `host/bootstrap-pages-host.ts` (`Features/Platform/Services/ClientScriptBundle.cs`). |
| Feature READMEs (15) | "Tests" commands re-derived from F1's renames (each names exactly the same test files as before: bookmarks 4, chrome 13, details-providers 9, downloads 4, hidden-content 4, media-tags 64, player 6, seerr 19, settings-panel 5, spoiler-guard 5; the rest unchanged); the stale "Step F1 mirrors these into …" sentence → "`docs/feature-map.json` lists this feature's test folders." |
| `docs/rewrite/*.md` | 15 pages: `client/src/host/<f>-host.ts` → `client/src/features/<f>/host.ts` (and `media-tags/rules-host.ts`, `media-tags/admin/host.ts`), F1 test paths, `admin-tags.md` source folder (`media-tags/admin/`, "formerly `features/admin-tags/`"), `tag-runtime.md`'s output table and `media-tag-rules.md`'s file list re-pathed from `runtime/`/`rules/` to `pipeline/`, `layout/`, `editor/`, `types/<type>/`. |
| `docs/rewrite/bug-ledger.json` | Paths only: 24 test paths moved by F1 (`core-tag-rules-runtime`, `features-player-rewrite`, `settings-panel-rewrite`, `features-release-dates`). L-D had already fixed the `features/admin-tags` source paths. |
| `tests/history/early-triage.json` | Paths only: 8 F1 test paths (step 9 likewise rewrote this file's paths in place). |
| Tests and fixtures (comments/`_source` strings only) | `admin-tags-rewrite.test.mjs`, `features-admin-tags-page-server.test.mjs`, `admin-tags-rewrite.declarations.json`, `helpers/admin-tags-{declarations,page}.mjs`, `tests/fixtures/{admin-tags-page-fields,genre-styles}.json`, `tests/docs/coverage-matrix.md`, `tests/README.md` tree, `tests/inventory/generate.py` comment. |
| Backend comments | `TagCacheEntry.cs` (`Shared/Media/TrackRoles.cs`), `SpoilerUserResolver.cs` (`Infrastructure/Identity`), `RequestIdentityService.cs` (`Infrastructure/Identity/UserTopologyEvents`). |
| Poster-asset notice | `scripts/build_poster_assets.py` template and the generated `Assets/PosterTags/THIRD_PARTY_NOTICES.md`: `Services/PosterTags/Rendering` → `Features/MediaTags/PosterTags/Rendering`; its `manifest.json` output entry (bytes, sha256) updated to the new file; `build_poster_assets.py --check` passes (261 files). The script is not one of its own inputs. |
| `.github/workflows/regression.yml` | `parity` job path filter: dead `Services/`, `Model/`, `Helpers/` entries removed (those folders cannot exist any more). No entry added (follow-up below). |
| `docs/feature-map.json` | Note 8 (below); the `$comment` names `FeatureMapParityTests.cs`. |

**Left on purpose (history, not stale paths):**
- 14 "moved verbatim from JellyfinEnhancedController" provenance comments in plugin code, and one in `ApiRoutingTests`;
- the `manifest.json` release notes;
- the "formerly `features/admin-tags`" notes;
- `tests/frontend/architecture/scan.mjs`'s comment explaining the fold;
- `tests/runner/tests/test_regression.py` and `tests/client-build/*` fixtures, which build `Controllers/…` and other synthetic trees on purpose;
- the Jellyfin-Canopy attribution paths (`Helpers/Seerr/…` in that project);
- historical logs under `artifacts/`.

The final missing-path scan reports only glob prefixes (e.g. `pages-social*`), the three intentionally empty `tests.backend` notes and the "formerly" note.

**Check O.** `git diff -U0` of the built `js/**/*.js`, `Configuration/**/*.js` and `PluginPages/*.html` after `npm run client:build` differs only in these places:
- the 18 kept `/*! … */` lexical-index comment blocks (17 `admintags/sections/*.js` + `Configuration/admin/sections.js`, prose lines only);
- the inline `sourceMappingURL` data line of the 7 plugin pages;
- `.js.map` files.

No code line changed. None of the changed `.js` files is in `component-scripts.json`, so the bundle inputs are unchanged. `client:check`, `inventory:rewrite:check` and `contracts:check` pass inside `all`.

**Note 8, feature map.** `FeatureMapParityTests.BackendTestFoldersMatchTheMap` accepts only a row's own `tests/backend/Features/<backend>` folder. activity, catchup and downloads have no such folder. Their backend tests sit in mixed files:
- Downloads: `Features/Seerr/ApiSeerrTests.cs`, which shares the Seerr fixture.
- Activity: `Features/DetailsProviders/ReviewActivityVisibilityTests.cs` and `Core/CoreSharedStoresTests.cs`.
- Catchup: only `Architecture/ControllerActivationTests.cs` and the route/auth snapshots.

Splitting those classes would not be a pure move. So the rows keep `tests.backend: []`, each row's `notes` now names the files, and a `$comment` line states the rule. The CONTRIBUTING table is unchanged, because it renders no notes.

**Note 4, allow-list.** `feature-dependencies.json` now allows only `SpoilerGuard→MediaTags` and `MediaTags→DetailsProviders`, the two edges still in use. Removed: `Downloads→Seerr`, `Seerr→SpoilerGuard`, `SpoilerGuard→HiddenContent` and `Platform→*`. `FeatureBoundaryTests`: 235 types in `Features.*`, 7 cross-feature edges, **0 findings**, no "unused" note.

## AGENTS.md

New file at the repo root (`b970d69a`, 80 lines):
- **Where things live:** the feature map, CONTRIBUTING's table, `client/src`, `client/entries`, `Features/`/`Shared/`, and the retired folders.
- **Invariants:**
  - never rename `client/entries` output keys or edit `component-scripts.json`;
  - never hand-edit generated files;
  - never update snapshots or baselines, or set `JE_UPDATE_SNAPSHOTS`; ratchets only shrink;
  - frontend boundary rules: `public-api.ts` with `import type`, `FeatureContext`, the host rule, internals owners, raw-global places;
  - backend §7.7: controllers, PublicApi, the allow-list, `Shared/<Area>/`, the M2 ratchet;
  - folder = namespace, with the scheduled-task exception and why;
  - controller files ≤ 1,200 lines, other files ≤ 1,500, one controller per feature;
  - routes and auth are a contract.
- **How to verify:**
  - `npm run verify:restructure` and every `restructure-gates.sh` mode;
  - the flake protocol;
  - the HOST procedure: `image`, `je up --image jellyfin/jellyfin:12.4`, disable *arr, the deploy-build failure (clean clone without `node_modules`, `-warnaserror` vs the baselined CS8604), so build with `dotnet build … -o` and install the DLL and `meta.json` by hand, the checks, the bundle compare, `je rm`;
  - the guardrail tests in `tests/frontend/architecture/` and `tests/backend/Architecture/`. There is no `tests/frontend/guards` folder.
- Ends with "Structure informed by Jellyfin Canopy's agent guidance (GPL-3.0)."

It names no host IP or credential.

## Skill notes (`/home/jake/.claude/skills/jellyfin-enhanced/`)

The skill describes upstream `main`, where the old paths are still correct, so nothing was replaced. Each layout or path statement gained its restructured-tree equivalent, in the skill's existing "use whichever the tree has" pattern. Workflow rules are unchanged. The originals were kept in the session scratchpad and diffed:

`SKILL.md`, "Repo rules":
1. **New paragraph** before the first bullet, "Restructured tree (the v12 rewrite, `restructure/integration` and branches from it)". It covers:
   - read the root `AGENTS.md`;
   - `docs/feature-map.json` and the folder layout;
   - the retired folders, and finding a moved file with `git ls-files | grep`;
   - `js/**` is build output of `client/src` via `client/entries`;
   - the gates `npm run verify:restructure` / `scripts/restructure-gates.sh be|fe|all|browser|inv|tool|h`;
   - `je up`/`je deploy`'s build fails there, so build with `dotnet build … -o <dir>` and install the DLL and `meta.json` by hand.
2. "Cached or versioned output": `Services/PosterTags/Resolution/` gains "(restructured: `Features/MediaTags/PosterTags/Resolution/`)"; `js/tags/`/`js/core/media-language` gain "(restructured: their sources under `client/src/features/media-tags/`)".
3. "Every path to the behaviour": `Services/PosterTags/` and `js/tags/` gain "restructured: `Features/MediaTags/PosterTags/` and `client/src/features/media-tags/`".
4. "New JS modules": `Services/ClientScriptBundle.cs` gains "restructured: `Features/Platform/Services/ClientScriptBundle.cs`, and a module is TypeScript in `client/src` mapped through `client/entries/`".
5. "New settings": the public-config endpoint gains "(restructured: `Features/Platform/JePlatformController.Bootstrap.cs`)"; `js/enhanced/config.js` gains "(restructured: built from `client/src/features/settings/`)".

`references/couplings.md`:
6. One line after the `S=/P=/C=/U=` legend. It maps them for the restructured tree:
   - `S/X` → `Features/<F>/Services/X` or `Shared/<Area>/X`;
   - `P` → `Features/MediaTags/PosterTags/`;
   - `C` → `Features/<F>/Je<F>Controller*.cs` (public-config/bootstrap in `JePlatformController.Bootstrap.cs`);
   - `Helpers/`, `Model/`, `EventHandlers/` and `ScheduledTasks/` → `Features/<F>/{Services,Models,Events,Tasks}/`, `Shared/` or `Infrastructure/`;
   - `js/**` built from `client/src`; `U` unchanged.

No other file in the skill changed. The skill is not in a git repository, so these edits are recorded here only.

## Gates

**Per commit:** see the commit table. Each run's result:

| Gate | Result |
|---|---|
| B | 1 warning, the baselined CS8604 in `Features/Bookmarks/JeBookmarksController.cs(50,45)` |
| G | 22/22 |
| T | total 3204 (baseline 2980), passed 3203, 1 failure, the listed `ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder` |
| npm test | total 3794 (baseline 3745), passed 3785, the 9 listed failures |
| INV | `generate.py --check` passes; route list equals `baselines/inventory-routes.txt` |
| TOOL | 16 tooling tests OK; no new mutation-check line |
| FE G | `component-scripts.json` and the `client/entries` output keys equal restructure-base |

The working tree was clean after every run.

**Final tree** (`690a671c` = `c412e9ba`'s tree):
- `scripts/restructure-gates.sh h` (Node 26.2.0): **pass**, 3 harness builds with 0 errors, `ResolutionData.g.cs is up to date`.
- `npm run verify:restructure`: **pass**. Its `all` is as above. BROWSER ran 693 tests at 6 workers: 638 passed, 52 failed (exactly `baselines/browser-failures.txt`), 3 skipped, 8.5 min, no "listed but did not fail" note.
- Snapshots unchanged. `git diff b59afa91 HEAD` is empty for:
  - the `*.snapshot.json` and `*.base.json` files;
  - `shared-feature-references.baseline.json` and `tests/frontend/architecture/size-baseline.json`;
  - `artifacts/restructure-plan/baselines/`, except the appended `step12` checkpoint line;
  - `component-scripts.json` and `client/entries`.

  The route/auth, auth-helper and registration snapshots were last changed in S0 (`25e04ad5`).

**Integration** (`c412e9ba`):
- `restructure-gates.sh all`: **pass** (same numbers as above);
- `restructure-gates.sh browser`: **pass** (638 passed, 52 failed = the list, 3 skipped, 8.5 min).

No known flake fired in any run, and nothing was rerun because of a flake. No baseline line was added.

`verify:restructure` and `browser` take about 13 and 9 minutes, longer than the tool's 10-minute foreground limit. Each ran alone as a harness-tracked background task and was waited on to completion before anything else ran in this checkout. Every other gate ran in the foreground.

## HOST (final full smoke, on `c412e9ba`)

- **Image.** `scripts/restructure-gates.sh image`: `jellyfin/jellyfin:12.4 = …@sha256:b45218a461bf9663a4076d467e57f168ea54bc62bc20c7481ab43c4ba338575d`, passed.
- **Server.** `je up rs12host 18570 --image jellyfin/jellyfin:12.4 --no-warm` created `je-lab-rs12host` from the golden lab snapshot (`127.0.0.1:18570`). Its own deploy build failed before touching the server ("Frontend verification failed …", clean clone without `node_modules`), as at steps 1–9 (S1-d). At that point no JE plugin was installed.
- **Disposable-server config.** This container only, removed with it. Set while it was stopped, before the plugin was installed and before any page was opened:
  - `SonarrUrl`/`RadarrUrl` and both API keys emptied;
  - `SonarrInstances`/`RadarrInstances` set to `Enabled=false` with empty URL and key;
  - `ActivityFeedUseNativeTab`, `CatchUpEnabled` and `CatchUpUseNativeTab` set to true.

  Afterwards no file under the server's `config/` contained `192.168.0.84`, and neither did the server log. Seerr is the lab's `je-perf-real-seerr` (another session's container), used read-only; nothing was requested.
- **Plugin.** Built from the clean merged checkout with `dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf12 --no-incremental -o <scratch>`: 0 errors, 1 warning (the baselined CS8604), DLL sha1 `8dd802f0f952…`. Installed the way `je deploy` installs it: DLL to `config/plugins/JellyfinEnhanced_12.8.0.0/` (sha1 identical), the skill's `meta.json`, `docker start`. `/health` was Healthy and `public-config` returned 200 after about 6 s.
- **Test data.** One bookmark for `real-admin`: *101 Dalmatians II*, 754 s, "HOST step 12 check", via `POST /JellyfinEnhanced/user-settings/{id}/bookmark.json/add`.

| Check | Result | Evidence |
|---|---|---|
| Plugin loads, no JE errors | **PASS** | Server log: `Jellyfin Enhanced v12.14.0.0 initialized`, `Loaded plugin: Jellyfin Enhanced 12.8.0.0`, `Jellyfin Enhanced Startup Task run successfully` / `completed successfully`; **0** `[ERR]` lines in the server log, 0 JE `[ERR]`/`[WRN]`. `GET /Plugins`: `Jellyfin Enhanced 12.14.0.0 Active`. Browser: no JE page error. Console `error` lines: one 403 and one 404 resource load and the HLS `otherError` (non-fatal) during playback. They are the same kinds as step 9 (there: the `api.github.com` locales rate limit and lab image 404s); the URLs were not captured this time. |
| Bundle check | **(a) PASS; (b) PASS (BROWSER rule)** | (a) Served `GET /JellyfinEnhanced/bundle.js` (200, 4,432,976 bytes) and the in-process `restructure-gates.sh bundle` dump (same size) both give stable `342be966…9742` and comment-stripped `9dd4529e…eae9`. (b) The span since the `step9` line contains frontend code changes (C4, E1 in lanes L-C/L-D), so step10-11.md note 1 applies the C-step rule: (1) BROWSER passed on each merged result (L-M `067b0d3d`, steps 10–11 `bf44eb39`, this merge `c412e9ba`); (2) the backend merges and commits in the span leave the bundle inputs alone (`git diff --quiet` on `js/` and `client/` for the L-G merge `be395c0d` and for `90f4ae5c..bf44eb39`), and `ClientScriptBundle.cs` is unchanged since step 9. Step 12 itself changed no `.js` in `component-scripts.json` (its 17 changed `.js` files are the admin-tags sections, which the configuration page loads). Appended `step12 342be966…9742 9dd4529e…eae9` to `baselines/bundle-checkpoints.txt`. |
| Admin page renders | **PASS** | `#/configurationpage?name=Jellyfin%20Enhanced`: v12.14.0.0, 14 sections (Overview … Docs). [step12-host-admin-page.png](step12-host-admin-page.png) |
| BUG-001 (admin Media Tags section) | **Unchanged** | Top-level "Media Tags" section: still "Loading Media Tags settings…" after 15 s, 0 `.je-tag-admin [role="tab"]`. Not investigated. [step12-host-admin-media-tags.png](step12-host-admin-media-tags.png) |
| User settings panel | **PASS** | `JE.showEnhancedPanel()`: 12.14.0.0, 11 tabs (Shortcuts … About). [step12-host-settings-panel.png](step12-host-settings-panel.png) |
| Media Tags hub | **PASS** | `#jeMediaTagsHub` visible: Layout, Groups, Status badges, Rules & locks, Colours, Server (Admin), live preview. [step12-host-media-tags-hub.png](step12-host-media-tags-hub.png) |
| Media Tags poster | **PASS** | Movies library: 100 of 100 rendered cards have `.je-tag-host`. [step12-host-tagged-poster.png](step12-host-tagged-poster.png) |
| Details page (plan smoke test) | **PASS** | `#/details?id=…` *A Bug's Life*: renders with JE's style blocks loaded (spoiler guard, Seerr, more-info, quality/genre tags, …). [step12-host-details-page.png](step12-host-details-page.png) |
| Hidden Content settings | **PASS** | Panel → Hidden Content: Enable Content Hiding, Show Hide Buttons, Show Confirmation Dialog. [step12-host-hidden-content-settings.png](step12-host-hidden-content-settings.png) |
| Bookmarks | **PASS** (fresh load) | `JE.internals.bookmarksLibrary.showPage()` after a fresh load: *101 Dalmatians II*, "1 bookmark(s)", the "HOST step 12 check" row at 12:34, Find Duplicates / Cleanup Orphaned / Delete All; same as step 9. After a details-page visit in the same session the page is empty: pre-existing, see "Product bugs". [step12-host-bookmarks.png](step12-host-bookmarks.png) |
| Calendar | **PASS** (no *arr) | `#/calendar`: Agenda/Day/Week/Month, "No upcoming releases", no `.je-calendar-error`. [step12-host-calendar.png](step12-host-calendar.png) |
| Downloads / BUG-003 | **Unchanged** | `#/downloads`: section headers render, 28 skeleton cards after 30 s. Data calls are 200: `arr/queue` `{"items":[],"errors":[]}`, `arr/history` `{"items":[],"totalPages":0,"visible":true}`, `arr/requests` returns *Steven Universe*, and `jellyseerr/issue` has 0 results (as at step 9). Not investigated. [step12-host-downloads.png](step12-host-downloads.png) |
| Activity | **PASS** | `#/home?tab=3&jeTab=activity`: Active Streams ("No Active Streams"), Watch History, Reviews. [step12-host-activity.png](step12-host-activity.png) |
| Catch Up | **PASS** | `#/home?tab=2&jeTab=catchup`: Catch Up deck (Movies/Shows). [step12-host-catchup.png](step12-host-catchup.png) |
| Seerr discover | **PASS** | `#/search?query=Odyssey`: "Discover on Seerr" row. [step12-host-seerr-search.png](step12-host-seerr-search.png) |
| Seerr details | **PASS** | More Info modal for *The Odyssey*: overview, cast, and the "Enable Spoiler Guard" toggle. Nothing was requested. [step12-host-seerr-details.png](step12-host-seerr-details.png) |
| Player OSD | **PASS** | *A Bug's Life* playing at `#/video` (`currentTime` 13.8 s, readyState 4), `#je-osd-rating-container` "92% star 7.0". [step12-host-player-osd.png](step12-host-player-osd.png) |
| Moved routes over HTTP | **PASS** | As `real-admin`, all 200: `version`, `jellyseerr/status` (`{"active":true}`), `jellyseerr/user-status` (linked, `canRequestAdvanced`), `jellyseerr/discover/trending`, `tmdb/genres/movie`, `jellyseerr/issue`, `arr/queue`/`history`/`requests`, `private-config` (*arr URLs empty), `locales`, `bootstrap`. Anonymous `jellyseerr/status`: 401. `real-viewer` `private-config`: 200 `{}` (the documented non-admin answer). |
| JE scheduled tasks, original names | **PASS** | `GET /ScheduledTasks`: 15 in "Jellyfin Enhanced"; the sorted 15 Keys + 15 Names equal the 30 `Key =>`/`Name =>` literals in `restructure-base` (`diff` empty). |
| Scheduled-task identity (§7.8) | **PASS** | `JellyfinEnhancedStartup` Id `246a7417a79b8e7b54849a6fe59734e7`, the Guid form of MD5(UTF-16) of `Jellyfin.Plugin.JellyfinEnhanced.Services.StartupService` (`17746a24 9ba7 7b8e 5484…`), same as step 9. |
| `/api-docs/openapi.json` | **PASS** | 200, OpenAPI 3.0.4, 474 paths, **180** under `/JellyfinEnhanced` (same as steps 1, 6–9). |

Screenshots: 1400×900 headless Chromium at scale 2, as `real-admin`, with the skill's `docs-shots.mjs` and a scratch step script (not committed). Shots over 1.5 MB were scaled to 1400 px wide, as at steps 8 and 9.

My first run chained every page in one session through hash navigation. Two of its results came from my script, not from JE:
- the hub step toggled closed the panel the previous step had left open;
- the BUG-001 step clicked Display → "Media Tags" (the summary card) instead of the top-level Media Tags section.

Both were rerun in fresh browser processes; those runs give the results and screenshots above. The run also showed jellyfin-web's `TypeError: Cannot read properties of undefined (reading 'classList')` / `[Home] failed to get tab controller` after the hash chain reached the Activity tab, as noted at steps 8 and 9 (entirely jellyfin-web stack). Activity itself rendered.

## Product bugs

BUG-001 and BUG-003 are unchanged (above) and were not investigated. Nothing was fixed.

**New observation, pre-existing (not caused by the restructure): the bookmarks library page is empty after a details-page visit.**
- **Symptom:** after visiting any item's details page in a session, `JE.internals.bookmarksLibrary.showPage()` shows the `#/bookmarks` view without the item list. The search box, the type filters and the three tool buttons render unstyled, and the bookmark is missing, although `bookmark.json` holds it. A reload shows it again.
- **Repro:** on the lab server as `real-admin`, with one bookmark saved:
  1. load `#/home` and call `showPage()`: the bookmark is listed;
  2. navigate to `#/details?id=<any movie>`, then to `#/home`, and call `showPage()` again: nothing is listed;
  3. reload: it is listed again.
- **Not a regression:** the same scratch script on the same server gave the same three results with the `restructure-base` build (DLL sha1 `59f088da…`, built in a temporary worktree that has since been removed) and with this step's build (`8dd802f0…`, reinstalled afterwards).
- I don't know whether a real user reaches it. Users open the page through the sidebar item, and at 1400 px this layout has no visible drawer; a cold deep link to `#/bookmarks` shows jellyfin-web's "Page not found" (step 9).

## Definition of done

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | `Controllers/JellyfinEnhancedController.cs` and the legacy backend folders are gone; `client/src/features/admin-tags` is gone; no `Features/AdminTags` | ✅ | `Controllers/`, `Services/`, `Helpers/`, `Model/`, `ScheduledTasks/`, `EventHandlers/`, `Extensions/` and `Features/AdminTags` don't exist; `git ls-files` has no `JellyfinEnhancedController.cs`; `client/src/features/admin-tags` doesn't exist; `FolderNamespaceTests.RetiredFoldersStayEmpty` enforces it |
| 2 | Route/auth (202 routes, 12 anonymous), auth-helper and registration snapshots identical to step 1 | ✅ | All three `*.snapshot.json` last changed in S0 `25e04ad5`; `route-auth.snapshot.json`: 202 entries, 12 with `requiresAuth: false`; G 22/22 against them; M1/M4 `*.base.json` match restructure-base |
| 3 | Test counts ≥ baselines; no test deleted without a replacement | ✅ | dotnet 3204 ≥ 2980 (passed 3203 ≥ 2979); npm 3794 ≥ 3745 (3785 ≥ 3736); failures only the listed 1 + 9. Step 12 deleted no test |
| 4 | `component-scripts.json` and every `client/entries` output key unchanged; `client:check` and `inventory:rewrite:check` pass | ✅ | FE G "output keys vs restructure-base" passes; both checks pass inside `all` |
| 5 | `generate.py --check` passes; inventory route list equals the baseline | ✅ | `inv` passes on every commit and on integration (202 routes) |
| 6 | `tests/run.py tooling` passes with count ≥ baseline; `restructure-gates.sh tool` passes | ✅ | `Ran 16 tests … OK` (baseline 16); no new mutation-check line |
| 7 | Guardrails enforce on both sides: feature boundaries, file size, folder = namespace, generated markers, feature-map parity | ✅ | Frontend: `feature-boundaries` (strict since C4), `file-size`, `generated-markers` (strict since E1), `feature-map`, `feature-readme`. Backend: `FeatureBoundaryTests` (all features, allow-list now 2 used edges), `FileSizeTests`, `FolderNamespaceTests`, `FeatureMapParityTests`, all failing on a finding (step10-11.md negative checks) |
| 8 | `npm run verify:restructure`, BROWSER and the final HOST pass on `restructure/integration` | ✅ | `verify:restructure` passed on `690a671c`, the tree of integration's `c412e9ba`; `all` + `browser` (= `verify:restructure`'s two parts) passed on `c412e9ba` itself; HOST above on `c412e9ba` (BUG-001/BUG-003 known and unchanged) |
| 9 | CONTRIBUTING, the `jellyfin-enhanced` skill notes and `client/entries/README.md` describe the new paths | ✅ | CONTRIBUTING's Key directories, Adding a client module and Where things live; skill: restructured-tree paragraph and path annotations (above); `client/entries/README.md` verified against every manifest (already accurate) |
| 10 | All task-owned containers and worktrees removed | ✅ | See "Cleanup". `git worktree list` shows only the main checkout. The local branches `restructure/*` remain (not worktrees; never pushed) |

## Cleanup

- `je rm rs12host` removed `je-lab-rs12host` and `/home/jake/je-lab/rs12host` (with its *arr and tab config, the test bookmark and the A/B DLLs). Confirmed:
  - `docker ps -a --filter name=rs12host` is empty;
  - the directory is gone;
  - nothing listens on 18570, and `curl 127.0.0.1:18570/health` cannot connect (exit 7).
- Container names and states, volumes (42), networks (4), `~/.cache/je-lab/build/` and `/home/jake/je-lab/` all equal the snapshots taken before `je up`. `je-perf-real-seerr` (up) and the other sessions' stopped `je-lab-*` containers were not touched.
- Temporary auth state removed: `.notes/tok-admin`, `.notes/tok-viewer` and their `.lock` files (made by `je api`), and `/tmp/je-docs/tools/state-real-admin-18570.json`. `.notes/` is back to `je.json` and `step1/`. `je.json` names `rs12host` as the last server and holds no credentials.
- The je build cache `~/.cache/je-lab/build/9fa5bbccb3f2` (from `je up`'s failed build) was removed.
- The scratch worktree for the `restructure-base` A/B build was removed (`git worktree remove`, `prune`). Its `node_modules` was a symlink to the main checkout's, and only the symlink was deleted.
- Scratch plugin builds, bundle dumps and the OpenAPI copy were deleted from the session scratchpad.
- The BROWSER fixture servers stopped with each run.
- The working tree is clean on `restructure/integration` after this commit.

## Follow-ups (post-restructure; items 1–5 are also in CHANGELOG "Post-restructure follow-ups")

1. **M2 residual: 25 edges / 310 occurrences** in `shared-feature-references.baseline.json`, ratcheted shrink-only (coordinator decision). Each reduction needs a placement decision:
   - `TagCacheEntry` and its DTOs together with DetailsProviders' MDBList DTOs;
   - the `QualityTagRules`/`LanguageFlagRules` poster-rules cluster with its generators;
   - the `JeControllerBase → Settings/DetailsProviders` and SpoilerGuard self-laundering edges.
2. **Legacy namespaces outside `Features/`** (`…Services`, `…Helpers`, `…Model.Arr`, `…Extensions`, `…EventHandlers` on `Shared/`/`Infrastructure/` files). Unchanged by coordinator decision. Extending folder = namespace there is a new decision, and `StartupService` must keep `…Services`.
3. **Duplicated `using` blocks** in the controller partials. Cosmetic; left by coordinator decision.
4. **`je up`/`je deploy` cannot install this tree.** The clean clone has no `node_modules`, and `-warnaserror` fails on the baselined CS8604 in `JeBookmarksController.cs(50,45)`. Fixing the warning and having `je` run `npm ci` would restore one-command HOST.
5. **Parity CI job path filter** (`regression.yml` `parity`). Poster-relevant code moved under `Features/SpoilerGuard/` and `Features/DetailsProviders/`, which the filter doesn't list. Widening it is a CI decision.
6. **Mixed backend test files**: `ApiSeerrTests` (Seerr + Downloads) and `ReviewActivityVisibilityTests` (DetailsProviders + Activity). Splitting them would give Downloads and Activity their own `tests/backend/Features/<F>` folders and map rows.
7. **Bookmarks page after a details visit**: the pre-existing observation under "Product bugs".
8. `backend.md` §7.2's "Initial allow-list" describes the start state. The live list is `feature-dependencies.json` (CHANGELOG S12-b).

## Deviations

1. **Gates in the background:** `verify:restructure` (≈ 13 min) and the integration `browser` (≈ 9 min) exceed the 10-minute foreground limit. Each ran alone as a tracked background task and was waited on before anything else ran.
2. **Commit 2 amended once**, before it was merged, after its first `all` failed on a doc-anchor test (above). The test was not changed.
3. **Extra commit:** `690a671c` (`early-triage.json`) was swept after commit 2 and committed separately. It was gated like the others.
4. **Sweep scope widened beyond the listed patterns** to every stale path the two scripts found: the feature READMEs' test commands, the docs/rewrite host and test paths, the poster notice and `early-triage.json`. Paths and prose only.
5. **Skill:** annotated rather than rewritten, because its paths are correct for upstream `main`.
6. **A/B build of `restructure-base`** on the HOST server, to classify the bookmarks observation. It ran after every HOST check, and the step-12 DLL was reinstalled afterwards.
