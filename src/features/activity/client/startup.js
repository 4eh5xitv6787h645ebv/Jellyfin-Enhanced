// Private bootstrap input. Conditions and initialization belong to this feature.
function startActivityIcons(JE) {
    if (JE.pluginConfig?.ColoredActivityIconsEnabled && typeof JE.initializeActivityIcons === 'function') {
        JE.initializeActivityIcons();
    }
}
