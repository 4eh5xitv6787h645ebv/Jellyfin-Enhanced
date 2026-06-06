# Other Settings

Settings for custom branding, icon styles, extras, timeouts, and more — all found under the **Other Settings** tab in the plugin configuration page (**Dashboard** → **Plugins** → **Jellyfin Enhanced** → **Other Settings**).

---

## Client Refresh

Push configuration changes to connected web clients without asking everyone to refresh manually. When you save a real change on the plugin config page, the server bumps an internal config revision; clients poll for it and react according to the mode you pick. Clients that are offline catch up the next time they open Jellyfin.

| Setting | Description |
|---|---|
| **Refresh behaviour** | `Off` (never check), `Automatic` (reload quietly when idle and safe — **default**), `Semi-automatic` (persistent notice + reload when the user goes Home), `Notify only` (persistent notice with a Refresh button, never reloads automatically) |
| **Check for changes every** | Poll interval in seconds (5–3600, default 5). Clients also re-check the instant they're brought back to the foreground, so a backgrounded phone catches up immediately on wake |
| **Consider the user idle after** | Automatic mode only reloads in the background after this much inactivity (default 10s) |
| **Only auto-reload on the Home screen** | Restricts Automatic reloads to the Home screen (default off — Automatic mode may reload on any safe page) |
| **Never refresh while media is playing or paused** | Strongly recommended (default on). Paused media counts as protected; the video player page itself is never auto-reloaded |
| **Wait before reloading** | Grace period so several quick saves collapse into one reload (default 5s) |
| **Notice text** | Optional custom text for the persistent notice |
| **Show a "Refresh now" button** | Adds a manual refresh button to the notice (Notify-only mode always shows it) |

!!! note "Web clients only"
    This feature applies to Jellyfin Web (browsers, the web view inside desktop shells, and the web-view Android mobile app). Native apps (Android TV, iOS, Roku, …) don't run plugin web scripts and are unaffected.

!!! tip "Force works even when the mode is Off"
    The **Force all clients to refresh** button always reaches every connected web client — even ones whose mode is *Off* — because the lightweight version poll runs regardless of mode (only the *automatic* refresh-on-config-change is gated by the mode). A backgrounded or sleeping client (e.g. a phone) reloads the moment it's brought back to the foreground.

## Custom Branding

Upload your own logos, banners, and favicon to personalize your Jellyfin instance.

!!! info "How it is applied"
    Uploaded images are stored and served by Jellyfin Enhanced itself and applied to web clients at runtime — no extra plugin required. The installed-PWA / home-screen app icon (from Jellyfin's web manifest) and native app icons cannot be replaced this way; the optional [File Transformation plugin](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) additionally rewrites the stock asset files at request time if you want that coverage.

| Setting | Description |
|---|---|
| **Icon Transparent** | Header logo shown in the Jellyfin top bar (PNG or SVG, transparent background recommended) |
| **Banner Light** | Splash image shown on the dark-theme login screen |
| **Banner Dark** | Splash image shown on the light-theme login screen |
| **Favicon** | Browser tab icon |

Files are stored in:
```text
/plugins/configurations/Jellyfin.Plugin.JellyfinEnhanced/custom_branding/
```

After saving, do a hard refresh (++ctrl+f5++) to see changes.

---

## Icon Settings

### Use Icons

Enable or disable icons in toasts, settings panel, and other UI elements.

### Icon Style

Choose the icon set used throughout the plugin UI.

| Style | Description |
|---|---|
| **Emoji** | Unicode emoji characters — universal, no loading required |
| **Lucide Icons** | Modern, clean icon set |
| **Material UI Icons** | Google Material Design icons |

---

## Active Streams Widget

Adds a live stream counter icon to the Jellyfin header.

| Setting | Default | Description |
|---|---|---|
| **Active Streams Widget** | Off | Enables the stream counter in the header |
| **Show to all users** | Off | When on, non-admin users see a read-only view (no broadcast, no IP addresses) |

See [Other Features — Active Streams Widget](other-features.md#active-streams-widget) for full details.

---

## Timeout Settings

Controls how long certain UI elements stay visible before auto-closing.

| Setting | Default | Range | Description |
|---|---|---|---|
| **Help Panel Autoclose Delay** | 8000 ms | 0–30000 ms | How long the Enhanced panel stays open before closing automatically. Set to 0 to disable auto-close. |
| **Toast Duration** | 3000 ms | 1000–10000 ms | How long toast notifications are displayed. |

---

## Letterboxd Integration

Adds a Letterboxd external link to movie detail pages.

| Setting | Description |
|---|---|
| **Enable Letterboxd Links** | Shows a Letterboxd icon/link on movie pages |
| **Show as Text** | Displays the link as text instead of an icon |

---

## Splash Screen

Shows a custom image while Jellyfin is loading.

| Setting | Description |
|---|---|
| **Enable Custom Splash Screen** | Enables the custom splash screen |
| **Splash Screen Image URL** | Full URL or relative path to the image. Defaults to `/web/assets/img/banner-light.png` |

---

## Default UI Language

Override the language used by the plugin for all users.

- Leave empty to use each user's Jellyfin profile language.
- Accepts a language code (e.g. `en`, `de`, `fr`).

---

## Cache Management

| Button | Effect |
|---|---|
| **Clear Local Storage** | Forces all connected clients to clear their localStorage on next page load. Use to reset client-side settings or fix corrupted state. |
| **Clear Translation Cache** | Forces all clients to re-fetch the latest translations. Useful after a translation update. |

The **Clear All Client Caches** button in the **Enhanced Settings** tab clears tag caches (quality, genre, language, rating, people) across all clients.
