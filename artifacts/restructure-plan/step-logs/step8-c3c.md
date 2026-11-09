# Step 8 log, frontend C3 group C: player, seerr, details-providers, downloads, spoiler-guard, settings (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 8 (frontend C3-<feature>), gates FE (G with INV and TOOL inside) and BROWSER. Sources: frontend.md §2.3, §2.4, §3 (C3 row, "Baseline keys") and the §6 preamble plus the C2/C3 briefs; [step7-frontend.md](step7-frontend.md) "Notes for C3"; [step6-frontend.md](step6-frontend.md). Machine: JE worker on Alex's laptop (user `jebench`, 16 cores, 62 GB, shared with the c3a and c3b lanes), checkout `/var/lib/jebench/projects/je-restructure-c3c`. Gates ran in the foreground, one at a time. Each BROWSER run ran in the background, and nothing else built or tested in this checkout while it ran. HOST is the coordinator's job after the merge.

## Commits

Branch `restructure/fe-c3c`, from `7fdcc563` (C1 and C2 done). Pushed to the local bare `origin`. Not merged.

| Step | Commit | What |
|---|---|---|
| C3-player | `7972e4c9` | internals `player`, `nowPlaying`, `autoSkip` → `ctx.own`; peers `resumeRatingsPolling`, `pauseRatingsPolling` |
| C3-seerr | `d38f5d1d` | internals `jellyseerrUi`, `moreInfoModal`, `recommendationsPage` → `ctx.own`; peers `hiddenContent`, `normalizeOfficialRating`; raw global in `core/api.ts` removed |
| C3-details-providers | `e7842670` | internals `features` → `ctx.own`; peers `hiddenContent`, `spoilerBlur`, `invalidateUserReviewTagCache` |
| C3-downloads | `9c5caf92` | own facades `downloadsPage`, `initializeDownloadsPage` and internals `requestsPage` → `ctx.own`; peers `hiddenContent`, `jellyseerrAPI`, `jellyseerrIssueReporter` |
| C3-spoiler-guard | `72ee3045` | own facade `spoilerBlur` and internals `spoilerGuard` → `ctx.own`; peers `tagPipeline`, `jellyseerrMoreInfo` |
| C3-settings | `dd97cc02` | raw global in `entry.ts` removed; peer `getStatusDateContext` |
| log | (this commit) | this file |

**No feature was skipped.** All six had something the C3 brief asks for: a baseline violation, a peer read of another feature's facade, or both. downloads and spoiler-guard had no boundary-baseline entries, but both read other features' stateful facades through the bridge.

Every commit edits only `client/src/features/<feature>/**`, plus the regenerated outputs (`js/**`, `client/generated-manifest.json`) and lower-only `boundary-baseline.json` edits. These are unchanged: `component-scripts.json`, the `client/entries/*.json` files (keys and sources), every shipped output name, `size-baseline.json`, `artifacts/restructure-plan/baselines/**` (`mutation-check.txt` still has 9 lines), `internals-owners.json`, `scan.mjs`, `scripts/restructure-gates.sh` and the C# plugin. No `public-api.ts` was edited, because no facade method was added. Commits use the same author identity as the earlier restructure commits, set through `GIT_AUTHOR_*`/`GIT_COMMITTER_*` per commit; git config was not changed.

## Pattern used (all six)

The step-7 pattern is followed, with one addition for features whose modules take the bridge as a parameter.

- **Host.** The feature host calls `featureContext<Own, Peers, Bridge>('<f>', JE, { facades, internalSlots, internalsObject })`. `internalsObject` uses exactly the idiom the modules used before (`JE.internals || {}`, `||= {}` or `??= {}`), so each slot is created the way it was before.
- **Context per bridge.** seerr (three hosts) and details-providers have modules that take the bridge as a parameter (`groupInternals(JE)`, `moreInfoRegistry(JE)`, `createDetailRows(JE, …)`, `createCardRendering(JE)`, the per-entry `bridge<T>()` slices). For these, the host exports a context factory instead:
  - seerr's three factories, `seerrCoreContext(JE)`, `seerrDetailsContext(JE)` and `discoveryContext(JE)`, are cached in a `WeakMap` per bridge object. The cache is per bundle, and harmless: a context holds no state, and every `own` and `peer` access reads the live bridge.
  - details-providers' `detailsContext(JE)` is built once per entry module.
- **Peers.** Peers are read with `ctx.peer('<key>')` at the moment of use, the same as the `JE.<key>` read it replaces.
  - Every peer member was removed from the feature's bridge type. A leftover `JE.<peer>` read therefore fails typecheck, and typecheck is clean.
  - Calls keep their receiver: `ctx.peer('x')?.method?.(…)`. Where the old code read `JE.x` twice in one synchronous expression (`if (JE.x) use(JE.x)`), it now reads once into a local. Nothing runs between the two reads.
