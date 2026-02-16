# Performance Baseline — Jellyfin-Enhanced v11.0.0.0

**Date**: 2026-02-16
**Branch**: `performace` (pre-optimization, identical to `main`)
**Plugin Version**: 11.0.0.0
**Jellyfin Version**: 10.11.x (Docker container `jellyfin-dev`)

---

## Automated Measurements

### P2: Script Load Count and Size

| Category | Count | Raw Size (KB) |
|----------|-------|---------------|
| plugin.js (entry) | 1 | 29.8 |
| splashscreen.js (pre-init) | 1 | (included in others) |
| translations.js (Stage 1) | 1 | (included in enhanced) |
| enhanced/*.js | 16 | ~650 |
| jellyseerr/*.js | 15 | ~544 |
| tags/*.js | 5 | ~152 |
| arr/*.js | 6 | ~208 |
| elsewhere/*.js | 2 | ~72 |
| extras/*.js | 4 | ~varies |
| others/letterboxd-links.js | 1 | ~small |
| **Total JS files** | **~52** | **~1,598 KB (1.56 MB)** |
| locale JSON files | 16 | ~502 KB |

**Key observation**: 52+ individual `<script>` tag injections at init time.
Each triggers a separate HTTP request with `?v=${Date.now()}` cache-buster.

### Init-Time Network Requests (Counted from Code)

| Purpose | Count |
|---------|-------|
| public-config | 1 |
| version | 1 |
| private-config | 1 |
| translations.js script | 1 |
| translation JSON (1 locale) | 1 |
| user-settings (5 files) | 5 |
| component scripts (Stage 3) | 49 |
| splashscreen.js | 1 |
| login-image.js (conditional) | 0-1 |
| **Total init requests** | **~60-61** |

### Largest Files (Optimization Candidates)

| File | Size (KB) | Lines |
|------|-----------|-------|
| jellyseerr/ui.js | 134.2 | 2353 |
| enhanced/ui.js | 132.4 | 1878 |
| jellyseerr/more-info-modal.js | 118.7 | 2440 |
| arr/calendar-page.js | 88.3 | 2880 |
| enhanced/hidden-content.js | 82.8 | 2070 |
| arr/requests-page.js | 77.7 | 2296 |
| enhanced/bookmarks-library.js | 74.3 | 2309 |
| jellyseerr/issue-reporter.js | 55.0 | ~1200 |
| enhanced/hidden-content-page.js | 49.6 | 1523 |
| enhanced/features.js | 49.1 | ~1100 |
| elsewhere/elsewhere.js | 48.0 | 1157 |
| tags/qualitytags.js | 47.3 | 1091 |

---

## Manual Browser Measurements (TO BE COLLECTED)

> Instructions: Open `http://localhost:8097` in Chrome with DevTools open.
> Run 3 hard-refresh cycles per measurement, record median.

### P1: Initial Load Time (TTI Proxy)
- [ ] Median time from navigation to "All components initialized successfully": **___ms**

### P3: Route Change Time
- [ ] Home → Movies Library: **___ms**
- [ ] Movies Library → Movie Detail: **___ms**
- [ ] Movie Detail → Back: **___ms**

### P4: Network Request Count (Discovery Page)
- [ ] Requests after initial home page load: **___**
- [ ] Additional requests after 1 scroll-page: **___**

### P5: Network Request Count (Item Details)
- [ ] Requests when opening movie detail: **___**

### P6: DOM Node Count
- [ ] After home page load: **___**
- [ ] After scrolling 5 pages: **___**

### P7: Long Tasks (>50ms)
- [ ] Count during initial load: **___**
- [ ] Max duration: **___ms**

### P8: Memory Usage
- [ ] JS heap after full load: **___MB**
- [ ] JS heap after 5 scroll pages: **___MB**

---

## Key Performance Concerns (from Code Analysis)

### 1. Startup Script Loading (HIGHEST IMPACT)
- **~60 HTTP requests** at initialization
- **~1.56 MB** of uncompressed JS loaded via individual `<script>` tags
- Each script has `?v=${Date.now()}` cache-buster = **zero caching between page loads**
- Scripts are loaded in parallel via `Promise.allSettled` but each is a separate network roundtrip
- **Opportunity**: Bundle scripts, use content-hash versioning instead of Date.now()

### 2. Sequential Initialization Stages
- 6-stage waterfall: config → user-settings → scripts → settings-merge → theme → features
- Stage 1 (config+translations) must complete before Stage 2 (user-settings)
- Stage 3 (scripts) must complete before Stage 4+ (initialization)
- `loadLoginImageEarly()` makes a redundant `/public-config` fetch (same as Stage 1)
- **Opportunity**: Parallelize more stages, eliminate redundant fetches

### 3. Tag System MutationObservers
- 5 separate MutationObservers (quality, genre, language, people, ratings) watching overlapping DOM
- Each observer independently triggers API calls per visible card
- No shared observation or batching across tag types
- **Opportunity**: Single unified observer dispatching to tag handlers, batch API calls

### 4. Cache Busting Strategy
- `?v=${Date.now()}` on every script load = no browser caching at all
- User-settings fetched with `?_=${Date.now()}` = no caching
- **Opportunity**: Use content-hash or plugin-version for script caching

### 5. Feature Modules Always Loaded
- ALL 49 component scripts load regardless of which features are enabled
- Calendar, requests, Jellyseerr, arr, elsewhere scripts load even when disabled
- **Opportunity**: Config-gated script loading (only load enabled modules)

### 6. Duplicate Utility Code
- `sleep()` and `calculateBackoff()` defined in both `request-manager.js` and `seamless-scroll.js`
- **Opportunity**: Extract shared utilities (minor, low priority)
