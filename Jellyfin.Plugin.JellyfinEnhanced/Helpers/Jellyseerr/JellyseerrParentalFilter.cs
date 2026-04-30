using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Globalization;
using Logger = Jellyfin.Plugin.JellyfinEnhanced.Logger;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr
{
    // Mirrors BaseItem.IsParentalAllowed plus a TMDB-specific `adult: true` block.
    // Listings (search/discover/similar/recommendations) only carry `adult` and
    // `mediaType`, so listing-level filtering is best-effort; detail/request
    // endpoints get the full check (where blocking actually matters — a user
    // can't request what they can't view the detail for).
    public static class JellyseerrParentalFilter
    {
        public sealed class TmdbItemMeta
        {
            public string? Cert { get; init; }
            public IReadOnlyList<string> Tags { get; init; } = Array.Empty<string>();
            public bool Adult { get; init; }
            public string? MediaType { get; init; }
        }

        // Country is part of the cache key because Cert is selected at hydrate
        // time using that country's iso_3166_1 row — "M" is score 15 in AU but
        // unknown in US. Allowance is recomputed per-user at filter time.
        private static readonly ConcurrentDictionary<string, (TmdbItemMeta Meta, DateTime CachedAt)> _tmdbMetaCache = new();
        private static readonly TimeSpan _tmdbMetaTtl = TimeSpan.FromHours(1);

        private static string BuildMetaCacheKey(string mediaType, int tmdbId, string? country)
            => $"{mediaType.ToLowerInvariant()}:{tmdbId}:{(country ?? "").ToUpperInvariant()}";

        public static TmdbItemMeta? GetCachedTmdbMeta(string mediaType, int tmdbId, string? country)
        {
            if (string.IsNullOrEmpty(mediaType) || tmdbId <= 0) return null;
            var key = BuildMetaCacheKey(mediaType, tmdbId, country);
            if (_tmdbMetaCache.TryGetValue(key, out var entry)
                && DateTime.UtcNow - entry.CachedAt < _tmdbMetaTtl)
            {
                return entry.Meta;
            }
            return null;
        }

        public static void StoreTmdbMeta(string mediaType, int tmdbId, string? country, TmdbItemMeta meta)
        {
            if (string.IsNullOrEmpty(mediaType) || tmdbId <= 0 || meta == null) return;
            _tmdbMetaCache[BuildMetaCacheKey(mediaType, tmdbId, country)] = (meta, DateTime.UtcNow);

            if (_tmdbMetaCache.Count > 500 && _tmdbMetaCache.Count % 50 == 0)
            {
                var cutoff = DateTime.UtcNow - _tmdbMetaTtl;
                foreach (var k in _tmdbMetaCache.Keys.ToArray())
                {
                    if (_tmdbMetaCache.TryGetValue(k, out var e) && e.CachedAt < cutoff)
                        _tmdbMetaCache.TryRemove(k, out _);
                }
            }
        }

        public static TmdbItemMeta BuildMetaFromDetail(JsonElement detail, DetailType type, string? preferredCountry)
        {
            bool adult = detail.ValueKind == JsonValueKind.Object
                && detail.TryGetProperty("adult", out var adultEl)
                && adultEl.ValueKind == JsonValueKind.True;
            return new TmdbItemMeta
            {
                Cert = ExtractCertification(detail, type, preferredCountry),
                Tags = ExtractTags(detail),
                Adult = adult,
                MediaType = type == DetailType.Movie ? "movie" : type == DetailType.Series ? "tv" : null,
            };
        }

        // Same check as IsDetailAllowed but on already-extracted metadata so the
        // caller doesn't need to re-parse the JSON for each row.
        public static FilterDecision IsMetaAllowed(TmdbItemMeta meta, DetailType type, FilterContext ctx)
        {
            var decision = new FilterDecision { Allowed = true };
            if (meta == null || ctx == null) return decision;

            if (meta.Adult)
                return new FilterDecision { Allowed = false, Reason = "Adult content blocked" };

            if (ctx.BlockedTags.Count > 0
                && meta.Tags.Any(t => ctx.BlockedTags.Any(b => string.Equals(b, t, StringComparison.OrdinalIgnoreCase))))
                return new FilterDecision { Allowed = false, Reason = "Blocked tag" };
            if (ctx.AllowedTags.Count > 0
                && !meta.Tags.Any(t => ctx.AllowedTags.Any(a => string.Equals(a, t, StringComparison.OrdinalIgnoreCase))))
                return new FilterDecision { Allowed = false, Reason = "Not in allowed tags" };

            if (string.IsNullOrEmpty(meta.Cert))
            {
                if (BlocksUnratedFor(type, ctx))
                    return new FilterDecision { Allowed = false, Reason = "Unrated item blocked" };
                return decision;
            }

            ParentalRatingScore? score;
            try { score = ctx.Localization.GetRatingScore(meta.Cert, ctx.PreferredCountry); }
            catch (Exception ex) when (ex is ArgumentException || ex is KeyNotFoundException || ex is FormatException)
            { score = null; }

            if (score == null)
            {
                if (BlocksUnratedFor(type, ctx))
                    return new FilterDecision { Allowed = false, Reason = "Unrecognized rating blocked" };
                return decision;
            }

            if (!ctx.MaxScore.HasValue) return decision;
            if (score.Score > ctx.MaxScore.Value)
                return new FilterDecision { Allowed = false, Reason = $"Rating {meta.Cert} exceeds max" };
            if (score.Score < ctx.MaxScore.Value) return decision;

            if (ctx.MaxSubScore.HasValue && (score.SubScore ?? 0) > ctx.MaxSubScore.Value)
                return new FilterDecision { Allowed = false, Reason = $"Rating {meta.Cert} exceeds max sub-score" };
            return decision;
        }

        public enum DetailType { None, Movie, Series }

        // Per-mediatype cert candidate lists. TMDB's certificationLte filter on
        // /discover/movies expects a movie cert string; on /discover/tv a TV one.
        // Mixing the two would silently no-op or return 0 results.
        private static readonly string[] MovieCertStrings = new[]
        {
            "G", "PG", "PG-13", "R", "NC-17",
            "U", "12", "12A", "15", "18",
            "M", "MA 15+", "MA15+", "R 18+", "R18+",
            "0", "6", "7", "8", "10", "11", "13", "14", "16", "17",
            "PG-12"
        };

        private static readonly string[] TvCertStrings = new[]
        {
            "TV-Y", "TV-Y7", "TV-Y7-FV", "TV-G", "TV-PG", "TV-14", "TV-MA",
            "U", "PG", "12", "15", "18",
            "G", "M", "MA 15+", "MA15+",
            "0", "6", "7", "10", "14", "16"
        };

        // Highest-scored cert string ≤ user's max under the country's rating system,
        // for injecting `certificationLte` into TMDB Discover queries. Returns null
        // when no cert resolves (caller falls back to post-response filtering).
        public static string? MapMaxScoreToCertLte(
            string mediaType,
            int? maxScore,
            int? maxSubScore,
            string? country,
            ILocalizationManager localization)
        {
            if (!maxScore.HasValue || string.IsNullOrEmpty(country) || localization == null) return null;

            string[] candidates;
            if (string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase)) candidates = MovieCertStrings;
            else if (string.Equals(mediaType, "tv", StringComparison.OrdinalIgnoreCase)) candidates = TvCertStrings;
            else return null;

            string? bestCert = null;
            int bestScore = -1;
            int bestSubScore = -1;
            foreach (var candidate in candidates)
            {
                ParentalRatingScore? probe;
                try { probe = localization.GetRatingScore(candidate, country); }
                catch (Exception ex) when (ex is ArgumentException || ex is KeyNotFoundException || ex is FormatException)
                { continue; }
                if (probe == null) continue;
                if (probe.Score > maxScore.Value) continue;
                if (probe.Score == maxScore.Value
                    && maxSubScore.HasValue
                    && (probe.SubScore ?? 0) > maxSubScore.Value) continue;

                int candSub = probe.SubScore ?? 0;
                if (probe.Score > bestScore || (probe.Score == bestScore && candSub > bestSubScore))
                {
                    bestScore = probe.Score;
                    bestSubScore = candSub;
                    bestCert = candidate;
                }
            }
            return bestCert;
        }

        public sealed class FilterDecision
        {
            public bool Allowed { get; set; } = true;
            public string? Reason { get; set; }
        }

        public sealed class FilterContext
        {
            public User User { get; }
            public ILocalizationManager Localization { get; }
            public string? PreferredCountry { get; }
            public IReadOnlyList<string> BlockedTags { get; }
            public IReadOnlyList<string> AllowedTags { get; }
            public IReadOnlyCollection<UnratedItem> BlockUnratedItems { get; }
            public int? MaxScore { get; }
            public int? MaxSubScore { get; }

            // False when surface adult-flag strip already covers everything our
            // extra layers would do — skip Tier 1 + Tier 2 to save pointless probes.
            public bool HasRatingOrTagRestriction =>
                MaxScore.HasValue
                || MaxSubScore.HasValue
                || BlockedTags.Count > 0
                || AllowedTags.Count > 0
                || BlockUnratedItems.Count > 0;

            public FilterContext(User user, ILocalizationManager localization, string? preferredCountry)
            {
                User = user;
                Localization = localization;
                PreferredCountry = preferredCountry;
                BlockedTags = user.GetPreference(PreferenceKind.BlockedTags) ?? Array.Empty<string>();
                AllowedTags = user.GetPreference(PreferenceKind.AllowedTags) ?? Array.Empty<string>();
                BlockUnratedItems = new HashSet<UnratedItem>(
                    user.GetPreferenceValues<UnratedItem>(PreferenceKind.BlockUnratedItems));
                MaxScore = user.MaxParentalRatingScore;
                MaxSubScore = user.MaxParentalRatingSubScore;
            }
        }

        // Watchlist endpoint is `/api/v1/user/watchlist` — a too-narrow `/api/v1/watchlist`
        // token never matches that path.
        private static readonly string[] ListingPathTokensResults =
        {
            "/api/v1/search",
            "/api/v1/discover/",
            "/similar",
            "/recommendations",
            "/api/v1/user/watchlist",
        };

        private static readonly string[] ListingPathTokensParts =
        {
            "/api/v1/collection/",
        };

        private static readonly string[] ListingPathTokensCastCrew =
        {
            "/combined_credits",
            "/movie_credits",
            "/tv_credits",
        };

        public static bool IsListingPath(string apiPath) => GetListingShape(apiPath) != ListingShape.None;

        private enum ListingShape { None, Results, Parts, CastCrew }

        private static ListingShape GetListingShape(string apiPath)
        {
            if (string.IsNullOrEmpty(apiPath)) return ListingShape.None;
            foreach (var token in ListingPathTokensCastCrew)
                if (apiPath.Contains(token, StringComparison.OrdinalIgnoreCase)) return ListingShape.CastCrew;
            foreach (var token in ListingPathTokensResults)
                if (apiPath.Contains(token, StringComparison.OrdinalIgnoreCase)) return ListingShape.Results;
            foreach (var token in ListingPathTokensParts)
                if (apiPath.Contains(token, StringComparison.OrdinalIgnoreCase)) return ListingShape.Parts;
            return ListingShape.None;
        }

        // /movie/{id}, /tv/{id}, /tv/{id}/season/{n}. Sub-resources like /similar
        // or /recommendations return None — those are listings.
        public static DetailType ClassifyDetailPath(string apiPath)
        {
            if (string.IsNullOrEmpty(apiPath)) return DetailType.None;
            var path = apiPath;
            var qIndex = path.IndexOf('?');
            if (qIndex >= 0) path = path.Substring(0, qIndex);
            path = path.TrimEnd('/');

            var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 4) return DetailType.None;
            if (!parts[0].Equals("api", StringComparison.OrdinalIgnoreCase)) return DetailType.None;
            if (!parts[1].Equals("v1", StringComparison.OrdinalIgnoreCase)) return DetailType.None;

            if (parts[2].Equals("movie", StringComparison.OrdinalIgnoreCase))
                return parts.Length == 4 ? DetailType.Movie : DetailType.None;
            if (parts[2].Equals("tv", StringComparison.OrdinalIgnoreCase))
            {
                if (parts.Length == 4) return DetailType.Series;
                // A season is gated by the parent series — caller probes /tv/{id} first.
                if (parts.Length == 6 && parts[4].Equals("season", StringComparison.OrdinalIgnoreCase))
                    return DetailType.Series;
                return DetailType.None;
            }
            return DetailType.None;
        }

        public static string FilterListingJson(string responseJson, FilterContext ctx, Logger? logger = null)
            => FilterListingJson(responseJson, ctx, "results", logger);

        public static string FilterListingJson(string responseJson, FilterContext ctx, string arrayField, Logger? logger = null)
        {
            if (string.IsNullOrEmpty(responseJson) || ctx == null || string.IsNullOrEmpty(arrayField)) return responseJson;

            try
            {
                using var doc = JsonDocument.Parse(responseJson);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return responseJson;
                if (!root.TryGetProperty(arrayField, out var items) || items.ValueKind != JsonValueKind.Array)
                    return responseJson;

                var kept = new List<JsonElement>();
                int removed = 0;
                foreach (var item in items.EnumerateArray())
                {
                    if (IsListingItemAllowed(item, ctx)) kept.Add(item);
                    else removed++;
                }
                if (removed == 0) return responseJson;

                using var stream = new System.IO.MemoryStream();
                using (var writer = new Utf8JsonWriter(stream))
                {
                    writer.WriteStartObject();
                    foreach (var prop in root.EnumerateObject())
                    {
                        if (prop.NameEquals(arrayField))
                        {
                            writer.WritePropertyName(arrayField);
                            writer.WriteStartArray();
                            foreach (var item in kept) item.WriteTo(writer);
                            writer.WriteEndArray();
                        }
                        else if (prop.NameEquals("totalResults") && prop.Value.ValueKind == JsonValueKind.Number
                            && prop.Value.TryGetInt64(out var total))
                        {
                            writer.WriteNumber("totalResults", Math.Max(0, total - removed));
                        }
                        else
                        {
                            prop.WriteTo(writer);
                        }
                    }
                    writer.WriteEndObject();
                }
                return System.Text.Encoding.UTF8.GetString(stream.ToArray());
            }
            catch (JsonException ex)
            {
                logger?.Warning($"Parental filter: listing JSON unparseable (len={responseJson.Length}, field={arrayField}); passing through unfiltered: {ex.Message}");
                return responseJson;
            }
        }

        public static string FilterListingByPath(string responseJson, FilterContext ctx, string apiPath, Logger? logger = null)
        {
            switch (GetListingShape(apiPath))
            {
                case ListingShape.Results: return FilterListingJson(responseJson, ctx, "results", logger);
                case ListingShape.Parts: return FilterListingJson(responseJson, ctx, "parts", logger);
                case ListingShape.CastCrew: return FilterCastCrewJson(responseJson, ctx, logger);
                default: return responseJson;
            }
        }

        // Person credit endpoints use {cast: [...], crew: [...]} instead of results/parts.
        private static string FilterCastCrewJson(string responseJson, FilterContext ctx, Logger? logger)
        {
            if (string.IsNullOrEmpty(responseJson) || ctx == null) return responseJson;

            try
            {
                using var doc = JsonDocument.Parse(responseJson);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return responseJson;

                int totalRemoved = 0;
                var keptCast = FilterArrayField(root, "cast", ctx, ref totalRemoved);
                var keptCrew = FilterArrayField(root, "crew", ctx, ref totalRemoved);
                if (totalRemoved == 0) return responseJson;

                using var stream = new System.IO.MemoryStream();
                using (var writer = new Utf8JsonWriter(stream))
                {
                    writer.WriteStartObject();
                    foreach (var prop in root.EnumerateObject())
                    {
                        if (prop.NameEquals("cast") && keptCast != null)
                        {
                            writer.WritePropertyName("cast");
                            writer.WriteStartArray();
                            foreach (var item in keptCast) item.WriteTo(writer);
                            writer.WriteEndArray();
                        }
                        else if (prop.NameEquals("crew") && keptCrew != null)
                        {
                            writer.WritePropertyName("crew");
                            writer.WriteStartArray();
                            foreach (var item in keptCrew) item.WriteTo(writer);
                            writer.WriteEndArray();
                        }
                        else
                        {
                            prop.WriteTo(writer);
                        }
                    }
                    writer.WriteEndObject();
                }
                return System.Text.Encoding.UTF8.GetString(stream.ToArray());
            }
            catch (JsonException ex)
            {
                logger?.Warning($"Parental filter: cast/crew JSON unparseable (len={responseJson.Length}); passing through unfiltered: {ex.Message}");
                return responseJson;
            }
        }

        private static List<JsonElement>? FilterArrayField(JsonElement root, string field, FilterContext ctx, ref int totalRemoved)
        {
            if (!root.TryGetProperty(field, out var arr) || arr.ValueKind != JsonValueKind.Array) return null;
            var kept = new List<JsonElement>();
            foreach (var item in arr.EnumerateArray())
            {
                if (IsListingItemAllowed(item, ctx)) kept.Add(item);
                else totalRemoved++;
            }
            return kept;
        }

        // Listings only carry adult/mediaType — genres are numeric IDs and certs
        // are absent. Tag/cert checks run on the detail endpoint instead.
        public static bool IsListingItemAllowed(JsonElement item, FilterContext ctx)
        {
            if (item.ValueKind != JsonValueKind.Object || ctx == null) return true;

            if (item.TryGetProperty("mediaType", out var mtElem)
                && mtElem.ValueKind == JsonValueKind.String
                && string.Equals(mtElem.GetString(), "person", StringComparison.OrdinalIgnoreCase))
                return true;

            if (item.TryGetProperty("adult", out var adultElem)
                && adultElem.ValueKind == JsonValueKind.True)
                return false;

            return true;
        }

        // Mirrors BaseItem.IsParentalAllowed: tags, then rating, then unrated fallback.
        public static FilterDecision IsDetailAllowed(JsonElement detail, DetailType type, FilterContext ctx)
        {
            var decision = new FilterDecision { Allowed = true };
            if (detail.ValueKind != JsonValueKind.Object || ctx == null) return decision;

            if (detail.TryGetProperty("adult", out var adultElem)
                && adultElem.ValueKind == JsonValueKind.True)
                return new FilterDecision { Allowed = false, Reason = "Adult content blocked" };

            var itemTags = ExtractTags(detail);
            if (ctx.BlockedTags.Count > 0
                && itemTags.Any(t => ctx.BlockedTags.Any(b => string.Equals(b, t, StringComparison.OrdinalIgnoreCase))))
                return new FilterDecision { Allowed = false, Reason = "Blocked tag" };
            if (ctx.AllowedTags.Count > 0
                && !itemTags.Any(t => ctx.AllowedTags.Any(a => string.Equals(a, t, StringComparison.OrdinalIgnoreCase))))
                return new FilterDecision { Allowed = false, Reason = "Not in allowed tags" };

            var rating = ExtractCertification(detail, type, ctx.PreferredCountry);
            if (string.IsNullOrEmpty(rating))
            {
                if (BlocksUnratedFor(type, ctx))
                    return new FilterDecision { Allowed = false, Reason = "Unrated item blocked" };
                return decision;
            }

            ParentalRatingScore? score;
            try { score = ctx.Localization.GetRatingScore(rating, ctx.PreferredCountry); }
            catch (Exception ex) when (ex is ArgumentException || ex is KeyNotFoundException || ex is FormatException)
            { score = null; }

            if (score is null)
            {
                if (BlocksUnratedFor(type, ctx))
                    return new FilterDecision { Allowed = false, Reason = "Unrecognized rating blocked" };
                return decision;
            }

            if (!ctx.MaxScore.HasValue) return decision;
            if (score.Score > ctx.MaxScore.Value)
                return new FilterDecision { Allowed = false, Reason = $"Rating {rating} exceeds max" };
            if (score.Score < ctx.MaxScore.Value) return decision;

            if (ctx.MaxSubScore.HasValue && (score.SubScore ?? 0) > ctx.MaxSubScore.Value)
                return new FilterDecision { Allowed = false, Reason = $"Rating {rating} exceeds max sub-score" };
            return decision;
        }

        private static bool BlocksUnratedFor(DetailType type, FilterContext ctx) => type switch
        {
            DetailType.Movie => ctx.BlockUnratedItems.Contains(UnratedItem.Movie),
            DetailType.Series => ctx.BlockUnratedItems.Contains(UnratedItem.Series),
            _ => false,
        };

        // Genre names + keyword names. Case-insensitive match (Jellyfin's library
        // check uses StringComparer.OrdinalIgnoreCase).
        private static List<string> ExtractTags(JsonElement detail)
        {
            var tags = new List<string>();

            if (detail.TryGetProperty("genres", out var genres) && genres.ValueKind == JsonValueKind.Array)
            {
                foreach (var g in genres.EnumerateArray())
                {
                    if (g.ValueKind == JsonValueKind.Object
                        && g.TryGetProperty("name", out var n)
                        && n.ValueKind == JsonValueKind.String)
                    {
                        var name = n.GetString();
                        if (!string.IsNullOrWhiteSpace(name)) tags.Add(name);
                    }
                }
            }

            // Movies (Seerr): keywords is a flat array; some versions wrap as { results: [...] }.
            if (detail.TryGetProperty("keywords", out var kw))
            {
                if (kw.ValueKind == JsonValueKind.Array)
                    AppendNamedItems(kw, tags);
                else if (kw.ValueKind == JsonValueKind.Object
                    && kw.TryGetProperty("results", out var kwResults)
                    && kwResults.ValueKind == JsonValueKind.Array)
                    AppendNamedItems(kwResults, tags);
            }

            return tags;
        }

        private static void AppendNamedItems(JsonElement arr, List<string> tags)
        {
            foreach (var k in arr.EnumerateArray())
            {
                if (k.ValueKind == JsonValueKind.Object
                    && k.TryGetProperty("name", out var n)
                    && n.ValueKind == JsonValueKind.String)
                {
                    var name = n.GetString();
                    if (!string.IsNullOrWhiteSpace(name)) tags.Add(name);
                }
            }
        }

        // Movie: releases.results[iso_3166_1==country].release_dates[].certification
        //        (prefer theatrical type=3, fall back to any non-empty)
        // TV:    contentRatings.results[iso_3166_1==country].rating
        // Falls back to US, then any country with a non-empty value.
        private static string? ExtractCertification(JsonElement detail, DetailType type, string? preferredCountry) => type switch
        {
            DetailType.Movie => ExtractMovieCertification(detail, preferredCountry),
            DetailType.Series => ExtractTvCertification(detail, preferredCountry),
            _ => null,
        };

        private static string? ExtractMovieCertification(JsonElement detail, string? preferredCountry)
        {
            if (!detail.TryGetProperty("releases", out var releases)
                || releases.ValueKind != JsonValueKind.Object
                || !releases.TryGetProperty("results", out var results)
                || results.ValueKind != JsonValueKind.Array)
                return null;

            string? Pick(string country)
            {
                foreach (var r in results.EnumerateArray())
                {
                    if (r.ValueKind != JsonValueKind.Object) continue;
                    if (!r.TryGetProperty("iso_3166_1", out var iso)
                        || iso.ValueKind != JsonValueKind.String) continue;
                    if (!string.Equals(iso.GetString(), country, StringComparison.OrdinalIgnoreCase)) continue;
                    if (!r.TryGetProperty("release_dates", out var rd) || rd.ValueKind != JsonValueKind.Array) continue;

                    string? firstAny = null;
                    string? theatrical = null;
                    foreach (var d in rd.EnumerateArray())
                    {
                        if (d.ValueKind != JsonValueKind.Object) continue;
                        if (!d.TryGetProperty("certification", out var cert) || cert.ValueKind != JsonValueKind.String) continue;
                        var certStr = cert.GetString();
                        if (string.IsNullOrWhiteSpace(certStr)) continue;
                        firstAny ??= certStr;
                        if (theatrical is null
                            && d.TryGetProperty("type", out var t)
                            && t.ValueKind == JsonValueKind.Number
                            && t.TryGetInt32(out var tnum)
                            && tnum == 3)
                            theatrical = certStr;
                    }
                    return theatrical ?? firstAny;
                }
                return null;
            }

            if (!string.IsNullOrEmpty(preferredCountry))
            {
                var pref = Pick(preferredCountry);
                if (!string.IsNullOrEmpty(pref)) return pref;
            }
            var us = Pick("US");
            if (!string.IsNullOrEmpty(us)) return us;

            foreach (var r in results.EnumerateArray())
            {
                if (r.ValueKind != JsonValueKind.Object) continue;
                if (!r.TryGetProperty("release_dates", out var rd) || rd.ValueKind != JsonValueKind.Array) continue;
                foreach (var d in rd.EnumerateArray())
                {
                    if (d.ValueKind != JsonValueKind.Object) continue;
                    if (d.TryGetProperty("certification", out var c)
                        && c.ValueKind == JsonValueKind.String)
                    {
                        var s = c.GetString();
                        if (!string.IsNullOrWhiteSpace(s)) return s;
                    }
                }
            }
            return null;
        }

        private static string? ExtractTvCertification(JsonElement detail, string? preferredCountry)
        {
            if (!detail.TryGetProperty("contentRatings", out var cr)
                || cr.ValueKind != JsonValueKind.Object
                || !cr.TryGetProperty("results", out var results)
                || results.ValueKind != JsonValueKind.Array)
                return null;

            string? Pick(string country)
            {
                foreach (var r in results.EnumerateArray())
                {
                    if (r.ValueKind != JsonValueKind.Object) continue;
                    if (!r.TryGetProperty("iso_3166_1", out var iso) || iso.ValueKind != JsonValueKind.String) continue;
                    if (!string.Equals(iso.GetString(), country, StringComparison.OrdinalIgnoreCase)) continue;
                    if (!r.TryGetProperty("rating", out var rating) || rating.ValueKind != JsonValueKind.String) continue;
                    var s = rating.GetString();
                    if (!string.IsNullOrWhiteSpace(s)) return s;
                }
                return null;
            }

            if (!string.IsNullOrEmpty(preferredCountry))
            {
                var pref = Pick(preferredCountry);
                if (!string.IsNullOrEmpty(pref)) return pref;
            }
            var us = Pick("US");
            if (!string.IsNullOrEmpty(us)) return us;

            foreach (var r in results.EnumerateArray())
            {
                if (r.ValueKind != JsonValueKind.Object) continue;
                if (r.TryGetProperty("rating", out var rating) && rating.ValueKind == JsonValueKind.String)
                {
                    var s = rating.GetString();
                    if (!string.IsNullOrWhiteSpace(s)) return s;
                }
            }
            return null;
        }
    }
}
