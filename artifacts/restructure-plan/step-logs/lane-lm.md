# Lane L-M log: lanes L-C, L-D and L-B merged; E1 decision (a) (2026-11-09)

Plan: [PLAN.md](../PLAN.md) gates BE/FE (`all`), INV, TOOL and BROWSER. Inputs: [lane-lc.md](lane-lc.md) (F1, C4), [lane-ld.md](lane-ld.md) (E1 partial, step-12 prep) and [lane-lb.md](lane-lb.md) (S3 DetailsProviders and MediaTags partials), plus the coordinator's E1 decision: option (a) from lane-ld.md.

Machine: a JE worker on Alex's laptop (user `jebench`, shared with lane L-G in the sibling clone `je-restructure-lc` and with other jobs). Checkout: `/var/lib/jebench/projects/je-restructure-ld`, branch `restructure/lanes-merged`, created from `origin/restructure/integration-s8` = `2abd5e3d`. Node v26.13.0, dotnet 10.0.401. `dotnet restore` ran once, for the plugin and the tests, with `-p:JellyfinTarget=jf12`. No other folder, job or process was touched. No containers were started.

Git identity: the identity of the earlier restructure commits (`Jake <45441845+4eh5xitv6787h645ebv@users.noreply.github.com>`), set per command through `GIT_AUTHOR_*` and `GIT_COMMITTER_*`. The git config was not changed. There are no attribution trailers.

## Commits

| SHA | Commit |
|---|---|
| `5f62f21f` | `merge: restructure lane L-C (F1, C4)`: `origin/restructure/fe-f1-c4` at `c15156fd`; no conflicts |
| `4906c298` | `merge: restructure lane L-D (E1 partial, step-12 prep)`: `origin/restructure/fe-e1-s12prep` at `aa3988cc`; conflicts below |
| `2fe12653` | `merge: restructure lane L-B (S3 DetailsProviders and MediaTags controller partials)`: `origin/restructure/be-s3-splits` at `762f81c5`; no conflicts |
| `067b0d3d` | `chore(client): E1 reclassify hand-written tag tables (coordinator decision a)` |
| (this commit) | `docs(restructure): lane L-M log` |

All three merges used `--no-ff`. All three lane logs (`lane-lc.md`, `lane-ld.md`, `lane-lb.md`) are kept unchanged.

## Conflicts and how they were resolved

**L-C merge (`5f62f21f`):** clean. C4's deletion of `tests/frontend/architecture/boundary-baseline.json` is in the merged tree, and nothing re-added it.

**L-D merge (`4906c298`):**
1. **Textual conflicts, generated outputs only:** `Jellyfin.Plugin.JellyfinEnhanced/js/tags/genretags.js.map` and `client/generated-manifest.json`. Neither file was hand-merged. Either side was checked out, then `npm run client:build` regenerated both from the merged sources (genre-table.ts from L-D, plus C4's sources). After that, `client:check`, `inventory:rewrite:check` and `tests/inventory/generate.py --check` all passed, and no other file changed.
2. **Semantic conflict: L-D's feature map and parity test against F1's test moves.** These merged without a textual conflict, but `feature-map.test.mjs` went from `todo` to enforced once F1's folders existed, and then it failed. L-D had mapped `tests/frontend/features/<f>` for activity, calendar, catchup, seerr, settings and shared, and F1 created none of those six folders. F1 kept those tests in its cross-cutting folders (lane-lc.md F1 table; it matches each feature README's "Tests" command). The fix makes the map, its test and CONTRIBUTING match the merged tree:
   - `docs/feature-map.json`:
     - activity, calendar and catchup → `tests/frontend/pages`;
     - seerr → `tests/frontend/requests` and `tests/frontend/pages`;
     - settings → `tests/frontend/bootstrap`;
     - shared → `tests/frontend/core`.
     - Each of these rows gets a `notes` line naming the specs. The `$comment` line about `tests.frontend` now describes the result after F1.
     - Admin keeps `tests/frontend/admin`. F1 created `tests/frontend/admin/config/` under it.
   - `tests/frontend/architecture/feature-map.test.mjs`: the `isF1Target`/`f1Pending` todo branch was removed, since F1 is merged. It became two unconditional tests: "every frontend test folder in the map exists" and "tests/frontend/features/* has no unmapped folder". The test count stays at 7.
     - Negative check: a throwaway empty `tests/frontend/features/zzprobe/` made the second test fail. It was removed afterwards.
   - `CONTRIBUTING.md` "Where things live": the 6 rows were re-rendered from `whereThingsLiveRows()`.
   - Everything else from both sides merged cleanly and was kept: `scan.mjs` (C4's strict rule 4 plus L-D's map helpers), `.gitattributes`, the media-tags README, `package.json` (`verify:restructure`) and the bug-ledger path sweep.

