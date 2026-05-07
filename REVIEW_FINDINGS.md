# features/no-hard-refresh — Review Findings

## Context / environment

- **Working dir:** `/home/jake/Documents/Jellyfin-Enhanced/features/no-hard-refresh`
- **Branch:** `features/no-hard-refresh` (against `origin/main`)
- **Deploy target:** `jellyfin-dev` (port 8097), test users `admin`/`4817`, `TestAdmin`, `Test`
- **Build:** `cd Jellyfin.Plugin.JellyfinEnhanced && dotnet build`
- **Smoke test:** `cd /tmp/je-e2e-test && node test-no-hard-refresh.js` (login, sidebar, route, tabs, no fatal errors)
- **Sub-path test:** `cd /tmp/je-e2e-test && node test-baseurl.js` (BaseUrl=/jelly toggle)

## Branch architecture summary

Replaces three external Jellyfin plugins (File Transformation, Plugin Pages,
Custom Tabs) with a self-contained subsystem inside JE. Goal: eliminate the
hard-refresh requirement after install / update / config change.

**Server side** — new `Jellyfin.Plugin.JellyfinEnhanced/Web/`:

- `JeStartupFilter` (IStartupFilter) installs three middleware at the front
  of Jellyfin's pipeline.
- `HtmlInjectionMiddleware` buffers `/web/index.html` (and sub-path variants
  like `/jelly/web/index.html`) and injects a relative `<script>` tag
  pointing at `/JellyfinEnhanced/web/bootstrap.js?v=<configHash>`. Uses
  `StreamResponseBodyFeature` so static-file middleware's sendfile path
  routes through our buffer. Bails out cleanly when the upstream response
  is already gzip/brotli-encoded (reverse-proxy compression).
- `BrandingAssetMiddleware` serves admin-uploaded branding overrides with
  async I/O, in-memory mtime cache, and strong ETags (304 fast-path).
- `NoCacheHeaderMiddleware` forces revalidation on the index.html and the
  JE web endpoints so the bootstrap is always fresh.
- `ConfigVersion` produces a 12-char SHA-256-based hash of plugin version +
  the subset of config that affects sidebar/tabs.
- `WebController` exposes
  `GET /JellyfinEnhanced/web/{bootstrap.js, version, sidebar, tabs}`.

**Client side** — `Jellyfin.Plugin.JellyfinEnhanced/js/web/`:

- `bootstrap.js` (served via the controller) — tiny loader that pulls
  `/JellyfinEnhanced/script?v=<version>` and stashes the version in
  `window.__JE_CONFIG_VERSION__`.
- `page-host.js` — `JE.WebHost.{register, has, render, ids}` registry.
- `hot-reload.js` — polls `/JellyfinEnhanced/web/version` every 4s (active)
  / 30s (background tab) and emits topic events on hash changes. Uses
  `ApiClient.getUrl` when the client is loaded.
- `sidebar-manager.js` — paints JE entries into the existing
  `.jellyfinEnhancedSection`, scoped MutationObserver on the drawer host,
  hot-reload subscriber on the `sidebar` topic.
- `route-hijacker.js` — listens for navigation to `#/JellyfinEnhanced/<id>`,
  hides unrelated children of `#indexPage`, mounts the registered renderer.
- `tabs-manager.js` — adds JE tab buttons + panes to the home tab strip,
  scoped MutationObserver on `.mainAnimatedPages`, hot-reload subscriber.
- `web-kickoff.js` — registers each renderer with `WebHost` and starts the
  four subsystems. Called from `plugin.js` after every feature module
  registers `renderForCustomTab` on the JE namespace.

**Removals:**

- `Helpers/TransformationPatches.cs` deleted; logic absorbed into
  `BrandingAssetMiddleware` + `HtmlInjectionMiddleware`.
- `JellyfinEnhanced.cs`: `UpdateIndexHtml`, `CleanupOldScript`,
  `CheckPluginPages`, `IHasWebPages.GetViews()` removed. One-time
  housekeeping methods kept: `CleanupLegacyOnDiskScript` (uninstall path),
  `CleanupLegacyPluginPagesConfig` (constructor).
- `Services/StartupService.cs`: `RegisterFileTransformation` and
  `RegisterAssetTransformations` removed.
