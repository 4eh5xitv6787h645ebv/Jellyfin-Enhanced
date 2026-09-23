// Private bootstrap input. Conditions and initialization belong to this feature.
function startDetailRatings(JE) {
    if (typeof JE.initializeAwardsScript === 'function' && JE.pluginConfig?.ShowAwards) JE.initializeAwardsScript();
    if (typeof JE.initializeMdblistRatingsScript === 'function' && JE.pluginConfig?.MdblistRatingsEnabled && JE.pluginConfig?.MdblistRatingsShowOnItemDetails) JE.initializeMdblistRatingsScript();
}

function startColoredRatings(JE) {
    if (JE.pluginConfig?.ColoredRatingsEnabled && typeof JE.initializeColoredRatings === 'function') {
        JE.initializeColoredRatings();
    }
}
