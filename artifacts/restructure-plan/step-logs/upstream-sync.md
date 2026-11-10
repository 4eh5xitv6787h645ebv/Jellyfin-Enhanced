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
| Jellyfin 10.11-only code | none as a whole commit; two fragments noted in the ledger |

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

`je12 gate final` runs after port 6, after port 8, and on the final commit.

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
| `2e20cb83`: manifest entries for the 12 and the 10.11 build | The rewrite builds for Jellyfin 12 only. | Decided at that port; recorded in the ledger. |
