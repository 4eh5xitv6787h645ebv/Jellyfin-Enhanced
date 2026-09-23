// Private bootstrap input. Conditions and initialization belong to this feature.
function startPauseScreen(JE) {
    if (typeof JE.initializePauseScreen === 'function') JE.initializePauseScreen();
}

function startPlaybackRatings(JE) {
    if (typeof JE.initializeOsdRating === 'function') JE.initializeOsdRating();
    if (typeof JE.initializePlaybackRatingBadge === 'function' && JE.pluginConfig?.ShowPlaybackRatingBadge) JE.initializePlaybackRatingBadge();
}
