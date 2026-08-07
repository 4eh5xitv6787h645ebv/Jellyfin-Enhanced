using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Process-wide source of the identities and policy consumed by already-open
    /// Jellyfin Enhanced clients (browser tabs, app WebViews) so they can decide
    /// whether the page they are running is stale.
    ///
    /// Three independent identities are published, each answering a different
    /// "did the thing that produced my page change?" question:
    ///   • <c>BuildId</c>            — content hash of THIS plugin DLL. Stable across
    ///                                 restarts for the same binary, so it detects a
    ///                                 plugin update even when the version string is
    ///                                 unchanged (dev builds, hotfix re-uploads).
    ///   • <c>JellyfinGeneration</c> — deliberately changes on EVERY server process, so
    ///                                 a same-version Jellyfin replacement/restart is
    ///                                 still seen as "the server that served your page
    ///                                 is gone".
    ///   • <c>ConfigurationRevision</c> — bumps when the admin saves plugin config.
    ///
    /// Deliberately NOT ported from Canopy: the websocket push lane
    /// (LiveSessionRegistry / LiveNotifierService) and the legacy "_je" heartbeat.
    /// Clients poll <c>/JellyfinEnhanced/client-refresh-state</c> on an admin-tunable
    /// interval, which covers config changes, plugin updates and server restarts with
    /// far less moving machinery and no per-session server-side state.
    /// </summary>
    public sealed class ClientRefreshStateService
    {
        private readonly string _serverId;
        private readonly string _jellyfinGeneration;

        // Configuration-identity tracking. Jellyfin's plugin base class REPLACES the
        // Configuration object on every admin save rather than mutating it, so object
        // identity (not value equality) is a reliable, allocation-free change signal.
        // Guarded by a lock because GetState() is called concurrently from request
        // threads and the read-compare-swap below must be atomic as a whole.
        private readonly object _revisionLock = new object();
        private PluginConfiguration? _lastObservedConfiguration;
        private bool _hasObservedConfiguration;
        private long _configurationRevision;

        // Explicit admin "refresh everyone now" signal. Process-local on purpose: a
        // restart already changes JellyfinGeneration, so persisting it would only add
        // a config write on a path that is already covered.
        private long _forceRevision;

        /// <param name="serverId">Jellyfin's stable installation id (IServerApplicationHost.SystemId).</param>
        /// <param name="jellyfinVersion">Host version string; only ever hashed, never echoed.</param>
        public ClientRefreshStateService(string serverId, string jellyfinVersion)
        {
            _serverId = serverId ?? string.Empty;
            // One nonce per process — this is what makes the generation change on every
            // server start even when the Jellyfin version is identical.
            _jellyfinGeneration = CreateJellyfinGeneration(jellyfinVersion, Guid.NewGuid().ToString("N"));
        }

        /// <summary>
        /// Builds one snapshot of the current identities + policy. Cheap enough to run
        /// per request; nothing here is cached because a stale snapshot would defeat
        /// the entire point of the endpoint.
        /// </summary>
        public ClientRefreshState GetState()
        {
            var (config, revision) = ObserveConfiguration();

            // A null configuration means the plugin singleton isn't ready (very early
            // startup, or a failed load). Fail SAFE: report the Disabled policy so
            // clients never reload based on a half-initialised server.
            var policy = config == null
                ? ClientRefreshPolicy.Disabled
                : new ClientRefreshPolicy(
                    NormalizeMode(config.ClientRefreshMode),
                    config.ClientRefreshOnPluginUpdate,
                    config.ClientRefreshOnJellyfinUpdate,
                    config.ClientRefreshOnConfigChange,
                    config.ClientRefreshShowNotices,
                    // Re-clamp server-side: the admin page clamps too, but config can
                    // also be edited by hand in XML or written by an older build.
                    Math.Clamp(config.ClientRefreshPollSeconds, MinPollSeconds, MaxPollSeconds),
                    Math.Clamp(config.ClientRefreshIdleSeconds, MinIdleSeconds, MaxIdleSeconds));

            return new ClientRefreshState(
                SchemaVersion: 1,
                ServerId: _serverId,
                BuildId: JellyfinEnhanced.PluginBuildId,
                JellyfinGeneration: _jellyfinGeneration,
                ConfigurationRevision: revision,
                ForceRevision: Interlocked.Read(ref _forceRevision),
                Policy: policy);
        }

        /// <summary>
        /// Bumps the explicit admin refresh signal and returns the new value. Clients
        /// compare it against the value they booted with; any increase is a request to
        /// refresh at their next safe moment.
        /// </summary>
        public long RequestRefresh() => Interlocked.Increment(ref _forceRevision);

        // Poll/idle bounds. Kept as named constants because they are duplicated in the
        // admin page's client-side clamp and referenced in its field descriptions.
        internal const int MinPollSeconds = 5;
        internal const int MaxPollSeconds = 3600;
        internal const int MinIdleSeconds = 0;
        internal const int MaxIdleSeconds = 300;

        /// <summary>
        /// Live view over the plugin configuration plus a monotonic revision counter.
        /// Modelled on Canopy's PluginConfigProvider, inlined here because JE has no
        /// config-provider abstraction and this is its only consumer. Reads
        /// <c>JellyfinEnhanced.Instance</c> on every call — never snapshotted — so an
        /// admin save is visible immediately.
        /// </summary>
        private (PluginConfiguration? Configuration, long Revision) ObserveConfiguration()
        {
            var configuration = JellyfinEnhanced.Instance?.Configuration;

            lock (_revisionLock)
            {
                // First observation seeds the counter at 1 (clients treat 0 as "unknown"),
                // and every later object-identity change bumps it. Monotonic by
                // construction — it only ever increments.
                if (!_hasObservedConfiguration
                    || !ReferenceEquals(_lastObservedConfiguration, configuration))
                {
                    _lastObservedConfiguration = configuration;
                    _hasObservedConfiguration = true;
                    _configurationRevision++;
                }

                return (configuration, _configurationRevision);
            }
        }

        /// <summary>
        /// Maps a stored mode string onto the exact four values the client understands.
        /// Case- and whitespace-insensitive on input; anything unrecognised (including
        /// null, empty or a value written by a future build) falls back to Disabled so
        /// an unparseable setting can never cause surprise reloads.
        /// </summary>
        internal static string NormalizeMode(string? value)
            => value?.Trim().ToLowerInvariant() switch
            {
                "smart" => "Smart",
                "homeonly" => "HomeOnly",
                "notify" => "Notify",
                "disabled" => "Disabled",
                _ => "Disabled",
            };

        /// <summary>
        /// Lower-hex SHA-256 of "version\nnonce". Hashing (rather than publishing the
        /// raw version) keeps the payload opaque — the client only needs to know
        /// whether the value differs from the one it booted with.
        /// </summary>
        internal static string CreateJellyfinGeneration(string? version, string processNonce)
        {
            var material = $"{(string.IsNullOrWhiteSpace(version) ? "unknown" : version)}\n{processNonce}";
            return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material))).ToLowerInvariant();
        }
    }

    /// <summary>
    /// Wire contract returned by the state and bootstrap endpoints. Property names are
    /// serialized verbatim (PascalCase) — the client matches on them, so renaming any
    /// member here is a breaking change and must come with a SchemaVersion bump.
    /// </summary>
    public sealed record ClientRefreshState(
        int SchemaVersion,
        string ServerId,
        string BuildId,
        string JellyfinGeneration,
        long ConfigurationRevision,
        long ForceRevision,
        ClientRefreshPolicy Policy);

    /// <summary>Admin-controlled behaviour half of <see cref="ClientRefreshState"/>.</summary>
    public sealed record ClientRefreshPolicy(
        string Mode,
        bool OnPluginUpdate,
        bool OnJellyfinUpdate,
        bool OnConfigChange,
        bool ShowNotices,
        int PollSeconds,
        int IdleSeconds)
    {
        /// <summary>Fail-safe policy used when no configuration is available.</summary>
        public static ClientRefreshPolicy Disabled { get; } =
            new ClientRefreshPolicy("Disabled", false, false, false, true, 30, 5);
    }
}
