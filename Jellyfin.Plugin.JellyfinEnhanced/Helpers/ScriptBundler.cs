using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers
{
    /// <summary>
    /// Concatenates every client JS module (order defined by js/load-order.json)
    /// into one bundle served from /JellyfinEnhanced/script. A single immutable-
    /// cached request replaces ~57 parallel script fetches that previously
    /// competed for the browser's HTTP/1.1 connection pool and executed in
    /// nondeterministic completion order.
    ///
    /// Embedded resources cannot change without a DLL swap and process restart,
    /// so the bundle is built once per process lifetime.
    /// </summary>
    public static class ScriptBundler
    {
        private static readonly object BuildLock = new object();
        private static string? _bundle;

        /// <summary>
        /// Returns the bundled script, building it on first use.
        /// Throws if the load order resource itself is unavailable so the caller
        /// can fall back to serving the unbundled entrypoint.
        /// </summary>
        public static string GetBundle(Logger logger)
        {
            if (_bundle != null)
            {
                return _bundle;
            }

            lock (BuildLock)
            {
                _bundle ??= Build(logger);
                return _bundle;
            }
        }

        private static string Build(Logger logger)
        {
            var assembly = Assembly.GetExecutingAssembly();
            var order = ReadLoadOrder(assembly);
            var sb = new StringBuilder(2 * 1024 * 1024);
            sb.Append("window.__JE_BUNDLED = true;\n");

            var missing = new List<string>();
            foreach (var path in order)
            {
                var resourceName = "Jellyfin.Plugin.JellyfinEnhanced." + path.Replace('/', '.');
                using var stream = assembly.GetManifestResourceStream(resourceName);
                if (stream == null)
                {
                    missing.Add(path);
                    continue;
                }

                using var reader = new StreamReader(stream);
                sb.Append("\n;/* ── ").Append(path).Append(" ── */\n");
                sb.Append(reader.ReadToEnd());
            }

            if (missing.Count > 0)
            {
                logger.Error($"Script bundle: {missing.Count} resource(s) listed in js/load-order.json are missing from the assembly and were skipped: {string.Join(", ", missing)}");
            }

            logger.Info($"Script bundle built: {order.Count - missing.Count} modules, {sb.Length / 1024} KiB.");
            return sb.ToString();
        }

        private static List<string> ReadLoadOrder(Assembly assembly)
        {
            using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.JellyfinEnhanced.js.load-order.json")
                ?? throw new InvalidOperationException("Embedded resource js/load-order.json not found.");
            using var reader = new StreamReader(stream);
            using var doc = JsonDocument.Parse(reader.ReadToEnd());
            var order = new List<string>();
            foreach (var element in doc.RootElement.GetProperty("order").EnumerateArray())
            {
                var value = element.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    order.Add(value);
                }
            }

            if (order.Count == 0 || order[0] != "js/plugin.js")
            {
                throw new InvalidOperationException("js/load-order.json must start with js/plugin.js.");
            }

            return order;
        }
    }
}
