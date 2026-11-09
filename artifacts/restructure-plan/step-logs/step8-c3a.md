# Step 8 log, frontend C3 group A: media-tags → settings-panel → hidden-content (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 8 (frontend **C3-<feature>**), gates FE (G with INV and TOOL inside `scripts/restructure-gates.sh fe`) and BROWSER. Sources: frontend.md §2.3, §2.4, §3 (C2/C3/C4 rows, "Baseline keys"), §6 (preamble, C2 and C3 briefs), [step7-frontend.md](step7-frontend.md) "Notes for C3" and [step6-frontend.md](step6-frontend.md). Machine: JE worker on Alex's laptop (user `jebench`, 16 cores, 62 GB, shared with the c3b/c3c lanes). Checkout `/var/lib/jebench/projects/je-restructure-c3a`, Node 26.13. Gates ran one at a time in the foreground. BROWSER ran in the background with nothing else building or testing, and was waited on each time. HOST is the coordinator's job after the merge.

## Commits

Branch `restructure/fe-c3a`, from `7fdcc563` (C1 + C2). Not merged; pushed to `origin` (the local bare repo) only.

| Step | Commit | What |
|---|---|---|
| C3-media-tags | `c098daba` | `media-tags/host.ts` adds `MediaTagsContext` / `mediaTagsContext(JE = tagRuntimeHost())`. peopletags publishes `JE.internals.peopleTags` through `ctx.own`. ratingtags and ageratingtags read spoiler-guard's `spoilerBlur` through `ctx.peer`. |
| C3-settings-panel | `c2551f73` | `settings-panel/host.ts` adds `SettingsPanelContext` / `settingsPanelContext(JE)`. ui-panel-template reads hidden-content's `hiddenContent`, and ui-panel-settings reads media-tags' `tagPipeline` and tag (re)initialisers, through `featureCtx.peer`. |
| C3-hidden-content | `31f61fcf` | `hidden-content/host.ts` adds `HiddenContentContext` / `hiddenContentContext(JE)`. features-remove-home reads `JE.internals.hiddenContent` through `ctx.own`. The panel and page modules read seerr's `jellyseerrAPI` / `jellyseerrMoreInfo` through `featureCtx.peer`. |
| log | (this commit) | this file |

Only files in each feature's folder were edited, plus regenerated outputs (`js/**`, `client/generated-manifest.json`) and the downward baseline edits. No `public-api.ts` changed: no facade method was added. `component-scripts.json`, the `client/entries` keys, the shipped output names, `scripts/restructure-gates.sh`, `internals-owners.json`, `scan.mjs`, `baselines/**` (including `mutation-check.txt`, 9 lines) and the C# plugin are untouched. The commits use the identity of the earlier restructure commits, set through `GIT_AUTHOR_*` / `GIT_COMMITTER_*` (git config was not changed).

## What each conversion does

All three follow the C2 pattern. `featureContext<Own, Peers, Bridge>('<f>', JE, { internalSlots, internalsObject })` is built in the feature's host file, and the injected core members stay on `ctx.core`, which is the same typed bridge as before (C3 scope, review-r1 F13).
- **Own:** each feature's owner-only internals slots from `internals-owners.json`: media-tags `peopleTags`; settings-panel `enhancedUi`; hidden-content `hiddenContent`, `hiddenContentPage`, `hiddenContentRuntime`, `features` (co-owned with details-providers). Own facades (`JE.tagPipeline`, `JE.hiddenContent`, …) were not moved onto `ctx.own`. The brief asks for internals and peers only, and C2's facade move was its own deviation 3.
- **internalsObject** is the exact expression each feature already used: media-tags and settings-panel `JE.internals = JE.internals || {}`, hidden-content `JE.internals ??= {}` (its `registry()` / `runtime()`).
- **Peers** are typed structurally (`Required<Pick<Bridge, …>>` or a local interface with only the members read). The owners' `public-api.ts` files export no facade types for them (spoiler-guard's exports nothing; seerr's `SeerrApiFacade` has a different, decoded return shape), and adding them would edit other groups' folders. See deviation 2.
- **Local name.** Where a module's functions already take a `PanelContext` named `ctx` (settings-panel) or bind `ctx` locally (hidden-content `removeContext`), the feature context is `featureCtx`. A first settings-panel draft used `ctx` and the typecheck caught the shadowing.

