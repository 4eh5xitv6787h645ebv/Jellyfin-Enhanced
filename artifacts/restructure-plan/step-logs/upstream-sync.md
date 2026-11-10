# Upstream sync: `2e0f9251` → `0586df79` (12.15.0.0 and after)

Branch `sync/upstream`, on `restructure/integration` at `1e0269fd`. It was written on `2917a115` and rebased once the
ports had been reviewed, so the files recorded before the rebase name the old commits; section 7 has the map. The
ledger is [`docs/upstream-sync.json`](../../../docs/upstream-sync.json) (table:
[`docs/upstream-sync.md`](../../../docs/upstream-sync.md)); this log is the plan, the evidence and the advice that go
with it.

## 1. The gap, measured before porting (2026-11-10)

`git fetch origin` moved upstream's `main` from `2e0f9251` to `c22870b2`: 14 commits. Three more arrived while the
ports were in review (`0586df79`); they are counted here and were ported too.

| | |
|---|---|
| Upstream commits after `2e0f9251` | **17** (first-parent; no merge commits) |
| Dates | 2026-11-07 to 2026-11-10 (four days) |
| Release tags in the range | **1**: `12.15.0.0` on `6daf2118` (the range's second commit) |
| Size | 3,719 insertions, 232 deletions, 114 file changes |
| User-facing features | 2 (`533614b8` subtitle-offset shortcuts, `2e1f123d` watchlist removal sync) |
| Bug fixes | 6 (`6ece3f52`, `ee1c92dc`, `af5f9678`, `d3bd07d3`, `83510ea1`, `c22870b2`) |
| Security | 1 (`19cfe99a`: three code-scanning fixes in client code, plus CI configuration) |
| Test-only follow-ups | 2 (`7a52d1e9`, `aa8f4312`, both for `6ece3f52`) |
| Release bookkeeping | 2 (`6daf2118` version, `2e20cb83` manifest) |
| Dependency update | 1 (`800b768c`, GitHub Actions pins) |
| CI | 2 (`a2b4b2ab`, `b1919a25`) |
| Docs | 1 (`0586df79`, README badges) |
| Performance, translation | 0 |
| Already in the rewrite | **0** (checked by behaviour, see below) |
| Jellyfin 10.11-only code | none. (The manifest commit carries the catalog entry of upstream's 10.11 build: release data, kept; see the ledger.) |

"Already present" was checked against the rewrite's code, not by text:

| Upstream | What the rewrite did before the port |
|---|---|
| `533614b8` | No `DecreaseSubtitleOffset`/`IncreaseSubtitleOffset` shortcut anywhere (`PluginConfiguration.cs`, `chrome/events.ts`, `settings-panel/shortcut-rules.ts`, locales). |
| `6ece3f52` | `StatusRules.cs` and `statustags.ts` still showed New Episode for `… \|\| addedRecently`. |
| `ee1c92dc` | The tag pipeline had no redraw of cards already drawn; `TagCacheService` had no collection-member index. |
| `af5f9678` | `settings/state.ts` and `core/ui/runtime.ts` both read the duration as `value \|\| 1500`, so 0 was 1.5 s. |
| `2e1f123d` | No `WatchlistRemovalSync` setting, task, planner or `POST jellyseerr/watchlist`. |
| `d3bd07d3` | `SpoilerFieldStripFilter._routes` had no `("HomeScreen", "GetSectionContent")`. (`HiddenContentResponseFilter` already knew that action, so only Spoiler Guard was missing it.) |
| `83510ea1` | `recommendations-render.ts` had no drag guard on the tile rows. |
| `c22870b2` | `details-providers/media-info.ts` read only `selectedSource.MediaStreams`, which `/tag-data` leaves empty. |
| `19cfe99a` | The Custom Tabs snippet escaper left quotes alone, review HTML was stripped in one pass, and pause-screen image URLs took ids and tags unencoded: the same three patterns as upstream's. |

## 2. Port order

Small, independent fixes first, so every gate checkpoint lands on a tree that differs from the last one by little; then
the two large changes; then CI; then the version; then the contract commit. The three late commits follow in
upstream's order.

| # | Upstream | Port as | Why here |
|---|---|---|---|
| 1 | `533614b8` | `feat(player)` | First upstream commit, and the only one released (12.15.0.0). |
| 2 | `6ece3f52` + `7a52d1e9` + `aa8f4312` | `fix(media-tags)` | The fix and its two test updates are one behaviour. |
| 3 | `af5f9678` | `fix(platform)` | Independent. |
| 4 | `d3bd07d3` | `fix(spoiler-guard)` | Independent, one route-table row. |
| 5 | `83510ea1` | `fix(seerr)` | Independent. |
| 6 | `c22870b2` | `fix(details-providers)` | Independent. |
| 7 | `ee1c92dc` | `fix(media-tags)` | Large; after the small media-tags fix so the two do not interleave. |
| 8 | `2e1f123d` | `feat(seerr)` | Large; changes the contract, so it is the last behaviour port of the first batch. |
| 9 | `800b768c` | `chore(ci)` | Workflow pins only. |
| 10 | `a2b4b2ab` | `ci` | After the pin bump: both edit `regression.yml`. |
| 11 | `6daf2118` + `2e20cb83` | `chore(release)` | Version and manifest, last of the first batch. |
| 12 | — | `contract: upstream sync additions` | Snapshot additions for port 8, alone, for review. |
| 13 | `19cfe99a` | `fix(security)` | Arrived during review; three small client fixes with their tests. |
| 14 | `b1919a25` | `ci(regression)` | After port 10: it edits the same workflow. |
| 15 | `0586df79` | `docs(readme)` | README only. |

## 3. Commits that interact

- **`6ece3f52`, `7a52d1e9`, `aa8f4312`**: one fix, its unit-test row and its parity fixture. One commit.
- **`6daf2118`, `2e20cb83`**: the version and the manifest entry of the same release. One commit.
- **`800b768c`, `a2b4b2ab`, `b1919a25`**: all edit `.github/workflows/regression.yml`; ported in upstream order.
- **`2e1f123d` and the contract snapshots**: the port adds a route, a scheduled task and a DI registration. The
  snapshots it trips are updated in one separate commit.
- **`ee1c92dc`, `d3bd07d3`, `83510ea1`** each add a sentence to the same row group of `tests/docs/coverage-matrix.md`;
  no code interaction.
- **`533614b8`, `af5f9678`, `2e1f123d`, `19cfe99a`** all edit the admin page, in four different sections (shortcut
  defaults, the toast row, the Seerr watchlist section, the Custom Tabs snippet). No interaction beyond regenerating
  `configPage.html`.

## 4. Expected to be hard

- **`ee1c92dc` (1,562 lines).** Three reasons. (a) Its server half adds about 470 lines to `TagCacheService.cs`, which
  the rewrite caps at its recorded size (`FileSizeTests`; "the entry only shrinks"). (b) It comes with 1,016 lines of
  tests in three runners (xUnit, node, Playwright) written against upstream's file layout and harness. (c) The client
  half changes when a drawn card is released, in the pipeline every tag type goes through; a mistake shows as flicker
  or stale tags on every poster.
- **`2e1f123d` (1,054 lines).** A new route, task and registration are a contract change here. It also reads and
  writes a real Seerr, so parity needs the real-services lab, and it removes user data (watchlist entries), so the
  "unknown is not none" rules have to hold on every read.

Both went as planned. Nothing else was hard.

## 5. Needs redesign rather than translation

| Upstream change | Why a translation is not possible | Design used |
|---|---|---|
| `ee1c92dc`: 470 new lines inside `TagCacheService.cs` | The file is at its allow-listed cap and may not grow. | The collection-member index and its rules are a new partial, `TagCacheCollectionMembers.cs`, in `Features/MediaTags/Services/TagCache/`; `TagCacheService.cs` keeps one-line call sites and went from 4,124 to 4,088 lines. |
| `2e1f123d`: route added to the single `JellyfinEnhancedController` | The rewrite has one controller per feature with a frozen route/auth snapshot. | The action is in `JeSeerrController` beside `GET jellyseerr/watchlist`, with that route's authorization; the snapshot additions are a separate commit. |
| `2e1f123d`: `Services/WatchlistSyncPlanner.cs`, `Helpers/Jellyseerr/SeerrWatchlistReader.cs`, `ScheduledTasks/WatchlistRemovalSyncTask.cs` | Those folders are retired. | `Features/Seerr/Services/` (both) and `Features/Seerr/Tasks/` (the task keeps the `…ScheduledTasks` namespace, as the other tasks do). |
| `af5f9678`: one-line change to `JE.CONFIG.TOAST_DURATION` and `JE.toast` | The rewrite reads the setting in `features/settings/state.ts`, passes it through `host/ui-host.ts` and uses it in `core/ui/runtime.ts`; the admin preview is `admin/config/page/timing.ts`. | The same rule in each of those places. |
| `533614b8`: `JE.adjustSubtitleOffset` called from `events.js` | The shortcut dispatcher is the chrome feature and may not import player code. | The player publishes the function on the JE facade, as it does `frameStep`; chrome calls it through its `EventsBridge` type. |
| `a2b4b2ab`: path filter `Jellyfin.Plugin.JellyfinEnhanced/(js\|Configuration\|…)` | In the rewrite the web files are built from `client/`, `css/` and `scripts/client*`. | The same job with the rewrite's source paths added to the filter. |
| `b1919a25`: `tests/run.py --project`, beside upstream's `--target jf10/jf12` | The rewrite's runner has a Jellyfin 12-only `--target`. | The same `--project` option and job matrix; `--target` stays as the rewrite has it. |
| `2e20cb83`: manifest entries for the 12 and the 10.11 build | The rewrite builds for Jellyfin 12 only. | `manifest.json` is kept byte-identical to upstream's: both entries are data about artifacts upstream published, and the catalog serves 10.11 servers from the same file. |

## 6. Result: the gap after

| | Before (`restructure/integration`) | After (`sync/upstream`) |
|---|---|---|
| Upstream commits after `2e0f9251` | 17 | 17 |
| Ported | 0 | **17** (in 14 commits: `6ece3f52`+`7a52d1e9`+`aa8f4312` are one, `6daf2118`+`2e20cb83` are one) |
| Already present | 0 | 0 |
| Not applicable | 0 | 0 |
| Deferred | 0 | 0 |
| Pending | 17 | **0** |
| Plugin version | 12.14.0.0 | 12.15.0.0 (upstream's latest release) |
| `manifest.json` | upstream's at `2e0f9251` | upstream's at `0586df79` (byte-identical) |
| Routes | 202 | 203 (`POST jellyseerr/watchlist`) |
| JE scheduled tasks | 15 | 16 (Sync Watchlist Removals between Jellyfin and Seerr) |
| `PosterTagSettings.ResolverVersion` | 39 | 40 (port 2 changes the tags produced for the same data) |
| Backend tests (floor) | 3,238 | 3,295 |
| Frontend tests (floor) | 3,863 | 3,906 |
| Browser tests | 693 | 699 |
| Tooling tests (floor) | 16 | 28 |

Every upstream commit and its status (the ledger, `docs/upstream-sync.json`, is the source):

| # | Upstream | Date | Class | Features | Subject | Status | Rewrite commit |
|---|---|---|---|---|---|---|---|
| 1 | `533614b8` | 2026-11-07 | feature | player, chrome, settings-panel, admin, settings, platform | feat(player): add keyboard shortcuts for subtitle offset | ported | `a0592686` |
| 2 | `6daf2118` | 2026-11-07 | release | - | v12.15.0.0 | ported | `d6363364` |
| 3 | `2e20cb83` | 2026-11-07 | release | - | v12.15.0.0 - Jellyfin Enhanced (synced from jellyfin-plugins) | ported | `d6363364` |
| 4 | `6ece3f52` | 2026-11-08 | fix | media-tags | fix(status-tags): only show New Episode on recent air date, not on recent add | ported | `5e7a3859` |
| 5 | `7a52d1e9` | 2026-11-09 | test | media-tags | test(status-tags): update New Episode badge test for air-date-only rule | ported | `5e7a3859` |
| 6 | `ee1c92dc` | 2026-11-09 | fix | media-tags | fix(tags): redraw changed cards and keep collection language flags current (#1029) | ported | `4dbcd596` |
| 7 | `af5f9678` | 2026-11-09 | fix | platform, settings, admin | fix(toast): let a duration of 0 turn toasts off and make the preview match | ported | `8e109a43` |
| 8 | `aa8f4312` | 2026-11-09 | test | media-tags | test(parity): update New Episode status fixture for the air-date-only rule | ported | `5e7a3859` |
| 9 | `800b768c` | 2026-11-09 | deps | - | chore(ci)(deps): bump the github-actions group with 6 updates (#1031) | ported | `2dc0a0a0` |
| 10 | `2e1f123d` | 2026-11-09 | feature | seerr, admin, settings, platform | feat(watchlist): two-way removal sync between Jellyfin and Seerr (#1032) | ported | `aa5947ea` |
| 11 | `a2b4b2ab` | 2026-11-09 | ci | - | ci: skip browser tests on pull requests that do not touch web files | ported | `ac22e0a6` |
| 12 | `d3bd07d3` | 2026-11-09 | fix | spoiler-guard | fix(spoiler-guard): strip Home Screen Sections rows (#1033) | ported | `f61aba67` |
| 13 | `83510ea1` | 2026-11-09 | fix | seerr | fix(recommendations): don't open category tiles after dragging a row (#1030) | ported | `f824bde5` |
| 14 | `c22870b2` | 2026-11-09 | fix | details-providers | fix(audio-language): show audio languages on movie page | ported | `df9e0873` |
| 15 | `19cfe99a` | 2026-11-10 | security | admin, details-providers, player | ci: Fix/code scanning alerts (#1036) | ported | `1f60ffd2` |
| 16 | `b1919a25` | 2026-11-10 | ci | - | ci(regression): run the browser suite as one parallel job per Playwright project | ported | `5b002a30` |
| 17 | `0586df79` | 2026-11-10 | docs | - | docs(readme): add test badges and icons, recolor badge row | ported | `d25914be` |

Nothing could not be ported, and nothing was judged not applicable.

## 7. Parity evidence

**At each port.** For each user-visible change the same `je12 browse --script` command was run on one lab against
three builds: the rewrite before the port, an upstream build of `c22870b2` (put on the lab with
`scripts/upstream_lab_deploy.py`), and the rewrite at the port's commit. Scripts and raw outputs are in
[`upstream-sync-evidence/`](upstream-sync-evidence/) (`<port>.mjs`, `<port>.rewrite-before.txt`,
`<port>.upstream.txt`, `<port>.rewrite-after.txt`; the first line of each output is the command, the second the
deployed build). In every row the upstream and rewrite-after outputs are equal; where they contain names that depend
on lab state (port 7's collection check) the compared fields are named.

| Port | What the script does | Rewrite before | Upstream `c22870b2` | Rewrite after |
|---|---|---|---|---|
| 1 `533614b8` subtitle offset | Plays a clip, presses `]` `]` `[`, waits 2.4 s, opens the panel | no bindings; offset stays 0 | offsets 0.1, 0.2, 0.1; panel shown, then hidden; two panel rows | same as upstream |
| 2 `6ece3f52` New Episode | Episode aired 400 days ago, added an hour ago; episode aired 2 days ago, added long ago; reads the badges on the search cards | New Episode / New Episode | Just Added / New Episode | same as upstream |
| 3 `af5f9678` toast 0 | Saves 0, 10, 4000 ms and fires the real toast; types 0 and 50 into the admin preview | saved 0 reads 1500 and shows 2 toasts; preview says 3.0s for both | saved 0 shows none; preview "Toasts are turned off (0 ms)…" and "0.1s" | same as upstream |
| 4 `d3bd07d3` Home Screen Sections | Real Home Screen Sections 3.0.4.0 plugin; guarded series with the next episode unwatched; `GET /HomeScreen/Section/NextUp` | the episode's real name and its file path | "Season 1, Episode 2", no path | same as upstream |
| 5 `83510ea1` drag | Recommendations page: drags a studio tile 60px, then a plain click on a fresh page | the drag opens "Marvel Studios" | drag opens nothing; click opens "Marvel Studios" | same as upstream |
| 6 `c22870b2` audio languages | A movie's details page (16 audio streams in Jellyfin) | no languages shown | 14 languages shown | same as upstream |
| 7 `ee1c92dc` redraw | A card on a kept details view; its movie's rating changed on the server from 6.0 to 1.1; back to the view | chip still 6.0 | chip 1.1 | chip 1.1 |
| 7 `ee1c92dc` collections | Adds a movie with a new audio language to a box set, then deletes that movie; reads the set's tag-cache entry for 60 s | still lists the deleted member's language (`followedTheDeletion: false`) | back to `["eng"]` (`true`) | back to `["eng"]` (`true`) |
| 8 `2e1f123d` watchlist, real Seerr 3.5.1 | `POST jellyseerr/watchlist` (add, again, invalid); like in Jellyfin; run the removal task; unlike; run it again | no setting; 405; no task | 200, 409, 400 `invalid_watchlist_item`; first run keeps it on Seerr; second run removes it | same as upstream |
| 8 `2e1f123d` admin page | Seerr > Watchlist: options, and which "don't re-add" rows show per mode | (setting absent) | four options; rows hidden for Jellyfin decides and Both, shown for Seerr decides and Never | same as upstream |

**On the final tree.** After the rebase every script was run again on the second machine (section 8) against the
rebased branch at `19caa62e` and against upstream's newest commit `0586df79`, on one lab, plus a real-Seerr lab for
port 8. The outputs are in [`upstream-sync-evidence/final/`](upstream-sync-evidence/final/)
(`<port>.rewrite-final.txt`, `<port>.upstream.txt`). The `SCRIPT` line, which is what each script reports, is
identical between the two builds for all nine scripts (p1 to p6, p7-tag-redraw, p8-watchlist, p8-watchlist-admin);
the collection check ends with `followedTheDeletion: true` on both. The code that landed is `19caa62e`'s: the
commits after it change only this log, the evidence, the ledger, the procedure and the count floors.

The earlier files carry the commit names from before the rebase. The same commits on the landed branch:

| Port | In the earlier evidence | On the landed branch |
|---|---|---|
| Lab helper, the smoke baseline's tree | `226e8982` | `d8bded06` |
| 1 subtitle offset | `04738805` | `a0592686` |
| 2 New Episode | `b292ec58` | `5e7a3859` (also carries the `ResolverVersion` bump) |
| 3 toast 0 | `d063821d` | `8e109a43` |
| 4 Home Screen Sections | `414c1b45` | `f61aba67` |
| 5 drag | `8f419419` | `f824bde5` |
| 6 audio languages | `06fb4f81` | `df9e0873` |
| Checkpoint after port 6 | `16c962f0` | `18236f60` |
| 7 redraw and collections | `42582efa` | `4dbcd596` |
| 8 watchlist | `c18edf46` | `aa5947ea` |
| 9 Actions pins | `05a49463` | `2dc0a0a0` |
| 10 browser-test filter | `6fa91b45` | `ac22e0a6` |
| 11 release | `13eb94ff` | `d6363364` |
| 12 contract | `a27d1679` | `cb275794` |
| First step log; first procedure | `dde9ae8b`; `126c14f3` | `02aacb5f`; `14b6c0c3` |

Not compared on a lab, and why:
- **Native poster path of port 2** (the C# `StatusRules`): no lab check; covered by the new native tests and by the
  offline parity run (`p2-new-episode.parity.txt`: 241 fixed-clock Status fixtures, 0 web/native differences).
- **Port 7, a member's audio track changing** (as opposed to the member being deleted): the lab's media are
  synthetic clips and cannot gain or lose a track. Covered by the 22 translated backend tests, which drive the real
  flush, reconciliation, save and load.
- **Port 8, the other three removal modes and the two add syncs' "don't put it back" rule**: covered by upstream's
  planner and task tests (translated), not repeated on the lab. Only "Jellyfin decides" ran against the real Seerr.
- **Port 13** (`19cfe99a`): none of its three fixes changes what a user sees with ordinary data. Three tests were
  added (upstream has none) and fail before the change.
- **Ports 9, 10, 14** (CI), **11** (version) and **15** (README): nothing a user of the plugin sees. The workflow
  YAML parses; the path filter was checked against 14 sample paths. The workflows themselves have not run here.

Tests that failed before each port and pass after (`<port>.tests-before.txt` in the evidence folder):

| Port | Failing before the port |
|---|---|
| 1 | 8 node tests (dispatcher, editor rule ×2, player ×3, panel row, defaults) |
| 2 | 1 node test (upstream's changed row) and 2 of the 3 new native tests |
| 3 | 3 node tests (toast off, configured value, admin preview) |
| 4 | 1 backend test (upstream's) |
| 5 | 2 of upstream's 3 node tests (the touch test passes before and after: it pins what must not change) |
| 6 | 2 node tests (upstream's, and one that a selected version never borrows another's streams) |
| 7 | 7 of upstream's 11 node tests and 20 of its 22 backend tests; upstream's 6 browser tests pass after |
| 8 | 6 node tests; upstream's backend tests do not compile before (new types), and pass after |
| 13 | 3 node tests (snippet quotes, nested review tags, pause-screen URL encoding) |

## 8. Gates, and where each result came from

Two machines ran checks. **Lenovo** is the shared worker this branch was written on (Docker labs, je12 v2.3.2).
**Second machine** is the owner's other worker (16 cores, 62 GB, process-backend labs, je12 v2.3.3), which the
reviewer made available because the Lenovo was overloaded; it held a private copy of the branch. Commits are named
as they were when the check ran; the map is in section 7.

| # | Check | Commit | Machine | Result |
|---|---|---|---|---|
| 1 | `je12 gate final`, checkpoint after port 6 | `16c962f0` | Lenovo (load 25.6 at the start) | `all` PASS (dotnet 3242 of 3242, npm 3883 of 3883); `browser` 689 of 693 passed, 3 skipped, 1 failure: a listed load-sensitive test |
| 2 | That test alone, `--repeat-each=5` | `16c962f0` | Lenovo (load 2.8) | 5 passed |
| 3 | Rerun of the browser gate | `16c962f0` | Lenovo | not run: withdrawn after 3 h 08 min in the gate-lock queue |
| 4 | `je12 gate final` | `dde9ae8b` | Lenovo | not run: withdrawn after 2 h 05 min in the gate-lock queue |
| 5 | Smoke against the starting tree's baseline | `dde9ae8b` | Lenovo | 1 intended change, 2 rows explained below |
| 6 | `je12 gate final` | `126c14f3` | Second machine | `browser` PASS (696 of 699, 3 skipped); `all` stopped after 59 s on the environment, before any test (below) |
| 7 | `je12 gate final` | `126c14f3` | Second machine | `browser` PASS (696 of 699); `all` FAIL: dotnet 3294 of 3295 (one timing test, below), npm 3903 of 3903 |
| 8 | That dotnet test alone, 8 runs | `126c14f3` | Second machine | 8 passed |
| 9 | `je12 gate final` | `126c14f3` | Second machine | **PASS**: dotnet 3295 of 3295, npm 3903 of 3903, browser 696 of 699 (3 skipped) |
| 10 | Smoke | `126c14f3` | Second machine | the same three rows as on the Lenovo |
| 11 | `je12 gate final`, after the rebase and ports 13 to 15 | `87074af4` | Second machine | `browser` PASS (696 of 699); `all` FAIL: dotnet 3294 of 3295 (the same timing test), npm 3905 of 3906 (one listed load-sensitive test) |
| 12 | That npm test alone, 5 runs | `19caa62e` | Second machine | 5 passed |
| 13 | Smoke | `19caa62e` | Second machine | the same three rows |
| 14 | Parity scripts, rewrite against upstream `0586df79` | `19caa62e` | Second machine | 9 of 9 equal (section 7) |
| 15 | `je12 gate final`, **the final gate** | `7c0f93e2` | Second machine (load 0.0 at the start) | **PASS**: `all` in 10.5 min (dotnet 3295 of 3295, npm 3906 of 3906), `browser` in 7.4 min (696 of 699, 3 skipped) |
| 16 | `je12 gate final`, repeated on the commit that lands | this log's commit | Second machine | in the landing report: a log cannot hold a result about its own commit |

`87074af4` is the rebased branch before one evidence text file was edited (decision 17); its tree is otherwise
`19caa62e`'s.

**The checkpoint (rows 1 to 3).** At `16c962f0`, on the Lenovo while another session's stress test was running:

```
gate all: PASS in 5.0 min
T (dotnet test): total 3242 (baseline 3238), passed 3242 (baseline 3238), failed 0 (baseline list 0)
npm test: total 3883 (baseline 3863), passed 3883 (baseline 3863), failed 0 (baseline list 0)
gate browser: FAIL (exit 1) in 3.3 min
BROWSER: 693 tests, passed 689, failed 1 (baseline list 0), skipped 3
  [mobile-chromium] › tests/browser/discovery-recommendations-rewrite.spec.cjs:70:1 › generated discovery and
  recommendations page, filter, sort, paginate, close and leave no account data
```

That test is on AGENTS.md's load-sensitive list; it timed out in its infinite-scroll poll (5 s), not in anything a
port touched. Flake protocol: (a) rerun alone, `--project=mobile-chromium --repeat-each=5`: 5 passed (0.8 to 1.0 s
each); (b) a clean full run of the browser gate: rows 6, 7, 9, 11 and the final gate all contain the test and pass it.

**Why the Lenovo gates were withdrawn (rows 3 and 4).** The Lenovo's gate lock was held almost continuously by other
sessions' measurement batches, and `flock` does not queue in order. The rerun and the final gate were both queued
there and never started; on the reviewer's direction they were withdrawn (the two waiting je12 processes were ended;
no test had run) and the gates moved to the second machine. The second planned checkpoint (after port 8) was not run
on its own for the same reason; with fewer than ten ports in the first batch, one checkpoint plus the final gates
meets the "at least every ten ports" rule.

**The environment failure (row 6).** The second machine's system `dotnet` has no ASP.NET Core runtime, so the build
stopped at once. The account's own SDK install (10.0.401) was put first on `PATH` for the later runs. Not a test
result.

**The two load-sensitive tests (rows 7, 8, 11, 12).** `je12 gate final` runs `all` and `browser` at the same time.

- dotnet `IntegrationStatusTagsSeriesTests.UpstreamLookupsBeyondTheWindowShareWaitForItToMoveOn` failed in rows 7
  and 11. It measures a real 300 ms window with a 50 ms margin; no port touches the code it tests, and it is not on
  AGENTS.md's list. Alone it passed 8 of 8, and row 9 is a clean full run at the same commit as row 7. Filed as a
  found bug (section 10) so the test can be given a clock.
- npm `requests/seerr-review-boundaries.test.mjs` ("SEERR-CORE-22: repeated close restores history once") failed in
  row 11 only. It is in AGENTS.md's listed `requests/seerr-review-*` group. Alone it passed 5 of 5.

Neither was added to a baseline. The clean full run that closes the flake protocol for row 11 is the final gate.

**Between gates.** Every port ran `je12 test` on the Lenovo (typecheck, build, the touched features' node tests, and
the backend tests where C# changed). The run before the contract commit failed only the six contract tests of
section 9; the run after it passed.

**Smoke (rows 5, 10, 13).** A lab started at the first commit of the branch with unchanged behaviour (its baseline
recorded then), then the tree under test deployed. The three runs agree; the last one:

```
plugin               ok      12.15.0.0 Active
scheduled tasks      changed 16 JE tasks (keys and ids) (baseline: 15 JE tasks (keys and ids))
openapi              ok      HTTP 200, 474 paths, 180 under /JellyfinEnhanced
bundle wire          ok      br 200 529555B 304:yes, gzip 200 642779B 304:yes, identity 200 2379598B 304:yes; decoded bodies identical
server log           ok      164 ERR/WRN lines, 0 new kind(s)
page details         FAIL    … 5 new console error(s): … (Not Found) /JellyfinEnhanced/cdn/flag-icons/flags/4x3/…
page player          FAIL    … 5 new console error(s): … (Not Found) /JellyfinEnhanced/cdn/flag-icons/flags/4x3/fi.svg …
(the other 11 pages: ok)
smoke: FAIL (2 failing, 1 changed, 0 known, 0 fixed)
```

- `scheduled tasks changed`: intended, the removal sync task of port 8.
- The two `FAIL` rows are the same five requests on the same movie: flag icons `fi`, `is`, `kr`, `no`, `se`. Port 6
  makes that movie's details page show its audio languages, and the lab has no internet, so the flag set that the
  Refresh CDN Assets task downloads is not there. The upstream build makes the same five requests with the same
  404s on the same page (`p6-audio-language.upstream.txt` and `.rewrite-after.txt` list them). They are a
  consequence of the fix in an offline lab, not a new fault; the baseline was not re-recorded over them.

**The final gate (row 15).** At `7c0f93e2`, which is the landed branch without its last commit. That last commit
changes this log and a few sentences of `docs/upstream-sync-procedure.md`, nothing a gate builds or counts, and the
gate was run once more on it before landing (row 16).

```
final: all and browser at the same time (load 0.0 on 16 CPUs)
gate all: PASS in 10.5 min
T (dotnet test): total 3295 (baseline 3295), passed 3295 (baseline 3295), failed 0 (baseline list 0)
npm test: total 3906 (baseline 3906), passed 3906 (baseline 3906), failed 0 (baseline list 0)
restructure-gates: all passed
gate browser: PASS in 7.4 min
BROWSER: 699 tests, passed 696, failed 0 (baseline list 0), skipped 3
restructure-gates: browser passed
```

The baselines in those lines are the raised floors, so the run also shows that the new floors are this tree's exact
counts. Both load-sensitive tests of rows 7 and 11 passed in it, which completes the flake protocol for them: an
isolated pass (rows 8 and 12), then a clean full run. No baseline, snapshot or failure list was changed to make a
gate pass; the only baseline changes of the branch are the one added route line (section 9) and the raised floors.

## 9. Contract changes

One commit, `contract: upstream sync additions` (`cb275794`; `a27d1679` before the rebase, same content), holds every
frozen-contract change of the branch. It was written by hand; `JE_UPDATE_SNAPSHOTS` was never set. All of it comes
from port 8 (`2e1f123d`). **The reviewer accepted it on 2026-11-10**: additions only; the new route requires sign-in,
validates its body and forwards only the two checked fields.

| File | Added line |
|---|---|
| `tests/backend/Architecture/route-auth.snapshot.json` | `{"verb":"POST","route":"JellyfinEnhanced/jellyseerr/watchlist","requiresAuth":true,"auth":"","action":"AddJellyseerrWatchlist","apiBehavior":true,"parameters":["requestBody:Body"]}` |
| `tests/backend/Architecture/auth-helper-calls.snapshot.json` | `"AddJellyseerrWatchlist": {"IsAdminUser":5,"User":1,"UserHelper.GetCurrentUserId":1}` |
| `tests/backend/Architecture/auth-reads-by-route.base.json` | `"POST JellyfinEnhanced/jellyseerr/watchlist": {"IsAdminUser":5,"User":1,"UserHelper.GetCurrentUserId":1}` |
| `tests/backend/Architecture/service-registrations.snapshot.json` | `"WatchlistRemovalSyncTask \| WatchlistRemovalSyncTask \| Transient"` |
| `artifacts/restructure-plan/baselines/inventory-routes.txt` | `POST /JellyfinEnhanced/jellyseerr/watchlist` |

Changed, not added: `RouteAuthSnapshotTests.ExpectedRoutes` 202 → 203, and the comment beside it. No existing
route, verb, authorization or registration line is changed or removed.

What was checked: the new route has the same `[Authorize]` and the same auth-read closure as its neighbour
`GET jellyseerr/watchlist` (both go through `ProxyJellyseerrRequest`, which resolves the caller's linked Seerr user
and ignores a client-supplied `X-Api-User`); it forwards only `tmdbId` and `mediaType`; it answers 400 before
calling Seerr when Seerr or the requested-media switch is off or the body is invalid. Without this commit, the
branch fails exactly these six tests and gate INV: `RouteAuthSnapshotTests.RouteVerbAuthAndBindingMatchTheSnapshot`,
`AuthHelperCallSnapshotTests.AuthHelperCallsPerActionMatchTheSnapshot` and `.EveryRoutedActionIsCounted`,
`AuthReadClosureSnapshotTests.TransitiveAuthReadsPerRouteMatchRestructureBase` and `.RoutesMatchGateA`,
`ServiceRegistrationSnapshotTests.RegistrationsPerTypeOrderAndMvcFiltersMatchTheSnapshot`.

Pinned files changed inside the ports themselves, because the repository's own rules say they follow the change
(not contract snapshots, but worth a look):

- `tests/fixtures/admin-config-baseline.json` (port 8): three added lines, the control id `watchlistRemovalSync` in
  `renderedIds` and `whatsNewSchemaIds`, and `"WatchlistRemovalSync": "jellyfin"` in `collectedFromEmpty`.
  `docs/rewrite/admin-config.md`: "Regenerate it only for an intentional schema change." Hand-added, nothing else
  moved.
- `client/src/admin/config/sections-entry.ts` (port 8): one line in the What's New lexical index, so the new
  setting is announced as upstream announces it.
- `tests/backend/Architecture/FileSizeTests.cs` and `AGENTS.md` (port 7): the `TagCacheService.cs` allow-list entry
  **lowered** to 4,088, as the rule asks when the file shrinks.
- `PosterTagSettings.ResolverVersion` 39 → 40 and the four tests that pin it (port 2): AGENTS.md, "Cached output".
- `docs/advanced/config-flag-groups.json` (port 8): regenerated by `scripts/generate_config_flag_groups.py`.
- `tests/docs/production-inventory.json` (port 8): regenerated by `tests/inventory/generate.py`.
- `artifacts/restructure-plan/baselines/dotnet-tests.txt`, `npm-tests.txt`, `tooling-tests.txt`: the count floors,
  raised to this tree's counts (3,295, 3,906, 28) in their own commit.

## 10. Found bugs filed (`je12 found-bug`)

Six notes under `$JE12_HOME/found-bugs/` on the Lenovo. The first four are faults in upstream found while porting;
the rewrite carries the corrected text or value. The last two are older than this branch and are in both lines.

| Note | Symptom |
|---|---|
| `NEW-20261110-163200-upstream-docs-still-say-an-episode-added-recentl.md` | `docs/enhanced/tags.md` still says an episode "aired or was added" recently shows New Episode, after `6ece3f52` removed the added case. |
| `NEW-20261110-185543-upstream-admin-text-says-a-request-adds-nothing-.md` | The admin description of "Requested media goes on the requester's watchlist" says nothing is added when a request is made; the same commit puts it on the Seerr watchlist at once. |
| `NEW-20261110-185543-upstream-docs-keep-the-old-watchlist-setting-nam.md` | Six docs pages keep the five old watchlist setting names (21 lines) and do not list the new removal setting. |
| `NEW-20261110-223928-upstream-changed-the-new-episode-status-rule-wit.md` | `6ece3f52` changes the tags produced for the same data without bumping `PosterTagSettings.ResolverVersion`, so cached native posters keep the old badge. |
| `NEW-20261110-230039-spoiler-guard-reading-a-guarded-unwatched-episod.md` | Spoiler Guard: a client that reads a guarded, unwatched episode and saves it back stores the placeholder title and overview as the episode's metadata. Reproduced on the rewrite and on upstream `0586df79`; not fixed here. Found when a parity script did exactly that. |
| `NEW-20261110-230040-a-backend-test-measures-a-real-300-ms-window-wit.md` | The timing test of section 8 fails under load on either line of code. |

## 11. Deferred, not applicable

None. All 17 entries are `ported`.

## 12. Decisions made instead of asking

1. **A `test` class in the ledger**, beside the classes of the brief, for test-only commits (`7a52d1e9`,
   `aa8f4312`); they are ported with the fix they pin (`"with"`).
2. **The ledger names rewrite commits through `Upstream:` trailers.** A commit cannot contain its own SHA, so each
   port sets `status: ported` in its own commit and `upstream_sync.py resolve` fills `rewriteCommits` from the
   trailers afterwards. `check` fails if a ported entry has no such commit. This is what let the ledger follow the
   rebase with one command.
3. **`manifest.json` kept identical to upstream's**, including the 10.11 catalog entry (data, not 10.11 code).
4. **The contract commit stands alone after the first batch's version commit**, so that it could be dropped or
   reworked without a conflict. The reviewer accepted it as it is.
5. **Fixture additions for the new setting went into the port**, not the contract commit (section 9), because
   `docs/rewrite/admin-config.md` makes them part of adding a setting.
6. **Docs renamed and corrected beyond upstream** where upstream left them contradicting the code (sections 9, 10).
7. **Cancellation is honoured in the removal task** and the re-add visibility rule runs in the admin page's
   dependency pass: two small departures from upstream's text, both in the ledger notes.
8. **`mkdocs.yml` excludes `docs/upstream-sync*`** from the public documentation site: they are maintainer files.
9. **`scripts/upstream_lab_deploy.py`** bridges je12's lab to upstream builds by calling je12's internal install
   step. It belongs in je12 as `je12 deploy --upstream REF`; until then it follows whatever je12 `$JE12` points at
   (checked with v2.3.2 on Docker and v2.3.3 on the process backend).
10. **A second worktree** carried ports 7 to 12 while the first checkout's gate job sat in the lock queue; the
    branch was fast-forwarded to it and the worktree removed. Evidence files of ports 7 and 8 therefore name that
    path on their first line.
11. **One lab was thrown away mid-port**: creating a collection through the API started a library scan that
    removed the lab's file-less items. The collection check uses `je12 env content --collections` instead; the
    procedure says so.
12. **Rating, status and audio-language settings of the lab user were switched on** by the lab scripts where a
    check needed them (lab state only).
13. **The three upstream commits that arrived during review were ported** rather than left `pending`, as the
    reviewer then also asked. `19cfe99a` is classed `security` although upstream titled it `ci:`: most of it is
    three fixes in shipped client code.
14. **`ResolverVersion` 39 → 40 was folded into port 2** during the rebase, when the main line gained the "Cached
    output" rule. Upstream did not bump it (section 10).
15. **Rebase conflicts**: `AGENTS.md` took the main line's text with this branch's lowered `TagCacheService.cs`
    size; `tests/run.py` keeps the rewrite's `--target` and gains `--project`. Generated files were regenerated
    with `je12 regen`, none merged by hand. One commit per port and the `Upstream:` trailers are unchanged.
16. **The README's three test-count badges carry this tree's counts** (699, 3.3k, 3.9k), not upstream's.
17. **One evidence file quoted the file name of a library item**; it was replaced by a placeholder in the commit
    that introduced it, before landing, because the main line is published.
18. **An unattended run does not land a contract change.** The procedure has it finish the port on its own branch
    (`sync/contract-<sha>`) and mark the entry `deferred` with the added lines in `needs`, so that a route or
    authorization change still reaches a maintainer first.
19. **Gates and the final parity pass ran on the second machine** (section 8), with nothing copied there but the
    branch.
20. **Count floors raised** to the measured totals in their own commit, after the model of the last merge.

## 13. What the next catch-up costs (Part 3)

- `python3 scripts/upstream_sync.py update --fetch` fetches upstream anonymously into `refs/upstream-sync/*`, appends
  the commits the ledger lacks as `pending` with a guessed class and features, renders the table and prints the work
  list with a `how:` line per entry. `check` (offline by default, `--fetch` to count unlisted upstream commits)
  fails on an invalid ledger, a stale table, a ported entry with no `Upstream:` commit, or a `pending` entry older
  than `policy.maxPendingDays` (14). The script can only run a fixed list of read-only git subcommands plus `fetch`,
  with credentials, prompts and hooks off, and refuses any URL that is not `https://`, `git://` or a local path: it
  cannot push. Eleven tests in `tests/runner/tests/test_upstream_sync.py` (part of gate TOOL) cover the guesses,
  idempotence, the check rules, trailer resolution and the no-push guard.
- [`docs/upstream-sync-procedure.md`](../../../docs/upstream-sync-procedure.md) is the procedure, one page, written
  for an agent that is given that page and nothing else: its own worktree and branch, the run from `update --fetch`
  to the fast-forward, what each status needs, how housekeeping commits are applied so that nothing stays `pending`,
  when the upstream-build helper is used and when it is skipped, and what an unattended run must not land.
- What this run cost, as a guide: each small port was a few lines of code, its tests and three lab recordings; the
  two large ones took most of the working time; and the wall clock was dominated by waiting for the Lenovo's gate
  lock, not by porting. The script's class guesses were right for 16 of the 17 commits (`19cfe99a`, above); its
  feature guesses needed two rules added (a test folder that several features share no longer names an owner;
  `tests/poster/` maps to media-tags).
- Not automated: nothing opens the lab or writes the port. `check` is not yet wired into a workflow; adding
  `python3 scripts/upstream_sync.py check --fetch` to `rewrite-validation.yml` is a one-line follow-up once the
  maintainers agree on the 14-day limit.

## 14. Direction of travel: advice for the two maintainers

**Recommendation: propose the rewrite to upstream as its new main line, soon, with a short freeze for the switch.
Keep porting on every upstream push until then, and do not plan to run two code lines for longer than a few weeks.**

### Why not keep porting indefinitely

- **Every upstream change is paid for twice, and upstream moves fast.** This catch-up covered four days: 17
  commits, 3,719 added lines. October's rate was about four commits a day (151 between 1 October and 7 November).
  A weekly catch-up at that rate is 25 to 30 commits.
- **The server half ports almost for free; the client half does not.** The C# files were moved, not rewritten, so
  upstream's C# hunks applied with a path change in every port here (`TagCacheService.cs`, the three watchlist
  tasks, configuration, the strip filter). Upstream's tests also translate nearly word for word, because both lines
  test the built `js/` files under the same names. But every client change is a re-implementation from hand-written
  JavaScript into typed modules, and that is where the judgement and the risk are: of the nine behaviour changes
  here, eight touched client code.
- **The rewrite's rules make some upstream changes structurally awkward**, and that friction recurs: a capped file
  that upstream keeps growing (`TagCacheService.cs`, +470 lines in one commit), a route added to a controller the
  rewrite froze, a new setting that has to be entered in three pinned lists, a cache version to bump. Each rule is
  right for the rewrite and each is extra work on every port while two lines exist.
- **Contributors are writing against the hand-written line.** Three of the nine behaviour changes were pull
  requests from people other than upstream's author (#1029, #1030, #1033). They were written for that layout, and
  the next ones will be too.
- **Drift is silent.** Until this ledger existed, nothing recorded what the rewrite lacked. The ledger and
  `upstream_sync.py check` fix the visibility, not the cost.

### Why not switch today

The rewrite has so far been run only by its authors, and only on labs. Five things have to be true first.

### What has to be true for the switch

1. **The ledger is at zero and stays there unattended.** This branch brings it to zero pending. A catch-up run by
   an agent from the procedure alone, without a maintainer steering, is the proof that it holds.
2. **A decision on Jellyfin 10.11.** Upstream ships a 12 build and a 10.11 build of every release; the rewrite
   builds for 12 only. Upstream's own policy already says the 10.11 build is best-effort with no 10.11-only fixes.
   The switch needs upstream's author to decide that the last hand-written release is the last 10.11 build. The
   catalog already serves different versions per server ABI, so 10.11 users would stay on that build and keep
   working. If 10.11 has to stay supported with new features, the switch cannot happen as it stands, and it is
   better to know that early than to port for months.
3. **A beta that real users run.** Publish the rewrite as an opt-in pre-release for Jellyfin 12 for two to three
   weeks, with the hand-written line still the default. The lab, the gates and the side-by-side benchmark show
   parity on what they exercise; real libraries and real habits will exercise more. Agree the exit rule in advance,
   for example no open regression against upstream behaviour for seven days.
4. **Upstream's CI and release pipeline run the rewrite.** The gates pass on the machines used here; they have to
   pass in upstream's Actions (`rewrite-validation.yml`), and the release workflow has to produce the same
   Jellyfin 12 artifact name and manifest entry from the new tree. Weblate needs no change: the locale files are
   the same files at the same paths.
5. **Open pull requests are accounted for.** At the freeze, every open upstream pull request is either merged (and
   ported through the ledger) or its author is shown how to redo it; `CONTRIBUTING.md` and `AGENTS.md` are the new
   contributor guide, and in the first weeks contributors will need help with the TypeScript and the build step.

### What it costs upstream's author to review

It cannot be reviewed as a diff: against the branch point it is about 2,470 files, +318,000 and -118,000 lines
(generated outputs and tests included), the client moved from 206 JavaScript files to 580 TypeScript modules and
two controllers became fourteen. Reading all of it would take weeks and is not where the remaining bugs would be
found. What can be reviewed in about two working days:

- **Half a day reading**: `AGENTS.md`, `docs/feature-map.json`, one well-known feature end to end (Seerr requests or
  Media Tags), and this ledger with its evidence folder.
- **Half a day running**: `npm run verify:restructure` and the browser gate on their own machine, and the
  upstream-versus-rewrite benchmark, which is the answer to "is it slower".
- **Half a day on a lab** with their own settings file imported, doing what they do when they test a release.
- **The decisions only upstream's author can make**: 10.11, the beta window, and whether the frozen-contract rules
  (snapshots that only the maintainer changes) are how they want to work, because after the switch they are that
  maintainer.

Against that: with two lines, each catch-up is a recurring cost of several agent-hours and a maintainer review of
whatever arrived, and every week adds contributor work that will have to be redone.

### In between: what to do from now until the switch

- Run the procedure on every upstream push (or at least weekly), and keep `check` in CI so that a stale ledger
  fails loudly.
- Settle the 10.11 question and a date for a freeze of about one week. Those two answers set the whole timetable,
  and neither needs anyone to read code.
- Until the freeze, avoid large structural changes upstream where possible (another config-page rebuild, another
  Media Tags redesign): those are the changes a port cannot translate.
- If 10.11 has to stay, or no date can be agreed within about two months, treat that as the decision: stop
  porting, and bring the rewrite's most useful pieces (tests, gates, the bug fixes found on the way) to upstream as
  ordinary pull requests instead.
