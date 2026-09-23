using System;
using System.Globalization;
using System.Linq;
using TmdbAccess = Jellyfin.Plugin.JellyfinEnhanced.Services.SeerrParentalFilter.TmdbAccess;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrResponseReader;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr
{
    /// <summary>Defines which response shapes require title filtering or parent-title authorization.</summary>
    internal static class SeerrEndpointClassifier
    {
        public static bool TryParseTmdbTitlePath(string? tmdbApiPath, out string mediaType, out int tmdbId)
        {
            mediaType = string.Empty;
            tmdbId = 0;
            if (string.IsNullOrEmpty(tmdbApiPath))
            {
                return false;
            }

            var path = tmdbApiPath.TrimStart('/');
            var q = path.IndexOf('?');
            if (q >= 0)
            {
                path = path.Substring(0, q);
            }

            var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2)
            {
                return false;
            }

            var type = NormalizeMediaType(parts[0]);
            if (type == null || !int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out tmdbId))
            {
                return false;
            }

            mediaType = type;
            return true;
        }

        public static TmdbAccess ClassifyTmdbPassthrough(string? tmdbApiPath, out string mediaType, out int tmdbId)
        {
            mediaType = string.Empty;
            tmdbId = 0;
            if (string.IsNullOrEmpty(tmdbApiPath))
            {
                return TmdbAccess.Deny;
            }

            var path = tmdbApiPath.TrimStart('/');
            var query = string.Empty;
            var q = path.IndexOf('?');
            if (q >= 0)
            {
                query = path.Substring(q + 1);
                path = path.Substring(0, q);
            }

            // append_to_response can smuggle whole title lists (similar,
            // recommendations, lists) into an otherwise bare detail lookup.
            if (query.Contains("append_to_response", StringComparison.OrdinalIgnoreCase))
            {
                return TmdbAccess.Deny;
            }

            var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0)
            {
                return TmdbAccess.Deny;
            }

            // Only plain segments: a dot-segment or anything outside [A-Za-z0-9_-]
            // could be normalised by the URI layer into a different, unclassified
            // path, so it is refused here rather than trusted to the host.
            if (parts.Any(p => !p.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-')))
            {
                return TmdbAccess.Deny;
            }

            var head = parts[0].ToLowerInvariant();
            if (head is "genre" or "genres" or "configuration")
            {
                return parts.Length <= 3 ? TmdbAccess.Allow : TmdbAccess.Deny; // no titles in these
            }

            // Studio / network logos: bare {head}/{id} only (company/{id}/movies is a title list).
            if (head is "company" or "network")
            {
                return parts.Length == 2 ? TmdbAccess.Allow : TmdbAccess.Deny;
            }

            // Company and keyword search return no titles. Person search does (each
            // hit carries knownFor titles); the client reaches it through the
            // explicit tmdb/search/person route, which goes via Seerr's filtered search.
            if (head == "search" && parts.Length == 2 && parts[1].ToLowerInvariant() is "company" or "keyword")
            {
                return TmdbAccess.Allow;
            }

            if (TryParseTmdbTitlePath(path, out mediaType, out tmdbId))
            {
                var sub = parts.Length >= 3 ? string.Join('/', parts.Skip(2)).ToLowerInvariant() : string.Empty;

                // Watch providers and reviews carry no title metadata beyond what the
                // caller already has (and are used for library items too).
                if (sub == "watch/providers" || sub == "reviews")
                {
                    return TmdbAccess.Allow;
                }

                // The bare title and the sub-resources the client actually uses
                // (certifications, seasons, episodes) are gated on the title itself.
                if (sub.Length == 0
                    || sub == "release_dates"
                    || sub == "content_ratings"
                    || sub.StartsWith("season/", StringComparison.Ordinal))
                {
                    return TmdbAccess.GateTitle;
                }

                // similar, recommendations, lists, credits, ... return other titles.
                return TmdbAccess.Deny;
            }

            return TmdbAccess.Deny;
        }

        internal enum Category { None, List, Detail, SubResource, NestedDetail }

        internal enum Container { None, Results, Parts, CombinedCredits }

        internal sealed class EndpointPlan
        {
            public Category Category { get; init; }
            public Container Container { get; init; }
            public string IdField { get; init; } = "id";
            public string? MediaTypeHint { get; init; }
            public bool NestedMedia { get; init; }
            public string? MediaType { get; init; }
            public int ParentId { get; init; }
        }

        internal static EndpointPlan ClassifyPath(string apiPath)
        {
            if (string.IsNullOrEmpty(apiPath))
            {
                return new EndpointPlan { Category = Category.None };
            }

            // Single issue: gate on the media it is about.
            if (apiPath.StartsWith("/api/v1/issue/", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.NestedDetail };
            }

            // Requests / issues lists: results[] with tmdbId/mediaType nested under `media`.
            if (apiPath.StartsWith("/api/v1/request", StringComparison.OrdinalIgnoreCase)
                || apiPath.StartsWith("/api/v1/issue?", StringComparison.OrdinalIgnoreCase)
                || string.Equals(apiPath, "/api/v1/issue", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.List, Container = Container.Results, IdField = "tmdbId", NestedMedia = true };
            }

            // Watchlist entries: results[] with a flat `tmdbId`.
            if (apiPath.StartsWith("/api/v1/discover/watchlist", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.List, Container = Container.Results, IdField = "tmdbId" };
            }

            // Genre sliders carry no titles.
            if (apiPath.StartsWith("/api/v1/discover/genreslider", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.None };
            }

            // Trending: mixed rows with their own mediaType.
            if (apiPath.StartsWith("/api/v1/discover/trending", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.List, Container = Container.Results };
            }

            if (apiPath.StartsWith("/api/v1/discover/movies", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.List, Container = Container.Results, MediaTypeHint = "movie" };
            }

            if (apiPath.StartsWith("/api/v1/discover/tv", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.List, Container = Container.Results, MediaTypeHint = "tv" };
            }

            var related = apiPath.Contains("/similar", StringComparison.OrdinalIgnoreCase)
                || apiPath.Contains("/recommendations", StringComparison.OrdinalIgnoreCase);

            if (apiPath.StartsWith("/api/v1/movie/", StringComparison.OrdinalIgnoreCase))
            {
                if (related)
                {
                    TryParseId(apiPath, "/api/v1/movie/", out var relatedMovieId);
                    return new EndpointPlan { Category = Category.List, Container = Container.Results, MediaTypeHint = "movie", MediaType = "movie", ParentId = relatedMovieId };
                }

                if (IsBareDetail(apiPath, "/api/v1/movie/"))
                {
                    return new EndpointPlan { Category = Category.Detail, MediaType = "movie" };
                }

                // Any other sub-resource (ratings, watch providers, ...): gate on the parent title.
                return TryParseId(apiPath, "/api/v1/movie/", out var movieId)
                    ? new EndpointPlan { Category = Category.SubResource, MediaType = "movie", ParentId = movieId }
                    : new EndpointPlan { Category = Category.None };
            }

            if (apiPath.StartsWith("/api/v1/tv/", StringComparison.OrdinalIgnoreCase))
            {
                if (related)
                {
                    TryParseId(apiPath, "/api/v1/tv/", out var relatedTvId);
                    return new EndpointPlan { Category = Category.List, Container = Container.Results, MediaTypeHint = "tv", MediaType = "tv", ParentId = relatedTvId };
                }

                if (IsBareDetail(apiPath, "/api/v1/tv/"))
                {
                    return new EndpointPlan { Category = Category.Detail, MediaType = "tv" };
                }

                // Seasons, ratings, ...: gate on the parent show.
                return TryParseId(apiPath, "/api/v1/tv/", out var tvId)
                    ? new EndpointPlan { Category = Category.SubResource, MediaType = "tv", ParentId = tvId }
                    : new EndpointPlan { Category = Category.None };
            }

            // Person filmography: cast[] + crew[] with per-item mediaType.
            if (apiPath.StartsWith("/api/v1/person/", StringComparison.OrdinalIgnoreCase)
                && apiPath.Contains("/combined_credits", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.List, Container = Container.CombinedCredits };
            }

            // Collection parts: parts[] (all movies).
            if (apiPath.StartsWith("/api/v1/collection/", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.List, Container = Container.Parts, MediaTypeHint = "movie" };
            }

            // Multi-search: results[] with per-item mediaType (not /search/keyword).
            if ((apiPath.StartsWith("/api/v1/search?", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(apiPath, "/api/v1/search", StringComparison.OrdinalIgnoreCase))
                && !apiPath.StartsWith("/api/v1/search/keyword", StringComparison.OrdinalIgnoreCase))
            {
                return new EndpointPlan { Category = Category.List, Container = Container.Results };
            }

            return new EndpointPlan { Category = Category.None };
        }

        // True for /api/v1/{type}/{id} with no further path segment (query allowed).
        private static bool IsBareDetail(string apiPath, string prefix)
        {
            var tail = apiPath.Substring(prefix.Length);
            var q = tail.IndexOf('?');
            if (q >= 0)
            {
                tail = tail.Substring(0, q);
            }

            return tail.Length > 0 && !tail.Contains('/');
        }

        private static bool TryParseId(string apiPath, string prefix, out int id)
        {
            id = 0;
            var tail = apiPath.Substring(prefix.Length);
            var slash = tail.IndexOf('/');
            var idPart = slash >= 0 ? tail.Substring(0, slash) : tail;
            var q = idPart.IndexOf('?');
            if (q >= 0)
            {
                idPart = idPart.Substring(0, q);
            }

            return int.TryParse(idPart, NumberStyles.Integer, CultureInfo.InvariantCulture, out id);
        }

    }
}
