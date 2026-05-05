using System;
using System.IO;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    public sealed class PosterTagMiddleware
    {
        // Cap individual response buffering to protect against OOM-DoS via large
        // upstream payloads. 16 MB is generous for posters (typical fillHeight=600
        // JPEGs are 30-150 KB) but small enough that 100 concurrent matches stay
        // under 2 GB total RAM.
        private const long MaxBufferBytes = 16L * 1024L * 1024L;

        private readonly RequestDelegate _next;
        private readonly Logger _logger;
        private readonly PosterTagRenderer _renderer;
        private readonly UserConfigurationManager _userConfig;

        public PosterTagMiddleware(RequestDelegate next, Logger logger, PosterTagRenderer renderer, UserConfigurationManager userConfig)
        {
            _next = next;
            _logger = logger;
            _renderer = renderer;
            _userConfig = userConfig;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            if (!IsCandidatePosterRequest(context))
            {
                await _next(context).ConfigureAwait(false);
                return;
            }

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.EnablePosterTags)
            {
                await _next(context).ConfigureAwait(false);
                return;
            }

            await HandlePosterRequest(context, config).ConfigureAwait(false);
        }

        private static bool IsCandidatePosterRequest(HttpContext context)
        {
            if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
            {
                return false;
            }

            var path = context.Request.Path.Value;
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            var itemsIdx = path.IndexOf("/Items/", StringComparison.OrdinalIgnoreCase);
            if (itemsIdx < 0)
            {
                return false;
            }

            // Look for /Images/Primary anywhere after /Items/
            return path.IndexOf("/Images/Primary", itemsIdx, StringComparison.OrdinalIgnoreCase) > itemsIdx;
        }

        private async Task HandlePosterRequest(HttpContext context, Configuration.PluginConfiguration config)
        {
            // Strip Accept-Encoding so the upstream pipeline does not compress
            // the image (it is already a compressed format and decompression
            // would add cost without benefit while complicating the buffer).
            context.Request.Headers.Remove("Accept-Encoding");

            var originalBody = context.Response.Body;
            using var bufferedBody = new BoundedMemoryStream(MaxBufferBytes);
            context.Response.Body = bufferedBody;

            bool overran = false;
            try
            {
                try
                {
                    await _next(context).ConfigureAwait(false);
                }
                catch (BoundedMemoryStream.CapacityExceededException)
                {
                    // Upstream produced a body larger than our DoS cap. Bail to
                    // original stream untouched. Seek to start and stream what we
                    // have so the client at least gets bytes.
                    overran = true;
                    _logger.Warning($"[PosterTags] Upstream body exceeded {MaxBufferBytes / (1024 * 1024)}MB cap on {context.Request.Path}; bypassing");
                }

                if (context.Response.HasStarted)
                {
                    // Cannot rewrite once headers are flushed. Body has already
                    // been written through our wrapper, but downstream may have
                    // bypassed it. Restore body pointer for any later writers.
                    context.Response.Body = originalBody;
                    return;
                }

                var statusCode = context.Response.StatusCode;
                var contentType = context.Response.ContentType ?? string.Empty;
                var isImage = contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);

                Guid? itemId = null;
                if (!overran && statusCode == 200 && isImage && bufferedBody.Length > 0)
                {
                    itemId = ExtractItemId(context.Request.Path.Value!);
                }

                if (overran || itemId == null)
                {
                    await PassThroughAsync(context, originalBody, bufferedBody).ConfigureAwait(false);
                    return;
                }

                // Resolve the requesting user from the auth claims that
                // Jellyfin's UseAuthentication middleware populated during _next.
                // Anonymous requests (or requests where auth produced no user)
                // fall back to admin defaults via a null UserSettings.
                var userId = UserHelper.GetCurrentUserId(context.User);
                UserSettings? userSettings = null;
                if (userId.HasValue && userId.Value != Guid.Empty)
                {
                    try
                    {
                        var idN = userId.Value.ToString("N");
                        if (_userConfig.UserConfigurationExists(idN, "settings.json"))
                        {
                            userSettings = _userConfig.GetUserConfiguration<UserSettings>(idN, "settings.json");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning($"[PosterTags] Failed to read UserSettings for {userId} ({ex.GetType().Name}): {ex.Message}; using admin defaults");
                    }
                }

                var sourceBytes = bufferedBody.ToArray();
                byte[] modified;
                try
                {
                    modified = await _renderer.RenderAsync(itemId.Value, sourceBytes, contentType, config, userSettings, userId).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.Warning($"[PosterTags] Render failed for item {itemId} ({ex.GetType().Name}): {ex.Message}; serving original");
                    modified = sourceBytes;
                }

                context.Response.Headers.Remove("Content-Encoding");
                context.Response.Headers.Remove("ETag"); // ETag refers to original bytes; modified bytes need a new tag (omit for now)
                context.Response.ContentLength = modified.Length;
                context.Response.Body = originalBody;
                await context.Response.Body.WriteAsync(modified).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // Restore body and copy whatever we buffered so the client receives
                // the upstream error response intact instead of a blank 500.
                _logger.Error($"[PosterTags] Middleware exception on {context.Request.Path}: {ex.GetType().Name}: {ex.Message}; restoring upstream body");
                try
                {
                    await PassThroughAsync(context, originalBody, bufferedBody).ConfigureAwait(false);
                }
                catch
                {
                    context.Response.Body = originalBody;
                }
                throw;
            }
        }

        private static async Task PassThroughAsync(HttpContext context, Stream originalBody, BoundedMemoryStream buffered)
        {
            buffered.Seek(0, SeekOrigin.Begin);
            context.Response.Body = originalBody;
            if (buffered.Length > 0 && !context.Response.HasStarted)
            {
                context.Response.ContentLength = buffered.Length;
            }
            if (buffered.Length > 0)
            {
                await buffered.CopyToAsync(context.Response.Body).ConfigureAwait(false);
            }
        }

        private static Guid? ExtractItemId(string path)
        {
            // Path looks like: /[base/]Items/<guid>/Images/Primary[/<index>]
            const string marker = "/Items/";
            var start = path.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (start < 0)
            {
                return null;
            }
            start += marker.Length;
            var end = path.IndexOf('/', start);
            if (end < 0)
            {
                return null;
            }
            var idStr = path.Substring(start, end - start);
            return Guid.TryParse(idStr, out var id) ? id : null;
        }
    }
}
