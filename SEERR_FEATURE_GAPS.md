# Seerr Feature Gaps -- Implementation Tracker

Features that Seerr/Jellyseerr offers but Jellyfin Enhanced does not yet implement.
Ordered by user value. Skip genre slider blocks per user decision.

---

## 1. Trending / Popular / Upcoming Home Sections

**Status:** NOT STARTED
**Value:** High | **Complexity:** Low
**Source:** Both reviewers

Seerr's discover page shows Trending, Popular Movies, Popular TV, Upcoming Movies, and Upcoming TV as horizontal card rows. JE has no equivalent on the Jellyfin home page.

**Seerr endpoints (already proxied for other uses):**
- `/api/v1/discover/trending` -- mixed trending
- `/api/v1/discover/movies` (default sort = popularity.desc) -- popular movies
- `/api/v1/discover/tv` (default sort = popularity.desc) -- popular TV
- `/api/v1/discover/movies/upcoming` -- upcoming movies
- `/api/v1/discover/tv/upcoming` -- upcoming TV

**Implementation notes:**
- Add new JS module `js/jellyseerr/discover-home.js`
- Inject horizontal card rows into Jellyfin home page (after existing sections)
- Each row: title + horizontal scroll cards with request buttons
- Reuse `JE.jellyseerrUI.createJellyseerrCard()` for card rendering
- Add admin toggles: `JellyseerrShowTrending`, `JellyseerrShowPopular`, `JellyseerrShowUpcoming`
- Add to PluginConfiguration.cs, configPage.html, GetPublicConfig
- Backend: add proxy endpoints for trending and upcoming (discover/movies and discover/tv already exist via genre endpoints but need standalone versions)
- Use the advanced filters panel from discovery-filter-utils on these sections too

---

## 2. Standalone Discover Page

**Status:** NOT STARTED
**Value:** High | **Complexity:** Medium
**Source:** Both reviewers

A dedicated browse/discover page accessible from the sidebar (like Calendar, Requests pages) that combines: Trending, Popular, Upcoming, and optionally custom sliders. This is the Seerr homepage equivalent inside Jellyfin.

**Implementation notes:**
- New page module `js/jellyseerr/discover-page.js` following the existing page pattern (standalone + Plugin Pages + Custom Tabs support)
- Register in `JellyfinEnhanced.cs` GetViews() for Plugin Pages
- Sections: Trending, Popular Movies, Popular TV, Upcoming Movies, Upcoming TV
- Each section has horizontal scroll + "See All" link that expands to full grid with filters
- Reuse discovery-filter-utils for sort/filter controls
- Admin toggle: `JellyseerrShowDiscoverPage`, `JellyseerrDiscoverUsePluginPages`, `JellyseerrDiscoverUseCustomTabs`
- Depends on: Feature 1 (home sections) for the card rendering and endpoints

---

## 3. Person Results in Search

**Status:** NOT STARTED
**Value:** Medium | **Complexity:** Low
**Source:** Codex

JE explicitly filters `mediaType === 'person'` out of Seerr search results (in jellyseerr.js). Seerr search shows people with their photo and known-for credits. Clicking a person in Seerr shows their filmography.

**Implementation notes:**
- In `js/jellyseerr/jellyseerr.js`, stop filtering out person results
- Create a person card variant in `js/jellyseerr/ui.js` (profile photo, name, known-for text)
- On click, navigate to the Jellyfin person page if exists, or open a filmography modal via `JE.jellyseerrMoreInfo` or similar
- May need a person search card CSS style

---

## 4. Request Cancellation

**Status:** NOT STARTED
**Value:** Medium | **Complexity:** Low
**Source:** Both reviewers

Users cannot cancel their own pending requests from within JE. They must go to Seerr's web UI.

**Seerr endpoint:**
- `DELETE /api/v1/request/{requestId}` -- cancel/delete a request

**Implementation notes:**
- Backend: add proxy endpoint `[HttpDelete("jellyseerr/request/{requestId}")]`
- Frontend: add "Cancel Request" button on pending request cards in the Requests page
- Also add cancel option in the more-info modal when viewing a pending request
- Only show for the user's own requests (match `requestedBy.jellyfinUserId` to current user) or for admins

---

## 5. Recently Added Section

**Status:** NOT STARTED
**Value:** Medium | **Complexity:** Low
**Source:** Both reviewers

Show recently added content from Seerr (items that were recently made available after being requested).

**Seerr endpoint:**
- `/api/v1/request?filter=available&sort=modified&take=20` -- recently fulfilled requests

**Implementation notes:**
- Could be a row on the home page or the discover page
- Show items that recently transitioned to "available" status
- Cards link to the Jellyfin library item if available
- Admin toggle: `JellyseerrShowRecentlyAdded`

---

## 6. Episode-Level Requests

**Status:** NOT STARTED
**Value:** Medium | **Complexity:** Medium
**Source:** Codex

JE supports season-level requests but not individual episode requests. Seerr allows requesting specific episodes within a season.

