## Project Structure

Jellyfin Enhanced keeps its browser runtime in JavaScript. `plugin.js` is the single client entry point and loads feature scripts individually in development or as an esbuild bundle in production. The `.d.ts` file under `js/core/` is editor/type-check metadata only; there is no TypeScript runtime or TypeScript build output.

### Client scripts (`Jellyfin.Plugin.JellyfinEnhanced/js/`)

Every client module is a classic-script IIFE over the shared `window.JellyfinEnhanced` global (`JE`). `plugin.js` owns the load order, and modules execute in array order. Large features use focused, prefixed files or a feature subdirectory and share private state through `JE.internals.<feature>`.

```text
Jellyfin.Plugin.JellyfinEnhanced/
└── js/
    ├── plugin.js            # Entry point: config, load order, dev scripts or dist/je.bundle.js
    ├── core/                # Shared infrastructure loaded before feature modules
    │   ├── navigation.js    # Deduplicated Jellyfin SPA navigation events
    │   ├── lifecycle.js     # Teardown registry for listeners, observers and timers
    │   ├── dom-observer.js  # Shared MutationObserver and element-wait helpers
    │   ├── api-client.js    # Authenticated Jellyfin/plugin fetch wrapper
    │   ├── ui-kit.js        # Shared escaping, toast and CSS helpers
    │   ├── tag-renderer-base.js  # Common tag-renderer lifecycle and cache plumbing
    │   └── globals.d.ts     # Type-check metadata; not runtime TypeScript
    ├── enhanced/            # Core playback, UI and content-management features
    │   ├── config.js / helpers.js / events.js / icons.js / translations.js / themer.js
    │   ├── playback.js / subtitles.js / pausescreen.js / osd-rating.js / native-tabs.js
    │   ├── tag-pipeline.js  # Scan/batch-fetch pipeline used by tags/
    │   ├── features-*.js    # Random button, details, release dates and list actions
    │   ├── ui-*.js          # Settings-panel entry points, templates, sections and styles
    │   ├── bookmarks.js + bookmarks-library-*.js
    │   ├── hidden-content-*.js + hidden-content-page-*.js
    │   └── spoilerguard/    # Focused Spoiler Guard modules; see below
    ├── jellyseerr/          # Seerr API, discovery, request and modal modules
    │   ├── discovery-base.js + {genre,tag,network,person,collection}-discovery.js
    │   ├── more-info-modal-*.js
    │   └── ui-*.js
    ├── arr/                 # Sonarr/Radarr integration
    │   ├── arr-links.js / arr-tag-links.js
    │   ├── calendar-page-*.js + calendar-custom-tab.js
    │   └── requests-page-*.js + requests-custom-tab.js
    ├── tags/                # Renderer specs over core/tag-renderer-base.js
    ├── elsewhere/           # Streaming availability and reviews
    ├── extras/              # Active streams, ratings/icons, themes and login image
    ├── others/              # Splash screen and Letterboxd links
    └── locales/             # 26 JSON locale files; en.json is the base
```

`others/splashscreen.js` and `extras/login-image.js` load before normal boot, while `enhanced/translations.js` loads before login. Those scripts are intentionally outside the main feature array/bundle flow.

### Spoiler Guard client boundary

Spoiler Guard is split under `js/enhanced/spoilerguard/`; the compact folder name keeps loader URLs, embedded-resource names, and the `JE.internals.spoilerGuard` namespace aligned:

```text
spoilerguard/
├── state.js / ids.js / identity.js
├── detail-button.js / dialog.js / snooze.js
├── image-refresh.js / watched-refresh.js
├── seerr-toggle.js / settings-tab.js
├── suppression.js / styles.js
└── index.js                 # Composes modules and preserves JE.spoilerBlur compatibility
```

The modules share private state through `JE.internals.spoilerGuard`. `index.js` keeps the existing `JE.spoilerBlur` public surface so callers do not need to change while the implementation remains split.

### Admin configuration page

`Configuration/configPage.html` contains markup and minimal Jellyfin SPA bootstrap loaders. Application behavior lives in the external `Configuration/config-page.js`. Simple inputs declare their `PluginConfiguration` property with `data-config-key`; the generic binder loads and saves those fields, with narrowly scoped overrides for values that need validation or normalization.

The Spoiler Guard admin controls are part of that declarative binder:

