# Tag layouts: implementation research and phase-1 plan

Reviewed read-only at `/home/jake/je-wt/tag-layouts`, branch `feat/tag-layouts`, HEAD `f095e30af98eadb48ad907a4e6e0a955812474d5`. Read `CONTRIBUTING.md` and `docs/advanced/project-structure.md` first. No files were changed and no tests or generators were run.

Paths below are relative to `Jellyfin.Plugin.JellyfinEnhanced/` unless they start with `tests/`, `docs/`, or `scripts/`.

## 1. Findings that determine the design

- There are **six shared poster renderers**: quality, genre, language, rating, age rating, and status.
- **User-review chips belong to the rating overlay**; they are not independently registered renderers.
- **People Tags use a separate cast-card pipeline**, with fixed age/birthplace positioning and no corner setting.
- There is **no library-name poster tag renderer or library-position setting** in this checkout.
- Corner positioning is distributed across renderer styles and language-renderer inline styles. Changing only `commitOverlay()` will not be sufficient.
- Caption placement needs a normal-flow outlet **outside `.cardScalable`**. Keeping all caption content inside the current absolute host would overlap the title or alter the image’s sizing.
- Layout is presentation-only: **no `TagCacheEntry`, server cache schema, or `filterRevision` change is needed**.
- Native Poster Tags support five groups and currently **exclude Status Tags**. Phase 1 should explicitly retain native corner rendering rather than attempt static versions of caption/hover layouts.

The source inventory confirms these responsibilities in [project-structure.md:309](/home/jake/je-wt/tag-layouts/docs/advanced/project-structure.md:309).

## 2. Client pipeline and card structure

### 2.1 Scan → data → renderer → overlay

The pipeline stores renderer registrations in a `Map`; registrations provide `render`, optional local/server-cache paths, enablement, data requirements, CSS injection, and refresh callbacks. See [tag-pipeline.js:124](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:124).

Rendering follows this order:

1. Scan eligible image containers.
2. Resolve item ID/type and skip hidden or excluded cards.
3. Resolve a rendering target.
4. Prefer the server tag-cache entry.
5. Otherwise try renderer-local caches.
6. Queue misses for shared batched retrieval.
7. Run enabled renderers.
8. Stack corner groups once per rendered slice.

The key fan-out is:

```js
const renderTarget = resolveRenderTarget(el);

if (serverEntry) {
    for (const [, renderer] of renderers) {
        if (!renderer.isEnabled()) continue;
        if (renderer.renderFromServerCache) {
            renderer.renderFromServerCache(renderTarget, serverEntry, itemId);
        }
    }
    hosts.push(renderTarget);
    return;
}
```

See [tag-pipeline.js:999](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:999). Corner stacking is batched after the chunk at [line 1077](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1077). Batched-fetch rendering also fans out to **every card with the same item ID**, at [line 1368](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1368).

### 2.2 Current host structure

On the normal path:

```html
.card
  .cardScalable
    .cardImageContainer
    .je-tag-host
      .quality-overlay-container[data-je-corner]
      .genre-overlay-container[data-je-corner]
      ...
    .cardOverlayContainer
```

The host is inserted **before Jellyfin’s hover overlay**:

```js
const scalable = el.closest('.cardScalable');
if (!scalable) return el;
const overlay = scalable.querySelector('.cardOverlayContainer');
if (!overlay) return scalable;
let tagHost = scalable.querySelector('.je-tag-host');
if (!tagHost) {
    tagHost = document.createElement('div');
    tagHost.className = 'je-tag-host';
    scalable.insertBefore(tagHost, overlay);
}
return tagHost;
```

See [tag-pipeline.js:1160](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1160).

Important qualifications:

- A `.je-tag-host` is **not currently guaranteed** on every supported card.
- No `.cardScalable`: render directly into the discovered image element.
- No `.cardOverlayContainer`: render directly into `.cardScalable`.
- The source expressly warns against inserting into `.cardImageContainer`: Jellyfin’s lazy loader can reset its opacity to zero.
- A detached render target is re-resolved before a delayed batch response is rendered, at [line 1371](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1371).

### 2.3 How corners and stacking work

The shared resolver uses user setting → admin default → hardcoded fallback:

```js
const pos = JE.currentSettings?.[userKey] || JE.pluginConfig?.[pluginKey] || fallback;
const isTop = pos.includes('top');
const isLeft = pos.includes('left');
```

It returns six-pixel edge offsets and `needsTopRightOffset`. See [tag-renderer-base.js:101](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/core/tag-renderer-base.js:101).

`commitOverlay()` records the corner and appends a nonempty overlay:

```js
if (spec.position) {
    const p = resolvePosition(spec.position.userKey, spec.position.pluginKey, spec.position.fallback);
    overlay.dataset.jeCorner = p.pos;
}
if (overlay.children.length === 0) return false;
el.appendChild(overlay);
markTagged(el);
```

See [tag-renderer-base.js:545](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/core/tag-renderer-base.js:545).

`applyCornerStacking()`:

- Groups **direct host children** by their `data-je-corner` string.
- Keeps DOM insertion order.
- Clears previous transforms.
- Measures actual rectangles.
- Moves subsequent groups away from the corner with a **4px gap**.
- Uses positive `translateY` for top corners and negative for bottom corners.
- Batches reads before writes.

See [tag-renderer-base.js:126](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/core/tag-renderer-base.js:126).

Therefore current group priority is effectively **registration/arrival order**, not a stored group-order setting. Asynchronous quality initialization and review-only containers can affect that order.

### 2.4 Card detection: Modern Layout, legacy, landscape, lists, details

The scan selector is exactly:

```js
document.querySelectorAll('.cardImageContainer, div.listItemImage')
```

See [tag-pipeline.js:1042](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1042).

There is **no separate Modern Layout selector or layout-mode branch**. Modern and legacy cards are supported insofar as they expose these structural classes.

