/** Feature settings and its private editor state. */
function createArrSettings({
    loadArrInstances,
    saveArrInstances,
    checklistRowState,
    _jeNormalizeArrUrl,
    readFieldValue,
}) {
    function loadArrSettings(config) {
        document.querySelector('#arrLinksEnabled').checked = config.ArrLinksEnabled;
        document.querySelector('#bazarrUrlMappings').value = config.BazarrUrlMappings || '';
        document.querySelector('#bazarrUrl').value = config.BazarrUrl;
        document.querySelector('#showArrLinksAsText').checked = config.ShowArrLinksAsText;
        document.querySelector('#arrLinksShowStatusSingle').checked = config.ArrLinksShowStatusSingle;
        document.querySelector('#arrTagsSyncEnabled').checked = config.ArrTagsSyncEnabled;
        // Load multi-instance Sonarr/Radarr
        loadArrInstances(config);
        document.querySelector('#arrTagsPrefix').value = config.ArrTagsPrefix || 'Requested by: ';
        document.querySelector('#arrTagsClearOldTags').checked = config.ArrTagsClearOldTags !== false;
        document.querySelector('#arrTagsShowAsLinks').checked = config.ArrTagsShowAsLinks !== false;
        document.querySelector('#arrTagsSyncFilter').value = config.ArrTagsSyncFilter || '';
        document.querySelector('#arrTagsLinksFilter').value = config.ArrTagsLinksFilter || '';
        document.querySelector('#arrTagsLinksHideFilter').value = config.ArrTagsLinksHideFilter || '';
    }

    function readArrSettings(config) {
        config.ArrLinksEnabled = document.querySelector('#arrLinksEnabled').checked;
        config.BazarrUrlMappings = document.querySelector('#bazarrUrlMappings').value || '';
        config.BazarrUrl = document.querySelector('#bazarrUrl').value;
        config.ShowArrLinksAsText = document.querySelector('#showArrLinksAsText').checked;
        config.ArrLinksShowStatusSingle = document.querySelector('#arrLinksShowStatusSingle').checked;
        config.ArrTagsSyncEnabled = document.querySelector('#arrTagsSyncEnabled').checked;
        // Save multi-instance Sonarr/Radarr
        var arrIncompleteWarnings = saveArrInstances(config);
        if (arrIncompleteWarnings.length > 0) {
            // Surface each incomplete-card warning to the admin before the save completes.
            arrIncompleteWarnings.forEach(function (msg) {
                Dashboard.alert({ title: '⚠ Incomplete *arr instance', message: msg });
            });
        }
        config.ArrTagsPrefix = document.querySelector('#arrTagsPrefix').value || 'Requested by: ';
        config.ArrTagsClearOldTags = document.querySelector('#arrTagsClearOldTags').checked;
        config.ArrTagsShowAsLinks = document.querySelector('#arrTagsShowAsLinks').checked;
        config.ArrTagsSyncFilter = document.querySelector('#arrTagsSyncFilter').value || '';
        config.ArrTagsLinksFilter = document.querySelector('#arrTagsLinksFilter').value || '';
        config.ArrTagsLinksHideFilter = document.querySelector('#arrTagsLinksHideFilter').value || '';
    }

    function getArrSectionDeps() {
        return [
            {
                tabSelector: '#arr',
                checkFn: hasAnyArrService,
                bannerIcon: 'link_off',
                bannerTitle: 'Enable a *arr service to configure',
                bannerHint: 'Add a URL and API key for Sonarr or Radarr above to enable these features.',
                bannerId: 'dep-banner-arr',
            },
        ];
    }

    function getArrParentDeps() {
        return [
            {
                parent: 'arrLinksEnabled',
                label: 'Enable *arr Links',
                children: ['showArrLinksAsText', 'arrLinksShowStatusSingle'],
            },
            {
                parent: 'arrTagsSyncEnabled',
                label: 'Enable *arr Tags Sync',
                children: ['arrTagsPrefix', 'arrTagsClearOldTags', 'arrTagsShowAsLinks', 'arrTagsSyncFilter'],
            },
            {
                parent: 'arrTagsShowAsLinks',
                label: 'Show synced tags as links',
                children: ['arrTagsLinksFilter', 'arrTagsLinksHideFilter'],
            },
        ];
    }

    function anyArrConfigured() {
        var cards = document.querySelectorAll(
            '#sonarrInstancesList .arr-instance-card, #radarrInstancesList .arr-instance-card',
        );
        for (var i = 0; i < cards.length; i++) {
            var url = cards[i].querySelector('.arr-instance-url');
            var key = cards[i].querySelector('.arr-instance-apikey');
            if (url && key && url.value.trim() && key.value.trim()) return true;
        }
        return false;
    }

    function describeArr(bool, feat) {
        // *arr
        var arrLinksWarn = bool('arrLinksEnabled') && !anyArrConfigured();
        feat(
            '*arr detail-page links',
            bool('arrLinksEnabled'),
            'arr',
            arrLinksWarn ? 'Enabled but no *arr instance is configured' : 'Enabled',
            arrLinksWarn,
        );
        var tagsSyncWarn = bool('arrTagsSyncEnabled') && !anyArrConfigured();
        feat(
            '*arr tags sync',
            bool('arrTagsSyncEnabled'),
            'arr',
            tagsSyncWarn ? 'Enabled but no *arr instance is configured' : 'Enabled',
            tagsSyncWarn,
        );
    }

    function describeStatusArr(pushCard) {
        // Sonarr / Radarr — one card per instance, reusing test-cache keys
        ['sonarr', 'radarr'].forEach(function (type) {
            var list = document.getElementById(type + 'InstancesList');
            if (!list) return;
            var arrCards = list.querySelectorAll('.arr-instance-card');
            arrCards.forEach(function (card) {
                var urlEl = card.querySelector('.arr-instance-url');
                var keyEl = card.querySelector('.arr-instance-apikey');
                var nameEl = card.querySelector('.arr-instance-name');
                if (!urlEl || !keyEl) return;
                var urlVal = (urlEl.value || '').trim();
                var keyVal = (keyEl.value || '').trim();
                if (!urlVal && !keyVal) return;
                var nameVal =
                    (nameEl && nameEl.value ? nameEl.value.trim() : '') || (type === 'sonarr' ? 'Sonarr' : 'Radarr');
                var cacheKey = type + ':' + _jeNormalizeArrUrl(urlVal);
                var icon = type === 'sonarr' ? 'tv' : 'movie';

                // Disabled instances (Enabled checkbox unchecked) render as
                // a grayed-out "Disabled" card regardless of test-cache
                // state — a stale red/green badge on a disabled entry is
                // misleading because the instance isn't being used.
                var enCb = card.querySelector('.arr-instance-enabled');
                var isDisabled = enCb && !enCb.checked;
                if (isDisabled) {
                    pushCard({
                        id: cacheKey,
                        name: nameVal,
                        tab: 'arr',
                        icon: icon,
                        state: 'off',
                        detail: 'Disabled',
                    });
                    return;
                }

                if (!urlVal || !keyVal) {
                    pushCard({
                        id: cacheKey,
                        name: nameVal,
                        tab: 'arr',
                        icon: icon,
                        state: 'warn',
                        detail: !urlVal ? 'URL missing' : 'API key missing',
                    });
                    return;
                }
                var r = checklistRowState(cacheKey, 'Configured, not yet verified');
                pushCard({
                    id: cacheKey,
                    name: nameVal,
                    tab: 'arr',
                    icon: icon,
                    state: r.state === 'amber' ? 'warn' : r.state === 'pending' ? 'pending' : r.state,
                    detail: r.detail,
                });
            });
        });
        // Bazarr — no test endpoint; URL presence is the best signal
        var bazarrUrl = readFieldValue('#bazarrUrl');
        var bazarrMappings = readFieldValue('#bazarrUrlMappings');
        if (bazarrUrl || bazarrMappings) {
            pushCard({
                id: 'bazarr',
                name: 'Bazarr',
                tab: 'arr',
                icon: 'subtitles',
                state: bazarrUrl ? 'ok' : 'warn',
                detail: bazarrUrl ? 'URL configured' : 'Only URL mappings set',
            });
        }
        // Shoko — no test endpoint; URL + API key presence is the best signal
        var shokoUrl = readFieldValue('#shokoUrl');
        var shokoApiKey = readFieldValue('#shokoApiKey');
        if (shokoUrl || shokoApiKey) {
            pushCard({
                id: 'shoko',
                name: 'Shoko',
                tab: 'arr',
                icon: 'live_tv',
                state: shokoUrl && shokoApiKey ? 'ok' : 'warn',
                detail:
                    shokoUrl && shokoApiKey
                        ? 'URL and API key configured'
                        : !shokoUrl
                          ? 'URL missing'
                          : 'API key missing',
            });
        }
    }

    /**
     * Checks whether at least one ENABLED arr service (Sonarr or Radarr) has a URL and API key.
     * Disabled instances are skipped — they're stored config but the fan-out callers
     * (controller endpoints, scheduled tag sync) skip them, so gating dependent
     * features behind a disabled-only set would be misleading.
     * @returns {boolean} True if any enabled arr service is fully configured
     */
    function hasAnyArrService() {
        var cards = document.querySelectorAll(
            '#sonarrInstancesList .arr-instance-card, #radarrInstancesList .arr-instance-card',
        );
        for (var i = 0; i < cards.length; i++) {
            var url = cards[i].querySelector('.arr-instance-url');
            var key = cards[i].querySelector('.arr-instance-apikey');
            var enabled = cards[i].querySelector('.arr-instance-enabled');
            // Treat missing checkbox as enabled (defensive — every card should have one)
            if (enabled && !enabled.checked) continue;
            if (url && url.value.trim() && key && key.value.trim()) return true;
        }
        return false;
    }

    function getDependencies() {
        return { sections: getArrSectionDeps(), parents: getArrParentDeps() };
    }
    return {
        load: loadArrSettings,
        read: readArrSettings,
        anyArrConfigured,
        describeArr,
        describeStatusArr,
        getDependencies,
    };
}
