## Project Structure

The plugin architecture uses a single entry point (`plugin.js`) that dynamically loads all other feature components.

`plugin.js` holds an ordered array (`allComponentScripts`) of every client module and injects them with `script.async = false`, so they download in parallel but **execute in array order**. That ordering is load-bearing: a module placed before one whose exports it reads at load time will bind `undefined`. Add new modules to that array *after* their producers.

### File Structure

All client-side scripts live in `Jellyfin.Plugin.JellyfinEnhanced/js/`, grouped by feature. Server-side Spoiler Guard components live under `Services/SpoilerGuard/`.

```text
Jellyfin.Plugin.JellyfinEnhanced/
├── EventHandlers/
│   ├── SpoilerAutoEnableEvents.cs
│   └── UserTopologyEvents.cs
├── Model/
│   └── TagCacheEntry.cs
├── Services/
│   ├── Identity/
│   │   └── RequestIdentityService.cs
│   └── SpoilerGuard/
│       ├── ImageBlurService.cs
│       ├── SpoilerBlurImageFilter.cs
│       ├── SpoilerIdentityService.cs
│       ├── SpoilerIdentityTagFilter.cs
│       ├── SpoilerFieldStripFilter.cs
│       ├── SpoilerSeerrPendingPromoter.cs
│       └── SpoilerUserResolver.cs
└── js/
    ├── plugin.js
    ├── locales/                      # 26 translation files (en.json, de.json, …)
    ├── core/
    │   ├── api-client.js
    │   ├── dom-observer.js
    │   ├── lifecycle.js
    │   ├── navigation.js
    │   ├── tag-renderer-base.js
    │   └── ui-kit.js
    ├── enhanced/
    │   ├── config.js
    │   ├── events.js
    │   ├── features-random-button.js
    │   ├── helpers.js
    │   ├── icons.js
    │   ├── native-tabs.js
    │   ├── themer.js
    │   ├── translations.js
    │   ├── ui-styles.js
    │   ├── bookmarks/
    │   │   ├── bookmarks.js
    │   │   ├── bookmarks-library-init.js
    │   │   ├── bookmarks-library-items.js
    │   │   ├── bookmarks-library-modals.js
    │   │   ├── bookmarks-library-page.js
    │   │   ├── bookmarks-library-render.js
    │   │   ├── bookmarks-library-replacements.js
    │   │   └── bookmarks-library-styles.js
    │   ├── hiddencontent/            # 16 modules: data, filter, save, panel,
    │   │   └── …                     # dialogs, buttons, styles + the page (nav,
    │   │                             # state, render, cards, admin, init, styles)
    │   ├── homeremoval/
    │   │   ├── features-remove-home.js
    │   │   └── features-remove-multiselect.js
    │   ├── itemdetails/
    │   │   ├── features-details-media-info.js
    │   │   ├── features-details-page.js
    │   │   └── features-release-dates.js
    │   ├── player/
    │   │   ├── osd-rating.js
    │   │   ├── pausescreen.js
    │   │   ├── playback.js
    │   │   └── subtitles.js
    │   ├── settingspanel/
    │   │   ├── ui-entry-points.js
    │   │   ├── ui-panel.js
    │   │   ├── ui-panel-hidden-content.js
    │   │   ├── ui-panel-language.js
    │   │   ├── ui-panel-settings.js
    │   │   ├── ui-panel-shortcut-editor.js
    │   │   ├── ui-panel-template.js
    │   │   └── ui-release-notes.js
    │   └── spoilerguard/             # 12 modules: state, ids, identity, snooze,
    │       └── …                     # styles, dialog, detail-button, seerr-toggle,
    │                                 # settings-tab, image-refresh, watched-refresh, index
    ├── jellyseerr/
    │   ├── api.js
    │   ├── hss-discovery-handler.js
    │   ├── issue-reporter.js
    │   ├── item-details.js
    │   ├── jellyseerr.js
    │   ├── modal.js
    │   ├── request-manager.js
    │   ├── seamless-scroll.js
    │   ├── seerr-detail-link.js
    │   ├── seerr-status.js
    │   ├── discovery/
    │   │   ├── discovery-base.js
    │   │   ├── discovery-filter-utils.js
    │   │   ├── collection-discovery.js
    │   │   ├── genre-discovery.js
    │   │   ├── network-discovery.js
    │   │   ├── person-discovery.js
    │   │   └── tag-discovery.js
    │   ├── moreinfo/                 # 8 modules: styles, data, seasons, badges,
    │   │   └── …                     # render, actions, actions-tv, init
    │   ├── recommendations/          # 8 modules: styles, catalog, data, render,
    │   │   └── …                     # page, category, init, custom-tab
    │   └── ui/                       # 10 modules: icons, styles, popover, badges,
    │       └── …                     # cards, buttons, quota, results,
    │                                 # request-modals, season-modal
    ├── arr/
    │   ├── arr-links.js
    │   ├── arr-tag-links.js
    │   ├── calendar/                 # 7 modules: styles, data, render-events,
    │   │   └── …                     # render-views, actions, init, custom-tab
    │   └── requests/                 # 8 modules: styles, data, render-helpers,
    │       └── …                     # render-cards, render, actions, init, custom-tab
    ├── tags/
    │   ├── genretags.js
    │   ├── languagetags.js
    │   ├── peopletags.js
    │   ├── qualitytags.js
    │   ├── ratingtags.js
    │   ├── userreviewtags.js
    │   └── tag-pipeline.js
    ├── elsewhere/
    │   ├── elsewhere.js
    │   └── reviews.js
    ├── extras/
    │   ├── active-streams.js
    │   ├── colored-activity-icons.js
    │   ├── colored-ratings.js
    │   ├── login-image.js
    │   ├── plugin-icons.js
    │   └── theme-selector.js
    └── others/
        ├── letterboxd-links.js
        └── splashscreen.js
```

