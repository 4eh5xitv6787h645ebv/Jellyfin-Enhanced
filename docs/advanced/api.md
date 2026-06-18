# Jellyfin Enhanced API

!!! warning "Internal API"

    These endpoints are an **internal API** used by the plugin's own client scripts — they are not a stable, versioned public API and may change between releases without notice.

    Every route lives under `/JellyfinEnhanced/...`. Unless explicitly noted below, all endpoints require **Jellyfin authentication** (an `[Authorize]` attribute), so requests must include a valid token via the `Authorization: MediaBrowser Token="..."` header or the `X-Emby-Token` / `X-Mediabrowser-Token` header. Some actions additionally check that the caller is a Jellyfin **administrator** in code (noted as *admin* below).

The following endpoints are served **without** authentication, because the client needs them before login (script loading, pre-login branding, version cache-busting):

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/script` | Returns the main client script (`js/plugin.js`). |
| `GET` | `/JellyfinEnhanced/js/{**path}` | Serves any bundled client script under `js/`. |
| `GET` | `/JellyfinEnhanced/Configuration/configPage.css` | Serves the config-page stylesheet. |
| `GET` | `/JellyfinEnhanced/version` | Returns the installed plugin version string. |
| `GET` | `/JellyfinEnhanced/public-config` | Public client config. Sensitive Seerr fields are **redacted** for unauthenticated callers; authenticated callers receive the full payload. |
| `GET` | `/JellyfinEnhanced/locales/{lang}.json` | Returns the translation file for a given language code. |

---

## Plugin Info & Scripts

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/version` | Installed plugin version (no auth). |
| `GET` | `/JellyfinEnhanced/script` | Main client script (no auth). |
| `GET` | `/JellyfinEnhanced/js/{**path}` | Any bundled client script (no auth). |
| `GET` | `/JellyfinEnhanced/Configuration/configPage.css` | Config-page stylesheet (no auth). |
| `GET` | `/JellyfinEnhanced/public-config` | Public/client configuration (no auth, partially redacted). |
| `GET` | `/JellyfinEnhanced/private-config` | Full plugin configuration. |
| `GET` | `/JellyfinEnhanced/locales` | List of available locale codes. |
| `GET` | `/JellyfinEnhanced/locales/{lang}.json` | Translation file for a language (no auth). |
| `GET` | `/JellyfinEnhanced/{viewName}` | Serves a registered plugin page/view by name. |

### Get Plugin Version

```bash
curl -X GET \
  "<JELLYFIN_ADDRESS>/JellyfinEnhanced/version"
```

---

## User Settings & Bookmarks

Per-user data is stored on the server as JSON files, one directory per user, under the plugin's configuration directory:

```
<JELLYFIN_PLUGINS_DIR>/configurations/Jellyfin.Plugin.JellyfinEnhanced/{userId}/<file>.json
```

Files include `settings.json`, `shortcuts.json`, `elsewhere.json`, `bookmark.json`, and `hidden-content.json`. In all routes below, `{userId}` must be the authenticated user (the request is authorized against the calling token).

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/user-settings/{userId}/settings.json` | Read the user's Enhanced settings. |
| `POST` | `/JellyfinEnhanced/user-settings/{userId}/settings.json` | Save the user's Enhanced settings. |
| `GET` | `/JellyfinEnhanced/user-settings/{userId}/shortcuts.json` | Read the user's custom keyboard shortcuts. |
| `POST` | `/JellyfinEnhanced/user-settings/{userId}/shortcuts.json` | Save the user's custom keyboard shortcuts. |
| `GET` | `/JellyfinEnhanced/user-settings/{userId}/elsewhere.json` | Read the user's "Elsewhere" region/service settings. |
| `POST` | `/JellyfinEnhanced/user-settings/{userId}/elsewhere.json` | Save the user's "Elsewhere" region/service settings. |
| `GET` | `/JellyfinEnhanced/user-settings/{userId}/bookmark.json` | Read the user's bookmarks. |
| `POST` | `/JellyfinEnhanced/user-settings/{userId}/bookmark.json` | Save the user's bookmarks. |
| `GET` | `/JellyfinEnhanced/user-settings/{userId}/hidden-content.json` | Read the user's hidden-content list and settings. |
| `POST` | `/JellyfinEnhanced/user-settings/{userId}/hidden-content.json` | Save the user's hidden-content list and settings. |
| `POST` | `/JellyfinEnhanced/reset-all-users-settings` | *(admin)* Reset stored settings for all users. |

### Bookmark Data Structure

The `bookmark.json` file has the following shape:

```json
{
  "Bookmarks": {
    "unique-bookmark-id": {
      "itemId": "jellyfin-item-id",
      "tmdbId": "12345",
      "tvdbId": "67890",
      "mediaType": "movie",
      "name": "Item Name",
      "timestamp": 123.45,
      "label": "Epic scene",
      "createdAt": "2026-01-03T12:00:00.000Z",
      "updatedAt": "2026-01-03T12:00:00.000Z",
      "syncedFrom": "original-item-id"
    }
  }
}
```

`mediaType` is `"movie"` or `"tv"`.

#### Get Bookmarks

```http
GET /JellyfinEnhanced/user-settings/{userId}/bookmark.json
Authorization: MediaBrowser Token="{your-api-key}"
```

#### Save Bookmarks

```http
POST /JellyfinEnhanced/user-settings/{userId}/bookmark.json
Authorization: MediaBrowser Token="{your-api-key}"
Content-Type: application/json

