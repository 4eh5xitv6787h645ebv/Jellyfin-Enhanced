// /js/enhanced/debug-panel.js
// Phase 3: Developer/power-user diagnostics panel.
// Opens via Ctrl+Shift+E shortcut. Shows plugin state at a glance so
// issues can be self-diagnosed without opening browser devtools.
(function(JE) {
    'use strict';

    var panelVisible = false;
    var panelElement = null;

    function collectDiagnostics() {
        var diag = {
            pluginVersion: JE.pluginVersion || 'unknown',
            assetHash: JE.pluginConfig?.AssetHash || 'unknown',
            configStoreHash: 'N/A',
            userStoreHash: 'N/A',
            modules: {},
            observers: {
                bodySubscribers: JE.helpers?.getBodySubscriberCount?.() ?? -1,
                dedicatedObservers: JE.helpers?.getObserverCount?.() ?? -1,
                viewHandlers: JE.helpers?.getHandlerCount?.() ?? -1,
            },
            config: {
                ElsewhereEnabled: JE.pluginConfig?.ElsewhereEnabled,
                JellyseerrEnabled: JE.pluginConfig?.JellyseerrEnabled,
                ArrLinksEnabled: JE.pluginConfig?.ArrLinksEnabled,
                BookmarksEnabled: JE.pluginConfig?.BookmarksEnabled,
                CalendarPageEnabled: JE.pluginConfig?.CalendarPageEnabled,
                DownloadsPageEnabled: JE.pluginConfig?.DownloadsPageEnabled,
                HiddenContentEnabled: JE.pluginConfig?.HiddenContentEnabled,
                ColoredRatingsEnabled: JE.pluginConfig?.ColoredRatingsEnabled,
                ThemeSelectorEnabled: JE.pluginConfig?.ThemeSelectorEnabled,
            },
            theme: JE.themer?.activeTheme?.name || 'unknown',
            language: JE.currentSettings?.displayLanguage || 'en',
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
        };

        // Module registry state
        var knownModules = [
            'colored-activity-icons', 'colored-ratings', 'plugin-icons',
            'theme-selector', 'hidden-content', 'hidden-content-page',
            'calendar-page', 'downloads-page', 'elsewhere', 'reviews',
            'arr-links', 'arr-tag-links', 'jellyseerr-item-details',
            'jellyseerr-search', 'letterboxd-links', 'hss-discovery-handler',
            'bookmarks-library'
        ];
        knownModules.forEach(function(name) {
            var mod = JE.moduleRegistry?.getModule(name);
            diag.modules[name] = mod ? (mod.initialized ? 'active' : 'registered') : 'not registered';
        });

        return diag;
    }

    function createPanel() {
        if (panelElement) {
            panelElement.remove();
            panelElement = null;
        }

        var overlay = document.createElement('div');
        overlay.id = 'je-debug-panel';
        overlay.style.cssText = [
            'position: fixed; top: 0; left: 0; right: 0; bottom: 0;',
            'background: rgba(0,0,0,0.85); z-index: 10000000;',
            'display: flex; align-items: center; justify-content: center;',
            'font-family: monospace; color: #e0e0e0; font-size: 13px;',
        ].join(' ');

        var panel = document.createElement('div');
        panel.style.cssText = [
            'background: #1a1a2e; border-radius: 12px; padding: 24px;',
            'max-width: 700px; width: 90vw; max-height: 80vh; overflow-y: auto;',
            'box-shadow: 0 8px 32px rgba(0,0,0,0.6);',
        ].join(' ');

        var diag = collectDiagnostics();

        var title = document.createElement('h2');
        title.textContent = 'Jellyfin Enhanced — Debug Panel';
        title.style.cssText = 'margin: 0 0 16px 0; color: #00a4dc; font-size: 16px;';
        panel.appendChild(title);

        // Version + hash row
        addRow(panel, 'Plugin Version', diag.pluginVersion);
        addRow(panel, 'Asset Hash', diag.assetHash);
        addRow(panel, 'Theme', diag.theme);
        addRow(panel, 'Language', diag.language);

        // Observers
        var obsSection = document.createElement('h3');
        obsSection.textContent = 'Observers';
        obsSection.style.cssText = 'margin: 16px 0 8px 0; color: #888; font-size: 13px; text-transform: uppercase;';
        panel.appendChild(obsSection);
        addRow(panel, 'Body subscribers', String(diag.observers.bodySubscribers));
        addRow(panel, 'Dedicated observers', String(diag.observers.dedicatedObservers));
        addRow(panel, 'View handlers', String(diag.observers.viewHandlers));

        // Modules
        var modSection = document.createElement('h3');
        modSection.textContent = 'Modules';
        modSection.style.cssText = 'margin: 16px 0 8px 0; color: #888; font-size: 13px; text-transform: uppercase;';
        panel.appendChild(modSection);
        for (var name in diag.modules) {
            var status = diag.modules[name];
            var color = status === 'active' ? '#4caf50' : (status === 'registered' ? '#ff9800' : '#f44336');
            addRow(panel, name, status, color);
        }

        // Config flags
        var cfgSection = document.createElement('h3');
        cfgSection.textContent = 'Config Flags';
        cfgSection.style.cssText = 'margin: 16px 0 8px 0; color: #888; font-size: 13px; text-transform: uppercase;';
        panel.appendChild(cfgSection);
        for (var key in diag.config) {
            addRow(panel, key, String(diag.config[key]));
        }

        // Buttons
        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top: 20px; display: flex; gap: 10px;';

        var copyBtn = document.createElement('button');
        copyBtn.textContent = 'Copy Diagnostics';
        copyBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #00a4dc; background: transparent; color: #00a4dc; border-radius: 6px; cursor: pointer; font-size: 13px;';
        copyBtn.addEventListener('click', function() {
            var json = JSON.stringify(diag, null, 2);
            navigator.clipboard.writeText(json).then(function() {
                copyBtn.textContent = 'Copied!';
                setTimeout(function() { copyBtn.textContent = 'Copy Diagnostics'; }, 2000);
            });
        });
        btnRow.appendChild(copyBtn);

        var closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #666; background: transparent; color: #ccc; border-radius: 6px; cursor: pointer; font-size: 13px;';
        closeBtn.addEventListener('click', togglePanel);
        btnRow.appendChild(closeBtn);

        panel.appendChild(btnRow);
        overlay.appendChild(panel);

        // Click outside to close
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) togglePanel();
        });

        panelElement = overlay;
        document.body.appendChild(overlay);
    }

    function addRow(parent, label, value, valueColor) {
        var row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);';
        var labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        labelSpan.style.cssText = 'color: #aaa;';
        var valueSpan = document.createElement('span');
        valueSpan.textContent = value;
        valueSpan.style.cssText = 'color: ' + (valueColor || '#fff') + '; font-weight: 600;';
        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
        parent.appendChild(row);
    }

    function togglePanel() {
        if (panelVisible) {
            if (panelElement) {
                panelElement.remove();
                panelElement = null;
            }
            panelVisible = false;
        } else {
            createPanel();
            panelVisible = true;
        }
    }

    // Register keyboard shortcut: Ctrl+Alt+D
    // (Ctrl+Shift+E conflicts with Chrome/Edge "Search in Sidebar")
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            togglePanel();
        }
    });

    JE.debugPanel = { toggle: togglePanel, getDiagnostics: collectDiagnostics };

})(window.JellyfinEnhanced);
