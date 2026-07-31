# Timers → observers: bugs found and fixed

Working notes for the `refactor/timers-to-observers` branch, which replaces timer-based
waiting (fixed delays, polling loops) with event-driven waiting.

Branch base: `af5b7d6` — the head of the client modularization PR
([n00bcodr/Jellyfin-Enhanced#723](https://github.com/n00bcodr/Jellyfin-Enhanced/pull/723)).

Every bug below was found by auditing the plugin against the two reference web clients
(`jellyfin-web` 10.11.10 and 12) and verified against the code, not inferred. Each entry
records whether the bug also exists on `upstream/main` — **all of them do**; none were
introduced by the modularization.

---

## Why timers are the wrong tool here

Three facts about the Jellyfin web client drive almost every bug on this page:

1. **In-app navigation is `history.pushState` only.** Both clients use `createHashRouter`
   and funnel every navigation through `router.navigate()`. Neither client assigns
   `location.hash` or listens for `hashchange`. So a raw `window.addEventListener('hashchange', …)`
   **never fires for forward in-app navigation** — only for browser back/forward
   (`popstate`). `JE.core.navigation`'s `pushState` patch is the only non-polling detector.

2. **Action sheets are lazy-loaded.** The video OSD opens subtitle/audio menus via a dynamic
   `import()` of `components/actionSheet/actionSheet` — a webpack chunk fetched over HTTP on
   first use in the session. Any fixed delay before reading that menu is really a bet on
   network latency.

3. **Dismissed action-sheet DOM lingers.** Jellyfin leaves closed sheets in the document, so
   an unscoped `document.querySelector('.actionSheetContent …')` can match a stale sheet.

---

## Bugs fixed

### 1. Splash screen can hang for 20 s as an uninteractable black overlay

**Severity:** high — blocks the entire UI.
**Upstream:** yes, identical.

`others/splashscreen.js` waits for "core UI ready" via `READY_SELECTORS`, backed by a 20 s
hard timeout. Two of the eight selectors can never match anything:

- `'#mainAnimatedPage'` is an **ID** selector, but `mainAnimatedPage` only ever exists as a
  **class** (`viewContainer.js` does `view.classList.add('mainAnimatedPage')`). Verified:
  `id="mainAnimatedPage"` has **0 occurrences** in either client; the class has 59 (10.11)
  and 53 (12). `isUIReady` even carries a special case for this selector — dead code.
- `'customTabButton_0'` has no `#`/`.` prefix, so it is a *type* selector matching a
  `<customtabbutton_0>` element. No such element exists in either client or in this plugin.

Three more (`.slides-container`, `.backdrop-container`, `.editorsChoiceItemBanner`) match
nothing in either client — they are third-party theme markup.

That leaves `.manualLoginForm` (login page, and it starts hidden), `.homeSectionsContainer`
(home page only) and `.pageContainer` (select-server only). **Deep-link to anything else** —
`#/details?id=…`, `#/list`, `#/search`, `#/dashboard` — and no selector can ever match, so
the splash stays up until the 20 s hard timeout. The overlay is
`position: fixed; inset: 0; background: #000; z-index: 99999999`, so the user stares at a
black screen with a fake progress bar and cannot interact.

**Fix:** correct `#mainAnimatedPage` → `.mainAnimatedPage`, drop the two selectors that
match nothing and the now-dead special case, route the readiness observer through
`JE.core.dom.onBodyMutation`, and replace the raw `hashchange` listener with
`JE.core.navigation.onNavigate` (per fact 1 above, the `hashchange` listener never fired for
in-app navigation anyway).

---

### 2. "Cycle Subtitle Tracks" reports "No Subtitles Found" — upstream issue #705

**Severity:** high — the reported bug.
**Upstream:** yes, byte-identical.

`enhanced/player/playback.js` clicks `button.btnSubtitles`, then:

```js
setTimeout(performCycle, 200);
```

`performCycle` reads `.actionSheetContent .listItem`; if it finds none it toasts
"No Subtitles Found". Four separate defects compound here:

1. **The 200 ms budget must cover a lazy chunk fetch.** The OSD opens the sheet with a
   dynamic `import()`, so on a cold cache, a remote server, or mobile the module download
   alone can exceed 200 ms. This is why the maintainer could not reproduce it on a warm
   localhost.
2. **The toast is never truthful.** `showSubtitleTrackSelection` always prepends an "Off"
   entry, so the sheet always renders at least one row. `allItems.length === 0` is therefore
   a pure timing signal — it can never mean "this item has no subtitles".
3. **The recovery is a no-op.** After failing it calls `document.body.click()` to close the
   menu, but Jellyfin's outside-click handler requires `e.target` to *be* the dialog
   container, which is a child of `body`. So the unwanted sheet stays open over the video.
4. **The already-open fast path is English-only.** It matches
   `textContent === 'Subtitles'` / `'Audio'`, but those titles are localized
   (`Untertitel`, `Sous-titres`, 字幕). On a non-English UI the fast path never matches, so
   the code re-clicks the button and **stacks a second sheet**; the unscoped
   `querySelectorAll` then sees rows from both sheets at once.

`cycleAudioTrack` has all four defects identically.

**Fix:** snapshot the open sheets, click, then wait — via a `MutationObserver` — for a sheet
that was **not** present before, scope every subsequent query to that sheet element, identify
real tracks by `data-id` rather than by English text, and close via the dialog container
rather than `document.body`.

---

### 3. Hidden Content page can render underneath the destination page

**Severity:** high — visibly broken UI.
**Upstream:** yes.

`enhanced/hiddencontent/hidden-content-page-nav.js` runs a 150 ms `setInterval` location
watcher while its page is open. That poll is **load-bearing**, not redundant:
`hidden-content-page-init.js` registers `handleNavigation` on `hashchange`/`popstate` only,
and per fact 1 those never fire for in-app navigation. The remaining backstops need either a
`viewshow` from the destination or a click on one of three specific selectors.

Navigate away by any other route — a React-rendered destination, or a programmatic
`Emby.Page` navigation — and the page is never hidden. Because `showPage()` stashed the
previous page and added `.hide` to it, **the destination renders underneath a still-visible
Hidden Content page**: the user clicks into a library and keeps seeing the hidden-items grid.
Even in the good case the poll leaves a 0–150 ms double-render flash.

`enhanced/bookmarks/bookmarks-library-page.js` has the same watcher and the same exposure.

**Fix:** migrate both to `JE.core.navigation.onNavigate`, which detects `pushState`
navigation directly. Verified that `onNavigate`'s `href` key is a strict superset of the
watchers' `pathname + hash` signature, and that both `handleNavigation` bodies are idempotent
so the extra search-string-only firings are harmless.

---

## Notes on tooling

- `JE.core.dom.waitForElement` existed with **zero consumers**. It could not fix these sites
  as written: it resolves immediately when the selector already matches, and a stale sheet
  always matches. It also builds on `onBodyMutation`, which ignores batches with no
  added/removed nodes — so it cannot detect a `classList.remove('hide')` or a text fill.
  Sites needing those must use `JE.core.dom.createObserver` with an attribute filter.
- Everything here stays **plain JavaScript** — IIFE modules over the `JE` global, JSDoc for
  types, no TypeScript and no build step, consistent with PR #723.
