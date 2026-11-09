# Step 1 log: merged, re-gated, HOST checked (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 1, gates BE, FE, INV, TOOL and HOST. Machine: Lenovo worker. Gates ran one at a time, in the foreground.

## Merges

| Branch | Tip | Merge commit on `restructure/integration` |
|---|---|---|
| (base) `restructure/integration` | `9087893a` | n/a |
| `restructure/be-s0` (backend S0, 2 commits: `58ddc507`, `25e04ad5`) | `25e04ad5` | `8be7848a` |
| `restructure/fe-s1` (frontend S1, `24ee629e`) | `24ee629e` | `b40c8c81` |

Both merges are `--no-ff`. There were no conflicts: the file sets are disjoint (be-s0 touches `tests/backend/**`, `tests/inventory/generate.py` and `tests/runner/tests/test_regression.py`; fe-s1 touches `tests/frontend/architecture/**`). The docs commit that adds this log sits on top of `b40c8c81`. No tags were created and nothing was pushed.

## Gates on the merged tree (`b40c8c81`)

All four gates exited 0, and the tree stayed clean after the regenerating steps.

`scripts/restructure-gates.sh be`
```
B: 1 Warning(s), 0 Error(s)                       (the baselined CS8604; no new pair)
G: Passed!  - Failed: 0, Passed: 11, Total: 11      (tests/backend/Architecture, new in S0)
T: Failed!  - Failed: 1, Passed: 3192, Total: 3193
T (dotnet test): total 3193 (baseline 2980), passed 3192 (baseline 2979), failed 1 (baseline list 1)
F: coverage floors passed
npm test: total 3756 (baseline 3745), passed 3747 (baseline 3736), failed 9 (baseline list 9)
INV: Production inventory is current; route list == baselines/inventory-routes.txt
TOOL: Ran 16 tests ... OK; mutation/history path check passed
restructure-gates: be passed
```

`scripts/restructure-gates.sh fe`
```
INV: Production inventory is current
TOOL: Ran 16 tests ... OK
npm test: total 3756 (baseline 3745), passed 3747 (baseline 3736), failed 9 (baseline list 9)
component-scripts.json and client/entries output keys unchanged vs restructure-base
restructure-gates: fe passed
```

`scripts/restructure-gates.sh tool`: `Ran 16 tests … OK`, `tooling: passed`, `restructure-gates: tool passed`.
`scripts/restructure-gates.sh inv`: `Production inventory is current`, `restructure-gates: inv passed`.

The failing tests are the known baseline ones: 1 dotnet and 9 npm. The new tests account for the increases: dotnet +213 (S0 architecture, snapshot and routing tests) and npm +11 (S1 architecture tests, all in ratchet mode).

## HOST (first live Jellyfin 12 checkpoint)

- `scripts/restructure-gates.sh image`: `jellyfin/jellyfin:12.4 = jellyfin/jellyfin@sha256:b45218a461bf…` (passed).
- Server: `je up rs1host 18560 --image jellyfin/jellyfin:12.4 --no-warm`. This made the disposable `je-lab-rs1host` from the golden lab snapshot, bound to `127.0.0.1:18560`. `--no-warm` only skips the skill's background CI-cache warm-up. The 192.168.0.84 real-media server and live installs were not used.
- Plugin build and install: `je up`'s own deploy step failed before touching the server (see CHANGELOG S1-d). It builds a clean `HEAD` clone without `node_modules`, so the client check in `Directory.Build.targets` fails, and it uses `-warnaserror` against the one baselined CS8604. So the plugin was built from the merged checkout (clean tree, `b40c8c81`) with `dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf12`: 1 warning, the baselined CS8604. It was installed the way `je deploy` installs: stop the container, copy the DLL into `config/plugins/JellyfinEnhanced_12.8.0.0/` (sha1 `5117e78d…`, same as the build), write the skill's `meta.json`, start the container. `/health` was Healthy and `/JellyfinEnhanced/public-config` returned 200 within 5 s.

