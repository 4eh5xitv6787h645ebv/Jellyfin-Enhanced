# Step-1 baselines (recorded on restructure-base + the plan commit, 2026-11-09)

Recorded on the untouched tree, before `scripts/restructure-gates.sh` and `tests/backend/Api/BundleDump.cs` were added (except `bundle-checkpoints.txt`, which needs the harness).

| File | Command | Notes |
|---|---|---|
| dotnet-tests.txt | PLAN.md baselines block | 2979 tests, 1 pre-existing failure (below). With BundleDump added the total is 2980. |
| npm-tests.txt | `npm test 2>&1 \| grep -E '^(# \|ℹ )(tests\|pass)'` | The plan's `^# (tests\|pass)` matches nothing: node's default reporter prints `ℹ tests N`. |
| jf12-digest.txt | `docker image inspect` of `jellyfin/jellyfin:12` | The tag `tests/host/run.py` uses (12.4 on this date). The local `jellyfin/jellyfin:12.4` tag, which the skill's `je up` picks, has a different digest (b45218a4…). |
| bundle-checkpoints.txt | PLAN.md baselines block, literally | Both hashes are equal: `^// client/src/` matches no line, because the 763 such comments are indented. The last line, `//# sourceMappingURL=bundle.js.map?v=<version>-<plugin DLL mtime ticks>`, changes on every plugin rebuild. |
| inventory-routes.txt | PLAN.md baselines block | 202 routes. |
| tooling-tests.txt | PLAN.md baselines block | 16 tests, 3 pre-existing errors (below). |
| mutation-check.txt | `mutation_check \| LC_ALL=C sort` | 9 stale frontend anchors, as the plan predicted. |

## Pre-existing failures on this tree (not fixed)
- **Tooling (gate TOOL fails here):** 3 errors in `tests/runner/tests` (`test_host_network_scan_tolerates_a_network_removed_after_listing`, `test_direct_host_runner_rejects_unsupported_target_before_creating_artifacts`, `test_host_default_all_and_explicit_dispatch_only_jf12`): `tests/host/run.py:18` does `from bookmarks import …`, which fails when the tests load it by path (`ModuleNotFoundError: No module named 'bookmarks'`). Came in with the rewrite snapshot (35c79281 added `tests/host/bookmarks.py`).
- **Backend (gate T):** `ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder` (`v=next-version` not in the source map).
- **Frontend (`npm test`, 9):** `bootstrap-media-tags-portable.test.mjs:520` ×3 (null `.hidden`), `bootstrap-native-tabs.test.mjs:58,83,111` (tab index assertions), `core-translate-plural.test.mjs:19,31,50` (`tr is not a function`). Deterministic when run alone.
- **Rewrite inventory:** the committed `docs/rewrite/migration-inventory.json` is stale (3 admin-config HTML script hashes), so `npm run inventory:rewrite:check` and `npm run verify:rewrite` fail on the committed tree; `npm run inventory:rewrite` rewrites it.
