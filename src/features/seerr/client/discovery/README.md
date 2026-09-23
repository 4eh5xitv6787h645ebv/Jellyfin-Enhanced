# Discovery sections

The five `*-discovery.js` feature modules resolve Jellyfin metadata into Seerr
results and declare a `DiscoverySpec`. They register through the existing
`JE.discoveryBase.createDiscovery(spec)` API and call `start()` once.

| Module | Responsibility |
| --- | --- |
| `discovery-base.js` | Route lifecycle, config gates, processed-page deduplication, request cancellation, metrics and retry entry point |
| `discovery-page-host.js` | Router view snapshots, stale-page detection, page readiness, section markup and temporary reattachment |
| `discovery-dual-feed.js` | Server paging for separate TV/movie feeds, partial success, retries, prefetch, filter and sort generations |
| `discovery-client-pager.js` | Local sorting/filtering and chunked rendering of a resolved list |
| `discovery-filter-utils.js` | Shared filter/sort state and controls, managed requests, card rendering and scroll/page-readiness adapters |
| `genre-discovery.js`, `tag-discovery.js`, `network-discovery.js` | Feed ID resolution and API paths for a dual-feed spec |
| `person-discovery.js` | Person lookup and deduplicated cast/crew results for a client-paged spec |
| `collection-discovery.js` | BoxSet lookup and one-shot missing-movie rendering |

Load the filter utilities and the three controller dependencies before
`discovery-base.js`, then load the feature specs. The frontend module registry
owns that ordering; do not load the controller dependencies independently from
feature code.

## State and cancellation

Each `createDiscovery` call owns its lifecycle and one mode-specific pager. The
pager receives a page host, a completion callback, and (for dual feeds) request
access through `signal()` and `replace()`. Pagination fields stay private to the
pager; lifecycle code does not mutate page counters or result arrays.

The lifecycle aborts outstanding work on navigation and user changes before
cleaning up the pager. A sort replaces the signal while retaining the section.
A filter change retires the dual-feed load generation without aborting cacheable
requests. A stale load must neither commit counters nor clear a newer load's
loading flag. These distinctions are intentional.

`complete(pageKey)` must run only after successful DOM attachment. Failed or
aborted work must remain retryable. One-shot specs instead return `true` after
attachment, allowing the lifecycle to record completion.

The page host remembers the hash associated with a router `viewshow` event. Do
not clear this snapshot unconditionally on navigation: Back can announce the
restored view before `popstate`. Its list signature compares content because
Jellyfin can reuse both the page element and its children for another route.

## Adding or changing a section

Choose an existing spec mode before adding a controller. Dual-feed specs provide
`resolveFeeds` and `buildDiscoverPath`; client-paged specs provide `resolveItems`;
one-shot specs provide `renderOneShot`. The complete contract is documented next
to `DiscoverySpec` in `discovery-base.js`. Keep media identity lookup and feature
labels in the spec, and paging behavior in its controller.

Preserve the feature `key`: it controls CSS selectors, request-cache prefixes,
filter state, metrics and lifecycle registration. Preserve configuration gates
and URL parsing as well. In particular, network discovery remains opt-in and
uses its historical page-key format; collection headings and layout deliberately
differ from the filterable sections.

## Regression checks

Run from the repository root:

```sh
node --test src/features/seerr/tests/client/discovery.test.cjs
```

The tests execute the browser scripts in a Node VM with controlled DOM/request
boundaries. They cover retry and partial-success bookkeeping, sort/filter races,
identity cleanup, router anchoring, the TMDB page limit and local chunk ordering.
They do not replace browser tests of layout or a live Seerr integration.

During the extraction, the same ten scenarios also passed against the original
base implementation. To replay against a separately saved baseline locally,
set `JE_DISCOVERY_BASELINE` to that JavaScript file when running the command.
