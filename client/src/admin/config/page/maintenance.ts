import type { PageModules } from './modules';
import { asObject, asObjects, shown } from '../domain/config';
import { asHtml, needControl, needHtml } from './dom';

/** Dependencies this module calls; members are resolved lazily, after every module exists. */
export type MaintenanceDeps = Pick<PageModules, 'context'>;

export function createMaintenance(m: MaintenanceDeps) {
    const { ApiClient } = m.context;

        // ── Maintenance mode: user checklist ─────────────────────────────────────

        /**
         * Where the user list is. Only 'loaded' has boxes to read; until then a save keeps the stored selection, and
         * "Select specific users" with no stored list of users is refused (save.ts), never saved as everyone.
         */
        let usersState: 'loading' | 'loaded' | 'empty' | 'failed' = 'loading';
        /** Counts requests, so an answer to one the Retry button replaced is dropped. */
        let usersRequest = 0;

        /** "2 of 5 selected" beside Select All, while there are boxes; Select All and Deselect All only then. */
        function updateSelectedCount() : void {
            const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('.je-mm-user-cb'));
            const count = asHtml(document.querySelector('#je-mm-user-list .jea-mm-count'));
            if (count) count.textContent = usersState === 'loaded' ? boxes.filter(cb => cb.checked).length + ' of ' + boxes.length + ' selected' : '';
            const actions = asHtml(document.getElementById('je-mm-select-all'))?.closest('.jea-actions');
            if (actions instanceof HTMLElement) actions.hidden = usersState !== 'loaded';
        }

        /** The list's place shows one line: loading, failed (with Retry) or empty. */
        function showUsersMessage(message: string, retry: boolean) : void {
            const inner = asHtml(document.getElementById('je-mm-users-inner'));
            if (!inner) return;
            inner.textContent = '';
            const msg = document.createElement('div');
            msg.className = 'fieldDescription' + (retry ? ' jea-warn-text' : '');
            msg.setAttribute('role', 'status');
            msg.textContent = message;
            inner.appendChild(msg);
            if (retry) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'jea-btn';
                button.textContent = 'Retry';
                button.addEventListener('click', loadMaintenanceUsers);
                inner.appendChild(button);
            }
            updateSelectedCount();
        }

        /** Whether the stored selection is a list of specific users (the boxes, once loaded, start from it). */
        function hasStoredSelection() : boolean {
            const listEl = asHtml(document.getElementById('je-mm-user-list'));
            try {
                const stored: unknown = JSON.parse(listEl?.dataset.preselect || '[]');
                return Array.isArray(stored) && stored.length > 0;
            } catch (e) { return false; }
        }

        function loadMaintenanceUsers() : void {
            usersState = 'loading';
            const request = ++usersRequest;
            showUsersMessage('Loading users...', false);
            ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/MaintenanceMode/Users'),
                dataType: 'json'
            }).then(function(users) {
                if (request !== usersRequest) return;
                const inner = asHtml(document.getElementById('je-mm-users-inner'));
                if (!inner) return;

                const list = asObjects(users);
                if (list.length === 0) {
                    usersState = 'empty';
                    showUsersMessage('No non-admin users found. Maintenance mode never affects administrators, so there is nobody to select.', false);
                    return;
                }
                inner.innerHTML = '';

                // Collect any pre-selected IDs stored on the container by loadConfig
                const listEl = needHtml(document.getElementById('je-mm-user-list'));
                let preselect = [];
                try { preselect = JSON.parse(listEl.dataset.preselect || '[]'); } catch (e) {}
                const preselectAll = preselect.length === 0;

                // Three columns on a wide card, one on a narrow one (sections.css).
                const grid = document.createElement('div');
                grid.className = 'jea-userlist-grid';

                list.forEach(function(u) {
                    // Handle both camelCase and PascalCase from the API
                    const uid  = shown(u.id)  || shown(u.Id)  || '';
                    const uname = shown(u.username) || shown(u.Username) || uid;

                    const checked = preselectAll || preselect.indexOf(uid) !== -1;

                    const label = document.createElement('label');
                    label.style.cssText = 'display:flex;align-items:center;gap:0.45em;padding:0.3em 0.2em;cursor:pointer;border-radius:4px;min-width:0;';

                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'je-mm-user-cb';
                    cb.value = uid;
                    cb.checked = checked;
                    cb.style.flexShrink = '0';

                    const avatar = document.createElement('span');
                    avatar.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;' +
                        'width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.15);' +
                        'font-size:0.7em;font-weight:700;flex-shrink:0;overflow:hidden;';
                    const fallbackLetter = document.createTextNode((uname || '?').charAt(0).toUpperCase());
                    // Users without a profile picture get the letter straight
                    // away instead of an image request that can only 404 (an
                    // older server omits hasImage: try the picture as before).
                    const hasImage = u.hasImage !== undefined ? u.hasImage : u.HasImage;
                    if (hasImage === false) {
                        avatar.appendChild(fallbackLetter);
                    } else {
                        // Try to load the user's actual Jellyfin profile picture
                        const img = document.createElement('img');
                        img.style.cssText = 'width:26px;height:26px;border-radius:50%;object-fit:cover;display:block;';
                        img.src = ApiClient.getUrl('/Users/' + uid + '/Images/Primary', { width: 26 });
                        img.alt = '';
                        img.onerror = function() {
                            img.style.display = 'none';
                            avatar.appendChild(fallbackLetter);
                        };
                        avatar.appendChild(img);
                    }

                    // The whole name, wrapped when it is long: similar names must stay distinguishable.
                    const name = document.createElement('span');
                    name.style.cssText = 'font-size:0.875em;min-width:0;';
                    name.textContent = uname;

                    label.appendChild(cb);
                    label.appendChild(avatar);
                    label.appendChild(name);
                    grid.appendChild(label);
                });

                inner.appendChild(grid);
                usersState = 'loaded';
                updateSelectedCount();
            }).catch(function() {
                if (request !== usersRequest) return;
                usersState = 'failed';
                showUsersMessage('The user list could not be loaded, so no user can be selected.', true);
            });
        }

        /** Shows the inline warning when the daily window's start and end time are equal. */
        function updateMaintenanceScheduleWarning() : void {
            const start = needControl(document.getElementById('maintenanceScheduleStart')).value;
            const end = needControl(document.getElementById('maintenanceScheduleEnd')).value;
            needHtml(document.getElementById('mmScheduleSameTimeWarning')).style.display = start && start === end ? '' : 'none';
        }

        /**
         * Shows the server's current time under the daily window: the window runs on the server's
         * clock, which in containers is often UTC rather than the admin's time zone.
         */
        function refreshMaintenanceServerTime() : void {
            ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/MaintenanceMode/Status'),
                dataType: 'json'
            }).then(function(response) {
                const status = asObject(response);
                const el = asHtml(document.getElementById('mmServerTimeHint'));
                if (!el || !status || !status.ServerLocalTime) return;
                el.textContent = 'Server time is now ' + status.ServerLocalTime + ' (UTC' + status.ServerUtcOffset + '). Set the window in this time zone.';
            }).catch(function() { /* hint only */ });
        }

        function setupMaintenanceModeControls() : void {
            ['maintenanceScheduleStart', 'maintenanceScheduleEnd'].forEach(function(id) {
                needHtml(document.getElementById(id)).addEventListener('input', updateMaintenanceScheduleWarning);
            });

            // Show/hide user checklist based on radio selection
            document.querySelectorAll<HTMLInputElement>('input[name="maintenanceModeUsers"]').forEach(function(radio) {
                radio.addEventListener('change', function() {
                    const listEl = needHtml(document.getElementById('je-mm-user-list'));
                    if (radio.value === 'select') {
                        listEl.style.display = '';
                        // Boxes already on screen hold the administrator's draft: keep them.
                        if (usersState !== 'loaded') loadMaintenanceUsers();
                    } else {
                        listEl.style.display = 'none';
                    }
                });
            });

            // Select All / Deselect All buttons
            needHtml(document.getElementById('je-mm-select-all')).addEventListener('click', function() {
                document.querySelectorAll<HTMLInputElement>('.je-mm-user-cb').forEach(function(cb) { cb.checked = true; });
                updateSelectedCount();
            });
            needHtml(document.getElementById('je-mm-deselect-all')).addEventListener('click', function() {
                document.querySelectorAll<HTMLInputElement>('.je-mm-user-cb').forEach(function(cb) { cb.checked = false; });
                updateSelectedCount();
            });
            needHtml(document.getElementById('je-mm-users-inner')).addEventListener('change', updateSelectedCount);
        }

    /** Runs this module's start-up work, in the page's original order. */
    function wire(): void {
        setupMaintenanceModeControls();
    }

    return {
        wire,
        loadMaintenanceUsers,
        get usersLoaded() { return usersState === 'loaded'; },
        get usersState() { return usersState; },
        hasStoredSelection,
        refreshMaintenanceServerTime,
        updateMaintenanceScheduleWarning,
    };
}
