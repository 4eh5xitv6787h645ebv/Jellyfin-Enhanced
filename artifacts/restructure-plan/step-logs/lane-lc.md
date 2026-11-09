# Lane L-C log: frontend F1 (tests mirror features) and C4 (strict boundaries) (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order rows 10 (F1) and 11 (C4), gates FE (`scripts/restructure-gates.sh fe`, with INV and TOOL inside it) and BROWSER. Sources: [frontend.md](../frontend.md) §2.4, §3 (F1 and C4 rows and detail, "Baseline keys"), §5, §6 (F1 and C4 briefs), [step8-c3-merge.md](step8-c3-merge.md) (the 34 remaining violations), [step8-c3a.md](step8-c3a.md), [step8-c3b.md](step8-c3b.md), [step8-c3c.md](step8-c3c.md) and [step7-frontend.md](step7-frontend.md). Coordinator decisions D1 and D2 came with the brief.

Machine: JE worker on Alex's laptop (user `jebench`, shared with lanes ld and lb and other jobs). Checkout: `/var/lib/jebench/projects/je-restructure-lc`, cloned at `2abd5e3d` (step 8 merged). Origin is the local bare repo. Node 26.13. Every FE gate ran in the foreground. BROWSER ran once, detached, on the final tree, and was waited on until it exited. HOST is not part of this lane.

## Commits

Branch `restructure/fe-f1-c4`, from `2abd5e3d`. Pushed to `origin`, not merged.

| Commit | What |
|---|---|
| `ebc95e0a` | `test(frontend): F1` moves 84 specs and 2 sibling JSON fixtures into `tests/frontend/features/<feature>/` (plus `tests/frontend/admin/config/`), fixes relative paths, and updates the mutation tooling paths. |
| `615a6466` | `refactor(client): C4` adds owner-published facades: spoiler-guard, chrome, hidden-content and media-tags `peopleTags`. Baseline 34 → 28. |
| `8b3fee08` | `refactor(client): C4 D1` makes media-tags and hidden-content co-owners of `enhancedUi`, gives the panels their own hosts, and routes the 4 registry reads through a media-tags host. Baseline 28 → 18. |
| `6560a6d6` | `refactor(client): C4 D2` gives `bootstrap-pages-host.ts` local structural types and adds a media-tags facade for the admin tab's readiness check. Baseline 18 → 13. |
| `bfb0b643` | `refactor(client): C4` strict: platform files go into rule 4's `globalAllowed`, `boundary-baseline.json` is deleted, and the test is strict. |
| (this commit) | this log |

Git identity: the account has no `user.name` or `user.email`. Every commit uses the identity of the earlier restructure commits (`Jake <45441845+4eh5xitv6787h645ebv@users.noreply.github.com>`), set per command through `GIT_AUTHOR_*` and `GIT_COMMITTER_*`. The git config was not changed, and there are no attribution trailers.

## F1: tests mirror features (`ebc95e0a`)

**Classification** was by name prefix (frontend.md §3 F1 mapping), checked against the shipped outputs and `client/src` sources each spec loads (`client/generated-manifest.json` entries).

