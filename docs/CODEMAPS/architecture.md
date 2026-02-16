# Jellyfin-Enhanced Architecture Codemap

## Overview

Jellyfin-Enhanced is a Jellyfin plugin with a C# backend and client-side JavaScript frontend.
No build system (webpack/rollup) — raw JS files are served by the C# backend and loaded
sequentially at runtime via dynamic `<script>` tag injection.

## Entry Points

### Backend
- `JellyfinEnhanced.cs` — BasePlugin implementation; injects JS into `index.html`
- `Controllers/JellyfinEnhancedController.cs` — API endpoints for config, user-settings, proxy
- `Configuration/PluginConfiguration.cs` — Plugin-level config schema
- `Configuration/UserConfiguration.cs` — Per-user settings schema
- `Configuration/UserConfigurationManager.cs` — User data persistence

### Frontend
- `js/plugin.js` — **Main entry point** (639 lines). 6-stage initialization:
  1. Load translations module + plugin config + version (parallel)
  2. Fetch 5 user-settings JSON files (parallel)
  3. Load ALL 45+ component scripts via `loadScripts()` (parallel script tags)
  4. Initialize settings/shortcuts from `config.js`
  5. Initialize theme system
  6. Conditionally initialize feature modules based on config flags

### Pre-Init Scripts (loaded before main init)
- `js/others/splashscreen.js` — Loaded immediately, blocks media bar until ready
- `js/extras/login-image.js` — Loaded if `EnableLoginImage` config flag is true

## Module Architecture

All modules use IIFE pattern: `(function(JE) { 'use strict'; ... })(window.JellyfinEnhanced);`
Communication via global namespace `window.JellyfinEnhanced` (aliased `JE`).

### Core Infrastructure
| File | Lines | Purpose |
|------|-------|---------|
| `js/enhanced/config.js` | — | Settings merging, `loadSettings()`, `initializeShortcuts()` |
| `js/enhanced/helpers.js` | — | Page-view hooks (`Emby.Page.onViewShow`), MutationObserver registry |
| `js/enhanced/icons.js` | — | Icon rendering (Material Symbols, Lucide) |
| `js/enhanced/translations.js` | — | i18n: GitHub fetch with localStorage caching, fallback to bundled |
| `js/enhanced/events.js` | — | Event system, keyboard shortcuts |
| `js/enhanced/features.js` | — | Feature flag management |

### Feature Modules
| Directory | Files | Purpose |
|-----------|-------|---------|
| `js/enhanced/` | 17 | Core: playback, bookmarks, pause screen, subtitles, themes, UI, hidden content |
| `js/jellyseerr/` | 15 | Jellyseerr/Overseerr integration: search, request, discovery, modals |
| `js/tags/` | 5 | Visual tags on item cards: quality, genre, language, people, ratings |
| `js/arr/` | 6 | Sonarr/Radarr integration: calendar, requests, links |
| `js/elsewhere/` | 2 | Streaming availability + TMDB reviews |
| `js/extras/` | 5 | Optional: colored icons, ratings, theme selector, plugin icons |
| `js/others/` | 2 | Letterboxd links, splash screen |
| `js/locales/` | 16 | Translation JSON files |

### Key Shared Infrastructure
| File | Purpose |
|------|---------|
| `js/jellyseerr/request-manager.js` | Centralized HTTP with dedup, retry, caching, concurrency control |
| `js/jellyseerr/seamless-scroll.js` | Infinite scroll with prefetch, batched rendering, retry |
| `js/jellyseerr/discovery-filter-utils.js` | Shared filter/sort logic for discovery pages |

## Data Flow

```
User visits page
  → Emby.Page.onViewShow fires
  → helpers.js intercepts, notifies registered handlers
  → Each handler checks if its page matches
  → Handler may: fetch item data, inject tags, load discovery content, etc.
```

## State Management

- `JE.pluginConfig` — Server plugin configuration (public + private)
- `JE.userConfig` — Per-user settings (settings, shortcuts, bookmarks, elsewhere, hiddenContent)
- `JE.currentSettings` — Merged settings (plugin defaults + user overrides)
- `JE.state` — Runtime state (active shortcuts, current item, etc.)
- `JE._cacheManager` — Unified cache with `requestIdleCallback` deferred saves
- `localStorage` — Transient client state, translation cache

## Build & Deployment

- **No JS bundler** — raw JS files embedded as resources in C# DLL
- Build: `dotnet build --configuration Release` in `Jellyfin.Plugin.JellyfinEnhanced/`
- Output: `bin/Release/net9.0/Jellyfin.Plugin.JellyfinEnhanced.dll` (~2.7 MB)
- JS files included via `<EmbeddedResource Include="js\**" />` in `.csproj`
- C# backend serves embedded JS at `/JellyfinEnhanced/js/*` routes
- Deploy: copy DLL to `{plugins}/Jellyfin Enhanced_10.11.0.0/`, restart Jellyfin
- Cache busting: `?v=${Date.now()}` on every script load (zero browser caching)

## Performance-Critical Paths

1. **Startup**: 6-stage sequential init, 45+ script tags, 5 parallel user-settings fetches
2. **Page navigation**: `onViewShow` hook → all handlers notified → tag injection via MutationObserver
3. **Discovery/infinite scroll**: `seamless-scroll.js` prefetch → batch render → DOM append
4. **Tag systems**: MutationObserver on card containers → API call per item → DOM inject
5. **Request manager**: Concurrency limit (4), dedup, cache (5min TTL), retry with backoff
