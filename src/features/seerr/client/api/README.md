# Seerr API ownership

`../api.js` is the public `JE.jellyseerrAPI` facade and shared transport. The
frontend module manifest loads these installers before that facade, which passes
each installer its API object and transport functions. Consumers continue to use
the existing method names on `JE.jellyseerrAPI`.

| Module | Responsibility |
| --- | --- |
| `status.js` | Linked-user status, status banners, identity-scoped cache |
| `catalog.js` | Search, movie/TV metadata, collections and related media |
| `overrides.js` | Request rule caching and first-match rule evaluation |
| `requests.js` | Request submission, invalidation/events, advanced options, quota and watchlist |
| `issues.js` | Issue lookup and submission using Seerr's internal media ID |

Add an endpoint method to its owning installer. Use the injected `get`, `tmdbGet`
or `post` functions so authentication, cache keys, retries and concurrency remain
owned by the shared core client. `post` deliberately disables retries. Avoid
capturing another module's method before composition completes; call it through
the injected `api` when the operation runs.

Status and override-rule caches reset on Jellyfin user changes. In-flight responses
check the session epoch before entering either cache. Successful status stays
cached for the SPA session; unsuccessful status expires after 60 seconds. Request
settings preserve their last successful value during upstream outages, matching
the existing request-modal behavior.

Successful full-media and season requests share one completion path for cache
invalidation, UI events, usage tracking and best-effort watchlist handling. Keep
these effects after a successful POST and preserve movie versus TV events.

Run the controlled API/session regression tests from the repository root:

```sh
node --test src/features/seerr/tests/client/seerr-api.test.cjs
```

These tests exercise route/payload compatibility, user changes and stale responses,
cache expiry, cancellation, matching rules and mutation failure behavior. They do
not require a live Seerr server.
