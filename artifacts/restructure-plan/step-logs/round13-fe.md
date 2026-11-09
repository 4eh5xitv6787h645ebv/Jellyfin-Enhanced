# Round 13 log, frontend follow-ups: review-D2 dedupe, A5, D1 → D2 (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order rows 12–13 (optional step 13: A5, D1 → D2) and Gates (FE, INV, TOOL, BROWSER); [frontend.md](../frontend.md) §0, §1, §2.3, §2.4, §3 (A5, D1, D2 rows, check O, D1/D2 detail), §5, §6 (D1, D2 briefs; there is no A5 brief). Inputs: [CHANGELOG.md](../CHANGELOG.md), [step10-11.md](step10-11.md), [step8-c3b.md](step8-c3b.md) (deviation 1: the catchup copy of activity's helpers). Review note: *"D2 LOW, duplicated helpers: `client/src/features/catchup/wire.ts` is a verbatim copy of 10 helpers from activity; move them to `features/shared/`"*.

Machine: JE worker on Alex's laptop (shared with other lanes, load average 15–30 during the gates). Checkout `/var/lib/jebench/projects/je-canopy-r13fe`, branch `restructure/r13-fe` from `restructure/integration-s11` `b59afa91`. Gates ran in the foreground. BROWSER ran detached with `setsid` on `JE_BROWSER_PORT=4197` and was waited on through its process group; port 4197 was free and the group gone after each run. `JE_UPDATE_SNAPSHOTS` was never set (every gate ran under `env -u JE_UPDATE_SNAPSHOTS`). Commits use the earlier restructure author identity through `GIT_AUTHOR_*`/`GIT_COMMITTER_*`; git config was not changed. No containers (HOST is not part of this round).

## Commits

| SHA | Subject | What |
|---|---|---|
| `97731fe9` | `refactor(client): dedupe catchup/activity helpers into features/shared (review D2)` | The 10 helpers are now one copy in `features/shared/wire.ts`. `catchup/wire.ts` is deleted and the block is removed from `activity/host.ts`; activity and catchup import from shared. |
| `bc47942e` | `refactor(client): D1 build support for .css text imports` | `scripts/client-build.mjs` text loader + input check, `client/src/types/css.d.ts`, build test. No output change. |
| `332b887e` | `refactor(client): D2 move static CSS out of TS into .css text imports` | The nine §3 D2 candidates → 10 `.css` files. The moreinfo `size-baseline.json` entry is removed. New `tests/frontend/architecture/css-text-imports.test.mjs`. |
| `642e6cca` | `refactor(client): D2 move the static stylesheets of calendar, downloads and catchup to .css` | The static main templates of three files the brief kept in TS (deviation 4). |
| `19dae6b3` | `refactor(client): sweep stale catchup/wire.ts reference after the dedupe` | Gate R hit, fixed in a comment. |
| (this commit) | `docs(restructure): round 13 FE log` | this file |

Unchanged on the branch: `git diff --stat b59afa91 HEAD -- Jellyfin.Plugin.JellyfinEnhanced/js/component-scripts.json client/entries artifacts/restructure-plan/baselines tests/backend` is empty. That covers `component-scripts.json`, every `client/entries` key and source, shipped output names, all baselines (`npm-failures.txt`, `browser-failures.txt`, `mutation-check.txt`, …), and the route/auth, auth-helper and registration snapshots. No C# or `tests/backend` change, so `fe` (not `all`) was the gate. `internals-owners.json` and `scan.mjs` rules are unchanged. `size-baseline.json` changed only by deleting one entry (counts may only fall). No baseline entry was added.

## 1. Dedupe (`97731fe9`)

### Evidence: identical and stateless

