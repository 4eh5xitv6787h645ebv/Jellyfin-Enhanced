# Upstream sync: `2e0f9251` → `c22870b2` (12.15.0.0 and after)

Branch `sync/upstream`, from `restructure/integration` at `2917a115`. The ledger is
[`docs/upstream-sync.json`](../../../docs/upstream-sync.json) (table: [`docs/upstream-sync.md`](../../../docs/upstream-sync.md));
this log is the plan, the evidence and the advice that go with it.

## 1. The gap, measured before porting (2026-11-10)

`git fetch origin` moved `origin/main` from `2e0f9251` to `c22870b2`.

| | |
|---|---|
| Upstream commits after `2e0f9251` | **14** (first-parent; no merge commits) |
| Dates | 2026-11-07 to 2026-11-10 (three days) |
| Release tags in the range | **1**: `12.15.0.0` on `6daf2118` (the range's second commit) |
| Size | 2,994 insertions, 209 deletions, 103 file changes |
| User-facing features | 2 (`533614b8` subtitle-offset shortcuts, `2e1f123d` watchlist removal sync) |
| Bug fixes | 6 (`6ece3f52`, `ee1c92dc`, `af5f9678`, `d3bd07d3`, `83510ea1`, `c22870b2`) |
| Test-only follow-ups | 2 (`7a52d1e9`, `aa8f4312`, both for `6ece3f52`) |
| Release bookkeeping | 2 (`6daf2118` version, `2e20cb83` manifest) |
| Dependency update | 1 (`800b768c`, GitHub Actions pins) |
| CI | 1 (`a2b4b2ab`) |
| Performance, security, translation, docs-only | 0 |
| Already in the rewrite | **0** (checked by behaviour, see below) |
| Jellyfin 10.11-only code | none. (The manifest commit carries the catalog entry of upstream's 10.11 build: release data, kept; see the ledger.) |

"Already present" was checked against the rewrite's code at `2917a115`, not by text:

| Upstream | What the rewrite does today |
|---|---|
| `533614b8` | No `DecreaseSubtitleOffset`/`IncreaseSubtitleOffset` shortcut anywhere (`PluginConfiguration.cs`, `chrome/events.ts`, `settings-panel/shortcut-rules.ts`, locales). |
| `6ece3f52` | `StatusRules.cs:132` and `statustags.ts:607` still show New Episode for `… \|\| addedRecently`. |
| `ee1c92dc` | `tag-pipeline.ts` has no redraw of cards already drawn; `TagCacheService` has no collection-member index. |
| `af5f9678` | `settings/state.ts:5` and `core/ui/runtime.ts:67` both read the duration as `value \|\| 1500`, so 0 is 1.5 s. |
| `2e1f123d` | No `WatchlistRemovalSync` setting, task, planner or `POST jellyseerr/watchlist`. |
| `d3bd07d3` | `SpoilerFieldStripFilter._routes` has no `("HomeScreen", "GetSectionContent")`. (`HiddenContentResponseFilter` already knows that action, so only Spoiler Guard was missing it.) |
| `83510ea1` | `recommendations-render.ts` has no drag guard on the tile rows. |
| `c22870b2` | `details-providers/media-info.ts:612` reads only `selectedSource.MediaStreams`, which `/tag-data` leaves empty. |

## 2. Port order

Small, independent fixes first, so every gate checkpoint lands on a tree that differs from the last one by little; then
the two large changes; then CI; then the contract commit; the version last.

| # | Upstream | Port as | Why here |
|---|---|---|---|
| 1 | `533614b8` | `feat(player)` | First upstream commit, and the only one released (12.15.0.0). |
| 2 | `6ece3f52` + `7a52d1e9` + `aa8f4312` | `fix(media-tags)` | The fix and its two test updates are one behaviour. |
| 3 | `af5f9678` | `fix(platform)` | Independent. |
| 4 | `d3bd07d3` | `fix(spoiler-guard)` | Independent, one route-table row. |
| 5 | `83510ea1` | `fix(seerr)` | Independent. |
| 6 | `c22870b2` | `fix(details-providers)` | Independent. |
| 7 | `ee1c92dc` | `fix(media-tags)` | Large; after the small media-tags fix so the two do not interleave. |
| 8 | `2e1f123d` | `feat(seerr)` | Large; changes the contract, so it is the last behaviour port. |
| 9 | `800b768c` | `chore(ci)` | Workflow pins only. |
| 10 | `a2b4b2ab` | `ci` | After the pin bump: both edit `regression.yml`. |
| 11 | — | `contract: upstream sync additions` | Snapshot additions for port 8, alone, for review. |
| 12 | `6daf2118` + `2e20cb83` | `chore(release)` | Version and manifest, last. |

`je12 gate final` was planned after port 6, after port 8 and on the final commit. It ran after port 6 and on the final commit (section 8 says why the middle one was dropped).

## 3. Commits that interact

- **`6ece3f52`, `7a52d1e9`, `aa8f4312`**: one fix, its unit-test row and its parity fixture. One commit.
- **`6daf2118`, `2e20cb83`**: the version and the manifest entry of the same release. One commit.
- **`800b768c`, `a2b4b2ab`**: both edit `.github/workflows/regression.yml`; ported in upstream order.
- **`2e1f123d` and the contract snapshots**: the port adds a route, a scheduled task and a DI registration. The
  snapshots it trips are updated in one separate commit at the end of the branch.
- **`ee1c92dc`, `d3bd07d3`, `83510ea1`** each add a sentence to the same row group of `tests/docs/coverage-matrix.md`;
  no code interaction.
- **`533614b8`, `af5f9678`, `2e1f123d`** all edit the admin page, in three different sections (shortcut defaults,
  the toast row, the Seerr watchlist section). No interaction beyond regenerating `configPage.html`.

## 4. Expected to be hard

- **`ee1c92dc` (1,562 lines).** Three reasons. (a) Its server half adds about 470 lines to `TagCacheService.cs`, which
  the rewrite caps at its current 4,125 lines (`FileSizeTests`; "the entry only shrinks"). (b) It comes with 1,016
  lines of tests in three runners (xUnit, node, Playwright) written against upstream's file layout and harness.
  (c) The client half changes when a drawn card is released, in the pipeline every tag type goes through; a mistake
  shows as flicker or stale tags on every poster.
- **`2e1f123d` (1,054 lines).** A new route, task and registration are a contract change here. It also reads and
  writes a real Seerr, so parity needs the real-services lab, and it removes user data (watchlist entries), so the
  "unknown is not none" rules have to hold on every read.

## 5. Needs redesign rather than translation

| Upstream change | Why a translation is not possible | Design used |
|---|---|---|
| `ee1c92dc`: 470 new lines inside `TagCacheService.cs` | The file is at its allow-listed cap and may not grow. | The collection-member index and its rules go into their own type in `Features/MediaTags/Services/TagCache/`; `TagCacheService` keeps only the call sites, and loses at least as many lines as it gains. |
| `2e1f123d`: route added to the single `JellyfinEnhancedController` | The rewrite has one controller per feature with a frozen route/auth snapshot. | The action goes in `JeSeerrController` beside `GET jellyseerr/watchlist`, with that route's authorization; the snapshot additions are a separate commit. |
| `2e1f123d`: `Services/WatchlistSyncPlanner.cs`, `Helpers/Jellyseerr/SeerrWatchlistReader.cs`, `ScheduledTasks/WatchlistRemovalSyncTask.cs` | Those folders are retired. | `Features/Seerr/Services/`, `Features/Seerr/Services/` and `Features/Seerr/Tasks/` (the task keeps the `…ScheduledTasks` namespace, as the other tasks do). |
| `af5f9678`: one-line change to `JE.CONFIG.TOAST_DURATION` and `JE.toast` | The rewrite reads the setting in `features/settings/state.ts`, passes it through `host/ui-host.ts` and uses it in `core/ui/runtime.ts`; the admin preview is `admin/config/page/timing.ts`. | The same rule in each of those places. |
| `533614b8`: `JE.adjustSubtitleOffset` called from `events.js` | The shortcut dispatcher is the chrome feature and may not import player code. | The player publishes the function on the JE facade, as it does `frameStep`; chrome calls it through its `EventsBridge` type. |
| `a2b4b2ab`: path filter `Jellyfin.Plugin.JellyfinEnhanced/(js\|Configuration\|…)` | In the rewrite the web files are built from `client/`, `css/` and `scripts/client*`. | The same job with the rewrite's source paths added to the filter. |
| `2e20cb83`: manifest entries for the 12 and the 10.11 build | The rewrite builds for Jellyfin 12 only. | `manifest.json` is kept byte-identical to upstream's: both entries are data about artifacts upstream published, and the catalog serves 10.11 servers from the same file. |

## 6. Result: the gap after

| | Before (2026-11-10, `2917a115`) | After (`sync/upstream`) |
|---|---|---|
| Upstream commits after `2e0f9251` | 14 | 14 |
| Ported | 0 | **14** (in 10 commits: `6ece3f52`+`7a52d1e9`+`aa8f4312` are one, `6daf2118`+`2e20cb83` are one) |
| Already present | 0 | 0 |
| Not applicable | 0 | 0 |
| Deferred | 0 | 0 |
| Pending | 14 | **0** |
| Plugin version | 12.14.0.0 | 12.15.0.0 (upstream's latest release) |
| `manifest.json` | upstream's at `2e0f9251` | upstream's at `c22870b2` (byte-identical) |
| Routes | 202 | 203 (`POST jellyseerr/watchlist`) |
| JE scheduled tasks | 15 | 16 (Sync Watchlist Removals between Jellyfin and Seerr) |
| Tooling tests | 16 | 26 |

Every upstream commit and its status (the ledger, `docs/upstream-sync.json`, is the source):

| # | Upstream | Date | Class | Features | Subject | Status | Rewrite commit |
|---|---|---|---|---|---|---|---|
| 1 | `533614b8` | 2026-11-07 | feature | player, chrome, settings-panel, admin, settings, platform | feat(player): add keyboard shortcuts for subtitle offset | ported | `04738805` |
| 2 | `6daf2118` | 2026-11-07 | release | - | v12.15.0.0 | ported | `13eb94ff` |
| 3 | `2e20cb83` | 2026-11-07 | release | - | v12.15.0.0 - Jellyfin Enhanced (synced from jellyfin-plugins) | ported | `13eb94ff` |
| 4 | `6ece3f52` | 2026-11-08 | fix | media-tags | fix(status-tags): only show New Episode on recent air date, not on recent add | ported | `b292ec58` |
| 5 | `7a52d1e9` | 2026-11-09 | test | media-tags | test(status-tags): update New Episode badge test for air-date-only rule | ported | `b292ec58` |
| 6 | `ee1c92dc` | 2026-11-09 | fix | media-tags | fix(tags): redraw changed cards and keep collection language flags current (#1029) | ported | `42582efa` |
| 7 | `af5f9678` | 2026-11-09 | fix | platform, settings, admin | fix(toast): let a duration of 0 turn toasts off and make the preview match | ported | `d063821d` |
| 8 | `aa8f4312` | 2026-11-09 | test | media-tags | test(parity): update New Episode status fixture for the air-date-only rule | ported | `b292ec58` |
| 9 | `800b768c` | 2026-11-09 | deps | - | chore(ci)(deps): bump the github-actions group with 6 updates (#1031) | ported | `05a49463` |
| 10 | `2e1f123d` | 2026-11-09 | feature | seerr, admin, settings, platform | feat(watchlist): two-way removal sync between Jellyfin and Seerr (#1032) | ported | `c18edf46` |
| 11 | `a2b4b2ab` | 2026-11-09 | ci | - | ci: skip browser tests on pull requests that do not touch web files | ported | `6fa91b45` |
| 12 | `d3bd07d3` | 2026-11-09 | fix | spoiler-guard | fix(spoiler-guard): strip Home Screen Sections rows (#1033) | ported | `414c1b45` |
| 13 | `83510ea1` | 2026-11-09 | fix | seerr | fix(recommendations): don't open category tiles after dragging a row (#1030) | ported | `8f419419` |
| 14 | `c22870b2` | 2026-11-09 | fix | details-providers | fix(audio-language): show audio languages on movie page | ported | `06fb4f81` |

Nothing could not be ported, and nothing was judged not applicable.

## 7. Parity evidence

For each user-visible change the same `je12 browse --script` command was run on one lab against three builds: the
rewrite before the port, an upstream build of `c22870b2` (put on the lab with `scripts/upstream_lab_deploy.py`), and
the rewrite at the port's commit. Scripts and raw outputs are in
[`upstream-sync-evidence/`](upstream-sync-evidence/) (`<port>.mjs`, `<port>.rewrite-before.txt`, `<port>.upstream.txt`,
`<port>.rewrite-after.txt`; the first line of each output is the command, the second the deployed build).
In every row the upstream and rewrite-after outputs are equal; where they contain names that depend on lab state
(port 7's collection check) the compared fields are named.

| Port | What the script does | Rewrite before | Upstream `c22870b2` | Rewrite after |
|---|---|---|---|---|
| 1 `533614b8` subtitle offset | Plays a clip, presses `]` `]` `[`, waits 2.4 s, opens the panel | no bindings; offset stays 0 | offsets 0.1, 0.2, 0.1; panel shown, then hidden; two panel rows | same as upstream (`04738805`) |
| 2 `6ece3f52` New Episode | Episode aired 400 days ago, added an hour ago; episode aired 2 days ago, added long ago; reads the badges on the search cards | New Episode / New Episode | Just Added / New Episode | same as upstream (`b292ec58`) |
| 3 `af5f9678` toast 0 | Saves 0, 10, 4000 ms and fires the real toast; types 0 and 50 into the admin preview | saved 0 reads 1500 and shows 2 toasts; preview says 3.0s for both | saved 0 shows none; preview "Toasts are turned off (0 ms)…" and "0.1s" | same as upstream (`d063821d`) |
| 4 `d3bd07d3` Home Screen Sections | Real Home Screen Sections 3.0.4.0 plugin; guarded series with the next episode unwatched; `GET /HomeScreen/Section/NextUp` | name "Tape 1, Side B" and the file path | "Season 1, Episode 2", no path | same as upstream (`414c1b45`) |
| 5 `83510ea1` drag | Recommendations page: drags a studio tile 60px, then a plain click on a fresh page | the drag opens "Marvel Studios" | drag opens nothing; click opens "Marvel Studios" | same as upstream (`8f419419`) |
| 6 `c22870b2` audio languages | A movie's details page (16 audio streams in Jellyfin) | no languages shown | 14 languages shown | same as upstream (`06fb4f81`) |
| 7 `ee1c92dc` redraw | A card on a kept details view; its movie's rating changed on the server from 6.0 to 1.1; back to the view | chip still 6.0 | chip 1.1 | chip 1.1 (`42582efa`) |
| 7 `ee1c92dc` collections | Adds a movie with a new audio language to a box set, then deletes that movie; reads the set's tag-cache entry for 60 s | still lists the deleted member's language (`followedTheDeletion: false`) | back to `["eng"]` (`true`) | back to `["eng"]` (`true`) |
| 8 `2e1f123d` watchlist, real Seerr 3.5.1 | `POST jellyseerr/watchlist` (add, again, invalid); like in Jellyfin; run the removal task; unlike; run it again | no setting; 405; no task | 200, 409, 400 `invalid_watchlist_item`; first run keeps it on Seerr; second run removes it | same as upstream (`c18edf46`) |
| 8 `2e1f123d` admin page | Seerr > Watchlist: options, and which "don't re-add" rows show per mode | (setting absent) | four options; rows hidden for Jellyfin decides and Both, shown for Seerr decides and Never | same as upstream (`c18edf46`) |

Not compared on a lab, and why:
- **Native poster path of port 2** (the C# `StatusRules`): no lab check; covered by the new native tests and by the
  offline parity run (`p2-new-episode.parity.txt`: 241 fixed-clock Status fixtures, 0 web/native differences).
- **Port 7, a member's audio track changing** (as opposed to the member being deleted): the lab's media are
  synthetic clips and cannot gain or lose a track. Covered by the 22 translated backend tests, which drive the real
  flush, reconciliation, save and load.
- **Port 8, the other three removal modes and the two add syncs' "don't put it back" rule**: covered by upstream's
  planner and task tests (translated), not repeated on the lab. Only "Jellyfin decides" ran against the real Seerr.
- **Ports 9, 10** (CI) and **12** (version): nothing a user sees. The workflow YAML parses; the path filter was
  checked against 14 sample paths. The workflows themselves have not run: nothing was pushed.

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

## 8. Gates

Checkpoint, after port 6, at `16c962f0`, `je12 gate final` (the machine was under another session's stress test:
load 25.6 on 10 CPUs at the start):

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
port touched. Flake protocol: (a) rerun alone, `--project=mobile-chromium --repeat-each=5`: **5 passed** (0.8 to
1.0 s each, load 2.8); (b) a clean full rerun of the browser gate: see the final gate below. A dedicated rerun at
`16c962f0` was queued for over an hour behind other sessions holding the machine's gate lock and is superseded by
the final run, which contains the same test.

The second planned checkpoint (after port 8) was not run on its own: each gate waited 30 to 60 minutes for the
machine's gate lock, and the final gate covers the same commits. With fewer than ten ports, one checkpoint plus the
final gate meets the "at least every ten ports" rule.

Between gates, every port ran `je12 test` (typecheck, build, the touched features' node tests, and the backend
tests where C# changed), and the last run before the contract commit failed only the six contract tests listed in
section 9.

FINAL-GATE-PLACEHOLDER

## 9. Contract changes awaiting review

One commit, `contract: upstream sync additions` (the last commit that changes anything a test reads), holds every
frozen-contract change of the branch. It was written by hand; `JE_UPDATE_SNAPSHOTS` was never set. All of it comes
from port 8 (`2e1f123d`, `c18edf46`).

| File | Added line |
|---|---|
| `tests/backend/Architecture/route-auth.snapshot.json` | `{"verb":"POST","route":"JellyfinEnhanced/jellyseerr/watchlist","requiresAuth":true,"auth":"","action":"AddJellyseerrWatchlist","apiBehavior":true,"parameters":["requestBody:Body"]}` |
| `tests/backend/Architecture/auth-helper-calls.snapshot.json` | `"AddJellyseerrWatchlist": {"IsAdminUser":5,"User":1,"UserHelper.GetCurrentUserId":1}` |
| `tests/backend/Architecture/auth-reads-by-route.base.json` | `"POST JellyfinEnhanced/jellyseerr/watchlist": {"IsAdminUser":5,"User":1,"UserHelper.GetCurrentUserId":1}` |
| `tests/backend/Architecture/service-registrations.snapshot.json` | `"WatchlistRemovalSyncTask \| WatchlistRemovalSyncTask \| Transient"` |
| `artifacts/restructure-plan/baselines/inventory-routes.txt` | `POST /JellyfinEnhanced/jellyseerr/watchlist` |

Changed, not added: `RouteAuthSnapshotTests.ExpectedRoutes` 202 → 203, and the comment beside it. No existing
route, verb, authorization or registration line is changed or removed.

What to check: the new route has the same `[Authorize]` and the same auth-read closure as its neighbour
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
  **lowered** from 4,125 to 4,088, as the rule asks when the file shrinks.
- `docs/advanced/config-flag-groups.json` (port 8): regenerated by `scripts/generate_config_flag_groups.py`.
- `tests/docs/production-inventory.json` (port 8): regenerated by `tests/inventory/generate.py`.

## 10. Found bugs filed (`je12 found-bug`)

All three are faults in upstream at `c22870b2`, found while porting; the rewrite carries the corrected text.

| File under `$JE12_HOME/found-bugs/` | Symptom |
|---|---|
| `NEW-20261110-163200-upstream-docs-still-say-an-episode-added-recentl.md` | `docs/enhanced/tags.md` still says an episode "aired or was added" recently shows New Episode, after `6ece3f52` removed the added case. |
| `NEW-20261110-185543-upstream-admin-text-says-a-request-adds-nothing-.md` | The admin description of "Requested media goes on the requester's watchlist" says nothing is added when a request is made; the same commit puts it on the Seerr watchlist at once. |
| `NEW-20261110-185543-upstream-docs-keep-the-old-watchlist-setting-nam.md` | Six docs pages keep the five old watchlist setting names (21 lines) and do not list the new removal setting. |

## 11. Deferred, not applicable

None. All 14 entries are `ported`.

## 12. Decisions made instead of asking

1. **A `test` class in the ledger**, beside the nine classes of the brief, for test-only commits (`7a52d1e9`,
   `aa8f4312`); they are ported with the fix they pin (`"with"`).
2. **The ledger names rewrite commits through `Upstream:` trailers.** A commit cannot contain its own SHA, so each
   port sets `status: ported` in its own commit and `upstream_sync.py resolve` fills `rewriteCommits` from the
   trailers afterwards (here: in the two docs commits). `check` fails if a ported entry has no such commit. This
   also survives a rebase of the branch.
3. **`manifest.json` kept identical to upstream's**, including the 10.11 catalog entry (data, not 10.11 code).
4. **The contract commit comes after the version commit**, so it is the last commit that changes behaviour or a
   test input; only the test-floor and docs commits follow it. To drop or rework it, nothing later conflicts.
5. **Fixture additions for the new setting went into the port**, not the contract commit (section 9), because
   `docs/rewrite/admin-config.md` makes them part of adding a setting.
6. **Docs renamed and corrected beyond upstream** where upstream left them contradicting the code (sections 9, 10).
7. **Cancellation is honoured in the removal task** and the re-add visibility rule runs in the admin page's
   dependency pass: two small departures from upstream's text, both in the ledger notes.
8. **`mkdocs.yml` excludes `docs/upstream-sync*`** from the public documentation site: they are maintainer files.
9. **`scripts/upstream_lab_deploy.py`** bridges je12's lab to upstream builds by calling je12's internal install
   step. It belongs in je12 as `je12 deploy --upstream REF`; until then it follows whatever je12 `$JE12` points at.
10. **A second worktree** (`je-upstream-sync-pre`, branch `sync/upstream-next`) carried ports 7 to 12 while the
    first checkout's gate job sat in the lock queue; `sync/upstream` was fast-forwarded to it. Evidence files of
    ports 7 and 8 therefore name that path on their first line.
11. **One lab was thrown away mid-port**: creating a collection through the API started a library scan that
    removed the lab's file-less items. The collection check uses `je12 env content --collections` instead; the
    procedure says so.
12. **Rating, status and audio-language settings of the lab user were switched on** by the lab scripts where a
    check needed them (lab state only).

## 13. What the next catch-up costs (Part 3)

- `python3 scripts/upstream_sync.py update` fetches upstream anonymously into `refs/upstream-sync/*`, appends the
  commits the ledger lacks as `pending` with a guessed class and features, renders the table and prints the work
  list. `check` (offline by default, `--fetch` to count unlisted upstream commits) fails on an invalid ledger, a
  stale table, a ported entry with no `Upstream:` commit, or a `pending` entry older than `policy.maxPendingDays`
  (14). It can only run nine read-only git subcommands plus `fetch`, with credentials, prompts and hooks off, and
  refuses any URL that is not `https://`, `git://` or a local path. Ten tests in `tests/runner/tests/` (part of gate
  TOOL) cover the guesses, idempotence, the check rules, trailer resolution and the no-push guard.
- `docs/upstream-sync-procedure.md` is the procedure for an agent.
- What this run cost, as a guide: each of the six small ports was a few lines of code, its tests and three lab
  recordings; the two large ones took most of the working time; and the wall clock was dominated by waiting for
  the machine's gate lock (30 to 60 minutes per gate), not by porting. The script's class guesses were right for
  all 14 commits; its feature guesses for 12 on the first run, and two rules were added for the two misses (a test
  folder that several features share no longer names an owner; `tests/poster/` maps to media-tags).
- Not automated: nothing opens the lab or writes the port. `check` is not yet wired into a workflow; adding
  `python3 scripts/upstream_sync.py check --fetch` to `rewrite-validation.yml` is a one-line follow-up once the
  maintainers agree on the 14-day limit.

## 14. Direction of travel: advice for the two maintainers

**Recommendation: propose the rewrite to upstream as its new main line, soon, with a short freeze for the switch.
Keep porting weekly until then, and do not plan to run two code lines for longer than a few weeks.**

### Why not keep porting indefinitely

- **Every upstream change is paid for twice, and upstream is fast.** This catch-up covered three days: 14 commits,
  2,994 added lines, from four people and two bots. October's rate was about four commits a day (151 between
  1 October and 7 November). A weekly catch-up at that rate is 25 to 30 commits.
- **The server half ports almost for free; the client half never will.** The C# files were moved, not rewritten, so
  upstream's C# hunks applied with a path change in every port here (`TagCacheService.cs`, the three watchlist
  tasks, configuration, the strip filter). Upstream's tests also translate nearly word for word, because both lines
  test the built `js/` files under the same names. But every client change is a re-implementation from hand-written
  JavaScript into typed modules, and that is where the judgement and the risk are: of the eight behaviour changes
  here, seven touched client code.
- **The rewrite's own rules make some upstream changes structurally awkward**, and that friction recurs: a capped
  file upstream keeps growing (`TagCacheService.cs`, +470 lines in one commit), a route added to a controller the
  rewrite froze, a new setting that has to be entered in three pinned lists. Each is right for the rewrite and each
  is a tax on every future port while two lines exist.
- **Contributors are writing against the old line.** Three of the eight behaviour changes were pull requests from
  people other than upstream's author (#1029, #1030, #1033). They were written for the hand-written layout, and
  the next ones will be too.
- **Drift is silent.** Until this ledger existed, nothing recorded what the rewrite lacked. The ledger and
  `upstream_sync.py check` fix the visibility, not the cost.

### Why not switch today

The rewrite has not yet been run by anyone but its authors, on anything but labs. Four things have to be true first.

### What has to be true for the switch

1. **The ledger is at zero and stays there unattended.** This branch brings it to zero pending. One more catch-up
   run by an agent from the procedure alone, without a maintainer steering, is the proof that it holds.
2. **A decision on Jellyfin 10.11.** Upstream ships a 12 build and a 10.11 build of every release; the rewrite
   builds for 12 only. Upstream's own policy already says the 10.11 build is best-effort with no 10.11-only fixes,
   and its compatibility page says .NET 9, which 10.11 runs on, leaves Microsoft support after 10 November 2026. The switch needs upstream's author
   to say that the last hand-written release is the last 10.11 build. The catalog already serves different versions
   per server ABI, so 10.11 users stay on that build and are not broken. If he will not drop 10.11, the switch
   cannot happen and the honest alternative is to stop the rewrite, not to port forever.
3. **A beta that real users run.** Publish the rewrite as an opt-in pre-release for Jellyfin 12 for two to three
   weeks, with the hand-written line still the default. The je12 lab, the gates and the side-by-side benchmark
   show parity on what they exercise; about 36,000 users will exercise more. Agree the exit rule in advance, for
   example no open regression against upstream behaviour for seven days.
4. **Upstream's CI and release pipeline run the rewrite.** The gates pass on this machine; they have to pass in
   upstream's Actions (`rewrite-validation.yml`), and the release workflow has to produce the same Jellyfin 12
   artifact name and manifest entry from the new tree. Weblate needs no change: the locale files are the same
   files at the same paths.
5. **Open pull requests are accounted for.** At the freeze, every open upstream PR is either merged (and ported
   through the ledger) or its author is told how to redo it; `CONTRIBUTING.md` and `AGENTS.md` are the new
   contributor guide, and the first weeks will need the maintainers to help contributors over the TypeScript and
   build step.

### What it costs upstream's author to review

It cannot be reviewed as a diff: against the branch point it is about 2,470 files, +318,000 and -118,000 lines
(generated outputs and tests included), the client moved from 206 JavaScript files to 580 TypeScript modules and
two controllers became fourteen. Asking him to
read it would be asking for weeks and would not find the bugs that matter. What he can review in about two
working days:

- **Half a day reading**: `AGENTS.md`, `docs/feature-map.json`, one feature end to end that he knows well (Seerr
  requests or Media Tags), and this ledger with its evidence folder.
- **Half a day running**: `npm run verify:restructure` and the browser gate on his own machine, and the
  upstream-versus-rewrite benchmark (`je-upstream-bench`), which is the answer to "is it slower".
- **Half a day on a lab** with his own settings file imported (`je12 env settings-import`), doing what he does
  when he tests a release.
- **The decisions only he can make**: 10.11, the beta window, and whether the frozen-contract rules (snapshots that
  only the maintainer changes) are how he wants to work, because after the switch he is that maintainer.

Against that: with two lines, the weekly port is a recurring cost on this side of several agent-hours and a
maintainer review of 25 to 30 commits, and every week of delay adds to the pile of contributor work that has to be
redone.

### In between: what to do from now until the switch

- Run `python3 scripts/upstream_sync.py update` weekly (or on every upstream push) and port with the procedure;
  keep `check` in CI so a stale ledger fails loudly.
- Ask upstream's author now for the 10.11 decision and a date for a freeze of about one week. Those two answers
  set the whole timetable, and neither needs him to read any code.
- Until the freeze, ask that upstream avoid large structural changes (another config-page rebuild, another
  Media Tags redesign): those are the changes a port cannot translate.
- If the answer on 10.11 is no, or no date can be agreed within about two months, treat that as the decision:
  stop porting, and bring the rewrite's best pieces (tests, gates, bug fixes found on the way) to upstream as
  ordinary pull requests instead.
