# Merge log: bug-fix lane A (2026-11-10)

Input: [bugfix-lane-a.md](bugfix-lane-a.md), branch `laptop/bugfix-lane-a` `7550329f` (fetched from the laptop's `bugfix/lane-a`), based on `e7f75cda`. It fixes BUG-001/002 (admin Media Tags identity), BUG-004/005 (escaping in toasts) and BUG-006 (subtitle CSS validation).

Machine: Lenovo worker, main checkout, Node 26.2.0 (`/home/jake/.local/opt/node-v26.2.0-linux-x64/bin`) first on PATH.
- One dotnet build or test ran at a time. Every gate ran with `JE_UPDATE_SNAPSHOTS` unset (`env -u`).
- `browser` ran twice as a harness-tracked background task. Each run was waited on before anything else ran.
- Nothing was pushed or tagged, and no attribution lines were added.

## Commits

| SHA | Commit |
|---|---|
| `bd1d29ce` | merge: bug-fix lane A (`laptop/bugfix-lane-a` `7550329f`, `--no-ff`) on branch `bugfix/merge-a`, from `restructure/integration` `d0cfd93e` (clean tree) |
| **`e08bb100`** | integration merge (`--no-ff`, parents `d0cfd93e` and `bd1d29ce`). Its tree equals `bugfix/merge-a`. |

This log, its screenshots and the `bugfix-a` line in `baselines/bundle-checkpoints.txt` are the last commit on top of it.

## Merge

**Conflicts.** 12 paths conflicted, all of them generated:
- the maps of `ui-panel-media-tags`, `ui-panel-settings`, `ui-panel-tag-editor`, `ui-panel-tag-portable` and `ui-panel-template`;
- their `min/js` twins, plus the twin map of `ui-panel-template`;
- `client/generated-manifest.json`.

Lane A's BUG-006 commit and K3's R13-FE2 merge both regenerated the settings-panel outputs. None of these files was hand-merged. After `checkout --ours`, `npm run client:build && npm run inventory:rewrite` regenerated everything. `client:check` and `inventory:rewrite:check` passed, and no conflict marker was left. Regeneration changed no file outside the conflicted set. All source, tests and baselines merged cleanly.

**Guard and architecture baselines.** The two branches touched different files, so there was no per-key choice to make:
- K3 changed only `performance-rules-guard-baseline.json` (R6 removals).
- Lane A lowered only `escape-guard-baseline.json` and `css-injection-guard-baseline.json` (the five keys listed in its log).
- `git diff d0cfd93e e08bb100 -- tests/frontend/guards` shows exactly lane A's lowerings. Nothing was raised.
- No architecture baseline, budget, `tests/backend/Architecture/*` snapshot or `artifacts/restructure-plan/baselines/*` file changed. The only exception is the new checkpoint line in this commit.

## Gates

| Tree | Gate | Result |
|---|---|---|
| `bd1d29ce` | `all` | **pass**, 4.5 min: dotnet 3238 total / 3237 passed / 1 listed; npm 3845 / 3836 / 9 listed (+10, lane A's regression tests); no "lower the baseline" or "listed but did not fail" note |
| `bd1d29ce` | `browser` | **pass**: 693 tests, 638 passed, 52 failed (= `baselines/browser-failures.txt`), 3 skipped, 8.5 min |
| `bd1d29ce` | `size` | pass: raw **2,376,204** ≤ 2,494,625; gzip -9 **639,483** ≤ 671,156 (K3: 2,375,320 / 639,047; lane A adds the validators and escapes). No brotli CLI on this machine. |
| `bd1d29ce` | `inv`, `tool`, `h` | pass |
| `bd1d29ce` | jsdom suite on the minified twins (`JE_TEST_MIN_TWINS=1 node tests/frontend/run.mjs`) | 3845 / 3836 / **9 failed**, exactly the 9 names in `baselines/npm-failures.txt` (compared by name) |
| `e08bb100` (integration) | `all` | **pass** (same counts) |
| `e08bb100` | `browser` | **pass** (693 / 638 / 52 listed / 3 skipped, 8.5 min) |
| — | `image` | `jellyfin/jellyfin:12.4 = …@sha256:b45218a4…575d`, pass |

- **Flakes:** none. Every gate passed at its first run, so the flake protocol was not needed.
- **Snapshots unchanged:** `git diff d0cfd93e e08bb100 -- tests/backend/Architecture artifacts/restructure-plan/baselines client/bundle-budget.json tests/frontend/architecture` is empty.
- **Build warnings:** only the baselined `JeBookmarksController.cs(49,45) CS8604`.

## HOST (`e08bb100`)

**`je up`.** `je up rsfa 18573 --image jellyfin/jellyfin:12.4`, using `~/.claude/skills/jellyfin-enhanced/scripts/je`, ran unmodified:
- `jf12: ok, 1 baselined warning(s)`;
- `deployed e08bb100 to je-lab-rsfa http://127.0.0.1:18573 in 4s`, 30 s in total.

`je` again printed its upstream `CHECK CACHE` reminder. It does not apply here.

**Isolation.** A scratch watcher (as at K3) ran beside `je up`. As soon as the container was up and the golden config had been copied, at 06:07:21 with the plugin directory still absent, it did three things:
- emptied `SonarrUrl`, `RadarrUrl` and both API keys, and set both instance lists to `Enabled=false` with empty URL and key;
- set `ActivityFeedUseNativeTab`, `CatchUpEnabled` and `CatchUpUseNativeTab` to true;
- inserted `iptables -I DOCKER-USER -s 172.18.0.3/32 -d 192.168.0.84/32 -j REJECT` (this container only).

Results:
- After the edit, no copy of `192.168.0.84` was left in the config, and at the end no file under the server's `config/` mentioned it.
- The REJECT rule's packet counter was **0** when it was deleted.
- Seerr is the lab's `je-perf-real-seerr` (another session's container). It was used read-only (search, issues). Nothing was requested from it: the BUG-005 check answered every Seerr call in the browser (below).

### Per-bug live results

| Bug | Result | How it was checked |
|---|---|---|
| **BUG-001** Media Tags section renders | **PASS** | See [BUG-001 config reads](#bug-001-config-reads) below. |
| **BUG-002** Save persists after the Media Tags section loaded | **PASS** | See [BUG-002 save, reload and restore](#bug-002-save-reload-and-restore) below. |
| **BUG-004** bookmark replacement toast | **PASS** | See [BUG-004 replacement toast](#bug-004-replacement-toast) below. |
| **BUG-005** Seerr season-request toast | **PASS** (Seerr answers mocked in the browser) | See [BUG-005 season-request toast](#bug-005-season-request-toast) below. |
| **BUG-006** subtitle colour or font | **PASS** | See [BUG-006 subtitle CSS](#bug-006-subtitle-css) below. |

#### BUG-001 config reads

The check opened Dashboard → `#/configurationpage?name=Jellyfin%20Enhanced`, clicked `button.jellyfin-tab-button[data-tab="media-tags"]` and counted `/Plugins/{id}/Configuration` requests from the network log.

- **The section rendered:** 16 tabs (Overview, Layout defaults, Groups, Rules, Colours, Status badges, Server and the 9 groups), with no "Loading Media Tags settings…".
- **Opening the section made exactly 1 configuration GET.** The count was still 1 after 10 more seconds, so there is no read loop.
- **The page as a whole made 3 GETs.** The other two happen at page load, before the section opens:
  - jellyfin-web's config page `loadConfig`;
  - `features/chrome/plugin-icons.ts` `getCustomPlugins` (the dashboard drawer's custom plugin links, cached per account).

  Both were identified from the request stacks, the second via the served source map. Neither is part of lane A.
- Before the fix (K3, merge-k-r13fe) the section stayed on "Loading…" with 0 tabs.

Screenshot: [bug001-media-tags](merge-bugfix-a-host-bug001-media-tags.png)

#### BUG-002 save, reload and restore

- **Change and Save:** with the Media Tags section loaded, the check went to Display, changed `#showFileSizes` from true to false, and clicked the page's Save. That made 1 config write, which answered 204.
- **Persisted:** after a full reload, the checkbox was false and `getPluginConfiguration` returned `ShowFileSizes: false`.
- **Restored:** the check opened the Media Tags section again, set the value back to true and saved (204). After a reload, both the UI and `GET /Plugins/…/Configuration` gave `ShowFileSizes: true`.

Screenshot: [admin-page](merge-bugfix-a-host-admin-page.png)

#### BUG-004 replacement toast

**Setup:**
- *Abominable* (TMDB 431580) was renamed through `POST /Items/{id}` to `<b>x</b><img src=x onerror=alert(1)>` (Name locked).
- An orphaned bookmark was added for a non-existent item id with the same TMDB id.

**Flow:** `#/bookmarks` (1 orphaned row) → find-replacement → the modal option shows the name as text → Migrate.

**Toast:**
- Text: `✅ Migrated 1 bookmark(s) to <b>x</b><img src=x onerror=alert(1)>`.
- innerHTML: `&lt;b&gt;x&lt;/b&gt;&lt;img src=x onerror=alert(1)&gt;`.
- 0 `<b>`, 0 `<img>`, no `img[src="x"]` anywhere in the page, and no dialog.

The first attempt migrated correctly, but the toast capture failed (a bug in the scratch script's observer, not in the product). The bookmark was reset and the run repeated with the result above.

Screenshots: [bug004-modal](merge-bugfix-a-host-bug004-modal.png), [bug004-toast](merge-bugfix-a-host-bug004-toast.png)

#### BUG-005 season-request toast

**Why mocked:** a real request would go through the shared Seerr to Sonarr at 192.168.0.84. So Playwright answered every `/JellyfinEnhanced/jellyseerr/*` call:
- TV 990001 had Seerr-side `name` = the payload;
- `partial-requests` was off;
- `POST /request` answered 201.

`JellyseerrShowAdvanced` was set to false in the page, so the modal would not ask Seerr for Sonarr servers.

**Flow:** the real bundle's `JellyfinEnhanced.jellyseerrUI.showSeasonSelectionModal(990001, 'tv', 'this show')`. The generic title means the Seerr name is used. Then Request.

**Results:**
- The modal subtitle is the literal text.
- The toast reads `📺 Requested all season(s) of "<b>x</b><img src=x onerror=alert(1)>"`, with innerHTML escaped, 0 `<b>`/`<img>` and no dialog.
- Calls seen: `GET /settings/partial-requests`, `GET /tv/990001`, `GET /quota`, `GET /tv/990001/season/1`, `POST /request`. All were answered in the browser.

**Not covered:** the server-side Seerr proxy was not part of this check.

Screenshots: [bug005-modal](merge-bugfix-a-host-bug005-modal.png), [bug005-toast](merge-bugfix-a-host-bug005-toast.png)

#### BUG-006 subtitle CSS

**Setup:** `real-admin`'s `settings.json` was saved through the API with `CustomSubtitleTextColor` = `red;}*{display:none` and `CustomSubtitleBgColor` = `#000000;font-size:1px`. The server stores both as given, and the client loaded them.

**Playback:** *A Bug's Life* played (`currentTime` 5.6 → 6.6 s, readyState 4, not paused, `body` display block).

**The `::cue` sheets:**
- JE's `#je-html-videoplayer-cuestyle` holds one rule with the defaults: `background-color: rgba(0,0,0,0)`, `color: rgb(255,255,255)`, `font-size: 1.2vw`, `font-family: inherit`.
- jellyfin-web's own sheets are unchanged.
- No stylesheet has a `* { display: none }` rule or the injected text, before or after calling `applySavedStylesWhenReady()` again during playback.

**Settings panel:** both previews (`#subtitleColorPreview`, `#subtitlePositionPreview`) use `#FFFFFFFF` / `#00000000` / `transparent` / `font-family: inherit`. Each has only `id` and `style` attributes.

**Font:** the font family comes from a fixed preset list, so a stored font cannot be crafted through the settings document. The font validator is exercised by lane A's jsdom tests, not live.

The settings were restored to `#FFFFFFFF` / `#00000000` afterwards.

Screenshot: [bug006-playback](merge-bugfix-a-host-bug006-playback.png) (the headless capture of the video layer is black)

All test data was restored before the server was removed: the item's name and empty locked fields, the empty bookmark document, the subtitle colours and `ShowFileSizes`.

### General smoke

| Check | Result |
|---|---|
| Plugin | `Jellyfin Enhanced v12.14.0.0 initialized`; `/Plugins`: 12.14.0.0 Active |
| Server log | 0 JE `[ERR]`/`[WRN]`. The 49 `[ERR]` lines are 48 lab-data `Could not find file '/tv/…'` (*Love, Death & Robots* ×24, *Smoking Behind the Supermarket with You* ×24) and one `POST /Sessions/Playing/Stopped` "Unexpected end of request content" from a browser closing mid-playback. The JE plugin log (87 lines) has no error or warning. |
| Scheduled tasks | 15 in "Jellyfin Enhanced", the same keys; `JellyfinEnhancedStartup` Id `246a7417…34e7`, unchanged |
| OpenAPI | 200, 3.0.4, 474 paths, 180 under `/JellyfinEnhanced` (unchanged) |
| Wire: identity | 200, 2,376,204 bytes, ETag `"669e76eb…"`, `Vary: Accept-Encoding`, `Cache-Control: public, max-age=31536000, immutable` |
| Wire: gzip | 200 gzip, 641,682 bytes, ETag `"a82aed24…"` |
| Wire: br | 200 br, 528,869 bytes (q9). Seconds later it was 482,998 (q11, ETag `"ff0c3c86…"`), after the background upgrade. `br, gzip` → br. |
| Wire: 304 | `If-None-Match` per representation (br, gzip, identity) → **304**, 0 bytes, ETag and Vary repeated. The br tag sent with gzip → 200. The old q9 tag after the upgrade → 200 (correct). |
| Wire: bodies | The decoded br, gzip and identity bodies are identical (sha256 `669e76eb…`) |
| Bundle check | The served identity body and the in-process `restructure-gates.sh bundle` dump have the same `bundle-hash`, `3c26d8ca…c853` (stable equals comment-stripped). The raw files differ only in the trailing `sourceMappingURL` `?v=` cache stamp. It differs from `k3` (`48d32420…`) **by design**: lane A's source changes. `bugfix-a` was appended to `baselines/bundle-checkpoints.txt`; earlier lines are unchanged. |
| K1/K1b runtime | On every page `JE.core.featureContext` is a function and `JE.core.sharedModules` has 24 ids |

**Pages** (as `real-admin`, 1400×900 at scale 2, one browser process per page). Shots over 1.5 MB were scaled to 1400 px wide.

| Page | Result | Screenshot |
|---|---|---|
| Admin page | **PASS** (above) | [admin-page](merge-bugfix-a-host-admin-page.png) |
| Settings panel | **PASS**: 17 tabs, Display Language 33 options | [settings-panel](merge-bugfix-a-host-settings-panel.png) |
| Media Tags hub | **PASS**: `#jeMediaTagsHub` visible: Layout, Groups, Status badges, Rules & locks, Colours, Server | [media-tags-hub](merge-bugfix-a-host-media-tags-hub.png) |
| Tagged poster | **PASS**: Movies, 100/100 cards with `.je-tag-host` | [tagged-poster](merge-bugfix-a-host-tagged-poster.png) |
| Details page | **PASS**: *A Bug's Life*, 30 JE style blocks, tags present | [details-page](merge-bugfix-a-host-details-page.png) |
| Hidden Content | **PASS**: "Hidden Content (0)", "No hidden items" | [hidden-content](merge-bugfix-a-host-hidden-content.png) |
| Bookmarks | **PASS**: the migrated BUG-004 row, "1 bookmark(s)" (removed afterwards) | [bookmarks](merge-bugfix-a-host-bookmarks.png) |
| Calendar | **PASS** (no *arr): Agenda/Day/Week/Month, "No upcoming releases", 0 errors | [calendar](merge-bugfix-a-host-calendar.png) |
| Downloads | **PASS**: "No active downloads" and the Requests list. 0 skeleton cards at 15 s. BUG-003 (28 skeletons at K3) **was not reproduced** this time; not investigated. | [downloads](merge-bugfix-a-host-downloads.png) |
| Activity | **PASS**: Active Streams, Watch History, Reviews | [activity](merge-bugfix-a-host-activity.png) |
| Catch Up | **PASS**: deck plus Activity panel | [catchup](merge-bugfix-a-host-catchup.png) |
| Seerr discover | **PASS**: `#/search?query=Odyssey`, "Discover on Seerr", 37 cards (nothing requested) | [seerr-search](merge-bugfix-a-host-seerr-search.png) |
| Player OSD | **PASS**: *A Bug's Life*, `currentTime` 8.8 s, readyState 4, `#je-osd-rating-container` "92% ★ 7.0" | [player-osd](merge-bugfix-a-host-player-osd.png) |

**Console: no new errors from this merge.** The kinds seen:
- lab image 404s (`/Items/9b66…` and `/Items/5bc4…/Images/Primary`, `HEAD …/Images/Disc`);
- the non-fatal HLS `otherError` and `bufferStalledError` during playback;
- jellyfin-web's `[Home] failed to get tab controller` on the Activity and Catch Up deep loads.

**A/B on the Catch Up and Activity PAGEERROR.** The same two deep loads also raise `PAGEERROR TypeError: Cannot read properties of undefined (reading 'classList')`.
- The stack is entirely jellyfin-web: `home` chunk → tabs `selectedIndex` → `parentWithClass`. jellyfin-web selects tab 2 or 3 before JE's native tab exists.
- K3's log reported no PAGEERROR, so this was A/B-checked. The pre-merge integration tip `d0cfd93e` was built in a scratch worktree, and its DLL installed on the same server (served `bundle-hash` `48d32420…`, the `k3` checkpoint). It gives the identical PAGEERROR and console error on both pages, 2 of 2 times each. The merged build gives it 4 of 4 times.
- So the error is **pre-existing and not caused by lane A**. Probably K3's runner did not print page errors.
- The `e08bb100` DLL was then reinstalled, and its served hash was rechecked (`3c26d8ca…`) before the server was removed.

## Product bugs and observations (recorded, not fixed)

- **No new product bug from lane A.** All five fixed bugs were verified live (BUG-005 with Seerr answers mocked in the browser).
- **Pre-existing, now recorded:** a JE native-tab deep load (`#/home?tab=3&jeTab=activity`, `#/home?tab=2&jeTab=catchup`, fresh session) raises the uncaught jellyfin-web `TypeError … 'classList'` next to `[Home] failed to get tab controller`. It is identical at `d0cfd93e`. The JE tab still renders. The likely cause is that JE's tab index does not exist yet when jellyfin-web restores the tab; not investigated.
- **BUG-003** (Downloads skeletons) was not reproduced on this run; not investigated. **BUG-016** was not exercised.
- **Seerr toast:** the browser path, including the toast, is verified. The Seerr-side request could not be made on this lab without reaching Sonarr at 192.168.0.84 through the shared Seerr, so it was mocked.
- **BUG-006:** a malformed stored colour is still accepted and stored by the server (`POST user-settings/{id}/settings.json`). Lane A's fix is client-side and verified. Whether the server should also reject such values is a design question for the coordinator.

## Cleanup

- `je rm rsfa` removed `je-lab-rsfa` and `/home/jake/je-lab/rsfa`, including the edited config and all test data. Afterwards `docker ps -a --filter name=rsfa` is empty, the directory is gone, and `curl 127.0.0.1:18573/health` cannot connect (exit 7).
- The REJECT rule was deleted; `DOCKER-USER` is empty again, as before.
- These all equal the snapshots taken before HOST:
  - container names and states, volumes (42) and networks (4);
  - `/home/jake/je-lab/`;
  - `~/.cache/je-lab/` (top level, `build/` and `ci/`);
  - `.notes/` (`je.json`, `step1/`; `je.json` holds no credentials);
  - `/tmp/je-docs/tools/`.

  Other sessions' containers, processes and worktrees were not touched.
- Removed:
  - the build snapshot `~/.cache/je-lab/build/9fa5bbccb3f2`;
  - the CI-cache file and lock from `je up`'s warm job (it had finished);
  - `.notes/tok-admin`, `.notes/.tok-admin.lock` and `/tmp/je-docs/tools/state-real-admin-18573.json`.
- The A/B scratch worktree at `d0cfd93e` was removed with `git worktree remove` and `prune`. Only its `node_modules` symlink was deleted; the main checkout's `node_modules` is intact. Scratch DLLs, bundle dumps and gate logs stay only in the session scratchpad.