{ "Bookmarks": { "...": { } } }
```

---

## Tag Data & Cache

Used by the poster-tag features to read cached quality/metadata efficiently.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/tag-cache/{userId}` | Get cached tag data, optionally only entries newer than `?since=` (epoch). |
| `POST` | `/JellyfinEnhanced/tag-data/{userId}` | Fetch tag data for a batch of item IDs (sent in the request body). |
| `GET` | `/JellyfinEnhanced/file-size/{userId}/{itemId}` | Get the file size for an item. |
| `GET` | `/JellyfinEnhanced/watch-progress/{userId}/{itemId}` | Get the user's watch progress for an item. |
| `GET` | `/JellyfinEnhanced/items/by-providers` | Resolve a Jellyfin item ID from external provider IDs (e.g. TMDB/TVDB). |

---

## Reviews

User-written reviews for TMDB items, stored server-side in a shared `reviews.json`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/reviews/{mediaType}/{tmdbId}` | Get all reviews for an item. |
| `POST` | `/JellyfinEnhanced/reviews/{mediaType}/{tmdbId}` | Create or update the caller's review. |
| `DELETE` | `/JellyfinEnhanced/reviews/{mediaType}/{tmdbId}` | Delete the caller's own review. |
| `DELETE` | `/JellyfinEnhanced/reviews/admin/{userIdN}/{mediaType}/{tmdbId}` | *(admin)* Delete another user's review. |

---

## Hidden Content & Continue Watching

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/JellyfinEnhanced/continue-watching/hide/{itemId}` | Hide an item from Continue Watching. |
| `DELETE` | `/JellyfinEnhanced/continue-watching/hide/{itemId}` | Unhide an item from Continue Watching. |

> The per-user hidden-content list (used by the broader Hidden Content feature) is read/written through the `user-settings/{userId}/hidden-content.json` endpoints above.

---

## Seerr (Jellyseerr / Overseerr)

The plugin proxies requests to a configured Seerr instance. Most read endpoints require the `X-Emby-Token` header; user-scoped endpoints also use `X-Jellyfin-User-Id`.

