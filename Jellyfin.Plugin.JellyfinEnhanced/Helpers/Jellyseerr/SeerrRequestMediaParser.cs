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