### How modules are organised

Each module is an IIFE. Features larger than a single file get their own directory, and the files inside follow a consistent concern-based naming pattern:

| Suffix | Responsibility |
|---|---|
| `-styles` | CSS injection only |
| `-data` | State object and data access (fetching, caching) |
| `-render` | HTML/DOM construction (may split further, e.g. `-render-cards`) |
| `-actions` | User interactions — filters, pagination, buttons |
| `-init` | Bootstrap, navigation wiring and the public surface |
| `-custom-tab` | Mounts the feature inside a Custom Tabs / native tab panel |

Modules in the same directory share state through a namespace object, seeded **once** by the directory's first-loaded module and read by the rest:

```javascript
// owner (first in load order)
const P = (JE.internals.requestsPage = JE.internals.requestsPage || { /* state */ });

// siblings
const P = JE.internals.requestsPage;
```

Directory names avoid hyphens (`settingspanel`, not `settings-panel`). Embedded-resource names are derived from the file path, and a hyphen in a *directory* segment is rewritten to an underscore while file-name hyphens are preserved — a hyphenated directory therefore makes its modules unreachable at runtime.

### Component Breakdown

* **`plugin.js`**: The main entry point. It loads the plugin configuration and translations, then dynamically injects all other component scripts in dependency order.

* **`/core/`**: Shared primitives used across every feature. Introduced to remove logic that was previously duplicated per module.
    * **`api-client.js`**: The single HTTP layer — `JE.core.api.{fetch,jf,plugin}` with auth headers, retry/backoff, response caching, request deduplication, concurrency limiting and `AbortController` support.
    * **`dom-observer.js`**: Multiplexed `MutationObserver` management — one shared body observer with named subscribers, plus dedicated observers and `waitForElement`.
    * **`lifecycle.js`**: Per-feature registration of observers, timers and listeners so they can be torn down together on navigation.
    * **`navigation.js`**: One deduped SPA navigation dispatcher (`onNavigate`, `onViewPage`), replacing the ad-hoc `hashchange`/`viewshow` listeners that previously double-fired on hash navigation and missed `pushState` navigation.
    * **`tag-renderer-base.js`**: The shared poster-tag engine — overlay creation, positioning, tagged-card deduplication, caching and reinitialisation. The tag modules supply a spec.
    * **`ui-kit.js`**: `escapeHtml`, `toast`, deduped CSS injection, and scroll-friendly tap detection (`addTouchTapListener`).

