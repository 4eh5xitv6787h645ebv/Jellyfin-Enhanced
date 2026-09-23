using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>Jellyfin's plugin discovery entry point; feature composition lives in FeatureRegistration.</summary>
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
            => FeatureRegistration.RegisterServices(serviceCollection);
    }
}
