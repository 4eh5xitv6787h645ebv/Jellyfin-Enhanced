// Application composition order. Feature gates and behavior live in client/startup.js.
function initializeFeatures(JE) {
    startPluginRevisions(JE);
    startNavigation(JE);
    startStreamingAvailability(JE);
    startSeerrSearchAndReporting(JE);
    startPauseScreen(JE);
    startBookmarks(JE);
    startPosterTags(JE);
    startArrLinks(JE);
    startSeerrDetailLink(JE);
    startLetterboxdLinks(JE);
    startReviews(JE);
    startDetailRatings(JE);
    startTagPipeline(JE);
    startPlaybackRatings(JE);
    startHiddenContentFilters(JE);
    startSpoilerGuard(JE);
    startColoredRatings(JE);
    startThemeSelector(JE);
    startActivityIcons(JE);
    startPluginIcons(JE);
    startActiveStreams(JE);
    startDownloadsPage(JE);
    startCalendarPage(JE);
    startHiddenContentPage(JE);
}
