# Performance Optimization Plan V2 - 133 New Items (EVALUATED)

These are in addition to the 95 items in the original PERFORMANCE_PLAN.md.

## Summary

| Status | Count |
|--------|-------|
| ALREADY DONE | 21 |
| GOOD IDEA | 79 |
| MAYBE | 29 |
| BAD IDEA | 3 |
| WONT WORK | 1 |
| **Total** | **133** |

---

## Items 1-33: HTTP Caching, Shared Item Cache, Request Optimization

### 1. Remove `?v=${Date.now()}` from script loading and replace with version-based cache busting
**Status:** GOOD IDEA
**Notes:** Every script load appends `Date.now()`, which means ~40+ scripts are re-downloaded on every page load, completely defeating browser caching. Replacing with `?v=${JE.pluginVersion}` (which is already fetched from `/JellyfinEnhanced/version`) would allow the browser to cache all scripts until the plugin actually updates. This is one of the highest-impact, lowest-risk optimizations available.

### 2. Add `Cache-Control: public, max-age=31536000, immutable` + ETag to GetScriptResource() responses
**Status:** GOOD IDEA
**Notes:** Currently `GetScriptResource()` at line 1542 returns a bare `FileStreamResult` with no cache headers. Since scripts are embedded resources that only change on plugin updates, adding immutable cache headers (paired with version-based cache busting from item 1) would eliminate redundant downloads entirely. Safe because the version query string already handles invalidation.

### 3. Add same cache headers/ETag to /locales/{lang}.json
**Status:** GOOD IDEA
**Notes:** The `GetLocale` endpoint (line 1526) also returns a bare `FileStreamResult` from embedded resources. Locale files change even less frequently than scripts, so adding cache headers with version-based busting would prevent re-downloading translation files on every session. Zero risk.

### 4. Make /public-config cacheable with short TTL + ETag
**Status:** GOOD IDEA
**Notes:** `public-config` is fetched twice during initialization (once in `loadPluginData()` at line 193, once in `loadLoginImageEarly()` at line 288), and its content only changes when an admin saves plugin configuration. A short TTL (e.g., 60 seconds) with ETag support would save a full round-trip on duplicate requests and subsequent page loads with minimal staleness risk.

### 5. Make /private-config cacheable with ETag too
**Status:** MAYBE
**Notes:** Private config is fetched once per initialization (line 220) and contains sensitive keys like Jellyseerr API URLs. Adding ETag/304 support would save bandwidth on reloads, but the benefit is marginal since it is only one request per session. Worth doing if you are already implementing the pattern for public-config, but lower priority on its own.

### 6. Make user settings endpoints support ETag + 304
**Status:** MAYBE
**Notes:** Five user settings files are fetched on every initialization (lines 400-415). Adding ETag support would save bandwidth on page reloads when settings have not changed. However, the complexity of computing ETags for JSON config files stored on disk, combined with the `?_=${Date.now()}` cache busters already in the URLs, means this requires removing those cache busters first. Moderate benefit, mod...

### 7. Stop fetching public-config twice (loadPluginData and login image)
**Status:** GOOD IDEA
**Notes:** `loadPluginData()` (line 193) and `loadLoginImageEarly()` (line 288) both independently fetch `/JellyfinEnhanced/public-config`. The login image check runs immediately at boot before `initialize()` even starts. Sharing a single cached promise or moving the login image check into the main init flow would eliminate one redundant network call per page load with zero risk.

### 8. Replace 150ms URL polling with navigation events
**Status:** MAYBE
**Notes:** The codebase already uses `Emby.Page.onViewShow` hooks (helpers.js line 38), `hashchange`, `popstate`, and `history.pushState` monkey-patching (qualitytags.js line 907) for navigation detection. The 150ms polling exists specifically in `calendar-page.js` and `requests-page.js` for pushState-based navigation that does not fire events. Replacing it requires wrapping `history.pushState`/`replaceSt...

### 9. Create a shared "item details" cache in JE core
**Status:** GOOD IDEA
**Notes:** Multiple modules independently call `ApiClient.getItem(userId, itemId)` for the same item: `features.js` (line 939, 651), `hidden-content.js` (line 174, 1611), `bookmarks.js` (line 93), and tag modules. The helpers module already has a basic `cachedItem`/`cachedItemId` pattern (line 22-23) but it only covers one item at a time and is not shared. A small LRU cache keyed by itemId on `JE` would d...

### 10. Add a request coalescer so if 10 modules ask for same item, 1 network call
**Status:** GOOD IDEA
**Notes:** This is essentially what `helpers.js` does at a basic level with `fetchInProgress` (line 103), and `request-manager.js` does with `deduplicatedFetch` (line 154). However, these are scoped to their own modules. Extending the helpers' `getItemFromHash` pattern or creating a global `JE.getItem(itemId)` that deduplicates in-flight promises would consolidate duplicated API calls across features.js, ...

### 11. Add AbortController cancellation for in-flight requests on navigation
**Status:** ALREADY DONE
**Notes:** The `request-manager.js` already implements `AbortController` management with `getAbortSignal()` (line 207), `abortAllRequests()` (line 221), and `abortRequest()` (line 232). Individual modules like jellyseerr discovery pages already use these. However, the tag modules and features.js do NOT use AbortController, so extending coverage to those would be a valid enhancement, making this partially ...

### 12. Only run tag logic for visible cards using IntersectionObserver
**Status:** ALREADY DONE
**Notes:** All four card tag modules (qualitytags.js line 137, genretags.js line 139, ratingtags.js line 79, languagetags.js line 55) already create `IntersectionObserver` instances with `rootMargin: '200px'` and `threshold: 0.1`. Visible elements are processed first with `isPriority = true`. This optimization is fully implemented.

### 13. Build JE.api.getItemCached with dedup + TTL + stale-while-revalidate
**Status:** GOOD IDEA
**Notes:** This is the specific implementation of items 9 and 10 combined. Currently each tag module maintains its own localStorage cache (qualitytags uses `JellyfinEnhanced-qualityTagsCache`, genretags uses `JellyfinEnhanced-genreTagsCache`, etc.) plus hot in-memory Maps. A unified `JE.api.getItemCached()` with dedup, TTL, and stale-while-revalidate would reduce boilerplate across all modules and elimina...

### 14. Centralize ApiClient.getCurrentUser() into one cached promise
**Status:** MAYBE
**Notes:** `ApiClient.getCurrentUserId()` is called frequently (dozens of call sites across all modules), but it is typically a synchronous property access on the existing ApiClient object, not a network call. `ApiClient.getCurrentUser()` (the full user object) is less common in this codebase. Caching the user ID would add complexity for negligible gain since it is already in-memory. Only worth doing if p...

### 15. Centralize ApiClient.getCurrentUserId() reads
**Status:** MAYBE
**Notes:** Same reasoning as 14. `ApiClient.getCurrentUserId()` appears to be a synchronous getter in the Jellyfin web client, not a network call. Centralizing it to `JE.userId` would reduce a few microseconds of function call overhead but would not reduce network requests. Low priority unless it is discovered to have side effects in certain Jellyfin versions.

### 16. Add a single "item batcher": collect IDs over 50-100ms and fetch via Items endpoint
**Status:** GOOD IDEA
**Notes:** Currently each tag module fetches items one at a time (`fetchItemQuality`, `fetchItemGenres`, `fetchItemLanguages`, `fetchItemRatings`). The Jellyfin API supports batch fetching via `/Users/{userId}/Items?Ids=id1,id2,...&Fields=MediaStreams,Genres,...`. Collecting IDs over a short window and making one batch request instead of 20+ individual requests would dramatically reduce network overhead. ...

### 17. Monkey-patch/wrap ApiClient.getItems to store results in shared cache
**Status:** BAD IDEA
**Notes:** Monkey-patching `ApiClient.getItems` is fragile and could break on Jellyfin web client updates since `ApiClient` is not a stable public API. It could also introduce subtle cache invalidation bugs when items are modified (e.g., user marks as played). The same benefit can be achieved more safely with a dedicated wrapper function like item 13 proposes.

### 18. Tags consume shared normalized item model from cache instead of fetching individually
**Status:** GOOD IDEA
**Notes:** Currently quality, genre, language, and rating tags each independently fetch the same item with slightly different `Fields` parameters. If a shared cache stored the item with a superset of needed fields (e.g., `MediaStreams,MediaSources,Genres,CommunityRating,CriticRating,Type`), all tag modules could read from it. Combined with batching (item 16), this could reduce per-card API calls from 4 to...

### 19. Use field-minimization: request only needed fields
**Status:** ALREADY DONE
**Notes:** The tag modules already request specific Fields. Quality tags request `MediaStreams,MediaSources,Type,Genres` (line 582), rating tags request `CommunityRating,CriticRating` (line 118), language tags request `MediaStreams,MediaSources,MediaInfo,Type` (line 133). People tags hit a dedicated `/JellyfinEnhanced/person/{id}` endpoint. The only concern is that field-minimization conflicts with the sh...

### 20. Add progressive enrichment: render with known data, enrich when idle
**Status:** GOOD IDEA
**Notes:** Currently, cards show loading spinners or nothing until API responses arrive. If cached data is available (e.g., from localStorage), the tag could render immediately from cache and then refresh in the background via `requestIdleCallback`. The tag modules partially do this already (check cache first, then queue fetch), but they do not do stale-while-revalidate. Adding `requestIdleCallback`-based...

### 21. Add "do nothing if already tagged" checks before queueing any request
**Status:** ALREADY DONE
**Notes:** All tag modules already implement this. Quality tags check `processedElements.has(element)` and `isCardAlreadyTagged(element)` (line 800-804). Genre tags do the same (line 367-370). Rating tags check `processedElements.has(el)` (line 189). Language tags check both `processedElements` and `isCardAlreadyTagged` (line 352-355). The `TAGGED_ATTR` data attributes provide an additional DOM-level dedu...

### 22. If a card has no data-id, avoid any work early
**Status:** ALREADY DONE
**Notes:** All tag modules extract the item ID early and return if not found. Quality tags: `if (!itemId) return;` (line 809). Genre tags: `if (!itemId) return;` (line 399). Rating tags: `if (!itemId || !itemType...) return;` (line 201). Language tags: `if (!itemId) return;` (line 379). The early bail-out pattern is consistently applied.

### 23. When view is in ignore selector (admin pages), bail before scanning DOM
**Status:** ALREADY DONE
**Notes:** All tag modules define `IGNORE_SELECTORS` arrays that include admin pages like `#pluginsPage`, `#pluginCatalogPage`, `#devicesPage`, `#mediaLibraryPage` (e.g., qualitytags.js lines 29-44). The `shouldIgnoreElement()` function checks these before processing. The hidden-content module also skips image editor cards and admin dialogs (line 1687).

