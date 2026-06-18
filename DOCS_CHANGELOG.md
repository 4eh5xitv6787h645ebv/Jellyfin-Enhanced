# Documentation Overhaul — Change Log

This file records **everything changed, added, or removed** in the Jellyfin Enhanced
documentation (`docs/` + `mkdocs.yml`) during the docs accuracy/completeness pass.

- **Source of truth:** plugin source in `Jellyfin.Plugin.JellyfinEnhanced/` at `main` (HEAD `7087fc3`, plugin v11.12.0.0).
- **Verified against:** a fresh `main` build of the plugin installed on the `jellyfin-dev` container (Jellyfin 10.11.10).
- **Goal:** 0 content errors; every feature and every admin/user setting documented.

Legend: ✅ added · ✏️ changed/expanded · ❌ removed (incorrect) · 🐛 fixed error

---

## Baseline (before this pass)

- mkdocs `--strict` build: **clean** (only the expected "404.md not in nav" info note).
- All images referenced by docs exist in `docs/images/`.
- Docs were structurally complete but **content-incomplete**: ~10+ Enhanced features
  undocumented, Seerr ~40% covered, tag pipeline/cache & Maintenance Mode entirely
  missing, `advanced/api.md` listed ~12 of ~70 endpoints, plus several factual errors.

---

## Confirmed factual errors to fix (verified in source)

- 🐛 `other/other-features.md` — Letterboxd: "Automatic **TMDB** ID to Letterboxd mapping"
  is wrong; the code uses the **IMDb** ID (`letterboxd.com/imdb/{imdbId}`,
  `js/others/letterboxd-links.js:128`).
- 🐛 `arr/arr-features.md` — *arr tag Links/Hide filters documented as **comma-separated**;
  code splits on **newlines** (`js/arr/arr-tag-links.js:78,84`).
- 🐛 `other/other-features.md` — Theme Selector lists a non-existent "Sunset" theme;
  real list is in `js/extras/theme-selector.js:9-23`.
- ❌ `enhanced/enhanced-features.md:147` — "Export/import bookmark data": no such feature
  exists in `bookmarks.js` / `bookmarks-library.js`.
- 🐛 `advanced/project-structure.md` — duplicated `enhanced/` block in the tree (lines ~25 & ~69).

---

## Changes by file

<!-- entries appended as work proceeds -->

### `enhanced/enhanced-features.md` ✏️🐛❌
- ✅ Added: Random Item button, Watch Progress (click-to-cycle modes), File Sizes, Audio Languages, Remove from Continue Watching, Poster Tags overview (unified pipeline + server tag cache), in-player OSD rating.
- ✅ Added playback: real speed steps (0.25×–2×), Frame Step (++comma++/++period++), Jump to Last Position (++z++), jump-to-percentage (++0++–++9++), long-press 2× (beta), auto-PiP.
- ✅ Added subtitle presets (6 styles / 6 sizes / 5 fonts), drag position grid, disable-custom-styles toggle.
- ✅ Added/expanded: Bookmarks (timeline marker colours cyan=exact / orange=provider-match, sync, library page, find-duplicates, cleanup), Hidden Content (scopes incl. **homesections**, parent-series cascade, management page, 15-min suppress), Pause Screen (idle delay, accessibility).
- ❌ Removed false "Export/import bookmark data" bullet (no such feature).
- 🐛 Fixed Hidden Content filtering description: it is **server-side** (IAsyncActionFilter over resume/library/latest/nextup/upcoming/suggestions/search) **and** client-side for other surfaces — earlier draft wrongly called it client-side-only.
- 🐛 Restored the real `homesections` hide scope.
- 🐛 Corrected default keyboard-shortcut keys against `PluginConfiguration.cs` (19 configurable shortcuts; ++0++–++9++ and panel ++?++ are hardcoded).