### media-tags (`c098daba`)
- `createPeopleTags`, `createRatingTags` and `createAgeRatingTags` take `ctx: MediaTagsContext` (`const JE = ctx.core;` keeps the bodies unchanged). Their entries call `create…(mediaTagsContext())`, and `mediaTagsContext()` calls `tagRuntimeHost()` exactly as the entries did.
- `JE.internals = JE.internals || {}; JE.internals.peopleTags = { prefetch, leave };` became `ctx.own.peopleTags = { prefetch, leave };`. The setter evaluates `(JE.internals = JE.internals || {})['peopleTags'] = …`, the same two steps.
- `const sg = JE.spoilerBlur;` (×3) became `const sg = ctx.peer('spoilerBlur');`, which reads `core['spoilerBlur']` on the same bridge at the same moment.
- Built change: `tags/peopletags.js`, `tags/ratingtags.js`, `tags/ageratingtags.js` (each now inlines `featureContext` + `mediaTagsContext`), plus maps whose `sourcesContent` includes `host.ts`.

### settings-panel (`c2551f73`)
- `installUiPanelTemplate(JE, featureCtx = settingsPanelContext(JE))` and `installUiPanelSettings(JE, featureCtx = …)`. The entries (`install…(panelHost())`) are unchanged. A default parameter was used because `ui-panel-settings.ts` was at its size limit, so no line could be added.
- `JE.hiddenContent` (×19, template) became `featureCtx.peer('hiddenContent')`. In ui-panel-settings, `JE.tagPipeline`, `JE.initialize*Tags`, `JE.initializeTagStyles`, `JE.reinitialize{Quality,Rating,Status,Logo}Tags` and `JE.reinitializeTagLayout` (29 reads) were converted the same way. `if (typeof JE.X === 'function') JE.X();` became `const peerFn = featureCtx.peer('X'); if (typeof peerFn === 'function') peerFn();`, on the same line. The peers left the modules' `Deps` picks.
- **`this` evidence.** A peer function is now called without `this` = the bridge. A TypeScript-AST scan (scratchpad script, not committed) of every `JE.(re)initialize* = …` assignment in `client/src` found every media-tags one is a `this`-free function expression, except three aliases that were checked by hand: `reinitializeStatusTags` (a function declaration, statustags.ts:1443), `initializeTagStyles` (async function declaration, tag-styles.ts:295) and `reinitializeTagLayout = layout.reinitialize` (groups.ts:173). None of them uses `this`.
- `registry(JE)` is unchanged and still creates `JE.internals.enhancedUi` on first use for every panel module (see "Not converted").
- `ui-panel-settings.ts` went from 1010 to 1007 lines, so its size-baseline entry was lowered.
- Built change: `enhanced/settingspanel/ui-panel-settings.js` and `ui-panel-template.js`, plus the maps of every settings-panel output (`host.ts` source text).

### hidden-content (`31f61fcf`)
- features-remove-home: `JE.internals?.hiddenContent?.captureItemIntent?.(itemId)` became `featureCtx.own.hiddenContent?.captureItemIntent?.(itemId)`. **Evidence that `internalsObject` never creates `JE.internals` here:** the module's IIFE first runs `installOnce(JE, …)` → `runtime(JE)` → `JE.internals ??= {}`, and then `registry(JE, 'features')`, which does the same. So `JE.internals` exists before this read, and the read is the same lookup.
- hidden-content-panel, -page-cards and -page-admin: each `JE.jellyseerrAPI` / `JE.jellyseerrMoreInfo` read became `featureCtx.peer('…')`. Where TypeScript had narrowed a later dereference, it gets a non-null `!` (erased at build). Each original property read is still one read at the same point, including the reads inside the async `.then` callbacks. One spot in page-admin (`(A && A.search) ? A.search(term) : …`) now reads `A` once into a local in the same synchronous statement, because the triple read failed TS2774.
- Built change: `enhanced/hiddencontent/hidden-content-panel.js`, `hidden-content-page-cards.js`, `hidden-content-page-admin.js`, `enhanced/homeremoval/features-remove-home.js`, plus maps.

