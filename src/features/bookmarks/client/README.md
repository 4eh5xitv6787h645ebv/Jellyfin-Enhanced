# Bookmarks

`bookmarks.js` remains the player feature's public entry point. It publishes
`JE.bookmarks`, `JE.initializeBookmarks()` and `JE.cleanupBookmarks()`; shortcuts,
the bookmarks library and other features should use those APIs.

The player modules load in this order before the entry point:

| Module | Responsibility |
| --- | --- |
| `bookmarks-model.js` | Bookmark IDs, pure provider/episode matching and timestamp formatting |
| `bookmarks-items.js` | Current OSD item identification, Jellyfin item/series metadata lookup and cache |
| `bookmarks-store.js` | `bookmark.json` mutations, update events, episode backfill and orphan maintenance |
| `bookmarks-markers.js` | Timeline marker DOM and seeking |
| `bookmarks-modal-styles.js` | Dialog CSS, embedded when a modal is created |
| `bookmarks-modal.js` | Dialog markup, form actions and dialog-scoped listeners |
| `bookmarks.js` | Public API composition, OSD button and player lifecycle |

Internal collaborators live at `JE.internals.bookmarks`. Dependencies are named
at the top of each module; modules do not start observers or register global
listeners simply by loading. The entry's initializer owns player event listeners
and observers, and its cleanup removes them before a later reinitialization.
Each modal owns its navigation listener until the close animation completes.

The existing `bookmarks-library-*` modules own the separate full-library view,
using `JE.internals.bookmarksLibrary` for their internal collaborators. Their
render module reuses the player's timestamp formatter. Library entry and player
entry remain separate because they mount and unmount in different views.

To change matching rules, edit the model and its characterization cases. Matching
prefers exact Jellyfin item IDs, then provider IDs. Episode metadata restricts
provider matching when present; legacy bookmarks without it retain provider-only
matching. To change persisted fields or migration behavior, edit the store and
item metadata modules together and verify serialized settings compatibility.

To add a player interaction, keep settings mutations in the store and DOM work in
the modal or marker module. Preserve `je-bookmarks-updated` event reasons because
library views listen for those notifications. Register new module sources and named prerequisites in `../feature.json`; internal dependency order is part of the feature contract.

Run characterization checks from the repository root:

```sh
node --test src/features/bookmarks/tests/client/bookmarks.test.cjs
```

These checks cover enabled/disabled loading, matching, serialized episode fields,
provider precedence, cached lookups, add/sync failure rollback, public mutations,
player lifecycle cleanup, marker seeking and modal listener disposal. Jellyfin
API responses and DOM controls are controlled substitutes; they do not replace a
browser smoke check against a running server.
