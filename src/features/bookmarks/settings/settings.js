/** Feature settings and its private editor state. */
function createBookmarksSettings({ getPluginStatus }) {
    function loadBookmarksSettings(config) {
        document.querySelector('#bookmarksEnabled').checked = config.BookmarksEnabled !== false;
        document.querySelector('#bookmarksUsePluginPages').checked = config.BookmarksUsePluginPages === true;
        document.querySelector('#bookmarksUseNativeTab').checked = config.BookmarksUseNativeTab === true;
        document.querySelector('#bookmarksUseCustomTabs').checked = config.BookmarksUseCustomTabs === true;
        var __bAuto = document.querySelector('#bookmarksAutoCreateCustomTab');
        if (__bAuto) __bAuto.checked = config.BookmarksAutoCreateCustomTab === true;
    }

    function readBookmarksSettings(config) {
        config.BookmarksEnabled = document.querySelector('#bookmarksEnabled').checked;
        config.BookmarksUsePluginPages = document.querySelector('#bookmarksUsePluginPages').checked;
        config.BookmarksUseNativeTab = document.querySelector('#bookmarksUseNativeTab').checked;
        config.BookmarksUseCustomTabs = document.querySelector('#bookmarksUseCustomTabs').checked;
        var __bAutoSave = document.querySelector('#bookmarksAutoCreateCustomTab');
        config.BookmarksAutoCreateCustomTab = !!(__bAutoSave && __bAutoSave.checked);
    }

    function getBookmarksCustomTabManagedEntries() {
        return [
            {
                masterKey: 'BookmarksEnabled',
                parentKey: 'BookmarksUseCustomTabs',
                autoKey: 'BookmarksAutoCreateCustomTab',
                ownedKey: 'BookmarksCustomTabJeOwned',
                title: 'Bookmarks',
                html: '<div class="sections bookmarks"></div>',
            },
        ];
    }

    function getBookmarksIndividualDeps() {
        return [
            {
                id: 'bookmarksUsePluginPages',
                checkFn: function () {
                    return getPluginStatus().hasPluginPages !== false;
                },
                hint: 'Install Plugin Pages plugin to enable',
                icon: 'extension',
            },
            {
                id: 'bookmarksUseCustomTabs',
                checkFn: function () {
                    return getPluginStatus().hasCustomTabs !== false;
                },
                hint: 'Install Custom Tabs plugin to enable',
                icon: 'extension',
            },
        ];
    }

    function getBookmarksCustomTabsV12Hints() {
        return [
            {
                customId: 'bookmarksUseCustomTabs',
                nativeId: 'bookmarksUseNativeTab',
                bannerId: 'je-v12-hint-bookmarks',
            },
        ];
    }

    function getBookmarksParentDeps() {
        return [
            {
                parent: 'bookmarksEnabled',
                label: 'Enable Bookmarks',
                children: ['bookmarksUsePluginPages', 'bookmarksUseNativeTab', 'bookmarksUseCustomTabs'],
            },
        ];
    }

    function describeBookmarks(bool, feat) {
        // Pages
        var bookmarksWarn =
            bool('bookmarksEnabled') &&
            ((bool('bookmarksUsePluginPages') && getPluginStatus().hasPluginPages !== true) ||
                (bool('bookmarksUseCustomTabs') && getPluginStatus().hasCustomTabs !== true));
        feat(
            'Bookmarks',
            bool('bookmarksEnabled'),
            'pages',
            bookmarksWarn ? 'Missing required integration plugin' : 'Enabled',
            bookmarksWarn,
        );
    }

    function getDependencies() {
        return {
            individual: getBookmarksIndividualDeps(),
            customTabsHints: getBookmarksCustomTabsV12Hints(),
            parents: getBookmarksParentDeps(),
        };
    }
    return {
        load: loadBookmarksSettings,
        read: readBookmarksSettings,
        getBookmarksCustomTabManagedEntries,
        describeBookmarks,
        getDependencies,
    };
}
