# Step 7 log: frontend merged, re-gated, HOST checked (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 7: backend S2.6–S2.9 ∥ frontend C1 → C2, then HOST. The track logs are [step7-backend.md](step7-backend.md) and [step7-frontend.md](step7-frontend.md). Machine: Lenovo worker (10 cores, 14 GB). Gates ran one at a time. The HOST container was a disposable one on this machine. 192.168.0.84 and live installs were not used.

## Merge

| Branch | Tip | Merge commit on `restructure/integration` |
|---|---|---|
| (base) `restructure/integration`, backend track already merged (`cb6fd240`, log `43a44ed5`) | `43a44ed5` | n/a |
| `laptop/fe-c` = `restructure/fe-c` from Alex's laptop (C1 `dc511b54`, C2 `362d8e7e`, log `7fdcc563`), branched from `5f62106c` | `7fdcc563` | **`6346f156`** `merge: restructure step 7 frontend (C1–C2)` (`--no-ff`) |

**Conflicts: none.** The merge applied cleanly: 628 files, including the 17 host renames.
- **The known overlap did not overlap in git.** The backend track edited `tests/frontend/features/features-admin-config-schema.test.mjs` (S2.8, paths only). The frontend track never touched it (`git diff 5f62106c laptop/fe-c` on that file is empty), so the merged file is the backend version.
- The two tracks' changed-path sets (76 backend, 628 frontend, both since `5f62106c`) have no file in common.

**Baselines, merged vs each side** (blob ids):

| file | backend `43a44ed5` | frontend `7fdcc563` | merged | rule |
|---|---|---|---|---|
| `tests/frontend/architecture/boundary-baseline.json` | `e9df1f3` (= base, 502 violations) | `a227861` (85) | `a227861` | the frontend's lowered file, which is ≤ the backend's for every key |
| `tests/frontend/architecture/size-baseline.json` | `3367946` | `3367946` | `3367946` | identical |
| `tests/frontend/architecture/generated-markers-baseline.json` | `3d9e700` | `3d9e700` | `3d9e700` | identical |
| `baselines/browser-failures.txt` (52) and `baselines/README.md` | added/edited by the backend track | absent / base | backend version | only the backend track changed them |
| every other `baselines/*` | identical on both sides | | identical | |

No key is higher than either side. No logic outside the merge was edited.

## Gates (merged tree `6346f156`)

| gate | result | detail |
|---|---|---|
| `restructure-gates.sh all` | **PASS** (exit 0, 243 s) | B: one build warning, the baselined CS8604 (`Features/Bookmarks/JeBookmarksController.cs(50,45)`). G passed. T (`dotnet test`): total 3193 (baseline 2980), passed 3192 (2979), failed 1 = the baselined one. npm: total 3787 (3745), passed 3778 (3736), failed 9 = the 9 baselined. No "listed but did not fail" notes. INV, TOOL and FE G passed. The working tree was unchanged afterwards. |
| `restructure-gates.sh browser` | **PASS** on the second run, see below | 693 tests at 6 workers: 638 passed, 52 failed (the listed 52 exactly), 3 skipped, 396 s |
| `restructure-gates.sh inv` | **PASS** | `generate.py --check` current, and the route list equals `baselines/inventory-routes.txt` |
| `restructure-gates.sh tool` | **PASS** | tooling unittest passed, and the mutation/history path check equals `baselines/mutation-check.txt` |

The counts equal the track logs' calibration: backend 3193/3192, frontend 3787/3778.

### BROWSER (the 52-entry ratchet)

