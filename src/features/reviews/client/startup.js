// Private bootstrap input. Conditions and initialization belong to this feature.
function startReviews(JE) {
    if (typeof JE.initializeReviewsScript === 'function' && (JE.pluginConfig?.ShowReviews || JE.pluginConfig?.ShowUserReviews)) JE.initializeReviewsScript();
}
