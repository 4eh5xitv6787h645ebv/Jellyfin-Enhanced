# Canopy K2 log: bug-class guard tests and the robustness/security rules gate (2026-11-09)

Source: Jellyfin Canopy @`17c80bc` (`/var/lib/jebench/projects/canopy-research/Jellyfin-Canopy`, read only), GPL-3.0. The guards are adapted from its `src/test/{escape,css-injection,leak,error-as-empty}-guard.test.ts`, `scripts/check-performance-rules.js`, `Tests/Configuration/ConfigControlCoverageTests.cs` and CONTRIBUTING.md rules R1–R9 and X1–X2. The comparison report is `canopy-research/REPORT.md` §4, §5 and recommendations #3 and #9.

Machine: a JE worker on Alex's laptop (user `jebench`, shared with other jobs). Checkout: `/var/lib/jebench/projects/je-canopy-k2`, branch `canopy/guard-tests`, created from `restructure/lanes-merged` at `8ef94a5a` (`npm ci` was already done). Node v26.13.0. No other folder, job, container or process was touched. Nothing under `client/src`, the C# sources or `scripts/restructure-gates.sh` was changed. The test wiring needed no change, because `tests/frontend/helpers/discovery.mjs` already walks every subfolder. `guards.test.mjs` asserts that the guards are discovered.

Git identity: the identity of the earlier commits (`Jake <45441845+4eh5xitv6787h645ebv@users.noreply.github.com>`), set per command with `git -c user.name=… -c user.email=…`. The git config was not changed. There are no attribution trailers.

## Commits

| SHA | Commit |
|---|---|
| `d38ae4c0` | `test(guards): AST guard scanner, ratchet harness and X1 escape guard` |
| `c6768a01` | `test(guards): X2 CSS-injection guard` |
| `de1cdda6` | `test(guards): R9 error-as-empty guard` |
| `89ae9d18` | `test(guards): L1-L6 leak guard` |
| `0e8209a9` | `test(guards): R3/R5/R6 performance-rules guard` |
| `bfb4cc5b` | `test(guards): C1 config-control guard` |
| `a6000ed3` | `docs: robustness and security rules (adapted from Jellyfin Canopy)` (CONTRIBUTING.md) |
| `b0175d40` | `docs: canopy K2 triage` ([canopy-k2-triage.md](canopy-k2-triage.md), `git add -f`) |
| (this commit) | `docs: canopy K2 log` |

## What was added (`tests/frontend/guards/`)

- `lib.mjs`: the shared scanner. It parses `client/src/**/*.ts` with the `typescript` package, reusing `listSources`, `compareCounts` and the other helpers in `tests/frontend/architecture/scan.mjs`. It also does lexical name resolution (with named imports across files), builds scope names, and holds the ratchet. Regular expressions are used only to classify literal text (markup, empty-state keys, remote URLs) and to read the C# property list. Structure always comes from the AST.
- `taint.mjs`: the value-safety engine shared by X1 and X2, after Canopy's escape-guard classifier. It fails closed. Safe means:
  - literals, numbers and UPPER_CASE constants;
  - escapers and validators, by name;
  - local values traced through their initializer and assignments;
  - calls traced through their return values;
  - parameters that are safe by caller contract, where every call site in client/src passes a safe argument;
  - `.map().join()` over constants.

  Trusted producers follow Canopy (`JE.icon`, the `icons` tables, `getThemeVariables`), each checked against JE's implementation.
- The scanners are `escape.mjs` (X1), `css.mjs` (X2), `error-empty.mjs` (R9), `leaks.mjs` (L1–L6), `perf.mjs` (R3, R5, R6) and `config-control.mjs` (C1). `guards.mjs` is the registry.
- `harness.mjs` holds the test helpers. `record.mjs` lowers the baselines (it never raises one), lists findings with their lines (`--list`), and has `--init` for a new guard only.
- There is one `<guard>.test.mjs` and one `<guard>-baseline.json` per guard, plus `guards.test.mjs`. That last file checks that each guard has a test and a sorted, commented baseline holding only its own rules and existing files, that the ratchet semantics hold, and that discovery includes the folder.

**Ratchet.** A baseline is `{file: {"<rule> <enclosing function chain>[ <detail>]": count}}`, with no line numbers. Anonymous callbacks are skipped in the chain, and top-level code is `(module)`. Details are the variable name for L1, the event type for L2 and the property name for C1. A NEW key or a higher count fails, with the offending lines printed. A lower count prints a `t.diagnostic` note asking for the baseline to be lowered. There are no allowlists or exemptions beyond the recorded baselines. I checked by hand that removing a baseline entry fails the ratchet, and that raising one prints the note; both edits were then reverted.

## Rules and baseline counts

