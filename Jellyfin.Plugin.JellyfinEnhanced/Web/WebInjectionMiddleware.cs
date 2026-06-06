using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    // Buffers the served Jellyfin Web index.html and injects the Jellyfin Enhanced <script>
    // tag at request time. The web files on disk are never modified — this replaces the
    // previous approach of writing the tag into index.html (which failed on read-only web
    // roots) and the optional dependency on the File Transformation plugin.
    //
    // The actual tag construction (cache-busting version, dev attribute, idempotent removal
    // of any pre-existing tag) is delegated to TransformationPatches.IndexHtml — the exact
    // same logic the File Transformation integration used — so behaviour is unchanged.
    //
    // Design notes:
    // - Only the SPA shell (/web, /web/, /web/index.html) is rewritten; every other request
    //   passes straight through untouched.
    // - The request Accept-Encoding header is stripped for that one request so Jellyfin's
    //   UseResponseCompression (which sits between this middleware and the static-file
    //   middleware) does NOT gzip/br the body — otherwise the buffered bytes would be
    //   compressed and unreadable.
    // - The request If-None-Match/If-Modified-Since headers are stripped too: Jellyfin
    //   serves index.html with Cache-Control: no-cache plus validators, so a browser that
    //   cached the shell BEFORE this plugin was installed revalidates on every load and
    //   would otherwise receive 304s forever — keeping its un-injected copy and never
    //   loading the plugin. Forcing a 200 costs one small HTML body and only affects
    //   pre-plugin caches: the rewritten response carries no validators at all.
    // - ETag/Last-Modified are dropped and Cache-Control: no-cache forced on the rewritten
    //   shell so the browser always re-fetches the tiny HTML and never serves a stale copy.
    //   The hashed JS/CSS bundles it references are untouched and keep their normal
    //   long-lived caching.
    // - Any exception falls back to serving the original bytes — a failure here can never
    //   break the web app.
    public sealed class WebInjectionMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<WebInjectionMiddleware> _logger;

        // Once-per-process log latches: first successful injection at Info, and a missing
        // </body> at Warning. Without these the flagship failure mode (plugin never loads
        // because nothing was injected) leaves zero trace in any log.
        private static int _injectionLogged;
        private static int _noBodyTagLogged;

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
            // Prevent 304s so there is always a body to inject into (see design notes).
            context.Request.Headers.Remove(HeaderNames.IfNoneMatch);
            context.Request.Headers.Remove(HeaderNames.IfModifiedSince);

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
                    // Not the shell (e.g. redirect / error / non-html) — pass through verbatim.
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

                if (string.Equals(injected, html, StringComparison.Ordinal))
                {
                    if (Interlocked.Exchange(ref _noBodyTagLogged, 1) == 0)
                    {
                        _logger.LogWarning("Jellyfin Enhanced: served index.html contains no </body> tag — script tag NOT injected; the web client will load without Jellyfin Enhanced.");
                    }
                }
                else if (Interlocked.Exchange(ref _injectionLogged, 1) == 0)
                {
                    _logger.LogInformation("Jellyfin Enhanced: script tag injected into served index.html (request-time, no on-disk modification).");
                }

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
                context.Response.Body = originalBody;

                // Client went away mid-response — nothing to salvage and not an injection failure.
                if (context.RequestAborted.IsCancellationRequested)
                {
                    return;
                }

                // Bytes already reached the client under the injected Content-Length; appending
                // the original buffer would corrupt the response. Log and let the connection end.
                if (context.Response.HasStarted)
                {
                    _logger.LogError(ex, "Jellyfin Enhanced: index.html injection failed after the response started; the response may be incomplete");
                    return;
                }

                // Nothing was buffered (the inner pipeline threw before producing a response) —
                // rethrow so the server produces a proper error instead of an empty 200.
                if (buffer.Length == 0)
                {
                    throw;
                }

                // Never break the web app because injection failed: fall back to the original bytes.
                _logger.LogError(ex, "Jellyfin Enhanced: index.html injection failed; serving the original response");
                context.Response.ContentLength = buffer.Length;
                buffer.Seek(0, SeekOrigin.Begin);
                try
                {
                    await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                }
                catch (Exception copyEx)
                {
                    // The fallback write itself failed (connection dead) — nothing more to do.
                    _logger.LogDebug(copyEx, "Jellyfin Enhanced: fallback write of the original index.html failed");
                }
            }
            finally
            {
                context.Response.Body = originalBody;
            }
        }

        // GET only: a HEAD has no body to rewrite, and rewriting would desync Content-Length.
        // (A HEAD therefore advertises the original file's Content-Length while GET serves the
        // longer injected body — harmless, browsers do not cross-check the two.)
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
