using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Diagnostics
{
    public class ArrDiagnosticSection : IDiagnosticSection
    {
        public string SectionId => "arr";

        public string DisplayName => "Arr Integration";

        public Task<object> CollectAsync()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;

            var result = new
            {
                sonarrConfigured = config != null && !string.IsNullOrWhiteSpace(config.SonarrUrl),
                radarrConfigured = config != null && !string.IsNullOrWhiteSpace(config.RadarrUrl),
                bazarrConfigured = config != null && !string.IsNullOrWhiteSpace(config.BazarrUrl),
                arrLinksEnabled = config?.ArrLinksEnabled ?? false,
                arrTagsSyncEnabled = config?.ArrTagsSyncEnabled ?? false
            };

            return Task.FromResult<object>(result);
        }
    }
}
