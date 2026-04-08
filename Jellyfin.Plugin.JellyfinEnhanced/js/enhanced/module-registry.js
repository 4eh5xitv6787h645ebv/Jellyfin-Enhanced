// /js/enhanced/module-registry.js
// Module lifecycle registry. Modules register with config keys they depend on.
// When the ConfigStore detects changes, the registry calls init/teardown
// on affected modules automatically.
(function(JE) {
    'use strict';

    var modules = new Map();
    var handlingChange = false; // reentrancy guard
    // [H6] Reentrant config-change events are queued instead of dropped.
    // If handleConfigChange is called while another call is in flight, the
    // new event is appended here and processed immediately after the current
    // one finishes — so no change is ever silently lost.
    var pendingEvents = [];

    /**
     * Register a module with the lifecycle system.
     * @param {string} name - Unique module name
     * @param {object} descriptor
     * @param {string[]} descriptor.configKeys - Config property names this module depends on.
     *   Both pluginConfig keys (PascalCase) and currentSettings keys (camelCase) are supported.
     * @param {string} [descriptor.enableKey] - The primary boolean key that enables/disables
     *   this module. Must reference a boolean config property. If omitted, the first entry
     *   in configKeys is used.
     * @param {Function} descriptor.init - Called when the module should activate.
     * @param {Function} [descriptor.teardown] - Called when the module should deactivate.
     *   If absent, the module cannot be disabled without a page reload.
     * @param {Function} [descriptor.onConfigChange] - Called when a non-enable config key
     *   changes. Receives { changedKeys, oldConfig, newConfig }. If absent, a full
     *   teardown+init cycle is used for non-boolean config changes.
     */
    function register(name, descriptor) {
        // [H8] Teardown old module before replacing to prevent resource leaks
        if (modules.has(name)) {
            console.warn('🪼 Jellyfin Enhanced: ModuleRegistry: Replacing module: ' + name);
            var old = modules.get(name);
            if (old.initialized && old.teardown) {
                try {
                    old.teardown();
                } catch (e) {
                    console.error('🪼 Jellyfin Enhanced: ModuleRegistry: Teardown error during replacement of ' + name, e);
                }
            }
        }
        modules.set(name, {
            configKeys: descriptor.configKeys || [],
            enableKey: descriptor.enableKey || (descriptor.configKeys && descriptor.configKeys[0]) || null,
            init: descriptor.init,
            teardown: descriptor.teardown || null,
            onConfigChange: descriptor.onConfigChange || null,
            initialized: false
        });
    }

    /**
     * Unregister a module.
     * @param {string} name
     */
    function unregister(name) {
        var mod = modules.get(name);
        if (mod && mod.initialized && mod.teardown) {
            try { mod.teardown(); } catch (e) {
                console.error('🪼 Jellyfin Enhanced: ModuleRegistry: Teardown error for ' + name, e);
            }
        }
        modules.delete(name);
    }

    /**
     * Get a registered module descriptor.
     * @param {string} name
     * @returns {object|undefined}
     */
    function getModule(name) {
        return modules.get(name);
    }

    // [H9] Removed dead `resolveConfigValue` function (was never used)

    /**
     * Handle a config change event from ConfigStore.
     * Called with the set of changed keys and old/new config snapshots.
     *
     * [H6] Accepts oldSettings to symmetrically resolve camelCase keys.
     * [M5] Guarded against reentrancy.
     *
     * @param {string[]} changedKeys
     * @param {object} oldConfig
     * @param {object} newConfig
     * @param {object} [oldSettings] - Previous JE.currentSettings snapshot
     */
    function handleConfigChange(changedKeys, oldConfig, newConfig, oldSettings) {
        // [H6] Queue reentrant events instead of dropping them. A module's
        // init/teardown/onConfigChange callback that triggers another reactive
        // reload (directly or via broadcastChange bouncing back) used to lose
        // the second update permanently; now it gets drained below.
        if (handlingChange) {
            pendingEvents.push({
                changedKeys: changedKeys.slice(),
                oldConfig: oldConfig,
                newConfig: newConfig,
                oldSettings: oldSettings
            });
            return [];
        }
        handlingChange = true;
        var needsRefresh = [];

        try {
            var changedSet = new Set(changedKeys);

            // Snapshot module list to prevent mutation during iteration
            var snapshot = [];
            modules.forEach(function(mod, name) { snapshot.push([name, mod]); });

            snapshot.forEach(function(entry) {
                var name = entry[0];
                var mod = entry[1];

                // Check if any of this module's config keys changed
                var affected = mod.configKeys.some(function(k) { return changedSet.has(k); });
                if (!affected) return;

                var enableKey = mod.enableKey;
                var wasEnabled = enableKey ? !!resolveOldValue(enableKey, oldConfig, oldSettings) : true;
                var nowEnabled = enableKey ? !!resolveNewValue(enableKey, newConfig) : true;

                if (!wasEnabled && nowEnabled) {
                    if (mod.init) {
                        try {
                            mod.init();
                            mod.initialized = true;
                            console.log('🪼 Jellyfin Enhanced: ModuleRegistry: Initialized ' + name);
                        } catch (e) {
                            console.error('🪼 Jellyfin Enhanced: ModuleRegistry: Init error for ' + name, e);
                        }
                    }
                } else if (wasEnabled && !nowEnabled) {
                    if (mod.teardown) {
                        try {
                            mod.teardown();
                            mod.initialized = false;
                            console.log('🪼 Jellyfin Enhanced: ModuleRegistry: Tore down ' + name);
                        } catch (e) {
                            console.error('🪼 Jellyfin Enhanced: ModuleRegistry: Teardown error for ' + name, e);
                            mod.initialized = false;
                        }
                    } else {
                        needsRefresh.push(name);
                    }
                } else if (wasEnabled && nowEnabled) {
                    if (mod.onConfigChange) {
                        try {
                            mod.onConfigChange({ changedKeys: changedKeys, oldConfig: oldConfig, newConfig: newConfig });
                        } catch (e) {
                            console.error('🪼 Jellyfin Enhanced: ModuleRegistry: onConfigChange error for ' + name, e);
                        }
                    } else if (mod.teardown && mod.init) {
                        try {
                            mod.teardown();
                            mod.initialized = false;
                        } catch (e) {
                            console.error('🪼 Jellyfin Enhanced: ModuleRegistry: Teardown error during re-init of ' + name, e);
                            mod.initialized = false;
                        }
                        try {
                            mod.init();
                            mod.initialized = true;
                            console.log('🪼 Jellyfin Enhanced: ModuleRegistry: Re-initialized ' + name);
                        } catch (e) {
                            console.error('🪼 Jellyfin Enhanced: ModuleRegistry: Init error during re-init of ' + name, e);
                        }
                    }
                }
            });
        } finally {
            handlingChange = false;
        }

        // [H6] Drain any events that arrived while we were processing.
        // Defer via microtask so stack depth stays bounded and the caller's
        // `needsRefresh` return value is observed before recursion.
        if (pendingEvents.length > 0) {
            Promise.resolve().then(function() {
                while (pendingEvents.length > 0) {
                    var next = pendingEvents.shift();
                    try {
                        handleConfigChange(next.changedKeys, next.oldConfig, next.newConfig, next.oldSettings);
                    } catch (e) {
                        console.error('🪼 Jellyfin Enhanced: ModuleRegistry: queued change failed', e);
                    }
                }
            });
        }

        return needsRefresh;
    }

    /**
     * Resolve a value from the old config state.
     * [H6] Now checks oldSettings for camelCase keys, symmetric with resolveNewValue.
     */
    function resolveOldValue(key, oldConfig, oldSettings) {
        if (oldConfig && Object.prototype.hasOwnProperty.call(oldConfig, key)) return oldConfig[key];
        if (oldSettings && Object.prototype.hasOwnProperty.call(oldSettings, key)) return oldSettings[key];
        return undefined;
    }

    /**
     * Resolve a value from the new config state.
     */
    function resolveNewValue(key, newConfig) {
        if (newConfig && Object.prototype.hasOwnProperty.call(newConfig, key)) return newConfig[key];
        if (JE.currentSettings && Object.prototype.hasOwnProperty.call(JE.currentSettings, key)) return JE.currentSettings[key];
        return undefined;
    }

    /**
     * Mark a module as initialized (called by plugin.js after Stage 6 init).
     * @param {string} name
     */
    function markInitialized(name) {
        var mod = modules.get(name);
        if (mod) mod.initialized = true;
    }

    /**
     * Mark all registered modules as initialized.
     * Called once after all modules have completed their initial init() in plugin.js.
     * [H10] Ensures unregister() will call teardown for all active modules.
     */
    function markAllInitialized() {
        modules.forEach(function(mod) {
            mod.initialized = true;
        });
    }

    // Export
    JE.moduleRegistry = {
        register: register,
        unregister: unregister,
        getModule: getModule,
        handleConfigChange: handleConfigChange,
        markInitialized: markInitialized,
        markAllInitialized: markAllInitialized
    };

})(window.JellyfinEnhanced);
