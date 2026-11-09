# Merge log: K1/K1b bundle size, K2 guard tests, round 13 FE (2026-11-10)

Inputs: [canopy-k1.md](canopy-k1.md), [canopy-k1b.md](canopy-k1b.md) (branch `laptop/k1b-dedupe`, base `b59afa91`), [canopy-k2.md](canopy-k2.md) (`laptop/canopy-guard-tests`, base `8ef94a5a`), [round13-fe.md](round13-fe.md) (`laptop/r13-fe`, base `b59afa91`) and [round13-be.md](round13-be.md) (already on integration). Coordinator decisions in the brief: privacy removal of the K2 triage, cleanup A (MediaTags-only `Shared/Media` helpers into the feature), cleanup B (stale path in `genre-icons.json`), and the first live HOST check of the minified bundle.

Machine: Lenovo worker, main checkout, Node 26.2.0 (`/home/jake/.local/opt/node-v26.2.0-linux-x64/bin`) first on PATH. One dotnet build or test at a time. Every gate ran with `JE_UPDATE_SNAPSHOTS` unset (`env -u`). `all` and `browser` ran alone as harness-tracked background tasks and were waited on before anything else ran. Nothing pushed, no tags, no attribution lines.

## Commits

Branch `restructure/merge-k-r13fe` from `restructure/integration` `e6efa45d` (clean tree).

| SHA | Commit |
|---|---|
| `a09263f6` | merge: round 13 FE (`laptop/r13-fe` `9095aecf`, `--no-ff`): clean |
| `9a952ac7` | merge: K1/K1b (`laptop/k1b-dedupe` `1c947ef7`, `--no-ff`): one source conflict, outputs regenerated (below) |
| `11ab3c44` | merge: K2 (`laptop/canopy-guard-tests` `d7b5d272`, `--no-ff`): clean |
| `8648c0be` | docs: keep the K2 triage private (`git rm canopy-k2-triage.md`, one line in canopy-k2.md) |
| `59a694d8` | test(guards): reconcile K2 guards with round 13 FE (one re-key, one classifier rule; below) |
| `d70b2396` | refactor(backend): MediaTags-only `Shared/Media` helpers into `Features/MediaTags` (M2 3 → 0 edges) |
| `d3640863` | chore: `genre-icons.json` `_about` names the restructured `GenreIcons.cs` path |

Integration merge: **`e7f75cda`** `merge: K1/K1b bundle size, K2 guard tests, round 13 FE` (`--no-ff`, parents `e6efa45d` and `d3640863`; its tree equals `restructure/merge-k-r13fe`). This log, the `k1` checkpoint line and the HOST screenshots are the last commit on top of it.

## Conflicts

Only the K1b merge conflicted (22 paths):

