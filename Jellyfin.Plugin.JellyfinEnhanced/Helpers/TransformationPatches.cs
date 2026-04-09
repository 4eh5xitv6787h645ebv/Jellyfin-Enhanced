using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using Jellyfin.Plugin.JellyfinEnhanced;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers
{
    public static class TransformationPatches
    {
        public static string IndexHtml(PatchRequestPayload content)
        {
            if (string.IsNullOrEmpty(content.Contents))
            {
                return content.Contents ?? string.Empty;
            }

            var pluginName = "Jellyfin Enhanced";
            var pluginVersion = JellyfinEnhanced.Instance?.Version.ToString() ?? "unknown";

            // Phase 0: include the content hash as a cache-busting query so
            // the browser re-downloads plugin.js on plugin upgrades even
            // though /JellyfinEnhanced/script now ships with Cache-Control:
            // immutable. This is the same hash the asset-hash endpoint
            // returns — see JellyfinEnhanced.cs ComputedAssetHash.
            var scriptUrl = $"../JellyfinEnhanced/script?v={JellyfinEnhanced.ComputedAssetHash}";
            var scriptTag = $"<script plugin=\"{pluginName}\" version=\"{pluginVersion}\" src=\"{scriptUrl}\" defer></script>";

            var regex = new Regex($"<script[^>]*plugin=[\"']{pluginName}[\"'][^>]*>\\s*</script>\\n?");
            var updatedContent = regex.Replace(content.Contents, string.Empty);

            // Phase 4: preconnect hints for external origins the plugin
            // will fetch from early in the page lifecycle. These establish
            // the TCP+TLS connection in the background while the browser
            // parses the main document, shaving ~100-300ms off the first
            // request to each origin.
            var preconnectHints = string.Join("\n", new[]
            {
                "<link rel=\"preconnect\" href=\"https://api.themoviedb.org\" crossorigin>",
                "<link rel=\"preconnect\" href=\"https://image.tmdb.org\" crossorigin>",
                "<link rel=\"preconnect\" href=\"https://cdn.jsdelivr.net\" crossorigin>",
            });

            // 3. Inject the script tag + preconnect hints.
            if (updatedContent.Contains("</body>"))
            {
                // Preconnect hints go in <head>; script tag goes before </body>
                if (updatedContent.Contains("</head>"))
                {
                    updatedContent = updatedContent.Replace("</head>", $"{preconnectHints}\n</head>");
                }
                return updatedContent.Replace("</body>", $"{scriptTag}\n</body>");
            }

            return updatedContent;
        }

        public static Task IconTransparent(string path, Stream contents) => ReplaceImageAsync(path, "icon-transparent.png", contents);

        public static Task BannerLight(string path, Stream contents) => ReplaceImageAsync(path, "banner-light.png", contents);

        public static Task BannerDark(string path, Stream contents) => ReplaceImageAsync(path, "banner-dark.png", contents);

        public static Task Favicon(string path, Stream contents) => ReplaceImageAsync(path, "favicon.ico", contents);

        public static Task AppleIcon(string path, Stream contents) => ReplaceImageAsync(path, "apple-touch-icon.png", contents);

        private static async Task ReplaceImageAsync(string requestPath, string fileName, Stream stream)
        {
            if (stream == null)
            {
                return;
            }

            if (!TryGetCustomImageBytes(fileName, out var bytes))
            {
                // File not found is normal - custom image may not be uploaded yet
                return;
            }

            try
            {
                stream.SetLength(0);
                stream.Seek(0, SeekOrigin.Begin);
                await stream.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
                stream.Seek(0, SeekOrigin.Begin);
            }
            catch (Exception ex)
            {
                // Log error but don't crash the transformation pipeline
                System.Diagnostics.Debug.WriteLine($"Error replacing image for {requestPath}: {ex.Message}");
            }
        }

        private static bool TryGetCustomImageBytes(string fileName, out byte[] bytes)
        {
            bytes = Array.Empty<byte>();

            try
            {
                var brandingDirectory = JellyfinEnhanced.BrandingDirectory;
                if (string.IsNullOrWhiteSpace(brandingDirectory))
                {
                    return false;
                }

                var filePath = Path.Combine(brandingDirectory, fileName);

                if (!File.Exists(filePath))
                {
                    return false;
                }

                bytes = File.ReadAllBytes(filePath);
                return bytes.Length > 0;
            }
            catch (Exception ex)
            {
                // Silently fail - file not found is expected when no custom image is uploaded
                System.Diagnostics.Debug.WriteLine($"Error reading branding image {fileName}: {ex.Message}");
                return false;
            }
        }
    }
}