**L-B merge (`2fe12653`):** clean. L-B's regenerated `tests/docs/production-inventory.json` did not conflict, because L-C and L-D do not touch it, and `generate.py --check` passed on the merge.

**Architecture baselines:** no entry was added and no count was raised in any merge or commit. `boundary-baseline.json` stays deleted. `size-baseline.json` is unchanged. `generated-markers-baseline.json` was deleted by E1 (below). `git diff 2abd5e3d HEAD -- tests/backend/Architecture artifacts/restructure-plan/baselines` is empty.

## E1: coordinator decision (a) (`067b0d3d`)

- **Reclassified as hand-written source-of-truth tables:**
  - `types/awards/awards-data.ts`, `types/ratings/rating-data.ts` and `types/language/media-language.ts`. None has a generator; `scripts/build_poster_assets.py` only reads them.
  - `types/quality/quality-data.ts`, which is hand-written except for the aspect-ratio region that `scripts/generate_technical_ratios.py` rewrites between its in-body markers.
- `tests/frontend/architecture/scan.mjs`: the four files were removed from `GENERATED_SOURCES`, and a comment there gives the reason. `GENERATED_SOURCES` is now contracts `generated.ts` and `schema.ts`, `status-vocabulary.ts`, `compact-quality.ts`, `per-user-props.ts` and `genre-table.ts`.
- `client/src/features/media-tags/README.md`: the four files were removed from "Generated files here". A sentence below the list names them as hand-written. `feature-readme.test.mjs` checks the list against `GENERATED_SOURCES` and passes.
- **No generated marker is claimed for the four files.** None has a `Generated by` file header: the first comment of each is prose or a type, and the "no unlisted client/src file carries a generated header" test passes. `git check-attr` shows `linguist-generated: unspecified` for all four. quality-data.ts keeps its in-body region marker (`// Generated by scripts/generate_technical_ratios.py; edit TechnicalQualityRules.cs.` … `// End generated aspect ratios.`). `generatedHeader()` does not count that region marker as a file header. The four files stay under the max-lines guardrail, and `media-language.ts` keeps its 903-line `size-baseline.json` entry.
- **The remaining E1 parts this decision unblocked are done.** With the last four gaps gone, `generated-markers-baseline.json` was deleted, and `generated-markers.test.mjs` is now strict. It has the same 4 tests: each listed source resolves exactly once; no header gap; no `linguist-generated` gap; no unlisted generated header. The ratchet, `compareCounts` and the "fixed, remove it" diagnostic are gone.
  - Negative check: a throwaway re-listing of `awards-data.ts` made both strict tests fail, with `awards-data.ts: header` and `awards-data.ts: gitattributes`. It was reverted.
- **Not done (optional in option (a)):** splitting quality-data.ts's aspect table into its own fully generated module. It would change the bundle's module order, and the decision did not ask for it.
- **Recorded in:**
  - `CHANGELOG.md` rows LM-a (E1) and LM-b (feature map against F1);
  - `frontend.md`: the §1b "(GEN)" correction note, §5 item 3 (the `[UNVERIFIED]` note was replaced by the decision), and a "Done" note on the E1 brief.
- **Built output:** no `client/src` code changed. `client:check` passed and the tree stayed clean.

## Gates (on `067b0d3d`, the merged tree with E1)

Load average was below 2 at the start of each gate, so no wait was needed.

| Gate | Result |
|---|---|
| `env -u JE_UPDATE_SNAPSHOTS scripts/restructure-gates.sh all` | **PASS** on the first run, 6.6 min, `restructure-gates: all passed` |
| ↳ B | 1 warning, the baselined CS8604 `Features/Bookmarks/JeBookmarksController.cs(50,45)`; 0 errors |
| ↳ G | Passed 11/11 against the unchanged snapshots |
| ↳ T (dotnet test) | total 3193 (baseline 2980), passed 3192 (2979), failed 1 = the 1 baselined failure; coverage floors passed |
| ↳ F (npm test) | total **3794** (baseline 3745), passed 3785 (3736), failed 9 = the 9 baselined failures. 3794 = L-C's 3787 + L-D's 7 parity tests. |
| ↳ F rest / FE G | client-build tests, `contracts:check`, `client:check`, `inventory:rewrite:check`, typecheck and build, bootstrap manifest, and `component-scripts.json` plus the entry keys against restructure-base: all passed |
| ↳ snapshots | unchanged; the working tree was clean after the run (nothing regenerated) |
| `scripts/restructure-gates.sh inv` | **PASS** (`generate.py --check`, route list matches) |
| `scripts/restructure-gates.sh tool` | **PASS** (16 tooling tests; no new mutation-check line) |
| `h` | **Skipped.** It needs Node 26.2.0, and this machine has v26.13.0. The coordinator runs it on the Lenovo. |

