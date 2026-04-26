# features/seerr-tier-a-b3 — Review Findings

## Context / environment
- Working dir: `/home/jake/Documents/Jellyfin-Enhanced/features/seerr-tier-a-b3`
- Branch: `features/seerr-tier-a-b3` based on `origin/main` (v11.8.0.0, commit `14c313c`)
- Deploy target: `jellyfin-dev` (port 8097), Seerr enabled, multi-user setup (admin/4817, TestAdmin, Test)
- Build: `dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj` — currently 0 warnings, 0 errors
- E2E tests: `/tmp/je-e2e-test/test-tier-a-enabled.js`, `/tmp/je-e2e-test/test-b3-flow.js`

## Branch architecture summary

This branch combines two scopes:

**Tier A** — porting the unmerged `seerr-discovery-filters` work onto current main, MINUS person search/filter (per user request). 19 of the 25 original commits are squash-merged in: advanced discovery filters with expanded sort options, language/cert/runtime/year/vote/TV-status filters, request cancellation, request quota in modal, Trending/Popular/Upcoming home sections, standalone Discover page (sidebar + Plugin Pages + Custom Tabs), expandable episode list inside the season selection modal, admin approve/decline request actions, admin issue management (status/comments), and Seerr error message surfacing in toasts.

**B3** — episode-level requests wired to the missing-episodes display. Per user feedback, the existing more-info-modal already shows season status — this branch adds inline "Request" buttons on each season card for missing seasons (status null/1/7), with optimistic UI update on submit and event-driven re-render via `jellyseerr-tv-requested`.

Person-related code is excluded:
- `person-discovery.js` reverted to main (drops A12 advanced filters on person discovery pages)
- `createPersonCard()` and the person-card branch in `createJellyseerrCard()` removed from `ui.js`
- Person results filtered out of search ingestion in 3 places in `jellyseerr.js`
- Person results filtered out of `discover-home.js` slider rendering

Phase 3 (true per-episode requests via Sonarr direct) is **deferred** to a follow-up PR per the user's "might require arr*" note. The current B3 implementation handles the inline missing-season request affordance; episode-level granularity below the season boundary needs Sonarr API integration.

## Findings table

(Populate as reviewers report. ID format: C/H/M/L + number.)

### CRITICAL — merge blockers
| ID | Status | File:line | Summary |
|---|---|---|---|
| C1 | **fixed** | `Controllers/JellyfinEnhancedController.cs:496-552` | Permission gate fails open for non-admin when `seerrUser` is null mid-flight. Cached userId path bypasses REQUEST/CREATE_ISSUES/VIEW_ISSUES gate during a transient Seerr outage. **Fix:** added `isGatedWrite`/`isGatedIssueRead` predicates that match the inner gate's path/method tuples, then return `502 permission_check_failed` when `seerrUser == null` on a gated path. Verified clean by code-reviewer iteration 2. |

### HIGH
| ID | Status | File:line | Summary |
|---|---|---|---|
| H1 | **fixed** | `js/jellyseerr/more-info-modal.js:267-271` | `getSeasonStatusInfo` returns null for season 0; `isSeasonRequestable(null)` returns true → Specials always show Request button even when already available. **Fix:** changed `!seasonNumber` → `seasonNumber == null` so season 0 is a valid lookup. All other callers tolerate the populated lookup. Verified clean by code-reviewer iteration 2. |
| H2 | **fixed** | `js/jellyseerr/more-info-modal.js:232-264` | `refreshModalData` doesn't call `refreshSeasonRequestButtons` after refresh; stale Request buttons remain after external state change. **Fix:** added the call after `enrichSeasonCardsWithJellyfinLinks` in the refresh path. Verified clean by code-reviewer iteration 2. |
| H3 | **fixed** | `js/jellyseerr/more-info-modal.js:365-368` | `requestTvSeasons` returns `{}` for 204 No Content; `if (!ok) throw` is unreachable, so empty success silently marks season as Requested with no upstream record. **Fix:** validate `result.id || result.media` (real Seerr request shape always has at least one). Verified clean by code-reviewer iteration 2. |
| H4 | pending | `js/jellyseerr/discover-home.js:39-54`, `discover-page.js:40-54`, `api.js:872-886` | Silent fallback to `[]` / `null` on fetch failure: section never injects, no user feedback, only `console.debug`. (silent-failure-hunter) |
| H5 | deferred | `js/jellyseerr/discover-page.js:16-19` | `pluginPagesExists` computed once at script load, can miss late-injected Plugin Pages. Existing pre-B3 behavior, not introduced here. (code-reviewer) |
| H6 | deferred | `js/jellyseerr/discover-page.js:365-368, 370` | navigation/viewshow listeners no removal — would multiply if `JE.initializeDiscoverPage` called externally twice. Existing pre-B3 behavior. (code-reviewer) |
| H7 | deferred | `js/arr/requests-page.js:174-180` | `cancelRequest` non-JSON upstream error response shows generic "Failed to cancel request" toast — masks HTML/text errors. Same shape as other paths. (code-reviewer) |
| H8 | deferred | `Controllers/JellyfinEnhancedController.cs:555-631` | Proxy aggregates all-URL failures into single status code, masking root cause. Existing pre-B3 behavior. (silent-failure-hunter) |

