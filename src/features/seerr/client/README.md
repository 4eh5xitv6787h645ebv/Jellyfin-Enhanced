# Seerr frontend ownership

The public entry points keep their existing names on `window.JellyfinEnhanced`.
Declare module sources and named prerequisites in the owning feature’s `feature.json` descriptor, then run
`npm run generate` from the repository root. Helper modules must
load before their entry point; do not edit generated `plugin.js` to register them.
See [API ownership](api/README.md) for transport, identity caches and request side effects.

## Issue reporting

| Module | Responsibility |
| --- | --- |
| `issue-reporter.js` | Public `JE.jellyseerrIssueReporter` facade, detail-page eligibility, button placement and issue indicators |
| `issue-reporter-data.js` | Reporting availability, TMDB fallback and locally installed season/episode lookup |
| `issue-reporter-view.js` | Form/history markup, escaping, grouping and indicator styles |
| `issue-reporter-tv-controls.js` | Season/episode selection and context-specific locking inside one modal |
| `issue-reporter-modal.js` | Modal creation, existing-issue loading, submission validation and error feedback |

Keep submission payload construction in the modal owner. Disabled selectors still
supply their values on episode pages. Availability checks retain the existing
fail-open response to a status lookup error; actual submission reports failures.
Season discovery queries local Jellyfin contents before falling back to the
item's season count. History rendering escapes issue messages and user identities.

The entry point owns the page-level `viewshow` subscription. Selector listeners
belong to their modal elements; the shared `modal.js` owns removal of the modal.
Data lookups currently finish even if the modal closes, updating only their
captured modal subtree. They do not own page-navigation cancellation.

## Detail-page recommendations and Request More

| Module | Responsibility |
| --- | --- |
| `item-details.js` | Navigation registration, startup dispatch and cleanup ordering |
| `item-details-data.js` | Shared Jellyfin item lookup and Movie/Series TMDB resolution |
| `item-details-recommendations.js` | Similar/recommended fetches, filtering, card sections and DOM readiness observation |
| `item-details-request-more.js` | Unrequested-season check, heading/checker polling, Request More button and its styles |

Internal collaborators live under `JE.internals.jellyseerrItemDetails`.
Recommendations and Request More each own an abort controller and processed-item
set. Keep them separate: cancelling slower recommendation work must not cancel
Request More. Navigation teardown runs before dispatching the new item, aborts
both workflows and clears both deduplication sets. A negative Request More check
is cached until that teardown; a cancelled operation remains eligible for retry.

After each awaited operation, preserve abort checks before touching the DOM or
marking an item processed. Recommendation page readiness releases its shared
body-observer subscription on completion, timeout or abort. Request More uses
polling because heading readiness depends on class/text changes; its polling
removes timers and abort listeners when finished. Recommendation card replacement
releases poster observation before removing sections.

## Existing feature boundaries

- `ui/` owns shared cards, badges, buttons, quota, popovers, request/season dialogs
  and styles. Keep page orchestration outside these reusable view components.
- `moreinfo/` separates metadata, rendering, request actions, season handling,
  badges, styles and modal lifecycle. Its `init` owner handles modal close and
  navigation cleanup; asynchronous ratings verify the current modal identity.
- `recommendations/` separates catalog/data, rendering, page/category views,
  navigation and custom-tab integration. The navigation observer is currently
  page-lifetime state in `recommendations-init.js`; do not initialize it repeatedly.
- `discovery/` and `search/` own discovery feeds and search result orchestration.

These existing groups were retained because their boundaries already describe
specific responsibilities. The large more-info stylesheet remains a dedicated
style owner rather than being split by arbitrary line count.

## Regression checks

Run from the repository root:

```sh
node --test src/features/seerr/tests/client/issue-reporter.test.cjs src/features/seerr/tests/client/item-details.test.cjs
npm run check:static
```

The controlled tests cover availability/ID fallback, local season selection,
escaped issue history, submission payloads/errors, independent cancellation,
observer/timer cleanup and navigation ordering. They use controlled API and DOM
substitutes; live Jellyfin/Seerr rendering and network integration require the
repository's browser/integration checks.
