# Performance Optimization Master Plan - 100 Items (EVALUATED)

## Summary

| Status | Count |
|--------|-------|
| ALREADY DONE | 8 |
| GOOD IDEA | 37 |
| MAYBE | 29 |
| BAD IDEA | 12 |
| WONT WORK | 9 |
| **Total** | **95** |

---

## Category A: HTTP Request Reduction (Backend C#)

### A1. Shared Jellyseerr user cache across all services
**Status:** ALREADY DONE
**Notes:** Created JellyseerrUserCacheService with 10min TTL. Eliminates 5-15 duplicate /api/v1/user?take=1000 calls per interaction cycle.

### A2. WatchlistMonitor event debouncing with request caching
**Status:** ALREADY DONE
**Notes:** Added 5s debounce window + 2min request cache. Reduces from 100 API calls to 1 during library scans.

### A3. AutoSeason TV show data cache (avoid double fetch)
**Status:** ALREADY DONE
**Notes:** GetTotalEpisodesInSeason and GetSeasonStatus now share one cached API call per TV show (5min TTL).

### A4. Controller proxy response caching for semi-static endpoints
**Status:** ALREADY DONE
**Notes:** Sonarr/Radarr configs (10min), override rules (5min), partial-requests (10min) cached server-side.

### A5. Watchlist sync task - fetch all users once
**Status:** ALREADY DONE
**Notes:** Single upfront user fetch instead of N per-user fetches.

### A6. Parallel Radarr + Sonarr tag fetching
**Status:** ALREADY DONE
**Notes:** Task.WhenAll cuts fetch phase time in half.

### A7. Add default HttpClient timeout to all requests
**Status:** GOOD IDEA
**Notes:** Most HttpClient usages in `RadarrService`, `SonarrService`, `AutoMovieRequestService`, `JellyseerrUserCacheService`, `WatchlistMonitor`, and `JellyseerrWatchlistSyncTask` do not set any timeout. Only a handful of calls in the controller (lines 2276, 2342, 2426, 2794, 2891) explicitly set timeouts. Without a timeout, requests to unresponsive Radarr/Sonarr/Jellyseerr/TMDB instances will hang unti...

