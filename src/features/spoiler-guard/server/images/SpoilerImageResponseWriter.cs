using System.Collections.Concurrent;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Replaces image response bytes and applies private cache policy, including fail-closed rendering fallbacks.
    /// </summary>
    internal sealed class SpoilerImageResponseWriter
    {
        private readonly ILibraryManager _libraryManager;
        private readonly SpoilerUserResolver _resolver;
        private readonly ImageBlurService _blurService;
        private readonly Logger _logger;

        internal SpoilerImageResponseWriter(ILibraryManager libraryManager, SpoilerUserResolver resolver,
            ImageBlurService blurService, Logger logger)
        {
            _libraryManager = libraryManager;
            _resolver = resolver;
            _blurService = blurService;
            _logger = logger;
        }

        // Re-warn at most once per hour per surface so a real Jellyfin upgrade
        // changing the response shape isn't permanently invisible.
        private static readonly TimeSpan ShapeWarnInterval = TimeSpan.FromHours(1);
        private static readonly ConcurrentDictionary<string, DateTime> _warnedShapeAt = new();

        // When an item that SHOULD be considered for blur (user has the
        // series enabled) takes a pass-through code path — watched, blur
        // failed, item not yet resolvable, etc. — strip 1-year public
        // caching. Uses the SAME header set as the blurred-response path
        // (`private, no-store, max-age=0, must-revalidate` + drop ETag /
        // Last-Modified) because `private, no-cache` still permits 304
        // revalidation and reuse of the cached unblurred bytes — defeating
        // the whole point of the pass-through scrub.
        //
        // For paths where the response has already begun streaming (the
        // watched-pass-through case after `next()`), we register on
        // `Response.OnStarting` so the override runs JUST BEFORE headers
        // flush.
        internal void ApplyNoStoreToResponse(Microsoft.AspNetCore.Http.HttpContext httpContext)
        {
            try
            {
                if (httpContext.Response.HasStarted)
                {
                    // Response already flushed — too late to mutate
                    // headers. Surface so operators can diagnose when the
                    // cache-scrub silently fails for streaming results.
                    // Rate-limited so a misbehaving response shape doesn't
                    // spam logs on every image fetch.
                    _resolver.WarnRateLimited(
                        "no-store-already-started",
                        "Spoiler Guard: ApplyNoStoreToResponse called after Response.HasStarted=true; cache headers NOT applied. Cache-scrub may not have taken effect for this code path. (For watched-pass-through, use RegisterNoStoreOnStarting BEFORE awaiting next() instead.)");
                    return;
                }
                ApplyNoStoreHeadersDirect(httpContext);
            }
            catch (Exception ex)
            {
                // Don't silently swallow; surface so operators can
                // diagnose when the cache headers aren't actually
                // being applied.
                _logger.Warning($"ApplyNoStoreToResponse failed: {ex.Message}");
            }
        }

        // Registers an OnStarting callback that overrides the cache headers
        // immediately before MVC writes them. Use this for pass-through
        // paths that occur AFTER awaiting `next()` for streaming results
        // where the response may already be on its way out.
        internal void RegisterNoStoreOnStarting(Microsoft.AspNetCore.Http.HttpContext httpContext, string imageType = "")
        {
            try
            {
                if (httpContext.Response.HasStarted)
                {
                    return;
                }
                httpContext.Response.OnStarting(() =>
                {
                    try { ApplyNoStoreHeadersDirect(httpContext, imageType); }
                    catch (Exception ex) { _logger.Warning($"OnStarting no-store override failed: {ex.Message}"); }
                    return Task.CompletedTask;
                });
            }
            catch (Exception ex)
            {
                _logger.Warning($"RegisterNoStoreOnStarting failed: {ex.Message}");
            }
        }

        private static void ApplyNoStoreHeadersDirect(Microsoft.AspNetCore.Http.HttpContext httpContext, string imageType = "")
        {
            var headers = httpContext.Response.Headers;
            // Chapter / scene preview images render in a hover-tooltip on
            // the player timeline. Strict no-store made every hover round-
            // trip and produced a visible "gray box → image swap" jank as
            // the browser had no cached copy. Allow a short private cache
            // (30s) for chapter images so subsequent hovers within the
            // same session are instant. Trade-off: a watched-state change
            // (e.g. user advances past a chapter) re-renders within 30s
            // instead of immediately — acceptable for Spoiler Guard UX.
            // Other image types keep strict no-store: posters / thumbs
            // change blur status on a per-watch event, where caching past
            // a state change would defeat the feature.
            var isChapter = string.Equals(imageType, "Chapter", StringComparison.OrdinalIgnoreCase);
            headers["Cache-Control"] = isChapter
                ? "private, max-age=30, must-revalidate"
                : "private, no-store, max-age=0, must-revalidate";
            headers.Remove("ETag");
            headers.Remove("Last-Modified");
        }

        // Stock-card replacement path. Used when SpoilerBlurMode == "hide".
        // Instead of returning a flat dark-grey rectangle, try a "safe
        // parent" art image first so the user gets a visually-consistent
        // grid of "this show / this franchise" art rather than a sea of
        // blank dark cards. The parent image type is picked by source
        // aspect to avoid distortion:
        //   Episode (16:9 thumb)        → Series Backdrop (16:9)
        //   Season (2:3 poster)         → Series Primary (2:3)
        //   Movie via Collection (2:3)  → Collection Primary (2:3)
        // When no safe parent art exists (movie directly opted in, series
        // without a Backdrop, etc.) the fallback chain is: blur the original →
        // a flat dark stock card → the pre-encoded #101010 fallback JPEG (only
        // if Skia itself fails). Mirrors ReplaceWithBlurredAsync's no-store policy.
        internal async Task ReplaceWithStockCardAsync(
            ActionExecutedContext executed,
            int sigma,
            string cacheKey,
            string imageType,
            MediaBrowser.Controller.Entities.BaseItem item,
            UserSpoilerBlur userState)
        {
            if (executed.Result == null) return;
            if (string.Equals(executed.HttpContext.Request.Method, "HEAD", StringComparison.OrdinalIgnoreCase))
            {
                ApplyNoStoreToResponse(executed.HttpContext);
                return;
            }

            var (originalBytes, _) = await ExtractBytesAsync(executed.Result).ConfigureAwait(false);
            if (originalBytes == null || originalBytes.Length == 0)
            {
                MaybeWarnShapeMismatch(executed.Result);
                ApplyNoStoreToResponse(executed.HttpContext);
                return;
            }

            var parentBytes = TryGetParentArtBytes(item, userState, originalBytes, cacheKey + ":pp");
            if (parentBytes != null && parentBytes.Length > 0)
            {
                executed.Result = new FileContentResult(parentBytes, "image/jpeg");
                if (executed.HttpContext.Response.HasStarted) return;
                ApplyNoStoreHeadersDirect(executed.HttpContext, imageType);
                return;
            }

            // No safe parent art available (e.g. movie directly opted in,
            // series without a Backdrop, season without a Series Primary).
            // Fall back to a blur of the original bytes so the card still
            // has content rather than rendering as a flat dark "broken"
            // tile. Visually consistent with what the user would see in
            // blur-mode for the same item.
            var blurred = _blurService.Blur(originalBytes, sigma, cacheKey);
            if (blurred != null)
            {
                executed.Result = new FileContentResult(blurred, "image/jpeg");
                if (executed.HttpContext.Response.HasStarted) return;
                ApplyNoStoreHeadersDirect(executed.HttpContext, imageType);
                return;
            }

            var stock = _blurService.StockCard(originalBytes, cacheKey);
            if (stock == null)
            {
                // Skia render failed on a flat-fill — practically unreachable
                // (Jellyfin's whole image pipeline shares the same Skia copy)
                // but the hide-mode spoiler contract is "never serve original
                // bytes through this path". Fall back to the pre-encoded
                // 16x16 #101010 JPEG so the invariant is structural, not
                // dependent on Skia liveness.
                executed.Result = new FileContentResult(_blurService.HardcodedFallbackJpeg, "image/jpeg");
                ApplyNoStoreToResponse(executed.HttpContext);
                return;
            }

            executed.Result = new FileContentResult(stock, "image/jpeg");
            if (executed.HttpContext.Response.HasStarted) return;
            ApplyNoStoreHeadersDirect(executed.HttpContext, imageType);
        }

        // Returns the bytes of a "safe parent" art image scaled to roughly
        // match the original-image dimensions. Picks the parent image type
        // by the source's aspect so ResizeToMatch's non-uniform scale stays
        // proportional:
        //
        //   Episode (16:9 thumb)        → Series Backdrop
        //   Season (2:3 poster)         → Series Primary
        //   Movie via Collection (2:3)  → Collection Primary
        //
        // Returns null when no safe parent exists (movie directly opted in,
        // or the picked image type is missing on the parent) — caller then
        // falls back to blurring the original (then a flat dark stock card,
        // then the hardcoded fallback JPEG). JPEG-encoded, suitable for
        // FileContentResult.
        private byte[]? TryGetParentArtBytes(
            MediaBrowser.Controller.Entities.BaseItem item,
            UserSpoilerBlur userState,
            byte[] originalBytes,
            string cacheKey)
        {
            try
            {
                Guid parentId = Guid.Empty;
                var parentImageType = MediaBrowser.Model.Entities.ImageType.Primary;

                if (item is Episode ep)
                {
                    // Episode Primary is the episode thumbnail (16:9). Series
                    // Backdrop is also 16:9, so ResizeToMatch's non-uniform
                    // scale stays proportional.
                    parentId = ep.SeriesId;
                    parentImageType = MediaBrowser.Model.Entities.ImageType.Backdrop;
                }
                else if (item is Season s)
                {
                    // Season Primary is the season poster (2:3). Keep Primary
                    // here so we feed a 2:3 source into a 2:3 target slot — a
                    // Series Backdrop would squash 16:9 → 2:3, which is what
                    // we just fixed in the inverse direction for episodes.
                    parentId = s.SeriesId;
                    parentImageType = MediaBrowser.Model.Entities.ImageType.Primary;
                }
                else if (item is MediaBrowser.Controller.Entities.Movies.Movie movie)
                {
                    // Movie directly opted-in has no safe parent (its own
                    // Primary IS the spoiler). For collection-opted movies,
                    // fall back to the collection's Primary art (2:3, same
                    // aspect as the movie's own poster).
                    if (!userState.Movies.ContainsKey(movie.Id.ToString("N")))
                    {
                        parentId = _resolver.FindOptedInCollectionForMovie(userState, movie.Id) ?? Guid.Empty;
                    }
                }

                if (parentId == Guid.Empty) return null;
                var parent = _libraryManager.GetItemById(parentId);
                if (parent == null) return null;

                var imgInfo = parent.GetImageInfo(parentImageType, 0);
                if (imgInfo == null || string.IsNullOrEmpty(imgInfo.Path)) return null;
                if (!System.IO.File.Exists(imgInfo.Path)) return null;

                // Cache via the same LRU as StockCard — same cacheKey
                // shape so successive identical requests are free.
                var fileBytes = System.IO.File.ReadAllBytes(imgInfo.Path);
                if (fileBytes == null || fileBytes.Length == 0) return null;

                // Resize to roughly match the original dimensions so the
                // card layout doesn't shift. Use the original's probe
                // dimensions; cap at MaxDecodeEdgePx via ImageBlurService.
                //
                // The resize cache key MUST include the chosen parent id +
                // image type: for a collection-opted movie the parent is
                // picked from the requesting user's Collections, so the same
                // movie/size/mode key can resolve to DIFFERENT collection art
                // for two users. Without this, user B (movie in Collection B)
                // could be served user A's Collection A art from the cache.
                var parentArtKey = cacheKey + ":" + parentId.ToString("N") + ":" + parentImageType;
                return _blurService.ResizeToMatch(fileBytes, originalBytes, parentArtKey);
            }
            catch (Exception ex)
            {
                _resolver.WarnRateLimited(
                    "parent-art:" + ex.GetType().FullName,
                    $"Spoiler Guard: parent-art fallback failed for item {item?.Id}: {ex.Message}");
                return null;
            }
        }

        internal async Task ReplaceWithBlurredAsync(ActionExecutedContext executed, int sigma, string cacheKey, string imageType = "")
        {
            if (executed.Result == null) return;

            // HEAD requests carry no body — pass through.
            if (string.Equals(executed.HttpContext.Request.Method, "HEAD", StringComparison.OrdinalIgnoreCase))
            {
                ApplyNoStoreToResponse(executed.HttpContext);
                return;
            }

            var (originalBytes, _) = await ExtractBytesAsync(executed.Result).ConfigureAwait(false);
            if (originalBytes == null || originalBytes.Length == 0)
            {
                MaybeWarnShapeMismatch(executed.Result);
                ApplyNoStoreToResponse(executed.HttpContext);
                return;
            }

            var blurred = _blurService.Blur(originalBytes, sigma, cacheKey);
            if (blurred == null)
            {
                // Blur failed, and we already consumed the source stream during
                // ExtractBytesAsync, so we MUST write a complete body — but it
                // must NEVER be the original spoiler bytes (fail CLOSED, same as
                // hide mode). Fall back to a stock card sized to the original
                // (keeps the grid from shifting), then the hardcoded JPEG if even
                // that fails. Not cached (null key) since this is a transient
                // error path. Force `no-store`.
                var fallback = _blurService.StockCard(originalBytes, null) ?? _blurService.HardcodedFallbackJpeg;
                executed.Result = new FileContentResult(fallback, "image/jpeg");
                ApplyNoStoreToResponse(executed.HttpContext);
                return;
            }

            // We always re-encode as JPEG (the blur service does), so set the
            // content type explicitly. Cache-Control: private, no-store keeps
            // clients from holding the blurred copy after the user marks the
            // episode watched or disables Spoiler Guard for the series.
            // Chapter images get a short browser-cache window via
            // ApplyNoStoreHeadersDirect so timeline-hover preview thumbs
            // don't round-trip on every cursor move.
            executed.Result = new FileContentResult(blurred, "image/jpeg");

            if (executed.HttpContext.Response.HasStarted) return;
            ApplyNoStoreHeadersDirect(executed.HttpContext, imageType);
        }

        private static async Task<(byte[]? Bytes, string? ContentType)> ExtractBytesAsync(IActionResult result)
        {
            switch (result)
            {
                case FileContentResult fcr:
                    return (fcr.FileContents, fcr.ContentType);

                case FileStreamResult fsr:
                    if (fsr.FileStream == null) return (null, fsr.ContentType);
                    using (var ms = new MemoryStream())
                    {
                        await fsr.FileStream.CopyToAsync(ms).ConfigureAwait(false);
                        return (ms.ToArray(), fsr.ContentType);
                    }

                case PhysicalFileResult pfr:
                    if (string.IsNullOrEmpty(pfr.FileName) || !File.Exists(pfr.FileName))
                        return (null, pfr.ContentType);
                    return (await File.ReadAllBytesAsync(pfr.FileName).ConfigureAwait(false), pfr.ContentType);

                case VirtualFileResult vfr:
                    if (string.IsNullOrEmpty(vfr.FileName)) return (null, vfr.ContentType);
                    var fp = vfr.FileName;
                    return File.Exists(fp)
                        ? (await File.ReadAllBytesAsync(fp).ConfigureAwait(false), vfr.ContentType)
                        : (null, vfr.ContentType);

                default:
                    return (null, null);
            }
        }

        private void MaybeWarnShapeMismatch(IActionResult result)
        {
            var key = result?.GetType().FullName ?? "(null)";
            var now = DateTime.UtcNow;
            var stored = _warnedShapeAt.AddOrUpdate(
                key,
                now,
                (_, last) => (now - last) >= ShapeWarnInterval ? now : last);
            if (stored != now) return;
            _logger.Warning($"Spoiler Guard: image action produced an unrecognized result type ({key}); blur is no-op for this shape. Re-warns hourly. Likely a Jellyfin upgrade changed the image controller's return type.");
        }
    }
}
