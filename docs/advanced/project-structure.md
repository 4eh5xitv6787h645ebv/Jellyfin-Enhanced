## Project Structure

The plugin architecture uses a single entry point (`plugin.js`) that dynamically loads all other feature components.

### File Structure

The plugin is a single .NET project. The C# backend (controllers, services, scheduled tasks, etc.) lives at the project root, and all client-side scripts are bundled under the `js/` directory.

```text
Jellyfin.Plugin.JellyfinEnhanced/
├── Configuration/
│   ├── configPage.css
│   ├── configPage.html
│   ├── PluginConfiguration.cs
│   ├── UserConfiguration.cs
│   └── UserConfigurationManager.cs
├── Controllers/
│   └── JellyfinEnhancedController.cs
├── EventHandlers/
│   └── ContinueWatchingPlaybackEvents.cs
├── Extensions/
│   ├── ItemRepositoryExtensions.cs
│   ├── JellyfinDbContextExtensions.cs
│   └── UserManagerExtensions.cs
├── Helpers/
│   ├── ArrUrlGuard.cs
│   ├── ProviderHelper.cs
│   ├── TransformationPatches.cs
│   ├── UserHelper.cs
│   └── Jellyseerr/
│       ├── JellyseerrPermissionHelper.cs
│       ├── JellyseerrUserImportHelper.cs
│       └── SeerrHttpHelper.cs
├── Model/
│   ├── PatchRequestPayload.cs
│   ├── TagCacheEntry.cs
│   ├── Arr/
│   │   ├── ArrInstance.cs
│   │   ├── ArrItem.cs
│   │   └── ArrType.cs
│   └── Jellyseerr/
│       ├── JellyseerrPermission.cs
│       └── JellyseerrUser.cs
├── PluginPages/
│   ├── BookmarksPage.html
│   ├── CalendarPage.html
│   ├── DownloadsPage.html
│   └── HiddenContentPage.html
├── ScheduledTasks/
│   ├── ArrTagsSyncTask.cs
│   ├── BuildTagCacheTask.cs
│   ├── ClearTranslationCacheTask.cs
│   ├── JellyfinToSeerrWatchlistSyncTask.cs
│   ├── JellyseerrUserImportTask.cs
│   └── JellyseerrWatchlistSyncTask.cs
├── Services/
│   ├── AutoMovieRequestMonitor.cs
│   ├── AutoMovieRequestService.cs
│   ├── AutoSeasonRequestMonitor.cs
│   ├── AutoSeasonRequestService.cs
│   ├── HiddenContentResponseFilter.cs
│   ├── MaintenanceModeService.cs
│   ├── RadarrService.cs
│   ├── SeerrScanTriggerService.cs
│   ├── SonarrService.cs
│   ├── StartupService.cs
│   ├── TagCacheMonitor.cs
│   ├── TagCacheService.cs
│   └── WatchlistMonitor.cs
├── JellyfinEnhanced.cs
├── Logger.cs
├── PluginServiceRegistrator.cs
└── js/
    ├── arr/
    │   ├── arr-links.js
    │   ├── arr-tag-links.js
    │   ├── calendar-custom-tab.js
    │   ├── calendar-page.js
    │   ├── requests-custom-tab.js
    │   └── requests-page.js
    ├── elsewhere/
    │   ├── elsewhere.js
    │   └── reviews.js
    ├── enhanced/
    │   ├── bookmarks.js
    │   ├── bookmarks-library.js
    │   ├── config.js
    │   ├── events.js
    │   ├── features.js
    │   ├── helpers.js
    │   ├── hidden-content.js
    │   ├── hidden-content-custom-tab.js
    │   ├── hidden-content-page.js
    │   ├── icons.js
    │   ├── osd-rating.js
    │   ├── pausescreen.js
    │   ├── playback.js
    │   ├── subtitles.js
    │   ├── tag-pipeline.js
    │   ├── themer.js
    │   ├── translations.js
    │   └── ui.js
    ├── extras/
    │   ├── active-streams.js
    │   ├── colored-activity-icons.js
    │   ├── colored-ratings.js
    │   ├── login-image.js
    │   ├── plugin-icons.js
    │   └── theme-selector.js
    ├── jellyseerr/
    │   ├── api.js
    │   ├── collection-discovery.js
    │   ├── discovery-filter-utils.js
    │   ├── genre-discovery.js
    │   ├── hss-discovery-handler.js
    │   ├── issue-reporter.js
    │   ├── item-details.js
    │   ├── jellyseerr.js
    │   ├── modal.js
    │   ├── more-info-modal.js
    │   ├── network-discovery.js
    │   ├── person-discovery.js
    │   ├── request-manager.js
    │   ├── seamless-scroll.js
    │   ├── seerr-status.js
    │   ├── tag-discovery.js
    │   └── ui.js
    ├── locales/
    │   ├── ar.json
    │   ├── bg.json
    │   ├── ca.json
    │   ├── cs.json
    │   ├── da.json
    │   ├── de.json
    │   ├── en.json
    │   ├── en-GB.json
    │   ├── en-US.json
    │   ├── es.json
    │   ├── fr.json
    │   ├── he.json
    │   ├── hu.json
    │   ├── it.json
    │   ├── nl.json
    │   ├── no.json
    │   ├── pl.json
    │   ├── pr.json
    │   ├── pt.json
    │   ├── pt-BR.json
    │   ├── ru.json
    │   ├── sk.json
    │   ├── sv.json
    │   ├── tr.json
    │   ├── zh-CN.json
    │   └── zh-HK.json
    ├── others/
    │   ├── letterboxd-links.js
    │   └── splashscreen.js
    ├── tags/
    │   ├── genretags.js
    │   ├── languagetags.js
    │   ├── peopletags.js
    │   ├── qualitytags.js
    │   ├── ratingtags.js
    │   └── userreviewtags.js
    └── plugin.js
```