Likewise, the web pipeline does **not classify portrait versus thumb/16:9 cards**. Episode cards enter the same scan; there is no aspect-ratio-specific layout decision here.

Item identity extraction is significant:

```js
// Background-image identity wins.
el.style.backgroundImage.match(/Items\/([a-f0-9]{32})\//i)

// Otherwise:
el.closest('[data-id]') || el.closest('[data-itemid]')
```

Attribute IDs are normalized by removing hyphens and lowercasing. Item type comes from `closest('[data-type]')`. See [tag-pipeline.js:1191](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1191).

An episode card can use **series artwork**, making fetched identity differ from displayed card type. Rating scope deliberately prefers the card’s `data-type`; see [ratingtags.js:55](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/ratingtags.js:55). Future item-type rules must retain that distinction.

Pipeline exclusions are exactly:

```text
.chapterCardImageContainer
#indexPage .verticalSection.MyMedia .cardImageContainer
.formDialog .cardImageContainer
#pluginsPage .cardImageContainer
#pluginCatalogPage .cardImageContainer
#devicesPage .cardImageContainer
#mediaLibraryPage .cardImageContainer
.listItemImage:not(.listItemImage-large)
.jellyseerr-card .cardImageContainer
```

See [tag-pipeline.js:95](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:95).

Additional behavior:

- `.card.je-hidden` and `.listItem.je-hidden` are skipped before marking processed.
- Accepted media types: `Movie`, `Episode`, `Series`, `Season`, `BoxSet`, `Video`.
- Large list images remain eligible; small list images do not.
- Renderer-level standard exclusions include:
  - `#itemDetailPage .infoWrapper .cardImageContainer`
  - `#itemDetailPage #castCollapsible .cardImageContainer`
  - chapter, My Media, dialog, and admin contexts.
- `DisableTagsOnSearchPage` adds `#searchPage .cardImageContainer`.
- Genre uses broader ancestor exclusions, `#searchPage`, and additionally suppresses itself while `.videoPlayerContainer` exists.

See [tag-renderer-base.js:69](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/core/tag-renderer-base.js:69), [line 265](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/core/tag-renderer-base.js:265), and [genretags.js:142](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/genretags.js:142).

The shared ignore matcher resolves a host back to its image-container sibling before applying image-scoped exclusions. Moving caption groups outside `.cardScalable` must preserve this lookup through an explicit card context.

### 2.5 Hover hiding and CSS ownership

Shared structural CSS is injected from **JavaScript**, not a standalone shared positioning stylesheet:

- `je-tag-pipeline-perf`: absolute, full-image `.je-tag-host`, pointer behavior, containment, group z-index normalization.
- `je-tag-card-scale`: card-width container-query sizing.
- `je-tag-hover-fade`: hover hiding.

See [tag-pipeline.js:1548](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1548).

The hover rule is:

```css
body.je-tags-hide-on-hover .card:hover .je-tag-host {
    opacity: 0 !important;
    transition: opacity 0.15s ease;
}
```

See [tag-pipeline.js:1614](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1614).

It currently:

- Handles hover, **not keyboard focus**.
- Applies to `.card`, not list rows.
- Hides the entire host.
- Relies on a body class added at initialization and toggled live by the settings handler.

Genre separately omits `.genre-text` when hide-on-hover is enabled; otherwise it reveals names via `.card:hover`. See [genretags.js:105](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/genretags.js:105) and [line 197](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/genretags.js:197).

The top-right indicator rule is generated from current position settings:

```css
.cardScalable:has(.countIndicator, .playedIndicator)
  > .je-tag-host > .GROUP-overlay-container {
    margin-top: clamp(20px, 3vw, 30px);
}
```

See [tag-pipeline.js:1473](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1473). This CSS is built during pipeline initialization; phase 1 should replace its settings-dependent selector generation with stable slot selectors.

### 2.6 Renderer inventory

| Module / registration | Setting pair | Default | Placement/style source |
|---|---|---|---|
| `qualitytags.js` / `quality` | `qualityTagsPosition` / `QualityTagsPosition` | `top-left` | [spec and CSS:863](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/qualitytags.js:863); style ID `quality-tag-enhanced-style` |
| `genretags.js` / `genre` | `genreTagsPosition` / `GenreTagsPosition` | `top-right` | [spec and CSS:129](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/genretags.js:129); `genre-tags-styles` |
| `languagetags.js` / `language` | `languageTagsPosition` / `LanguageTagsPosition` | `bottom-left` | [inline positioning:190](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/languagetags.js:190), [spec:252](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/languagetags.js:252); `language-tags-styles` |
| `ratingtags.js` / `rating` | `ratingTagsPosition` / `RatingTagsPosition` | `bottom-right` | [spec and CSS:248](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/ratingtags.js:248); `jellyfin-enhanced-rating-tags-css` |
| `ageratingtags.js` / `agerating` | `ageRatingTagsPosition` / `AgeRatingTagsPosition` | `bottom-right` | [spec and CSS:177](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/ageratingtags.js:177); `jellyfin-enhanced-age-rating-tags-css` |
| `statustags.js` / `status` | `statusTagsPosition` / `StatusTagsPosition` | `top-right` | [spec and CSS:508](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/statustags.js:508); `jellyfin-enhanced-status-tags-css` |
| `userreviewtags.js` | Shares rating position | `bottom-right` | Creates or extends `.rating-overlay-container`; [applyChip:316](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/userreviewtags.js:316) |
| `peopletags.js` | No corner setting | Fixed | `.je-people-age-container`: top-left 8px; birthplace banner: full-width bottom; [creation:821](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/peopletags.js:821) |
| Library tags | **No module/setting found** | — | Do not invent a migration mapping |

People Tags scan `#castCollapsible` and `#guestCastCollapsible` for `.personCard`, and append directly into each `.cardScalable`. See [peopletags.js:913](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/peopletags.js:913) and [line 955](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/peopletags.js:955).

