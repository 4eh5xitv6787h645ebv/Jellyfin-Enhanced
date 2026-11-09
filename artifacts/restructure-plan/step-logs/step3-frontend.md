# Step 3 log (frontend half): S2, merged and re-gated (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 3 (frontend **S2**), gate FE (G + check O + INV + TOOL); frontend.md §2.3, §2.4, §3 (S2 row), §5.4 and the S2 brief in §6. Machine: Lenovo worker. Gates ran one at a time, in the foreground. The backend half of row 3 is in [step3-backend.md](step3-backend.md).

## Commits

Branch `restructure/fe-s2`, from `restructure/integration` `e0a66e4d`:

| Step | Commit | What |
|---|---|---|
| S2 | `09e389a1` | `docs(client): S2 per-feature READMEs, types-only public-api stubs and feature-readme test` |
| merge | `6d7b078c` | `merge: restructure step 3 frontend (S2)` (`--no-ff` into `restructure/integration`, no conflicts) |

No tags created, nothing pushed, no containers used.

## What S2 added

- **`client/src/features/<f>/README.md` for all 15 features** (activity, bookmarks, calendar, catchup, chrome, details-providers, downloads, hidden-content, media-tags, player, seerr, settings, settings-panel, shared, spoiler-guard), in the §5 template:
  - title and owner ("Jellyfin Enhanced maintainers": the repo has no CODEOWNERS);
  - the backend counterpart from the PLAN.md canonical feature list;
  - an **entry points → shipped files** table (source relative to the folder, output, 1-based load position among the scripts in `js/component-scripts.json`, `–` when the output is not in that list), generated from `client/generated-manifest.json` `entries` (210 entries, all of them in some feature or platform area; 182 scripts in component-scripts);
  - the public API and the global slots the feature publishes (the §2.3 peer facades it assigns, and its `JE.internals` slots from `tests/frontend/architecture/internals-owners.json`);
  - the settings/admin UI folders (hidden-content `settings/`, media-tags `settings/` and `admin/`);
  - a `node --test …` line of the tests that cover the feature today (each glob checked to match at least one file);
  - the generated sources in the folder (`GENERATED_SOURCES`; only media-tags has any).
- **Types-only `public-api.ts`** for the 13 features that had none. `settings-panel/public-api.ts` and `media-tags/public-api.ts` (from A0) were extended, not recreated.
  - The brief's `rg "from '\.\./\.\./<f>/" client/src/features` finds cross-feature imports only for settings-panel and media-tags, and A0 already covers both. So each stub was seeded with the types that code *outside the feature folder* imports today, found with the TypeScript AST rather than a regex; those are all `host/` bridges.
  - bookmarks `BookmarkApi, Item, Library, Owner`; calendar `CalendarLifetime, CalendarEvent, CalendarFacade, CalendarInternal`; catchup `CatchRuntime`; downloads `Page, PublicPage`; hidden-content `HomeSurface, HomeSurfaceApi, AdminUser, HiddenDocument, HiddenItem, ListedItem, Settings, PageSurface`; player `MediaSegment`; seerr the core/discovery/recommendations facade types; media-tags gains the 18 types `host/tag-runtime-host.ts`, `host/tag-rules-host.ts` and `host/settings-panel-host.ts` import.
  - activity, chrome, details-providers, settings, shared and spoiler-guard have no outside importers, so their stub is `export {};` with the header comment.
  - Every re-export is `export type … from './…'` of the feature's own files, so no file has a new boundary pair. No importer was retargeted: the hosts keep their direct imports until C1.
- **`tests/frontend/architecture/feature-readme.test.mjs`** (auto-discovered, 31 tests). For every `client/src/features/*/` folder:
  1. README.md exists and starts with `# <feature>`.
  2. The entry table equals that folder's `client/generated-manifest.json` entries, including the load position.
  3. The "Generated files" list equals that folder's `GENERATED_SOURCES` files.
  4. `public-api.ts` exists and holds only `export type` / `import type`, interfaces, type aliases or `export {};`.

  Both failure modes were checked by hand: a wrong load position and an added `export const` each make the test fail.

No runtime code changed. The built JS, maps, `client/generated-manifest.json` and `docs/rewrite/migration-inventory.json` are byte-identical: `client:build` and `inventory:rewrite` left them untouched, since nothing imports the new files and README.md is not a `.ts` input.

## Gates

On `restructure/fe-s2` before committing, and again on the merged `restructure/integration` (`6d7b078c`): `scripts/restructure-gates.sh fe` exited 0 each time. `inv` and `tool` were also run standalone on the branch and passed (`restructure-gates: inv passed`, `restructure-gates: tool passed`). Check O was empty: `e0a66e4d..6d7b078c` changes no `.js` file at all. The persistence-key and translation-key snapshots equal `keys-S0.txt` / `tkeys-S0.txt`. The tree was clean after the regenerating build on the merged tree.

Merged tree, `scripts/restructure-gates.sh fe` tail:
```
Client: 559 TypeScript sources checked; 210 mapped browser entries; 9 typed HTML pages.
Production inventory is current (this does not assert behavioral coverage).
Ran 16 tests in 0.637s
OK
tooling: passed
ℹ tests 3787
ℹ pass 3778
ℹ fail 9
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
== FE G: component-scripts.json and client/entries output keys vs restructure-base
restructure-gates: fe passed
```
`npm test` grew by 31 (3756 → 3787: the new feature-readme tests); the 9 failures are the baselined ones. `node --test tests/frontend/architecture/*.test.mjs`: 42/42.

## Baselines

| | before (`e0a66e4d`) | after (`6d7b078c`) |
|---|---|---|
| `boundary-baseline.json` | 278 files, 386 pairs, **502** violations | unchanged |
| `size-baseline.json` | 22 files, 25,608 lines | unchanged |

## Notes for later steps

- **The README entry tables are tested.** Any step that moves an entry source (B1 and B2 did), adds or removes an output, or changes `component-scripts.json` order must update the affected README rows in the same commit. They were generated with a throwaway script; the test's failure message says which rows to fix. A change to component-scripts order shifts the load position of every later entry.
- **C1:** after the move, `features/settings-panel/host.ts` (from `host/settings-panel-host.ts`) still type-imports `TagLayout`, `TagLook`, `MediaLanguage`, `RatingSources` and `PosterColours` straight from media-tags files. Those are `host-import` keys today but would become `import …` keys, which counts as a new entry. `media-tags/public-api.ts` now exports all five, so C1 can retarget those imports to it (`import type`, legal under rule 1). The same applies to any other moved host that imports another feature's types; C1's simulation will show which.
- **A4** adds `MediaTagsSettingsUi` to `media-tags/public-api.ts`; **C2/C3** add facade types to the owners' public-api files. The README "Public API" sections describe the slots, not the type list, so they need no update for that.
- **F1** moves tests; update the `node --test` lines in the READMEs then. They are not tested.