- `PluginPages/*.html` deleted.
- Three CT bridge JS files (`calendar-custom-tab.js`,
  `requests-custom-tab.js`, `hidden-content-custom-tab.js`) deleted.
- Per-feature `showPage / hidePage / injectNavigation /
  setupNavigationWatcher / handleNavigation / interceptNavigation /
  handleViewShow / handleNavClick / startLocationWatcher /
  stopLocationWatcher / createPageContainer` deleted from
  `calendar-page.js`, `requests-page.js`, `hidden-content-page.js`,
  `bookmarks-library.js` — all navigation now goes through the web
  subsystem. The four feature pages export only their renderForCustomTab
  on the JE namespace.
- `configPage.html`: `fileTransformationWarning` banner, "Install Plugin
  Pages plugin" / "Install Custom Tabs plugin" hints, four
  `*AutoCreateCustomTab` checkboxes, "Embed in Custom Tabs" how-to blocks,
  `INDIVIDUAL_DEPS` PP/CT entries, the `OPTIONAL_PLUGINS` PP/CT/FT entries,
  `CUSTOM_TAB_MANAGED_ENTRIES`, `isCustomTabsConfigShapeOk`,
  `checkCustomTabsConfigCompat`, and `syncAllManagedCustomTabs` either
  removed or stubbed to no-ops.

**Verified working:**

- Smoke test (`test-no-hard-refresh.js`) — 7/7 pass: bootstrap injection,
  WebHost/SidebarManager/RouteHijacker/TabsManager loaded, all 4 renderers
  registered, sidebar shows 4 JE entries, calendar route mounts, home page
  shows 4 JE tabs, no fatal pageerrors (only 401/404 noise from Jellyfin's
  own login transitions, filtered).
- Sub-path test (`test-baseurl.js`) — 6/7 pass: bootstrap, WebHost, all 4
  renderers, version endpoint, sidebar, calendar route. Only failure is
  pre-existing TMDB 404s unrelated to this branch.
- Build green, 0 warnings, 0 errors.

## Findings table

### CRITICAL — merge blockers

(none — first parallel review pass returned 0)

### HIGH (resolved in fix batch 2)

| ID | Status | File:line | Summary |
|---|---|---|---|
| H1 | fixed | `js/arr/requests-page.js:renderForCustomTab + startPolling` | `_customTabMode` was set true and never reset → polling continued forever. Replaced with mount-element-still-in-DOM check; polling stops when route-hijacker / tabs-manager unmounts our DOM. |
| H2 | fixed | `js/arr/calendar-page.js:fetchUserRequests finally` | `if (state.pageVisible) renderPage()` was dead because `pageVisible` is never written on this branch — render() now runs unconditionally. |
| H3 | fixed | `js/web/route-hijacker.js` | Three issues in one rewrite: JE→JE transitions didn't unmount the prior route's DOM; `unmount()` didn't restore stragglers when the host element vanished; sibling-hide loop didn't preserve nodes Jellyfin had already hidden. New version skips already-hidden nodes, walks the whole document for stragglers, evicts disabled-active routes via the `sidebar`/`tabs` hot-reload topics. |
| H4 | fixed | `js/enhanced/ui.js:1878` | "Manage Hidden Content" button called the deleted `JE.hiddenContentPage.showPage()`. Now navigates via the web subsystem URL. |
| H5 | fixed | `js/web/{sidebar,tabs}-manager.js` `fetchEntries` | Catch was wiping `entries=[]` on transient 5xx/auth blips. Now preserves last-good entries and logs the failure. |
| H6 | fixed | `js/web/hot-reload.js` `poll` | Persistent failures swallowed silently. Now logs once after 3 consecutive failures so admins debugging "JE didn't pick up the toggle" find the failure mode. |
| H7 | fixed | `Web/BrandingAssetMiddleware.cs` `GetAssetAsync` | Caught everything at LogDebug, default Jellyfin log level hides it. Now narrows to `IOException` / `UnauthorizedAccessException`, logs at Warning with the file path. |

### MEDIUM (resolved in fix batch 2)

