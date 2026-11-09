# Step 8 log: frontend C3 merged, re-gated, HOST checked (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 8: backend S2.10–S2.13 ∥ frontend C3-<feature>, then HOST. Track logs: [step8-backend.md](step8-backend.md) (backend, merged at `a2661fcb`) and [step8-c3-merge.md](step8-c3-merge.md) (frontend C3 groups A/B/C on Alex's laptop; group logs [step8-c3a.md](step8-c3a.md), [step8-c3b.md](step8-c3b.md), [step8-c3c.md](step8-c3c.md)). Previous step: [step7.md](step7.md).

Machine: Lenovo worker (10 cores, 14 GB). Gates ran one at a time in the foreground. Node 26.2.0 (`/home/jake/.local/opt/node-v26.2.0-linux-x64/bin`) was first on PATH for the gates and HOST. The HOST container was a disposable one on this machine. 192.168.0.84 and live installs were not used (see "*arr instances" under HOST).

## Merge

| Branch | Tip | Merge commit on `restructure/integration` |
|---|---|---|
| (base) `restructure/integration`, backend step 8 merged (`a2661fcb`, log `90625cb2`) | `90625cb2` | n/a |
| `laptop/fe-c3` = `restructure/fe-c3` from Alex's laptop: C3 groups B (`e2a95b0c`), A (`448fd53b`) and C (`5adf5d6a`) merged onto C2 (`7fdcc563`), log `42569d85` | `42569d85` | **`5c1b88f5`** `merge: restructure step 8 frontend (C3)` (`--no-ff`) |

