/** Feature settings and its private editor state. */
function createActivitySettings({ getPluginStatus }) {
    function loadActivitySettings(config) {
        document.querySelector('#coloredActivityIconsEnabled').checked = config.ColoredActivityIconsEnabled;
        document.querySelector('#activityFeedEnabled').checked = config.ActivityFeedEnabled || false;
        document.querySelector('#activityFeedShowWatched').checked = config.ActivityFeedShowWatched !== false;
        document.querySelector('#activityFeedShowFavorited').checked = config.ActivityFeedShowFavorited !== false;
        document.querySelector('#activityFeedShowReviewed').checked = config.ActivityFeedShowReviewed !== false;
        document.querySelector('#activityFeedShowActiveStreams').checked =
            config.ActivityFeedShowActiveStreams !== false;
        document.querySelector('#activityFeedUseNativeTab').checked = config.ActivityFeedUseNativeTab === true;
        document.querySelector('#activityFeedUsePluginPages').checked = config.ActivityFeedUsePluginPages === true;
        document.querySelector('#activityFeedUseCustomTabs').checked = config.ActivityFeedUseCustomTabs === true;
        var __aAuto = document.querySelector('#activityFeedAutoCreateCustomTab');
        if (__aAuto) __aAuto.checked = config.ActivityFeedAutoCreateCustomTab === true;
    }

    function readActivitySettings(config) {
        config.ColoredActivityIconsEnabled = document.querySelector('#coloredActivityIconsEnabled').checked;
        config.ActivityFeedEnabled = document.querySelector('#activityFeedEnabled').checked;
        config.ActivityFeedShowWatched = document.querySelector('#activityFeedShowWatched').checked;
        config.ActivityFeedShowFavorited = document.querySelector('#activityFeedShowFavorited').checked;
        config.ActivityFeedShowReviewed = document.querySelector('#activityFeedShowReviewed').checked;
        config.ActivityFeedShowActiveStreams = document.querySelector('#activityFeedShowActiveStreams').checked;
        config.ActivityFeedUseNativeTab = document.querySelector('#activityFeedUseNativeTab').checked;
        config.ActivityFeedUsePluginPages = document.querySelector('#activityFeedUsePluginPages').checked;
        config.ActivityFeedUseCustomTabs = document.querySelector('#activityFeedUseCustomTabs').checked;
        var __aAutoSave = document.querySelector('#activityFeedAutoCreateCustomTab');
        config.ActivityFeedAutoCreateCustomTab = !!(__aAutoSave && __aAutoSave.checked);
    }

    function getActivityCustomTabManagedEntries() {
        return [
            {
                masterKey: 'ActivityFeedEnabled',
                parentKey: 'ActivityFeedUseCustomTabs',
                autoKey: 'ActivityFeedAutoCreateCustomTab',
                ownedKey: 'ActivityFeedCustomTabJeOwned',
                title: 'Activity',
                html: '<div class="jellyfinenhanced activity"></div>',
            },
        ];
    }

    function getActivityIndividualDeps() {
        return [
            {
                id: 'activityFeedUsePluginPages',
                checkFn: function () {
                    return getPluginStatus().hasPluginPages !== false;
                },
                hint: 'Install Plugin Pages plugin to enable',
                icon: 'extension',
            },
            {
                id: 'activityFeedUseCustomTabs',
                checkFn: function () {
                    return getPluginStatus().hasCustomTabs !== false;
                },
                hint: 'Install Custom Tabs plugin to enable',
                icon: 'extension',
            },
        ];
    }

    function getActivityCustomTabsV12Hints() {
        return [
            {
                customId: 'activityFeedUseCustomTabs',
                nativeId: 'activityFeedUseNativeTab',
                bannerId: 'je-v12-hint-activityFeed',
            },
        ];
    }

    function getActivityParentDeps() {
        return [
            {
                parent: 'activityFeedEnabled',
                label: 'Enable Activity Feed',
                children: [
                    'activityFeedShowWatched',
                    'activityFeedShowFavorited',
                    'activityFeedShowReviewed',
                    'activityFeedShowActiveStreams',
                    'activityFeedUseNativeTab',
                    'activityFeedUsePluginPages',
                    'activityFeedUseCustomTabs',
                    'activityFeedAutoCreateCustomTab',
                ],
            },
        ];
    }

    function getDependencies() {
        return {
            individual: getActivityIndividualDeps(),
            customTabsHints: getActivityCustomTabsV12Hints(),
            parents: getActivityParentDeps(),
        };
    }
    return {
        load: loadActivitySettings,
        read: readActivitySettings,
        getActivityCustomTabManagedEntries,
        getDependencies,
    };
}
