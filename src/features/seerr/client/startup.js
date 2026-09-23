// Private bootstrap input. Conditions and initialization belong to this feature.
function startSeerrSearchAndReporting(JE) {
    if (typeof JE.initializeJellyseerrScript === 'function' && JE.pluginConfig?.JellyseerrEnabled && JE.pluginConfig?.JellyseerrShowSearchResults !== false) JE.initializeJellyseerrScript();
    if (typeof JE.jellyseerrIssueReporter?.initialize === 'function' && JE.pluginConfig?.JellyseerrEnabled && JE.pluginConfig?.JellyseerrShowReportButton) JE.jellyseerrIssueReporter.initialize();
}

function startSeerrDetailLink(JE) {
    if (typeof JE.initializeSeerrDetailLinkScript === 'function' && JE.pluginConfig?.JellyseerrEnabled && JE.pluginConfig?.JellyseerrShowDetailPageLink) JE.initializeSeerrDetailLinkScript();
}
