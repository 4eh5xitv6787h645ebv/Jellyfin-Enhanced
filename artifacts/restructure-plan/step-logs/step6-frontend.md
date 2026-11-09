# Step 6 log, frontend track: A4 → B3 → B4, merged, BROWSER and HOST (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 6, gates FE (G, plus check O for A4), INV, TOOL, BROWSER and HOST, and the HOST bundle rules; frontend.md §0, §1, §1b, §2.3, §2.4, §3 (A4/B3/B4 rows and "B3/B4 (splits)"), §5 and the §6 briefs. Machine: Lenovo worker, main checkout. Gates ran one at a time, in the foreground. The browser suites ran in the background, and nothing else ran or built while they did. The backend track is in [step6-backend.md](step6-backend.md).

## Commits

Branch `restructure/fe-ab`, from `restructure/integration` `566024f5`:

| Step | Commit | What |
|---|---|---|
| A4 | `47581703` | `EnhancedUi` (settings-panel/registry.ts) keeps the shell members and gains optional `sections?: Partial<Record<FeatureName, SettingsSection>>`. The Media Tags panels' 16 members move to `MediaTagsSettingsUi` in media-tags/public-api.ts, which `EnhancedUi` extends. `MediaTagsHubApi` moves there too, and settings-panel/public-api.ts exports `SettingsSection` in its place. `FeatureName` (the 15 `features/*` names) is declared type-only in host/context.ts. `ui-panel-media-tags.ts` takes `MediaTagsHubApi` from its own feature's public API. |
| B3 | `148b4abd` | pipeline/tag-pipeline.ts (2567 lines) is split into `state.ts` (234), `item-facts` (114), `renderers` (131), `series-lookup` (114), `server-cache` (635), `delta-sync` (403), `look-facts` (149), `scan` (375) and `queue` (311), with `tag-pipeline.ts` (410) doing the wiring. The `tag-pipeline.ts` size-baseline entry was removed. |
| B4 | `5b610c73` | layout/tag-layout.ts (2241 lines) is split into `state.ts` (220), `looks` (98), `card-context` (284), `present` (474), `fit-measure` (719) and `fit-apply` (350), with `groups` (200) and `tag-layout.ts` (242) doing the wiring and building the api. The `tag-layout.ts` size-baseline entry was removed. |
| merge | `2872d78c` | `merge: restructure step 6 frontend (A4, B3, B4)` (`--no-ff` into `restructure/integration`, no conflicts) |

No tags were created and nothing was pushed. `component-scripts.json`, the `client/entries` keys and every shipped output name are unchanged, and the C# plugin was not touched.

## How the splits were done (B3, B4)

Both splits are mechanical, scope-aware rewrites done by a throwaway codemod (scratchpad, not committed). It uses the TypeScript checker, not regex. Every closure-level declaration of `createTagPipeline` / `createTagLayout` was classified:

