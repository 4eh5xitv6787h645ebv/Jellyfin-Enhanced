# Spoiler Guard internals

HTTP endpoints live in `../api`, event consumers in `../events`, and pending Seerr protection
in `../integrations/seerr`. This directory owns Spoiler Guard policy, state resolution,
metadata processing, and image rendering.

| Directory | Responsibility |
| --- | --- |
| [metadata/](metadata/) | Field-strip filter, response traversal and metadata/media-source sanitizers |
| [images/](images/) | Image policy, rendering, response replacement and cache tags |
| [identity/](identity/) | User identity markers, image-tag identity and state resolution |
| [watch-state/](watch-state/) | Metadata/season watched state and next-unwatched boundaries |

The two MVC filters keep their existing registration, singleton lifetime, route
allowlists, constructor signatures, and public entry points. Their collaborators
are implementation details owned by the filters, so they need no separate DI
registration.

| Responsibility | Owner |
| --- | --- |
| Select metadata endpoints and resolve request user state | `SpoilerFieldStripFilter` |
| Traverse supported response shapes; select protected items by scope and watched state | `SpoilerMetadataResponseProcessor` |
| Apply admin/user/category policy to item metadata | `SpoilerMetadataSanitizer` |
| Scrub media streams and sources consistently across item and playback responses | `SpoilerMediaSourceSanitizer` |
| Resolve missing metadata watched state from the library, failing closed | `SpoilerMetadataWatchState` |
| Mutate image tags while preserving Jellyfin image versions | `SpoilerImageCacheTags` |
| Decide whether an image request needs protection | `SpoilerBlurImageFilter` |
| Read/replace image responses and apply cache headers | `SpoilerImageResponseWriter` |
| Cache season watched state and invalidate it on user-data events | `SpoilerSeasonWatchCache` |

The image filter disposes its season cache, which owns the event subscription.
The cache and its invalidation coalescing dictionary remain process-wide, with
the existing 30-second TTL. Metadata fallback lookups deliberately remain
uncached: they have different behavior from the image cache.

When adding a response shape, add its traversal in the response processor and
check materialization of lazy enumerables. Add field policy in the sanitizer;
keep shared media-source scrubbing in its helper so playback information and
item responses cannot drift. Preserve local index-based subtitle delivery URLs
and movie version labels. Movie chapter protection uses a strict earlier-than
comparison at the resume boundary.

Image rendering retains its parent-art, blur, stock-card and hardcoded-JPEG
fallback chain. Keep response replacement and cache headers together. Request
scope decisions remain in the filter; they are not rendering concerns.

Run the behavior checks from the repository root:

```sh
dotnet run --project src/features/spoiler-guard/tests/server/SpoilerGuard.Tests.csproj
```

These checks use the compiled plugin and real Jellyfin DTOs, including subtitle
playback URLs, chapter boundaries, series/episode policies and cache-tag
idempotence. They do not require a running Jellyfin server or user data.
