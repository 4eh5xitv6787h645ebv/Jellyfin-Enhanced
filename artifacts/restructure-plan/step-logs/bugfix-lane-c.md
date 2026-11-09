# Bug-fix lane C (Seerr): step log

Branch `bugfix/lane-c` from `restructure/integration-k` e7f75cda. One bug per commit, each with its regression test;
every bug reproduces at e7f75cda.

| Commit | Bug | Regression test |
|---|---|---|
| 70a1b011 | BUG-018: Escape on a stacked dialog also closed More Info | `tests/frontend/requests/seerr-dialog-regressions.test.mjs`; `seerr-details-rewrite.spec.cjs:85` ×3 |
| 48f3d402 | BUG-017: a reopened dialog shared ids with the one still closing | `seerr-dialog-regressions.test.mjs`; `flows.spec.cjs:29` ×3 |
| e150c140 | BUG-019: no hover overview in Firefox | `tests/frontend/requests/seerr-card-hover.test.mjs`; firefox `seerr-core-rewrite.spec.cjs:56/:69/:80` |
| d74c82f3 | BUG-021: server options failure answered as no servers | `tests/frontend/requests/seerr-failure-reaches-ui.test.mjs` |
| 2521e2ee | BUG-022: failed issue list shown as "no issues yet" | `seerr-failure-reaches-ui.test.mjs` |

## Baseline changes (shrink only)

- `baselines/browser-failures.txt`: 52 → 43 (the 9 Seerr entries above, each removed in its fix commit).
- `tests/frontend/guards/error-as-empty-guard-baseline.json`: `installApi.fetchAdvancedRequestData` and
  `installApi.fetchIssuesForMedia` removed (`record.mjs`).
- No snapshot, `*.base.json`, size baseline or other guard baseline changed. `JE_UPDATE_SNAPSHOTS` unset for every gate.

## Gates

- 70a1b011: `all`, `size`, `inv`, `tool`, `JE_TEST_MIN_TWINS=1` jsdom.
- 48f3d402 … 2521e2ee (client-only; coordinator change, gates under `flock je-gate.lock`): `fe`, `inv`, `tool`,
  `JE_TEST_MIN_TWINS=1` jsdom, `size`, plus the bug's browser specs.
- Final tree: `all` passed (dotnet 1 / npm 9 failures, both equal to the baseline lists); `browser` passed
  (693 tests: 647 passed, 43 failed = baseline list, 3 skipped).
- Size at 2521e2ee: raw 2,376,010 / gzip -9 639,425 (budget 2,494,625 / 671,156).
- Flakes (flake protocol: an isolated rerun passed, then a clean full rerun passed; none baselined):
  npm `bootstrap-loader-rewrite` idle slicing, `features-status-tags-vocabulary` (×3 runs),
  `seerr-review-boundaries` SEERR-CORE-22, `seerr-review-r2` "R2 disposed TV picker…: back",
  `features-pause` "a source change on the same video element…"; dotnet
  `IntegrationStatusTagsSeriesTests.UpstreamLookupsBeyondTheWindowShareWaitForItToMoveOn`. They all occurred at
  load 25–48 on the shared worker. The last four are not on AGENTS.md's known load-sensitive list.

HOST not run in this lane.
