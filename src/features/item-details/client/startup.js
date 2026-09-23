// Private bootstrap input. Conditions and initialization belong to this feature.
function startLetterboxdLinks(JE) {
    if (typeof JE.initializeLetterboxdLinksScript === 'function' && JE.pluginConfig?.LetterboxdEnabled) JE.initializeLetterboxdLinksScript();
}
