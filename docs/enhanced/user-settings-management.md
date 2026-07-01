# User Settings Management

The **Users** tab in the Jellyfin Enhanced admin configuration page lets an administrator
control which settings each user can change, edit any user's settings on their behalf, and
roll settings out to many users at once — without configuring every account by hand.

All of the tools on this tab are **admin-only** and are gated by the
**Enable user settings management** switch at the top of the tab. Turn it off to disable the
admin management endpoints entirely (the per-group availability locks below are unaffected).

---

## Setting availability (locking groups)

By default every user can open the Enhanced panel and change any Enhanced setting for
themselves. The **Setting availability** section lets you *lock* individual groups of settings.

- A **locked** group is **hidden** from every user's Enhanced settings panel.
- Its values are **forced to the admin defaults** (taken from the **Playback** / **Display**
  tabs) — both when a user's settings are read and when they are saved, so a locked setting
  cannot be changed even by a direct API call.
- **Unlocking** a group restores normal per-user control.

Newly-locked groups take effect the next time a user's settings load. Leaving every group
available reproduces the classic behaviour, so upgrading changes nothing until you lock
something.

The groups map to the sections of the Enhanced panel: Playback, Auto Skip, Subtitles,
Random Button, Watch Progress, File Sizes, Audio Languages, Quality Tags, Genre Tags,
Language Tags, Rating Tags, People Tags, Continue Watching, and Language.

> Locking **Subtitles** enforces the admin's default *disable custom styles* toggle and
> default style/size/font presets. A user's own subtitle **colours** and **on-screen
> position** are preserved (never reset), since those have no admin default.

---

## Act as user

Pick a user and select **Load** to see their Enhanced settings **presented exactly like the
user's own settings panel** — the same sections, subtitle preset/colour/position pickers, tag
position selectors and reordering — then change any value on their behalf and select **Save for
this user**. Locked groups appear disabled with a **Locked — set by admin** badge, mirroring
what the user sees.

The editor covers **every** per-user Enhanced setting, including subtitle presets/colours/
position, the quality-tag ordering, watch-progress/calendar modes, and the Hidden Content
display preferences. A user's hidden **items** (and their bookmarks/watchlist) are never
touched. Keyboard-shortcut overrides are the one surface not edited here — apply those via the
**Copy** and **Profiles** tools below.

---

## Copy settings between users

Copy one user's **settings**, **keyboard shortcuts** and **hidden-content display
preferences** onto one or more other users:

1. Choose the **From** user.
2. Tick the categories to include.
3. Select the target users (use **Select all** / **Deselect all**), then **Copy settings**.

Personal data (bookmarks, the user's actual hidden items, and watchlist state) is **never**
copied. Copying overwrites the target users' current values for the selected categories.

---

## Profiles

A **profile** is a reusable, named snapshot of a user's settings, shortcuts and
hidden-content display preferences.

- **Save a profile** — enter a name, pick the user to snapshot, and select **Save profile**.
- **Apply a profile** — pick a saved profile, choose the categories, select the target
  users, and select **Apply profile**.

Profiles are stored on the server (in `profiles.json` alongside the plugin configuration).
Profile names may contain letters, digits, spaces, `-` and `_` (up to 64 characters).

---

## Notes

- Locked-group values are enforced server-side, so the lock holds even against direct API
  requests.
- Copy and bulk-apply operations report how many users were updated and how many were
  skipped (for example, a stale account that no longer exists).
- Applying a profile or copying settings to a user whose settings a locked group covers will
  still respect the lock — the admin default wins for locked groups.
