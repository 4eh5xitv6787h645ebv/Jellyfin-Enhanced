// Private bootstrap input. Conditions and initialization belong to this feature.
function startCalendarPage(JE) {
    if (JE.pluginConfig?.CalendarPageEnabled && typeof JE.initializeCalendarPage === 'function') {
        JE.initializeCalendarPage();
    }
}
