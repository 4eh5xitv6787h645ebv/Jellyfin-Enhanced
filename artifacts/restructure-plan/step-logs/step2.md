# Step 2 log: frontend A0 → A1 → A2 → A3, merged and re-gated (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 2 (now `A0 → A1 → A2 → A3`), gate FE (G + check O + INV + TOOL); frontend.md §1a, §3 and §6. Machine: Lenovo worker. Gates ran one at a time, in the foreground. This is the retry: the first attempt stopped before committing because A1–A3 would have created new cross-feature boundary pairs (simulated 2 / 19 / 21). The coordinator's decision was to keep the ratchet strict: never add a baseline entry and never widen a rule, re-keying only existing violations whose file moved.

## Commits

Branch `restructure/fe-a`, from `restructure/integration` `156c2e82`:

| Step | Commit | What |
|---|---|---|
| A0 | `313c696f` | `git mv` settings-panel `dom.ts`, `settings-values.ts` → `features/shared/`; new types-only `settings-panel/public-api.ts`, `media-tags/public-api.ts`, `host/context.ts`; panels, `registry.ts` and `host/admin-tags-host.ts` import types through them |
| A1 | `ba8164a6` | `ui-panel-hidden-content.ts` → `hidden-content/settings/` |
| A2 | `8285ef67` | `ui-panel-media-tags`, `ui-panel-tag-{portable,editor,looks,preview}`, `portable-model`, `tag-caps` → `media-tags/settings/`; `media-tags/public-api.ts` re-exports retargeted to `./settings/*` |
| A3 | `52137381` | `admin-tags/**` (33 files incl. `sections/`) → `media-tags/admin/**`; `host/admin-tags-host.ts` → `media-tags/admin/host.ts`; `admin-tags` folder removed |
| docs | `08236cb5` | frontend.md (A0, baseline target keys, cross-feature move rule, C1 owns settings-panel-host), PLAN.md row 2, CHANGELOG "Step 2 execution notes" |
| merge | `dcd2acef` | `merge: restructure step 2 (frontend A0–A3)` (`--no-ff` into `restructure/integration`, no conflicts) |

No tags created, nothing pushed, no containers used.

## How the edges were made legal (A0)

All routes use §2.4 rules 1–4 as written. Rule 1 already allows `import type` and `export type … from` of another feature's `public-api.ts` (`scan.mjs` `importViolations`: target is `features/<B>/public-api.ts` and the reference is type-only), and allows `host/context.ts`.

| Edge A1–A3 would create | Route |
|---|---|
| moved panels → settings-panel `dom.ts`, `settings-values.ts` (runtime helpers) | `git mv` both to `features/shared/` (pure, stateless DOM readers and JSON coercions) |
| moved panels → settings-panel `context.ts` (`PanelContext`, `SearchHit`), `registry.ts` (`MediaTagsHubApi`) | `import type … from '…/settings-panel/public-api'` |
| `settings-panel/registry.ts` → moved tag panels (`TagPreview`, `TagLooksPanel`, …) | `import type … from '../media-tags/public-api'`. Before A2 that file re-exports them from settings-panel's public API (legal both ways); A2 retargets it to `./settings/*`, so `registry.ts` is untouched by A2 |
| moved admin host → `host/settings-host.ts` (`SaveOptions`, `SettingsDocument`) | new `host/context.ts`: `export type { SaveOptions, SettingsDocument } from './settings-host'`; the admin host imports them from it from A0 on |
| moved admin host → `settings-panel/registry.ts` (`EnhancedUi`) | A3's import fix points it at `settings-panel/public-api.ts` (type-only). It could not move in A0: any `host/ → features/` target is a rule-2 key, and a different key would be a new entry |

Simulated in a throwaway worktree (moves + the A2/A3 import fixes, then `feature-boundaries.test.mjs`) before the real A1–A3: 0 new pairs at each step. The worktree was removed.