- **Identical.** The helper block of `activity/host.ts` (L39–51 at `b59afa91`) and `catchup/wire.ts` (L8–20) are byte-identical: `diff` printed nothing and both have sha256 `0ec4df7e31e75f73…`. The 10 helpers are `currentLease`, `errorMessage`, `record`, `object`, `string`, `number`, `optionalString`, `optionalNumber`, `optionalBoolean` and `array`. The two files differ only outside the block: catchup's import of `SocialApi`/`SocialSession` from `activity/public-api.ts` and its doc comment, against activity's interfaces and `activityHost()`.
- **Stateless (TypeScript AST).** The top-level statements of `catchup/wire.ts` are `ImportDeclaration` (type-only) plus 10 `FunctionDeclaration`s. In `activity/host.ts` the helpers are also plain `FunctionDeclaration`s, next to interfaces, type aliases and `activityHost()`. Neither file has a module-level `let`, `var`, `const` or expression statement in the helper block.
- **No global or ambient reads.** `grep -E "window|document|globalThis|localStorage|sessionStorage|this\b|\blet\b|\bvar\b|\bconst\b|new |Date|Math\.random"` over both blocks hits only `currentLease`'s function-local `const epoch, user, server`. That is a per-call snapshot that its returned closure compares with fresh reads from its own `session`/`getApi` arguments.
- **Inlining is harmless.** Each helper reads only its arguments, so inlining a copy into every IIFE output is harmless (frontend.md §2.2), as before.

### Change

- **`features/shared/wire.ts`** holds the one copy, with the function bodies unchanged.
  - `currentLease`'s parameter types are now the minimal structural `LeaseSession` (`getEpoch`, `isCurrent`) and `LeaseApi` (`getCurrentUserId`, `getUrl(path)`). Activity's `SocialSession`/`SocialApi` satisfy them, so `shared` does not depend on a feature. Type-only; erased.
- **Importers moved to `../shared/wire`:**
  - `activity/model.ts` and `activity-page.ts` (were `./host`);
  - `catchup/model.ts`, `catchup-core.ts`, `catchup-activity.ts` and `catchup-deck.ts` (were `./wire`).
- **Docs:** `shared/README.md` names `wire.ts`.
- **Strict boundary tests:** `node --test tests/frontend/architecture/*.test.mjs` passed 49/49, with no diagnostics. Rule 1 allows any feature to import `features/shared/**`. No baseline exists any more (C4), and none was added.

### Check O

Built output changed in 4 `.js` files (plus 6 `.js.map` and the ledger):
- `catchup-activity.js`, `catchup-core.js` and `catchup-deck.js` change only the module comment (`// client/src/features/catchup/wire.ts` → `…/shared/wire.ts`).
- `extras/activity-page.js` has one non-comment difference, which is the import plumbing. `model.ts` used to import `./host` and now imports `../shared/wire`, so esbuild emits `shared/wire.ts` first and the `host/context.ts` + `activity/host.ts` blocks after `model.ts` instead of before it. Those two blocks hold only the function declarations `featureContext` and `activityHost` (hoisted; no statement runs at module level).

Proof: a TypeScript-AST comparison of each output's IIFE body (HEAD vs new) checked two things:
- the sorted multiset of top-level `FunctionDeclaration` texts;
- the ordered list of every other top-level statement.

Both were identical for all 4 files (`activity-page.js`: 15/15 declarations, 1/1 other statement).

## 2. A5: defined, not done (blocked by the rules)

A5 is defined: frontend.md §1a ("A follow-up step (A5) turns those into per-feature `settings/section.ts` contributions registered through `registry.ts`"), the §3 table row ("(optional) Turn per-feature toggles in ui-panel-settings.ts into `settings/section.ts` contributions", depends on A4, C2), and PLAN row 13. §6 has **no A5 brief**, and §1a marks the premise **[UNVERIFIED]**. `SettingsSection` / `EnhancedUi.sections` exist in `settings-panel/registry.ts` (A4) and nothing registers one.

