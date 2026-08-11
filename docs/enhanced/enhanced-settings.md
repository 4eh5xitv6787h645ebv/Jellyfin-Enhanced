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


## Client Refresh

**Dashboard** → **Plugins** → **Jellyfin Enhanced** → **Admin** → **Client Refresh**

Browser tabs and app WebViews that were already open when you updated the plugin, restarted Jellyfin or saved these settings keep running the old bundle until someone reloads them. Client Refresh closes that gap: open clients check the server for a newer build and reload themselves once it is safe to do so, instead of leaving users on stale code until they think to hard-refresh.

!!! tip

    This replaces the "tell everyone to press ++ctrl+f5++ after an update" routine. If you would rather keep that routine, set the mode to **Disabled**.

### Mode

**When an open client needs a fresh page** decides how far the plugin may go on the user's behalf.

| Mode | Behaviour |
|---|---|
| **Smart** *(default)* | Reloads any page that is safe to reload, once the user has been inactive for the delay below. |
| **Home only** | Never reloads any other page — the pending refresh waits until the client navigates back to Home. |
| **Ask** | Never reloads by itself. Shows a notice with **Reload** and **Dismiss**, and leaves the decision to the user. |
| **Disabled** | The plugin does not react to updates at all. Users refresh manually. |

### Update sources

Each toggle controls one thing a client will react to. All three are **on** by default.

| Toggle | Fires when |
|---|---|
| **Refresh when Jellyfin Enhanced is updated** | The installed plugin changes. A content hash is compared, so same-version rebuilds and hotfix re-uploads count too. |
| **Refresh after Jellyfin restarts or updates** | A new server process is seen — including a same-version restart. |
| **Refresh when these admin settings change** | This configuration page is saved, so a settings change reaches open clients without waiting for each user to reload. |

### Notices

**Show refresh notices to users** *(default: on)* shows the reload/wait message with **Reload** and **Dismiss** actions.

!!! note

    Turning notices off does not turn refreshing off. Automatic, Home-only and admin-requested refreshes still happen, silently. In **Ask** mode with notices off, a pending refresh simply waits for the next manual page reload.

### Timing

| Setting | Default | Range | Description |
|---|---|---|---|
| **Visible-session check interval (seconds)** | 30 | 5–3600 | How often a *visible* client asks the server whether a newer build exists. Inactive or backgrounded clients do not poll at all — they check immediately when reopened, focused or resumed. |
| **Smart-mode inactivity delay (seconds)** | 5 | 0–300 | How long to wait after the user's most recent interaction before performing a safe automatic reload. |

### Refresh all open clients now

The **Refresh all open clients now** button signals every open client to reload at its next safe point — useful after a manual DLL swap, or any change the automatic sources cannot see.

Nothing is interrupted: clients with active or paused playback wait their turn. Visible clients react within the check interval above; backgrounded clients react when they are reopened. The signal is not persisted; a pending force refresh does not survive a server restart. (With **Refresh after Jellyfin restarts or updates** enabled — the default — a restart refreshes clients on its own anyway.)

### How it stays safe

A pending refresh is held back — never cancelled — until the page is genuinely idle. In every mode, a client will not reload while:

- media is playing or paused, in the player route, in fullscreen, or via an active media session
- a dialog is open
- the user is on a settings or editing page
- a text field or other editor is focused
- the user interacted more recently than the inactivity delay

Reloads are also capped at **3 per minute** per client. If that cap is hit, the client tells the user and pauses automatic reloads for a minute before checking again — so a bad state is throttled to a crawl instead of turning into a rapid reload loop. You can always reload manually straight away.
