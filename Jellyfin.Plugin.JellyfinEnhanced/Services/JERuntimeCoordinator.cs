using System;
using System.Collections.Generic;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Central lifecycle coordinator for server-side feature monitors.
    /// Symmetric with the frontend <c>JE.moduleRegistry</c>: each monitor
    /// registers itself with an enable predicate + Initialize/Teardown pair.
    /// When the plugin config changes (<see cref="OnConfigurationChanged"/>),
    /// the coordinator diffs old vs new state and fans out lifecycle calls.
    ///
    /// This makes every server-side feature hot-toggleable without
    /// restarting Jellyfin: admins enable "Auto Movie Request" in the
    /// config page, the coordinator calls <c>Initialize()</c> on the
    /// monitor immediately. When they disable it, <c>Teardown()</c> runs,
    /// unsubscribing the event handlers and clearing caches.
    ///
    /// Also invalidates the controller's static caches (TMDB response
    /// cache, user ID cache, enrichment cache) when their configuration
    /// keys change so stale data from the old config doesn't persist.
    ///
    /// Registered as a singleton in <see cref="PluginServiceRegistrator"/>.
    /// Wired to <see cref="JellyfinEnhanced.ConfigurationChanged"/> in
    /// the plugin constructor via <see cref="OnConfigurationChanged"/>.
    /// </summary>
    public sealed class JERuntimeCoordinator
    {
        private readonly Logger _logger;
        private readonly object _lock = new();
        private readonly List<MonitorRegistration> _registrations = new();

        /// <summary>
        /// Describes a registered monitor's lifecycle contract.
        /// </summary>
        private sealed class MonitorRegistration
        {
            public required string Name { get; init; }
            /// <summary>
            /// Predicate that reads the current config and returns true if
            /// this monitor should be active. Called on every config change
            /// to detect enable/disable transitions.
            /// </summary>
            public required Func<PluginConfiguration, bool> IsEnabled { get; init; }
            /// <summary>
            /// Called when the monitor transitions from disabled → enabled.
            /// Must be idempotent (safe to call twice if already active).
            /// </summary>
            public required Action Initialize { get; init; }
            /// <summary>
            /// Called when the monitor transitions from enabled → disabled.
            /// Should unsubscribe events, clear state, and release resources.
            /// </summary>
            public required Action Teardown { get; init; }
            /// <summary>
            /// Tracks whether this monitor was active at last check, so the
            /// coordinator can detect transitions.
            /// </summary>
            public bool WasActive { get; set; }
        }

        public JERuntimeCoordinator(Logger logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Register a feature monitor with the coordinator. Called once at
        /// DI construction time (or from <see cref="StartupService"/>).
        ///
        /// The monitor should NOT self-initialize — the coordinator will
        /// call <paramref name="initialize"/> during
        /// <see cref="InitializeAll"/> (startup) if the config gate passes,
        /// and again on any config change that transitions the gate from
        /// false → true.
        /// </summary>
        public void Register(
            string name,
            Func<PluginConfiguration, bool> isEnabled,
            Action initialize,
            Action teardown)
        {
            lock (_lock)
            {
                // [Codex P2] Guard against duplicate registration. If
                // StartupService.ExecuteAsync runs more than once (Jellyfin
                // re-runs startup tasks in some scenarios), blindly
                // appending would create duplicate subscriptions that each
                // process events independently. Replace instead of append.
                var existing = _registrations.FindIndex(r => r.Name == name);
                if (existing >= 0)
                {
                    // Tear down the old registration if active, then replace
                    var old = _registrations[existing];
                    if (old.WasActive)
                    {
                        try { old.Teardown(); } catch { /* best-effort */ }
                    }
                    _registrations[existing] = new MonitorRegistration
                    {
                        Name = name,
                        IsEnabled = isEnabled,
                        Initialize = initialize,
                        Teardown = teardown,
                        WasActive = false
                    };
                    _logger.Info($"[RuntimeCoordinator] Replaced monitor: {name}");
                }
                else
                {
                    _registrations.Add(new MonitorRegistration
                    {
                        Name = name,
                        IsEnabled = isEnabled,
                        Initialize = initialize,
                        Teardown = teardown,
                        WasActive = false
                    });
                    _logger.Info($"[RuntimeCoordinator] Registered monitor: {name}");
                }
            }
        }

        /// <summary>
        /// Run the initial enable check on all registered monitors and
        /// initialize those whose config gate passes. Called once from
        /// <see cref="StartupService.ExecuteAsync"/> after all monitors
        /// have been registered.
        /// </summary>
        public void InitializeAll()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                _logger.Warning("[RuntimeCoordinator] Plugin config not available at InitializeAll");
                return;
            }


            lock (_lock)
            {
                foreach (var reg in _registrations)
                {
                    var shouldBeActive = false;
                    try
                    {
                        shouldBeActive = reg.IsEnabled(config);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"[RuntimeCoordinator] IsEnabled check failed for {reg.Name}: {ex.Message}");
                    }

                    if (shouldBeActive)
                    {
                        try
                        {
                            reg.Initialize();
                            reg.WasActive = true;
                            _logger.Info($"[RuntimeCoordinator] Initialized monitor: {reg.Name}");
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"[RuntimeCoordinator] Initialize failed for {reg.Name}: {ex.Message}");
                        }
                    }
                    else
                    {
                        reg.WasActive = false;
                        _logger.Info($"[RuntimeCoordinator] Monitor {reg.Name} is disabled, skipping init");
                    }
                }
            }
        }

        /// <summary>
        /// Called from the <see cref="JellyfinEnhanced.ConfigurationChanged"/>
        /// event handler. Diffs old vs new config and calls
        /// Initialize/Teardown on each monitor whose gate changed.
        ///
        /// Also invalidates the controller's static caches so stale data
        /// from the old config doesn't persist.
        /// </summary>
        public void OnConfigurationChanged()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null) return;

            // NOTE: InvalidateConfigHash is called by JellyfinEnhanced.cs's
            // ConfigurationChanged handler BEFORE this method runs — do NOT
            // duplicate it here. The coordinator does NOT own hash invalidation;
            // it owns monitor lifecycle + cache clearing only.

            // Clear the controller's static caches. These are keyed by
            // Jellyseerr URLs, TMDB keys, etc. — if any of those changed,
            // the old cache entries are stale. Rather than diff individual
            // keys, we clear on every config change. The caches are
            // self-warming (populated on next request), so the only cost is
            // one cache miss per endpoint.
            Controllers.JellyfinEnhancedController.ClearResponseCaches();

            lock (_lock)
            {
                foreach (var reg in _registrations)
                {
                    var shouldBeActive = false;
                    try
                    {
                        shouldBeActive = reg.IsEnabled(config);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"[RuntimeCoordinator] IsEnabled check failed for {reg.Name}: {ex.Message}");
                        continue;
                    }

                    if (!reg.WasActive && shouldBeActive)
                    {
                        // disabled → enabled
                        try
                        {
                            reg.Initialize();
                            reg.WasActive = true;
                            _logger.Info($"[RuntimeCoordinator] Hot-enabled monitor: {reg.Name}");
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"[RuntimeCoordinator] Hot-enable failed for {reg.Name}: {ex.Message}");
                        }
                    }
                    else if (reg.WasActive && !shouldBeActive)
                    {
                        // enabled → disabled
                        try
                        {
                            reg.Teardown();
                            reg.WasActive = false;
                            _logger.Info($"[RuntimeCoordinator] Hot-disabled monitor: {reg.Name}");
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"[RuntimeCoordinator] Hot-disable failed for {reg.Name}: {ex.Message}");
                            reg.WasActive = false;
                        }
                    }
                    // If wasActive == shouldBeActive (no transition), do nothing.
                    // The monitor is already in the correct state.
                }
            }

        }

        /// <summary>
        /// Tear down all active monitors. Called during plugin uninstall
        /// or server shutdown.
        /// </summary>
        public void TeardownAll()
        {
            lock (_lock)
            {
                foreach (var reg in _registrations)
                {
                    if (reg.WasActive)
                    {
                        try
                        {
                            reg.Teardown();
                            reg.WasActive = false;
                            _logger.Info($"[RuntimeCoordinator] Torn down monitor: {reg.Name}");
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"[RuntimeCoordinator] Teardown failed for {reg.Name}: {ex.Message}");
                        }
                    }
                }
            }
        }
    }
}