### Connection & Users

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/jellyseerr/status` | Check connectivity to the configured Seerr URL(s). |
| `GET` | `/JellyfinEnhanced/jellyseerr/validate` | Validate a supplied Seerr URL + API key. |
| `POST` | `/JellyfinEnhanced/jellyseerr/trigger-recently-added-scan` | Trigger a Seerr "recently added" scan. |
| `GET` | `/JellyfinEnhanced/jellyseerr/user-status` | Check whether the current Jellyfin user is linked to a Seerr account. |
| `GET` | `/JellyfinEnhanced/jellyseerr/permission-audit` | Audit Seerr user/permission mapping. |
| `GET` | `/JellyfinEnhanced/jellyseerr/user` | Get the current linked Seerr user. |
| `GET` | `/JellyfinEnhanced/jellyseerr/users` | List Seerr users (`?take=`). |
| `POST` | `/JellyfinEnhanced/jellyseerr/import-users` | *(admin)* Import Jellyfin users into Seerr. |
| `GET` | `/JellyfinEnhanced/jellyseerr/settings/partial-requests` | Read Seerr's partial-requests setting. |

### Search & Requests

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/jellyseerr/search` | Search Seerr (`?query=&page=&language=`). |
| `POST` | `/JellyfinEnhanced/jellyseerr/request` | Submit a media request. |
| `GET` | `/JellyfinEnhanced/jellyseerr/request` | List requests (`?take=&skip=&filter=`). |
| `POST` | `/JellyfinEnhanced/jellyseerr/request/tv/{tmdbId}/seasons` | Request specific TV seasons. |
| `GET` | `/JellyfinEnhanced/jellyseerr/quota` | Get the user's request quota. |
| `GET` | `/JellyfinEnhanced/jellyseerr/overrideRule` | Get Seerr request override rules. |
| `GET` | `/JellyfinEnhanced/jellyseerr/sonarr` | List Seerr-configured Sonarr instances. |
| `GET` | `/JellyfinEnhanced/jellyseerr/radarr` | List Seerr-configured Radarr instances. |
| `GET` | `/JellyfinEnhanced/jellyseerr/{type}/{serverId}` | Get Sonarr/Radarr service details by server ID. |

#### Make a Request

`mediaType` is `tv` or `movie`; `mediaId` is the **TMDB ID**.

```bash
curl -X POST \
  -H "X-Emby-Token: <API_KEY>" \
  -H "X-Jellyfin-User-Id: <USER_ID>" \
  -H "Content-Type: application/json" \
  -d '{"mediaType": "movie", "mediaId": 27205}' \
  "<JELLYFIN_URL>/JellyfinEnhanced/jellyseerr/request"
```

