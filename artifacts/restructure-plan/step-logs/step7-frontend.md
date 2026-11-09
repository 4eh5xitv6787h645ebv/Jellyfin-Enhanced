# Step 7 log, frontend track: C1 → C2 (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 7, gates FE (G, plus check O for the C1 move), INV, TOOL and BROWSER (C2). Sources: frontend.md §0, §1, §2.3, §2.4, §3 (C1/C2 rows, "Baseline keys", "A cross-feature move must first make its edges legal", "C1 (host moves)"), §5 and the §6 C1/C2 briefs. Machine: JE worker on Alex's laptop (user `jebench`, 16 cores, 62 GB), checkout `/var/lib/jebench/projects/je-restructure-fe`, Node 26.13. Gates ran one at a time, in the foreground. BROWSER ran in the background, and nothing else ran while it did. The backend track (S2.6–S2.9) ran on another machine. HOST is the coordinator's job after the merge.

## Commits

Branch `restructure/fe-c`, from `restructure/integration` `5f62106c`. It is not merged: the coordinator merges it.

| Step | Commit | What |
|---|---|---|
| C1 | `dc511b54` | 17 feature hosts `git mv`'d out of `client/src/host/` (table below). 387 relative specifiers in 263 files were rewritten. Three edges were made legal first. Boundary keys and targets were renamed, and pairs that became legal were lowered. |
| C2 | `362d8e7e` | `host/context.ts` gains `FeatureContext` and `featureContext()`. bookmarks is converted (pilot). Boundary baseline lowered only. |
| log | (this commit) | this file |

`component-scripts.json`, the `client/entries/*.json` files (keys and sources; no entry file moved), every shipped output name, `size-baseline.json`, `baselines/**` (including `mutation-check.txt`, 9 lines) and the C# plugin are untouched. Commits use the same author identity as the earlier restructure commits, set through `GIT_AUTHOR_*`/`GIT_COMMITTER_*` per commit; git config was not changed.

## C1: host moves

