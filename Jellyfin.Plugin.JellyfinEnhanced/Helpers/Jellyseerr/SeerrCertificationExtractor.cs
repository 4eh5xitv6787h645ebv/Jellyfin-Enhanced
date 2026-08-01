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

        internal static bool HasAuthoritativeShape(JsonElement detail, string mediaType)
        {
            var isMovie = string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase);
            if (!TryGetResultsArray(
                    detail,
                    isMovie ? "releases" : "contentRatings",
                    isMovie ? "release_dates" : "content_ratings",
                    out var results))
            {
                return false;
            }

            return isMovie
                ? HasAuthoritativeMovieEntries(results)
                : HasAuthoritativeTvEntries(results);
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
            if (detail.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            JsonElement wrapped = default;
            JsonElement topLevelResults = default;
            var wrappedCount = 0;
            var topLevelCount = 0;
            foreach (var property in detail.EnumerateObject())
            {
                if (property.NameEquals(container)
                    || property.NameEquals(alternateContainer))
                {
                    wrappedCount++;
                    wrapped = property.Value;
                }
                else if (property.NameEquals("results"))
                {
                    topLevelCount++;
                    topLevelResults = property.Value;
                }
            }

            if (wrappedCount + topLevelCount != 1)
            {
                return false;
            }

            if (topLevelCount == 1)
            {
                results = topLevelResults;
                return results.ValueKind == JsonValueKind.Array;
            }

            if (wrapped.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            var nestedCount = 0;
            foreach (var property in wrapped.EnumerateObject())
            {
                if (property.NameEquals("results"))
                {
                    nestedCount++;
                    results = property.Value;
                }
            }

            return nestedCount == 1 && results.ValueKind == JsonValueKind.Array;
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

        private static bool HasAuthoritativeMovieEntries(JsonElement results)
        {
            foreach (var region in results.EnumerateArray())
            {
                if (!TryGetSingleProperty(region, "iso_3166_1", out var iso)
                    || iso.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(iso.GetString())
                    || !TryGetSingleProperty(region, "release_dates", out var dates)
                    || dates.ValueKind != JsonValueKind.Array)
                {
                    return false;
                }

                foreach (var date in dates.EnumerateArray())
                {
                    if (!TryGetSingleProperty(date, "type", out var type)
                        || type.ValueKind != JsonValueKind.Number
                        || !type.TryGetInt32(out _)
                        || !TryGetSingleProperty(date, "certification", out var certification)
                        || certification.ValueKind != JsonValueKind.String)
                    {
                        return false;
                    }
                }
            }

            return true;
        }

        private static bool HasAuthoritativeTvEntries(JsonElement results)
        {
            foreach (var region in results.EnumerateArray())
            {
                if (!TryGetSingleProperty(region, "iso_3166_1", out var iso)
                    || iso.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(iso.GetString())
                    || !TryGetSingleProperty(region, "rating", out var rating)
                    || rating.ValueKind != JsonValueKind.String)
                {
                    return false;
                }
            }

            return true;
        }

        private static bool TryGetSingleProperty(
            JsonElement element,
            string propertyName,
            out JsonElement value)
        {
            value = default;
            if (element.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            var count = 0;
            foreach (var property in element.EnumerateObject())
            {
                if (property.NameEquals(propertyName))
                {
                    count++;
                    value = property.Value;
                }
            }

            return count == 1;
        }

        private static string? ReadString(JsonElement element, string property)
            => element.ValueKind == JsonValueKind.Object
                && element.TryGetProperty(property, out var value)
                && value.ValueKind == JsonValueKind.String
                    ? value.GetString()
                    : null;
    }
}
