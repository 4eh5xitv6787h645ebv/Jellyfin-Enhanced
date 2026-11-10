# Merge log: bug-fix lanes B, C and D (2026-11-10)

Inputs, all based on `e7f75cda` and fetched from the laptop's bare repo:
- [bugfix-lane-c.md](bugfix-lane-c.md), `bugfix/lane-c` `4362e4d5`: BUG-017, 018, 019, 021, 022 (Seerr).
- [bugfix-lane-d.md](bugfix-lane-d.md), `bugfix/lane-d` `fe095dfa`: BUG-008, 009, 010, 011, 013, 016, 020.
- [bugfix-lane-b.md](bugfix-lane-b.md), `bugfix/lane-b` `b5087baf`: test-suite debt (tests, fixtures and baselines only). It was added to this merge by the coordinator after C and D had been merged and gated.

Machine: Lenovo worker, main checkout, Node 26.2.0 first on PATH.
- One dotnet build or test ran at a time, with `UseSharedCompilation=false` (also passed to MSBuild through the environment). Every gate ran with `JE_UPDATE_SNAPSHOTS` unset (`env -u`).
- `browser` ran as a harness-tracked background task that was waited on, with nothing else running. It used its own port (`JE_BROWSER_PORT=4211`).
- Nothing was pushed or tagged, and no attribution lines were added.