`tag-styles.js` only applies validated color overrides. It does **not** own corner placement. Its selectors depend on existing group/chip classes; preserve those hooks. See [tag-styles.js:23](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-styles.js:23).

### 2.7 Reinitialization and settings changes

The shared `reinitialize()`:

1. Removes that group’s overlays globally.
2. Clears its tagged dataset markers.
3. Reinjects renderer CSS.
4. If enabled, calls `clearProcessed()` and `scheduleScan()`.

See [tag-renderer-base.js:625](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/core/tag-renderer-base.js:625).

`clearProcessed()` resets the `WeakSet`, queued work, scan/batch generations, and shared first-episode/parent caches. It does **not** download the server cache. See [tag-pipeline.js:1680](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1680).

The body observer scans for **added nodes**, not arbitrary attribute changes. Navigation schedules scans and cache deltas. See [tag-pipeline.js:1520](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1520).

On a user switch:

- `plugin.js` loads incoming settings and re-registers enabled renderers.
- `je:user-data-loaded` triggers pipeline invalidation/reload.
- Pipeline invalidation removes six overlay types and their markers.

See [plugin.js:1138](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/plugin.js:1138) and [tag-pipeline.js:1701](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/tag-pipeline.js:1701).

New caption outlets, summary copies, and dot representations must join this cleanup.

### 2.8 Relevant manifest order versus initialization order

The relevant `component-scripts.json` execution subsequence is:

```text
core/navigation.js
core/session.js
core/lifecycle.js
core/dom-observer.js
core/ui-kit.js
core/media-language.js
core/api-client.js
core/tag-renderer-base.js
enhanced/config.js
enhanced/helpers.js
enhanced/header-actions.js
enhanced/native-tabs.js
tags/tag-cache-store.js
tags/tag-pipeline.js
...
enhanced/ui-styles.js
enhanced/settingspanel/ui-entry-points.js
enhanced/settingspanel/ui-release-notes.js
enhanced/settingspanel/ui-panel-template.js
enhanced/settingspanel/ui-panel-shortcut-editor.js
enhanced/settingspanel/ui-panel-settings.js
enhanced/settingspanel/ui-panel-hidden-content.js
enhanced/settingspanel/ui-panel-language.js
enhanced/settingspanel/ui-panel.js
...
tags/genretags.js
tags/languagetags.js
tags/peopletags.js
tags/qualitytags.js
tags/ratingtags.js
tags/ageratingtags.js
tags/statustags.js
tags/tag-styles.js
tags/userreviewtags.js
arr/arr-links.js
arr/arr-tag-links.js
```

Sources: [manifest:13](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/component-scripts.json:13), [105](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/component-scripts.json:105), [185](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/component-scripts.json:185).

**Loading a definition is different from initializing it.** Boot initialization registers quality → genre → rating → age → status → language; quality can register late while resolving Jellyfin audio preferences. People initializes separately, then the pipeline starts. See [plugin.js:1352](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/plugin.js:1352).

## 3. Settings, persistence, defaults, and existing keys

### 3.1 Storage and merging

Per-user properties are defined in `JellyfinEnhancedUserSettings`, [UserConfiguration.cs:38](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/UserConfiguration.cs:38).

They live in:

```text
<PluginsPath>/configurations/Jellyfin.Plugin.JellyfinEnhanced/<normalized-user-id>/settings.json
```

The manager normalizes IDs and saves via temporary file plus atomic move. See [UserConfigurationManager.cs:21](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/UserConfigurationManager.cs:21), [53](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/UserConfigurationManager.cs:53), [218](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/UserConfigurationManager.cs:218).

Client configuration uses:

- `JE.userConfig.settings`: loaded user document.
- `JE.currentSettings`: effective merged settings.
- PascalCase server properties versus camelCase client properties.
- Recursive conversion helpers in [plugin.js:143](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/plugin.js:143).
- `JE.saveUserSettings('settings.json', JE.currentSettings)`: serializes the whole document, queues saves in order, skips identical snapshots.

See [config.js:48](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/config.js:48).

`JE.loadSettings()` starts with saved keys, then resolves known scalar defaults as user → plugin → hardcoded. **Object-valued settings in its generic defaults loop are treated as invalid**, so new layout objects require an explicit merge/normalization path. See [config.js:174](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/config.js:174).

Another migration trap: existing files are deserialized into the typed C# model before reaching the client. Nonnullable property initializers therefore become present values even when absent on disk. The native settings documentation explains this at [PosterTagSettings.cs:20](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagSettings.cs:20). Use nullable new structured fields/version markers to distinguish legacy settings.

### 3.2 Existing settings inventory

For paired keys below, the server/admin key is shown first; the client/user key is the same name with its first letter lowercased.

| Existing keys | Current defaults / purpose |
|---|---|
| `QualityTagsEnabled`, `GenreTagsEnabled`, `LanguageTagsEnabled`, `RatingTagsEnabled`, `AgeRatingTagsEnabled`, `StatusTagsEnabled`, `PeopleTagsEnabled` | All false |
| `QualityTagsPosition`, `GenreTagsPosition`, `LanguageTagsPosition`, `RatingTagsPosition`, `AgeRatingTagsPosition`, `StatusTagsPosition` | `top-left`, `top-right`, `bottom-left`, `bottom-right`, `bottom-right`, `top-right` |
| `TagsHideOnHover` | False |
| `ShowResolutionTag`, `ShowSourceTag`, `ShowDynamicRangeTag`, `ShowSpecialFormatTag`, `ShowVideoCodecTag`, `ShowAudioInfoTag` | All true |
| `ResolutionTagOrder`, `SourceTagOrder`, `DynamicRangeTagOrder`, `SpecialFormatTagOrder`, `VideoCodecTagOrder`, `AudioInfoTagOrder` | Admin 1–6; user properties nullable and inherit |
| `QualityTagsPreferredAudioLanguage` | User `""` = server policy; also `auto`, `none`, or language code |
| `RatingTagsOnMovies`, `RatingTagsOnSeries`, `RatingTagsOnSeasons`, `RatingTagsOnEpisodes`, `RatingTagsOnContinueWatching`, `RatingTagsOnNextUp` | All true |
| `StatusTagsJustAdded`, `StatusTagsNewRelease`, `StatusTagsTrending` | All true |
| `UseNativePosterTags` / `useNativePosterTags` | User only; null or true permits native tags, false opts out |
| `ShowRatingInPlayer` | True; adjacent player setting, not poster placement |
| `ShowAudioLanguages` | Detail-page language links, not poster language tags |