**Conflicts: none.** The merge applied cleanly: 348 files, +5900 / −1724.
- The merge base is `7fdcc563` (C2's log, already in integration since step 7). Since then the backend side changed 301 paths and the frontend side 348. `comm -12` on the two sorted path lists is empty: no file was changed on both sides.
- **Backend path-only edits in tests/frontend:** `bootstrap-media-tags-portable.test.mjs` (S2.10's `Shared/MediaTags/MediaTagsPortable.cs` path) and `features-admin-config-schema.test.mjs` (S2.8). The frontend track touched neither, and both only read C# files that C3 does not move. The merged files are the backend versions. `tests/frontend/helpers/discovery.mjs` and `tests/browser/playwright.config.cjs` (`JE_BROWSER_WORKERS`) are backend-only changes too.
- **Baselines** (blob ids):

| file | base `7fdcc563` | backend `90625cb2` | frontend `42569d85` | merged |
|---|---|---|---|---|
| `tests/frontend/architecture/boundary-baseline.json` | `a227861` (85) | `a227861` | `1e85ce3` (34) | `1e85ce3`: only the frontend lowered it; no key added, none raised |
| `tests/frontend/architecture/size-baseline.json` | `3367946` | `3367946` | `7480f9f` | `7480f9f` (only C3-A changed it) |
| `tests/frontend/architecture/generated-markers-baseline.json` | `3d9e700` | `3d9e700` | `3d9e700` | identical |
| `artifacts/restructure-plan/baselines/*` | | changed only by the backend/step-7 side | untouched | backend version |

- **Generated outputs** (`js/**`, maps, `client/generated-manifest.json`, inventory/ledger): auto-merged by git with no conflict; nothing was hand-merged. The `all` gate's FE G step (typecheck, `client:build`, `inventory:rewrite`, `client:check`, `inventory:rewrite:check`) regenerated them and left the working tree unchanged, so the merged outputs equal a fresh build.
- **Logs:** `step8-c3-merge.md`, `step8-c3a.md`, `step8-c3b.md`, `step8-c3c.md` (frontend) and `step8-backend.md` are all kept unchanged.

## Gates (merged tree `5c1b88f5`)

| gate | result | detail |
|---|---|---|
| `restructure-gates.sh all` | **PASS** (exit 0, 241 s) | B: one build warning, the baselined CS8604 (`Features/Bookmarks/JeBookmarksController.cs(50,45)`). T (`dotnet test`): total 3193 (baseline 2980), passed 3192 (2979), failed 1 = the baselined one. npm: total 3787 (3745), passed 3778 (3736), failed 9 = the 9 baselined. client-build tests 211/211, bootstrap manifest 2/2. Architecture ratchets passed with no "improved" diagnostic. INV, TOOL and FE G passed; component-scripts.json and `client/entries` output keys match restructure-base. Working tree clean afterwards. |
| `restructure-gates.sh browser` | **PASS** on the second run, see below | 693 tests at 6 workers: 638 passed, 52 failed (the listed 52 exactly), 3 skipped, 507 s |
| `restructure-gates.sh inv` | **PASS** | `generate.py --check` current; route list equals `baselines/inventory-routes.txt` |
| `restructure-gates.sh tool` | **PASS** | tooling unittest passed; mutation/history path check equals `baselines/mutation-check.txt` |

The known `ApiSeerrProxyOutcomeTests.RealSocketWriteOnAReusedConnectionIsSentOnce` flake did not fail.

### BROWSER

- **Run 1: FAIL** (exit 1, 511 s): 637 passed, 53 failed, 3 skipped. The one failure not in the list was the known flake `[mobile-chromium] › tests/browser/discovery-recommendations-rewrite.spec.cjs:70:1`, with the same symptom as at step 7: the infinite-scroll `expect.poll` at line 81 still saw 360 cards after its 5 s timeout. It passed on chromium and firefox in the same run.
- **Isolated rerun:** `npx playwright test --config tests/browser/playwright.config.cjs tests/browser/discovery-recommendations-rewrite.spec.cjs:70 --project=mobile-chromium --repeat-each 30 --workers 6` passed 30/30 (8.9 s).
- **Run 2** (full gate, unchanged tree): **PASS**. 638 passed, 52 failed, set identical to `baselines/browser-failures.txt` (no "listed but did not fail" note), 3 skipped, 507 s.
- `tag-fit-monotonic.spec.cjs:93` did not fail in either run.
- **No baseline was changed.**

### BROWSER on each C3 merge's merged result (bundle rule (b)(1))

The span since the step-7 checkpoint has four C3 merges. The laptop ran BROWSER on `5adf5d6a` (the final fe-c3 tree), and the groups ran it on their own branches. To cover every merge's own result, the two intermediate trees were run here too, in a scratch detached worktree (with this checkout's `node_modules` symlinked; `package.json`/lock identical, and `tests/browser` differs from HEAD only by the backend's `JE_BROWSER_WORKERS` line and README), `npx playwright test --workers=6`, compared with `browser-failures.txt` the same way as the gate (`browser_results` → `comm`). The worktree was removed after each run.

| C3 merge | tree | result | where |
|---|---|---|---|
| group B | `e2a95b0c` | 638 passed / 52 failed / 3 skipped; 0 new, 0 listed-but-passed | here, 511 s |
| group A | `448fd53b` | 638 / 52 / 3; 0 new, 0 listed-but-passed | here, 510 s |
| group C | `5adf5d6a` | 638 / 52 / 3; identical to the list | laptop ([step8-c3-merge.md](step8-c3-merge.md)) |
| into integration | `5c1b88f5` | 638 / 52 / 3 (run 2 above) | here |

## HOST (step-8 checkpoint)

- `scripts/restructure-gates.sh image`: `jellyfin/jellyfin:12.4 = jellyfin/jellyfin@sha256:b45218a461bf9663a4076d467e57f168ea54bc62bc20c7481ab43c4ba338575d`, passed.
- **Server:** `je up rs8host 18568 --image jellyfin/jellyfin:12.4 --no-warm` created the disposable `je-lab-rs8host` from the golden lab snapshot, bound to `127.0.0.1:18568` on network `je-perf-real-net`. As at step 7, `je up`'s own deploy build failed before touching the server (S1-d, `Directory.Build.targets` frontend check in a clean snapshot without `node_modules`).
- **Plugin:**
  - Built from the merged checkout (clean, `5c1b88f5`) with `dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf12 --no-incremental -o <scratch>`: 0 errors, 1 warning (the baselined CS8604). DLL sha1 `1f7bfbf0…4baecd22`.
  - Installed as `je deploy` does: `docker stop`, copy the DLL to `config/plugins/JellyfinEnhanced_12.8.0.0/` (sha1 identical), write the skill's `meta.json`, `docker start`. `/health` Healthy and `public-config` 200 after about 6 s.
- **Disposable-server config changes** (this container only; removed with it):
  - ***arr instances:** the golden snapshot's `SonarrUrl`, `RadarrUrl`, `SonarrInstances` and `RadarrInstances` point at `192.168.0.84`. To keep to "never use 192.168.0.84", the instances were set `Enabled=false` with empty URL/key before any page was opened. The logs confirm no request to 192.168.0.84 was ever made. The lab *arr rig is not running on this Lenovo. So Calendar and Downloads were checked with no *arr: Calendar shows "No upcoming releases" (no events, unlike step 7).
  - `ActivityFeedUseNativeTab`, `CatchUpEnabled` and `CatchUpUseNativeTab` set to true. Activity and Catch Up only mount as a custom or native tab, and the snapshot has both off.
  - One bookmark added for `real-admin` (*101 Dalmatians II* at 754 s, label "HOST step 8 check"), as at step 7.
- Seerr: the snapshot is configured with the lab Seerr `je-perf-real-seerr` (local container, `127.0.0.1:18491`), which was up, so the Seerr pages were checked. Nothing was requested.

| Check | Result | Evidence |
|---|---|---|
| Plugin loads, no JE errors | **PASS** | Server log: `Loaded plugin: "Jellyfin Enhanced" "12.8.0.0"`, `Jellyfin Enhanced v12.14.0.0 initialized`, `Jellyfin Enhanced Startup Task run successfully`. No JE `[ERR]` or `[WRN]` in the server log for the whole session. The plugin log has no error or warning lines (tag cache full build of 4,845 items in 37 s; CDN refreshed 32/32). `GET /Plugins`: `Jellyfin Enhanced 12.14.0.0 Active`. No JE console error or page error in the browser. The server `[ERR]` lines are all lab data or environment: missing `/tv/.../poster.jpg` files (14), FFmpeg exit 254 on a library item whose file is not on the NFS share (3 + keyframe extractor 1), and one `POST /Sessions/Playing/Stopped` "Unexpected end of request content" when the headless page was torn down mid-playback. Failed browser requests: `403` from `api.github.com/…/js/locales` (external rate limit, as at steps 6–7), 404s for lab poster/Disc images, and the HLS 500s from that missing file. |
| Bundle check | **(a) PASS; (b) PASS under rule (b)(1)/(2)** | See below. |
| Admin page renders | **PASS** | `#/configurationpage?name=Jellyfin%20Enhanced`: v12.14.0.0 header, 14 section tabs (Overview … Docs), What's New. [step8-host-admin-page.png](step8-host-admin-page.png) |
| BUG-001 (admin Media Tags section) | **Unchanged** | Media Tags tab: still "Loading Media Tags settings…" after 15 s, 0 `.je-tag-admin [role="tab"]`. Not investigated. [step8-host-admin-media-tags.png](step8-host-admin-media-tags.png) |
| User settings panel renders | **PASS** | `JE.showEnhancedPanel()`: Version 12.14.0.0, 11 tabs (Shortcuts … About). [step8-host-settings-panel.png](step8-host-settings-panel.png) |
| Media Tags hub | **PASS** | Panel → Media Tags: `#jeMediaTagsHub` with Layout, Groups, Status badges, Rules & locks, Colours, Server (Admin), live preview (Resting/Hover), Corners/Bands/Caption/Summary/Minimal. [step8-host-media-tags-hub.png](step8-host-media-tags-hub.png) |
| Poster with tags | **PASS** | Movies library: 100 of 100 rendered cards have tag hosts (`je-tag-host`, `je-tag-slot`, `rating-tag`, …). *101 Dalmatians II* shows 1080p, WEB, H264, Dolby Digital+ 5.1, language flags, ratings and the review icon. [step8-host-tagged-poster.png](step8-host-tagged-poster.png) (one card) |
| Hidden Content settings | **PASS** | Panel → Hidden Content: Enable Content Hiding, Show Hide Buttons, Show Confirmation Dialog, and the Hide Button Visibility rows (Seerr, Library Views, Detail Pages, Cast/Actors, Filter Library). [step8-host-hidden-content-settings.png](step8-host-hidden-content-settings.png) |
| Bookmarks | **PASS** | `#/bookmarks`: the item card with poster, "1 bookmark(s)", the row (12:34, play/edit/delete), Find Duplicates / Cleanup Orphaned / Delete All. [step8-host-bookmarks.png](step8-host-bookmarks.png) |
| Calendar | **PASS** (no *arr, see above) | `#/calendar`: Agenda 9 Nov → 8 Dec, Day/Week/Month/Agenda, OR/AND/NOT and the filter legend, "No upcoming releases". No `.je-calendar-error`. [step8-host-calendar.png](step8-host-calendar.png) |
| Downloads | **Renders, with a pre-existing loading issue** | `#/downloads`: the Downloads, Requests (All/Pending Approval/Processing/Coming Soon/Available), Issues and History sections render, but their 28 skeleton cards never resolve. This happens on the pre-merge and `restructure-base` builds too, so it is not from C3 or the restructure. See "Product bugs". [step8-host-downloads.png](step8-host-downloads.png) |
| Activity | **PASS** | Home native tab `#/home?tab=3&jeTab=activity`: Activity with Active Streams ("No Active Streams"), Watch History, Reviews (rb-reviewer-1/2, real-admin). [step8-host-activity.png](step8-host-activity.png) |
| Catch Up | **PASS** | Home native tab `#/home?tab=2&jeTab=catchup`: Catch Up deck (Movies/Shows, *Kronk's New Groove* card with its actions) and the Activity side panel. [step8-host-catchup.png](step8-host-catchup.png) |
| Seerr discovery | **PASS** | `#/search?query=Odyssey`: "Discover on Seerr" row with movie/series/collection cards. [step8-host-seerr-search.png](step8-host-seerr-search.png) |
| Seerr details | **PASS** | A Seerr card's More Info modal for *The Odyssey* (2026): status badge, ratings, facts table, links, overview, crew, cast, and the spoiler-guard toggle (`appendSeerrToggle`, the C3 seerr/spoiler-guard seam). [step8-host-seerr-details.png](step8-host-seerr-details.png) |
| Player OSD | **PASS** | *A Bug's Life* (its file exists on the share; *101 Dalmatians II*'s does not, so it fails in FFmpeg): `#/video` playing (`currentTime` 4.8 s, readyState 4), OSD visible with JE's OSD rating chips (`je-osd-rating-container`, tomato 92 %, star 7.0) and the active-streams indicator. [step8-host-player-osd.png](step8-host-player-osd.png) |
| JE scheduled tasks, original names | **PASS** | `GET /ScheduledTasks`: 15 in category "Jellyfin Enhanced" (`JellyfinEnhancedAnalyticsReport` "Send Anonymous Usage Report" … `JellyfinEnhancedStartup` "Jellyfin Enhanced Startup"). The sorted multiset of the 15 Keys and 15 Names equals the 30 `Key =>`/`Name =>` literals in `restructure-base` (`LC_ALL=C sort`, `diff` empty). |
| `/api-docs/openapi.json` | **PASS** | 200, OpenAPI 3.0.4, 474 paths, **180** under `/JellyfinEnhanced` (same as steps 1, 6 and 7). |

Screenshots: 1400×900 headless Chromium at scale 2, as `real-admin`, with the skill's `docs-shots.mjs` and scratch step scripts (not committed). The seven shots over 1.5 MB (activity, catch-up, settings panel, Media Tags hub, Hidden Content and the two Seerr shots, all with photo backdrops) were halved to 1400 px wide to keep the commit small. Locators: `button.jellyfin-tab-button` (admin), `#jellyfin-enhanced-panel button.tab-button[data-tab=…]` (panel), `.card[data-id]` (poster), `?tab=N&jeTab=<id>` (native tabs).

Note on the home native tabs: at 1400 px all `.emby-tab-button`s in the home strip (Jellyfin's Home and Favourites as well as JE's Catch Up and Activity) have no box, so they were opened through the deep link. On that cold deep-link load, jellyfin-web logs `[Home] failed to get tab controller Error: Cannot find module './'` (its home controller has no module for index 2/3), and JE then shows the tab. JE's `native-tabs.ts` logic is unchanged since `restructure-base` (one import line), and C3 changed only how the facade is published (`chromeContext(JE, ['nativeTabs']).own.nativeTabs`). This is recorded as an observation, not as a new bug.

### Bundle check

- **(a) Packaging: PASS.** The served `GET /JellyfinEnhanced/bundle.js` (200, 4,428,836 bytes) and the in-process `restructure-gates.sh bundle` dump on `5c1b88f5` (4,428,836 bytes) have identical hashes: stable `6e9cd2af…444d`, comment-stripped `e1e42dfc…6231`. It was re-fetched after the A/B builds below were swapped out again, with the same hashes.
- **(b) No unexpected drift.** The span since the step-7 checkpoint (`46387f9c`) contains C3, so (b) is checked per kind:
  - **(1) Each C3 merge passed BROWSER on its merged result:** `e2a95b0c`, `448fd53b` (here), `5adf5d6a` (laptop) and `5c1b88f5` (here). See the table above.
  - **(2) Backend merges in the span leave the bundle inputs alone.** The only backend merge is `a2661fcb`. `git diff --quiet a2661fcb^1 a2661fcb -- Jellyfin.Plugin.JellyfinEnhanced/js client` exits 0, and no merge in the span touches `ClientScriptBundle.cs`.
  - **Cross-check:** `46387f9c..90625cb2` changes nothing under `js/` or `client/`. All bundle drift since step 7 comes from `90625cb2..5c1b88f5`, the C3 merge (257 `js/` files).
- **Appended** `step8 6e9cd2af63f4960c3b9aec3399866bb6b5ce717254ac4acb225aa6c19558444d e1e42dfceb86c1b6057a2489ace3de175f6fcbc86e1d523b8fe472e7ca506231` to `baselines/bundle-checkpoints.txt`, in this log's commit.

### Cleanup

- `je rm rs8host` removed the container `je-lab-rs8host` and `/home/jake/je-lab/rs8host`, which held its config: the *arr/tab changes and the test bookmark. Confirmed: `docker ps -a --filter name=rs8host` and `docker ps --filter label=je.lab=1` are empty, and the directory is gone.
- Port: nothing listens on 18568, and `curl 127.0.0.1:18568/health` cannot connect (exit 7).
- Volumes (42), networks (4) and the container list (27) equal the snapshots taken before `je up`. The unrelated `je-perf-real-seerr` and other stopped containers were not touched.
- **Temporary auth state removed:** `/tmp/je-docs/tools/state-real-admin-18568.json` (Playwright login state), and `.notes/tok-admin` and `.notes/.tok-admin.lock` (the `je api` token, which did not exist before this run).
- **Caches and scratch removed:** this checkout's je build cache `~/.cache/je-lab/build/9fa5bbccb3f2` (from `je up`'s failed build), the scratch plugin builds (merged, pre-merge and base), the bundle dumps, the raw screenshots and the scratch worktrees (`git worktree list` shows only the main checkout). The cache list differs from the before snapshot only by `d60ad92d4d29`, which another session's running `je check` created at 18:21. It was left alone.
- `.notes/je.json` still names `rs8host` as this checkout's last server. It holds no credentials.
- The BROWSER fixture servers stopped with each run. Ports 4179 and 4195 are free.

## Product bugs

**No new bug from this step.** BUG-001 (admin Media Tags section never finishes loading) is unchanged.

**Newly observed, pre-existing (not caused by the restructure): Downloads page stays on skeleton cards.**
- Symptom: `#/downloads` renders its section headers, but all 28 skeleton cards stay for at least 30 s. This happens even though every data call returns 200, and `arr/requests` has data (e.g. *Steven Universe*, Approved). No console or page error.
- Repro: a lab server from the golden snapshot, with the *arr instances disabled (`Enabled=false`, empty URL/key) and Seerr on `je-perf-real-seerr`. Sign in as `real-admin`, open `#/downloads`, wait 30 s. `/JellyfinEnhanced/arr/queue` → `{"items":[],"errors":[]}`, `arr/history` → `{"items":[],"totalPages":0,"visible":true}`, `arr/requests?take=12&skip=0&filter=` → requests, `jellyseerr/issue` → 0 results.
- A/B on the same server: the pre-merge build (`90625cb2`, DLL `b06b2774…`) and the `restructure-base` build (DLL `bc496f50…`) show the same 28 skeletons. So it predates the restructure (it is from the rewrite, or depends on this config without *arr). It was not investigated further or fixed. It may not reproduce with a reachable *arr. Step 7 did not check Downloads.

## Deviations

1. **192.168.0.84 *arr disabled on the disposable server** (see HOST). Calendar was therefore checked without events, and Downloads without *arr data.
2. **Extra BROWSER runs** on the intermediate fe-c3 merges `e2a95b0c` and `448fd53b`, so that every C3 merge has BROWSER on its merged result. They ran in scratch worktrees with this checkout's `node_modules`.
3. **A/B plugin swaps** on the disposable server (pre-merge and `restructure-base` builds) for the Downloads symptom. The merged DLL was reinstalled afterwards (sha1 `1f7bfbf0…`, served bundle hashes re-checked) before the final Downloads screenshot and the log sweep.
4. **Activity/Catch Up native tabs and CatchUp were enabled** on the disposable server so the pages could mount.
