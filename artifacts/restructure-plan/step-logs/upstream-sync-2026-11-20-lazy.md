# Upstream sync, 2026-11-20: `abcaa16d` (lazy feature bundles and cheaper tags), by the maintainer's decision

Branch `sync/lazy-abcaa16d`, from the main line `restructure/integration` (started at `26e472da`, rebased onto
`1651839c` once the port of upstream 1de354c0 had landed). Ledger entry 94 had been deferred by
[`upstream-sync-2026-11-19-2210.md`](upstream-sync-2026-11-19-2210.md). The maintainer's delegate decided on
2026-11-20: upstream's shape (`g` on `bundle.js` and `bundle.js.map`, `ComponentGroups` in the bootstrap), the two
route-auth snapshot lines approved, the painter `tags/status-tag-backdrop.js` approved as a new component output at
upstream's place, a groups file written for this tree's module list, budgets measured on this tree.

## Commits

| Commit | Part |
|---|---|
| `feat(platform): component groups, served through bundle.js?g= and listed in the bootstrap` | `js/component-groups.json`, `ClientScriptBundle` groups, the `g` parameter on both routes, `ComponentGroups` typed in `Transport/BootstrapResponse.cs`, contracts, `ApiBundleGroupTests` (upstream's 18) and the group cases of `BundleServingTests` |
| `contract: upstream abcaa16d, the g query parameter on bundle.js and bundle.js.map` | the two approved snapshot lines, by hand |
| `chore(gates): gate FE G allows the component modules the maintainer approved, and only those` | `scripts/component-outputs-approved.json`, `scripts/check-component-outputs.mjs` and its test, AGENTS.md, CONTRIBUTING, PLAN.md, frontend.md, `client/entries/README.md` |
| `perf: the header tray, the splash, the pause screen and the body observer do less on every page` | chrome, player, shared, host |
| `perf(media-tags): the tag pipeline, the stored cache, direct play and the schedule observer do less while a page scrolls` | pipeline, cache store, direct play (`card-watch.ts`, `playback-request.ts`), status (`series-watch.ts`) |
| `build(client): a shared module is read from its provider only where the provider's group has run` | `scripts/client-build.mjs`, `scripts/client/shared-modules.mjs` and their test |
| `perf(media-tags): resting cards lay their tags out in flow, and group containers sit on whole pixels without containment` | the tag layout (`layout/flow*.ts`, `live.ts`, `snap*.ts`, `fonts-refit.ts` and their integration), styles, upstream's layout tests and browser specs, css-customization.md |
| `perf(platform): a page loads only the component groups it needs, and the rest on demand` | the loader (`client/src/bootstrap/loader/group-*.ts`, `features.ts`), bookmark key, item editor, loader tests, docs |
| `perf(media-tags): the status tags' blurred backdrop is a picture painted under each tag, loaded on demand` | the painter (`types/status/backdrop/`), its request (`types/status/status-backdrop-request.ts`), the approved output, the `tag-status-backdrop` group, README load positions, size entry of statustags.ts lowered 1454 → 1451, tags-server.md |
| `test(media-tags): the tag-looks spec reads chip boxes once the whole-pixel pass has settled` | spec only |
| `fix(media-tags): chips beside a dimmed language flag keep their paint order in a browser without :has()` | `languagetags.ts` and a test |
| `fix(media-tags): stored direct-play answers reach the cards on screen in a browser without WeakRef` | `tag-direct-play.ts` `prime()` and a test |
| `test(client): a budget for what a cold Home load runs under the component-group loader` | `scripts/bundle-budgets.{json,mjs}`, the budget test and helper |
| `chore(budget): room in the bundle and assembly budgets for the port of upstream abcaa16d` | `client/bundle-budget.json`, `client/assembly-budget.json` |
| `docs(sync): upstream abcaa16d ported, by the maintainer's decision of 2026-11-20` | the ledger |
| `docs(sync): step log and evidence for upstream abcaa16d` | this log and its evidence |

## Decisions and differences from upstream

- **Groups file.** This tree's 183 component modules are a subset of upstream's 196 in the same order. Upstream-only
  modules are folded into outputs here and stay folded: `osd-playback` (in `playback.js`, group player),
  `subtitle-sync` (in `auto-skip.js`, player), the nine discovery modules (in `discovery-filter-utils.js`, seerr),
  `maintainerr-item-menu`, `leavingsoon-page` and `leavingsoon-custom-tab` (in `tags/tag-item-menu.js`, tags). The only
  host whose group differs from its folded modules' groups is `tags/tag-item-menu.js` (upstream: tags; its folded
  modules: removal-menu and leavingsoon-page). It stays in `tags`, and the `tags` rule loads wherever upstream loads
  any of the three: with poster tags on, at boot when the server offers Maintainerr actions or removal requests, and by
  the Leaving Soon page rule. Upstream's groups `removal-menu` and `leavingsoon-page` therefore do not exist here;
  every other group keeps upstream's id, note, `after` and module order.
