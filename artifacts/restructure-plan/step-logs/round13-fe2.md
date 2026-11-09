# Round 13 log, FE2: review findings G3 (rule 3/4 bypass forms) and D3 (panel-host helpers) (2026-11-10)

Inputs: the independent code review's findings, quoted:
- **G3 (LOW):** "Frontend strict boundary rules (tests/frontend/architecture: rule 3 owner-only `internals`, rule 4 no raw `JE`/global) miss destructuring and alias patterns." The review's examples are `const { internals } = JE`, `const { spoilerGuard } = JE.internals`, `const j = JE; j.internals.x`, `window['JellyfinEnhanced']`, and optional-chaining and element-access forms.
- **D3 (LOW):** "seven panel-host helpers duplicated (the `settings/host.ts` files added by C4 in media-tags and hidden-content repeat functions from `settings-panel/host.ts`); a feature context is built per menu open."

Also read: [frontend.md](../frontend.md) §2.4 (rules 1–5), §3 (gate G, check O), and [round13-fe.md](round13-fe.md).

Machine: a JE worker on Alex's laptop, shared with other lanes. The load average was 0.4–2.3 during these gates.
- **Checkout and branch:** `/var/lib/jebench/projects/je-canopy-r13fe`, branch `restructure/r13-fe2`, created from `restructure/r13-fe` `9095aecf`.
- **Gates:** all ran in the foreground with `JE_UPDATE_SNAPSHOTS` unset (`env -u`).
- **BROWSER:** started with `setsid` on `JE_BROWSER_PORT=4197` and waited on through its process group (pgid 3595743). Afterwards the group was gone and port 4197 was free.
- **Commits:** the earlier restructure identity (`Jake <45441845+…@users.noreply.github.com>`) through `GIT_AUTHOR_*`/`GIT_COMMITTER_*`. Git config was not changed.

## Commits

| SHA | Subject |
|---|---|
| `30290e26` | `test(client): G3 catch destructuring, alias, element-access and cast bypasses of rules 3-4` |
| `dfb774d0` | `refactor(client): D3 dedupe the settings panels' bridge and ApiClient reads into features/shared` |
| `66b9c717` | `refactor(client): D3 build the item menu's media-tags context once per bridge` |
| (this commit) | `docs(restructure): round 13 FE2 log` |

**Unchanged on the branch.** `git diff --stat 9095aecf HEAD` prints nothing for each of these paths:
- `js/component-scripts.json` and `client/entries`;
- `artifacts/restructure-plan/baselines`, `tests/backend` and `docs/rewrite`;
- `tests/frontend/architecture/internals-owners.json` and `size-baseline.json`.

So no baseline entry was added, no owner was added, and no allowlist (`PLATFORM_GLOBAL_FILES`, `PURE_PUBLIC_APIS`, `globalAllowed`) changed. The rules are not widened. They are stricter: they see more syntax.

## G3: the rule 3/4 scanner (`30290e26`)

### What changed in `tests/frontend/architecture/scan.mjs`

All detection uses the TypeScript AST plus the type checker of the client program (`client/tsconfig.json`). No regex is involved.

**Every way to read a property.** `propertyRead()` replaces `memberAccess()` and covers these forms:
- `a.b` and `a?.b`;
- `a['b']` and `` a[`b`] ``;
- `a[k]` where the checker types `k` as a string literal or a union of string literals (`const k = 'internals'`);
- `Reflect.get(a, 'b')`.

**Every destructuring.** `patternElements()` covers `ObjectBindingPattern`s in variable declarations, parameters, catch clauses and for-of heads. It also covers object-literal assignment patterns (`({ k: x } = v)`, including inside for-of and array patterns). It handles:
- shorthand keys, renamed keys and computed keys (typed through the checker);
- nested patterns;
- `...rest`.

`patternSource()` finds what is destructured: the initializer, the parameter default, the right-hand side of the assignment, or the outer pattern's property.

