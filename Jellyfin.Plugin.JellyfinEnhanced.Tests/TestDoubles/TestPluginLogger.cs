using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.TestDoubles
{
    internal static class TestPluginLogger
    {
        private static readonly string LogDirectory = CreateLogDirectory();

        internal static Logger Create()
        {
            var applicationPaths = InterfaceProxy.Create<IApplicationPaths>((method, _) =>
                method.Name == $"get_{nameof(IApplicationPaths.LogDirectoryPath)}"
                    ? LogDirectory
                    : InterfaceProxy.DefaultValue(method.ReturnType));
            return new Logger(applicationPaths, NullLoggerFactory.Instance);
        }

        private static string CreateLogDirectory()
        {
            var path = Path.Combine(Path.GetTempPath(), "JellyfinEnhanced.Tests", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            return path;
        }
    }
}
