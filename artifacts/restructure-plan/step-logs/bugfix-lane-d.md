# Bug-fix lane D (fail-as-empty, bookmarks lifecycle)

Base: `restructure/integration-k` @ e7f75cda. Branch: `bugfix/lane-d`. Each fix has a regression test that fails at e7f75cda. BUG-007 is unchanged (by design).

| Bug | Commit | Test |
|---|---|---|
| BUG-008 component manifest failure | be412693 | `tests/frontend/bootstrap/bootstrap.test.mjs` (2) |
| BUG-009 translation languages cached after failure | 4a17acf5 | `tests/frontend/pages/pages-reviews.test.mjs` |
| BUG-020 Write a Review after a failed own-review fetch | 38a5473a | `tests/frontend/pages/pages-reviews.test.mjs` |
| BUG-010 failed issue media cached | 5da3ec0b | `tests/frontend/pages/pages-downloads.test.mjs` |
| BUG-011 admin hidden-content search failure shown as no matches | 67136f59 | `tests/frontend/features/hidden-content/features-hidden-rewrite.test.mjs` (2) |
| BUG-013 failed logo URLs never retried | cd7eeae9 | `tests/frontend/features/media-tags/features-logo-tags.test.mjs` (2) |
| BUG-016 bookmarks disposed by a bubbling pagehide | 60055de1 | `tests/frontend/features/bookmarks/features-bookmarks-rewrite.test.mjs` |

New en.json keys: `reviews_user_unavailable`, `hidden_content_admin_add_failed`, `hidden_content_admin_add_seerr_failed`.

## Baselines
- `tests/frontend/guards/error-as-empty-guard-baseline.json`: lowered by 6 (component-loader 1, reviews 2, downloads 1, hidden-content admin 2).
- `tests/frontend/guards/leak-guard-baseline.json`: lowered by 1 (logotags `failedUrls`).
- No snapshot, ratchet, size or bundle baseline changed.

## Gates
- be412693, 4a17acf5, 38a5473a: `all`, size, inv, tool and `JE_TEST_MIN_TWINS=1` frontend suite (no new failures).
- 5da3ec0b, 67136f59, cd7eeae9, 60055de1 (frontend-only): `fe`, inv, tool and min-twins, under the shared gate lock.
- 60055de1 (final tree): `all` passed (dotnet 3212 total / 3211 passed; npm 3842 / 3833, failures all listed); size raw 2,377,027 / gzip-9 639,583 (within budget); browser 693 tests, 638 passed, 52 failed (all listed), 3 skipped.
- Flake (protocol applied, not baselined): the 38a5473a min-twins run at load 40–50 failed two tests in `features-status-tags-vocabulary.test.mjs`. The isolated rerun passed, and the clean full rerun had no new failures.

## HOST (at merge)
- BUG-016: log `pagehide` targets on details → Bookmarks. Confirm the Bookmarks page renders styled, with rows, after a details visit. Check back/forward.
- BUG-020: block the reviews endpoint on a details page with an own review. Expect the unavailable note and no Write a Review.
- BUG-011: the admin Hidden Content add modal with Seerr unreachable.
