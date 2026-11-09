# Step 8 log, frontend C3 group B: catchup → activity → calendar → chrome (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 8 (C3 per feature), gates FE (G with INV and TOOL inside) and BROWSER; frontend.md §2.3, §2.4, §3 (C3 row, baseline-keys rule) and the §6 C2/C3 briefs; [step7-frontend.md](step7-frontend.md) "Notes for C3". Machine: JE worker on Alex's laptop (16 cores, 62 GB, shared with the c3a and c3c agents). Checkout `/var/lib/jebench/projects/je-restructure-c3b`, branch `restructure/fe-c3b` from `7fdcc563`. Gates ran in the foreground, one at a time. BROWSER ran detached (see "BROWSER"), and nothing built while it ran. HOST is the coordinator's job after the merge.

## Commits

| Step | Commit | What |
|---|---|---|
| C3-catchup | `5104473e` | `CatchupContext`: facade `catchUpPage`, internal slot `catchUp`. The `activity/host.ts` edges are gone: types come from `activity/public-api.ts`, and the pure helpers come from a catchup-local `wire.ts`. |
| C3-activity | `f3501013` | `ActivityContext`: facades `activityPage`, `initializeActivityIcons`, `stopActivityIconsMonitoring`. activity has no internals slot and reads no peer facade. |
| C3-calendar | `772c7a24` | `CalendarContext`: internal slots `calendarLifetime`, `calendarPage`, facade `initializeCalendarPage`, peer `hiddenContent`. The `lifetime.ts` helpers take the context. |
| C3-chrome | `bbfdcb12` | `chromeContext(JE, facades)` for the nine entries, `eventsContext(JE)` with the owner-only `canonicalCombo` slot, peer `bookmarks`. |
| log | (this commit) | this file |

Each commit holds one feature's `client/src/features/<f>/**`, its regenerated `js/**` outputs and maps, `client/generated-manifest.json` and that feature's lowering of `boundary-baseline.json`. Nothing else changed:
- `component-scripts.json`, `client/entries/*.json`, shipped output names
- `size-baseline.json`, `baselines/**` (including `mutation-check.txt`), `internals-owners.json`
- `host/context.ts`, any other feature's `public-api.ts`, the C# plugin, `scripts/restructure-gates.sh`

`git diff --stat 7fdcc563 HEAD` over those paths is empty. Commits use the earlier restructure author identity, set through `GIT_AUTHOR_*`/`GIT_COMMITTER_*`; git config was not changed.

## Per feature

All four follow the C2 pattern:
- The host builds the context with `featureContext`.
- Modules use `ctx.own.<slot>` for the feature's facades and internals slots.
- Injected core members stay on the typed bridge (`ctx.core`, kept as the local `JE`).
- The runtime keys on `window.JellyfinEnhanced` / `JE.internals` do not change.

**catchup.**
- `catchupHost()` returns `ctx` (undefined when JE is missing, so the entries return early as before) instead of `JE`.
- `catchup-core.ts` used to do `JE.internals=JE.internals||{}` itself. The host's `internalsObject: () => JE.internals ??= {}` now does it on the first `ctx.own.catchUp` access, which comes right after the same `CatchUpEnabled` check.
- The other five entries read `ctx.own.catchUp` only after that check. `catchup-core.js` loads first (`component-scripts.json`), so the object always exists by then.
- The 6 `import …/activity/host.ts` (Notes for C3):
  - `types.ts` (`RequestOptions`) and `catchup-core.ts` (`SocialApi`, `RequestOptions`) are now `import type` from `activity/public-api.ts`, which already re-exported them.
  - The runtime imports (`model.ts`: the JSON readers; `catchup-core.ts`: `currentLease`, `array`, `string`; `catchup-deck.ts`/`catchup-activity.ts`: `errorMessage`, `currentLease`) now import `./wire`. See stateless evidence and deviation 1.

**activity.** `activityHost()` returns `ctx`. The facades are written and read through `ctx.own` (the custom tab polls `ctx.own.activityPage`, a fresh read each time, as before). No baseline entries existed, so the baseline did not change.

**calendar.**
- `calendarHost()` also returns `ctx`. `own` has `calendarLifetime`, `calendarPage` (internals) and `initializeCalendarPage`.
- `lifetime`, `lease`, `cancelNavigation`, `invalidate`, `own` and `disposeCalendar` take the context. There are 28 call sites. `preferenceKey` touches no internals and keeps `JE`.
- The four render views read `ctx.peer('hiddenContent')` once per render. They used to read `JE.hiddenContent` twice (a plain data property, so the result is the same).
- The `JE.calendarPage` facade stays on the bridge (deviation 2).