### Media Details

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/jellyseerr/movie/{tmdbId}` | Movie details. |
| `GET` | `/JellyfinEnhanced/jellyseerr/movie/{tmdbId}/similar` | Similar movies (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/movie/{tmdbId}/recommendations` | Recommended movies (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/movie/{tmdbId}/ratingscombined` | Combined movie ratings. |
| `GET` | `/JellyfinEnhanced/jellyseerr/tv/{tmdbId}` | TV show details. |
| `GET` | `/JellyfinEnhanced/jellyseerr/tv/{tmdbId}/season/{seasonNumber}` | TV season details. |
| `GET` | `/JellyfinEnhanced/jellyseerr/tv/{tmdbId}/similar` | Similar TV shows (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/tv/{tmdbId}/recommendations` | Recommended TV shows (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/tv/{tmdbId}/ratings` | TV ratings. |
| `GET` | `/JellyfinEnhanced/jellyseerr/person/{personId}` | Person details. |
| `GET` | `/JellyfinEnhanced/jellyseerr/person/{personId}/combined_credits` | Person's combined credits. |
| `GET` | `/JellyfinEnhanced/jellyseerr/collection/{collectionId}` | Collection details. |

### Discovery

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/jellyseerr/discover/tv/network/{networkId}` | Discover TV by network (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/discover/movies/studio/{studioId}` | Discover movies by studio (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/discover/tv/genre/{genreId}` | Discover TV by genre (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/discover/movies/genre/{genreId}` | Discover movies by genre (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/discover/tv/keyword/{keywordId}` | Discover TV by keyword (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/discover/movies/keyword/{keywordId}` | Discover movies by keyword (`?page=`). |
| `GET` | `/JellyfinEnhanced/jellyseerr/discover/genreslider/movie` | Movie genre slider. |
| `GET` | `/JellyfinEnhanced/jellyseerr/discover/genreslider/tv` | TV genre slider. |

### Issues

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/jellyseerr/issue` | List issues. |
| `GET` | `/JellyfinEnhanced/jellyseerr/issue/{id}` | Get a single issue. |
| `POST` | `/JellyfinEnhanced/jellyseerr/issue` | Report a new issue. |

### Watchlist

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/jellyseerr/watchlist` | Get the user's Seerr watchlist (`?page=`). |
| `POST` | `/JellyfinEnhanced/jellyseerr/sync-watchlist` | Sync the watchlist for the current user. |

---

## TMDB

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/tmdb/validate` | Validate a supplied TMDB API key (`?apiKey=`). |
| `GET` | `/JellyfinEnhanced/tmdb/search/person` | Search people on TMDB (`?query=`). |
| `GET` | `/JellyfinEnhanced/tmdb/search/keyword` | Search keywords on TMDB (`?query=`). |
| `GET` | `/JellyfinEnhanced/tmdb/genres/movie` | TMDB movie genres. |
| `GET` | `/JellyfinEnhanced/tmdb/genres/tv` | TMDB TV genres. |
| `GET` | `/JellyfinEnhanced/tmdb/{**apiPath}` | Generic authenticated TMDB proxy passthrough. |

---

## *arr (Sonarr / Radarr / Bazarr)

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/arr/validate/sonarr` | Validate a Sonarr URL + API key. |
| `GET` | `/JellyfinEnhanced/arr/validate/radarr` | Validate a Radarr URL + API key. |
| `GET` | `/JellyfinEnhanced/arr/identify-url` | Identify which *arr service a URL belongs to. |
| `GET` | `/JellyfinEnhanced/arr/series-slug` | Get a Sonarr series slug for a TVDB ID (`?tvdbId=`). |
| `GET` | `/JellyfinEnhanced/arr/series-slugs` | Get series slugs across instances for a TVDB ID (`?tvdbId=`). |
| `GET` | `/JellyfinEnhanced/arr/movie-instances` | Find Radarr instances holding a movie (`?tmdbId=`). |
| `GET` | `/JellyfinEnhanced/arr/queue` | Get the combined download queue from the *arrs. |
| `GET` | `/JellyfinEnhanced/arr/requests` | List requests/downloads (`?take=&skip=&filter=&userOnly=`). |
| `POST` | `/JellyfinEnhanced/arr/requests/{requestId}/approve` | *(admin)* Approve a request. |
| `POST` | `/JellyfinEnhanced/arr/requests/{requestId}/decline` | *(admin)* Decline a request. |
| `GET` | `/JellyfinEnhanced/arr/calendar` | Get upcoming items (calendar) from Radarr/Sonarr. |
| `POST` | `/JellyfinEnhanced/arr/calendar/user-data` | Get user watch-state data for a batch of calendar events. |

---

## Person / Genre / Studio / Boxset

Jellyfin-library lookups used by the in-app detail/discovery views.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/person/{personId}` | Get person info from the local library (`?itemId=`). |
| `GET` | `/JellyfinEnhanced/genre/{genreId}` | Get genre info. |
| `GET` | `/JellyfinEnhanced/studio/{studioId}` | Get studio info. |
| `GET` | `/JellyfinEnhanced/boxset/{boxsetId}` | Get boxset/collection info. |

---

## Branding

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/JellyfinEnhanced/UploadBrandingImage` | *(admin)* Upload a custom branding image. |
| `GET` | `/JellyfinEnhanced/BrandingImage` | Get a branding image (`?fileName=`). |
| `POST` | `/JellyfinEnhanced/DeleteBrandingImage` | *(admin)* Delete a branding image. |

---

## Active Streams

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/active-streams/sessions` | List active playback sessions. |
| `POST` | `/JellyfinEnhanced/active-streams/broadcast` | Broadcast a message to active sessions. |

---

## Maintenance Mode

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/MaintenanceMode/Status` | Get current maintenance-mode status. |
| `POST` | `/JellyfinEnhanced/MaintenanceMode/Enable` | *(admin)* Enable maintenance mode. |
| `POST` | `/JellyfinEnhanced/MaintenanceMode/Disable` | *(admin)* Disable maintenance mode. |
| `GET` | `/JellyfinEnhanced/MaintenanceMode/Users` | List non-admin users (maintenance targeting). |
| `POST` | `/JellyfinEnhanced/MaintenanceMode/Broadcast` | *(admin)* Broadcast a maintenance message. |

---

## Misc / Proxies

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/JellyfinEnhanced/proxy/avatar` | Proxy a Seerr/external avatar image (`?path=`). |
