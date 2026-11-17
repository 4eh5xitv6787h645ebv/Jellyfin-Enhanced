# Upstream sync, 2026-11-18: entry 42 (`79a90422`) lands after the maintainer's approval

Not a run of [`docs/upstream-sync-procedure.md`](../../../docs/upstream-sync-procedure.md) over new upstream commits:
the landing of entry 42, Seerr streaming providers (#1058), whose port waited on branch `sync/contract-79a90422`
because it changes two existing contract lines ([`upstream-sync-2026-11-13-2110.md`](upstream-sync-2026-11-13-2110.md)).
The maintainer reviewed that branch's contract commit `5cc238d0` on 2026-11-17 and approved it. Branch
`sync/land-79a90422`, made from `sync/contract-79a90422` and rebased onto `restructure/integration` at `cb1633b2`.
The log before this one: [`upstream-sync-2026-11-17-1650.md`](upstream-sync-2026-11-17-1650.md).

## 1. What lands

| Commit | What |
|---|---|
| `094c21bf` | `feat(elsewhere): streaming providers from Seerr when there is no TMDB key` (`Upstream: 79a90422…`): the port, its tests, entry 42 marked `ported` |
| `8ba56e8f` | `docs(sync): rewrite commit of the Seerr streaming providers port in the ledger` (`upstream_sync.py resolve`) |
| `d89c57eb` | `contract: upstream sync additions and two changed lines`, written by hand on today's snapshots |
| `3c13bafc` | `chore(budget): room for the port of upstream 79a90422` |
| this log's commit | the step log and its evidence |

After it the ledger has 71 entries: 69 `ported`, 2 `already-present`; nothing `deferred` or `pending`.
`upstream_sync.py check` passes. Entry 42's notes say the contract change was approved by the maintainer on
2026-11-17, give today's route count (220 → 221) and that the port was rebased from `fc8dff6d` on 2026-11-18. Its
list of differences from upstream is unchanged.

## 2. The rebase

Fifty commits had landed since the port's base `7fbe7d90`. Conflicts, and how each was resolved:

- **Generated files**, 25 in all (21 `js/`, `min/js/` and `Configuration/admin/` outputs and maps, the build output
  inside `Configuration/configPage.html`, `client/generated-manifest.json`, `docs/rewrite/migration-inventory.json`,
  `tests/docs/production-inventory.json`): not merged by hand. `je12 regen` took one side and rebuilt them;
  `je12 regen --contracts` regenerated `client/src/contracts` from the changed bootstrap schema. Two minified
  outputs the port now rebuilds (`recommendations-init.js`, `recommendations-category.js`, which bundle the Seerr core)
  came out differently on the first regen after the conflict and the same on every later one; the committed copies
  match `generated-manifest.json`.
- **`docs/advanced/api.md`**: the main line's version line (12.16.0.0) and count (220) kept; the count becomes 221 for
  the new route; the public-config field list keeps the main line's `SubtitleSyncButtonEnabled` and the port's
  `ElsewhereUseSeerrRegion`.
- **`tests/frontend/architecture/size-baseline.json`**: both sides lowered entries; each kept its own lower value
  (`bookmarks.ts` 842 and `tag-styles-editor.ts` 1106 from the main line, `elsewhere.ts` 970 from the port).
- **`docs/upstream-sync.json`**: the main line's ledger (entries 43–71) taken whole, then entry 42 changed from
  `deferred` to `ported` as the port's commit had it (`reason` and `needs` replaced by `notes` and `evidence`); the
  table rendered with `upstream_sync.py render`. The second commit's `rewriteCommits` were filled again by
  `upstream_sync.py resolve` from the rebased port's trailer.
- **Contract files**: `RouteAuthSnapshotTests.cs` conflicted and git merged the other four; all five were reset to the
  main line's content and the approved lines written in by hand (section 3).

Auto-merged and checked by reading: the admin page (`dependencies.ts`, `gated-help.ts`, `overview-cards.ts`,
`sections/seerr.ts`, `sections-entry.ts`), `PluginConfiguration.cs`, `BootstrapConfig.cs`,
`JePlatformController.Bootstrap.cs`, `contracts/bootstrap.schema.json`, `config-flag-groups.json`, `en.json`,
`admin-config-baseline.json`, the admin-config test. The main line did not change the Seerr controller, `Shared/Seerr`
or `Shared/Tmdb` since the port was written, so `ProxyJellyseerrRequest`'s reads, which the two changed lines count,
are the ones that were reviewed. No code had to change to fit the main line.

## 3. The contract lines as landed

Old → new, on the main line's files at `cb1633b2`:

- `route-auth.snapshot.json`, added:
  `{"verb":"GET","route":"JellyfinEnhanced/jellyseerr/streaming-region","requiresAuth":true,"auth":"","action":"GetSeerrStreamingRegion","apiBehavior":true,"parameters":[]}`
- `auth-helper-calls.snapshot.json`, added `"GetSeerrStreamingRegion": {"User":1,"UserHelper.GetCurrentUserId":1}`;
  changed `"GetWatchProvidersBatch": {"User":1,"UserHelper.GetCurrentUserId":1}` →
  `{"IsAdminUser":5,"User":2,"UserHelper.GetCurrentUserId":2}`.
- `auth-reads-by-route.base.json`, added
  `"GET JellyfinEnhanced/jellyseerr/streaming-region": {"User":1,"UserHelper.GetCurrentUserId":1}`; changed
  `"GET JellyfinEnhanced/watch-providers": {"User":1,"UserHelper.GetCurrentUserId":1}` →
  `{"IsAdminUser":5,"User":2,"UserHelper.GetCurrentUserId":2}`.
- `baselines/inventory-routes.txt`, added `GET /JellyfinEnhanced/jellyseerr/streaming-region`.
- `RouteAuthSnapshotTests.ExpectedRoutes` 220 → 221.

These are exactly the approved lines; nothing else in a contract file changed and no registration changed. The
Architecture tests pass with them (24 of 24), so the code needs no other contract line. `JE_UPDATE_SNAPSHOTS` was never
set. The approved commit also extended the route history in `RouteAuthSnapshotTests`' comment ("207 since it added
GET jellyseerr/streaming-region"); the main line's later contract commits change only `ExpectedRoutes` and leave that
comment at 206, so this one does the same.

## 4. Budget

The served bundle no longer fitted: gate T (`BundleBudgetTests`) measured 707,585 gzip-9 bytes against the 706,597
limit. The port fitted when it was written; the 12.16.0.0 ports used the room since. As the ports of `ec470d75`,
`da0ea773` and `c451730b` did, `client/bundle-budget.json` gets a history entry that raises each limit by exactly what
this port adds, so the headroom stays what it was ([`p42-land.txt`](upstream-sync-evidence/p42-land.txt)):

- `scripts/restructure-gates.sh size` (gzip -9): 2,592,384 raw / 704,688 on `cb1633b2`, 2,594,887 / 705,663 on
  `d89c57eb` (+2,503 / +975);
- gate T's own measure (.NET SmallestSize): 706,482 → 707,585 (+1,103). Raising gzip by the gzip -9 figure would have
  left gate T 13 bytes over, so the gzip limit rises by gate T's figure: 2,616,163 → 2,618,666 raw,
  706,597 → 707,700 gzip. Gate T keeps its 115 bytes of headroom; gzip -9 has 2,037.

The assembly budget (`PackedResourcesTests`) still fits and does not change. No guard baseline, failure list or
snapshot other than section 3's lines changed.

## 5. Evidence

All in [`upstream-sync-evidence/`](upstream-sync-evidence/), [`p42-land.txt`](upstream-sync-evidence/p42-land.txt)
for the verdicts and measurements.

- **Tests on today's tree** (`d89c57eb`): `je12 test --dotnet` passes (node 3,658, dotnet 2,633, 0 failed). Run alone:
  upstream's backend test `ExtractSeerrFlatrateReadsTheRequestedRegionOnly`, the five frontend files that carry the
  port's 13 tests (64, 57, 15, 42 and 29 tests), and the Architecture namespace (24): all pass.
- **Lab** (one `je12 up` lab on the Lenovo at `3c13bafc`, removed afterwards; firewall counters 0): smoke passes
  (0 failing, 0 changed). The 2026-11-13 parity script, same setup and command:
  - option off: [`p42-seerr-providers.land.option-off.txt`](upstream-sync-evidence/p42-seerr-providers.land.option-off.txt)
    is identical to the port's output on 2026-11-13; upstream's build differs only in the order of the posters'
    batch items, which follows the order the cards came on screen;
  - option on: [`p42-seerr-providers.land.option-on.txt`](upstream-sync-evidence/p42-seerr-providers.land.option-on.txt)
    is identical to upstream's build's output; the port's 2026-11-13 output differs only in that order.
  - A first option-off run, right after the smoke and with no restart after the setup script, gave the three library
    movies' poster lookups `[]`: the smoke had read those titles' Seerr details through the proxy before the mock
    carried `watchProviders`, and the proxy's response cache answered with them. After a restart the same command
    printed the result above. The 2026-11-13 runs restarted between setup and script too.

## 6. Gates

| # | Check | Commit | Where | Result |
|---|---|---|---|---|
| 1 | `je12 regen` (and `--contracts`) after the rebase and before each commit | each commit | Lenovo | ok |
| 2 | `je12 test --dotnet` (quick mode: platform, media-tags, seerr, admin, details-providers) | `d89c57eb` | Lenovo | pass |
| 3 | the port's tests and the Architecture tests, run alone | `d89c57eb` | Lenovo | pass |
| 4 | `BundleBudgetTests` | `d89c57eb`; `3c13bafc` | Lenovo | fail (over the budget); pass with section 4's entry |
| 5 | `je12 gate size` | `cb1633b2`, `d89c57eb` | Lenovo | pass, pass (measurements in section 4) |
| 6 | `upstream_sync.py resolve`, `check` | `8ba56e8f` | Lenovo | `71 entries: 69 ported, 2 already-present` |
| 7 | `je12 up` smoke; parity script, option off and on | `3c13bafc` | Lenovo, one lab | pass; section 5 |
| 8 | `je12 gate final` | this log's commit | Lenovo | in the landing report: a log cannot hold a result about its own commit |
