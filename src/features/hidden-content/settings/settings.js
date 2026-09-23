/** Feature settings and its private editor state. */
function createHiddenContentSettings({ getPluginStatus }) {
    function loadHiddenContentSettings(config) {
        document.querySelector('#removeContinueWatchingEnabled').checked = config.RemoveContinueWatchingEnabled;
        // Hidden Content settings
        document.querySelector('#hiddenContentEnabled').checked = config.HiddenContentEnabled || false;
        document.querySelector('#hiddenContentUsePluginPages').checked = config.HiddenContentUsePluginPages === true;
        document.querySelector('#hiddenContentUseNativeTab').checked = config.HiddenContentUseNativeTab === true;
        document.querySelector('#hiddenContentUseCustomTabs').checked = config.HiddenContentUseCustomTabs === true;
        // Admin cross-user view + management; default on for existing configs.
        document.querySelector('#hiddenContentAdmin').checked = config.HiddenContentAdmin !== false;
        var __hAuto = document.querySelector('#hiddenContentAutoCreateCustomTab');
        if (__hAuto) __hAuto.checked = config.HiddenContentAutoCreateCustomTab === true;
        // Hidden Content per-user defaults, same name as on the user side, prefixed HiddenContentDefault*.
        var __hcDefaults = [
            ['hiddenContentDefaultEnabled', 'HiddenContentDefaultEnabled', true],
            ['hiddenContentDefaultShowHideButtons', 'HiddenContentDefaultShowHideButtons', true],
            ['hiddenContentDefaultShowHideConfirmation', 'HiddenContentDefaultShowHideConfirmation', true],
            ['hiddenContentDefaultShowButtonJellyseerr', 'HiddenContentDefaultShowButtonJellyseerr', true],
            ['hiddenContentDefaultShowButtonLibrary', 'HiddenContentDefaultShowButtonLibrary', false],
            ['hiddenContentDefaultShowButtonDetails', 'HiddenContentDefaultShowButtonDetails', true],
            ['hiddenContentDefaultShowButtonCast', 'HiddenContentDefaultShowButtonCast', false],
            ['hiddenContentDefaultFilterLibrary', 'HiddenContentDefaultFilterLibrary', true],
            ['hiddenContentDefaultFilterDiscovery', 'HiddenContentDefaultFilterDiscovery', true],
            ['hiddenContentDefaultFilterSearch', 'HiddenContentDefaultFilterSearch', false],
            ['hiddenContentDefaultFilterCalendar', 'HiddenContentDefaultFilterCalendar', true],
            ['hiddenContentDefaultFilterUpcoming', 'HiddenContentDefaultFilterUpcoming', true],
            ['hiddenContentDefaultFilterRecommendations', 'HiddenContentDefaultFilterRecommendations', true],
            ['hiddenContentDefaultFilterRequests', 'HiddenContentDefaultFilterRequests', true],
            ['hiddenContentDefaultFilterNextUp', 'HiddenContentDefaultFilterNextUp', true],
            ['hiddenContentDefaultFilterContinueWatching', 'HiddenContentDefaultFilterContinueWatching', true],
            [
                'hiddenContentDefaultExperimentalHideCollections',
                'HiddenContentDefaultExperimentalHideCollections',
                false,
            ],
        ];
        __hcDefaults.forEach(function (t) {
            var el = document.querySelector('#' + t[0]);
            if (!el) return;
            var v = config[t[1]];
            el.checked = v === undefined || v === null ? t[2] : !!v;
        });
    }

    function readHiddenContentSettings(config) {
        config.RemoveContinueWatchingEnabled = document.querySelector('#removeContinueWatchingEnabled').checked;
        // Hidden Content settings
        config.HiddenContentEnabled = document.querySelector('#hiddenContentEnabled').checked;
        config.HiddenContentUsePluginPages = document.querySelector('#hiddenContentUsePluginPages').checked;
        config.HiddenContentUseNativeTab = document.querySelector('#hiddenContentUseNativeTab').checked;
        config.HiddenContentUseCustomTabs = document.querySelector('#hiddenContentUseCustomTabs').checked;
        config.HiddenContentAdmin = document.querySelector('#hiddenContentAdmin').checked;
        var __hAutoSave = document.querySelector('#hiddenContentAutoCreateCustomTab');
        config.HiddenContentAutoCreateCustomTab = !!(__hAutoSave && __hAutoSave.checked);
        // Hidden Content per-user defaults
        [
            'hiddenContentDefaultEnabled',
            'hiddenContentDefaultShowHideButtons',
            'hiddenContentDefaultShowHideConfirmation',
            'hiddenContentDefaultShowButtonJellyseerr',
            'hiddenContentDefaultShowButtonLibrary',
            'hiddenContentDefaultShowButtonDetails',
            'hiddenContentDefaultShowButtonCast',
            'hiddenContentDefaultFilterLibrary',
            'hiddenContentDefaultFilterDiscovery',
            'hiddenContentDefaultFilterSearch',
            'hiddenContentDefaultFilterCalendar',
            'hiddenContentDefaultFilterUpcoming',
            'hiddenContentDefaultFilterRecommendations',
            'hiddenContentDefaultFilterRequests',
            'hiddenContentDefaultFilterNextUp',
            'hiddenContentDefaultFilterContinueWatching',
            'hiddenContentDefaultExperimentalHideCollections',
        ].forEach(function (id) {
            var el = document.querySelector('#' + id);
            if (!el) return;
            var pascal = id.charAt(0).toUpperCase() + id.slice(1);
            config[pascal] = !!el.checked;
        });
    }

    function getHiddenContentCustomTabManagedEntries() {
        return [
            {
                masterKey: 'HiddenContentEnabled',
                parentKey: 'HiddenContentUseCustomTabs',
                autoKey: 'HiddenContentAutoCreateCustomTab',
                ownedKey: 'HiddenContentCustomTabJeOwned',
                title: 'Hidden Content',
                html: '<div class="jellyfinenhanced hidden-content"></div>',
            },
        ];
    }

    function getHiddenContentIndividualDeps() {
        return [
            {
                id: 'hiddenContentUsePluginPages',
                checkFn: function () {
                    return getPluginStatus().hasPluginPages !== false;
                },
                hint: 'Install Plugin Pages plugin to enable',
                icon: 'extension',
            },
            {
                id: 'hiddenContentUseCustomTabs',
                checkFn: function () {
                    return getPluginStatus().hasCustomTabs !== false;
                },
                hint: 'Install Custom Tabs plugin to enable',
                icon: 'extension',
            },
        ];
    }

    function getHiddenContentCustomTabsV12Hints() {
        return [
            {
                customId: 'hiddenContentUseCustomTabs',
                nativeId: 'hiddenContentUseNativeTab',
                bannerId: 'je-v12-hint-hiddenContent',
            },
        ];
    }

    function getHiddenContentParentDeps() {
        return [
            {
                parent: 'hiddenContentEnabled',
                label: 'Enable Hidden Content',
                children: ['hiddenContentUsePluginPages', 'hiddenContentUseNativeTab', 'hiddenContentUseCustomTabs'],
            },
        ];
    }

    function describeHiddenContent(bool, feat) {
        var hcWarn =
            bool('hiddenContentEnabled') &&
            ((bool('hiddenContentUsePluginPages') && getPluginStatus().hasPluginPages !== true) ||
                (bool('hiddenContentUseCustomTabs') && getPluginStatus().hasCustomTabs !== true));
        feat(
            'Hidden Content',
            bool('hiddenContentEnabled'),
            'pages',
            hcWarn ? 'Missing required integration plugin' : 'Enabled',
            hcWarn,
        );
    }

    function getDependencies() {
        return {
            individual: getHiddenContentIndividualDeps(),
            customTabsHints: getHiddenContentCustomTabsV12Hints(),
            parents: getHiddenContentParentDeps(),
        };
    }
    return {
        load: loadHiddenContentSettings,
        read: readHiddenContentSettings,
        getHiddenContentCustomTabManagedEntries,
        describeHiddenContent,
        getDependencies,
    };
}