| Destination | Specs | Contents |
|---|---:|---|
| `features/media-tags/` | 41 | `core-tag-*` (11, from `tests/frontend/core/`) and `features-{awards,custom,logo,people,language-display,genre-styles,quality-*,rating-sources,series-quality-aggregation,source-edition,status-tags*,tag-*,technical-quality,media-tags-*}` (30) |
| `features/media-tags/admin/` | 13 + 2 JSON | `admin-tags-{review,rewrite}`, `features-admin-tags-*`, `features-admin-config-media-tags-{isolation,tab}`; `admin-tags-rewrite.declarations.json` and `features-admin-tags-page.old-form-fields.json` moved with their readers |
| `features/details-providers/` | 6 | `features-details-*`, `-media-info`, `-random`, `-release-dates` |
| `features/player/` | 6 | `features-{autoskip,pause,playback,subtitles,player-*}` |
| `features/spoiler-guard/` | 5 | `features-spoiler*`, `features-seerr-spoiler-guard` |
| `features/bookmarks/` | 4 | `features-bookmark*` |
| `features/hidden-content/` | 3 | `features-hidden*` |
| `features/settings-panel/` | 2 | `settings-panel-{rewrite,boundaries}` |
| `features/downloads/` | 1 | `features-requests` (it loads `js/arr/requests/requests-page-render-helpers.js` ← `features/downloads/`) |
| `admin/config/` | 3 | `admin-config-rewrite`, `features-admin-config-schema`, `features-config-flag-check` (`scripts/generate_config_flag_groups.py`, the config page's flag groups) |

- **Not classified:** `features-api-routes-docs.test.mjs` checks `docs/advanced/api.md` against the production inventory. It belongs to no feature, so it stays in `tests/frontend/features/`. PLAN.md's prerequisite block names it at that path.
- `bootstrap/`, `pages/`, `chrome/`, `regressions/`, `contracts/`, `requests/` and `helpers/` are unchanged, and so are the other `core/` specs.

**Paths.** 142 added lines in total:
- **Helper and contracts imports (102):** one `../` was added to each, or two for `media-tags/admin/`.
- **Repo-relative reads (32):**
  - `new URL('../../(../)…')` reads of `js/locales/en.json`, `component-scripts.json`, `scripts/*.py`, `Assets/…`, `docs/…` and `tests/fixtures/*.json`;
  - the static `scripts/tag-translation-coverage.mjs` import;
  - the `join(here, '..', …)` segment form (isolation);
  - the `join(dirname(fileURLToPath(import.meta.url)), '..', …)` form in `features-admin-config-schema.test.mjs:8`. The plan's `rg` pattern misses this one because `[^)]*` stops at `import.meta.url)`, so it was found with a wider search.
- **Left unchanged:**
  - `join(root, '..', 'client', …)` in the same file, which is relative to the plugin folder, not the test;
  - `${jsRoot}` and `resolve(jsRoot, …)` reads;
  - cwd-relative reads;
  - literal test data: `'../etc/passwd'`, `'a/../b'`, `'../../user-settings/…'`.
- A script resolved every relative `from`, `import()` and `new URL()` specifier in the moved files against its new folder. None was missing.
- `tests/frontend/helpers/admin-tags-page.mjs:161` now reads `../features/media-tags/admin/features-admin-tags-page.old-form-fields.json`.
- `tests/frontend/README.md`: the layout sentence names `features/<feature>/` and `admin/config/`.

**Mutation tooling.**
- `tests/runner/mutations.py`: the default `test_file` (L87, L120) is now `tests/frontend/features/hidden-content/features-hidden.test.mjs`, and the frontend `CASES` entry gets that path as an explicit `test_file`.
- `tests/history/recent-mutations.json`: the bookmarks case's `test_file` was rewritten in place. No path map was used.
- No mutation anchor (`before`) changed in F1 or C4.

**Gate:** `scripts/restructure-gates.sh fe` passed.
- `npm test`: total **3787**, passed 3778, failed 9. That equals the step-8 count, with the same 9 baselined failures.
- TOOL passed: `tooling` ran 16 tests OK, and the mutation/history path check passed.

**Prose that still names old test paths.** None of these is read by a test or by the tooling. They are left for step Z's stale-path sweep (frontend.md §4, last row):
- `docs/rewrite/{admin-tags,admin-config,bookmarks,details-providers,player,settings-panel,spoiler-guard,tag-runtime}.md`;
- `docs/rewrite/bug-ledger.json`;
- `docs/advanced/{admin-media-tags,project-structure}.md`;
- `tests/docs/{coverage-matrix,history-middle,history-recent}.md`;
- `tests/history/early-triage.json` (a triage record, not a mutation file);
- `tests/fixtures/admin-tags-page-fields.json` `_source`;
- the feature READMEs' "Tests" commands;
- comments in `client/src/admin/config/sections-entry.ts` and `client/src/features/media-tags/admin/sections/*.ts`, plus the built `admin-tags.css` comment. Editing these would change built output, so they were not touched.

## C4: per-violation resolutions

These are the 34 entries of `boundary-baseline.json` at `2abd5e3d` ([step8-c3-merge.md](step8-c3-merge.md)). "Same read" means the value and the moment of the read are unchanged. The built JS was diffed after each commit (non-comment lines only) to confirm it.

**Facades (`615a6466`), 6 entries**

| Entry | Resolution |
|---|---|
| `seerr/details/moreinfo/actions-entry.ts` `internals spoilerGuard` | spoiler-guard's `JE.spoilerBlur` (index.ts) gains three getters: `appendSeerrToggle`, `buildSettingsHtml` and `wireSettings`. Each returns `ctx.own.spoilerGuard?.<member>` on every access, which is the same registry read as before. seerr calls `seerrDetailsContext(JE).peer('spoilerBlur')?.appendSeerrToggle?.(…)`. The stub at `pages-seerr-details-moreinfo.test.mjs:361` is now `h.JE.spoilerBlur = { appendSeerrToggle }`. |
| `settings-panel/ui-panel-template.ts` `internals spoilerGuard` | `featureCtx.peer('spoilerBlur')?.buildSettingsHtml?.(ctx)` |
| `settings-panel/ui-panel.ts` `internals spoilerGuard` | `featureCtx.peer('spoilerBlur')?.wireSettings?.(ctx)`. `installUiPanel` takes `featureCtx = settingsPanelContext(JE)`, the default-parameter pattern from c3a. |
| `settings-panel/ui-panel-shortcut-editor.ts` `internals canonicalCombo` | chrome's events-entry also publishes the same function as `JE.canonicalCombo`, right after setting its internals slot. Nothing else writes either. The editor reads `featureCtx.peer('canonicalCombo') \|\| identity` at call time, as before. |
| `media-tags/editor/tag-item-menu.ts` `internals features` | hidden-content publishes `JE.homeRemoval` from features-remove-home.ts, on the line after it sets `internals.features.buildNativeActionSheetItem`, so the two always coexist (the open question in c3a item 2). `homeRemovalFacade()` in hidden-content/host.ts has a getter that returns `JE.internals?.features?.buildNativeActionSheetItem`, the menu's old expression. The menu reads `mediaTagsContext(JE).peer('homeRemoval')?.buildNativeActionSheetItem`. `JE.hiddenContent` was not used for this, because hidden-content-init publishes it only inside `initializeHiddenContent()`. |
| `details-providers/details-page.ts` `internals *` | peopletags.ts now runs `ctx.own.peopleTags = JE.peopleTags = { prefetch, leave }`: one statement, so the facade and the slot always hold the same object. The line count stays at its 1123 size-baseline. details-page reads `ctx.peer('peopleTags')` at its three sites. Its load-time `JE.internals ??= {}` is kept as `void ctx.own.features` (`internalsObject` is `holder.internals ??= {}`). The stub in `features-details-prefetch.test.mjs` moves from `internals.peopleTags` to `peopleTags`. |

**D1 (`8b3fee08`), 10 entries**
- `internals-owners.json`: `enhancedUi` is `["settings-panel", "media-tags", "hidden-content"]`. The reason is recorded in its `_comment`, in frontend.md §2.4 rule 3 and in CHANGELOG row LC-a. No other slot or rule changed.
- **The 6 panel imports of `settings-panel/host.ts`:**
  - `media-tags/settings/ui-panel-{media-tags,tag-editor,tag-looks,tag-portable,tag-preview}.ts` and `hidden-content/settings/ui-panel-hidden-content.ts` now import from their own new `settings/host.ts`.
  - `media-tags/settings/host.ts` has `panelHost`, `registry`, `apiClient`, `optionalApiClient` and `currentUserKey`. `hidden-content/settings/host.ts` has `panelHost` and `registry`.
  - The function bodies and error texts are identical to settings-panel/host.ts.
  - The bridge types come type-only through `settings-panel/public-api.ts`, which re-exports `CustomTagRule`, `HiddenContentSettingKey`, `PanelApiClient`, `PanelBridge`, `PanelTagLayout`, `PluginConfig` and `Settings`.
  - The 6 panel outputs differ only in their `// client/src/` comment lines.
- **The 4 reads:** `admin/page.ts`, `admin/sections/layout.ts`, `admin/sections/portable.ts` and `editor/tag-item-editor.ts`.
  - Each `JE.internals?.enhancedUi?.X` became `settingsUi(JE)?.X`.
  - `settingsUi()` is in media-tags/host.ts and returns `JE.internals?.enhancedUi`; admin/host.ts re-exports it.
  - The import was added to existing import lines, so the size-baselined `page.ts` (867) and `tag-item-editor.ts` (1053) kept their line counts.
  - In `layout.js` the bundle now places the admin host helpers after `settingsUi`. They are all hoisted function and `var` definitions that run before any section code.

**D2 (`6560a6d6`), 5 entries**
- **`host/bootstrap-pages-host.ts`, 3 `host-import`s.** The three imports were replaced with local structural types:
  - `CalendarPageFacade`: `injectStyles`, `loadSettings`, `renderPage`, `refresh` and `handleEventClick`, with the owner's signatures;
  - `DownloadsPageFacade`, plus a `DownloadsPageState` with the 3 state fields the page reads and writes;
  - `RecommendationsPageFacade`.
  - Types only: the 7 plugin-page HTML files differ only in their inline source maps.
- **`admin/config/page/media-tags-tab.ts`, `internals *` and `internals enhancedUi`.** This is the facade read that was proposed, and it was implemented because it is forwarding-only.
  - media-tags publishes `JE.mediaTagsSettingsUi = { get registry() { return settingsUi(bridge); } }` from `core/tag-layout.js`, the statement before `bridge.core.tagLayout = layout`.
  - The readiness check now reads `je.core.tagLayout && je.mediaTagsSettingsUi && je.mediaTagsSettingsUi.registry`. The old check was `… && je.internals && je.internals.enhancedUi`.
  - The check already requires `core.tagLayout`, and the same entry publishes that just after the facade, so whenever the old check could pass the facade exists and returns the same value.
  - No rule was widened: the `.internals` read sits in a media-tags host file and is legal under D1.
  - Typed in `media-tags/public-api.ts` (`MediaTagsSettingsUiFacade`) and structurally in `host/admin-config-host.ts`, because rule 2 bars host/ from importing features/.
  - One unit stub followed the read: `features-admin-tags-page-overview-layout.test.mjs:298` (`internals: { enhancedUi: {} }` became `mediaTagsSettingsUi: { registry: {} }`). Every other harness loads the real `core/tag-layout.js`.

**Strict flip (`bfb0b643`), the last 13 entries**
- The 13 entries were the raw-global `JellyfinEnhanced` reads in `host/{admin-config,api,bootstrap-pages(3),core,dom(2),navigation,session,ui(2)}-host.ts` and `core/lifecycle-entry.ts`.
- `scan.mjs` `PLATFORM_GLOBAL_FILES` lists exactly those 9 files, and `bridgeViolations` adds them to `globalAllowed`. The rule-4 comment was updated.
- `boundary-baseline.json` was deleted. `feature-boundaries.test.mjs` now fails on any rule 1–4 violation, and the `ratchet`/`compareCounts` use was removed. It has the same 6 tests, so the `npm test` count is unchanged.
- **Negative check:** a throwaway `features/chrome/zz-c4-probe.ts` with a runtime import of `bookmarks/bookmarks.ts` and an `internals.spoilerGuard` read made both strict tests fail. The probe was deleted before the gate ran.

| tree | files | violations |
|---|---:|---:|
| `2abd5e3d` (step 8) | 26 | 34 |
| `615a6466` | 20 | 28 |
| `8b3fee08` | 10 | 18 |
| `6560a6d6` | 9 | 13 |
| `bfb0b643` | file deleted, strict | 0 |

No baseline entry was added and no count was raised. `size-baseline.json` is unchanged.

## Gates

**FE: `scripts/restructure-gates.sh fe`, run on every commit's tree (not on the log commit).**
- Every final run exited 0 and printed `restructure-gates: fe passed`. That covers G, INV (`generate.py --check` and the route list), TOOL, client-build tests, the bootstrap manifest, the `npm test` ratchet, the architecture tests, and `component-scripts.json` plus the `client/entries` keys compared with `restructure-base`.
- `npm test` was `total 3787, passed 3778, failed 9 (baseline list 9)` each time.
- On `615a6466`, the first run failed once: `tests/frontend/core/core-api-runtime.test.mjs :: retry jitter and clamping use the configured bounded exponential schedule` recorded `[7, 100, 14, 14]` where `[7, 14, 14]` was expected, while the machine's load average was about 25.
  - That spec loads only `core/api-client.js`, which no commit here touches.
  - It passed 5 of 5 times in isolation, and the full gate rerun passed.
  - This is recorded as a load-sensitive test flake, not fixed.
  - Repro: run `npm test` under heavy CPU load. The spec's `setTimeout` spy sometimes sees an extra 100 ms timer.
- Targeted runs during C4 (spoiler-guard, settings-panel, the seerr more-info page, details-providers, chrome, hidden-content, media-tags people tags, admin and panels, pages, admin config, the tag bootstrap specs and the architecture tests) showed only the 3 baselined `bootstrap-media-tags-portable` failures.

**BROWSER: one run on the final tree `bfb0b643`, with `JE_BROWSER_PORT=4195 npm run test:browser -- --workers=6` (693 tests).**

| tree | passed | failed | skipped | time | vs step6-browser-failures.txt (52) |
|---|---:|---:|---:|---|---|
| `bfb0b643` | 638 | 52 | 3 | 8.8 min | identical: 0 new, 0 listed-but-passed |

- **PASS.** The comparison takes the sorted `[project] › file:line › title` lines from the "52 failed" block, strips leading and trailing whitespace, and runs `comm` against the list. No rerun was needed.
- The known flakes `discovery-recommendations-rewrite.spec.cjs:70` and `tag-fit-monotonic.spec.cjs:93` passed in all projects.
- Process: `setsid` forked, as in step 8. The detached run was process group `3105545` (bash), with npm and playwright under it. It was waited on with `tail --pid` until it exited by itself. Nothing was killed and no `pkill` was used. Port 4195 was free afterwards. The load average was about 9 at the start.

## Product bugs

None were fixed, and the lane showed no new product symptom. The 52 BROWSER failures are the step-6 set ([step8-c3-merge.md](step8-c3-merge.md) "Product bugs" lists their symptoms). The `core-api-runtime` retry-schedule failure is recorded under Gates as a load-sensitive test flake.

## Deviations

1. **F1 placement of non-feature specs.**
   - The plan's `admin-config-* → admin-config/ (… keep under tests/frontend/admin/)` was read as `tests/frontend/admin/config/`, which mirrors `client/src/admin/config/`.
   - `features-config-flag-check` went there as well.
   - `features-admin-config-media-tags-{isolation,tab}` went to `features/media-tags/admin/`. The plan places the isolation spec's JSON there, and the tab spec is its pair.
   - `features-api-routes-docs` stayed where it was (see F1).
2. **F1 prose paths** are left for step Z (list in F1). `tests/frontend/README.md`'s layout sentence was updated.
3. **New runtime properties on `window.JellyfinEnhanced`:**
   - `spoilerBlur.{appendSeerrToggle,buildSettingsHtml,wireSettings}` (getters);
   - `canonicalCombo`;
   - `homeRemoval`;
   - `peopleTags`;
   - `mediaTagsSettingsUi`.
   - Existing names and objects are unchanged. No test enumerates JE's keys. The owners' READMEs list the new facades.
4. **Two test stubs not named in the brief follow their facade read**, the same kind of change as the brief's moreinfo stub: `features-details-prefetch.test.mjs` (`peopleTags`) and `features-admin-tags-page-overview-layout.test.mjs` (`mediaTagsSettingsUi`). No assertion changed.
5. **Some peers are typed structurally on the consumer side** (C3 convention): settings-panel's `spoilerBlur` and `canonicalCombo`, and details-providers' `peopleTags`. The owners' types do not fit their call sites under `exactOptionalPropertyTypes` (`SettingsContext` needs `presetBoxBackground: string`, and `prefetch` takes a `JsonRecord`). seerr types `spoilerBlur` from `spoiler-guard/public-api.ts` (`SpoilerBlurPeerApi`). hidden-content's `HomeRemovalFacade` and media-tags' `MediaTagsSettingsUiFacade` are exported from their owners' public-api.ts.
6. **Duplicated panel-bridge code.** `media-tags/settings/host.ts` and `hidden-content/settings/host.ts` repeat 2–5 small functions from `settings-panel/host.ts`. A shared copy in `features/shared/` would have needed `shared` as a fourth `enhancedUi` owner, which D1 rules out. hidden-content's panel does not use `hidden-content/host.ts`, because that file throws at load without `ApiClient`.
7. **chrome's `canonicalCombo` facade holds the same function, not a forwarding getter.** `EventsOwn` is one flat namespace, so a facade with the same name as the internals slot would throw `Cannot redefine property` (c3b follow-up). It is written through `ctx.core`, and only events-entry writes either one.
8. **FE ran per commit**, so each C4 commit is a green fallback point. The brief requires it on the final tree only.
9. **BROWSER ran detached**, because `setsid` forks. It was tracked by process group and waited on before anything else ran in this checkout.
10. **The git identity was set per command**, as described under Commits.