It cannot be done here without one of the changes this round forbids:
- **A feature registering its own section.** A feature other than settings-panel, media-tags or hidden-content would have to write `JE.internals.enhancedUi.sections[<f>]`. That is a §2.4 rule-3 internals violation unless `internals-owners.json` widens `enhancedUi` beyond its three co-owners. CHANGELOG LC-a widened it once, for those three only. Widening is a rule change.
- **The shell importing the sections.** If the settings-panel shell imported `features/<f>/settings/section.ts` itself, each would be a cross-feature runtime import (rule 1). Allowing that needs `PURE_PUBLIC_APIS`, also a rule change, and the sections are not pure (they wire listeners).
- **A new output or a new facade.** A new output per section would change `component-scripts.json` and the `client/entries` keys. A new `JE` facade for registration would change the runtime surface (§2.3 keeps property names).
- **Behaviour risk.** The panel template HTML order (`ui-panel-template.ts`) and listener wiring order would also have to stay byte-identical across the split.

Recorded as **not done**. It needs a coordinator decision on the rule-3 owner list, or an A5 brief.

## 3. D1 (`bc47942e`)

As frontend.md §3 D1:
- **Build script** (`scripts/client-build.mjs` `bundle()`):
  - `loader: { '.css': 'text' }`;
  - the input check accepts `client/src/**/*.css` beside checked `.ts` (not `.d.ts`), still under `client/src/` and through `safePath`;
  - `.js` and out-of-tree inputs still throw.
  - The error text keeps the prefix `Bundle input must be checked TypeScript under client/src` (+ ` (or a .css text import)`), so `html-build.test.mjs:632`'s regex still matches without editing that test.
- **Types:** `client/src/types/css.d.ts` declares `*.css` as `{ default: string }`. It is under `client/tsconfig.json` `src/**/*.ts`, so `checkTypes` includes it (579 sources checked, was 578).
- **Test:** a new `tests/client-build/build.test.mjs` case covers three things.
  - A fixture `.css` with a backslash escape, `${`, a backtick, quotes and non-ASCII is bundled. The built IIFE runs in a `vm` context, and the runtime string equals the file bytes.
  - `client:check` passes on the fixture, and the ledger's `entries` hold only the `.ts` entry.
  - A `.js` dependency and a `../outside.css` import are still rejected.
- **Outputs:** no output changed (`git diff --quiet HEAD -- Jellyfin.Plugin.JellyfinEnhanced client/generated-manifest.json docs/rewrite`), as D1 requires.

## 4. D2 (`332b887e`, `642e6cca`)

### Method

A script (TypeScript AST) moved each chosen template literal into a sibling `.css` file.
- **What is written:** the file holds the literal's **cooked** value (`node.text`, the runtime string), not its raw source. The only escape in any moved template, moreinfo's `content: "\\00b7"` (L229), is therefore written as the CSS escape `\00b7`, exactly the string the browser received before.
- **TS edit:** the literal is replaced by the import's identifier, and `import <id> from './<name>.css';` goes after the file's last import.
- **Unchanged:** exported names and signatures, and the injecting code (`injectCss`/`addCSS`/`style.textContent =` call, style id, guard and call order).

