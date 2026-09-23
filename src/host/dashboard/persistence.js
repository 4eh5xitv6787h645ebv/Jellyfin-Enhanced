/** Coordinate dashboard reads and writes without sharing feature form state. */
function createDashboardPersistence({
    lifecycle,
    normalizeLoadedSettings,
    loadFeatureSettings,
    normalizeReadSettings,
    readFeatureSettings,
    restoreCustomTabOwnership,
    applyCustomTabOwnership,
    applyMaintenanceMode,
    pluginId,
    jeMarkSaved,
    checkInstalledPlugins,
    updateRequestsRequirementsBanner,
    runCustomTabsSync,
    updateAllDependencies,
}) {
    let loadGeneration = 0;
    let savedSnapshotTimer;
    let mutationInFlight = false;
    let loadingVisible = false;
    let saveButtonStates;

    function restoreSaveButtons() {
        if (!saveButtonStates) return;
        saveButtonStates.forEach(({ button, disabled }) => {
            button.disabled = disabled;
        });
        saveButtonStates = undefined;
    }

    function invalidateLoads() {
        loadGeneration++;
        lifecycle.clearTimeout(savedSnapshotTimer);
        savedSnapshotTimer = undefined;
    }

    function showLoading() {
        Dashboard.showLoadingMsg();
        loadingVisible = true;
    }

    function hideLoading() {
        if (!loadingVisible) return;
        loadingVisible = false;
        Dashboard.hideLoadingMsg();
    }

    function alert(message) {
        if (lifecycle.disposed) return;
        try {
            Dashboard.alert(message);
        } catch (error) {
            console.warn('[JE] Dashboard.alert threw:', error);
        }
    }

    async function loadConfig() {
        if (lifecycle.disposed || mutationInFlight) return false;
        invalidateLoads();
        const generation = loadGeneration;
        const isCurrent = () => !lifecycle.disposed && generation === loadGeneration;
        try {
            showLoading();
            checkInstalledPlugins();
            const config = await ApiClient.getPluginConfiguration(pluginId);
            // Jellyfin can retain a page, or replace it while this request is pending.
            // An older response must never populate the replacement page's controls.
            if (!isCurrent()) return false;
            restoreCustomTabOwnership(config);
            loadFeatureSettings(config);
            normalizeLoadedSettings(config);
            updateAllDependencies();
            updateRequestsRequirementsBanner();

            // Late feature populations retain their existing settling interval. A
            // newer load, save, or disposal invalidates this delayed dirty snapshot.
            savedSnapshotTimer = lifecycle.setTimeout(() => {
                if (isCurrent() && !mutationInFlight) jeMarkSaved();
            }, 500);
            return true;
        } catch (error) {
            if (isCurrent()) {
                console.error('[JE] loadConfig failed:', error);
                alert({
                    title: 'Load failed',
                    message:
                        'Could not load Jellyfin Enhanced settings. Check the browser console and server logs, then reopen this page to try again.',
                });
            }
            return false;
        } finally {
            // A stale request does not own the newer operation's loading indicator.
            if (isCurrent()) hideLoading();
        }
    }

    async function buildConfigFromForm() {
        const config = await ApiClient.getPluginConfiguration(pluginId);
        if (lifecycle.disposed) throw new Error('Dashboard disposed before form settings could be read.');
        // Start from the latest server copy to preserve settings unknown to this UI.
        readFeatureSettings(config);
        normalizeReadSettings(config);
        applyCustomTabOwnership(config);
        return config;
    }

    async function persistConfiguration(applyToAllUsers) {
        if (lifecycle.disposed || mutationInFlight) return false;
        mutationInFlight = true;
        invalidateLoads();
        const saveButtons = document.querySelectorAll('.je-save-dock-btn');
        saveButtonStates = Array.from(saveButtons, (button) => ({ button, disabled: button.disabled }));
        try {
            saveButtons.forEach((button) => {
                button.disabled = true;
            });
            showLoading();
            const config = await buildConfigFromForm();
            if (lifecycle.disposed) return false;
            const result = await ApiClient.updatePluginConfiguration(pluginId, config);
            if (applyToAllUsers && !lifecycle.disposed) jeMarkSaved();

            // Once a write has started, finish its server-side ownership and mode
            // changes even if the page closes. Only completion UI is page-scoped.
            const syncResult = await runCustomTabsSync(config);
            if (applyToAllUsers) {
                await ApiClient.ajax({
                    type: 'POST',
                    url: ApiClient.getUrl('/JellyfinEnhanced/reset-all-users-settings'),
                    dataType: 'json',
                });
                let message =
                    'Configuration saved and applied to all users successfully!\n\nSettings will take effect after users refresh their browsers.';
                if (syncResult && syncResult.ok === false) {
                    message += '\n\n(Custom Tabs sync did not complete: ' + (syncResult.detail || 'see console') + ')';
                }
                alert({ title: 'Success', message });
            } else {
                await applyMaintenanceMode(config);
                if (!lifecycle.disposed) {
                    Dashboard.processPluginConfigurationUpdateResult(result);
                    jeMarkSaved();
                }
                if (syncResult && syncResult.ok === false) {
                    alert({
                        title: 'Custom Tabs sync issue',
                        message:
                            'Your Jellyfin Enhanced settings were saved, but the Custom Tabs entry could not be updated.\n\n' +
                            (syncResult.detail || 'See browser console for details.'),
                    });
                }
            }
            return true;
        } catch (error) {
            console.error('[JE] Configuration persistence failed:', error);
            alert(
                applyToAllUsers
                    ? {
                          title: 'Error',
                          message: 'Failed to save and apply settings to all users. Check server logs for details.',
                      }
                    : {
                          title: 'Save failed',
                          message:
                              'Could not save Jellyfin Enhanced settings. Check the browser console and server logs, then try again.',
                      },
            );
        } finally {
            mutationInFlight = false;
            if (!lifecycle.disposed) {
                restoreSaveButtons();
                hideLoading();
            }
        }
        return false;
    }

    async function saveConfig(event) {
        event.preventDefault();
        await persistConfiguration(false);
        return false;
    }

    // Mutations that require saved credentials need a transaction result, rather
    // than the form submit handler's always-false event contract.
    function saveBeforeImport() {
        return persistConfiguration(false);
    }

    async function resetAllUserSettings() {
        if (lifecycle.disposed || mutationInFlight) return false;
        if (
            !confirm(
                "Are you sure?\n\nThis saves the current configuration, then copies these Display/Playback/etc. values into every user's Enhanced Panel settings, replacing anything they've customized for themselves. This cannot be undone per-user; each user would have to re-apply their own preferences afterward.",
            )
        ) {
            return false;
        }
        await persistConfiguration(true);
        return false;
    }

    function dispose() {
        invalidateLoads();
        restoreSaveButtons();
        hideLoading();
        lifecycle.dispose();
    }

    return { loadConfig, saveConfig, saveBeforeImport, resetAllUserSettings, buildConfigFromForm, dispose };
}
