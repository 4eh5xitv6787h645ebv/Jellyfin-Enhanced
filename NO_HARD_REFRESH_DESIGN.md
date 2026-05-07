# JE Self-Hosted Web Subsystem (No Hard Refresh)

> Status: design — implementation in progress
> Branch: `features/no-hard-refresh`
> Working dir: `/home/jake/Documents/Jellyfin-Enhanced/features/no-hard-refresh`

## Goal

Replace JE's three external dependencies — **File Transformation**, **Plugin Pages**, **Custom Tabs** — with a self-contained subsystem inside Jellyfin Enhanced that:

1. **Eliminates the need for hard refresh** under all known conditions:
   - JE plugin install / update / config change
   - Toggling JE features (calendar, downloads, bookmarks, hidden content)
   - Adding / removing JE pages and tabs
2. Removes the entire dependency chain (no more "install File Transformation, install Plugin Pages, install Custom Tabs, restart, hard refresh" support burden).
3. Keeps every existing JE user-facing feature 1:1: Calendar, Downloads (Requests), Bookmarks, Hidden Content — both as standalone pages **and** as home-page tabs.

No backwards compatibility. We rip out the integrations cleanly.

---

## Why hard refresh is needed today

| Trigger | Cause |
|---|---|
| Install / update plugin | `JellyfinEnhanced.UpdateIndexHtml()` writes `<script>` tag into `web/index.html` on disk. Browser/service worker serves the cached old `index.html` until full reload. |
| File Transformation registers patches | Patches are applied on the next request, but only if the browser actually requests `index.html` again — usually requires hard refresh. |
| Plugin Pages config changes | PP injects a sidebar block on initial DOM mutation only. Toggling pages requires re-running `init()`. |
| Custom Tabs added/removed | CT's `customTabs.js` polls every 8s, but reapplying after a deeplink doesn't always remount cleanly. |
| Translation cache update | Cached translation JSON is keyed by version — hard refresh is the supported remediation. |

The fix has two parts:

1. **Server side**: never modify any file on disk. Inject everything at request time via `IStartupFilter`. The browser cache stays valid because the file's content is dictated by the response, not the disk.
2. **Client side**: hot-reload all dynamic UI when config changes. Sidebar entries, tabs, routes, branding — all observe a config-version hash and reapply themselves.

---

## Architecture

### Server (C#)

```
Jellyfin.Plugin.JellyfinEnhanced/
└── Web/                            # NEW — self-contained subsystem
    ├── JeStartupFilter.cs          # IStartupFilter — registers middleware
    ├── HtmlInjectionMiddleware.cs  # injects <script> into /web/index.html
    ├── BrandingAssetMiddleware.cs  # serves custom branding images
    ├── NoCacheHeaderMiddleware.cs  # forces no-cache on /web/index.html
    └── ConfigVersion.cs            # hash of plugin+config for cache busting
```

Wire-up in `PluginServiceRegistrator.cs`:
- Register `JeStartupFilter` as `IStartupFilter`.
- All other middleware is constructed inside `JeStartupFilter.Configure()`.

#### `JeStartupFilter` (replaces FT entirely)

Implements `IStartupFilter`. Inserts our middleware at the **front** of the pipeline so we run before Jellyfin's static file middleware.

```csharp
public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
{
    return app =>
    {
        app.UseMiddleware<NoCacheHeaderMiddleware>();
        app.UseMiddleware<HtmlInjectionMiddleware>();
        app.UseMiddleware<BrandingAssetMiddleware>();
        next(app);
    };
}
```

Why `IStartupFilter` over `IHostedService`/manual hooks: `IStartupFilter` is a public ASP.NET Core extension point that runs during host build; Jellyfin itself uses it for several services. Plugins don't need to touch any Jellyfin internals.

#### `HtmlInjectionMiddleware`

Intercepts requests to `/web/`, `/web/index.html`, and the empty bare path that the SPA serves. Buffers the response, injects:

```html
<script src="/JellyfinEnhanced/web/bootstrap.js?v={configVersion}" defer></script>
```

Notes:
- Strips `Accept-Encoding` from request so downstream gzip/brotli middleware doesn't fight us. Re-emits uncompressed (≤7 KB delta — negligible).
- Removes `Content-Encoding` and rewrites `Content-Length` after edit.
- Skips non-HTML responses (status, content-type guards).
- The `?v={configVersion}` query string busts the browser cache when admins toggle features, without invalidating Jellyfin's own asset cache.

#### `BrandingAssetMiddleware`

Replaces FT's `IconTransparent`, `BannerLight/Dark`, `Favicon`, `AppleIcon`. Matches request path against:

| Pattern | Source file in `BrandingDirectory` |
|---|---|
| `*/icon-transparent.*.png` | `icon-transparent.png` |
| `*/banner-light.*.png`     | `banner-light.png` |
| `*/banner-dark.*.png`      | `banner-dark.png` |
| `*/favicon.*.ico`          | `favicon.ico` |
| `*/touchicon.*.png`        | `apple-touch-icon.png` |

If matched and the user has uploaded a custom asset, serves the bytes with the original mime type and `Cache-Control: no-cache`. Otherwise passes through.

#### `NoCacheHeaderMiddleware`

Sets `Cache-Control: no-cache` on `/web/index.html` and our own `/JellyfinEnhanced/*` endpoints. Without this, hard refresh would still be needed to re-fetch `index.html` after server restart.

The injection is content-rewriting, not file-rewriting — so `If-None-Match`/`If-Modified-Since` are no longer reliable; safer to skip 304s for `index.html`.

#### `ConfigVersion`

Static `string Current { get; }` returning a stable hash of:
- Plugin assembly version
- Plugin configuration (relevant booleans only — toggles, feature flags)
- Per-user config last-modified timestamp

Cached for 5s to amortize hashing cost. This hash is the cache-bust query param on the bootstrap script, and is also exposed via `/JellyfinEnhanced/web/version` so the client can poll it for hot-reload.

#### Endpoints (added to existing `JellyfinEnhancedController`)

```
GET  /JellyfinEnhanced/web/bootstrap.js   # the loader (no auth)
GET  /JellyfinEnhanced/web/version        # config version hash (no auth)
GET  /JellyfinEnhanced/web/sidebar        # JSON list of pages to add to sidebar
GET  /JellyfinEnhanced/web/tabs           # JSON list of home-page tabs to add
```

The `script` endpoint already exists and serves `js/plugin.js`. The new `bootstrap.js` is a tiny loader (~2 KB) that:
1. Fetches the version hash.
2. Fetches the main script with `?v={version}`.
3. Boots up.
4. Subscribes to `version` polling for hot-reload.

Why two scripts: the bootstrap is in `index.html` and must be tiny; the main script is large (~600 KB after concatenation) and benefits from version-pinned caching.

---

### Client (JS)

```
Jellyfin.Plugin.JellyfinEnhanced/
├── js/
│   ├── plugin.js                   # existing — entry, namespace bootstrapping
│   └── web/                        # NEW — self-contained UI subsystem
│       ├── bootstrap.js            # loader (served at /web/bootstrap.js)
│       ├── sidebar-manager.js      # replaces PP's inject.js
│       ├── route-hijacker.js       # replaces PP's main-bundle patches
│       ├── tabs-manager.js         # replaces CT's customTabs.js
│       ├── page-host.js            # standalone page rendering
│       └── hot-reload.js           # config-version polling + reapply
```

#### `bootstrap.js` (served at `/JellyfinEnhanced/web/bootstrap.js`)

```javascript
(function () {
  'use strict';
  // Single entry — runs ONCE per index.html load.
  var version = document.currentScript.src.split('?v=')[1] || '';
  var s = document.createElement('script');
  s.src = '/JellyfinEnhanced/script?v=' + version;
  s.defer = true;
  document.head.appendChild(s);
})();
```