* **`/enhanced/`**: Core "Jellyfin Enhanced" functionality.
    * **`config.js`**: Manages all settings, both from the plugin backend and the user's local storage.
    * **`events.js`**: Listens for user input, browser events and DOM changes to trigger the appropriate functions from other components.
    * **`features-random-button.js`**: The random item button.
    * **`helpers.js`**: Utility functions shared across the enhanced components.
    * **`icons.js`**: Icon selection and rendering (emoji or Lucide).
    * **`native-tabs.js`**: Shared registry for JE-created home tabs, used when a feature is shown as a native tab rather than via the Custom Tabs plugin.
    * **`themer.js`**: Theme detection and Enhanced Panel styling.
    * **`translations.js`**: Loads and caches translations. Loaded outside the main registry so it is available pre-login.
    * **`ui-styles.js`**: Global stylesheet for the injected UI, including the settings panel's responsive rules.
    * **`/bookmarks/`**: `bookmarks.js` handles playback bookmarks (creation via `B`, timeline markers, navigation); the `bookmarks-library-*` modules provide the management interface — listing, orphan cleanup, duplicate detection and time-offset adjustment.
    * **`/hiddencontent/`**: Per-user hidden content — the data/filter/save layer, the settings panel section, and the standalone management page.
    * **`/homeremoval/`**: "Remove from Continue Watching / Next Up", including multi-select.
    * **`/itemdetails/`**: Detail-page enhancements — media info, file size, audio languages and release dates.
    * **`/player/`**: Everything that touches the video player — `playback.js` (speed, seeking, track cycling, auto-skip), `subtitles.js` (styling and presets), `pausescreen.js` (custom pause overlay), `osd-rating.js` (TMDB/Rotten Tomatoes in the OSD).
    * **`/settingspanel/`**: The user settings panel — entry points, the HTML template, the section navigation shell, and per-section wiring (settings, language, hidden content, shortcut editor, release notes).
    * **`/spoilerguard/`**: Client-side companion for Spoiler Guard — the per-show/movie/collection toggle, in-memory opt-in and override state, the settings pane, and the soft image refresh after toggles and watched-state changes. The actual blur/strip happens server-side. `index.js` publishes the public `JE.spoilerBlur` surface once every implementation module has loaded.

* **`/jellyseerr/`**: Seerr integration.
    * **`api.js`**: Communication with the Seerr proxy endpoints on the Jellyfin server.
    * **`hss-discovery-handler.js`**: Bridges discovery rows into Home Screen Sections.
    * **`issue-reporter.js`**: Report problems with media items directly from Jellyfin.
    * **`item-details.js`**: Similar and Recommended rows on item detail pages, plus the "Request More" button for series with unrequested seasons.
    * **`jellyseerr.js`**: Main controller, orchestrating the other components and managing state.
    * **`modal.js`**: Advanced request modals.
    * **`request-manager.js`**: Thin alias onto `JE.core.api.manager`, kept as a stable public surface.
    * **`seamless-scroll.js`**: Infinite scroll with prefetch, deduplication and backoff, reused by the discovery modules.
    * **`seerr-detail-link.js`** / **`seerr-status.js`**: Detail-page link into Seerr, and the shared media/display status constants.
    * **`/discovery/`**: `discovery-base.js` owns the whole discovery lifecycle — three pagination strategies, abort handling, config gating, card rendering, filtering and cleanup. Each of `genre`, `network`, `person`, `tag` and `collection` supplies a small spec describing how to resolve its feeds. `discovery-filter-utils.js` provides shared TV/Movies/All filtering and card creation.
    * **`/moreinfo/`**: The Seerr More Info modal — cast, crew, extended metadata, seasons and request actions.
    * **`/recommendations/`**: The Recommendations page — Trending/Popular/Upcoming rows plus Studios and Networks tiles, with a "View All" category page. Available as a sidebar page or a tab.
    * **`/ui/`**: All visual elements of the integration — result cards, request buttons, status badges, quota display, the download-progress popover and the season/request modals.