### `enhanced/enhanced-settings.md` ✏️🐛
- ✏️ Replaced thin 67-line stub with a full settings reference (Display / Playback / Pages admin tabs + per-user Enhanced Panel), tables with Setting | Effect | Default | Scope.
- 🐛 Corrected persistence claim: per-user settings are stored **server-side**, not browser localStorage.
- 🐛 Documented true `ToastDuration` default = **1500 ms** (code) and flagged that the config-page help text wrongly says 3000 ms.
- ✅ Documented all 17 Hidden Content per-user defaults, subtitle preset index→name maps, tag positions, `tagsCacheTtlDays=30`, `HelpPanelAutocloseDelay=15000`, shortcut rebinding workflow + "disable all shortcuts".

### `seerr/seerr-features.md` ✏️🐛
- ✅ Added: Seerr-only search filter, collections-in-search, manual refresh, More-Info modal (seasons, inline download progress, Available/4K Jellyfin links, ratings, region-aware content rating, refresh), discovery rows (genre/network/person/tag/collection) with All/Movies/TV filter + sort + infinite scroll + tap-to-retry, Similar/Recommended, "Request More" on series, issue reporter (indicator, preselect, special-season handling, comments), quotas, status badge meanings, auto-request (movie/season), watchlist sync, user import.
- 🐛 Corrected 4K UX (search split-button vs modal "Request More" + 4K dropdown; 4K disabled when already available/blocked).
- ✏️ Watchlist note aligned with the config page: marks native `Likes` flag; **KefinTweaks required** to view/use the watchlist (config shows a "KefinTweaks detected" badge). Schedule defaults: Seerr→Jellyfin 03:00, Jellyfin→Seerr 03:30, user import every 6h (verified in ScheduledTasks).

### `seerr/seerr-settings.md` ✏️🐛
- ✅ Added URL-mappings format (`jellyfin_url|seerr_url`), full Auto-Request settings, caching TTLs, recently-added scan trigger, all watchlist settings, user import (+ where to change the schedule).
- 🐛 Fixed: Requests Page settings live on the **Pages** tab (not Seerr); tab is named **Seerr** (not "Seerr Settings").
- ✏️ Added verified default trigger times for the two watchlist sync tasks (03:00 / 03:30).

### `seerr/permission-audit.md` ✅
- ✅ Added feature→Seerr-permission mapping table (exact controller permission strings), REQUEST_VIEW vs MANAGE_REQUESTS explanation, and a "which warnings are safe to ignore" section.

### `elsewhere/elsewhere-features.md` & `elsewhere-settings.md` ✏️🐛
- ✅ Expanded streaming providers (regions, JustWatch, default/ignore providers, custom branding, per-user region modal) and Reviews (TMDB first-10; user reviews write/edit/delete, admin moderation, season/episode support, markdown, average-rating chip, expand/collapse).
- 🐛 Fixed tab name to **Elsewhere**; IGNORE_PROVIDERS regex is case-insensitive; custom branding only shows when no providers found + message set; clarified shared TMDB key (Elsewhere + Reviews + Seerr).
- ✅ Added "Reviews not showing" troubleshooting + Review settings section.

### `arr/arr-features.md`, `arr-settings.md`, `troubleshooting-support.md` ✏️🐛
- 🐛 Tag **Links/Hide** filters are newline-separated; the **Sync** filter is **comma/semicolon-separated** (UI "One per line" placeholder is misleading — documented the working behavior).
- 🐛 Calendar/Requests settings live on the **Pages** tab; instances/links/tags on the ***arr** tab (fixed "*arr Settings"/"Seerr Settings" tab names).
- 🐛 Fixed direct hash routes (`#/calendar`, `#/downloads`), exact setting labels, URL-mapping format (`jellyfin_url|arr_url`) + precedence, and the CSS anchor link.
- ✅ Added multi-instance matching (series=TVDB, movie=TMDB; tag sync series=IMDb), dropdown anatomy + status colours, SSRF guard, missing settings rows, per-instance error/HTTP-code troubleshooting.

