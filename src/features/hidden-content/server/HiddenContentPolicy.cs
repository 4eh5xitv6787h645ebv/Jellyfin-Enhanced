using System;
using System.Collections.Generic;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Compiles saved hides into item/series scope lookups and applies the user's
    /// per-surface gates. Independent of HTTP routing, response types and caching.
    /// </summary>
    internal sealed class HiddenContentPolicy
    {

        private Dictionary<string, HashSet<string>> ItemIdScopes { get; } = new(StringComparer.OrdinalIgnoreCase);
        private Dictionary<string, HashSet<string>> SeriesIdScopes { get; } = new(StringComparer.OrdinalIgnoreCase);
        private HiddenContentSettings Settings { get; set; } = new HiddenContentSettings();

        public bool IsEmpty => ItemIdScopes.Count == 0 && SeriesIdScopes.Count == 0;

        public static HiddenContentPolicy Build(UserHiddenContent? data)
        {
            if (data?.Items == null || data.Items.Count == 0)
            {
                return new HiddenContentPolicy { Settings = data?.Settings ?? new HiddenContentSettings() };
            }

            var ctx = new HiddenContentPolicy { Settings = data.Settings ?? new HiddenContentSettings() };
            if (!ctx.Settings.Enabled) return ctx;

            foreach (var entry in data.Items.Values)
            {
                if (entry == null || string.IsNullOrWhiteSpace(entry.ItemId)) continue;
                var id = NormalizeId(entry.ItemId);
                var scope = string.IsNullOrEmpty(entry.HideScope) ? "global" : entry.HideScope.ToLowerInvariant();

                AddScope(ctx.ItemIdScopes, id, scope);
                if (string.Equals(entry.Type, "Series", StringComparison.OrdinalIgnoreCase))
                {
                    AddScope(ctx.SeriesIdScopes, id, scope);
                }
            }
            return ctx;
        }

        private static void AddScope(Dictionary<string, HashSet<string>> dict, string key, string scope)
        {
            if (!dict.TryGetValue(key, out var set))
            {
                set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                dict[key] = set;
            }
            set.Add(scope);
        }

        public bool IsHidden(string itemIdStr, string? seriesIdStr, string surface)
        {
            var itemId = NormalizeId(itemIdStr);
            var seriesId = seriesIdStr is null ? null : NormalizeId(seriesIdStr);

            if (ItemIdScopes.TryGetValue(itemId, out var scopes))
            {
                foreach (var s in scopes)
                {
                    if (ScopeAppliesToSurface(s, surface, Settings)) return true;
                }
            }

            if (seriesId is not null && SeriesIdScopes.TryGetValue(seriesId, out var sScopes))
            {
                foreach (var s in sScopes)
                {
                    if (ScopeAppliesToSurface(s, surface, Settings)) return true;
                }
            }

            // Item is itself a Series row whose entry was keyed series-scope.
            if (SeriesIdScopes.TryGetValue(itemId, out var selfSeriesScopes))
            {
                foreach (var s in selfSeriesScopes)
                {
                    if (ScopeAppliesToSurface(s, surface, Settings)) return true;
                }
            }

            return false;
        }

        private static bool ScopeAppliesToSurface(string scope, string surface, HiddenContentSettings settings)
        {
            // Per-surface gate — toggling "Filter Continue Watching" off suppresses ALL CW filtering, including explicit-scope hides.
            if (!ShouldFilterSurface(settings, surface)) return false;

            if (string.Equals(scope, surface, StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(scope, "homesections", StringComparison.OrdinalIgnoreCase)
                && (string.Equals(surface, "nextup", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(surface, "continuewatching", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
            return string.Equals(scope, "global", StringComparison.OrdinalIgnoreCase);
        }

        private static bool ShouldFilterSurface(HiddenContentSettings s, string surface)
        {
            if (s == null || !s.Enabled) return false;
            return surface switch
            {
                "library" or "details" => s.FilterLibrary,
                "discovery" => s.FilterDiscovery,
                "search" => s.FilterSearch,
                "upcoming" => s.FilterUpcoming,
                "calendar" => s.FilterCalendar,
                "recommendations" => s.FilterRecommendations,
                "requests" => s.FilterRequests,
                "nextup" => s.FilterNextUp,
                "continuewatching" => s.FilterContinueWatching,
                _ => true,
            };
        }

        private static string NormalizeId(string id)
        {
            if (string.IsNullOrEmpty(id)) return string.Empty;
            if (Guid.TryParse(id, out var g) || Guid.TryParseExact(id, "N", out g))
            {
                return g.ToString();
            }
            return id.ToLowerInvariant();
        }
    }
}