Tiny + cache-friendly. The real work happens in the deferred main script.

#### `sidebar-manager.js` (replaces PP)

Single class. Behavior:

1. On first DOM-ready, locate `.mainDrawer-scrollContainer`.
2. Insert `<div class="je-sidebar-section">` after `.userMenuOptions`.
3. Fetch `/JellyfinEnhanced/web/sidebar` → JSON list of `{ id, title, icon, url }`.
4. Render entries inside the section.
5. **MutationObserver on the drawer container** — re-inserts the section if Jellyfin rebuilds the sidebar (which happens on user-switch and theme change).
6. **Hot-reload subscriber** — `JE.HotReload.on('sidebar', this.refresh)`.

Sidebar entries link to `#/JellyfinEnhanced/<pageId>`. The route hijacker handles those URLs.

#### `route-hijacker.js` (replaces PP's main-bundle FT patch)

PP works by editing the JS bundle to add a route. We can't and won't do that. Instead:

1. Listen to `viewbeforeshow`, `viewshow`, and `popstate`.
2. When the navigated URL matches `/JellyfinEnhanced/<pageId>`, **intercept**:
   - Show the existing `#indexPage` (home) container.
   - Replace its content with our page renderer's output.
   - Mark the URL via `history.replaceState` so back-button works.
3. When navigating away, restore the original content (or simply let Jellyfin re-render normally).

The hijack works because Jellyfin's router will fail-fall-back to the home page for unknown routes; we step in before that fallback finishes and render our content into the same container. This is the same trick the existing `*-page.js` files use (the JE Calendar/Downloads/Bookmarks/HiddenContent pages already know how to render into a container — we just give them a container).

#### `tabs-manager.js` (replaces CT)

1. MutationObserver on the home page tab strip (`.headerTabs`, fallback `.emby-tabs-slider`).
2. When tab strip appears, fetch `/JellyfinEnhanced/web/tabs` → JSON list.
3. Inject custom tab buttons after Jellyfin's native tabs.
4. Mount tab content panes alongside `.tabContent` panes.
5. Hook the existing tab change event so our panes show/hide correctly.
6. **Hot-reload subscriber** — re-runs the inject step when config changes.

Tab content for JE features re-uses the existing `*-custom-tab.js` modules' renderers. The container element changes — instead of a `.jellyfinenhanced.calendar` div placed by an external plugin, we create the container ourselves. Same `JE.calendarPage.renderForCustomTab(child)` call, same lifecycle.

#### `page-host.js`

Tiny shared library: given a target container and a page id, calls the right `JE.X.renderForCustomTab(container)`. Used by both the route hijacker (for standalone pages) and the tabs manager (for home tabs). Single point to add a new JE page in future.

```javascript
JE.WebHost.register('calendar',     (el) => JE.calendarPage.renderForCustomTab(el));
JE.WebHost.register('downloads',    (el) => JE.requestsPage.renderForCustomTab(el));
JE.WebHost.register('bookmarks',    (el) => JE.bookmarks.renderForCustomTab(el));
JE.WebHost.register('hiddenContent',(el) => JE.hiddenContentPage.renderForCustomTab(el));
```

#### `hot-reload.js`

```javascript
JE.HotReload = {
  topics: ['sidebar', 'tabs', 'config', 'translations'],
  current: {},
  start() {
    setInterval(() => this.poll(), 4000);
  },
  async poll() {
    const r = await fetch('/JellyfinEnhanced/web/version');
    const v = (await r.json()).versions; // { sidebar, tabs, config, translations }
    for (const key of this.topics) {
      if (v[key] !== this.current[key]) {
        this.current[key] = v[key];
        this.emit(key);
      }
    }
  },
  on(topic, fn) { /* pubsub */ },
  emit(topic) { /* pubsub */ }
};
```