### `other/other-features.md` & `other-settings.md` ✏️🐛✅
- 🐛 Letterboxd uses the **IMDb** ID (was "TMDB"); appears on **Movie and Series** detail pages.
- 🐛 Theme Selector: removed non-existent "Sunset"; listed the real 16 themes (Default + 15).
- 🐛 Colored Ratings is the **content/age-rating (certification)** badge (not review scores); external CDN CSS; NR normalization.
- 🐛 Plugin Icons custom links are `Config Page Name | Material Icon Name` routing to the plugin's own config page (not arbitrary URLs).
- 🐛 Timeout defaults corrected: HelpPanelAutocloseDelay 15000 ms, ToastDuration 1500 ms; fixed invented cache buttons → single "Clear All Client Caches".
- ✅ Added **Maintenance Mode** (was entirely undocumented), Active Streams badge legend + broadcast form + admin-only IP, Colored Activity Icons languages, Login Image progressive load, Splash Screen details.
- ✅ Added the previously-undocumented **Metadata Icons (Druidblack)** feature + setting.
- 🐛 Fixed wrong config-tab names throughout (real tabs: Display/Playback/Pages/Seerr/*arr/Elsewhere/Extras/Admin).

### `advanced/api.md`, `project-structure.md`, `css-customization.md` ✏️🐛
- ✏️ Rewrote api.md to cover all **~106 controller route attributes** (grouped), flagged the 6 unauthenticated endpoints, and noted these are internal (auth-required) APIs.
- 🐛 Fixed bookmark storage path → `<PluginsDir>/configurations/Jellyfin.Plugin.JellyfinEnhanced/{userId}/bookmark.json` and route `/user-settings/{userId}/bookmark.json` (verified in source).
- 🐛 Removed the duplicated `enhanced/`/`extras/` blocks in project-structure.md; rebuilt the JS + backend tree to match disk (26 locales, all real files).
- ✏️ Verified all CSS selectors; added a Hidden Content CSS section.

### `index.md`, `about.md`, `installation/*`, `faq.md`, `contributing-translations.md` ✏️🐛
- ✅ index.md: added Hidden Content to the feature overview.
- ✅ installation.md: added an "Optional Companion Plugins" table (Plugin Pages, Custom Tabs, Intro Skipper, KefinTweaks) clarifying none are required for core features; verified manifest URL + targetAbi 10.11.x.
- 🐛 faq.md: removed three stray-slash anchor links (`troubleshooting.md/#…` → `troubleshooting.md#…`); added a "no bookmark export/import (portable automatically)" entry; fixed the Custom Branding tab reference.

### `enhanced/enhanced-features.md` (structure) ✏️
- ✏️ Removed the stale, duplicated "Personal Scripts" + "Customization" tail (Active Streams / Colored Activity Icons / Colored Ratings / Login Image / Plugin Icons / Theme Selector / Custom Branding / Internationalization) that overlapped `other/other-features.md`; replaced with a concise cross-reference so each feature is documented once, accurately.
- 🐛 Fixed the User-Reviews setup to the **Elsewhere** tab with the exact config labels.

---

## Verification

- `mkdocs build --strict`: **clean** (only the expected 404.md note).
- Custom script validated **every internal `*.md#anchor` link** — all resolve.
- All keyboard-key shortcodes (`++comma++`, `++question++`, …) render to `<kbd>`.
- Three adversarial fact-checker agents re-audited the rewritten docs against source; all flagged issues were resolved (tab names, Hidden Content filtering split, KefinTweaks framing, schedule times, sync-filter separator, Metadata Icons gap).
- Docs served live on the LAN at **http://192.168.0.84:8000/Jellyfin-Enhanced/** (auto-reload).

---

## Screenshots pass (live captures from jellyfin-dev `main` build)

Captured with an authenticated Playwright harness against the fresh `main` build on jellyfin-dev,
then **inspected visually and independently verified by `codex` (gpt-5.5)**. Scope: add missing only.

**12 new images** added under `docs/images/`:

- ✅ `je-config-{overview,display,playback,pages,seerr,arr,elsewhere,extras,admin,keyboard}.png` — one per admin config tab. Wired in:
  - `enhanced/enhanced-settings.md` → Display, Playback, Pages, Keyboard tabs
  - `seerr/seerr-settings.md` → Seerr tab · `arr/arr-settings.md` → *arr tab · `elsewhere/elsewhere-settings.md` → Elsewhere tab
  - `other/other-settings.md` → Extras tab · `other/other-features.md` → Admin (Maintenance) tab
  - `installation/installation.md` → Overview tab (verify-install)
  - (The settings pages previously had **no** config-page screenshots.)
- ✅ `maintenance-banner.png` — the red maintenance banner on the home page → `other/other-features.md` (Maintenance Mode). Captured by toggling the flag via the config API and **restoring it immediately**; verified 0 user accounts were disabled.
- ✅ `detail-page-features.png` — a movie detail header showing the watch-progress "Ends at" time, ★/🍅 rating tags, and audio-language flags → `enhanced/enhanced-features.md` (Browsing & Detail Pages).

API keys/secrets were masked in every config screenshot (verified). No existing curated images were replaced.

**Not captured (out of reach, not faked):**
- Seerr more-info modal / discovery rows — the Seerr search API requires the Jellyfin user to be *linked* to a Seerr account, and user-import is erroring on this instance (`unlinked`). Seerr already has `jellyseerr.png`, `seerr-recommendations.png`, `seerr-requests-page.png`.
- Live-playback overlays (pause screen, in-player OSD rating, frame-step overlay, live active-streams panel, bookmark timeline markers) — require driving real video playback states, which is too flaky to automate reliably. These already have curated images (`pausescreen.png`, `active-stream.png`, `bookmarks-timeline.png`).

### Seerr screenshots (follow-up)

After linking the Jellyfin user to Seerr, **2 more images** were captured (inspected + codex-verified):

- ✅ `seerr-more-info-modal.png` — the Seerr "More Info" modal (Inception): backdrop, poster, Request button, all rating logos (RT/audience/IMDb/TMDB), metadata sidebar, cast, trailers → `seerr/seerr-features.md` (More Info modal).
- ✅ `seerr-discovery-row.png` — a Seerr "Recommended" row on a detail page (poster cards w/ title/year/★) → `seerr/seerr-features.md` (Item Details — Similar & Recommended).

How linking was done (no password used): the api-key browser session resolved to the all-zeros user GUID, so Seerr returned `unlinked`. Minted a **real TestAdmin session token via the admin Quick Connect flow** (`Initiate` → `Authorize?code&userId` with the admin key → `AuthenticateWithQuickConnect`), drove the browser with it, and Seerr resolved correctly (`jellyseerrUserId:5, linked`). The earlier import-from-jellyfin **500 was a batch failure** (one of 25 users aborts the whole import); importing the single user returns 201. The temporary session token was **revoked** afterward (confirmed 401). Seerr-dev's Jellyfin URL was already `http://192.168.0.84:8097` (no localhost). Total new images this whole screenshot effort: **14**.

---

## Final QA pass (codex + agents)

Independent re-verification of the finished docs + screenshots:

- **codex (gpt-5.5) — screenshots:** all **14/14 OK** (no login/error pages, no overlays, no cut-off content, no unmasked secrets, each matches its intent).
- **codex (gpt-5.5) — docs vs source:** MISSING-SETTING **clean**, MISSING-FEATURE **clean**, WRONG **clean**.
- **3 audit agents (docs vs source):** Enhanced/Other/tags — no issues; Seerr/Elsewhere/*arr — 1 minor polish; Completeness — full coverage confirmed (every config setting + every config-gated feature documented; all image embeds resolve and are placed in-context).
- 🐛 Fixed (from agent finding): `arr/arr-settings.md` "Show Downloads in Requests Page" row now states its default (on).

mkdocs `--strict` clean; all anchors + image references resolve.
