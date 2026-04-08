# cache-fix-v2 — Review Findings

> Working notes for the massive review + fix pass on
> `4eh5xitv6787h645ebv/Jellyfin-Enhanced@features/cache-fix-v2`.
> Created so work is resumable if the conversation is lost.

## Context / environment

- **Working dir:** `/home/jake/Documents/Jellyfin-Enhanced/features/cache-fix-v2`
- **Branch:** `features/cache-fix-v2` tracking `fork/features/cache-fix-v2`
- **Fork remote:** `https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced.git`
- **Upstream origin:** `https://github.com/n00bcodr/Jellyfin-Enhanced.git`
- **Deploy target:** `jellyfin-dev` Docker container, port 8097 (admin/4817). NEVER the `jellyfin` prod container.
- **Plugin dir inside container:** `/config/data/plugins/Jellyfin Enhanced_11.4.0.0/` (discover with `docker exec jellyfin-dev ls /config/data/plugins/ | grep "Jellyfin Enhanced_"`).
- **Plugin version on branch:** 11.5.0.0 (manifest entry for 11.5.1.0 was deleted — see C4).
- **Build:** `dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj` — 0W/0E as of initial review.
- **E2E tests:** `/tmp/je-e2e-test/test-cache-fix-v2.js`, `/tmp/je-e2e-test/test-theme-selector-referror.js`, `/tmp/je-e2e-test/test-teardown-scope.js`. Playwright is already installed in `/tmp/je-e2e-test/`.

## Branch architecture summary

The branch introduces a reactive config system so admins don't need to hard-refresh after saving plugin settings:

