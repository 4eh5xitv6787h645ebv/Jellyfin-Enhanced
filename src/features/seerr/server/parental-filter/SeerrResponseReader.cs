using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrEndpointClassifier;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr
{
    /// <summary>Reads title identities and containers from Seerr JSON without network access.</summary>
    internal static class SeerrResponseReader
    {
        internal static IEnumerable<JsonArray> CollectArrays(JsonObject root, EndpointPlan plan)
        {
            switch (plan.Container)
            {
                case Container.Results:
                    if (root["results"] is JsonArray results)
                    {
                        yield return results;
                    }

                    break;
                case Container.Parts:
                    if (root["parts"] is JsonArray parts)
                    {
                        yield return parts;
                    }

                    break;
                case Container.CombinedCredits:
                    if (root["cast"] is JsonArray cast)
                    {
                        yield return cast;
                    }

                    if (root["crew"] is JsonArray crew)
                    {
                        yield return crew;
                    }

                    break;
            }
        }

        // ── Item readers ─────────────────────────────────────────────────────

        internal static JsonObject? ResolveItemObject(JsonObject row, EndpointPlan plan)
            => plan.NestedMedia ? row["media"] as JsonObject : row;

        internal static string? ResolveMediaType(JsonObject item, EndpointPlan plan)
            => NormalizeMediaType(ReadString(item, "mediaType") ?? plan.MediaTypeHint);

        internal static string? NormalizeMediaType(string? raw)
        {
            if (string.Equals(raw, "movie", StringComparison.OrdinalIgnoreCase))
            {
                return "movie";
            }

            if (string.Equals(raw, "tv", StringComparison.OrdinalIgnoreCase))
            {
                return "tv";
            }

            return null;
        }

        internal static string? ReadString(JsonObject item, string property)
        {
            var node = item[property];
            return node?.GetValueKind() == JsonValueKind.String ? node.GetValue<string>() : null;
        }

        internal static bool IsAdult(JsonObject item)
        {
            try
            {
                return item["adult"]?.GetValueKind() == JsonValueKind.True;
            }
            catch (Exception)
            {
                return true; // unreadable flag: treat as adult (fail closed)
            }
        }

        internal static bool TryGetTmdbId(JsonObject item, string idField, out int tmdbId)
        {
            tmdbId = 0;
            var node = item[idField];
            if (node == null)
            {
                return false;
            }

            try
            {
                switch (node.GetValueKind())
                {
                    case JsonValueKind.Number:
                        tmdbId = node.GetValue<int>();
                        return true;
                    case JsonValueKind.String:
                        return int.TryParse(node.GetValue<string>(), NumberStyles.Integer, CultureInfo.InvariantCulture, out tmdbId);
                    default:
                        return false;
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        internal static string CacheKey(string mediaType, int tmdbId, string region)
            => $"{mediaType}:{tmdbId.ToString(CultureInfo.InvariantCulture)}:{region}";
    }
}
