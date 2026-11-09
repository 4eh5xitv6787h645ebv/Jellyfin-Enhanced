# Bug-fix lane A (L1, L4)

Branch `bugfix/lane-a`, from `restructure/integration-k` e7f75cda. Each bug reproduces at e7f75cda; each fix commit adds its regression test, which failed before the fix and passes after it.

| Commit | Bugs | Regression tests |
|---|---|---|
| `da09b7a2` | BUG-001, BUG-002 | `features/media-tags/admin/admin-tags-identity.test.mjs` (new); `features-admin-config-media-tags-tab.test.mjs` "the page's Save persists after the Media Tags tab has loaded…"; both admin-tags fixtures use a strict `getUrl` |
| `d4ee2d0f` | BUG-004 | `features/bookmarks/features-bookmarks.test.mjs` "a replacement item name holding HTML…" |
| `85baee19` | BUG-005 | `requests/request-submission.test.mjs` "season modal success toast shows a show title holding HTML as text" ×2 |
| `8898cc30` | BUG-006 | `features/player/features-subtitles.test.mjs` (::cue rule, 2 decoding rows); `features/settings-panel/settings-panel-rewrite.test.mjs` "a crafted subtitle colour never breaks out…" |

## Gates

All gates were run with `env -u JE_UPDATE_SNAPSHOTS`.
- Commits 1–3: `all`, `size`, `inv`, `tool` and the jsdom suite on min twins (`JE_TEST_MIN_TWINS=1`).
- Commit 4 (frontend only, after the coordinator's lock change): `fe`, `inv`, `tool`, min twins and `size`.
- Final tree: `all` once, then `browser` once (`JE_BROWSER_PORT=4201`). Both ran under `flock /var/lib/jebench/projects/je-gate.lock`.

Results:
- Final `all`: passed. dotnet 3212 tests (3211 passed); npm 3842 tests (3833 passed, 9 failed, all listed).
- `browser`: passed. 693 tests: 638 passed, 52 failed (all listed), 3 skipped.
- `size`: raw 2375939 → 2376823 and gzip 639307 → 639781 (budget unchanged: 2494625 / 671156).
- Route/auth, auth-helper and registration snapshots are unchanged.

Flakes followed the flake protocol: an isolated rerun passed, then a clean full rerun passed. They were all AGENTS.md load-sensitive tests, plus one core-shared-boundaries run on min twins.
- c1: `seerr-review-boundaries` (`all`); `core-shared-boundaries` (min twins).
- c3: `core-api-runtime` retry jitter and `features-status-tags-vocabulary`; on the rerun, `bootstrap-loader-rewrite` idle slicing. The third `all` was clean.
- c4: `features-status-tags-vocabulary` ×2 and `seerr-review-r2` in an unlocked `all`. The locked `fe` rerun was clean.

## Baseline changes (all lowered; nothing raised)

- `escape-guard-baseline.json`:
  - `library-replacements.ts` `X1 install.showReplacementSelectionModal` 3 → 2;
  - `season-modal.ts` `X1 …showSeasonSelectionModal` 4 → 1, and `…fromItem` 1 → removed;
  - `ui-panel-template.ts` `X1 …buildPanelHtml` 134 → 133.
- `css-injection-guard-baseline.json`:
  - `subtitles.ts` `X2 applySubtitleStyles` 5 → 1;
  - `ui-panel-template.ts` `X2 …buildPanelHtml` 116 → 115.
- `baselines/npm-failures.txt` and `browser-failures.txt`: no change. No listed test turned green.
- Architecture baselines: no change. None of the touched files is listed.
