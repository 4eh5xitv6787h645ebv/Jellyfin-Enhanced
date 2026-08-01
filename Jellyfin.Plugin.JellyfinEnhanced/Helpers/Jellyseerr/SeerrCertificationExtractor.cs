// Adapted from Jellyfin Canopy's GPL-3.0 parental filter at
// 0a2678d6e7259adcdbbf6e5c724705be0700a58f.
using System;
using System.Text.Json;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr
{
    /// <summary>Extracts regional movie and television certifications from Seerr or TMDB detail JSON.</summary>
    internal static class SeerrCertificationExtractor
    {
        internal readonly record struct CertificationResult(string? Certification, string? Iso);

        internal static CertificationResult Extract(JsonElement detail, string mediaType, string region)
        {
            if (detail.ValueKind != JsonValueKind.Object)
            {
                return default;
            }

            var normalizedRegion = string.IsNullOrWhiteSpace(region)
                ? "US"
                : region.Trim().ToUpperInvariant();
            return string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase)
                ? ExtractMovie(detail, normalizedRegion)
                : ExtractTv(detail, normalizedRegion);
        }

        private static CertificationResult ExtractMovie(JsonElement detail, string region)
        {
            if (!TryGetResultsArray(detail, "releases", "release_dates", out var results)
                || !TryPickRegionEntry(results, region, out var regionRelease)
                || !regionRelease.TryGetProperty("release_dates", out var dates)
                || dates.ValueKind != JsonValueKind.Array)
            {
                return default;
            }

            string? certification = null;
            foreach (var releaseDate in dates.EnumerateArray())
            {
                if (releaseDate.ValueKind == JsonValueKind.Object
                    && releaseDate.TryGetProperty("type", out var type)
                    && type.ValueKind == JsonValueKind.Number
                    && type.TryGetInt32(out var typeValue)
                    && typeValue == 3)
                {
                    var candidate = ReadString(releaseDate, "certification");
                    if (!string.IsNullOrWhiteSpace(candidate))
                    {
                        certification = candidate;
                        break;
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(certification))
            {
                foreach (var releaseDate in dates.EnumerateArray())
                {
                    var candidate = ReadString(releaseDate, "certification");
                    if (!string.IsNullOrWhiteSpace(candidate))
                    {
                        certification = candidate;
                        break;
                    }
                }
            }

            return string.IsNullOrWhiteSpace(certification)
                ? default
                : new CertificationResult(certification, ReadString(regionRelease, "iso_3166_1"));
        }

        private static CertificationResult ExtractTv(JsonElement detail, string region)
        {
            if (!TryGetResultsArray(detail, "contentRatings", "content_ratings", out var results)
                || !TryPickRegionEntry(results, region, out var regionRating))
            {
                return default;
            }

            var rating = ReadString(regionRating, "rating");
            return string.IsNullOrWhiteSpace(rating)
                ? default
                : new CertificationResult(rating, ReadString(regionRating, "iso_3166_1"));
        }

        private static bool TryGetResultsArray(
            JsonElement detail,
            string container,
            string alternateContainer,
            out JsonElement results)
        {
            results = default;
            if ((detail.TryGetProperty(container, out var wrapped)
                    || detail.TryGetProperty(alternateContainer, out wrapped))
                && wrapped.ValueKind == JsonValueKind.Object
                && wrapped.TryGetProperty("results", out results)
                && results.ValueKind == JsonValueKind.Array)
            {
                return true;
            }

            return detail.TryGetProperty("results", out results)
                && results.ValueKind == JsonValueKind.Array;
        }

        private static bool TryPickRegionEntry(JsonElement results, string region, out JsonElement picked)
        {
            picked = default;
            JsonElement? first = null;
            JsonElement? us = null;
            foreach (var entry in results.EnumerateArray())
            {
                if (entry.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                first ??= entry;
                var iso = ReadString(entry, "iso_3166_1");
                if (string.Equals(iso, region, StringComparison.OrdinalIgnoreCase))
                {
                    picked = entry;
                    return true;
                }

                if (us is null && string.Equals(iso, "US", StringComparison.OrdinalIgnoreCase))
                {
                    us = entry;
                }
            }

            if (us is not null)
            {
                picked = us.Value;
                return true;
            }

            if (first is not null)
            {
                picked = first.Value;
                return true;
            }

            return false;
        }

        private static string? ReadString(JsonElement element, string property)
            => element.ValueKind == JsonValueKind.Object
                && element.TryGetProperty(property, out var value)
                && value.ValueKind == JsonValueKind.String
                    ? value.GetString()
                    : null;
    }
}
