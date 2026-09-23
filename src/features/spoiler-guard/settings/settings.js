/** Feature settings and its private editor state. */
function createSpoilerGuardSettings() {
    function loadSpoilerGuardSettings(config) {
        // Spoiler Guard settings
        document.querySelector('#spoilerBlurEnabled').checked = config.SpoilerBlurEnabled === true;
        var __sbSigma = document.querySelector('#spoilerBlurIntensity');
        if (__sbSigma)
            __sbSigma.value =
                config.SpoilerBlurIntensity >= 5 && config.SpoilerBlurIntensity <= 100
                    ? config.SpoilerBlurIntensity
                    : 40;
        var __sbMode = document.querySelector('#spoilerBlurMode');
        if (__sbMode) __sbMode.value = config.SpoilerBlurMode === 'blur' ? 'blur' : 'hide';
        // Field-strip toggles. Defaults match PluginConfiguration:
        // every hide toggle defaults ON (strictest sensible posture
        // when the admin enables Spoiler Guard); the artwork +
        // auto-enable toggles default OFF.
        [
            // A null value means this config predates the independent
            // Series switch. Mirror the old episode-overview value on
            // first load so upgrading does not silently change policy.
            ['spoilerStripSeriesOverview', 'SpoilerStripSeriesOverview', config.SpoilerStripOverview !== false],
            ['spoilerStripOverview', 'SpoilerStripOverview', true],
            ['spoilerStripTags', 'SpoilerStripTags', true],
            ['spoilerStripChapters', 'SpoilerStripChapters', true],
            ['spoilerStripTaglines', 'SpoilerStripTaglines', true],
            ['spoilerStripRatings', 'SpoilerStripRatings', true],
            ['spoilerStripPremiereDate', 'SpoilerStripPremiereDate', true],
            ['spoilerReplaceTitle', 'SpoilerReplaceTitle', true],
            ['spoilerStripCast', 'SpoilerStripCast', true],
            ['spoilerStripReviews', 'SpoilerStripReviews', true],
            ['spoilerBlurArtwork', 'SpoilerBlurArtwork', false],
            ['spoilerAutoEnableOnFirstPlay', 'SpoilerAutoEnableOnFirstPlay', false],
            ['spoilerAutoEnableOnSeerrRequest', 'SpoilerAutoEnableOnSeerrRequest', false],
            ['spoilerBlurStrictRefresh', 'SpoilerBlurStrictRefresh', false],
            ['spoilerKeepMoviePosters', 'SpoilerKeepMoviePosters', true],
            // Advanced per-category reveals. The master switch is off
            // for existing installs; the category masks keep the
            // strictest posture except the next-episode title, which
            // is the reveal advanced mode exists for.
            ['spoilerAdvancedMode', 'SpoilerAdvancedMode', false],
            ['spoilerNextEpisodeStripTitle', 'SpoilerNextEpisodeStripTitle', false],
            ['spoilerNextEpisodeStripOverview', 'SpoilerNextEpisodeStripOverview', true],
            ['spoilerNextEpisodeStripRatings', 'SpoilerNextEpisodeStripRatings', true],
            ['spoilerNextEpisodeStripImage', 'SpoilerNextEpisodeStripImage', true],
            ['spoilerCurrentSeasonStripTitle', 'SpoilerCurrentSeasonStripTitle', true],
            ['spoilerCurrentSeasonStripOverview', 'SpoilerCurrentSeasonStripOverview', true],
            ['spoilerCurrentSeasonStripRatings', 'SpoilerCurrentSeasonStripRatings', true],
        ].forEach(function (t) {
            var el = document.querySelector('#' + t[0]);
            if (!el) return;
            var v = config[t[1]];
            el.checked = v === undefined || v === null ? t[2] : !!v;
        });
        var __sbCastMode = document.querySelector('#spoilerStripCastMode');
        if (__sbCastMode) __sbCastMode.value = config.SpoilerStripCastMode === 'All' ? 'All' : 'GuestStars';
        var __sbPlaceholder = document.querySelector('#spoilerOverviewPlaceholder');
        if (__sbPlaceholder) __sbPlaceholder.value = config.SpoilerOverviewPlaceholder || 'Spoiler Guard activated';
    }

    function readSpoilerGuardSettings(config) {
        // Spoiler Guard settings
        config.SpoilerBlurEnabled = document.querySelector('#spoilerBlurEnabled').checked;
        var __sbSigmaSave = document.querySelector('#spoilerBlurIntensity');
        if (__sbSigmaSave) {
            var __sbSigmaVal = parseInt(__sbSigmaSave.value, 10);
            if (!isFinite(__sbSigmaVal) || __sbSigmaVal < 5) __sbSigmaVal = 5;
            if (__sbSigmaVal > 100) __sbSigmaVal = 100;
            config.SpoilerBlurIntensity = __sbSigmaVal;
        }
        // Field-strip toggles
        [
            'spoilerStripSeriesOverview',
            'spoilerStripOverview',
            'spoilerStripTags',
            'spoilerStripChapters',
            'spoilerStripTaglines',
            'spoilerStripRatings',
            'spoilerStripPremiereDate',
            'spoilerReplaceTitle',
            'spoilerStripCast',
            'spoilerStripReviews',
            'spoilerBlurArtwork',
            'spoilerAutoEnableOnFirstPlay',
            'spoilerAutoEnableOnSeerrRequest',
            'spoilerBlurStrictRefresh',
            'spoilerKeepMoviePosters',
            'spoilerAdvancedMode',
            'spoilerNextEpisodeStripTitle',
            'spoilerNextEpisodeStripOverview',
            'spoilerNextEpisodeStripRatings',
            'spoilerNextEpisodeStripImage',
            'spoilerCurrentSeasonStripTitle',
            'spoilerCurrentSeasonStripOverview',
            'spoilerCurrentSeasonStripRatings',
        ].forEach(function (id) {
            var el = document.querySelector('#' + id);
            if (!el) return;
            var pascal = id.charAt(0).toUpperCase() + id.slice(1);
            config[pascal] = !!el.checked;
        });
        var __sbCastModeSave = document.querySelector('#spoilerStripCastMode');
        config.SpoilerStripCastMode = __sbCastModeSave && __sbCastModeSave.value === 'All' ? 'All' : 'GuestStars';
        var __sbModeSave = document.querySelector('#spoilerBlurMode');
        config.SpoilerBlurMode = __sbModeSave && __sbModeSave.value === 'blur' ? 'blur' : 'hide';
        var __sbPlaceholderSave = document.querySelector('#spoilerOverviewPlaceholder');
        if (__sbPlaceholderSave) {
            // Remove every character that could open a tag, attribute or
            // template context so this stored placeholder can't become markup
            // in a JE consumer that uses innerHTML on Overview (the server
            // inserts it into BaseItemDto.Overview; defense-in-depth). A single
            // character-class strip is complete — unlike a tag-shaped regex it
            // can't be bypassed by nested or split tags.
            var __raw = (__sbPlaceholderSave.value || 'Spoiler Guard activated').slice(0, 200);
            __raw = __raw.replace(/[<>"'`]/g, '');
            config.SpoilerOverviewPlaceholder = __raw || 'Spoiler Guard activated';
        }
    }

    function getSpoilerGuardParentDeps() {
        return [
            {
                parent: 'spoilerBlurEnabled',
                label: 'Enable Spoiler Guard',
                children: [
                    'spoilerBlurIntensity',
                    'spoilerBlurArtwork',
                    'spoilerStripSeriesOverview',
                    'spoilerStripOverview',
                    'spoilerOverviewPlaceholder',
                    'spoilerStripTags',
                    'spoilerStripChapters',
                    'spoilerStripTaglines',
                    'spoilerStripRatings',
                    'spoilerStripPremiereDate',
                    'spoilerReplaceTitle',
                    'spoilerStripCast',
                    'spoilerAutoEnableOnFirstPlay',
                    'spoilerAutoEnableOnSeerrRequest',
                    'spoilerBlurStrictRefresh',
                    'spoilerKeepMoviePosters',
                    'spoilerAdvancedMode',
                ],
            },
            {
                parent: 'spoilerStripCast',
                label: 'Hide cast on unwatched episodes',
                children: ['spoilerStripCastMode'],
            },
            {
                parent: 'spoilerAdvancedMode',
                label: 'Enable advanced per-category reveals',
                children: [
                    'spoilerNextEpisodeStripTitle',
                    'spoilerNextEpisodeStripOverview',
                    'spoilerNextEpisodeStripRatings',
                    'spoilerNextEpisodeStripImage',
                    'spoilerCurrentSeasonStripTitle',
                    'spoilerCurrentSeasonStripOverview',
                    'spoilerCurrentSeasonStripRatings',
                ],
            },
        ];
    }

    function getDependencies() {
        return { parents: getSpoilerGuardParentDeps() };
    }
    return { load: loadSpoilerGuardSettings, read: readSpoilerGuardSettings, getDependencies };
}
