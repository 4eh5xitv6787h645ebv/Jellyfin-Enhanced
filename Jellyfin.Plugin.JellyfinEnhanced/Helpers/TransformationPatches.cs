using System.IO;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using Jellyfin.Plugin.JellyfinEnhanced;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers
{
    public static class TransformationPatches
    {
        // Builds the served index.html with the Jellyfin Enhanced script tag injected before
        // </body>. Idempotent: any pre-existing JE tag is removed first, so repeated
        // application (or a stale on-disk tag) never produces duplicates. Called by
        // Web.WebInjectionMiddleware at request time; the file on disk is never modified.
        // (Previously also used as the File Transformation plugin callback — that dependency
        // has been removed in favour of the in-process middleware.)
        public static string IndexHtml(PatchRequestPayload content)
        {
            if (string.IsNullOrEmpty(content.Contents))
            {
                return content.Contents ?? string.Empty;
            }

            var pluginName = "Jellyfin Enhanced";
            var pluginVersion = JellyfinEnhanced.Instance?.Version.ToString() ?? "unknown";
            var dllTimestamp = new FileInfo(typeof(JellyfinEnhanced).Assembly.Location).LastWriteTimeUtc.Ticks;
            var cacheKey = $"{pluginVersion}-{dllTimestamp}";
            var devMode = JellyfinEnhanced.Instance?.Configuration?.DevMode == true;

            var scriptUrl = $"../JellyfinEnhanced/script?v={cacheKey}";
            var scriptTag = $"<script plugin=\"{pluginName}\" version=\"{cacheKey}\" dev=\"{(devMode ? "true" : "false")}\" src=\"{scriptUrl}\" defer></script>";

            var regex = new Regex($"<script[^>]*plugin=[\"']{pluginName}[\"'][^>]*>\\s*</script>\\n?");
            var updatedContent = regex.Replace(content.Contents, string.Empty);

            // Inject the script tag before the closing body tag.
            if (updatedContent.Contains("</body>"))
            {
                return updatedContent.Replace("</body>", $"{scriptTag}\n</body>");
            }

            return updatedContent;
        }
    }
}
