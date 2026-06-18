## Troubleshooting

### Links Not Appearing

**Check Configuration:**

1. Ensure **"Enable *arr Links on Detail Pages"** is checked
2. Confirm you're logged in as an **administrator** — *arr links are admin-only
3. Verify each instance's **URL** and **API Key** are correct, and the instance is **Enabled**
4. Check the item actually has a **TMDB link** (movies) or **TVDB ID** (series) — the plugin only renders a link when it finds the matching external id and the item exists in at least one enabled instance

**Test URLs:**

- Open the *arr URL in a browser
- Verify it is accessible **from the Jellyfin server** (not just from your desktop)
- Check for HTTPS/HTTP mismatches

!!! warning "Per-instance error toasts"
    When a lookup against a specific instance fails, the plugin shows a toast like:

    > ⚠ Sonarr instance "Anime" failed: HTTP 401

    Common reasons:

    | Symptom | Likely cause |
    |---|---|
    | `HTTP 401` | Wrong or missing **API Key** for that instance |
    | `HTTP 404` | Wrong **URL** / base path, or the item isn't in that instance |
    | `Network error` / `Timeout` | Instance unreachable from the Jellyfin server (firewall, wrong host, down) |
    | `⚠ Sonarr lookup failed; links unavailable` | The whole Sonarr/Radarr lookup endpoint failed — see the browser console |
    | `⚠ Sonarr instance configuration is corrupt` | The stored instances JSON is invalid — open the *arr config page and re-save to reset it |

    Each distinct error toasts once per session; fix the instance, then hard-reload the web client (the per-session match cache only clears on reload).

### Tags Not Syncing

**The sync is not automatic:**

Tag sync has **no default schedule**. You must run it from **Dashboard → Scheduled Tasks → "Sync Tags from *arr to Jellyfin"**, and add a trigger to run it periodically.

**Check Configuration:**

1. Ensure **"Enable Tags Sync"** is checked
2. Verify each instance's URL and API key are correct (the same instances used for links)
3. Check the *arr instance isn't **disabled** — disabled instances are skipped by the sync
4. Check the server log for per-instance messages such as `Failed to sync tags from Sonarr instance <name>: <reason>`

**Check Tag Settings:**

- The **Sync to Jellyfin Filter** restricts which tags are synced — make sure it isn't excluding the tags you expect (one tag per line, without the prefix)
- Tags only sync to items with the matching external id: **movies by TMDB ID**, **series by IMDb ID**. Items missing that id are skipped
- Ensure the tags actually exist on the items in *arr

### Calendar Not Loading

**Check Prerequisites:**

1. Sonarr/Radarr URLs configured
2. API keys entered
3. *arr instances accessible
4. Calendar page enabled

**Blank Screen / "Cannot find module" Error (Cloudflare Rocket Loader):**

If the Calendar or Requests page shows a blank screen and the browser console shows `Cannot find module './'`, this may be caused by **Cloudflare Rocket Loader** interfering with Jellyfin's JavaScript module system. Rocket Loader rewrites and defers script loading in a way that can break dynamic module imports.

**Solution:** Disable Rocket Loader for your Jellyfin domain in Cloudflare:

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com)
2. Select your domain
3. Go to **Speed** → **Optimization** → **Content Optimization**
4. Toggle **Rocket Loader** off

Alternatively, disable it for specific pages using a Page Rule or Configuration Rule targeting your Jellyfin URL.

See [GitHub issue #570](https://github.com/n00bcodr/Jellyfin-Enhanced/issues/570) for more context.

**Some users see no events (or fewer than admins):**

This is expected. With **"Filter by Library Access"** enabled (the default), the calendar only shows each user the items from libraries they can access; upcoming items not yet in Jellyfin are filtered by their Sonarr/Radarr root folder. An admin sees everything, a restricted user sees only their libraries. Disable "Filter by Library Access" only if you want every user to see all events.

**Calendar shows nothing for everyone:**

- Check that at least one Sonarr/Radarr instance is configured **and enabled**
- If **"Force Only Requested Items"** (or **"Show Requested Only"**) is on, the calendar filters to Jellyseerr-requested items — confirm Jellyseerr is enabled and that there are requested items in the window
- Toggle the in-page **Unmonitored** control if you only have unmonitored upcoming items

**Check Logs:**

- Browser console for client errors
- Server logs for API errors
- *arr logs for connection issues

### Requests Page Issues

**Downloads Not Showing:**

1. Ensure **"Show Downloads in Requests Page"** is checked (it is separate from enabling the page)
2. Confirm Sonarr/Radarr instances are configured, enabled, and have valid API keys
3. Ensure there are active downloads in *arr
4. As a non-admin, remember **"Filter Downloads by User Requests"** hides downloads you didn't request — disable it to see the whole queue
5. Watch for per-instance toasts like `⚠ Sonarr queue "Anime" failed: HTTP 401` (bad API key) or `HTTP 404` (wrong URL)

**Status Not Updating:**

1. Ensure **"Enable Auto-Refresh"** is on; otherwise the page only refreshes on manual reload
2. Check the **Poll Interval (seconds)** value (30–300)
3. Auto-refresh **pauses while the page or tab is hidden** — switch back to it (or reload) to resume
4. Check the browser console for errors

**Requests / Issues Sections Missing:**

- The Jellyseerr **Requests** and **Issues** sections only appear when Jellyseerr is enabled in the **Seerr** tab (and "Show Seerr Issues Section" is checked for issues)
- A `No permission to view issues` toast (HTTP 403) means your Jellyseerr user lacks the permission to view issues


## Support

If you encounter issues:

1. Check [FAQ](../faq-support/faq.md) for common solutions
2. Verify *arr URLs and API keys
3. Check browser console and server logs
4. Report issues on [GitHub](https://github.com/n00bcodr/Jellyfin-Enhanced/issues)