- **Shared modules** (this tree only, `client/shared-modules.json`): 18 load-time reads crossed upstream's groups (a
  stub throws when its provider has not run). Moving providers into core broke upstream-style tests that load a
  script alone, so instead the build stubs a shared module only for a script whose group always loads the provider's
  (core, its own, or a group it is `after`); any other script bundles its own copy (stateless modules: the copies
  behave the same). Upstream's `after` relations stay unchanged. Cost on the whole bundle: about 11 KB raw.
- **Home tab order.** The loader registers JE's Home tabs in upstream's order. Only the whole manifest as one bundle
  (no usable groups file) keeps this tree's older order with Leaving Soon before Requests, Calendar and Activity; filed
  as a found bug, not fixed here.
- **Direct play** adds its `visibilitychange`/`online` listeners while cards are tracked and removes them in a reset
  (upstream adds them once), so the leak guard gets no new entry. The series observer is still constructed in
  `statustags.ts`, so the guards' recorded entries keep their keys. Stored answers that arrive after the cards were
  drawn go to the watched cards and to the cards on screen: upstream goes through the watched cards only, which are
  held through WeakRef, so in a browser without it (older TV browsers) the cards on screen are not badged and every
  item the store answered is asked about again (found by the second port and filed there as a found bug; this
  branch's earlier commits had copied it; the new test failed before the fix).
- **Language chips** beside a dimmed partial flag stay positioned in a browser without `:has()` too (found by the
  second port; this tree restates its `:has()` rules, upstream has no fallback).
- **Specs.** `tag-whole-pixels.spec.cjs` flaked 1 in 3 under load on this port and on upstream's own built files: its
  containment step added the style sheet after drawing, and a later re-ask correctly keeps contained cards
  positioned, so the wait for every card in flow never ended. Fixed in the spec (the sheet before re-presenting, then
  a wait for the layout the CSS gives); 4 full runs 35/35 under the same load; filed as a found bug (upstream's spec
  has it too). `tag-kind-looks.spec.cjs` (rewrite only) settles the whole-pixel pass before reading chip boxes (found
  by the second port: 4 of 10 runs failed beside busy loops there, 0 of 10 after).
- **Painter.** Upstream's one file is split into modules under `types/status/backdrop/` (blur, css-values, state,
  read, draw, painter, entry) for the 800-line cap. The status tags' request for it and its CSS rule live in
  `types/status/status-backdrop-request.ts` so `statustags.ts` stays within its ratchet (now 1451, entry lowered). The
  preview's sample status tag keeps the live blur, as upstream (one CSS line, written so
  `ui-panel-tag-preview.ts` stays at its cap). Leak guard L3 did not see `card.art = card.art || new
  MutationObserver(…)` as disconnected; written as `if (!card.art) card.art = …` (same behaviour).