- **Source, `scripts/client-build.mjs` `bundle()` input check.** K1b added `if (generated(input)) continue;` (its `client/generated-shared/…` stub and publish modules are not files under `client/src`). R13-FE D1 widened the check to accept `client/src/**/*.css` text imports and kept the error prefix that `html-build.test.mjs:632` matches. Resolution keeps both: generated inputs are skipped first, then the input must be checked TypeScript or a `.css` under `client/src` (D1's wording). The esbuild `loader: { '.css': 'text' }` from D1 applies to the readable and the twin builds alike (both go through `bundle()`). No shared module's closure imports a `.css` file, so K1b's stateless-closure analysis is unaffected.
- **Generated (21 paths):** `js/**` outputs and maps (calendar, requests, bookmarks, catchup, pausescreen, spoilerguard, active-streams, activity, ui-styles, qualitytags) and `client/generated-manifest.json`. Not hand-merged: after resolving the source, `npm run client:build && npm run inventory:rewrite` regenerated every readable output, every `min/js` twin and map, the ledger and the rewrite inventory. `client:check` and `inventory:rewrite:check` pass, and no conflict marker is left anywhere under `js/`, `min/`, `client/`, `scripts/` or `docs/rewrite/`.
- Baselines, budgets and logs did not conflict. All four logs are kept.

## Privacy (step 2)

`canopy-k2-triage.md` is removed (`8648c0be`) and canopy-k2.md gets the line "Triage kept privately by the maintainer." The guard baselines stay. Left as they are, and noted for the coordinator: canopy-k2.md's existing links to the removed file (commit table, triage summary), and the `_comment` field of all six `tests/frontend/guards/*-baseline.json` files plus the comment template in `record.mjs`, which say "Triage: artifacts/restructure-plan/step-logs/canopy-k2-triage.md". Changing those comments means editing the baselines, which this brief keeps as they are.

## Guard ratchets against newer code (step 3)

The K2 baselines were recorded at `8ef94a5a`. On the merged tree, `node --test tests/frontend/guards/*.test.mjs` first failed in three tests. Every finding was classified:

| Guard | Finding on the merged tree | Classification | Action |
|---|---|---|---|
| X1 escape | NEW `client/src/features/shared/wire.ts: X1 errorMessage ×2`; note `catchup/wire.ts: X1 errorMessage ×0 (baseline 2)`; `guards.test` "lists a missing file catchup/wire.ts" | **Relocation.** R13-FE review-D2 dedupe (`97731fe9`) moved the byte-identical helper block from `catchup/wire.ts` to `features/shared/wire.ts`. Same function name, body and leaves (`error.message`, `error` at line 14), same count. | Re-keyed in `escape-guard-baseline.json`: `client/src/features/catchup/wire.ts` → `client/src/features/shared/wire.ts`, `"X1 errorMessage": 2` unchanged, sorted position. |
| X2 CSS injection | NEW `bookmarks/library-styles.ts: X2 install ×1` (`libraryCss`), `hidden-content/hidden-content-styles.ts: X2 injectCSS ×1` (`hiddenContentCss`), `player/pause-styles.ts: X2 (module) ×1` (`pauseScreenCss`), `spoiler-guard/styles.ts: X2 injectStyles ×1` (`spoilerGuardCss`) | **Neither a relocation of a finding nor a violation.** R13-FE D2 replaced substitution-free template literals (constants, which the taint engine already accepts, so baseline 0) with the default import of a sibling `.css` file that D1's esbuild `text` loader inlines as the same string literal (round13-fe.md proves the bytes equal). The engine resolved the import binding to an `ImportClause` and failed closed. | **No baseline change.** The taint engine (`taint.mjs`) now treats the default import of a relative `.css` file under `client/src` that exists on disk as constant text, which is the guard's equivalent of a literal. Planted self-tests: a `.css` text import in the X2 safe sample passes; a bare package `.css` import and an out-of-tree `../../../../outside.css` import still fail (`X2 bare`). |

After `59a694d8`: 33 / 33 guard tests pass, with no "lower the baseline" note. **No genuinely new violation** was introduced by steps 9–12, round 13 or K1/K1b (every other guard, R9, L1–L6, R3/R5/R6 and C1, was clean on the merged tree at its first run), so the merge continued.

## Cleanup A: `Shared/Media` → `Features/MediaTags` (`d70b2396`)

- **Moved, pure rename** (`git mv` plus namespace and `using` lines; `git diff -M` shows only those): `MediaStreamLanguageResolver.cs` (+ `ResolvedMediaStream`) and `SubtitleAccessibility.cs` → `Features/MediaTags/Services/`, namespace `…Features.MediaTags.Services` (next to `MatroskaLanguageCache`/`Reader`, which the resolver uses). Their only users are `TagCacheService` and `JeMediaTagsController.TagCache` (plus tests). The resolver's now-redundant `using …Features.MediaTags.Services` and the dead `using …Shared.Media` in four files (controller partial, `TagCacheService.cs`, `TechnicalChipsTests.cs`, `MatroskaLanguageCacheTests.cs`) were removed.
- **Not moved: `TrackRoles`.** The brief counted three MediaTags-only helpers, but `TrackRoles` is also called by `Shared/MediaTags/PosterTags/Resolution/QualityTagRules` (4 sites) and `Shared/SpoilerGuard/SpoilerTagDataStripper`. Moving it into `Features/` would add two new M2 edges, which the ratchet forbids. It stays in `Shared/Media/` (the folder now holds only it). The two files that moved were the source of all three remaining M2 edges.
- **Ratchets lowered:** `shared-feature-references.baseline.json` `edges` 3 → **0** (`{}`). `TagCacheService.cs` is one line shorter, so the `FileSizeTests` allow-list entry goes from 4,126 to 4,125, and the AGENTS.md sentence says the same.
- **Paths:** `python3 tests/inventory/generate.py` regenerated `tests/docs/production-inventory.json`; `docs/advanced/project-structure.md` re-pathed (two places). `scripts/restructure-gates.sh r 'Shared/Media/(MediaStreamLanguageResolver|SubtitleAccessibility)|Shared\.Media\.(MediaStreamLanguageResolver|SubtitleAccessibility)'` passed.
- **Gates:** `be` passed (G 24/24, including M2 at 0 edges, `FileSizeTests` and `FolderNamespaceTests`; T 3212 / 3211 / 1 listed; npm 3832 / 3823 / 9 listed; INV; TOOL). `h` passed (3 harness builds, 0 warnings; `ResolutionData.g.cs is up to date`).

## Cleanup B: `genre-icons.json` (`d3640863`)

`js/tags/genre-icons.json` is hand-maintained source data, not a client-build output: it is not in `client/generated-manifest.json`, and `scripts/generate_genre_labels.py` reads it. Its `_about` named `Services/PosterTags/Resolution/GenreIcons.cs`; it now names `Shared/MediaTags/PosterTags/Resolution/GenreIcons.cs` (the file exists). `generate_genre_labels.py --check`, `build_poster_assets.py --check` ("poster tag assets OK (261 files)") and `client:check` pass with no regenerated file.

## Gates

| Tree | Gate | Result |
|---|---|---|
| `d70b2396` | `be`, `h` | pass (above) |
| `d3640863` (branch tip) | `all` | **pass**, 4.5 min: B 1 baselined warning; G 24/24; T 3212 total / 3211 / 1 listed (`ApiAssetTests.BundleSourceMap…`); npm 3832 / 3823 / 9 listed (was 3794 at round 13 BE: +33 K2 guards, +1 D2 css-text test, +2 K1, +2 K1b); client-build, contracts, INV, TOOL, FE G, `component-scripts.json` and `client/entries` keys vs restructure-base |
| `d3640863` | `size` | pass: raw **2,375,939** ≤ 2,494,625; gzip -9 **639,307** ≤ 671,156 (no brotli CLI on this machine; brotli figures below are from the server). +106 raw bytes over K1b's 2,375,833 (the D2 stylesheet `var`s); the budget is unchanged |
| `d3640863` | `inv`, `tool`, `h` | pass |
| `d3640863` | jsdom suite on the minified twins (`JE_TEST_MIN_TWINS=1 node tests/frontend/run.mjs`) | 3832 / 3823 / **9 failed**, exactly the 9 names in `baselines/npm-failures.txt` (compared by name) |
| `d3640863` | `browser` | **pass**: 693 tests, 638 passed, 52 failed (= `baselines/browser-failures.txt`), 3 skipped, 8.5 min; no "listed but did not fail" note |
| `e7f75cda` (integration) | `all` | **pass** (same counts) |
| `e7f75cda` | `browser` | **pass** (693 / 638 / 52 listed / 3 skipped, 8.5 min, no note) |

- **Flakes:** none. Every gate passed at its first run, so the flake protocol was not needed.
- **Snapshots unchanged:** `git diff e6efa45d e7f75cda` is empty for `tests/backend/Architecture/*.snapshot.json`, `*.base.json` and `artifacts/restructure-plan/baselines/*`. The only baseline or budget files that changed are new (K1 `client/bundle-budget.json`, the six K2 guard baselines), lowered (M2 → 0, `FileSizeTests` 4,126 → 4,125, R13-FE's removed `size-baseline.json` entry), or the one X1 re-key above. Nothing was raised.
- **Extra (K1b asked for it if possible): offline poster parity** (`node tests/poster/parity/run.mjs --offline`). `web-expected` (the file K1b changed) evaluated every profile, and compact vocabulary matched (18 fixtures). The run then stopped at `status-expected.mjs`: fixture `short-date-pr-2026-01-04` gives `Returns 4 Jan`, expected `Returns Jan 4`. The pre-merge integration tip `e6efa45d` fails identically (scratch worktree, same Node 26.2.0 / ICU 78.3 / CLDR 48), so this is **pre-existing** and not caused by this merge. Not investigated (see "Product bugs and observations").

## HOST (`e7f75cda`, first live check of the minified bundle)

**Image.** `scripts/restructure-gates.sh image`: `jellyfin/jellyfin:12.4 = …@sha256:b45218a461bf9663a4076d467e57f168ea54bc62bc20c7481ab43c4ba338575d`, passed.

**`je up` end to end: works.** `je up rsk1 18571 --image jellyfin/jellyfin:12.4 --no-warm` (`--no-warm` as at step 12; it only skips the background CI-cache warm job) ran unmodified with its own deploy:
1. `mk.sh` created `je-lab-rsk1` from the golden snapshot (no JE plugin);
2. `deploy(head=True)` made the clean HEAD snapshot and ran `ensure_npm`;
3. the build printed `jf12: tolerated 1 warning(s) listed in …/build-warnings.txt: …JeBookmarksController.cs(49,45): warning CS8604 …` and `jf12: ok, 1 baselined warning(s)`;
4. it installed the DLL and `meta.json` into `JellyfinEnhanced_12.8.0.0/` and started the server: `deployed e7f75cda to je-lab-rsk1 http://127.0.0.1:18571 in 4s`. Exit 0, 36 s in total.

So round 13's `je` fix (snapshot `npm ci` plus the baselined-warnings build) is confirmed end to end, and no manual install was needed. `je` also printed a heuristic note, `CHECK CACHE: …/js/tags/tag-cache-store.js changed but TagCacheService.cs did not move`. That is its upstream-PR cache-version reminder, comparing against `origin/main`, and it does not apply to this restructure merge (no tag-cache schema change).

**Sonarr/Radarr isolation (no contact with 192.168.0.84).** The golden config points both at 192.168.0.84, and `je up` gives no hook between creating the server and installing the plugin. A scratch watcher ran beside `je up` instead. As soon as `mk.sh` had created the container (the JE plugin was not installed yet, so nothing read the JE config), it did three things at 01:26:34, before the deploy build finished:
- emptied `SonarrUrl`/`RadarrUrl` and both API keys, and set `SonarrInstances`/`RadarrInstances` to `Enabled=false` with empty URL and key;
- set `ActivityFeedUseNativeTab`, `CatchUpEnabled` and `CatchUpUseNativeTab` to true (as at steps 9 and 12);
- inserted a source-scoped backstop rule, `iptables -I DOCKER-USER -s 172.18.0.3/32 -d 192.168.0.84/32 -j REJECT` (this container only).

The plugin's first start already had *arr disabled. At the end of the run, the rule's packet counter was **0**, and no file under the server's `config/` (logs included) contained `192.168.0.84`. Seerr is the lab's `je-perf-real-seerr` (another session's container), used read-only; nothing was requested.

**Test data:** one bookmark for `real-admin` (*101 Dalmatians II: Patch's London Adventure*, 754 s, "HOST k1 check").

| Check | Result | Evidence |
|---|---|---|
| Plugin loads, no JE errors | **PASS** | Server log: `Jellyfin Enhanced v12.14.0.0 initialized`, `Loaded plugin: "Jellyfin Enhanced" "12.8.0.0"`, Startup Task run and completed. `GET /Plugins`: `Jellyfin Enhanced 12.14.0.0 Active`. 0 JE `[ERR]`/`[WRN]` lines; the JE plugin log (78 lines) has no error or warning. The 53 server `[ERR]` lines are 52 lab-data `Could not find file '/tv/…/poster.jpg'` (*Smoking Behind the Supermarket with You*, *Love, Death & Robots*, as at steps 1–12) and one `POST /Sessions/Playing/Progress` "Unexpected end of request content" from the player check's browser closing mid-playback. |
| Wire: br | **PASS** | `Accept-Encoding: br` → 200, `Content-Encoding: br`, `Vary: Accept-Encoding`, `ETag: "c7822341…"`, `Cache-Control: public, max-age=31536000, immutable`, 528,817 bytes (the immediate quality-9 body). A request seconds later → 482,806 bytes with a new ETag `"e49fa76c…"` (the background quality-11 upgrade); the old q9 ETag then gets 200, which is correct for a changed representation. `br, gzip` → br. |
| Wire: gzip | **PASS** | `Accept-Encoding: gzip` → 200, `Content-Encoding: gzip`, `Vary: Accept-Encoding`, `ETag: "0229b0ad…"`, 641,483 bytes. |
| Wire: 304 | **PASS** | `If-None-Match` with the br ETag (+ `br`) → **304**, 0 bytes, no `Content-Encoding`, ETag and Vary repeated; the same for gzip. The br ETag sent with `Accept-Encoding: gzip` → 200 (strong ETag per representation). |
| Wire: identity | **PASS** | No `Accept-Encoding` → 200, no `Content-Encoding`, 2,375,939 bytes, `ETag: "c2c3cbae…"`; `Accept-Encoding: identity` gives the same. The decoded br and gzip bodies and the identity body have the same sha256 (`c2c3cbae…3667`). |
| Raw size within budget | **PASS** | 2,375,939 ≤ 2,494,625 (`client/bundle-budget.json`). On the wire: 482,806 br q11 (−49 % vs the ≈951 KB pre-K1 estimate), 641,483 gzip. |
| Bundle check | **(a) PASS; (b) expected to differ** | (a) The served identity body and the in-process `restructure-gates.sh bundle` dump (2,375,939 bytes) give the same `bundle-hash`, `8e132afd…013b` (stable = comment-stripped, because the twins carry no `// client/src/` lines). (b) It differs from `step12` (`342be966…`) **by design**: every module is now its minified twin (K1), 24 stateless modules are published once by their providers and read through stubs (K1b), and R13-FE's dedupe and D2 stylesheets are in. It also differs from K1b's laptop dump (`f4c11ca2…`) by the R13-FE changes merged here. Build-transform rule: BROWSER passed on the merge, and the jsdom suite passed on the twins (above). Appended `k1 8e132afd… 8e132afd…` with that note to `baselines/bundle-checkpoints.txt`; the earlier lines are unchanged. |
| Source maps in DevTools | **PASS** | A CDP `Debugger.scriptParsed` (what DevTools uses) for `bundle.js?v=12.14.0.0-639298420113968608` reports `sourceMapURL = bundle.js.map?v=12.14.0.0-639298420113968608`. Fetching it from the page: 200 `application/json`, 10,840,758 bytes (br 1,670,286, `Vary`/ETag present). It is a v3 index map with 182 sections and 453 unique sources: 440 `.ts` (`client/src/**` plus 39 `client/generated-shared/**` K1b stubs) and the 13 D2 `.css`. `sourcesContent` is present for 936/936. Generated positions in the served bundle resolve to the TS lines: `"is not in JE.core.sharedModules"` at 130:481 → `client/src/host/context.ts` 154:41; `"…core/ui-kit.js must load before feature scripts"` at 71:242 → `host/context.ts` 116:34; `'je-osd-rating-container'` at 5616:504 → `features/player/osd-rating.ts` 7:23 (each checked against the source line). |
| K1/K1b runtime | **PASS** | On every page `JE.core.featureContext` is a function and `JE.core.sharedModules` holds 24 ids. No console line matched `is not in JE.core.sharedModules` or `JE.core.featureContext is missing`. |
| JE scheduled tasks | **PASS** | `GET /ScheduledTasks`: **15** in "Jellyfin Enhanced"; the sorted 15 Keys + 15 Names equal the 30 `Key =>`/`Name =>` literals in `restructure-base`. `JellyfinEnhancedStartup` Id `246a7417a79b8e7b54849a6fe59734e7`, the same as steps 9 and 12. |
| `/api-docs/openapi.json` | **PASS** | 200, OpenAPI 3.0.4, 474 paths, 180 under `/JellyfinEnhanced` (the same as steps 1, 6–12). |

**Pages** (the step-12 list; 1400×900 headless Chromium at scale 2, as `real-admin`, one fresh browser process per page, using the skill's `docs-shots.mjs` and a scratch step script that is not committed). Shots over 1.5 MB were scaled to 1400 px wide, as at steps 8–12.

| Page | Result | Screenshot |
|---|---|---|
| Admin page | **PASS**: `#/configurationpage?name=Jellyfin%20Enhanced`, v12.14.0.0, Overview with "What's new" | [admin-page](merge-k-r13fe-host-admin-page.png) |
| BUG-001 (top-level Media Tags section, `button.jellyfin-tab-button[data-tab="media-tags"]`) | **Unchanged**: still "Loading Media Tags settings…" after 15 s, 0 `.je-tag-admin [role="tab"]`. Not investigated. | [admin-media-tags](merge-k-r13fe-host-admin-media-tags.png) |
| User settings panel | **PASS**: `JE.showEnhancedPanel()`, 11 tabs | [settings-panel](merge-k-r13fe-host-settings-panel.png) |
| Media Tags hub | **PASS**: `#jeMediaTagsHub` visible: Layout, Groups, Status badges, Rules & locks, Colours, Server, live preview | [media-tags-hub](merge-k-r13fe-host-media-tags-hub.png) |
| Tagged poster | **PASS**: Movies library, 100 of 100 cards have `.je-tag-host` | [tagged-poster](merge-k-r13fe-host-tagged-poster.png) |
| Details page | **PASS**: *A Bug's Life*, 30 JE style blocks, tags, audio/subtitle chips, "Also available" | [details-page](merge-k-r13fe-host-details-page.png) |
| Hidden Content settings | **PASS**: Enable Content Hiding, Show Hide Buttons, Show Confirmation Dialog, button visibility list | [hidden-content-settings](merge-k-r13fe-host-hidden-content-settings.png) |
| Bookmarks (fresh load) | **PASS**: the *101 Dalmatians II* row "HOST k1 check" at 12:34, "1 bookmark(s)", Find Duplicates / Cleanup Orphaned / Delete All | [bookmarks](merge-k-r13fe-host-bookmarks.png) |
| BUG-016 (bookmarks after a details visit) | **Unchanged**: details → home → `showPage()` shows only the filters and tool buttons, unstyled, with no row. Not investigated. | [bookmarks-after-details](merge-k-r13fe-host-bookmarks-after-details.png) |
| Calendar | **PASS** (no *arr): Agenda/Day/Week/Month, "No upcoming releases", 0 `.je-calendar-error` | [calendar](merge-k-r13fe-host-calendar.png) |
| Downloads / BUG-003 | **Unchanged**: section headers render, 28 skeleton cards after 30 s. Not investigated. | [downloads](merge-k-r13fe-host-downloads.png) |
| Activity | **PASS**: `#/home?tab=3&jeTab=activity`: Active Streams, Watch History, Reviews | [activity](merge-k-r13fe-host-activity.png) |
| Catch Up | **PASS**: `#/home?tab=2&jeTab=catchup`: deck plus the Activity side panel | [catchup](merge-k-r13fe-host-catchup.png) |
| Seerr discover | **PASS**: `#/search?query=Odyssey`, "Discover on Seerr" row, 37 cards | [seerr-search](merge-k-r13fe-host-seerr-search.png) |
| Seerr details | **PASS**: More Info modal for *The Odyssey* (2026): ratings, facts, overview, cast, "Enable Spoiler Guard". Nothing requested. | [seerr-details](merge-k-r13fe-host-seerr-details.png) |
| Player OSD | **PASS**: *A Bug's Life* at `#/video`, `currentTime` 11.7 s, readyState 4, `#je-osd-rating-container` "92% star 7.0" | [player-osd](merge-k-r13fe-host-player-osd.png) |

**Console (no new errors).** Every console error across the runs is a kind seen at earlier HOST steps:
- `403` from `api.github.com/…/js/locales` (external rate limit);
- lab image 404s (`/Items/<id>/Images/Primary|Disc`);
- the non-fatal HLS `otherError` during playback;
- Seerr `similar`/`recommendations` requests aborted when the details page navigated into playback;
- jellyfin-web's `[Home] failed to get tab controller Error: Cannot find module './'` on the Activity and Catch Up deep loads.

Step 9 had seen the last one only after a `#/bookmarks` hash change. Here it appeared on a normal deep load, so it was A/B-checked: a plugin built from the pre-merge integration tip `e6efa45d` (unminified, 4,432,976-byte bundle) was installed on the same server, and it gives the identical error on both pages. It is therefore not caused by this merge. The K1 DLL (sha1 `01662a5486a8…`) was then reinstalled; its served bundle hash was rechecked (`8e132afd…`), and the two pages were reshot on it. The DLL grows from 28.4 MB to 31.7 MB (+3.3 MB) with the `min/js` twins and maps, less than K1's estimate of about 5.2 MB of added generated files.

## Product bugs and observations (recorded, not fixed)

- **BUG-001, BUG-003 and BUG-016 are unchanged** (above). Not investigated.
- **No new product bug.**
- **Pre-existing, outside the product:**
  - Offline poster parity stops at `status-expected.mjs` fixture `short-date-pr-2026-01-04`: actual `Returns 4 Jan`, expected `Returns Jan 4`.
    - Repro: `node tests/poster/parity/status-expected.mjs` with Node 26.2.0 (ICU 78.3, CLDR 48).
    - It fails identically at `e6efa45d`. The `parity` CI job runs it, so the coordinator should know.
  - jellyfin-web's `[Home] failed to get tab controller` on JE native-tab deep loads.
    - Repro: open `#/home?tab=3&jeTab=activity` (or `tab=2&jeTab=catchup`) in a fresh session.
    - It is identical on the pre-merge build. The JE tabs still render.

## Cleanup

- `je rm rsk1` removed `je-lab-rsk1` and `/home/jake/je-lab/rsk1` (with its *arr/tab config and the test bookmark). Checked afterwards:
  - `docker ps -a --filter name=rsk1` is empty and the directory is gone;
  - nothing listens on 18571, and `curl 127.0.0.1:18571/health` cannot connect (exit 7).
- The iptables backstop rule was deleted; `DOCKER-USER` is empty again, as before.
- Docker container names and states, volumes (42) and networks (4), `/home/jake/je-lab/` and `~/.cache/je-lab/` all equal the snapshots taken before `je up`. `je-perf-real-seerr` (up) and the other sessions' stopped `je-lab-*` containers were not touched.
- `je up`'s build snapshot `~/.cache/je-lab/build/9fa5bbccb3f2` (new in this run) was removed.
- Temporary auth state removed: `.notes/tok-admin` and `.notes/.tok-admin.lock` (written by `je` during deploy) and `/tmp/je-docs/tools/state-real-admin-18571.json`. `.notes/` is back to `je.json` and `step1/`. `je.json` names `rsk1` as the last server and holds no credentials.
- The scratch worktrees (`e6efa45d` for the parity A/B and for the HOST A/B build) were removed with `git worktree remove` and `prune`. Their `node_modules` was a symlink to the main checkout's, and only the symlink was deleted.
- Scratch DLLs, bundle and map dumps and wire bodies were deleted from the session scratchpad.
- The BROWSER fixture servers stopped with each run.

## Notes for the coordinator

1. **K2 triage references:** canopy-k2.md's links and the six guard baselines' `_comment` (and `record.mjs`) still name the removed `canopy-k2-triage.md`. Rewording them means touching baseline files, so it was left for a decision.
2. **X2 classifier rule:** the guard now treats `.css` text imports as constants. This is new guard behaviour, not a baseline change, and it is pinned by self-tests in both directions.
3. **`TrackRoles`** stays in `Shared/Media` (used by `Shared/MediaTags` and `Shared/SpoilerGuard`). M2 is now 0 edges, with the IL blind spots from round 13 still open (inlined consts, generic arguments).
4. **The `size` gate** prints no brotli figure on this machine (no `brotli` CLI). The server's own q11 body (482,806) is the live figure.
5. **Offline parity** fails at a pre-existing Status short-date fixture (above). It is not related to K1b's `web-expected.mjs` change, which ran through.
