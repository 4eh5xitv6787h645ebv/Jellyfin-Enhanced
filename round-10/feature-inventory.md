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

### Round 3-4 builds (reviewed in round 4)
- a2df4a14: locale-aware scores (web `JE.core.mediaLanguage.formatNumberText` via Intl; native `Services/PosterTags/Resolution/ScoreNumbers.cs` + generated `js/tags/score-numbers.json`, `scripts/generate_score_numbers.mjs`); language names in tooltips in the UI language (`localName`); parity profiles rating-locale-de/fa/ar-SA.
- ce818238: every account gets the current video detection (version 0 keeps only its sound vocabulary); commentary/AD never decides the sound chip while an ordinary track exists (`isSecondaryAudio` in media-language.js, `Helpers/TrackRoles.cs`); title layouts 1.0–7.1; forced subtitles out of stored subtitle facts and tag-data; naming boundary = bracketed year else first non-leading year, no-year names need a release word; rules with an invalid or 6th condition are dropped whole; schema 27, resolver 15, naming 9; truth table 41 cases.
- a90658ff: native Dual/Multi, Mixed and edition words through the shared js/locales vocabulary in the saved language (`StatusRules.Text`, `LanguageTag.CountBadgeText`); parity web harness uses the profile language; `scripts/tag-translation-coverage.mjs` + placeholder-integrity test; docs "Languages" section. (Bundled translations deliberately not added: the repo's Translation Checks CI fails any locale file with missing keys, and Weblate owns locales.)

### Round 4-5 builds (reviewed in round 5)
- 31c0ecb3: native trending uses the web's sources and lifetimes (TMDB daily, else Seerr weekly; 30 min / 5 min after empty); native StatusTrending when either source is configured (`StatusTagsTrendingService.GetNativeAsync`).
- 19c16f34: TRUEHD ATMOS / DD+ ATMOS / ATMOS (unknown carrier) labels on web and native (`atmosCarrier`, `QualityTagRules.AtmosCarrier`); localized commentary/description stems (`TrackRoles`, `isSecondaryAudio`); first listed version authoritative (unprobed first version borrows nothing); naming read after the item's own title (`MediaNamingTags.WithoutTitle`); DOVIWithSDR lists SDR in All; docs fixes; schema 28, resolver 16, naming 10; truth table 46 cases.

### Round 5-6 builds (reviewed in round 6)
- 621344b3: Versions chip (Quality category `versions`, order 11, `ShowVersionsTag`/`VersionsTagOrder`, "{count} versions" / Compact "×N"; movies and episodes only; `QualityTagRules.VersionCount`, `versionCount`/`versionsText` in qualitytags.js; admin + panel + portable; parity `quality-versions*`).
- 90b13510: premiere dates compared as calendar days in the viewer's zone (web `premiereDay`/`airedWithin`, native `StatusRules.PremiereDay/AiredWithin`, `StatusPremiereDayTests`); native Seerr weekly trending labelled "This week" (`PosterStatusContext.WeeklyRank`, parity `popular-week-seerr`).
- 3e0ebd7a: tags.md trailing notes moved into their sections; "Related badge systems" heading.
- Round 6 detection: E-AC-3 JOC → DD+ ATMOS; a bare "DTS-HD" is its own **DTS-HD** label (ranked after HRA) unless MA/XLL/Master Audio appears in the title or profile; height layouts kept (5.1.2, 7.1.4 from ChannelLayout or title) and counted in ranking (rank scale ×100 on both sides), codec-less height tracks show their bed; commentary/AD stems in Hungarian, Estonian, Ukrainian, Greek, Turkish, Arabic, Hebrew, Japanese, Chinese, Korean (shared table `tests/fixtures/track-roles.json`, JS + C#); editions Redux, Ultimate (Cut/Edition), Collector's Edition, Anniversary (25th Anniversary / Anniversary Edition), Uncensored, Open Matte (`MediaNamingTags.Editions`, compact Ult/CE/Anniv/Unc/OM, en.json keys); schema 29, resolver 17, web naming 11; truth table 54 cases; parity q41–q44, ns12–ns17.
- Round 6 native worker: queued series schedules refresh in batches of 16 through `StatusTagsSeriesService` (4 in flight, shared rate limit), each batch published before the next; a stopped batch publishes nothing and leaves no failure stamp (`NativeStatusRefreshTests`).

### Round 6-7 builds (reviewed in round 7)
- 6e4f1701: DTS-HD Master Audio / XLL spelled out → MA; sound rank follows TRaSH audio scores (TrueHD Atmos, DTS:X, Atmos, DD+ Atmos, TrueHD, MA, PCM, FLAC, HRA, DTS-HD, then lossy) and lossy tracks (DD+, DTS, DD, codec-less) compare channels before codec (rank ×10 band in `distinctRank` / `AggregationRank`); resolution: 640+ wide → 480p, 1440p only by height ≥ 1250 (2560×1080 → 1080p); `VideoRange` stored only when `VideoRangeType` is unknown (`QualityTagRules.CoarseRange`) and used as HDR/SDR fallback; XviD/DivX from CodecTag of mpeg4; aspect 1.90 plain, 2.35 own label (only 1.43 = IMAX). Schema 30, resolver 18, naming 12; truth table 65 cases; parity q45–q52.
- 50e72969: a season/episode with any score of its own keeps only its own; with none it shows the series' (server matches web fallback); no Versions chip on Series/Season under any policy (LatestExtras filtered at build and at resolve, web and native); season premieres recorded once their date has begun at UTC+14 (`StatusTagsEpisodeFacts.EarliestDayLead`), refresh boundary = premiere − 14 h then the instant; large-container lookup queries premieres to now + 14 h. Schema 31.
- f3b837fa: native award captions via `StatusRules.Text` (awards keys as the web's CAPTION_KEYS; `text.locale` digest also when Awards shows); native shaping forces LTR for text without RTL letters (Arabic-Indic/Persian digits no longer reversed), RTL words unchanged (`PosterTextDirectionTests`). Resolver 19.

### Round 7-8 builds (reviewed in round 8)
- 5280c9d3: Complete Season needs proof (TMDB per-season episode count `SeriesSchedule.SeasonEpisodes`, parsed from `tv/{id}` seasons and served as `seasonEpisodes` by status-tags/series; every episode aired; library holds that many up to the last) — `StatusRules.SeasonComplete`, `seasonComplete` in statustags.js; Series Finale uses TMDB's final regular episode before the local aggregate (`FinalRegularEpisode` / `finalRegularEpisode`). Parity status fixtures for one-of-ten, future episode, missing middle, later season airing, TMDB finale identity. Resolver 20.
- 11a8c264: series-only edits (scores, age rating) reapply inheritance to cached seasons/episodes from their own metadata (`Services/TagCacheInheritance.cs`: `InheritFromSeries`, `PatchInheritedFacts`, hooked in `RebuildEntry` for Series); build path shares `InheritFromSeries`.
- e53fb940: native text bidi (`Services/PosterTags/Rendering/PosterTagBidi.cs`, UAX #9 without embeddings: first-strong paragraph, W1–W7, N1/N2, I1/I2, L2 reorder) before font segmentation; HarfBuzz shapes each run in its resolved direction; `PosterTextDirectionTests` (Hebrew + number, Latin in RTL, Arabic date, brackets, digits).

### Round 8-9 builds (reviewed in round 9)
- 6c486212: browser Bands fixture measures Season Premiere (Complete Season now needs TMDB counts).
- 7f11b9fb: `TagAddedSpan.CoveredThrough` (highest N with every episode 1..N; multi-episode files via IndexNumberEnd cover their range, duplicates count once; null when the bounded large-season lookup ran) and Complete Season needs it ≥ TMDB's count; Series Finale's library fallback needs TMDB per-season counts showing it is the last episode of the last season. Schema 32, resolver 21.
- d2c97c6e: carrier table (`CARRIERS` / `QualityTagRules.Carriers`): a title can refine its stream codec's carrier but never contradict it (AC-3 "Atmos" → Dolby Digital; AAC "DTS" → no codec chip); candidates refined → title → codec. Truth table 69 cases. Schema 33, resolver 22, naming 13.
- adad9b24: bidi N0 paired brackets; native on-demand memo drops a series' children on a series event.
- c95d1173: production inventory lists the new services.

### Round 9-10 builds (reviewed in round 10)
- c538f785: title channel layouts count only when the track's Channels is unknown or equals the title's bed or bed+height (`trackChannels` / `AgreesWithCount`); Atmos carrier from the stream codec first (E-AC-3 JOC titled TrueHD → DD+ ATMOS); legacy (version-0) title codec bound by the carrier table and legacy layout signals bounded by the reported count. Truth table 75 cases. Schema 34, resolver 23, naming 14.
- 0f67e237: full-build episode memo keeps IndexNumberEnd (`EpisodePlacement`, `IndexedEpisode`); a combined file counts as its last episode for LatestIndex/IsLast and its first for the season premiere; finale fallback keeps the air date's calendar day (UTC date) on web and native. Schema 35, resolver 24.
- 42dae8e8: disc-structure source (`MediaNamingTags.DiscSource`: VideoType/IsoType BluRay/Dvd) when names carry none; `TagMediaSource.Is3D` from Video3DFormat (web also reads item `Video3DFormat`); translation coverage counts 865 Media Tags strings, with a test that every string the Media Tags code asks for is counted. Schema 36, resolver 25, naming 15.
