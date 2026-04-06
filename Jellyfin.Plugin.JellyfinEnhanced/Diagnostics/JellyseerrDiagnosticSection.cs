using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Diagnostics
{
    public class JellyseerrDiagnosticSection : IDiagnosticSection
    {
        public string SectionId => "jellyseerr";

        public string DisplayName => "Jellyseerr";

        public Task<object> CollectAsync()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;

            var result = new
            {
                enabled = config?.JellyseerrEnabled ?? false,
                configured = config != null
                    && !string.IsNullOrWhiteSpace(config.JellyseerrUrls)
                    && !string.IsNullOrWhiteSpace(config.JellyseerrApiKey)
            };

            return Task.FromResult<object>(result);
        }
    }
}