Each subsystem subscribes to its topic. When the topic version changes, the subsystem re-fetches its data and re-applies its UI changes — without reload.

---

## Migration plan (non-backward-compatible)

The plan is to **rip out** all integration with FT/PP/CT in one branch.

### Files to add

```
Jellyfin.Plugin.JellyfinEnhanced/
├── Web/JeStartupFilter.cs
├── Web/HtmlInjectionMiddleware.cs
├── Web/BrandingAssetMiddleware.cs
├── Web/NoCacheHeaderMiddleware.cs
├── Web/ConfigVersion.cs
├── Web/WebController.cs                  # /JellyfinEnhanced/web/* endpoints
└── js/web/{bootstrap,sidebar-manager,route-hijacker,tabs-manager,page-host,hot-reload}.js
```

### Files to modify

| File | Change |
|---|---|
| `JellyfinEnhanced.cs` | Delete `UpdateIndexHtml` and `CleanupOldScript` and `CheckPluginPages` calls. Keep `IHasWebPages.GetPages()` (still needed for admin dashboard). Drop `GetViews()` (PP-specific). |
| `Services/StartupService.cs` | Delete `RegisterFileTransformation` and `RegisterAssetTransformations`. Keep monitor initialization. |
| `Helpers/TransformationPatches.cs` | **Delete.** All logic moves into `BrandingAssetMiddleware` + `HtmlInjectionMiddleware`. |
| `PluginServiceRegistrator.cs` | Register the new `IStartupFilter`. |
| `Configuration/PluginConfiguration.cs` | Drop `*UseCustomTabs` / `*UsePluginPages` toggles — now redundant (we always use our own). Replace with single `*PageMode` enum: `Hidden / Tab / Page / Both`. |
| `Configuration/configPage.html` | Replace plugin-detection UI for PP/CT. Tooling for the page-mode dropdown. Remove "Install Plugin Pages" / "Install Custom Tabs" instructions and dependency banners. |
| `Controllers/JellyfinEnhancedController.cs` | Add `web/bootstrap`, `web/version`, `web/sidebar`, `web/tabs` endpoints. |
| `js/plugin.js` | Boot order: `bootstrap.js` → `plugin.js` (existing) → `web/*` modules. Drop `pluginPagesExists` checks. |
| `js/arr/calendar-page.js` | Drop `pluginPagesExists` branching — always go through `WebHost`. |
| `js/arr/calendar-custom-tab.js` | Drop CT detection — always render via `WebHost.tabs`. |
| `js/arr/requests-page.js` | Same as calendar-page. |
| `js/arr/requests-custom-tab.js` | Same as calendar-custom-tab. |
| `js/enhanced/bookmarks.js` | Same. |
| `js/enhanced/hidden-content-page.js` | Same. |
| `js/enhanced/hidden-content-custom-tab.js` | Same. |
| `js/enhanced/config.js` | Update `pluginPagesExists` / `customTabsExists` references — all features always available. |
| `JellyfinEnhanced.csproj` | Add `EmbeddedResource Include="js/web/**"`. |

### Files to delete

```
Helpers/TransformationPatches.cs
```

### What stays

- `PluginPages/*.html` — these are legitimate per-page HTML templates that we still serve. The folder name is misleading (it predates the rewrite); we'll keep it for now and rename in a follow-up.
- `IHasWebPages.GetPages()` for the admin config dashboard — that's a built-in Jellyfin extension point unrelated to PP.

---

## Risks & verification

### Compression / encoding edge cases

The HTML injection middleware modifies the response body. This will break if downstream gzip/brotli compression encodes the body before us. Mitigation: strip `Accept-Encoding` early. Verify with:

```
curl -v --compressed http://localhost:8097/web/index.html | grep "JellyfinEnhanced"
```

### Service worker

Jellyfin web ships a service worker that caches `/web/*`. After our changes, the service worker may serve a stale `index.html`.

