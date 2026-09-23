using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    /// <summary>
    /// Stable Jellyfin XML/JSON configuration contract. Properties and defaults
    /// are maintained alongside their owning features; names and CLR types remain
    /// flat for existing installations and clients.
    /// </summary>
    public partial class PluginConfiguration : BasePluginConfiguration
    {
    }
}
