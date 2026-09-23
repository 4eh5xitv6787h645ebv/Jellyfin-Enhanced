/** Ordered feature hydration/read phases share the same feature objects. */
function createDashboardSettingsCoordinator(features) {
    return {
        loadFeatureSettings(config) {
            features.forEach((feature) => feature.load(config));
        },
        readFeatureSettings(config) {
            features.forEach((feature) => feature.read(config));
        },
    };
}
