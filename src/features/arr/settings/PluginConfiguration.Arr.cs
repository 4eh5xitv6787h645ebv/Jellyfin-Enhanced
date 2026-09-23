using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Arr;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Arr Links Settings
        public bool ArrLinksEnabled { get; set; } = false;
        public string SonarrUrl { get; set; } = "";
        public string RadarrUrl { get; set; } = "";
        public string BazarrUrl { get; set; } = "";
        public bool ShowArrLinksAsText { get; set; } = false;
        /// <summary>
        /// When true, single-instance arr links show the status color border + episode count badge
        /// (same as multi-instance dropdowns). When false (default), single-instance links render
        /// as a plain icon/text so the Jellyfin detail page isn't cluttered with status pills when
        /// only one Sonarr/Radarr is configured. Multi-instance dropdowns always show status
        /// regardless of this flag since distinguishing instances is the whole point there.
        /// </summary>
        public bool ArrLinksShowStatusSingle { get; set; } = false;
        public string SonarrUrlMappings { get; set; } = "";
        public string RadarrUrlMappings { get; set; } = "";
        public string BazarrUrlMappings { get; set; } = "";

        // Multi-Instance Sonarr/Radarr Support (JSON arrays of ArrInstance)
        public string SonarrInstances { get; set; } = "[]";
        public string RadarrInstances { get; set; } = "[]";

        // Arr Tags Sync Settings
        public bool ArrTagsSyncEnabled { get; set; } = false;
        public string SonarrApiKey { get; set; } = "";
        public string RadarrApiKey { get; set; } = "";
        public string ArrTagsPrefix { get; set; } = "JE Arr Tag: ";
        public bool ArrTagsClearOldTags { get; set; } = true;
        public bool ArrTagsShowAsLinks { get; set; } = true;
        public string ArrTagsLinksFilter { get; set; } = "";
        public string ArrTagsLinksHideFilter { get; set; } = "";
        public string ArrTagsSyncFilter { get; set; } = "";

        /// <summary>
        /// Returns configured Sonarr instances, falling back to legacy single-instance fields for migration.
        /// Legacy fallback runs ONLY when the stored JSON is explicitly empty; if it is corrupt (unparseable),
        /// returns an empty list without synthesizing an instance from legacy fields — the caller should
        /// surface this via <see cref="SonarrInstancesCorrupt"/> and refuse to overwrite on save.
        /// </summary>
        public List<ArrInstance> GetSonarrInstances()
        {
            var parsed = TryDeserializeInstances(SonarrInstances, out var parseResult);
            if (parsed.Count > 0)
                return parsed;

            if (parseResult == InstanceParseResult.ExplicitlyEmpty
                && !string.IsNullOrWhiteSpace(SonarrUrl)
                && !string.IsNullOrWhiteSpace(SonarrApiKey))
            {
                return new List<ArrInstance>
                {
                    new ArrInstance
                    {
                        Name = "Sonarr",
                        Url = SonarrUrl,
                        ApiKey = SonarrApiKey,
                        UrlMappings = SonarrUrlMappings ?? ""
                    }
                };
            }

            return parsed;
        }

        /// <summary>
        /// Returns configured Radarr instances, falling back to legacy single-instance fields for migration.
        /// Same corruption-aware semantics as <see cref="GetSonarrInstances"/>.
        /// </summary>
        public List<ArrInstance> GetRadarrInstances()
        {
            var parsed = TryDeserializeInstances(RadarrInstances, out var parseResult);
            if (parsed.Count > 0)
                return parsed;

            if (parseResult == InstanceParseResult.ExplicitlyEmpty
                && !string.IsNullOrWhiteSpace(RadarrUrl)
                && !string.IsNullOrWhiteSpace(RadarrApiKey))
            {
                return new List<ArrInstance>
                {
                    new ArrInstance
                    {
                        Name = "Radarr",
                        Url = RadarrUrl,
                        ApiKey = RadarrApiKey,
                        UrlMappings = RadarrUrlMappings ?? ""
                    }
                };
            }

            return parsed;
        }

        /// <summary>
        /// Subset of <see cref="GetSonarrInstances"/> limited to instances the admin has not
        /// toggled off. Fan-out callers (controller endpoints, scheduled tag sync) should use
        /// this so disabled instances are skipped without being removed from the stored config.
        /// </summary>
        public List<ArrInstance> GetEnabledSonarrInstances()
            => GetSonarrInstances().Where(i => i.Enabled).ToList();

        /// <summary>Enabled-only subset of <see cref="GetRadarrInstances"/>; see Sonarr variant.</summary>
        public List<ArrInstance> GetEnabledRadarrInstances()
            => GetRadarrInstances().Where(i => i.Enabled).ToList();

        /// <summary>True when <see cref="SonarrInstances"/> contains JSON that could not be parsed.</summary>
        public bool IsSonarrInstancesCorrupt()
        {
            _ = TryDeserializeInstances(SonarrInstances, out var r);
            return r == InstanceParseResult.Corrupt;
        }

        /// <summary>True when <see cref="RadarrInstances"/> contains JSON that could not be parsed.</summary>
        public bool IsRadarrInstancesCorrupt()
        {
            _ = TryDeserializeInstances(RadarrInstances, out var r);
            return r == InstanceParseResult.Corrupt;
        }

        private enum InstanceParseResult { ExplicitlyEmpty, Parsed, Corrupt }

        private static List<ArrInstance> TryDeserializeInstances(string? json, out InstanceParseResult result)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                result = InstanceParseResult.ExplicitlyEmpty;
                return new List<ArrInstance>();
            }

            // Note: do NOT short-circuit on `json.StartsWith("[]")` — a value like `[]junk`
            // or `[]\n{...}` is corrupt JSON but would pass that check and silently downgrade
            // to ExplicitlyEmpty, re-enabling the legacy fallback. Always run it through the
            // real parser and classify as Corrupt on any JsonException.

            try
            {
                var instances = JsonSerializer.Deserialize<List<ArrInstance>>(json) ?? new List<ArrInstance>();
                // Drop null entries AND entries with empty URL or API key. System.Text.Json happily
                // accepts `[null]` as a one-element list containing null (verified empirically);
                // without this guard the predicate below dereferences the null and throws NRE,
                // which would bypass this classifier entirely and 500 every caller. If the stored
                // array was itself empty OR every entry got dropped, treat as ExplicitlyEmpty so
                // the legacy SonarrUrl/SonarrApiKey fallback still runs — otherwise an admin with
                // only an invalid row would silently lose the migration path.
                var filtered = instances
                    .Where(i => i != null
                        && !string.IsNullOrWhiteSpace(i.Url)
                        && !string.IsNullOrWhiteSpace(i.ApiKey))
                    .ToList();
                result = filtered.Count == 0 ? InstanceParseResult.ExplicitlyEmpty : InstanceParseResult.Parsed;
                return filtered;
            }
            catch (JsonException)
            {
                result = InstanceParseResult.Corrupt;
                return new List<ArrInstance>();
            }
        }
    }
}
