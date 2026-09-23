/** Feature settings and its private editor state. */
function createStreamingAvailabilitySettings({ lifecycle, readFieldValue }) {
    function loadStreamingAvailabilitySettings(config) {
        document.querySelector('#elsewhereEnabled').checked = config.ElsewhereEnabled;
        document.querySelector('#TMDB_API_KEY').value = config.TMDB_API_KEY;
        populateRegionSelect(config.DEFAULT_REGION);
        document.querySelector('#DEFAULT_PROVIDERS').value = config.DEFAULT_PROVIDERS;
        document.querySelector('#IGNORE_PROVIDERS').value = config.IGNORE_PROVIDERS;
        document.querySelector('#ElsewhereCustomBrandingText').value = config.ElsewhereCustomBrandingText || '';
        document.querySelector('#ElsewhereCustomBrandingImageUrl').value = config.ElsewhereCustomBrandingImageUrl || '';
        document.querySelector('#jellyseerr_TMDB_API_KEY').value = config.TMDB_API_KEY;
        // Set up bidirectional sync between TMDB API key fields
        const tmdbKeyField = document.querySelector('#TMDB_API_KEY');
        const jellyseerrTmdbKeyField = document.querySelector('#jellyseerr_TMDB_API_KEY');
        lifecycle.listen(
            tmdbKeyField,
            'input',
            function () {
                jellyseerrTmdbKeyField.value = this.value;
            },
            undefined,
            'mirror-tmdb-key',
        );
        lifecycle.listen(
            jellyseerrTmdbKeyField,
            'input',
            function () {
                tmdbKeyField.value = this.value;
            },
            undefined,
            'mirror-seerr-tmdb-key',
        );
        document.querySelector('#jellyseerr_TMDB_API_KEY').value = config.TMDB_API_KEY;
    }

    function readStreamingAvailabilitySettings(config) {
        config.ElsewhereEnabled = document.querySelector('#elsewhereEnabled').checked;
        config.TMDB_API_KEY = document.querySelector('#TMDB_API_KEY').value;
        config.DEFAULT_REGION = document.querySelector('#DEFAULT_REGION').value;
        config.DEFAULT_PROVIDERS = document.querySelector('#DEFAULT_PROVIDERS').value;
        config.IGNORE_PROVIDERS = document.querySelector('#IGNORE_PROVIDERS').value;
        config.ElsewhereCustomBrandingText = document.querySelector('#ElsewhereCustomBrandingText').value;
        config.ElsewhereCustomBrandingImageUrl = document.querySelector('#ElsewhereCustomBrandingImageUrl').value;
        config.TMDB_API_KEY = document.querySelector('#jellyseerr_TMDB_API_KEY').value;
    }

    function getStreamingAvailabilityIndividualDeps() {
        return [{ id: 'elsewhereEnabled', checkFn: hasTmdbKey, hint: 'Add a TMDB API Key to enable', icon: 'key' }];
    }

    function getStreamingAvailabilityParentDeps() {
        return [
            {
                parent: 'elsewhereEnabled',
                label: 'Enable Elsewhere',
                children: [
                    'DEFAULT_REGION',
                    'DEFAULT_PROVIDERS',
                    'IGNORE_PROVIDERS',
                    'ElsewhereCustomBrandingText',
                    'ElsewhereCustomBrandingImageUrl',
                    'showReviews',
                    'reviewsExpandedByDefault',
                ],
            },
        ];
    }

    function describeStreamingAvailability(bool, val, feat) {
        // Extras
        var elsewhereWarn = bool('elsewhereEnabled') && !val('TMDB_API_KEY');
        feat(
            'Elsewhere (streaming providers)',
            bool('elsewhereEnabled'),
            'elsewhere',
            elsewhereWarn ? 'Enabled but TMDB API key is missing' : 'Enabled',
            elsewhereWarn,
        );
    }

    function describeStatusStreamingAvailability(pushCard) {
        // TMDB — no dedicated test endpoint; presence-based state only.
        var tmdbKey = readFieldValue('#TMDB_API_KEY');
        pushCard({
            id: 'tmdb',
            name: 'TMDB',
            tab: 'elsewhere',
            scrollTo: '#TMDB_API_KEY',
            state: tmdbKey ? 'ok' : 'off',
            detail: tmdbKey ? 'API key set' : 'No API key',
            icon: 'vpn_key',
        });
    }

    // Fallback used only if the CDN regions.txt fetch fails - mirrors js/elsewhere/elsewhere.js's fallback list.
    var JE_FALLBACK_REGIONS = {
        US: 'United States',
        GB: 'United Kingdom',
        IN: 'India',
        CA: 'Canada',
        DE: 'Germany',
        FR: 'France',
        JP: 'Japan',
        AU: 'Australia',
        BR: 'Brazil',
        MX: 'Mexico',
        IE: 'Ireland',
        IT: 'Italy',
        ES: 'Spain',
        NL: 'Netherlands',
        SE: 'Sweden',
        NO: 'Norway',
        DK: 'Denmark',
        FI: 'Finland',
    };

    // Renders the Default Region <select> from a {code: name} map, preserving whichever
    // code should end up selected. Only falls back to 'US' when there was no existing
    // selection to preserve - an existing valid-but-uncommon code (e.g. one missing from
    // the small hardcoded fallback list, or if the CDN regions.txt is unreachable) is kept
    // as a synthetic option rather than silently swapped for 'US' and lost on next Save.
    function renderRegionOptions(regionsMap, selectedCode) {
        const select = document.querySelector('#DEFAULT_REGION');
        if (!select) return;
        const wanted = selectedCode ? selectedCode.toUpperCase() : 'US';
        const map = regionsMap[wanted] ? regionsMap : { ...regionsMap, [wanted]: wanted };
        while (select.firstChild) select.removeChild(select.firstChild);
        Object.entries(map)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .forEach(([code, name]) => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = name;
                select.appendChild(option);
            });
        select.value = wanted;
    }

    // Populates the Default Region dropdown from the same CDN resource js/elsewhere/elsewhere.js
    // uses for its per-item region picker, so admins can only ever pick a code that TMDB's
    // watch/providers response is actually keyed by - no more free-text region typos.
    let regionLoad = 0;
    function populateRegionSelect(selectedCode) {
        const request = ++regionLoad;
        renderRegionOptions(JE_FALLBACK_REGIONS, selectedCode);
        fetch(jeCdnUrl('elsewhere-res/regions.txt'))
            .then((response) => (response.ok ? response.text() : Promise.reject()))
            .then((text) => {
                if (lifecycle.disposed || request !== regionLoad) return;
                const regionsMap = {};
                text.trim()
                    .split('\n')
                    .forEach((line) => {
                        if (line.startsWith('#')) return;
                        const [code, name] = line.split('\t');
                        if (code && name) regionsMap[code] = name;
                    });
                renderRegionOptions(regionsMap, selectedCode);
            })
            .catch(() => {
                // Already rendered with JE_FALLBACK_REGIONS above.
            });
    }

    // ================================
    // SETTING DEPENDENCY SYSTEM
    // ================================

    /**
     * Checks whether a TMDB API key is configured in either input field.
     * @returns {boolean} True if a non-empty TMDB key exists
     */
    function hasTmdbKey() {
        return (
            document.querySelector('#TMDB_API_KEY').value.trim().length > 0 ||
            document.querySelector('#jellyseerr_TMDB_API_KEY').value.trim().length > 0
        );
    }

    function getDependencies() {
        return { individual: getStreamingAvailabilityIndividualDeps(), parents: getStreamingAvailabilityParentDeps() };
    }
    return {
        load: loadStreamingAvailabilitySettings,
        read: readStreamingAvailabilitySettings,
        describeStreamingAvailability,
        describeStatusStreamingAvailability,
        hasTmdbKey,
        dispose: () => lifecycle.dispose(),
        getDependencies,
    };
}
