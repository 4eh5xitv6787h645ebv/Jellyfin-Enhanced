# Step 4 log: frontend B1 → B2, merged and re-gated (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 4 (frontend **B1 → B2**, B2 based on a tree containing backend P1-e), gate FE (G + check O + INV + TOOL); frontend.md §0.1, §1b, §3 (B1/B2 rows, "Baseline keys", "A1–A3 / B1–B2 (moves)") and the B1/B2 briefs in §6. Machine: Lenovo worker. Gates ran one at a time, in the foreground.

## Commits

Branch `restructure/fe-b`, from `restructure/integration` `6d7b078c` (after the S2 merge; it contains P1-e, merged in `1b457a16`):

| Step | Commit | What |
|---|---|---|
| B1 | `26bc60eb` | 61 non-generated files `git mv`'d out of `media-tags/runtime/` and `rules/` (table below); 125 relative import specifiers fixed; `client/entries/tag-runtime.json` and `tag-rules.json` sources retargeted (keys unchanged); media-tags README entry table regenerated |
| B2 | `a2633099` | The 7 generated modules → `types/<type>/`; generators and their tests repointed; stale backend paths in media-tags comments (17 `/*!` banners and 5 more) updated; `runtime/` and `rules/` are gone |
| merge | `59e8d1d6` | `merge: restructure step 4 (frontend B1–B2)` (`--no-ff` into `restructure/integration`, no conflicts) |

No tags created, nothing pushed, no containers used. The moves were done with a throwaway script (scratchpad, not committed). For each move it ran `git mv`, then rewrote every relative specifier in `client/src/**/*.ts` (`from`, `import()` and side-effect imports) that resolved to a moved file or sat in one, so that it resolves to the same file. It then edited the entries' source side and renamed the baseline keys and targets. The script stopped on any missing source, existing destination or key collision.

## Moves (frontend.md table 1b)

| To `features/media-tags/` | From |
|---|---|
| `pipeline/` | `runtime/tag-pipeline`, `tag-cache-store`, `tag-renderer-base` (each + `-entry`), `contract`, `dto`, `scopes` |
| `editor/` | `runtime/tag-item-editor`, `tag-item-menu` (+ entries) |
| `types/quality/` | B1: `runtime/qualitytags` (+ entry), `quality-rules`; B2: `runtime/quality-data` (GEN), `rules/compact-quality` (GEN) |
| `types/direct-play/` | `runtime/tag-direct-play` (+ entry), `device-profile` |
| `types/language/` | B1: `runtime/languagetags` (+ entry), `rules/media-language-entry`; B2: `rules/media-language` (GEN) |
| `types/people/` | `runtime/peopletags` (+ entry), `people-model`, `people-countries` |
| `types/status/` | B1: `runtime/statustags` (+ entry), `status-facts`, `rules/status-vocabulary-entry`; B2: `rules/status-vocabulary` (GEN) |
| `types/ratings/` | B1: `runtime/ratingtags`, `userreviewtags` (+ entries), `rules/rating-sources` (+ entry), `rating-view`; B2: `rules/rating-data` (GEN) |
| `types/age-rating/`, `types/logo/`, `types/custom/` | `runtime/ageratingtags`, `logotags`, `customtags` (+ entries) |
| `types/awards/`, `types/genre/` | B1: `runtime/awardstags`, `genretags` (+ entries); B2: `runtime/awards-data`, `genre-table` (GEN) |
| `layout/` | `rules/tag-layout` (+ entry), `layout-rules`, `layout-fitting`, `layout-runtime-types`, `tag-look` (+ entry), `poster-colours` (+ entry), `poster-colour-rules`; `runtime/tag-layout-styles`, `tag-styles` (+ entries) |

B1 also moved the `-entry.ts` files of two GEN modules (`media-language-entry.ts`, `status-vocabulary-entry.ts`), because the brief moves the non-generated files with their entries. That fits the plan's baseline-key note too, which expects B2 to re-key only `media-language.ts` (size). Between B1 and B2 those two entries imported `../../rules/…`. `host/tag-runtime-host.ts` and `host/tag-rules-host.ts` were **not** moved, although table 1b lists them: the B1 brief names only `pipeline/`, `editor/`, `types/` and `layout/`, and the C1 brief owns the host moves. Their imports were only repointed.

## Path readers (B2, same commit)