- `let` variables and shared mutable containers become fields of one state object `s` (`PipelineState` / `LayoutState`), created by `createPipelineState(JE)` / `createLayoutState()`. Fields that were `const` are `readonly`.
- Functions and per-instance values go to a `create<Module>(s, JE, deps)` factory, assigned by the plan's §1b table (B3) or line ranges (B4: 52/177/421/882/1537/1868, which still matched the file exactly).
- Every reference that resolves to a state variable became `s.<name>`. Every reference to a function in another module became `deps.<name>`, and shorthand properties were expanded.
- Cross-module calls go through `deps` (`PipelineFns` / `LayoutFns`, explicit interfaces whose signatures were taken from the checker). The wiring file fills it, so the modules never import each other. B3 fills it in one `Object.assign`. B4 assigns the factories one after another in source order, so a factory can see the ones before it, as the original closure could. `api` (and B3's `initialize`) are added after the api object exists.
- B3 hoisted pure constants (numbers, strings, and read-only arrays and sets that are never mutated or exposed; checked by grep) to module scope.
- B4 was stricter: only primitive constants moved to module scope. Per-instance objects (`controllers`, `pendingFit`, `genreAfterFit`, `CONTAINER_CLASS`, which is published on the api, `SLOT_ORDER`, the regexes and sets) stay one per `createTagLayout` call as readonly state fields.

**Boundary edges (B3).** The original `tag-pipeline.ts` imports `host/tag-runtime-host` (baselined edge, count 1). If each new module had imported it, there would have been 9 new rule-1 pairs, and the ratchet rejected them. `tag-pipeline.ts` stays the pipeline's only importer of `host/`:
- It re-exports `TagRuntimeBridge`, `UrlParams` and `TagApiClient` locally with `export type { … };` (no module specifier, so this is not a new reference), and the modules `import type` them from `./tag-pipeline` (same feature, erased).
- It injects `apiClient` / `hasApiClient`, which are stateless `window.ApiClient` readers, through `deps`. Every call is a bare `deps.apiClient()`.

No baseline entry was added and no rule was widened. B4 needed no such work: `tag-layout.ts` imports only same-feature files.

**Equivalence checks** (all scripts in the scratchpad, results here):
- Statement by statement: after undoing `s.`/`deps.` (and shorthand expansion), every non-state statement in the new modules is textually identical to its counterpart in the original closure. B3: 88 identical, plus `PIPELINE_SKIP_SELECTORS`, which differs only by the dedent from moving to module scope. B4: 121 identical, plus `measureAnchors`, whose only "differences" are its own original `(s) => s.endsWith(…)` lambda parameter, which the checker regex also stripped.
- Every state initialiser equals the original declaration's initialiser: B3 53/53 and B4 28/28 (2 of them whitespace-only). B3's `STORED_ENTRY_SCHEMA` read and `TagStripRevision` prefetch keep their original order inside `createPipelineState`.
- Shadowing: every inserted `s.`/`deps.` property access binds, by symbol, to the factory's own parameter or the wiring function's local. That is 488/488 in B3. B4 has 223, and the 3 others are the original lambda's `s.endsWith` / `s.startsWith`. No state access was inserted in a scope where a local `s` (e.g. `settingsSource`'s `const s = JE.currentSettings`) shadows it.
- Eagerness: no factory reads `deps` or `s` at creation time. Only the two api object literals do, after all factories are wired.
- Typecheck is clean, and `JE.tagPipeline`, `createTagPipeline(JE)`, `createTagLayout(JE)`, `TagLayout = ReturnType<typeof createTagLayout>` and `JE.core.tagLayout` keep their shapes.

## Gates

`scripts/restructure-gates.sh fe` (G, INV and TOOL inside it) exited 0 after A4, B3 and B4 on the branch, and again on the merged `restructure/integration` (`2872d78c`). The tree was clean after the regenerating build on the merged tree. Merged tail:
```
Client: 575 TypeScript sources checked; 210 mapped browser entries; 9 typed HTML pages.
Production inventory is current (this does not assert behavioral coverage).
== INV: route list vs artifacts/restructure-plan/baselines/inventory-routes.txt
Ran 16 tests in 0.627s
OK
tooling: passed
ℹ tests 3787
ℹ pass 3778
ℹ fail 9
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
== FE G: component-scripts.json and client/entries output keys vs restructure-base
restructure-gates: fe passed
```
Each step gave the same counts. The 9 failures are the baselined ones.

- **Targeted tests:** A4 (A2/A4 set) 235/238, the 3 being the baselined `bootstrap-media-tags-portable` sign-in tests. B3 `core-tag-pipeline*`, `core-tag-renderer*` and `core-tag-look-pipeline*` 76/76. B4 `core-tag-layout*`, `core-tag-boundaries*` and `core-tag-look*` 154/154. `node --test tests/frontend/architecture/*.test.mjs` 42/42 after each step.
- **Check O (A4):** `git diff` over `js/**/*.js` and `Configuration/**/*.js` changed 0 lines. Only `ui-panel-media-tags.js.map` (`sourcesContent`) and the ledger hash changed.
- **Check O does not apply to B3/B4** (frontend.md §3). Their built-JS change is exactly `js/tags/tag-pipeline.js` (B3) and `js/core/tag-layout.js` (B4), plus their maps. No other output changed.
- **TOOL:** no mutation anchor or path changed. No case names `tag-pipeline` or `tag-layout` text, so no `before`/`after` was edited, and `baselines/mutation-check.txt` is untouched (9 lines).
- **Key snapshots:** the persistence and translation keys equal `keys-S0.txt` / `tkeys-S0.txt` after each step.