- **Run 1: FAIL** (exit 1, 399 s): 637 passed, 53 failed, 3 skipped. One failure was not in the list: `[mobile-chromium] › tests/browser/discovery-recommendations-rewrite.spec.cjs:70:1 › generated discovery and recommendations page, filter, sort, paginate, close and leave no account data`. It failed at line 81, an `expect.poll` that waits for infinite scroll to add cards after `scrollTo(bottom)`: still 360 cards after the 5 s poll timeout. The same test passed on chromium and firefox in that run.
- **Why this is a flake and not the merge:**
  - The spec loads core/*, `enhanced/helpers.js`, `jellyseerr/*` and the discovery/recommendations outputs, and no bookmarks file.
  - Between `43a44ed5` (pre-merge) and `6346f156`, the only built `.js` files with any change besides `// client/src/` comment lines are the 8 `js/enhanced/bookmarks/*.js` outputs (C2).
  - Every file the spec loads differs from the pre-merge tree only in comment lines (C1's check O).
- **Isolated rerun:** `npx playwright test … --project=mobile-chromium --repeat-each 30 --workers 6` on that test passed 30/30 (9.3 s).
- **Run 2** (the full gate, unchanged tree): **PASS**. 638 passed, 52 failed, set identical to `baselines/browser-failures.txt`, 3 skipped, 396 s.
- **No baseline was changed.** The flaky test is not added to the list. If it recurs, step 8 should look at the 5 s poll under 6 workers.
- The run used the default port 4179. Afterwards nothing listens on 4179 and no `tests/browser/server.cjs` process is left.

This is C2's BROWSER on its merged result, which bundle rule (b)(1) needs below.

## HOST (step-7 checkpoint)

- `scripts/restructure-gates.sh image`: `jellyfin/jellyfin:12.4 = jellyfin/jellyfin@sha256:b45218a461bf…575d`, passed.
- **Server:** `je up rs7host 18567 --image jellyfin/jellyfin:12.4 --no-warm` created the disposable `je-lab-rs7host` from the golden lab snapshot, bound to `127.0.0.1:18567`. `je up`'s own deploy build failed before touching the server (S1-d: clean clone without `node_modules`, so `Directory.Build.targets`' frontend check fails, and `-warnaserror` would also fail on the baselined CS8604).
- **Plugin:**
  - Built from the merged checkout (clean, `6346f156`) with `dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf12 --no-incremental -o <scratch>`: 0 errors, 1 warning (the baselined CS8604). DLL sha1 `efb36433…8391`.
  - Installed as `je deploy` does: `docker stop`, copy the DLL to `config/plugins/JellyfinEnhanced_12.8.0.0/` (sha1 identical), write the skill's `meta.json`, `docker start`.
  - `/health` Healthy and `public-config` 200 after 4 s.

| Check | Result | Evidence |
|---|---|---|
| Plugin loads, no JE errors | **PASS** | Server log: `Loaded plugin: "Jellyfin Enhanced" "12.8.0.0"`, `Jellyfin Enhanced v12.14.0.0 initialized`, `Startup Task completed successfully`. 0 `[ERR]` lines after the restart, and no JE `[WRN]`. The plugin's own log has no errors (the tag cache started a full build of 4,845 items, and the CDN refreshed 32/32 assets). `GET /Plugins`: `Jellyfin Enhanced 12.14.0.0 Active`. In the browser there were no page errors. The only failed requests: a `403` from `api.github.com/…/js/locales` (an external rate limit, as at step 6), and a single 404 resource load in the first session. The 404 did not recur in a second session that logged every ≥400 response across home, the admin page, Movies, Bookmarks and Calendar, so its URL is unknown. Steps 1 and 6 traced their 404s to lab-data poster images. |
| Bundle check | **(a) PASS; (b) PASS under rule (b)(1)/(2)** | See below. |
| Admin page renders | **PASS** | `#/configurationpage?name=Jellyfin%20Enhanced`: v12.14.0.0 header, section nav (14 tabs), What's New. [step7-host-admin-page.png](step7-host-admin-page.png) |
| User settings panel renders | **PASS** | `JE.showEnhancedPanel()`: Version 12.14.0.0, 11 tabs (Shortcuts … About), Shortcuts active. [step7-host-settings-panel.png](step7-host-settings-panel.png) |
| Media Tags hub | **PASS** | Panel → Media Tags: `#jeMediaTagsHub` with Layout, Groups, Status badges, Rules & locks, Colours and Server (Admin), the live preview, and Corners/Bands/Caption/Summary/Minimal. [step7-host-media-tags-hub.png](step7-host-media-tags-hub.png) |
| Poster with tags | **PASS** | Movies library: 100 of 100 rendered cards have tag hosts. *101 Dalmatians II* shows 1080p, WEB, H264, Dolby Digital+ 5.1, language flags, ratings and genre icons. [step7-host-tagged-poster.png](step7-host-tagged-poster.png) (one card, cropped like steps 1 and 6) |
| Hidden Content settings | **PASS** | Panel → Hidden Content: Enable Content Hiding, Show Hide Buttons, Show Confirmation Dialog, and the Hide Button Visibility rows (Seerr, Library Views, Detail Pages, Cast/Actors, Filter Library) with their stored states. [step7-host-hidden-content-settings.png](step7-host-hidden-content-settings.png) |
| Bookmarks page (the C2 pilot) | **PASS** | `#/bookmarks` first rendered its empty state. To exercise the converted path with data, one bookmark was added for `real-admin` on this disposable server only (`POST /JellyfinEnhanced/user-settings/{id}/bookmark.json/add`, *101 Dalmatians II* at 754 s, label "HOST step 7 check"). After a reload the page showed the item card with its poster, "1 bookmark(s)", the bookmark row (12:34, play/edit/delete), and Find Duplicates / Cleanup Orphaned / Delete All. At runtime `JE.internals` has `bookmarksLibrary` and `bookmarkLifetimes`, and `JE.bookmarks` exposes 12 members: the same runtime keys as before C2. [step7-host-bookmarks.png](step7-host-bookmarks.png) |
| Calendar page | **PASS** | `#/calendar`: Agenda 9 Nov → 8 Dec with the Day/Week/Month/Agenda controls, the filter legend, and Radarr/Sonarr events. No `.je-calendar-error`. [step7-host-calendar.png](step7-host-calendar.png) |
| JE scheduled tasks, original names | **PASS** | `GET /ScheduledTasks`: 15 in category "Jellyfin Enhanced", the same list as step 1 (`JellyfinEnhancedAnalyticsReport` "Send Anonymous Usage Report" … `JellyfinEnhancedStartup` "Jellyfin Enhanced Startup"). The sorted multiset of the 15 Keys and 15 Names equals the 30 `Key =>`/`Name =>` literals in `restructure-base`. |
| `/api-docs/openapi.json` | **PASS** | 200, OpenAPI 3.0.4, 474 paths, **180** under `/JellyfinEnhanced` (same as steps 1 and 6). |

Screenshots: 1400×900 headless Chromium at scale 2, as `real-admin`, with the skill's `docs-shots.mjs` and a scratch step script (not committed). Locators: `button.jellyfin-tab-button` (admin), `#jellyfin-enhanced-panel button.tab-button[data-tab="media-tags" | "hidden-content"]` (panel), and `[data-url="#/bookmarks"]` / `[data-url="#/calendar"]` (pages).

**Not re-checked:** the admin page's Media Tags section. It has hung on "Loading Media Tags settings…" since before step 6 (step6-frontend.md finding). This step's brief did not list it, so it is still open.

### Bundle check

- **(a) Packaging: PASS.** The served `GET /JellyfinEnhanced/bundle.js` (200, 4,328,469 bytes) and the in-process `restructure-gates.sh bundle` dump on `6346f156` (4,328,469 bytes) have identical hashes. Stable `d7ab1c35…6888`, comment-stripped `ac3a33b1…b6a`.
- **(b) No unexpected drift.** The span since the step-6 checkpoint (`2872d78c`) contains C1 and C2. C2 is in the plan's "B3, B4, C2 or C3" list, so (b) is checked per kind, not by hash:
  - **(1) C2 passed BROWSER on its merged result:** run 2 above, identical to the 52-entry list. Run 1's single extra failure is outside the bookmarks code and passed 30/30 in isolation (above).
  - **(2) Backend merges in the span leave the bundle inputs alone.** The only backend merge is `cb6fd240`. `git diff --quiet cb6fd240^1 cb6fd240 -- Jellyfin.Plugin.JellyfinEnhanced/js client` exits 0, and that merge does not touch `ClientScriptBundle.cs`. The frontend merge does not touch it either.
  - **Cross-check:** `2872d78c..43a44ed5` changes nothing under `js/` or `client/`. In `43a44ed5..6346f156`, the only built `.js` files with changes besides `// client/src/` comment lines are the 8 `js/enhanced/bookmarks/*.js` outputs. That is exactly C2's stated change, and C1 is comment-only (its check O). So the bundle drift is C2's, as expected.
- **Appended** `step7 d7ab1c35b7d33f2b0de0f5be1ae3528e5609c8fcf2edd58a6845395a83026888 ac3a33b11eff63a520d928ef88e6caf2bccc1d930c36a2e28c264b4f19206b6a` to `baselines/bundle-checkpoints.txt`, in this log's commit.

### Cleanup

- `je rm rs7host` removed the container `je-lab-rs7host` and `/home/jake/je-lab/rs7host`, which held its config with the test bookmark. Confirmed: `docker ps -a --filter name=rs7host` and `docker ps --filter label=je.lab=1` are empty, and the directory is gone.
- Port: nothing listens on 18567, and `curl 127.0.0.1:18567/health` cannot connect (exit 7).
- Volumes (42), networks (4) and the container list (26) equal the snapshots taken before `je up`. None were created or left behind. The unrelated `je-perf-real-seerr` and other sessions' stopped containers were not touched.
- **Temporary auth state removed:**
  - `/tmp/je-docs/tools/state-real-admin-18567.json` (the Playwright login state);
  - `.notes/tok-admin` (the `je api` admin token). It held step 6's stale token before this run, and `je api` rewrote it for 18567.
  - No `.tok-admin.lock` was left.
- **Caches and scratch removed:** this checkout's je build cache `~/.cache/je-lab/build/9fa5bbccb3f2` (created by `je up`'s failed build; the cache list equals the before snapshot), the scratch plugin build, the served and in-process bundle dumps, and the raw screenshots.
- `.notes/je.json` still names `rs7host` as this checkout's last server, the way it named `rs6host` after step 6. It holds no credentials.
- The BROWSER fixture server stopped with each run. Ports 4179 and 4187 are free.

## Notes for step 8

- **BROWSER flake to watch:** `[mobile-chromium] discovery-recommendations-rewrite.spec.cjs:70` (infinite-scroll `expect.poll`, 5 s, at 6 workers). It failed once and passed in the rerun and 30/30 in isolation. If it fails again, rerun with `--repeat-each` before treating it as a C3 regression. Don't add it to the list.
- **HOST at step 8** spans C3-<feature>, so rule (b)(1)/(2) applies again: each C3 merge needs BROWSER on its merged result, and backend merges S2.10–S2.13 must leave `js/` and `client/` alone.
- **The HOST procedure is unchanged:**
  - `je up` still fails its own build, so build and install by hand as above.
  - Use `--no-incremental` so the build shows its warning.
  - Bookmarks needs a test bookmark for a non-empty page. Add it on the disposable server only.
- **Open from step 6:** the admin page's Media Tags section request loop (pre-existing, not re-checked here).
- **Carried from step7-frontend.md "Notes for C3":**
  - `bookmarks.ts` is exactly at its size limit (849 lines).
  - The settings-panel facade must exist before C3-media-tags and C3-hidden-content can drop their `settings-panel/host.ts` imports.
  - catchup's `activity/host.ts` imports.
  - Never name a property `internals` outside a host file.
- **Backend (step7-backend.md):** the S2.12/S2.14/S2.15 notes still apply (the `ElsewhereDocumentTests` activator, the remaining `typeof(JellyfinEnhancedController)` lookups, and re-qualifying root `Services.` names).