- **Own facades.** Converted to `ctx.own` where the facade is one of §2.3's stateful cross-feature facades, or is published next to one:
  - downloads: `downloadsPage` and `initializeDownloadsPage`;
  - spoiler-guard: `spoilerBlur`.

  Player's ~30 `JE.<fn>` facades, seerr's facades (`jellyseerrAPI`, `jellyseerrUI`, `seerrStatus`, …), details-providers' `initialize*` facades and the settings service (`loadSettings`, `saveUserSettings`, …) stay on the typed bridge, which the C3 scope allows (see deviation 2).
- **Injected core members stay on the bridge:** `t`, `currentSettings`, `pluginConfig`, `userConfig`, `session`, `toast`, `core.*`, `helpers`, `themer`, `cdn`, `state`, `nativeTabs`, `isVideoPage`, `saveUserSettings`, `loadSettings`.

**How the peers were found.** A scratch script listed every `JE.<name> =` assignment under `client/src/features/` together with its owning feature. It then listed each of the six features' `JE.<name>` reads whose owner is a different feature. Core members (above) were set aside, and the rest are the peers converted here. The script itself was not committed.

## Pure helpers and unbound calls

**No pure helper was converted to an import**, so no statelessness claim rests on an import change. Four peer calls changed their receiver from `JE` to none, because the facade value is now read into a local first. Each publisher is a plain function that does not use `this`:

| peer (owner) | publisher | evidence |
|---|---|---|
| `resumeRatingsPolling`, `pauseRatingsPolling` (details-providers) | `colored-ratings.ts:117-120`, `JE.pauseRatingsPolling = pausePolling` | module-level `function` declarations, no `this` |
| `normalizeOfficialRating` (details-providers) | `colored-ratings.ts:155` = `normalizeRating` (`rating-domain.ts:26`) | pure: reads only its argument and the frozen `RATING_MAPPINGS` constant |
| `invalidateUserReviewTagCache` (media-tags) | `userreviewtags.ts:601` | function expression whose body has no `this` |
| `getStatusDateContext` (media-tags) | `statustags.ts:338` | function expression whose body has no `this` |

## Behaviour notes

- **Each internals slot is created as before.** The `own` getter calls the host's `internalsObject`, which runs the module's own creation idiom. One difference: a read through `ctx.own` now creates an empty `JE.internals` where an old optional read (`JE.internals?.player?.…`) did not. Every module in these features creates `JE.internals` at load anyway, and no production code replaces `JE.internals`, so this is not observable. The C2 pilot has the same property.
- **details-providers' `features` slot is now read off the current `JE.internals` on each access.** `details-page.ts` used to capture the `JE.internals` object once at load. The two differ only if something replaces `JE.internals` with a new object, and no production code does (every writer uses `||=` / `??=`).
- **The runtime keys are unchanged:** `JE.internals.<slot>`, `JE.downloadsPage`, `JE.spoilerBlur`, … Load order and output names are unchanged too. The built-JS change is limited to the six features' outputs:
  - the inlined `featureContext`;
  - the `ctx.own` / `ctx.peer` accesses;
  - `.js.map` files whose `sourcesContent` includes an edited host.
- **TOOL:** the live anchors on these outputs still match once, so no `before`/`after` was edited: `history-*` cases on `player/subtitles.js`, `arr/requests/requests-page-render.js` and `requests-page-render-cards.js`.

## Gates

`scripts/restructure-gates.sh fe` exited 0 after each of the six conversions, before each commit. Every run ended with:
```
tooling: passed
ℹ tests 3787
ℹ pass 3778
ℹ fail 9
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
== FE G: component-scripts.json and client/entries output keys vs restructure-base
restructure-gates: fe passed
```

Feature tests. Each set is every `tests/frontend` file that names the feature's built outputs or source folder, run with `node --test`:

