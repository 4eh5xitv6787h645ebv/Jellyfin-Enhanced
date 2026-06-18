# Elsewhere Integration

Discover where your media is available to stream across multiple regions and platforms, and add community and user reviews directly to item detail pages.

![Elsewhere](../images/elsewhere.png)

## Overview

The **Elsewhere** tab brings together three related features, all powered by [The Movie Database (TMDB)](https://www.themoviedb.org/):

- **Streaming Providers** - find where a movie or show is available to stream, across regions and services.
- **TMDB Reviews** - display community reviews pulled from TMDB on item detail pages.
- **User Reviews** - let your own Jellyfin users write, rate, edit, and delete reviews that are stored on your server.

For setup and configuration of all three, see [Elsewhere Settings](elsewhere-settings.md).

!!! note "One shared TMDB API key"
    Streaming Providers, TMDB Reviews, and Seerr's collection/discovery features all use the **same** TMDB API key entered in the Elsewhere tab. Configure it once and every TMDB-backed feature can use it.

---

## Streaming Provider Lookup

When enabled, an Elsewhere panel is added to movie and TV show detail pages showing where the title can be streamed. Provider data comes from TMDB's watch-provider data (sourced from JustWatch).

**Features:**

- **Auto-loaded default region** - on opening a detail page, availability for your default region is fetched and shown automatically.
- **Provider badges** - each streaming service appears as a badge with its logo and name.
- **JustWatch link** - the panel title links out to the matching JustWatch page for the region.
- **Multi-region search** - use the search button to look up availability across several countries at once. Regions with no matching providers are listed together so you can see what is *not* available.
- **Per-user region & provider settings** - each user can open the settings (gear) icon on the panel to choose their primary region, add extra search regions, and restrict results to specific providers. These preferences are saved per user.
- **Provider filtering** - admins can set a default provider allow-list and an ignore list (with regex support) so only relevant services show.
- **Custom branding** - replace the panel text and icon when a title is not available anywhere, e.g. to highlight content exclusive to your server.

### What is displayed

- **Provider logos and names** - the streaming services where the content is available to stream (flatrate/subscription).
- **Region heading** - "Available in <Region>" linking to JustWatch, or a "not available" message / your custom branding when nothing matches.
- **Multi-region results** - separate result cards per searched region, plus a combined notice for unavailable regions.

!!! note
    Streaming availability uses the subscription ("flatrate") tier from TMDB. Rental- and purchase-only listings are not shown.

---

## TMDB Reviews

Display community reviews from TMDB on movie and TV show detail pages.

![TMDB Reviews](../images/tmdb-reviews.png)

**Features:**

- Full review text with author name and review date.
- Author rating shown as a star chip when the reviewer provided one.
- **Markdown rendering** - review text is rendered with formatting (see [Markdown support](#markdown-support) below).
- **Expand / collapse** - long reviews are truncated with a "Read more" / "Read less" toggle.
- Reviews are shown in a horizontally swipeable row alongside any user reviews.

!!! note
    Up to the **first 10** TMDB reviews are shown for an item. TMDB reviews are only fetched for top-level movies and series, not for individual seasons or episodes.

**Requirements:**

- **Show TMDB Reviews** enabled in the Elsewhere tab.
- A valid **TMDB API Key** configured (the same key used by Streaming Providers).

---

## User Reviews

Your Jellyfin users can write their own reviews and ratings for any movie, series, season, or episode. Reviews are stored on your server and are visible to all users. This feature is **independent** of Elsewhere streaming and TMDB Reviews - it only requires **Enable User Written Reviews**.

![User reviews section on an item detail page](../images/user-reviews.png)

### Writing and rating

- Click **Write a Review** in the reviews section to open an inline form.
- Give a **star rating** from 1 to 5 (optional, with a clear button to remove it).
- Write review text up to **2000 characters** (a live character counter is shown). Either a rating or text is required to submit.
- User reviews are rendered with a distinct (green) border and show the author's avatar and name.

### Editing and deleting your own review

- Each user may have **one review per item**. The "Write a Review" button is hidden once you have a review for that item.
- Use the **edit** (pencil) button on your own review to change the text or rating.
- Use the **delete** (trash) button on your own review to remove it. A confirmation dialog is shown first.

### Admin moderation

- Administrators see a **delete** button on *other users'* reviews for moderation.
- Deleting another user's review shows a confirmation dialog labelled as an admin delete and naming the affected user, warning that the action cannot be undone.
- If a delete fails (for example the review was already removed), the admin is shown an error message and the list is refreshed to reflect the true current state.

### Seasons and episodes

User reviews are supported not only for movies and series but also for individual **seasons** and **episodes**. Reviews are keyed by TMDB ID using a `tmdbId:s{season}` form for seasons and `tmdbId:s{season}:e{episode}` for episodes, so a review you leave on one episode stays scoped to that episode.

### Average rating chip

- When at least one user has rated an item, an average-rating chip is shown next to the TMDB / Rotten Tomatoes rating chips on the detail page, marked with a pink `person_heart` icon.
- Ratings are stored on a 1-5 scale and displayed **out of 10** (the average is multiplied by 2), matching the scale of other rating chips.
- The same average can also appear as a poster tag on library cards. The poster chip additionally requires the user to have **Rating Tags** enabled (see [Enhanced Features → Rating Tags](../enhanced/enhanced-features.md#rating-tags)) and **Show average user rating on poster cards** enabled in the Elsewhere tab.

### Markdown support

Both TMDB reviews and user reviews render a safe subset of Markdown. Raw HTML in review text is escaped first, so formatting cannot be used to inject markup. Supported syntax:

- **Bold** - `**text**` or `__text__`
- *Italic* - `*text*` or `_text_`
- ~~Strikethrough~~ - `~~text~~`
- `Inline code` - `` `code` ``
- Links - `[text](https://...)` (only `http`/`https` links are linkified; plain URLs are auto-linked)
- Blockquotes - lines beginning with `>`
- Lists - lines beginning with `-` or `*`
- Headings - `#` through `######`
- Horizontal rules - `---` or `***`

### Expand / collapse default

The reviews section is a collapsible panel. Admins can choose whether it opens expanded by default via **Expand reviews by default** in the Elsewhere tab; each user's own expand/collapse choice is then remembered for future pages.

**Requirements:**

- **Enable User Written Reviews** in the Elsewhere tab. No TMDB API key is needed for user reviews.
