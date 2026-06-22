using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Replaces jellyfin-web's branding assets (logo / banner / favicon / touch icon)
    /// with the admin's uploaded custom images at request time, via ASP.NET middleware
    /// registered through <see cref="Microsoft.AspNetCore.Hosting.IStartupFilter"/>.
    ///
    /// This is the branding half of dropping the File Transformation dependency
    /// (script injection is handled by <see cref="ScriptInjectionStartupFilter"/>).
    /// jellyfin-web serves these assets as plain hashed static files
    /// (e.g. /web/icon-transparent.&lt;hash&gt;.png), so the only interception point is a
    /// plugin middleware ahead of the static-file handler.
    ///
    /// The custom images are uploaded through the plugin's existing controller and
    /// stored under <see cref="JellyfinEnhanced.BrandingDirectory"/> using fixed,
    /// un-hashed names. When a custom file exists this middleware short-circuits the
    /// request and streams those bytes directly (no buffering, no de/recompression —
    /// PNG/ICO are already compressed). When it does not, it calls next() and the
    /// stock asset is served, preserving the original "no custom image = no change"
    /// behaviour. Any error falls through to next(). Disable via
    /// DisableBrandingMiddleware.
    /// </summary>
    public class BrandingAssetStartupFilter : IStartupFilter
    {
        private readonly Logger _logger;
        private bool _loggedOnce;

        private static readonly RegexOptions Opts = RegexOptions.IgnoreCase | RegexOptions.Compiled;
        private static readonly TimeSpan MatchTimeout = TimeSpan.FromSeconds(2);

        // Served-filename pattern -> fixed on-disk filename under BrandingDirectory.
        // Patterns match the stable basename and are hash-agnostic, since the webpack
        // content hash changes on every jellyfin-web build. The touchicon pattern
        // requires a literal "." before the hash so it does NOT also match the
        // separate "touchicon144.<hash>.png" variant. The served basename "touchicon"
        // maps to the upload name "apple-touch-icon.png"; the other four match 1:1.
        private static readonly (Regex Pattern, string OnDiskFileName)[] Map =
        {
            (new Regex(@"^icon-transparent\..*\.png$", Opts, MatchTimeout), "icon-transparent.png"),
            (new Regex(@"^banner-light\..*\.png$", Opts, MatchTimeout), "banner-light.png"),
            (new Regex(@"^banner-dark\..*\.png$", Opts, MatchTimeout), "banner-dark.png"),
            (new Regex(@"^favicon\..*\.ico$", Opts, MatchTimeout), "favicon.ico"),
            (new Regex(@"^touchicon\.[0-9a-f]+\.png$", Opts, MatchTimeout), "apple-touch-icon.png"),
        };

        public BrandingAssetStartupFilter(Logger logger)
        {
            _logger = logger;
        }

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                app.Use(InvokeAsync);
                next(app);
            };
        }

        private async Task InvokeAsync(HttpContext context, Func<Task> nextMw)
        {
            var onDiskFileName = MatchBrandingAsset(context.Request.Path.Value);
            if (onDiskFileName == null)
            {
                await nextMw().ConfigureAwait(false);
                return;
            }

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || config.DisableBrandingMiddleware)
            {
                await nextMw().ConfigureAwait(false);
                return;
            }

            try
            {
                var brandingDir = JellyfinEnhanced.BrandingDirectory;
                if (!string.IsNullOrWhiteSpace(brandingDir))
                {
                    // Resolve under BrandingDirectory and confirm the candidate stays
                    // inside it (defence in depth; OnDiskFileName is a constant).
                    var fullDir = Path.GetFullPath(brandingDir);
                    var filePath = Path.GetFullPath(Path.Combine(fullDir, onDiskFileName));
                    if (string.Equals(Path.GetDirectoryName(filePath), fullDir, StringComparison.OrdinalIgnoreCase)
                        && File.Exists(filePath))
                    {
                        var bytes = await File.ReadAllBytesAsync(filePath).ConfigureAwait(false);
                        if (bytes.Length > 0)
                        {
                            var provider = new FileExtensionContentTypeProvider();
                            if (!provider.TryGetContentType(filePath, out var contentType))
                            {
                                contentType = "application/octet-stream";
                            }

                            context.Response.StatusCode = 200;
                            context.Response.ContentType = contentType;
                            context.Response.ContentLength = bytes.Length;
                            context.Response.Headers["Cache-Control"] = "no-cache";
                            context.Response.Headers.Remove("ETag");
                            context.Response.Headers.Remove("Last-Modified");

                            if (!_loggedOnce)
                            {
                                _logger.Info("Serving custom branding via request-time middleware (IStartupFilter). File Transformation is not required.");
                                _loggedOnce = true;
                            }

                            await context.Response.Body.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
                            return; // short-circuit: do not fall through to the static-file handler
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // Never break asset serving — fall through to the stock asset below.
                _logger.Warning($"Branding middleware error (serving stock asset): {ex.Message}");
            }

            // No custom image (or an error): let jellyfin-web serve the stock asset.
            await nextMw().ConfigureAwait(false);
        }

        private static string? MatchBrandingAsset(string? path)
        {
            if (string.IsNullOrEmpty(path) || path.IndexOf("/web/", StringComparison.OrdinalIgnoreCase) < 0)
            {
                return null;
            }

            var fileName = Path.GetFileName(path);
            if (string.IsNullOrEmpty(fileName))
            {
                return null;
            }

            foreach (var (pattern, onDiskFileName) in Map)
            {
                try
                {
                    if (pattern.IsMatch(fileName))
                    {
                        return onDiskFileName;
                    }
                }
                catch (RegexMatchTimeoutException)
                {
                    // Pathological filename — treat as no match.
                }
            }

            return null;
        }
    }
}
