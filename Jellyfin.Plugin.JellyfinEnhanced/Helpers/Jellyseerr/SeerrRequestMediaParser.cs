using System;
using System.Globalization;
using System.Text.Json;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr
{
    /// <summary>A validated Seerr request mutation target.</summary>
    internal readonly record struct SeerrRequestMedia(string MediaType, int TmdbId);

    /// <summary>
    /// Strictly parses the only supported request target shape. It never defaults an
    /// unknown media type to movie and accepts only positive base-10 integer IDs.
    /// </summary>
    internal static class SeerrRequestMediaParser
    {
        internal static bool TryParse(string? json, out SeerrRequestMedia media)
        {
            media = default;
            if (string.IsNullOrWhiteSpace(json))
            {
                return false;
            }

            try
            {
                using var document = JsonDocument.Parse(json);
                return TryParse(document.RootElement, out media);
            }
            catch (JsonException)
            {
                return false;
            }
        }

        internal static bool TryParseNestedDetail(
            string? json,
            int? expectedEntityId,
            out SeerrRequestMedia media)
        {
            media = default;
            if (string.IsNullOrWhiteSpace(json)
                || (expectedEntityId.HasValue && expectedEntityId.Value <= 0))
            {
                return false;
            }

            try
            {
                using var document = JsonDocument.Parse(json);
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object)
                {
                    return false;
                }

                JsonElement entityIdElement = default;
                JsonElement mediaElement = default;
                var entityIdCount = 0;
                var mediaCount = 0;
                foreach (var property in root.EnumerateObject())
                {
                    if (property.NameEquals("id"))
                    {
                        entityIdCount++;
                        entityIdElement = property.Value;
                    }
                    else if (property.NameEquals("media"))
                    {
                        mediaCount++;
                        mediaElement = property.Value;
                    }
                }

                if (entityIdCount != 1
                    || mediaCount != 1
                    || !TryReadPositiveId(entityIdElement, out var entityId)
                    || (expectedEntityId.HasValue && entityId != expectedEntityId.Value)
                    || mediaElement.ValueKind != JsonValueKind.Object)
                {
                    return false;
                }

                JsonElement mediaTypeElement = default;
                JsonElement tmdbIdElement = default;
                JsonElement adultElement = default;
                var mediaTypeCount = 0;
                var tmdbIdCount = 0;
                var adultCount = 0;
                foreach (var property in mediaElement.EnumerateObject())
                {
                    if (property.NameEquals("mediaType"))
                    {
                        mediaTypeCount++;
                        mediaTypeElement = property.Value;
                    }
                    else if (property.NameEquals("tmdbId"))
                    {
                        tmdbIdCount++;
                        tmdbIdElement = property.Value;
                    }
                    else if (property.NameEquals("adult"))
                    {
                        adultCount++;
                        adultElement = property.Value;
                    }
                }

                if (mediaTypeCount != 1
                    || tmdbIdCount != 1
                    || adultCount > 1
                    || (adultCount == 1 && adultElement.ValueKind != JsonValueKind.False)
                    || mediaTypeElement.ValueKind != JsonValueKind.String)
                {
                    return false;
                }

                var rawMediaType = mediaTypeElement.GetString();
                var mediaType = string.Equals(rawMediaType, "movie", StringComparison.OrdinalIgnoreCase)
                    ? "movie"
                    : string.Equals(rawMediaType, "tv", StringComparison.OrdinalIgnoreCase)
                        ? "tv"
                        : null;
                if (mediaType is null || !TryReadPositiveId(tmdbIdElement, out var tmdbId))
                {
                    return false;
                }

                media = new SeerrRequestMedia(mediaType, tmdbId);
                return true;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        internal static bool TryParse(JsonElement body, out SeerrRequestMedia media)
        {
            media = default;
            if (body.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            JsonElement mediaTypeElement = default;
            JsonElement mediaIdElement = default;
            var mediaTypeCount = 0;
            var mediaIdCount = 0;
            foreach (var property in body.EnumerateObject())
            {
                if (property.NameEquals("mediaType"))
                {
                    mediaTypeCount++;
                    mediaTypeElement = property.Value;
                }
                else if (property.NameEquals("mediaId"))
                {
                    mediaIdCount++;
                    mediaIdElement = property.Value;
                }
            }

            if (mediaTypeCount != 1
                || mediaIdCount != 1
                || mediaTypeElement.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            var rawMediaType = mediaTypeElement.GetString();
            var mediaType = string.Equals(rawMediaType, "movie", StringComparison.OrdinalIgnoreCase)
                ? "movie"
                : string.Equals(rawMediaType, "tv", StringComparison.OrdinalIgnoreCase)
                    ? "tv"
                    : null;
            if (mediaType is null || !TryReadPositiveId(mediaIdElement, out var tmdbId))
            {
                return false;
            }

            media = new SeerrRequestMedia(mediaType, tmdbId);
            return true;
        }

        private static bool TryReadPositiveId(JsonElement value, out int id)
        {
            id = 0;
            if (value.ValueKind == JsonValueKind.Number)
            {
                return value.TryGetInt32(out id) && id > 0;
            }

            if (value.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            var text = value.GetString();
            if (string.IsNullOrEmpty(text) || text.Length > 10)
            {
                return false;
            }

            foreach (var character in text)
            {
                if (character < '0' || character > '9')
                {
                    return false;
                }
            }

            return int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out id) && id > 0;
        }
    }
}
