# Enhanced Settings — User configuration

## Enhanced Panel

![Enhanced panel — Settings tab overview](../images/enhanced-panel-settings.png)

Access user-configured settings via the Enhanced panel:

| Shortcuts | Settings |
|-----------|----------|
| ![Shortcuts](../images/enhanced-panel-shortcuts.png) | ![Settings](../images/enhanced-panel-settings.png) |

**Open Panel:**

- Click **Jellyfin Enhanced** in sidebar
- Press `?` keyboard shortcut


**Toggleable User Features:**

- Quality Tags
- Genre Tags
- Language Tags
- Rating Tags
- People Tags
- Pause Screen
- Auto-skip Intros
- Auto Picture-in-Picture
- Review tags
- And more...


**Tabs:**

- **Shortcuts** - Customize keyboard shortcuts
- **Settings** - Enable/disable features, adjust positions

**Settings Persistence:**

- Settings saved to browser localStorage
- Per-user configuration
- Sync across devices (same browser profile)


# Enhanced Settings — Admin configuration

## Feature Toggles

Most features can be enabled/disabled individually:

1. Open Enhanced panel
2. Go to the **Settings** tab
3. Toggle features on/off
4. Changes apply immediately *(no restart needed)*


## Tags: Quality, Genre, Language, Rating, People

### Configuration
1. Open Enhanced panel → `Enhanced Settings`
2. Enable and configure tags you want *(Eg: `Quality Tags`)*
3. Adjust position (top-left, top-right, etc.)

!!! tip

    [Custom CSS available](../advanced/css-customization.md#tags)

### Server-Side Tag Cache

By default the server pre-computes tag data for the whole library and serves it to clients in a single request, so tags appear instantly without per-page API calls. The cache is built on first startup, kept up to date by library scan events, and refreshed daily by the **Refresh Tag Cache** scheduled task.

Disabling **Server-Side Tag Cache** (Dashboard → Plugins → Jellyfin Enhanced → Display → Media Tags) switches clients to the legacy per-page batch mode (each client picks this up on its next page load) and completely turns off the server-side cache — it is not loaded, built, or maintained while the setting is off, and the in-memory cache is released immediately.

!!! note "Very large libraries"

    The cache build processes the library in small pages, so server memory use stays bounded even on libraries with tens of thousands of items. If you still prefer not to run a server-side cache, disable the setting — tags keep working via the per-page batch mode.

Turning the setting back on from the dashboard restores the last saved snapshot and catches up on anything that changed while it was off, automatically in the background — no restart or manual task run needed. (Only if you edit the plugin's configuration file by hand instead of using the dashboard: restart the server so the change is picked up, then run the **Refresh Tag Cache** scheduled task to catch up.)

## Awards

Adds a banner to Movie and Series detail pages showing award wins and nominations, which expands into the full breakdown. See [Awards](enhanced-features.md#awards) for what it looks like and where the data comes from.

Configure under **Dashboard** → **Plugins** → **Jellyfin Enhanced** → **Enhanced Settings** → **Awards**.

| Setting | Default | What it does |
| --- | --- | --- |
| **Show Awards** | Off | Master switch. While off, nothing is fetched, stored or rendered. |
| **Show the banner by default** | On | The default for every user. Each user can turn the banner off for themselves in the Enhanced panel → `Settings`. |
| **Awards Appearance** | Native | The default for every user — see below. Each user can pick their own in the Enhanced panel → `Settings`. |
| **Expand awards by default** | Off | Opens the full breakdown automatically instead of showing only the banner. Also overridable per user. |
| **Fetch the award breakdown from Wikidata** | On | Turn off to keep the feature entirely offline — the banner still shows counts from Jellyfin's local OMDb cache, but the expanded list is unavailable. |
| **Awards Cache Duration (days)** | 30 | How long a looked-up result is reused before it is refreshed. |
| **OMDb API Key** | *(blank)* | Optional. Only used for titles Jellyfin has not already cached OMDb data for. |

### Appearance

Two presentations, both showing the same information:

- **Native** *(default)* — the awards are rendered as an ordinary Jellyfin detail section, using the same heading, chips and icons as the rest of the page. It follows whatever theme is applied, and winners are marked with a trophy in the theme's accent colour.
- **Banner** — a standalone bar with its own gradient background and a serif "AWARDS" wordmark, reproducing the look of TMDB's awards banner. It keeps its own colours regardless of theme.

The dashboard setting is the server-wide default. Individual users can override it under **Enhanced panel** → `Settings` → **UI Settings** → **Awards appearance**, which also offers *Use the server default* so they can hand the choice back to the admin at any time.

### Caching and refresh

A title is looked up the first time someone opens its detail page, then stored on the server in `awards-cache.json` alongside the plugin's other configuration. Every later view — by any user, on any device, after any restart — is served from that file.

Three things refresh it:

- The **Refresh Awards Cache** scheduled task runs daily and re-fetches only the records older than the cache duration. Because entries age individually, a large library refreshes a few titles at a time rather than all at once.
- Any user can press **Refresh** in the expanded awards panel to re-fetch that one title — useful right after a ceremony, rather than waiting for the cache duration to elapse. A per-title cooldown means repeated presses do not generate repeated lookups.
- **Clear Awards Cache** on the config page empties it completely, so every title is looked up again on its next view. The button also reports how many titles are cached and how many are due for refresh.

Titles are never looked up in bulk or ahead of time — only what people actually browse ends up in the cache.

!!! note "Do I need an OMDb API key?"

    Almost certainly not. Jellyfin's built-in OMDb metadata provider is enabled by default and already writes the award data to disk as part of its normal metadata fetch; this feature just reads what is already there. A key is only useful for titles Jellyfin has not fetched OMDb data for — those simply fall back to the Wikidata breakdown without one.
