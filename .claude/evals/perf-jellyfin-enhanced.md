# Performance Eval: Jellyfin-Enhanced

## Environment
- Jellyfin URL: `$JF_BASE_URL` (default: http://localhost:8097)
- API Key: `$JF_API_KEY` (env var only, never hardcode)
- Docker container: `$JF_DOCKER_CONTAINER`
- Plugins path: `$JF_PLUGINS_PATH`

---

## Regression Evals (Feature Invariants)

Each must PASS (no regressions) after every optimization slice.

### R1: Plugin Loads Without Errors
- **Check**: No `CRITICAL INITIALIZATION FAILURE` or `FATAL` in browser console
- **Check**: Console shows "All components initialized successfully"
- **Method**: Open browser DevTools console, navigate to Jellyfin home, check for errors
- **Pass criteria**: Zero JS errors from JellyfinEnhanced

### R2: Discovery Page Renders
- **Check**: Discovery/home page shows media cards with tags
- **Check**: Infinite scroll loads additional pages
- **Method**: Navigate to home/discovery, scroll down 3+ pages
- **Pass criteria**: Cards render, scroll loads new content, no blank sections

### R3: Item Details Page
- **Check**: Movie/show detail page loads with all enhanced elements
- **Check**: Tags (quality, genre, rating) appear on cards
- **Check**: Elsewhere/reviews sections load (if enabled)
- **Method**: Click any item from library, inspect detail page
- **Pass criteria**: All enhanced sections visible, no missing data

### R4: Playback Controls
- **Check**: Enhanced playback controls work (bookmarks, subtitles, OSD rating)
- **Check**: Pause screen overlay appears
- **Method**: Start playback, pause, test bookmark creation
- **Pass criteria**: All playback features functional

### R5: Settings Panel
- **Check**: JE settings panel opens and saves
- **Method**: Open plugin settings, toggle a setting, save, refresh, verify persisted
- **Pass criteria**: Settings save and restore correctly

### R6: Tag Systems
- **Check**: Quality/genre/language/people/rating tags render on library items
- **Method**: Browse a library, verify tags appear on item cards
- **Pass criteria**: Tags visible, correct data, no visual overlap

### R7: Keyboard Shortcuts
- **Check**: Custom keyboard shortcuts still work
- **Method**: Use configured shortcuts (if any)
- **Pass criteria**: Shortcuts trigger expected actions

### R8: Jellyseerr Integration (if enabled)
- **Check**: Search, request, and modal dialogs work
- **Method**: Open Jellyseerr search, request an item, view modal
- **Pass criteria**: All Jellyseerr features operational

---

## Performance Evals (Quantitative)

### P1: Initial Load Time (TTI Proxy)
- **Metric**: Time from page load to "All components initialized successfully" console message
- **Method**:
  ```js
  // In browser console, record performance.now() delta
  // Or use Performance API: performance.getEntriesByType('resource')
  ```
- **Measurement**: Run 3 times after hard refresh (Ctrl+Shift+R), take median
- **Baseline target**: Document current value

### P2: Script Load Count and Size
- **Metric**: Number and total bytes of JS files loaded by the plugin
- **Method**:
  ```js
  // In browser console after full load:
  performance.getEntriesByType('resource')
    .filter(r => r.name.includes('JellyfinEnhanced'))
    .map(r => ({ name: r.name.split('/').pop().split('?')[0], size: r.transferSize, duration: r.duration }))
  ```
- **Baseline target**: Document count and total transfer size

### P3: Route Change Time
- **Metric**: Time from navigation click to UI stable (no pending spinners)
- **Method**: Manual timing with DevTools Performance tab
- **Pages to test**: Home → Library → Item Details → Back
- **Baseline target**: Document per-route times

### P4: Network Request Count (Discovery Page)
- **Metric**: Total HTTP requests on discovery/home page load
- **Method**:
  ```js
  // DevTools Network tab: filter to JellyfinEnhanced + Jellyseerr requests
  // Count after initial load + 1 scroll page
  ```
- **Baseline target**: Document request count

### P5: Network Request Count (Item Details)
- **Metric**: HTTP requests when opening a movie/show detail page
- **Method**: DevTools Network tab, navigate to item detail
- **Baseline target**: Document request count

### P6: DOM Node Count
- **Metric**: Total DOM nodes after N scroll pages on discovery
- **Method**:
  ```js
  // After scrolling 5 pages on discovery:
  document.querySelectorAll('*').length
  ```
- **Baseline target**: Document initial + after 5 pages

### P7: Long Tasks
- **Metric**: Number of long tasks (>50ms) during page load and scroll
- **Method**:
  ```js
  // Set up PerformanceObserver before navigation:
  const longTasks = [];
  new PerformanceObserver(list => {
    list.getEntries().forEach(e => longTasks.push({ duration: e.duration, startTime: e.startTime }));
  }).observe({ type: 'longtask', buffered: true });
  // Check longTasks.length after load
  ```
- **Baseline target**: Document count and max duration

### P8: Memory Usage
- **Metric**: JS heap size after full load and after 5 scroll pages
- **Method**:
  ```js
  // Chrome DevTools → Memory tab → Heap snapshot
  // Or: performance.memory.usedJSHeapSize (Chrome only)
  ```
- **Baseline target**: Document heap size values

---

## Eval Execution

### Running Checks
1. Deploy plugin to `$JF_PLUGINS_PATH`
2. Restart Jellyfin: `docker restart $JF_DOCKER_CONTAINER`
3. Wait 10s for plugin to register
4. Open browser to `$JF_BASE_URL`
5. Open DevTools console
6. Run regression checks R1-R8
7. Run performance measurements P1-P8
8. Record all results

### Results Format
```markdown
| Eval | Status | Value | Notes |
|------|--------|-------|-------|
| R1   | PASS/FAIL | — | error details if any |
| P1   | — | Xms | median of 3 runs |
```