No known flake fired. That includes `bootstrap-loader-rewrite` idle-slicing, the `core-api-runtime` retry timing test and `ApiSeerrProxyOutcomeTests.RealSocketWriteOnAReusedConnectionIsSentOnce`. No test was rerun, and no baseline was touched.

**BROWSER:** one run on `067b0d3d`, `JE_BROWSER_PORT=4196 npm run test:browser -- --workers=6`.

| passed | failed | skipped | time | compared with step6-browser-failures.txt (52) |
|---:|---:|---:|---|---|
| 638 | 52 | 3 | 11.1 min | identical: 0 new, 0 listed-but-passed |

- **PASS.** The comparison takes the "52 failed" block's lines, trims whitespace, sorts them and runs `comm` against the list, trimmed the same way. No rerun was needed. The known flakes `discovery-recommendations-rewrite.spec.cjs:70` and `tag-fit-monotonic.spec.cjs:93` did not fail.
- **Process:** BROWSER was started with `setsid` as process group `3151407` (bash → npm → playwright). It was waited on until no process in that group remained, and it exited by itself. Nothing was killed and no `pkill` was used. Port 4196 was free before and after.

## Product bugs

None were fixed, and this lane found no new symptom. The 52 BROWSER failures are the step-6 set (see [step8-c3-merge.md](step8-c3-merge.md), "Product bugs").

## What the Lenovo merge must still check

1. **H** (`scripts/restructure-gates.sh h`, Node 26.2.0) on the merged tree. It applies to L-B's MediaTags split (lane-lb.md) and to the poster-asset readers of the four tables E1 reclassified. Their content did not change.
2. **Feature-map entries that step 9 (S2.14 Seerr, S2.15 Platform) still changes.** The map names the planned layout, and these paths do not exist on this branch yet:
   - `seerr`: `controller: "JeSeerrController"` (with partials `.{Status,Discover,Requests,Users,Tmdb,Issues}.cs`) and backend tests `tests/backend/Features/Seerr`. Today `Features/Seerr/` has only `Models/`, `Services/` and `Tasks/`, and there is no `tests/backend/Features/Seerr`.
   - `platform`: `controller: "JePlatformController"` (the rest of `Controllers/JellyfinEnhancedController.cs`) and `tests/backend/Features/Platform`. Neither exists yet.
   - After the step-9 merge, fix any name step 9 chose differently in `docs/feature-map.json`. Run `node --test tests/frontend/architecture/feature-map.test.mjs` and paste the rows it prints into CONTRIBUTING's "Where things live". The frontend test does not check backend paths; the backend parity test (backend S3, not written yet) will.
   - If step 9 moves or adds frontend test folders (e.g. `tests/frontend/features/seerr/`), the "no unmapped folder" test will name them.
3. **Downloads controller split.** `Features/Downloads/JeDownloadsController.cs` is still 1,421 lines, over the 1,200 cap. Under D5 it is split into partials after step 9 merges: a pure move with the pure-move proof from lane-lb.md, `tests/docs/production-inventory.json` regenerated, and the `docs/advanced/api.md` controller sentence updated.
4. **Generated-file conflicts at the step-9 merge.** `tests/docs/production-inventory.json` (L-B regenerated it, and step 9 will too), `js/**`, maps and `client/generated-manifest.json`: regenerate them (`python3 tests/inventory/generate.py`, `npm run client:build && npm run inventory:rewrite`), never hand-merge.
5. **Left for step Z / 12** (from lane-lc.md and lane-ld.md, unchanged here):
   - the stale test paths in docs and prose. The feature READMEs' "Tests" commands and their "Step F1 mirrors these into `tests/frontend/features/<f>/`" sentences are now stale, including for the 6 features whose tests F1 left in `pages/`, `requests/`, `bootstrap/` and `core/`;
   - the paths in `docs/rewrite/tag-runtime.md` `runtime/…`/`rules/…`;
   - CONTRIBUTING's legacy "Key directories" and "Adding a client module" sections;
   - `client/src/contracts` is in no map row;
   - the `Configuration/**/*.js.map` files have no `linguist-generated` mark;
   - the backend parity test;
   - `npm run verify:restructure` and the final HOST.

## Deviations

1. **The gates and BROWSER ran as harness-tracked background tasks, not in the tool's foreground.** The agent's foreground shell call has a 10-minute cap, and `all` (6.6 min) and BROWSER (11.1 min) are close to or over it. Each one ran alone, and nothing else ran in this checkout until it exited. Both were waited on to completion.
2. **The parity test's F1 branch was made unconditional** instead of keeping the `todo` switch. With F1 merged, the switch could never be `todo` again (lane-ld.md "What remains" item 3 offered this).