- Master enable, image replacement mode, blur intensity, backdrop protection and visible movie posters
- Auto-enable on first play, auto-enable on Seerr request and strict refresh
- Overview stripping and placeholder text, title replacement, tags, taglines, chapters, ratings and premiere dates
- Cast stripping and cast scope, plus review suppression

The placeholder override strips markup-context characters and limits the saved value to 200 characters. Blur intensity is clamped to the supported 5-100 range.

### Server side (`Jellyfin.Plugin.JellyfinEnhanced/`)

```text
Jellyfin.Plugin.JellyfinEnhanced/
├── JellyfinEnhanced.cs         # Plugin registration and client script injection
├── PluginServiceRegistrator.cs # DI, named HttpClients, filters and logging
├── Controllers/                # Feature-area controllers over a shared base
│   ├── ConfigController.cs     # Config, script/bundle and locale resources
│   ├── SpoilerGuardController.cs
│   ├── JellyseerrProxyController.cs / JellyseerrUserController.cs
│   ├── ArrLinksController.cs / ArrCalendarController.cs / ArrRequestsController.cs
│   ├── UserSettingsController.cs / HiddenContentController.cs / ReviewsController.cs
│   ├── TagCacheController.cs / ItemInfoController.cs / BrandingController.cs
│   └── ActiveStreamsController.cs / MaintenanceModeController.cs / ViewsController.cs
├── Configuration/
│   ├── PluginConfiguration.cs  # Flat XML-serialized settings bag; shape stays upgrade-safe
│   ├── SettingDescriptors.cs   # Exposure and per-user pairing metadata
│   ├── UserConfiguration.cs / UserConfigurationManager.cs
│   ├── UserConfigurationStore.cs / UserDirMigration.cs / ReviewsStore.cs
│   ├── PersistedJson.cs        # Legacy-compatible JSON options
│   └── configPage.html + config-page.js + configPage.css
├── Services/
│   ├── SpoilerGuard/           # Image/metadata protection and pending-intent services
│   ├── Jellyseerr/             # Resolver and caches
│   └── ...                     # Auto-request, arr tags, maintenance and startup filters
├── Data/ItemLookupService.cs   # Jellyfin 10.11 and Jellyfin 12 provider-id lookup paths
├── EventHandlers/              # Playback/auto-enable events
├── ScheduledTasks/ · Helpers/ · Model/ · Logging/ · PluginPages/
└── dist/                       # Generated esbuild output; never committed
```

### Spoiler Guard server ownership

- `Controllers/SpoilerGuardController.cs` owns `spoilerblur.json`, health, preference, guarded item and pending-intent routes.
- `Services/SpoilerGuard/SpoilerPendingService.cs` owns shared TMDB lookup, pending-record and promotion logic used by the controller and Seerr auto-arm flow.
- `Services/SpoilerGuard/ImageBlurService.cs` produces blurred images, safe stock cards and fail-closed fallback images.
- `Services/SpoilerGuard/SpoilerBlurImageFilter.cs` protects image responses for unwatched guarded content.
- `Services/SpoilerGuard/SpoilerFieldStripFilter.cs` strips or rewrites spoiler-bearing metadata according to admin policy and per-user overrides.
- `Services/SpoilerGuard/SpoilerSeerrPendingPromoter.cs` promotes pre-acquisition intents when requested media arrives.
- `Services/SpoilerGuard/SpoilerUserResolver.cs` resolves the requesting user for response filters.
- `Controllers/TagCacheController.cs` owns the per-user, Spoiler Guard-aware tag projection; pure strip helpers live in `Services/TagCacheService.cs`.
- `EventHandlers/SpoilerAutoEnableEvents.cs` enables protection on a qualifying first play of S1E1.
- `Model/TagCacheEntry.cs` carries the parent-series identity needed to suppress unwatched episode tag data without repeated library lookups.

See [Spoiler Guard Features](../spoiler-guard/spoiler-guard-features.md) and [Spoiler Guard Settings](../spoiler-guard/spoiler-guard-settings.md) for behavior and administration details.

### Development tooling

- `npm run architecture` enforces the plain-JavaScript runtime, required shared modules, split feature boundaries and client-module size ceiling.
- `npm run syntax`, `npm run lint` and `npm run typecheck` validate served scripts.
- `npm run build:bundle` builds the production bundle and runs automatically from the C# build.
- `Jellyfin.Plugin.JellyfinEnhanced.Tests/` contains xUnit tests and golden snapshots for configuration payloads and persisted user files.
- `scripts/release/` owns release package and manifest generation/validation; see `RELEASING.md`.
