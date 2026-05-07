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
