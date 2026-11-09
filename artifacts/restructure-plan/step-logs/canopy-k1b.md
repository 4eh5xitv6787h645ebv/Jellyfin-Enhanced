# Canopy K1b: one copy of each stateless shared module in the served bundle

Branch `canopy/k1b-dedupe` from `canopy/k1-bundle-size` @ `d3b62210`. Worker: JE worker on Alex's laptop (shared). Node v26.13.0, .NET SDK 10.0.401.

| Commit | What |
|---|---|
| `bc2c50fc` | perf(client): K1b one copy of 24 shared modules in the served bundle (manifest, build plugin, runtime lookup, generated outputs, tests, budget) |
| `94cdd1ad` | docs: K1b shared modules (`docs/rewrite/frontend-build.md`) |
| `c9cfe0e7` | fix(client-build): shared modules only where `js/component-scripts.json` exists (contracts boundary fixture) |
| `d3e9c932` | test(api): `ApiAssetTests.BundleSourceMap…` accepts the generated stub sources, so it again fails only at its listed final assertion |
| `a80082c2` | test(browser): Playwright fixtures publish the shared modules (fixture server route, three specs edited in place) |
| this commit | docs: canopy K1b log |

## Result

The served bundle is `GET /JellyfinEnhanced/bundle.js`, measured on the in-process dump (`scripts/restructure-gates.sh bundle` / `size`):

| | K1 (`d3b62210`) | K1b | Change |
|---|---:|---:|---:|
| Raw | 2,640,436 | **2,375,833** | −264,603 (−10.0%) |
| gzip -9 | 677,849 | **639,196** | −38,653 (−5.7%) |
| brotli -q 11 (what browsers get once the background upgrade is done) | 493,737 | **482,518** | −11,219 (−2.3%) |
| brotli -q 9 (first seconds after a restart) | 543,509 | 528,636 | −14,873 (−2.7%) |

The compressed savings are much smaller than the raw ones. That is expected: gzip and especially brotli (16 MB window) already encode a repeated copy of a module as a back-reference, so a duplicate cost little on the wire. The raw saving still counts for parse and compile time and memory in the browser: about 265 KB less JavaScript to parse on every page load.

Sum of the 182 minified twins (`min/js/**` component scripts): 2,627,307 → 2,362,704.

brotli -q 11 comes from the `size` gate's final run. An earlier run of the same tree printed 482,663 for the same dump; the raw and gzip figures were identical in both runs.

**Budget** (`client/bundle-budget.json`, new history entry): raw 2,494,625 and gzip -9 671,156 (measured plus 5%), down from 2,772,458 / 711,744.

## Duplication measured first

Method: build every component script as its twin is built (same options, `minify`) with an esbuild metafile and sum `bytesInOutput` per input across outputs. "Extra" = total bytes minus one copy. In the bundle, before K1b: **440,486 extra bytes** over all duplicated inputs. Counting `contracts/bootstrap.js` too (loaded on every page but not part of the bundle), 493,525.

