# features/no-hard-refresh — Bug Tracking

Live tracker for every issue surfaced during user QA on the no-hard-refresh
branch. New bugs go in `OPEN`. As each one is fixed and verified by Playwright
+ a review loop, it moves into `FIXED`.

Working dir: `/home/jake/Documents/Jellyfin-Enhanced/features/no-hard-refresh`
Deploy target: `jellyfin-dev` (port 8097)
Tests: `/tmp/je-e2e-test/test-no-hard-refresh.js`, `test-baseurl.js`,
`test-configpage-deep.js`, `test-tab-debug.js`, `test-html-dump.js`.

## OPEN

(none)

## FEATURES

### F1 — Auto-reload all signed-in clients when admin saves a config change

**Request:** When admin saves a plugin setting, every signed-in client should
refresh itself so the change takes effect — without each user manually
hitting reload. Don't reload during media playback; prefer to time it for
when the user is doing nothing; fall back to a reload on home navigation.
Opt-in via an admin toggle.

**Implementation summary:**

- `Web/ConfigVersion.cs` — folded the plugin config file's
  `File.GetLastWriteTimeUtc(...).Ticks` into the SHA-256 hash material so
  EVERY admin save bumps the digest, not just changes inside the curated
  sidebar/tabs subset.
- `Configuration/PluginConfiguration.cs` — added
  `bool AutoReloadOnConfigChange` (default `false`).
- `Controllers/JellyfinEnhancedController.cs` — exposed
  `AutoReloadOnConfigChange` in the `GetPublicConfig` response so the
  client can opt in.
- `Configuration/configPage.html` — Live Updates fieldset on the Display
  tab with a single checkbox.
