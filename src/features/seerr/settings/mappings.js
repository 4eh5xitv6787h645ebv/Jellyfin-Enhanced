/** Feature settings and its private editor state. */
function createSeerrMappings({ lifecycle, _jeRunMappingValidation }) {
    var validateSeerrMappingsBtn = document.getElementById('validateSeerrMappingsBtn');

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        if (validateSeerrMappingsBtn) {
            lifecycle.listen(validateSeerrMappingsBtn, 'click', function () {
                _jeRunMappingValidation(
                    [{ id: 'jellyseerrUrlMappings', service: 'Seerr' }],
                    'validateSeerrMappingsBtn',
                    'seerrMappingsValidationResult',
                );
            });
        }
    }
    return { initialize, dispose: () => lifecycle.dispose() };
}
