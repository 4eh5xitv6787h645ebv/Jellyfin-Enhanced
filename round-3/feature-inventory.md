# Media Tags feature inventory

State: branch `feat/media-tags-features`, see the round header in the evidence pack for the exact commit.
Paths are relative to the repository root; `P/` = `Jellyfin.Plugin.JellyfinEnhanced/`.
User reference: `docs/enhanced/tags.md` (section anchors below). API reference: `docs/advanced/api.md`.
Admin page reference: `docs/advanced/admin-media-tags.md`. CSS hooks: `docs/advanced/css-customization.md`.

## 1. Tag groups (web overlays; native column says whether the server poster renderer draws it)

| Group | What it shows | Data source | Native | Code |
|---|---|---|---|---|
| Quality | resolution (8K…480p, LOW-RES), source (REMUX/BluRay/WEB/HDTV/DVD, HD DVD/VHS/Physical stubs, opt-in CAM/TS/TC/SCR), dynamic range (DV, HDR10+, HDR10, HDR, SDR in All mode), special format (IMAX, 3D), video codec, sound (ATMOS, DTS-X, TRUEHD, DTS-HD MA/HRA, DTS, DD+, DD, channels), edition (Director's Cut, Extended, …, `{edition-…}`), runtime, aspect ratio, frame rate, Mixed marker | Jellyfin media streams + file/folder naming (server `MediaNamingTags.cs`), Matroska header languages | yes | `P/js/tags/qualitytags.js`, `P/Services/PosterTags/Resolution/QualityTagRules.cs`, `TechnicalQualityRules.cs`, `P/Services/MediaNamingTags.cs`, `P/Services/SeriesQualityAggregation.cs` |
| Quality display modes | Highest only / All distinct values per sound, codec, HDR; minimum resolution; Hide SDR | | yes | tags.md#highest-only-or-every-stream-value |
| Series/season quality | Representative / Latest / Best / Shared (intersection) / Best+Mixed | server summaries in tag cache | yes | tags.md#detection-limits |
| Genre | Material icons (26 keyed genres + multilingual aliases), names on hover | Jellyfin genres | yes (icons) | `P/js/tags/genretags.js`, `genre-icons.json`, `Resolution/GenreIcons.cs` |
| Language | audio and/or subtitle flags or ISO codes, CC/SDH marker, Dual/Multi badge, no-dialogue symbol, partial-dub coverage, personal + admin priority, strict filter, regional merge | streams, Matroska headers, episode union in cache | yes | `P/js/tags/languagetags.js`, `P/js/core/media-language.js`, `Resolution/LanguageFlagRules.cs`, `LanguageNames.cs` |
| Rating | Community, Critic, IMDb, TMDb, RT critic/audience, Metacritic, Letterboxd, Trakt; minimum score; colour by score; item-type and row scopes | Jellyfin fields + server MDBList cache (7-day TTL) | yes | `P/js/tags/ratingtags.js`, `rating-sources.js`, `Resolution/RatingRules.cs`, `P/Services/TagCacheSourceRatings.cs`, `MdblistService.cs` |
| User review | average JE review stars /10 | JE reviews store | yes | `P/js/tags/userreviewtags.js`, `PosterTagReviewRatings.cs` |
| Age rating | board-coloured classification, normalised aliases | Jellyfin OfficialRating | yes | `P/js/tags/ageratingtags.js`, `Resolution/AgeRatingRules.cs` |
| Status | one badge: trending rank, coming soon, new movie/series/episode, just added, airing today/airs/returns, new season/premiere/finale/complete season, returning/ended/cancelled, post/mid-credits (Scenes), Leaving soon (Maintainerr / collections), direct-play warning (web only) | Jellyfin dates, TMDB (trending, schedules, keywords), Seerr trending fallback, Maintainerr API, PlaybackInfo | yes except direct-play | `P/js/tags/statustags.js`, `status-vocabulary.js`, `tag-direct-play.js`, `P/Services/StatusTags*.cs`, `LeavingSoonService.cs`, `Resolution/StatusRules.cs`, `NativeStatusRefreshService.cs` |
| Awards | IMDb Top 250, RT Certified Fresh, Oscar winner, Emmy winner, Letterboxd Top 250 | MDBList lists, Wikidata | yes | `P/js/tags/awardstags.js`, `P/Services/AwardTagsService.cs`, `WikidataAwardsService.cs`, `TagCacheAwards.cs` |
| Logos | streaming provider (region), network, studio; name chip fallback | TMDB watch providers / companies, server logo cache | yes | `P/js/tags/logotags.js`, `P/Services/TagLogoService.cs`, `TagCacheLogos.cs`, `Resolution/LogoRules.cs` |
| Custom | admin rules: Jellyfin tag or collection → label + icon (20 rules) | item tags, collection membership (cache) | yes | `P/js/tags/customtags.js`, `P/Services/TagCacheCustomTags.cs`, `P/js/enhanced/admintags/custom-rules-editor.js` |
| People | age, age at release, birthplace flag, deceased styling (cast cards) | Jellyfin person + optional TMDB | no (not a poster group) | `P/js/tags/peopletags.js` |
| Player badges | scores in player controls, age/advisory at playback start | | n/a | tags.md#player-badges |
| Audio language links | detail-page language row, tag sync task | | n/a | tags.md#audio-language-links, `ScheduledTasks/AudioLanguageTagsSyncTask.cs` |

## 2. Layout engine and looks
- Layouts: Corners (9 anchors), Bands, Caption, Summary, Minimal; density Full/Compact; size 85–130%; gap; edge spacing Default/Tight/Flush. `P/js/core/tag-layout.js`, `tag-renderer-base.js`, `P/js/tags/tag-layout-styles.js`, `tag-pipeline.js`. Docs tags.md#layouts.
- Per-group order, position per layout, limits, +N overflow with names; shape overrides (episode thumbnails, list rows).
- Look resolution: personal lock → server-wide item look → first matching rule (library/type/genre/age rating, ≤5 conditions, ≤50 rules) → shape → default. `P/js/core/tag-look.js`, item editor `P/js/tags/tag-item-editor.js`, `tag-item-menu.js`. Docs tags.md#rules-and-locked-items, #one-items-look.
- Import/export/presets (built-in Cinephile/Minimal/Kids, admin-offered ≤20, personal ≤10), server-validated preview with skipped reasons; admin server-wide export/import. Docs tags.md#import-export-and-presets; server `P/Helpers/*Portable*` (see api.md).
- Tag Styles: presets Default/Glass/Outline/Dark/Light/Mono/Poster (artwork-derived colour), per-group and per-label overrides, per-genre colours, contrast badge, user preset choice, web/native target. `P/js/tags/tag-styles.js`, `tag-poster-colours.js`, `P/Services/PosterTags/TagStyles.cs`, `TagStylePalettes.cs`, `PosterColour.cs`, editor `P/js/enhanced/admintags/tag-styles-editor.js`.

## 3. Settings surfaces
- Personal hub (Jellyfin Enhanced panel → Media Tags): Layout, Groups, Status badges, Rules & locks, Colours, Server (admins). `P/js/enhanced/settingspanel/ui-panel-media-tags.js`, `ui-panel-tag-editor.js`, `ui-panel-tag-preview.js`. Settings search covers every control.
- Admin page (`#/configurationpage?name=JellyfinEnhancedMediaTags`): Overview, Layout defaults, Groups, Rules (+ server-wide item looks), Colours, Status badges, Server. Field-patch saves with conflict resolution (Keep mine / Take theirs), undo. `P/js/enhanced/admintags/*`, field registry `tests/fixtures/admin-tags-page-fields.json`, validators `P/Helpers/MediaTagsPageFields.cs`.
- Inheritance: nullable personal overrides follow admin defaults ("Follow server"), version-0 legacy documents keep their look.

## 4. Server tag cache and data pipeline
- `P/Services/TagCacheService.cs` (schema `CurrentCacheSchemaVersion`), monitor `TagCacheMonitor.cs`, pending changes, snapshot `tag-cache.json`, delta sync by cursor, per-user filtering + `filterRevision` (access, Spoiler Guard strip), IndexedDB browser copy `P/js/tags/tag-cache-store.js`; batch fallback `POST /JellyfinEnhanced/tag-data/{userId}` (≤200 ids), localStorage fallback with `StripRevision`.
- Enrichment: MDBList ratings warm in batches, awards refresh task, logos (TMDB, 1-day TTL), scenes keywords (TMDB daily), Leaving soon task, trending (30 min shared), series schedules (6 h shared, 4 in flight, 35/10 s).
- Scheduled tasks: Refresh Tag Cache (03:00), Refresh Awards Tags (04:00), Refresh Leaving Soon Tags (hourly), Sync Audio Language Tags (no default trigger), MDBList fetch/sync.
- Matroska language sidecar `matroska-languages.json` (path/size/mtime keyed).

## 5. Native Poster Tags (experimental)
- Server composes tags into Primary images for eligible native clients (Android TV, Tizen, Swiftfin, Findroid, Streamyfin); excluded web wrappers list + admin additions; per-user opt-out.
- `P/Services/PosterTags/*` (resolver `PosterTagResolver.cs`, plan `Rendering/PosterTagPlan.cs`, renderer `Rendering/PosterTagRenderer.cs`, tile cache, composite cache 128 MiB memory / ~1 GiB disk, signed personalised URLs `PosterTagVariantToken.cs`, status refresh buckets).
- Corners (all anchors) and Bands natively; Caption/Summary/Minimal fall back to Corners; locks and server-wide item looks apply; rules and shape overrides do not.
- Admin preview route `GET /JellyfinEnhanced/native-poster-tags/preview/{itemId}`.
- Parity harness `tests/poster/parity/` (web DOM vs native plan) and identity checks.

## 6. Interop and API
- Routes listed in `docs/advanced/api.md` (tag-cache, tag-data, status-tags/series, status-tags/trending, tag-styles, tag-styles/catalog, rebuild, audio-language-tags, native preview, portable import/export, admin field patch).
- Integrations: MDBList, TMDB, Seerr (trending fallback), Maintainerr, Wikidata, Jellyfin tags/collections, Spoiler Guard, Hidden Content, Audio language tag sync, *arr and Seerr badges are separate systems.

## 7. Tests and tooling
- Frontend unit (`node tests/frontend/run.mjs`), browser Playwright (`tests/browser`, three projects), backend xUnit (`tests/backend`, `PosterTags/`, `Api/`, …), parity (`tests/poster/parity/run.mjs --offline`), inventory (`tests/inventory/generate.py --check`), translation validator, poster asset check, docs coverage (`tests/docs/`).
- i18n: `P/js/locales/*.json` (en source; Weblate fills others), native date formatting per locale.

## 8. Round changes
### Round 1 build (reviewed in round 2)
- Structured format detection (web `qualitytags.js` + server `QualityTagRules.cs`, schema 24, resolver 13, web naming 7): dynamic range from Jellyfin `VideoRangeType` first (SDR/HDR10/HDR10Plus/HLG/DOVI family); title text only as a word-bounded fallback when the type is missing/unknown (DVD/Advanced no longer read as Dolby Vision); new `HLG` label; Dolby Vision keeps its base layer (HDR10, HDR10+, HLG) as an extra fact shown in All mode; unknown range is never SDR; `HDR10+` title alias; Highest sound ranks tracks and takes codec + channels from ONE track (first wins ties); `FLAC`, `PCM` labels; `VC-1` (no longer WMV), `VVC`, `ProRes`; 8K title hint rejected below 2500 px. Version-0 (pre-layout) documents keep the old Highest detector (documented compatibility). Independent truth table `tests/fixtures/quality-detection-truth.json` (27 cases × Highest/All/legacy) asserted by `tests/frontend/features/features-quality-detection-truth.test.mjs` and `tests/backend/PosterTags/QualityDetectionTruthTests.cs`.
- Native posters evaluate tag look rules (`Services/PosterTags/PosterTagLookFacts.cs`, `PosterTagSettings.ResolveLook/ForItem`): lock → item look → first enabled rule (library/type/genre/age rating from the tag cache entry, or the library item when the cache is off) → default; rule hidden groups/caps/density apply; Caption/Summary/Minimal rules fall back to Corners with hidden groups; admin rules inherited unless the document has its own list or is version 0; preview route header `X-JE-Poster-Tags-Look`. Parity profiles `look-rules*` (5). Backend `NativeLookRulesTests.cs`.
- MDBList: a failed refresh keeps a title's last good scores (`MdblistCacheEntry.RetryAfterUnixMs`, retry after 1 h) instead of erasing them; tests in `RatingSourceTests.cs`.
- Docs: Status admin help no longer says web-only; api.md admin body limit 8 MiB; detection precedence, sound ranking, legacy compatibility, native rules documented.

### Round 2-3 builds (reviewed in round 3)
- 9432f352: commentary / audio-description audio (title: commentary, audio description, descriptive audio, described video, upper-case AD) is not a language option; forced-only subtitle languages are not subtitle options (cache, episode union, tag-data, web fallback; `Helpers/TrackRoles.cs`, `languagetags.js isSecondaryAudio`); flags for nb/nob/nn/nno, yue, gsw, ga/gle; edition words and CAM/TS/TC/SCR only after the title (after the last year, after an episode title) in `Services/MediaNamingTags.cs ReleasePart`; schema 25.
- b33d113a: native request gates (`NativePosterTagStamper.Begin`, `PosterTagImageFilter.CreatePlan`) use `PosterTagSettings.MayShowTags` so rules can reveal groups hidden by default; request-path test through the real stamper.
- 62617d57: per-track channel layouts (ChannelLayout → title → usual layout for 1/2/6/7/8 channels; 1.0, 4.0, 5.0, 6.1 …; 6.1 channel-only chip; more channels win ties), dimensions-first resolution (title hint only for unknown size), multi-version docs; schema 26, resolver 14, web naming 8; truth table 35 cases.