Sources: [UserConfiguration.cs:36](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/UserConfiguration.cs:36), [PluginConfiguration.cs:104](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/PluginConfiguration.cs:104), [config.js:126](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/config.js:126).

Admin-only or shared controls relevant to this feature:

| Exact keys | Defaults / purpose |
|---|---|
| `LanguageTagsPriority` | Empty priority list |
| `LanguageTagsPriorityStrict` | False |
| `LanguageTagsMergeRegions` | False |
| `QualityTagsAudioLanguageFromUser` | False |
| `QualityTagsPreferredAudioLanguage` | Empty fixed server language |
| `StatusTagsJustAddedDays`, `StatusTagsNewReleaseDays` | 7 and 30; runtime clamped 1–365 |
| `DisableTagsOnSearchPage` | False |
| `NativePosterTagsEnabled` | False |
| `NativePosterTagsWebClientNames` | Empty; private admin client exclusions |
| `ShowUserReviews`, `ShowUserRatingOnPosters`, `ShowUserRatingDash` | False, false, true |
| `TagStylesEnabled`, `TagStyleOverrides` | False, empty |
| `TagStyleTarget`, `TagStylePreset`, `TagStyleApplyScope` | `both`, `default`, `all` |
| `TagCacheServerMode` | True |
| `TagsCacheTtlDays` | 30 |
| `EnableTagsLocalStorageFallback` | False |
| `TagCacheExcludeLibraries`, `TagCacheExcludedLibraryIds` | False, empty |
| `ClearLocalStorageTimestamp` | 0 |
| `ShowPlaybackRatingBadge` | False; separate playback-start badge |

Sources: [PluginConfiguration.cs:123](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/PluginConfiguration.cs:123), [628](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/PluginConfiguration.cs:628), [666](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/PluginConfiguration.cs:666), [694](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/PluginConfiguration.cs:694), [753](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/PluginConfiguration.cs:753).

There are **no existing configurable per-group maximums, group priority order, layout, slot, or full/compact label-style settings**.

Current implicit limits are:

- Genre: `genres.slice(0, 3)` on batch, local-cache, and server-cache paths.
- Language: `const maxToShow = 3`, applied **after flag deduplication and priority ordering**.
- Quality: no overall cap; only the best resolution is retained, with category sorting and toggles.
- Rating: critic then community, plus optional review chip.
- Age: one classification.
- Status: exactly one winning badge.

Sources: [genretags.js:273](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/genretags.js:273), [languagetags.js:200](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/languagetags.js:200), [qualitytags.js:816](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/qualitytags.js:816), [ratingtags.js:208](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/ratingtags.js:208), [statustags.js:223](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/statustags.js:223).

### 3.3 Corner picker rendering and saving

The personal panel renders a `.position-selector[data-setting="qualityTagsPosition"]` with four `[data-pos]` divs; the other five poster groups repeat the pattern. See [ui-panel-template.js:371](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/settingspanel/ui-panel-template.js:371).

The handler:

```js
const newPos = cell.dataset.pos;
JE.currentSettings[settingKey] = newPos;
JE.saveUserSettings('settings.json', JE.currentSettings);
```

It then calls the relevant `JE.reinitialize*Tags()` function. See [ui-panel-settings.js:706](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/settingspanel/ui-panel-settings.js:706).

Existing quality-category reorder buttons normalize order to 1…N and save the whole document; reuse that interaction for accessible group ordering. See [ui-panel-settings.js:235](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/settingspanel/ui-panel-settings.js:235).

Admin corner selects live in `Configuration/configPage.html`, beginning at [line 242](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/configPage.html:242). Loading occurs around line 6595 and saving around [line 7216](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/configPage.html:7216). Dependency-control lists also reference them at line 8784 onward.

### 3.4 New-user seeding and “apply defaults to all users”

`LoadUserSettingsDocument()` seeds a missing `settings.json` from an explicit property-by-property initializer, saves it, then reads the typed model. See [controller:5170](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs:5170), particularly [5203](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs:5203).

The admin action:

1. Saves the current plugin configuration.
2. Performs its associated Custom Tabs sync.
3. POSTs `/JellyfinEnhanced/reset-all-users-settings`.

See [configPage.html:7789](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Configuration/configPage.html:7789).

`ResetAllUsersSettings()` is authenticated and checks admin status. It builds another explicit default user object and writes `settings.json` for IDs returned by `GetAllUserIds()`. See [controller:8156](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs:8156) and [8240](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs:8240).

**Every new layout field must be added to both initializers.** Native `PosterTagSettings.DefaultsAsWritten()` is a third defaults-copy location.

### 3.5 Public configuration and save endpoint

`GET /JellyfinEnhanced/public-config` delegates to `BuildPublicConfig()`, which is also used by bootstrap. The endpoint is public for login-screen configuration, with sensitive Seerr fields selectively redacted. See [controller:3586](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs:3586).

Tag fields are explicitly selected at [controller:3707](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs:3707) through 3769. New admin layout defaults must be explicitly included here.

`POST user-settings/{userId}/settings.json` accepts the typed `JellyfinEnhancedUserSettings`, checks access, compares serialized documents, and saves changed settings. See [controller:5300](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs:5300). Add server-side validation for new layout enums, group IDs, slots, caps, and order.

