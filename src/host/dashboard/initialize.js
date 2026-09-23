/** Compose the settings page once. Re-executing Jellyfin's inline script disposes the previous page instance. */
function initializeEnhancedDashboard() {
    const page = document.querySelector('#JellyfinEnhancedPage');
    if (!page) return;
    if (typeof page._jeSettingsDispose === 'function') page._jeSettingsDispose();
    const scopes = [];
    function scope() {
        const value = createDashboardLifecycle();
        scopes.push(value);
        return value;
    }
    const shell = createDashboardShell({
        lifecycle: scope(),
        initAutoMovieQualityMode: (...args) => seerrAutoMovieQuality.initAutoMovieQualityMode(...args),
        loadConfig: (...args) => persistence.loadConfig(...args),
        saveConfig: (...args) => persistence.saveConfig(...args),
        resetAllUserSettings: (...args) => persistence.resetAllUserSettings(...args),
    });
    const userSettingsSettings = createUserSettingsSettings({
        lifecycle: scope(),
    });
    const maintenanceSettings = createMaintenanceSettings({
        lifecycle: scope(),
    });
    const appearanceSettings = createAppearanceSettings();
    const streamingAvailabilitySettings = createStreamingAvailabilitySettings({
        lifecycle: scope(),
        readFieldValue: (...args) => overview.readFieldValue(...args),
    });
    const playbackSettings = createPlaybackSettings({
        getPluginStatus: (...args) => plugins.getPluginStatus(...args),
    });
    const navigationSettings = createNavigationSettings();
    const itemDetailsSettings = createItemDetailsSettings();
    const hiddenContentSettings = createHiddenContentSettings({
        getPluginStatus: (...args) => plugins.getPluginStatus(...args),
    });
    const tagsSettings = createTagsSettings({
        lifecycle: scope(),
        pluginId: shell.pluginId,
    });
    const reviewsSettings = createReviewsSettings({
        hasTmdbKey: (...args) => streamingAvailabilitySettings.hasTmdbKey(...args),
    });
    const ratingsSettings = createRatingsSettings({
        lifecycle: scope(),
        refreshQualityCatAdminArrows: (...args) => tagsSettings.refreshQualityCatAdminArrows(...args),
        formatDateTimeDMY: (...args) => dates.formatDateTimeDMY(...args),
    });
    const seerrSettings = createSeerrSettings({
        lifecycle: scope(),
        loadAutoMovieRadarrServers: (...args) => seerrAutoMovieQuality.loadAutoMovieRadarrServers(...args),
        hasTmdbKey: (...args) => streamingAvailabilitySettings.hasTmdbKey(...args),
        checklistRowState: (...args) => connectionCache.checklistRowState(...args),
        readFieldValue: (...args) => overview.readFieldValue(...args),
        loadBlockedUsersList: (...args) => seerrUsers.loadBlockedUsersList(...args),
        syncBlockedUsersToHiddenInput: (...args) => seerrUsers.syncBlockedUsersToHiddenInput(...args),
        getPluginStatus: (...args) => plugins.getPluginStatus(...args),
    });
    const bookmarksSettings = createBookmarksSettings({
        getPluginStatus: (...args) => plugins.getPluginStatus(...args),
    });
    const arrSettings = createArrSettings({
        loadArrInstances: (...args) => arrInstances.loadArrInstances(...args),
        saveArrInstances: (...args) => arrInstances.saveArrInstances(...args),
        checklistRowState: (...args) => connectionCache.checklistRowState(...args),
        _jeNormalizeArrUrl: (...args) => connectionCache._jeNormalizeArrUrl(...args),
        readFieldValue: (...args) => overview.readFieldValue(...args),
    });
    const calendarSettings = createCalendarSettings({
        anyArrConfigured: (...args) => arrSettings.anyArrConfigured(...args),
        getPluginStatus: (...args) => plugins.getPluginStatus(...args),
    });
    const activitySettings = createActivitySettings({
        getPluginStatus: (...args) => plugins.getPluginStatus(...args),
    });
    const activeStreamsSettings = createActiveStreamsSettings({
        lifecycle: scope(),
    });
    const analyticsSettings = createAnalyticsSettings({
        lifecycle: scope(),
        formatDateTimeDMY: (...args) => dates.formatDateTimeDMY(...args),
    });
    const downloadsSettings = createDownloadsSettings({
        anyArrConfigured: (...args) => arrSettings.anyArrConfigured(...args),
        seerrConfigured: (...args) => seerrSettings.seerrConfigured(...args),
        getPluginStatus: (...args) => plugins.getPluginStatus(...args),
    });
    const spoilerGuardSettings = createSpoilerGuardSettings();
    const featureSettings = [
        userSettingsSettings,
        maintenanceSettings,
        appearanceSettings,
        streamingAvailabilitySettings,
        playbackSettings,
        navigationSettings,
        itemDetailsSettings,
        hiddenContentSettings,
        tagsSettings,
        reviewsSettings,
        ratingsSettings,
        seerrSettings,
        bookmarksSettings,
        arrSettings,
        calendarSettings,
        activitySettings,
        activeStreamsSettings,
        analyticsSettings,
        downloadsSettings,
        spoilerGuardSettings,
    ];
    const settingsCoordinator = createDashboardSettingsCoordinator(featureSettings);
    const customTabs = createDashboardCustomTabs({
        lifecycle: scope(),
        getBookmarksCustomTabManagedEntries: (...args) =>
            bookmarksSettings.getBookmarksCustomTabManagedEntries(...args),
        getHiddenContentCustomTabManagedEntries: (...args) =>
            hiddenContentSettings.getHiddenContentCustomTabManagedEntries(...args),
        getDownloadsCustomTabManagedEntries: (...args) =>
            downloadsSettings.getDownloadsCustomTabManagedEntries(...args),
        getCalendarCustomTabManagedEntries: (...args) => calendarSettings.getCalendarCustomTabManagedEntries(...args),
        getSeerrCustomTabManagedEntries: (...args) => seerrSettings.getSeerrCustomTabManagedEntries(...args),
        getActivityCustomTabManagedEntries: (...args) => activitySettings.getActivityCustomTabManagedEntries(...args),
        pluginId: shell.pluginId,
        renderOptionalPluginsDashboard: (...args) => plugins.renderOptionalPluginsDashboard(...args),
    });
    const seerrConnections = createSeerrConnections({
        lifecycle: scope(),
        beginConnectionTest: (...args) => connectionCache.beginConnectionTest(...args),
        jeTestAlert: (...args) => connectionCache.jeTestAlert(...args),
        setConnectionTestResult: (...args) => connectionCache.setConnectionTestResult(...args),
        connectionErrorMessage: (...args) => arrConnections.connectionErrorMessage(...args),
    });
    const streamingAvailabilityConnections = createStreamingAvailabilityConnections({
        lifecycle: scope(),
        beginConnectionTest: (...args) => connectionCache.beginConnectionTest(...args),
        jeTestAlert: (...args) => connectionCache.jeTestAlert(...args),
        setConnectionTestResult: (...args) => connectionCache.setConnectionTestResult(...args),
        updateAllDependencies: (...args) => dependencies.updateAllDependencies(...args),
    });
    const navigation = createDashboardNavigation({
        lifecycle: scope(),
        form: shell.form,
    });
    const descriptions = createDashboardDescriptions({
        lifecycle: scope(),
    });
    const dirtyState = createDashboardDirtyState({
        lifecycle: scope(),
        form: shell.form,
        getShortcutOverrides: (...args) => userSettingsSettings.getShortcutOverrides(...args),
    });
    const plugins = createDashboardPlugins({
        lifecycle: scope(),
        setProbeWarning: (...args) => customTabs.setProbeWarning(...args),
        checkCustomTabsConfigCompat: (...args) => customTabs.checkCustomTabsConfigCompat(...args),
        checkWhatsNew: (...args) => whatsNew.checkWhatsNew(...args),
        updateAllDependencies: (...args) => dependencies.updateAllDependencies(...args),
        updateStatusDashboard: (...args) => overview.updateStatusDashboard(...args),
        getCustomTabsCompatibility: (...args) => customTabs.getCustomTabsCompatibility(...args),
        resetCustomTabsCompatibility: (...args) => customTabs.resetCustomTabsCompatibility(...args),
    });
    const seerrAutoMovieQuality = createSeerrAutoMovieQuality({
        lifecycle: scope(),
    });
    const arrInstances = createArrInstances({
        lifecycle: scope(),
        updateAllDependencies: (...args) => dependencies.updateAllDependencies(...args),
        renderServiceStatusDashboard: (...args) => overview.renderServiceStatusDashboard(...args),
        testInstanceConnection: (...args) => arrConnections.testInstanceConnection(...args),
    });
    const downloadsRequirements = createDownloadsRequirements({
        lifecycle: scope(),
        debouncedUpdateDeps: (...args) => dependencies.debouncedUpdateDeps(...args),
    });
    const persistence = createDashboardPersistence({
        lifecycle: scope(),
        normalizeLoadedSettings: (...args) => itemDetailsSettings.normalizeLoadedSettings(...args),
        loadFeatureSettings: (...args) => settingsCoordinator.loadFeatureSettings(...args),
        normalizeReadSettings: (...args) => itemDetailsSettings.normalizeReadSettings(...args),
        readFeatureSettings: (...args) => settingsCoordinator.readFeatureSettings(...args),
        restoreCustomTabOwnership: (...args) => customTabs.restoreCustomTabOwnership(...args),
        applyCustomTabOwnership: (...args) => customTabs.applyCustomTabOwnership(...args),
        applyMaintenanceMode: (...args) => maintenanceSettings.applyMaintenanceMode(...args),
        pluginId: shell.pluginId,
        jeMarkSaved: (...args) => dirtyState.jeMarkSaved(...args),
        checkInstalledPlugins: (...args) => plugins.checkInstalledPlugins(...args),
        updateRequestsRequirementsBanner: (...args) => downloadsRequirements.updateRequestsRequirementsBanner(...args),
        runCustomTabsSync: (...args) => customTabs.runCustomTabsSync(...args),
        updateAllDependencies: (...args) => dependencies.updateAllDependencies(...args),
    });
    const appearanceBranding = createAppearanceBranding({
        lifecycle: scope(),
    });
    const userSettingsLanguages = createUserSettingsLanguages({ lifecycle: scope() });
    const featureRules = featureSettings.map((feature) => (feature.getDependencies ? feature.getDependencies() : {}));
    const dependencyRules = Object.fromEntries(
        ['sections', 'individual', 'parents', 'customTabsHints'].map((key) => [
            key,
            featureRules.flatMap((rules) => rules[key] || []),
        ]),
    );
    const dependencies = createDashboardDependencies({
        rules: dependencyRules,
        lifecycle: scope(),
        isMetadataIconsEnabled: (...args) => itemDetailsSettings.isMetadataIconsEnabled(...args),
        invalidatePersistedTest: (...args) => connectionCache.invalidatePersistedTest(...args),
        renderOptionalPluginsDashboard: (...args) => plugins.renderOptionalPluginsDashboard(...args),
        renderFeaturesDashboard: (...args) => overview.renderFeaturesDashboard(...args),
        renderServiceStatusDashboard: (...args) => overview.renderServiceStatusDashboard(...args),
        updateClientTagCacheControlsVisibility: (...args) =>
            tagsSettings.updateClientTagCacheControlsVisibility(...args),
        syncAllBannerParents: (...args) => descriptions.syncAllBannerParents(...args),
        getPluginStatus: (...args) => plugins.getPluginStatus(...args),
    });
    const connectionCache = createDashboardConnectionCache({
        lifecycle: scope(),
        testJellyseerrBtn: seerrConnections.testJellyseerrBtn,
        renderServiceStatusDashboard: (...args) => overview.renderServiceStatusDashboard(...args),
        updateStatusDashboard: (...args) => overview.updateStatusDashboard(...args),
        formatDateDMY: (...args) => dates.formatDateDMY(...args),
    });
    const whatsNew = createDashboardWhatsNew({
        lifecycle: scope(),
        jeJumpToTab: (...args) => navigation.jeJumpToTab(...args),
    });
    const overview = createDashboardOverview({
        lifecycle: scope(),
        describeItemDetails: (...args) => itemDetailsSettings.describeItemDetails(...args),
        describeTags: (...args) => tagsSettings.describeTags(...args),
        describeNavigation: (...args) => navigationSettings.describeNavigation(...args),
        describePlayback: (...args) => playbackSettings.describePlayback(...args),
        describeBookmarks: (...args) => bookmarksSettings.describeBookmarks(...args),
        describeHiddenContent: (...args) => hiddenContentSettings.describeHiddenContent(...args),
        describeDownloads: (...args) => downloadsSettings.describeDownloads(...args),
        describeCalendar: (...args) => calendarSettings.describeCalendar(...args),
        describeAppearance: (...args) => appearanceSettings.describeAppearance(...args),
        describeStreamingAvailability: (...args) =>
            streamingAvailabilitySettings.describeStreamingAvailability(...args),
        describeSeerr: (...args) => seerrSettings.describeSeerr(...args),
        describeArr: (...args) => arrSettings.describeArr(...args),
        describeStatusStreamingAvailability: (...args) =>
            streamingAvailabilitySettings.describeStatusStreamingAvailability(...args),
        describeStatusSeerr: (...args) => seerrSettings.describeStatusSeerr(...args),
        describeStatusArr: (...args) => arrSettings.describeStatusArr(...args),
        jeJumpToTab: (...args) => navigation.jeJumpToTab(...args),
    });
    const arrConnections = createArrConnections({
        lifecycle: scope(),
        beginConnectionTest: (...args) => connectionCache.beginConnectionTest(...args),
        jeTestAlert: (...args) => connectionCache.jeTestAlert(...args),
        setConnectionTestResult: (...args) => connectionCache.setConnectionTestResult(...args),
        _jeNormalizeArrUrl: (...args) => connectionCache._jeNormalizeArrUrl(...args),
        updateAllDependencies: (...args) => dependencies.updateAllDependencies(...args),
    });
    const arrMappings = createArrMappings({
        lifecycle: scope(),
    });
    const seerrMappings = createSeerrMappings({
        lifecycle: scope(),
        _jeRunMappingValidation: (...args) => arrMappings._jeRunMappingValidation(...args),
    });
    const seerrUsers = createSeerrUsers({
        lifecycle: scope(),
        saveBeforeImport: () => persistence.saveBeforeImport(),
    });
    const seerrPermissionAudit = createSeerrPermissionAudit({
        lifecycle: scope(),
    });
    const userSettingsTimingPreviews = createUserSettingsTimingPreviews({
        lifecycle: scope(),
    });
    const appearanceCustomLinks = createAppearanceCustomLinks({
        lifecycle: scope(),
    });
    const dates = createDashboardDates();
    const clipboard = createDashboardClipboard({
        lifecycle: scope(),
    });
    page._jeSettingsDispose = () => {
        persistence.dispose();
        scopes.forEach((value) => value.dispose());
    };
    shell.initialize();
    navigation.initialize();
    descriptions.initialize();
    dirtyState.initialize();
    userSettingsSettings.initialize();
    arrInstances.initialize();
    tagsSettings.initialize();
    ratingsSettings.initialize();
    appearanceBranding.initialize();
    maintenanceSettings.initialize();
    userSettingsLanguages.initialize();
    downloadsRequirements.initialize();
    dependencies.initialize();
    arrMappings.initialize();
    seerrMappings.initialize();
    seerrConnections.initialize();
    connectionCache.initialize();
    seerrUsers.initialize();
    seerrPermissionAudit.initialize();
    userSettingsTimingPreviews.initialize();
    appearanceCustomLinks.initialize();
    streamingAvailabilityConnections.initialize();
    clipboard.initialize();
    return {
        load: persistence.loadConfig,
        save: persistence.saveConfig,
        applyToAll: persistence.resetAllUserSettings,
        dispose: page._jeSettingsDispose,
    };
}
initializeEnhancedDashboard();
