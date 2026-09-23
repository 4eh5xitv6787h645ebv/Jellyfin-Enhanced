using System.Collections.Generic;
using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Maps MDBList JSON to the plugin's stable cache and account contracts.
    /// Network failures, quota decisions and cache lifetime belong to MdblistService.
    /// </summary>
    internal static class MdblistResponseParser
    {
        internal static MdblistAccountStatus ParseAccountStatus(JsonElement root, long fetchedAtUnixMs)
        {
            return new MdblistAccountStatus
            {
                Plan = root.TryGetProperty("plan", out var planEl) && planEl.ValueKind == JsonValueKind.String ? (planEl.GetString() ?? string.Empty) : string.Empty,
                IsSupporter = root.TryGetProperty("is_supporter", out var supEl) && supEl.ValueKind == JsonValueKind.True,
                RateLimit = GetNullableInt(root, "rate_limit") ?? 0,
                RateLimitRemaining = GetNullableInt(root, "rate_limit_remaining") ?? 0,
                RateLimitResetUnixSeconds = GetNullableLong(root, "rate_limit_reset") ?? 0,
                FetchedAtUnixMs = fetchedAtUnixMs,
            };
        }

        internal static MdblistCacheEntry ParseResponse(JsonDocument doc, long fetchedAtUnixMs)
        {
            var root = doc.RootElement;

            // MDBList returns {"response": false, "error": "..."} when there's no match for this id.
            if (root.TryGetProperty("response", out var respEl) && respEl.ValueKind == JsonValueKind.False)
            {
                return new MdblistCacheEntry { Found = false, Confirmed = true, FetchedAtUnixMs = fetchedAtUnixMs };
            }

            return ParseMediaItem(root, fetchedAtUnixMs);
        }

        /// <summary>
        /// Parses one media item object, the shape shared between the
        /// single-item endpoint's root response and each element of
        /// GetMediaBatchAsync's result array: ratings[] (value/score/votes/url
        /// per source), the top-level "score" (MDBList's own aggregate,
        /// synthesized as our "master" source since it's not itself a
        /// ratings[] entry), and the cross-provider ids object.
        /// </summary>
        internal static MdblistCacheEntry ParseMediaItem(JsonElement item, long fetchedAtUnixMs)
        {
            var ratings = new List<MdblistRatingSource>();
            if (item.TryGetProperty("ratings", out var ratingsEl) && ratingsEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var r in ratingsEl.EnumerateArray())
                {
                    if (!r.TryGetProperty("source", out var sourceEl) || sourceEl.ValueKind != JsonValueKind.String)
                    {
                        continue;
                    }
                    var source = sourceEl.GetString();
                    if (string.IsNullOrEmpty(source)) continue;

                    ratings.Add(new MdblistRatingSource
                    {
                        Source = source,
                        Value = GetNullableDouble(r, "value"),
                        Score = GetNullableDouble(r, "score"),
                        Votes = GetNullableInt(r, "votes"),
                        // "url" is a source-specific slug/path for most sources,
                        // but a bare integer for imdb, which isn't a usable link
                        // either way. imdb's own link is built from Ids["imdb"]
                        // instead (see mdblist-ratings.js's generateLink), so a
                        // non-string value here is simply skipped.
                        Url = r.TryGetProperty("url", out var urlEl) && urlEl.ValueKind == JsonValueKind.String ? urlEl.GetString() : null,
                        Fresh = GetNullableInt(r, "fresh"),
                    });
                }
            }

            // MDBList's own aggregate ("master") score is not a member of the
            // ratings[] array; it's a top-level field on the response.
            // Synthesized here as a regular source entry so the rest of the
            // pipeline (display badges, MdblistRatingsSources filtering/
            // ordering) treats it identically to every other source.
            var masterScore = GetNullableDouble(item, "score");
            if (masterScore.HasValue)
            {
                ratings.Add(new MdblistRatingSource { Source = "master", Value = masterScore, Score = masterScore });
            }

            // Cross-provider IDs (imdb/tmdb/trakt/mal/anilist/...) so the display
            // module can link each badge to its own site (see MdblistCacheEntry.Ids).
            // Values can be a string (imdb's "tt1234567") or a number (tmdb/trakt/
            // mal/anilist) in MDBList's JSON; normalized to string either way.
            var ids = new Dictionary<string, string>();
            if (item.TryGetProperty("ids", out var idsEl) && idsEl.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in idsEl.EnumerateObject())
                {
                    if (prop.Value.ValueKind == JsonValueKind.String)
                    {
                        var s = prop.Value.GetString();
                        if (!string.IsNullOrEmpty(s)) ids[prop.Name] = s;
                    }
                    else if (prop.Value.ValueKind == JsonValueKind.Number)
                    {
                        ids[prop.Name] = prop.Value.GetRawText();
                    }
                }
            }

            return new MdblistCacheEntry
            {
                Found = true,
                Confirmed = true,
                Ratings = ratings,
                Ids = ids,
                FetchedAtUnixMs = fetchedAtUnixMs,
            };
        }

        private static double? GetNullableDouble(JsonElement el, string property)
        {
            if (!el.TryGetProperty(property, out var v) || v.ValueKind != JsonValueKind.Number) return null;
            return v.TryGetDouble(out var d) ? d : null;
        }

        private static int? GetNullableInt(JsonElement el, string property)
        {
            if (!el.TryGetProperty(property, out var v) || v.ValueKind != JsonValueKind.Number) return null;
            return v.TryGetInt32(out var i) ? i : null;
        }

        private static long? GetNullableLong(JsonElement el, string property)
        {
            if (!el.TryGetProperty(property, out var v) || v.ValueKind != JsonValueKind.Number) return null;
            return v.TryGetInt64(out var l) ? l : null;
        }

    }
}