**Emitted runtime code.** A0 is type and path changes only. Every changed import is `import type` / `export type` (erased; `verbatimModuleSyntax` keeps only non-type imports), and the moved helpers are bundled from their new path in the same module order. Check O was empty at every step and cumulatively: `git diff -U0 156c2e82 dcd2acef` over `js/**/*.js` and `Configuration/**/*.js` has 0 changed lines other than `// client/src/` comments (32 `.js` files, 116 comment lines each way), plus the expected `.js.map` changes. `component-scripts.json` and all `client/entries` output keys are unchanged. Persistence-key and translation-key snapshots equal `keys-S0.txt` / `tkeys-S0.txt` after every step.

## Baselines

| | before (`156c2e82`) | after (`dcd2acef`) |
|---|---|---|
| `boundary-baseline.json` | 292 files, 420 pairs, **536** violations | 278 files, 386 pairs, **502** violations |
| `size-baseline.json` | 22 files, 25,608 lines | 22 files, 25,608 lines (7 keys renamed) |

No entry was added and no count raised. Per step: A0 no baseline change (the moved helpers had no entries); A1 1 key renamed; A2 8 keys renamed (boundary, incl. 3 target paths in admin-tags entries) + 5 (size), then 8 pairs lowered (admin-tags → tag panels and tag panels → `media-tags/rules`, now same-feature); A3 34 keys renamed (boundary) + 2 (size), then 26 pairs lowered (16 admin files' `import …/admin/host.ts`, the moved host's 9 `host-import`s and its `raw-global JellyfinEnhanced`, since `media-tags/admin/host.ts` is a feature host file). The stale-key check (`awk '{print $2 "\""}'` form, frontend.md §3) printed nothing after each move.

## Gates

Per step on `restructure/fe-a` (A0, A1, A2, A3), and again on the merged `restructure/integration` (`dcd2acef`): `scripts/restructure-gates.sh fe` exit 0 each time; check O empty each time; A3 also ran `inv` and `tool` standalone (both passed). The tree stayed clean after the regenerating build on the merged tree.

Merged tree, `scripts/restructure-gates.sh fe` tail:
```
Client: 546 TypeScript sources checked; 210 mapped browser entries; 9 typed HTML pages.
Production inventory is current (this does not assert behavioral coverage).
Ran 16 tests ... OK
tooling: passed
ℹ tests 3756
ℹ pass 3747
ℹ fail 9
npm test: total 3756 (baseline 3745), passed 3747 (baseline 3736), failed 9 (baseline list 9)
== FE G: component-scripts.json and client/entries output keys vs restructure-base
restructure-gates: fe passed
```
The 9 failures are the baselined ones. Targeted tests: A1 147/147; A2 235/238 (the 3 failures are the baselined `bootstrap-media-tags-portable` sign-in-change tests); A3 201/201.

## Notes for later steps

- **C1** owns `host/settings-panel-host.ts` → `settings-panel/host.ts` (A3 left it, per the plan fix). Before moving `host/settings-host.ts` to `features/settings/host.ts`, move the `SaveOptions`/`SettingsDocument` declarations into `host/context.ts` (the settings host then imports and re-exports them), or `host/context.ts` gains a rule-2 `host-import`. The A1/A2 panels' runtime imports of `panelHost`/`registry` from the settings-panel host become `import client/src/features/settings-panel/host.ts` after C1: a relocation (re-key, same count), and runtime, so they stay until C3.
- **C2** extends `host/context.ts` (it exists, with type re-exports only). **S2** extends the existing `settings-panel/public-api.ts` and `media-tags/public-api.ts`. **A4** can define `MediaTagsSettingsUi` in `media-tags/public-api.ts`, which already re-exports the panel types `registry.ts` uses.
- `tests/frontend/architecture/scan.mjs` still maps a `features/admin-tags` path to media-tags, and `feature-boundaries.test.mjs` skips an `admin-tags` folder; both are now inert (the folder is gone) and were left as is (test code, not this step's scope).
- HOST is not part of step 2 (PLAN.md Gates: HOST at steps 1, 5–9, 12), so no bundle checkpoint was appended.