Mitigation:
- Set `Cache-Control: no-cache` on `/web/index.html` (browsers and SWs respect this).
- The bootstrap script's URL has `?v={version}` so the SW can't serve a stale main script.
- If the user updates the plugin and the SW still serves stale, the next nav will hit the network, see the new bootstrap URL, and load fresh. Worst case: one stale page, **no manual refresh needed**.

### Sub-path hosted Jellyfin (`/jellyfin/web/`)

CT's `HtmlInjectionStartupFilter` matches `/web/*` paths exactly. We need to check `IServerConfigurationManager.GetNetworkConfiguration().BaseUrl` and prefix accordingly.

### `/JellyfinEnhanced/web/bootstrap.js` ordering

`<script defer>` defers execution until after HTML parse. Order with Jellyfin's own bundles:
- Jellyfin's bundles use `<script type="module">` or eager `<script>`. Our bootstrap is `defer`, so it runs after Jellyfin's bundles.
- That's the correct order — Jellyfin must initialize first (ApiClient, DOM ready) before our code runs.

### Other plugins still using FT/PP/CT

We don't break them — we just stop **using** them. JE no longer registers any FT transformations or PP pages, so:
- If FT/PP/CT are still installed, they're inert from JE's perspective.
- If they aren't installed, JE works fully on its own.

### Auth on `/web/*` endpoints

`/JellyfinEnhanced/web/bootstrap.js` and `/JellyfinEnhanced/web/version` must be unauthenticated (loaded before login). `web/sidebar` and `web/tabs` should require auth so we filter by user permissions (e.g., admin-only pages).

### Translations cache

Out of scope for this rework — translations cache invalidation already has its own mechanism (`ClearTranslationCacheTimestamp`). We hook it into `HotReload` for free.

---

## Implementation order

1. **Server skeleton** — `JeStartupFilter`, `HtmlInjectionMiddleware`, register in `PluginServiceRegistrator`. Drop `UpdateIndexHtml` from `JellyfinEnhanced.cs`. **Verify**: bootstrap script tag appears in `curl /web/index.html`.
2. **Bootstrap script** — `bootstrap.js` resource + `web/bootstrap.js` controller route. **Verify**: browser loads bootstrap → loads main script.
3. **Branding middleware** — port `TransformationPatches` image logic. Delete `TransformationPatches.cs`. **Verify**: custom uploaded `favicon.ico` is served.
4. **Hot-reload + version endpoint** — `ConfigVersion`, `web/version`, client `hot-reload.js`. **Verify**: change a config value → JS receives the version bump within 4s.
5. **Sidebar manager** — `web/sidebar` endpoint + `sidebar-manager.js`. Delete `CheckPluginPages` from `JellyfinEnhanced.cs`. **Verify**: JE pages appear in sidebar without PP installed.
6. **Route hijacker** — `route-hijacker.js`. **Verify**: clicking a sidebar entry renders the page in-place, no 404, back-button works.
7. **Tabs manager** — `web/tabs` endpoint + `tabs-manager.js`. **Verify**: home page shows JE tabs without CT installed; toggling a feature in admin reflects within 4s.
8. **Wire up existing JE features** — drop `pluginPagesExists` / `customTabsExists` branches; route everything through `WebHost`.
9. **Config UI cleanup** — replace per-feature toggles with `PageMode` dropdowns; remove "install Plugin Pages" instructions.
10. **Build, deploy, full QA in jellyfin-dev**: install fresh (no FT/PP/CT installed) and verify every feature works end-to-end.

---

## Open questions (defaults applied unless user directs otherwise)

- **Default page mode for each feature**: defaulting to **Both** (page + tab) so existing users see no functional change. Configurable per-feature.
- **Sidebar header label**: defaulting to "Jellyfin Enhanced" (was "Plugin Settings" under PP). Translated via `JE.t('SidebarHeader')`.
- **Admin can hide individual sidebar entries**: yes — already implied by per-feature `Page` mode toggle.
