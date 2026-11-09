# Step 8 log, frontend C3 merge: groups B, A and C into `restructure/fe-c3` (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 8 (frontend C3), gates FE (`scripts/restructure-gates.sh fe`, INV and TOOL inside) and BROWSER. Group logs: [step8-c3b.md](step8-c3b.md), [step8-c3a.md](step8-c3a.md), [step8-c3c.md](step8-c3c.md). Previous step: [step7-frontend.md](step7-frontend.md).

Machine: JE worker on Alex's laptop (user `jebench`, shared with other jobs). Checkout: `/var/lib/jebench/projects/je-restructure-fe`. Origin: the local bare repo `/var/lib/jebench/projects/je-restructure.git`. The FE gate ran in the foreground. BROWSER ran detached, and the run was waited on to completion before anything else built or tested in this checkout. HOST is not part of this job.

## Branch and merges

`restructure/fe-c3` was branched from `origin/restructure/fe-c` (`7fdcc563`). The three groups were merged with `--no-ff`, in this order:

| # | merge commit | merged branch (tip) | group | conflicts |
|---|---|---|---|---|
| 1 | `e2a95b0c` | `origin/restructure/fe-c3b` (`1fe22628`) | B: catchup, activity, calendar, chrome | none |
| 2 | `448fd53b` | `origin/restructure/fe-c3a` (`e9d0af15`) | A: media-tags, settings-panel, hidden-content | none (generated files, the manifest and both baselines auto-merged) |
| 3 | `5adf5d6a` | `origin/restructure/fe-c3c` (`ab4afeaa`) | C: player, seerr, details-providers, downloads, spoiler-guard, settings | `tests/frontend/architecture/boundary-baseline.json`, `client/generated-manifest.json` |

This log is the last commit on the branch.

Git identity: this account has no `user.name` or `user.email`. The commits use the identity of the earlier restructure commits (`Jake <45441845+4eh5xitv6787h645ebv@users.noreply.github.com>`), set through `GIT_AUTHOR_*` and `GIT_COMMITTER_*` per command. The git config was not changed. There are no attribution trailers.

## Conflicts and resolutions

**Source files: no overlap.** `git diff --name-only fe-c...fe-c3{a,b,c} -- client/src` gives 15, 32 and 37 files, with no file in two lists. No `public-api.ts` was touched by more than one group, so there was nothing to reconcile in source.

**`tests/frontend/architecture/boundary-baseline.json` (merge 3).** A scratch script built the file from the base (`fe-c`) and every parent: `fe-c`, the pre-merge HEAD `448fd53b`, `fe-c3a`, `fe-c3b` and `fe-c3c`.
- It keeps a `(file, key)` only if it is present in all of them, which drops every key deleted on any side.
- Each kept count is the minimum across them.
- Keys are iterated from the base, so no key can be added.
- A check over all parents found no key added and no count raised.
- The file is written with `indent=2`, the UTF-8 `§` kept and a trailing newline, the same as the original.
- Merge 2 had already combined c3b's and c3a's deletions textually: 61 − 4 = 57. That is consistent with the per-key minimum.

**`client/generated-manifest.json` (merge 3).** This file was regenerated, not hand-merged.
- `scripts/client-build.mjs` parses the previous ledger for its orphan check, so the conflicted file was first replaced with the pre-merge side (`git checkout --ours`).
- Then `npm run client:build` and `npm run inventory:rewrite` were run.
- After the rebuild, only the manifest changed. All `Jellyfin.Plugin.JellyfinEnhanced/js/**` outputs and maps that git auto-merged, and the inventory files, were already byte-identical to a fresh build. Merge 3 alone brought 146 changed output files.
- `npm run client:check` and `npm run inventory:rewrite:check` then passed.

**`tests/frontend/architecture/size-baseline.json`** auto-merged. Only c3a changed it.

**Step logs:** `step8-c3a.md`, `step8-c3b.md` and `step8-c3c.md` are all kept unchanged.