- **Budgets.** `scripts/bundle-budgets.json` is measured on this tree by upstream's rule (measured plus about 3%,
  bytes up to the next thousand, modules up to the next whole one; all features on at most 45% of the manifest). The
  three scenarios ask for exactly upstream's groups and module counts (71, 32, 52); bytes are those of the minified
  twins served here (all features on 980,676 raw / 282,663 gzip-9; defaults 389,929 / 107,318; tags only 857,303 /
  243,501). The whole bundle served without `g` grows by 77,804 raw / 28,368 gzip-9 bytes (2,671,672 / 729,898 on
  the base, 2,749,476 / 758,266 with the port, BundleBudgetTests' own measure) and the assembly by 265,379 embedded
  bytes (PackedResourcesTests: 12,072,376 → 12,337,755); both limits rise by exactly that in history entries, as
  every sync on the main line does. The sync coordinator confirmed this is not a raised ratchet in the brief's sense.
- **Docs** written for this tree's paths: CONTRIBUTING (step 4, where a new module goes), project-structure
  ("Component groups", the painter's file row), admin-media-tags, troubleshooting, api, css-customization,
  tags-server, frontend-build, bootstrap-pages.
- **Second port.** A second, independent port of this commit was made on the same machine at the same time. Its loader
  sources and tests were the starting point of this branch's loader (adapted to this groups file and its tests); its
  language-flag fallback and tag-looks spec fix were taken with their tests. Not taken: its direct addition of the
  painter without the approved list, its `item-menu` group, its `after: details` on the seven details groups, and its
  budgets inside `client/bundle-budget.json`.

## Proof

- Upstream's tests, paths mapped to this tree, applied before any client port: 170 node tests failed
  (`upstream-sync-evidence/p94-lazy-tests-before.txt`). The contract test failed with exactly the two lines before
  their commit and passes after (`p94-lazy-contract-before.txt`, `p94-lazy-contract-after.txt`).
- Upstream's painter test (31 tests) and the loader's painter case: failed with the painter's files taken out of the
  tree, pass with them (both recorded with je12 evidence). The language fallback test failed before its fix.
- `je12 test --dotnet` before the WeakRef fix: node 3713 passed, dotnet 2193 passed, 0 failed. The WeakRef test
  failed before its fix and passes after; its file passes whole (111).

## Lab (Jellyfin 12.4, `je12 up --image jellyfin/jellyfin:12.4`, both builds on one lab)

Upstream's build installed with `scripts/upstream_lab_deploy.py abcaa16d` (`before`), this branch with `je12 deploy`
(`after`, the tree before the WeakRef fix, which changes only the stored-answer pass of direct play, off in this lab). Outputs: `upstream-sync-evidence/p94-lazy-lab-pairs.txt`; scripts `p94-lazy-{lib,requests,backdrop,layout}.mjs`.
Status tags were switched on for the lab administrator (and back off before the smoke). The lab's library lists
artwork whose files are missing (404), so at first neither build had artwork to blur (both kept the live filter on
all eight status tags, with the same pixels); `p94-lazy-artwork.setup.mjs` uploaded a generated poster to the eight
status-tagged series (`p94-lazy-artwork.setup.txt`), and the pairs were recorded after that.

- **Bundle requests** (`requests`): identical groups on both builds at every step. Cold Home: `core,tags,spoiler-guard,
  player-badge,hidden-content,hidden-content-page,bookmarks,bookmarks-library,seerr-api,seerr,recommendations,
  arr-links,requests-page,calendar-page,theme-selector,active-streams`, then `tag-status-backdrop` alone; details
  page: `tag-people,details,elsewhere,reviews,awards,mdblist,arr-tag-links,letterboxd`; first video: `player` (it
  played, the OSD rating showed); back to Home: nothing; settings panel: `tag-direct-play,tag-poster-colours,
  settings`. Bytes: upstream 3,701,694 / 96,484 / 367,977 / 262,881 / 705,315; here 1,939,361 / 28,883 / 155,339 /
  107,316 / 411,100 (minified twins). Both builds log the same `PAGEERROR Error: [object Response]` in this run.
- **Status-tag backdrop** (`backdrop`): identical. 8 status tags; 5 with their artwork in view painted (painter: 5
  decodes, 5 drawn, 0 failed), 3 below with lazy artwork keep the live filter; the four tags in view have the same
  pixels on both builds (sha256 of each tag's box); a card under the pointer takes the live filter back
  (`data-je-blur`, `blur(6px)`) and its picture returns once the pointer has gone.
- **Tag layout** (`layout`): identical. 32 tagged cards, 27 resting in flow, 0 of 135 group containers with layout
  containment, 0 of 333 chips with a transform; a resting card is `grid` with static slots and genre names hidden,
  under the pointer `block`, live, absolute slots with names shown, and back after.
- The `after` side of `backdrop` printed `STORM 26x POST …/tag-data/<user>`. Counted on three builds in turn
  (`p94-lazy-tag-data-posts.txt`): 13–24 here, 14–26 on the main line before the port, 13–25 on upstream: timing, not
  the port.
- `je12 smoke`: pass (0 failing, 0 new log kinds); `restructure-gates.sh bundle` on the served `bundle.js`: pass.
  `je12 down`: no packets to the live server or outside the lab network.

## Gate

`je12 gate final` on `02dabf70` (the branch with this log's first version; this edit adds only this paragraph), on the
primary worker, `all` and `browser` side by side at load 0.9: PASS on the first run, no rerun. `all` 2.6 min: dotnet
3785 passed of 3785, npm 4582 passed of 4582, 0 failed, checks (INV, TOOL, the contract snapshot, gate FE G with the
approved addition, budgets) passed. `browser` 5.0 min: 813 tests, 782 passed, 0 failed, 31 skipped.

## Found bugs filed

(Filed with `je12 found-bug`; the first, third and fourth by the second port.)

- The whole manifest as one bundle registers the Leaving Soon Home tab before Requests, Calendar and Activity.
- `tag-whole-pixels.spec.cjs` (upstream's too) adds its containment sheet after drawing and can wait forever under
  load (fixed in the spec here).
- Upstream's direct play does not pass stored answers to the cards on screen in a browser without WeakRef (fixed
  here).
- Upstream's two new `:has()` rules have no fallback for browsers without `:has()` (both restated here).
