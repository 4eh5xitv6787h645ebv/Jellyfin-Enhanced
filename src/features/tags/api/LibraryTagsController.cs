using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using System.Security.Cryptography;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Microsoft.EntityFrameworkCore;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class LibraryTagsController : UserControllerBase
    {
        private readonly IUserDataManager _userDataManager;
        private readonly ILibraryManager _libraryManager;
        private readonly UserConfigurationManager _userConfigurationManager;
        private readonly Services.TagCacheService _tagCacheService;
        private readonly Services.SpoilerUserResolver _spoilerResolver;

        public LibraryTagsController(
            IUserDataManager userDataManager,
            ILibraryManager libraryManager,
            UserConfigurationManager userConfigurationManager,
            Services.TagCacheService tagCacheService,
            Services.SpoilerUserResolver spoilerResolver,
            IUserManager userManager) : base(userManager)
        {
            _userDataManager = userDataManager;
            _libraryManager = libraryManager;
            _userConfigurationManager = userConfigurationManager;
            _tagCacheService = tagCacheService;
            _spoilerResolver = spoilerResolver;
        }

        /// <summary>
        /// Admin-triggered full tag cache rebuild (config page button). Unlike the
        /// "Refresh Tag Cache" scheduled task, which only rebuilds items Jellyfin
        /// has re-saved since the last run, this always recomputes every item —
        /// the only way to pick up a tag-computation change (e.g. a plugin update)
        /// for items nobody has actually edited. Runs in the background; the
        /// existing cache keeps serving requests until the new one is ready and
        /// the on-disk file is atomically replaced.
        /// </summary>
        [HttpPost("tag-cache/rebuild")]
        [Authorize]
        public IActionResult RebuildTagCache()
        {
            if (!IsAdminUser()) return Forbid();

            if (JellyfinEnhanced.Instance?.Configuration?.TagCacheServerMode != true)
            {
                return BadRequest(new { success = false, message = "Server-Side Tag Cache is disabled." });
            }

            if (!_tagCacheService.TryStartManualFullRebuild())
            {
                return Conflict(new { success = false, message = "A tag cache rebuild is already in progress." });
            }

            return Ok(new { success = true, message = "Tag cache rebuild started in the background." });
        }

        [HttpGet("tag-cache/{userId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetTagCache(Guid userId, [FromQuery] long? since = null)
        {
            if (JellyfinEnhanced.Instance?.Configuration?.TagCacheServerMode != true)
            {
                return NotFound();
            }

            var authorizationResult = AuthorizeUserAccess(userId, out var user);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            // Version/timestamp come from the same generation capture as the
            // cache contents (see GetCacheForUser): a cursor newer than the
            // returned items would let clients skip updates permanently, and a
            // mixed pre-publish stamp (timestamp 0) would disable their delta
            // refresh entirely.
            var items = _tagCacheService.GetCacheForUser(user, out var cacheVersion, out var cacheTimestamp, since);

            // Spoiler Guard tag-strip: when SpoilerBlur is on with any tag-relevant
            // strip toggle, walk the cache and zero out matching fields for unwatched
            // episodes whose parent series is in the spoiler list. Needed because the
            // JE tag-pipeline reads serverCache BEFORE GetTagData, so card overlays
            // would still leak despite the toggle. Mirrors the per-batch strip in GetTagData.
            var spCfg = JellyfinEnhanced.Instance?.Configuration;
            // Each overlay has its own admin toggle; enter the block if ANY is on,
            // then gate each field individually below. Gating only on SpoilerStripTags
            // would silently leak ratings for users who enabled rating-strip but not tag-strip.
            var stripGenresEnabled = spCfg?.SpoilerStripTags == true;
            var stripRatingsEnabled = spCfg?.SpoilerStripRatings == true;
            // Title replacement alone must also trigger the strip so StreamData's
            // title-bearing fields don't leak the episode title via the tag-cache pipeline.
            var sanitizeTitleStreams = spCfg?.SpoilerReplaceTitle == true || spCfg?.SpoilerStripOverview == true;
            var anyStripEnabled = stripGenresEnabled || stripRatingsEnabled || sanitizeTitleStreams;
            if (spCfg?.SpoilerBlurEnabled == true && anyStripEnabled)
            {
                // Strict-read so corruption is observable (rate-limited
                // warn) rather than silently passing through.
                UserSpoilerBlur? spState = LoadSpoilerStateForTagStrip(userId);

                if (spState != null && (spState.Series.Count > 0 || spState.Movies.Count > 0 || spState.Collections.Count > 0))
                {
                    // Apply per-user override prefs on top of admin policy — the same
                    // "user opt-out wins" contract as SpoilerFieldStripFilter. Prefs is
                    // per-user (constant this request), so recompute the flags once here.
                    // (null override = inherit admin = strip.)
                    var spPrefs = spState.Prefs;
                    stripGenresEnabled = stripGenresEnabled && (spPrefs?.HideTags ?? true);
                    stripRatingsEnabled = stripRatingsEnabled && (spPrefs?.HideRatings ?? true);
                    sanitizeTitleStreams =
                        (spCfg?.SpoilerReplaceTitle == true && (spPrefs?.ReplaceEpisodeTitles ?? true))
                        || (spCfg?.SpoilerStripOverview == true && (spPrefs?.HideEpisodeDescriptions ?? true));

                    foreach (var kvp in items.ToList())
                    {
                        var entry = kvp.Value;
                        if (entry == null) continue;
                        var isEpisode = string.Equals(entry.Type, "Episode", StringComparison.Ordinal);
                        var isSeason = string.Equals(entry.Type, "Season", StringComparison.Ordinal);
                        var isMovie = string.Equals(entry.Type, "Movie", StringComparison.Ordinal);
                        var isSeries = string.Equals(entry.Type, "Series", StringComparison.Ordinal);
                        if (!isEpisode && !isSeason && !isMovie && !isSeries) continue;
                        if (isMovie)
                        {
                            // In scope if directly in Movies dict OR a child of an opted-in collection.
                            if (!Guid.TryParse(kvp.Key, out var mGuid)) continue;
                            if (!_spoilerResolver.IsMovieInSpoilerScope(spState, mGuid)) continue;
                        }
                        else if (isSeries)
                        {
                            // Series-level entry: strip only when Spoiler Guard is on for
                            // THIS series (key == series ID). Covers home-rail cards bound
                            // to seriesId when "Use episode images in Next Up/Continue Watching"
                            // is OFF, so cards use series posters and ask for series-level tag data.
                            if (!spState.Series.ContainsKey(kvp.Key)) continue;
                        }
                        else
                        {
                            if (string.IsNullOrEmpty(entry.SeriesId)) continue;
                            if (!spState.Series.ContainsKey(entry.SeriesId)) continue;
                        }

                        // Played state via IUserDataManager (in-memory, no disk hit;
                        // works on (user, itemId) directly, no per-entry library lookup).
                        // Episodes: Played == true skips the strip. Seasons: IndexNumber<=1
                        // OR any-episode-watched skips (mirrors SpoilerBlurImageFilter and
                        // SpoilerFieldStripFilter Season blur logic).
                        if (Guid.TryParse(kvp.Key, out var entryGuid))
                        {
                            var entryItem = _libraryManager.GetItemById<MediaBrowser.Controller.Entities.BaseItem>(entryGuid);
                            if (entryItem != null)
                            {
                                if (isEpisode)
                                {
                                    var ud = _userDataManager.GetUserData(user, entryItem);
                                    if (ud?.Played == true) continue;
                                }
                                else if (isMovie)
                                {
                                    var ud = _userDataManager.GetUserData(user, entryItem);
                                    if (ud?.Played == true) continue;
                                }
                                else if (isSeason
                                    && entryItem is MediaBrowser.Controller.Entities.TV.Season seasonItem)
                                {
                                    var sNum = seasonItem.IndexNumber.GetValueOrDefault(int.MaxValue);
                                    // S0/S1 posters always pass (their existence isn't a
                                    // spoiler), as do seasons with any watched episode — "exempt".
                                    bool seasonExempt = sNum <= 1;
                                    if (!seasonExempt)
                                    {
                                        bool anyWatched = false;
                                        try
                                        {
                                            foreach (var ep in seasonItem.GetEpisodes(user, new MediaBrowser.Controller.Dto.DtoOptions(false), shouldIncludeMissingEpisodes: false))
                                            {
                                                if (ep == null) continue;
                                                var ud = _userDataManager.GetUserData(user, ep);
                                                if (ud?.Played == true) { anyWatched = true; break; }
                                            }
                                        }
                                        catch (Exception ex)
                                        {
                                            _spoilerResolver.WarnRateLimited(
                                                "tagcache-season-probe:" + ex.GetType().FullName,
                                                $"Spoiler Guard tag-cache strip: season any-watched probe failed for {seasonItem.Id}: {ex.Message}");
                                            // Fail-CLOSED: assume not watched, proceed to strip.
                                        }
                                        seasonExempt = anyWatched;
                                    }
                                    if (seasonExempt)
                                    {
                                        // Exempt seasons keep their poster + non-rating tags,
                                        // but a season carries only the series-FALLBACK rating
                                        // (hidden on the guarded series everywhere else). Strip
                                        // just the rating so it can't surface via the server tag cache.
                                        if (stripRatingsEnabled
                                            && (entry.CommunityRating != null || entry.CriticRating != null))
                                        {
                                            var seasonStripped = entry.Clone();
                                            seasonStripped.CommunityRating = null;
                                            seasonStripped.CriticRating = null;
                                            items[kvp.Key] = seasonStripped;
                                        }
                                        continue;
                                    }
                                }
                            }
                        }
                        else
                        {
                            // Rate-limited warn so a future TagCacheService key-format
                            // change is observable rather than silently stripping every rail.
                            _spoilerResolver.WarnRateLimited(
                                "tagcache-key-not-guid",
                                $"Spoiler Guard tag-cache strip: TagCacheService key '{kvp.Key}' did not parse as Guid; played-state check skipped. Possible cache-key format change.");
                        }

                        // TagCacheService stores ONE shared TagCacheEntry per item across
                        // ALL users. Mutating in place would leak this user's strip into
                        // every other user's cache response (and their own later watched
                        // response, until rebuild). Clone before mutating.
                        var stripped = entry.Clone();
                        if (stripGenresEnabled)
                        {
                            stripped.Genres = System.Array.Empty<string>();
                            stripped.AudioLanguages = null;
                            stripped.StreamData = null;
                        }
                        if (stripRatingsEnabled)
                        {
                            stripped.CommunityRating = null;
                            stripped.CriticRating = null;
                        }
                        // When StreamData wasn't already wiped by tag-strip but title
                        // replacement / overview strip is on, sanitize its title-bearing
                        // fields. Clone StreamData (same cross-user-mutation hazard).
                        // qualitytags.js recomputes overlay text from Codec/Height/
                        // VideoRangeType, so dropping DisplayTitle/ItemName/paths is acceptable.
                        if (sanitizeTitleStreams && stripped.StreamData != null && !stripGenresEnabled)
                        {
                            var sd = stripped.StreamData;
                            var clonedSd = new Jellyfin.Plugin.JellyfinEnhanced.Model.TagStreamData
                            {
                                ItemName = null,
                                ItemPath = null,
                                Streams = sd.Streams?.Select(st => new Jellyfin.Plugin.JellyfinEnhanced.Model.TagMediaStream
                                {
                                    Type = st.Type,
                                    Language = st.Language,
                                    Codec = st.Codec,
                                    CodecTag = st.CodecTag,
                                    Profile = st.Profile,
                                    Height = st.Height,
                                    Channels = st.Channels,
                                    ChannelLayout = st.ChannelLayout,
                                    VideoRangeType = st.VideoRangeType,
                                    DisplayTitle = null,
                                }).ToList(),
                                Sources = sd.Sources?.Select(_ => new Jellyfin.Plugin.JellyfinEnhanced.Model.TagMediaSource
                                {
                                    Path = null,
                                    Name = null,
                                }).ToList(),
                            };
                            stripped.StreamData = clonedSd;
                        }
                        items[kvp.Key] = stripped;
                    }
                }
            }

            var payload = new
            {
                version = cacheVersion,
                timestamp = cacheTimestamp,
                count = items.Count,
                items
            };

            // ETag is a hash of the FINAL response body (post Spoiler Guard strip above),
            // not of cacheVersion. Two users at the same version can legitimately receive
            // different stripped bodies, and an ETag keyed on version alone would let one
            // user's stripped body satisfy another user's conditional request.
            var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload);
            var hash = SHA256.HashData(payloadBytes);
            var etag = $"\"{Convert.ToHexString(hash)}\"";

            // no-cache (not no-store): the client may keep a copy to revalidate against,
            // but must always revalidate. Freshness is unchanged, this only avoids
            // re-sending an unchanged multi-MB body.
            Response.Headers["Cache-Control"] = "private, no-cache";
            Response.Headers["ETag"] = etag;

            if (Request.Headers.TryGetValue("If-None-Match", out var ifNoneMatch)
                && ifNoneMatch.ToString().Contains(etag, StringComparison.Ordinal))
            {
                return StatusCode(304);
            }

            return Ok(payload);
        }

        [HttpPost("tag-data/{userId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult GetTagData(
            Guid userId,
            [FromBody] string[] ids,
            [FromQuery] string? mediaSourceId = null)
        {
            var authorizationResult = AuthorizeUserAccess(userId, out var user);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            if (ids == null || ids.Length == 0)
            {
                return BadRequest(new { error = "ids array required" });
            }

            if (ids.Length > 200)
            {
                return BadRequest(new { error = "Maximum 200 items per request" });
            }

            // A selected version must go through the same projection as the normal
            // tag-data path. Filtering here prevents details-page callers from
            // bypassing MediaStreamLanguageResolver and losing Matroska BCP-47
            // regions (for example en-US -> eng).
            //
            // Keeping this selection inside tag-data also means future callers do
            // not need a second language-resolution implementation.
            List<MediaSourceInfo> SelectTagDataMediaSources(
                IEnumerable<MediaSourceInfo> sources)
            {
                if (string.IsNullOrWhiteSpace(mediaSourceId))
                {
                    return sources.ToList();
                }

                return sources
                    .Where(source => string.Equals(
                        source.Id,
                        mediaSourceId,
                        StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            // Spoiler Guard short-circuit: when the master switch + any tag-relevant
            // strip toggle are on and the user has entries in their spoiler list, skip
            // tag data for unwatched episodes. Loaded once per request (not per item).
            UserSpoilerBlur? spoilerState = null;
            var spoilerCfg = JellyfinEnhanced.Instance?.Configuration;
            var spStripGenres = spoilerCfg?.SpoilerStripTags == true;
            var spStripRatings = spoilerCfg?.SpoilerStripRatings == true;
            // Title replacement / overview strip MUST also enter the stub path, else
            // the non-stub projection leaks raw item.Path / DisplayTitle / MediaSource
            // path+name despite SpoilerReplaceTitle — closing this per-batch endpoint too.
            var spReplaceTitle = spoilerCfg?.SpoilerReplaceTitle == true;
            var spStripOverview = spoilerCfg?.SpoilerStripOverview == true;
            var stripTagsEnabled = spoilerCfg?.SpoilerBlurEnabled == true
                && (spStripGenres || spStripRatings || spReplaceTitle || spStripOverview);
            if (stripTagsEnabled)
            {
                spoilerState = LoadSpoilerStateForTagStrip(userId);
                // Empty lists = nothing to strip; treat as off. Check all three dicts,
                // not just Series.Count, so a movies-only user isn't short-circuited.
                // Mirrors the GetTagCache + image-filter checks.
                if (spoilerState == null || (spoilerState.Series.Count == 0 && spoilerState.Movies.Count == 0 && spoilerState.Collections.Count == 0))
                {
                    stripTagsEnabled = false;
                }
                else
                {
                    // Honour per-category overrides on top of admin policy (same
                    // "opt-out wins" contract as ShouldStrip) on this endpoint too.
                    var tdPrefs = spoilerState.Prefs;
                    spStripGenres = spStripGenres && (tdPrefs?.HideTags ?? true);
                    spStripRatings = spStripRatings && (tdPrefs?.HideRatings ?? true);
                    spReplaceTitle = spReplaceTitle && (tdPrefs?.ReplaceEpisodeTitles ?? true);
                    spStripOverview = spStripOverview && (tdPrefs?.HideEpisodeDescriptions ?? true);
                    // Re-evaluate the master gate: if the user opted out of
                    // everything the admin enabled, there's nothing left to do.
                    stripTagsEnabled = spStripGenres || spStripRatings || spReplaceTitle || spStripOverview;
                }
            }

            var itemIds = ids;
            var results = new List<object>(itemIds.Length);

            // Process items sequentially (Jellyfin library manager is not fully thread-safe for GetMediaSources)
            foreach (var idStr in itemIds)
            {
                if (!Guid.TryParse(idStr.Trim(), out var itemId))
                    continue;

                var item = _libraryManager.GetItemById<BaseItem>(itemId, user);
                if (item == null)
                    continue;

                var kind = item.GetBaseItemKind();
                var isContainer = kind == BaseItemKind.Series || kind == BaseItemKind.Season;

                // Spoiler Guard tag-strip: for an unwatched Episode of a guarded
                // series, return an Id+Type-only stub so the frontend tag renderers
                // draw nothing. The pipeline still treats the item as processed
                // (no retry loop) — it just produces zero overlays.
                if (stripTagsEnabled
                    && spoilerState != null
                    && item is MediaBrowser.Controller.Entities.TV.Episode spEp
                    && spEp.SeriesId != Guid.Empty
                    && spoilerState.Series.ContainsKey(spEp.SeriesId.ToString("N")))
                {
                    var spUd = _userDataManager.GetUserData(user, spEp);
                    if (spUd?.Played != true)
                    {
                        // When SpoilerReplaceTitle is on, the field-strip filter rewrites
                        // Name to "Season X, Episode Y"; the stub must agree — leaking the
                        // raw Name here would defeat the title toggle.
                        string? stubName = item.Name;
                        if (spReplaceTitle
                            && spEp.IndexNumber.HasValue
                            && spEp.ParentIndexNumber.HasValue)
                        {
                            stubName = $"Season {spEp.ParentIndexNumber.Value}, Episode {spEp.IndexNumber.Value}";
                        }

                        // Compute MediaStreams when SpoilerStripTags is off so quality /
                        // language overlays still render under rating-only strip.
                        // MediaSources is intentionally LEFT NULL even then: it exposes
                        // filename + display name that commonly leak the raw episode title
                        // (e.g. "S05E14 - The Death of Optimus Prime.mkv"), defeating
                        // SpoilerReplaceTitle. Losing the IMAX/3D media-stub overlays on
                        // stripped episodes only is the correct trade-off.
                        List<object>? stubStreams = null;
                        List<object>? stubSources = null;
                        if (!spStripGenres)
                        {
                            var stubMediaSources =
                                SelectTagDataMediaSources(spEp.GetMediaSources(false));
                            stubStreams = stubMediaSources
                                .SelectMany(source => MediaStreamLanguageResolver.Resolve(source, spEp.Path))
                                .Where(resolved =>
                                    resolved.Stream.Type == MediaStreamType.Video
                                    || resolved.Stream.Type == MediaStreamType.Audio)
                                .Select(resolved =>
                                {
                                    var s = resolved.Stream;
                                    return (object)new
                                    {
                                        Type = s.Type.ToString(),
                                        Language = resolved.Language,
                                        Codec = s.Codec,
                                        CodecTag = s.CodecTag,
                                        Profile = s.Profile,
                                        Height = s.Height,
                                        Channels = s.Channels,
                                        ChannelLayout = s.ChannelLayout,
                                        VideoRangeType = s.VideoRangeType,
                                        // DisplayTitle's GETTER prepends the raw Title field,
                                        // which on user-muxed mkvs (MakeMKV / Plex / Sonarr
                                        // renamers) commonly carries the episode name — under
                                        // SpoilerReplaceTitle that leaks via the stream projection.
                                        // Null it; qualitytags.js recomputes overlay text from
                                        // Codec / Height / VideoRangeType / Profile, not Title.
                                        DisplayTitle = default(string?),
                                    };
                                })
                                .ToList();
                            // stubSources stays null — see comment above.
                        }

                        // Per-field strip: a field is preserved when its toggle is OFF,
                        // nulled when ON. SeriesId is nulled only when ratings are
                        // stripped (it controls the rating-fallback to the parent series).
                        results.Add(new
                        {
                            Id = item.Id,
                            Type = kind.ToString(),
                            Genres = spStripGenres ? Array.Empty<string>() : (spEp.Genres ?? Array.Empty<string>()),
                            CommunityRating = spStripRatings ? (float?)null : spEp.CommunityRating,
                            CriticRating = spStripRatings ? (float?)null : spEp.CriticRating,
                            // Suppress the parent-series rating fallback only when the
                            // rating strip is requested; leaving SeriesId set under tag-only
                            // strip lets the rating overlay keep rendering.
                            SeriesId = spStripRatings ? (Guid?)null : spEp.SeriesId,
                            ProviderIds = (IDictionary<string, string>?)null,
                            Name = stubName,
                            Path = (string?)null,
                            MediaStreams = stubStreams,
                            MediaSources = stubSources,
                            FirstEpisode = (object?)null,
                            // Align with the field-strip filter (which empties Tags).
                            Tags = spStripGenres ? Array.Empty<string>() : (spEp.Tags ?? Array.Empty<string>()),
                        });
                        continue;
                    }
                }

                // Series-stub: for a Series the user has Spoiler Guard on, return the
                // strip stub. Covers home-rail cards bound to seriesId — e.g. NextUp /
                // Continue Watching with "Use episode images" OFF, where cards show the
                // series poster and the JE tag pipeline fetches series-level tag data.
                if (stripTagsEnabled
                    && spoilerState != null
                    && item is MediaBrowser.Controller.Entities.TV.Series spSeries
                    && spoilerState.Series.ContainsKey(spSeries.Id.ToString("N")))
                {
                    string? stubName = item.Name;
                    if (spReplaceTitle)
                    {
                        // Series titles are rarely spoilery; replace only under the
                        // explicit title-strip toggle, matching the field-strip filter.
                        stubName = string.IsNullOrWhiteSpace(spoilerCfg!.SpoilerOverviewPlaceholder)
                            ? "Spoiler Guard activated"
                            : spoilerCfg.SpoilerOverviewPlaceholder;
                    }
                    results.Add(new
                    {
                        Id = item.Id,
                        Type = kind.ToString(),
                        Genres = spStripGenres ? Array.Empty<string>() : (spSeries.Genres ?? Array.Empty<string>()),
                        CommunityRating = spStripRatings ? (float?)null : spSeries.CommunityRating,
                        CriticRating = spStripRatings ? (float?)null : spSeries.CriticRating,
                        SeriesId = (Guid?)null,
                        ProviderIds = (IDictionary<string, string>?)null,
                        Name = stubName,
                        Path = (string?)null,
                        MediaStreams = (List<object>?)null,
                        MediaSources = (List<object>?)null,
                        FirstEpisode = (object?)null,
                        Tags = spStripGenres ? Array.Empty<string>() : (spSeries.Tags ?? Array.Empty<string>()),
                    });
                    continue;
                }

                // Movie-stub: for an unwatched Movie in the user's spoiler scope,
                // return the same Id+Type stub so JE tag overlays don't render on the
                // blurred poster. Mirrors the Episode stub.
                if (stripTagsEnabled
                    && spoilerState != null
                    && item is MediaBrowser.Controller.Entities.Movies.Movie spMovie
                    && _spoilerResolver.IsMovieInSpoilerScope(spoilerState, spMovie.Id))
                {
                    var spMovieUd = _userDataManager.GetUserData(user, spMovie);
                    if (spMovieUd?.Played != true)
                    {
                        // Movie title is NOT rewritten under SpoilerReplaceTitle — it stays
                        // visible in overlays/tooltips (matching the field-strip movie carve-out).
                        string? stubName = item.Name;

                        List<object>? stubStreams = null;
                        if (!spStripGenres)
                        {
                            var stubMs =
                                SelectTagDataMediaSources(spMovie.GetMediaSources(false));
                            stubStreams = stubMs
                                .SelectMany(source => MediaStreamLanguageResolver.Resolve(source, spMovie.Path))
                                .Where(resolved =>
                                    resolved.Stream.Type == MediaStreamType.Video
                                    || resolved.Stream.Type == MediaStreamType.Audio)
                                .Select(resolved =>
                                {
                                    var s = resolved.Stream;
                                    return (object)new
                                    {
                                        Type = s.Type.ToString(),
                                        Language = resolved.Language,
                                        Codec = s.Codec,
                                        CodecTag = s.CodecTag,
                                        Profile = s.Profile,
                                        Height = s.Height,
                                        Channels = s.Channels,
                                        ChannelLayout = s.ChannelLayout,
                                        VideoRangeType = s.VideoRangeType,
                                        DisplayTitle = default(string?),
                                    };
                                })
                                .ToList();
                        }

                        results.Add(new
                        {
                            Id = item.Id,
                            Type = kind.ToString(),
                            Genres = spStripGenres ? Array.Empty<string>() : (spMovie.Genres ?? Array.Empty<string>()),
                            CommunityRating = spStripRatings ? (float?)null : spMovie.CommunityRating,
                            CriticRating = spStripRatings ? (float?)null : spMovie.CriticRating,
                            SeriesId = (Guid?)null,
                            ProviderIds = (IDictionary<string, string>?)null,
                            Name = stubName,
                            Path = (string?)null,
                            MediaStreams = stubStreams,
                            MediaSources = (List<object>?)null,
                            FirstEpisode = (object?)null,
                            Tags = spStripGenres ? Array.Empty<string>() : (spMovie.Tags ?? Array.Empty<string>()),
                        });
                        continue;
                    }
                }

                // BoxSet (Collection) DTOs pass through unstripped: the collection's own
                // art is the entry point the user just clicked (like Series), so blurring
                // it would spoil their own navigation. Movies inside opted-in collections
                // are already handled by the Movie-stub via IsMovieInSpoilerScope.

                // Season stub: for a Season of a guarded series with no watched episode
                // and not S0/S1, return an Id+Type stub so JE tag overlays don't render
                // on the blurred season poster. Mirrors the field-strip filter's Season
                // strip + the image filter's HasWatchedAnyEpisodeInSeason gate.
                if (stripTagsEnabled
                    && spoilerState != null
                    && item is MediaBrowser.Controller.Entities.TV.Season spSeason
                    && spSeason.SeriesId != Guid.Empty
                    && spoilerState.Series.ContainsKey(spSeason.SeriesId.ToString("N")))
                {
                    var sNum = spSeason.IndexNumber.GetValueOrDefault(int.MaxValue);
                    if (sNum > 1)
                    {
                        bool anyWatched = false;
                        try
                        {
                            foreach (var ep in spSeason.GetEpisodes(user, new MediaBrowser.Controller.Dto.DtoOptions(false), shouldIncludeMissingEpisodes: false))
                            {
                                if (ep == null) continue;
                                var ud = _userDataManager.GetUserData(user, ep);
                                if (ud?.Played == true) { anyWatched = true; break; }
                            }
                        }
                        catch (Exception ex)
                        {
                            _spoilerResolver.WarnRateLimited(
                                "tagdata-season-probe:" + ex.GetType().FullName,
                                $"Spoiler Guard tag-data: season any-watched probe failed for {spSeason.Id}: {ex.Message}");
                            // Fail-CLOSED: assume not watched, proceed to stub.
                        }

                        if (!anyWatched)
                        {
                            string? stubName = item.Name;
                            if (spReplaceTitle && spSeason.IndexNumber.HasValue)
                            {
                                stubName = $"Season {spSeason.IndexNumber.Value}";
                            }
                            results.Add(new
                            {
                                Id = item.Id,
                                Type = kind.ToString(),
                                Genres = spStripGenres ? Array.Empty<string>() : (spSeason.Genres ?? Array.Empty<string>()),
                                CommunityRating = spStripRatings ? (float?)null : spSeason.CommunityRating,
                                CriticRating = spStripRatings ? (float?)null : spSeason.CriticRating,
                                SeriesId = spStripRatings ? (Guid?)null : spSeason.SeriesId,
                                ProviderIds = (IDictionary<string, string>?)null,
                                Name = stubName,
                                Path = (string?)null,
                                MediaStreams = (List<object>?)null,
                                MediaSources = (List<object>?)null,
                                FirstEpisode = (object?)null,
                                Tags = spStripGenres ? Array.Empty<string>() : (spSeason.Tags ?? Array.Empty<string>()),
                            });
                            continue;
                        }
                    }
                }

                // OPT-3: Only get media sources/streams for playable items (Movies, Episodes)
                // Series and Season are containers with no media files — skip the expensive call
                List<object>? trimmedStreams = null;
                List<object>? trimmedSources = null;
                if (!isContainer)
                {
                    var mediaSources =
                        SelectTagDataMediaSources(item.GetMediaSources(false));
                    // OPT-5: Only include fields tag renderers need from MediaStreams
                    trimmedStreams = mediaSources
                        .SelectMany(source => MediaStreamLanguageResolver.Resolve(source, item.Path))
                        .Where(resolved =>
                            resolved.Stream.Type == MediaStreamType.Video
                            || resolved.Stream.Type == MediaStreamType.Audio)
                        .Select(resolved =>
                        {
                            var s = resolved.Stream;
                            return (object)new
                            {
                                Type = s.Type.ToString(),
                                Language = resolved.Language,
                                Codec = s.Codec,
                                CodecTag = s.CodecTag,
                                Profile = s.Profile,
                                Height = s.Height,
                                Channels = s.Channels,
                                ChannelLayout = s.ChannelLayout,
                                VideoRangeType = s.VideoRangeType,
                                DisplayTitle = s.DisplayTitle,
                            };
                        })
                        .ToList();
                    // Include filenames only (not full paths) for IMAX/3D/media-stub detection.
                    // Full server paths are not exposed to avoid disclosing filesystem layout.
                    trimmedSources = mediaSources
                        .Select(s => (object)new
                        {
                            Path = string.IsNullOrEmpty(s.Path) ? null : System.IO.Path.GetFileName(s.Path),
                            Name = s.Name,
                        })
                        .ToList();
                }

                // First episode lookup for Series/Season
                object? firstEpisodeData = null;
                if (isContainer)
                {
                    // Inline the first-episode lookup to avoid cache/threading issues
                    var epQuery = new InternalItemsQuery(user)
                    {
                        ParentId = item.Id,
                        IncludeItemTypes = new[] { BaseItemKind.Episode },
                        Recursive = true,
                        Limit = 1,
                        OrderBy = new[] { (ItemSortBy.PremiereDate, JSortOrder.Ascending) }
                    };
                    var epRef = _libraryManager.GetItemList(epQuery).FirstOrDefault();
                    if (epRef != null)
                    {
                        // Return the first episode ID so the frontend can fetch streams
                        // via the native /Items endpoint (which reliably populates MediaStreams).
                        // Server-side GetMediaSources/DtoService doesn't populate streams for
                        // episodes obtained through GetItemList on Jellyfin 10.11.x.
                        firstEpisodeData = new
                        {
                            Id = epRef.Id,
                            Type = epRef.GetBaseItemKind().ToString(),
                            Genres = epRef.Genres,
                            NeedsStreamFetch = true
                        };
                    }
                }

                var seriesId = (item is MediaBrowser.Controller.Entities.TV.Episode epItem) ? epItem.SeriesId
                             : (item is MediaBrowser.Controller.Entities.TV.Season sItem) ? sItem.SeriesId
                             : (Guid?)null;

                results.Add(new
                {
                    Id = item.Id,
                    Type = kind.ToString(),
                    Genres = item.Genres,
                    CommunityRating = item.CommunityRating,
                    CriticRating = item.CriticRating,
                    SeriesId = seriesId,
                    ProviderIds = item.ProviderIds,
                    Name = item.Name,
                    Path = string.IsNullOrEmpty(item.Path) ? null : System.IO.Path.GetFileName(item.Path),
                    MediaStreams = trimmedStreams,
                    MediaSources = trimmedSources,
                    FirstEpisode = firstEpisodeData
                });
            }

            return Ok(new { Items = results });
        }

        // Tag-cache + tag-data both load the user's spoiler state. Strict-read so
        // corruption is detected (rate-limited warn), then fall back to null so the
        // strip silently no-ops rather than 503-ing the unrelated tag-cache request —
        // the user's own /spoiler-blur/series endpoint will 503 next call. See
        // IsMovieInSpoilerScope for scope semantics (direct or via opted-in BoxSet).

        private UserSpoilerBlur? LoadSpoilerStateForTagStrip(Guid userId)
        {
            var userKey = userId.ToString("N");
            var fileName = Services.SpoilerBlurImageFilter.SpoilerBlurFileName;
            if (!_userConfigurationManager.UserConfigurationExists(userKey, fileName))
            {
                return null;
            }
            try
            {
                return _userConfigurationManager.GetUserConfigurationStrict<UserSpoilerBlur>(userKey, fileName);
            }
            catch (InvalidDataException ex)
            {
                _spoilerResolver.WarnRateLimited(
                    "tagstrip-corrupt:" + userKey,
                    $"Spoiler Guard tag-strip: spoilerblur.json corrupt for {ResolveUserDisplay(userKey)} (backed up): {ex.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, ResolveUserDisplay(userKey), ex.Message);
                return null;
            }
            catch (Newtonsoft.Json.JsonException ex)
            {
                _spoilerResolver.WarnRateLimited(
                    "tagstrip-corrupt:" + userKey,
                    $"Spoiler Guard tag-strip: spoilerblur.json corrupt for {ResolveUserDisplay(userKey)} (backed up): {ex.Message}");
                Services.SpoilerUserResolver.RecordCorruption(userKey, ResolveUserDisplay(userKey), ex.Message);
                return null;
            }
            catch (IOException ex)
            {
                _spoilerResolver.WarnRateLimited(
                    "tagstrip-io:" + ex.GetType().FullName,
                    $"Spoiler Guard tag-strip: IO error reading state for {ResolveUserDisplay(userKey)}: {ex.Message}");
                return null;
            }
            catch (Exception ex)
            {
                // The specific catches above handle InvalidData/Json/IOException.
                // Others (UnauthorizedAccess from a chmod-mangled config dir, Security,
                // PathTooLong, DirectoryNotFound) would otherwise escape and 500 the whole
                // tag-cache/tag-data request, breaking every client's tag rail on every poll.
                // Catch-all returns null (skip strip) with rate-limited warn so a real
                // failure mode stays observable without taking down the unrelated surface.
                _spoilerResolver.WarnRateLimited(
                    "tagstrip-unexpected:" + ex.GetType().FullName,
                    $"Spoiler Guard tag-strip: unexpected {ex.GetType().Name} reading state for {ResolveUserDisplay(userKey)}: {ex.Message}");
                return null;
            }
        }
    }
}