## Boundary baseline totals

| tree | files | violations |
|---|---|---|
| `fe-c` (`7fdcc563`, base) | 50 | 85 |
| `fe-c3a` | 48 | 81 |
| `fe-c3b` | 39 | 61 |
| `fe-c3c` | 39 | 62 |
| after merge 1 (`e2a95b0c`) | 39 | 61 |
| after merge 2 (`448fd53b`) | 37 | 57 |
| **after merge 3 / `restructure/fe-c3`** | **26** | **34** |

The target was about 61 or fewer, and the merged result is 34. That is 51 fewer than the base: 4 from A, 24 from B and 23 from C. No key exceeds any parent. The FE gate's architecture tests reported no "improved"/"lower it" diagnostic, so the baseline is tight.

## Gates

**FE: `scripts/restructure-gates.sh fe`, passed.** This ran on `5adf5d6a`, the tree that this log commit leaves unchanged apart from the log itself.
- G: typecheck, build, inventory and `client:check`. All passed.
- INV: `generate.py --check` passed, and the route list is identical to `baselines/inventory-routes.txt`.
- TOOL: `tests/run.py tooling` and the mutation/history path check both passed.
- client-build tests and the bootstrap manifest passed.
- `npm test`: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9. All 9 are on the baseline list.
- Architecture: 4 ratchets, `feature-readme` and `file-size`. All passed.
- component-scripts.json and `client/entries` output keys match restructure-base.
- The script's last line was `restructure-gates: fe passed`.
- The working tree was clean afterwards.

**BROWSER: `JE_BROWSER_PORT=4194 npm run test:browser -- --workers=6` (693 tests), passed against the list.**

| tree | passed | failed | skipped | time | vs step6-browser-failures.txt (52) |
|---|---|---|---|---|---|
| `5adf5d6a` | 638 | 52 | 3 | 8.8 min | identical: 0 new, 0 listed-but-passed |

The comparison takes the sorted `[project] › file:line › title` lines from the run's "52 failed" block, with leading and trailing whitespace removed, and runs `comm` against the list.
- No new failure needed a `--repeat-each=5` rerun.
- The known flakes (`discovery-recommendations-rewrite.spec.cjs:70`, `tag-fit-monotonic.spec.cjs:93`) passed in all three projects.

Process notes:
- The run was started under `setsid`, which forked. The wrapper exited at once, and the run went on detached as process group `2946050` (npm) / `2946075` (playwright).
- It was waited on with `tail --pid` until it exited by itself. Nothing was killed, and no `pkill` was used.
- Port 4194 was free afterwards. The load average was about 4 at the start of the run.

## Violations left for C4 (34 in 26 files)

The full contents of `boundary-baseline.json` on this branch, by area. C4 (strict mode) cannot delete the baseline until each of these is resolved.

**host/ (15): S1-c, left for C4 as briefed**
- `host/bootstrap-pages-host.ts`: 6
  - host-imports of `features/calendar/types.ts` 1, `features/downloads/types.ts` 1 and `features/seerr/recommendations/types.ts` 1;
  - raw-global `JellyfinEnhanced` 3.
- Raw-global `JellyfinEnhanced` in the other host files: `host/dom-host.ts` 2, `host/ui-host.ts` 2, `host/admin-config-host.ts` 1, `host/api-host.ts` 1, `host/core-host.ts` 1, `host/navigation-host.ts` 1, `host/session-host.ts` 1.

**admin/ (2): S1-c**
- `admin/config/page/media-tags-tab.ts`: `internals *` 1 and `internals enhancedUi` 1.

**core/ (1)**
- `core/lifecycle-entry.ts`: raw-global `JellyfinEnhanced` 1.

