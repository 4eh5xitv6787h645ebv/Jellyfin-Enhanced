// Private bootstrap input. Conditions and initialization belong to this feature.
function startStreamingAvailability(JE) {
    if (typeof JE.initializeElsewhereScript === 'function' && JE.pluginConfig?.ElsewhereEnabled) JE.initializeElsewhereScript();
}