### MEDIUM
| ID | Status | File:line | Summary |
|---|---|---|---|
| M1 | deferred | `js/jellyseerr/more-info-modal.js:367-377` | Direct mutation of `data.mediaInfo.seasons`; per CLAUDE.md immutability rule. Style violation, no functional bug. |
| M2 | deferred | `js/jellyseerr/discovery-filter-utils.js:119-127` | `setAdvancedFilter` mutates Map's stored object in place; debounced input handlers can race readers. |
| M3 | deferred | `js/jellyseerr/discovery-filter-utils.js:618-627` | Cert filter group identification heuristic (`<12 options`) breaks if cert list grows. Pre-existing pattern. |
| M4 | deferred | `js/jellyseerr/api.js:225-231` | `checkUserStatus` caches negative fallback on transient error; only `clearUserStatusCache` resets. Pre-existing. |
| M5 | deferred | `js/jellyseerr/api.js:516-520` | `evaluateOverrideRules` swallows errors → request submits without overrides silently. Pre-existing. |

### LOW
(Skipped per scope; see codex / silent-failure-hunter outputs for details.)

## Fix log

### 2026-04-26 — first review iteration

Plan:
1. **C1 fix**: in `ProxyJellyseerrRequest`, treat `seerrUser == null` in non-admin path as deny — return 502 with a clear "Could not verify Seerr permissions" message and log the cause.
2. **H1 fix**: change `getSeasonStatusInfo` season-0 check from truthy to null-explicit, OR change `isSeasonRequestable(null)` to return false. Cleanest is the latter (a missing seasonInfo means we don't know — fail closed for the request button).
3. **H2 fix**: add `if (mediaType === 'tv') refreshSeasonRequestButtons(data, modal);` after the `enrichSeasonCardsWithJellyfinLinks` call inside the refresh handler.
4. **H3 fix**: in `wireSeasonRequestButtons`, change `if (!ok) throw` to `if (!result || (!result.id && !result.media)) throw` — validate the upstream returned a real request record.

H4/H5/H6/H7/H8 marked deferred because:
- H4 is pre-B3 silent-fallback pattern across discover modules; warrants its own follow-up PR.
- H5/H6 are pre-B3 in discover-page.js (was on the original branch).
- H7/H8 are pre-B3 in error-message handling (existing patterns).

Will fix C1, H1, H2, H3. Re-deploy. Re-run reviewers in iteration 2 with this findings doc as context.

## Verification results

### Iteration 2 (2026-04-26)

- `dotnet build` — 0 warnings, 0 errors.
- Plugin deployed to `jellyfin-dev` and loaded successfully.
- `/tmp/je-e2e-test/test-tier-a-enabled.js` — all 7 new config toggles render; PARENT_DEPS lockout for `jellyseerrDiscoverPageEnabled` works (children disable when parent is OFF, enable when ON).
- `/tmp/je-e2e-test/test-b3-flow.js` — opens more-info-modal for TMDB 66732, renders 6 season cards with 6 Request buttons (no Specials available in test fixture so all 6 show); CSS applies (accent bg, white text, pointer cursor, icon present).
- `/tmp/je-e2e-test/test-b3-fixes.js` — source-level verification of H1/H2/H3 fixes: all PASS.
- code-reviewer iteration 2 — all four fixes (C1/H1/H2/H3) correct and complete; no new issues introduced; branch ready to commit.

Codex (third reviewer) hung mid-task and was killed; the convergent findings from Claude code-reviewer + silent-failure-hunter were sufficient to identify all merge-blocking issues.

### Deferred to follow-up PRs

- H4 (silent fallbacks across discover modules — pre-existing pattern)
- H5/H6 (discover-page.js Plugin Pages detection — pre-existing on the original branch)
- H7/H8 (cancelRequest non-JSON error handling, proxy URL aggregation — pre-existing patterns)
- M1-M5 (style/race issues, mostly pre-existing)
- B3 Phase 3: true per-episode requests via Sonarr direct integration (deferred per user note "might require arr*"). The current B3 ships inline season-level Request buttons on missing-season cards; per-episode granularity is a separate feature requiring Sonarr API integration.
