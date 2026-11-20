import type { DefineSections } from '../engine/schema';

export function defineExtras(define: DefineSections): void {
/* Extras and Keyboard tab sections. See jeAdmin.js for the field spec. */
    const shot = (alt: string, file: string, small?: boolean): string => '<details class="je-screenshot-details"><summary class="je-screenshot-summary">View screenshot</summary>'
        + '<a href="https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfin-Enhanced@main/docs/images/' + file + '" target="_blank" rel="noopener noreferrer">'
        + '<img alt="' + alt + '" class="' + (small ? 'je-screenshot-img-sm' : 'je-screenshot-img') + '" data-je-cdn="je-docs-img/' + file + '"/></a></details>';

    define({
        'extras-ui': {
            title: 'UI Tweaks', icon: 'palette',
            items: [
                { id: 'coloredRatingsEnabled', prop: 'ColoredRatingsEnabled', type: 'toggle', label: 'Coloured rating backgrounds',
                  desc: 'Applies colour-coded backgrounds to media ratings. If you notice missing or incorrect ratings, please submit a PR to <a class="sectionTitle" href="https://github.com/n00bcodr/Jellyfin-Enhanced/" target="_blank">Jellyfin-Enhanced</a>.' + shot('Coloured ratings example', 'ratings.png') },
                { id: 'themeSelectorEnabled', prop: 'ThemeSelectorEnabled', type: 'toggle', label: 'Theme selector (Jellyfish)',
                  desc: 'Adds a theme selector to quickly switch between Jellyfish colour themes. Only changes the colour theme of Jellyfish when used natively, not through KefinTweaks.' + shot('Theme selector example', 'theme-selector.png') },
                { id: 'coloredActivityIconsEnabled', prop: 'ColoredActivityIconsEnabled', type: 'toggle', label: 'Coloured dashboard icons',
                  desc: 'Replaces the Dashboard activity icons with Material Design icons on a coloured background.' + shot('Coloured activity icons example', 'colored-activity-icons.png') },
                { id: 'loginImageEnabled', prop: 'EnableLoginImage', type: 'toggle', label: 'Profile picture on the login screen',
                  desc: 'Displays the user\'s profile picture on the manual login screen instead of the name. When a user is selected, their avatar appears above the password field.' + shot('Login image example', 'login-image.png') },
                { id: 'pluginIconsEnabled', prop: 'PluginIconsEnabled', type: 'toggle', label: 'Custom plugin menu icons',
                  desc: 'Replaces default plugin folder icons with custom icons on the Dashboard sidebar. Currently replaces icons for (if installed): Jellyfin Enhanced, JavaScript Injector, Intro Skipper, Reports, JellySleep, Home Screen Sections, File Transformation, Jellyfin Helper, Newsletters, Segment Editor and Moonbase.' + shot('Plugin icons example', 'plugin-icons.png', true) }
            ]
        },
        'extras-streams': {
            title: 'Active Streams', icon: 'podcasts',
            items: [
                { id: 'activeStreamsEnabled', prop: 'ActiveStreamsEnabled', type: 'toggle', main: true, label: 'Show the Active Streams header widget',
                  desc: 'Adds a live stream counter to the header. Click it to open a panel showing who is currently playing, what they\'re watching, playback state, progress, and transcoding details. By default the widget is only visible to admin accounts.' },
                { id: 'activeStreamsAllUsers', prop: 'ActiveStreamsAllUsers', type: 'toggle', label: 'Show the widget to non-admins',
                  desc: 'Lets every signed-in user see the stream counter and its panel, not only administrators.' }
            ]
        },
        'extras-links': {
            title: 'External Links', icon: 'link',
            items: [
                { id: 'letterboxdEnabled', prop: 'LetterboxdEnabled', type: 'toggle', main: true, label: 'Enable Letterboxd links',
                  desc: 'Adds Letterboxd links to movie and person details pages.' },
                { id: 'showLetterboxdLinkAsText', prop: 'ShowLetterboxdLinkAsText', type: 'toggle', label: 'Show link as text',
                  desc: 'When enabled, shows "Letterboxd" as text instead of the Letterboxd icon.' }
            ]
        },
        'extras-metadata-icons': {
            title: 'Metadata Icons & Sidebar Links', icon: 'extension',
            items: [
                { id: 'metadataIconsEnabled', prop: 'MetadataIconsEnabled', type: 'toggle', label: 'Enable Metadata Icons (Druidblack)',
                  fromConfig: (v) => !!v,
                  desc: 'Shows metadata icons instead of text. When enabled, links from the plugin will also use icons instead of text (Letterboxd, *arr Links).' },
                { type: 'group', title: 'Sidebar custom links', items: [
                    { id: 'customPluginLinks', prop: 'CustomPluginLinks', type: 'textarea', rows: 3, placeholder: 'Page Name | icon_name', label: 'Sidebar custom links',
                      desc: '<strong>Format:</strong> <code>Configuration Page Name | Material Icon Name</code><br/>'
                          + '<strong>Important:</strong> Use the exact name that appears in the configuration page URL (e.g. "Jellyfin%20Tweaks" becomes "Jellyfin Tweaks").<br/>'
                          + '<a class="sectionTitle" href="https://fonts.google.com/icons?icon.set=Material+Icons" target="_blank" rel="noopener noreferrer">Browse Material Icons<i class="material-icons je-link-ext" aria-hidden="true">open_in_new</i></a><br/>'
                          + 'Use "Test links" to preview your links in the sidebar. They appear immediately and disappear on page refresh.' },
                    { type: 'button', id: 'testCustomPluginLinksBtn', label: 'Test links' }
                ] }
            ]
        },
        'extras-splash': {
            title: 'Splash Screen Override', icon: 'wallpaper',
            items: [
                { id: 'enableCustomSplashScreen', prop: 'EnableCustomSplashScreen', type: 'toggle', main: true, label: 'Enable the splash screen override',
                  desc: 'Replace Jellyfin\'s login splash background with a custom image URL specified below.' },
                { id: 'splashScreenImageUrl', prop: 'SplashScreenImageUrl', type: 'text', placeholder: '/web/assets/banner.png', label: 'Splash screen image URL',
                  desc: 'URL for the splash screen image. Defaults to Jellyfin banner.' },
                { type: 'note', tone: 'warn', html: 'May misbehave when <a class="sectionTitle" href="https://github.com/IAmParadox27/jellyfin-plugin-media-bar" target="_blank" rel="noopener noreferrer">jellyfin-plugin-media-bar</a> is installed. Changes show after a page refresh; if the old image stays, clear the browser cache.' }
            ]
        },
        'extras-branding': {
            title: 'Custom Image Assets', icon: 'image', class: 'je-fieldset-wide',
            items: [
                { type: 'note', html: 'Uploaded images replace Jellyfin\'s own as they are served, from the next page load (a hard refresh may be needed if the browser cached the old image).' },
                { type: 'custom', html: '<div class="je-branding-grid">' + [
                    ['iconTransparent', 'Icon with transparency', 'icon-transparent.png', 'The icon at the top left, beside the server version', '536×536px', 'PNG with transparency'],
                    ['favicon', 'Favicon', 'favicon.ico', 'The icon in the browser tab', '256×256px', 'ICO, PNG or SVG'],
                    ['bannerDark', 'Banner for light backgrounds', 'banner-dark.png', 'Dark artwork for the splash screen on light themes', '1302×378px', 'PNG, JPG or WebP'],
                    ['bannerLight', 'Banner for dark backgrounds', 'banner-light.png', 'Light artwork for the splash screen on dark themes', '1302×378px', 'PNG, JPG or WebP'],
                    ['touchicon', 'Apple touch icon', 'apple-touch-icon.png', 'Shown when Jellyfin is added to an iOS home screen', '180×180px', 'PNG']
                ].map(([k, name, file, what, size, formats]) => '<div class="je-branding-card">'
                    + '<label class="je-branding-label-bold" for="' + k + 'Input">' + name + '</label>'
                    + '<div class="je-branding-file">' + file + '</div>'
                    + '<div class="je-branding-label">' + what + '</div>'
                    + '<div class="je-branding-size-hint">' + size + ' &nbsp;·&nbsp; ' + formats + '</div>'
                    + '<div class="je-branding-dropzone" id="' + k + 'DropZone">'
                    + '<input type="file" id="' + k + 'Input" accept="image/*" class="je-branding-file-input" aria-describedby="' + k + 'Status" />'
                    + '<div id="' + k + 'Placeholder" class="je-branding-placeholder"><i class="material-icons je-branding-placeholder-icon" aria-hidden="true">upload</i><span class="je-branding-choose">Choose file</span><span class="je-branding-formats">or drop it here</span></div>'
                    + '<img id="' + k + 'Preview" class="je-branding-preview" alt="" style="display:none;" />'
                    + '<div id="' + k + 'Dimensions" class="je-branding-dimensions" style="display:none;"></div>'
                    + '<div id="' + k + 'Status" class="je-branding-status" aria-live="polite"></div>'
                    + '<button type="button" class="je-branding-delete" id="' + k + 'Delete" style="display:none;" aria-label="Remove the ' + String(name).toLowerCase().replace(/^apple/, 'Apple') + '" title="Remove"><i class="material-icons" aria-hidden="true">delete</i></button>'
                    + '</div></div>').join('') + '</div>' }
            ]
        },
        'keyboard': {
            title: 'Keyboard Shortcuts', icon: 'keyboard',
            items: [
                { id: 'disableAllShortcuts', prop: 'DisableAllShortcuts', type: 'toggle', label: 'Turn off keyboard shortcuts',
                  desc: 'Disables all keyboard shortcuts, and hides the "Shortcuts" tab in the Enhanced Panel.' },
                { type: 'note', html: '<strong>Users can customise their own settings in the Enhanced Panel:</strong> press <code>?</code> (default shortcut), long-press the profile picture in the top-right corner, use the "Jellyfin Enhanced" link in the sidebar, or open it from the playback controls menu (mobile only).' },
                { type: 'html', html: '<div class="fieldDescription je-sc-help">Select a key, then press the new combination (for example <kbd>Shift+A</kbd>). <b>Escape</b> cancels, <b>Delete</b> turns the shortcut off for every user and <b>Backspace</b> restores its default. Users can still change their own keys in their Enhanced Panel.</div>'
                    + '<div id="shortcut-error-comment" style="display: none; color: #ff6b6b; margin-top:5px;"></div>'
                    + '<div id="shortcut-grid"></div>' }
            ]
        }
    });
}