| feature | tests | result |
|---|---|---|
| player | features-{autoskip,pause,playback,player-boundaries,player-rewrite,subtitles}, regressions/history-middle, architecture/* | 98/98 |
| seerr | pages-{moreinfo,recommendations*,scroll,discovery-boundaries,seerr-details-*}, requests/*, features-seerr-spoiler-guard, core-api-runtime, perf-round2-discovery, history-recent-regressions, architecture/* | 539/539 |
| details-providers | 11 files (core-letterboxd, features-details-*, features-media-info, -random, -release-dates, pages-awards, pages-reviews, …) | 224/224 |
| downloads | pages-downloads*, features-requests*, history-recent-regressions | 44/44 |
| spoiler-guard | features-spoiler*, features-seerr-spoiler-guard, features-logo-tags | 120/120 |
| settings | 26 files naming `config.js` / `features/settings/` | 688/691 |

The 3 settings failures are the baselined `bootstrap-media-tags-portable.test.mjs` "an import whose save answers after a sign-in change … offers no Undo" tests, which are in `baselines/npm-failures.txt`.

`node --test tests/frontend/architecture/*.test.mjs` passed after each conversion. The remaining "lower it" diagnostics were applied in the same commit; none was left.

## Baselines

| | files | pairs | violations |
|---|---:|---:|---:|
| before, `7fdcc563` | 50 | 66 | **85** |
| after player, `7972e4c9` | 45 | 56 | 70 |
| after seerr, `d38f5d1d` | 42 | 53 | 65 |
| after details-providers, `e7842670` | 40 | 51 | 63 |
| after downloads, `9c5caf92` | 40 | 51 | 63 |
| after spoiler-guard, `72ee3045` | 40 | 51 | 63 |
| after settings, `dd97cc02` | 39 | 50 | **62** |

Of the 23 violations removed:
- player: 15 internals;
- seerr: 2 raw-global and 3 internals;
- details-providers: 2 internals;
- settings: 1 raw-global.

Every change was a lowering: a scratch script set each `(file, key)` count to min(current, baseline), deleted zeros, and refused if any pair was new or higher. No entry was added and no rule was widened. `size-baseline.json` is unchanged. `details-providers/reviews.ts` is still 1006 lines, its baseline value: the two edits there replaced lines and added none.

**What is left in the group-C features (2 violations):**
- `seerr/details/moreinfo/actions-entry.ts`, `internals spoilerGuard` 1. This is seerr reading spoiler-guard's loader registry: `JE.internals?.spoilerGuard?.appendSeerrToggle?.(…)`. The plan's route is a peer facade method. It needs three changes:
  1. spoiler-guard publishes `appendSeerrToggle` on `JE.spoilerBlur` (owner code);
  2. seerr calls `ctx.peer('spoilerBlur')`;
  3. `tests/frontend/pages/pages-seerr-details-moreinfo.test.mjs:361`, which stubs `h.JE.internals.spoilerGuard = { appendSeerrToggle }`, stubs the facade instead.

  C3 runs consumer (seerr) before owner (spoiler-guard), and only feature files are in scope, so it was left unconverted. settings-panel's `internals spoilerGuard` reads (`buildSettingsHtml`, `wireSettings`; ui-panel.ts, ui-panel-template.ts) need the same owner members.
- `details-providers/details-page.ts`, `internals *` 1. The read is `const internals = JE.internals ??= {}`, kept only for media-tags' `peopleTags` slot (`prefetch` / `leave`, lines 300, 311, 362). That slot is owned by media-tags. Routing it through details-providers' `ctx.own` would hide a cross-feature read, so it stays until media-tags publishes a peer facade (C3-media-tags or a follow-up).

C4 will stop on both until they are resolved.

## BROWSER (`JE_BROWSER_PORT=4193 npm run test:browser -- --workers=5`, 693 tests)

The comparison takes the sorted `[project] › file:line › title` lines of each run's "N failed" block and checks them against [step6-browser-failures.txt](step6-browser-failures.txt) (52 entries), ignoring leading and trailing whitespace.

| tree | passed | failed | skipped | time | vs list |
|---|---:|---:|---:|---|---|
| player (working tree = `7972e4c9`) | 638 | 52 | 3 | 12.1 min | identical |
| seerr (= `d38f5d1d`) | 639 | 51 | 3 | 11.7 min | subset: listed `[chromium] flows.spec.cjs:29` passed |
| details-providers (= `e7842670`) | 638 | 52 | 3 | 11.3 min | identical |
| downloads (= `9c5caf92`) | 638 | 52 | 3 | 10.3 min | identical |
| spoiler-guard (= `72ee3045`) | 638 | 52 | 3 | 10.0 min | identical |
| settings (= `dd97cc02`) | 637 | 53 | 3 | 10.0 min | 52 listed + 1 flake (below) |

One test outside the list failed, in the settings run only: `[chromium] › tests/browser/tag-fit-monotonic.spec.cjs:93:39 › removing a group or a chip never hides more chips in bands`. It hit "Test timeout of 15000ms exceeded" after 19.1 s, while its sibling cases took 18.8 s, and the machine's load average was about 19 during the runs.
- Rerun alone on the same tree: `JE_BROWSER_PORT=4193 npm run test:browser -- --project=chromium --repeat-each=5 --workers=5 -g "never hides more chips in bands" tests/browser/tag-fit-monotonic.spec.cjs` gave **5 passed**, each 18.9–19.0 s, at load average 0.5.
- The settings change touches only `js/enhanced/config.js`, not the tag layout.
- The test passed in the five other full runs.

It is a timing flake, so settings counts as a pass against the list.

One extra player run did not finish: the first player BROWSER run, on the tree before the `pause`/`resumeRatingsPolling` peer change. It was stopped at about 420/693 when the cross-feature scan showed player still had that peer read. The player tree was then gated again (G passed) and the full run above was made on the final tree. Playwright's browsers were already installed. Each run's fixture server stopped with it, and port 4193 is free.

## Incident: a sibling lane's browser run was killed

To stop that first player run I used `pkill -f 'playwright test'`. On this shared account the pattern also matched c3b's Playwright runner (`/var/lib/jebench/projects/je-restructure-c3b`, `JE_BROWSER_PORT=4192`), so **the c3b BROWSER run in progress at that moment was killed**. That run had started about 40 s earlier, during the first player run. Its workers exited by themselves.
- Its fixture server, pid 2541041 on 127.0.0.1:4192, was left alone, because it is not this lane's. It has since exited, and port 4192 is free.
- **The c3b lane should treat that BROWSER run as not completed and rerun it** if its log does not show a finished run. Nothing in c3a/c3b's folders was touched. From then on this lane started each run under `setsid` and waited on its own process group.

## Deviations and decisions

1. **Peers are typed by the consumer, not by the owner's `public-api.ts`.** §2.3 says peers are "typed by the owner's public-api.ts". None of the owners involved exports a facade type:
   - hidden-content's public-api has only data types;
   - spoiler-guard's, details-providers' and settings' public-apis are empty;
   - seerr's exports some, but not the narrow shapes the consumers use;
   - media-tags exports no facade type.

   The brief allows editing an owner's `public-api.ts` only to add a facade method. So each consumer's `Peers` interface reuses the structural types its bridge already declared, moved verbatim off the bridge. Moving them into the owners' public-apis is a types-only follow-up.
2. **Own facades** were converted only where §2.3 lists them as stateful peer facades, or where they are published next to one (`downloadsPage` / `initializeDownloadsPage`, `spoilerBlur`). Player's and seerr's many `JE.<fn>` facades and the settings service stay on the typed bridge (C3 scope; step 7's deviation 3 was optional for the pilot).
3. **Peers beyond §2.3's ~17 list.** Converted because each is a stateful facade published by another feature, not an injected core member:
   - `pause`/`resumeRatingsPolling`, `normalizeOfficialRating`, `invalidateUserReviewTagCache`, `getStatusDateContext`;
   - `jellyseerrIssueReporter`, `jellyseerrMoreInfo`.

   `nativeTabs` (published by chrome) stays on the bridge, as the bookmarks pilot left it.
4. **`settingsHost()` returns `{ JE, ctx, apiClient }`** instead of the typed window. This removes `entry.ts`'s `host.JellyfinEnhanced` raw read. `installSave(JE, getClient, ctx)` gains a third parameter; its only caller is `entry.ts`.
5. **seerr `core/api.ts`** used to read `host.window.JellyfinEnhanced?.pluginConfig` at call time. It now reads `host.liveBridge()?.pluginConfig`. `liveBridge` is `() => host.JellyfinEnhanced` in `host-core.ts`: the same read, made in the host file.
6. Not converted: seerr's `internals.spoilerGuard` and details-providers' `internals.peopleTags` (see Baselines). Both remain in the baseline. The incident above is recorded as well.

## Notes for the coordinator / C4

- Merging the three C3 lanes conflicts in the generated files and in `boundary-baseline.json`.
  - Generated files: take either side, then `npm run client:build && npm run inventory:rewrite`.
  - `boundary-baseline.json`: every lane only deletes or lowers entries. Take, per `(file, key)`, the lower count of the two sides; a pair deleted on one side stays deleted.
- Before C4, the two leftovers above need owner-side facades:
  - spoiler-guard `appendSeerrToggle`, `buildSettingsHtml`, `wireSettings` on `JE.spoilerBlur`;
  - media-tags `peopleTags` as a peer facade;
  - the matching consumer and test-stub edits.

  Who makes them, and in which commit, is the coordinator's call.
- HOST (row 8) is the coordinator's job after the merge. The span contains C3, so bundle rule (b)(1) applies. Each group-C BROWSER result is "same as the list", not a strict pass, as at steps 6 and 7.
