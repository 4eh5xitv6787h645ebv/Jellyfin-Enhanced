/** Feature settings and its private editor state. */
function createItemDetailsSettings() {
    function normalizeLoadedSettings(config) {
        // Tie icon display settings
        if (config.MetadataIconsEnabled) {
            // Force icon display where applicable
            const showLbText = document.querySelector('#showLetterboxdLinkAsText');
            const showArrText = document.querySelector('#showArrLinksAsText');
            if (showLbText) showLbText.checked = false;
            if (showArrText) showArrText.checked = false;
        }
    }

    function loadItemDetailsSettings(config) {
        document.querySelector('#showWatchProgress').checked = config.ShowWatchProgress;
        document.querySelector('#watchProgressDefaultMode').value = config.WatchProgressDefaultMode || 'percentage';
        document.querySelector('#watchProgressTimeFormat').value = config.WatchProgressTimeFormat || 'hours';
        document.querySelector('#showFileSizes').checked = config.ShowFileSizes;
        document.querySelector('#showAudioLanguages').checked = config.ShowAudioLanguages;
        document.querySelector('#showReleaseDate').checked = !!config.ShowReleaseDates;
        document.querySelector('#letterboxdEnabled').checked = config.LetterboxdEnabled;
        document.querySelector('#showLetterboxdLinkAsText').checked = config.ShowLetterboxdLinkAsText;
        const metadataIconsChk = document.querySelector('#metadataIconsEnabled');
        if (metadataIconsChk) metadataIconsChk.checked = !!config.MetadataIconsEnabled;
    }

    function normalizeReadSettings(config) {
        // If metadata icons are enabled, ensure icons are shown for Letterboxd and *arr links
        if (config.MetadataIconsEnabled) {
            config.ShowLetterboxdLinkAsText = false;
            config.ShowArrLinksAsText = false;
        }
    }

    function readItemDetailsSettings(config) {
        config.ShowWatchProgress = document.querySelector('#showWatchProgress').checked;
        config.WatchProgressDefaultMode = document.querySelector('#watchProgressDefaultMode').value;
        config.WatchProgressTimeFormat = document.querySelector('#watchProgressTimeFormat').value;
        config.ShowFileSizes = document.querySelector('#showFileSizes').checked;
        config.ShowAudioLanguages = document.querySelector('#showAudioLanguages').checked;
        config.ShowReleaseDates = document.querySelector('#showReleaseDate').checked;
        config.LetterboxdEnabled = document.querySelector('#letterboxdEnabled').checked;
        config.ShowLetterboxdLinkAsText = document.querySelector('#showLetterboxdLinkAsText').checked;
        config.MetadataIconsEnabled = document.querySelector('#metadataIconsEnabled').checked;
    }

    function getItemDetailsIndividualDeps() {
        return [
            {
                id: 'showLetterboxdLinkAsText',
                checkFn: function () {
                    return !isMetadataIconsEnabled();
                },
                hint: 'Forced to icon mode while Metadata Icons (Druidblack) is enabled',
                icon: 'block',
            },
            {
                id: 'showArrLinksAsText',
                checkFn: function () {
                    return !isMetadataIconsEnabled();
                },
                hint: 'Forced to icon mode while Metadata Icons (Druidblack) is enabled',
                icon: 'block',
            },
        ];
    }

    function getItemDetailsParentDeps() {
        return [
            {
                parent: 'showWatchProgress',
                label: 'Show watch progress',
                children: ['watchProgressDefaultMode', 'watchProgressTimeFormat'],
            },
            { parent: 'letterboxdEnabled', label: 'Enable Letterboxd', children: ['showLetterboxdLinkAsText'] },
        ];
    }

    function describeItemDetails(bool, feat) {
        // Display
        feat('Remove from Continue Watching', bool('removeContinueWatchingEnabled'), 'display', 'Enabled');
    }

    function isMetadataIconsEnabled() {
        var el = document.getElementById('metadataIconsEnabled');
        return !!(el && el.checked);
    }

    function getDependencies() {
        return { individual: getItemDetailsIndividualDeps(), parents: getItemDetailsParentDeps() };
    }
    return {
        normalizeLoadedSettings,
        load: loadItemDetailsSettings,
        normalizeReadSettings,
        read: readItemDetailsSettings,
        describeItemDetails,
        isMetadataIconsEnabled,
        getDependencies,
    };
}