!!! note

    `en.json` is the source-of-truth English file that all translations derive from. The usable English variants served to clients are `en-GB.json` and `en-US.json`.

### Component Breakdown

* **`plugin.js`**: The main entry point. It loads the plugin configuration and translations, then dynamically injects all other component scripts.

* **`/enhanced/`**: Contains the core components of the "Jellyfin Enhanced" feature set.
    * **`bookmarks.js`**: Manages video bookmarks/timestamps during playback. Handles bookmark creation (via `B` key), displays visual markers on the video timeline, and provides quick navigation to saved timestamps.
    * **`bookmarks-library.js`**: Provides a comprehensive bookmark management interface accessible via Custom Tabs. Allows users to view all bookmarks across movies and TV shows, cleanup orphaned bookmarks, detect duplicates, and adjust time offsets for synced bookmarks.
    * **`config.js`**: Manages all settings, both from the plugin backend and the user's local storage. It initializes and holds shared variables and configurations that other components access.
    * **`events.js`**: The active hub of the plugin. It listens for user input (keyboard/mouse), browser events (tab switching), and DOM changes to trigger the appropriate functions from other components.
    * **`features.js`**: Contains the logic for non-playback enhancements like the random item button, file size display, audio language display, and "Remove from Continue Watching".
    * **`helpers.js`**: Provides utility functions and helper methods used across the enhanced components for common tasks like DOM manipulation and data processing.
    * **`hidden-content.js`**: Powers the Hidden Content feature, letting users hide items from their library, discovery, search, and Continue Watching, and filtering hidden items out of the relevant views.
    * **`hidden-content-custom-tab.js`**: Creates the container element used to surface the hidden-content management view through the CustomTabs plugin.
    * **`hidden-content-page.js`**: Renders the standalone Hidden Content management page (a list of all hidden items with unhide controls).
    * **`icons.js`**: Manages icon selection and rendering logic, allowing users to choose between emoji and Lucide icons throughout the interface.
    * **`osd-rating.js`**: Displays TMDB and Rotten Tomatoes ratings in the video player OSD controls next to the time display.
    * **`pausescreen.js`**: Displays a custom, informative overlay when a video is paused.
    * **`playback.js`**: Centralizes all functions that directly control the video player, such as changing speed, seeking, cycling through tracks, and auto-skip logic.
    * **`subtitles.js`**: Isolates all logic related to subtitle styling, including presets and the function that applies styles to the video player.
    * **`tag-pipeline.js`**: Coordinates the poster-tag modules (quality/genre/language/rating/people), batching item lookups and orchestrating when each tag type renders on cards.
    * **`themer.js`**: Handles theme detection and applies appropriate styling to the Enhanced Panel based on the active Jellyfin theme.
    * **`translations.js`**: Loads and caches the locale files and exposes the translation lookup helpers used across the client scripts.
    * **`ui.js`**: Responsible for creating, injecting, and managing all visual elements like the main settings panel, toast notifications, and various buttons.

