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
    let snapshotGeneration = 0;
    // Set once feature controls reflect a saved configuration. Until then the form
    // holds markup defaults, and persisting it would overwrite every saved setting.
    let hydrated = false;
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
        snapshotGeneration++;
        clearSavedSnapshotTimer();
    }

    function clearSavedSnapshotTimer() {
        lifecycle.clearTimeout(savedSnapshotTimer);
        savedSnapshotTimer = undefined;
    }

    // The clean baseline is taken as soon as the form is hydrated, so a save that
    // starts (and possibly fails) right away still has a dirty-indicator baseline of
    // saved values. Late feature populations retain their existing settling
    // interval: the baseline is refreshed after 500 ms unless a newer load or
    // disposal superseded it. Starting a write cancels the refresh: a successful
    // write marks saved itself, and a form edited around a failed write must stay
    // dirty rather than become the baseline.
    function markLoadedBaseline() {
        jeMarkSaved();
        clearSavedSnapshotTimer();
        const generation = snapshotGeneration;
        savedSnapshotTimer = lifecycle.setTimeout(() => {
            savedSnapshotTimer = undefined;
            if (lifecycle.disposed || generation !== snapshotGeneration) return;
            jeMarkSaved();
        }, 500);
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
        // A pageshow during a write is not reloaded: on success the form already
        // matches the server, and on failure a reload would discard the edits the
        // administrator is about to retry.
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
            hydrated = true;
            updateAllDependencies();
            updateRequestsRequirementsBanner();
            markLoadedBaseline();
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
        if (!hydrated) {
            alert({
                title: 'Settings not loaded',
                message:
                    'Jellyfin Enhanced settings have not finished loading, so saving now would replace your saved configuration with defaults. If the page is still loading, wait for it to finish. If loading failed, reload the page and check the browser console and server logs for the reported error.',
            });
            return false;
        }
        mutationInFlight = true;
        // A pending load must not repopulate the form mid-write, and the delayed
        // baseline refresh is cancelled so a failed save leaves edits dirty against
        // the hydration baseline (see markLoadedBaseline).
        loadGeneration++;
        clearSavedSnapshotTimer();
        const saveButtons = document.querySelectorAll('.je-save-dock-btn');
        saveButtonStates = Array.from(saveButtons, (button) => ({ button, disabled: button.disabled }));
        try {
            saveButtons.forEach((button) => {
                button.disabled = true;
            });
            showLoading();
            // buildConfigFromForm refuses if the page was replaced during its fetch, since
            // the form would belong to another instance. Once the form has been read the
            // write proceeds regardless of disposal; only completion UI is page-scoped.
            const config = await buildConfigFromForm();
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
        if (!hydrated) return persistConfiguration(true);
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