| TS file | moved literal | → `.css` | bytes | sha256 (16) |
|---|---|---|---:|---|
| `seerr/details/moreinfo/styles-css.ts` | `MORE_INFO_CSS` | `more-info.css` | 40,338 | `49960669c841f841` |
| `chrome/active-streams-styles.ts` | `ACTIVE_STREAMS_CSS` | `active-streams.css` | 10,379 | `44ffa80b74e77422` |
| `seerr/core/ui/styles-css.ts` | `MAIN_CSS` | `main.css` | 22,080 | `38d737831cad5f9e` |
| `seerr/core/ui/styles-css.ts` | `SEASON_MODAL_CSS` | `season-modal.css` | 19,230 | `739df591186ac5ff` |
| `player/pause-styles.ts` | `pauseStyles` | `pause-screen.css` | 9,970 | `6f44418c5e61e1e3` |
| `seerr/recommendations/recommendations-styles.ts` | `TILE_STYLES` | `recommendation-tiles.css` | 8,712 | `a82f1b304ad3070c` |
| `spoiler-guard/styles.ts` | `injectCss` argument | `spoiler-guard.css` | 1,924 | `dae03b842eba2582` |
| `bookmarks/library-styles.ts` | `style.textContent` (function stays) | `library.css` | 17,596 | `179b53b81c0f3d5a` |
| `hidden-content/hidden-content-page-styles.ts` | `CSS_STYLES` | `hidden-content-page.css` | 15,481 | `d6b2ce422b244606` |
| `hidden-content/hidden-content-styles.ts` | `addCSS` argument | `hidden-content.css` | 12,808 | `54760e015357bf70` |
| `calendar/calendar-page-styles.ts` (`642e6cca`) | `CSS_STYLES` | `calendar-page.css` | 23,598 | `3fab4010057d9481` |
| `downloads/styles.ts` (`642e6cca`) | `CSS_STYLES` | `downloads.css` | 18,964 | `a82720b7c1b68047` |
| `catchup/catchup-styles.ts` (`642e6cca`) | `CSS` | `catchup.css` | 12,956 | `d77dbb4c22458dca` |

Kept in TS:
- `settings-panel/ui-styles.ts` (its only template has 4 interpolations; the brief also says skip it);
- media-tags `layout/tag-layout-styles.ts` (templates with 31 and 112 interpolations) and `layout/tag-styles.ts`;
- the small interpolated theme-color templates of calendar and downloads;
- catchup's `--je-catchup-${k}` property name.

### CSS byte-equality (injected text)

For every changed output, a scratch checker (`css-equiv.cjs`, TypeScript AST over the built JS) proved two things.
1. **Same CSS text, three ways.** The `.css` file's bytes, the string literal the new output carries (`var <x>_default = …`; esbuild picks `"…"` or a backtick literal, so values are compared, not quoting) and the cooked template literal in the previous output are equal. All three sha256s match for all 13 stylesheets, and each occurs exactly once in the old output.
2. **Same program.** Take the new output, delete each `.css` module's `var` statement and replace every reference to it with `JSON.stringify(<text>)`. Take the old output and replace the equal template literal with the same `JSON.stringify(<text>)`. After dropping `// client/src/` module-comment lines and blank lines, the two are **byte-identical** for all 12 changed outputs:
   - `332b887e`: `bookmarks-library-styles.js`, `hidden-content-page-styles.js`, `hidden-content-styles.js`, `pausescreen.js`, `spoilerguard/styles.js`, `extras/active-streams.js`, `more-info-modal-styles.js`, `recommendations-styles.js`, `jellyseerr/ui/ui-styles.js` (main + season-modal);
   - `642e6cca`: `arr/calendar/calendar-page-styles.js`, `arr/requests/requests-page-styles.js`, `enhanced/catchup/catchup-styles.js`.

So the injected CSS text, the injection point and the order are unchanged. The only built-output difference is that the string now sits in its own `var` before the module that used it. That is a string constant with no side effect, emitted inside the same IIFE. **No difference to explain.** No other output changed: those 12 `.js`, their maps and `client/generated-manifest.json` are the whole output diff, and `docs/rewrite/migration-inventory.json` is unchanged.

