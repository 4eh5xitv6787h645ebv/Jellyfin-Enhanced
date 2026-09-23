/** Feature settings and its private editor state. */
function createAppearanceSettings() {
    function loadAppearanceSettings(config) {
        document.querySelector('#enableCustomSplashScreen').checked = config.EnableCustomSplashScreen;
        document.querySelector('#splashScreenImageUrl').value = config.SplashScreenImageUrl;
        document.querySelector('#useIcons').checked = config.UseIcons !== false;
        document.querySelector('#iconStyle').value = config.IconStyle || 'emoji';
        document.querySelector('#themeSelectorEnabled').checked = config.ThemeSelectorEnabled;
        document.querySelector('#pluginIconsEnabled').checked = config.PluginIconsEnabled;
        document.querySelector('#loginImageEnabled').checked = config.EnableLoginImage || false;
        document.querySelector('#customPluginLinks').value = config.CustomPluginLinks || '';
    }

    function readAppearanceSettings(config) {
        config.EnableCustomSplashScreen = document.querySelector('#enableCustomSplashScreen').checked;
        config.SplashScreenImageUrl = document.querySelector('#splashScreenImageUrl').value;
        config.UseIcons = document.querySelector('#useIcons').checked;
        config.IconStyle = document.querySelector('#iconStyle').value;
        config.ThemeSelectorEnabled = document.querySelector('#themeSelectorEnabled').checked;
        config.PluginIconsEnabled = document.querySelector('#pluginIconsEnabled').checked;
        config.EnableLoginImage = document.querySelector('#loginImageEnabled').checked;
        config.CustomPluginLinks = document.querySelector('#customPluginLinks').value || '';
    }

    function getAppearanceParentDeps() {
        return [
            { parent: 'useIcons', label: 'Use Icons', children: ['iconStyle'] },
            {
                parent: 'enableCustomSplashScreen',
                label: 'Enable Custom Splash Screen',
                children: ['splashScreenImageUrl'],
            },
        ];
    }

    function describeAppearance(bool, feat) {
        // Custom splash screen / branding. Both the splash screen and the
        // branding image uploads (icons/favicon/logos) are handled by Jellyfin
        // Enhanced itself at request time, so no extra plugin is required.
        var splashOn = bool('enableCustomSplashScreen');
        feat('Custom splash / branding', splashOn, 'extras', 'Enabled', false);
    }

    function getDependencies() {
        return { parents: getAppearanceParentDeps() };
    }
    return { load: loadAppearanceSettings, read: readAppearanceSettings, describeAppearance, getDependencies };
}
