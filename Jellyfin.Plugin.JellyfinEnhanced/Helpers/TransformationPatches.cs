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

            var scriptUrl = $"../JellyfinEnhanced/script?v={pluginVersion}";
            var scriptTag = $"<script plugin=\"{pluginName}\" version=\"{pluginVersion}\" src=\"{scriptUrl}\" defer></script>";

            var regex = new Regex($"<script[^>]*plugin=[\"']{pluginName}[\"'][^>]*>\\s*</script>\\n?");
            var updatedContent = regex.Replace(content.Contents, string.Empty);

            // Also remove old anti-flash blocks so they don't accumulate
            var antiFlashRegex = new Regex(@"<!--\s*JE-ANTI-FLASH\s*-->[\s\S]*?<!--\s*/JE-ANTI-FLASH\s*-->\n?");
            updatedContent = antiFlashRegex.Replace(updatedContent, string.Empty);

            // Anti-flash: inline script sets body class from localStorage before first paint,
            // paired with CSS that pre-hides spoiler-sensitive content. This prevents the
            // flash of unredacted episode titles/posters on hard refresh.
            var antiFlashBlock = $@"<!-- JE-ANTI-FLASH --><script plugin=""{pluginName}-antiflash"">(function(){{try{{if(localStorage.getItem('JE_spoiler_active')==='1')document.body.classList.add('je-spoiler-primed')}}catch(e){{}}}})();</script>
<style plugin=""{pluginName}-antiflash"">
body.je-spoiler-primed .card[data-type=""Episode""]:not([data-je-spoiler-scanned]):not(.chapterCard) .cardScalable>.cardImageContainer{{filter:blur(30px);transform:scale(1.05)}}
body.je-spoiler-primed .card[data-type=""Episode""]:not([data-je-spoiler-scanned]):not(.chapterCard) .cardScalable{{overflow:hidden}}
body.je-spoiler-primed .card[data-type=""Episode""]:not([data-je-spoiler-scanned]):not(.chapterCard) .cardText,
body.je-spoiler-primed .card[data-type=""Episode""]:not([data-je-spoiler-scanned]):not(.chapterCard) .cardText-secondary,
body.je-spoiler-primed .card[data-type=""Episode""]:not([data-je-spoiler-scanned]):not(.chapterCard) .textActionButton,
body.je-spoiler-primed .listItem[data-id]:not([data-je-spoiler-scanned]) .listItemBodyText:not(.secondary),
body.je-spoiler-primed .listItem[data-id]:not([data-je-spoiler-scanned]) .listItem-overview{{visibility:hidden}}
body.je-spoiler-primed #itemDetailPage:not(.hide) .detailImageContainer .cardImageContainer{{filter:blur(30px);transform:scale(1.05);overflow:hidden}}
body.je-spoiler-primed #itemDetailPage:not(.hide) .itemName,
body.je-spoiler-primed #itemDetailPage:not(.hide) .overview,
body.je-spoiler-primed #itemDetailPage:not(.hide) .itemOverview,
body.je-spoiler-primed #itemDetailPage:not(.hide) .mediaInfoContent,
body.je-spoiler-primed #itemDetailPage:not(.hide) .itemGenres,
body.je-spoiler-primed #itemDetailPage:not(.hide) .itemExternalLinks,
body.je-spoiler-primed #itemDetailPage:not(.hide) .itemMiscInfo{{visibility:hidden}}
</style><!-- /JE-ANTI-FLASH -->";

            // 3. Inject the anti-flash block + script tag.
            if (updatedContent.Contains("</body>"))
            {
                return updatedContent.Replace("</body>", $"{antiFlashBlock}\n{scriptTag}\n</body>");
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