Permanent guard: `tests/frontend/architecture/css-text-imports.test.mjs` checks every `client/src/**/*.css`:
- it is bundled by at least one output (from the `.js.map` `sources`), and no mapped `.css` is missing;
- each such output contains a string literal equal to the file's full text;
- the output contains its first selector (the D2 brief's assertion).

A mutation check (one trailing space appended to `spoiler-guard.css` without rebuilding) made it fail, and it passed again after the revert.

**Size:** `seerr/details/moreinfo/styles-css.ts` fell from 1,403 lines to 3, and the file-size test printed `shrank, lower or remove its size-baseline.json entry`. The entry was deleted in `332b887e`. `more-info.css` (1,401) and `calendar-page.css` (1,102) are under the 1,500-line `*.css` limit, and no `.css` has a baseline entry.

## Gates

`scripts/restructure-gates.sh fe` (gate G incl. INV, TOOL, `test:client-build`, bootstrap manifest, ratcheted `npm test`, `component-scripts.json` and `client/entries` keys vs restructure-base), then `inv` and `tool` on their own, per commit:

| commit | `fe` | npm total / passed / failed (listed 9) | `inv` | `tool` | architecture tests |
|---|---|---|---|---|---|
| `97731fe9` | pass (4.1 min) | 3794 / 3785 / 9 | pass | pass | 49/49, no diagnostics |
| `bc47942e` | pass | 3794 / 3785 / 9 (+1 client-build case) | pass | pass | 49/49 |
| `332b887e` | pass | 3795 / 3786 / 9 | pass | pass | 50/50, no diagnostics after the baseline deletion |
| `642e6cca` | run 1 FAIL, run 2 FAIL, run 3 pass (flakes, below) | 3795 / 3786 / 9 | pass | pass | 50/50 |
| `19dae6b3` | pass | 3795 / 3786 / 9 | pass | pass | 50/50 |

TOOL: no new mutation/history failure line, so no anchor needed an update. Totals stay ≥ `baselines/npm-tests.txt` (3745 / 3736).

**Flake protocol (`642e6cca`).** Each failure was rerun in isolation first, then confirmed by a clean full rerun. Nothing was added to `baselines/npm-failures.txt`.
- **Run 1, one new failure:** `tests/frontend/core/core-api-runtime.test.mjs :: retry jitter and clamping use the configured bounded exponential schedule`.
  - The timer spy saw `[7, 14, 14, 100]` instead of `[7, 14, 14]`, i.e. an extra 100 ms `setTimeout` from elsewhere in the realm during the run.
  - Isolated: that test 5/5 and the whole file 37/37.
  - `client/src/core` and `tests/frontend/core` are unchanged on this branch (`git diff --quiet bc47942e -- client/src/core tests/frontend/core`).
  - This is a new entry for the known-flakes list (load-sensitive timer spy).
- **Run 2, one different new failure:** `tests/frontend/requests/seerr-review-boundaries.test.mjs :: SEERR-CORE-22: repeated close restores history once`. This is the known `seerr-review-*` heavy-load flake (step10-11.md note 9, lane-lb.md). Isolated: 34/34 three times.
- **Load:** the load average was 15–30 on the shared 16-core laptop.
- **Run 3:** a clean full rerun with the gate's documented `JE_TEST_CONCURRENCY=8` knob (default is cores − 1) **passed**: 3795 / 3786 / 9, the listed failures exactly. The knob changes scheduling only, not a rule or a list.

**Gate R** (sweep, `19dae6b3`): `scripts/restructure-gates.sh r 'features/catchup/wire|catchup/wire\.ts'` found the removed path in `shared/wire.ts`'s own doc comment, and through it in the four outputs' `.js.map` `sourcesContent`. After the rewording and rebuild it passes (step-log mentions under `artifacts/` are excluded by the gate). Built `.js` were unchanged by that commit.

**Snapshots:** no snapshot file changed (`tests/backend` untouched). Every gate ran with `JE_UPDATE_SNAPSHOTS` unset.

## BROWSER (`scripts/restructure-gates.sh browser`, 6 workers, `JE_BROWSER_PORT=4197`, setsid)

| run | tree | tests | passed | failed | skipped | time | vs `baselines/browser-failures.txt` (52) |
|---|---|---:|---:|---:|---:|---|---|
| D2 | `332b887e` | 693 | 638 | 52 | 3 | 9.5 min | identical; no new failure, no "listed but did not fail" note; EXIT 0 |
| final | `19dae6b3` (contains D2b `642e6cca`) | 693 | 638 | 52 | 3 | 9.4 min | identical; no new failure, no note; EXIT 0 |

D2b's BROWSER is the final run: no `js/` or `client/` file changed between `642e6cca` and `19dae6b3` other than four `.js.map` and the ledger (comment text).

## Sweep

What the strict gates report, after D2:
- the architecture tests print no shrank/improved diagnostic (the one `size-baseline.json` entry was handled in `332b887e`);
- the npm and browser ratchets print no "listed but did not fail" note;
- the mutation check has no new line;
- gate R found the one stale path (fixed in `19dae6b3`).

Nothing else was reported unused or stale, and no rule was widened. `SocialSession`/`SocialApi` in `activity/public-api.ts` are still used by `catchup/host.ts`.

## Deviations and decisions

1. **Shared helper types.** `currentLease` takes the structural `LeaseSession`/`LeaseApi` in `features/shared/wire.ts` instead of activity's `SocialSession`/`SocialApi`, so `shared` imports no feature. Type-only; built code unchanged.
2. **Check O for the dedupe is not comments-only.** `activity-page.js` reorders two declaration-only module blocks (§1 above). That is the import plumbing, proven equivalent by the AST comparison.
3. **A5 not done** (§2): defined but with no brief, and blocked by rule 3 / rule 1 / `component-scripts.json`. It needs a decision.
4. **D2 beyond the brief's "keep in TS" list (`642e6cca`): the better approach, and why.** The brief's keep list came from per-*file* `${` counts. Per *template*:
   - `calendar-page-styles.ts`' 1,103-line `CSS_STYLES` and `downloads/styles.ts`' 582-line `CSS_STYLES` are static. Their 4 and 3 interpolations are all in separate small theme-colour templates.
   - `catchup-styles.ts`' one `${` is a `setProperty` name, not CSS.

   D2's rule is "move static CSS (no `${}`)", so moving the static templates follows it and keeps every dynamic template in TS. It also removes the largest remaining CSS-in-TS (calendar, which this round's task named). Same proof as the rest: CSS byte-equal and the output program identical after inlining. `settings-panel/ui-styles.ts` and the media-tags styles really are interpolated and stay.