- `scripts/tag-data.mjs`: the single `typescriptDirectory` is now a per-file map `typescriptPaths = { status: …/types/status/status-vocabulary.ts, quality: …/types/quality/compact-quality.ts }`. The native path (`Features/MediaTags/PosterTags/Resolution/QualityCompactLabels.g.cs`, from P1-e) is unchanged.
- `scripts/generate_technical_ratios.py:10` → `types/quality/quality-data.ts`; `scripts/generate_genre_labels.py:9` → `types/genre/genre-table.ts`.
- `scripts/build_poster_assets.py`: `TABLE_SOURCE` (4 paths) and the 3 docstring mentions.
- `tests/frontend/features/features-tag-runtime-generators.test.mjs:14`: `runtime` became `types`, and the two `table` paths use it.
- `tests/client-build/tag-data.test.mjs:12`: `typed` became `status` and `quality` dirs, so the fixture's entries sit next to their projections.
- Generators re-run: `generate_status_vocabulary.py --table-only`, `generate_quality_compact.py`, `generate_technical_ratios.py` and `generate_genre_labels.py` each passed `--check`, and in write mode left the tree byte-identical (`git status` showed no unstaged change). `build_poster_assets.py --check` printed `poster tag assets OK (261 files)`.

## Comments and banners (B2)

The stale backend paths in `client/src/features/media-tags/**` comments (step3-backend.md note 3) now name the post-P1 files:
- **17 `/*! Lexical index` banners** in `admin/sections/*.ts`: `Helpers/MediaTagsPageFields.cs` → `Features/MediaTags/Admin/MediaTagsPageFields.cs`, `Services/WhatsNewService.cs` → `Features/Admin/Services/WhatsNewService.cs`. Edited in place, with the same line count. The rest of each banner (the index the tests compare) is untouched, and `admin-tags-rewrite` / `features-admin-tags-page-server` still pass.
- `admin/admin-tags.ts` (MediaTagsPageFields).
- `admin/page.ts` (`Services/PosterTags/PosterTagSettings.cs` → `Features/MediaTags/PosterTags/…`).
- `settings/portable-model.ts` and `settings/ui-panel-tag-portable.ts` (`Helpers/MediaTagsPortable.cs` → `Features/MediaTags/Services/…`).
- `types/quality/quality-rules.ts` (`Services/MediaNamingTags.cs` → `Features/MediaTags/Services/…`).
- `Controllers/JellyfinEnhancedController.cs` (admin-tags.ts:106) still exists and was left.

A sweep of every path-like token in `media-tags/**` found no other path that doesn't exist.

**Bundle effect.** The banners are `/*!` comments, so esbuild keeps them in the built JS. Check O therefore shows exactly 17 × 2 banner lines each way in `js/enhanced/admintags/sections/*.js`, besides `// client/src/` lines. Those 17 outputs are **not** in `component-scripts.json`, so they are not part of `/JellyfinEnhanced/bundle.js`; `bundle.js` has no "Lexical index" text. The `//` comments in `.ts` sources are dropped by esbuild and only change `.js.map` `sourcesContent`. So the comment change the plan anticipates leaves the **comment-stripped bundle hash unchanged**:

| tree | stable sha256 | comment-stripped sha256 |
|---|---|---|
| step 1 checkpoint (`baselines/bundle-checkpoints.txt`) | `533b5133…4cd6` | `d77bd132a2663d92e72e9ccc3d858aff828daab604664b7b408535dcb4d77f23` |
| B1 `26bc60eb` | `62668d89929083ea4e574a2b5a9645239dc05a0721a6cbceb18055e50cd26831` | `d77bd132a2663d92e72e9ccc3d858aff828daab604664b7b408535dcb4d77f23` |
| B2 `a2633099` (= merged `59e8d1d6`; no `js` change in the merge) | `129fe7f398422e1b16ceb11424cc0d0568fa701be0ac2df45400922ea0ff6096` | `d77bd132a2663d92e72e9ccc3d858aff828daab604664b7b408535dcb4d77f23` |