**media-tags (10)** ([step8-c3a.md](step8-c3a.md) "Not converted", items 1–2)
- `internals enhancedUi` (settings-panel's slot), 4 reads: `admin/page.ts`, `admin/sections/layout.ts`, `admin/sections/portable.ts`, `editor/tag-item-editor.ts`.
- Imports of `features/settings-panel/host.ts`, 5: `settings/ui-panel-media-tags.ts`, `ui-panel-tag-editor.ts`, `ui-panel-tag-looks.ts`, `ui-panel-tag-portable.ts`, `ui-panel-tag-preview.ts`.
- `editor/tag-item-menu.ts`: `internals features` 1. This is hidden-content's `buildNativeActionSheetItem`, which needs a hidden-content facade method.
- The enhancedUi items need a coordinator decision, for two reasons:
  - More than 15 unit and browser tests load a tag panel without the settings-panel shell.
  - The options are (a) to make media-tags and hidden-content co-owners of `enhancedUi` in `internals-owners.json`, or (b) to accept a load-order dependency on the shell and change those tests.

**hidden-content (1)**
- `settings/ui-panel-hidden-content.ts`: import of `features/settings-panel/host.ts` 1. This is the same `enhancedUi` registry question as media-tags.

**settings-panel (3)**
- `ui-panel.ts` and `ui-panel-template.ts`: `internals spoilerGuard`, 1 each. They read `buildSettingsHtml` and `wireSettings`.
- `ui-panel-shortcut-editor.ts`: `internals canonicalCombo` 1. This is chrome's slot, and it needs a chrome facade member.

**seerr (1)**
- `details/moreinfo/actions-entry.ts`: `internals spoilerGuard` 1. This is `JE.internals.spoilerGuard.appendSeerrToggle`.
- It needs three changes:
  1. spoiler-guard publishes `appendSeerrToggle` (together with `buildSettingsHtml` and `wireSettings` for settings-panel) on `JE.spoilerBlur`;
  2. seerr calls `ctx.peer('spoilerBlur')`;
  3. the stub at `tests/frontend/pages/pages-seerr-details-moreinfo.test.mjs:361` moves to the facade.

**details-providers (1)**
- `details-page.ts`: `internals *` 1. It reads `JE.internals ??= {}` only for media-tags' `peopleTags` slot (`prefetch` and `leave`).
- It needs media-tags to publish `peopleTags` as a peer facade.

No violations are left in catchup, activity, calendar, chrome, player, downloads, spoiler-guard or settings.

Follow-ups noted by the groups that are not violations:
- c3b deviation 2: `FeatureContext.own` is one flat namespace. A facade and an internals slot with the same name (calendar's `calendarPage`) throw `Cannot redefine property`. `host/context.ts` should either split the namespaces or reject overlapping keys.
- c3a/c3b/c3c: peers are typed by the consumer, not from the owner's `public-api.ts`. Moving these is a types-only follow-up.
- c3b: catchup's pure helpers are copied in `catchup/wire.ts`, with the originals still in `activity/host.ts`. They can be merged into `features/shared/`.

## Product bugs

None were fixed. The merge showed no new symptom: no failure outside the list, and no test that reads differently from the group lanes. The 52 listed failures are the step-6 set, and they reproduce identically in all three browser projects. Their symptoms, recorded only:
- settings matrix, overflow and panel focus/teardown cases;
- the hub and adminPage previews' Hover view: `tag-genre-names.spec.cjs:136`, where the admin page times out waiting for `.je-tag-admin [role="tab"]`;
- modal Escape/focus cases: `flows.spec.cjs:29`, `seerr-details-rewrite.spec.cjs:85`;
- on mobile only, the header More menu and splash in `chrome-rewrite.spec.cjs`;
- on firefox only, seerr card requests: `seerr-core-rewrite.spec.cjs:56/69/80`.

## Deviations

1. **BROWSER ran detached.** `setsid` forked, so the first background wrapper returned at once. The run was then tracked by its process group and waited on to completion before any further work in this checkout.
2. **Git identity was set per command** through environment variables, as described under "Branch and merges". The config was not changed.
