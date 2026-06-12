using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Model.Globalization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers
{
    /// <summary>
    /// Server-side parental-rating filter for proxied Jellyseerr result lists
    /// (upstream issue n00bcodr/Jellyfin-Enhanced#581).
    ///
    /// Jellyfin enforces each user's parental limit for library content, but
    /// Seerr results are raw TMDB data — a child restricted to PG could still
    /// see and request R-rated titles from JE's search/discovery rows. Seerr
    /// list responses carry no certification, so titles are resolved through
    /// Seerr's detail endpoints (movie releases / tv contentRatings), mapped
    /// with Jellyfin's own ILocalizationManager.GetRatingScore, and compared
    /// using the exact semantics of BaseItem.IsParentalAllowed (10.11):
    /// unrated/unrecognized ratings are allowed unless the user's policy
    /// blocks unrated items for that media type; equal scores tie-break on
    /// the sub-score. TMDB adult-flagged items are always dropped for
    /// limited users.
    ///
    /// Certifications are cached for 24h per title; resolution failures are
    /// NOT cached and fall back to the unrated semantics for that pass. Any
    /// unexpected error fails open (returns the unfiltered payload) — this
    /// filter must never break search for misconfigured servers.
    /// </summary>
    public static class SeerrParentalRatingFilter
    {
        private sealed record RatingEntry(int? Score, int? SubScore, bool HasRating, DateTime At);

        private static readonly ConcurrentDictionary<string, RatingEntry> _ratingCache = new();
        private static readonly ConcurrentDictionary<string, Lazy<Task<RatingEntry?>>> _inflight = new();
        private static readonly SemaphoreSlim _fetchGate = new(6);
        private static readonly TimeSpan _cacheTtl = TimeSpan.FromHours(24);
        private const int CacheLimit = 5000;

        // Array properties that hold media items in Seerr responses:
        // results (search/discover/similar/recommendations/watchlist),
        // parts (collection), cast/crew (person combined_credits).
        private static readonly string[] MediaArrayKeys = { "results", "parts", "cast", "crew" };

        /// <summary>
        /// GET endpoints whose responses contain user-facing media lists.
        /// Metadata-only endpoints that slip through (e.g. genreslider) are
        /// harmless: items without a movie/tv mediaType are never filtered.
        /// </summary>
        public static bool IsFilterablePath(string apiPath)
        {
            if (apiPath.Contains("/search/keyword", StringComparison.OrdinalIgnoreCase)) return false;
            return apiPath.Contains("/search", StringComparison.OrdinalIgnoreCase)
                || apiPath.Contains("/discover/", StringComparison.OrdinalIgnoreCase)
                || apiPath.Contains("/similar", StringComparison.OrdinalIgnoreCase)
                || apiPath.Contains("/recommendations", StringComparison.OrdinalIgnoreCase)
                || apiPath.Contains("/combined_credits", StringComparison.OrdinalIgnoreCase)
                || apiPath.StartsWith("/api/v1/collection/", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Filters a Seerr list payload for the given user. Returns the
        /// original JSON when the user is unlimited, nothing needed removing,
        /// or anything went wrong (fail-open).
        /// </summary>
        /// <param name="json">Raw Seerr response JSON.</param>
        /// <param name="user">The requesting Jellyfin user (entity).</param>
        /// <param name="localization">Jellyfin's localization manager (rating → score).</param>
        /// <param name="countryCode">Server metadata country (certification country preference).</param>
        /// <param name="fetchSeerrJson">Admin-key Seerr GET: apiPath → body or null.</param>
        /// <param name="logger">Plugin logger.</param>
        /// <param name="ct">Request cancellation.</param>
        public static async Task<string> FilterAsync(
            string json,
            Jellyfin.Database.Implementations.Entities.User user,
            ILocalizationManager localization,
            string? countryCode,
            Func<string, CancellationToken, Task<string?>> fetchSeerrJson,
            Logger logger,
            CancellationToken ct)
        {
            try
            {
                var maxScore = user.MaxParentalRatingScore;
                if (!maxScore.HasValue)
                {
                    return json;
                }

                var maxSubScore = user.MaxParentalRatingSubScore;
                var blockedUnrated = user.GetPreferenceValues<UnratedItem>(PreferenceKind.BlockUnratedItems);
                bool blockUnratedMovie = blockedUnrated.Contains(UnratedItem.Movie);
                bool blockUnratedSeries = blockedUnrated.Contains(UnratedItem.Series);

                if (JsonNode.Parse(json) is not JsonObject root)
                {
                    return json;
                }

                var arrays = MediaArrayKeys
                    .Select(k => root[k] as JsonArray)
                    .Where(a => a != null)
                    .Select(a => a!)
                    .ToList();
                if (arrays.Count == 0)
                {
                    return json;
                }

                // Pass 1: collect titles whose rating is not cached yet.
                var needed = new HashSet<string>();
                foreach (var arr in arrays)
                {
                    foreach (var node in arr)
                    {
                        var (mediaType, tmdbId, isAdult) = ReadIdentity(node);
                        if (mediaType == null || tmdbId == null || isAdult)
                        {
                            continue; // non-media entries pass; adult items need no lookup
                        }
                        var key = mediaType + ":" + tmdbId;
                        if (!TryGetFresh(key, out _))
                        {
                            needed.Add(key);
                        }
                    }
                }

                if (needed.Count > 0)
                {
                    await Task.WhenAll(needed.Select(key =>
                        ResolveRatingAsync(key, localization, countryCode, fetchSeerrJson, logger, ct)));
                }

                // Pass 2: drop disallowed items.
                int removed = 0;
                foreach (var arr in arrays)
                {
                    for (int i = arr.Count - 1; i >= 0; i--)
                    {
                        var (mediaType, tmdbId, isAdult) = ReadIdentity(arr[i]);
                        if (mediaType == null)
                        {
                            continue; // people / unknown entries always pass
                        }

                        bool allowed;
                        if (isAdult)
                        {
                            allowed = false;
                        }
                        else if (tmdbId == null)
                        {
                            allowed = mediaType == "movie" ? !blockUnratedMovie : !blockUnratedSeries;
                        }
                        else if (TryGetFresh(mediaType + ":" + tmdbId, out var entry) && entry!.HasRating)
                        {
                            // Mirror BaseItem.IsParentalAllowed score comparison.
                            allowed = entry.Score != maxScore.Value
                                ? entry.Score < maxScore.Value
                                : !maxSubScore.HasValue || (entry.SubScore ?? 0) <= maxSubScore.Value;
                        }
                        else
                        {
                            // No certification found / unmappable / lookup failed:
                            // unrated semantics per media type.
                            allowed = mediaType == "movie" ? !blockUnratedMovie : !blockUnratedSeries;
                        }

                        if (!allowed)
                        {
                            arr.RemoveAt(i);
                            removed++;
                        }
                    }
                }

                if (removed == 0)
                {
                    return json;
                }

                // page/totalResults are intentionally left untouched — same
                // behavior as the existing client-side library/blocklist
                // filters; the client renders whatever the list contains.
                return root.ToJsonString();
            }
            catch (OperationCanceledException)
            {
                return json;
            }
            catch (Exception ex)
            {
                logger.Warning($"Parental rating filter failed open: {ex.Message}");
                return json;
            }
        }

        private static (string? MediaType, long? TmdbId, bool IsAdult) ReadIdentity(JsonNode? node)
        {
            if (node is not JsonObject o)
            {
                return (null, null, false);
            }

            var mediaType = (o["mediaType"] as JsonValue)?.TryGetValue<string>(out var mt) == true ? mt : null;
            if (mediaType != "movie" && mediaType != "tv")
            {
                return (null, null, false);
            }

            long? id = null;
            // Standard lists use TMDB id in `id`; watchlist entries use `tmdbId`.
            foreach (var key in new[] { "id", "tmdbId" })
            {
                if (o[key] is JsonValue v && v.TryGetValue<long>(out var parsed))
                {
                    id = parsed;
                    break;
                }
            }

            bool isAdult = o["adult"] is JsonValue av && av.TryGetValue<bool>(out var adult) && adult;
            return (mediaType, id, isAdult);
        }

        private static bool TryGetFresh(string key, out RatingEntry? entry)
        {
            if (_ratingCache.TryGetValue(key, out var hit) && DateTime.UtcNow - hit.At < _cacheTtl)
            {
                entry = hit;
                return true;
            }
            entry = null;
            return false;
        }

        private static Task<RatingEntry?> ResolveRatingAsync(
            string key,
            ILocalizationManager localization,
            string? countryCode,
            Func<string, CancellationToken, Task<string?>> fetchSeerrJson,
            Logger logger,
            CancellationToken ct)
        {
            // Single-flight per title across concurrent requests.
            var lazy = _inflight.GetOrAdd(key, k => new Lazy<Task<RatingEntry?>>(async () =>
            {
                try
                {
                    var sep = k.IndexOf(':');
                    var mediaType = k.Substring(0, sep);
                    var tmdbId = k.Substring(sep + 1);
                    var apiPath = mediaType == "movie"
                        ? $"/api/v1/movie/{tmdbId}"
                        : $"/api/v1/tv/{tmdbId}";

                    string? detailJson;
                    await _fetchGate.WaitAsync(ct);
                    try
                    {
                        detailJson = await fetchSeerrJson(apiPath, ct);
                    }
                    finally
                    {
                        _fetchGate.Release();
                    }

                    if (detailJson == null)
                    {
                        return null; // fetch failed — do not cache
                    }

                    var cert = ExtractCertification(detailJson, mediaType, countryCode);
                    RatingEntry entry;
                    if (string.IsNullOrWhiteSpace(cert))
                    {
                        entry = new RatingEntry(null, null, false, DateTime.UtcNow);
                    }
                    else
                    {
                        // Country handling mirrors BaseItem: GetRatingScore
                        // without a country argument resolves through the
                        // server's configured rating country and fallbacks.
                        var score = localization.GetRatingScore(cert!);
                        entry = score == null
                            ? new RatingEntry(null, null, false, DateTime.UtcNow)
                            : new RatingEntry(score.Score, score.SubScore, true, DateTime.UtcNow);
                    }

                    if (_ratingCache.Count >= CacheLimit)
                    {
                        foreach (var kv in _ratingCache)
                        {
                            if (DateTime.UtcNow - kv.Value.At >= _cacheTtl)
                            {
                                _ratingCache.TryRemove(kv.Key, out _);
                            }
                        }
                        if (_ratingCache.Count >= CacheLimit)
                        {
                            _ratingCache.Clear();
                        }
                    }
                    _ratingCache[k] = entry;
                    return entry;
                }
                catch (OperationCanceledException)
                {
                    return null;
                }
                catch (Exception ex)
                {
                    logger.Debug($"Parental rating lookup failed for {k}: {ex.Message}");
                    return null;
                }
            }, LazyThreadSafetyMode.ExecutionAndPublication));

            var task = lazy.Value;
            // Drop the in-flight slot once settled so future misses re-resolve.
            task.ContinueWith(_ => _inflight.TryRemove(key, out var _), TaskScheduler.Default);
            return task;
        }

        /// <summary>
        /// Pulls a certification string out of a Seerr detail payload:
        /// movies carry releases.results[].release_dates[].certification,
        /// tv carries contentRatings.results[].rating. Prefers the server's
        /// metadata country, then US, then the first non-empty entry.
        /// </summary>
        internal static string? ExtractCertification(string detailJson, string mediaType, string? countryCode)
        {
            if (JsonNode.Parse(detailJson) is not JsonObject root)
            {
                return null;
            }

            var preferred = string.IsNullOrWhiteSpace(countryCode) ? "US" : countryCode!.ToUpperInvariant();

            if (mediaType == "movie")
            {
                if (root["releases"]?["results"] is not JsonArray countries)
                {
                    return null;
                }

                string? FromCountry(string iso)
                {
                    foreach (var c in countries)
                    {
                        if ((c?["iso_3166_1"] as JsonValue)?.TryGetValue<string>(out var code) != true || code != iso)
                        {
                            continue;
                        }
                        if (c!["release_dates"] is not JsonArray dates)
                        {
                            continue;
                        }
                        foreach (var d in dates)
                        {
                            if ((d?["certification"] as JsonValue)?.TryGetValue<string>(out var cert) == true
                                && !string.IsNullOrWhiteSpace(cert))
                            {
                                return cert;
                            }
                        }
                    }
                    return null;
                }

                var fromPreferred = FromCountry(preferred) ?? (preferred != "US" ? FromCountry("US") : null);
                if (fromPreferred != null)
                {
                    return fromPreferred;
                }

                foreach (var c in countries)
                {
                    if (c?["release_dates"] is not JsonArray dates)
                    {
                        continue;
                    }
                    foreach (var d in dates)
                    {
                        if ((d?["certification"] as JsonValue)?.TryGetValue<string>(out var cert) == true
                            && !string.IsNullOrWhiteSpace(cert))
                        {
                            return cert;
                        }
                    }
                }
                return null;
            }

            // tv
            if (root["contentRatings"]?["results"] is not JsonArray ratings)
            {
                return null;
            }

            string? TvFromCountry(string iso)
            {
                foreach (var r in ratings)
                {
                    if ((r?["iso_3166_1"] as JsonValue)?.TryGetValue<string>(out var code) == true && code == iso
                        && (r["rating"] as JsonValue)?.TryGetValue<string>(out var rating) == true
                        && !string.IsNullOrWhiteSpace(rating))
                    {
                        return rating;
                    }
                }
                return null;
            }

            var tvPreferred = TvFromCountry(preferred) ?? (preferred != "US" ? TvFromCountry("US") : null);
            if (tvPreferred != null)
            {
                return tvPreferred;
            }

            foreach (var r in ratings)
            {
                if ((r?["rating"] as JsonValue)?.TryGetValue<string>(out var rating) == true
                    && !string.IsNullOrWhiteSpace(rating))
                {
                    return rating;
                }
            }
            return null;
        }
    }
}
