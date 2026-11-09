# Lane L-B log: S3 controller splits, DetailsProviders and MediaTags (2026-11-09)

Plan: [PLAN.md](../PLAN.md) gates BE/INV/TOOL and the S3 row (step 11); [backend.md](../backend.md) §4 (S3 row and brief) and §7.9 (over-cap controllers are split into partials by sub-area as pure moves, not allow-listed); [step8-backend.md](step8-backend.md); coordinator decision **D5** (partial boundaries). Machine: JE worker on Alex's laptop (16 cores, shared with lanes lc/ld), clone `/var/lib/jebench/projects/je-restructure-lb` at `2abd5e3d` (step 8 merged). No containers. Gates were run one at a time, backgrounded and waited on.

**Status: both splits are committed on `restructure/be-s3-splits` (from `2abd5e3d`) and pushed to `origin`. `be`, `inv` and `tool` pass and the snapshots are unchanged. H was skipped on this machine (see Gates).** `JeDownloadsController` (1,421 lines) was not touched: under D5 it is split after step 9 merges.

## Commits

| Commit | Subject |
|---|---|
| `50506587` | `refactor(server): S3 split JeDetailsProvidersController into partials` |
| `1f78776b` | `refactor(server): S3 split JeMediaTagsController into partials` |
| (this log) | `docs(restructure): lane L-B log` |

Each split commit contains: the controller files, `tests/docs/production-inventory.json` regenerated with `python3 tests/inventory/generate.py` (step action; only per-route `file` paths and the file list change, still 202 routes), and the one-sentence controller paragraph in `docs/advanced/api.md` that names the new files, as S2.11 did for `.Admin.cs`. Nothing else changed: no tests, snapshots, baselines, `client/`, `js/`, `tests/frontend` or `tests/browser`.

## Partial boundaries (D5, line numbers re-derived at `2abd5e3d`)

**`Features/DetailsProviders/JeDetailsProvidersController.cs`** (1,499 lines, 28 routes). The class line changed from `public class` to `public partial class` (its only edit besides the cuts).
- **`.Reviews.cs`** ← original L539–1029: from the `// ─── User Reviews` banner through `AdminDeleteReview`. It holds the 7 `reviews/*` routes (`GET reviews/{mediaType}/{tmdbId}`, `GET reviews/ratings`, `POST reviews/{mediaType}/{tmdbId}`, `POST reviews/admin/{userIdN}/{mediaType}/{tmdbId}`, `DELETE reviews/{mediaType}/{tmdbId}`, `GET reviews/admin/all`, `DELETE reviews/admin/{userIdN}/{mediaType}/{tmdbId}`) and their helpers: nested `ReviewPayload`, `IsValidRating`, `_tmdbIdRegex`, `_tmdbIdExtendedRegex`, `IsValidTmdbKey`, `MaxReviewRatingKeys`, `MirrorReviewRatingToUserData`. No line outside the block used any of these.
- **`.Arr.cs`** ← original L1100–1497: the 5 `arr/*` routes (`arr/identify-url`, `arr/series-slug`, `arr/series-slugs`, `arr/links`, `arr/movie-instances`) and their helpers `BuildNoArrInstancesResult`, `BuildArrLookupResult`, `ArrLinksBatchMaxIds`, `ArrLinksPerInstanceConcurrency`, `_arrLinksInstanceGates`, `ParsePositiveIdList`, `LookupArrLinksBatchAsync`, `IsInstanceWideArrError`. None is used outside the block. `_arrInstanceClient` is a constructor field and stays in the main file.
- **Main file** keeps the fields, the constructor, `SetExternalDataCacheHeaders`, anilist, translate (nested `TranslateRequest`), awards, mdblist-ratings, ddd (incl. `ddd-triggers.json`), `elsewhere.json` and item-stats/file-size/watch-progress (16 routes).

