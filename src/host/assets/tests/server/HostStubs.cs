// Only host wiring is stubbed. HTTP, disk, hashing and JSON use real implementations.
namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public sealed class Logger
    {
        public void Warning(string message) { }
        public void Debug(string message) { }
        public void Info(string message) { }
    }
}

namespace MediaBrowser.Common.Configuration
{
    public interface IApplicationPaths
    {
        string PluginsPath { get; }
    }
}

namespace System.Net.Http
{
    public interface IHttpClientFactory
    {
        HttpClient CreateClient(string name = "");
    }
}
