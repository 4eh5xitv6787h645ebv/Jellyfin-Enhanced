using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    /// <summary>
    /// Buffers responses for /web/index.html (and its variants) and injects a
    /// reference to JE's bootstrap script before <c>&lt;/body&gt;</c>.
    ///
    /// The bootstrap URL carries the current config-version hash as a query
    /// parameter so browsers and service workers always pick up the latest
    /// build without a manual hard refresh.
    /// </summary>
    public sealed class HtmlInjectionMiddleware
    {
        private const string BootstrapPath = "/JellyfinEnhanced/web/bootstrap.js";
        private const string ScriptMarker = "data-je-bootstrap";

        private readonly RequestDelegate _next;
        private readonly ILogger<HtmlInjectionMiddleware> _logger;

        public HtmlInjectionMiddleware(RequestDelegate next, ILogger<HtmlInjectionMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            if (!IsIndexHtmlRequest(context.Request.Path))
            {
                await _next(context).ConfigureAwait(false);
                return;
            }

            // Strip Accept-Encoding from the request so downstream gzip/brotli
            // middleware in this app doesn't compress the body before we read
            // it. Anything compressing on the way out (a reverse proxy) will
            // still see Accept-Encoding from the actual client request — but
            // we guard against that explicitly by checking Content-Encoding
            // on the response before we touch it.
            context.Request.Headers.Remove("Accept-Encoding");

            var originalBodyFeature = context.Features.Get<IHttpResponseBodyFeature>();
            using var buffer = new MemoryStream();
            // Replace IHttpResponseBodyFeature so static-file middleware's
            // sendfile / streaming path also routes into our buffer instead
            // of writing directly to the socket.
            var bufferFeature = new StreamResponseBodyFeature(buffer);
            context.Features.Set<IHttpResponseBodyFeature>(bufferFeature);

            try
            {
                await _next(context).ConfigureAwait(false);

                if (!ShouldInject(context.Response))
                {
                    await Restore(context, originalBodyFeature, buffer).ConfigureAwait(false);
                    return;
                }

                buffer.Seek(0, SeekOrigin.Begin);
                using var reader = new StreamReader(buffer, Encoding.UTF8, true, -1, true);
                var html = await reader.ReadToEndAsync().ConfigureAwait(false);

                var modified = Inject(html, context.Request.PathBase);
                var bytes = Encoding.UTF8.GetBytes(modified);

                context.Response.Headers.Remove("Content-Encoding");
                context.Response.Headers.Remove("ETag");
                context.Response.Headers.Remove("Last-Modified");
                context.Response.ContentLength = bytes.Length;

                if (originalBodyFeature is not null)
                {
                    context.Features.Set(originalBodyFeature);
                }
                await context.Response.Body.WriteAsync(bytes).ConfigureAwait(false);
            }
            catch
            {
                if (originalBodyFeature is not null)
                {
                    context.Features.Set(originalBodyFeature);
                }
                throw;
            }
        }

        private static async Task Restore(HttpContext context, IHttpResponseBodyFeature? original, MemoryStream buffer)
        {
            if (original is not null) context.Features.Set(original);
            buffer.Seek(0, SeekOrigin.Begin);
            await buffer.CopyToAsync(context.Response.Body).ConfigureAwait(false);
        }

        private static bool IsIndexHtmlRequest(PathString path)
        {
            var value = path.Value ?? string.Empty;
            return value.Equals("/web", StringComparison.OrdinalIgnoreCase)
                || value.Equals("/web/", StringComparison.OrdinalIgnoreCase)
                || value.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase);
        }

        private static bool ShouldInject(HttpResponse response)
        {
            if (response.StatusCode != 200) return false;

            // If a reverse proxy or upstream component already encoded the
            // body (gzip, br, deflate), our text rewrite would corrupt it.
            // Pass the response through untouched in that case — clients
            // will still get a working page, just without our bootstrap on
            // this request. The response body for /web/index.html is small
            // so this should be very rare in practice.
            var encoding = response.Headers.ContentEncoding;
            if (encoding.Count > 0)
            {
                foreach (var value in encoding)
                {
                    if (string.IsNullOrEmpty(value)) continue;
                    if (!value.Equals("identity", StringComparison.OrdinalIgnoreCase)) return false;
                }
            }

            var contentType = response.ContentType;
            return !string.IsNullOrEmpty(contentType)
                && contentType.Contains("text/html", StringComparison.OrdinalIgnoreCase);
        }

        private static string Inject(string html, PathString pathBase)
        {
            // Idempotency: if a previous injection is still present, strip it
            // before re-injecting with the current version hash.
            var startIdx = html.IndexOf("<script " + ScriptMarker, StringComparison.OrdinalIgnoreCase);
            if (startIdx >= 0)
            {
                var endIdx = html.IndexOf("</script>", startIdx, StringComparison.OrdinalIgnoreCase);
                if (endIdx >= 0)
                {
                    html = html.Remove(startIdx, endIdx - startIdx + "</script>".Length);
                }
            }

            var version = ConfigVersion.Current;
            var basePath = pathBase.HasValue ? pathBase.Value : string.Empty;
            var src = $"{basePath}{BootstrapPath}?v={version}";
            var tag = $"<script {ScriptMarker} src=\"{src}\" defer></script>";

            var bodyClose = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (bodyClose >= 0)
            {
                return string.Concat(html.AsSpan(0, bodyClose), tag, html.AsSpan(bodyClose));
            }

            return html + tag;
        }
    }
}