## Baselines

| | before (`566024f5`) | after (`2872d78c`) |
|---|---|---|
| `boundary-baseline.json` | 278 files, 386 pairs, **502** violations | unchanged (278 / 386 / **502**) |
| `size-baseline.json` | 22 files, 25,608 lines | **20 files, 20,800 lines** (B3 removed `pipeline/tag-pipeline.ts` 2567; B4 removed `layout/tag-layout.ts` 2241) |
| `baselines/mutation-check.txt` | 9 | 9 (untouched) |

No entry was added and no count was raised. The pre-existing `ui-panel-media-tags.ts` "lower it" note (1234 vs 1235, step4.md note 1) is gone: A4 added one import line, so the file is back to 1235 = baseline.

## BROWSER (`npm run test:browser`, 693 tests: chromium, mobile-chromium, firefox)

**Result: does not pass. It fails the same way on the pre-step tree, and the plan defines no BROWSER baseline.** This is recorded as a real, pre-existing problem and was not patched around.

| tree | passed | failed | skipped |
|---|---:|---:|---:|
| pre-step `566024f5` (throwaway worktree, same suite) | 638 | 52 | 3 |
| B3 `148b4abd` | 637 | 53 | 3 |
| B4 `5b610c73` | 638 | 52 | 3 |
| merged `2872d78c` | 638 | 52 | 3 |

- The B4 and merged failure sets are **identical** to the pre-step set, compared as sorted lists of `[project] › file:line › title`. The list is in [step6-browser-failures.txt](step6-browser-failures.txt).
- B3's one extra failure, `[mobile-chromium] discovery-recommendations-rewrite.spec.cjs:70` (an infinite-scroll `expect.poll` 5 s timeout), is a timing flake. It passed `--repeat-each=5` on the B3 build and on the pre-step tree.
- By spec, the 52 are: tag-genre-names 12, settings-matrix 12, settings-overflow 9, settings-panel 6, seerr-details-rewrite 3, seerr-core-rewrite 3, flows 3, settings-panel-rewrite 2, chrome-rewrite 2.
- Main causes:
  - `JE.t is not a function` in the fixture's `showEnhancedPanel` (`ui-panel.js:206`), which cascades into 15 s, 90 s and 180 s timeouts in the settings and tag-genre-names specs.
  - `toCamelCase is not defined` (settings-panel-rewrite).
  - A few seerr, flows and chrome locator assertions.
- None is in code this step changed. Every media-tags geometry or pipeline spec that B3/B4 could affect passes, apart from tag-genre-names, which fails before it reaches tags, on the panel's `JE.t`.

Because BROWSER does not pass, HOST bundle rule (b)(1) ("each of B3/B4 passed BROWSER on its merged result") is **not strictly met**. What holds is: same results as the pre-step tree.

## HOST (step-6 checkpoint)

- `scripts/restructure-gates.sh image`: `jellyfin/jellyfin:12.4 = …@sha256:b45218a461bf…`, passed.
- Server: `je up rs6host 18566 --image jellyfin/jellyfin:12.4 --no-warm` created the disposable `je-lab-rs6host` from the golden lab snapshot, bound to `127.0.0.1:18566`. `je up`'s own deploy build failed before touching the server, as in steps 1 and 5 (clean clone without `node_modules`). 192.168.0.84 and live installs were not used.
- Plugin:
  - Built from the merged checkout (clean, `2872d78c`) with `dotnet build … -c Release -p:JellyfinTarget=jf12 -o <scratch>`: 0 errors, 1 warning (the baselined CS8604, `Features/Bookmarks/JeBookmarksController.cs(50,45)`).
  - Installed as `je deploy` does: stop, copy the DLL to `config/plugins/JellyfinEnhanced_12.8.0.0/` (sha1 `21d864cf…`, same as the build), write the skill's `meta.json`, start.
  - Healthy, with `public-config` 200, after 5 s.

