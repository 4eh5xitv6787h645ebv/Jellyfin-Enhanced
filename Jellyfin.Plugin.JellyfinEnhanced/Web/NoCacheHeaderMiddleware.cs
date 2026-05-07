using Microsoft.AspNetCore.Http;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    // Forces revalidation on /web/index.html and JE-owned endpoints so plugin
    // updates and config changes propagate to clients without a hard refresh.
    // Asset URLs (the bootstrap, the main script) carry their own version
    // query string for cache busting and are not touched here.
    public sealed class NoCacheHeaderMiddleware
    {
        private readonly RequestDelegate _next;

        public NoCacheHeaderMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var path = context.Request.Path.Value ?? string.Empty;

            if (RequiresNoCache(path))
            {
                context.Response.OnStarting(() =>
                {
                    var headers = context.Response.Headers;
                    headers[HeaderNames.CacheControl] = "no-cache, no-store, must-revalidate";
                    headers[HeaderNames.Pragma] = "no-cache";
                    headers[HeaderNames.Expires] = "0";
                    headers.Remove(HeaderNames.ETag);
                    headers.Remove(HeaderNames.LastModified);
                    return Task.CompletedTask;
                });
            }

            await _next(context).ConfigureAwait(false);
        }

        private static bool RequiresNoCache(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;

            // Suffix matching covers Jellyfin sub-path mounts (BaseUrl set in
            // network.xml or a reverse-proxy that doesn't strip the prefix).
            return path.EndsWith("/web", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith("/JellyfinEnhanced/web/version", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith("/JellyfinEnhanced/web/bootstrap.js", StringComparison.OrdinalIgnoreCase);
        }
    }
}