**`Features/MediaTags/JeMediaTagsController.cs`** (1,530 lines, 13 routes; already `partial`, so its class line is unchanged).
- **`.TagCache.cs`** ← original L442–1372 (`GET tag-cache/{userId}`, the `_tagCacheJsonOptions` / `_tagCacheSerializationGate` / `TagCacheJsonOptions()` block, `POST tag-data/{userId}`) and L1480–1528 (`LoadSpoilerStateForTagStrip`, which only `GetTagCache` and `GetTagData` call, so it moves with them).
- **Main file** keeps tag-styles, status-tags/*, audio-language-tags, `logo/{size}/{file}`, `user-settings/{userId}/media-tags/*`, `PreviewBody`/`SkipBody` (also used by `.Admin.cs`) and `native-poster-tags/preview/{itemId}` (11 routes). `.Admin.cs` is unchanged (7 routes).

No boundary had to be adjusted: every file is under 1,200 lines on the first cut.

Each new file has the same header: the full `using` block of the file it was cut from (as `.Admin.cs` did in S2.11), the same namespace, and `    public partial class <Controller>` with no attributes or base list. `[Route]`/`[ApiController]` and `: JeControllerBase` stay on the main declaration.

## Line counts

| File | Routes | Lines |
|---|---:|---:|
| `Features/DetailsProviders/JeDetailsProvidersController.cs` | 16 | **608** (was 1,499) |
| `Features/DetailsProviders/JeDetailsProvidersController.Reviews.cs` | 7 | **543** (50 header + 491 moved + 2 braces) |
| `Features/DetailsProviders/JeDetailsProvidersController.Arr.cs` | 5 | **450** (50 header + 398 moved + 2 braces) |
| `Features/MediaTags/JeMediaTagsController.cs` | 11 | **547** (was 1,530) |
| `Features/MediaTags/JeMediaTagsController.TagCache.cs` | 2 | **1,034** (51 header + 981 moved + 2 braces) |
| `Features/MediaTags/JeMediaTagsController.Admin.cs` | 7 | 203 (unchanged) |

Routes in total are unchanged at DetailsProviders 28 and MediaTags 20; the inventory has 202 routes.

## Pure-move proof

Two independent checks per commit, both run on the committed trees:

1. **`git diff -M --color-moved=plain <base> <commit> -- Jellyfin.Plugin.JellyfinEnhanced`**, keeping only the lines git does *not* colour as moved: for both commits these are only `using …` lines, `namespace …`, `{`/`}`/`    {`/`    }`, `    public partial class <Controller>` and, for DetailsProviders, the `public class` → `public partial class` declaration line. Filtering those out leaves **nothing**.
2. **Line-equality script** (below), `proof.py <base> <commit> <main.cs> <new.cs>…`. Removed lines are the `-` lines of the main file's diff, minus the class-declaration line. Added lines are each new file minus its header (using/blank/namespace/brace/partial-class lines; any other header line fails the script) and its two closing braces.

```
50506587  JeDetailsProvidersController.cs: removed 891 body lines; + lines: ['    public partial class JeDetailsProvidersController : JeControllerBase']
          .Reviews.cs: 543 = 50 header + 491 moved + 2 closing braces
          .Arr.cs:     450 = 50 header + 398 moved + 2 closing braces
          multiset of non-blank lines (exact text): EQUAL
          ordered non-blank sequence: EQUAL (774 lines)
          blank lines: removed 117, added 115 (separator blanks at the cut points)
1f78776b  JeMediaTagsController.cs: removed 983 body lines; + lines: []
          .TagCache.cs: 1034 = 51 header + 981 moved + 2 closing braces
          multiset of non-blank lines (exact text): EQUAL
          ordered non-blank sequence: EQUAL (924 lines)
          blank lines: removed 59, added 57 (separator blanks at the cut points)
```

So every non-blank line (indentation included) appears in the new file in the same order. The only differences are 2 blank lines per controller: each cut takes the separator blank line before or after its block, so the main files keep single blank lines between members. In MediaTags this also drops a pre-existing double blank before `native-poster-tags/preview`.

<details><summary>proof.py</summary>

```python
#!/usr/bin/env python3
"""Pure-move proof. usage: proof.py <base-rev> <head-rev|WORKTREE> <main.cs> <new.cs>...
Removed lines = `-` lines of `git diff -U0 base head -- main` (minus the class-declaration line).
Added lines   = `+` lines of the main diff (must be only the class declaration) + every line of each new file,
                minus its header (using lines, blank, `namespace`, `{`, `    public partial class X`, `    {`)
                and its closing `    }` / `}`.
Checks: (1) removed == added as multisets of non-blank lines (exact text, indentation included);
        (2) the non-blank removed lines, in order, equal the non-blank added lines in file order;
        blank-line counts are reported (the cut points drop separator blanks)."""
import subprocess, sys, collections, re
base, head, main, *new = sys.argv[1:]
rng = [base] if head == 'WORKTREE' else [base, head]
diff = subprocess.run(['git', 'diff', '-U0', *rng, '--', main], capture_output=True, text=True, check=True).stdout.split('\n')
rem = [l[1:] for l in diff if l.startswith('-') and not l.startswith('---')]
add_main = [l[1:] for l in diff if l.startswith('+') and not l.startswith('+++')]
decl = re.compile(r'^    public (partial )?class \w+')
rem_decl = [l for l in rem if decl.match(l)]; rem = [l for l in rem if not decl.match(l)]
print(f'{main}: removed {len(rem)} body lines; main-file + lines: {add_main}; class decl - lines: {rem_decl}')
assert all(decl.match(l) for l in add_main), 'main file has + lines other than the class declaration'
added = []
def show(p): return subprocess.run(['git', 'show', f'{head}:{p}'], capture_output=True, text=True, check=True).stdout if head != 'WORKTREE' else open(p).read()
for p in new:
    ls = show(p).split('\n')
    if ls and ls[-1] == '': ls = ls[:-1]
    i = 0
    header = []
    while not decl.match(ls[i]): header.append(ls[i]); i += 1
    header.append(ls[i]); i += 1
    assert ls[i] == '    {'; header.append(ls[i]); i += 1
    assert ls[-2:] == ['    }', '}'], ls[-2:]
    body = ls[i:-2]
    bad = [h for h in header if not (h.startswith('using ') or h == '' or h.startswith('namespace ') or h == '{' or decl.match(h) or h == '    {')]
    assert not bad, f'unexpected header lines in {p}: {bad}'
    print(f'{p}: {len(ls)} lines = {len(header)} header + {len(body)} moved + 2 closing braces')
    added += body
cr, ca = collections.Counter(rem), collections.Counter(added)
nb = lambda xs: [x for x in xs if x.strip()]
cnr, cna = collections.Counter(nb(rem)), collections.Counter(nb(added))
print('multiset of non-blank lines (exact text):', 'EQUAL' if cnr == cna else f'DIFF removed-only={dict(cnr-cna)} added-only={dict(cna-cnr)}')
print('ordered non-blank sequence:', 'EQUAL' if nb(rem) == nb(added) else 'DIFF', f'({len(nb(rem))} lines)')
print(f'blank lines: removed {cr[""]}, added {ca[""]} (separator blanks at the cut points)')
sys.exit(0 if cnr == cna and nb(rem) == nb(added) else 1)
```
</details>

## Gates

All runs used `env -u JE_UPDATE_SNAPSHOTS`, with node v26.13.0 and dotnet 10.0.401.

**`be`** (B, G, T ∥ frontend suite, rest of F, INV, TOOL):
```
DetailsProviders tree (50506587 content), run 1 of 1:
  B: 1 Warning(s), 0 Error(s): the baselined CS8604 Features/Bookmarks/JeBookmarksController.cs(50,45)
  G: Passed!  - Failed: 0, Passed: 11, Skipped: 0, Total: 11
  T (dotnet test): total 3193 (baseline 2980), passed 3192 (baseline 2979), failed 1 (baseline list 1)
  npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
  Production inventory is current; INV route list: no diff; tooling: passed; TOOL path check: no new line
  restructure-gates: be passed
MediaTags tree (1f78776b content), run 5 (runs 1-4: see "Frontend timing flakes"):
  B/G/T/INV/TOOL identical to the above; npm test: total 3787, passed 3778, failed 9 (baseline list 9)
  restructure-gates: be passed
```
**`inv`** and **`tool`**, run on each committed tree (`50506587` and `1f78776b`): `restructure-gates: inv passed`, `restructure-gates: tool passed` (16 runner tests, no new mutation-check line).

**`h` was not run here.** The H gate needs Node 26.2.0 exactly and this machine has v26.13.0. The MediaTags split is inside a MediaTags namespace, so H applies to it: **the coordinator runs `h` on the Lenovo at merge.**

**Snapshots unchanged:** `git diff 2abd5e3d HEAD -- tests/backend/Architecture` is empty (`route-auth`, `auth-helper-calls`, `service-registrations` `.snapshot.json`), and G passed against them on every run. `artifacts/restructure-plan/baselines/` is unchanged. `JE_UPDATE_SNAPSHOTS` was never set, and no snapshot or baseline was updated.

**`ApiSeerrProxyOutcomeTests.RealSocketWriteOnAReusedConnectionIsSentOnce`** (the known dotnet flake) did not fail in any run here.

## Frontend timing flakes (not product bugs, not fixed)

The first four `be` runs on the MediaTags tree each failed on **exactly one** frontend test that was not in `baselines/npm-failures.txt`, a different test each time. Everything else passed in all of them: B, G (snapshots), T at 3192/3193, INV and TOOL. Each failure came with load averages of 16–26 on 16 cores from the other lanes.

| Run | Failing test | Assertion |
|---|---|---|
| 1 | `requests/seerr-review-boundaries.test.mjs :: SEERR-CORE-22: repeated close restores history once` | `history.state` still had `jeSeerrModal: '…:1'` (expected `{ index: 1 }`) |
| 2 | `requests/seerr-review-r2.test.mjs :: R2 disposed TV picker leaves next dialog Escape and focus intact: back` | `true !== false` (L105) |
| 3 (`JE_TEST_CONCURRENCY=8`) | `requests/seerr-review-boundaries.test.mjs :: SEERR-CORE-22: Request consumes its history entry and preserves host state` | `history.state` still had `jeSeerrModal: '…:1'` (expected `{ hostRoute: 'home' }`) |
| 4 | `features/features-status-tags-vocabulary.test.mjs :: badge rule: season: a later season airing also proves completion` | got `['newEpisode','New Episode']`, expected `['complete_season','Complete Season']`: the series facts arrived after `h.flush()` |
| 5 | none | `be passed` |

Why the change is not the cause:
- The branch does not change `client/`, `js/`, `tests/frontend` or `tests/browser`.
- These tests run client code in the jsdom harness and read no `.cs` file. `features-status-tags-vocabulary` reads only `js/locales/en.json`.
- In isolation, `seerr-review-boundaries` passed 15/15 (34 tests) and `features-status-tags-vocabulary` passed 10/10 (104 tests).
- Running the two Seerr files together under load (average about 25) failed 4 of 12 runs, alternating between `SEERR-CORE-22: repeated close…` and `R2 disposed TV picker…: back`.
- Control under the same lower load (about 9–12): with the MediaTags change stashed, i.e. on `50506587`, 0/12 failed; with it applied, 0/12 failed.

**Repro:** run `TZ=UTC LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node --test --test-timeout=300000 tests/frontend/requests/seerr-review-r2.test.mjs tests/frontend/requests/seerr-review-boundaries.test.mjs` in a loop while the machine is CPU-saturated (load average > 20 on 16 cores). These are test-harness timing assumptions (modal history and async facts settling within a fixed flush), not product behaviour. They are recorded here and not added to any list.

## Notes for S3 / the coordinator

- **`JeMediaTagsController.TagCache.cs` (1,034 lines)** is under the cap, but `GetTagCache` + `GetTagData` alone are about 930 lines. A later cap cut could split tag-cache and tag-data, but this lane does not.
- The main-file `<summary>` comments were left unchanged, as a pure move. `JeDetailsProvidersController`'s comment still lists reviews and *arr links among its providers, which describes the class, not the file.
- `JeDownloadsController` (1,421) remains over the cap until its post-step-9 split.
- No product bugs found.
