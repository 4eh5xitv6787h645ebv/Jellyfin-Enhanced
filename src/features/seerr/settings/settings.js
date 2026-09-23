/** Feature settings and its private editor state. */
function createSeerrSettings({
    lifecycle,
    loadAutoMovieRadarrServers,
    hasTmdbKey,
    checklistRowState,
    readFieldValue,
    loadBlockedUsersList,
    syncBlockedUsersToHiddenInput,
    getPluginStatus,
}) {
    function loadSeerrSettings(config) {
        document.querySelector('#jellyseerrEnabled').checked = config.JellyseerrEnabled;
        document.querySelector('#showCollectionsInSearch').checked = config.ShowCollectionsInSearch !== false;
        document.querySelector('#jellyseerrShowSearchResults').checked = config.JellyseerrShowSearchResults !== false;
        document.querySelector('#jellyseerrEnable4kRequests').checked = !!config.JellyseerrEnable4KRequests;
        document.querySelector('#jellyseerrEnable4kTvRequests').checked = !!config.JellyseerrEnable4KTvRequests;
        document.querySelector('#jellyseerrUseMoreInfoModal').checked = !!config.JellyseerrUseMoreInfoModal;
        document.querySelector('#jellyseerrAvailablePosterLinksToJellyfin').checked =
            !!config.JellyseerrAvailablePosterLinksToJellyfin;
        document.querySelector('#jellyseerrShowAdvanced').checked = config.JellyseerrShowAdvanced;
        document.querySelector('#jellyseerrShowQuotaInfo').checked = config.JellyseerrShowQuotaInfo !== false;
        document.querySelector('#jellyseerrShowSimilar').checked = config.JellyseerrShowSimilar !== false;
        document.querySelector('#jellyseerrShowRecommended').checked = config.JellyseerrShowRecommended !== false;
        document.querySelector('#jellyseerrShowRequestMoreOnSeries').checked =
            config.JellyseerrShowRequestMoreOnSeries !== false;
        document.querySelector('#jellyseerrExcludeLibraryItems').checked =
            config.JellyseerrExcludeLibraryItems !== false;
        document.querySelector('#jellyseerrShowNetworkDiscovery').checked =
            config.JellyseerrShowNetworkDiscovery !== false;
        document.querySelector('#jellyseerrShowGenreDiscovery').checked = config.JellyseerrShowGenreDiscovery !== false;
        document.querySelector('#jellyseerrShowTagDiscovery').checked = config.JellyseerrShowTagDiscovery !== false;
        document.querySelector('#jellyseerrShowPersonDiscovery').checked =
            config.JellyseerrShowPersonDiscovery !== false;
        document.querySelector('#jellyseerrShowCollectionDiscovery').checked =
            config.JellyseerrShowCollectionDiscovery !== false;
        document.querySelector('#jellyseerrShowReportButton').checked = !!config.JellyseerrShowReportButton;
        document.querySelector('#jellyseerrShowIssueIndicator').checked = !!config.JellyseerrShowIssueIndicator;
        document.querySelector('#jellyseerrShowDetailPageLink').checked = config.JellyseerrShowDetailPageLink !== false;
        document.querySelector('#jellyseerrShowDetailPageLinkAsText').checked =
            !!config.JellyseerrShowDetailPageLinkAsText;
        document.querySelector('#jellyseerrExcludeBlocklistedItems').checked =
            !!config.JellyseerrExcludeBlocklistedItems;
        document.querySelector('#jellyseerrDisableCache').checked = !!config.JellyseerrDisableCache;
        document.querySelector('#jellyseerrResponseCacheTtlMinutes').value =
            config.JellyseerrResponseCacheTtlMinutes || 10;
        document.querySelector('#jellyseerrUserIdCacheTtlMinutes').value = config.JellyseerrUserIdCacheTtlMinutes || 30;
        document.querySelector('#showElsewhereOnJellyseerr').checked = config.ShowElsewhereOnJellyseerr;
        document.querySelector('#jellyseerrUrls').value = config.JellyseerrUrls;
        document.querySelector('#JellyseerrApiKey').value = config.JellyseerrApiKey;
        document.querySelector('#jellyseerrUrlMappings').value = config.JellyseerrUrlMappings || '';
        document.querySelector('#autoSeasonRequestEnabled').checked = config.AutoSeasonRequestEnabled || false;
        document.querySelector('#autoSeasonRequestRequireAllWatched').checked =
            config.AutoSeasonRequestRequireAllWatched || false;
        document.querySelector('#autoSeasonRequestThresholdValue').value = config.AutoSeasonRequestThresholdValue || 2;
        document.querySelector('#autoMovieRequestEnabled').checked = config.AutoMovieRequestEnabled || false;
        const triggerType = config.AutoMovieRequestTriggerType || 'OnMinutesWatched';
        document.querySelector('#autoMovieRequestTriggerOnStart').checked =
            triggerType === 'OnStart' || triggerType === 'Both';
        document.querySelector('#autoMovieRequestTriggerOnMinutesWatched').checked =
            triggerType === 'OnMinutesWatched' || triggerType === 'Both';
        document.querySelector('#autoMovieRequestMinutesWatched').value = config.AutoMovieRequestMinutesWatched || 20;
        document.querySelector('#autoMovieRequestCheckReleaseDate').checked =
            config.AutoMovieRequestCheckReleaseDate !== false;
        document.querySelector('#autoMovieRequestQualityMode').value = config.AutoMovieRequestQualityMode || 'default';
        document.querySelector('#autoMovieRequestFallbackOn4k').checked = config.AutoMovieRequestFallbackOn4k !== false;
        if ((config.AutoMovieRequestQualityMode || 'default') === 'custom') {
            document.querySelector('#autoMovieRequestCustomSettings').style.display = 'block';
            loadAutoMovieRadarrServers(config);
        }
        document.querySelector('#addRequestedMediaToWatchlist').checked = config.AddRequestedMediaToWatchlist || false;
        document.querySelector('#syncJellyseerrWatchlist').checked = config.SyncJellyseerrWatchlist || false;
        document.querySelector('#syncJellyfinWatchlistToSeerr').checked = config.SyncJellyfinWatchlistToSeerr || false;
        document.querySelector('#jellyseerrAutoImportUsers').checked = config.JellyseerrAutoImportUsers || false;
        document.querySelector('#jellyseerrImportBlockedUsers').value = config.JellyseerrImportBlockedUsers || '';
        loadBlockedUsersList(config.JellyseerrImportBlockedUsers || '');
        document.querySelector('#preventWatchlistReAddition').checked = config.PreventWatchlistReAddition !== false;
        document.querySelector('#watchlistMemoryRetentionDays').value = config.WatchlistMemoryRetentionDays || 365;
        document.querySelector('#triggerSeerrScanOnItemAdded').checked = config.TriggerSeerrScanOnItemAdded === true;
        document.querySelector('#seerrScanDebounceSeconds').value = config.SeerrScanDebounceSeconds || 60;
        // Recommendations Page settings
        document.querySelector('#recommendationsPageEnabled').checked = config.RecommendationsPageEnabled === true;
        document.querySelector('#recommendationsUseNativeTab').checked = config.RecommendationsUseNativeTab === true;
        document.querySelector('#recommendationsUsePluginPages').checked =
            config.RecommendationsUsePluginPages === true;
        document.querySelector('#recommendationsUseCustomTabs').checked = config.RecommendationsUseCustomTabs === true;
        var __rAuto = document.querySelector('#recommendationsAutoCreateCustomTab');
        if (__rAuto) __rAuto.checked = config.RecommendationsAutoCreateCustomTab === true;
        // Set up event handler for watchlist prevention checkbox
        function toggleWatchlistRetentionVisibility() {
            const preventionEnabled = document.querySelector('#preventWatchlistReAddition').checked;
            const retentionContainer = document
                .querySelector('#watchlistMemoryRetentionDays')
                .closest('.inputContainer');
            if (retentionContainer) {
                retentionContainer.style.display = preventionEnabled ? 'block' : 'none';
            }
        }
        // Set initial visibility
        toggleWatchlistRetentionVisibility();
        // Add event listener
        lifecycle.listen(
            document.querySelector('#preventWatchlistReAddition'),
            'change',
            toggleWatchlistRetentionVisibility,
            undefined,
            'watchlist-retention-visibility',
        );
    }

    function readSeerrSettings(config) {
        config.JellyseerrEnabled = document.querySelector('#jellyseerrEnabled').checked;
        config.JellyseerrShowSearchResults = document.querySelector('#jellyseerrShowSearchResults').checked;
        config.ShowCollectionsInSearch = document.querySelector('#showCollectionsInSearch').checked;
        config.JellyseerrEnable4KRequests = document.querySelector('#jellyseerrEnable4kRequests').checked;
        config.JellyseerrEnable4KTvRequests = document.querySelector('#jellyseerrEnable4kTvRequests').checked;
        config.JellyseerrUseMoreInfoModal = document.querySelector('#jellyseerrUseMoreInfoModal').checked;
        config.JellyseerrAvailablePosterLinksToJellyfin = document.querySelector(
            '#jellyseerrAvailablePosterLinksToJellyfin',
        ).checked;
        config.JellyseerrShowAdvanced = document.querySelector('#jellyseerrShowAdvanced').checked;
        config.JellyseerrShowQuotaInfo = document.querySelector('#jellyseerrShowQuotaInfo').checked;
        config.JellyseerrShowSimilar = document.querySelector('#jellyseerrShowSimilar').checked;
        config.JellyseerrShowRecommended = document.querySelector('#jellyseerrShowRecommended').checked;
        config.JellyseerrShowRequestMoreOnSeries = document.querySelector('#jellyseerrShowRequestMoreOnSeries').checked;
        config.JellyseerrExcludeLibraryItems = document.querySelector('#jellyseerrExcludeLibraryItems').checked;
        config.JellyseerrExcludeBlocklistedItems = document.querySelector('#jellyseerrExcludeBlocklistedItems').checked;
        config.JellyseerrDisableCache = document.querySelector('#jellyseerrDisableCache').checked;
        config.JellyseerrResponseCacheTtlMinutes =
            parseInt(document.querySelector('#jellyseerrResponseCacheTtlMinutes').value, 10) || 10;
        config.JellyseerrUserIdCacheTtlMinutes =
            parseInt(document.querySelector('#jellyseerrUserIdCacheTtlMinutes').value, 10) || 30;
        config.JellyseerrShowNetworkDiscovery = document.querySelector('#jellyseerrShowNetworkDiscovery').checked;
        config.JellyseerrShowGenreDiscovery = document.querySelector('#jellyseerrShowGenreDiscovery').checked;
        config.JellyseerrShowTagDiscovery = document.querySelector('#jellyseerrShowTagDiscovery').checked;
        config.JellyseerrShowPersonDiscovery = document.querySelector('#jellyseerrShowPersonDiscovery').checked;
        config.JellyseerrShowCollectionDiscovery = document.querySelector('#jellyseerrShowCollectionDiscovery').checked;
        config.JellyseerrShowReportButton = document.querySelector('#jellyseerrShowReportButton').checked;
        config.JellyseerrShowIssueIndicator = document.querySelector('#jellyseerrShowIssueIndicator').checked;
        config.JellyseerrShowDetailPageLink = document.querySelector('#jellyseerrShowDetailPageLink').checked;
        config.JellyseerrShowDetailPageLinkAsText = document.querySelector(
            '#jellyseerrShowDetailPageLinkAsText',
        ).checked;
        config.ShowElsewhereOnJellyseerr = document.querySelector('#showElsewhereOnJellyseerr').checked;
        // validate scheme on save. Lines that don't parse as
        // http(s) are dropped with a warning so we never persist garbage
        // like "seerr.local" (no scheme) — which downstream string-concats
        // produce malformed URIs and a confusing UriFormatException buried
        // in logs. Empty textarea remains valid (Seerr can be disabled).
        (function () {
            const raw = (document.querySelector('#jellyseerrUrls').value || '')
                .split('\n')
                .map((u) => u.trim())
                .filter(Boolean);
            const valid = [];
            const invalid = [];
            for (const line of raw) {
                try {
                    const u = new URL(line);
                    if (u.protocol === 'http:' || u.protocol === 'https:') {
                        valid.push(line);
                    } else {
                        invalid.push(line);
                    }
                } catch (_) {
                    invalid.push(line);
                }
            }
            if (invalid.length > 0) {
                console.warn(
                    'Jellyfin Enhanced: dropping invalid Seerr URL(s) on save (must start with http:// or https://):',
                    invalid,
                );
                if (typeof Dashboard !== 'undefined' && Dashboard.alert) {
                    Dashboard.alert({
                        title: 'Invalid Seerr URL(s)',
                        message:
                            'These lines were dropped because they do not start with http:// or https://:\n\n' +
                            invalid.join('\n'),
                    });
                }
            }
            config.JellyseerrUrls = valid.join('\n');
        })();
        config.JellyseerrApiKey = (document.querySelector('#JellyseerrApiKey').value || '').replace(/\s/g, '');
        config.JellyseerrUrlMappings = (document.querySelector('#jellyseerrUrlMappings').value || '')
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean)
            .join('\n');
        config.AutoSeasonRequestEnabled = document.querySelector('#autoSeasonRequestEnabled').checked;
        config.AutoSeasonRequestRequireAllWatched = document.querySelector(
            '#autoSeasonRequestRequireAllWatched',
        ).checked;
        config.AutoSeasonRequestThresholdValue =
            parseInt(document.querySelector('#autoSeasonRequestThresholdValue').value, 10) || 2;
        config.AutoMovieRequestEnabled = document.querySelector('#autoMovieRequestEnabled').checked;
        const onStart = document.querySelector('#autoMovieRequestTriggerOnStart').checked;
        const onMinutes = document.querySelector('#autoMovieRequestTriggerOnMinutesWatched').checked;
        if (onStart && onMinutes) {
            config.AutoMovieRequestTriggerType = 'Both';
        } else if (onStart) {
            config.AutoMovieRequestTriggerType = 'OnStart';
        } else if (onMinutes) {
            config.AutoMovieRequestTriggerType = 'OnMinutesWatched';
        } else {
            config.AutoMovieRequestTriggerType = 'OnMinutesWatched'; // Default to minutes watched if nothing selected
        }
        const minutesValue = parseInt(document.querySelector('#autoMovieRequestMinutesWatched').value, 10);
        config.AutoMovieRequestMinutesWatched =
            isNaN(minutesValue) || minutesValue < 1 ? 20 : Math.min(minutesValue, 180);
        config.AutoMovieRequestCheckReleaseDate = document.querySelector('#autoMovieRequestCheckReleaseDate').checked;
        config.AutoMovieRequestQualityMode = document.querySelector('#autoMovieRequestQualityMode').value || 'default';
        config.AutoMovieRequestFallbackOn4k = document.querySelector('#autoMovieRequestFallbackOn4k').checked;
        var serverVal = parseInt(document.querySelector('#autoMovieRequestServer').value);
        config.AutoMovieRequestCustomServerId = !isNaN(serverVal) && serverVal >= 0 ? serverVal : -1;
        var profileVal = parseInt(document.querySelector('#autoMovieRequestProfile').value);
        config.AutoMovieRequestCustomProfileId = !isNaN(profileVal) && profileVal > 0 ? profileVal : 0;
        config.AutoMovieRequestCustomRootFolder = document.querySelector('#autoMovieRequestRootFolder').value || '';
        config.AddRequestedMediaToWatchlist = document.querySelector('#addRequestedMediaToWatchlist').checked;
        config.SyncJellyseerrWatchlist = document.querySelector('#syncJellyseerrWatchlist').checked;
        config.SyncJellyfinWatchlistToSeerr = document.querySelector('#syncJellyfinWatchlistToSeerr').checked;
        config.JellyseerrAutoImportUsers = document.querySelector('#jellyseerrAutoImportUsers').checked;
        syncBlockedUsersToHiddenInput();
        config.JellyseerrImportBlockedUsers = document.querySelector('#jellyseerrImportBlockedUsers').value || '';
        config.PreventWatchlistReAddition = document.querySelector('#preventWatchlistReAddition').checked;
        const retentionDays = parseInt(document.querySelector('#watchlistMemoryRetentionDays').value);
        config.WatchlistMemoryRetentionDays =
            isNaN(retentionDays) || retentionDays < 1 ? 365 : Math.min(retentionDays, 3650);
        config.TriggerSeerrScanOnItemAdded = document.querySelector('#triggerSeerrScanOnItemAdded').checked;
        const seerrScanDebounce = parseInt(document.querySelector('#seerrScanDebounceSeconds').value);
        config.SeerrScanDebounceSeconds =
            isNaN(seerrScanDebounce) || seerrScanDebounce < 5 ? 60 : Math.min(seerrScanDebounce, 3600);
        // Recommendations Page settings
        config.RecommendationsPageEnabled = document.querySelector('#recommendationsPageEnabled').checked;
        config.RecommendationsUseNativeTab = document.querySelector('#recommendationsUseNativeTab').checked;
        config.RecommendationsUsePluginPages = document.querySelector('#recommendationsUsePluginPages').checked;
        config.RecommendationsUseCustomTabs = document.querySelector('#recommendationsUseCustomTabs').checked;
        var __rAutoSave = document.querySelector('#recommendationsAutoCreateCustomTab');
        config.RecommendationsAutoCreateCustomTab = !!(__rAutoSave && __rAutoSave.checked);
    }

    function getSeerrCustomTabManagedEntries() {
        return [
            {
                masterKey: 'RecommendationsPageEnabled',
                parentKey: 'RecommendationsUseCustomTabs',
                autoKey: 'RecommendationsAutoCreateCustomTab',
                ownedKey: 'RecommendationsCustomTabJeOwned',
                title: 'Recommendations',
                html: '<div class="jellyfinenhanced recommendations"></div>',
            },
        ];
    }

    function getSeerrSectionDeps() {
        return [
            {
                tabSelector: '#seerr',
                checkFn: hasJellyseerrConfigured,
                bannerIcon: 'link_off',
                bannerTitle: 'Enable "Seerr integration" to configure',
                bannerHint: 'Provide a Seerr URL and API key in the Setup section above, then enable the integration.',
                bannerId: 'dep-banner-jellyseerr',
            },
        ];
    }

    function getSeerrIndividualDeps() {
        return [
            { id: 'showElsewhereOnJellyseerr', checkFn: hasTmdbKey, hint: 'Add a TMDB API Key to enable', icon: 'key' },
            { id: 'autoMovieRequestEnabled', checkFn: hasTmdbKey, hint: 'Add a TMDB API Key to enable', icon: 'key' },
            {
                id: 'recommendationsUsePluginPages',
                checkFn: function () {
                    return getPluginStatus().hasPluginPages !== false;
                },
                hint: 'Install Plugin Pages plugin to enable',
                icon: 'extension',
            },
            {
                id: 'recommendationsUseCustomTabs',
                checkFn: function () {
                    return getPluginStatus().hasCustomTabs !== false;
                },
                hint: 'Install Custom Tabs plugin to enable',
                icon: 'extension',
            },
        ];
    }

    function getSeerrCustomTabsV12Hints() {
        return [
            {
                customId: 'recommendationsUseCustomTabs',
                nativeId: 'recommendationsUseNativeTab',
                bannerId: 'je-v12-hint-recommendations',
            },
        ];
    }

    function getSeerrParentDeps() {
        return [
            {
                parent: 'jellyseerrShowSearchResults',
                label: 'Show Seerr Results in Search',
                children: ['showCollectionsInSearch'],
            },
            {
                parent: 'jellyseerrShowReportButton',
                label: 'Show Report Issue button',
                children: ['jellyseerrShowIssueIndicator'],
            },
            {
                parent: 'jellyseerrShowDetailPageLink',
                label: 'Show Seerr link on item detail pages',
                children: ['jellyseerrShowDetailPageLinkAsText'],
            },
            {
                parent: 'recommendationsPageEnabled',
                label: 'Enable Recommendations Page',
                children: [
                    'recommendationsUseNativeTab',
                    'recommendationsUsePluginPages',
                    'recommendationsUseCustomTabs',
                    'recommendationsAutoCreateCustomTab',
                ],
            },
            {
                parent: 'autoMovieRequestEnabled',
                label: 'Enable Automatic Movie Requests',
                children: [
                    'autoMovieRequestTriggerOnStart',
                    'autoMovieRequestTriggerOnMinutesWatched',
                    'autoMovieRequestMinutesWatched',
                    'autoMovieRequestCheckReleaseDate',
                    'autoMovieRequestQualityMode',
                    'autoMovieRequestFallbackOn4k',
                ],
            },
            {
                parent: 'autoSeasonRequestEnabled',
                label: 'Enable Automatic Season Requests',
                children: ['autoSeasonRequestRequireAllWatched', 'autoSeasonRequestThresholdValue'],
            },
            {
                parent: 'preventWatchlistReAddition',
                label: 'Prevent re-adding removed items',
                children: ['watchlistMemoryRetentionDays'],
            },
            {
                parent: 'triggerSeerrScanOnItemAdded',
                label: 'Trigger Seerr scan on item added',
                children: ['seerrScanDebounceSeconds'],
            },
        ];
    }

    function seerrConfigured() {
        return (
            !!document.querySelector('#jellyseerrUrls').value.trim() &&
            !!document.querySelector('#JellyseerrApiKey').value.trim()
        );
    }

    function describeSeerr(bool, feat) {
        // Seerr
        var seerrWarn = bool('jellyseerrEnabled') && !seerrConfigured();
        feat(
            'Seerr integration',
            bool('jellyseerrEnabled'),
            'seerr',
            seerrWarn ? 'Enabled but Seerr URL or API key missing' : 'Enabled',
            seerrWarn,
        );
        var seerrLinkOn = bool('jellyseerrEnabled') && bool('jellyseerrShowDetailPageLink');
        var seerrLinkWarn = seerrLinkOn && !seerrConfigured();
        feat(
            'Seerr detail-page link',
            seerrLinkOn,
            'seerr',
            seerrLinkWarn ? 'Enabled but Seerr URL or API key missing' : 'Enabled',
            seerrLinkWarn,
        );
        // Watchlist (Seerr tab). Sync and "add requested → watchlist" both
        // need KefinTweaks to actually render the watchlist UI in Jellyfin;
        // the feature writes the data either way, but the user can't see
        // it without KefinTweaks.
        var watchlistAny = bool('addRequestedMediaToWatchlist') || bool('syncJellyseerrWatchlist');
        var watchlistWarn = watchlistAny && getPluginStatus().hasKefinTweaks !== true;
        feat(
            'Watchlist sync',
            watchlistAny,
            'seerr',
            watchlistWarn ? "Enabled but KefinTweaks plugin not installed (watchlist UI won't render)" : 'Enabled',
            watchlistWarn,
        );
    }

    function describeStatusSeerr(pushCard) {
        // Seerr
        var seerrEnabled = document.getElementById('jellyseerrEnabled');
        var seerrUrls = readFieldValue('#jellyseerrUrls');
        var seerrKey = readFieldValue('#JellyseerrApiKey');
        if (seerrEnabled && seerrEnabled.checked) {
            if (seerrUrls && seerrKey) {
                var r = checklistRowState('seerr', 'Configured, not yet verified');
                var urlCount = seerrUrls.split(/\r?\n/).filter(function (u) {
                    return u.trim();
                }).length;
                pushCard({
                    id: 'seerr',
                    name: 'Seerr',
                    tab: 'seerr',
                    icon: 'bolt',
                    state: r.state === 'amber' ? 'warn' : r.state === 'pending' ? 'pending' : r.state,
                    detail: r.detail + (urlCount > 1 ? ' · ' + urlCount + ' URLs' : ''),
                });
            } else {
                pushCard({
                    id: 'seerr',
                    name: 'Seerr',
                    tab: 'seerr',
                    icon: 'bolt',
                    state: 'warn',
                    detail:
                        !seerrUrls && !seerrKey
                            ? 'Enabled but URL and API key missing'
                            : !seerrUrls
                              ? 'URL missing'
                              : 'API key missing',
                });
            }
        } else if (seerrUrls || seerrKey) {
            pushCard({
                id: 'seerr',
                name: 'Seerr',
                tab: 'seerr',
                icon: 'bolt',
                state: 'off',
                detail: 'Configured but integration disabled',
            });
        }
    }

    /**
     * Returns true iff at least one configured Seerr URL parses as an
     * http(s) URL. A non-empty textarea full of garbage like "seerr.local"
     * (no scheme) used to evaluate truthy here, so the dependency banner
     * would hide and Seerr feature toggles would unlock — features that
     * could never actually work.          */
    function hasAtLeastOneValidSeerrUrl(value) {
        if (!value) return false;
        const lines = String(value)
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        for (const line of lines) {
            try {
                const u = new URL(line);
                if (u.protocol === 'http:' || u.protocol === 'https:') {
                    return true;
                }
            } catch (_) {
                // not a valid URL — try next line
            }
        }
        return false;
    }

    /**
     * Checks whether Jellyseerr is enabled with both a URL and API key configured.
     * @returns {boolean} True if Jellyseerr is fully configured
     */
    function hasJellyseerrConfigured() {
        return (
            document.querySelector('#jellyseerrEnabled').checked &&
            hasAtLeastOneValidSeerrUrl(document.querySelector('#jellyseerrUrls').value) &&
            document.querySelector('#JellyseerrApiKey').value.trim().length > 0
        );
    }

    function getDependencies() {
        return {
            sections: getSeerrSectionDeps(),
            individual: getSeerrIndividualDeps(),
            customTabsHints: getSeerrCustomTabsV12Hints(),
            parents: getSeerrParentDeps(),
        };
    }
    return {
        load: loadSeerrSettings,
        read: readSeerrSettings,
        getSeerrCustomTabManagedEntries,
        seerrConfigured,
        describeSeerr,
        describeStatusSeerr,
        dispose: () => lifecycle.dispose(),
        getDependencies,
    };
}
