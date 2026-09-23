/** Feature settings and its private editor state. */
function createPlaybackSettings({ getPluginStatus }) {
    function loadPlaybackSettings(config) {
        document.querySelector('#autoPauseEnabled').checked = config.AutoPauseEnabled;
        document.querySelector('#autoResumeEnabled').checked = config.AutoResumeEnabled;
        document.querySelector('#autoPipEnabled').checked = config.AutoPipEnabled;
        document.querySelector('#autoSkipIntro').checked = config.AutoSkipIntro;
        document.querySelector('#autoSkipOutro').checked = config.AutoSkipOutro;
        document.querySelector('#longPress2xEnabled').checked = config.LongPress2xEnabled;
        const showRatingInPlayer = config.ShowRatingInPlayer !== false;
        const rPlayerChk = document.querySelector('#showRatingInPlayer');
        if (rPlayerChk) rPlayerChk.checked = showRatingInPlayer;
        document.querySelector('#pauseScreenEnabled').checked = config.PauseScreenEnabled;
        document.querySelector('#showPlaybackRatingBadge').checked = config.ShowPlaybackRatingBadge === true;
        document.querySelector('#DefaultSubtitleStyle').value = config.DefaultSubtitleStyle;
        document.querySelector('#DefaultSubtitleSize').value = config.DefaultSubtitleSize;
        document.querySelector('#DefaultSubtitleFont').value = config.DefaultSubtitleFont;
        document.querySelector('#disableCustomSubtitleStyles').checked = config.DisableCustomSubtitleStyles;
    }

    function readPlaybackSettings(config) {
        config.AutoPauseEnabled = document.querySelector('#autoPauseEnabled').checked;
        config.AutoResumeEnabled = document.querySelector('#autoResumeEnabled').checked;
        config.AutoPipEnabled = document.querySelector('#autoPipEnabled').checked;
        config.AutoSkipIntro = document.querySelector('#autoSkipIntro').checked;
        config.AutoSkipOutro = document.querySelector('#autoSkipOutro').checked;
        config.LongPress2xEnabled = document.querySelector('#longPress2xEnabled').checked;
        config.ShowRatingInPlayer = document.querySelector('#showRatingInPlayer').checked;
        config.PauseScreenEnabled = document.querySelector('#pauseScreenEnabled').checked;
        config.ShowPlaybackRatingBadge = document.querySelector('#showPlaybackRatingBadge').checked;
        config.DefaultSubtitleStyle = parseInt(document.querySelector('#DefaultSubtitleStyle').value, 10);
        config.DefaultSubtitleSize = parseInt(document.querySelector('#DefaultSubtitleSize').value, 10);
        config.DefaultSubtitleFont = parseInt(document.querySelector('#DefaultSubtitleFont').value, 10);
        config.DisableCustomSubtitleStyles = document.querySelector('#disableCustomSubtitleStyles').checked;
    }

    function getPlaybackIndividualDeps() {
        return [
            {
                id: 'autoSkipIntro',
                checkFn: function () {
                    return getPluginStatus().hasIntroSkipper !== false;
                },
                hint: 'Install Intro Skipper plugin to enable',
                icon: 'extension',
            },
            {
                id: 'autoSkipOutro',
                checkFn: function () {
                    return getPluginStatus().hasIntroSkipper !== false;
                },
                hint: 'Install Intro Skipper plugin to enable',
                icon: 'extension',
            },
        ];
    }

    function describePlayback(bool, feat) {
        // Playback
        feat('Custom Pause Screen', bool('pauseScreenEnabled'), 'playback', 'Enabled');
        feat('Age Rating on Playback Start', bool('showPlaybackRatingBadge'), 'playback', 'Enabled');
        feat('Long press for 2x speed', bool('longPress2xEnabled'), 'playback', 'Enabled (touch devices)');
        var autoSkip = bool('autoSkipIntro') || bool('autoSkipOutro');
        var autoSkipWarn = autoSkip && getPluginStatus().hasIntroSkipper !== true;
        feat(
            'Auto-skip Intro/Outro',
            autoSkip,
            'playback',
            autoSkipWarn ? 'Enabled but Intro Skipper plugin is missing' : 'Enabled',
            autoSkipWarn,
        );
        var tabSwitch = bool('autoPauseEnabled') || bool('autoResumeEnabled') || bool('autoPipEnabled');
        feat('Tab-switch actions', tabSwitch, 'playback', 'Auto-pause / resume / PiP');
    }

    function getDependencies() {
        return { individual: getPlaybackIndividualDeps() };
    }
    return { load: loadPlaybackSettings, read: readPlaybackSettings, describePlayback, getDependencies };
}
