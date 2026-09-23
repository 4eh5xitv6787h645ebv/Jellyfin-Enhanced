/** Feature settings and its private editor state. */
function createSeerrAutoMovieQuality({ lifecycle }) {
    let serversGeneration = 0;
    let detailsGeneration = 0;
    // Auto Movie Request - Quality Profile Mode helpers
    function clearSelectOptions(selectEl) {
        while (selectEl.options.length > 0) {
            selectEl.remove(0);
        }
    }

    function addSelectOption(selectEl, value, text) {
        var opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        selectEl.appendChild(opt);
    }

    function resetSelectWithMessage(selectEl, value, message) {
        clearSelectOptions(selectEl);
        addSelectOption(selectEl, value, message);
    }

    function initAutoMovieQualityMode() {
        var qualityModeSelect = document.querySelector('#autoMovieRequestQualityMode');
        var customSettingsDiv = document.querySelector('#autoMovieRequestCustomSettings');
        if (!qualityModeSelect || !customSettingsDiv) return;

        lifecycle.listen(qualityModeSelect, 'change', function () {
            if (lifecycle.disposed || document.querySelector('#autoMovieRequestQualityMode') !== qualityModeSelect)
                return;
            customSettingsDiv.style.display = qualityModeSelect.value === 'custom' ? 'block' : 'none';
            if (qualityModeSelect.value === 'custom') {
                loadAutoMovieRadarrServers();
            } else {
                // Changing modes also retires pending reads from the old editor state.
                serversGeneration++;
                detailsGeneration++;
            }
        });
    }

    function loadAutoMovieRadarrServers(savedConfig) {
        if (lifecycle.disposed) return;
        var serverSelect = document.querySelector('#autoMovieRequestServer');
        var profileSelect = document.querySelector('#autoMovieRequestProfile');
        var folderSelect = document.querySelector('#autoMovieRequestRootFolder');
        var qualityModeSelect = document.querySelector('#autoMovieRequestQualityMode');
        var qualityMode = qualityModeSelect?.value;
        var generation = ++serversGeneration;
        detailsGeneration++;
        if (!serverSelect) return;
        var isCurrent = () =>
            !lifecycle.disposed &&
            generation === serversGeneration &&
            document.querySelector('#autoMovieRequestServer') === serverSelect &&
            document.querySelector('#autoMovieRequestProfile') === profileSelect &&
            document.querySelector('#autoMovieRequestRootFolder') === folderSelect &&
            document.querySelector('#autoMovieRequestQualityMode') === qualityModeSelect &&
            qualityModeSelect?.value === qualityMode;

        resetSelectWithMessage(serverSelect, '-1', 'Loading...');

        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/jellyseerr/radarr'),
            dataType: 'json',
        })
            .then(function (servers) {
                if (!isCurrent()) return;
                resetSelectWithMessage(serverSelect, '-1', 'Select Server...');
                var serverList = Array.isArray(servers) ? servers : [servers];
                serverList.forEach(function (server) {
                    if (server && typeof server.id === 'number') {
                        addSelectOption(serverSelect, server.id, server.name || 'Server ' + server.id);
                    }
                });

                var savedServerId = savedConfig ? savedConfig.AutoMovieRequestCustomServerId : null;
                if (savedServerId !== null && savedServerId !== undefined && savedServerId >= 0) {
                    serverSelect.value = savedServerId;
                    loadAutoMovieServerDetails(savedServerId, savedConfig);
                }
            })
            .catch(function (err) {
                if (!isCurrent()) return;
                resetSelectWithMessage(serverSelect, '-1', 'Failed to load servers');
                console.warn('[Auto-Movie-Request] Failed to load Radarr servers:', err);
            });

        // The lifecycle replaces this binding on reload, including its current
        // element references, without accumulating change listeners.
        lifecycle.listen(
            serverSelect,
            'change',
            function () {
                if (lifecycle.disposed || document.querySelector('#autoMovieRequestServer') !== serverSelect) return;
                serversGeneration++;
                detailsGeneration++;
                var serverId = parseInt(serverSelect.value);
                if (!isNaN(serverId) && serverId >= 0) {
                    loadAutoMovieServerDetails(serverId);
                } else {
                    resetSelectWithMessage(profileSelect, '0', 'Select a server first...');
                    resetSelectWithMessage(folderSelect, '', 'Select a server first...');
                }
            },
            undefined,
            'radarr-server-selection',
        );
    }

    function loadAutoMovieServerDetails(serverId, savedConfig) {
        if (lifecycle.disposed) return;
        var serverSelect = document.querySelector('#autoMovieRequestServer');
        var profileSelect = document.querySelector('#autoMovieRequestProfile');
        var folderSelect = document.querySelector('#autoMovieRequestRootFolder');
        var qualityModeSelect = document.querySelector('#autoMovieRequestQualityMode');
        var qualityMode = qualityModeSelect?.value;
        // A saved server that Seerr no longer lists leaves the select at ''. Track the
        // select's own value so the response still replaces the "Loading..." placeholders.
        var selectedServer = serverSelect?.value;
        var generation = ++detailsGeneration;
        var serverGeneration = serversGeneration;
        if (!profileSelect || !folderSelect) return;
        var isCurrent = () =>
            !lifecycle.disposed &&
            generation === detailsGeneration &&
            serverGeneration === serversGeneration &&
            document.querySelector('#autoMovieRequestServer') === serverSelect &&
            document.querySelector('#autoMovieRequestProfile') === profileSelect &&
            document.querySelector('#autoMovieRequestRootFolder') === folderSelect &&
            document.querySelector('#autoMovieRequestQualityMode') === qualityModeSelect &&
            serverSelect?.value === selectedServer &&
            qualityModeSelect?.value === qualityMode;

        resetSelectWithMessage(profileSelect, '0', 'Loading...');
        resetSelectWithMessage(folderSelect, '', 'Loading...');

        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/jellyseerr/radarr/' + serverId),
            dataType: 'json',
        })
            .then(function (details) {
                if (!isCurrent()) return;
                resetSelectWithMessage(profileSelect, '0', 'Select Profile...');
                (details.profiles || []).forEach(function (profile) {
                    addSelectOption(profileSelect, profile.id, profile.name || 'Profile ' + profile.id);
                });

                resetSelectWithMessage(folderSelect, '', 'Select Folder...');
                (details.rootFolders || []).forEach(function (folder) {
                    addSelectOption(folderSelect, folder.path, folder.path);
                });

                var savedProfileId = (savedConfig && savedConfig.AutoMovieRequestCustomProfileId) || 0;
                if (savedProfileId > 0) profileSelect.value = savedProfileId;
                var savedRootFolder = (savedConfig && savedConfig.AutoMovieRequestCustomRootFolder) || '';
                if (savedRootFolder) folderSelect.value = savedRootFolder;
            })
            .catch(function (err) {
                if (!isCurrent()) return;
                resetSelectWithMessage(profileSelect, '0', 'Failed to load');
                resetSelectWithMessage(folderSelect, '', 'Failed to load');
                console.warn('[Auto-Movie-Request] Failed to load server details:', err);
            });
    }

    return { initAutoMovieQualityMode, loadAutoMovieRadarrServers, dispose: () => lifecycle.dispose() };
}