**Outcome: `restructure/integration` was NOT fast-forwarded.** It stays at `e8964868`. The BUG-011 fix only half holds on a live server (see [BUG-011](#bug-011-admin-hidden-content-add-search)), and the brief says to leave the merge on `bugfix/merge-cd` in that case. Everything else is green and verified live. The branch is ready to fast-forward once the coordinator decides on BUG-011.

## Commits (`bugfix/merge-cd`, from `restructure/integration` `e8964868`)

| SHA | Commit |
|---|---|
| `d5587ae8` | merge: bug-fix lane C (`--no-ff`) |
| `4fde9e56` | merge: bug-fix lane D (`--no-ff`) |
| `454f7e13` | test(hidden-content): wait for the admin search debounce before asserting (lane D's BUG-011 test; see below) |
| `c8088695` | merge: bug-fix lane B (`--no-ff`) |
| `8afbb154` | test(baselines): raise the test-count floors to the merged tree (dotnet 3238, npm 3863) |
| (this commit) | docs: merge bug-fix lanes B, C and D log. It adds this log, its screenshots and the `bugfix-bcd` line in `baselines/bundle-checkpoints.txt`. |

## Merge

**Lane C** conflicted in 4 generated paths and nothing else:
- `js/jellyseerr/ui/ui-season-modal.js.map`;
- the `min/js` twins of `ui-season-modal.js` and its map;
- `client/generated-manifest.json`.

Lane A's BUG-005 commit and lane C's BUG-021 commit both edited `client/src/features/seerr/core/ui/season-modal.ts`. Git merged the source cleanly: lane A's escaped toast title and lane C's `optionsFailed` handling are both present. The generated files were not hand-merged:
1. `checkout --ours`;
2. `npm run client:build && npm run inventory:rewrite`;
3. `client:check` and `inventory:rewrite:check` passed, with no conflict marker left. Regeneration changed only the conflicted files.

**Lane D** conflicted only in `client/generated-manifest.json`. It was resolved the same way, and both checks passed.

**Lane B** conflicted only in `artifacts/restructure-plan/baselines/browser-failures.txt`. The resolution keeps every removal from both sides, which is the intersection of C's list (43 left) and B's list (9 left). The intersection is empty: B's 9 remaining entries are exactly the Seerr tests that lane C fixed. So the file is now empty. Everything else merged cleanly. Lane B changes no product code (`git diff 4fde9e56 c8088695 -- client/src Jellyfin.Plugin.JellyfinEnhanced` is empty).

### Guard and failure baselines (all shrink only; `git diff e8964868 8afbb154`)

| File | Change |
|---|---|
| `baselines/browser-failures.txt` | 52 → **0** (B removed 43 fixture failures, C removed the 9 Seerr ones) |
| `baselines/npm-failures.txt` | 9 → **0** (B) |
| `baselines/dotnet-failures.txt` | 1 → **0** (B) |
| `tests/frontend/guards/error-as-empty-guard-baseline.json` | C's two keys (`installApi.fetchAdvancedRequestData`, `installApi.fetchIssuesForMedia`) and D's six (component-loader 1, reviews 2, downloads 1, hidden-content admin 2) are all removed. Nothing was raised. |
| `tests/frontend/guards/leak-guard-baseline.json` | D's `createLogoTags failedUrls` is removed |

**Test-count floors (raised to the merged tree's measured counts).** Lane B's 3212 / 3833 did not include lane A, C and D tests.

| Floor | Before | Lane B | Now |
|---|---|---|---|
| `dotnet-tests.txt` | 2980 total / 2979 passed | 3212 / 3212 | **3238 / 3238** |
| `npm-tests.txt` | 3745 / 3736 | 3833 / 3833 | **3863 / 3863** |

The baselines README was updated to match.

**Unchanged:**
- no snapshot, `*.base.json`, route/auth/registration/service snapshot or `tests/backend/Architecture/*` file;
- no `tests/frontend/architecture/*` baseline;
- `client/bundle-budget.json`.

(`git diff e8964868 8afbb154 -- tests/backend/Architecture tests/frontend/architecture client/bundle-budget.json` is empty.)

### Lane D's BUG-011 test race (fixed in `454f7e13`)

**Symptom.** On the C + D tree, `all` failed on one test not in the list: `features-hidden-rewrite.test.mjs` "admin add-items search shows an error, not "no matches", when the searches fail". The grid still showed `hidden_content_admin_add_hint`.

**Not a flake.** It failed 8 of 8 times in isolation, and also at lane D's own tip `fe095dfa` in a scratch worktree on this machine.

**Cause.** The test shrinks the 300 ms debounce to a 0 ms `setTimeout`, then waits only ten `setImmediate` turns. On this machine those turns finish before the timer fires, so the search never ran.

**Fix (test only).** The test now waits for one equal-delay timer first.
- 15 of 15 passes in a row, and 8 of 8 run in parallel.
- Both BUG-011 tests still fail with lane D's source fix reverted.
- No product code or baseline was touched.

## Gates

| Tree | Gate | Result |
|---|---|---|
| `4fde9e56` (C + D) | `all` | fail: the BUG-011 test race above |
| `454f7e13` (C + D) | `all` | **pass**, 5.0 min: dotnet 3238 / 3237 / 1 listed; npm 3862 / 3853 / 9 listed |
| `c8088695` (B + C + D) | `all` | **pass**, 5.5 min: dotnet **3238 total / 3238 passed / 0 failed** (list 0); npm **3863 / 3863 / 0** (list 0) |
| `c8088695` | `browser` | **pass**, 693 tests: **690 passed, 0 failed** (list 0), 3 skipped |
| `c8088695` | `size` | pass: raw **2,377,363** ≤ 2,494,625; gzip -9 **639,919** ≤ 671,156 (lane A: 2,376,204 / 639,483). No brotli CLI. |
| `c8088695` | `inv`, `tool`, `h` | pass |
| `c8088695` | jsdom on the minified twins (`JE_TEST_MIN_TWINS=1 node tests/frontend/run.mjs`) | 3863 / 3863 / **0 failed** |
| `8afbb154` (final, raised floors) | `all` | **pass**, 5.2 min: dotnet 3238 / 3238 (floor 3238), npm 3863 / 3863 (floor 3863), 0 failed |
| — | `image` | `jellyfin/jellyfin:12.4 = …@sha256:b45218a4…575d`, pass |

- **Expected failures are exactly the baselines: none in any suite.** No listed test failed in any run, so the gate printed no "listed but did not fail" note.
- **Flakes:** none. Every gate on the final tree passed on its first run, so the flake protocol was not needed. The C + D failure above was deterministic, not a flake.
- **Build warnings:** only the baselined `JeBookmarksController.cs(49,45) CS8604`.

## HOST (`8afbb154`)

**`je up`.** `je up mcd 18571 --image jellyfin/jellyfin:12.4` ran unmodified and reported `jf12: ok, 1 baselined warning(s)` and `deployed 8afbb154 … in 4s`.

**Isolation.** A scratch watcher ran beside `je up`. At 07:45:15, as soon as `je-lab-mcd` existed with the golden config copied and no plugin directory yet, it did four things:
1. **Sonarr and Radarr:** emptied `SonarrUrl`, `RadarrUrl` and both API keys, and set both instance lists to `Enabled=false` with an empty URL and key.
2. **Seerr:** pointed `JellyseerrUrls` at the dead local port `http://127.0.0.1:9` (key `lab-fake-key`, URL mappings emptied). The server therefore never talked to the shared `je-perf-real-seerr`.
3. Set `ActivityFeedUseNativeTab`, `CatchUpEnabled` and `CatchUpUseNativeTab` to true.
4. Inserted `iptables -I DOCKER-USER -s 172.18.0.3/32 -d 192.168.0.84/32 -j REJECT`, plus a second rule from the container to `je-perf-real-seerr` (`172.18.0.2`).

Results:
- After the edit, and again at the end, no file under the server's `config/` contained `192.168.0.84` or `je-perf-real-seerr`.
- The container kept `172.18.0.3` through every DLL swap; the swap script checked this after each restart.
- **Both REJECT rules read 0 packets when they were deleted.** No packet was sent to 192.168.0.84, and `je-perf-real-seerr` was not touched.
- Every Seerr answer the browser needed was faked with Playwright routes, and this is noted per bug. Real Seerr, Sonarr and Radarr were never used.

**A/B builds.** Scratch-worktree DLLs of `e8964868` (pre-merge integration) and `2abd5e3d` (BUG-003's commit) were swapped into the same server: stop, copy the DLL, start, health check.
- Each bug was triggered on the merged build and, where it was visible, on `e8964868` to show the symptom.
- The merged DLL was reinstalled before the smoke run.

### Per-bug live results

| Bug | Fixed live | Pre-fix (`e8964868`) | How |
|---|---|---|---|
| BUG-008 component manifest | **yes** (faked failure) | no retry; boot goes on with 3 scripts, silently | [below](#bug-008-component-script-manifest) |
| BUG-009 translation languages | **yes** (faked failure) | asked once; no Translate button on the next render | [below](#bug-009-and-bug-020-reviews) |
| BUG-010 issue media cache | **yes** (Seerr faked) | "Unknown" after refresh, one lookup | [below](#bug-010-downloads-issue-media) |
| BUG-011 admin add search | **partly**: the library-failure half holds; **the Seerr-failure half does not** | "No matching titles." | [below](#bug-011-admin-hidden-content-add-search) |
| BUG-013 logo retry | **yes** (faked image failure, shifted clock) | text chip forever | [below](#bug-013-logo-retry) |
| BUG-016 bookmarks after details | **yes**, real trigger | empty, unstyled page | [below](#bug-016-bookmarks-after-a-details-visit) |
| BUG-017 duplicate ids on reopen | **yes** (Seerr faked) | duplicate `jellyseerr-modal-title`, `movie-server`, … | [below](#lane-c-seerr-bug-017-018-021-022) |
| BUG-018 Escape on a stacked dialog | **yes** (Seerr faked) | the first Escape also closed More Info | [below](#lane-c-seerr-bug-017-018-021-022) |
| BUG-019 Firefox hover overview | yes, but **not observable**: the pre-fix build also shows it on a real server | overview shown too | [below](#bug-019-firefox-hover) |
| BUG-020 Write a Review after a failed fetch | **yes** (faked failure) | Write a Review offered although a review exists | [below](#bug-009-and-bug-020-reviews) |
| BUG-021 server options failure | **yes** (Seerr faked) | no toast; empty selects | [below](#lane-c-seerr-bug-017-018-021-022) |
| BUG-022 issue list failure | **yes** (Seerr faked) | "No issues" | [below](#lane-c-seerr-bug-017-018-021-022) |

#### BUG-016 bookmarks after a details visit

**First live trigger.** A capture listener on `window` logged every `pagehide`. At phone width (412×900), the check:
1. seeded a real bookmark (*A Bug's Life*, through the bookmark-document API);
2. opened the item's details page;
3. clicked the drawer's JE **Bookmarks** item (`.je-nav-bookmarks-item`);
4. went back, then forward.

The sidebar item exists only at phone width: at 1400 px, jellyfin-web 12.4's layout has no legacy drawer, so JE adds no section.

**What jellyfin-web sends.** It dispatches untrusted, bubbling `CustomEvent('pagehide')`s, which reach `window`:
- on `#loginPage` at the first navigation after sign-in;
- on `#itemDetailPage` when leaving details (seen on back/forward).

**Pre-fix build (`e8964868`).** The `#loginPage` event alone disposes bookmarks:
- 0 library stylesheets and no drawer item;
- the Bookmarks page is empty and unstyled: 0 rows, the grid has `display: block`, raw buttons.

This is BUG-016's symptom, and it holds for every session, not only after a details visit.

**Merged build.** The same events arrive, and the page stays styled: grid `display: grid`, the seeded row "A Bug's Life · 1 bookmark(s) · mcd BUG-016 · 10:00". This was true right after the details visit and again after back/forward. The bookmark was deleted afterwards.

Screenshots: [prefix](merge-bugfix-bcd-host-bug016-prefix-bookmarks.png), [merged](merge-bugfix-bcd-host-bug016-bookmarks.png)

#### Lane C Seerr (BUG-017, 018, 021, 022)

All `/JellyfinEnhanced/jellyseerr/*` calls were faked in the browser. The check drove the real bundle's modals: `jellyseerrUI.showMovieRequestModal`, `jellyseerrIssueReporter.showReportModal` and `jellyseerrMoreInfo.open` (TMDB 603).

| Bug | Trigger | Merged build | Pre-fix build |
|---|---|---|---|
| **BUG-021** | `JellyseerrShowAdvanced` on, `GET /radarr` answers 500 | toast "Failed to load server options" | no toast, and three silently empty selects |
| **BUG-017** | Escape, then reopen at once (inside the 300 ms exit) | the closing copy is removed, no Seerr duplicate ids | duplicate `jellyseerr-modal-title`, `movie-server`, `movie-quality`, `movie-folder` |
| **BUG-022** | `GET /issue` answers 500 | "Could not load issues" | "No issues" |
| **BUG-018** | More Info open, the issue dialog on top, one Escape | only the issue dialog closes; a second Escape closes More Info | More Info closed too |

BUG-017 detail:
- A real-keypress reopen at 0, 50, 150, 300, 600 and 1200 ms always leaves exactly one open dialog.
- The `loginPage`/`txtManualName` duplicates in the id scan are jellyfin-web's own DOM, present in both builds.

Screenshots: [bug021-toast](merge-bugfix-bcd-host-bug021-toast.png), [bug017-reopened](merge-bugfix-bcd-host-bug017-reopened.png), [bug022-issues](merge-bugfix-bcd-host-bug022-issues.png) / [prefix](merge-bugfix-bcd-host-bug022-prefix-no-issues.png), [bug018-stacked](merge-bugfix-bcd-host-bug018-stacked.png), [bug018-after-escape](merge-bugfix-bcd-host-bug018-after-escape.png)

#### BUG-019 Firefox hover

**Setup:** headless Firefox 146, `#/search?query=…` with 4 faked Seerr results, then a real mouse move onto the first card.

**Merged build:** `.jellyseerr-overview` appears ("Overview text of lab film 1. Request") and goes on leave.

**Pre-fix build:** the overview appears as well. On a real jellyfin-web page the Gecko condition the bug needs is masked, so the symptom cannot be seen live. The fix is covered by the firefox `seerr-core-rewrite` specs, which now pass in `browser`.

Screenshot: [bug019-firefox-hover](merge-bugfix-bcd-host-bug019-firefox-hover.png)

#### BUG-008 component-script manifest

The manifest is only requested when three things fail together. All three were faked in the browser:
- the `/JellyfinEnhanced/bootstrap` answer loses `ComponentScripts`;
- `bundle.js` is aborted;
- `js/component-scripts.json` answers 503 (once, or every time).

| Variant | Merged build | Pre-fix build |
|---|---|---|
| Fails **once** | "Could not load the component-script manifest; retrying." and a second request 1.0 s later; 184 per-file scripts load, settings and bookmarks initialise | one request, no retry; 3 scripts, no features |
| Fails **every time** | two requests, then `CRITICAL INITIALIZATION FAILURE: Error: Could not load the component-script manifest: [object Response]` | silent; boot continues with nothing loaded |

The `[object Response]` in the message is cosmetic: the ajax client rejects with a `Response`.

#### BUG-009 and BUG-020 reviews

**Setup:**
- `real-admin` wrote a real review of *A Bug's Life* through `POST /JellyfinEnhanced/reviews/movie/9487`.
- One TMDB review was faked, because the lab's TMDB is unreachable.
- The user's language was set to German.
- Translation was configured in the page: `ReviewTranslationEnabled`, and `ReviewTranslationServer` pointing at an invalid host. `/translate/languages` was faked: 503 the first time, then `["de","fr"]`. The browser translator was removed.

**BUG-020.** With `GET /reviews/movie/9487` answering 500, the merged build shows "User reviews couldn't be loaded. Reload the page to try again." and **no** Write a Review button. After a reload the stored review is intact (2 cards, still no Write button). The pre-fix build offers **Write a Review** although the user has a review, and a save would overwrite it.

**BUG-009.** The next render in the same session (another movie) asks `/translate/languages` again (2 calls) and shows the Translate button. The pre-fix build asked once and showed no button.

The review was deleted afterwards.

Screenshots: [bug020-unavailable](merge-bugfix-bcd-host-bug020-unavailable.png) / [prefix](merge-bugfix-bcd-host-bug020-prefix-write-offered.png), [bug009-second-render](merge-bugfix-bcd-host-bug009-second-render.png)

#### BUG-010 downloads issue media

**Setup:** Downloads opened with a full load, one faked Seerr issue for TMDB 603, and `GET /movie/603` answering 500 the first time.

**Merged build:** the card reads "Unknown". The page's refresh asks again, and the card then reads "Lab Issue Movie (2020)".

**Pre-fix build:** "Unknown" stays after the refresh, with a single lookup.

Screenshot: [bug010-after-refresh](merge-bugfix-bcd-host-bug010-after-refresh.png)

#### BUG-011 admin Hidden Content add search

**Setup:**
- `real-viewer` hid one movie, so the admin user picker appears.
- Admin → Hidden Content (full load) → pick real-viewer → Edit → Add items → search.
- Seerr `/search` answered 500 every time; the Jellyfin `/Items?searchTerm=` call was failed in the second step.

| Case | Merged build | Pre-fix build |
|---|---|---|
| Seerr fails, library answers | 1 library card, **no note**: the Seerr results silently disappear | the same |
| Both fail | "The library search failed. Try again." **only**; no "Seerr results are unavailable right now." | "No matching titles." |

**Result: the fix does not hold up for Seerr.** In `client/src/features/seerr/core/api.ts`, `search()` catches every non-abort error and returns `{ results: [] }` unless it is called with `throwOnError: true`. The admin add modal calls `seerrApi.search(term)` without that option, so its new Seerr-failure branch can never run against the real API. Lane D's unit test passes because its mock `search` throws.

The library-failure half is fixed. The Seerr half, which is exactly the "Seerr unreachable" case lane D's own HOST note names, is not. The test data was restored (real-viewer's hidden item removed).

Screenshots: [bug011-seerr-failed](merge-bugfix-bcd-host-bug011-seerr-failed.png), [bug011-both-failed](merge-bugfix-bcd-host-bug011-both-failed.png)

#### BUG-013 logo retry

Logo tags are off in the lab and TMDB is unreachable, so the check used the shipped code in the live page: `JE.initializeLogoTags()` and `JE.logoTags.buildChip`.
- `/JellyfinEnhanced/logo/w92/mcdlogo.png` answered 404 once (browser route), then a PNG.
- **Merged build:** the first chip falls back to text ("LSP"). A new chip right after is still text, with no request. With `Date.now` shifted 6 minutes, a new chip requests the image again, and it loads.
- **Pre-fix build:** the 6-minute chip is still text, with no second request.

### BUG-003 attempt (about 12 minutes)

Downloads was opened with Sonarr and Radarr disabled, the merged build and `2abd5e3d` swapped into the same server. Three data variants were tried:

| Variant | Requests answer |
|---|---|
| server as-is | `/arr/requests` → 404 "Current Jellyfin user is not linked to a Seerr user" (the Seerr URL is dead) |
| `fake28` | `/arr/requests` faked 200 with 28 requests and no `posterUrl` |
| `fakeimg` | the same 28 requests with `posterUrl` |

In every variant `/arr/queue` and `/arr/history` returned 200 with empty lists.

**Result: it reproduces at `2abd5e3d` and at the merged tip, depending on how Downloads is reached.**

| Entry | `2abd5e3d` | merged `8afbb154` |
|---|---|---|
| Downloads reached inside the running app (hash change from the sign-in route, or history back from Home) | **28 skeleton elements (24 blocks) stay**, at 2, 5, 10, 20 and 30 s and after a revisit; 0 request cards, 0 poster placeholders, all variants | **the same** |
| Full page load of `#/downloads` | renders: "No active downloads", "Unable to load requests", "No issues" | **the same** |

The lane A merge most likely used a full load, which renders. Screenshots: [merged, in-app](merge-bugfix-bcd-host-bug003-merged-inapp-skeletons.png), [merged, full load](merge-bugfix-bcd-host-bug003-merged-full-load.png), [2abd5e3d, in-app](merge-bugfix-bcd-host-bug003-2abd5e3d-inapp-skeletons.png). Not investigated further and not fixed.

### General smoke (merged build)

| Check | Result |
|---|---|
| Plugin | `Jellyfin Enhanced v12.14.0.0 initialized`; `/Plugins`: 12.14.0.0 Active |
| Server log | Every JE `[ERR]`/`[WRN]` is the lab's deliberately dead Seerr URL (`Exception while trying to get Seerr user ID from http://127.0.0.1:9: Connection refused` and its follow-ups). The other 72 `[ERR]` are lab-data `Could not find file '/tv/…'`. The JE plugin log has the same Seerr lines plus `Locale file not found for language: undefined` ×2, from the Firefox run (below). |
| Scheduled tasks | 15 in "Jellyfin Enhanced", the same keys; `JellyfinEnhancedStartup` Id `246a7417…34e7`, unchanged |
| OpenAPI | 200, 3.0.4, 474 paths, 180 under `/JellyfinEnhanced` (unchanged) |
| Wire | Identity 200, 2,377,363 bytes; gzip 642,083; br 483,061. All carry `Vary: Accept-Encoding` and `Cache-Control: public, max-age=31536000, immutable`. `If-None-Match` per representation → **304**, 0 bytes. The br tag sent with gzip → 200. The decoded br and gzip bodies equal identity. |
| Bundle check | The served identity body and the in-process `restructure-gates.sh bundle` dump have the same `bundle-hash`, `8a4ca678…0904` (stable equals comment-stripped). It differs from `bugfix-a` by design (lanes C and D change client code). `bugfix-bcd` is appended to `baselines/bundle-checkpoints.txt`. |
| Boot | Every page logged "All component scripts loaded" (the K1/K1b `featureContext`/`sharedModules` objects were not inspected this time) |

**Pages** (as `real-admin`, 1400×900 at scale 2, one browser per page):

| Page | Result | Screenshot |
|---|---|---|
| Admin page | **PASS**: 16 tabs, no "Loading…"; opening Media Tags makes **1** config GET (2 at page load), still 0 more after 10 s (BUG-001 holds) | [admin-page](merge-bugfix-bcd-host-admin-page.png) |
| Settings panel | **PASS**: 17 tabs (11 panel + 6 hub), Display Language 33 options | [settings-panel](merge-bugfix-bcd-host-settings-panel.png) |
| Media Tags hub | **PASS**: `#jeMediaTagsHub` visible with Layout, Groups, Status badges, Rules & locks, Colours and Server | [media-tags-hub](merge-bugfix-bcd-host-media-tags-hub.png) |
| Tagged poster | **PASS**: Movies, 100 of the 112 `.card` elements on the page carry `.je-tag-host` (lane A counted 100/100; the other 12 were not examined) | [tagged-poster](merge-bugfix-bcd-host-tagged-poster.png) |
| Details page | **PASS**: *A Bug's Life*, 33 JE style blocks, tags present | [details-page](merge-bugfix-bcd-host-details-page.png) |
| Hidden Content | **PASS**: "Hidden Content (0)", user picker | [hidden-content](merge-bugfix-bcd-host-hidden-content.png) |
| Bookmarks | **PASS**: "No bookmarks yet" | [bookmarks](merge-bugfix-bcd-host-bookmarks.png) |
| Calendar | **PASS** (no *arr): Agenda/Day/Week/Month, "No upcoming releases" | [calendar](merge-bugfix-bcd-host-calendar.png) |
| Downloads | **PASS** on a full load: "No active downloads", "Unable to load requests" (dead Seerr), Issues. In-app entry shows BUG-003, above. | [downloads](merge-bugfix-bcd-host-downloads.png) |
| Activity | **PASS**: Active Streams, Watch History, Reviews | [activity](merge-bugfix-bcd-host-activity.png) |
| Catch Up | **PASS**: deck plus Activity panel | [catchup](merge-bugfix-bcd-host-catchup.png) |
| Seerr discover | **PASS** (faked): "Discover on Seerr", 3 cards | [seerr-search](merge-bugfix-bcd-host-seerr-search.png) |
| Player OSD | **PASS**: *A Bug's Life*, `currentTime` 9.2 s, readyState 4, playing, `#je-osd-rating-container` "92% ★ 7.0" | [player-osd](merge-bugfix-bcd-host-player-osd.png) |

**Console: no new errors from this merge.** The kinds seen were the same as in lane A's run:
- HLS `otherError` and `bufferStalledError` during playback;
- `[TagPipeline] Failed to refresh server cache: TypeError: Failed to fetch`, only on pages the script reloaded mid-load;
- the pre-existing OBS-001 `PAGEERROR … 'classList'` on the Activity and Catch Up deep loads.

## Product bugs and observations (recorded, not fixed)

- **BUG-011 (lane D) is incomplete.** Repro, at `bugfix/merge-cd` `8afbb154`:
  1. Make Seerr unreachable, or have its `/search` fail.
  2. As admin, open Hidden Content, pick a user, then Edit → Add items, and search.
  3. Seerr results silently disappear, with no "Seerr results are unavailable" note. If the library search also fails, only the library message shows.

  Cause: `seerr/core/api.ts` `search()` turns every non-abort failure into empty results unless `throwOnError` is passed, and the admin modal does not pass it. Lane D's test mocks a throwing `search`, so it does not see this.
- **BUG-003 reproduces at the merged tip.** Downloads reached inside the app keeps its 28 skeletons; a full load renders. It is the same at `2abd5e3d`.
- **New observation, pre-existing (identical at `2abd5e3d`, `e8964868` and `8afbb154`).** Setting `location.hash` to a JE custom page at desktop width shows jellyfin-web's "Page not found": `#/hidden-content`, `#/bookmarks`, `#/calendar` and `#/downloads`, entered from Home in a running session, or pasted into the address bar of an open tab. A full load of the same URL renders, and JE's own sidebar items work at phone width. Not compared with upstream JS.
- **New observation (Firefox only, merged build).** In headless Firefox 146:
  - JE logged `Language undefined not found on GitHub, falling back to English`. So its locale loader asked GitHub for a locale named `undefined`, and the server logged `Locale file not found for language: undefined`.
  - The search page's Seerr search was sent with `language=undefined`.

  Chromium showed neither. Not investigated; the pre-fix build was not checked for it.
- **Cosmetic:** BUG-008's boot error ends in `[object Response]` rather than a status.
- **BUG-019** cannot be observed on a real jellyfin-web page in either build. Its fix is verified by the firefox browser specs, which now pass.

## Cleanup

- `je rm mcd` removed `je-lab-mcd` and `/home/jake/je-lab/mcd`, including the edited config and all test data. Afterwards `docker ps -a --filter name=mcd` is empty, the directory is gone, and `curl 127.0.0.1:18571/health` cannot connect (exit 7).
- Both of this session's REJECT rules were deleted by exact spec (0 packets each). The other rules now in `DOCKER-USER` belong to the benchmark session's labs (`je-bench-je-lab-bnrw`, `…-bnup`) and were not touched. `s1220cfe4`'s rules were removed by their owner during the run.
- Volumes and `/tmp/je-docs/tools/` equal the pre-HOST snapshots. Containers, networks and `/home/jake/je-lab/` differ only by other sessions' labs: `bnrw` and `bnup` started, `s1220cfe4` finished.
- Removed:
  - `je up`'s build snapshot `~/.cache/je-lab/build/9fa5bbccb3f2`;
  - its CI-cache file and lock (the warm job had finished);
  - `.notes/tok-admin` and `.notes/.tok-admin.lock`.

  After that, `~/.cache/je-lab/` and `.notes/` equal the snapshots.
- Scratch worktrees (`fe095dfa`, `e8964868`, `2abd5e3d`) were removed with `git worktree remove` and `prune`. Only their `node_modules` symlinks were deleted; the main checkout's `node_modules` is intact.
- Scratch DLLs, Playwright scripts, raw screenshots and gate logs stay only in the session scratchpad. `je-perf-real-seerr` and the other agents' worktrees, labs and files were not touched.
