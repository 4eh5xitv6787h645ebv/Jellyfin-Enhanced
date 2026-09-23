/** Feature settings and its private editor state. */
function createActiveStreamsSettings({ lifecycle }) {
    function loadActiveStreamsSettings(config) {
        document.querySelector('#activeStreamsEnabled').checked = config.ActiveStreamsEnabled || false;
        document.querySelector('#activeStreamsAllUsers').checked = config.ActiveStreamsAllUsers || false;
        document.getElementById('activeStreamsAllUsersContainer').style.display = config.ActiveStreamsEnabled
            ? ''
            : 'none';
        lifecycle.listen(
            document.querySelector('#activeStreamsEnabled'),
            'change',
            function () {
                document.getElementById('activeStreamsAllUsersContainer').style.display = this.checked ? '' : 'none';
            },
            undefined,
            'all-users-visibility',
        );
    }

    function readActiveStreamsSettings(config) {
        config.ActiveStreamsEnabled = document.querySelector('#activeStreamsEnabled').checked;
        config.ActiveStreamsAllUsers = document.querySelector('#activeStreamsAllUsers').checked;
    }

    return {
        load: loadActiveStreamsSettings,
        read: readActiveStreamsSettings,
        dispose: () => lifecycle.dispose(),
    };
}
