/** Feature settings and its private editor state. */
function createDownloadsSettings({ anyArrConfigured, seerrConfigured, getPluginStatus }) {
    function loadDownloadsSettings(config) {
        // Requests Page settings
        document.querySelector('#downloadsPageEnabled').checked = config.DownloadsPageEnabled !== false;
        document.querySelector('#showDownloadsInRequests').checked = config.ShowDownloadsInRequests !== false;
        document.querySelector('#downloadsFilterByUserRequests').checked =
            config.DownloadsFilterByUserRequests !== false;
        document.querySelector('#downloadsPageShowIssues').checked = config.DownloadsPageShowIssues === true;
        document.querySelector('#downloadsShowHistory').checked = config.DownloadsShowHistory !== false;
        document.querySelector('#downloadsHistoryAdminOnly').checked = config.DownloadsHistoryAdminOnly === true;
        document.querySelector('#downloadsUsePluginPages').checked = config.DownloadsUsePluginPages !== false;
        document.querySelector('#downloadsUseNativeTab').checked = config.DownloadsUseNativeTab === true;
        document.querySelector('#downloadsUseCustomTabs').checked = config.DownloadsUseCustomTabs === true;
        var __dAuto = document.querySelector('#downloadsAutoCreateCustomTab');
        if (__dAuto) __dAuto.checked = config.DownloadsAutoCreateCustomTab === true;
        document.querySelector('#downloadsPagePollingEnabled').checked = config.DownloadsPagePollingEnabled !== false;
        document.querySelector('#downloadsPollIntervalSeconds').value =
            config.DownloadsPollIntervalSeconds !== undefined && config.DownloadsPollIntervalSeconds !== null
                ? config.DownloadsPollIntervalSeconds
                : 30;
    }

    function readDownloadsSettings(config) {
        // Requests Page settings
        config.DownloadsPageEnabled = document.querySelector('#downloadsPageEnabled').checked;
        config.ShowDownloadsInRequests = document.querySelector('#showDownloadsInRequests').checked;
        config.DownloadsFilterByUserRequests = document.querySelector('#downloadsFilterByUserRequests').checked;
        config.DownloadsPageShowIssues = document.querySelector('#downloadsPageShowIssues').checked;
        config.DownloadsShowHistory = document.querySelector('#downloadsShowHistory').checked;
        config.DownloadsHistoryAdminOnly = document.querySelector('#downloadsHistoryAdminOnly').checked;
        config.DownloadsUsePluginPages = document.querySelector('#downloadsUsePluginPages').checked;
        config.DownloadsPagePollingEnabled = document.querySelector('#downloadsPagePollingEnabled').checked;
        const pollInterval = parseInt(document.querySelector('#downloadsPollIntervalSeconds').value, 10);
        config.DownloadsPollIntervalSeconds = pollInterval >= 30 ? pollInterval : 30;
        config.DownloadsUseCustomTabs = document.querySelector('#downloadsUseCustomTabs').checked;
        config.DownloadsUseNativeTab = document.querySelector('#downloadsUseNativeTab').checked;
        var __dAutoSave = document.querySelector('#downloadsAutoCreateCustomTab');
        config.DownloadsAutoCreateCustomTab = !!(__dAutoSave && __dAutoSave.checked);
    }

    function getDownloadsCustomTabManagedEntries() {
        return [
            {
                masterKey: 'DownloadsPageEnabled',
                parentKey: 'DownloadsUseCustomTabs',
                autoKey: 'DownloadsAutoCreateCustomTab',
                ownedKey: 'DownloadsCustomTabJeOwned',
                title: 'Requests',
                html: '<div class="jellyfinenhanced requests"></div>',
            },
        ];
    }

    function getDownloadsIndividualDeps() {
        return [
            {
                id: 'downloadsUsePluginPages',
                checkFn: function () {
                    return getPluginStatus().hasPluginPages !== false;
                },
                hint: 'Install Plugin Pages plugin to enable',
                icon: 'extension',
            },
            {
                id: 'downloadsUseCustomTabs',
                checkFn: function () {
                    return getPluginStatus().hasCustomTabs !== false;
                },
                hint: 'Install Custom Tabs plugin to enable',
                icon: 'extension',
            },
        ];
    }

    function getDownloadsCustomTabsV12Hints() {
        return [
            {
                customId: 'downloadsUseCustomTabs',
                nativeId: 'downloadsUseNativeTab',
                bannerId: 'je-v12-hint-downloads',
            },
        ];
    }

    function getDownloadsParentDeps() {
        return [
            {
                parent: 'downloadsPageEnabled',
                label: 'Enable Requests Page',
                children: [
                    'showDownloadsInRequests',
                    'downloadsPageShowIssues',
                    'downloadsShowHistory',
                    'downloadsUsePluginPages',
                    'downloadsUseNativeTab',
                    'downloadsUseCustomTabs',
                    'downloadsPagePollingEnabled',
                ],
            },
            {
                parent: 'showDownloadsInRequests',
                label: 'Show Downloads in Requests Page',
                children: ['downloadsFilterByUserRequests'],
            },
            {
                parent: 'downloadsShowHistory',
                label: 'Show Download History Section',
                children: ['downloadsHistoryAdminOnly'],
            },
            {
                parent: 'downloadsPagePollingEnabled',
                label: 'Enable Auto-Refresh',
                children: ['downloadsPollIntervalSeconds'],
            },
        ];
    }

    function describeDownloads(bool, feat) {
        var reqWarn = bool('downloadsPageEnabled') && !seerrConfigured() && !anyArrConfigured();
        feat(
            'Requests Page',
            bool('downloadsPageEnabled'),
            'pages',
            reqWarn ? 'Enabled but neither Seerr nor *arr is configured' : 'Enabled',
            reqWarn,
        );
    }

    function getDependencies() {
        return {
            individual: getDownloadsIndividualDeps(),
            customTabsHints: getDownloadsCustomTabsV12Hints(),
            parents: getDownloadsParentDeps(),
        };
    }
    return {
        load: loadDownloadsSettings,
        read: readDownloadsSettings,
        getDownloadsCustomTabManagedEntries,
        describeDownloads,
        getDependencies,
    };
}
