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

## FIXED

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