### 24. Add a global rate limiter shared across all modules
**Status:** MAYBE
**Notes:** The `request-manager.js` already implements concurrency control with `maxConcurrent: 4` and `maxQueueSize: 50` (line 22-25), but this only governs Jellyseerr API calls. Each tag module has its own independent queue with its own concurrency limit (quality: 4, genre: 3, rating: 5, language: 4). A global rate limiter would prevent bursts when all tag modules activate simultaneously on a page with ...

### 25. Add a global per-host limiter (Jellyfin vs Jellyseerr vs TMDB)
**Status:** MAYBE
**Notes:** Currently Jellyseerr calls go through the request-manager with concurrency limits, but Jellyfin API calls (from tags, features, hidden-content) have no global limit. TMDB calls are proxied through the Jellyfin server anyway, so they share the Jellyfin limit. A per-host limiter adds significant complexity. The bigger wins come from reducing total request count (batching, caching) rather than lim...

### 26. Cache negative results (404/empty) with TTL
**Status:** ALREADY DONE
**Notes:** Multiple modules already cache negative results. `features.js` caches unavailable file sizes with `unavailable: true` (line 446) and empty audio languages (line 663, 695). `jellyseerr/api.js` caches failed user status with `{ active: false, userFound: false }` (line 118). The tag modules cache items that return no qualities/genres/languages by not storing them but also not re-fetching due to `p...

### 27. Store "last processed DOM revision" per page route
**Status:** MAYBE
**Notes:** The tag modules use `processedElements = new WeakSet()` which is reset on navigation (qualitytags.js line 899). This is functionally similar but element-level rather than DOM-revision-level. A DOM revision counter would allow skipping the MutationObserver callback entirely when no new cards have been added, which would reduce the overhead of the debounced scan functions. However, the debounced ...

### 28. Use requestIdleCallback for non-urgent fetches
**Status:** ALREADY DONE
**Notes:** `requestIdleCallback` is already used extensively throughout the codebase. The `_cacheManager` uses it for deferred saves (plugin.js line 39). `features.js` uses it for watch progress, file size, and audio language fetches (lines 372, 450, 700). All tag modules use it for queue processing (qualitytags.js line 674, genretags.js line 273, ratingtags.js line 249, languagetags.js line 194).

### 29. Add document.visibilityState gating: pause fetching when tab hidden
**Status:** GOOD IDEA
**Notes:** No module currently checks `document.visibilityState` or listens to the `visibilitychange` event. When users switch tabs, all MutationObserver callbacks, queue processing, and periodic operations continue running needlessly. Adding a simple `if (document.hidden) return;` guard to the tag scan functions and queue processors would save CPU and network resources when the tab is in the background, ...

### 30. Add "network budget" mode: defer non-critical calls while page loading
**Status:** MAYBE
**Notes:** This would require defining which calls are "critical" (e.g., config, user settings) versus "non-critical" (e.g., tag quality fetches, watch progress) and implementing a state machine. The existing `requestIdleCallback` usage and IntersectionObserver-based lazy loading already achieve a similar effect organically. The added complexity of a formal budget system may not justify the marginal impro...

### 31. Avoid fetching series/parent for every episode: cache series lookups
**Status:** ALREADY DONE
**Notes:** Multiple modules already cache series lookups. `hidden-content.js` maintains a `parentSeriesCache` Map (line 20) with deduplication via `parentSeriesRequestMap` (line 21) and batch lookups (line 1265). `bookmarks.js` has `itemDetailsCache` (line 74) that caches per-item details including series info. The tag modules for quality/genre/language fetch the first episode of a series and cache the re...

### 32. For hidden-content/spoiler logic, cache boundary checks per series/season
**Status:** ALREADY DONE
**Notes:** `hidden-content.js` caches parent series lookups in `parentSeriesCache` (line 20), uses `sectionSurfaceCache` WeakMap (line 22) for section-level surface detection caching, and deduplicates in-flight requests via `parentSeriesRequestMap` (line 21). The batch parent series check (line 1265) fetches up to 50 items at a time with their SeriesId field and caches all results. This is well-optimized.

### 33. For people tags, cache people lists by itemId
**Status:** ALREADY DONE
**Notes:** `peopletags.js` implements multi-level caching for person data: an in-memory `Hot.peopleTags` Map (line 70), a localStorage-backed `peopleCache` (line 67), and per-item tracking via `processedPersonIds` Set (line 73) and `processedCastMembers` WeakSet (line 72). Cache keys combine `personId-itemId` (line 153) to handle age-at-release calculations correctly. The `lastProcessedItemId` (line 74) r...

---

## Items 34-70: Cross-Module Sharing, Lazy Loading, Startup

### 34. Reuse MediaStreams result from quality tags for language tags
**Status:** GOOD IDEA
**Notes:** Currently `qualitytags.js` fetches items with `Fields: "MediaStreams,MediaSources,Type,Genres"` and `languagetags.js` independently fetches with `Fields: "MediaStreams,MediaSources,MediaInfo,Type"`. Both need MediaStreams for the same item IDs. A shared item data cache (keyed by itemId with the union of needed fields) could eliminate redundant API calls when both tags are enabled simultaneously...

### 35. Reuse rating data already present in item from shared cache
**Status:** GOOD IDEA
**Notes:** `ratingtags.js` fetches items with `Fields: "CommunityRating,CriticRating"` separately, but `qualitytags.js` already fetches the full item object (which includes CommunityRating and CriticRating on the base item). If quality tags fetches were to include these fields and store the full item in a shared cache, rating tags could consume it directly without its own API call. This is a straightforwa...

### 36. Ensure Promise.all with concurrency limit for getItem inside loops
**Status:** ALREADY DONE
**Notes:** Each tag module (quality, language, genre, rating) already implements a request queue with bounded batch sizes (e.g., `MAX_CONCURRENT_REQUESTS: 4` in quality tags, batch of 4 in language tags, 3 in genre tags, 5 in rating tags). The `processRequestQueue` pattern with `splice(0, N)` and `Promise.allSettled` ensures concurrency is limited. Additionally, `request-manager.js` provides `withConcurre...