## 4. Native Poster Tags

### 4.1 Effective settings and rendering path

`PosterTagSettings` resolves the same typed user settings and admin defaults as web rendering. It contains five group toggles, five positions, quality options/orders, language policy, rating scopes, review options, styles, and a rendering digest. See [PosterTagSettings.cs:49](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagSettings.cs:49) and [296](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagSettings.cs:296).

```csharp
public bool AnyGroupEnabled =>
    QualityTagsEnabled || GenreTagsEnabled || LanguageTagsEnabled
    || RatingTagsEnabled || AgeRatingTagsEnabled;
```

**Status and People are absent.**

`PosterTagResolver.Resolve()` turns already spoiler-stripped metadata into semantic groups:

```csharp
return new PosterTagGroupLayout(
    group,
    PosterTagSettings.CornerOf(settings.PositionOf(group)),
    list);
```

See [PosterTagResolver.cs:59](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagResolver.cs:59), [165](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagResolver.cs:165).

`PosterTagModel.cs` models only four `PosterTagCorner` values and five `PosterTagGroup` values. See [PosterTagModel.cs:5](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagModel.cs:5).

The composer determines landscape with:

```csharp
var landscape = width > height * 1.2;
```

Then resolves and renders. See [PosterTagComposer.cs:208](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagComposer.cs:208).

The planner reproduces:

- Six-pixel corner inset.
- Flex-column group dimensions.
- Four-pixel stacking gaps.
- Top-right indicator clearance.
- Group maximum dimensions/clipping.

See [PosterTagPlan.cs:123](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/Rendering/PosterTagPlan.cs:123), [191](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/Rendering/PosterTagPlan.cs:191), [220](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/Rendering/PosterTagPlan.cs:220).

Native limits are also hard-coded: `GenreIcons.MaxGenres = 3` and `LanguageFlagRules.MaxFlags = 3`; see [GenreIcons.cs:14](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/Resolution/GenreIcons.cs:14), [LanguageFlagRules.cs:17](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/Resolution/LanguageFlagRules.cs:17).

### 4.2 Recommended phase-1 scope

**Keep native output corner-based for every web layout.** Use the saved `corners` profile for native placement; changing the web layout should not silently remove native tags.

Minimal consistent implementation:

1. Resolve native positions from the new corners profile, with old position fields as migration fallback.
2. Apply group `off`, caps, and explicit order for the five supported native groups.
3. Retain full native labels in phase 1 unless compact label parity is implemented.
4. Keep Status Tags explicitly web-only.
5. Explain the static corner fallback beside the native preference.

New effective native placement/order/caps must enter `ComputeDigest()`, [PosterTagSettings.cs:465](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagSettings.cs:465). Bump `ResolverVersion` when resolution behavior changes; bump renderer/composition versions if pixel layout changes. Composite keys include these versions and settings digest, [PosterTagComposer.cs:54](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagComposer.cs:54).

The provider already invalidates on `settings.json` saves and detects plugin configuration replacement; see [PosterTagSettingsProvider.cs:48](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/PosterTags/PosterTagSettingsProvider.cs:48).

## 5. Tag cache impact

**No server tag-cache schema or filter revision change is required.**

`TagCacheEntry` contains metadata—genres, scores, classification, languages, streams, dates, and identity—not layout decisions. See [TagCacheEntry.cs:9](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Model/TagCacheEntry.cs:9).

The current persisted schema is:

```csharp
private const int CurrentCacheSchemaVersion = 10;
```

Its comments require bumps for changes that make older cached metadata incorrect. Layout does not do that. See [TagCacheService.cs:262](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Services/TagCacheService.cs:262).

`filterRevision` is derived from access and Spoiler Guard stripping:

```csharp
SHA256.HashData(Encoding.UTF8.GetBytes(access + "#" + stripFingerprint))
```

See [controller:8491](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/Controllers/JellyfinEnhancedController.cs:8491).

Two caveats:

- The **genre local fallback cache currently stores the already-sliced three genres**, [genretags.js:273](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/genretags.js:273). Increasing a cap above three requires recognizing/refilling old truncated local entries. Store complete source facts going forward.
- Future **library-based rules or library chips** may need additional context: the current client metadata model has no general library-membership field. That is separate from phase-1 presentation changes.

## 6. Tests and documentation

### 6.1 Frontend runner and fixtures

`tests/frontend/run.mjs` starts Node’s test runner over recursively discovered `.test.mjs` files. Discovery sets a timeout and deterministic UTC/locale environment. See [run.mjs:1](/home/jake/je-wt/tag-layouts/tests/frontend/run.mjs:1), [discovery.mjs:8](/home/jake/je-wt/tag-layouts/tests/frontend/helpers/discovery.mjs:8).

`createHarness()` provides:

- Fresh JSDOM realm.
- Real production classic-script loading, wrapped like the bundle.
- Mock `ApiClient`.
- Explicit network fixtures; unexpected fetches fail.
- Error capture.
- Optional Istanbul instrumentation.
- `deferred()` for controlled asynchronous responses.

See [harness.mjs:15](/home/jake/je-wt/tag-layouts/tests/frontend/helpers/harness.mjs:15).

Existing relevant tests:

