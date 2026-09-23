# Host HTTP endpoints

This directory contains the endpoints that expose plugin configuration, host compatibility,
and embedded assets. Feature endpoints live with their implementations under
`src/features/<feature>/api`; Seerr cache invalidation used by configuration updates and
scheduled imports is `SeerrCacheInvalidation` in `src/features/seerr/server/`.

Every concrete controller retains the `JellyfinEnhanced` route prefix. File placement does not
change client URLs. Authorization, request limits, content types, cache metadata, and parameter
binding remain explicit on each action.

| Endpoint area | Source directory |
| --- | --- |
| Administration and embedded assets | `src/host/api` |
| Bookmarks, reviews, and user settings | `src/features/bookmarks/api`, `reviews/api`, `user-settings/api` |
| Hidden content and Spoiler Guard | `src/features/hidden-content/api`, `spoiler-guard/api` |
| Library details, playback, and tags | `src/features/item-details/api`, `playback/api`, `tags/api` |
| Seerr connections, discovery, requests, and synchronization | `src/features/seerr/api` |
| Arr connections, downloads, and calendar | `src/features/arr/api`, `downloads/api`, `calendar/api` |
| Ratings, activity, and active streams | `src/features/ratings/api`, `activity/api`, `active-streams/api` |
| Appearance, maintenance, and usage | `src/features/appearance/api`, `maintenance/api`, `analytics/api` |

`src/shared/identity/UserControllerBase.cs` contains current-user and authorization helpers.
`src/features/seerr/api/SeerrProxyControllerBase.cs` adds Seerr transport, parental filtering,
and error conversion. Both are abstract and publish no actions.

To add an endpoint, choose its feature, explicitly declare its HTTP route and authorization,
and inject only the dependencies it uses. Put application operations in that feature's
`server` directory and external adapters in `integrations`. Keep controller helpers
private/protected; an unannotated public instance helper can become an MVC action. Add
behavior coverage and deliberately update `tests/compatibility/api` when the HTTP contract
changes. Public payload types stay beside the API that owns them.
