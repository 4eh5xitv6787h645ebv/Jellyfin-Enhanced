// Private bootstrap input. Conditions and initialization belong to this feature.
function startHiddenContentFilters(JE) {
    if (typeof JE.initializeHiddenContent === 'function' && JE.pluginConfig?.HiddenContentEnabled) JE.initializeHiddenContent();
}

function startHiddenContentPage(JE) {
    if (JE.pluginConfig?.HiddenContentEnabled && typeof JE.initializeHiddenContentPage === 'function') {
        JE.initializeHiddenContentPage();
    }
}
