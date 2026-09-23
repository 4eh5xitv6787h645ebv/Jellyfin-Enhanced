// Private bootstrap input. Conditions and initialization belong to this feature.
function startPluginRevisions(JE) {
    if (typeof JE.initializePluginRevisions === 'function') JE.initializePluginRevisions();
}

function startThemeSelector(JE) {
    if (JE.pluginConfig?.ThemeSelectorEnabled && typeof JE.initializeThemeSelector === 'function') {
        JE.initializeThemeSelector();
    }
}

function startPluginIcons(JE) {
    if (JE.pluginConfig?.PluginIconsEnabled && typeof JE.initializePluginIcons === 'function') {
        JE.initializePluginIcons();
    }
}
