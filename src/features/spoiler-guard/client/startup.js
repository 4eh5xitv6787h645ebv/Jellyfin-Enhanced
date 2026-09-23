// Private bootstrap input. Conditions and initialization belong to this feature.
function startSpoilerGuard(JE) {
    if (JE.pluginConfig?.SpoilerBlurEnabled && typeof JE.spoilerBlur?.init === 'function') JE.spoilerBlur.init();
}
