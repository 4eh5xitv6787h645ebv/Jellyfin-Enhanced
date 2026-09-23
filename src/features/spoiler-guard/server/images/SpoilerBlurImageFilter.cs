using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using MediaBrowser.Controller.Chapters;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Trickplay;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    // Replaces spoiler-bearing image bytes (parent-art substitution in
    // "hide" mode, or a Gaussian blur in "blur" mode) when Spoiler Guard is
    // enabled server-wide AND the requesting user has opted in for the item,
    // for these protected surfaces:
    //   • Episodes of an opted-in series the user has NOT played
    //   • Season posters for S2+ of an opted-in series with no episode watched
    //   • Movies opted in directly OR via an opted-in collection (until played;
    //     SpoilerKeepMoviePosters can exempt the Primary/Thumb poster)
    //   • Trickplay tile-sheets and (when SpoilerBlurArtwork is on) backdrops
    // A collection's (BoxSet's) OWN art always passes through — it's a shortcut
    // that protects the movies inside, not itself. Per-user state lives in
    // spoilerblur.json (Series / Movies / Collections / PendingTmdb / Prefs).
    //
    // Runs as an MVC action filter scoped to Jellyfin's image + trickplay
    // controller actions so EVERY client (web, TV, iOS, Android) receives the
    // protected bytes from the native image API. No client-side awareness or
    // DOM manipulation needed.
    public sealed class SpoilerBlurImageFilter : IAsyncActionFilter, IDisposable
    {
        private const string ImageController = "Image";
        // Trickplay tile-sheet endpoint (Videos/{id}/Trickplay/{w}/{i}.jpg).
        // Each tile is a sprite-sheet JPEG containing many small thumbnails for
        // timeline scrubbing previews. For Spoiler Guard unwatched items, these
        // thumbnails reveal scenes the user explicitly opted to hide.
        private const string TrickplayController = "Trickplay";
        public const string SpoilerBlurFileName = "spoilerblur.json";

        // Image controller actions we care about. Jellyfin 10.11.x decorates
        // the same C# methods with both [HttpGet] and [HttpHead(Name="HeadItemImage")];
        // Name= only affects link generation, so RouteValues["action"] for a HEAD
        // request still resolves to the GET method name. We therefore only need
        // the GetItem* names.
        private static readonly HashSet<string> _imageActions = new(StringComparer.OrdinalIgnoreCase)
        {
            "GetItemImage",
            "GetItemImageByIndex",
            "GetItemImage2",
        };

        // Image-type allowlist split into two tiers.
        //
        // Always blur (poster surface — where most spoiler risk lives,
        // typically curated marketing art that conveys plot):
        //   Primary, Thumb, Screenshot
        //
        // Optional blur — admin-toggled via SpoilerBlurArtwork
        // (default false). Backdrops/Art are wider aesthetic images
        // shown on detail pages and collections; many users find blurring
        // those over-aggressive, so they pass through by default.
        private static readonly HashSet<string> _alwaysBlurImageTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "Primary",
            "Thumb",
            "Screenshot",
            // Chapter thumbnails — the Scenes rail in jellyfin-web's
            // movie/episode detail pages. For movies these are
            // progressive-revealed below in the Movie path (chapters past
            // PlaybackPositionTicks blur, before pass through). For
            // episodes the entire chapter set blurs alongside the rest
            // of the unwatched-episode metadata.
            "Chapter",
        };
        private static readonly HashSet<string> _artworkImageTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "Backdrop",
            "Art",
        };

        // Rate-limited warning helper + per-request user-state caching now
        // live on SpoilerUserResolver (single shared HttpContext.Items key
        // across both filters).

        private readonly ILibraryManager _libraryManager;
        private readonly IChapterManager _chapterManager;
        private readonly IUserManager _userManager;
        private readonly IUserDataManager _userDataManager;
        private readonly SpoilerUserResolver _resolver;
        private readonly ImageBlurService _blurService;
        private readonly SpoilerNextUnwatchedService _nextUnwatched;
        private readonly Logger _logger;
        private readonly SpoilerImageResponseWriter _responseWriter;
        private readonly SpoilerSeasonWatchCache _seasonWatchCache;

        public SpoilerBlurImageFilter(
            ILibraryManager libraryManager,
            IUserManager userManager,
            IUserDataManager userDataManager,
            IChapterManager chapterManager,
            SpoilerUserResolver resolver,
            ImageBlurService blurService,
            SpoilerNextUnwatchedService nextUnwatched,
            Logger logger)
        {
            _libraryManager = libraryManager;
            _userManager = userManager;
            _userDataManager = userDataManager;
            _chapterManager = chapterManager;
            _resolver = resolver;
            _blurService = blurService;
            _nextUnwatched = nextUnwatched;
            _logger = logger;

            _responseWriter = new SpoilerImageResponseWriter(libraryManager, resolver, blurService, logger);
            _seasonWatchCache = new SpoilerSeasonWatchCache(userDataManager, resolver, logger);
        }

        public void Dispose() => _seasonWatchCache.Dispose();

        public Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            // Sync fast-path. The filter runs on every MVC action; for
            // non-image routes we want to add zero overhead by returning
            // the existing Task directly without entering an async state
            // machine.
            if (!IsImageAction(context))
            {
                return next();
            }

            // Plugin-level master switch. Saves the per-user file read on every image.
            var pluginConfig = JellyfinEnhanced.Instance?.Configuration;
            if (pluginConfig?.SpoilerBlurEnabled != true)
            {
                return next();
            }
            return RunImageFilterAsync(context, next, pluginConfig);
        }

        private async Task RunImageFilterAsync(
            ActionExecutingContext context,
            ActionExecutionDelegate next,
            Configuration.PluginConfiguration pluginConfig)
        {
            if (!TryGetItemId(context, out var itemId))
            {
                await next().ConfigureAwait(false);
                return;
            }
            // Trickplay routes don't carry an `imageType` argument —
            // they're sprite-sheet tiles for a video's scrubbing previews.
            // Treat them as always-blur (the entire sheet contains scene
            // previews that the user opted to hide).
            bool isTrickplay = IsTrickplayRoute(context);
            string imageType;
            bool inAlways, inArtwork;
            if (isTrickplay)
            {
                imageType = "Trickplay";
                inAlways = true;
                inArtwork = false;
            }
            else
            {
                if (!TryGetImageType(context, out imageType))
                {
                    await next().ConfigureAwait(false);
                    return;
                }
                // Always-blur tier (poster surface) vs artwork tier (Backdrop/
                // Art) gated behind SpoilerBlurArtwork. Anything else (logos,
                // banners, etc.) passes through unchanged.
                inAlways = _alwaysBlurImageTypes.Contains(imageType);
                inArtwork = !inAlways && _artworkImageTypes.Contains(imageType);
                if (!inAlways && !inArtwork)
                {
                    await next().ConfigureAwait(false);
                    return;
                }
            }
            // Do NOT short-circuit Backdrop/Art on SpoilerBlurArtwork=false
            // here — we still need the eligibility check below so
            // spoiler-list artwork can be served with `no-store`. Otherwise
            // Jellyfin's default long-lived public cache headers would let
            // a browser/proxy hold the unblurred bytes; if the admin later
            // toggles SpoilerBlurArtwork on, the client never re-fetches
            // and never sees the blurred response.
            //
            // Decision is deferred to the post-eligibility branch:
            //   inAlways                          → blur (existing path)
            //   inArtwork && SpoilerBlurArtwork   → blur
            //   inArtwork && !SpoilerBlurArtwork  → pass-through w/ no-store

            // Read the item up front so we can pick the effective user by
            // spoiler scope (below) rather than by identity alone.
            var item = _libraryManager.GetItemById(itemId);
            if (item == null)
            {
                await next().ConfigureAwait(false);
                return;
            }

            // User identification — handles ClaimsPrincipal first, then falls
            // back to session-by-IP for anonymous browser <img> requests and
            // native-client image fetches. On a shared IP the fallback can
            // yield several candidates; we protect the item if ANY of them
            // opted into it (fail-CLOSED by scope), instead of leaking the
            // original bytes. For the common authenticated request there is
            // exactly one candidate, so this is identical to a direct lookup.
            // Resolution lives in SpoilerUserResolver so both filters share it.
            var candidates = _resolver.ResolveCandidateUserIds(context.HttpContext);
            Guid effectiveUserId = Guid.Empty;
            UserSpoilerBlur? userState = null;
            foreach (var candidate in candidates)
            {
                if (candidate == Guid.Empty) continue;
                var candidateState = _resolver.LoadUserState(context.HttpContext, candidate);
                if (candidateState.Series.Count == 0
                    && candidateState.Movies.Count == 0
                    && candidateState.Collections.Count == 0)
                {
                    continue; // this candidate protects nothing
                }
                if (ItemInSpoilerScope(candidateState, item))
                {
                    effectiveUserId = candidate;
                    userState = candidateState;
                    break;
                }
            }
            if (userState == null)
            {
                await next().ConfigureAwait(false);
                return;
            }

            var jUser = _userManager.GetUserById(effectiveUserId);
            if (jUser == null)
            {
                await next().ConfigureAwait(false);
                return;
            }

            // Collections are a SHORTCUT for "blur all movies in this
            // collection" — the collection's own art and Overview pass
            // through clear (it's the entry point the user just clicked,
            // same model as Series). The blur is applied per-movie based
            // on each movie's individual watched state.
            if (item is MediaBrowser.Controller.Entities.Movies.BoxSet)
            {
                await next().ConfigureAwait(false);
                return;
            }
            else if (item is MediaBrowser.Controller.Entities.Movies.Movie movie)
            {
                if (!_resolver.IsMovieInSpoilerScope(userState, movie.Id))
                {
                    await next().ConfigureAwait(false);
                    return;
                }
                var movieUd = _userDataManager.GetUserData(jUser, movie);
                if (movieUd?.Played == true)
                {
                    _responseWriter.RegisterNoStoreOnStarting(context.HttpContext);
                    await next().ConfigureAwait(false);
                    return;
                }
                // Admin opt-out for movie posters: when SpoilerKeepMoviePosters
                // is on, the Primary and Thumb image types (the movie's
                // poster surface) pass through unblurred. Chapter thumbs,
                // Screenshots, and (when SpoilerBlurArtwork is on)
                // Backdrop / Art continue to follow the protection logic.
                if (pluginConfig.SpoilerKeepMoviePosters
                    && (string.Equals(imageType, "Primary", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(imageType, "Thumb", StringComparison.OrdinalIgnoreCase)))
                {
                    _responseWriter.RegisterNoStoreOnStarting(context.HttpContext, imageType);
                    await next().ConfigureAwait(false);
                    return;
                }
                // Progressive chapter ("Scenes" rail) blur for unwatched
                // movies in the spoiler list: chapters whose
                // StartPositionTicks are BEFORE the user's resume point
                // pass through unblurred (they've already seen those
                // scenes); chapters at-or-after the resume point blur.
                if (string.Equals(imageType, "Chapter", StringComparison.OrdinalIgnoreCase)
                    && TryGetImageIndex(context, out var chapterIdx))
                {
                    long? watchedThroughTicks = null;
                    if (movieUd != null)
                    {
                        if (movieUd.Played) watchedThroughTicks = long.MaxValue;
                        else if (movieUd.PlaybackPositionTicks > 0) watchedThroughTicks = movieUd.PlaybackPositionTicks;
                    }
                    if (watchedThroughTicks.HasValue)
                    {
                        try
                        {
                            var chapter = _chapterManager.GetChapter(movie.Id, chapterIdx);
                            if (chapter != null
                                && chapter.StartPositionTicks < watchedThroughTicks.Value)
                            {
                                // Pre-resume-point scene — pass through.
                                // Short-cache (30s) so timeline-hover scrubbing
                                // doesn't round-trip every hover.
                                _responseWriter.RegisterNoStoreOnStarting(context.HttpContext, imageType);
                                await next().ConfigureAwait(false);
                                return;
                            }
                        }
                        catch (Exception ex)
                        {
                            // Lookup failure — fail-CLOSED (blur all chapters
                            // by falling through). Rate-limited warn so a
                            // future Jellyfin API change is observable.
                            _resolver.WarnRateLimited(
                                "image-chapter-lookup:" + ex.GetType().FullName,
                                $"Spoiler Guard: chapter lookup failed for movie {movie.Id} idx {chapterIdx}: {ex.Message}");
                        }
                    }
                }
                // Progressive trickplay reveal, mirroring the chapter reveal
                // above: a scrubbing-preview tile SHEET whose entire timeline
                // range is before the user's resume point holds only
                // already-watched scenes, so pass it through unblurred. The
                // played case is handled earlier, so here the movie is
                // partially watched (PlaybackPositionTicks > 0). Tiles that
                // straddle or lead the resume point still blur (fail-closed).
                if (isTrickplay
                    && movieUd != null && !movieUd.Played && movieUd.PlaybackPositionTicks > 0
                    && await TrickplayTileFullyWatchedAsync(context, movie.Id, movieUd.PlaybackPositionTicks).ConfigureAwait(false))
                {
                    _responseWriter.RegisterNoStoreOnStarting(context.HttpContext, imageType);
                    await next().ConfigureAwait(false);
                    return;
                }
            }
            else
            {
                // Episode / Season path: spoiler-list keyed by parent series.
                Guid seriesId;
                switch (item)
                {
                    case Episode ep:
                        seriesId = ep.SeriesId;
                        break;
                    case Season seasonItem:
                        seriesId = seasonItem.SeriesId;
                        break;
                    default:
                        await next().ConfigureAwait(false);
                        return;
                }

                if (seriesId == Guid.Empty
                    || !userState.Series.ContainsKey(seriesId.ToString("N")))
                {
                    await next().ConfigureAwait(false);
                    return;
                }

                if (item is Episode episode)
                {
                    var userData = _userDataManager.GetUserData(jUser, episode);
                    if (userData?.Played == true)
                    {
                        // Pass-through, but force `no-store` so a watched
                        // episode's image isn't cached permanently in the
                        // user's browser. If the user later marks the
                        // episode unwatched again, the next fetch must
                        // re-evaluate through this filter.
                        //
                        // Register on Response.OnStarting BEFORE awaiting
                        // next(). For streaming FileStreamResult paths the
                        // response headers can be flushed inside next()'s
                        // execution, so a post-next() header write would
                        // be a no-op.
                        _responseWriter.RegisterNoStoreOnStarting(context.HttpContext);
                        await next().ConfigureAwait(false);
                        return;
                    }
                    if (!isTrickplay
                        && (string.Equals(imageType, "Primary", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(imageType, "Thumb", StringComparison.OrdinalIgnoreCase))
                        && pluginConfig.SpoilerAdvancedMode
                        && !pluginConfig.SpoilerNextEpisodeStripImage
                        && userState.Prefs?.UseAdvancedCategories != false)
                    {
                        var boundary = _nextUnwatched.GetBoundary(effectiveUserId, seriesId);
                        var category = SpoilerNextUnwatchedService.Categorize(
                            boundary, episode.Id, episode.ParentIndexNumber, episode.IndexNumber);
                        if (category == SpoilerEpisodeCategory.NextEpisode)
                        {
                            _responseWriter.RegisterNoStoreOnStarting(context.HttpContext);
                            await next().ConfigureAwait(false);
                            return;
                        }
                    }

                    // Progressive trickplay reveal for a partially-watched
                    // episode: tile sheets whose whole range is before the
                    // resume point are scenes already seen — pass them through.
                    if (isTrickplay
                        && userData != null && userData.PlaybackPositionTicks > 0
                        && await TrickplayTileFullyWatchedAsync(context, episode.Id, userData.PlaybackPositionTicks).ConfigureAwait(false))
                    {
                        _responseWriter.RegisterNoStoreOnStarting(context.HttpContext);
                        await next().ConfigureAwait(false);
                        return;
                    }
                }
                else
                {
                    // Season path: blur if S2+ and the user has watched zero
                    // episodes from this season; pass-through otherwise.
                    var season = (Season)item;
                    var seasonNum = season.IndexNumber.GetValueOrDefault(int.MaxValue);
                    // Always show Season 1 (and Specials S0) so the user has some
                    // entry point. Future seasons get blurred until at least one
                    // episode is watched.
                    if (seasonNum <= 1)
                    {
                        await next().ConfigureAwait(false);
                        return;
                    }
                    if (_seasonWatchCache.HasWatchedAnyEpisodeInSeason(jUser, season))
                    {
                        _responseWriter.RegisterNoStoreOnStarting(context.HttpContext);
                        await next().ConfigureAwait(false);
                        return;
                    }
                }
            }

            // Artwork tier with the toggle OFF — pass through the original
            // bytes BUT with no-store so the browser/proxy can't keep them
            // past a future toggle-on. We still want spoiler-list artwork
            // to re-evaluate through this filter on every request.
            if (inArtwork && pluginConfig.SpoilerBlurArtwork != true)
            {
                _responseWriter.RegisterNoStoreOnStarting(context.HttpContext);
                await next().ConfigureAwait(false);
                return;
            }

            // Cache key incorporates the blur mode so toggling between "blur"
            // and "hide" doesn't serve stale entries from the wrong mode.
            var spoilerMode = string.Equals(pluginConfig.SpoilerBlurMode, "hide", StringComparison.OrdinalIgnoreCase)
                ? "hide" : "blur";
            var cacheKey = BuildItemCacheKey(item, imageType, context, pluginConfig.SpoilerBlurIntensity)
                + ":" + spoilerMode;

            var executed = await next().ConfigureAwait(false);
            if (executed.Canceled || executed.Exception != null) return;

            try
            {
                if (spoilerMode == "hide")
                {
                    await _responseWriter.ReplaceWithStockCardAsync(executed, pluginConfig.SpoilerBlurIntensity, cacheKey, imageType, item, userState).ConfigureAwait(false);
                }
                else
                {
                    await _responseWriter.ReplaceWithBlurredAsync(executed, pluginConfig.SpoilerBlurIntensity, cacheKey, imageType).ConfigureAwait(false);
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"Spoiler Guard post-processing failed for episode {itemId} ({imageType}, {spoilerMode}): {ex.Message}");

                // Fail CLOSED in BOTH modes. An exception thrown before
                // ReplaceWith*Async assigned executed.Result (e.g. ExtractBytesAsync
                // stream-copy IOException, OOM on a 4K backdrop decode, or an
                // ObjectDisposedException on a cancelled request) would otherwise
                // let MVC write the original FileStreamResult body — leaking the
                // spoiler image. Force the hardcoded fallback so the fail-closed
                // invariant holds structurally regardless of mode or where in the
                // pipeline the failure occurred (blur mode is NOT exempt: a
                // best-effort blur must still never serve the original bytes).
                if (!executed.HttpContext.Response.HasStarted)
                {
                    try
                    {
                        executed.Result = new FileContentResult(_blurService.HardcodedFallbackJpeg, "image/jpeg");
                        _responseWriter.ApplyNoStoreToResponse(executed.HttpContext);
                    }
                    catch (Exception fallbackEx)
                    {
                        _logger.Error($"Spoiler Guard: fail-closed fallback assignment failed for {itemId}: {fallbackEx.Message}");
                    }
                }
            }
        }

        // User resolution (ClaimsPrincipal, then session-by-IP with shared-IP
        // disambiguation) lives in SpoilerUserResolver — see
        // ResolveCandidateUserIds / ScanActiveSessionUsers.
        private static bool IsImageAction(ActionExecutingContext context)
        {
            var rv = context.ActionDescriptor.RouteValues;
            if (rv == null) return false;
            if (!rv.TryGetValue("controller", out var controller) || controller == null) return false;
            if (!rv.TryGetValue("action", out var action) || action == null) return false;
            if (string.Equals(controller, ImageController, StringComparison.OrdinalIgnoreCase))
            {
                return _imageActions.Contains(action);
            }
            // Trickplay tiles. Same image-mutation pipeline; the tile is
            // just a JPEG of stitched-together thumbnails.
            if (string.Equals(controller, TrickplayController, StringComparison.OrdinalIgnoreCase))
            {
                return string.Equals(action, "GetTrickplayTileImage", StringComparison.OrdinalIgnoreCase);
            }
            return false;
        }

        private static bool IsTrickplayRoute(ActionExecutingContext context)
        {
            var rv = context.ActionDescriptor.RouteValues;
            if (rv == null) return false;
            if (!rv.TryGetValue("controller", out var c) || c == null) return false;
            return string.Equals(c, TrickplayController, StringComparison.OrdinalIgnoreCase);
        }

        private static bool TryGetItemId(ActionExecutingContext context, out Guid itemId)
        {
            itemId = Guid.Empty;
            if (!context.ActionArguments.TryGetValue("itemId", out var raw)) return false;
            switch (raw)
            {
                case Guid g when g != Guid.Empty:
                    itemId = g;
                    return true;
                case string s when Guid.TryParse(s, out var parsed) && parsed != Guid.Empty:
                    itemId = parsed;
                    return true;
                default:
                    return false;
            }
        }

        private static bool TryGetImageType(ActionExecutingContext context, out string imageType)
        {
            imageType = string.Empty;
            if (!context.ActionArguments.TryGetValue("imageType", out var raw) || raw == null) return false;
            // Jellyfin's ImageType is an enum; ToString() yields the member name (Primary, Thumb, etc.).
            imageType = raw.ToString() ?? string.Empty;
            return imageType.Length > 0;
        }

        // Reads the imageIndex action arg for chapter image requests
        // (`/Items/{id}/Images/Chapter/{index}`).
        private static bool TryGetImageIndex(ActionExecutingContext context, out int imageIndex)
        {
            imageIndex = 0;
            if (!context.ActionArguments.TryGetValue("imageIndex", out var raw) || raw == null) return false;
            if (raw is int i) { imageIndex = i; return true; }
            return int.TryParse(raw.ToString(), out imageIndex);
        }

        // Exclusive END time (in ticks) of the trickplay tile SHEET being
        // requested (route GetTrickplayTileImage(itemId, width, index)), or null
        // if it can't be determined. A `width` sheet packs TileWidth*TileHeight
        // thumbnails, each `Interval` ms apart, so tile N covers the timeline
        // range [N*perSheet*Interval, (N+1)*perSheet*Interval) ms. Resolves
        // ITrickplayManager from the request scope (this filter is a singleton;
        // the manager is request-scoped) rather than via constructor injection.
        private static async Task<long?> TryGetTrickplayTileEndTicksAsync(ActionExecutingContext context, Guid itemId)
        {
            if (!context.ActionArguments.TryGetValue("width", out var wRaw) || wRaw == null) return null;
            if (!context.ActionArguments.TryGetValue("index", out var iRaw) || iRaw == null) return null;
            if (!int.TryParse(wRaw.ToString(), out var width)) return null;
            if (!int.TryParse(iRaw.ToString(), out var tileIndex) || tileIndex < 0) return null;

            if (context.HttpContext.RequestServices.GetService(typeof(ITrickplayManager)) is not ITrickplayManager mgr)
                return null;

            var resolutions = await mgr.GetTrickplayResolutions(itemId).ConfigureAwait(false);
            if (resolutions == null || !resolutions.TryGetValue(width, out var info)) return null;

            long perSheet = (long)info.TileWidth * info.TileHeight;
            if (perSheet <= 0 || info.Interval <= 0) return null;
            long endMs = (tileIndex + 1L) * perSheet * info.Interval;
            return endMs * TimeSpan.TicksPerMillisecond;
        }

        // True when the requested trickplay tile sheet's timeline range lies
        // ENTIRELY at or before the user's resume point — i.e. every thumbnail
        // in it is a scene already watched, so it's safe to pass through
        // unblurred. Fail-CLOSED (returns false → blur) on any lookup failure
        // or a tile that straddles / is ahead of the resume point.
        private async Task<bool> TrickplayTileFullyWatchedAsync(ActionExecutingContext context, Guid itemId, long watchedThroughTicks)
        {
            try
            {
                var tileEnd = await TryGetTrickplayTileEndTicksAsync(context, itemId).ConfigureAwait(false);
                return tileEnd.HasValue && tileEnd.Value <= watchedThroughTicks;
            }
            catch (Exception ex)
            {
                _resolver.WarnRateLimited(
                    "image-trickplay-lookup:" + ex.GetType().FullName,
                    $"Spoiler Guard: trickplay lookup failed for {itemId}: {ex.Message}");
                return false;
            }
        }

        // Query params Jellyfin's image controller uses to shape the
        // output (resize / re-encode). Two clients requesting the same
        // episode at different sizes must NOT share the same cached
        // blurred bytes — a TV asking for 720p must not receive a
        // 300px-encoded thumb cached for the web client.
        private static readonly string[] _sizeShapingParams =
        {
            "maxWidth", "maxHeight", "fillWidth", "fillHeight",
            "width", "height", "quality", "format",
        };

        private static string BuildItemCacheKey(BaseItem item, string imageType, ActionExecutingContext context, int sigma)
        {
            string? tag = null;
            string? index = null;
            var query = context.HttpContext.Request.Query;
            if (query.TryGetValue("tag", out var t)) tag = t.ToString();
            if (context.ActionArguments.TryGetValue("imageIndex", out var idx) && idx != null)
                index = idx.ToString();

            // Trickplay tiles bind their size + tile position as ROUTE
            // arguments (GetTrickplayTileImage(itemId, width, index)), not
            // query params, so _sizeShapingParams (which scans the query
            // string) and `imageIndex` both miss them. Without folding these
            // in, every tile-sheet width and every tile of an item would
            // collapse onto one cache entry and serve the wrong blurred tile.
            var routeKey = new System.Text.StringBuilder();
            if (context.ActionArguments.TryGetValue("width", out var w) && w != null)
                routeKey.Append("w=").Append(w).Append(';');
            if (context.ActionArguments.TryGetValue("index", out var i) && i != null)
                routeKey.Append("i=").Append(i).Append(';');

            // Include the size-shaping query params so different output
            // sizes get distinct cache entries. Use the FULL param name in
            // the key — using just the first letter caused maxWidth=300
            // and maxHeight=300 to collide on `m300;`.
            var sizeKey = new System.Text.StringBuilder();
            foreach (var p in _sizeShapingParams)
            {
                if (query.TryGetValue(p, out var v))
                {
                    sizeKey.Append(p).Append('=').Append(v.ToString()).Append(';');
                }
            }

            return $"{item.Id:N}|{imageType}|{index ?? "_"}|{tag ?? "_"}|{sigma}|{routeKey}{sizeKey}";
        }

        // Does this candidate's spoiler state cover the item at all? Used to
        // pick the effective user when a shared-IP request yields several
        // candidates: the first candidate that protects the item wins, so an
        // anonymous request never leaks an opted-in user's artwork. Mirrors
        // the per-branch scope checks in the main filter body:
        //   Episode / Season → parent series on the user's Series list
        //   Movie            → IsMovieInSpoilerScope (direct or via collection)
        //   BoxSet / other   → not protected here (its own art passes through)
        private bool ItemInSpoilerScope(UserSpoilerBlur userState, BaseItem item)
        {
            switch (item)
            {
                case Episode ep:
                    return ep.SeriesId != Guid.Empty
                        && userState.Series.ContainsKey(ep.SeriesId.ToString("N"));
                case Season season:
                    return season.SeriesId != Guid.Empty
                        && userState.Series.ContainsKey(season.SeriesId.ToString("N"));
                case MediaBrowser.Controller.Entities.Movies.Movie movie:
                    return _resolver.IsMovieInSpoilerScope(userState, movie.Id);
                default:
                    return false;
            }
        }

    }
}
