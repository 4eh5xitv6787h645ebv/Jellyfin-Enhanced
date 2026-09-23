// Private bootstrap input. Conditions and initialization belong to this feature.
function startDownloadsPage(JE) {
    if (JE.pluginConfig?.DownloadsPageEnabled && typeof JE.initializeDownloadsPage === 'function') {
        JE.initializeDownloadsPage();
    }
}
