using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Model.Dto;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Adds watched-state-dependent cache tokens while preserving Jellyfin image versions.
    /// </summary>
    internal static class SpoilerImageCacheTags
    {
        public static void MutateImageTagsForCacheBust(
            BaseItemDto item,
            PluginConfiguration cfg,
            bool watched,
            long playbackPositionTicks)
        {
            if (item == null) return;
            var hasPrimaryTags = item.ImageTags != null && item.ImageTags.Count > 0;
            // Backdrops live in a SEPARATE BaseItemDto.BackdropImageTags string[]
            // (never in ImageTags), and are only re-served blurred when the admin
            // enabled SpoilerBlurArtwork — so only they need busting, and only then.
            var hasBackdropTags = cfg?.SpoilerBlurArtwork == true
                && item.BackdropImageTags != null && item.BackdropImageTags.Length > 0;
            if (!hasPrimaryTags && !hasBackdropTags) return;

            // Hash the inputs that affect blur OUTPUT bytes. Same shape
            // as the API's imageCacheToken so a client integrating with
            // the API ends up with the SAME URL as one that doesn't.
            var inputs = $"{item.Id:N}|{cfg?.SpoilerBlurEnabled == true}|{watched}|{cfg?.SpoilerBlurMode ?? "blur"}|{cfg?.SpoilerBlurIntensity ?? 40}|{cfg?.SpoilerBlurArtwork == true}|{cfg?.SpoilerKeepMoviePosters == true}|{playbackPositionTicks}";
            var token = ShortHash(inputs);

            // Prefix the existing tag rather than replace it — preserves
            // Jellyfin's own image-version semantics (tag changes when
            // image bytes change). Final URL: ?tag={our-token}-{jellyfin-tag}
            if (hasPrimaryTags)
            {
                var keys = item.ImageTags!.Keys.ToArray();
                foreach (var k in keys)
                {
                    var orig = item.ImageTags[k] ?? string.Empty;
                    if (!orig.StartsWith("sb-", StringComparison.Ordinal))
                    {
                        item.ImageTags[k] = "sb-" + token + "-" + orig;
                    }
                }
            }

            // Bust the backdrop tags too, or a native client keeps requesting
            // the pre-toggle backdrop URL (cached strictly by tag) and never
            // refetches the now-blurred bytes.
            if (hasBackdropTags)
            {
                for (var i = 0; i < item.BackdropImageTags!.Length; i++)
                {
                    var orig = item.BackdropImageTags[i] ?? string.Empty;
                    if (!orig.StartsWith("sb-", StringComparison.Ordinal))
                    {
                        item.BackdropImageTags[i] = "sb-" + token + "-" + orig;
                    }
                }
            }
        }

        // 8-hex-char SHA1 prefix. Sub-microsecond per call; fine for
        // 200-item batches.
        private static string ShortHash(string s)
        {
            using var sha = System.Security.Cryptography.SHA1.Create();
            var bytes = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(s));
            return Convert.ToHexString(bytes).Substring(0, 8).ToLowerInvariant();
        }

    }
}