| Check | Result | Evidence |
|---|---|---|
| Plugin loads, no errors | **PASS** | Server log: `Loaded plugin: Jellyfin Enhanced 12.8.0.0` and `Jellyfin Enhanced v12.14.0.0 initialized`; the startup task ran successfully. `GET /Plugins`: `Jellyfin Enhanced 12.14.0.0 Active`. The JE plugin log (`JellyfinEnhanced_2026-11-09.log`) has 0 ERR/WRN/exception lines. The server log has 10 `[ERR]` lines. All 10 are Jellyfin core `Could not find file '/tv/…/poster.jpg'` for two series, *Smoking Behind the Supermarket with You* and *Love, Death & Robots*, so they are lab data, not the plugin. The first series' folder no longer exists on the read-only media mount, and the second has no `poster.jpg`. The same image URL without JE's tag suffix also returns 404. In the browser they are the only HTTP errors: 2 image 404s on home. Other WRN lines: the normal startup health check and `WebRootPath /wwwroot` notices. |
| Bundle check | **PASS** | Rule (a): the stable hash of the served `GET /JellyfinEnhanced/bundle.js` (200, 4,313,039 bytes) equals the in-process `restructure-gates.sh bundle` dump on the same commit: `533b5133…4cd6` stable, `d77bd132…7f23` comment-stripped. Both also equal the existing `step1` line in `baselines/bundle-checkpoints.txt`, which was recorded on `9087893a`, as expected for a test-only merge. Rule (b) does not apply, because this is the first checkpoint. No second `step1` line was appended, since that line already is this checkpoint's hash. |
| Admin page renders | **PASS** | `#/configurationpage?name=Jellyfin%20Enhanced` shows the v12.14.0.0 header, the section nav (Overview, Display, Media Tags, Elsewhere & Reviews, Playback, …) and the What's New list. Screenshot: [host-admin-page.png](host-admin-page.png) |
| Media Tags hub renders | **PASS** | Settings panel → Media Tags: `#jeMediaTagsHub` is visible with the tabs Layout, Groups, Status badges, Rules & locks, Colours and Server (Admin), and the live preview. Screenshot: [host-media-tags-hub.png](host-media-tags-hub.png) |
| Poster with tags renders | **PASS** | Movies library: all 100 rendered cards have tag hosts. The first, *101 Dalmatians II*, shows 1080p, WEB, H264, Dolby Digital+ 5.1, language flags and ratings. Screenshot: [host-tagged-poster.png](host-tagged-poster.png) |
| JE scheduled tasks, original names | **PASS** | `GET /ScheduledTasks` lists 15 tasks in the category "Jellyfin Enhanced". Their (Name, Key) pairs match the 15 `Name`/`Key` literals in `restructure-base` exactly: Send Anonymous Usage Report, Sync Tags from \*arr to Jellyfin, Sync Audio Language Tags to Jellyfin, Refresh Tag Cache, Refresh Translation Cache, Sync Watchlist from Jellyfin to Seerr, Import Jellyfin Users to Seerr, Sync Watchlist from Seerr to Jellyfin, Fetch Ratings from MDBList, Sync Ratings from MDBList to Jellyfin, Refresh Awards Tags, Refresh CDN Assets, Refresh Leaving Soon Tags, Spoiler Guard: apply to existing titles, Jellyfin Enhanced Startup (keys `JellyfinEnhanced*`). |
| `/api-docs/openapi.json` | **PASS** | 200, OpenAPI 3.0.4, 474 paths, of which 180 are under `/JellyfinEnhanced`. |

The screenshots were taken at 1400×900 with headless Chromium as `real-admin`, using the skill's `docs-shots.mjs` driver.

### Cleanup

- `je rm rs1host` removed the container `je-lab-rs1host` and `/home/jake/je-lab/rs1host`, which held its bind-mounted config and cache and its owner file. Confirmed: `docker ps -a --filter name=je-lab-rs1host` is empty, `docker ps --filter label=je.lab=1` is empty, and the directory is gone.
- Ports: nothing listens on 18560 (`ss -ltn`), and `curl 127.0.0.1:18560/health` fails to connect.
- Volumes: none created. `mk.sh` uses bind mounts only, and `docker volume ls` is identical before and after (42). Networks: none created. The server joined the existing `je-perf-real-net`, which was left as it was.
- Task-owned temporary files were removed too: the je build cache for this checkout (`~/.cache/je-lab/build/9fa5bbccb3f2`), the scratch plugin build output, the browser login state file for port 18560, and the `je api` tokens in `.notes/`.
- Unrelated containers, including `je-perf-real-seerr` and the stopped `je-lab-*` servers from other sessions, were not touched.

## Plan fixes (frontend.md, CHANGELOG "Step 1 execution notes")

1. **Baseline keys follow moves.** `boundary-baseline.json` and `size-baseline.json` are keyed by file path. Every step that moves client files renames the matching keys, with the same counts, in the same commit. This was added to the §3 step detail ("Baseline keys", plus a new C1 detail paragraph) and to the A1, A2, A3, B1, B2 and C1 briefs, and §5.2 references it. B2 was added to the requested list because it moves `media-tags/rules/media-language.ts`, which has a size-baseline entry.
2. **C4 strict mode.** Rule 4's allowlist now also covers the core platform hosts that stay in `host/` (core, api, dom, navigation, session, ui, admin-config, bootstrap-pages) and `core/lifecycle-entry.ts`, because they are platform, not features. This is written into §2.4 rule 4, the C4 table row, the C4 brief (update `globalAllowed` in `scan.mjs`) and §5.2.
3. **Recorded as open, not decided.** Two other S1-baseline entries would also block strict C4, and no step owns them: `host/bootstrap-pages-host.ts` has 3 rule-2 type imports from feature `types.ts` files, and `admin/config/page/media-tags-tab.ts` has 2 rule-3 internals reads. The C4 brief says to stop and report if they are still present.