| Check | Result | Evidence |
|---|---|---|
| Plugin loads, no JE errors | **PASS** | Server log: `Loaded plugin: Jellyfin Enhanced 12.8.0.0`, `Jellyfin Enhanced v12.14.0.0 initialized`, `Startup Task completed successfully`. `GET /Plugins`: `Jellyfin Enhanced 12.14.0.0 Active`. 0 `[ERR]` lines after startup. In the browser the only HTTP errors are the 2 known lab-data poster 404s (step 1) and a `403` from `api.github.com/…/js/locales` (GitHub API rate limit on an external request, not the server). No page errors. |
| Bundle check | **(a) PASS; (b) see note** | (a): the served `GET /JellyfinEnhanced/bundle.js` (200, 4,319,966 bytes) and the in-process `restructure-gates.sh bundle` dump on `2872d78c` have identical hashes: stable `87973769…a062`, comment-stripped `1c659f7c…886d`. (b), per-kind rule for a span containing B3/B4: (2) the only backend merge in the span since the step-5 checkpoint, `2e0fbd9c`, leaves `js/` and `client/` untouched (`git diff --quiet` exits 0) and does not touch `ClientScriptBundle.cs`. Across the whole span the only changed built JS is `tags/tag-pipeline.js` (B3) and `core/tag-layout.js` (B4), plus maps. (1): BROWSER has the 52 pre-existing failures above, identical to the pre-step tree, so it is not a strict pass. **Appended** `step6 87973769…a062 1c659f7c…886d` to `baselines/bundle-checkpoints.txt`. |
| Admin page renders | **PASS** | v12.14.0.0 header, section nav, What's New. [step6-host-admin-page.png](step6-host-admin-page.png) |
| Media Tags hub (user settings panel → Media Tags) | **PASS** | `#jeMediaTagsHub` visible with tabs Layout, Groups, Status badges, Rules & locks, Colours, Server (Admin), the live preview, and Corners/Bands/Caption/Summary/Minimal. [step6-host-settings-panel-media-tags.png](step6-host-settings-panel-media-tags.png) |
| Poster with tags renders | **PASS** | Movies: 100 of 100 rendered cards have tag hosts. *101 Dalmatians II* shows 1080p, WEB, H264, Dolby Digital+ 5.1, language flags, ratings and genre icons. [step6-host-tagged-poster.png](step6-host-tagged-poster.png) |
| Admin page → Media Tags section | **FAIL (pre-existing)** | See the finding below. [step6-host-admin-media-tags.png](step6-host-admin-media-tags.png) |
| JE scheduled tasks, original names | **PASS** | `GET /ScheduledTasks`: 15 in "Jellyfin Enhanced", the same (Key, Name) pairs as step 1 (`JellyfinEnhancedAnalyticsReport` … `JellyfinEnhancedStartup`). |
| `/api-docs/openapi.json` | **PASS** | 200, OpenAPI 3.0.4, 474 paths, 180 under `/JellyfinEnhanced`. |

Screenshots: 1400×900 headless Chromium as `real-admin`, with `docs-shots.mjs` and step 1's script. Two locators were updated for the current markup: `button.jellyfin-tab-button[data-tab="media-tags"]` (admin) and `button.tab-button[data-tab="media-tags"]` (panel; the label has an emoji prefix).

**Finding (real, pre-existing, not patched): the admin page's Media Tags section never loads.**
- After clicking the admin config page's top-level "Media Tags" section, it stays on "Loading Media Tags settings…" (`.je-tag-admin > p.je-ta-wait`) for more than 45 s.
- Meanwhile the page requests `/Plugins/f69e946a…/Configuration` in a loop: about 1,930 "Requesting url without automatic networking" logs in 12 s.
- `JellyfinEnhanced.adminTags` is defined, and there are no page errors.
- **Identical on the pre-step build:** a plugin built from `566024f5` (sha1 `bc5430b0…`, same build command), deployed to the same server, gave 1,929 requests and the same stuck state. So A4/B3/B4 did not cause it. After that comparison the merged build was reinstalled, and every HOST result above comes from it.
- Steps 1 and 5 checked only the user-panel hub, so this section has no earlier HOST evidence. It should be bisected against `restructure-base` before C1, or reported to the coordinator as a pre-existing rewrite bug.

### Cleanup