**chrome.**
- Every entry publishes through `chromeContext(JE, [...]).own`. `chromeContext` only defines accessors on a new object and reads nothing from JE, so evaluation order is unchanged.
- `events-entry.ts` uses `eventsContext`. Its first `ctx.own.canonicalCombo` write creates `JE.internals` just before `createEvents`, where `JE.internals = JE.internals || {}` used to.
- `createEvents(ctx)` reads `ctx.peer('bookmarks')`, typed by `bookmarks/public-api.ts` `BookmarkApi`, and `bookmarks` was dropped from `EventsBridge`.
- Other cross-feature members chrome calls stay on the typed bridge (deviation 3). Examples: the player's `cycleAspect`/`skipIntroOutro`/…, `addRemoveButton`, `showEnhancedPanel`.

### Stateless evidence (catchup `wire.ts`)

`wire.ts` is a verbatim copy of `activity/host.ts`'s helper block: `currentLease`, `errorMessage`, `record`, `object`, `string`, `number`, `optionalString`, `optionalNumber`, `optionalBoolean`, `array`. `diff` of the two blocks printed nothing. On `activity/host.ts`:
- `grep -v -E "^(export )?(function|interface|type) |^ |^}|^$"` printed nothing: there are no module-level statements besides declarations.
- `grep -E "window|document|globalThis|localStorage|this\b|\blet\b|\bvar\b"` hits only `activityHost()`, which is not copied.

Each helper reads only its arguments, including `currentLease`, whose closure captures its `session`/`getApi` parameters. Each catchup output is its own IIFE, so every output already inlined its own copy. The built code is the same apart from the module comment.

## Gates

`scripts/restructure-gates.sh fe` exited 0 after each conversion. Tail (identical for all four apart from `Ran 16 tests in …`):
```
Production inventory is current (this does not assert behavioral coverage).
Ran 16 tests in 1.670s
OK
tooling: passed
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
restructure-gates: fe passed
```
- **TOOL:** the mutation check had no new failure line, so no anchor needed an update.
- **Architecture tests:** `node --test tests/frontend/architecture/*.test.mjs` passed 42/42 after each step, with no "improved" diagnostic left.
- **Calendar's first gate failed** (deviation 2). It was fixed, and the rerun on the committed tree passed.

Feature tests:

| feature | command | result |
|---|---|---|
| catchup, activity | `node --test tests/frontend/pages/pages-social-*.test.mjs tests/frontend/pages/pages-plugin-pages*.test.mjs tests/frontend/pages/pages-activity.test.mjs` | 101/101 each time |
| calendar | `pages-calendar*.test.mjs`, `bootstrap-native-tabs`, `pages-plugin-pages*`, `features-hidden*` | 227/230 |
| chrome | `tests/frontend/chrome/*.test.mjs`, `bootstrap{,-header,-native-tabs,-loader-rewrite}.test.mjs` | 126/129 |

The 3 failures in the calendar and chrome sets are the baselined `bootstrap-native-tabs` tests in `baselines/npm-failures.txt`.

## Baselines

| | `boundary-baseline.json` |
|---|---|
| before (`7fdcc563`) | 50 files, 66 pairs, **85** violations |
| after catchup | 42 files, 54 pairs, **69** (−16: internals 10, import 6) |
| after activity | unchanged, **69** (no entries) |
| after calendar | 40 files, 51 pairs, **64** (−5 internals) |
| after chrome | 39 files, 49 pairs, **61** (−3 internals) |

All of these were lowered or deleted from the test's "improved" diagnostics by a script that only lowers or deletes. Its JSON round trip of the untouched file was byte-identical. No entry was added, no count raised and no rule widened. catchup, activity, calendar and chrome now have no entries.

Remaining 61 by area: player 15, host/ 15, media-tags 13, seerr 6, details-providers 3, settings-panel 3, admin 2, hidden-content 2, core 1, settings 1. `size-baseline.json` is unchanged (no file there was edited).

## BROWSER (`JE_BROWSER_PORT=4192 npm run test:browser -- --workers=5`, 693 tests)

