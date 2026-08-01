// Adapted from Jellyfin Canopy's GPL-3.0 deny-by-default TMDB classifier at
// 0a2678d6e7259adcdbbf6e5c724705be0700a58f.
using System;
using System.Globalization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr
{
    internal enum TmdbProxyGate
    {
        Neutral,
        DetailGate,
        Restricted,
    }

    internal readonly record struct TmdbProxyDecision(TmdbProxyGate Gate, string MediaType, int TmdbId);

    /// <summary>Classifies a raw TMDB passthrough path; unknown or compound paths are denied.</summary>
    internal static class TmdbProxyPathClassifier
    {
        internal static TmdbProxyDecision Classify(string apiPath)
        {
            var restricted = new TmdbProxyDecision(TmdbProxyGate.Restricted, string.Empty, 0);
            var neutral = new TmdbProxyDecision(TmdbProxyGate.Neutral, string.Empty, 0);
            if (string.IsNullOrWhiteSpace(apiPath))
            {
                return restricted;
            }

            var path = apiPath;
            string? query = null;
            var queryIndex = path.IndexOf('?');
            if (queryIndex >= 0)
            {
                query = path.Substring(queryIndex + 1);
                path = path.Substring(0, queryIndex);
            }

            if (HasAppendToResponse(query))
            {
                return restricted;
            }

            var segments = path.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 0 || HasDotSegment(path, segments))
            {
                return restricted;
            }

            // Exact rating-free paths used by Enhanced's UI.
            if ((segments.Length == 2
                    && Eq(segments[0], "genres")
                    && (Eq(segments[1], "movie") || Eq(segments[1], "tv")))
                || (segments.Length == 3
                    && Eq(segments[0], "genre")
                    && (Eq(segments[1], "movie") || Eq(segments[1], "tv"))
                    && Eq(segments[2], "list"))
                || (segments.Length == 2
                    && Eq(segments[0], "search")
                    && (Eq(segments[1], "keyword") || Eq(segments[1], "company"))))
            {
                return neutral;
            }

            // Enhanced fetches only the logo/name metadata from these exact shapes.
            if (segments.Length == 2
                && (Eq(segments[0], "company") || Eq(segments[0], "network"))
                && TryPositiveId(segments[1], out _))
            {
                return neutral;
            }

            if (!Eq(segments[0], "movie") && !Eq(segments[0], "tv"))
            {
                return restricted;
            }

            if (segments.Length < 2 || !TryPositiveId(segments[1], out var tmdbId))
            {
                return restricted;
            }

            var mediaType = Eq(segments[0], "tv") ? "tv" : "movie";
            if (segments.Length >= 3
                && (Eq(segments[2], "similar") || Eq(segments[2], "recommendations")))
            {
                return restricted;
            }

            return new TmdbProxyDecision(TmdbProxyGate.DetailGate, mediaType, tmdbId);
        }

        private static bool TryPositiveId(string value, out int id)
            => int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out id) && id > 0;

        private static bool Eq(string value, string expected)
            => string.Equals(value, expected, StringComparison.OrdinalIgnoreCase);

        private static bool HasDotSegment(string path, string[] segments)
        {
            if (path.Contains("%2e", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            foreach (var segment in segments)
            {
                if (segment == "." || segment == "..")
                {
                    return true;
                }
            }

            return false;
        }

        private static bool HasAppendToResponse(string? query)
        {
            if (string.IsNullOrEmpty(query))
            {
                return false;
            }

            foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var separator = pair.IndexOf('=');
                var rawName = separator >= 0 ? pair.Substring(0, separator) : pair;
                string name;
                try
                {
                    name = Uri.UnescapeDataString(rawName.Replace('+', ' '));
                }
                catch (UriFormatException)
                {
                    return true;
                }

                if (Eq(name, "append_to_response"))
                {
                    var value = separator >= 0 ? pair.Substring(separator + 1) : string.Empty;
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        return true;
                    }
                }
            }

            return false;
        }
    }
}
