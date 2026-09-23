/** Feature settings and its private editor state. */
function createMaintenanceSettings({ lifecycle }) {
    let usersRevision = 0;
    function loadMaintenanceSettings(config) {
        document.querySelector('#maintenanceModeEnabled').checked = config.MaintenanceModeEnabled || false;
        document.querySelector('#maintenanceModeMessage').value = config.MaintenanceModeMessage || '';
        document.querySelector('#maintenanceModeNotificationMessage').value =
            config.MaintenanceModeNotificationMessage || '';
        // Restore action checkboxes
        const savedAction = config.MaintenanceModeAction || 'disable_accounts';
        document.getElementById('mmAction_accounts').checked =
            savedAction === 'disable_accounts' || savedAction === 'both';
        document.getElementById('mmAction_remote').checked = savedAction === 'disable_remote' || savedAction === 'both';
        // Restore user selection radio + checkboxes
        const savedUsers = config.MaintenanceModeAffectedUsers || 'all';
        if (savedUsers === 'all') {
            document.querySelector('#mmUsers_all').checked = true;
            document.getElementById('je-mm-user-list').style.display = 'none';
            delete document.getElementById('je-mm-user-list').dataset.preselect;
        } else {
            document.querySelector('#mmUsers_select').checked = true;
            document.getElementById('je-mm-user-list').style.display = '';
            // Preselected IDs will be applied after the user list loads
            document.getElementById('je-mm-user-list').dataset.preselect = savedUsers;
        }
        loadMaintenanceUsers();
    }

    function readMaintenanceSettings(config) {
        config.MaintenanceModeEnabled = document.querySelector('#maintenanceModeEnabled').checked;
        config.MaintenanceModeMessage = document.querySelector('#maintenanceModeMessage').value;
        config.MaintenanceModeNotificationMessage = document.querySelector('#maintenanceModeNotificationMessage').value;
        const mmAccounts = document.getElementById('mmAction_accounts').checked;
        const mmRemote = document.getElementById('mmAction_remote').checked;
        config.MaintenanceModeAction =
            mmAccounts && mmRemote ? 'both' : mmAccounts ? 'disable_accounts' : mmRemote ? 'disable_remote' : 'none';
        const mmUsersMode = (document.querySelector('input[name="maintenanceModeUsers"]:checked') || {}).value || 'all';
        if (mmUsersMode === 'all') {
            config.MaintenanceModeAffectedUsers = 'all';
        } else {
            const checked = Array.from(document.querySelectorAll('.je-mm-user-cb:checked')).map((cb) => cb.value);
            config.MaintenanceModeAffectedUsers = JSON.stringify(checked);
        }
    }

    async function applyMaintenanceMode(config) {
        try {
            if (config.MaintenanceModeEnabled) {
                const affectedIds =
                    config.MaintenanceModeAffectedUsers === 'all'
                        ? []
                        : JSON.parse(config.MaintenanceModeAffectedUsers || '[]');
                await ApiClient.ajax({
                    type: 'POST',
                    url: ApiClient.getUrl('/JellyfinEnhanced/MaintenanceMode/Enable'),
                    contentType: 'application/json',
                    data: JSON.stringify({
                        message: config.MaintenanceModeMessage || '',
                        durationMinutes: 0,
                        action: config.MaintenanceModeAction || 'disable_accounts',
                        affectedUserIds: affectedIds,
                    }),
                });
                // Broadcast a native Jellyfin message to all active sessions
                // (reaches non-web clients like TV apps too — works regardless of Active Streams setting)
                const mmMsg =
                    (config.MaintenanceModeNotificationMessage || '').trim() ||
                    (config.MaintenanceModeMessage || '').trim() ||
                    'Server maintenance is starting. Please finish up and try again later.';
                try {
                    await ApiClient.ajax({
                        type: 'POST',
                        url: ApiClient.getUrl('/JellyfinEnhanced/MaintenanceMode/Broadcast'),
                        contentType: 'application/json',
                        data: JSON.stringify({
                            header: 'Server Maintenance',
                            text: mmMsg,
                            timeoutMs: 30000,
                        }),
                    });
                } catch (bcErr) {
                    console.warn('[JE] Maintenance broadcast failed (no active sessions?):', bcErr);
                }
            } else {
                await ApiClient.ajax({
                    type: 'POST',
                    url: ApiClient.getUrl('/JellyfinEnhanced/MaintenanceMode/Disable'),
                });
            }
        } catch (mmErr) {
            console.warn('[JE] Maintenance mode apply failed:', mmErr);
        }
    }

    // ── Maintenance mode: user checklist ─────────────────────────────────────

    function loadMaintenanceUsers() {
        const revision = ++usersRevision;
        const isCurrent = () => !lifecycle.disposed && revision === usersRevision;
        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/MaintenanceMode/Users'),
            dataType: 'json',
        })
            .then(function (users) {
                if (!isCurrent()) return;
                const inner = document.getElementById('je-mm-users-inner');
                if (!inner) return;
                inner.innerHTML = '';

                if (!users || users.length === 0) {
                    const msg = document.createElement('div');
                    msg.style.cssText = 'opacity:0.55;font-size:0.875em;';
                    msg.textContent = 'No non-admin users found.';
                    inner.appendChild(msg);
                    return;
                }

                // Collect any pre-selected IDs stored on the container by loadConfig
                const listEl = document.getElementById('je-mm-user-list');
                let preselect = [];
                try {
                    preselect = JSON.parse(listEl.dataset.preselect || '[]');
                } catch (e) {}
                const preselectAll = preselect.length === 0;

                // 3-column grid
                const grid = document.createElement('div');
                grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:0.2em 0.75em;';

                users.forEach(function (u) {
                    // Handle both camelCase and PascalCase from the API
                    const uid = u.id || u.Id || '';
                    const uname = u.username || u.Username || uid;

                    const checked = preselectAll || preselect.indexOf(uid) !== -1;

                    const label = document.createElement('label');
                    label.style.cssText =
                        'display:flex;align-items:center;gap:0.45em;padding:0.3em 0.2em;cursor:pointer;border-radius:4px;min-width:0;';

                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'je-mm-user-cb';
                    cb.value = uid;
                    cb.checked = checked;
                    cb.style.flexShrink = '0';

                    const avatar = document.createElement('span');
                    avatar.style.cssText =
                        'display:inline-flex;align-items:center;justify-content:center;' +
                        'width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.15);' +
                        'font-size:0.7em;font-weight:700;flex-shrink:0;overflow:hidden;';
                    // Try to load the user's actual Jellyfin profile picture
                    const img = document.createElement('img');
                    img.style.cssText = 'width:26px;height:26px;border-radius:50%;object-fit:cover;display:block;';
                    img.src = ApiClient.getUrl('/Users/' + uid + '/Images/Primary', { width: 26 });
                    img.alt = '';
                    const fallbackLetter = document.createTextNode((uname || '?').charAt(0).toUpperCase());
                    img.onerror = function () {
                        if (!isCurrent()) return;
                        this.style.display = 'none';
                        avatar.appendChild(fallbackLetter);
                    };
                    avatar.appendChild(img);

                    const name = document.createElement('span');
                    name.style.cssText = 'font-size:0.875em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                    name.textContent = uname;

                    label.appendChild(cb);
                    label.appendChild(avatar);
                    label.appendChild(name);
                    grid.appendChild(label);
                });

                inner.appendChild(grid);
            })
            .catch(function () {
                if (!isCurrent()) return;
                const inner = document.getElementById('je-mm-users-inner');
                if (!inner) return;
                inner.innerHTML = '';
                const msg = document.createElement('div');
                msg.style.cssText = 'opacity:0.55;font-size:0.875em;';
                msg.textContent = 'Failed to load users.';
                inner.appendChild(msg);
            });
    }

    function setupMaintenanceModeControls() {
        // Show/hide user checklist based on radio selection
        document.querySelectorAll('input[name="maintenanceModeUsers"]').forEach(function (radio) {
            lifecycle.listen(radio, 'change', function () {
                const listEl = document.getElementById('je-mm-user-list');
                if (this.value === 'select') {
                    listEl.style.display = '';
                    loadMaintenanceUsers();
                } else {
                    listEl.style.display = 'none';
                }
            });
        });

        // Select All / Deselect All buttons
        lifecycle.listen(document.getElementById('je-mm-select-all'), 'click', function () {
            document.querySelectorAll('.je-mm-user-cb').forEach(function (cb) {
                cb.checked = true;
            });
        });
        lifecycle.listen(document.getElementById('je-mm-deselect-all'), 'click', function () {
            document.querySelectorAll('.je-mm-user-cb').forEach(function (cb) {
                cb.checked = false;
            });
        });
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        setupMaintenanceModeControls();
    }
    return {
        load: loadMaintenanceSettings,
        read: readMaintenanceSettings,
        applyMaintenanceMode,
        initialize,
        dispose: () => lifecycle.dispose(),
    };
}