**Implementation notes:**
- Modify the season selection modal in `js/jellyseerr/ui.js` (showSeasonSelectionModal)
- Add expandable episode list within each season
- Episode checkboxes for granular selection
- Backend may already support this via the existing request endpoint (episodes array in request body)
- Check Seerr API: `POST /api/v1/request` with `seasons[].episodes[]`

---

## 7. Watchlist Browsing

**Status:** NOT STARTED
**Value:** Medium | **Complexity:** Low-Medium
**Source:** Both reviewers

JE syncs Seerr watchlist to Jellyfin but doesn't let users browse or manage their Seerr watchlist within Jellyfin.

**Seerr endpoints:**
- `GET /api/v1/user/{userId}/watchlist` -- get watchlist
- Already partially proxied for sync

**Implementation notes:**
- Add a "Watchlist" section to the Requests/Downloads page or the Discover page
- Show watchlist items as cards with request buttons
- Allow removing items from watchlist (if Seerr API supports it)
- Could also be a standalone page or Custom Tab

---

## 8. Request Quota Display

**Status:** NOT STARTED
**Value:** Low-Medium | **Complexity:** Low
**Source:** Codex

Seerr shows "X requests remaining" in its request modal. JE doesn't display quota info before submitting a request.

**Seerr endpoint:**
- User quota info is in the user object: `GET /api/v1/user/{userId}` returns `movieQuotaLimit`, `movieQuotaDays`, `tvQuotaLimit`, `tvQuotaDays`, and current usage

**Implementation notes:**
- Fetch user quota info when opening a request modal
- Display "X of Y requests remaining (resets in Z days)" text
- Show warning styling when quota is low
- Disable request button when quota is 0

---

## 9. Custom Discover Sliders

**Status:** NOT STARTED
**Value:** Medium | **Complexity:** Medium
**Source:** Codex

Seerr admins can create custom discover sliders (by keyword, genre, studio, network, search query, or watch provider). JE doesn't expose these.

**Seerr endpoint:**
- `GET /api/v1/discover/slider` -- returns configured custom sliders
- Each slider has a type, title, and data endpoint

**Implementation notes:**
- Backend: add proxy endpoint for `/api/v1/discover/slider`
- Frontend: fetch slider config and render each as a horizontal card row
- Would go on the Discover page (Feature 2)
- Respects admin configuration from Seerr

---

## 10. Admin Request Actions

**Status:** NOT STARTED
**Value:** Medium (admin-only) | **Complexity:** Medium
**Source:** Both reviewers

Admin users cannot approve, decline, or edit requests from within JE. They must use Seerr's web UI.

**Seerr endpoints:**
- `POST /api/v1/request/{requestId}/approve` -- approve
- `POST /api/v1/request/{requestId}/decline` -- decline
- `PUT /api/v1/request/{requestId}` -- edit

**Implementation notes:**
- Backend: add proxy endpoints for approve/decline/edit
- Frontend: add approve/decline buttons on request cards in the Requests page (admin-only)
- Add edit capability (change quality profile, root folder)
- Only visible to admin users

---

## 11. Issue Management Actions

**Status:** NOT STARTED
**Value:** Low-Medium (admin-only) | **Complexity:** Medium
**Source:** Both reviewers

JE can create and view issues but cannot update status, add comments, or resolve issues.

**Seerr endpoints:**
- `POST /api/v1/issue/{issueId}/comment` -- add comment
- `POST /api/v1/issue/{issueId}/{status}` -- update status (open/resolved)
- `DELETE /api/v1/issue/{issueId}` -- delete issue

**Implementation notes:**
- Backend: add proxy endpoints for comment, status update, delete
- Frontend: add comment box, resolve/reopen buttons in issue detail view
- Admin can resolve/delete; users can comment on their own issues

---

## 12. Blocklist Filtering

**Status:** NOT STARTED
**Value:** Low | **Complexity:** Low
**Source:** Both reviewers

Config flag `JellyseerrExcludeBlocklistedItems` exists but is not wired up to actually filter results.

**Implementation notes:**
- The flag is already read in `createCardsFragment` in discovery-filter-utils.js (line 414: `if (excludeBlocklistedItems && item.mediaInfo?.status === 6)`)
- Verify this works correctly in search results and all discovery sections
- May just need testing, not new code

---

## Implementation Order (suggested)

**Phase 1 -- Quick wins (low complexity, high value):**
1. Person results in search (Feature 3)
2. Request cancellation (Feature 4)
3. Blocklist filtering verification (Feature 12)
4. Request quota display (Feature 8)

**Phase 2 -- Home sections:**
5. Trending/Popular/Upcoming home sections (Feature 1)
6. Recently Added section (Feature 5)

**Phase 3 -- Full discover experience:**
7. Standalone Discover page (Feature 2)
8. Custom discover sliders (Feature 9)
9. Watchlist browsing (Feature 7)

**Phase 4 -- Request lifecycle:**
10. Episode-level requests (Feature 6)
11. Admin request actions (Feature 10)
12. Issue management actions (Feature 11)
