// Adapted from Jellyfin Canopy's GPL-3.0 parental filter at
// 0a2678d6e7259adcdbbf6e5c724705be0700a58f.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Jellyfin.Extensions;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr
{
    /// <summary>
    /// Applies Jellyfin's blocked/allowed-tag semantics to TMDB keywords and genres.
    /// Blocked tags match keywords or genres; allowed tags match keywords only.
    /// </summary>
    internal static class ParentalTagDecision
    {
        internal static bool IsAllowed(
            IReadOnlyCollection<string> titleKeywords,
            IReadOnlyCollection<string> titleGenres,
            IReadOnlyCollection<string> blockedTags,
            IReadOnlyCollection<string> allowedTags)
        {
            if (blockedTags.Count > 0
                && (titleKeywords.Any(blockedTags.Contains) || titleGenres.Any(blockedTags.Contains)))
            {
                return false;
            }

            return allowedTags.Count == 0 || titleKeywords.Any(allowedTags.Contains);
        }

        internal static HashSet<string> CleanTags(IEnumerable<string?>? raw)
        {
            var result = new HashSet<string>(StringComparer.Ordinal);
            if (raw is null)
            {
                return result;
            }

            foreach (var value in raw)
            {
                if (string.IsNullOrWhiteSpace(value))
                {
                    continue;
                }

                // Jellyfin 12 exposes GetCleanValue publicly; 10.11 exposes only
                // RemoveDiacritics. Keep one source-compatible implementation of
                // the exact native algorithm for both plugin artifacts.
                var cleaned = value.RemoveDiacritics().ToLowerInvariant();
                cleaned = Regex.Replace(cleaned, @"[^\p{L}\p{N}\s]", " ");
                cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
                if (!string.IsNullOrEmpty(cleaned))
                {
                    result.Add(cleaned);
                }
            }

            return result;
        }
    }
}
