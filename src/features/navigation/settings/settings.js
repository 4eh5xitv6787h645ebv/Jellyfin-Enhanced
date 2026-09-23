/** Feature settings and its private editor state. */
function createNavigationSettings() {
    function loadNavigationSettings(config) {
        document.querySelector('#randomButtonEnabled').checked = config.RandomButtonEnabled;
        document.querySelector('#randomIncludeMovies').checked = config.RandomIncludeMovies;
        document.querySelector('#randomIncludeShows').checked = config.RandomIncludeShows;
        document.querySelector('#randomUnwatchedOnly').checked = config.RandomUnwatchedOnly;
    }

    function readNavigationSettings(config) {
        config.RandomButtonEnabled = document.querySelector('#randomButtonEnabled').checked;
        config.RandomIncludeMovies = document.querySelector('#randomIncludeMovies').checked;
        config.RandomIncludeShows = document.querySelector('#randomIncludeShows').checked;
        config.RandomUnwatchedOnly = document.querySelector('#randomUnwatchedOnly').checked;
    }

    function getNavigationParentDeps() {
        return [
            {
                parent: 'randomButtonEnabled',
                label: 'Enable Random Button',
                children: ['randomUnwatchedOnly', 'randomIncludeMovies', 'randomIncludeShows'],
            },
        ];
    }

    function describeNavigation(bool, feat) {
        feat('Random Button', bool('randomButtonEnabled'), 'display', 'Enabled');
    }

    function getDependencies() {
        return { parents: getNavigationParentDeps() };
    }
    return { load: loadNavigationSettings, read: readNavigationSettings, describeNavigation, getDependencies };
}