- `js/web/auto-reload.js` (new) — JE.AutoReload module.
  - Subscribes to `JE.HotReload.on('config', …)`.
  - 30 s post-boot grace window — first config bump after page load is
    just the baseline being established, not a real save.
  - Reload guards: never during media playback (covers `<video>/<audio>`
    not paused, `playbackManager.isPlaying()`, and `#/video|#/audio`
    routes); prefer 30 s of input idle (mousemove / keydown / touchstart
    / wheel / pointerdown); fall back to reload on `viewshow` of
    `#indexPage` or hash matching `/home`.
  - **Loop guard** (adopted from FT plugin PR #57): max 3 reloads per 60 s
    via `sessionStorage['__JE_AR_RELOADS__']`. If exceeded, degrades to
    `JE.toast(...)` if available, otherwise `console.warn`. Defense in
    depth against pathological feedback loops.
- `js/web/hot-reload.js` — added a debounced (500 ms) `poke()` that brings
  the next poll forward on `visibilitychange`, `window focus`, and
  `hashchange` (also adopted from FT plugin PR #57). Materially improves
  latency when a user tabs back in.
- `js/web/web-kickoff.js` — wired `JE.AutoReload.init()`.
- `js/plugin.js` — added `web/auto-reload.js` to the loader list.

**Verified by:** `/tmp/je-e2e-test/test-auto-reload.js` —

```
initial: {"enabled":true,"state":{"pendingReload":false,"idle":false,"playing":false,"loopGuardTripped":false}}
Waiting 35s for grace window to expire…
Saving a config change (ToastDuration bump)…
Watching for client reload (up to 30s)…
🟢 client reloaded after config change
```

**Diagnostic-counter cleanup:** during debug we instrumented HotReload /
AutoReload / WebKickoff with `__JE_HR_*`, `__JE_AR_*`, `__JE_WK_*`
counters and a `sessionStorage['__JE_HR_START_CALLS_PERSIST__']` ring.
All removed after the feature converged. The only remaining
sessionStorage key is `__JE_AR_RELOADS__`, which is the legitimate
loop-guard log, not a diagnostic.

**Review iterations:**

- *iter-1* (3 parallel reviewers: code-reviewer + silent-failure-hunter +
  security-reviewer). Findings:
  - CRITICAL: `ConfigVersion.ReadConfigMtime()` silently swallowed all FS
    errors and returned `0`, which collapsed the hash material back to
    just sidebar+tabs and silently masked saves outside that subset.
    Fixed by logging via `_logger.Warning` and falling back to
    `DateTime.UtcNow.Ticks`.
  - HIGH: file-write/poll race and filesystem mtime granularity
    (FAT/NFS/overlayfs round to ~1s). Fixed by adding a monotonic
    `_saveCounter` mixed into the hash material; counter is
    incremented from a `JellyfinEnhanced.SaveConfiguration` override.
  - HIGH: `window.playbackManager` was dead code in modern Jellyfin web
    10.10+ (it's an ES module export, never on `window`). Replaced
    with DOM-observable signals (`.videoPlayerContainer:not(.hide)`,
    `.nowPlayingBar:not(.hide)`, `body.osdShown`) plus the existing
    `<video>/<audio>` and `#/video|#/audio` heuristics.
  - MEDIUM: AutoReload `pollTimer` leak — set on every config emit,
    never cleared after a successful reload or loop-guard trip. Fixed
    by extracting `stopTickPolling()` and calling it in both branches.
  - Security review: clean, ship.

- *iter-2* (re-review of fixes). Findings:
  - HIGH: `OnConfigSaved` was `Increment` then `Invalidate`, leaving a
    window where a /version request between the two saw stale cache.
    Fixed by holding `_lock` around both writes.
  - HIGH: scope expansion — `ClearTranslationCacheTask` calls
    `SaveConfiguration()` directly, bypassing the original
    `UpdateConfiguration` override. Fixed by overriding
    `SaveConfiguration()` instead so all save paths fire
    `OnConfigSaved`.

- *iter-3* (sanity pass after iter-2 fixes). Findings:
  - HIGH: switching from `UpdateConfiguration` override to `SaveConfiguration`
    override LOST coverage on the HTTP `/Plugins/{id}/Configuration`
    admin-save path. Verified empirically by adding a probe log line
    inside the override — two HTTP saves produced zero probe entries,
    only the internal direct callers (shortcut normalizer at startup,
    `ClearTranslationCacheTask`) hit the override. Fixed by overriding
    BOTH `UpdateConfiguration` AND `SaveConfiguration` and routing
    them through a shared `NotifyConfigSaved()` helper — idempotent if
    a future Jellyfin version chains the two methods (counter
    increments twice on one save, hash differs, client reloads once).

- *iter-4* (sanity pass after iter-3 fix): clean.

**Debug story (kept short for the next person who hits this):** the test
initially reported the client never reloaded. Three red herrings before
the real diagnosis:

1. We thought the server hash wasn't bumping after a save → ruled out by
   curling /version before/after a save; mtime-in-hash was working.
2. We thought HotReload's `current[topic] !== nextVal` check was wrong →
   ruled out by adding a per-poll value trace; the check was fine.
3. Finally noticed `performance.getEntriesByType('navigation')[0].type`
   was `"reload"` — i.e., **AutoReload had successfully reloaded the
   page**; the test's `nav > 1` check just doesn't catch that. Updated
   the assertion to check `navType === 'reload'`.

Lesson: when a feature triggers `location.reload()`, your assertion has
to look at navigation TYPE, not navigation count.

## FIXED

### B14 — Custom tab content stacks on top of an active JE sidebar route

**Symptom (user report):** "now if i go to sidebar page then go to a
custom tab it shows both one on top another"

**Reproduced via Playwright (`test-route-tab-stacking.js`):** activate
Hidden Content via sidebar → click Bookmarks custom tab → both
`hasRouteContainer:true` AND `hasActivePane:true` simultaneously,
producing the visual stack.

**Root cause:** the route hijacker mounted its container as a child of
`#indexPage` and hid sibling children. But it intentionally SKIPPED
elements whose computed display was already `none` — including the
JE custom tab panes (which default to `display:none`). When the user
then activated a custom tab, the pane's `.is-active` class flipped
its display to `block` while the route container stayed visible.

**Fix:**
- `js/web/route-hijacker.js` exposes a public `unmount()` method
  (was previously only callable internally on navigation).
- `js/web/tabs-manager.js` `activate()` calls
  `JE.RouteHijacker.unmount()` first if a JE route is currently
  mounted, so the route DOM is gone before the tab pane appears.
- The native-tab click handler (Home / Favourites) now also calls
  `unmount()` for the same reason — clicking a built-in Jellyfin tab
  while a JE route is mounted should also clear the route.

**Verified (`test-route-tab-stacking.js`):**
```
STEP 2 (route → custom tab):   hasRouteContainer:false  activePaneId:bookmarks  🟢
STEP 3 (route → native tab):   hasRouteContainer:false  activePaneId:null       🟢
```

All 8 regression suites still green:
no-hard-refresh, home-via-item, tabs-reentry, route-404 (4/4),
configpage-deep, true-cold, sidebar-click, route-tab-stacking (NEW).

### B12 — JE route content sits flush against the viewport edges

**Symptom (user report):** "fix the spacing of the page when it loads
as its right on the edge of the webpage"

**Root cause:** the route hijacker created its container with
`container.style.padding = '0'` and the matching `.je-route-host`
class had no CSS rule, so the rendered page (Hidden Content / Bookmarks
/ Calendar / Requests) had no left/right padding.

**Fix:** added an idempotent style block injected by the route
hijacker on first mount: `.je-route-host { padding: 12px 3vw;
box-sizing: border-box; }`. Same `12px 3vw` value the home-page tab
content uses, so JE pages match Jellyfin's standard inset.

**Verified by `test-spacing-error.js`:**
- pre-fix: child element `x=0, w=1400` (flush against viewport)
- post-fix: child element `x=42, w=1316` (42 px = 3vw of 1400 width)

Screenshot confirms visible left/right padding on the Hidden Content
page.

### B13 — `Cannot find module './'` console error from main.jellyfin.bundle

**User report:** "what is this error in the console and does it need
fixing — main.jellyfin.bundle…7b1ecac16383c50fb:2 Uncaught (in
promise) Error: Cannot find module './'"

**Diagnosis:** the error chain (i function in main.jellyfin.bundle →
chunk 81954 → setTimeout) is webpack's lazy-import runtime failing to
resolve a module for an unknown route. Jellyfin's SPA router does
something like `import('./pages/' + routeName)`; when `routeName`
came from the `/JellyfinEnhanced/<id>` URL — which Jellyfin's bundle
doesn't know — webpack threw asynchronously as `Cannot find
module './'`.

**Status: fixed by B11.** The B11 inline-preempt now intercepts
clicks, hashchange/popstate, AND `history.pushState` /
`replaceState` BEFORE Jellyfin's router gets a chance to see the JE
URL. The router never tries the dynamic import, so the error never
fires.

**Verified:** four post-B11 Playwright runs (`test-module-error.js`
hammering JE routes via cold-load, location.hash assignment, and
sidebar clicks; `test-jellyfin-bug.js` for a baseline non-JE bogus
route; `test-sidebar-click.js` with full pageerror/console.error
capture; the regular `test-route-404.js` × 4 routes) — none captured
the error after the B11 fix landed. If it still appears in your
session, do a full hard refresh / clear the browser cache so the
updated inline preempt loads.

### B11 — In-app sidebar click to JE route shows Page not found

**Symptoms (user report):**
"if i am on the home page and click on the sidebar page eg HC. Itll
take me to this url ../#/JellyfinEnhanced/hiddenContent but i still
get Page not found. but if i refresh the page the url changes to
../#/home but then it shows the HC page."

**Reproduced via Playwright (`test-sidebar-click.js`):** sidebar click
fires `pageNotFound=true` from 50ms onward; the URL persists as
`#/JellyfinEnhanced/hiddenContent` because Jellyfin's emby-linkbutton
navigates via `history.pushState()`, which fires NEITHER hashchange
NOR popstate. My capture-phase preempt listeners never trigger.

**Root cause:** Jellyfin uses three different navigation mechanisms
depending on context:
1. Browser address-bar / refresh — fires hashchange + load.
2. `<a href>` clicks — fires hashchange.
3. `emby-linkbutton` clicks — calls `history.pushState()` (silent).

The previous preempt only handled #1 (load) and #2 (hashchange).
Mechanism #3 was silent: URL changed but no event fired, so the route
hijacker only learned about the route via the next `viewshow` — by
which time Jellyfin had already painted notFound.

**Fix:** the inline preempt now installs THREE interception layers:
1. Initial-load URL parse + hashchange/popstate listeners (existing).
2. **NEW:** capture-phase `click` listener on document for `<a>`
   elements with href starting with `#/JellyfinEnhanced/` —
   preventDefault, stash route id, redirect to `#/home`.
3. **NEW:** wrappers around `history.pushState` /
   `history.replaceState` — if the requested URL matches a JE route,
   stash the id and substitute `#/home`.

A new custom `je-route-pending` event is dispatched after every stash
so RouteHijacker.evaluate() runs and mounts the route, even when no
native event fires (URL was already `#/home` before the stash).

**Verified by `test-sidebar-click.js`:** clicking the Hidden Content
sidebar entry while on home now shows `pageNotFound=false`, hash
stays at `#/home`, and `mounted=true` within 50ms.

All 7 regression suites still green:
- `test-no-hard-refresh.js` — 7/7
- `test-home-via-item.js` — bookmarks works (B8 reproduction)
- `test-tabs-reentry.js` — tabs survive home re-entry (B7)
- `test-route-404.js` — 4/4 routes mount (B6)
- `test-configpage-deep.js` — 10/10
- `test-true-cold.js` — pageNotFound=false on cold load (B10)
- `test-sidebar-click.js` — pageNotFound=false on in-app click (NEW)

### B10 — Cold load on `#/JellyfinEnhanced/<id>` flashes "Page not found"

**Symptom (user report):** "fix the pluginpages one. on
http://192.168.0.84:8097/web/#/JellyfinEnhanced/downloads i get page
not found"

**Reproduced via Playwright (`test-cold-load.js`):**

```
@0ms   hash=#/JellyfinEnhanced/downloads  pageNotFound=true   active=null
@100ms hash=#/JellyfinEnhanced/downloads  pageNotFound=true   active=null
@250ms hash=#/home                        pageNotFound=false  active=downloads
```

**Root cause:** the JS-side `route-hijacker.js` `preempt()` listener
catches hashchange events fine, but on a TRUE cold load (user pastes
the URL into the address bar, opens it in a new tab, or refreshes a
page that's at a JE route) Jellyfin's SPA bundles run before our
deferred plugin script. The bundle's React notFound view paints
before our redirect.

**Fix:** `Web/HtmlInjectionMiddleware.cs` injects a tiny inline
`<script>` immediately after `<head>` — runs SYNCHRONOUSLY during
HTML parse, BEFORE any deferred bundle executes. If the URL hash
matches `#/JellyfinEnhanced/<id>`, it stashes the id in
sessionStorage and `location.replace()`s to `#/home`. By the time
Jellyfin's router runs, the URL is already `#/home`, so no notFound
view is ever painted. `RouteHijacker.init()` reads the stashed id and
mounts the JE route once the plugin's JS finishes loading.

**Verified by `test-true-cold.js`** (a TRUE cold load — fresh tab to
`/web/#/JellyfinEnhanced/downloads` after auth was seeded in a
separate tab):

```
@0ms   hash=#/home  preemptHit=downloads  pendingRoute=downloads  pageNotFound=false  active=null
@1000ms hash=#/home  preemptHit=downloads  pendingRoute=null       pageNotFound=false  active=downloads
```

`pageNotFound=false` at every sample. The 1s delay before mount is
the JE plugin's normal cold-start time (loading 60+ component scripts).

All 6 regression suites still green:
- `test-no-hard-refresh.js` — 7/7 pass
- `test-home-via-item.js` — bookmarks tab works (B8 reproduction)
- `test-tabs-reentry.js` — tabs survive home re-entry (B7 reproduction)
- `test-route-404.js` — 4/4 routes mount (B6 reproduction)
- `test-configpage-deep.js` — 10/10 pass
- `test-true-cold.js` — pageNotFound=false on true cold load (NEW)

### B9 — JE tabs render on a second line below native Home / Favourites tabs

**Symptom (user report):** "now please make it inline with the other tabs"

**Root cause:** Jellyfin nests three layers in the home page header:

```
.headerTabs                       (header chrome)
  .tabs-viewmenubar.emby-tabs     (centred wrapper)
    .emby-tabs-slider             (the actual flex row of buttons)
      <button>Home</button>
      <button>Favourites</button>
```

The previous tabs-manager appended JE buttons to the OUTER `.headerTabs`
element. Jellyfin's `.emby-tabs-slider` is a horizontally centred flex
row, so JE buttons appended outside it landed in a separate row,
visually offset BELOW Home / Favourites.

**Fix:** `findStrip()` now drills into `.emby-tabs-slider` (preferred),
falling back to `.tabs-viewmenubar` and finally `.headerTabs` if the
inner layers haven't built yet (paint() is idempotent and re-runs on
viewshow / heartbeat). Buttons appended into the slider become siblings
of Home / Favourites and inherit the same flex layout.

**Verified by `test-tab-screenshot.js`:** strip children sequence is
now `[Home, Favourites, Calendar, Requests, Bookmarks, Hidden Content]`
— all six buttons inline. Pre-fix screenshot showed JE buttons on a
second row; post-fix shows a single row.

All five regression suites still green:
- `test-no-hard-refresh.js` — 7/7 pass
- `test-home-via-item.js` — bookmarks tab works (the user's exact reproduction)
- `test-tabs-reentry.js` — JE tabs survive home re-entry
- `test-route-404.js` — 4/4 routes mount
- `test-configpage-deep.js` — 10/10 pass

### B8 — Custom tabs broken after home-button navigation through item details

**Symptoms (user report):**
- "if i am on bookmarks tab then click on the superman movie then click home the tabs do not work"
- "though they start working again if i go from the home page and back to it without clicking that button"
- "or if i click the favourites tab then the added tabs start working after that"
- "sometimes that is not everytime. sometimes the new tabs load in the same page but under the favourites items."

**Reproduced via Playwright (`test-home-via-item.js`):** home → click
Bookmarks JE tab → navigate to a movie's details page → click the
header `.headerHomeButton` → back on home. Pre-fix snapshot:

```
indexPagesInDom: 2
indexPageStates: [
  { hidden: false, panes: 4 },   // visible: 4 panes
  { hidden: true,  panes: 4 }    // stale: 4 panes (duplicates!)
]
totalJePanes: 8
```

**Root cause:** Jellyfin's SPA keeps the previous home `#indexPage`
alive (hidden) when the user navigates back via the header home button,
and creates a fresh `#indexPage` for the new visit. The previous
tabs-manager's `paint()` selected `getElementById('indexPage')` which
returns the FIRST instance — sometimes the visible one, sometimes the
hidden one. That:
1. Caused JE panes to land in the wrong page (under Favourites rather
   than replacing them — exactly the user's "panes load under
   Favourites items" symptom).
2. Caused `.je-muted` to be applied to the wrong page's `.tabContent`
   panes (so native panes stayed visible in the active page).
3. Accumulated duplicate panes (8 total when the user expects 4),
   leaving the user clicking buttons that activated invisible panes.

**Fix:** `js/web/tabs-manager.js` `visibleIndexPage()` helper picks the
currently-visible `#indexPage` (filters by `hide` class on the page,
its `.mainAnimatedPage` ancestor, AND inline `display:none`). Both
`paint()` and `activate()` now operate exclusively on that page:
- `paint()` removes any pane that's not inside the visible indexPage,
  then ensures every entry has a pane there.
- `activate()` calls `paint()` first (fresh pane state), then queries
  panes only inside the visible indexPage, and toggles `.je-muted`
  scoped to that page. Stale `.je-muted` on other (hidden) indexPages
  is also stripped to avoid confused state if Jellyfin transitions
  back to them.

**Verified by `test-home-via-item.js`:**

```
STEP 4a — immediately after home-button click
indexPagesInDom: 2
indexPageStates: [
  { hidden: false, panes: 4 },   // visible: 4 panes (correct)
  { hidden: true,  panes: 0 }    // stale: 0 panes (cleaned up)
]
totalJePanes: 4   ← was 8

STEP 5 — try clicking a JE tab now
🟢 bookmarks tab works
```

Plus all other regressions hold:
- `test-no-hard-refresh.js` — 7/7 pass.
- `test-tabs-reentry.js` — 4/4 buttons after dashboard / library round-trip.
- `test-route-404.js` — 4/4 routes mount.
- `test-configpage-deep.js` — 10/10 pass.

### B7 — Custom tabs disappear when returning to home from another page

**Symptoms (user report):** "It works if you are on home and then click a
custom tab but as soon as you go to a different page then back to home
and try the custom tabs they do not work. you have to refresh the page
to get them to work."

**Reproduced via Playwright (`test-tabs-reentry.js`)** — initial home
load shows 4 JE buttons / 4 panes; navigate to /dashboard → return to
home → 0 buttons / 0 panes. Bug confirmed.

**Root cause:** the previous tabs-manager scoped its MutationObserver
to `.mainAnimatedPages`. Jellyfin destroys and rebuilds that container
on navigation, leaving the observer orphaned (a known JE gotcha — see
issue #536 in JE memory). When the user returned to home, the observer
was attached to a detached parent and never re-fired.

**Fix:** `js/web/tabs-manager.js` rewritten from scratch. New triggers
for paint:
1. `viewshow` event on `document` — fires after every SPA navigation.
2. 1-Hz polling safety net (cheap, idempotent — `paint()` no-ops when
   the strip already has all our buttons).
3. Hot-reload `tabs` topic for live admin config changes.
4. Initial WebKickoff fire-and-forget.

`paint()` is idempotent: if a tab button already exists for an entry id
it is left alone. Stale buttons (entry removed by hot-reload) and stray
panes from a previous home-page instance are removed in the same pass.

**Verified by `test-tabs-reentry.js`:**
- Step 1 (initial home): 4/4 buttons + 4/4 panes ✓
- Step 3 (back to home from /dashboard): 4/4 ✓ (was 0/0 before fix)
- Step 4 (back from /movies.html): 4/4 ✓

Also:
- `test-no-hard-refresh.js`: 7/7 still pass.
- `test-configpage-deep.js`: 10/10 still pass.
- `test-route-404.js`: 4/4 routes mount.

The new file is written from scratch and does not adapt or include any
third-party Custom Tabs code.

### B6 — `#/JellyfinEnhanced/<id>` shows Jellyfin's "Page not found" view

**Symptoms (user report):** "http://192.168.0.84:8097/web/#/JellyfinEnhanced/bookmarks
shows Page not found - This is not the page you are looking for."

**Root cause:** Jellyfin's SPA router has no route registered for
`/JellyfinEnhanced/*`, so it paints its built-in notFound view. My
RouteHijacker mounted the JE page content correctly into `#indexPage`,
but `#indexPage` was hidden because the SPA had switched to the notFound
view.

**Fix:** `js/web/route-hijacker.js` `preempt()` listener installed on
the capture phase of `hashchange` / `popstate`. When the new hash matches
`#/JellyfinEnhanced/<id>`, we redirect to `#/home` (which Jellyfin DOES
recognise) and stash the JE route id for the mount step. The visible URL
becomes `#/home` but the content is the JE page; the browser back button
behaves correctly.

**Verified by `test-route-404.js`:** all 4 routes mount with
`notFoundFound: false` (was `true` for all of them before the fix).

### B5 — Stale "Missing required integration plugin" warnings

**Symptoms (carried over from review-loop iteration 2):** Pages and
Branding sections in the Overview dashboard reported "Missing required
integration plugin" when the JE web subsystem was already providing the
surface. Misleads admins into installing PP/CT/FT.

**Fix:** Dashboard predicates simplified — `feat('Bookmarks', enabled,
'pages', 'Enabled', false)` etc. No more probe-dependent warnings.

### B4 — `loadConfig` had no `.catch`

**Symptoms (carried over from review-loop iteration 2):** A 5xx / auth
blip on `getPluginConfiguration` left the loading overlay up forever
with no admin-visible error.

**Fix:** Added `.catch` that logs to console, hides the loading overlay,
and shows a `Dashboard.alert`.

### B1 — Config page broken: tabs don't switch / save button missing / settings unchangeable

**Symptoms (user report):** "configuration page for jellyfin enhanced is broken.
can't change settings move or do anything", then "tabs aren't working hidden
content requests page are in the wrong spots on tab Overview not in Pages and
the save button is missing."

**Root cause (Playwright-confirmed):** Four orphan `</div>` tags after each
`<input id="*UseCustomTabs">` checkbox, left behind when an earlier Python
regex pass removed the surrounding "auto-create Custom Tabs entry"
sub-blocks. The HTML parser auto-closed the form when it hit the first
unbalanced `</div>`, truncating the form at the Pages tab.

```html
<div class="checkboxContainer"><label><input id="bookmarksUseCustomTabs"...></label></div>
                            </div>   <!-- stray, orphaned -->
```

The DOM that the browser actually built after the parser repair:

| Form children (broken) | Form children (fixed) |
|---|---|
| 5 (overview, display, playback, pages, FIELDSET) | 12 (overview, display, playback, pages, seerr, arr, elsewhere, extras, keyboard, docs, save dock + apply hint) |

Submit buttons in DOM jumped from **0 → 1**.

**Fix:** Removed the orphan `</div>` after each of the 4 `*UseCustomTabs`
checkboxes (`bookmarks`, `hiddenContent`, `downloads`, `calendar`).
Verified by counting `<div>` open/close tags inside the form — delta
went from `-4` to `0`.

**Playwright verification (`test-tab-debug.js`):**

```
before: active tab = overview
after click: active tab = display          ← tab switching restored
display content active = true              ← inactive tabs hide correctly
form.children count = 12                   ← all tabs reattached
submit buttons in DOM: 1                   ← save button rebuilt
save btn: rect=189x40 display=flex ...     ← save dock visible
```

`test-configpage-deep.js`: tabs switch 4/4, save button click succeeds,
still on page.

### B2 — `CUSTOM_TAB_MANAGED_ENTRIES` ReferenceError on every config page load

Pre-existing finding from this same review session, fixed in commit
`548c6a1` ("fix(configpage): reintroduce CUSTOM_TAB_MANAGED_ENTRIES as
empty array"). Listed here for completeness so the tracker is the
single source of truth.

### B3 — Custom Tabs / Plugin Pages / File Transformation external plugins disabled in jellyfin-dev

User-driven test setup, not a bug — user asked us to confirm JE works on a
clean install without those three external plugins. Verified by
`test-no-hard-refresh.js` (7/7 pass) and `test-baseurl.js` (sub-path
mount works).

### B1 — Config page broken: tabs don't switch / save button missing / settings unchangeable

**Symptoms (user report):** "configuration page for jellyfin enhanced is broken.
can't change settings move or do anything", then "tabs aren't working hidden
content requests page are in the wrong spots on tab Overview not in Pages and
the save button is missing."

**Root cause (Playwright-confirmed):** Four orphan `</div>` tags after each
`<input id="*UseCustomTabs">` checkbox, left behind when an earlier Python
regex pass removed the surrounding "auto-create Custom Tabs entry"
sub-blocks. The HTML parser auto-closed the form when it hit the first
unbalanced `</div>`, truncating the form at the Pages tab.

```html
<div class="checkboxContainer"><label><input id="bookmarksUseCustomTabs"...></label></div>
                            </div>   <!-- stray, orphaned -->
```

The DOM that the browser actually built after the parser repair:

| Form children (broken) | Form children (fixed) |
|---|---|
| 5 (overview, display, playback, pages, FIELDSET) | 12 (overview, display, playback, pages, seerr, arr, elsewhere, extras, keyboard, docs, save dock + apply hint) |

Submit buttons in DOM jumped from **0 → 1**.

**Fix (commit pending):** Removed the orphan `</div>` after each of the 4
`*UseCustomTabs` checkboxes (`bookmarks`, `hiddenContent`, `downloads`,
`calendar`). Verified by counting `<div>` open/close tags inside the form —
delta went from `-4` to `0`.

**Playwright verification (`test-tab-debug.js`):**

```
before: active tab = overview
after click: active tab = display          ← tab switching restored
display content active = true              ← inactive tabs hide correctly
form.children count = 12                   ← all tabs reattached
submit buttons in DOM: 1                   ← save button rebuilt
save btn: rect=189x40 display=flex ...     ← save dock visible
```

`test-configpage-deep.js`: tabs switch 4/4, save button click succeeds,
still on page.

### B2 — `CUSTOM_TAB_MANAGED_ENTRIES` ReferenceError on every config page load

Pre-existing finding from this same review session, fixed in commit
`548c6a1` ("fix(configpage): reintroduce CUSTOM_TAB_MANAGED_ENTRIES as
empty array"). Listed here for completeness so the tracker is the
single source of truth.

### B3 — Custom Tabs / Plugin Pages / File Transformation external plugins disabled in jellyfin-dev

User-driven test setup, not a bug — user asked us to confirm JE works on a
clean install without those three external plugins. Verified by
`test-no-hard-refresh.js` (7/7 pass) and `test-baseurl.js` (sub-path
mount works).

## Pattern: orphan tags from regex-based HTML edits

Lesson learned from B1: when removing nested `<div>...</div>` blocks with a
regex that matches the OUTER container plus its contents, a missing inner
closing tag in the source HTML can land the regex on the wrong outer close,
leaving the actual outer's close as an orphan.

For future edits to large HTML files: prefer line-based / parsed edits over
regex, AND always run a balance check (`<tag>` open count vs `</tag>` close
count) before deploying. The check that caught B1:

```python
form = text[form_start:form_end]
opens = len(re.findall(r'<div\b', form))
closes = form.count('</div>')
assert opens == closes
```

## Verification protocol (per user instruction)

1. After every fix: rebuild plugin DLL, redeploy to `jellyfin-dev`, restart
   container, wait 16s.
2. Re-run the smoke tests (`test-no-hard-refresh.js`, `test-configpage-deep.js`).
3. Update this doc: move the bug from OPEN to FIXED with the Playwright
   evidence pasted under it.
4. Run a targeted review loop pass (Claude code-reviewer +
   silent-failure-hunter) when the fix touches non-trivial code.
5. Don't stop until every OPEN bug is FIXED and verified.