| Guard | Rule | What it flags | Findings | Keys |
|---|---|---|---:|---:|
| `escape-guard` | X1 | A value reaching `innerHTML`/`outerHTML` (`=`/`+=`), `insertAdjacentHTML`, `document.write`, `createContextualFragment`/`setHTMLUnsafe`/`parseFromString`, `JE.toast` or a markup template or `+` chain that is not escaped or recognisably safe | 497 | 144 |
| `css-injection-guard` | X2 | A value entering a style attribute, `cssText`, `addCSS`/`injectCss`, `<style>` text, `insertRule` or `replaceSync` that is not numeric, constant or validated (escapeHtml does not count) | 180 | 35 |
| `error-as-empty-guard` | R9-fail-empty | A failure branch with no error channel that returns, resolves or assigns `[]`, `{}`, an empty Map or Set, or an empty-list object | 17 | 16 |
| | R9-fail-cached | The same, but a cache write of an empty value or null/false | 2 | 2 |
| | R9-fail-renders-empty | The same, but rendering a "no results"/empty literal or key, or calling a render function with `[]` | 0 | 0 |
| `leak-guard` | L1-unbounded-cache | A page-lifetime Map, Set, array or object that only grows | 25 | 25 |
| | L2-global-listener | A window/document listener with no `signal`, `once` or `removeEventListener` for that type | 94 | 88 |
| | L3-observer | An observer that is never disconnected or tracked | 13 | 13 |
| | L4-interval | A raw `setInterval` that is never cleared or tracked | 2 | 2 |
| | L5-retry-uncapped | A self-rescheduling setTimeout or rAF with no counter, comparison or time budget | 6 | 6 |
| | L6-object-url | `createObjectURL` in a file with no `revokeObjectURL` | 0 | 0 |
| `performance-rules-guard` | R3-body-observer | `.observe(document.body/documentElement/document, { subtree: true })` | 11 | 11 |
| | R5-interval-dom | A `setInterval` whose callback, or a local function it calls, queries the DOM | 17 | 17 |
| | R6-remote-asset | A fetch/import/Worker/EventSource/WebSocket/sendBeacon/XHR to a literal `http(s)://` URL, a remote `<script>`/`<link>` src or href, or `@import`/`url(http…)`/`<script src=http…>` text | 4 | 4 |
| `config-control-guard` | C1-no-control | A settable `PluginConfiguration` property (438 read from the C#) that no admin page source names or writes | 13 | 13 |
| **total** | | | **881** | **376** |

R1, R2, R4, R7 and R8 are review-only, as in Canopy. CONTRIBUTING.md says so.

## Self-tests (planted violations)

Each rule has a planted-violation test. It scans a synthetic project (`client/src/features/planted/planted.ts`, or a planted admin file plus synthetic C# for C1), asserts that the expected key is found, and asserts that the guard's ratchet against its **real** baseline fails on it. Each guard also has a safe sample that must produce no findings.

- **X1:** a raw item field in a markup template; concatenation, insertAdjacentHTML, document.write and toast sinks; a builder parameter with one raw caller; and an unescaped JE.t param. The safe sample covers escapeHtml, Number(), constants, `.map().join()` over constants, contract-safe builders, JE.icon and encodeURIComponent.
- **X2:** cssText, addCSS, `<style>` textContent, and a style attribute fed by escapeHtml. The safe sample covers numbers, constants, the `isCssColor` ternary and CSS.escape.
- **R9:** fail-empty (catch, and `.catch` returning an empty-list object), fail-cached (`cache.set(id, null)`) and fail-renders-empty (`no_results` in a catch). The safe sample covers an error flag, toast, throw, `{ ok: false }` and a catch with no async work.
- **L1–L6:** one planted file with one finding per rule. The safe sample covers a size-bounded map, setup at module load, signal, once, a `{ signal }` options variable, disconnect, track(), clearInterval, a capped retry and revokeObjectURL.
- **R3/R5/R6:** a body-wide subtree observer, DOM polling, and a remote fetch, script and CSS import. The safe sample covers a page-scoped observer, a body observer without subtree, a data poll, a local fetch and an `<a href>`.
- **C1:** the C# reader skips comments, expression-bodied and private properties, and method bodies, and only counts admin sources. A `config.X =` write counts as a control.

That is 33 new tests in total (`node --test tests/frontend/guards/*.test.mjs`: 33 pass).

## Triage summary

[canopy-k2-triage.md](canopy-k2-triage.md) classifies all 376 keys: **12 likely real**, **265 benign**, **99 unclear**. No fixes were made.

Triage kept privately by the maintainer.

## Gates

- `npm test` (`node tests/frontend/run.mjs`), run in the foreground: **3827 tests, 3818 pass, 9 fail**. The 9 failures are exactly the ones in `baselines/npm-failures.txt` (bootstrap-media-tags-portable ×3, bootstrap-native-tabs ×3, core-translate-plural ×3). The same suite without the `guards/` folder, measured on this branch, gives 3794 tests, 3785 pass and the same 9 failures. So the total went up by the 33 guard tests and the failure list is unchanged.
- `scripts/restructure-gates.sh fe`, run in the foreground: **passed** (exit 0, 356 s). The steps:
  - typecheck, client:build, inventory:rewrite, client:check and inventory:rewrite:check;
  - INV (`generate.py --check`, route list) and TOOL (`tests/run.py tooling`, mutation/history path check);
  - `test:client-build` (211/211) and bootstrap-manifest (2/2);
  - the npm ratchet: "total 3827 (baseline 3745), passed 3818 (baseline 3736), failed 9 (baseline list 9)";
  - the component-scripts.json and client/entries key diff against restructure-base.

  The build left the working tree clean.
- In the full parallel run, each guard's ratchet test takes about 6–9 s because the whole tree is parsed in each guard's own process (C1 took 28 s under load). Run alone, a guard test file takes about 1 s.

## Notes for the coordinator

- The scanners are syntactic, with no type checker. Some keys are only "unclear" because a value crosses an object boundary such as `JE.*`, `internal.*` or `sibling(…)`, which the resolver does not follow. Builders whose markup lives in client/src are still scanned at their own position.
- Escapers and validators are trusted by name (`escapeHtml`, `esc`, `escAttr`, `escapeText`, `isCssColor`, …). Their definitions are not verified by the guard.
- R9 needs the try block to contain asynchronous work (an `await`, a fetch/request/ajax/api call or `.then`). One known false match is the R9 key `tag-direct-play.ts:createDirectPlay.userBitrate`, triaged benign: an `api`-named synchronous call.
