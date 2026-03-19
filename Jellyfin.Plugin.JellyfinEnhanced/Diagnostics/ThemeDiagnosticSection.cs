using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Diagnostics
{
    public class ThemeDiagnosticSection : IDiagnosticSection
    {
        public string SectionId => "theme";

        public string DisplayName => "Theme & Appearance";

        public Task<object> CollectAsync()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;

            var result = new
            {
                themeSelectorEnabled = config?.ThemeSelectorEnabled ?? false,
                customSplashScreen = config?.EnableCustomSplashScreen ?? false,
                loginImage = config?.EnableLoginImage ?? false,
                coloredRatings = config?.ColoredRatingsEnabled ?? false,
                metadataIcons = config?.MetadataIconsEnabled ?? false,
                iconStyle = config?.IconStyle ?? "emoji"
            };

            return Task.FromResult<object>(result);
        }
    }
}