| File | Useful coverage |
|---|---|
| [core-tag-renderer.test.mjs:11](/home/jake/je-wt/tag-layouts/tests/frontend/core/core-tag-renderer.test.mjs:11) | Real overlay DOM, `data-je-corner`, stale marker handling, reinitialization |
| [core-tag-renderer.test.mjs:19](/home/jake/je-wt/tag-layouts/tests/frontend/core/core-tag-renderer.test.mjs:19) | User/admin/fallback position precedence |
| [core-tag-renderer.test.mjs:52](/home/jake/je-wt/tag-layouts/tests/frontend/core/core-tag-renderer.test.mjs:52) | Search/admin exclusions through sibling hosts |
| [core-tag-renderer.test.mjs:60](/home/jake/je-wt/tag-layouts/tests/frontend/core/core-tag-renderer.test.mjs:60) | Top/bottom stacking and stale transform clearing; mocks `getBoundingClientRect()` |
| [core-tag-pipeline.test.mjs:5](/home/jake/je-wt/tag-layouts/tests/frontend/core/core-tag-pipeline.test.mjs:5) | Minimal image/scalable/overlay fixture; detached hosts, duplicate IDs, removed cards, identity changes, cancelled batches |
| [bootstrap-settings-panel.test.mjs:10](/home/jake/je-wt/tag-layouts/tests/frontend/bootstrap/bootstrap-settings-panel.test.mjs:10) | Real settings transport and control events; native gate and tag toggles |
| [features-status-tags.test.mjs:12](/home/jake/je-wt/tag-layouts/tests/frontend/features/features-status-tags.test.mjs:12) | Real factory, controlled time/trending responses, refreshes and stale-record protection |
| [features-people-tags.test.mjs:11](/home/jake/je-wt/tag-layouts/tests/frontend/features/features-people-tags.test.mjs:11) | Separate person-card fixture |
| [history-recent-regressions.test.mjs:59](/home/jake/je-wt/tag-layouts/tests/frontend/regressions/history-recent-regressions.test.mjs:59) | Quality-tag regressions through real factory |

The current pipeline fixtures do **not** establish complete real Modern/legacy `cardBox`/title structures. Add representative fixtures for both before treating caption insertion as verified.

JSDOM cannot validate actual wrapping, clipping, stacking, or CLS; those need browser coverage.

### 6.2 Backend and poster parity

Backend tests directly touching `PosterTagSettings`:

- [PosterRegressionTests.cs:14](/home/jake/je-wt/tag-layouts/tests/backend/PosterTags/PosterRegressionTests.cs:14): lenient reading, missing versus existing-empty settings, audio precedence, effective digest changes, scope, landscape/indicator behavior, language flags, rendering.
- [PosterSettingsProviderTests.cs:12](/home/jake/je-wt/tag-layouts/tests/backend/PosterTags/PosterSettingsProviderTests.cs:12): save invalidation, user isolation, unrelated-file saves, plugin replacement, Jellyfin audio preference changes.
- [TagStyleTests.cs:32](/home/jake/je-wt/tag-layouts/tests/backend/PosterTags/TagStyleTests.cs:32): native digest/pixels and style target.

Also preserve/update:

- [tests/poster/parity/web-expected.mjs:283](/home/jake/je-wt/tag-layouts/tests/poster/parity/web-expected.mjs:283): extracts direct host children and current indicator CSS.
- [tests/poster/parity/profiles.mjs:195](/home/jake/je-wt/tag-layouts/tests/poster/parity/profiles.mjs:195): position profiles.
- [tests/poster/rendering/Program.cs:237](/home/jake/je-wt/tag-layouts/tests/poster/rendering/Program.cs:237): proof/corners pixel and rectangle comparisons.

The parity extractor will break when group containers become nested inside slots unless updated deliberately.

### 6.3 Documentation affected

| Page | Relevant content |
|---|---|
| [docs/enhanced/tags.md:61](/home/jake/je-wt/tag-layouts/docs/enhanced/tags.md:61) | Corner settings, defaults, stacking, hover |
| [docs/enhanced/tags.md:150](/home/jake/je-wt/tag-layouts/docs/enhanced/tags.md:150) | Genre/language limits |
| [docs/enhanced/tags.md:348](/home/jake/je-wt/tag-layouts/docs/enhanced/tags.md:348) | Status Tags |
| [docs/enhanced/tags.md:528](/home/jake/je-wt/tag-layouts/docs/enhanced/tags.md:528) | Native supported preferences and limitations |
| [docs/enhanced/tags.md:601](/home/jake/je-wt/tag-layouts/docs/enhanced/tags.md:601) | Existing color presets/editor |
| [docs/advanced/css-customization.md:202](/home/jake/je-wt/tag-layouts/docs/advanced/css-customization.md:202) | Host structure, group classes, positions, transforms |
| [docs/enhanced/enhanced-settings.md:247](/home/jake/je-wt/tag-layouts/docs/enhanced/enhanced-settings.md:247) | Personal UI settings |
| [docs/advanced/api.md:1289](/home/jake/je-wt/tag-layouts/docs/advanced/api.md:1289) | Public configuration field types |
| [docs/advanced/community-analytics.md:86](/home/jake/je-wt/tag-layouts/docs/advanced/community-analytics.md:86) | Position analytics |
| [docs/advanced/project-structure.md:309](/home/jake/je-wt/tag-layouts/docs/advanced/project-structure.md:309) | Tag ownership map |

The flag-group generator is [scripts/generate_config_flag_groups.py:1](/home/jake/je-wt/tag-layouts/scripts/generate_config_flag_groups.py:1). It derives:

- Groups/labels/tabs from admin `configPage.html` fieldsets and controls.
- Literal defaults from `PluginConfiguration.cs`.
- Output: `docs/advanced/config-flag-groups.json`.

Nested layout objects will not be fully described by its simple literal-default parser. Keep scalar layout/density controls discoverable; decide explicitly how structured defaults should appear in generated documentation.

New configuration properties/files also require production-inventory regeneration, per [CONTRIBUTING.md:166](/home/jake/je-wt/tag-layouts/CONTRIBUTING.md:166).

## 7. Proposed phase-1 implementation

### 7.1 Settings and model

Use typed structured settings, retaining existing feature toggles and quality-category controls:

