// Private bootstrap input. Conditions and initialization belong to this feature.
function startPosterTags(JE) {
    if (typeof JE.initializeQualityTags === 'function' && JE.currentSettings?.qualityTagsEnabled) JE.initializeQualityTags();
    if (typeof JE.initializeGenreTags === 'function' && JE.currentSettings?.genreTagsEnabled) JE.initializeGenreTags();
    if (typeof JE.initializeRatingTags === 'function' && JE.currentSettings?.ratingTagsEnabled) JE.initializeRatingTags();
    if (typeof JE.initializeUserReviewTags === 'function' && JE.pluginConfig?.ShowUserReviews && JE.pluginConfig?.ShowUserRatingOnPosters && JE.currentSettings?.ratingTagsEnabled) JE.initializeUserReviewTags();
}

function startTagPipeline(JE) {
    if (typeof JE.initializeLanguageTags === 'function' && JE.currentSettings?.languageTagsEnabled) JE.initializeLanguageTags();
    if (typeof JE.initializePeopleTags === 'function' && JE.currentSettings?.peopleTagsEnabled) JE.initializePeopleTags();
    if (typeof JE.tagPipeline?.initialize === 'function') JE.tagPipeline.initialize();
}
