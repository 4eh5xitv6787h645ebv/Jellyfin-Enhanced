using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Computes a stable content hash for the plugin's embedded assets so the
    /// frontend can use it as a cache-busting fingerprint on script and locale
    /// URLs. Hash is derived once (lazily) and cached for the lifetime of the
    /// process — the only way it changes is a plugin reload/upgrade, which
    /// replaces the assembly and thus creates a fresh provider instance.
    ///
    /// Strategy:
    ///   1. Try SHA-256 of the plugin DLL file contents (authoritative:
    ///      any real code change produces a new hash).
    ///   2. Fall back to SHA-256 of (AssemblyName|Version|FileSize|LastWriteUtc)
    ///      if file access fails (unusual, but defensive — the plugin directory
    ///      is normally readable by the Jellyfin process).
    ///   3. Final fallback: the informational version string.
    ///
    /// The resulting hash is a lowercase hex string truncated to 16 chars — long
    /// enough to be unique across realistic plugin versions, short enough to
    /// keep the generated script URLs compact.
    ///
    /// Registered as a singleton in PluginServiceRegistrator so every caller
    /// gets the same instance and the hash is computed at most once.
    /// </summary>
    public sealed class AssetHashProvider
    {
        private readonly Logger _logger;
        private readonly Lazy<string> _hash;

        public AssetHashProvider(Logger logger)
        {
            _logger = logger;
            _hash = new Lazy<string>(Compute, System.Threading.LazyThreadSafetyMode.ExecutionAndPublication);
        }

        /// <summary>
        /// Stable content hash of the current plugin assembly. Computed once,
        /// thread-safe via Lazy&lt;T&gt;.
        /// </summary>
        public string Hash => _hash.Value;

        private string Compute()
        {
            // Prefer the hash already computed by JellyfinEnhanced.cs at plugin
            // construction. That keeps the injected <script src="...?v=X">
            // and the /asset-hash endpoint guaranteed in lockstep without
            // two independent SHA-256 reads of the same DLL. The plugin
            // class always runs its ctor before any controller action can
            // fire, so ComputedAssetHash is populated by the time this
            // Lazy<> first evaluates.
            var precomputed = JellyfinEnhanced.ComputedAssetHash;
            if (!string.IsNullOrWhiteSpace(precomputed) && precomputed != "bootstrap")
            {
                return precomputed;
            }

            // Defensive fallback: recompute from the DLL in case this
            // service is constructed before the plugin ctor finishes (should
            // not happen given the DI lifecycle, but belt-and-braces).
            try
            {
                var assemblyPath = typeof(AssetHashProvider).Assembly.Location;
                if (!string.IsNullOrWhiteSpace(assemblyPath) && File.Exists(assemblyPath))
                {
                    using var stream = File.OpenRead(assemblyPath);
                    using var sha = SHA256.Create();
                    var bytes = sha.ComputeHash(stream);
                    return Convert.ToHexString(bytes).ToLowerInvariant().Substring(0, 16);
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"AssetHashProvider: DLL read failed, falling back to version string: {ex.Message}");
            }

            return (typeof(AssetHashProvider).Assembly.GetName().Version?.ToString() ?? "unknown").Replace('.', '-');
        }
    }
}