### 37. Add client-side memoization for expensive transforms (codec parsing, HDR detection)
**Status:** MAYBE
**Notes:** The codec parsing and HDR detection in `getEnhancedQuality()` are string comparisons and regex matches on small inputs, which are fast and not truly expensive. The results are already cached by item ID in both hot cache (`Map`) and localStorage. Memoization of the transform itself would only help if the same MediaStreams data were re-analyzed repeatedly for the same item before caching, which t...

### 38. Persist hot item cache in sessionStorage for fast back/forward within session
**Status:** GOOD IDEA
**Notes:** Currently the `_hotCache` is purely in-memory (`Map` objects) and is lost on full page reloads or back/forward navigation that triggers a fresh script load. The localStorage cache survives but requires JSON parsing on load. Using sessionStorage for the hot cache would provide faster deserialization on back/forward while being automatically cleaned up when the tab closes. The benefit is moderate...

### 39. Use stale-while-revalidate semantics so UI is instant while refresh happens quietly
**Status:** GOOD IDEA
**Notes:** The tag modules currently either serve from cache or queue a fetch; they do not serve stale data while revalidating in the background. Since tag caches have 30-day TTLs, entries rarely expire, but when they do, the user sees a delay. Adding stale-while-revalidate would show cached data immediately (even if slightly expired) and silently fetch fresh data to update both the DOM and cache. This is...

### 40. Add explicit JE.cache.clearOnPluginUpdate(pluginVersion) to avoid cache-bust by Date.now
**Status:** GOOD IDEA
**Notes:** The plugin currently uses `?v=${Date.now()}` on every script tag, meaning every page load re-downloads all JS files with no browser caching. Switching to `?v=${pluginVersion}` would allow browser caching of scripts across page loads within the same plugin version and only bust the cache on actual plugin updates. The plugin version is already fetched via `/JellyfinEnhanced/version`. This could s...

### 41. Deduplicate Arr/Jellyseerr/TMDB requests by canonicalizing URLs and using shared fetch wrapper
**Status:** ALREADY DONE
**Notes:** The `request-manager.js` already provides `deduplicatedFetch()` which shares in-flight requests for identical cache keys, along with a response cache (`getCached`/`setCache`). The `jellyseerr/api.js` `managedFetch()` function uses both deduplication and caching through the request manager when available. TMDB requests go through `tmdbGet()` which also uses cache keys based on the path.