| Module (client/src/…) | Copies | Extra bytes (min) | Outcome |
|---|---:|---:|---|
| contracts/schema.ts | 2 (+1 in `contracts/bootstrap.js`) | 51,730 (+51,795) | **shared** (provider `enhanced/config.js`) |
| features/spoiler-guard/host.ts | 12 | 48,279 | **shared** |
| features/seerr/core/status.ts | 9 | 29,613 | **shared** |
| features/hidden-content/host.ts | 18 | 28,710 | left: stateful |
| features/seerr/core/decode.ts | 14 | 27,821 | **shared** (reviewed) |
| features/seerr/core/ui/icon-markup.ts | 7 | 23,933 | **shared** |
| host/context.ts (K1's delegate) | 106 | 20,495 | left: it is the lookup itself |
| features/details-providers/wire.ts | 12 | 20,439 | **shared** |
| features/bookmarks/lifetime.ts | 8 | 15,890 | **shared** |
| features/seerr/core/runtime.ts | 14 | 14,944 | left: stateful closure |
| features/downloads/runtime.ts | 8 | 12,789 | **shared** |
| features/media-tags/layout/layout-rules.ts | 3 | 10,317 | **shared** (reviewed) |
| features/seerr/discovery/domain.ts | 10 | 9,827 | left: sharing costs more than it saves |
| features/player/wire.ts | 6 | 7,038 | **shared** |
| features/spoiler-guard/ownership.ts | 8 | 6,594 | **shared** |
| features/details-providers/page.ts | 12 | 6,368 | **shared** |
| features/seerr/host-details.ts | 13 | 6,235 | left: stateful |
| features/bookmarks/host.ts | 8 | 6,153 | **shared** |
| features/hidden-content/model.ts | 8 | 5,793 | **shared** |
| features/player/lifetime.ts | 7 | 5,544 | **shared** |
| features/seerr/host-core.ts | 15 | 5,440 | left: stateful |
| features/seerr/host-discovery.ts | 14 | 4,961 | left: stateful |
| features/details-providers/host.ts | 13 | 4,914 | **shared** |
| features/seerr/core/display.ts | 6 | 4,381 | **shared** |
| features/media-tags/pipeline/dto.ts | 18 | 4,194 | **shared** |
| features/shared/dom.ts | 11 | 4,173 | left: not worth it |
| features/player/host.ts | 7 | 4,002 | **shared** |
| features/details-providers/provider-domain.ts | 3 | 3,805 | left: not worth it |
| features/media-tags/host.ts | 20 | 3,735 | **shared** |
| features/chrome/host.ts | 7 | 3,366 | left: would move the featureContext implementation (below) |
| features/seerr/details/domain/json.ts | 11 | 3,230 | left: not worth it |
| features/downloads/host.ts | 8 | 3,108 | **shared** |
| features/details-providers/links.ts | 10 | 2,566 | **shared** |
| features/settings-panel/host.ts | 9 | 2,525 | left: not worth it |
| features/seerr/details/domain/media.ts | 8 | 2,417 | left: not worth it |
| features/seerr/recommendations/stage.ts | 7 | 2,382 | left: stateful closure |
| features/calendar/host.ts | 7 | 2,340 | **shared** |
| contracts/validate.ts | 2 (+1) | 1,309 | **shared** (with schema) |
| 26 more modules under 1.6 KB extra each | | 20,435 | left: not worth it (measured, below) |

## Design

### Publish once, read the published copy (K1's pattern, generalised)

`client/shared-modules.json` maps each shared module to its **provider**: the first script in `js/component-scripts.json` that uses it, so by construction it loads before every reader. `scripts/client/shared-modules.mjs` is an esbuild plugin used when the component scripts are built (readable `js/**` and `min/` twins alike):

- **Provider:** an injected module, evaluated before the provider's own code (esbuild `inject`), runs `publishSharedModules({ "<id>": namespace })` (`client/src/host/context.ts`). That puts the module's namespace on `JE.core.sharedModules`: non-enumerable, a null-prototype object, and an id that is already present keeps its copy. These are the same rules as K1's `JE.core.featureContext`. Only the shared module's own import closure (which may not have top-level statements, see below) runs before the publish.
- **Reader:** every other component script that imports the module gets a generated stub in its place. The stub calls `sharedModule("<id>")` when the script loads, and re-exports each export through a `/* @__PURE__ */ sharedExport(...)` call, so an export the script never uses costs nothing. A missing copy throws `<id> is not in JE.core.sharedModules: load its provider first (client/shared-modules.json)`.
- In outputs and maps the generated modules are named `client/generated-shared/{publish,stub}/…`. That folder never exists on disk (the build refuses to run if it does). They are ordinary relative sources, so `ClientScriptBundle`'s map rebasing and `sourcesContent` copy work unchanged. A first version used an esbuild namespace (`je-shared:`), which the server rejected as an external source: a 500 on `bundle.js`, caught by `size`.
- **No source file changes.** Imports stay as they are; type checking, the feature-boundary rules and the tests that compile `client/src` directly see the same code.
- Applied only to component scripts. `contracts/bootstrap.js`, the HTML pages, the splash and the login image keep inlining what they use. A tree without `js/component-scripts.json` (the contracts boundary fixture) applies nothing, as with K1's twins.

Why a manifest plus a build plugin, and not K1's hand-written delegate per module: there are 24 modules with 1 to 40 exports each, imported from more than 150 files. Hand-written delegates would have meant changing those imports, with the provider's own graph still needing the real module, plus a typed delegate file per module. With the plugin, one reviewed list drives everything, and the build checks it (next section).

### Build-time checks (`prepareSharedModules` in `scripts/client-build.mjs`)

- **Stateless closure:** for each shared module, esbuild lists its whole runtime import closure, and every file in it must have no top-level state. Allowed at top level: imports, re-exports, types, function declarations, and `const` bindings whose initialisers are literals, functions, operators over those, frozen values, or object and array literals of those. Reported: `let`/`var`, classes, enums, `new` (Set, Map, WeakMap …), any other call, a `g`/`y` regex (its `lastIndex`), and any top-level statement. A binding the check cannot clear needs a `reviewed` entry with a reason of at least 40 characters, and a stale `reviewed` entry fails too. The closure matters as well as the module: in a reader, the shared module's own imports now come from the provider's copy, so a stateful dependency would be split.
- **Order:** every output whose metafile contains a module's stub must come after that module's provider in `js/component-scripts.json`. Every listed module must have at least one reader.
- `tests/client-build/shared-modules.test.mjs` adds to that, on the committed outputs:
  - exactly one component script inlines each module (by esbuild's `// client/src/<path>` section label), and it is the provider;
  - every reader loads after the provider;
  - nothing outside the component scripts reads a shared module;
  - `contracts/bootstrap.js` still has its own schema.

  It also runs a whole-program **mutation scan** with the TypeScript checker, and fixture builds:
  - mutation scan: no client source assigns to, deletes from, `++`s, `Object.assign`/`defineProperty`/`setPrototypeOf`s or calls a mutating method (`push`, `set`, `add`, `delete` …) on any top-level object, array or collection binding in a shared module's closure (43 bindings in the 26 closure files, reached through any member path);
  - fixture builds: provider and reader both run, the publish is non-enumerable and keeps the first copy, the reader inlines nothing, unused exports drop out, and a missing provider gives the named error. A reader listed first is rejected, a `let` counter is rejected, and a tree without the list stays unshared.

### Statelessness evidence per shared module

All 24 pass the syntactic closure check. These needed a human decision, and each is recorded in the manifest's `reviewed` entries:

- `seerr/core/decode.ts`:
  - `SeerrDecodeError` is a class. It has no static members, is only ever thrown, and nothing in `client/src` tests `instanceof SeerrDecodeError`, so one class instead of one per script is not observable.
  - The 18 module-private `*Checks` tables are built once from pure combinators (`optional`/`nullable`/`listOf`/`either` return closures over their arguments only) and only read by `matches()`.
- `media-tags/layout/layout-rules.ts`:
  - `GROUPS` is a Set that no source references after its declaration;
  - four tables get a null prototype once at load (`withoutPrototype`) and are then only read.

Objects and arrays the check accepts (for example `bootstrapSchema`, `BADGE_ICONS`, `DEFAULT_CAPS`, `LAYOUTS`, `itemStrings`) are covered by the mutation scan.

I also checked, by hand with a TypeScript-checker script, whether **identity** could leak. A reader now gets the provider's function and object values instead of its own copies, and with one realm that is visible only through identity:

- No exported function of a shared module is used as an event listener, a Set/Map/WeakMap key, or in an `===` comparison. Every non-call use is a callback to `map`/`filter`/`then`/`some`, a validator passed to `createSessionCache`, or (`isSafeTmdbImagePath`) stored on `JE.internals` for the same feature.
- No `instanceof` against a shared class.
- Exposed constants: `core/tag-layout.js` (the provider) exposes `LAYOUT_SLOTS`, `TAG_SCALES`, `TAG_GAPS`, `DEFAULT_PROFILES`, `RECOMMENDED_SHAPES`, `SLOT_TO_POSITION`, `POSITION_TO_SLOT` and `POSITION_SETTINGS` on `JE.core.tagLayout`. Those are the same objects as before (the provider's own). `core/tag-look.js` and `tags/tag-item-editor.js` now read those objects instead of private copies. No JE code mutates them (scan above and `grep` of facade writes); only third-party code writing into `JE.core.tagLayout` tables could tell the difference.

### What was left duplicated, and why

- **Stateful (must stay per script):**
  - `features/hidden-content/host.ts` (28.7 KB, 18 copies): at load it captures `window.JellyfinEnhanced`, `Dashboard` and `Emby` into a module-level `host` object, and throws if `JellyfinEnhanced` or `ApiClient` is missing. Each script takes its own snapshot and does its own check at its own load time. Sharing would hand every reader the provider's snapshot, taken at an earlier moment, and drop the per-script load checks.
  - `features/seerr/host-core.ts`, `host-details.ts` and `host-discovery.ts` (5.4 + 6.2 + 5.0 KB): each keeps a module-level `WeakMap` cache of contexts per bridge. Today every script has its own cache; one copy would make scripts share contexts.
  - `features/seerr/core/runtime.ts` (14.9 KB) imports host-core, and declares `RequestNotSentError`, which `runtime.ts` checks with `instanceof`. `seerr/recommendations/stage.ts` (2.4 KB) and `seerr/discovery/lookups.ts` import host-discovery.
  - `settings-panel/shortcut-rules.ts` has two top-level Sets. The build check rejected it; it is tiny, so it was not reviewed.
- **Not worth it (measured):** sharing costs bytes too. The provider publishes the whole namespace (esbuild `__export` getters, and exports the provider itself never used), and each reader pays for a stub plus, once per script, `sharedModule`/`sharedExport` (about 150 bytes). I measured each module by leaving it out of the manifest and rebuilding all twins:

  | Module | Net bytes saved |
  |---|---:|
  | `seerr/discovery/domain.ts` | −187 (worse) |
  | `details-providers/provider-domain.ts` | −98 (worse) |
  | `seerr/details/domain/media.ts` | −613 (worse) |
  | `shared/dom.ts` | +157 |
  | `seerr/details/domain/json.ts` | +450 |
  | `settings-panel/host.ts` | +688 |
  | 12 further stateless modules under 1.6 KB each (four-k-popup, catchup wire/model/host, calendar lifetime, media-tags settings host and rules-host, spoiler-guard wire, downloads validation, settings-values, seerr details links, language-options), together | +186 |

  All of these are left out: every shared module adds a load-order dependency, so each one has to pay for it. The cut-off is about 1 KB.
- **`features/chrome/host.ts`** (+1,151 net): stateless, but its namespace includes `preLoginChromeContext` and so the `createFeatureContext` implementation. Publishing it from `enhanced/header-actions.js` would have put a second copy of the implementation in the bundle, breaking K1's "implementation once, in ui-kit" guarantee (`feature-context.test.mjs` caught it). Left out.
- **`host/context.ts`**: K1's ~195-byte `featureContext` delegate in each feature script, now joined by the ~150-byte K1b lookup in each reader. This is the mechanism itself, so it stays inlined. Remaining extra for it after K1b: 35.8 KB over 136 scripts.
- **`contracts/schema.ts` in `contracts/bootstrap.js`** (52 KB): not a component script. It loads before the bundle from `plugin.js` / the loader, and the per-page JS outside the bundle is outside this brief, which covers the served bundle. A follow-up could have the bundle read the schema from bootstrap.js's `__JE_BOOTSTRAP_CONTRACT__`, which would remove the bundle's remaining copy (another ~52 KB raw). That would make the bundle depend on a non-bundle script, so it needs its own decision.

After K1b the remaining duplication in the bundle, measured the same way (with the plugin), is 160,597 bytes minified, down from 440,486:

- context.ts: 35.8 KB;
- the stateful seerr/hidden-content modules: 62.6 KB;
- the modules left as not worth it: about 47 KB;
- the readers' stubs: the rest.

### Script names and load order

Unchanged. `js/component-scripts.json` and `client/entries` are untouched, and the FE gate's diff against `restructure-base` passes. Providers by order: `core/tag-renderer-base.js` (7th), `core/tag-layout.js`, `enhanced/config.js`, `enhanced/spoilerguard/ids.js` and `state.js`, `enhanced/features-random-button.js`, `itemdetails/features-details-media-info.js`, `homeremoval/features-remove-home.js`, `player/playback.js`, `bookmarks/bookmarks.js`, `jellyseerr/seerr-status.js`, `jellyseerr/jellyseerr.js`, `jellyseerr/ui/ui-popover.js`, `arr/requests/requests-page-styles.js`, `arr/calendar/calendar-page-styles.js`. The loaders run every listed script, in order, with no feature filtering (`bootstrap/loader/component-loader.ts`; `ClientScriptBundle` concatenates the full list).

## Test setups without the provider

K1's helper (`tests/frontend/helpers/feature-context.cjs`) now also compiles and publishes the shared modules from source (`sharedModulesInstaller`, `provideSharedRuntime`):

- **jsdom harness** `load(path)`: before evaluating a script, it publishes the shared modules whose ids the script's stubs name and that no provider has published. featureContext is also published when one of those modules carries the delegate, because a feature host's delegate now often lives in the shared host and not in the script. `createHarness({ sharedModules: false })` turns it off, for the provider-order tests.
- One harness fix was needed beyond that. DETAILS-PROVIDERS-007 fixtures reuse one `JE.core` object across test realms, so the second test saw the first realm's namespace, whose functions read the first window. The helper now drops registry entries created in another realm. In production there is one realm.
- **plugin-pages-host.mjs** passes the script path through, the same way.
- **Poster parity VM** (`tests/poster/parity/web-expected.mjs`) and its jsdom mirror ("colored ratings … poster-parity sandbox") call `provideSharedRuntime` before each script. This also gives that VM the featureContext K1 never gave it: it loads `tags/ratingtags.js`/`ageratingtags.js`, which delegate. I could not run `web-expected.mjs` itself here: it needs the dotnet parity data, and gate H does not run it.
- **Playwright**, without moving any test line:
  - `provideFeatureContext(page)` (K1's 9 specs) also adds the installer;
  - `tests/browser/server.cjs` serves the installer at `/tests/browser/shared-modules.js`, and `fixture.html` loads it right after `ui-kit.js` (one added line in the HTML fixture);
  - three specs that reset `window.JellyfinEnhanced = {}` after the fixture load it on an existing line: `tag-runtime-journey` line 5, `tag-cache-migration` line 30, and `seerr-core-rewrite` line 42 (inline content, because that spec runs on a routed fake origin).
- New tests:
  - `tests/client-build/shared-modules.test.mjs` (7);
  - `tests/frontend/core/core-shared-modules.test.mjs` (2, the real `core/tag-layout.js` → `core/tag-look.js` pair: the provider publishes non-enumerable and keeps the first copy, the reader reads its imports from the published namespace, and without the provider it fails naming the module).
- Adapted:
  - `feature-context.test.mjs`: scripts that reach the delegate through a shared host count as delegating;
  - `ApiAssetTests.BundleSourceMap…`: map sources may be `client/generated-shared/…`. It was failing earlier, at line 202 on those sources, which would have hidden behind its listing. It now fails again only at its listed final `v=next-version` assertion (checked by running it alone).

## Gates (all with `env -u JE_UPDATE_SNAPSHOTS`)

| Gate | Result |
|---|---|
| `all` (on `a80082c2`, the final code) | **passed**. G 22/22. T: 3210 total, 3209 passed, 1 failed, against a baseline of 2980/2979. The failure is the listed `ApiAssetTests.BundleSourceMap…`, which still fails only at its final `v=next-version` assertion (I ran it alone to check). npm test: 3798 total, 3789 passed, 9 failed, all listed, against a baseline of 3745/3736. client-build 222/222. Contract boundary 1/1. INV, TOOL, FE G and the component-scripts/entries diff vs `restructure-base` all pass. Earlier runs: the first `all` failed in the contracts boundary test, because its fixture has no component-script list (fixed in `c9cfe0e7`). The second passed, but running the listed T test alone showed it now failed earlier than its listed assertion, on the new map sources (fixed in `d3e9c932`). |
| jsdom suite on the minified twins (`JE_TEST_MIN_TWINS=1`) | 3798 tests, 3789 passed, 9 failed. The 9 are exactly the baselined ones (compared by name). The readable run gives the same 9. |
| `browser` (`JE_BROWSER_PORT=4198`, `setsid --wait`) | **passed**: 693 tests, 638 passed, 52 failed (= the 52 in `baselines/browser-failures.txt`), 3 skipped. Same counts as K1. The first full run, before the Playwright fixtures were adapted, failed 108 tests outside the list. Every one of those errors was "`<id>` is not in JE.core.sharedModules" (decode 90, icon-markup 18, media-tags/host 6, player/lifetime 3), from `fixture.html` and three specs that load readers without providers, so they were not flakes. After `a80082c2` the affected spec files were rerun on their own: the only failures left were the 3 Firefox `seerr-core-rewrite` tests already in the list. Then the full gate passed with nothing outside the list, so the flake rerun protocol was not needed. Nothing was added to any baseline. |
| `size` | passed: raw 2,375,833 ≤ 2,494,625; gzip -9 639,196 ≤ 671,156; brotli -q 11 482,518. |
| `inv` | passed (standalone, on `a80082c2`). |
| `tool` | passed (standalone, on `a80082c2`): no mutation/history path change. |
| H | **not run**: this worker's Node (v26) cannot run the poster harness gate. `tests/poster/parity/web-expected.mjs` changed; see "The Lenovo merge must check". |

## Bundle checkpoint difference
- K1b dump: `bundle-hash` = `f4c11ca2139310e99aaa4a88d575f5618357736d84c6d8be49b6d1cdb28250df f4c11ca2139310e99aaa4a88d575f5618357736d84c6d8be49b6d1cdb28250df`. K1: `810928a7…cca43` (both columns).
- The bundle differs **by design**: a build-transform step (24 modules moved to their providers, stubs in readers). It passed BROWSER and the jsdom suite on both the readable outputs and the twins (`JE_TEST_MIN_TWINS=1`).
- No line was appended to `baselines/bundle-checkpoints.txt`, because HOST was not run here.

## Product bugs and observations (recorded, not fixed)
- No product bug was found in K1b's scope.
- Test-harness gap from K1, recorded above: the poster parity VM had no featureContext. Fixed with the same helper; not run here.
- `contracts/schema.ts` still ships twice per page load: `contracts/bootstrap.js` plus `enhanced/config.js` in the bundle, ~52 KB raw each. See "left" above.
- `hidden-content/host.ts` is the largest remaining duplicate (28.7 KB). Making it shareable would mean moving its load-time `host` snapshot and check into a function. That is a source change with a behaviour question of its own (when to snapshot `Dashboard`/`Emby`), so it is left for a separate decision.

## Risks
- **More load-order coupling than K1:** 15 provider scripts now publish for later readers; K1 had only ui-kit. In the bundle, a provider publishes before any of its own code runs, and the module loader isolates each script (`try`/`catch`, "continuing with the next module"), so a provider that throws later still published. In the per-file fallback loader, a provider script that fails to download now also breaks its readers, which before would have carried their own copy. The order is enforced by the build and a test.
- **Realm:** a stub reads `window.JellyfinEnhanced` of its own realm at load. All component scripts run in the main document. Bookmarks' parent-frame bridge (`findBridge`) is for the library boot's wait, not for loading scripts into frames.
- **Provider size:** each provider grows by the exports it did not use itself (for example `seerr-status.js` now carries all of decode). This is counted in the net figures above.
- **Minified twins:** BROWSER exercises the readable files. The jsdom suite runs on both, and HOST must smoke the real bundle.

## The Lenovo merge must check
1. **H** on a supported Node, and `tests/poster/parity/run.mjs --offline` if possible, because `web-expected.mjs` changed.
2. **HOST smoke** on the served bundle, as in K1's list (admin page, Media Tags hub and a tagged poster, settings panel, bookmarks, calendar and requests, Seerr modal and discovery, spoiler guard, hidden content, player OSD). The console must show no `is not in JE.core.sharedModules` and no `JE.core.featureContext is missing`.
3. The served bundle's stable hash equals the dump's (`f4c11ca2…`), then append the `canopy-k1b` checkpoint line after HOST.
4. Re-run `restructure-gates.sh size`; the budget is now 2,494,625 / 671,156.
