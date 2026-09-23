// Private bootstrap input. Conditions and initialization belong to this feature.
function startActiveStreams(JE) {
    if (JE.pluginConfig?.ActiveStreamsEnabled && typeof JE.activeStreams?.initialize === 'function') {
        JE.activeStreams.initialize();
    }
}
