/** Dashboard plugins boundary. */
function createDashboardPlugins({
    lifecycle,
    setProbeWarning,
    checkCustomTabsConfigCompat,
    checkWhatsNew,
    updateAllDependencies,
    updateStatusDashboard,
    getCustomTabsCompatibility,
    resetCustomTabsCompatibility,
}) {
    // Plugin detection state.
    //
    // Each `hasX` is tri-state: `null` (not yet probed or probe failed),
    // `true` (installed AND Status === "Active"), `false` (not installed
    // OR installed but disabled). When the plugin is installed-but-
    // disabled, we additionally record it in `_jeDisabledPlugins` so the
    // Optional Dependencies card can surface "Installed (disabled)"
    // instead of the blunt "Not installed".
    var hasPluginPages = null;

    var hasCustomTabs = null;

    var isJellyfin12 = (function () {
        try {
            var version = typeof ApiClient !== 'undefined' && ApiClient.serverVersion && ApiClient.serverVersion();
            return parseInt((version || '').split('.')[0], 10) >= 12;
        } catch (e) {
            return false;
        }
    })();

    var hasIntroSkipper = null;

    var hasInPlayerEpisodePreview = null;

    var hasFileTransformation = null;

    var hasKefinTweaks = null;

    var _jeCurrentPluginVersion = null;

    var _jeDisabledPlugins = {};

    /**
     * Checks installed plugins (Plugin Pages, Custom Tabs, etc.) and updates
     * dependency state for Plugin Pages / Custom Tabs dependent settings.
     * Called during loadConfig() on page load.
     */
    let probeGeneration = 0;
    function checkInstalledPlugins() {
        if (lifecycle.disposed) return;
        const generation = ++probeGeneration;
        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/Plugins'),
            dataType: 'json',
        })
            .then(function (plugins) {
                if (lifecycle.disposed || generation !== probeGeneration) return;
                setProbeWarning('plugins', null);
                // Status-aware plugin lookup. Returns tri-state:
                //   true  → installed AND active
                //   false → either not installed OR disabled
                // When disabled, also records it in _jeDisabledPlugins[key] so
                // the Optional Dependencies card can show "Installed (disabled)".
                _jeDisabledPlugins = {};
                function probe(key, names) {
                    var match = null;
                    var lowered = names.map(function (n) {
                        return n.toLowerCase();
                    });
                    for (var i = 0; i < plugins.length; i++) {
                        var nm = (plugins[i].Name || '').toLowerCase();
                        if (lowered.indexOf(nm) !== -1) {
                            match = plugins[i];
                            break;
                        }
                    }
                    if (!match) return false;
                    // Jellyfin returns Status as one of: Active, Disabled, Restart,
                    // NotSupported, Malfunctioned, Superseded. Anything else → log
                    // once and treat as disabled so the dashboard surfaces a warning
                    // rather than silently passing through. Old builds that omit
                    // Status entirely are caught here too — better to see "Installed
                    // but status unknown" than misreport as Active.
                    //
                    // Rendering note: `_jeDisabledPlugins[key]` captures the raw
                    // Status string. The Optional Dependencies dashboard renders
                    // "Installed but disabled in Dashboard > Plugins" for any
                    // non-Active value. That copy is accurate for Disabled but
                    // slightly misleading for Restart ("waiting for server restart")
                    // and Superseded ("replaced by newer version, probably still
                    // usable"). Callers wanting distinct copy per status should
                    // branch on the raw value.
                    var status = match.Status;
                    var active = status === 'Active';
                    if (!active) {
                        _jeDisabledPlugins[key] = status || 'Status unknown';
                        if (
                            status &&
                            ['Disabled', 'Restart', 'NotSupported', 'Malfunctioned', 'Superseded'].indexOf(status) ===
                                -1
                        ) {
                            console.warn(
                                '[JE] plugin ' + match.Name + ' has unexpected Status value: ' + JSON.stringify(status),
                            );
                        }
                    }
                    return active;
                }
                hasFileTransformation = probe('fileTransformation', ['File Transformation']);
                hasPluginPages = probe('pluginPages', ['Plugin Pages']);
                hasCustomTabs = probe('customTabs', ['Custom Tabs']);
                hasIntroSkipper = probe('introSkipper', ['Intro Skipper', 'SkipIntro']);
                hasInPlayerEpisodePreview = probe('inPlayerEpisodePreview', [
                    'In Player Episode Preview',
                    'In-Player Episode Preview',
                    'InPlayerEpisodePreview',
                ]);

                var self = plugins.find(function (p) {
                    return (p.Name || '').toLowerCase() === 'jellyfin enhanced';
                });
                if (self && self.Version) _jeCurrentPluginVersion = self.Version;

                // KefinTweaks installs as a web-mod (files in /config/KefinTweaks/
                // injected via File Transformation into index.html), NOT as a
                // .NET plugin — so it never appears in /Plugins. Detect it at
                // runtime instead: the injector sets `window.KefinTweaksConfig`
                // and adds script tags whose src contains "KefinTweaks".
                try {
                    hasKefinTweaks = !!(
                        window.KefinTweaksConfig || document.querySelector('script[src*="KefinTweaks"]')
                    );
                } catch (e) {
                    // Extremely unlikely (the selector is literal and the window
                    // read is same-origin), but a future isolation/CSP quirk could
                    // throw — log so we can distinguish "detection bug" from
                    // "legitimately not installed" in bug reports.
                    console.warn('[JE] KefinTweaks detection threw; treating as absent:', e);
                    hasKefinTweaks = false;
                }

                // Toggle body classes so descriptions hide install-only content
                // (e.g., "Install the Custom Tabs plugin...") and surface a positive
                // "detected" badge when an integration plugin is already present.
                document.body.classList.toggle('je-has-customtabs', hasCustomTabs === true);
                document.body.classList.toggle('je-has-pluginpages', hasPluginPages === true);
                document.body.classList.toggle('je-has-introskipper', hasIntroSkipper === true);
                document.body.classList.toggle('je-has-inplayerepisodepreview', hasInPlayerEpisodePreview === true);
                document.body.classList.toggle('je-has-kefintweaks', hasKefinTweaks === true);

                // If Custom Tabs is present, probe its config to decide whether the
                // schema matches what we know how to write. Only on success do we
                // reveal the "Add the Custom Tabs entry for me" toggles.
                if (hasCustomTabs === true) {
                    resetCustomTabsCompatibility(); // re-probing
                    checkCustomTabsConfigCompat();
                } else {
                    document.body.classList.remove('je-has-customtabs-compat');
                    resetCustomTabsCompatibility();
                }

                // Re-run dependencies now that plugin info is available
                updateAllDependencies();
                checkWhatsNew();
            })
            .catch(function (err) {
                if (lifecycle.disposed || generation !== probeGeneration) return;
                // Plugin list request failed (network, auth expiry, server offline, ...).
                // Leave hasPluginPages/hasIntroSkipper at null so individual deps show
                // "unknown" rather than incorrectly disabling toggles. Still refresh
                // the dashboard so cards don't sit stuck on "Checking..." forever.
                console.warn('[JE] plugin detection failed; resetting detection state to avoid stale UI:', err);
                // Reset detection state so prior-success flags don't contradict
                // the visible "couldn't reach /Plugins" warning. Body classes,
                // module flags, and dep gates all flip back to "unknown" so the
                // UI is internally consistent after a failed retry.
                hasPluginPages = null;
                hasCustomTabs = null;
                hasIntroSkipper = null;
                hasInPlayerEpisodePreview = null;
                hasFileTransformation = null;
                hasKefinTweaks = null;
                resetCustomTabsCompatibility();
                document.body.classList.remove(
                    'je-has-customtabs',
                    'je-has-pluginpages',
                    'je-has-introskipper',
                    'je-has-inplayerepisodepreview',
                    'je-has-customtabs-compat',
                    'je-has-kefintweaks',
                );
                setProbeWarning(
                    'plugins',
                    'Couldn\'t reach the Jellyfin /Plugins endpoint to verify which integrations are installed (auth expiry, network, or server issue). Dependency hints and "plugin detected" badges are now hidden until you retry.',
                );
                try {
                    updateAllDependencies();
                } catch (e) {
                    console.warn('[JE] updateAllDependencies threw during plugin-detect fallback:', e);
                }
                try {
                    updateStatusDashboard();
                } catch (e) {
                    console.warn('[JE] updateStatusDashboard threw during plugin-detect fallback:', e);
                }
            });
        // Probe-warning retry — re-runs plugin detection (which also re-runs
        // the Custom Tabs config probe inside its .then). One handler only;
        // checkInstalledPlugins is idempotent.
        var probeRetry = document.getElementById('je-probe-retry-btn');
        lifecycle.listen(
            probeRetry,
            'click',
            function () {
                setProbeWarning('plugins', null);
                setProbeWarning('customtabs', null);
                checkInstalledPlugins();
            },
            undefined,
            'plugin-probe-retry',
        );
    }

    /**
     * Overview → Optional Dependencies
     * Renders a card per optional plugin with its detected state.
     * Sources the booleans populated by checkInstalledPlugins() —
     * `null` means the /Plugins probe hasn't completed (or failed),
     * rendered as "Checking…" rather than asserting missing.
     */
    var OPTIONAL_PLUGINS = [
        {
            key: 'fileTransformation',
            name: 'File Transformation',
            icon: 'transform',
            url: 'https://github.com/IAmParadox27/jellyfin-plugin-file-transformation',
            purpose: 'Required by Custom Tabs, Plugin Pages, and other plugins that modify the web client.',
            getFlag: function () {
                return hasFileTransformation;
            },
        },
        {
            key: 'pluginPages',
            name: 'Plugin Pages',
            icon: 'view_list',
            url: 'https://github.com/IAmParadox27/jellyfin-plugin-pages',
            purpose: 'Sidebar pages for Bookmarks, Hidden Content, Requests, Calendar.',
            getFlag: function () {
                return hasPluginPages;
            },
        },
        {
            key: 'customTabs',
            name: 'Custom Tabs',
            icon: 'tab',
            url: 'https://github.com/IAmParadox27/jellyfin-plugin-custom-tabs',
            purpose: 'Home-page tab entries for Bookmarks, Hidden Content, Requests, Calendar.',
            getFlag: function () {
                return hasCustomTabs;
            },
        },
        {
            key: 'introSkipper',
            name: 'Intro Skipper',
            icon: 'skip_next',
            url: 'https://github.com/intro-skipper/intro-skipper',
            purpose: 'Source of timestamps for Auto-skip Intro / Auto-skip Outro.',
            getFlag: function () {
                return hasIntroSkipper;
            },
        },
        {
            key: 'inPlayerEpisodePreview',
            name: 'In-Player Episode Preview',
            icon: 'movie_filter',
            url: 'https://github.com/Namo2/InPlayerEpisodePreview',
            purpose: 'Enables the in-player Episode Preview keyboard shortcut.',
            getFlag: function () {
                return hasInPlayerEpisodePreview;
            },
        },
        {
            key: 'kefinTweaks',
            name: 'KefinTweaks',
            icon: 'bookmark_border',
            url: 'https://github.com/ranaldsgift/KefinTweaks',
            purpose:
                'Renders the Watchlist UI in Jellyfin. Required to view watchlisted items from the Seerr Watchlist features. Installs as a web-mod (not a normal plugin), detected via its injected scripts.',
            getFlag: function () {
                return hasKefinTweaks;
            },
        },
    ];

    function renderOptionalPluginsDashboard() {
        if (lifecycle.disposed) return;
        var root = document.getElementById('je-optional-plugins');
        if (!root) return;
        root.textContent = '';
        OPTIONAL_PLUGINS.forEach(function (dep) {
            var flag = dep.getFlag();
            var state, statusText;
            if (flag === true) {
                state = 'installed';
                statusText = 'Installed';
            } else if (flag === false) {
                state = 'missing';
                statusText = 'Not installed';
            } else {
                state = 'unknown';
                statusText = 'Checking…';
            }

            // When the plugin is installed-but-disabled (status ≠ Active),
            // flip to an amber "disabled" state so the admin knows to
            // re-enable it rather than wonder why features don't work.
            if (flag === false && _jeDisabledPlugins[dep.key]) {
                state = 'warn';
                statusText = 'Installed but disabled in Dashboard > Plugins';
            }

            // Only surface a compat warning for Custom Tabs when we've
            // actually completed the probe — not while it's still pending
            // (getCustomTabsCompatibility() === null). This avoids a transient
            // "incompatible" flash during the initial load.
            if (dep.key === 'customTabs' && flag === true) {
                if (getCustomTabsCompatibility() === 'incompatible') {
                    state = 'warn';
                    statusText = 'Installed, config shape not recognized (auto-create disabled)';
                } else if (getCustomTabsCompatibility() === 'probe-failed') {
                    state = 'warn';
                    statusText = "Installed, couldn't read config (auto-create disabled)";
                } else if (getCustomTabsCompatibility() === null) {
                    statusText = 'Installed, checking config…';
                }
            }
            var card = document.createElement('div');
            card.className = 'je-optional-plugin-card je-state-' + state;
            var icon = document.createElement('i');
            icon.className = 'material-icons je-optional-plugin-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent =
                state === 'installed'
                    ? 'check_circle'
                    : state === 'warn'
                      ? 'warning'
                      : state === 'unknown'
                        ? 'help_outline'
                        : 'radio_button_unchecked';
            card.appendChild(icon);
            var body = document.createElement('div');
            body.className = 'je-optional-plugin-body';
            var name = document.createElement('div');
            name.className = 'je-optional-plugin-name';
            name.textContent = dep.name;
            body.appendChild(name);
            var status = document.createElement('div');
            status.className = 'je-optional-plugin-status';
            status.textContent = statusText;
            body.appendChild(status);
            var purpose = document.createElement('div');
            purpose.className = 'je-optional-plugin-purpose';
            purpose.textContent = dep.purpose;
            body.appendChild(purpose);
            card.appendChild(body);

            // External link icon in the top-right — opens the plugin's
            // home repo in a new tab. noopener/noreferrer both for security
            // and so the opened page can't manipulate this window.
            if (dep.url) {
                var link = document.createElement('a');
                link.className = 'je-optional-plugin-link';
                link.href = dep.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.title = 'Open ' + dep.name + ' on GitHub';
                link.setAttribute('aria-label', 'Open ' + dep.name + ' on GitHub');
                var linkIcon = document.createElement('i');
                linkIcon.className = 'material-icons';
                linkIcon.setAttribute('aria-hidden', 'true');
                linkIcon.textContent = 'open_in_new';
                link.appendChild(linkIcon);
                card.appendChild(link);
            }

            root.appendChild(card);
        });
    }

    function getPluginStatus() {
        return {
            hasPluginPages,
            hasCustomTabs,
            hasIntroSkipper,
            hasInPlayerEpisodePreview,
            hasFileTransformation,
            hasKefinTweaks,
            isJellyfin12,
        };
    }

    return {
        checkInstalledPlugins,
        renderOptionalPluginsDashboard,
        getPluginStatus,
    };
}
