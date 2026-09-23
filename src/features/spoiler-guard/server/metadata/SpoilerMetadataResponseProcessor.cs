using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model.Search;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using CategoryReveal = Jellyfin.Plugin.JellyfinEnhanced.Services.SpoilerFieldStripFilter.CategoryReveal;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Traverses supported response shapes and selects protected items using user scope and watched state.
    /// </summary>
    internal sealed class SpoilerMetadataResponseProcessor
    {
        private readonly SpoilerUserResolver _resolver;
        private readonly ILibraryManager _libraryManager;
        private readonly SpoilerNextUnwatchedService _nextUnwatched;
        private readonly SpoilerMetadataWatchState _watchState;
        private readonly SpoilerMetadataSanitizer _sanitizer;

        internal SpoilerMetadataResponseProcessor(SpoilerUserResolver resolver, ILibraryManager libraryManager,
            IUserManager userManager, IUserDataManager userDataManager, SpoilerNextUnwatchedService nextUnwatched)
        {
            _resolver = resolver;
            _libraryManager = libraryManager;
            _nextUnwatched = nextUnwatched;
            _watchState = new SpoilerMetadataWatchState(resolver, libraryManager, userManager, userDataManager);
            _sanitizer = new SpoilerMetadataSanitizer(_watchState);
        }

        // Walks the action result and applies StripItem to every Episode
        // whose SeriesId is in the user's spoiler list AND whose
        // UserData.Played != true.
        internal void StripIfApplicable(
            IActionResult? result,
            UserSpoilerBlur userState,
            PluginConfiguration cfg,
            Guid userId,
            ActionExecutingContext context)
        {
            // ObjectResult covers most MVC return shapes, but JsonResult /
            // ContentResult / custom IActionResult are siblings (not
            // subclasses). Generalize: log any non-null, non-ObjectResult
            // shape with the type name as the rate-limit key so a future
            // Jellyfin upgrade is observable.
            if (result == null) return;
            if (result is not ObjectResult objectResult)
            {
                _resolver.WarnRateLimited(
                    "fieldstrip-shape:" + result.GetType().FullName,
                    $"Spoiler Guard field strip: action returned {result.GetType().Name}; strip is no-op for that shape. Likely a Jellyfin upgrade — switch to {result.GetType().Name}-aware extraction.");
                return;
            }
            if (objectResult.Value == null) return;

            switch (objectResult.Value)
            {
                case BaseItemDto single:
                    StripItem(single, userState, cfg, userId);
                    break;
                case QueryResult<BaseItemDto> qr:
                    if (qr.Items != null)
                    {
                        foreach (var item in qr.Items) StripItem(item, userState, cfg, userId);
                    }
                    break;
                case IEnumerable<BaseItemDto> seq:
                    // Many controllers (e.g. UserLibrary.GetLatestMedia,
                    // Items.GetItems via .Select projections) return a
                    // lazy LINQ Select iterator that materializes a NEW
                    // BaseItemDto on every enumeration. If we just
                    // iterate-and-mutate, MVC re-iterates at serialization
                    // time and gets a fresh unstripped DTO — our mutations
                    // are lost. Materialize and write back so MVC
                    // serializes our stripped copies.
                    var list = seq is List<BaseItemDto> alreadyList
                        ? alreadyList
                        : seq.ToList();
                    foreach (var item in list) StripItem(item, userState, cfg, userId);
                    if (!ReferenceEquals(list, seq))
                    {
                        objectResult.Value = list;
                    }
                    break;
                case SearchHintResult shr:
                    StripSearchHints(shr, userState, cfg, userId);
                    break;
                // ImageInfo[] from /Items/{id}/Images. Path is raw
                // filesystem. Look up the parent itemId from the route to
                // determine if its series is in the spoiler list.
                case IEnumerable<MediaBrowser.Model.Dto.ImageInfo> imgs:
                    StripImageInfos(imgs, userState, cfg, userId, context);
                    break;
                // Movies.GetMovieRecommendations returns a list of
                // RecommendationDto wrappers, each holding a
                // BaseItemDto[]. Walk both layers.
                case IEnumerable<MediaBrowser.Model.Dto.RecommendationDto> recs:
                    foreach (var rec in recs)
                    {
                        if (rec?.Items == null) continue;
                        foreach (var item in rec.Items) StripItem(item, userState, cfg, userId);
                    }
                    break;
                // PlaybackInfoResponse contains MediaSources[] with the
                // same title-bearing fields as BaseItemDto's MediaSources.
                case MediaBrowser.Model.MediaInfo.PlaybackInfoResponse pbi:
                    StripPlaybackInfo(pbi, userState, cfg, userId, context);
                    break;
                default:
                    // Route was in the allowlist (so we *believed* it
                    // returned a spoilable DTO shape) but the runtime
                    // shape didn't match any case arm. Two common causes:
                    // (a) Jellyfin upgrade introduced a new wrapper shape,
                    // (b) controller's return changed signature
                    // (e.g. ActionResult<X> → Foo). Rate-limited so a hot
                    // route with the new shape doesn't spam logs — one
                    // warn per (Controller, Action, ValueType) per process
                    // lifetime via the resolver's rate-limit map.
                    var rv = context.ActionDescriptor.RouteValues;
                    var ctrl = rv != null && rv.TryGetValue("controller", out var c) ? c : "?";
                    var act = rv != null && rv.TryGetValue("action", out var a) ? a : "?";
                    _resolver.WarnRateLimited(
                        $"fieldstrip-unknown-shape:{ctrl}.{act}:{objectResult.Value.GetType().FullName}",
                        $"Spoiler Guard field strip: route {ctrl}.{act} returned shape {objectResult.Value.GetType().FullName} — no case arm matched, strip silently skipped. Likely a Jellyfin upgrade. Add a case arm in StripIfApplicable to cover this shape.");
                    break;
            }
        }

        // Extractor for /Items/{id}/Images. ImageInfo doesn't carry
        // SeriesId, so we look up the parent item via the route's `itemId`
        // and check its series-list membership.
        private void StripImageInfos(
            IEnumerable<MediaBrowser.Model.Dto.ImageInfo> imgs,
            UserSpoilerBlur userState,
            PluginConfiguration cfg,
            Guid userId,
            ActionExecutingContext context)
        {
            if (!RouteParentIsSpoilerEpisode(context, userState, userId, out _)) return;
            // Auxiliary "scrub title-bearing fields" path — only relevant when a
            // title/overview strip is actually going to run for this user. Mirror
            // the same admin-cap + user-opt-out semantics as ApplyStripping.
            if (!SpoilerMetadataSanitizer.ShouldStrip(cfg.SpoilerReplaceTitle, userState.Prefs?.ReplaceEpisodeTitles)
                && !SpoilerMetadataSanitizer.ShouldStrip(cfg.SpoilerStripOverview, userState.Prefs?.HideEpisodeDescriptions)) return;

            foreach (var info in imgs)
            {
                if (info == null) continue;
                info.Path = null;
            }
        }

        // Extractor for /Items/{id}/PlaybackInfo. Walks
        // PlaybackInfoResponse.MediaSources and applies the same
        // MediaSourceInfo-level strip as ApplyStripping does for
        // BaseItemDto.MediaSources.
        private void StripPlaybackInfo(
            MediaBrowser.Model.MediaInfo.PlaybackInfoResponse pbi,
            UserSpoilerBlur userState,
            PluginConfiguration cfg,
            Guid userId,
            ActionExecutingContext context)
        {
            if (pbi.MediaSources == null) return;
            if (!RouteParentIsSpoilerEpisode(context, userState, userId, out var isMovie)) return;
            // Same scrubbing gate as StripImageInfos — honor the user's opt-outs.
            if (!SpoilerMetadataSanitizer.ShouldStrip(cfg.SpoilerReplaceTitle, userState.Prefs?.ReplaceEpisodeTitles)
                && !SpoilerMetadataSanitizer.ShouldStrip(cfg.SpoilerStripOverview, userState.Prefs?.HideEpisodeDescriptions)) return;

            SpoilerMediaSourceSanitizer.StripSources(pbi.MediaSources, preserveVersionName: isMovie);
        }

        // Look up the parent item from the route's itemId value and
        // confirm it's an Episode (or Season) of a spoiler-list series
        // the user hasn't watched.
        private bool RouteParentIsSpoilerEpisode(
            ActionExecutingContext context,
            UserSpoilerBlur userState,
            Guid userId,
            out bool isMovie)
        {
            isMovie = false;
            try
            {
                var routeValues = context.HttpContext.Request.RouteValues;
                if (!routeValues.TryGetValue("itemId", out var idObj) || idObj == null)
                {
                    return false;
                }
                if (!Guid.TryParse(idObj.ToString(), out var itemId) || itemId == Guid.Empty)
                {
                    return false;
                }
                var parent = _libraryManager.GetItemById(itemId);
                if (parent == null) return false;

                Guid? seriesId = null;
                bool watchedCheck = true;
                // Movies path. Movie's spoiler-list membership is keyed
                // by movie ID (not by SeriesId), and watched-state is the
                // movie's own UserData.Played. Mirrors StripItem.
                if (parent is MediaBrowser.Controller.Entities.Movies.Movie movieParent)
                {
                    isMovie = true;
                    if (!_resolver.IsMovieInSpoilerScope(userState,movieParent.Id)) return false;
                    if (_watchState.ResolvePlayedServerSide(userId, itemId)) return false;
                    return true;
                }
                if (parent is MediaBrowser.Controller.Entities.TV.Episode ep)
                {
                    seriesId = ep.SeriesId;
                }
                else if (parent is MediaBrowser.Controller.Entities.TV.Season s)
                {
                    seriesId = s.SeriesId;
                    watchedCheck = false; // Season any-watched check is too costly here; over-strip.
                }
                else
                {
                    // Extras (Trailer / Video / Intro / etc.) attached to
                    // a spoiler-list series. Mirrors the isExtra path in
                    // StripItem. Use the BaseItem's SeriesId
                    // (`SeriesPresentationUniqueKey`-related — fall back
                    // to ParentId lookup if absent).
                    Guid extraSeriesId = Guid.Empty;
                    var hasSeriesProp = parent.GetType().GetProperty("SeriesId");
                    if (hasSeriesProp != null
                        && hasSeriesProp.GetValue(parent) is Guid sid
                        && sid != Guid.Empty)
                    {
                        extraSeriesId = sid;
                    }
                    else if (parent.ParentId != Guid.Empty)
                    {
                        // Walk up the parent chain until we find a Series.
                        var ancestor = _libraryManager.GetItemById(parent.ParentId);
                        var hops = 0;
                        while (ancestor != null && hops < 4)
                        {
                            if (ancestor is MediaBrowser.Controller.Entities.TV.Series ser)
                            {
                                extraSeriesId = ser.Id;
                                break;
                            }
                            if (ancestor.ParentId == Guid.Empty) break;
                            ancestor = _libraryManager.GetItemById(ancestor.ParentId);
                            hops++;
                        }
                    }
                    if (extraSeriesId == Guid.Empty) return false;
                    seriesId = extraSeriesId;
                    watchedCheck = false; // Extras have no per-extra watched flag — over-strip.
                }

                if (!seriesId.HasValue || seriesId.Value == Guid.Empty) return false;
                if (!userState.Series.ContainsKey(seriesId.Value.ToString("N"))) return false;

                if (watchedCheck && _watchState.ResolvePlayedServerSide(userId, itemId)) return false;
                return true;
            }
            catch (Exception ex)
            {
                _resolver.WarnRateLimited(
                    "fieldstrip-route-parent:" + ex.GetType().FullName,
                    $"Spoiler Guard field strip: parent-route lookup failed: {ex.Message}");
                // Fail CLOSED: better to over-strip than leak.
                return true;
            }
        }

        // Per-item strip. Mutates `item` in place when applicable; no-op otherwise.
        private void StripItem(BaseItemDto item, UserSpoilerBlur userState, PluginConfiguration cfg, Guid userId)
        {
            if (item == null) return;

            // Series path: when the item is the Series itself (Series detail
            // page = /Items/{seriesId}), strip cast / overview / tags / etc.
            // for the series-level DTO when the user has Spoiler Guard on
            // for it. Crucial for the Cast & Crew rail on series detail
            // pages —
            // an unexpected guest star or recurring villain on the series-
            // level cast is a major spoiler. No watched-state check (a
            // series doesn't have one), no Name rewrite (series titles are
            // OK to surface — it's the per-item plot detail that spoils).
            if (item.Type == Jellyfin.Data.Enums.BaseItemKind.Series)
            {
                if (item.Id == Guid.Empty) return;
                if (!userState.Series.ContainsKey(item.Id.ToString("N"))) return;
                // Mutate ImageTags so native client image caches refetch
                // on state change. Series has no per-watched semantics so
                // just hash the in-list state.
                SpoilerImageCacheTags.MutateImageTagsForCacheBust(item, cfg, watched: false, playbackPositionTicks: 0);
                _sanitizer.ApplyStripping(item, userState, cfg, userId);
                return;
            }

            // BoxSet (Collection) DTOs pass through unstripped. The
            // collection itself is the entry point the user just clicked
            // (like Series); blurring its art/Overview would spoil the
            // user's own navigation. The collection toggle's effect is on
            // the MOVIES inside (handled in the Movie arm via
            // SpoilerUserResolver.IsMovieInSpoilerScope).

            // Movie path: a movie is in spoiler scope when either it's
            // directly opted in (Movies dict) OR it's a child of a
            // collection (BoxSet) the user has opted in (Collections dict).
            if (item.Type == Jellyfin.Data.Enums.BaseItemKind.Movie)
            {
                if (item.Id == Guid.Empty) return;
                if (!_resolver.IsMovieInSpoilerScope(userState,item.Id)) return;
                bool moviePlayed;
                long moviePlayPos = 0;
                if (item.UserData != null)
                {
                    moviePlayed = item.UserData.Played;
                    moviePlayPos = item.UserData.PlaybackPositionTicks;
                }
                else
                {
                    moviePlayed = _watchState.ResolvePlayedServerSide(userId, item.Id);
                }
                // Mutate ImageTags BEFORE the watched-skip. We want the
                // URL to flip on watched-state change so an already-cached
                // blurred image gets re-fetched once the user marks the
                // movie played.
                SpoilerImageCacheTags.MutateImageTagsForCacheBust(item, cfg, moviePlayed, moviePlayPos);
                if (moviePlayed) return;
                _sanitizer.ApplyStripping(item, userState, cfg, userId);
                return;
            }

            // Trailer / intro / special-feature DTOs from GetIntros /
            // GetLocalTrailers / GetSpecialFeatures routes
            // arrive with Type=Trailer/Video and would prior have early-
            // returned. If their SeriesId is in the user's spoiler list,
            // their Name/Overview/Path/MediaStreams can leak the parent
            // episode's title. Apply aggressive strip to be safe — these
            // DTOs are extras of an unwatched-spoiler episode.
            // Direct enum compare — faster than ToString("Episode") and
            // future-proof if Jellyfin renames any enum string forms.
            var isEpisodeOrSeason = item.Type == Jellyfin.Data.Enums.BaseItemKind.Episode
                || item.Type == Jellyfin.Data.Enums.BaseItemKind.Season;
            var isExtra = !isEpisodeOrSeason
                && item.SeriesId.HasValue
                && item.SeriesId.Value != Guid.Empty
                && userState.Series.ContainsKey(item.SeriesId.Value.ToString("N"));
            if (!isEpisodeOrSeason && !isExtra) return;

            if (isExtra)
            {
                // Extras (trailers / intros / specials) — we don't have a
                // per-extra watched flag; apply strip unconditionally
                // since the extra exists as part of an episode whose
                // very metadata the user has opted into hiding.
                SpoilerImageCacheTags.MutateImageTagsForCacheBust(item, cfg, watched: false, playbackPositionTicks: 0);
                _sanitizer.ApplyStripping(item, userState, cfg, userId);
                return;
            }

            var seriesId = item.SeriesId;
            if (seriesId == null || seriesId.Value == Guid.Empty)
            {
                // Episode DTOs SHOULD always carry SeriesId. Silent return
                // on null hides a Jellyfin DTO-shape regression.
                if (item.Type == Jellyfin.Data.Enums.BaseItemKind.Episode)
                {
                    _resolver.WarnRateLimited(
                        "fieldstrip-episode-no-seriesid",
                        $"Spoiler Guard field strip: Episode DTO {item.Id} has no SeriesId — strip cannot determine series membership. Possible Jellyfin DTO-shape change.");
                }
                return;
            }
            if (!userState.Series.ContainsKey(seriesId.Value.ToString("N"))) return;

            if (item.Type == Jellyfin.Data.Enums.BaseItemKind.Season)
            {
                // Season DTOs leak Overview right next to a blurred Season
                // poster. Strip them too — but mirror the image filter's
                // "S1 always shows" + "any-played => pass-through" logic
                // so the user has an entry point.
                var sNum = item.IndexNumber.GetValueOrDefault(int.MaxValue);
                if (sNum <= 1) return; // Season 0 (Specials) and Season 1 always pass.

                // UserData.UnplayedItemCount is the simplest "any watched?"
                // signal for a Season DTO. > 0 AND total > unplayed = some
                // watched. TvShows.GetSeasons does NOT include ItemCounts
                // in its default fields, so UserData on a Season DTO often
                // lacks UnplayedItemCount/RecursiveItemCount — fail-closed
                // would over-strip every S2+. Fall back to the server-side
                // helper that mirrors the image filter's logic
                // (HasWatchedAnyEpisodeInSeason via library iteration).
                bool seasonAnyWatched = false;
                if (item.UserData != null
                    && item.UserData.UnplayedItemCount.HasValue
                    && item.RecursiveItemCount.HasValue)
                {
                    var unplayed = item.UserData.UnplayedItemCount.Value;
                    var totalIndicator = item.RecursiveItemCount.Value;
                    if (totalIndicator > 0 && unplayed < totalIndicator) seasonAnyWatched = true;
                }
                else if (_watchState.HasWatchedAnyEpisodeInSeasonServerSide(userId, item.Id))
                {
                    seasonAnyWatched = true;
                }
                // Mutate ImageTags BEFORE the watched-skip so the URL
                // flips when the user starts the season.
                SpoilerImageCacheTags.MutateImageTagsForCacheBust(item, cfg, seasonAnyWatched, playbackPositionTicks: 0);
                if (seasonAnyWatched) return;
                _sanitizer.ApplyStripping(item, userState, cfg, userId);
                return;
            }

            // Episode path.
            // Prefer UserData.Played from the DTO; if absent (the client
            // passed enableUserData=false), fall back to IUserDataManager
            // server-side rather than fail-safe to "treat as played, skip
            // strip" — that bypass let lite clients receive full episode
            // metadata silently.
            bool played;
            if (item.UserData != null)
            {
                played = item.UserData.Played;
            }
            else
            {
                played = _watchState.ResolvePlayedServerSide(userId, item.Id);
            }
            // Same logic — mutate before watched-skip so the URL flips on
            // watched-state change. Episode has no
            // playback-position-affects-image (chapter rail belongs to the
            // movie path), so pass 0.
            SpoilerImageCacheTags.MutateImageTagsForCacheBust(item, cfg, played, playbackPositionTicks: 0);
            if (played) return;

            _sanitizer.ApplyStripping(item, userState, cfg, userId, ResolveCategoryReveal(item, userState, cfg, userId, seriesId.Value));
        }

        // Advanced-mode category reveal for an unwatched episode of a guarded
        // series. Gate order: admin master (SpoilerAdvancedMode), then the
        // user's per-user opt-out (UseAdvancedCategories == false restores the
        // uniform full strip), then boundary categorization. Every failure
        // path — no boundary, missing index numbers, specials — yields
        // CategoryReveal.None, i.e. the full strip.
        private CategoryReveal ResolveCategoryReveal(
            BaseItemDto item,
            UserSpoilerBlur userState,
            PluginConfiguration cfg,
            Guid userId,
            Guid seriesId)
        {
            if (!cfg.SpoilerAdvancedMode) return CategoryReveal.None;
            if (userState.Prefs?.UseAdvancedCategories == false) return CategoryReveal.None;
            if (item.Type != Jellyfin.Data.Enums.BaseItemKind.Episode) return CategoryReveal.None;

            var boundary = _nextUnwatched.GetBoundary(userId, seriesId);
            var category = SpoilerNextUnwatchedService.Categorize(
                boundary, item.Id, item.ParentIndexNumber, item.IndexNumber);
            return category switch
            {
                SpoilerEpisodeCategory.NextEpisode => new CategoryReveal(
                    Title: !cfg.SpoilerNextEpisodeStripTitle,
                    Overview: !cfg.SpoilerNextEpisodeStripOverview,
                    Ratings: !cfg.SpoilerNextEpisodeStripRatings),
                SpoilerEpisodeCategory.CurrentSeason => new CategoryReveal(
                    Title: !cfg.SpoilerCurrentSeasonStripTitle,
                    Overview: !cfg.SpoilerCurrentSeasonStripOverview,
                    Ratings: !cfg.SpoilerCurrentSeasonStripRatings),
                _ => CategoryReveal.None,
            };
        }

        // SearchHintResult shape is different from BaseItemDto: each
        // SearchHint carries Id, Name, IndexNumber, ParentIndexNumber,
        // Type (BaseItemKind enum), Series (series-name string), but
        // NOT SeriesId. To check spoiler-list membership we have to look
        // up the actual item.
        //
        // We strip episode hints whose series is in the user's spoiler
        // list and that the user hasn't watched. Server-side, so all
        // clients benefit.
        private void StripSearchHints(SearchHintResult result, UserSpoilerBlur userState, PluginConfiguration cfg, Guid userId)
        {
            if (result?.SearchHints == null) return;

            foreach (var hint in result.SearchHints)
            {
                if (hint == null) continue;
                var isEpisodeHint = hint.Type == Jellyfin.Data.Enums.BaseItemKind.Episode;
                var isMovieHint = hint.Type == Jellyfin.Data.Enums.BaseItemKind.Movie;
                if (!isEpisodeHint && !isMovieHint) continue;
                if (hint.Id == Guid.Empty) continue;

                // Look up the actual item. For Episodes we need SeriesId
                // for spoiler-list membership; for Movies the hint.Id is
                // the movie ID directly. Lookup-throw fails-CLOSED.
                MediaBrowser.Controller.Entities.BaseItem? actualItem;
                try { actualItem = _libraryManager.GetItemById(hint.Id); }
                catch (Exception ex)
                {
                    _resolver.WarnRateLimited(
                        "searchhint-lookup:" + ex.GetType().FullName,
                        $"Spoiler Guard field strip: SearchHint library lookup failed for {hint.Id}: {ex.Message}");
                    hint.Name = SpoilerMetadataSanitizer.SanitizePlaceholder(cfg.SpoilerOverviewPlaceholder);
                    hint.MatchedTerm = null;
                    continue;
                }

                if (isEpisodeHint)
                {
                    if (actualItem is not MediaBrowser.Controller.Entities.TV.Episode ep) continue;
                    if (ep.SeriesId == Guid.Empty) continue;
                    if (!userState.Series.ContainsKey(ep.SeriesId.ToString("N"))) continue;
                    if (_watchState.ResolvePlayedServerSide(userId, hint.Id)) continue;

                    if (SpoilerMetadataSanitizer.ShouldStrip(cfg.SpoilerReplaceTitle, userState.Prefs?.ReplaceEpisodeTitles) && hint.IndexNumber.HasValue && hint.ParentIndexNumber.HasValue)
                    {
                        hint.Name = $"Season {hint.ParentIndexNumber.Value}, Episode {hint.IndexNumber.Value}";
                    }
                    else if (SpoilerMetadataSanitizer.ShouldStrip(cfg.SpoilerStripOverview, userState.Prefs?.HideEpisodeDescriptions))
                    {
                        hint.Name = SpoilerMetadataSanitizer.SanitizePlaceholder(cfg.SpoilerOverviewPlaceholder);
                    }
                }
                else
                {
                    // Movie hint path. Spoiler-list keyed by movie ID
                    // directly; watched check via the same server-side
                    // helper. Movie hint Name is NOT rewritten (MatchedTerm
                    // is still nulled below to suppress autocomplete
                    // substring leak of any non-title-bearing match).
                    if (actualItem is not MediaBrowser.Controller.Entities.Movies.Movie) continue;
                    if (!_resolver.IsMovieInSpoilerScope(userState,hint.Id)) continue;
                    if (_watchState.ResolvePlayedServerSide(userId, hint.Id)) continue;
                }

                // MatchedTerm echoes the substring of the ORIGINAL Name
                // that the search query matched — bypassing the Name
                // rewrite. e.g. user searches "Optimus" → MatchedTerm =
                // "Optimus" from the raw pre-strip title. Null it so
                // autocomplete doesn't surface the substring. Applies to
                // both Episode and Movie hints — but only when the user
                // hasn't opted out of all title/overview-bearing strips,
                // otherwise the user explicitly wants those substrings
                // visible.
                if (SpoilerMetadataSanitizer.ShouldStrip(cfg.SpoilerReplaceTitle, userState.Prefs?.ReplaceEpisodeTitles)
                    || SpoilerMetadataSanitizer.ShouldStrip(cfg.SpoilerStripOverview, userState.Prefs?.HideEpisodeDescriptions))
                {
                    hint.MatchedTerm = null;
                }
            }
        }

    }
}