### A8. Add retry policy with exponential backoff to RadarrService/SonarrService
**Status:** MAYBE
**Notes:** Both `RadarrService.GetMovieTagsByTmdbId` and `SonarrService.GetSeriesTagsByTvdbId` make exactly two HTTP calls each (tags + items) and are invoked only from the scheduled `ArrTagsSyncTask`. A transient failure simply results in zero tags for that run, which is retried on the next scheduled execution. Adding Polly-based retries would improve resilience for flaky networks, but the complexity (ad...

### A9. Cache Jellyseerr URL parsing (avoid repeated Split/Trim)
**Status:** BAD IDEA
**Notes:** The `Split(new[] { '\r', '\n' }, ...)` pattern appears 15 times across 5 files, but string splitting a short configuration value (typically 1-3 URLs) is a sub-microsecond operation. Caching it would add invalidation complexity (the config can change at any time via the admin UI) for zero measurable performance gain. This is a premature micro-optimization that adds bugs-per-benefit risk with no ...

### A10. Add HTTP response compression for large JSON payloads
**Status:** WONT WORK
**Notes:** This is a Jellyfin server-level concern, not something a plugin can control. The plugin's controller endpoints return `Content(responseContent, "application/json")` which feeds into ASP.NET Core's middleware pipeline. Response compression is configured at the host level via `UseResponseCompression()` middleware in the Jellyfin server itself. A plugin cannot add middleware to the server pipeline...

### A11. Use typed HttpClient with pre-configured headers
**Status:** GOOD IDEA
**Notes:** Currently every call site does `_httpClientFactory.CreateClient()` and then manually adds `X-Api-Key` headers. This is repeated identically in the controller, `AutoMovieRequestService`, `JellyseerrUserCacheService`, `WatchlistMonitor`, and `JellyseerrWatchlistSyncTask`. Registering named/typed clients (e.g., `services.AddHttpClient("Jellyseerr", c => { c.DefaultRequestHeaders.Add("X-Api-Key", ....

### A12. Connection pool optimization in HttpClientFactory
**Status:** BAD IDEA
**Notes:** The plugin uses `IHttpClientFactory` (registered via `serviceCollection.AddHttpClient()`) which already provides proper connection pooling and socket lifecycle management. The default settings (2-minute handler lifetime, connection reuse) are well-suited for a plugin that makes occasional HTTP calls to a small number of external services. Tuning `SocketsHttpHandler.MaxConnectionsPerServer` or `...

### A13. Cache TMDB collection info in AutoMovieRequestService
**Status:** GOOD IDEA
**Notes:** `GetTmdbCollectionIdAsync` makes an HTTP call to `api.themoviedb.org/3/movie/{tmdbId}` every time a user starts watching a movie. TMDB collection membership is static data -- a movie's collection never changes. Caching the result (even a simple `ConcurrentDictionary<string, CollectionInfo?>` with no expiry) would eliminate redundant TMDB API calls when the same movie is watched by multiple user...

### A14. Batch Jellyseerr request fetches with pagination awareness
**Status:** MAYBE
**Notes:** Several places fetch `?take=1000` or `?take=500` without checking if more results exist beyond that page. For most home setups, 1000 users or 500 requests is sufficient. However, for larger installations, data would be silently truncated. The real question is whether Jellyseerr's API returns a `pageInfo.pages` or `totalResults` count -- if it does, pagination is straightforward and worthwhile f...

### A15. Add ETag/If-None-Match support to proxy endpoints
**Status:** WONT WORK
**Notes:** The plugin's proxy endpoints (`ProxyJellyseerrRequest`) already have a server-side `ConcurrentDictionary` response cache with TTL-based invalidation (`CachedProxyJellyseerrRequest`). Adding ETag/If-None-Match support would require Jellyseerr's API to return ETag headers in its responses, which it does not -- Jellyseerr (an Overseerr fork) does not implement ETag-based caching on its API endpoin...

---

## Category B: Database & Query Optimization (Backend C#)

### B1. Fix N+1 query in watchlist sync (fetch all items once)
**Status:** GOOD IDEA
**Notes:** In `ProcessWatchlistItem` (line 513 of `JellyseerrWatchlistSyncTask.cs`), every watchlist item triggers a full `_libraryManager.GetItemList(new InternalItemsQuery { HasTmdbId = true, Recursive = true })` call that returns ALL movies or ALL series in the library, then does a linear `.FirstOrDefault()` scan to find the matching TMDB ID. For a user with 50 watchlist items across a library of 5000 ...

### B2. Optimize GetItemIdsByProvidersBatchAsync to single query
**Status:** MAYBE
**Notes:** The current implementation in `JellyfinDbContextExtensions.cs` groups providers by type and issues one EF Core query per provider type (e.g., one for "Tmdb", one for "Imdb"). In practice, this plugin mostly queries by a single provider at a time (usually "Tmdb"), making the loop execute just once. Combining into a single query with `OR` conditions via `PredicateBuilder` or `Union` is theoretica...

### B3. Add AsNoTracking() to read-only EF Core queries
**Status:** GOOD IDEA
**Notes:** In `JellyfinDbContextExtensions.cs`, the `GetItemIdsByProvidersBatchAsync` method queries `db.BaseItemProviders` without `AsNoTracking()`, meaning EF Core tracks all returned entities in the change tracker for no reason -- the results are immediately projected to a dictionary and never modified. Adding `.AsNoTracking()` before the `.Where()` clause would reduce memory allocations and speed up m...

### B4. Add query projection (select only needed fields)
**Status:** MAYBE
**Notes:** The `InternalItemsQuery` calls go through Jellyfin's `ILibraryManager.GetItemList()` which is an internal Jellyfin API -- the plugin cannot control what fields the framework selects or how it materializes `BaseItem` objects. The EF Core query in `GetItemIdsByProvidersBatchAsync` could benefit from `.Select(p => new { p.ProviderId, p.ProviderValue, p.ItemId })` to avoid loading entire `BaseItemP...

### B5. Pre-filter ArrTagsSyncTask items by provider ID in query
**Status:** GOOD IDEA
**Notes:** In `ArrTagsSyncTask.ExecuteAsync`, the query fetches ALL movies and series (`GetItemList` with `BaseItemKind.Movie` and `BaseItemKind.Series`), then loops through them checking if they have matching Radarr/Sonarr tags. Since only items WITH a TMDB ID (for movies) or IMDB ID (for series) can possibly match, adding `HasTmdbId = true` to the movie query or using `HasAnyProviderId` filters would re...

### B6. Paginate large GetItemList queries
**Status:** BAD IDEA
**Notes:** The `GetItemList` calls in this plugin need the full result set for matching against external data (e.g., matching TMDB IDs against Radarr tags, finding items by TMDB ID for watchlist sync). Paginating would just mean making multiple queries and reassembling the same complete list, adding overhead rather than reducing it. Pagination is useful for user-facing APIs where partial results are accep...

### B7. Batch UpdateToRepositoryAsync calls in ArrTagsSyncTask
**Status:** MAYBE
**Notes:** Currently `UpdateToRepositoryAsync` is called individually for each modified item inside the `ArrTagsSyncTask` loop (line 211). This is Jellyfin's `BaseItem.UpdateToRepositoryAsync` which the plugin must call per-item -- there is no batch update API in `IItemRepository` or `ILibraryManager`. Attempting to batch by collecting items and updating them in a loop at the end would not change the numb...

### B8. Cache library item lookups by TMDB ID
**Status:** GOOD IDEA
**Notes:** The `FindItemByTmdbId` method in the controller (line 1174) and the equivalent pattern in `ProcessWatchlistItem` (line 513 of watchlist sync) both fetch the entire library filtered by item type with `HasTmdbId = true`, then do a linear scan with `.FirstOrDefault()`. Building a `Dictionary<string, BaseItem>` (TMDB ID -> item) once at the start of batch operations (like watchlist sync) and reusin...

---

## Category C: Memory & Allocation Optimization (Backend C#)

### C1. Static readonly char array for URL splitting
**Status:** GOOD IDEA
**Notes:** The pattern `new[] { '\r', '\n' }` appears 17 times across 5 files (JellyfinEnhancedController.cs, AutoMovieRequestService.cs, AutoSeasonRequestService.cs, WatchlistMonitor.cs, JellyseerrWatchlistSyncTask.cs). Each call allocates a new `char[]` on the heap. Extracting this to a `private static readonly char[] UrlSeparators = { '\r', '\n' };` (and a second variant that includes `','` for the 2 i...

### C2. Use StringBuilder for string concatenation in loops
**Status:** MAYBE
**Notes:** The only `+=` string concatenation found in C# code is a single instance at line 2467 of `JellyfinEnhancedController.cs`: `filterParam += $"&requestedBy={jellyseerrUser.Id}"`. This is a one-time conditional append, not a loop, so StringBuilder would not provide a meaningful benefit. There are no actual string-concat-in-loop patterns in the codebase. No existing use of `StringBuilder` was found ...

### C3. Reduce intermediate LINQ allocations (avoid .ToList() chains)
**Status:** MAYBE
**Notes:** There is exactly one `.Where().Select().ToList()` chain, at `AutoSeasonRequestService.cs:255` for evicting expired cache entries -- the collection is very small (TV show cache is keyed by TMDB ID with a 5-minute TTL). The other `.ToList()` calls (~20 across the codebase) are either materializing query results that need to be enumerated multiple times or are on small collections. The overhead is...

### C4. Object.Freeze genre/quality color maps (JS)
**Status:** BAD IDEA
**Notes:** `Object.freeze()` does not exist in this context the way one might expect -- these maps (`genreIconMap` in genretags.js and `qualityColors` in qualitytags.js) are defined as `const` inside an IIFE closure, so they are already effectively immutable since nothing outside the closure can reference them. Adding `Object.freeze()` would add a tiny runtime cost for the freeze operation itself with zer...

### C5. Pool HttpRequestMessage objects
**Status:** WONT WORK
**Notes:** `HttpRequestMessage` cannot be reused after it has been sent -- the .NET runtime explicitly throws `InvalidOperationException` if you attempt to send the same message twice. The codebase correctly creates a new `HttpRequestMessage` in the proxy loop (controller line 184) for each request. Pooling these objects is not supported by the HttpClient API.

### C6. Use ArrayPool for temporary buffers
**Status:** WONT WORK
**Notes:** There are no large buffer allocations in the codebase. The only `byte[]` usage is in `TransformationPatches.cs` at line 74 (`TryGetCustomImageBytes`), which reads branding image files via `File.ReadAllBytes`. These are small image files read infrequently (only during startup/transformation registration). There are no hot-path buffer allocations that would benefit from `ArrayPool<byte>`.

### C7. Reduce JsonElement cloning overhead
**Status:** MAYBE
**Notes:** In `AutoSeasonRequestService.cs`, `GetCachedTvShowData` returns `doc.RootElement.Clone()` (line 223 and 269), which deep-copies the entire JSON document to allow the caller to use it after the `JsonDocument` might be disposed. This is actually the correct pattern since `JsonDocument` is cached and could be evicted. However, since the cached `JsonDocument` has a 5-minute TTL and is accessed infr...

---

## Category D: Async & Threading (Backend C#)

### D1. Fix async void event handlers in AutoSeasonRequestMonitor
**Status:** GOOD IDEA
**Notes:** `OnPlaybackStopped` (line 68) and `OnPlaybackProgress` (line 135) in `AutoSeasonRequestMonitor.cs` are both `async void`. While the existing try/catch blocks prevent unobserved exceptions from crashing the process, `async void` methods have no way to signal errors to the caller and cannot be awaited. The standard pattern for event handlers that must be `async void` is already followed (full try...

### D2. Fix async void in AutoMovieRequestMonitor
**Status:** GOOD IDEA
**Notes:** `OnPlaybackProgress` (line 67) in `AutoMovieRequestMonitor.cs` is `async void` with the same pattern and the same risks as D1. The try/catch catches all exceptions, so it will not crash the process, but the method cannot be tested or awaited. The same refactoring approach applies: extract the async work into a separate `async Task` method and fire-and-forget it with proper error handling.

### D3. Add CancellationToken to CheckEpisodeCompletionAsync
**Status:** GOOD IDEA
**Notes:** `CheckEpisodeCompletionAsync` in `AutoSeasonRequestService.cs` (line 47) makes multiple HTTP calls to Jellyseerr but accepts no `CancellationToken`. If the plugin is being disposed or Jellyfin is shutting down, these HTTP calls will run to completion unnecessarily. Adding a `CancellationToken` parameter and passing it through to `httpClient.GetAsync()` and `httpClient.PostAsync()` calls would a...

### D4. Add timeout to SemaphoreSlim.WaitAsync calls
**Status:** GOOD IDEA
**Notes:** There are two `SemaphoreSlim` instances: `_fetchSemaphore` in `JellyseerrUserCacheService.cs` (line 45: `await _fetchSemaphore.WaitAsync()`) and `_requestsCacheSemaphore` in `WatchlistMonitor.cs` (line 290: `await _requestsCacheSemaphore.WaitAsync()`). Neither has a timeout. If the HTTP call inside the semaphore hangs or deadlocks, the semaphore will never be released and all subsequent callers...

### D5. Replace synchronous Logger.AppendAllText with async queue
**Status:** MAYBE
**Notes:** `Logger.cs` uses `File.AppendAllText` inside a `lock (_writeLock)` (line 56-58) on every log call. This is synchronous file I/O that blocks the calling thread. However, this logger is not on a hot path -- it is called during playback events, startup, and error conditions, not in tight loops. The `lock` scope is very small. Replacing this with an async queue (e.g., `Channel<string>` with a backg...

### D6. Use ReaderWriterLockSlim for mostly-read caches
**Status:** MAYBE
**Notes:** The codebase uses `lock (_sessionLock)` in both monitor classes to protect `_checkedSessions` dictionaries, and `lock (_writeLock)` in the Logger. The session dictionaries are read (ContainsKey) and written (Add/Remove) within the same lock block, and the Logger always writes. `ReaderWriterLockSlim` only helps when reads significantly outnumber writes and the read path is long enough that concu...

### D7. Make StartupService initialization lazy/deferred
**Status:** BAD IDEA
**Notes:** `StartupService.ExecuteAsync` (line 40-57) runs as a `StartupTrigger` scheduled task that registers file transformations and initializes the three monitors (AutoSeasonRequestMonitor, AutoMovieRequestMonitor, WatchlistMonitor). These monitors must subscribe to events early so they do not miss any playback or library events. Making initialization lazy would create a race condition where playback ...

### D8. Thread-safe TV show cache in AutoSeasonRequestService
**Status:** GOOD IDEA
**Notes:** `_tvShowCache` at line 26 of `AutoSeasonRequestService.cs` is a plain `Dictionary<string, (JsonDocument, DateTime)>` with no synchronization. It is read and written from `GetCachedTvShowData`, which can be called concurrently from multiple playback event handlers (via the `async void` handlers in AutoSeasonRequestMonitor). This is a data race: concurrent `TryGetValue`, `Remove`, and index sette...

---

## Category E: Caching Strategy (Backend C#)

### E1. Centralize cache TTL configuration
**Status:** GOOD IDEA
**Notes:** TTL values are scattered across at least 5 locations: `ServiceCacheTtl` (10min), `MediaDetailsCacheTtl` (2min), `SettingsCacheTtl` (10min) in `JellyfinEnhancedController.cs`; `CacheTtl` (10min) in `JellyseerrUserCacheService.cs`; `TvShowCacheTtl` (5min) in `AutoSeasonRequestService.cs`; `RequestsCacheTtl` (2min) in `WatchlistMonitor.cs`; and an inline `TimeSpan.FromMinutes(5)` for override rule...

### E2. Add cache invalidation on config changes
**Status:** GOOD IDEA
**Notes:** When the Jellyseerr URL or API key changes, no caches are cleared. The `JellyseerrUserCacheService` already checks URL/key changes on the next call (lines 38-42), but the `_proxyResponseCache` (static `ConcurrentDictionary` in the controller), the `_cachedPartialRequestsSetting`, and the `_tvShowCache` in `AutoSeasonRequestService` will all serve stale data from the old server for up to their T...

### E3. Implement cache warming on startup for frequently-used data
**Status:** MAYBE
**Notes:** `StartupService.ExecuteAsync` currently only registers file transformations and initializes event monitors -- it does not pre-fetch any data. Warming the Jellyseerr user cache on startup could eliminate first-request latency for the most common API proxy calls. However, if Jellyseerr is unreachable at startup, this would cause unnecessary errors. It would only be worthwhile if Jellyseerr is rel...

### E4. Add cache size limits with LRU eviction
**Status:** MAYBE
**Notes:** The `_proxyResponseCache` in `JellyfinEnhancedController.cs` is a static `ConcurrentDictionary` that can grow unbounded -- the only eviction happens opportunistically when the count exceeds 50 entries (line 247), and it only removes expired entries. In most real-world usage with a single Jellyseerr instance and a moderate number of media items, this dictionary is unlikely to grow to problematic...

### E5. Proactive cache cleanup (background timer)
**Status:** BAD IDEA
**Notes:** Expired entries in `_proxyResponseCache` are effectively free (tiny string tuples that are skipped on cache miss) and already cleaned opportunistically when the count exceeds 50. The `JellyseerrUserCacheService` and `WatchlistMonitor` caches are single-object caches that simply get overwritten on refresh. A background timer adds thread scheduling overhead and complexity for negligible memory sa...

### E6. User-specific vs shared cache separation
**Status:** GOOD IDEA
**Notes:** The `_proxyResponseCache` in `CachedProxyJellyseerrRequest` caches by `apiPath` alone (e.g., `proxy:/api/v1/service/sonarr`), which is fine for truly shared endpoints like Sonarr/Radarr instance lists. However, if any per-user endpoints were ever routed through `CachedProxyJellyseerrRequest`, responses cached for one user would be served to another. Currently this appears safe because only shar...

### E7. Static cache cleanup on plugin reload
**Status:** GOOD IDEA
**Notes:** The `_proxyResponseCache` and `_cachedPartialRequestsSetting` are `static` fields on `JellyfinEnhancedController`. When the plugin is reloaded (e.g., after a config change or update), the controller class may be re-instantiated while the static fields retain stale data from the previous plugin instance pointing to a possibly different Jellyseerr server. There is no `Dispose` or cleanup mechanis...

---

## Category F: Frontend Request Optimization (JavaScript)

### F1. Cache getCurrentJellyseerrUserId result
**Status:** ALREADY DONE
**Notes:** Cached in closure variable, cleared on user status cache clear.

### F2. Parallelize fetchAdvancedRequestData server detail fetches
**Status:** ALREADY DONE
**Notes:** Promise.all instead of sequential for loop.

### F3. Add AbortController to all fetch calls
**Status:** GOOD IDEA
**Notes:** The files `js/enhanced/features.js` and `js/elsewhere/elsewhere.js` have zero AbortController usage -- features.js makes 5 `ApiClient.ajax()` calls and elsewhere.js makes 3 raw `fetch()` calls, all without abort signals. Meanwhile, the jellyseerr subsystem (api.js, discovery modules, request-manager.js) already supports signals via `managedFetch`. Adding AbortController to features.js and elsew...

### F4. Deduplicate API calls in plugin.js initialization
**Status:** GOOD IDEA
**Notes:** In `plugin.js`, the `/JellyfinEnhanced/public-config` endpoint is called twice: once at line 195 inside `loadPluginData()` during `initialize()`, and again at line 290 inside `loadLoginImageEarly()` which runs before login. The `/JellyfinEnhanced/version` endpoint is also called in both `loadPluginData()` and `translations.js`'s `getPluginVersion()`. Deduplicating these would eliminate 1-2 redu...

### F5. Batch user config fetches (settings, shortcuts, bookmarks)
**Status:** MAYBE
**Notes:** In `plugin.js` lines 400-416, five user-settings files (`settings.json`, `shortcuts.json`, `bookmark.json`, `elsewhere.json`, `hidden-content.json`) are already fetched in parallel via `Promise.allSettled`. They are separate server endpoints, so they cannot be trivially combined into one HTTP call without a new backend batch endpoint. A server-side batch endpoint returning all user config in on...

### F6. Add cache TTL to bookmarks item details cache
**Status:** GOOD IDEA
**Notes:** In `bookmarks.js` at line 74, the `itemDetailsCache` stores fetched item data with no TTL -- it caches indefinitely as long as the `itemId` matches. If metadata changes (e.g., provider IDs updated, name changed) during a long session, the cache will serve stale data. Adding a TTL (e.g., 5-10 minutes) would be a simple, safe improvement that ensures correctness while still avoiding repeated fetc...

### F7. Parallelize item fetch + series fetch in bookmarks
**Status:** GOOD IDEA
**Notes:** In `bookmarks.js` `fetchItemDetails()` (lines 88-162), the item is fetched first, then if it is a Season or Episode, the series is fetched sequentially in a second request (line 109). These two fetches could be parallelized: start the series fetch immediately if `SeriesId` is available (which requires the first fetch), so true parallelization is not possible for the initial item, but the item f...

### F8. Lazy-load translation files (only load active language)
**Status:** WONT WORK
**Notes:** The translations system in `translations.js` already loads only the active language. The `loadTranslations()` function builds a language chain (e.g., `["fr", "en"]`), iterates through it, and returns on the first successful load via `tryLoadSingleLanguage()`. It does not load all language files. The optimization is already in place.

### F9. Reduce calendar page poll interval adaptively
**Status:** MAYBE
**Notes:** The requests-page.js uses a configurable poll interval (`DownloadsPollIntervalSeconds`, defaulting to 30 seconds) controlled by `setInterval`. The calendar-page.js uses a 150ms location-checking timer (line 1205) which is a lightweight hash-change watcher, not a data poll. For the requests page, adaptive polling (e.g., backing off when no changes are detected, increasing frequency when the user...

### F10. Cache getItemFromHash results with TTL
**Status:** WONT WORK
**Notes:** The `getItemFromHash` function in `helpers.js` (lines 90-123) already caches results. It stores `cachedItemId` and `cachedItem`, returning the cached item when the same ID is requested again, and deduplicates in-flight requests via `fetchInProgress`. Adding a TTL would be a marginal improvement for very long sessions, but the cache already invalidates when a different item ID is requested. For ...

### F11. Deduplicate watch-progress API calls
**Status:** WONT WORK
**Notes:** In `features.js`, the `displayWatchProgress` function (lines 178-377) is already well-guarded against duplicate calls. It checks for existing DOM elements with `querySelector('.mediaInfoItem-watchProgress')` and returns early if already rendered for the same `itemId` (line 187). It also uses a per-item cache with a 1-hour TTL (`WATCHPROGRESS_CACHE_TTL`, line 8). The debounced `handleItemDetails...

### F12. Batch audio language detection requests
**Status:** MAYBE
**Notes:** The `displayAudioLanguages` function in `features.js` fetches a single item's data via `ApiClient.getItem()` and then optionally fetches the first episode for series/seasons. This runs once per detail page view, not in batch. Batching would only help if multiple items' audio languages were displayed simultaneously (e.g., on a library grid view), but currently this feature only activates on indi...

### F13. Use stale-while-revalidate pattern for cached data
**Status:** GOOD IDEA
**Notes:** The `request-manager.js` cache (`getCached` at lines 242-258) returns `null` when the TTL (5 minutes) expires, forcing a synchronous wait for fresh data. A stale-while-revalidate pattern would immediately return the expired cached data to the UI while asynchronously refreshing in the background. This would make Jellyseerr discovery pages and search results feel snappier on repeat visits, especi...

### F14. Prefetch likely-needed data on hover
**Status:** MAYBE
**Notes:** The codebase already has some prefetch patterns: `seamless-scroll.js` prefetches data when the user scrolls near the bottom, and discovery pages use intersection observers. For card hover prefetch (e.g., loading movie/TV details when hovering over a card before clicking), the benefit depends on typical user behavior. The `jellyseerr/ui.js` already has a hover popover system for download progres...

### F15. Increase request manager cache max entries for heavy users
**Status:** GOOD IDEA
**Notes:** The `request-manager.js` CONFIG at line 22 sets `maxEntries: 100`. For heavy users browsing discovery pages with hundreds of results (similar, recommended, genre/network/tag discovery), 100 entries can be exhausted quickly, causing earlier results to be evicted and re-fetched when scrolling back. Increasing to 200-300 entries (or making it configurable) would improve cache hit rates at negligib...

---

## Category G: DOM & Rendering Optimization (JavaScript)

### G1. Replace waitForElement polling with MutationObserver
**Status:** WONT WORK
**Notes:** The `waitForElement` function in `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/helpers.js` (lines 250-283) already uses a MutationObserver, not polling. It creates a managed MutationObserver that watches `document.body` with `childList: true, subtree: true` and resolves the promise when the selector is found. This optimization has already b...

### G2. Cache video element reference in playback.js
**Status:** BAD IDEA
**Notes:** In `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/playback.js`, the `getVideo()` function (line 11) does `document.querySelector('video')` each time it is called. However, video elements are transient in a SPA like Jellyfin -- they are created and destroyed as users navigate in and out of the player. Caching the reference would risk holding ...

### G3. Cache getComputedStyle results
**Status:** BAD IDEA
**Notes:** The `getComputedStyle` calls in playback.js (lines 125, 165) are used to check the `visibility` of subtitle/audio track check icons inside action sheet menus that are dynamically shown/hidden. These menus are created fresh each time they open, so the computed style values can change between calls. Caching would return stale data and cause incorrect track detection. The calls are also user-trigg...

### G4. Use DocumentFragment for batch DOM insertions
**Status:** MAYBE
**Notes:** In `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/elsewhere/elsewhere.js`, functions like `createServiceBadge` append elements inside loops (e.g., lines 756-758), and `bookmarks-library.js` creates bookmark cards in a loop (lines 1215-1461). Using DocumentFragment could reduce reflows when inserting multiple children. However, many of these insertion...

### G5. Template SVG icons instead of creating inline per render
**Status:** GOOD IDEA
**Notes:** In `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/icons.js`, the LUCIDE and MUI icon maps (lines 106-194) store full SVG/HTML strings that are re-parsed from string every time `JE.icon()` is called. Using `<defs>` and `<use>` references, or caching parsed DocumentFragments via `cloneNode(true)`, would avoid repeated HTML parsing. This matter...

### G6. Debounce/throttle contextmenu and mousedown listeners
**Status:** BAD IDEA
**Notes:** The `contextmenu` and `mousedown` listeners in `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/events.js` (lines 259-278) are simple synchronous handlers that just traverse the DOM to set two state flags (`isContinueWatchingContext` and `currentContextItemId`). These are user-initiated events that fire once per right-click or menu button pres...

### G7. Clean up event listeners on page navigation
**Status:** GOOD IDEA
**Notes:** In `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/events.js`, the `initializeEnhancedScript` function (lines 332-403) adds document-level event listeners for `keydown`, `mousedown`, `mouseup`, `mousemove`, `click`, `touchstart`, `touchend`, etc., but never removes them. In a SPA, these accumulate if the initialization runs multiple times. Ad...

### G8. Use event delegation instead of per-element listeners
**Status:** GOOD IDEA
**Notes:** In `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/bookmarks-library.js`, the `renderBookmarkItems` function (lines 1299-1459) adds individual `click` event listeners for play, edit, save, cancel, and delete buttons on every single bookmark row. For a user with many bookmarks, this creates dozens of event listeners. A single delegated listene...

### G9. Batch localStorage writes with debounce
**Status:** MAYBE
**Notes:** The `localStorage.setItem` calls across the codebase are mostly in cold paths -- cache persistence on `beforeunload` (genretags.js line 150), translation loading (translations.js), settings changes (ui.js, theme-selector.js), and cache invalidation responses. The tag cache modules (genretags, qualitytags, languagetags, ratingtags) write to localStorage via `saveCache()` which is now managed by ...

### G10. Cache querySelector results for repeated lookups
**Status:** MAYBE
**Notes:** In playback.js, `document.querySelector('video')` and `document.querySelector('.actionSheetContent ...')` are called multiple times per function invocation (e.g., `cycleSubtitleTrack` calls it at lines 105, 112, 138, 142, 145). Within the scope of a single function call, caching the result into a local variable would be a micro-optimization. In the tags files like genretags.js, the heavy queryS...

### G11. Use requestAnimationFrame for DOM batch updates
**Status:** MAYBE
**Notes:** The codebase already uses `requestIdleCallback` extensively (elsewhere.js lines 1115-1152, features.js lines 372-376, 450-455, letterboxd-links.js lines 153-157, genretags.js lines 273-285) to defer non-critical DOM work. Using `requestAnimationFrame` would be appropriate for visual updates that need to be synchronized with the browser's paint cycle (e.g., creating bookmark markers in bookmarks...

### G12. Reduce querySelectorAll usage in loops
**Status:** WONT WORK
**Notes:** In `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/extras/colored-ratings.js`, the `processRatingElements` function (line 44) calls `document.querySelectorAll(CONFIG.targetSelector)` once and then iterates the result with `forEach` -- it does not call `querySelectorAll` inside the loop. Similarly in letterboxd-links.js, `querySelectorAll` is only call...

### G13. Freeze genre icon maps at module level
**Status:** GOOD IDEA
**Notes:** The `genreIconMap` object in `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/tags/genretags.js` (lines 66-137) is a large ~140-entry lookup table that is defined inside the `initializeGenreTags` function and recreated every time `initializeGenreTags` or `reinitializeGenreTags` is called. Moving it to module scope and applying `Object.freeze()` would p...

### G14. Replace inline cssText with CSS classes
**Status:** GOOD IDEA
**Notes:** Files like `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/elsewhere/elsewhere.js` are saturated with inline `style.cssText` assignments (lines 91-93, 110-118, 122-134, 138-143, 153-162, 189-194, 308-319, 322-333, and dozens more). Each inline style assignment forces style recalculation. Moving these to CSS classes in a single injected `<style>` block...

### G15. Reduce autocomplete dropdown DOM recreation
**Status:** GOOD IDEA
**Notes:** In `/home/jake/Downloads/performace/jellyfin-enhanced-fork/Jellyfin.Plugin.JellyfinEnhanced/js/elsewhere/elsewhere.js`, the `showDropdown` function (lines 180-210) calls `dropdown.innerHTML = ''` and then recreates every option div from scratch each time the user types a character (after the 300ms debounce). For long provider/region lists, this means destroying and rebuilding potentially dozens...

---

## Category H: CSS & Rendering Performance

### H1. Replace top/left positioning with transform: translate()
**Status:** MAYBE
**Notes:** In `languagetags.js` (line 254), `style.top`/`style.left`/`style.right`/`style.bottom` are set on absolutely positioned overlay containers -- these are static positions that are not animated, so there is no layout thrashing benefit from switching to `transform`. In `jellyseerr/ui.js` (line 207), the popover already uses `transform: translate()` for positioning. The only candidates where this co...

### H2. Use specific transition properties instead of transition: all
**Status:** GOOD IDEA
**Notes:** There are approximately 40+ instances of `transition: all` scattered across the codebase -- in `css/ratings.css` (line 55), `calendar-page.js` (lines 215, 453, 585, 739, 764), `requests-page.js` (lines 211, 394, 477, 497, 557), `bookmarks-library.js` (11+ instances), `jellyseerr/ui.js` (lines 356, 617, 642, 649), and many more. Using `transition: all` forces the browser to check and potentially...

### H3. Add will-change hints to animated elements
**Status:** MAYBE
**Notes:** There are zero `will-change` declarations anywhere in the codebase. Animated elements include spinning SVGs (`.jellyseerr-status-badge.status-processing svg` with `animation: jellyseerr-spin`), the pause screen disc (`pause-screen-spin`), and multiple hover transforms (card hover scale/translateY effects). Adding `will-change: transform` to continuously animated elements like spinners could pro...

### H4. Replace render-blocking @import with link preload for fonts
**Status:** GOOD IDEA
**Notes:** There are two `@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded...')` statements in `calendar-page.js` (line 55) and `peopletags.js` (line 84). CSS `@import` inside `<style>` tags is render-blocking -- the browser must fetch the font stylesheet before it can continue parsing the rest of the CSS. Replacing these with dynamically injected `<link rel="preload" as="sty...

### H5. Add CSS containment to isolated components
**Status:** GOOD IDEA
**Notes:** Currently only one element uses CSS containment: `.jellyseerr-card .cardScalable { contain: paint; }` in `jellyseerr/ui.js` (line 339). Many other isolated components would benefit -- calendar cards (`.je-calendar-card`), download cards (`.je-download-card`), request cards (`.je-request-card`), modal dialogs (`.jellyseerr-season-modal`), and tag overlay containers. Adding `contain: content` or ...

### H6. Split large CSS injections into chunks
**Status:** BAD IDEA
**Notes:** The CSS_STYLES in `calendar-page.js` is approximately 1,050 lines and in `requests-page.js` about 490 lines. While these are large, they are each injected as a single `<style>` element only once when the page loads, with an ID-based guard check (`if (document.getElementById(...)) return`). Splitting these into multiple `<style>` tags would actually increase DOM complexity and potentially cause ...

### H7. Replace attribute selectors with class selectors in ratings
**Status:** MAYBE
**Notes:** There are 266 `[rating='...']` attribute selectors in `css/ratings.css`. Attribute selectors are slightly slower to match than class selectors because the browser must check the element's attribute value rather than a hashed class list. However, modern browser selector matching is right-to-left and highly optimized -- the `.mediaInfoOfficialRating` class qualifier already narrows the matching s...

### H8. Add prefers-reduced-motion media query globally
**Status:** GOOD IDEA
**Notes:** Currently only `css/ratings.css` (lines 402-410) and `pausescreen.js` (lines 334, 628) respect `prefers-reduced-motion`. The codebase has many animations that ignore this preference: spinner animations in `jellyseerr/ui.js`, hover transforms across cards in `calendar-page.js` and `bookmarks-library.js`, shake animations in `enhanced/ui.js`, and shimmer effects in `more-info-modal.js`. Adding a ...

### H9. Consolidate multiple style tag injections
**Status:** BAD IDEA
**Notes:** There are approximately 35 separate `createElement('style')` calls across the codebase. However, the current architecture is modular by design -- each feature (language tags, quality tags, genre tags, calendar, requests, jellyseerr UI, etc.) independently injects its own styles with unique IDs and guard checks. Consolidating these into fewer style tags would tightly couple otherwise independent...

### H10. Remove deep selector nesting where possible
**Status:** MAYBE
**Notes:** The CSS selectors in this codebase are actually fairly shallow. In `css/ratings.css`, selectors are mostly single-class with an attribute qualifier (depth 1-2). In the JS-injected CSS, selectors are generally 1-3 levels deep (e.g., `.jellyseerr-card .cardScalable`, `.jellyseerr-hover-popover .title`). The deepest selectors observed are things like `.je-calendar-page.je-view-week .je-calendar-da...

---

## Category I: File I/O & Serialization (Backend C#)

### I1. Queue-based async file logging
**Status:** GOOD IDEA
**Notes:** `Logger.cs` (line 56-59) uses `lock (_writeLock) { File.AppendAllText(...); }` on every single log call, meaning every Info/Debug/Error/Warning call blocks the calling thread on a synchronous file write while holding a global lock. During high-activity periods (e.g., the ArrTagsSyncTask logging updates for hundreds of items, or playback progress events firing every few seconds), this becomes a ...

### I2. Stream large JSON responses instead of full deserialization
**Status:** MAYBE
**Notes:** The codebase has ~30+ instances of the `ReadAsStringAsync()` + `Deserialize<JsonElement>()` pattern across controller, services, and scheduled tasks. For most proxy endpoints (which just forward JSON to the client), the entire response body is already being passed through as a string. For the Radarr/Sonarr services that deserialize full movie/series lists (potentially thousands of items), strea...

### I3. Static compiled Regex for UpdateIndexHtml
**Status:** GOOD IDEA
**Notes:** The same regex pattern `<script[^>]*plugin=["']Jellyfin Enhanced["'][^>]*>\s*</script>\n?` is instantiated with `new Regex(...)` in three locations: `TransformationPatches.IndexHtml` (line 25), `JellyfinEnhanced.CleanupOldScript` (line 89), and `JellyfinEnhanced.UpdateIndexHtml` (line 270). The `IndexHtml` method in `TransformationPatches` is called on every `index.html` request via the file tr...

### I4. Buffer file reads in TransformationPatches
**Status:** MAYBE
**Notes:** `TransformationPatches.TryGetCustomImageBytes` (line 93) uses `File.ReadAllBytes(filePath)` to read branding images on each request. These image files (icon, banner, favicon) are small (typically a few KB) and are read synchronously. Caching the bytes in a `static Dictionary<string, byte[]>` with a `FileSystemWatcher` for invalidation would eliminate repeated disk reads for the same files. Howe...

### I5. Use System.Text.Json source generators for known types
**Status:** MAYBE
**Notes:** The model classes like `RadarrMovie`, `RadarrTag`, `SonarrSeries`, `SonarrTag`, and `ArrItem` already use `[JsonPropertyName]` attributes and are deserialized with `System.Text.Json`. Adding a `[JsonSerializable]` source generator context for these types would eliminate the runtime reflection cost of `JsonSerializer.Deserialize<List<RadarrMovie>>()`. The performance gain is most noticeable when...

---

## Category J: Configuration & Startup (Backend C#)

### J1. Cache plugin configuration per-request scope
**Status:** BAD IDEA
**Notes:** `JellyfinEnhanced.Instance?.Configuration` is accessed 38 times across 9 files, but this property (inherited from `BasePlugin<PluginConfiguration>`) already returns a cached in-memory object -- Jellyfin's base plugin implementation loads configuration from XML once and caches it. It is not reading from disk on every access. Adding another layer of per-request caching would be unnecessary comple...

### J2. Lazy-initialize services based on enabled features
**Status:** MAYBE
**Notes:** `PluginServiceRegistrator.cs` registers all services as singletons unconditionally: `AutoSeasonRequestMonitor`, `AutoMovieRequestMonitor`, `WatchlistMonitor`, `AutoSeasonRequestService`, `AutoMovieRequestService`, etc. However, these are just DI registrations -- the actual initialization logic is gated by config checks in each service's `Initialize()` method (e.g., `AutoMovieRequestMonitor.Init...

### J3. Avoid Assembly.LoadContext reflection on every startup
**Status:** MAYBE
**Notes:** `StartupService.RegisterFileTransformation()` (line 62-64) uses `AssemblyLoadContext.All.SelectMany(x => x.Assemblies).FirstOrDefault(...)` to find the FileTransformation assembly, plus multiple `GetType()`, `GetProperty()`, and `GetMethod()` calls via reflection. This only runs once at startup (the task trigger is `StartupTrigger`), not on every request. The reflection cost is a one-time ~1-5m...

### J4. Inject RadarrService/SonarrService via DI instead of manual new
**Status:** GOOD IDEA
**Notes:** In `ArrTagsSyncTask.cs` lines 64-65, `RadarrService` and `SonarrService` are created manually with `new RadarrService(_httpClientFactory, _logger)` and `new SonarrService(_httpClientFactory, _logger)` instead of being injected via the DI container. This is not a performance issue per se (the objects are lightweight), but it bypasses dependency injection, making the code harder to test, violatin...

### J5. Validate configuration at startup (fail-fast)
**Status:** GOOD IDEA
**Notes:** Configuration is never validated at startup. Each service independently checks for null/empty config values at runtime (e.g., `ArrTagsSyncTask.ExecuteAsync` checks `config.ArrTagsSyncEnabled`, `AutoMovieRequestMonitor.Initialize` checks `config.AutoMovieRequestEnabled && config.JellyseerrEnabled`, etc.). There is no centralized validation that catches misconfiguration early. For example, if a u...

---