5. **D2-<file> steps batched.** The §6 brief is one step per file; here they are two commits (nine brief candidates, then three per-template ones). BROWSER ran on the first and on the final tip, not once per file. The per-file evidence (CSS sha256 and output equivalence) is above.
6. **D1 error wording.** The rejection message keeps its old prefix so `html-build.test.mjs:632` is not edited.
7. **The D2 test lives in `tests/frontend/architecture/`** (auto-discovered, it reads the repository's built outputs). It asserts each `.css` file's full text, which is stronger than the brief's "a selector is present", and the selector too.
8. **Third `fe` run on `642e6cca` used `JE_TEST_CONCURRENCY=8`** after two load flakes (Gates, above).

## Product bugs

**No new product bug.** Two pre-existing oddities were noticed and not changed, because they are outside this scope and behaviour-neutral:
- `hidden-content-page-styles.ts` has `"use strict";` after its `installOnce` guard statement, where it is an inert expression and not a directive.
- `hidden-content-styles.ts` and `hidden-content-page-styles.ts` import five unused names from `./host`; no gate reports them.

BUG-001 and BUG-003 are known and were not touched.

## Notes for the coordinator

- **HOST.** PLAN row 13 says "BROWSER mandatory, then HOST". HOST was not run here. The span changes client code (D2 and the dedupe's module order), so bundle rule (b) applies. BROWSER passed on this branch's tip and on the D2 commit; re-run it on the merged result.
- **A5** needs either a decision to widen `enhancedUi`'s rule-3 owners (or a registration facade) or a brief. Until then `registry.ts`' `sections` stays unused.
- **Known flakes, add to the list:** frontend `core-api-runtime.test.mjs` "retry jitter and clamping …" (load-sensitive timer spy), seen once here.
- **frontend.md §3 D2's "Keep in TS" list is stale** for calendar, downloads and catchup (deviation 4). The plan text was not edited in this round.