* **`/elsewhere/`**: Contains scripts for discovering media on other streaming services and reviews.
    * **`elsewhere.js`**: Powers the "Jellyfin Elsewhere" feature for finding media on other streaming services.
    * **`reviews.js`**: Adds a section for TMDB user reviews on item detail pages.

* **`/extras/`**: Contains optional personal scripts that extend functionality with additional features.
    * **`active-streams.js`**: Surfaces currently active playback sessions to administrators and provides controls to broadcast messages to streaming users.
    * **`colored-activity-icons.js`**: Replaces default activity icons with Material Design icons and applies custom colors for better visual distinction.
    * **`colored-ratings.js`**: Applies color-coded backgrounds to media ratings on item detail pages based on rating type and value.
    * **`login-image.js`**: Displays user profile images instead of text on manual login page
    * **`plugin-icons.js`**: Replaces default plugin icons with custom Material Design icons on the dashboard for improved aesthetics and also adds the ability to add custom plugin config page links
    * **`theme-selector.js`**: Provides options to quickly choose from a Jellyfish color palette and an option to load a random theme everyday.

* **`/jellyseerr/`**: This directory contains all components related to the Seerr integration.
    * **`api.js`**: Handles all direct communication with the Seerr proxy endpoints on the Jellyfin server.
    * **`collection-discovery.js`**: Provides collection-based browsing, letting users explore and request the members of a TMDB collection through Seerr.
    * **`discovery-filter-utils.js`**: Provides shared utility functions for all discovery modules, including content type filtering (TV/Movies/All), pagination management, card creation with deduplication, and infinite scroll handling. Manages filter state persistence via localStorage.
    * **`genre-discovery.js`**: Provides genre-based media discovery with TV/Movies/All content type filtering, allowing users to browse and request content filtered by specific genres from Seerr with separate pagination tracking per content type.
    * **`hss-discovery-handler.js`**: Wires the discovery modules into the home-screen/seamless-scroll experience, deciding which discovery handler runs for a given row or view.
    * **`issue-reporter.js`**: Provides the issue reporting interface for Seerr, allowing users to report problems with media items directly from Jellyfin.
    * **`item-details.js`**: Manages Seerr-specific details displayed on item detail pages, including request status, availability information, similar and recommended content with library/rejected item exclusion options.
    * **`jellyseerr.js`**: The main controller for the integration, orchestrating the other components and managing state.
    * **`modal.js`**: A dedicated component for creating and managing the advanced request modals.
    * **`more-info-modal.js`**: Displays detailed information about media items from Seerr, including cast, crew, and extended metadata.
    * **`network-discovery.js`**: Enables network-based discovery with TV/Movies/All filtering, allowing users to browse content from specific TV networks or streaming services available in Seerr with separate pagination per content type.
    * **`person-discovery.js`**: Facilitates person-based discovery with TV/Movies/All filtering, letting users explore media featuring specific actors, directors, or crew members from Seerr with independent pagination tracking.
    * **`request-manager.js`**: Provides centralized request management with concurrency control (max 6 concurrent requests), automatic retry logic (3 attempts with exponential backoff), response caching (5-minute TTL), request deduplication, and AbortController support for cancellation.
    * **`seamless-scroll.js`**: Implements enhanced infinite scroll with prefetch (~2 viewport heights), deduplication, exponential backoff retry logic, and scroll event fallback. Provides reusable utilities for all discovery modules.
    * **`seerr-status.js`**: Tracks and surfaces the connection/availability status of the configured Seerr instance for the client scripts.
    * **`tag-discovery.js`**: Implements tag-based content discovery with TV/Movies/All filtering, enabling users to find and request media based on custom tags and categories in Seerr with separate page tracking per content type.
    * **`ui.js`**: Manages all visual elements of the integration, like result cards, request buttons, and status icons.

