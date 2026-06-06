using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    /// <summary>
    /// Buffers the served Jellyfin Web <c>index.html</c> and injects the Jellyfin Enhanced
    /// <c>&lt;script&gt;</c> tag at request time. The web files on disk are never modified — this
    /// replaces the previous approach of writing the tag into <c>index.html</c> (which failed on
    /// read-only web roots) and the optional dependency on the File Transformation plugin.
    ///
    /// The actual tag construction (cache-busting version, dev attribute, idempotent removal of any
    /// pre-existing tag) is delegated to <see cref="TransformationPatches.IndexHtml"/> — the exact
    /// same logic the File Transformation integration used — so behaviour is unchanged.
    ///
    /// Design notes (mirrors the runtime-verified reference implementation under
    /// /home/jake/docs/jellyfinv12):
    /// - Only the SPA shell (<c>/web</c>, <c>/web/</c>, <c>/web/index.html</c>) is rewritten; every other
    ///   request passes straight through untouched.
    /// - We strip the request <c>Accept-Encoding</c> for that one request so Jellyfin's
    ///   <c>UseResponseCompression</c> (which sits between this middleware and the static-file middleware)
    ///   does NOT gzip/br the body — otherwise the buffered bytes would be compressed and unreadable.
    /// - We drop <c>ETag</c>/<c>Last-Modified</c> and force <c>Cache-Control: no-cache</c> on the rewritten
    ///   shell so the browser always revalidates the tiny HTML and never serves a stale copy. The hashed
    ///   JS/CSS bundles it references are untouched and keep their normal long-lived caching.
    /// - Any exception falls back to serving the original bytes — a failure here can never break the web app.
    /// </summary>
    public sealed class WebInjectionMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<WebInjectionMiddleware> _logger;

        public WebInjectionMiddleware(RequestDelegate next, ILogger<WebInjectionMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            if (!IsIndexRequest(context.Request))
            {
                await _next(context).ConfigureAwait(false);
                return;
            }

            // Prevent compression so we can read the buffered HTML as text.
            context.Request.Headers.Remove(HeaderNames.AcceptEncoding);

            var originalBody = context.Response.Body;
            using var buffer = new MemoryStream();
            context.Response.Body = buffer;
            try
            {
                await _next(context).ConfigureAwait(false);

                var isHtml = context.Response.StatusCode == StatusCodes.Status200OK
                             && (context.Response.ContentType?.Contains("text/html", StringComparison.OrdinalIgnoreCase) ?? false);

                buffer.Seek(0, SeekOrigin.Begin);
                context.Response.Body = originalBody;

                if (!isHtml)
                {
                    // Not the shell (e.g. 304 / range / non-html) — pass through verbatim.
                    await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                    return;
                }

                string html;
                using (var reader = new StreamReader(buffer, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true))
                {
                    html = await reader.ReadToEndAsync().ConfigureAwait(false);
                }

                // Reuse the existing injector: removes any pre-existing JE tag, then inserts the
                // cache-busted tag before </body>. Returns the input unchanged if there is no </body>.
                var injected = TransformationPatches.IndexHtml(new PatchRequestPayload { Contents = html });
                var bytes = Encoding.UTF8.GetBytes(injected);

                context.Response.Headers.Remove(HeaderNames.ETag);
                context.Response.Headers.Remove(HeaderNames.LastModified);
                context.Response.Headers.CacheControl = "no-cache";
                context.Response.ContentType = "text/html;charset=utf-8";
                context.Response.ContentLength = bytes.Length;
                await originalBody.WriteAsync(bytes).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // Never break the web app because injection failed: fall back to the original bytes.
                _logger.LogError(ex, "Jellyfin Enhanced: index.html injection failed; serving original");
                context.Response.Body = originalBody;
                if (buffer.CanRead)
                {
                    buffer.Seek(0, SeekOrigin.Begin);
                    await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                }
            }
            finally
            {
                context.Response.Body = originalBody;
            }
        }

        // GET only: a HEAD has no body to rewrite, and rewriting would desync Content-Length.
        private static bool IsIndexRequest(HttpRequest request)
        {
            if (!HttpMethods.IsGet(request.Method))
            {
                return false;
            }

            // The Jellyfin Web shell is served at "<base>/web", "<base>/web/" or
            // "<base>/web/index.html". This middleware runs ahead of Jellyfin's base-URL
            // branch (Startup.cs: app.Map(config.BaseUrl, ...)), so when a base URL is
            // configured the prefix is still present on the path — match the suffix rather
            // than an absolute path so sub-path installs are injected too. The status/HTML
            // and "</body>" checks downstream keep this loose match safe.
            var path = request.Path.Value ?? string.Empty;
            return path.EndsWith("/web", StringComparison.OrdinalIgnoreCase)
                   || path.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
                   || path.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase);
        }
    }
}
