using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    // Buffers responses for /web/index.html (and its variants) and injects a
    // reference to JE's bootstrap script before </body>. The bootstrap URL
    // carries the current config-version hash so browsers and service workers
    // always pick up the latest build without a manual hard refresh.
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

                var modified = Inject(html);
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
            // Match against both /web/* and /<base>/web/* paths because some
            // Jellyfin configurations (BaseUrl set in network.xml, reverse-
            // proxy rewrites) keep the prefix on Request.Path rather than
            // moving it to PathBase. Suffix matching is enough for our
            // purposes — there's only one /web/ tree per Jellyfin instance.
            var value = path.Value ?? string.Empty;
            if (value.Length == 0) return false;

            if (value.Equals("/web", StringComparison.OrdinalIgnoreCase)
                || value.Equals("/web/", StringComparison.OrdinalIgnoreCase)
                || value.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return value.EndsWith("/web", StringComparison.OrdinalIgnoreCase)
                || value.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
                || value.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase);
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

        private const string PreemptMarker = "data-je-preempt";

        // Tiny inline script that runs SYNCHRONOUSLY during HTML parse,
        // before Jellyfin's SPA router has a chance to read the URL or
        // register its own listeners.
        //
        // Three interception layers — Jellyfin navigates via different
        // mechanisms depending on context, and we have to cover all of
        // them or the user will see a "Page not found" flash:
        //
        //  1. URL parse on load — if the page was opened directly with a
        //     JE hash, rewrite to #/home and stash the id.
        //  2. hashchange / popstate listeners (capture phase, registered
        //     here so they fire before Jellyfin's deferred bundles).
        //  3. CRITICAL: click capture on links with href starting with
        //     "#/JellyfinEnhanced/", PLUS history.pushState /
        //     history.replaceState wrappers. Jellyfin's emby-linkbutton
        //     handles in-app sidebar clicks via pushState, which does
        //     NOT fire hashchange or popstate — without these wrappers,
        //     a sidebar click lands on a JE URL that Jellyfin's router
        //     paints as notFound.
        //
        // The route id is stashed in sessionStorage on every match.
        // RouteHijacker reads sessionStorage on every evaluate().
        private const string PreemptScript =
            "<script " + PreemptMarker + ">(function(){"
            + "var P='#/JellyfinEnhanced/';"
            + "function extract(href){if(typeof href!=='string')return null;var i=href.indexOf('#');var h=i>=0?href.slice(i):href;if(h.indexOf(P)!==0)return null;var r=h.slice(P.length);var q=r.indexOf('?');if(q>=0)r=r.slice(0,q);return r||null;}"
            + "function stash(id){try{sessionStorage.setItem('__JE_PENDING_ROUTE__',id);}catch(_){}try{window.dispatchEvent(new CustomEvent('je-route-pending',{detail:{id:id}}));}catch(_){}}"
            + "function goHome(){if(location.hash!=='#/home')location.replace(location.pathname+location.search+'#/home');}"
            + "function preempt(e){var src=e&&e.newURL?e.newURL:location.href;var id=extract(src);if(!id)return;stash(id);goHome();if(e&&e.stopImmediatePropagation)e.stopImmediatePropagation();}"
            + "preempt(null);"
            + "window.addEventListener('hashchange',preempt,true);"
            + "window.addEventListener('popstate',preempt,true);"
            + "document.addEventListener('click',function(e){if(e.defaultPrevented||e.button)return;var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var id=extract(a.getAttribute('href'));if(!id)return;e.preventDefault();e.stopImmediatePropagation();stash(id);goHome();},true);"
            + "var op=history.pushState,or=history.replaceState;"
            + "history.pushState=function(s,t,u){var id=extract(u);if(id){stash(id);return op.call(this,s,t,location.pathname+location.search+'#/home');}return op.apply(this,arguments);};"
            + "history.replaceState=function(s,t,u){var id=extract(u);if(id){stash(id);return or.call(this,s,t,location.pathname+location.search+'#/home');}return or.apply(this,arguments);};"
            + "})();</script>";

        private static string Inject(string html)
        {
            // Idempotency: if previous injections are still present, strip
            // them before re-injecting with the current version hash.
            html = StripExistingTag(html, ScriptMarker);
            html = StripExistingTag(html, PreemptMarker);

            // Use a relative URL so the browser resolves the bootstrap against
            // the page's actual location. Works for /web/index.html (where the
            // resolved URL is /JellyfinEnhanced/...) and for /<base>/web/index.html
            // (where the resolved URL is /<base>/JellyfinEnhanced/...) without
            // any path manipulation here.
            var version = ConfigVersion.Current;
            var src = $"..{BootstrapPath}?v={version}";
            var tag = $"<script {ScriptMarker} src=\"{src}\" defer></script>";

            // The preempt runs as early as possible — inject it immediately
            // after <head> so it executes before any defer'd / inlined
            // Jellyfin scripts later in the document.
            var headClose = html.IndexOf("<head>", StringComparison.OrdinalIgnoreCase);
            if (headClose >= 0)
            {
                var insertAt = headClose + "<head>".Length;
                html = string.Concat(html.AsSpan(0, insertAt), PreemptScript, html.AsSpan(insertAt));
            }

            var bodyClose = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (bodyClose >= 0)
            {
                return string.Concat(html.AsSpan(0, bodyClose), tag, html.AsSpan(bodyClose));
            }

            return html + tag;
        }

        private static string StripExistingTag(string html, string marker)
        {
            var startIdx = html.IndexOf("<script " + marker, StringComparison.OrdinalIgnoreCase);
            if (startIdx < 0) return html;
            var endIdx = html.IndexOf("</script>", startIdx, StringComparison.OrdinalIgnoreCase);
            if (endIdx < 0) return html;
            return html.Remove(startIdx, endIdx - startIdx + "</script>".Length);
        }
    }
}