| Proposed server / client key | Default |
|---|---|
| `TagLayout` / `tagLayout` | `"corners"` |
| `TagLayoutSettingsVersion` / `tagLayoutSettingsVersion` | `0` means legacy/unmigrated; write `1` with normalized settings |
| `TagLayouts` / `tagLayouts` | Nullable persisted profiles; normalize missing values |
| `TagGroupOrder` / `tagGroupOrder` | Nullable; legacy order until explicitly normalized/reordered |
| `TagGroupCaps` / `tagGroupCaps` | Nullable; effective defaults below |
| `TagLabelDensity` / `tagLabelDensity` | `"full"` |

All are personal preferences with **admin starting defaults**, not administrator enforcement. Continue using admin-only data policies for language priority, status day windows, cache configuration, and native eligibility.

Suggested client shape:

```js
{
  tagLayout: "corners",
  tagLayoutSettingsVersion: 1,
  tagLayouts: {
    corners: {
      groups: [
        { group: "quality", slot: "tl" },
        { group: "genre", slot: "tr" },
        { group: "rating", slot: "br" },
        { group: "ageRating", slot: "br" },
        { group: "status", slot: "tr" },
        { group: "language", slot: "bl" }
      ]
    },
    bands: { groups: [/* ... */] },
    caption: { groups: [/* ... */] },
    summary: { groups: [/* ... */] },
    minimal: { groups: [/* ... */] }
  },
  tagGroupOrder: [
    "quality", "genre", "rating", "ageRating", "status", "language"
  ],
  tagGroupCaps: {
    quality: 0,
    genre: 3,
    language: 3,
    rating: 0,
    ageRating: 1,
    status: 1
  },
  tagLabelDensity: "full"
}
```

Use `0` for unlimited caps; use slot `off` for placement suppression. Apply caps to final eligible chips, **after** quality-category filtering, language deduplication/priority, and rating scope checks.

Keep quality-category ordering separate from group ordering.

Use string **values** for group IDs, rather than relying on dictionary-key casing through recursive camel/Pascal conversion. Normalize `agerating` registration to the public group ID `ageRating`.

Default profiles:

| Layout | Default assignments |
|---|---|
| `corners` | Migrated existing positions |
| `bands` | status + ageRating → top; quality + rating + language + genre → bottom |
| `caption` | status → poster; all other poster groups → caption |
| `summary` | quality + rating + language → pill; genre + ageRating + status → hover |
| `minimal` | status → top; quality → dots; rating → corner; language + genre + ageRating → hover |

Every profile accepts `off`. Keep each layout’s profile when switching layouts.

For summary/minimal, define “full chips” as the enabled, non-`off`, capped groups, including full representations of groups summarized as pill/dots/corner.

**Scope correction:** People needs a separate person-card adapter/design if it is to participate in layouts. It has no old corner to migrate. Library chips likewise require a new renderer and data source. The six existing poster groups should be the concrete phase-1 media-card scope.

### 7.2 Shared placement/controller layer

Add `js/core/tag-layout.js`, loaded after `core/tag-renderer-base.js` and before consumers.

Responsibilities:

```text
normalizeSettings()
resolveLayout(cardContext)
ensureHost(imageElement)
commitGroup(cardContext, groupId, chips)
removeGroup(cardContext, groupId)
refreshPresentation(cardContext)
clearCard(cardContext)
```

Maintain one controller per card/image surface in a `WeakMap`. Track item identity and presentation generation, not just element identity.

Refactor renderer placement as follows:

- Keep metadata extraction and chip classes in current modules.
- Remove absolute edge placement from group styles.
- Remove language’s inline absolute offsets.
- Route `commitOverlay()` through `commitGroup()`.
- Route review-only creation and async review updates through the same API.
- Replace Status Tags’ direct stacking calls with presentation refresh.
- Preserve group wrapper classes for custom CSS and Tag Styles.

For noncorner slots, use wrappers with `display: contents` or equivalent flattened chip participation so the slot can concatenate/wrap chips across group boundaries. Corner groups should retain wrappers and existing within-group presentation.

### 7.3 DOM and caption insertion

Retain **one `.je-tag-host` per image/card** with named on-image slots:

```html
<div class="cardBox">
  <div class="cardScalable">
    <div class="cardImageContainer"></div>

    <div class="je-tag-host" data-je-layout="caption">
      <div class="je-tag-slot" data-je-slot="poster"></div>
      <!-- Other active-layout slots only -->
    </div>

    <div class="cardOverlayContainer"></div>
  </div>

  <div class="je-tag-slot je-tag-caption"
       data-je-slot="caption"
       data-je-owner="..."></div>

  <div class="cardText ...">...</div>
</div>
```

The caption is an **owned external slot outlet**, not a second host. A literal single DOM subtree inside `.cardScalable` cannot also participate in normal flow below that element without restructuring Jellyfin’s DOM.

Insertion algorithm:

1. Resolve `.card`, `.cardBox`, `.cardScalable`, image, overlay, and first title-bearing `.cardText`.
2. For the normal sibling topology, insert caption immediately after `.cardScalable`, before `.cardText`.
3. For wrapped Modern/legacy variants, find the corresponding image block/title block under their common container.
4. Do not move `.cardImageContainer`, replace its HTML, change `.cardScalable` aspect sizing, or wrap Jellyfin’s existing interactive anchors.
5. If the topology is unsupported, use a documented on-image fallback rather than absolute positioning below the image.
6. Large list rows use an image-only layout fallback until a list-specific caption outlet exists.

JE’s own Seerr card template illustrates `.cardBox > .cardScalable` followed by `.cardText`, [ui-cards.js:366](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/jellyseerr/ui/ui-cards.js:366), but those cards are excluded from this pipeline. Actual supported Jellyfin Modern/legacy structures still need fixtures/browser validation.

### 7.4 Layout CSS

Create a centralized `js/tags/tag-layout-styles.js`, loaded after `tags/tag-pipeline.js` and before tag renderers. Inject a stable stylesheet that reads layout/slot data attributes.