**Pure-helper imports:** none were converted. No member was turned into a direct import, so no statelessness claim is made.

## Gates

`scripts/restructure-gates.sh fe` (G, INV and TOOL inside it) exited 0 after each feature. The tail was the same each time:
```
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
== FE G: component-scripts.json and client/entries output keys vs restructure-base
restructure-gates: fe passed
```
- **Targeted tests:**
  - media-tags (`core-tag-*`, `features/*tag*`, `*rating*`, `*people*`, `bootstrap-{tag-*,media-tags-*,custom-tags-hub}`): 1380/1383.
  - settings-panel (`settings-panel-*`, `bootstrap-{settings-panel,panel-resize,shortcuts,tag-layout-panel,media-tags-hub,media-tags-portable,custom-tags-hub,tag-group-editor}*`, `features-tag-styles`): 258/261.
  - hidden-content (`features/*hidden*`, `*remove*`): 128/128.
  - The 3 failures each time are the baselined `bootstrap-media-tags-portable` "offers no Undo" sign-in tests (in `baselines/npm-failures.txt`).
- **Architecture tests:** `node --test tests/frontend/architecture/*.test.mjs` passed 42/42 after each step, with no "improved" diagnostic left.
- **TOOL:** no mutation anchor changed. The only hidden-content case anchors `hidden-content-data.js`, which is unchanged, and no case names the changed outputs. No `before`/`after` was edited.

## Baselines

| | before (`7fdcc563`) | after media-tags | after settings-panel | after hidden-content |
|---|---|---|---|---|
| `boundary-baseline.json` | 50 files, 66 pairs, **85** | 49, 64, **82** | 49, 64, **82** | 48, 63, **81** |
| `size-baseline.json` | 20 files, 20,800 lines | unchanged | 20,797 (`ui-panel-settings.ts` 1010 → 1007) | unchanged |

Removed: `media-tags/types/people/peopletags.ts` (`internals *` 2, `internals peopleTags` 1) and `hidden-content/features-remove-home.ts` (`internals hiddenContent` 1). No entry was added, no count was raised and no rule was widened.

## BROWSER (`JE_BROWSER_PORT=4191 npm run test:browser -- --workers=5`, 693 tests)

| tree | passed | failed | skipped | time | vs step6-browser-failures.txt (52) |
|---|---:|---:|---:|---|---|
| media-tags (working tree = `c098daba`) | 639 | 51 | 3 | 12.2 min | 0 new; 1 listed test passed |
| settings-panel (working tree = `c2551f73`) | 639 | 51 | 3 | 12.1 min | 0 new; 1 listed test passed |
| hidden-content (working tree = `31f61fcf`) | 638 | 52 | 3 | 12.3 min | identical to the list |

**PASS each time:** no failure outside the 52-entry list, so no `--repeat-each` rerun was needed. In the media-tags and settings-panel runs one listed test passed, `[firefox] flows.spec.cjs:29` (keyboard focus within modal), which is not in code these steps touch. In the hidden-content run it failed again, so the set was identical to the list. Failure sets were compared as sorted `[project] › file:line › title` lines from the reporter's "N failed" block, with trailing whitespace stripped.

## Not converted, and why (open for the coordinator)

