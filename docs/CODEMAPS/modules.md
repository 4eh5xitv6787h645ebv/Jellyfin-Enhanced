# Jellyfin-Enhanced Module Map

## File Inventory (by size — optimization priority)

### Largest Files (>1000 lines)
| File | Lines | KB | Key Functions |
|------|-------|----|---------------|
| `jellyseerr/ui.js` | 2353 | 135 | Discovery page rendering, card creation, filters |
| `jellyseerr/more-info-modal.js` | 2440 | 119 | Media detail modal with cast, reviews, similar |
| `arr/calendar-page.js` | 2880 | 89 | Calendar view with date nav, filtering, events |
| `enhanced/hidden-content.js` | 2070 | 83 | Hidden content system, per-item hide/show |
| `arr/requests-page.js` | 2296 | 78 | Sonarr/Radarr requests dashboard |
| `enhanced/bookmarks-library.js` | 2309 | 75 | Bookmark management UI |
| `enhanced/hidden-content-page.js` | 1523 | 50 | Hidden content management page |
| `elsewhere/elsewhere.js` | 1157 | 49 | Streaming availability checker |
| `tags/qualitytags.js` | 1091 | 48 | Resolution/codec quality tags |
| `jellyseerr/api.js` | ~1000 | 33 | Jellyseerr API communication layer |

### Medium Files (200-1000 lines)
| File | Lines | KB | Purpose |
|------|-------|----|---------|
| `enhanced/ui.js` | 1878 | 133 | Settings panel, toast system |
| `enhanced/playback.js` | ~800 | — | Custom playback controls |
| `enhanced/events.js` | ~600 | — | Event system, keyboard handling |
| `enhanced/config.js` | ~400 | — | Settings merging |
| `enhanced/themer.js` | ~500 | — | Theme management |
| `tags/ratingtags.js` | ~650 | — | Content rating tags |
| `tags/genretags.js` | ~500 | — | Genre tags |
| `tags/languagetags.js` | ~400 | — | Language/audio tags |
| `tags/peopletags.js` | ~400 | — | People/cast tags |
| `jellyseerr/jellyseerr.js` | ~800 | — | Jellyseerr core integration |
| `jellyseerr/request-manager.js` | ~600 | — | HTTP request infrastructure |
| `jellyseerr/seamless-scroll.js` | ~500 | — | Infinite scroll engine |
| `jellyseerr/item-details.js` | ~600 | — | Item detail page integration |

### Small Files (<200 lines)
| File | Purpose |
|------|---------|
| `enhanced/helpers.js` | Page-view hooks, observer registry |
| `enhanced/icons.js` | Icon rendering |
| `enhanced/translations.js` | i18n system |
| `enhanced/features.js` | Feature flags |
| `enhanced/subtitles.js` | Subtitle customization |
| `enhanced/bookmarks.js` | Bookmark playback integration |
| `enhanced/osd-rating.js` | OSD rating display |
| `enhanced/pausescreen.js` | Pause screen overlay |
| `enhanced/hidden-content-custom-tab.js` | Hidden content nav tab |
| `jellyseerr/modal.js` | Base modal component |
| `jellyseerr/hss-discovery-handler.js` | Discovery page handler |
| `jellyseerr/issue-reporter.js` | Issue reporting |
| `jellyseerr/discovery-filter-utils.js` | Filter utilities |
| `jellyseerr/network-discovery.js` | Network-based discovery |
| `jellyseerr/person-discovery.js` | Person-based discovery |
| `jellyseerr/genre-discovery.js` | Genre-based discovery |
| `jellyseerr/tag-discovery.js` | Tag-based discovery |
| `elsewhere/reviews.js` | TMDB reviews display |
| `arr/arr-links.js` | Arr service links |
| `arr/arr-tag-links.js` | Arr tag links |
| `arr/requests-custom-tab.js` | Requests nav tab |
| `arr/calendar-custom-tab.js` | Calendar nav tab |
| `extras/*.js` | Optional features |
| `others/letterboxd-links.js` | Letterboxd integration |
| `others/splashscreen.js` | Splash/loading screen |

## Observer Pattern Usage (Performance Hot Spots)

These files use MutationObserver to watch for DOM changes:
- `tags/qualitytags.js` — Watches card containers for new items
- `tags/genretags.js` — Watches card containers for new items
- `tags/languagetags.js` — Watches card containers for new items
- `tags/peopletags.js` — Watches card containers for new items
- `tags/ratingtags.js` — Watches card containers for new items
- `elsewhere/elsewhere.js` — Watches for media detail pages
- `others/letterboxd-links.js` — Watches for detail page links
- `others/splashscreen.js` — Watches for media bar readiness

## Network Request Patterns

- **Request Manager** (`request-manager.js`): Centralized with:
  - Max 4 concurrent requests, queue max 50
  - Deduplication via in-flight request Map
  - Response cache (5min TTL, max 100 entries)
  - Retry: 3 attempts, exponential backoff, 30s timeout budget
  - AbortController per page context

- **Tag Systems**: Each tag module makes API calls per card item:
  - Quality tags → Jellyfin MediaSources API
  - Genre/language/people tags → Jellyfin item metadata
  - Rating tags → Uses cached data where possible

- **Discovery Pages**: Jellyseerr API via request-manager for media data

## CSS
- `css/ratings.css` — 26KB, rating tag styles
- Inline styles in JS modules for dynamic elements