| ID | Status | File:line | Summary |
|---|---|---|---|
| M1 | fixed | `Web/WebController.cs` Sidebar/Tabs | Returned `{entries:[]}` when `Configuration` was null, indistinguishable from "admin disabled all". Now returns 503 so the client retries. |
| M2 | fixed | `Web/ConfigVersion.cs` | `/version` is AllowAnonymous and the hashes are unsalted — anonymous attacker could precompute the 16x16 toggle table and read back the admin's feature flags. Now salted with a per-process random GUID. |
| M3 | fixed | `JellyfinEnhanced.cs` `CleanupLegacyPluginPagesConfig` | Wrote PP config via `File.WriteAllText` directly — torn write under crash mid-write. Now writes to `.je-tmp` and uses `File.Replace` with `.je-bak` backup. |
| M4 | fixed | `js/web/sidebar-manager.js`, `tabs-manager.js` | Bootstrap polls gave up after 30s — late-mounted drawer wouldn't get attached. Now backs off to 5s indefinitely. |
| M5 | fixed | `js/web/sidebar-manager.js` | Defensive: server-supplied `item.url` only allowed if it starts with `#/`. Defeats potential `javascript:` URL injection if config is ever tampered. |
| M6 | fixed | `js/web/tabs-manager.js` `injectButtonsAndPanes` | If the active tab was the one being removed (admin disabled it), user saw a blank area until manually clicking another tab. Now calls `unhideNative()` before tearing down. |

### LOW (resolved in fix batch 2)

| ID | Status | File:line | Summary |
|---|---|---|---|
| L1 | fixed | `Web/NoCacheHeaderMiddleware.cs` | Used `Contains` on the path which would match `/foo/JellyfinEnhanced/web/version/extra`. Tightened to `EndsWith` to match the rest of the file. |
| L2 | fixed | `js/arr/calendar-page.js`, `requests-page.js`, `enhanced/hidden-content-page.js` | Orphaned state fields (`pageVisible`, `previousPage`, `locationSignature`, `locationUnsubscribe`, `locationTimer`, `_customTabMode`) declared but never written. Removed. |

### Iteration 4 — convergence pass

| ID | Status | File:line | Summary |
|---|---|---|---|
| L4 | fixed | `js/arr/requests-page.js renderPage` | Same dead-code pattern L3 cleaned out of calendar-page and hidden-content-page was still present here — `getElementById('je-downloads-container')` fallback (orphan ID with no writer left in the codebase) plus a stale `userpluginsettings` URL probe from the deleted Plugin Pages route. Replaced the fallback branch with a clean early-return; updated `renderForCustomTab` and `startPolling` to no longer reference the orphan ID. |

**Convergence reached.** Iteration 4 silent-failure-hunter pass returned "CONVERGED — no new findings". Iteration 4 code-reviewer pass returned only one MEDIUM (L4 above), now fixed. No new CRITICAL / HIGH / P1 / P2 findings — terminating the review loop per /JE Step 10's convergence rule.

### Iteration 3 — fixes from third parallel review pass

| ID | Status | File:line | Summary |
|---|---|---|---|
| H12 | fixed | `js/web/route-hijacker.js refreshAllowedFromServer` | Cold-cache partial-failure edge: one endpoint succeeded with empty entries, the other failed before a baseline existed → `allowedIds = []` falsely evicted legitimate routes. New per-source `everSucceeded` flags require BOTH endpoints to have produced ≥1 successful response before any concrete `allowedIds` list is computed. |
| H13 | fixed | `js/web/route-hijacker.js refreshAllowedFromServer` | Regression from iter-2: every `sidebar`/`tabs` topic event force-rendered the active route, clobbering scroll/form state on every admin config change. Now only re-evaluates when the active route was just evicted. |
| H14 | fixed | `js/web/route-hijacker.js refreshAllowedFromServer` | Persistent silent failures (both endpoints failing forever) had no admin-visible signal. Re-warns at 3 / 30 / 300 consecutive failures with the failure count. |
| H15 | fixed | `js/web/tabs-manager.js activate` | Used `WebHost.has(id)` to decide whether to mute native panes — but a registered renderer that throws still passes `has()`. Now uses `WebHost.render()` return value: on render failure we leave the native pane visible, log a warning, and don't add the `.is-active` class. |
| H16 | fixed | `js/web/route-hijacker.js unmount`, `js/web/tabs-manager.js` | When a user had a JE custom tab active on home then navigated to a JE route whose render failed, the `.je-muted` class on native panes persisted across the rollback — user saw a blank home page. `unmount()` now calls `JE.TabsManager.unhideNative()` (newly exported). |
| L3 | fixed | `js/arr/calendar-page.js renderPage`, `js/enhanced/hidden-content-page.js renderPage` | Both files still called the deleted `createPageContainer()` from a fallback branch — a dead booby trap that would `ReferenceError` if the cached container was ever detached. Replaced with a clean early-return; the web subsystem rebinds the container on the next render. Also dropped `createPageContainer` from calendar-page (orphaned function). |

