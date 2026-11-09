# Step-1 baselines

First recorded 2026-11-09 on restructure-base + the plan commit (25da61c7). Re-recorded on 2026-11-09 by the step 1 base prep (CHANGELOG.md), after the base-prep commit fixed the tooling import and the stale rewrite inventory. Commands: PLAN.md baselines block. Functions (`trx_results`, `build_warnings`, `mutation_check`) live in `scripts/restructure-gates.sh`.

| File | Contents | Used by |
|---|---|---|
| dotnet-tests.txt | `dotnet test` summary line: 3212 total, 3212 passed, 0 failed (re-recorded by bug-fix lane B when the stale test was fixed; first recorded as 2980 total, 2979 passed, 1 failed). | T ratchet: total and passed must be ≥ these. |
| dotnet-failures.txt | Sorted TRX `testName` of each failing dotnet test (0; was 1 until bug-fix lane B). | T ratchet: every failure must be listed. |
| npm-tests.txt | `ℹ tests 3745` / `ℹ pass 3736` from `npm test` (node's spec reporter; there is no `# tests` line). | `npm test` / `npm run test:frontend` ratchet (FE G, BE F). |
| npm-failures.txt | Sorted `<file> :: <test name>` of each failing node test (9), from `scripts/restructure-gates-reporter.mjs`. 5 data-driven test names repeat within a file; identities are a set, so duplicates are harmless. | same |
| build-warnings.txt | Sorted, unique `<code> <repo-relative file>` from a clean Release `-p:JellyfinTarget=jf12` plugin build (1 warning, no line numbers). | Gate B: no new pair. A step that moves a listed file updates its path in the same commit. |
| jf12-digest.txt | `<tag> <RepoDigest>`: `jellyfin/jellyfin:12.4`, the local tag the skill's `je up` picks, `sha256:b45218a4…`. HOST runs `je up <name> <port> --image jellyfin/jellyfin:12.4`. (`jellyfin/jellyfin:12`, which `tests/host/run.py` uses, is a different image: `sha256:fea863d0…`.) | `restructure-gates.sh image` (fails if the tag's current RepoDigest differs). |
| bundle-checkpoints.txt | `<step> <stable sha256> <comment-stripped sha256>` from `restructure-gates.sh bundle-hash`. Stable = without the bundle's last line `//# sourceMappingURL=bundle.js.map?v=<version>-<DLL mtime ticks>`, which changes on every rebuild; the 183 per-module `//# sourceMappingURL=<module>.js.map` lines stay. Stripped = also without the 763 indented `// client/src/` comments. Two dumps around a `dotnet clean` gave the same stable hash. | HOST bundle check (a) and (b). |
| inventory-routes.txt | 202 `(verb, path)` routes. Not re-recorded. | INV. |
| tooling-tests.txt | `Ran 16 tests` / `OK`. | TOOL; DoD count floor. |
| mutation-check.txt | 9 stale frontend anchors, as the plan predicted. Not re-recorded. | TOOL path check. |
| browser-failures.txt | Sorted (`LC_ALL=C`) `[project] › <file>:<line>:<col> › <title path>` of each failing `npm run test:browser` test (52), copied from `step-logs/step6-browser-failures.txt` without its 4-space indent. Added in step 7 (coordinator decision); identical on the pre-step-6 tree and after step 6. That run had 693 tests: 638 passed, 52 failed, 3 skipped. | `restructure-gates.sh browser` (PLAN.md gate BROWSER): every failure must be listed. Only failures are ratcheted; there is no count floor file. |

## Pre-existing failures (ratcheted, not fixed)
- **Backend (gate T):** none. (`ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder` was stale and was fixed by bug-fix lane B.)
- **Frontend (`npm test`, 9):** `bootstrap-media-tags-portable.test.mjs` ×3 (null `.hidden`), `bootstrap-native-tabs.test.mjs` ×3 (tab index assertions), `core-translate-plural.test.mjs` ×3 (`tr is not a function`). Deterministic when run alone.
- **Browser (gate BROWSER, 52):** by spec tag-genre-names 12, settings-matrix 12, settings-overflow 9, settings-panel 6, seerr-details-rewrite 3, seerr-core-rewrite 3, flows 3, settings-panel-rewrite 2, chrome-rewrite 2. Main causes: `JE.t is not a function` in the fixture's `showEnhancedPanel`, `toCamelCase is not defined`, and a few locator assertions (step6-frontend.md).
- **`npm run verify:rewrite`** therefore fails at its `test:frontend` step (its dotnet step never runs). `restructure-gates.sh be` runs its parts with the ratchet instead.

## Fixed by the base-prep commit
- `tests/host/run.py:18` `from bookmarks import …` failed when `tests/runner/tests` loaded the file by path (3 TOOL errors).
- `docs/rewrite/migration-inventory.json` was stale (3 admin-config HTML script hashes).
