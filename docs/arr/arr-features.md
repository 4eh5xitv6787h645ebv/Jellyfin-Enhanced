# ARR Integration

Quick access to Sonarr, Radarr, and Bazarr from Jellyfin, plus calendar and download monitoring.

!!! success "Note"

    ***arr links are only visible to admin users**

    **Other features are visible to all users.**


!!! warning


    **Security Considerations:**

    - **API Keys** are stored securely on server
    - **Network Access** - Ensure *arr instances are secure
    - **HTTPS** - Use HTTPS for remote access

## Features

The ARR integration provides convenient links to your Sonarr, Radarr, and Bazarr instances directly from Jellyfin item pages. Additionally, it can display *arr tags as clickable links and provide calendar and download monitoring pages.

- **Quick Links** - Jump to Sonarr, Radarr, Bazarr pages for any item (admin only)
- **Tag Links** - Display *arr tags as clickable links with filtering
- **Calendar Page** - Upcoming releases from Sonarr/Radarr
- **Requests Page** - Monitor the download queue, plus optional Jellyseerr requests/issues
- **Multi-Instance** - Multiple Sonarr/Radarr servers, each independently enabled

## ARR Links

### Setup

1. Go to **Dashboard** → **Plugins** → **Jellyfin Enhanced**
2. Navigate to the ***arr** tab
3. Check **"Enable *arr Links"**
4. Add one or more Sonarr and/or Radarr instances (see [Multi-Instance Support](#multi-instance-support) below)
5. Optionally add a **Bazarr URL** for subtitle management links
6. Optional: Check **"Show *arr Links as Text"** for text links instead of icons
7. Click **Save**

### Multi-Instance Support

You can configure multiple Sonarr instances and multiple Radarr instances — useful for separate libraries (e.g., TV vs Anime, HD vs 4K).

**Each instance has:**

| Field | Description |
|---|---|
| **Name** | Display name shown in dropdowns (e.g., "TV Shows", "Anime", "4K Movies") |
| **URL** | Base URL of the instance (e.g., `http://192.168.1.100:8989`) |
| **API Key** | API key for authenticating with the instance |
| **URL Mappings** | Optional per-instance URL remapping (see below) |
| **Enabled** | Toggle to disable an instance without deleting it |

**Adding instances:**

1. Open plugin settings → the ***arr** tab
2. Click **"Add Sonarr Instance"** or **"Add Radarr Instance"**
3. Fill in Name, URL, and API Key
4. Click **Save**

**Disabling an instance:**

Toggle the **Enabled** switch off to temporarily disable an instance (e.g., during maintenance). The instance remains in config with its URL and API key intact — re-enable it at any time without re-entering credentials.

**How matching works:**

When you open a movie or series, the backend fans out a lookup to **every enabled instance** of the relevant type:

- **Series** are matched by **TVDB ID** (via `/JellyfinEnhanced/arr/series-slugs`).
- **Movies** are matched by **TMDB ID** (via `/JellyfinEnhanced/arr/movie-instances`).

Only instances that actually contain the item are offered in the link/dropdown — an instance that does not have the series or movie is never shown. If the item has no TVDB/TMDB id, or the lookup fails, no link is rendered (the plugin never guesses).

**How links render:**

- **Single matching instance** — renders as a plain icon link (no badge clutter). Enable **"Show status badge for single-instance"** to also show the status border and episode/file count.
- **Multiple matching instances** — the link becomes a dropdown button (with a ▾ arrow). Click it to see each instance with:
    - A colour-coded status dot
    - Instance name
    - Episode count (Sonarr, e.g. `22/41`) or download status (Radarr: `Downloaded` / `Missing`)
    - File size on disk

| Status | Colour | Meaning |
|---|---|---|
| Complete | Green (`#52b54b`) | All episodes present / movie file downloaded |
| Partial | Amber (`#e5a00d`) | Some episodes missing |
| Missing | Grey (`#666`) | No file present in that instance |

**Calendar and Requests pages** fan out across all enabled instances automatically; disabled instances are skipped everywhere (links, calendar, queue, and tag sync).

### URL Mappings

The *arr link in Jellyfin always points at the *arr instance, but the address that works depends on **how you are accessing Jellyfin** (local network vs. remote / reverse proxy). URL Mappings let you swap the link target based on the current Jellyfin URL.

**Format** — one mapping per line, pipe-separated:

```text
jellyfin_url|arr_url
```

**Example:**
```text
https://jellyfin.example.com|https://sonarr.example.com
http://192.168.1.50:8096|http://192.168.1.100:8989
```

**How matching works:**

1. The plugin reads the current Jellyfin server address.
2. It compares that address (trailing slashes and case ignored) against the `jellyfin_url` side of each mapping line.
3. On the first match, the link uses that line's `arr_url`.
4. If no line matches, the instance's base **URL** is used as the default.

**Precedence:** a per-instance mapping is evaluated against that instance's own URL. For the legacy single-instance setup, the global `SonarrUrlMappings` / `RadarrUrlMappings` / `BazarrUrlMappings` fields are used. Per-instance mappings apply only to their own instance; the global fields apply only to the legacy fallback and to Bazarr.

!!! tip
    A common pattern is to put the **internal** address in the instance **URL** (so the server-side reachability check and tag sync work over the LAN) and add a mapping that redirects the user-facing link to the **public** URL when you browse Jellyfin remotely. This is especially relevant for Bazarr behind an auth proxy (Authentik, Authelia, Cloudflare Access).

### Legacy Single-Instance Fields

The original `SonarrUrl`, `SonarrApiKey`, `RadarrUrl`, and `RadarrApiKey` fields are preserved for downgrade safety. If no instances are configured in the new multi-instance list, the plugin automatically falls back to these legacy fields so existing setups continue working without any migration step.

!!! note
    After adding instances via the new UI, the legacy fields are no longer used for arr links. They remain in config and are not deleted, so downgrading to an older plugin version restores the previous single-instance behaviour.

### Usage

**On Item Detail Pages:**

1. Open any movie or TV show
2. Look for *arr link icons in the external links section
3. Click to open the item in the respective *arr application, or click the dropdown to choose an instance

**Visibility:**

- Only visible to administrators
- Automatically detects item type (movie/TV)
- Shows relevant links only (Sonarr for TV, Radarr for movies)

## ARR Tags

Display synced *arr tags as clickable links on item detail pages.

### Setup

**Prerequisites:**

- One or more Sonarr and/or Radarr instances configured (URL + API key) in the the ***arr** tab — tags are pulled from those instances; there is no separate API-key field for tag sync.

**Configuration:**

1. Go to **Dashboard** → **Plugins** → **Jellyfin Enhanced**
2. Navigate to the ***arr** tab
3. Check **"Enable Tags Sync"**
4. Configure tag settings (see below)
5. Click **Save**
6. Run the sync from **Dashboard** → **Scheduled Tasks** → **"Sync Tags from *arr to Jellyfin"**, and add a schedule trigger so new items are tagged automatically

!!! note "Matching keys"
    Tags are matched to Jellyfin items by external id: **movies** by **TMDB ID** (from Radarr), and **series** by **IMDb ID** (from Sonarr). Items missing the relevant id are skipped.

### Tag Settings

**Tag Prefix:**

- Default: `JE Arr Tag: `
- Prefix added to synced tags
- Helps identify plugin-managed tags

**Clear Old Tags:**

- Remove old plugin-managed tags before syncing
- Keeps tags clean and up-to-date
- Recommended: Enabled

**Show Tags as Links:**

- Display tags as clickable links on item pages
- Click to view all items with that tag
- Recommended: Enabled

### Tag Filtering

All three filter boxes take **one tag name per line** (newline-separated), entered **without** the prefix. Leave a box empty to disable that filter.

**Show as Links Filter** (`Show as Links Filter`):

- One tag name per line; only matching tags are displayed as links
- Leave empty to show all prefixed tags
- Matching is case-insensitive

**Example:**

```text
in-netflix
in-disney
4k-upgrade
```

**Hide Specific Links Filter** (`Hide Specific Links Filter`):

- One tag name per line; matching tags are never displayed as links
- **Takes priority over the Show filter** — a tag listed here is hidden even if it also appears in the Show filter

**Example:**
```text
internal-tag
do-not-show
```

**Sync to Jellyfin Filter** (`Sync to Jellyfin Filter`):

- Restricts which tags are synced from *arr into Jellyfin (without the prefix)
- Leave empty to sync all tags

!!! warning "Separator differs from the Show/Hide filters"
    Although the field's placeholder reads *"One per line"*, the server-side sync task splits this list on **commas or semicolons** — not on line breaks. Enter the tag names separated by commas, e.g. `anime, 4k-upgrade, kids`. (The **Show**/**Hide** filters above are different: they are applied when rendering tag links in the browser and are split on **line breaks**, one tag per line.)

### Custom Styling

Customize tag link appearance with CSS.

**Example - Rename Tag:**
```css
/* Hide original label */
.itemExternalLinks a.arr-tag-link[data-tag-name="1 - n00bcodr"] .arr-tag-link-text {
  display: none !important;
}

/* Add custom label */
.itemExternalLinks a.arr-tag-link[data-tag-name="1 - n00bcodr"]::after {
  content: " N00bCodr";
}
```

**Example - Hide Specific Tag:**
```css
.itemExternalLinks a.arr-tag-link[data-id="in-netflix"] {
  display: none !important;
}
```

**Example - Service Colors:**
```css
.itemExternalLinks a.arr-tag-link[data-id="in-netflix"] {
  background: #d81f26;
  color: #fff;
}
```

See README for more CSS examples.

## Calendar Page

![Calendar page showing upcoming Sonarr and Radarr releases](../images/calendar-page.png)

View upcoming releases from Sonarr and Radarr in a calendar interface.

### Setup

1. Go to **Dashboard** → **Plugins** → **Jellyfin Enhanced**
2. Navigate to the **Pages** tab (the Calendar and Requests pages live here; the *arr instances and tags live in the **\*arr** tab)
3. Check **"Enable Calendar Page"**
4. Choose integration method:
   - **Use Plugin Pages** - Adds sidebar link (requires [Plugin Pages](https://github.com/IAmParadox27/jellyfin-plugin-pages) plugin)
   - **Use Custom Tabs** - Adds custom tab (requires [Custom Tabs](https://github.com/IAmParadox27/jellyfin-plugin-custom-tabs) plugin)
5. Configure calendar settings (see below)
6. Click **Save**
7. Restart Jellyfin if using Plugin Pages

### Calendar Settings

These are configured in the ***arr Settings** (Calendar Page) section. See [Calendar Page Settings](arr-settings.md#calendar-page-settings) for the full table.

**First Day of Week:**

- Any day Sunday–Saturday (default: **Monday**)
- Sets which day appears as the first column of the grid

**Time Format:**

- `5pm/5:30pm` — 12-hour format (default)
- `17:00/17:30` — 24-hour format

**Highlight Favorites/Watchlist:**

- Shows a golden border on calendar entries for items in your Jellyfin favorites
- Also adds a **Watchlist** filter chip to the legend

**Highlight Watched Series:**

- Shows a border on entries for series you have watched episodes from
- Also adds a **Watched** filter chip to the legend

**Filter by Library Access:**

- When enabled (default), the calendar only shows items from libraries the user can access. Upcoming items not yet in Jellyfin are filtered by their Sonarr/Radarr root folder.
- This is what makes the calendar safe for non-admin users — each user only sees events they are permitted to see.

**Show Requested Only (Default):**

- Calendar loads showing only items requested through Jellyseerr, but the user can still change filters
- Requires Jellyseerr to be enabled in the **Seerr** tab

**Force Only Requested Items:**

- Calendar always shows only requested items and the **Requests** filter chip is hidden (the user cannot turn it off)
- Also requires Jellyseerr to be enabled

### Usage

**Access Calendar:**

- Click "Calendar" in sidebar (Plugin Pages)
- Navigate to custom tab (Custom Tabs)
- Direct URL hash route: `#/calendar`

**Views:**

- **Day**, **Week**, **Month**, and **Agenda** (default)
- For non-Agenda views, choose a display mode: **List**, **Backdrop**, or **Cards**

**In-page filters and controls:**

- Filter chips by event type: **Cinema Release**, **Digital Release**, **Physical Release**, **Episode**, and **Available** (item already downloaded)
- **Requests** chip — shown only when Jellyseerr is enabled and "Force Only Requested" is off
- **Watchlist** / **Watched** chips — shown only when the corresponding highlight setting is on
- **Filter match mode** — combine selected chips with **OR** or **AND** (enabled once two or more chips are selected), plus a **NOT** button to invert the match
- **Unmonitored toggle** — show or hide unmonitored items (off by default; preference saved in the browser)
- **Search** to filter events by title
- Click any event to open the item's detail page

---

## Downloads Page

![Downloads page showing active Sonarr/Radarr queue](../images/downloads-page.png)

Monitor the active Sonarr/Radarr download queue — and, optionally, Jellyseerr requests and issues — on a single page (labelled **Requests** in the navigation).

### Features

- **Download queue** fanned out across all enabled Sonarr/Radarr instances, grouped by instance
- **Progress bars**, **ETA**, **status** (Downloading, Queued, Paused, Importing, Completed, Warning, Failed, Unknown), quality, and **downloaded / total size**
- **Status tabs**: All, Downloading, Queued, Paused, Importing, Completed, Warning, Failed, Unknown
- **Search** by title or instance name
- **Auto-refresh** with a configurable poll interval (paused automatically while the page/tab is hidden)
- Optional **Jellyseerr Requests** section (tabs: All, Pending Approval, Processing, Coming Soon, Available)
- Optional **Jellyseerr Issues** section (tabs: Open, Resolved)

### Setup

1. Go to **Dashboard** → **Plugins** → **Jellyfin Enhanced**
2. Navigate to the **Pages** tab
3. Check **"Enable Requests Page"**
4. To show the *arr download queue, check **"Show Downloads in Requests Page"** (requires *arr links and API keys configured)
5. Optionally check **"Show Seerr Issues Section"** (requires Jellyseerr enabled)
6. Choose integration method (Plugin Pages or Custom Tabs)
7. Click **Save** and restart Jellyfin if using Plugin Pages

Direct URL hash route: `#/downloads`

!!! note "Who sees what"
    With **"Filter Downloads by User Requests"** enabled (default), non-admin users only see downloads for content **they** requested. Disable it to let all authenticated users see the entire queue. The Jellyseerr Requests and Issues sections only appear when Jellyseerr is enabled in the **Seerr** tab.