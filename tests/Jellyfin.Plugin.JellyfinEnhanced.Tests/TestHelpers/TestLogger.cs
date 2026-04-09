using System;
using System.IO;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.TestHelpers
{
    /// <summary>
    /// Builds a minimal <see cref="Logger"/> instance for unit tests without
    /// pulling in a real Jellyfin host. Uses a per-test temp directory for
    /// log output so the test suite is fully hermetic — no shared log files
    /// on disk, no cross-test interference.
    ///
    /// Call <see cref="Create"/> in every test that needs a Logger, and
    /// dispose the returned <see cref="IDisposable"/> wrapper if you want
    /// the temp log dir cleaned up immediately. Otherwise it's cleaned up
    /// when the OS tempdir is garbage-collected.
    /// </summary>
    internal static class TestLogger
    {
        /// <summary>
        /// Construct a Logger backed by a fresh per-call temp directory and
        /// the NullLoggerFactory (so log lines go nowhere visible).
        /// </summary>
        public static Logger Create()
        {
            var paths = new TempAppPaths();
            return new Logger(paths, NullLoggerFactory.Instance);
        }

        /// <summary>
        /// Minimal <see cref="IApplicationPaths"/> stub. Only LogDirectoryPath
        /// is read by <see cref="Logger"/>; the rest default to the same
        /// temp dir (rather than throwing) so future Logger internals can
        /// touch them without breaking the tests. The temp dir is a fresh
        /// per-instance directory, so tests are hermetic.
        /// </summary>
        private sealed class TempAppPaths : IApplicationPaths
        {
            private readonly string _root;

            public TempAppPaths()
            {
                _root = Path.Combine(Path.GetTempPath(), "je-test-" + Guid.NewGuid().ToString("N").Substring(0, 8));
                Directory.CreateDirectory(_root);
            }

            public string LogDirectoryPath => _root;
            public string ProgramDataPath => _root;
            public string WebPath => _root;
            public string ProgramSystemPath => _root;
            public string DataPath => _root;
            public string ImageCachePath => _root;
            public string PluginsPath => _root;
            public string PluginConfigurationsPath => _root;
            public string ConfigurationDirectoryPath => _root;
            public string SystemConfigurationFilePath => Path.Combine(_root, "system.xml");
            public string CachePath { get => _root; set { /* ignored — test stub */ } }
            public string TempDirectory => _root;
            public string VirtualDataPath => _root;
            public string TrickplayPath => _root;
            public string BackupPath => _root;

            public void MakeSanityCheckOrThrow() { /* no-op */ }
            public void CreateAndCheckMarker(string appId, string dirPath, bool recursive = false) { /* no-op */ }
        }
    }
}