- `NoCacheConfigFilter.cs` — global MVC `IActionFilter` that adds `Cache-Control: no-store` to a fixed allowlist of Jellyfin core + plugin config endpoints (Dashboard.GetConfigurationPages, Dashboard.GetDashboardConfigurationPage, Plugins.GetPluginConfiguration, JellyfinEnhanced.GetPublicConfig, JellyfinEnhanced.GetPrivateConfig, JellyfinEnhanced.GetConfigHash), matched by route values after routing. Registered via `opts.Filters.Add<NoCacheConfigFilter>()` in `PluginServiceRegistrator.cs`.
- `Controllers/JellyfinEnhancedController.cs` adds `GetConfigHash()` returning SHA256 of a subset of config fields, cached in static `_cachedConfigHash`, invalidated via `ConfigurationChanged` event in `JellyfinEnhanced.cs:37`.
- `js/enhanced/config-store.js` (`JE.configStore`) — polls `/config-hash` on navigation/visibility/pageshow/storage/broadcast, fetches `/public-config` + `/private-config` on hash change, diffs keys, notifies subscribers. BroadcastChannel + localStorage for cross-tab sync. 2s rate limit, reentrancy guard.
- `js/enhanced/module-registry.js` (`JE.moduleRegistry`) — modules register with `{configKeys, enableKey, init, teardown, onConfigChange}`. Registry fans out lifecycle on config change.
- `js/enhanced/helpers.js` `createModuleContext(name)` — builds a resource-tracking ctx with `observe`/`listen`/`css`/`dom`/`timer`/`interval`/`state`/`onTeardown`. Auto-teardown cleans everything.
- 16 modules register with the lifecycle system. Big refactor of calendar-page, requests-page, hidden-content-page, arr-links, arr-tag-links, letterboxd-links, elsewhere, jellyseerr, item-details, hss-discovery-handler, extras/* (colored-ratings, colored-activity-icons, plugin-icons, theme-selector), reviews, hidden-content.
- **Scope changes** (heads up for any re-review): user-reviews feature REMOVED (endpoints + model + ~420 lines of reviews.js). Server-side de-DE→de locale fallback removed (now handled client-side in `translations.js buildLanguageChain()`).

## Findings table

Status legend: `open` · `in_progress` · `fixed` · `wontfix` · `verified`

> **Update 2026-04-08:** All CRITICAL / HIGH findings fixed and verified against
> jellyfin-dev with the full Playwright E2E suite. Final build 0W/0E. See
> "Fix log" section at the bottom for a complete change list and verification
> results.

### CRITICAL — merge blockers

| ID | Status | File:line | Summary |
|---|---|---|---|
| **C1** | fixed | `js/extras/theme-selector.js:443, 450` | IIFE-top-scope reference to `JE` throws `ReferenceError` in cold-load race (bookmarks-library.js:1228 sets `window.JE = je`, but load order is not guaranteed). Aborts IIFE → theme selector never registers → feature completely broken on races where theme-selector loads first. **Verified empirically** — Playwright page-error listener captured `ReferenceError: JE is not defined at .../theme-selector.js:443:16`. |
| **C2** | fixed | `js/arr/arr-links.js:347-355`, `js/arr/arr-tag-links.js:227-235`, `js/others/letterboxd-links.js:186-200`, `js/elsewhere/elsewhere.js:1154-1172`, `js/jellyseerr/jellyseerr.js:600-624` | Each registers a `createModuleContext` teardown that references state vars (`debounceTimer`, `isAddingLinks`, `slugCache`, `processedItems`, `lastVisibleItemId`, `processingLetterboxd`) declared INSIDE the `JE.initializeXScript = async function()` body — not at IIFE scope where the teardown closure can see them. Teardown throws `ReferenceError` on every live toggle; state leaks. **Verified empirically** — Playwright triggered the reactive teardown via config change on arr-links, captured `arr-links teardown cleanup error: ReferenceError: debounceTimer is not defined at .../arr-links.js:352:13`. |
| **C3** | fixed | `js/arr/calendar-custom-tab.js:124`, `js/arr/requests-custom-tab.js:116`, `js/enhanced/hidden-content-custom-tab.js:118`, `js/enhanced/bookmarks-library.js:1247` | All four revert PR #540 (issue #536 fix) — observer target changed from `document.body` back to `document.querySelector('.mainAnimatedPages') \|\| document.body`. Jellyfin replaces `.mainAnimatedPages` on dashboard navigation → observer orphans on detached node → custom tabs render empty after `home → dashboard → home`. `hidden-content-custom-tab.js` and `bookmarks-library.js` also downgrade from `JE.helpers.createObserver` to raw `new MutationObserver`. Main branch has an explicit comment warning against this exact mistake. |
| **C4** | fixed | `manifest.json` (8 lines removed) | Released version `11.5.1.0` changelog entry deleted. Shipped `2026-04-05` to fix #531 (plugin UI disappearing after upgrade). Looks like bad-rebase artifact. Users pointed at the manifest would downgrade or see 11.5.1.0 disappear. |
| **C5** | fixed | `Controllers/JellyfinEnhancedController.cs:1765-1782` | `GetConfigHash()` hashes only ~40 of ~100+ fields returned by `GetPublicConfig`. Changes to omitted fields (`ArrTagsPrefix`, `DownloadsUseCustomTabs`, `CalendarUsePluginPages`, `JellyseerrShowIssueIndicator`, `DownloadsPollIntervalSeconds`, `BookmarksUsePluginPages`, `*UrlMappings`, icon styles, positions, etc.) leave the hash unchanged → other tabs/devices never poll `/public-config` → change silently lost. **Verified empirically** — curl and Playwright both confirmed hash stays identical after `ArrTagsPrefix` save. |

### HIGH — real runtime bugs worth same PR

| ID | Status | File:line | Summary |
|---|---|---|---|
| **H1** | fixed | `js/enhanced/config-store.js:227-233` | `lastHash = hash` advances BEFORE `fetchPublicConfig()` / `applyUpdate()` succeeds. Transient 5xx on `/public-config` means tab records the new hash anyway → every subsequent poll short-circuits as "no change" → config never applies until page reload or a different setting changes. |
| **H2** | fixed | `js/enhanced/config-store.js:212-220` | `reloadConfig` enforces 2s `minPollInterval` even for broadcast-triggered calls. Cross-tab save within 2s window → broadcast dropped → no retry → receiving tab stays stale until next nav. |
| **H3** | fixed | `js/enhanced/config-store.js:252-264` + `configPage.html` save handler | `broadcastChange()` does NOT self-trigger `reloadConfig()`. BroadcastChannel.postMessage doesn't fire on sender; `storage` events also don't fire on originator. Saving tab only picks up change on next navigation. Currently masked by `configPage.html` calling `window.location.reload()` — but only if `autoReloadOnSave` is on. |
| **H4** | fixed | `js/enhanced/config-store.js:97-100` | `applyUpdate()` assigns `JE.pluginConfig = freshPublicConfig` (public only) BEFORE awaiting `loadPrivateConfig()`. Across the network gap, any synchronous consumer sees new public fields paired with `SonarrUrl`/`RadarrUrl`/`BazarrUrl`/`*UrlMappings` undefined. Arr Links can silently generate linkless DOM during that window. |
| **H5** | fixed | `js/arr/calendar-page.js` `configKeys: ['CalendarPageEnabled']`, `js/arr/requests-page.js` `configKeys: ['DownloadsPageEnabled']`, `js/enhanced/hidden-content-page.js` `configKeys: ['HiddenContentEnabled']` | Each module branches on `*UseCustomTabs`/`*UsePluginPages` to decide delivery mode, but those keys are not in `configKeys` → toggling them at runtime never triggers init/teardown. Compounds with C5 (those keys also aren't in the config hash). |
| **H6** | fixed | `js/enhanced/module-registry.js:88-91` | Reentrancy guard drops the second `handleConfigChange` event permanently. No retry queue. Caller sees empty `needsRefresh`, shows no toast. Reachable when a subscriber triggers a second reactive reload (e.g. by calling `broadcastChange`). |
| **H7** | fixed | `js/jellyseerr/item-details.js:447, 456` | `initialize()` attaches anonymous `window.addEventListener('hashchange', …)` and `document.addEventListener('viewshow', …)` on every call. Neither tracked by `ctx`, neither removed in teardown at line 463-468. Leaks per toggle cycle. |
| **H8** | fixed | `js/extras/plugin-icons.js:311` | `setupHashChangeListener()` attaches anonymous `window.addEventListener('hashchange', …)` on every `initialize()` call. Not tracked, not removed on teardown. Leaks per toggle. |
| **H9** | fixed | `js/extras/colored-ratings.js:18, 262, 286` | `urlObserverHandle` set up at IIFE scope (line 262). `cleanup()` unsubs + nulls it on teardown, but the IIFE-scope line never re-runs → after first teardown+init cycle the SPA URL-change watcher is gone. Also: unconditional `visibilitychange` listener at line 251 not tracked by ctx (minor — it no-ops via `isFeatureEnabled()` check but still bad form). |
| **H10** | fixed | `js/extras/theme-selector.js:450` | Teardown callback references `JE` at IIFE scope where it's undeclared. Same ReferenceError as C1 — if C1 were fixed and teardown were invoked, this throws too. Same fix (move `const JE = window.JellyfinEnhanced;` to IIFE scope) resolves both. |

### MEDIUM

| ID | Status | File:line | Summary |
|---|---|---|---|
| **M1** | fixed | `js/enhanced/config-store.js:235-237` | `catch (e) { /* Silently ignore */ }` — reactive failures (subscriber throws, applyUpdate errors, loadSettings exceptions) go to /dev/null. Combined with C5 + H1, debugging is impossible. |
| **M2** | fixed | `Controllers/JellyfinEnhancedController.cs:1784-1787` | `GetConfigHash` has no try/catch around `JsonSerializer.Serialize`. If any field throws, action returns 500; `_cachedConfigHash` stays null; every subsequent poll re-throws; client's `fetchHash` catches and returns null → treated as "no change" → reactive system permanently wedged. |
| **M3** | fixed | `js/enhanced/config-store.js:162-166` | `loadPrivateConfig` treats non-401/403 errors as `console.warn` and proceeds. `applyUpdate` fires subscribers with stale/missing private config. Admin changes `SonarrUrl`, Arr Links silently keeps old URL. |
| **M4** | fixed | `Controllers/JellyfinEnhancedController.cs:1754` | `static string? _cachedConfigHash` without locking or `volatile`. Benign race — correctness preserved, only concern is memory ordering. Worth a 1-line fix. |
| **M5** | fixed | `NoCacheConfigFilter.cs:20` | `_logger` field declared but never used. Will trip CodeQL / warnaserror CI. If the filter ever throws, no log. |
| **M6** | fixed | `js/enhanced/helpers.js:802-813` | `ctx.state()` resets state on teardown but never clears `stateDefaults`/`stateRef` references. If the module recreates the state object on re-init, the old reference is retained. |
| **M7** | verified-clean | reviews.js deletion sweep | `grep` for `je-user-review`, `createUserReviewElement`, `ShowUserReviews`, `UserReview`, `reviews_add` — no dangling refs. Still worth one final check before merge. |
| **M8** | fixed | `js/enhanced/bookmarks-library.js:1249` | `sectionObserver = new MutationObserver(...)` marked `/* persistent -- do not disconnect */`. In addition to C3 (wrong target), this observer is never cleaned up. Latent leak if bookmarks ever registers with the module registry. |

### LOW / informational

| ID | Status | File:line | Summary |
|---|---|---|---|
| L1 | open | `js/enhanced/config-store.js:32-34, 256-263` | Triple silent catch on BroadcastChannel + localStorage fallbacks — no log, no user-visible indication cross-tab sync is degraded. |
| L2 | open | `js/enhanced/helpers.js:469` | `waitForElement` timeout resolves `null` — callers can't distinguish "not found" from "timed out". |
| L3 | verified-ok | `JellyfinEnhanced.cs:37` | `ConfigurationChanged += …` in constructor — event owned by plugin instance, delegate dies with instance. Not a leak. |
| L4 | verified-ok | `NoCacheConfigFilter` scope | Header-setting overhead is a HashSet lookup per MVC action. Verified via curl that non-target endpoints don't receive cache headers. |
| L5 | verified-ok | `System.Text.Json` anonymous-type ordering | Stable across .NET runtime versions — anonymous type property order follows declaration order. |

### Positive findings (what works as advertised)

- `dotnet build` clean (0W/0E).
- Plugin loads on jellyfin-dev as v11.5.0.0 with no startup errors.
- `NoCacheConfigFilter` correctly applies `Cache-Control: no-store, no-cache, max-age=0, must-revalidate` + `Pragma: no-cache` + `Expires: 0` to all five targeted endpoints. Verified via curl with auth token.
- Non-target endpoints (`/System/Info`, `/Users`, `/JellyfinEnhanced/version`) DO NOT receive the cache headers.
- `ConfigurationChanged` event correctly invalidates `_cachedConfigHash` — verified by toggling `ToastDuration` and observing hash change.
- End-to-end reactive flow works for hashed fields: saving `ToastDuration` → `broadcastChange()` → `reloadConfig()` → subscriber receives event with `changedKeys: ["ToastDuration", ...]` → `JE.pluginConfig.ToastDuration` updated synchronously.
- All 16 modules are present in `moduleRegistry.getModule()` on a successful load (excluding C1/C2 race cases).
- `translations.js buildLanguageChain()` correctly replaces the server-side `de-DE → de` fallback that was removed from `GetLocale` — this is a clean refactor, not a regression.
- Reviews feature removal is clean in JS.

## E2E test reference

### `/tmp/je-e2e-test/test-cache-fix-v2.js`
Smoke test exercising the full reactive pipeline: login, wait for plugin, check module registration, dashboard roundtrip (issue #536 regression guard), non-hashed vs hashed field change detection, reactive flow with subscriber notification. Run: `cd /tmp/je-e2e-test && node test-cache-fix-v2.js`

### `/tmp/je-e2e-test/test-theme-selector-referror.js`
Isolated test that captures the `theme-selector.js` ReferenceError via Playwright's `pageerror` event. Proves C1 is real.

### `/tmp/je-e2e-test/test-teardown-scope.js`
Triggers the reactive teardown path on `arr-links` by flipping `ArrLinksEnabled` off, captures the `debounceTimer is not defined` error from the deployed plugin. Proves C2 is real.

## Fix sequence plan (current pass)

1. ✍️ Create this file (done)
2. C4 (manifest restore) — trivial mechanical fix
3. C1 + H10 (theme-selector — single fix covers both)
4. C2 (5 modules — same pattern each time)
5. C3 (4 custom-tab modules — revert to document.body)
6. C5 (hash full public config)
7. H1 (advance lastHash after applyUpdate succeeds)
8. H2 + H3 (broadcast bypass + self-reload)
9. H4 (atomic private/public merge)
10. H5 (expand page-module configKeys)
11. H6 (reentrancy queue)
12. H7 / H8 / H9 (untracked listeners/observers)
13. M-tier cleanup (M1, M2, M3, M4, M5, M6, M8)
14. Build + deploy + re-run E2E suite to confirm every previously-failing case passes

## Fix log (2026-04-08)

All CRITICAL and HIGH findings fixed in one pass, plus all MEDIUM-tier
observability/robustness items and 4 follow-up findings Codex caught after
reviewing the fixes.

### First fix pass (C1-C5, H1-H10, M1-M6, M8)

- **C1 + H10** — `js/extras/theme-selector.js`: hoisted `const JE = window.JellyfinEnhanced;` to IIFE scope. Removed shadowing inner declaration. Verified with Playwright: `initializeThemeSelector` exports, `moduleRegistry.getModule('theme-selector')` returns the descriptor, 0 page errors.
- **C2** — lifted state variables to IIFE scope in `arr-links.js`, `arr-tag-links.js`, `letterboxd-links.js`, `elsewhere.js`, `jellyseerr.js`. Each init() now resets state at the top of the function so re-init after teardown starts clean. Verified with Playwright teardown-trigger test: 0 ReferenceErrors.
- **C3** — reverted all 4 custom-tab observer targets to `document.body` and routed through `JE.helpers.createObserver` (was raw `new MutationObserver` in 2 of them). Files: `calendar-custom-tab.js`, `requests-custom-tab.js`, `hidden-content-custom-tab.js`, `bookmarks-library.js`. Re-applies the PR #540 fix for issue #536.
- **C4** — restored the 11.5.1.0 version block in `manifest.json`.
- **C5 + M2 + M4** — extracted the `GetPublicConfig` anonymous object into a shared `private static object BuildPublicConfigPayload(PluginConfiguration)` helper in `Controllers/JellyfinEnhancedController.cs`. `GetConfigHash` now serializes the same payload, wrapped in try/catch that logs and returns 500 on serialization failure. `_cachedConfigHash` is now `volatile`. Verified with Playwright: saving `ArrTagsPrefix` now changes the hash (previously it didn't).
- **H1 + M1** — `js/enhanced/config-store.js reloadConfig()`: advance `lastHash = hash` only after `applyUpdate()` succeeds. Log errors via `console.error` instead of silent catch.
- **H2 + H3** — `broadcastChange()` self-triggers `reloadConfig({ bypassThrottle: true })` via microtask, and `onChannelMessage`/`onStorageEvent` pass `{ bypassThrottle: true }` so cross-tab broadcasts are never dropped by the 2s poll gate.
- **H4 + M3** — `applyUpdate()` now fetches private config FIRST, then atomically builds `merged = { ...freshPublic, ...private }` and assigns `JE.pluginConfig = merged` in one synchronous step. No half-merged window. Renamed `loadPrivateConfig` → `fetchPrivateConfig` to reflect that it no longer mutates state. Errors logged via `console.error`.
- **H5** — page-module `configKeys` expanded to include `*UseCustomTabs` / `*UsePluginPages` (plus polling keys for requests-page). Added explicit `enableKey` so the enable/disable transitions are unambiguous.
- **H6** — `module-registry.js handleConfigChange()` now queues reentrant events in `pendingEvents[]` and drains them via a microtask after the current dispatch finishes. Previously the second event was dropped on the floor.
- **H7** — `jellyseerr/item-details.js initialize()` now uses `ctx.listen()` for hashchange + viewshow so they're auto-removed on teardown. `ctx` hoisted to IIFE scope.
- **H8** — `extras/plugin-icons.js setupHashChangeListener()` now tracks its listener via `_ctx.listen()`. `_ctx` hoisted to IIFE top.
- **H9** — `extras/colored-ratings.js`: `_ctx` hoisted, URL watcher moved inside `initialize()` so re-init re-subscribes (dedup-safe via helpers.js Map-keyed subscribers).
- **M5** — `NoCacheConfigFilter.OnActionExecuting` wrapped in try/catch that logs via the previously-unused `_logger` field. Also added a null guard on `RouteValues`.
- **M6** — `helpers.js createModuleContext.teardown()` — documented that `stateDefaults` / `stateRef` refs persist intentionally across teardown+re-init cycles (matches the `customCleanups` convention).
- **M8** — `bookmarks-library.js` custom-tab observer now routed through `JE.helpers.createObserver('bookmarks-library-custom-tab', ...)` on `document.body`, which is auto-cleaned by the shared body observer.

### Second fix pass — Codex follow-up findings (CF1-CF4)

After applying the first pass, ran `codex exec` for an independent review and fixed its 4 follow-ups:

- **CF1** (codex, High) — `reloadConfig()` still hard-returned when another reload was in flight, so a broadcast that landed mid-reload was dropped. Added `reloadPending` flag: bypass-throttle calls set it while locked, and the current reload's `finally{}` drains it via a microtask.
- **CF2** (codex, Medium) — `fetchPrivateConfig()` returned `{}` on 5xx/network errors, and `applyUpdate()` then atomically swapped `JE.pluginConfig` to a public-only merged object, dropping previously-loaded private fields (SonarrUrl, RadarrUrl, etc.). Now returns `null` on unexpected failures; `applyUpdate` detects `null` and preserves the private fields from `oldConfig` in the new merged object. Public fields still get overwritten (they're authoritative).
- **CF3** (codex, Medium) — `elsewhere.js` teardown called `disconnectObserver('elsewhere-details')` but the active observer was registered as `'elsewhere'`. Fixed the id mismatch. Pre-existing stale-id bug my state-lifting fix didn't touch — codex rightly flagged it as part of making the lifecycle fix complete.
- **CF4** (codex, Medium) — `colored-ratings.js` re-init leaked one `visibilitychange` listener per cycle because I moved it inside `initialize()`. Moved it back out: registered once at module-load via `_ctx.listen()`, and the handler still gates on `isFeatureEnabled()` so it's inert when the module is disabled.

### Verification results

- `dotnet build` — 0 warnings, 0 errors (final state).
- Deployed DLL to jellyfin-dev, container restart clean. Plugin loads as v11.5.0.0.
- `/tmp/je-e2e-test/test-cache-fix-v2.js` (full E2E suite): **8/8 passed** after all fixes (previously 7/8 pre-fix — the non-hashed-field regression was the 1 failing case).
- `/tmp/je-e2e-test/test-theme-selector-referror.js`: 0 pageerror events captured, `initializeThemeSelector: function`, `moduleRegistry.getModule('theme-selector').initialized: true`.
- `/tmp/je-e2e-test/test-teardown-scope.js`: 0 teardown errors captured (previously: `ReferenceError: debounceTimer is not defined` from deployed arr-links.js).
- Cache-header verification (from first review pass) still holds: `/config-hash`, `/public-config`, `/private-config`, `/web/ConfigurationPages`, `/Plugins/{id}/Configuration` all return `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`; unrelated endpoints (`/System/Info`, `/Users`, `/JellyfinEnhanced/version`) do NOT get the headers.

### Files modified in this fix pass

```
Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs
Jellyfin.Plugin.JellyfinEnhanced/NoCacheConfigFilter.cs
Jellyfin.Plugin.JellyfinEnhanced/js/arr/arr-links.js
Jellyfin.Plugin.JellyfinEnhanced/js/arr/arr-tag-links.js
Jellyfin.Plugin.JellyfinEnhanced/js/arr/calendar-custom-tab.js
Jellyfin.Plugin.JellyfinEnhanced/js/arr/calendar-page.js
Jellyfin.Plugin.JellyfinEnhanced/js/arr/requests-custom-tab.js
Jellyfin.Plugin.JellyfinEnhanced/js/arr/requests-page.js
Jellyfin.Plugin.JellyfinEnhanced/js/elsewhere/elsewhere.js
Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/bookmarks-library.js
Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/config-store.js
Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/helpers.js
Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/hidden-content-custom-tab.js
Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/hidden-content-page.js
Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/module-registry.js
Jellyfin.Plugin.JellyfinEnhanced/js/extras/colored-ratings.js
Jellyfin.Plugin.JellyfinEnhanced/js/extras/plugin-icons.js
Jellyfin.Plugin.JellyfinEnhanced/js/extras/theme-selector.js
Jellyfin.Plugin.JellyfinEnhanced/js/jellyseerr/item-details.js
Jellyfin.Plugin.JellyfinEnhanced/js/jellyseerr/jellyseerr.js
Jellyfin.Plugin.JellyfinEnhanced/js/others/letterboxd-links.js
manifest.json
```

### Third fix pass — user-reported live sidebar regressions (U1-U2)

After deploying the CF-pass fixes the user reported: "disable bookmarks, the sidebar item stays until a refresh." Root-causing found a second hidden-content re-enable bug in the process.

- **U1** — `js/enhanced/bookmarks-library.js` was never registered with `moduleRegistry`. IIFE had an early `return` when `BookmarksEnabled=false`, the sidebar nav watcher was a local `const` `MutationObserver` that survived any teardown attempt, and there was no teardown function at all. Toggling `BookmarksEnabled` off had zero effect on the running page.
  - Removed the IIFE-top early return; moved the enable check inside `init()` so the module can register with the lifecycle system and init-after-enable works.
  - Lifted `navWatcherObserver` to module scope so teardown can disconnect it; added a safety disconnect+reset at the start of `setupNavigationWatcher()`.
  - Added id `je-bookmarks-library-styles` to the injected `<style>` element so teardown can remove it; guarded re-injection as idempotent.
  - Added a `createModuleContext('bookmarks-library')` ctx at IIFE scope with `_ctx.dom('.je-nav-bookmarks-item')` + `_ctx.dom('#je-bookmarks-library-styles')` and an `onTeardown` that hides the page if visible, removes `.je-bookmarks-page` DOM, disconnects `navWatcherObserver`, and disconnects the shared body subscriber `'bookmarks-library-custom-tab'`.
  - Moved all of init's window/document listeners to `_ctx.listen(...)` so they're auto-removed on teardown.
  - Registered with `moduleRegistry.register('bookmarks-library', {configKeys: ['BookmarksEnabled', 'BookmarksUseCustomTabs', 'BookmarksUsePluginPages'], enableKey: 'BookmarksEnabled', init, teardown: _ctx.teardown})`.
  - Verified empirically: disabling `BookmarksEnabled` removes the sidebar nav item immediately; re-enabling re-injects it.

- **U2** — `js/enhanced/hidden-content-page.js initialize()` had a hard `if (!JE.hiddenContent) return;` guard that bailed when the sibling `hidden-content` module hadn't finished re-initializing yet. Because module-registry iterates modules in Map insertion order (load-order-dependent), re-enabling `HiddenContentEnabled` could leave the page module wedged permanently with no sidebar nav — matching one of the `test-sidebar-teardown.js` failure cases. Replaced the bail with a 50 ms-interval poll that retries up to 3 s waiting for `JE.hiddenContent` to appear, then re-invokes `initialize()`. Same "cross-module load order" hazard pattern we've documented for dynamic script loading.

### Verification results (third pass)

Full 5-test sweep, run sequentially with pauses to avoid OOM'ing jellyfin-dev:
- `test-cache-fix-v2.js`: **8/8 passed**
- `test-theme-selector-referror.js`: 0 ReferenceErrors
- `test-teardown-scope.js`: 0 teardown errors
- `test-elsewhere-toggle.js`: **6/6 passed** (enable → inject, disable → remove, full reload respects disabled, re-enable works)
- `test-sidebar-teardown.js`: **all 4 features pass both directions** (bookmarks, calendar, downloads, hiddencontent — disable removes, re-enable re-injects, 0 JS errors)

Sidebar-nav live-toggle behavior now matches user expectation across all 4 features.

### Fourth fix pass — post-review findings (R1-R8)

Ran another full review round after the third fix pass: Claude `pr-review-toolkit:code-reviewer` and `codex exec review` independently reviewed the working tree, with `REVIEW_FINDINGS.md` passed as context so neither re-reported already-fixed items. Both reviewers converged strongly on 6 real bugs (4 with 100% overlap); Claude found 2 additional medium issues.

- **R1** (CRITICAL — CF4 regression) — `js/extras/colored-ratings.js`: CF4 moved the `visibilitychange` listener out of `initialize()` to avoid URL-nav re-init stacking, but registered it via `_ctx.listen()` at IIFE scope. `ctx.teardown()` clears the listeners array on first disable, and the IIFE doesn't re-run, so re-enable never re-adds the listener. Fix: use raw `document.addEventListener(...)` at IIFE scope — the handler gates on `isFeatureEnabled()` so it's inert when disabled; no tracking needed.

- **R2** (HIGH, Codex only) — `js/enhanced/bookmarks-library.js`: the `#je-bookmarks-library-styles` `<style>` element was created once at IIFE load and registered via `_ctx.dom(...)` for cleanup, but never re-injected in `init()`. First disable→re-enable left the nav + page without CSS. Fix: extracted CSS into `STYLE_CSS` module constant + `injectBookmarksStyles()` helper (idempotent by id); `init()` calls it at the top.