- `je rm rs6host` removed `je-lab-rs6host` and `/home/jake/je-lab/rs6host`. Confirmed: `docker ps -a --filter name=rs6host` and `docker ps --filter label=je.lab=1` are empty, and the directory is gone.
- Port: nothing listens on 18566, and `curl 127.0.0.1:18566/health` cannot connect.
- Volumes (42) and networks (4) are unchanged from before the run. None were created.
- Temporary auth state and caches removed: `/tmp/je-docs/tools/state-real-admin-18566.json`, `.notes/.tok-admin.lock`, this checkout's je build cache `~/.cache/je-lab/build/9fa5bbccb3f2`, and both scratch plugin builds and bundle dumps.
- The throwaway `566024f5` worktree (scratchpad, `node_modules` symlinked) was removed and pruned.
- My browser runs' fixture server and the left-over one from the first, time-limited run are stopped. Port 4179 is free.
- Unrelated containers (`je-perf-real-seerr`, other sessions' stopped `je-lab-*`) and T3's chrome-headless-shell were not touched.

## Deviations and decisions

1. **A4 `sections` is optional** (`sections?:`). frontend.md §1a writes `sections:`, but `EnhancedUi`'s contract is "every member optional" and nothing fills it until A5, so a required member would be untrue at runtime. `SettingsSection` is a minimal `{ buildHtml?, wire? }` for A5 to extend. `FeatureName` lives in host/context.ts, which §2.3 already has use it.
2. **A4 moved `MediaTagsHubApi`** into media-tags/public-api.ts with the members that use it. settings-panel/public-api.ts no longer exports it, since its only importer, `ui-panel-media-tags.ts`, now takes it from its own feature. `media-tags/admin/host.ts` still does `Pick<EnhancedUi, …>` from settings-panel's public API. That is legal, and it was left as is, outside A4's brief.
3. **Each split has a `state.ts`.** The plan's B3 table names `state.ts`, and B4 got one too for the same pattern; §1b lists no state file for layout/. It also holds each file's former file-level types and helpers.
4. **B3 host access goes through `tag-pipeline.ts`** (above) instead of each module importing `host/tag-runtime-host`. That is the only route that adds no boundary pair.
5. **BROWSER and the admin Media Tags section fail on the pre-step tree too.** Both are recorded and neither was patched. The step-6 bundle line was appended as the plan requires, with rule (b)(1) noted as not strictly met.

## Notes for C1+

- **C1 (hosts):**
  - Moving `host/tag-runtime-host.ts` → `media-tags/host.ts` makes `pipeline/tag-pipeline.ts`'s import same-feature, so its baseline entry can be lowered.
  - The pipeline modules can then import the bridge types and `apiClient`/`hasApiClient` from `../host` directly. Drop `tag-pipeline.ts`'s `export type { TagApiClient, TagRuntimeBridge, UrlParams }` and the `deps.apiClient` injection only if you want; both stay correct.
  - `host/context.ts` now also declares `FeatureName` (types only, no imports), so C1's settings-host change to context.ts must keep it.
- **A5:** registers per-feature sections in `EnhancedUi.sections[<FeatureName>]`. Extend `SettingsSection` (settings-panel/registry.ts) as needed. `wireHiddenContentListeners` is still a shell member of `EnhancedUi`; A5/C3 can move it to hidden-content the way A4 moved the Media Tags members.
- **C3 media-tags:**
  - The split modules use `JE.*` through the factory's `JE` parameter exactly as before, so converting to `ctx` works per module.
  - Keep `deps` as the only cross-module route: there are no imports between `pipeline/*` or `layout/*` modules, and the cycle check stays empty.
  - `LayoutFns.api` is typed `TagLayout`. Signatures in `PipelineFns`/`LayoutFns` were generated from the checker, so a changed function signature must update them.
- **Pre-existing problems to route to the coordinator:**
  1. BROWSER's 52 failures (no plan baseline; the list is in step6-browser-failures.txt).
  2. The admin Media Tags section's configuration-request loop.

  Until a BROWSER baseline exists, later steps (C2, C3, D2) can only show "same as before". Compare sorted failure sets the way this log does.
- **HOST procedure:**
  - Same as step 1 (S1-d). `je up`'s deploy still fails, so build and install by hand.
  - The skill's step-1 shot script needs the two `data-tab` locators above.
  - The full browser suite takes about 10.6 minutes at 3 workers, so run it in the background and wait. A `timeout`-killed run leaves `tests/browser/server.cjs` holding port 4179.