| From `client/src/host/` | To `client/src/features/` |
|---|---|
| activity-host, bookmarks-host, calendar-host, catchup-host, chrome-host, details-providers-host, downloads-host, hidden-content-host, player-host, settings-host, settings-panel-host | `<feature>/host.ts` |
| seerr-core-host, seerr-details-host, seerr-discovery-host | `seerr/host-core.ts`, `seerr/host-details.ts`, `seerr/host-discovery.ts` (the brief's `host*.ts`; `isFeatureHostFile` accepts `host-*`) |
| spoiler-host | `spoiler-guard/host.ts` |
| tag-runtime-host, tag-rules-host | `media-tags/host.ts`, `media-tags/rules-host.ts` (table 1b) |

`host/` now holds only the core platform hosts (api, core, dom, navigation, session, ui, admin-config, bootstrap-pages) and `context.ts`.

The moves were made by a throwaway script in the scratchpad (not committed). It planned every specifier edit against the old tree using the TypeScript AST (import, export, `import x = require`, dynamic `import()` and `import('x').T` type nodes), ran `git mv`, then rewrote each specifier so that it resolves to the same file. A second script renamed baseline keys and targets. A round trip of the untouched baselines was byte-identical before any edit.

**Simulation first** (throwaway worktree in the scratchpad, since removed). The bare moves gave exactly 9 new `(file, key)` pairs, the ones §3 "C1 (host moves)" predicts:
- `host/context.ts` → `host-import features/settings/host.ts` (edge a)
- `details-providers/host.ts` and `settings-panel/host.ts` → `import features/settings/host.ts`
- `settings-panel/host.ts` → 5 media-tags type modules
- `catchup/host.ts` → `import features/activity/host.ts` (it imported `./activity-host` types)

Each edge was made legal before the commit. All of them are type-only, and no rule changed:
- **(a)** The `SaveOptions` and `SettingsDocument` declarations moved into `host/context.ts`. `settings/host.ts` imports them from there and re-exports them (type-only), so its importers are unchanged. The details-providers and settings-panel hosts import them from `host/context.ts`. `FeatureName` is kept.
- `settings-panel/host.ts` takes `MediaLanguage`, `PosterColours`, `RatingSources`, `TagLayout` and `TagLook` from `media-tags/public-api.ts`. S2 already exported them there for this move.
- `activity/public-api.ts` now has `export type { RequestOptions, SocialApi, SocialSession } from './host'`, and `catchup/host.ts` imports them from it.

With these, the simulation gave 0 new pairs, and so did the real tree.

**Baseline keys.** 268 keys renamed with their counts (moved hosts' file keys, and every `import client/src/host/<x>-host.ts` target → `features/<f>/host*.ts`). Then **310 pairs lowered**, all of which became legal:
- feature files' imports of their own (now same-feature) host;
- the moved hosts' `host-import`s of their own feature;
- their `raw-global JellyfinEnhanced` and `internals *`/owned-slot reads, now in feature host files.

No moved host touches a slot it doesn't own, so no `internals-foreign` key appeared. Relocated violations kept in the baseline:
- the 6 A1/A2 panels' runtime `import …/settings-panel/host.ts` (1 each), edge (b);
- 5 catchup files' `import …/activity/host.ts` (6).

The stale-key check (`awk '$1 ~ /^R/ {print $2 "\""}' | grep -F -f - …baseline.json`) printed nothing, exit 1.

**Comments.** These now name the new paths: the S2 notes in 6 `public-api.ts` files, the media-tags and settings-panel `public-api.ts` C1 notes, the `pipeline/tag-pipeline.ts` and `pipeline/state.ts` host comments, and `internals-owners.json` `_comment`. `docs/rewrite/*.md` still name `client/src/host/<x>-host.ts` (14 lines). That is prose for the step-12 sweep.

## C2: FeatureContext, bookmarks pilot

`host/context.ts` (extended, not recreated):
- `FeatureContext<Own, Peers, Core>` = `{ feature, core, own, peer(name) }`.
- `featureContext(feature, core, { facades, internalSlots, internalsObject })`:
  - `own` gets one getter/setter per slot. A facade slot reads/writes `core[key]` (`JE.<key>`). An internal slot reads/writes `internalsObject()[key]` (`JE.internals.<key>`).
  - Every access is a plain property read or assignment on the same runtime object, the same as before.
  - `peer(name)` reads `core[name]` on each call.
- `core` is the feature's own typed bridge. The injected process-wide members (`t`, `toast`, `session`, `core.*`, `currentSettings`, …) stay on it (§3 C3 scope, review-r1 F13). See deviation 1.
- Rule 3 flags every `.internals` property access outside a feature host file, so `context.ts` never touches `JE.internals`. The owner's host passes `internalsObject` (bookmarks: `() => JE.internals ??= {}`).

bookmarks:
- `host.ts`'s `bookmarksHost()` returns `{ ctx, host, getApi }`, where `ctx: BookmarksContext`:
  - facades: `bookmarks`, `initializeBookmarks`, `cleanupBookmarks`;
  - internal slots: `bookmarksLibrary`, `bookmarkLifetimes`;
  - peers: none, because bookmarks reads no other feature's facade.
- The `window.JellyfinEnhanced`/frame bridge lookup that `library-init.ts`'s `getJE()` did moved verbatim into `host.ts` as `findBridge(host)`. `getJE()` now calls it.
- The 8 entry modules call `createLifetime(ctx, …)`, use `ctx.own.bookmarksLibrary` and `ctx.own.bookmarks.*`, and `install(ctx.core)`. `install(JE)` keeps its typed-bridge parameter. `bookmarks.ts` publishes its facades through `ctx.own`.
- `lifetime.ts` uses `ctx.own.bookmarkLifetimes`. Its old `JE.internals ??= {}` is now inside the host's accessor.
- `bookmarks.ts` stays at 849 lines, its size-baseline value; no line was added.

**Behaviour.** The runtime keys (`JE.internals.bookmarksLibrary`, `bookmarkLifetimes`, `JE.bookmarks`, …), load order and outputs are unchanged. The built-JS change is limited to the 8 `js/enhanced/bookmarks/*.js` outputs: the inlined `featureContext`, the `ctx.own` accesses, and esbuild renaming `JE2` → `JE` (the module-level `JE` is gone). Each internals slot used to be created before its first read, because `createLifetime` runs first in every `install()`. That is still true, and `own`'s setter assigns to the same `JE.internals` object as before. TOOL's bookmarks mutation anchor (`history-774-bookmark-episode`, `bookmarks.js`) still matches once, so no case needed updating.

## Gates

`scripts/restructure-gates.sh fe` (G with INV and TOOL inside) exited 0 after C1 (204 s) and after C2 (205 s). C2 tail:
```
Client: 575 TypeScript sources checked; 210 mapped browser entries; 9 typed HTML pages.
Production inventory is current (this does not assert behavioral coverage).
== INV: route list vs artifacts/restructure-plan/baselines/inventory-routes.txt
Ran 16 tests in 0.903s
OK
tooling: passed
ℹ tests 3787
ℹ pass 3778
ℹ fail 9
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
== FE G: component-scripts.json and client/entries output keys vs restructure-base
restructure-gates: fe passed
```
C1's tail was the same except `Ran 16 tests in 0.917s`. These counts match the calibration (3787 / 3778, the 9 baselined failures).

- **Check O (C1):** `git diff -U0` over `js/**/*.js` and `Configuration/**/*.js` printed nothing besides `// client/src/` lines (174 `.js` files, 177 comment lines each way). Maps and the ledger changed as expected. `docs/rewrite/migration-inventory.json` did not change, because it lists entry sources and no entry moved. Check O does not apply to C2, which is a code change (BROWSER instead).
- **Architecture tests:** `node --test tests/frontend/architecture/*.test.mjs` passed 42/42 after each step, with no "improved" diagnostic left.
- **C2 targeted tests:** `node --test tests/frontend/features/features-bookmark*.test.mjs` passed 70/70.
- **Key snapshots:** after C1 and after C2, the persistence and translation keys equal `keys-S0.txt` / `tkeys-S0.txt`, compared as sets (`LC_ALL=C sort -u` on both sides). A plain `sort` diff only shows locale ordering.

## Baselines

| | before (`5f62106c`) | after C1 (`dc511b54`) | after C2 (`362d8e7e`) |
|---|---|---|---|
| `boundary-baseline.json` | 278 files, 386 pairs, **502** violations | 58 files, 76 pairs, **106** | 50 files, 66 pairs, **85** |
| `size-baseline.json` | 20 files, 20,800 lines | unchanged | unchanged |
| `baselines/mutation-check.txt` | 9 | 9 (untouched) | 9 (untouched) |

No entry was added, no count raised and no rule widened. C2 removed every bookmarks entry: 7 × `internals bookmarksLibrary` 2, `lifetime.ts` `internals *` 1 and `internals bookmarkLifetimes` 3, and `library-init.ts` `raw-global JellyfinEnhanced` 3. That is 21 violations in 10 pairs.

## BROWSER (C2, `npm run test:browser`, 693 tests: chromium, mobile-chromium, firefox)

The run used `JE_BROWSER_PORT=4187` to stay off the default 4179 on a shared machine. That variable is read by `playwright.config.cjs`.

| tree | passed | failed | skipped | time |
|---|---:|---:|---:|---|
| C2 `362d8e7e` (working tree before the commit, identical) | 638 | 52 | 3 | 15.3 min (918 s wall) |

**PASS against the list:** the failure set, sorted `[project] › file:line › title` lines from the reporter's "52 failed" block, is **identical** to `step6-browser-failures.txt`. No test outside the list failed and no listed test passed, so no `--repeat-each` rerun was needed. All 9 `bookmarks-rewrite.spec.cjs` tests passed. Playwright's browsers were already installed (`chromium-1208`, `firefox-1509`). The fixture server stopped with the run, and port 4187 is free.

## Deviations and decisions

1. **`FeatureContext.core` is the feature's typed bridge, not a shared `CoreServices` interface.** §2.3's sketch has `core: CoreServices`. §3's C3 scope (review-r1 F13) keeps the injected core members on each feature's existing typed bridge, so `Core` is a type parameter: bookmarks uses `BookmarkHost`. A shared `CoreServices` type can be added later without changing call sites.
2. **The `featureContext` signature takes the bridge and an `OwnSlots` object** instead of `(feature, ownKeys)`:
   - Rule 4 keeps `window.JellyfinEnhanced` reads in feature host files, so the feature host does the raw read and the error message.
   - Rule 3 keeps `.internals` in the owner's host file, so the host passes `internalsObject`.
   - The internal-slot option is named `internalSlots`, not `internals`, because rule 3 counts any `.internals` property access. A first draft named it `internals`, and the scanner flagged `host/context.ts` (2 new pairs). It was renamed before the gate ran.
3. **C2 also converted bookmarks' own facades** (`JE.bookmarks`, `initializeBookmarks`, `cleanupBookmarks`) to `ctx.own`, as §2.3's `own` ("facade slot(s) + its own internals slot") describes, and moved the raw-global lookup into the host (the C3 scope's "no raw JE global"). The brief names internals and peer reads. bookmarks has no peer reads, so `peer()` is unused by the pilot.
4. **seerr host names** are `host-core.ts`, `host-details.ts` and `host-discovery.ts` at the feature root, following the brief's `features/<f>/host*.ts`.
5. Docs prose (`docs/rewrite/*.md`) still names the old host paths. These are left for the step-12 sweep.

## Notes for C3

- **Pattern:**
  - In `features/<f>/host*.ts`, call `featureContext<Own, Peers, Bridge>('<f>', JE, { facades: [...], internalSlots: [...], internalsObject: () => JE.internals ??= {} })` and return `ctx` with the other host values.
  - Modules then use `ctx.own.<slot>`. Keep the runtime keys. Use the `JE` parameter for injected core members.
  - Peers: declare `Peers` from the owner's `public-api.ts` (`import type`), and read with `ctx.peer('<key>')`.
  - Never name a property `internals` outside the host file: rule 3 counts it.
- **What is left in `boundary-baseline.json` (85):**

  | area | violations | kinds |
  |---|---:|---|
  | catchup | 16 | internals 10, import 6 (the `activity/host.ts` relocation) |
  | player | 15 | internals |
  | host/ (core hosts) | 15 | raw-global 12 (C4 allowlists them), `bootstrap-pages-host.ts` host-import 3 (open, S1-c) |
  | media-tags | 13 | internals 8, import 5 (the 5 settings panels → `settings-panel/host.ts`) |
  | seerr | 6 | internals 4, raw-global 2 |
  | calendar | 5 | internals |
  | chrome, details-providers, settings-panel | 3 each | internals |
  | `admin/config/page/media-tags-tab.ts` | 2 | internals (open, S1-c) |
  | hidden-content | 2 | internals 1, import 1 (`settings/ui-panel-hidden-content.ts` → `settings-panel/host.ts`) |
  | `core/lifecycle-entry.ts`, features/settings | 1 each | raw-global |
- **The panels' runtime imports of `settings-panel/host.ts`:** media-tags ×5 and hidden-content ×1 import `panelHost`/`registry`. C3-media-tags and C3-hidden-content can only remove them through a settings-panel facade read via `ctx.peer` (the settings-panel owner adds it to its `public-api.ts`), or by taking the shell bridge another way. Each C3 sub-step edits only its own folder plus the owner's `public-api.ts`, so settings-panel's facade must exist first, or the two sub-steps must be sequenced.
- **catchup** imports `activity/host.ts` from 5 files (6 imports). Two are type-only (`catchup-core.ts` `SocialApi`/`RequestOptions`, `types.ts` `RequestOptions`), and `activity/public-api.ts` already re-exports those types, so they can be retargeted with no new edge. Four are runtime imports of pure helpers (`errorMessage`, `currentLease` and the JSON readers `object`, `string`, `array`, …). Check that each is stateless, then move them to `features/shared/` (A0's route) or expose them as a peer facade.
- **`bookmarks.ts` is exactly at its size limit** (849). Any later edit there must not add lines.
- **BROWSER takes 15.3 min here** at 3 workers (about 10.6 min on the Lenovo), longer than a 10-minute foreground tool limit. Run it in the background, wait for it, and set `JE_BROWSER_PORT` to a free port.
- **HOST (row 7)** is the coordinator's job after the merge. The span since the step-6 checkpoint contains C2, so bundle rule (b)(1) applies. C2's BROWSER result is the same as the list, not a strict pass, as at step 6. C1's built-JS change is comment-only.
