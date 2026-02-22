# Performance Optimization Log - Jellyfin Enhanced

## Goal
Reduce the number of HTTP requests made by the plugin while keeping all functionality identical.

## Branch: `performance/reduce-requests`

---

## Optimization 1: Shared Jellyseerr User Cache (Backend)
**Status: IMPLEMENTED**
**Impact: HIGH - Eliminates ~5-10 duplicate API calls per event**

**Problem:** `GET /api/v1/user?take=1000` is called independently by:
- `AutoMovieRequestService.GetJellyseerrUserId()` - every movie playback event
- `AutoSeasonRequestService.GetJellyseerrUserId()` - every episode completion event
- `WatchlistMonitor` (indirectly via requests containing user data)
- `JellyseerrWatchlistSyncTask.GetJellyseerrUserId()` - per user during sync
- `JellyfinEnhancedController.GetJellyseerrUser()` - every proxied request from frontend

Each call fetches ALL Jellyseerr users (up to 1000). With 5 users and active usage, this could be 20+ redundant calls per hour.

**Solution:** Created `JellyseerrUserCacheService` singleton with:
- `IMemoryCache` with 10-minute TTL for user list
- `SemaphoreSlim` to prevent concurrent fetches (only one HTTP call at a time)
- Shared across all services via dependency injection
- Cache invalidated on configuration changes

**Requests saved:** ~5-15 per user interaction cycle

---

## Optimization 2: WatchlistMonitor Event Debouncing + Request Caching (Backend)
**Status: IMPLEMENTED**
**Impact: HIGH - Eliminates burst API calls during library scans**

**Problem:** `WatchlistMonitor.ProcessItemForWatchlist()` fires on EVERY `ItemAdded`/`ItemUpdated` event and fetches ALL Jellyseerr requests each time. During a library scan adding 100 items, this makes 100 separate `GET /api/v1/request?take=1000` calls.

**Solution:**
- Added in-memory cache for Jellyseerr requests with 2-minute TTL
- Added event debouncing: collects items for 5 seconds before processing as a batch
- Single API call serves multiple items arriving close together

**Requests saved:** ~50-200 during library scans (from N calls to 1)

---

## Optimization 3: AutoSeasonRequestService - Cache TMDB TV Show Data (Backend)
**Status: IMPLEMENTED**
**Impact: MEDIUM - Eliminates duplicate calls for same show**

**Problem:** `CheckEpisodeCompletionAsync` calls `GetTotalEpisodesInSeasonFromTmdb()` AND `GetSeasonStatusFromJellyseerr()` which both hit the SAME endpoint (`/api/v1/tv/{tmdbId}`). For a single episode event, the same TV show data is fetched TWICE.

**Solution:**
- Cache the TV show data from Jellyseerr with 5-minute TTL
- Second call reuses cached response
- Also benefits binge-watching scenarios where multiple episodes trigger the check

**Requests saved:** 1 per episode completion event (50% reduction for this service)

---

## Optimization 4: Controller Proxy - Server-Side Response Caching (Backend)
**Status: IMPLEMENTED**
**Impact: HIGH - Reduces proxied requests for static/semi-static data**

**Problem:** `ProxyJellyseerrRequest()` forwards EVERY request to Jellyseerr without any server-side caching. Endpoints like `/api/v1/service/sonarr`, `/api/v1/service/radarr`, and settings are essentially static but fetched on every page load by every user.

**Solution:** Added `IMemoryCache` to the controller for cacheable GET endpoints:
- Service configs (sonarr/radarr details): 10-minute TTL
- Settings (partial-requests): 10-minute TTL
- Override rules: 5-minute TTL
- Media details (movie/tv by TMDB ID): 2-minute TTL
- Search results: NOT cached (dynamic)
- POST requests: NOT cached (mutations)

**Requests saved:** ~10-30 per page navigation across all users

---

## Optimization 5: ArrTagsSyncTask - Parallel Fetch + Batch Updates (Backend)
**Status: IMPLEMENTED**
**Impact: MEDIUM - Faster sync, fewer round-trips**

**Problem:** Radarr tags and Sonarr tags are fetched sequentially. The task also calls `UpdateToRepositoryAsync` individually for each modified item.

**Solution:**
- Fetch Radarr and Sonarr tags in parallel using `Task.WhenAll`
- No change to per-item updates (Jellyfin API requires individual saves)

**Requests saved:** Wall-clock time cut in half for the fetch phase

---

## Optimization 6: Frontend - Increase Cache TTLs and Add Missing Cache Keys (Frontend JS)
**Status: IMPLEMENTED**
**Impact: MEDIUM - Reduces repeated frontend API calls**

**Problem:**
- Request manager cache TTL is 5 minutes - too short for semi-static data
- `getCurrentJellyseerrUserId()` fetches `/user?take=1000` every time (not using cached user-status)
- `fetchAdvancedRequestData()` fetches server details sequentially, not in parallel

**Solution:**
- Frontend cache TTL remains 5 min for dynamic data (good default)
- `getCurrentJellyseerrUserId()` now caches result in-memory
- `fetchAdvancedRequestData()` fetches all server details in parallel with `Promise.all`
- Added dedicated cache keys for user-status to prevent redundant calls

**Requests saved:** ~3-5 per modal/details page open

---

## Optimization 7: JellyseerrWatchlistSyncTask - Cache User List (Backend)
**Status: IMPLEMENTED**
**Impact: MEDIUM - Eliminates N user lookups during sync**

**Problem:** During watchlist sync, `GetJellyseerrUserId()` is called once per Jellyfin user, each time fetching ALL Jellyseerr users. With 10 Jellyfin users, that's 10 identical API calls.

**Solution:** Fetch user list once at the start of the sync task, pass it to all subsequent lookups.

**Requests saved:** N-1 calls per sync (where N = number of Jellyfin users)

---

## Summary

| Optimization | Requests Saved (est.) | Risk |
|---|---|---|
| Shared User Cache | 5-15/interaction | Low - TTL prevents stale data |
| WatchlistMonitor Debounce | 50-200/scan | Low - 5s delay acceptable |
| AutoSeason TMDB Cache | 1/episode event | Low - 5min TTL |
| Controller Proxy Cache | 10-30/page load | Low - only GET, short TTLs |
| Arr Parallel Fetch | Time only | None |
| Frontend Cache Improvements | 3-5/modal open | Low - existing cache infra |
| Watchlist Sync User Cache | N-1/sync run | None - single task scope |

**Total estimated reduction: 40-60% of all backend HTTP requests during normal usage, 80-90% during library scans.**
