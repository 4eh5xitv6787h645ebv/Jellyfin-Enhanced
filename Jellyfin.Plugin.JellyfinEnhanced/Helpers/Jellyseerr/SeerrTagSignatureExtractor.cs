// Adapted from Jellyfin Canopy's GPL-3.0 parental filter at
// 0a2678d6e7259adcdbbf6e5c724705be0700a58f.
using System.Collections.Generic;
using System.Text.Json;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr
{
    /// <summary>Extracts independently normalized TMDB keyword and genre names.</summary>
    internal static class SeerrTagSignatureExtractor
    {
        internal static bool TryExtract(
            JsonElement detail,
            out HashSet<string> keywords,
            out HashSet<string> genres)
        {
            keywords = new HashSet<string>();
            genres = new HashSet<string>();
            if (detail.ValueKind != JsonValueKind.Object
                || !detail.TryGetProperty("keywords", out var keywordContainer)
                || !detail.TryGetProperty("genres", out var genreContainer)
                || !TryCollectKeywordNames(keywordContainer, out var keywordNames)
                || !TryCollectFlatNames(genreContainer, out var genreNames))
            {
                return false;
            }

            keywords = ParentalTagDecision.CleanTags(keywordNames);
            genres = ParentalTagDecision.CleanTags(genreNames);
            return true;
        }

        private static bool TryCollectKeywordNames(JsonElement container, out List<string?> names)
        {
            names = new List<string?>();
            if (container.ValueKind == JsonValueKind.Object)
            {
                if (container.TryGetProperty("keywords", out var movieKeywords))
                {
                    return TryCollectFlatNames(movieKeywords, out names);
                }

                if (container.TryGetProperty("results", out var tvKeywords))
                {
                    return TryCollectFlatNames(tvKeywords, out names);
                }

                return false;
            }

            return TryCollectFlatNames(container, out names);
        }

        private static bool TryCollectFlatNames(JsonElement container, out List<string?> names)
        {
            names = new List<string?>();

            if (container.ValueKind != JsonValueKind.Array)
            {
                return false;
            }

            foreach (var entry in container.EnumerateArray())
            {
                if (entry.ValueKind != JsonValueKind.Object
                    || !entry.TryGetProperty("name", out var name)
                    || name.ValueKind != JsonValueKind.String)
                {
                    return false;
                }

                names.Add(name.GetString());
            }

            return true;
        }
    }
}
