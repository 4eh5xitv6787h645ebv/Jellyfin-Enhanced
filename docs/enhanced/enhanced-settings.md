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

- Quality Tags *(with a **Choose where to show** control — limit the tag to Movies/Shows/Episodes and the Continue Watching / Next Up rows)*
- Genre Tags *(with **Choose where to show**)*
- Language Tags *(with **Choose where to show**)*
- Rating Tags *(with **Choose what to show** — TMDB / Rotten Tomatoes / User rating — and **Choose where to show**)*
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

### Server-wide defaults

In **Dashboard** → **Plugins** → **Jellyfin Enhanced** (the tag settings section), each poster-tag type exposes admin defaults that apply to users who haven't customised them. Users can still override any of these in their personal Enhanced panel — resolution order is **user's own choice → admin default → on**.

- **Default visibility** *(Quality / Genre / Language / Rating)* — which surfaces the tag appears on by default: **Movies**, **Shows**, **Episodes**, **Continue Watching**, **Next Up**. For example, uncheck *Episodes* to stop rating tags appearing on individual episodes server-wide.
- **Default sources** *(Rating)* — which rating sources appear by default: **TMDB rating**, **Rotten Tomatoes**, **User rating**.
- **Hide Tags on Hover** — fade tag overlays while a card's action buttons are showing. Works on both hover (desktop) and tap/focus (touch devices).

All default to **on**, so existing behaviour is unchanged until an admin opts out of something.

!!! tip

    [Custom CSS available](../advanced/css-customization.md#tags)