- **R3** (HIGH, both reviewers) — `js/enhanced/bookmarks-library.js init()` `checkReady` was a local `const setInterval(...)` never tracked by `_ctx`. Rapid off→on→off→on or disable-before-ready left orphaned intervals polling forever. Fix: lifted to module-scope `checkReadyTimer`, teardown clears it, init() kills any in-flight poll before starting a new one, added a 200-attempt (20 s) max bound.

- **R4** (HIGH, Codex only) — `js/enhanced/bookmarks-library.js hookViewEvents()` added an untracked `document.addEventListener('viewshow', ...)` that stacked one additional listener per re-init cycle. Fix: converted to `_ctx.listen(document, 'viewshow', handler)` so teardown removes it.

- **R5** (HIGH, both reviewers) — `js/enhanced/hidden-content-page.js` U2 retry loop used a local `var waitTimer = setInterval(...)` not tracked by teardown and with no concurrent-poll guard. Rapid toggle or re-init-over-in-flight-poll could spawn multiple concurrent polls that each called `initialize()` when `JE.hiddenContent` eventually appeared, causing duplicate nav items and listeners. Fix: lifted to module-scope `hiddenContentWaitTimer`, re-init cancels any in-flight poll first, teardown clears it, the poll body also checks `HiddenContentEnabled` each tick so it aborts if the feature is disabled mid-wait.