(`scripts/restructure-gates.sh bundle <out.js>` then `bundle-hash`.) B1 → B2 the bundle differs only in 7 `// client/src/` lines each way (the GEN modules' path comments). Step 4 is not a HOST checkpoint (PLAN.md: HOST at steps 1, 5–9, 12), so nothing was appended to `baselines/bundle-checkpoints.txt`; the hashes are recorded here only.

## Gates

B1 and B2 each, on `restructure/fe-b` before committing, and again on the merged `restructure/integration` (`59e8d1d6`):
- `scripts/restructure-gates.sh fe` exited 0. B1's first run failed on the new feature-readme test. I had regenerated the media-tags README from the manifest *before* `client:build` rewrote it, so the README still held the old sources. After regenerating it post-build, the gate passed, and B2 did it in that order. No code or baseline change was involved.
- `inv` and `tool` also ran standalone and passed.
- Targeted B tests: `node --test tests/frontend/core/core-tag-*.test.mjs tests/frontend/features/features-tag-runtime-generators.test.mjs` 241/241 (B1, B2); `npm run test:client-build` 211/211 (B1, B2; covers tag-data.test.mjs); B2 also `tests/frontend/features/*admin-tags*.test.mjs` 177/177.
- Key snapshots: persistence and translation keys equal `keys-S0.txt` / `tkeys-S0.txt` after B1 and after B2.
- Stale-key check (frontend.md §3, `awk '$1 ~ /^R/ {print $2 "\""}' | grep -F -f - …baseline.json`): no output (exit 1) for B1 and for B2.
- `component-scripts.json` and every `client/entries` output key are unchanged (gate G check).

**Check O.** Built `.js` diffs other than `// client/src/` lines:

| range | `.js` files | `// client/src/` lines −/+ | other lines −/+ |
|---|---|---|---|
| B1 `6d7b078c..26bc60eb` | 25 | 78 / 78 | 0 / 0 |
| B2 `26bc60eb..a2633099` | 24 | 7 / 7 | 34 / 34, all the 17 banners (2 lines each) |
| step 4 `6d7b078c..59e8d1d6` | 42 | 85 / 85 | 34 / 34, the same banners |

`.js.map` changes are expected. Source diffs under `client/src` are import-specifier lines, the 22 comment edits (17 two-line banners, 5 single comments) and the media-tags README; 68 renames, 32 modified.

Merged tree, `scripts/restructure-gates.sh fe` tail:
```
Client: 559 TypeScript sources checked; 210 mapped browser entries; 9 typed HTML pages.
Production inventory is current (this does not assert behavioral coverage).
Ran 16 tests in 0.635s
tooling: passed
ℹ tests 3787
ℹ pass 3778
ℹ fail 9
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
== FE G: component-scripts.json and client/entries output keys vs restructure-base
restructure-gates: fe passed
```
The 9 failures are the baselined ones. The tree was clean after the regenerating build.

## Baselines

| | before (`6d7b078c`) | after B1 (`26bc60eb`) | after B2 / merged (`59e8d1d6`) |
|---|---|---|---|
| `boundary-baseline.json` | 278 files, 386 pairs, **502** violations | 278 / 386 / **502** | 278 / 386 / **502** |
| `size-baseline.json` | 22 files, 25,608 lines | 22 / 25,608 | 22 / 25,608 |

Re-keyed with the same counts, never added or raised:
- **B1:** boundary 43 file keys and 24 target keys (`host-import …` in the three tag/settings-panel hosts); size 8 file keys.
- **B2:** boundary 5 target keys; size 1 file key (`media-language.ts`, 903).

No pair became legal: all moves stay inside media-tags, and the hosts' imports are still `host-import`s. So nothing was lowered. The files were rewritten in the existing format (`_comment` first, keys sorted, 2-space JSON; a round-trip of the untouched files was byte-identical).

## Notes for later steps

1. **Pre-existing improvement diagnostic, left alone:** `file-size.test.mjs` reports `media-tags/settings/ui-panel-media-tags.ts: lines ×1234 (baseline 1235; lower it)`. The file was already 1234 lines on `restructure/integration` before step 4; B1 only changed one import line in it. It may be lowered whenever a step owns that file.
2. **Stale prose paths (step 12 sweep, frontend.md §4):** `docs/advanced/project-structure.md:799` (`rules/compact-quality.ts`), `docs/rewrite/media-tag-rules.md:11` (`rules/`), `docs/rewrite/tag-runtime.md:9,98,99,106` (`runtime/…`, `rules/…`). These are docs only; no reader uses them.
3. **Still-stale comments outside `media-tags/**`** (step3-backend.md note 3; not in B2's scope): `admin/config/sections-entry.ts` and `host/bootstrap-pages-host.ts`. C1 (hosts) or step 12 can fix them. If `sections-entry.ts`'s `/*!` banner is edited, `Configuration/admin/sections.js` changes, but that file is not in `bundle.js` either.
4. **HOST at step 5 (rule b):** the span since the step-1 checkpoint holds only frontend moves (A0–A3, B1), doc/type-only S2, and B2, whose only non-move output change is in scripts outside `bundle.js`. Expect the comment-stripped hash to still be `d77bd132…4d77f23`. A backend step that touches `js/**` or `client/**` would change that.
5. **C1:** move `host/tag-runtime-host.ts` → `media-tags/host.ts` and `host/tag-rules-host.ts` → `media-tags/rules-host.ts` (table 1b). Their `host-import client/src/features/media-tags/{pipeline,editor,types,layout}/…` keys then become same-feature imports and can be lowered. `host/settings-panel-host.ts` should take its media-tags types from `media-tags/public-api.ts` (see step3-frontend.md).
6. **B3/B4** start from `pipeline/tag-pipeline.ts` (2567, size key renamed) and `layout/tag-layout.ts` (2241). The entries `pipeline/tag-pipeline-entry.ts` and `layout/tag-layout-entry.ts` keep the README rows valid while the split adds non-entry files.
7. Any later move of a media-tags entry source must update `client/src/features/media-tags/README.md` (feature-readme test). A move of a GEN file must update its README "Generated files" line and the readers in frontend.md §0.1.