### Iteration 2 — fixes from second parallel review pass

| ID | Status | File:line | Summary |
|---|---|---|---|
| H8 | fixed | `js/web/route-hijacker.js refreshAllowedFromServer` | Both fetch failures used to assign `allowedIds = []`, which fail-CLOSED would evict the user from a working JE route on every transient network blip. Now caches sidebar/tabs entry sets independently and only assigns `allowedIds` when at least one source succeeded; otherwise leaves it null (fail-OPEN, falls back to WebHost.has). |
| H9 | fixed | `js/web/tabs-manager.js injectStyles` | The `.je-muted` class used to hide native tab content was set on `.tabContent` panes but had NO CSS rule defined — Jellyfin's inline `display:block` won, native panes bled through under custom JE tab content. Added `#indexPage .tabContent.je-muted { display: none !important; }`. |
| H10 | fixed | `js/web/hot-reload.js poll` | Single warn at exactly 3 consecutive failures — admin who opened DevTools after that point saw nothing. Now re-warns at 3, 30, 300, 3000 failures so any debug session during an outage immediately sees the failure mode. |
| H11 | fixed | `js/web/route-hijacker.js mount` | If `JE.WebHost.render()` failed, mount left the host's siblings hidden but never set `lastRouteId`, so the next navigation skipped `unmount()` and the user saw a blank home page. Now sets `lastRouteId` BEFORE rendering and rolls back via `unmount()` on failure. |
| M7 | fixed | `js/arr/requests-page.js startPolling` | Silent early-return when no live mount element existed — diagnostic pothole if `renderForCustomTab` ever stops setting `_pollMount`. Added a `console.debug` so the failure mode is visible. |

## Fix log

Pre-review fix batch (already applied before launching the 4-reviewer pass):

- HtmlInjectionMiddleware: install `StreamResponseBodyFeature` so
  static-file sendfile path routes through our buffer; bail out on
  non-identity Content-Encoding.
- BrandingAssetMiddleware: async I/O, in-memory mtime cache, strong ETag
  with If-None-Match short-circuit.
- Sidebar/Tabs MutationObservers narrowed to drawer / mainAnimatedPages
  hosts (not document.body), with mutation-add/remove pre-filter.
- Sidebar/Tabs/HotReload now use `ApiClient.ajax` so authenticated
  endpoints don't 401. (Caught by Playwright smoke test.)
- HtmlInjectionMiddleware uses a relative bootstrap URL
  (`../JellyfinEnhanced/web/bootstrap.js`) so sub-path mounts work without
  reading PathBase. (Caught by sub-path Playwright test.)
- IsIndexHtmlRequest / RequiresNoCache use suffix matching so sub-path
  mounts hit them.
- `web-kickoff.js` binds `JE.downloadsPage` (not the typo
  `JE.requestsPage`) for the `downloads` renderer.

## Verification results

- `dotnet build`: 0 warnings, 0 errors.
- `node --check js/**/*.js`: all clean.
- `node test-no-hard-refresh.js`: 🟢 ALL PASS (7/7).
- `node test-baseurl.js`: 🟢 6/7 (failure is pre-existing TMDB 404 noise,
  unrelated to this branch).
- All four `/JellyfinEnhanced/web/{bootstrap.js, version, sidebar, tabs}`
  endpoints respond correctly under both default and `BaseUrl=/jelly`.
- Bootstrap script tag verified in `/web/index.html` and `/jelly/web/index.html`.
- Legacy on-disk script cleanup runs on uninstall.
- Legacy Plugin Pages config entries removed on first plugin boot.