- **R6** (HIGH, both reviewers — single highest-leverage fix) — `js/plugin.js loadScripts()` created `<script>` elements via `document.createElement('script')` without setting `async = false`. Dynamically-inserted scripts default to `async = true`, which means they execute in network-completion order rather than insertion order. This was the root cause of the C1 theme-selector race (I fixed C1 by moving `const JE` to IIFE top, but that was a workaround, not a fix) and a latent cause for 8 other modules that do `var _ctx = JE.helpers?.createModuleContext(...)` at IIFE top — if helpers.js lost the network race, those modules would have `_ctx = null` forever, silently breaking their teardowns. Fix: added `script.async = false;` to `loadScripts()` (one line). Scripts now execute deterministically in insertion order. See CLAUDE docs "Cross-module load order" — this eliminates the entire class of cold-load race bugs.

- **R7** (MEDIUM, Claude only) — `NoCacheConfigFilter.cs:67` the M5 try/catch wraps the header write but calls `_logger.LogWarning(ex, ...)` inside the catch, which could itself throw if the logger/DI container is being torn down during shutdown. Fix: wrapped the `LogWarning` call in a second try/catch that silently swallows — nothing safer can be done during a logger-disposal race, and the goal is "never let this filter crash the request pipeline."

- **R8** (MEDIUM, Claude only) — `js/jellyseerr/item-details.js:484` raw `document.addEventListener('DOMContentLoaded', initialize)` was not tracked in `ctx`. Low-impact because by the time plugin.js Stage 6 fires, DOMContentLoaded has almost always already fired — but the fallback path could leak on slow initial loads. Fix: use `ctx.listen()` when available, fall back to `{ once: true }` so the listener auto-removes after firing.

