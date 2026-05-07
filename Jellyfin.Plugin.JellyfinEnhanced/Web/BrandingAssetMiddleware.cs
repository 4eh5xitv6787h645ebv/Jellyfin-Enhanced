using System.Collections.Concurrent;
using System.Globalization;
using System.Text.RegularExpressions;
using MediaBrowser.Model.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    /// <summary>
    /// Replaces JE-supplied branding assets (icons, banners, favicon, apple
    /// touch icon) when the admin has uploaded a custom version. Mirrors the
    /// patterns the old TransformationPatches used, but serves directly from
    /// our own middleware so we don't depend on File Transformation.
    ///
    /// Reads are async, cached in memory by (path, mtime), and tagged with
    /// a strong ETag so subsequent requests can short-circuit at the 304
    /// stage. Custom branding upload mutates the file's mtime, which busts
    /// the cache automatically.
    /// </summary>
    public sealed class BrandingAssetMiddleware
    {
        private static readonly (Regex Pattern, string FileName)[] Mappings =
        {
            (new Regex(@".*icon-transparent.*\.png$",   RegexOptions.Compiled | RegexOptions.IgnoreCase), "icon-transparent.png"),
            (new Regex(@".*banner-light.*\.png$",       RegexOptions.Compiled | RegexOptions.IgnoreCase), "banner-light.png"),
            (new Regex(@".*banner-dark.*\.png$",        RegexOptions.Compiled | RegexOptions.IgnoreCase), "banner-dark.png"),
            (new Regex(@".*favicon.*\.ico$",            RegexOptions.Compiled | RegexOptions.IgnoreCase), "favicon.ico"),
            (new Regex(@".*touchicon.*\.png$",          RegexOptions.Compiled | RegexOptions.IgnoreCase), "apple-touch-icon.png"),
        };

        private static readonly ConcurrentDictionary<string, CachedAsset> Cache = new();

        private readonly RequestDelegate _next;
        private readonly ILogger<BrandingAssetMiddleware> _logger;

        public BrandingAssetMiddleware(RequestDelegate next, ILogger<BrandingAssetMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var path = context.Request.Path.Value ?? string.Empty;

            if (path.StartsWith("/web/", StringComparison.OrdinalIgnoreCase) && TryMatch(path, out var fileName))
            {
                var asset = await GetAssetAsync(fileName).ConfigureAwait(false);
                if (asset is not null && await TryServeAsync(context, asset, fileName).ConfigureAwait(false))
                {
                    return;
                }
            }

            await _next(context).ConfigureAwait(false);
        }

        private async Task<CachedAsset?> GetAssetAsync(string fileName)
        {
            try
            {
                var dir = JellyfinEnhanced.BrandingDirectory;
                if (string.IsNullOrWhiteSpace(dir)) return null;

                var path = Path.Combine(dir, fileName);
                if (!File.Exists(path)) return null;

                var info = new FileInfo(path);
                var mtimeTicks = info.LastWriteTimeUtc.Ticks;

                if (Cache.TryGetValue(path, out var cached) && cached.MtimeTicks == mtimeTicks)
                {
                    return cached;
                }

                var bytes = await File.ReadAllBytesAsync(path).ConfigureAwait(false);
                if (bytes.Length == 0) return null;

                var etag = "W/\"" + bytes.Length.ToString(CultureInfo.InvariantCulture) + "-" + mtimeTicks.ToString(CultureInfo.InvariantCulture) + "\"";
                var fresh = new CachedAsset(bytes, mtimeTicks, etag);
                Cache[path] = fresh;
                return fresh;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Could not load custom branding asset {File}", fileName);
                return null;
            }
        }

        private static async Task<bool> TryServeAsync(HttpContext context, CachedAsset asset, string fileName)
        {
            if (HasFreshEtag(context.Request, asset.ETag))
            {
                context.Response.StatusCode = StatusCodes.Status304NotModified;
                context.Response.Headers[HeaderNames.ETag] = asset.ETag;
                return true;
            }

            context.Response.ContentType = MimeTypes.GetMimeType(fileName);
            context.Response.ContentLength = asset.Bytes.Length;
            context.Response.Headers[HeaderNames.ETag] = asset.ETag;
            // no-cache lets the client revalidate but a 304 keeps it cheap.
            context.Response.Headers[HeaderNames.CacheControl] = "no-cache";
            await context.Response.Body.WriteAsync(asset.Bytes).ConfigureAwait(false);
            return true;
        }

        private static bool HasFreshEtag(HttpRequest request, string etag)
        {
            if (!request.Headers.TryGetValue(HeaderNames.IfNoneMatch, out var values)) return false;
            foreach (var value in values)
            {
                if (string.Equals(value, etag, StringComparison.Ordinal)) return true;
                if (string.Equals(value, "*", StringComparison.Ordinal)) return true;
            }
            return false;
        }

        private static bool TryMatch(string path, out string fileName)
        {
            foreach (var (pattern, name) in Mappings)
            {
                if (pattern.IsMatch(path))
                {
                    fileName = name;
                    return true;
                }
            }
            fileName = string.Empty;
            return false;
        }

        private sealed record CachedAsset(byte[] Bytes, long MtimeTicks, string ETag);
    }
}