* **`/arr/`**: Sonarr and Radarr integration.
    * **`arr-links.js`**: Links to Sonarr, Radarr and Bazarr on item detail pages, for administrators only.
    * **`arr-tag-links.js`**: Synced *arr tags as clickable links on item detail pages, with show/hide filtering.
    * **`/calendar/`**: The calendar page — upcoming items from Radarr and Sonarr, available via the sidebar or a tab.
    * **`/requests/`**: The requests page — requests, download queue, issues and import history from the *arrs and Seerr, available via the sidebar or a tab.

* **`/tags/`**: Poster tag renderers, all built on `core/tag-renderer-base.js`.
    * **`genretags.js`**: Genre information as tags on posters.
    * **`languagetags.js`**: Audio language as flag icons on posters.
    * **`peopletags.js`**: Age and birthplace for cast members, with country flags and deceased indicators.
    * **`qualitytags.js`**: Quality information (4K, HDR, Atmos) as tags on posters.
    * **`ratingtags.js`**: TMDB and Rotten Tomatoes ratings as badges on posters.
    * **`userreviewtags.js`**: The user's own rating, composed into the ratings overlay.
    * **`tag-pipeline.js`**: Shared server-backed tag cache feeding the renderers in bulk.

* **`/elsewhere/`**: Discovering media on other streaming services, and reviews.
    * **`elsewhere.js`**: Powers the "Jellyfin Elsewhere" feature.
    * **`reviews.js`**: TMDB user reviews on item detail pages.

* **`/extras/`**: Optional scripts that extend functionality.
    * **`active-streams.js`**: Shows currently active streams.
    * **`colored-activity-icons.js`**: Material Design activity icons with custom colours.
    * **`colored-ratings.js`**: Colour-coded rating backgrounds on item detail pages.
    * **`login-image.js`**: User profile images instead of text on the manual login page.
    * **`plugin-icons.js`**: Custom plugin icons on the dashboard, plus custom config-page links.
    * **`theme-selector.js`**: Jellyfish colour palette selection, with an optional daily random theme.

* **`/others/`**: Miscellaneous utility scripts.
    * **`letterboxd-links.js`**: Letterboxd external links on movie detail pages.
    * **`splashscreen.js`**: The custom splash screen shown while the application loads.

* **`/Services/SpoilerGuard/`**: Server-side C# services that implement Spoiler Guard.
    * **`ImageBlurService.cs`**: SkiaSharp Gaussian blur, stock-card rendering, and the pre-encoded fail-closed fallback JPEG, with result caching.
    * **`SpoilerBlurImageFilter.cs`**: Intercepts image responses and replaces the bytes for unwatched items — safe parent art, blur, or the fail-closed dark card, depending on mode and availability.
    * **`SpoilerIdentityService.cs`**: Mints and resolves stable per-user image identity markers.
    * **`SpoilerIdentityTagFilter.cs`**: Stamps item DTO image tags with per-user identity markers so native image requests can be resolved without relying on IP address.
    * **`SpoilerFieldStripFilter.cs`**: Strips or rewrites metadata (titles, synopses, ratings, chapter names, cast, tags, taglines, air dates) in API responses for unwatched items, honoring per-user overrides.
    * **`SpoilerSeerrPendingPromoter.cs`**: Promotes pending pre-acquisition entries (registered from the Seerr More Info modal or auto-enable on request) into real per-item protection when the content lands in the library.
    * **`SpoilerUserResolver.cs`**: Loads per-user Spoiler Guard state for the requesting user identified by `RequestIdentityService`.

* **`/Services/Identity/`**: Shared request identity helpers.
    * **`RequestIdentityService.cs`**: Resolves the current request identity using authenticated claims first, then image identity markers, single-user installs, cookies, and shared-IP session candidates.

* **`/EventHandlers/`** (Spoiler Guard):
    * **`SpoilerAutoEnableEvents.cs`**: Implements "Auto-enable on first play of a new show" — adds a series to the user's Spoiler Guard list on a fresh S1E1 play.
    * **`UserTopologyEvents.cs`**: Invalidates single-user and marker lookup caches when users are created or deleted.

* **`/Model/`** (Spoiler Guard):
    * **`TagCacheEntry.cs`**: Pre-computed per-item tag data served to clients in bulk; carries the parent-series ID so the Spoiler Guard filter can strip cache entries for unwatched episodes without per-request library lookups.
