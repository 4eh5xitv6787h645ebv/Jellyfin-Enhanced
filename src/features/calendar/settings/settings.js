/** Feature settings and its private editor state. */
function createCalendarSettings({ anyArrConfigured, getPluginStatus }) {
    function loadCalendarSettings(config) {
        document.querySelector('#shokoUrlMappings').value = config.ShokoUrlMappings || '';
        document.querySelector('#shokoUrl').value = config.ShokoUrl;
        document.querySelector('#shokoApiKey').value = config.ShokoApiKey;
        document.querySelector('#shokoShowEpisodes').checked = config.ShokoShowEpisodes !== false;
        document.querySelector('#shokoShowSpecials').checked = config.ShokoShowSpecials === true;
        document.querySelector('#shokoShowCredits').checked = config.ShokoShowCredits === true;
        document.querySelector('#shokoShowTrailers').checked = config.ShokoShowTrailers === true;
        document.querySelector('#shokoShowParodies').checked = config.ShokoShowParodies === true;
        document.querySelector('#shokoShowOther').checked = config.ShokoShowOther === true;
        // Calendar Page settings
        document.querySelector('#calendarPageEnabled').checked = config.CalendarPageEnabled !== false;
        document.querySelector('#calendarUseCustomTabs').checked = config.CalendarUseCustomTabs === true;
        document.querySelector('#calendarUseNativeTab').checked = config.CalendarUseNativeTab === true;
        var __cAuto = document.querySelector('#calendarAutoCreateCustomTab');
        if (__cAuto) __cAuto.checked = config.CalendarAutoCreateCustomTab === true;
        document.querySelector('#calendarUsePluginPages').checked = config.CalendarUsePluginPages !== false;
        document.querySelector('#calendarFirstDayOfWeek').value = config.CalendarFirstDayOfWeek || 'Monday';
        document.querySelector('#calendarTimeFormat').value = config.CalendarTimeFormat || '5pm/5:30pm';
        document.querySelector('#calendarHighlightFavorites').checked = config.CalendarHighlightFavorites || false;
        document.querySelector('#calendarHighlightWatchedSeries').checked =
            config.CalendarHighlightWatchedSeries || false;
        document.querySelector('#calendarFilterByLibraryAccess').checked =
            config.CalendarFilterByLibraryAccess !== false;
        document.querySelector('#calendarShowOnlyRequested').checked = config.CalendarShowOnlyRequested || false;
        document.querySelector('#calendarForceOnlyRequested').checked = config.CalendarForceOnlyRequested || false;
    }

    function readCalendarSettings(config) {
        config.ShokoUrlMappings = document.querySelector('#shokoUrlMappings').value || '';
        config.ShokoUrl = document.querySelector('#shokoUrl').value;
        config.ShokoApiKey = (document.querySelector('#shokoApiKey').value || '').replace(/\s/g, '');
        config.ShokoShowEpisodes = document.querySelector('#shokoShowEpisodes').checked;
        config.ShokoShowSpecials = document.querySelector('#shokoShowSpecials').checked;
        config.ShokoShowCredits = document.querySelector('#shokoShowCredits').checked;
        config.ShokoShowTrailers = document.querySelector('#shokoShowTrailers').checked;
        config.ShokoShowParodies = document.querySelector('#shokoShowParodies').checked;
        config.ShokoShowOther = document.querySelector('#shokoShowOther').checked;
        // Calendar Page settings
        config.CalendarPageEnabled = document.querySelector('#calendarPageEnabled').checked;
        config.CalendarUseCustomTabs = document.querySelector('#calendarUseCustomTabs').checked;
        config.CalendarUseNativeTab = document.querySelector('#calendarUseNativeTab').checked;
        var __cAutoSave = document.querySelector('#calendarAutoCreateCustomTab');
        config.CalendarAutoCreateCustomTab = !!(__cAutoSave && __cAutoSave.checked);
        config.CalendarUsePluginPages = document.querySelector('#calendarUsePluginPages').checked;
        config.CalendarFirstDayOfWeek = document.querySelector('#calendarFirstDayOfWeek').value || 'Monday';
        config.CalendarTimeFormat = document.querySelector('#calendarTimeFormat').value || '5pm/5:30pm';
        config.CalendarHighlightFavorites = document.querySelector('#calendarHighlightFavorites').checked;
        config.CalendarHighlightWatchedSeries = document.querySelector('#calendarHighlightWatchedSeries').checked;
        config.CalendarFilterByLibraryAccess = document.querySelector('#calendarFilterByLibraryAccess').checked;
        config.CalendarShowOnlyRequested = document.querySelector('#calendarShowOnlyRequested').checked;
        config.CalendarForceOnlyRequested = document.querySelector('#calendarForceOnlyRequested').checked;
    }

    function getCalendarCustomTabManagedEntries() {
        return [
            {
                masterKey: 'CalendarPageEnabled',
                parentKey: 'CalendarUseCustomTabs',
                autoKey: 'CalendarAutoCreateCustomTab',
                ownedKey: 'CalendarCustomTabJeOwned',
                title: 'Calendar',
                html: '<div class="jellyfinenhanced calendar"></div>',
            },
        ];
    }

    function getCalendarIndividualDeps() {
        return [
            {
                id: 'calendarUsePluginPages',
                checkFn: function () {
                    return getPluginStatus().hasPluginPages !== false;
                },
                hint: 'Install Plugin Pages plugin to enable',
                icon: 'extension',
            },
            {
                id: 'calendarUseCustomTabs',
                checkFn: function () {
                    return getPluginStatus().hasCustomTabs !== false;
                },
                hint: 'Install Custom Tabs plugin to enable',
                icon: 'extension',
            },
        ];
    }

    function getCalendarCustomTabsV12Hints() {
        return [
            { customId: 'calendarUseCustomTabs', nativeId: 'calendarUseNativeTab', bannerId: 'je-v12-hint-calendar' },
        ];
    }

    function getCalendarParentDeps() {
        return [
            {
                parent: 'calendarPageEnabled',
                label: 'Enable Calendar Page',
                children: [
                    'calendarUsePluginPages',
                    'calendarUseNativeTab',
                    'calendarUseCustomTabs',
                    'calendarFirstDayOfWeek',
                    'calendarTimeFormat',
                    'calendarHighlightFavorites',
                    'calendarHighlightWatchedSeries',
                    'calendarFilterByLibraryAccess',
                    'calendarShowOnlyRequested',
                    'calendarForceOnlyRequested',
                ],
            },
        ];
    }

    function describeCalendar(bool, feat) {
        var calWarn = bool('calendarPageEnabled') && !anyArrConfigured();
        feat(
            'Calendar Page',
            bool('calendarPageEnabled'),
            'pages',
            calWarn ? 'Enabled but no *arr instance is configured' : 'Enabled',
            calWarn,
        );
    }

    function getDependencies() {
        return {
            individual: getCalendarIndividualDeps(),
            customTabsHints: getCalendarCustomTabsV12Hints(),
            parents: getCalendarParentDeps(),
        };
    }
    return {
        load: loadCalendarSettings,
        read: readCalendarSettings,
        getCalendarCustomTabManagedEntries,
        describeCalendar,
        getDependencies,
    };
}