- **Corners:** absolute slot containers at 6px; preserve group column styles. Stack top groups downward and bottom groups upward, preserving the existing group/chip order and 4px gap. Slot layout should remove the need for repeated rectangle-based stacking.
- **Bands:** inset top/bottom slots; `display:flex`, wrapping bottom row, bounded width, consistent chip gaps. Reserve indicator space rather than shifting every group independently.
- **Caption:** normal-flow, bounded-height strip; `min-width:0`; compact line height; wrap within a reserved one/two-row budget. Avoid an unlimited strip that changes every card’s height independently.
- **Summary:** centered pill with up to three facts from eligible `pill` groups in priority order. Bottom hover/focus scrim contains the full chip representations.
- **Minimal:** quality dots, score corner, status top; full chip representations in the hover/focus scrim.

Preserve card-width sizing by giving the caption outlet its own container-query context. Existing `.je-tag-host ...` sizing rules will not reach an external caption outlet automatically.

For CLS, reserve caption space when eligible cards are discovered, before asynchronous metadata completes. Late review/trending arrivals must update inside that fixed budget.

### 7.5 Hover, focus, and accessibility

Define precedence explicitly:

- Preserve current `TagsHideOnHover` behavior for corners/bands and the poster portion of caption.
- Caption strips remain readable.
- Summary/minimal reveal their full chips on hover **and `:focus-within`**.
- The blanket `opacity:0 !important` host rule must not suppress summary/minimal reveals.

Use the card’s existing focusable links/buttons; do not add a tab stop to every chip. Provide an accessible combined text description for summary/dots and hide decorative glyphs from assistive technology.

For hoverless devices, show full information through focus/tap behavior or an always-visible compact fallback. Do not require mouse hover to recover information.

Use real labeled selects/buttons for layout, slots, caps, density, and ordering; replace the current click-only corner div grid. Respect reduced motion and retain visible focus indicators. Scrims should remain noninteractive and clear Jellyfin’s playback/action controls.

### 7.6 Migration and live application

Migration must preserve existing users even after an admin chooses a different default layout.

1. Existing document with no layout version/profile: effective layout remains `corners`.
2. Map:
   - `top-left` → `tl`
   - `top-right` → `tr`
   - `bottom-left` → `bl`
   - `bottom-right` → `br`
3. Preserve all feature toggles, quality categories/order, scope switches, audio preference, hover setting, and native preference.
4. Missing new caps use current behavior: genre/language 3, quality/rating unlimited, age/status 1.
5. Keep legacy arrival ordering until an explicit group order is established. A fixed default can otherwise change shared-corner stacks, particularly when quality registers late.
6. Seed genuinely new users from admin layout defaults.
7. “Apply defaults to all users” deliberately writes the admin profiles/order/caps.
8. Retain old corner fields during compatibility migration; update them from the corners profile if older/native paths still consume them.

Add one `reinitializeTagLayout()` that updates all groups in a coalesced pass. Prefer re-presenting retained semantic facts over refetching data. It must invalidate pending presentation work and synchronize body classes on both settings changes and user switches.

### 7.7 Risks and required regression cases

| Risk | Required handling |
|---|---|
| Virtualized/reused cards | Compare normalized item ID as well as element identity; clear owned outlets/markers when identity changes. Current added-node observer and `WeakSet` do not cover attribute-only reuse. |
| Lazy images | Keep tags out of `.cardImageContainer`; test delayed URL/identity assignment and subtree replacement. |
| Caption CLS/clipping | Reserve height early; test home carousels, grids, narrow cards, themes, mobile, title wrapping, and fixed-height rows. |
| Spoiler Guard | Derive pill/dots/full chips only from the same stripped inputs as existing renderers. Remove every derived representation during invalidation. Never recover stripped facts from stale local caches. |
| Hidden Content | Preserve `.je-hidden` early skips and hidden-button positioning. Buttons attach to `.cardBox`, [hidden-content-buttons.js:25](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/hiddencontent/hidden-content-buttons.js:25). |
| Seerr badges | Preserve `.jellyseerr-card` exclusion. Seerr status/media badges are separate UI, not JE Status Tags. |
| `*arr` badges | Keep layout CSS narrowly scoped. Current `.arr-badge` is attached to integration links, [arr-links.js:586](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/arr/arr-links.js:586); request/calendar badges use separate renderers. |
| Native Poster Tags | Keep static corner profile, five supported groups, signed-variant/digest behavior, and updated parity extraction. |
| Status Tags | Trending refresh can replace/remove a badge after initial rendering. Refresh all derived views, preserve stale-record guards, and reapply configured order. See [statustags.js:445](/home/jake/je-wt/tag-layouts/Jellyfin.Plugin.JellyfinEnhanced/js/tags/statustags.js:445). |
| Async review chips | Enforce rating caps and slot placement on late insertions and removals; reject stale card/layout generations. |
| Custom CSS/colors | Preserve group/chip hooks; document new slot structure and removal of corner transforms. |

### 7.8 Suggested implementation sequence

1. Add typed settings, normalization, validation, and migration tests.
2. Update config merging, public config, new-user seeding, bulk defaults, and native defaults resolution.
3. Add the shared layout controller and stable slot CSS.
4. Move all six renderers, review-only containers, and trending updates onto it.
5. Verify corners preserve current output before adding the other layouts.
6. Implement bands, caption, summary, and minimal, including focus/hoverless behavior.
7. Replace settings corner grids with layout/slot/order/cap/density controls.
8. Update native corner mapping, caps/order, digest/versioning, and parity fixtures.
9. Add browser fixtures/screenshots for Modern/legacy, portrait/landscape/list cards, lazy loading, focus, clipping, and caption stability.
10. Update docs/translations, flag-group output, and production inventory; run frontend, both backend targets, browser, and native parity checks.

For later rules and locks, make `resolveLayout(cardContext)` the single decision boundary now. Future precedence can be lock → matching rule → user layout → default, while color presets remain an independent style layer using the existing validated Tag Styles machinery.