* **`/arr/`**: Contains components for Sonarr and Radarr integration.
    * **`arr-links.js`**: Adds convenient links to Sonarr, Radarr, and Bazarr on item detail pages only for administrators.
    * **`arr-tag-links.js`**: Displays synced *arr tags as clickable links on item detail pages, with advanced filtering options to show only specific tags or hide unwanted ones.
    * **`calendar-page.js`**: Adds a calendar button in the sidebar which opens a view that shows the calendar of upcoming items from Radarr and Sonarr
    * **`calendar-custom-tab.js`**: Creates `<div class="jellyfinenhanced calendar"></div>` for CustomTabs plugin
    * **`requests-page.js`**: Adds a Requests button in the sidebar which opens a view that shows requests and download status from the arrs and Seerr
    * **`requests-custom-tab.js`**: Creates `<div class="jellyfinenhanced requests"></div>` for CustomTabs plugin

* **`/tags/`**: Contains components for displaying various tag information directly on media posters.
    * **`genretags.js`**: Manages the display of media genre information as tags directly on the posters.
    * **`languagetags.js`**: Manages the display of audio language information as flag icons directly on the posters.
    * **`peopletags.js`**: Displays age and birthplace information for cast members with country flags, deceased indicators, and caching. Works with both regular cast and guest cast sections.
    * **`qualitytags.js`**: Manages the display of media quality information (like 4K, HDR, and Atmos) as tags directly on the posters.
    * **`ratingtags.js`**: Manages the display of TMDB and Rotten Tomatoes ratings as badges directly on the posters.
    * **`userreviewtags.js`**: Displays an indicator on posters for items the user has written a review for.

* **`/others/`**: Contains miscellaneous utility scripts.
    * **`letterboxd-links.js`**: Adds Letterboxd external links to movie item detail pages.
    * **`splashscreen.js`**: Manages the custom splash screen that appears when the application is loading.

### Backend Overview

The C# backend is responsible for serving the client scripts, exposing the plugin's internal API, running background work, and persisting per-user data.

* **`Configuration/`**: Plugin and per-user configuration models, the config-page assets (`configPage.html`/`configPage.css`), and `UserConfigurationManager` which reads/writes per-user JSON files.
* **`Controllers/`**: `JellyfinEnhancedController.cs`, the single API controller routed under `/JellyfinEnhanced` that backs every feature (see the [API reference](api.md)).
* **`EventHandlers/`**: Jellyfin event subscribers, e.g. `ContinueWatchingPlaybackEvents` for Continue Watching behaviour.
* **`Extensions/`**: Extension methods over Jellyfin core services (item repository, DB context, user manager).
* **`Helpers/`**: Shared helpers, including the `Jellyseerr/` subfolder for Seerr HTTP, permission, and user-import logic.
* **`Model/`**: Data models, with `Arr/` (Sonarr/Radarr instances and items) and `Jellyseerr/` (Seerr users and permissions) subfolders.
* **`PluginPages/`**: Standalone HTML pages registered with Jellyfin (Bookmarks, Calendar, Downloads, Hidden Content).
* **`ScheduledTasks/`**: Background tasks such as *arr tag sync, tag-cache building, translation-cache clearing, and Seerr watchlist/user-import syncing.
* **`Services/`**: Long-running and on-demand services, including the Sonarr/Radarr clients, auto-request monitors, tag-cache services, maintenance mode, and the hidden-content response filter.
