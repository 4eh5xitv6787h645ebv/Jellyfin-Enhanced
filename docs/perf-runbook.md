# Performance Testing Runbook

## Prerequisites

Set environment variables (do NOT hardcode secrets):
```bash
export JF_BASE_URL="http://localhost:8097"
export JF_API_KEY="<your-api-key>"
export JF_DOCKER_CONTAINER="jellyfin-dev"
export JF_PLUGINS_PATH="/home/jake/Docker Testing/jellyfindev/config/data/plugins"
```

## Step 1: Verify Environment

```bash
# Check Jellyfin is running
curl -sS "$JF_BASE_URL/System/Info/Public" >/dev/null && echo "JF public ok" || echo "JF UNREACHABLE"

# Check auth works
curl -sS -H "X-Emby-Token: $JF_API_KEY" "$JF_BASE_URL/System/Info" >/dev/null && echo "JF authed ok" || echo "AUTH FAILED"

# Check Docker container
docker ps --filter "name=$JF_DOCKER_CONTAINER" --format "{{.Status}}"
```

## Step 2: Deploy Plugin

```bash
# Option A: Copy from local repo build
# The plugin is raw JS — copy the plugin directory directly
cp -r /home/jake/Documents/git/performace/Jellyfin.Plugin.JellyfinEnhanced/ "$JF_PLUGINS_PATH/Jellyfin.Plugin.JellyfinEnhanced/"

# Restart Jellyfin to pick up changes
docker restart "$JF_DOCKER_CONTAINER"

# Wait for startup
sleep 10

# Verify plugin loaded (check logs)
docker logs -n 50 "$JF_DOCKER_CONTAINER" 2>&1 | grep -i "JellyfinEnhanced\|plugin"
```

## Step 3: Regression Checks

Open browser to `$JF_BASE_URL` with DevTools open (Console + Network tabs).

### R1: Plugin Loads Without Errors
- [ ] Open Console tab
- [ ] Hard refresh (Ctrl+Shift+R)
- [ ] Verify: "All components initialized successfully" in console
- [ ] Verify: No CRITICAL/FATAL errors from JellyfinEnhanced
- [ ] Note any warnings

### R2: Discovery Page Renders
- [ ] Navigate to home/discovery page
- [ ] Verify: Media cards render with images
- [ ] Scroll down at least 3 page-loads worth
- [ ] Verify: New content loads seamlessly
- [ ] Verify: No blank sections or stuck spinners

### R3: Item Details Page
- [ ] Click a movie from the library
- [ ] Verify: Detail page loads completely
- [ ] Verify: Quality/genre/rating tags visible (if enabled)
- [ ] Verify: Elsewhere section loads (if enabled)
- [ ] Click a TV show, verify seasons/episodes load

### R4: Playback Controls
- [ ] Start playing any media item
- [ ] Pause — verify pause screen overlay appears
- [ ] Test subtitle settings (if available)
- [ ] Test bookmark creation (if enabled)
- [ ] Resume and stop playback cleanly

### R5: Settings Panel
- [ ] Open JellyfinEnhanced settings (Dashboard → Plugins → JE)
- [ ] Toggle any setting
- [ ] Save
- [ ] Refresh page
- [ ] Verify setting persisted

### R6: Tag Systems
- [ ] Navigate to any library (Movies, Shows)
- [ ] Verify quality tags on cards (resolution badges)
- [ ] Verify genre tags (if enabled)
- [ ] Verify language tags (if enabled)
- [ ] Verify rating tags (if enabled)

### R7: Keyboard Shortcuts
- [ ] If shortcuts configured, test them
- [ ] Verify no conflict with Jellyfin defaults

### R8: Jellyseerr Integration (if enabled)
- [ ] Open Jellyseerr discovery/search
- [ ] Search for a media item
- [ ] Open detail modal
- [ ] Verify request functionality

## Step 4: Performance Measurements

### P1: Initial Load Time (TTI Proxy)
```
1. Hard refresh (Ctrl+Shift+R) with Console open
2. Note timestamp of "All components initialized successfully"
3. Calculate delta from navigation start
4. Repeat 3 times, record median
```

### P2: Script Load Count and Size
```js
// Paste in Console after full load:
(() => {
  const entries = performance.getEntriesByType('resource')
    .filter(r => r.name.includes('JellyfinEnhanced'));
  const total = entries.reduce((sum, r) => sum + r.transferSize, 0);
  console.table(entries.map(r => ({
    file: r.name.split('/').pop().split('?')[0],
    transferKB: (r.transferSize / 1024).toFixed(1),
    durationMs: r.duration.toFixed(0)
  })));
  console.log(`Total: ${entries.length} files, ${(total / 1024).toFixed(1)} KB`);
})();
```

### P3: Route Change Time
```
1. Open Performance tab in DevTools
2. Click Record
3. Navigate: Home → Movies Library → Movie Detail → Back to Library
4. Stop recording
5. Note time for each transition
```

### P4-P5: Network Request Counts
```
1. Open Network tab, clear
2. Navigate to discovery/home page
3. Count requests from JellyfinEnhanced (filter: "JellyfinEnhanced")
4. Scroll down 1 page — count additional requests
5. Navigate to an item detail page — count requests
```

### P6: DOM Node Count
```js
// Paste in Console:
// Initial (after page load):
console.log('DOM nodes (initial):', document.querySelectorAll('*').length);

// After scrolling 5 pages on discovery:
console.log('DOM nodes (after scroll):', document.querySelectorAll('*').length);
```

### P7: Long Tasks
```js
// Paste BEFORE navigation:
window.__jeLongTasks = [];
new PerformanceObserver(list => {
  list.getEntries().forEach(e => window.__jeLongTasks.push({
    duration: Math.round(e.duration),
    startTime: Math.round(e.startTime)
  }));
}).observe({ type: 'longtask', buffered: true });

// After page load, check:
console.log('Long tasks:', window.__jeLongTasks.length,
  'Max:', Math.max(...window.__jeLongTasks.map(t => t.duration)), 'ms');
```

### P8: Memory Usage
```js
// Chrome only:
const mem = performance.memory;
console.log('JS Heap:', (mem.usedJSHeapSize / 1024 / 1024).toFixed(1), 'MB',
  '/ Total:', (mem.totalJSHeapSize / 1024 / 1024).toFixed(1), 'MB');
```

## Step 5: Record Results

Record all results in `docs/perf-baseline.md` (before) or append to `docs/perf-results.md` (after each slice).

Use this template:
```markdown
## [Date] - [Slice Name or "Baseline"]

| Eval | Status/Value | Notes |
|------|-------------|-------|
| R1: Plugin Load | PASS/FAIL | |
| R2: Discovery | PASS/FAIL | |
| R3: Item Details | PASS/FAIL | |
| R4: Playback | PASS/FAIL | |
| R5: Settings | PASS/FAIL | |
| R6: Tags | PASS/FAIL | |
| R7: Shortcuts | PASS/FAIL | |
| R8: Jellyseerr | PASS/FAIL | |
| P1: TTI | Xms | median of 3 |
| P2: Scripts | N files, X KB | |
| P3: Route Change | X-Yms | per route |
| P4: Requests (Discovery) | N requests | |
| P5: Requests (Details) | N requests | |
| P6: DOM Nodes | initial/after-5-pages | |
| P7: Long Tasks | N tasks, max Xms | |
| P8: Memory | X MB heap | |
```