### 42. Add Accept-Encoding for compression
**Status:** BAD IDEA
**Notes:** Browsers automatically send `Accept-Encoding: gzip, deflate, br` on all requests; adding it manually provides no benefit. Compression is a server-side concern (ASP.NET Core / Jellyfin's Kestrel server). The client-side plugin code cannot influence server compression configuration, and manually adding the header would be redundant with what the browser already does.

### 43. Prefer ApiClient.ajax consistently for unified auth handling
**Status:** GOOD IDEA
**Notes:** The jellyseerr `request-manager.js` uses raw `fetch()` with manually constructed auth headers (`X-Jellyfin-User-Id`, `X-Emby-Token`), while the fallback path uses `ApiClient.ajax`. The Jellyfin API calls in tag modules consistently use `ApiClient.ajax`. Standardizing on `ApiClient.ajax` (or wrapping it) would ensure auth tokens, base URLs, and error handling are always consistent. However, `fet...

### 44. Add exponential backoff with jitter for transient 5xx from proxy endpoints
**Status:** ALREADY DONE
**Notes:** The `request-manager.js` already implements `fetchWithRetry()` with exponential backoff and jitter (`calculateBackoff()` with `jitterFactor: 0.3`), retrying on statuses `[408, 429, 500, 502, 503, 504]` up to 3 attempts with a 30-second time budget. The quality tags module also has its own retry mechanism (`MAX_RETRIES: 2`).

### 45. Add lightweight request fingerprint logger in dev mode
**Status:** GOOD IDEA
**Notes:** The `request-manager.js` already has a `metrics` system with `enabled: false` by default, tracking request URLs, attempts, statuses, and durations via `startMeasurement`/`endMeasurement`. Extending this to log a fingerprint of each unique request (URL, timing, cache hit/miss) when enabled would be straightforward and useful for identifying redundant or slow requests during development without r...

### 46. For infinite scroll pages, avoid tagging cards that are off-screen or not yet painted
**Status:** ALREADY DONE
**Notes:** All tag modules already use `IntersectionObserver` with `rootMargin: '200px'` and `threshold: 0.1` to only process elements when they are near or within the viewport. The quality tags module explicitly prioritizes visible elements (`isPriority = true` in `handleIntersection`), and non-visible elements are only observed, not processed, until they scroll into view.

### 47. For calendar and requests pages, cache API results by query params in memory for short TTL
**Status:** GOOD IDEA
**Notes:** The calendar and requests pages make API calls to `/JellyfinEnhanced/arr/calendar` and `/JellyfinEnhanced/arr/queue` on every navigation to those pages. While the Jellyseerr API module has caching via `request-manager.js`, the Arr API calls in these page modules appear to make fresh fetches each time. Adding a short TTL (30-60 second) in-memory cache keyed by the query params would prevent redu...

### 48. For downloads queue, cache results for 2-5 seconds even while polling
**Status:** GOOD IDEA
**Notes:** The requests page polls via `setInterval` at a configurable interval (default 30 seconds). However, `loadAllData()` is called unconditionally on each poll tick without checking if data was recently fetched by a manual refresh or navigation. Adding a minimum stale interval (2-5 seconds) before re-fetching would prevent wasteful duplicate requests when a user manually triggers a refresh close to ...

### 49. If multiple tabs open, coordinate via BroadcastChannel to share public-config and version
**Status:** MAYBE
**Notes:** The `BroadcastChannel` API is not currently used anywhere in the codebase. Sharing public-config and version across tabs could avoid redundant fetches of these rarely-changing values. However, `public-config` and `version` are each fetched only once per tab during initialization, so the savings are minimal (two small requests per additional tab). The complexity of cross-tab coordination may not...

### 50. Coordinate via BroadcastChannel to share plugin resources warmed state across tabs
**Status:** BAD IDEA
**Notes:** The "warmed state" includes DOM-attached elements (MutationObservers, IntersectionObservers, WeakSet of processed elements) and in-memory caches that are inherently tab-specific and cannot be serialized or shared. The shared localStorage/sessionStorage caches already provide cross-tab persistence for the cacheable data. The complexity of BroadcastChannel coordination for state that is fundament...

### 51. Don't load every script at startup - split into core + feature bundles loaded on demand
**Status:** GOOD IDEA
**Notes:** The `initialize()` function in `plugin.js` loads all 40+ component scripts upfront via `loadScripts(allComponentScripts, basePath)` before any initialization. Scripts for disabled features (e.g., Jellyseerr, Arr, various tags) are loaded even if never used. Splitting into a core bundle (config, helpers, icons, events, features) loaded eagerly, plus feature bundles loaded conditionally based on ...

### 52. Only load Arr scripts if Arr enabled in public-config
**Status:** GOOD IDEA
**Notes:** Currently all six Arr scripts (`arr-links.js`, `arr-tag-links.js`, `requests-page.js`, `calendar-page.js`, `requests-custom-tab.js`, `calendar-custom-tab.js`) are loaded unconditionally even though their initialization is already gated by `JE.pluginConfig?.ArrLinksEnabled` and `JE.pluginConfig?.CalendarPageEnabled` etc. Moving the conditional check earlier to the script-loading phase would avoi...

### 53. Only load Jellyseerr scripts if Jellyseerr enabled
**Status:** GOOD IDEA
**Notes:** All 14 Jellyseerr scripts are loaded unconditionally, but initialization of `JE.initializeJellyseerrScript` and related functions is already gated by `JE.pluginConfig?.JellyseerrEnabled`. Given these are the largest group of feature scripts, conditionally loading them only when Jellyseerr is enabled would meaningfully reduce startup overhead for users who do not use Jellyseerr integration.

### 54. Only load tag scripts if any tags enabled in user settings
**Status:** GOOD IDEA
**Notes:** The five tag scripts (quality, genre, rating, language, people) are always loaded but only initialized if their respective settings are enabled. Since user settings are available before script loading in Stage 2, the loading phase in Stage 3 could conditionally skip tag scripts when all tag settings are disabled. This would save downloading and parsing ~2000 lines of JavaScript for users who di...

### 55. Only load bookmarks scripts if bookmarks enabled
**Status:** MAYBE
**Notes:** The bookmarks scripts (`bookmarks.js`, `bookmarks-library.js`) are relatively small and bookmarks initialization (`JE.initializeBookmarks`) is called unconditionally without a config gate. It is unclear if there is a dedicated enable/disable setting for bookmarks, making conditional loading harder to determine. If bookmarks are always enabled for all users, conditional loading provides no benefit.

### 56. Only load pause screen/player overlays when entering playback routes
**Status:** GOOD IDEA
**Notes:** `pausescreen.js` and `osd-rating.js` are playback-specific features that are only relevant when a user enters video playback. Loading them eagerly on every page means their code is parsed even on the home page, library browsing, and settings pages. Deferring their load until a playback route is detected (e.g., monitoring for `.videoPlayerContainer` or the playback hash) would reduce initial bun...

### 57. Only load hidden-content page code when those routes visited
**Status:** GOOD IDEA
**Notes:** Three scripts handle hidden content (`hidden-content.js`, `hidden-content-page.js`, `hidden-content-custom-tab.js`). The page and custom-tab scripts are only meaningful when the user navigates to the hidden content management view. While `hidden-content.js` (core filtering) needs to be available on library pages, the page/tab scripts could be deferred until the relevant route is visited.

### 58. Add tiny loader registry like JE.loadFeature('qualitytags')
**Status:** GOOD IDEA
**Notes:** This would formalize the lazy-loading pattern suggested by items 51-57. A registry like `JE.loadFeature('qualitytags')` could return a promise, track loaded state, handle deduplication, and provide a clean API for modules that depend on each other. The existing `loadScripts()` function is close but lacks per-feature granularity. This would be a good foundational piece to build the conditional l...

### 59. Replace per-file script tags with one bundled JS file (build-time)
**Status:** GOOD IDEA
**Notes:** Currently 40+ individual script tags are injected, each with its own HTTP request. Even though HTTP/2 multiplexing helps, a single bundled file would eliminate the overhead of individual requests, script tag creation, and `Date.now()` cache-busting per file. A build step (e.g., using esbuild or rollup) could concatenate scripts in dependency order and produce a single minified file, reducing to...

### 60. If keeping separate files, group into fewer requests (bundle per category)
**Status:** GOOD IDEA
**Notes:** If a full bundling solution (item 59) is not feasible, grouping scripts by category (e.g., one bundle for `enhanced/*.js`, one for `tags/*.js`, one for `jellyseerr/*.js`, one for `arr/*.js`) would reduce 40+ requests to ~6-7 requests. This is a pragmatic middle ground that preserves modularity for development while reducing HTTP overhead in production.

### 61. Make script resources cacheable so repeat navigations don't re-download
**Status:** GOOD IDEA
**Notes:** The `loadScripts()` function appends `?v=${Date.now()}` to every script URL, which completely defeats browser caching. Every Jellyfin SPA navigation that triggers re-initialization re-downloads all scripts. Switching to `?v=${JE.pluginVersion}` (the version is already available) would allow the browser to cache scripts and only re-download when the plugin is actually updated. This is arguably t...

### 62. Add link rel=preload for most critical next script after plugin.js
**Status:** MAYBE
**Notes:** Since scripts are loaded dynamically via `document.createElement('script')`, the browser's preload scanner cannot discover them. Adding `<link rel="preload" as="script" href="...">` for the most critical early scripts (like `config.js`, `helpers.js`, `translations.js`) could start their download earlier. However, the scripts use `ApiClient.getUrl()` which is only available at runtime, making it...

### 63. For external CDN CSS (metadata icons), add rel=preconnect to CDN host
**Status:** GOOD IDEA
**Notes:** The plugin loads CSS from `cdn.jsdelivr.net` (metadata icons) and `fonts.googleapis.com` (Material Symbols). Adding `<link rel="preconnect" href="https://cdn.jsdelivr.net">` and `<link rel="preconnect" href="https://fonts.googleapis.com">` early in initialization would allow the browser to establish TCP/TLS connections to these CDNs sooner, reducing latency when the actual CSS resources are req...

### 64. Defer non-critical initialization until after first paint
**Status:** GOOD IDEA
**Notes:** The `initialize()` function runs all feature initializations synchronously in sequence after script loading. Features like colored activity icons, plugin icons, letterboxd links, and theme selector are non-critical and could be deferred using `requestIdleCallback` or `setTimeout(fn, 0)` to allow the browser to paint the page sooner. The splash screen currently blocks until all initialization co...

### 65. Add first meaningful paint goal: don't run tag scanning until page settles
**Status:** ALREADY DONE
**Notes:** Tag modules already defer their initial scan with `setTimeout(renderVisibleTags, 1000)` (quality tags), `setTimeout(scanAndProcess, 500)` (language, genre, rating tags). They also use debounced mutation observers (400-600ms debounce) and `IntersectionObserver` to avoid scanning until the DOM has settled and elements are visible. The `requestIdleCallback` is used in queue processing to further d...

### 66. Stop doing heavy work while splashscreen active unless required
**Status:** MAYBE
**Notes:** The splash screen is shown during initialization (Stage 1-6) and hidden only after all components are initialized. The issue is that the splash screen serves as a loading indicator for the plugin itself; if heavy work were deferred until after the splash is hidden, it would shift the loading experience to after the splash disappears, potentially causing a janky post-splash experience. A better ...

### 67. Replace wait-for-ApiClient-then-setTimeout-retry loops with single ready promise
**Status:** GOOD IDEA
**Notes:** The current initialization uses multiple `setTimeout` retry loops: `loadSplashScreenEarly` retries every 50ms, `loadLoginImageEarly` retries every 50ms, `initialize` retries every 300ms, and `helpers.js` retries every 100ms -- all polling for `typeof ApiClient === 'undefined'`. A single shared `JE.ready` promise that resolves when ApiClient and user ID are available would let all modules `await...

### 68. Add global init barrier so modules don't all spin readiness checks
**Status:** GOOD IDEA
**Notes:** This is the structural counterpart to item 67. Beyond just replacing the retry loops, a formal init barrier would ensure modules load in the correct order and don't start their own readiness polling. The current pattern has at least 4 independent polling loops plus `helpers.js` polling for `Emby.Page`. A centralized barrier (e.g., `JE.whenReady(['apiClient', 'userId', 'embyPage'])`) would be cl...

### 69. Ensure every module guards against double-init (idempotent init)
**Status:** MAYBE
**Notes:** Most modules do not explicitly guard against being called twice. The `reinitialize*` functions do clean up before re-initializing (removing DOM elements), but the main `initialize*` functions assume single invocation. The `bookmarks.js` has a double-init check per the grep results. In practice, double-init is unlikely because `plugin.js` calls each init function once, but defensive guards would...

### 70. Make language/translation loading non-blocking: show UI with English keys then patch
**Status:** GOOD IDEA
**Notes:** Currently `loadTranslations()` is awaited during Stage 1 initialization, blocking all subsequent stages. If translations are slow to load (e.g., GitHub CDN latency for remote translations), this delays the entire plugin startup. Since the `JE.t()` function already falls back to returning the key itself when no translation is found, displaying English keys initially and then patching the DOM whe...

---

## Items 71-94: DOM Observation, Tag Rendering, Virtualization

### 71. Replace route polling intervals with event-driven navigation detection (History API / Emby hooks)
**Status:** ALREADY DONE
**Notes:** The `helpers.js` module already hooks into `Emby.Page.onViewShow` for event-driven navigation detection (line 38). Quality tags also monkey-patches `history.pushState` and listens to `popstate`. The remaining `setTimeout`-based retry loops (e.g., `initialize()` in `plugin.js`) are only for startup sequencing while waiting for `ApiClient`, not for route polling.

### 72. Use one shared MutationObserver for JE, dispatching added nodes to modules
**Status:** GOOD IDEA
**Notes:** Currently each tag module (rating, genre, quality, language, people) plus the core events module creates its own `MutationObserver` on `document.body` with `{ childList: true, subtree: true }`. That means 6+ observers all watching the same subtree. Consolidating into one observer that dispatches to registered handlers would reduce browser overhead significantly, especially on pages with frequen...

### 73. Debounce mutation handling globally (one debounce) then let modules process same batch
**Status:** GOOD IDEA
**Notes:** Each tag module independently debounces its own scan (300-600ms each). A single global debounce collecting mutations into a batch, then dispatching once to all modules, would eliminate redundant timer management and ensure all modules process the same DOM state simultaneously, reducing total work.

### 74. When scanning DOM, start from mutation's added subtree - don't rescan whole page
**Status:** GOOD IDEA
**Notes:** Currently, every mutation callback triggers a full `document.querySelectorAll('.cardImageContainer')` scan (e.g., `scanAndProcess()` in ratingtags.js line 310, genretags.js line 434). By filtering `mutation.addedNodes` and only scanning within those subtrees, you can avoid re-querying the entire DOM, which is especially wasteful when only a small section changes.

### 75. Cache common selectors (.cardImageContainer, detail page containers) to reduce repeated querySelectorAll
**Status:** MAYBE
**Notes:** Since Jellyfin is a SPA with dynamic DOM, caching selector results would require invalidation logic. The real overhead is not the `querySelectorAll` itself (which is fast on modern browsers) but the per-element processing that follows. The improvement from item 74 (scanning only added subtrees) would deliver more benefit with less fragility than caching selector results.

### 76. Add "already processed" markers per module using dataset or WeakSet
**Status:** ALREADY DONE
**Notes:** Every tag module already uses a `processedElements = new WeakSet()` to track which elements have been processed (e.g., ratingtags.js line 73, genretags.js line 60, qualitytags.js line 128, languagetags.js line 49). Additionally, cards are marked with `dataset[TAGGED_ATTR] = '1'` as a secondary check.

### 77. Use WeakMap<Element, State> for per-card metadata to avoid attribute churn
**Status:** MAYBE
**Notes:** The current approach uses `dataset` attributes (e.g., `jeRatingTagged`, `jeQualityTagged`) which do cause minor DOM attribute writes. A WeakMap would avoid this, but the current pattern is already lightweight (one boolean attribute per card per module) and the WeakSet for `processedElements` already prevents reprocessing. The benefit would be marginal.

### 78. Batch DOM writes: build overlays in DocumentFragment, append once
**Status:** GOOD IDEA
**Notes:** Functions like `applyRatingTag` in ratingtags.js and `insertGenreTags` in genretags.js create multiple child elements (icon spans, text spans, container divs) and append them individually. Building the entire overlay tree in a DocumentFragment and appending once would reduce layout recalculations. The benefit is moderate since each overlay is only 2-4 elements, but it is a clean and cheap impro...

### 79. Avoid forcing layout: don't read layout properties (offsetWidth) between writes
**Status:** GOOD IDEA
**Notes:** The `genretags.js` (`insertGenreTags`, line 294) and `qualitytags.js` (`insertOverlay`, line 696) both call `getComputedStyle(container).position` right before writing `container.style.position = 'relative'`. This read-then-write pattern forces a synchronous layout reflow. Pre-checking this in CSS (e.g., ensuring `.cardImageContainer` always has `position: relative`) would eliminate these force...

### 80. Use requestAnimationFrame for UI updates that touch many nodes
**Status:** GOOD IDEA
**Notes:** The tag modules process elements directly in their queue callbacks without coordinating with the render cycle. Wrapping the batch of `insertOverlay` / `insertGenreTags` calls in a `requestAnimationFrame` would allow the browser to batch visual updates and avoid layout thrashing when multiple cards are tagged in quick succession.

### 81. Use IntersectionObserver to tag only cards about to be visible
**Status:** ALREADY DONE
**Notes:** All tag modules (quality, genre, language, rating) already create an `IntersectionObserver` with `{ rootMargin: '200px', threshold: 0.1 }` to lazily process elements as they approach the viewport. This is well-implemented across the codebase.

### 82. Add hard cap: don't tag more than N cards per frame
**Status:** GOOD IDEA
**Notes:** The current queue processing batches are per-API-request (3-5 items at a time), but cached items can be applied synchronously without limit during `scanAndProcess()`. If a page loads with hundreds of cached cards, all overlays get applied in a single synchronous pass. Adding a per-frame cap (e.g., process 20 cached cards per rAF frame) would keep the UI responsive on large library pages.

### 83. If tags are positioned overlays, ensure CSS doesn't cause expensive repaint
**Status:** MAYBE
**Notes:** The overlays use `position: absolute`, `pointer-events: none`, and `backdrop-filter: blur(4px)`. The `backdrop-filter` is the most expensive property here as it triggers GPU compositing. Since these are already positioned absolutely and don't affect layout of siblings, they are reasonably efficient. Removing `backdrop-filter` would improve paint performance but at a visual cost. Worth testing w...

### 84. Use CSS containment (contain: layout paint) on overlay containers
**Status:** GOOD IDEA
**Notes:** Adding `contain: layout paint` to the tag overlay containers (`.quality-overlay-container`, `.genre-overlay-container`, `.rating-overlay-container`, `.language-overlay-container`) would tell the browser these subtrees are isolated, reducing the scope of layout and paint calculations. This is a low-risk CSS-only change with no functional side effects.

### 85. Precompute tag strings; don't rebuild innerHTML repeatedly
**Status:** GOOD IDEA
**Notes:** In `genretags.js` line 307, each genre tag is built with `tag.innerHTML = '<span class="material-symbols-outlined">...</span><span class="genre-text">...</span>'` inside a loop. Since the genre-to-icon mapping is static, these tag HTML fragments could be precomputed once into a Map. Similarly, `createResponsiveLabel` in qualitytags.js creates the same label structure repeatedly. Pre-building te...

### 86. Prefer textContent over innerHTML when possible
**Status:** GOOD IDEA
**Notes:** Several places use `innerHTML` where `textContent` would suffice. For example, `manualRefreshJellyseerrData` in jellyseerr.js line 183 uses `itemsContainer.innerHTML = ''` (this one is fine for clearing). The genre tags use `innerHTML` with embedded HTML (line 307 in genretags.js), which requires the HTML parser; using `createElement`/`textContent` for each child would be safer against XSS and ...

### 87. Avoid large inline SVG injection repeatedly; reuse nodes or use sprites
**Status:** MAYBE
**Notes:** I did not find repeated large inline SVG injection in the tag modules. The rating tags use CSS `background-image: url(...)` for tomato icons, and Material Icons are loaded via font. The Jellyseerr UI module may inject SVG icons for request buttons, but those are created per-card as needed. If there are SVG icons being cloned frequently, using a shared `<symbol>` + `<use>` sprite sheet would hel...

### 88. Minimize per-card event listeners; use event delegation at container
**Status:** ALREADY DONE
**Notes:** The codebase already uses event delegation extensively. In `events.js`, event listeners are attached to `document.body` for `mousedown`, `contextmenu`, and `click` events rather than per-card. The Jellyseerr module in `jellyseerr.js` attaches a single `click` handler on `document.body` (line 318) for request buttons. The `onUserButtonLongPress` function is the exception (per-button listeners) b...

### 89. Clean up listeners/timers on navigation to avoid background work leaks
**Status:** GOOD IDEA
**Notes:** While `helpers.js` has `disconnectAllObservers()` on `beforeunload`, and individual modules register `beforeunload` handlers, SPA navigation does not trigger `beforeunload`. The quality tags module creates new observers on each `reinitializeQualityTags` call without explicitly disconnecting old ones (relying on `createObserver` to replace by ID, which does work). However, the `visibilityObserve...

### 90. Replace fallback interval scanners (colored ratings) with observer-based triggers
**Status:** GOOD IDEA
**Notes:** The `colored-ratings.js` uses a fallback `setInterval` at 1000ms (`setupFallbackPolling()`, line 158) that runs `processRatingElements` continuously. Since the module already has a `MutationObserver` that detects relevant DOM changes and debounces processing, the fallback interval is unnecessary overhead. The observer-only approach with a one-time initial scan on page load would be sufficient.

### 91. Make ignore selector checks faster: precompile into single matcher or early bails
**Status:** GOOD IDEA
**Notes:** Each tag module calls `shouldIgnoreElement(el)` which iterates over 8-12 selectors, running `el.matches(sel) || el.closest(sel)` for each. This runs on every `.cardImageContainer` element during a scan. Precompiling the selectors into a single compound selector (e.g., joining with commas for a single `el.matches()` call), or checking the current page type first and short-circuiting entirely for...

### 92. Store route state once; don't recompute current page type in every mutation callback
**Status:** GOOD IDEA
**Notes:** The `genretags.js` module calls `isVideoPage()` in both the `initialize` check and inside `scanAndProcess()` on every debounced mutation. The `Emby.Page.onViewShow` hook in `helpers.js` already knows the current view. Caching the current route/page type in `JE.state.currentRoute` when navigation occurs and checking that cached value would be faster than querying the DOM or hash in every callback.

### 93. For pages with huge lists, add simple virtualization for JE-specific injected sections
**Status:** MAYBE
**Notes:** The existing `IntersectionObserver`-based lazy processing already provides a form of virtualization for tag injection -- cards are only tagged when near the viewport. Full DOM virtualization (only rendering visible rows) would need to be implemented at the Jellyfin core level. For JE-specific injected sections (like Jellyseerr search results or requests page), these typically have limited resul...

### 94. When a modal is open, suspend background DOM injection unless targeting the modal
**Status:** GOOD IDEA
**Notes:** When a Jellyseerr request modal, movie details modal, or action sheet is open, the body-level MutationObservers still fire for every DOM change within the modal, triggering debounced scans that will find no new card elements. Adding a check like `if (document.querySelector('.dialogContainer, .formDialog'))` to skip tag scanning when modals are open would eliminate wasted work.

---

## Items 95-109: Server Cache Headers, Backend Optimization

### 95. Add cache headers + ETag to /JellyfinEnhanced/js/{path} (scripts)
**Status:** GOOD IDEA
**Notes:** The `GetScriptResource` method (controller line 1542-1546) returns a `FileStreamResult` from embedded resources with no cache headers. Since the client already appends `?v=${Date.now()}` for cache-busting, adding a long `Cache-Control: max-age` with an ETag based on plugin version would allow browsers to cache scripts efficiently and skip redownloading on every page load while still invalidatin...

### 96. Add cache headers + ETag to /JellyfinEnhanced/locales/{lang}.json
**Status:** GOOD IDEA
**Notes:** The `GetLocale` method (line 1526-1540) returns locale JSON from embedded resources with no caching headers. Translation files are static per-version. Adding `Cache-Control` and an ETag based on plugin version or assembly hash would let browsers cache these across sessions, eliminating repeated downloads of the same translation file.

### 97. Add ETag to /JellyfinEnhanced/version
**Status:** GOOD IDEA
**Notes:** The `GetVersion` endpoint (line 1303) returns a static string (the plugin version) with no caching. This is called on every page load during initialization. An ETag based on the version string itself and a `Cache-Control` header would allow instant 304 responses for unchanged versions.

### 98. Add ETag + short TTL to /public-config
**Status:** GOOD IDEA
**Notes:** The `GetPublicConfig` endpoint (line 1348-1490) returns a large JSON object derived from plugin configuration. It is fetched on every page load (and also separately by `loadLoginImageEarly`). Since plugin config rarely changes, adding a short TTL (e.g., 5 minutes) with an ETag based on the config's hash would allow 304 Not Modified responses for the majority of requests.

### 99. Add ETag + short TTL to /private-config
**Status:** GOOD IDEA
**Notes:** The `GetPrivateConfig` endpoint (line 1305-1347) is similarly fetched on every initialization. The same ETag + short TTL approach as public-config would reduce payload on repeated loads. Since it is behind `[Authorize]`, the ETag should also account for user context if responses vary per user, but this endpoint returns the same data for all authenticated users.

### 100. Add ETag to user settings GET endpoints based on file last-write-time
**Status:** GOOD IDEA
**Notes:** The user settings endpoints (e.g., `GetUserSettingsSettings` at line 1623) return JSON from `_userConfigurationManager`. The current code appends `?_=${Date.now()}` client-side to bust cache. If the server returned an ETag based on the file's last-write time, the client could use `If-None-Match` to get 304s when settings have not changed, saving bandwidth especially for the 5 parallel settings ...

### 101. Return 304 Not Modified when If-None-Match matches
**Status:** GOOD IDEA
**Notes:** This is the necessary complement to items 95-100. Without implementing 304 handling in the controller actions, adding ETags alone does nothing. ASP.NET Core does not automatically return 304 for `Content()` or `JsonResult` responses; you need to manually check `Request.Headers["If-None-Match"]` against the computed ETag and return `StatusCode(304)` when they match.

### 102. Add Vary: X-Emby-Token or auth headers where needed
**Status:** GOOD IDEA
**Notes:** For endpoints like `/private-config` that are behind `[Authorize]` but return the same data for all users, a `Vary: Authorization` or `Vary: X-Emby-Token` header ensures intermediate caches and CDNs do not serve one user's cached response to another. Without this, if any proxy or CDN is in the path, you risk serving authenticated data to the wrong client.

### 103. Use PhysicalFile/FileStreamResult with proper caching for plugin resources
**Status:** GOOD IDEA
**Notes:** The current `GetScriptResource` method returns a raw `FileStreamResult` without cache headers. For embedded resources, using `FileStreamResult` with explicit `Response.Headers.CacheControl` and `Response.Headers.ETag` set before returning would be the cleanest approach. For resources that could be on disk, `PhysicalFile()` with `enableRangeProcessing: true` would also enable partial content del...

### 104. Consider adding ResponseCompression for JSON endpoints
**Status:** MAYBE
**Notes:** ASP.NET Core's `ResponseCompression` middleware can gzip/brotli JSON responses. However, Jellyfin may already configure compression at the server level, and many reverse proxy setups (nginx, Caddy) handle compression. Adding plugin-level compression could conflict with or duplicate existing compression. Worth checking if Jellyfin's default middleware chain already includes response compression ...

### 105. Avoid dynamic JSON in hot paths; use typed models for Arr/Jellyseerr responses
**Status:** GOOD IDEA
**Notes:** The `ProxyJellyseerrRequest` method reads the entire response as a string with `ReadAsStringAsync()` and returns `Content(responseContent, "application/json")`. The `CachedProxyJellyseerrRequest` caches the raw string. While the proxy pattern inherently deals with opaque JSON, the parsing in methods like `GetJellyseerrUserStatus` (line 329-356) deserializes via `JsonSerializer.Serialize(activeR...

### 106. Reuse configured HttpClient instances via named clients with base address + headers set once
**Status:** GOOD IDEA
**Notes:** Throughout the controller and services, `_httpClientFactory.CreateClient()` is called repeatedly, and headers like `X-Api-Key` are added on every request (e.g., controller line 140-141, JellyseerrUserCacheService line 110-111). Registering named HttpClients in DI with pre-configured base addresses and default headers (e.g., `services.AddHttpClient("jellyseerr", c => { c.BaseAddress = ...; c.Def...

### 107. Add server-side in-memory cache for derived results reused often (provider id lookups)
**Status:** ALREADY DONE
**Notes:** The codebase already has a `ConcurrentDictionary<string, (string Content, DateTime Expiry)> _proxyResponseCache` for Jellyseerr proxy responses (line 56), `JellyseerrUserCacheService` for user lookups (with TTL), and `_cachedPartialRequestsSetting` for the partial requests setting. The `FindItemByTmdbId` method (line 1174) does a full library scan each time it is called, which could benefit fro...

### 108. Add server-side rate limiting / concurrency gating for proxy endpoints
**Status:** GOOD IDEA
**Notes:** The Jellyseerr proxy endpoints have no rate limiting or concurrency control. If many clients simultaneously trigger search or discovery requests, the plugin will forward all of them to the upstream Jellyseerr instance. Adding a `SemaphoreSlim` to limit concurrent outbound proxy requests (similar to how `JellyseerrUserCacheService` uses one for user fetches) would protect the upstream service an...

### 109. Make large endpoints stream or paginate
**Status:** MAYBE
**Notes:** Most large data flows are proxied from Jellyseerr which already paginates (e.g., `?page=1`). The `GetJellyseerrUsers` endpoint fetches up to 1000 users at once, which could be large. The watchlist sync iterates all users server-side. For the client-facing proxy endpoints, pagination is already handled by Jellyseerr's API. Server-side endpoints like user settings return small per-user JSON files...

---

## Items 110-120: Arr/TMDB/Jellyseerr Server-Side Caching

### 110. Parallelize Sonarr + Radarr calls (queue + calendar) using Task.WhenAll
**Status:** GOOD IDEA
**Notes:** The `GetDownloadQueue` method (line 2260) fetches Sonarr queue then Radarr queue sequentially, each with a 10-second timeout. Similarly, `GetCalendarEvents` (line 2695) fetches Sonarr calendar then Radarr calendar sequentially. Both pairs are independent HTTP calls that could safely run in parallel with `Task.WhenAll`, cutting wall-clock time roughly in half for users who have both services con...

### 111. Add short server-side cache for Arr queue results (2-5 seconds) to smooth polling spikes
**Status:** GOOD IDEA
**Notes:** The `GetDownloadQueue` endpoint has no caching and makes fresh HTTP calls to Sonarr/Radarr on every request. When multiple users or tabs poll simultaneously (the requests page polls every 30 seconds), this creates burst traffic to the Arr services. A 2-5 second cache in a `ConcurrentDictionary` (matching the existing pattern at line 56 with `_proxyResponseCache`) would collapse overlapping poll...

### 112. Add short cache for Arr calendar by (start,end) (30-120 seconds)
**Status:** GOOD IDEA
**Notes:** Calendar data is inherently stable -- episodes and movie releases do not change minute to minute. The `GetCalendarEvents` endpoint makes expensive calls to both Sonarr and Radarr with up to 30-second timeouts. A keyed cache by `(start, end)` with a 30-120 second TTL would dramatically reduce redundant downstream calls, especially when multiple users view the calendar page.

### 113. Add short cache for Jellyseerr requests pages by (take,skip,filter,userOnly) (30 seconds)
**Status:** MAYBE
**Notes:** The `GetRequests` endpoint (line 2405) is user-scoped -- it filters by Jellyseerr user ID based on permissions, and enriches each request with TMDB data. Caching per `(take, skip, filter, userId)` could help, but the user-specific dimension increases cache fragmentation. It would be most beneficial for admin users viewing all requests, where the result set is the same for all admins.

### 114. For Jellyseerr request enrichment, cache per-request computed fields for TTL
**Status:** GOOD IDEA
**Notes:** The `EnrichWithTmdbData` method (line 3140) is called once per request in the list, making an HTTP call to Jellyseerr's TMDB endpoint for each entry. The same TMDB IDs appear across pages and polling cycles. Caching enrichment results by `(tmdbId, type)` in a `ConcurrentDictionary` with a 5-10 minute TTL would eliminate most redundant network calls, since movie/TV metadata changes very infreque...

### 115. Cap enrichment concurrency (SemaphoreSlim) so 200 requests don't become 200 parallel downstream calls
**Status:** GOOD IDEA
**Notes:** The `GetRequests` method uses `Task.WhenAll` (line 2600) to enrich all results in parallel with no concurrency limit. With `take=200`, this creates up to 200 simultaneous HTTP calls to Jellyseerr. Adding a `SemaphoreSlim` (e.g., max 10) would prevent overwhelming Jellyseerr while still benefiting from parallelism. The existing codebase already uses `SemaphoreSlim` in `JellyseerrUserCacheService...

### 116. If you call Jellyseerr then TMDB for details, cache TMDB responses by tmdbId for hours/days
**Status:** GOOD IDEA
**Notes:** The `GetTmdbPersonData` method (line 632) calls TMDB's API directly for person data, and `EnrichWithTmdbData` calls Jellyseerr's TMDB proxy for movie/TV metadata. TMDB data is highly cacheable -- person birth dates, poster paths, and release dates rarely change. A cache with hours-long TTL keyed by `(tmdbId, type)` would be very effective, especially since the same actors and movies appear acro...

### 117. For TMDB proxy, forward/emit caching headers so clients can revalidate
**Status:** WONT WORK
**Notes:** The TMDB "proxy" endpoints actually proxy through Jellyseerr (via `ProxyJellyseerrRequest`), not directly to TMDB. As noted in the existing `PERFORMANCE_PLAN.md` in this repo, Jellyseerr does not return ETag headers in its API responses, so there is nothing to forward. The plugin's `ProxyJellyseerrRequest` strips response headers and returns raw content via `Content()`, making ETag forwarding i...

### 118. Add HttpClient.Timeout consistently and treat timeouts as cacheable-negative for short TTL
**Status:** GOOD IDEA
**Notes:** Timeouts are already set on Arr-related calls (10-30 seconds at lines 2276, 2342, 2426, 2794, 2891), but the `ProxyJellyseerrRequest` method (line 130) creates HttpClient instances without setting a timeout, relying on the default 100 seconds. Adding a consistent 15-second timeout and caching timeout errors as negative results for a short TTL (e.g., 5 seconds) would prevent cascade failures whe...

### 119. Normalize URL mapping logic and cache mapping results
**Status:** MAYBE
**Notes:** The `resolveJellyseerrBaseUrl` function in `api.js` (line 756) parses URL mappings from plugin config on every call. While the parsing is simple string splitting and not expensive, caching the resolved URL per `serverAddress` would avoid repeated work. However, the function is called infrequently (mainly during initialization), so the performance benefit is marginal. The main value would be cod...

### 120. If posters are remote URLs, consider proxying or caching thumbnails
**Status:** MAYBE
**Notes:** Poster URLs are served directly from `image.tmdb.org` (e.g., line 2555, 3224). Proxying would add server load and latency vs. direct CDN delivery, which is already globally distributed. However, it could help with privacy (no direct user-to-TMDB connection), mixed content issues, and environments where TMDB CDN is blocked. Avatar proxying is already implemented (line 3254), so the pattern exist...

---

## Items 121-128: User Settings Bundle & Coordination

### 121. Add new endpoint: GET /user-settings/{userId}/bundle.json returning all 5 configs at once
**Status:** GOOD IDEA
**Notes:** The client currently makes 5 separate HTTP requests for user settings during initialization (lines 401-415 in plugin.js): settings.json, shortcuts.json, bookmark.json, elsewhere.json, and hidden-content.json. A single bundle endpoint would eliminate 4 HTTP round-trips, reduce connection overhead, and simplify the initialization waterfall. The server-side implementation is trivial since `UserCon...

### 122. Same for POST bundle.json (optional)
**Status:** MAYBE
**Notes:** A bulk POST would reduce round-trips when multiple settings change simultaneously. However, the current design where each settings file is saved independently is simpler, and the save path is not performance-critical -- users save settings infrequently and interactively. The complexity of partial failure handling (some files save, some fail) may outweigh the modest benefit.

### 123. In the client, load the bundle once then populate JE.userConfig from it
**Status:** GOOD IDEA
**Notes:** This is the client-side counterpart to item 121. The current code in `plugin.js` (lines 400-416) creates 5 promises, wraps each in custom result objects, then loops through results to populate `JE.userConfig`. A single fetch would simplify this to one await plus one assignment, removing approximately 50 lines of boilerplate while improving startup speed.

### 124. When saving settings, debounce saves and send only changed file(s)
**Status:** GOOD IDEA
**Notes:** The `saveUserSettings` function in `config.js` (line 33) sends the entire settings object on every save with no debouncing. In the settings UI, rapid toggles or slider adjustments could trigger multiple saves in quick succession. Debouncing (e.g., 500ms) and tracking which files actually changed would reduce unnecessary server writes. The `_cacheManager` pattern (line 26 in plugin.js) already d...

### 125. Use BroadcastChannel to tell other tabs settings changed
**Status:** GOOD IDEA
**Notes:** There is no inter-tab communication currently. If a user changes settings in one tab, other tabs remain stale until full page reload. `BroadcastChannel` is well-supported in modern browsers and would allow instant settings synchronization across tabs. The implementation is lightweight -- post a message on save, listen on load, and re-read `JE.userConfig` from the broadcast payload or refetch.

### 126. Avoid ?_=${Date.now()} on settings URLs once ETag works
**Status:** MAYBE
**Notes:** The cache-busting parameter `?_=${Date.now()}` is used on 5 settings URLs (lines 401-413) and on script loads (line 244). For settings, this ensures fresh data after saves but prevents browser caching entirely. The server-side settings endpoints are simple file reads that return JSON directly without caching headers. Removing cache-busting requires first implementing proper cache-control/ETag h...

### 127. Store settingsVersion increment in localStorage; if unchanged skip refetch
**Status:** MAYBE
**Notes:** This optimization would skip refetching settings if they have not changed since last load. However, settings can be changed from the settings UI, from other tabs, or from the server (admin defaults). Without a reliable server-side version counter or WebSocket notification, the client cannot know whether stored settings are current. A version-check endpoint would add an HTTP call to save calls, ...

### 128. Make clear-cache-timestamps flow event-driven
**Status:** MAYBE
**Notes:** The current approach polls the `ClearTranslationCacheTimestamp` from public-config on every page load (line 374 in plugin.js) and compares against localStorage. This is already reasonably efficient since public-config is fetched once per initialization anyway. Making it event-driven (e.g., via WebSocket or server-sent events) would eliminate the polling check but requires infrastructure that Je...

---

## Items 129-133: Dev Tools & Observability

### 129. Add JE perf dashboard (dev mode): API call counts, cache hit rates, script downloads
**Status:** GOOD IDEA
**Notes:** The `request-manager.js` already has a metrics framework (line 42) with `metrics.enabled`, sections, and request tracking, but it is debug-gated and has no UI. Adding a developer-facing dashboard to surface API call counts, cache hit/miss rates, and timing data would be valuable for identifying regressions and validating future optimizations. Gating it behind a dev flag keeps it zero-cost in pr...

### 130. Wrap ApiClient.ajax/fetch with logger (dev-only) grouping duplicate URLs
**Status:** GOOD IDEA
**Notes:** There is no unified visibility into what HTTP calls the client makes or how many are duplicates. The request-manager already provides deduplication for Jellyseerr calls, but `ApiClient.ajax` calls (used extensively for user settings, public-config, version, etc.) bypass it entirely. A dev-mode wrapper that logs and groups by URL would immediately reveal redundant calls, such as the duplicate `p...

### 131. Add performance.mark/measure around startup init, first tag pass, route changes
**Status:** GOOD IDEA
**Notes:** The plugin's initialization spans multiple async stages (translations, config, scripts, module init) with no timing instrumentation. Adding `performance.mark` at stage boundaries and `performance.measure` to span them would provide actionable data visible in browser DevTools performance panels. This is zero-overhead in production when marks are not consumed and provides immediate diagnostic val...

### 132. Add DOM leak audit that asserts timers/observers cleaned up on navigation
**Status:** GOOD IDEA
**Notes:** Multiple modules create `MutationObserver` instances (e.g., `setupNavigationWatcher` in requests-page.js line 2092), `setInterval` timers (location watcher at line 2253, poll timer at line 1946), and event listeners on `document`. Several of these have cleanup functions (`stopPolling`, `stopLocationWatcher`) but there is no systematic verification that cleanup actually runs on navigation. A dev...

### 133. Track time-to-interactive for plugin pages (bookmarks library, requests page, calendar)
**Status:** GOOD IDEA
**Notes:** Plugin pages like the requests page (loading downloads + requests + issues in parallel) and the calendar page (fetching Sonarr + Radarr calendar data) have no TTI tracking. Measuring the time from page show to data rendered would establish baselines for the optimizations in items 110-116 and help identify performance regressions. The `performance.mark`/`measure` API combined with the existing `...

---