**Rule 3: what holds a `JE.internals` value.** `isInternalsValue()` treats these as the internals object:
- any `internals` read that is not on `this`;
- aliases: `const i = JE.internals`, `{ internals: i } = JE`, `{ i: JE.internals }`, a parameter default;
- `JE.internals ||= {}`, `??=`, `||`, `??`, `,` and `?:` values;
- casts and `!`;
- calls of a function that returns one. The checker resolves the signature, in any file.

**Rule 3: what counts as a violation.**
- **Outside a feature host file:** every internals reference is a violation (`internals <slot>`, with `*` for the whole object). Destructuring counts too: `{ internals }`, `{ internals: i }` and `{ internals: { slot } }`. So does every slot read off an internals value the file reached through an alias or a call, which includes a host function that returns `JE.internals`.
- **In a feature host file:** the whole object is still the owner's own, because it is what the host hands to `featureContext`. Every slot read off it, however the internals value is reached, must be a slot the feature owns:
  - `.slot`, `?.['slot']` and `[k]`;
  - `{ slot } = …` and `{ internals: { slot } } = JE`;
  - an alias, a cast, `||=`, or a call.
  A dynamic key or a `...rest` can't be shown to be owned, so it counts as `internals-foreign ?`. That is a key the strict test already fails on (`internals-foreign`), not a new rule.

**Rule 4.** Every `propertyRead` form of `JellyfinEnhanced` counts on anything `isGlobalReference()` accepts, and so does every destructuring of it:
- a top-level or nested pattern;
- `(w: Window)` and `= window` parameter patterns, whose source type the checker reports as `Window` / `typeof globalThis`;
- `({ JellyfinEnhanced: je } = window)`.

`isGlobalReference()` now also accepts element access to `window`, `self` or `globalThis` (`host['window']`).

**Test harness.** `bridgeViolations(owners, prog = program())` now takes a program. `virtualProgram(files)` builds a type-checked program over in-memory files with the client compiler options, for the self-test.

### Planted-violation self-test (`feature-boundaries.test.mjs`)

The self-test is 42 in-memory files under `client/src/features/alpha/`, one form per file, where `alpha` owns slot `mine` and `beta` owns `other`.
- It first asserts that the files type-check, so the checker sees what real code would.
- It then asserts the exact violation map.

