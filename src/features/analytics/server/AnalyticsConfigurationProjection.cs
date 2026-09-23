using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>Privacy boundary for projecting configuration into opt-in analytics.</summary>
    internal static class AnalyticsConfigurationProjection
    {
        /// <summary>
        /// Every bool property on PluginConfiguration except this feature's own
        /// (Analytics*) internal state and any property explicitly marked
        /// [AnalyticsExclude] (internal bookkeeping with no admin-facing
        /// control, e.g. *CustomTabJeOwned), plus two derived "is a key
        /// configured" booleans that mirror GetPublicConfig()'s
        /// TmdbEnabled/MdblistEnabled. The actual keys are strings and must
        /// never be reflected in GetStringSettings, only whether one is present.
        /// </summary>
        internal static Dictionary<string, bool> GetBooleanFeatureFlags(PluginConfiguration config)
        {
            var flags = typeof(PluginConfiguration)
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.PropertyType == typeof(bool)
                    && !p.Name.StartsWith("Analytics", StringComparison.Ordinal)
                    && p.GetCustomAttribute<Model.AnalyticsExcludeAttribute>() == null)
                .ToDictionary(p => p.Name, p => (bool)p.GetValue(config)!);

            flags["TmdbEnabled"] = !string.IsNullOrWhiteSpace(config.TMDB_API_KEY);
            flags["MdblistEnabled"] = !string.IsNullOrWhiteSpace(config.MdblistApiKey);

            return flags;
        }

        /// <summary>
        /// Every string property explicitly marked [AnalyticsInclude] (sent
        /// verbatim — so the attribute may ONLY go on fixed-choice values),
        /// plus derived entries for settings whose raw value is not safe to
        /// share and must be reduced to a safe shape first. See the
        /// attribute's doc comment for why strings can't auto-include by type
        /// the way bools do. Empty/null values are skipped so a never-set field
        /// doesn't crowd out real answers in the dashboard's value-distribution view.
        /// </summary>
        internal static Dictionary<string, string> GetStringSettings(PluginConfiguration config)
        {
            var settings = typeof(PluginConfiguration)
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.PropertyType == typeof(string) && p.GetCustomAttribute<Model.AnalyticsIncludeAttribute>() != null)
                .Select(p => new { p.Name, Value = p.GetValue(config) as string })
                .Where(x => !string.IsNullOrEmpty(x.Value))
                .ToDictionary(x => x.Name, x => x.Value!);

            // Derived, never verbatim: the stored value can be a JSON array of
            // real Jellyfin user GUIDs. One shared helper with the anonymous
            // public-config endpoint so the two shapes can never drift.
            settings["MaintenanceModeAffectedUsers"] = PluginConfiguration.DeriveAffectedUsersShape(config.MaintenanceModeAffectedUsers);

            // Free-text field: the config page invites language names or codes
            // ("English, Japanese, fr"). Only tokens shaped like language codes
            // are shared, so anything else an admin typed or pasted into the
            // box never leaves the server. Up to two extra subtags so
            // well-formed BCP-47 forms like zh-Hans-CN survive the filter.
            var languageCodes = (config.LanguageTagsPriority ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(t => System.Text.RegularExpressions.Regex.IsMatch(t, "^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$"))
                .Select(t => t.ToLowerInvariant());
            var joinedCodes = string.Join(",", languageCodes);
            if (!string.IsNullOrEmpty(joinedCodes))
            {
                settings["LanguageTagsPriority"] = joinedCodes;
            }

            return settings;
        }

    }
}