Group A's area had 18 violations at `7fdcc563` (media-tags 13, settings-panel 3, hidden-content 2). 4 were removed. The other 14 cannot be made legal inside these sub-steps' scope without a behaviour change or a rule change:

1. **`JE.internals.enhancedUi` (media-tags 4 reads + 5 panel imports of `settings-panel/host.ts`; hidden-content 1 panel import).**
   - The Media Tags and Hidden Content settings panels (A1/A2 moved them out of settings-panel) call settings-panel's `registry(JE)`. It **creates** `JE.internals.enhancedUi` on first use, and the panels then write their members into it.
   - media-tags' admin page, admin sections and item editor read those members back (`createTagPreview`, `tagGroupEditorData`, `tagPortable`, `bindTagPreviewInteraction`).
   - Rule 3 lets only settings-panel's host touch that slot, so the legal route would be a settings-panel peer facade. But **more than 15 unit tests and browser helpers load a media-tags panel without any settings-panel shell script**: for example `features-media-tags-portable-labels.test.mjs` loads only `ui-panel-tag-portable.js` and reads `JE.internals.enhancedUi.tagPortable`; `features-admin-tags-preview-styles`, `bootstrap-tag-item-editor` and `tests/browser/tag-container-fit.spec.cjs` do the same with `ui-panel-tag-preview.js`. With a shell-published facade, those panels would no longer register, which is a behaviour change.
   - The step-7 note ("a settings-panel facade read via ctx.peer") does not hold for this reason. Sequencing settings-panel first would not help.
   - Options for the coordinator, both outside a C3 sub-step:
     - (a) Record media-tags and hidden-content as co-owners of `enhancedUi` in `internals-owners.json`. That is the slot's creation evidence since A1/A2, and it matches how `features` is shared. Their own host files could then hold the registry access. This widens rule 3's ownership map, so it is not mine to do.
     - (b) Accept a load-order dependency on the shell and change those tests.
2. **media-tags `editor/tag-item-menu.ts` → `internals.features.buildNativeActionSheetItem`** (hidden-content's slot). It needs a hidden-content facade method, and media-tags would then read it through `ctx.peer`. hidden-content publishes the function on `internals.features` from `features-remove-home.ts`, but `JE.hiddenContent` comes from another module. Whether the two always coexist (the menu falls back to its own row builder when the function is absent) was not established, so the read was left. It can be done as a follow-up media-tags/hidden-content pair.
3. **settings-panel `ui-panel.ts` / `ui-panel-template.ts` → `internals.spoilerGuard`, and `ui-panel-shortcut-editor.ts` → `internals.canonicalCombo`.** These are spoiler-guard's and chrome's slots, and neither feature publishes a facade with these members (`JE.spoilerBlur` has no `buildSettingsHtml` / `wireSettings`). The owners belong to the other C3 groups, so their facades come first, then a settings-panel follow-up.
4. **The open S1-c items** (`host/bootstrap-pages-host.ts`, `admin/config/page/media-tags-tab.ts`) were left for C4, as briefed.

C4 cannot run strict mode while items 1–3 remain. Item 1 needs a coordinator decision.

## Deviations

1. **Partial conversions.** Each feature's context, own-internals and peer reads are converted. The boundary entries in "Not converted" stay in the baseline (ratchet-legal) with the reasons above. This is not a gate failure, so I did not stop.
2. **Peers are typed structurally**, not from the owners' `public-api.ts`. This avoided editing spoiler-guard, seerr and hidden-content public APIs that other lanes are converting, and seerr's full facade types have different return shapes. Retyping them is type-only.
3. **Own facades** (`JE.tagPipeline`, `JE.hiddenContent`, settings-panel's `showEnhancedPanel` etc.) stay on the bridge and are not moved onto `ctx.own`. The own-facade move is optional (C2 deviation 3), and moving them in media-tags would touch most of its modules.
4. **Function peers are called without `this`.** The AST evidence above shows they are `this`-free.
5. Commits without Co-Authored-By or attribution lines, as instructed.
