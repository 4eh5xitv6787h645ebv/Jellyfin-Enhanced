using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model.Search;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Selects item-listing endpoints and resolves the requesting user's Spoiler Guard state.
    /// Response traversal and field policy live in dedicated metadata collaborators.
    /// DTO user data is preferred; omitted fields use fail-closed library lookups.
    /// </summary>
    public sealed class SpoilerFieldStripFilter : IAsyncActionFilter
    {
        // Action-name table built from live observation on Jellyfin 10.11.x:
        // - /Items                        → Items.GetItems
        // - /Items?<filter>               → Items.GetItems (same)
        // - /Items/Resume                 → Items.GetResumeItems / GetResumeItemsLegacy
        // - /Items/{id}                   → UserLibrary.GetItem
        // - /Users/{uid}/Items/{id}       → UserLibrary.GetItemLegacy
        // - /Items/Latest                 → UserLibrary.GetLatestMedia / Legacy
        // - /Shows/{seriesId}/Episodes    → TvShows.GetEpisodes
        // - /Shows/{seriesId}/Seasons     → TvShows.GetSeasons
        // - /Shows/NextUp                 → TvShows.GetNextUp
        // - /Shows/Upcoming               → TvShows.GetUpcomingEpisodes
        // - /Shows/{seriesId}/Similar     → LibraryStructure / etc — covered by GetSimilar* if present
        // - /Items?<search>               → Items.GetItems with searchTerm
        // - /Search/Hints                 → Search.GetSearchHints
        // - /Users/{uid}/Suggestions      → Suggestions.GetSuggestions / Legacy
        private static readonly Dictionary<(string, string), bool> _routes
            = new()
            {
                { ("Items",       "GetItems"),               true },
                { ("Items",       "GetItemsByUserIdLegacy"), true },
                { ("Items",       "GetResumeItems"),         true },
                { ("Items",       "GetResumeItemsLegacy"),   true },
                { ("UserLibrary", "GetItem"),                true },
                { ("UserLibrary", "GetItemLegacy"),          true },
                { ("UserLibrary", "GetLatestMedia"),         true },
                { ("UserLibrary", "GetLatestMediaLegacy"),   true },
                // More UserLibrary endpoints that emit episode DTOs.
                { ("UserLibrary", "GetIntros"),              true },
                { ("UserLibrary", "GetIntrosLegacy"),        true },
                { ("UserLibrary", "GetLocalTrailers"),       true },
                { ("UserLibrary", "GetLocalTrailersLegacy"), true },
                { ("UserLibrary", "GetSpecialFeatures"),     true },
                { ("UserLibrary", "GetSpecialFeaturesLegacy"),true },
                { ("TvShows",     "GetEpisodes"),            true },
                { ("TvShows",     "GetSeasons"),             true },
                { ("TvShows",     "GetNextUp"),              true },
                { ("TvShows",     "GetUpcomingEpisodes"),    true },
                { ("Suggestions", "GetSuggestions"),         true },
                { ("Suggestions", "GetSuggestionsLegacy"),   true },
                { ("Search",      "GetSearchHints"),         true },
                // "More Like This" rail emits BaseItemDto[] including
                // episode-shaped items — strip those too.
                { ("Library",     "GetSimilarItems"),        true },
                { ("Library",     "GetSimilarShows"),        true },
                { ("Library",     "GetSimilarMovies"),       true },
                { ("Library",     "GetSimilarTrailers"),     true },
                { ("Library",     "GetSimilarAlbums"),       true },
                // /Items/{id}/Images returns IEnumerable<ImageInfo> whose
                // Path is the raw server filesystem path (commonly
                // contains the episode title in user-organized libraries).
                { ("Image",       "GetItemImageInfos"),      true },
                // /Items/{id}/PlaybackInfo returns
                // PlaybackInfoResponse{MediaSources: MediaSourceInfo[]}.
                // MediaSourceInfo carries the same title-bearing fields as
                // BaseItemDto.MediaSources (Path, Name, MediaStreams,
                // MediaAttachments) — emitted as a peer DTO not covered
                // by the BaseItemDto-shape strip. Both GET and POST
                // variants register here.
                { ("MediaInfo",   "GetPlaybackInfo"),        true },
                { ("MediaInfo",   "GetPostedPlaybackInfo"),  true },
                // Surfaces commonly hit by native clients (Streamyfin /
                // Findroid / Swiftfin / Jellyfin Android TV) that
                // previously bypassed the strip.
                //
                // Movies.GetMovieRecommendations powers the "Recommended for
                // You" rail on home screens — wraps BaseItemDto[] inside
                // a RecommendationDto, requires a custom switch arm.
                { ("Movies",      "GetMovieRecommendations"), true },
                // Playlists.GetPlaylistItems returns QueryResult<BaseItemDto>
                // — user-created playlists can include spoiler-list
                // episodes/movies (e.g. "Watch later"), so the items need
                // the same strip as a regular library list.
                { ("Playlists",   "GetPlaylistItems"),       true },
            };

        // Per-category reveal mask for the advanced Spoiler Guard mode. Each
        // flag EXEMPTS one field from a strip the base toggles would apply;
        // default (all false) is the uniform full strip. A reveal can only
        // relax an active strip — it never strips anything itself.
        internal readonly record struct CategoryReveal(bool Title, bool Overview, bool Ratings)
        {
            internal static readonly CategoryReveal None = default;
        }

        private readonly SpoilerUserResolver _resolver;
        private readonly SpoilerMetadataResponseProcessor _processor;

        public SpoilerFieldStripFilter(
            SpoilerUserResolver resolver,
            ILibraryManager libraryManager,
            IUserManager userManager,
            IUserDataManager userDataManager,
            SpoilerNextUnwatchedService nextUnwatched)
        {
            _resolver = resolver;
            _processor = new SpoilerMetadataResponseProcessor(resolver, libraryManager, userManager, userDataManager, nextUnwatched);
        }

        public Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            // Sync fast-path bail order — three short-circuit checks before
            // we touch anything expensive. Returns the original Task<>
            // unchanged so non-matching routes pay zero overhead.
            if (!IsTargetRoute(context)) return next();

            var cfg = JellyfinEnhanced.Instance?.Configuration;
            if (cfg?.SpoilerBlurEnabled != true) return next();
            // Do NOT short-circuit on AnyStripToggleOn. The pipeline's
            // cache-bust pass (MutateImageTagsForCacheBust) must run on
            // EVERY DTO whenever Spoiler Guard is enabled, so native-client
            // image caches re-fetch when the user flips watched-state or
            // toggles Spoiler Guard itself. ApplyStripping is internally
            // per-toggle gated, so when no strip toggle is on it's a no-op
            // past the cache-bust mutation.

            return RunFieldStripAsync(context, next, cfg);
        }

        private static bool IsTargetRoute(ActionExecutingContext context)
        {
            var rv = context.ActionDescriptor.RouteValues;
            if (rv == null) return false;
            if (!rv.TryGetValue("controller", out var controller) || controller == null) return false;
            if (!rv.TryGetValue("action", out var action) || action == null) return false;
            return _routes.ContainsKey((controller, action));
        }

        private async Task RunFieldStripAsync(
            ActionExecutingContext context,
            ActionExecutionDelegate next,
            PluginConfiguration cfg)
        {
            var userId = _resolver.ResolveUserId(context.HttpContext) ?? Guid.Empty;
            if (userId == Guid.Empty)
            {
                await next().ConfigureAwait(false);
                return;
            }

            var userState = _resolver.LoadUserState(context.HttpContext, userId);
            // A movies-only spoiler user (no series in their list) would
            // short-circuit the entire field-strip pipeline here if we
            // only checked Series, leaving movie /Items,
            // /Items/{id}/PlaybackInfo, and /Items/{id}/Images unstripped
            // despite the Movie branches in StripItem +
            // RouteParentIsSpoilerEpisode. Mirror the GetTagCache /
            // GetTagData / image-filter checks.
            if (userState.Series.Count == 0 && userState.Movies.Count == 0 && userState.Collections.Count == 0)
            {
                await next().ConfigureAwait(false);
                return;
            }

            var executed = await next().ConfigureAwait(false);
            // Surface (rate-limited) when the wrapped action threw — strip
            // silently skipped and operator can correlate "Overview leaked
            // but my toggle is on" reports with the underlying controller
            // exception.
            if (executed.Exception != null)
            {
                _resolver.WarnRateLimited(
                    "fieldstrip-action-exception:" + executed.Exception.GetType().FullName,
                    $"Spoiler Guard field strip: wrapped action threw — strip not applied. {executed.Exception.GetType().Name}: {executed.Exception.Message}");
                return;
            }
            if (executed.Canceled) return;

            try
            {
                _processor.StripIfApplicable(executed.Result, userState, cfg, userId, context);
            }
            catch (Exception ex)
            {
                // Rate-limit so a persistent strip bug on a 100-item batch
                // doesn't produce 100 log lines. Pattern matches the rest
                // of the filter (resolver.WarnRateLimited keyed by
                // exception type).
                _resolver.WarnRateLimited(
                    "fieldstrip-apply:" + ex.GetType().FullName,
                    $"Spoiler Guard field strip failed: {ex.Message}");
            }
        }

        // Kept as a public forwarding API for existing consumers.
        public static void MutateImageTagsForCacheBust(
            BaseItemDto item, PluginConfiguration cfg, bool watched, long playbackPositionTicks)
            => SpoilerImageCacheTags.MutateImageTagsForCacheBust(item, cfg, watched, playbackPositionTicks);
    }
}