### Verification results (fourth pass)

Full 5-test sweep after R1-R8, sequential with pauses:
- `test-cache-fix-v2.js`: **8/8 passed**
- `test-theme-selector-referror.js`: 0 ReferenceErrors
- `test-teardown-scope.js`: 0 teardown errors
- `test-elsewhere-toggle.js`: **6/6 passed**
- `test-sidebar-teardown.js`: **all 4 features pass both directions** (bookmarks, calendar, downloads, hiddencontent)

Build: 0 warnings, 0 errors. DLL live on jellyfin-dev.

### Remaining open items (LOW tier, not in this pass)

- **L1** — `config-store.js` triple silent catches on BroadcastChannel + localStorage fallbacks. Could add a one-time `console.warn` on first catch so admins know cross-tab sync is degraded. Low priority — not a correctness bug.
- **L2** — `helpers.js waitForElement` timeout resolves `null` without distinguishing timeout from absence. Would need a breaking API change.

## Known project-specific gotchas (from the plugin's own memory / CLAUDE docs)

- Plugin is C# .NET 9.0, Jellyfin 10.11.x target. Build with `dotnet build`, deploy DLL to `jellyfin-dev`, restart container.
- Cross-module load order in `plugin.js loadScripts()` is NOT guaranteed — dynamically-inserted `<script>` tags execute in load-completion order, not insertion order. Any code that does a one-shot `typeof JE.foo?.bar !== 'function'` check can silently bail forever under unlucky timing. Use poll-until-available with abort signal.
- `onBodyMutation` shared observer has a fast-path that DROPS batches with no `addedNodes`/`removedNodes`. Waiters keyed on attribute or text changes must use `JE.helpers.createObserver` with `{attributes: true}` / `{characterData: true}` (which creates a dedicated observer bypassing the fast-path) or just poll.
- `.mainAnimatedPages` is NOT stable — Jellyfin replaces it when navigating to/from `#/dashboard`. Observers bound to it orphan on detached nodes. ALWAYS observe `document.body`.
- Use Seerr (not Jellyseerr) in new code comments / commit messages / PR bodies. Existing upstream variable names like `JellyseerrUrls` stay.
- Do NOT use `#N` in commit messages (spams upstream issues). Use plain `N` or "issue N". `Closes #N` goes only in the final PR body.
- PR body must include AI-assistance disclosure per CONTRIBUTING.md.
- NEVER recommend fixes against jellyfin core or other plugins — user is explicit: Jellyfin Enhanced only.