Old scanner (HEAD's `scan.mjs` with only a `prog` parameter added) against new scanner, on the same program:

| form | old | new |
|---|---|---|
| `const { internals } = JE` (non-host) | – | `internals *` |
| `const { internals: i } = JE; i.mine` | – | `internals *`, `internals mine` |
| `const { internals: { other } } = JE` | – | `internals other` |
| `function f({ internals }: Bridge)` | – | `internals *` |
| `for (const { internals } of [JE])` | – | `internals *` |
| `({ internals: i } = JE)` | – | `internals *` |
| `const key = 'internals'; JE[key]` | – | `internals *` |
| `Reflect.get(JE, 'internals')` | – | `internals *` |
| non-host `rawInternals().other` (host exports `() => JE.internals`) | – | `internals other` |
| host `const { other } = JE.internals` | – | `internals-foreign other` |
| host `const { internals: { other } } = JE` | – | `internals-foreign other` |
| host `const i = JE.internals; i.other` | – | `internals-foreign other` |
| host `const i = (JE.internals \|\|= {}); i.other` | – | `internals-foreign other` |
| host `(JE.internals as T).other`, `(<T>JE.internals).other`, `JE.internals!.other` | – | `internals-foreign other` ×3 |
| host `const k = 'other' as const; JE.internals[k]` | – | `internals-foreign other` |
| host `const get = () => JE.internals; get().other` | – | `internals-foreign other` |
| host `JE.internals[name as keyof Internals]` | – | `internals-foreign ?` |
| host `const { mine, ...rest } = JE.internals` | – | `internals-foreign ?` |
| `const key = 'JellyfinEnhanced'; window[key]` | – | `raw-global` |
| `function f({ JellyfinEnhanced }: Window)` | – | `raw-global` |
| `function f({ JellyfinEnhanced } = window)` | – | `raw-global` |
| `const { w: { JellyfinEnhanced } } = { w: window }` | – | `raw-global` |
| `({ JellyfinEnhanced: je } = window)` | – | `raw-global` |
| `Reflect.get(self, 'JellyfinEnhanced')` | – | `raw-global` |

The remaining 13 positive cases were already caught by the old scanner and are now regression-tested:
- `const j = JE; j.internals.other`;
- `JE?.internals?.other`;
- `JE['internals']` and `` JE[`internals`] ``;
- `(JE as Bridge).internals`;
- host `JE.internals?.['other']`;
- `window['JellyfinEnhanced']` and `` window[`JellyfinEnhanced`] ``;
- `window?.JellyfinEnhanced` and `globalThis?.JellyfinEnhanced`;
- `(globalThis as unknown as Window)?.['JellyfinEnhanced']`;
- `const w = window; w.JellyfinEnhanced` and `const w = globalThis.window; w['JellyfinEnhanced']`;
- `const { JellyfinEnhanced } = window` and `const { JellyfinEnhanced: je } = globalThis`;
- `host().JellyfinEnhanced`.

Four of the review's examples (`const j = JE; j.internals.x`, `window['JellyfinEnhanced']`, optional chaining, and literal element access) fell into that group: the C4 scanner already counted them. The two destructuring examples and the forms in the table did not.

Negative controls stay at zero:
- a plain object with a `JellyfinEnhanced` key (read, element-read, destructured);
- `window['JellyfinEnhanced']` and `{ JellyfinEnhanced } = window` in an allowed host file;
- `this.internals` and `const { internals } = this`;
- a host's owned reads (`const i = JE.internals; i.mine`, `{ mine } = JE.internals`, `JE.internals.mine`);
- `internalsObject: () => JE.internals`.

### Current tree: no violation found

`bridgeViolations` on the real program (580 sources) returns `{}`. A coverage probe ran the new scanner with an empty owners map, so every host slot read shows up. It showed that the scanner now also sees the alias reads it used to miss. For example, `hidden-content/host.ts` `const internals = JE.internals ??= {}; internals.features / .hiddenContent / .hiddenContentPage / .hiddenContentRuntime` went from 1 to 7 slot reads. All of them are slots hidden-content owns.

So there was nothing to resolve: no facade, `ctx.peer`, host or local-type change was needed, and nothing was exempted.

Mutation check on real files (reverted): two planted lines, one in each file.
- `const { spoilerGuard } = JE.internals; const j = JE; const { internals: i } = j;` in `calendar/host.ts`;
- `` (window as unknown as Record<string, unknown>)[`JellyfinEnhanced`] `` in `activity/model.ts`.

The strict test failed with exactly `calendar/host.ts: internals-foreign spoilerGuard ×1` and `activity/model.ts: raw-global JellyfinEnhanced ×1`. The whole-object `{ internals: i } = j` in the calendar host is the owner's own and correctly not flagged.

**Not covered (by design):**
- presence checks such as `'JellyfinEnhanced' in window`, which read no value;
- `Object.entries(JE)` / spread of the whole bridge;
- values laundered through `any`-typed function parameters with no initializer (`function f(x) { return x.slot }` called with `JE.internals`).

The last form has no occurrence today. Catching it needs data-flow analysis across call sites.

## D3 (`dfb774d0`, `66b9c717`)

### The seven duplicated helpers: evidence

A TypeScript-AST script (`d3-evidence.mjs`) compared each `FunctionDeclaration` text, without JSDoc and with whitespace normalised (sha256/12):

| helper | settings-panel/host.ts | media-tags/settings/host.ts | hidden-content/settings/host.ts | identifiers its body reads |
|---|---|---|---|---|
| `panelHost` | `3f93d5cd5f3e` | `3f93d5cd5f3e` | `a76a79089654`¹ | `window`, `JellyfinEnhanced`, `TypeError` (+ types) |
| `apiClient` | `b6f4f0de7c85` | `b6f4f0de7c85` | – | `optionalApiClient`, `ReferenceError` |
| `optionalApiClient` | `3f5a1228fa38` | `3f5a1228fa38` | – | `window`, `ApiClient` (+ types) |
| `currentUserKey` | `99c5c0a7e8ad` | `99c5c0a7e8ad` | – | `optionalApiClient`, `getCurrentUserId` |
| `registry` | `5c544a80b922` | `5c544a80b922` | `5c544a80b922` | `JE`, `internals`, `enhancedUi` |
| `interface BrowserHost` | `7fbb6e51e566` | `7fbb6e51e566` | – | – |

¹ It differs only in the type annotation (`Window & { JellyfinEnhanced?: PanelBridge }` against `Window & BrowserHost`). `ts.transpileModule` of the two declarations gives byte-identical JS (`true`).

**That makes seven duplicate copies:** media-tags has 5 and hidden-content has 2.

**Stateless:**
- none of the three files has a module-level variable or expression statement;
- every helper reads only `window` (at call time), its arguments or another helper;
- nothing is cached.

### Resolution

- **5 of 7 copies are deduplicated (`dfb774d0`):** `panelHost`, `apiClient`, `optionalApiClient` and `currentUserKey` (with `BrowserHost`) now live once in the new `client/src/features/shared/panel-host.ts`.
  - The basename matches `*-host.ts`, so it is a feature host file. That makes its `window.JellyfinEnhanced` read legal under rule 4 as written (`features/*/host*.ts`).
  - It imports only `import type { PanelApiClient, PanelBridge }` from `settings-panel/public-api.ts`, which rule 1 allows.
  - The three hosts re-export it: `export { apiClient, currentUserKey, optionalApiClient, panelHost } from '../shared/panel-host'` (hidden-content re-exports `panelHost` only), so none of the 15 import sites changed.
  - `shared/README.md` names the file.
- **`registry()` keeps its 3 copies.** It reads and writes `JE.internals.enhancedUi`. Rule 3 allows that only in a host file of an owner (settings-panel, media-tags, hidden-content), and `shared` is not an owner.
  - Shown by planting `registry()` into `shared/panel-host.ts`: the strict test failed with `shared/panel-host.ts: internals-foreign enhancedUi ×2`.
  - The other routes are each a rule change or a behaviour change:
    - one owner importing another's host is a cross-feature runtime import (rule 1);
    - a shared helper that takes the internals object would move the slot access out of an owner host under another name;
    - a published registry facade would break the panels that load without the shell (internals-owners.json `_comment`, coordinator decision D1).
  - So they stay, and each host's doc comment says why.

### Feature context per menu open (`66b9c717`)

`media-tags/editor/tag-item-menu.ts` `buildRow()` ran `mediaTagsContext(JE).peer('homeRemoval')` on each menu open.

The context has no per-open state:
- `featureContext()` (host/context.ts) allocates `own`, defines getter/setter pairs on it, checks statically that `internalSlots` comes with an `internalsObject` (media-tags passes both), and returns `{ feature, core, own, peer }`;
- `peer(name)` reads `core[name]` on every call;
- `JE` is `createItemMenu`'s parameter and is never reassigned.

Runtime probe (`ctx-probe.mjs`): the real `host/context.ts` was transformed with esbuild, and `featureContext` was called with media-tags' exact slots on a Proxy-trapped bridge.
- Construction touched the bridge **0** times (`[]`).
- `peer('homeRemoval')` was `undefined` before the facade was published and returned it after. That took exactly one `get homeRemoval` per call.

`createItemMenu` therefore now builds `const featureCtx = mediaTagsContext(JE)` once, and `buildRow` uses `featureCtx.peer('homeRemoval')`. That is behaviour-equivalent: the construction reads nothing and cannot throw, and a facade published after load is still seen.

`tests/frontend/bootstrap/bootstrap-tag-item-editor.test.mjs` and `features/media-tags/features-tag-runtime-consumers.test.mjs` pass (65/65).

Other per-call builds of the same kind exist and were left alone, outside the finding's scope: `seerrDetailsContext(JE).peer(...)` in `seerr/details/moreinfo/actions-entry.ts:324` and `details-page/rows.ts:140`, and `discoveryContext(JE).peer(...)` in `seerr/discovery/card-rendering.ts:33`. They are per render, not per menu open, and equally stateless.

### Check O

Across the branch, `9095aecf..HEAD`, 16 built `.js` files changed: the 15 settingspanel outputs and `js/tags/tag-item-menu.js`. `docs/rewrite/migration-inventory.json` is unchanged. `client/generated-manifest.json` changed only in the hash entries of those 16 outputs and their maps (32 lines).

Non-comment line differences (`git diff -U0 … | grep -vE '^[-+]\s*// client/src/'`):
- **`currentUserKey`:** in 2 outputs (`ui-panel-media-tags.js` and `ui-panel-resize.js`), the 3-line declaration moved inside its IIFE. That is import plumbing: it is now emitted from `shared/panel-host.ts` next to the other three helpers, instead of at the end of `settings-panel/host.ts`.
- **`tag-item-menu.js`:** `const featureCtx = mediaTagsContext(JE);` was added, and `buildRow` reads `featureCtx.peer("homeRemoval")`. This is the intended D3 change, above.

Proof for `dfb774d0` (`check-o.mjs`, TypeScript AST over each output's innermost IIFE body, HEAD against the new build): for all 15 changed outputs, two things were identical:
- the sorted multiset of top-level `FunctionDeclaration` texts, with `// client/src/` comments stripped and whitespace normalised;
- the ordered list of every other top-level statement.

For example, `ui-panel-media-tags.js` has 15/15 functions and 20/20 other statements. No esbuild rename occurred, and no non-function statement moved.

## Gates (on `66b9c717`, the last code commit)

| gate | result |
|---|---|
| `scripts/restructure-gates.sh fe` | **pass** (207 s): `npm test` total 3796 (baseline 3745), passed 3787, failed 9 (the listed 9). +1 test = the G3 self-test. |
| `scripts/restructure-gates.sh inv` | **pass** |
| `scripts/restructure-gates.sh tool` | **pass**, no new mutation/history line |
| `node --test tests/frontend/architecture/*.test.mjs` | 51/51 (was 50), no diagnostics; also run after each commit |
| `npm run client:typecheck` | 580 sources (was 579: `shared/panel-host.ts`) |
| BROWSER (`setsid`, `JE_BROWSER_PORT=4197`, 6 workers) | **pass on the first run**: 693 tests, 638 passed, 52 failed (= the 52 listed in `baselines/browser-failures.txt`, no new failure, no "listed but did not fail" note), 3 skipped, 8.8 min. No flake, so no rerun was needed. |

The `fe` gate covers the rest: `test:client-build` and the bootstrap manifest passed, and `component-scripts.json` and the `client/entries` keys are unchanged against restructure-base. `all` was not needed: there is no C# or `tests/backend` change. No snapshot changed.

## Product bugs

None found or changed.

## Deviations and decisions

1. **D3 is 5 of 7, not 7 of 7.** `registry()` cannot move to `features/shared/` without widening rule 3's owner list (see above). That was not done, and no exemption was added.
2. **Rule 3 now fails dynamic or rest slot reads in host files (`internals-foreign ?`).** This is stricter, not wider. The current tree has none.
3. The panel-host helpers are re-exported through the owners' hosts rather than imported from `shared` at the 15 import sites. That keeps import-site churn at zero, and each panel keeps one import line from its own host.