| after | passed | failed | skipped | time | vs step6-browser-failures.txt (52) |
|---|---:|---:|---:|---|---|
| catchup | 638 | 52 | 3 | 12.4 min | identical |
| activity | 638 | 52 | 3 | 11.8 min | identical |
| calendar | 638 | 52 | 3 | 12.1 min | 1 new, 1 listed passed (below) |
| chrome | 638 | 52 | 3 | 10.4 min | identical |

The sets were compared as sorted `[project] › file:line › title` lines from the "52 failed" block, with trailing whitespace stripped.

Calendar run:
- **New failure:** `[firefox] discovery-recommendations-rewrite.spec.cjs:70`, the seerr discovery page and not calendar code. It failed with `expect.poll … toBe(40)`, `Received: 120`, `Timeout 5000ms exceeded`: the same infinite-scroll timing flake step 6 recorded (there on mobile-chromium).
- **Rerun:** `--project=firefox tests/browser/discovery-recommendations-rewrite.spec.cjs:70 --repeat-each=5` on the same build passed 5/5, so it is a flake and the result passes.
- **Listed test that passed:** `[firefox] flows.spec.cjs:29`. It failed again in the chrome run, so it stays on the list.

**Killed first catchup run.** The first catchup BROWSER run received SIGTERM 32 s in, at test 96, and exited 143. That was not my action, and the source is unknown. It left its `tests/browser/server.cjs` on 4192, which I stopped after checking that its cwd was this checkout. The clean rerun above replaced it.
- All later runs were started detached with `setsid`, so they are not in the tool's process group or session, and were waited on through the log's EXIT line.
- At that time a second, idle agent session was bound to this checkout (`--add-dir …/je-restructure-c3b`, no transcript and no child processes; probably the earlier attempt). I did not touch it. It is worth a look for the coordinator.
- Port 4192 is free after every run.

## Deviations and decisions

1. **catchup's pure helpers are copied into `catchup/wire.ts` rather than moved to `features/shared/`.** The C3 brief allows edits only in the feature's own folder plus an owner's `public-api.ts`. A move to `features/shared/` would edit `activity/` and `shared/` in the catchup commit. A peer facade is wrong for pure functions (§2.3), and catchup loads before activity anyway. The copy matches the existing per-feature `wire.ts`/`record` copies. `activity/host.ts` keeps the originals. A later step can merge both into `features/shared/` (A0's route).
2. **calendar's `JE.calendarPage` facade stays on the typed bridge.** The facade and the internals slot are both named `calendarPage`, and `FeatureContext.own` is one flat namespace.
   - The first gate run caught this. Every calendar entry threw `TypeError: Cannot redefine property: calendarPage` in `featureContext`, failing 15+ calendar tests. TypeScript did not flag it, because the intersection type merged the two.
   - Fix within scope: `own` holds the internals slots and `initializeCalendarPage`, and the facade keeps using `JE.calendarPage`. That is not a boundary violation.
   - Suggested follow-up (outside C3 scope, `host/context.ts`): give `own` separate facade and internals namespaces, or reject overlapping `facades`/`internalSlots` keys in the type.
3. **Peers are only the §2.3 stateful members:** calendar → `hiddenContent`, chrome → `bookmarks`. As in the C2 pilot (where `nativeTabs` stays on the bridge), other cross-feature facade members stay on each feature's typed bridge. Those are `nativeTabs` (catchup, activity, calendar) and chrome's player, hidden-content and settings-panel functions.
4. **calendar's `hiddenContent` peer type is declared in `calendar/host.ts`** (the one member it calls). It is not imported from `hidden-content/public-api.ts`, which does not export the facade type. Adding it there would be a type export rather than a facade method, outside this brief. Another agent may also be converting hidden-content at the same time.
5. **chrome uses two context builders** (`chromeContext`, `eventsContext`). Each entry has its own bridge type (`chromeBridge<T>()` / `ensureBridge` / `optionalBridge`), and only `events-entry.ts` owns an internals slot.

## Notes for the coordinator

- HOST (row 8) is open. The span contains C3 code changes, so bundle rule (b)(1) applies. Each step's BROWSER result is identical to the list, or passes after the flake rerun, not a strict pass.
- Merge: these commits touch only `features/{catchup,activity,calendar,chrome}/**`, their outputs, `generated-manifest.json` and `boundary-baseline.json`. Conflicts with c3a/c3c can occur only in the generated files and the baseline. For the baseline, keep both sides' deletions or lowerings.
