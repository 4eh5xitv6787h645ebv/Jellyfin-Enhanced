/** Feature settings and its private editor state. */
function createSeerrUsers({ lifecycle, saveBeforeImport }) {
    /**
     * Updates the blocked users count badge in the collapsible summary.
     */
    function updateBlockedUsersCount() {
        const total = document.querySelectorAll('.blockedUserCheckbox:checked').length;
        const countEl = document.getElementById('blockedUsersCount');
        if (countEl) {
            countEl.textContent = total > 0 ? '(' + total + ' blocked)' : '(none)';
        }
    }

    /**
     * Loads all Jellyfin users and renders a checkbox list for the blocklist.
     * Pre-checks users whose IDs appear in the saved blocklist config.
     * @param {string} blockedIdsString - Comma-separated dashless user IDs to pre-select.
     */
    // Tracks whether the most recent loadBlockedUsersList successfully rendered
    // checkboxes. If /Users API fails, syncBlockedUsersToHiddenInput must not
    // run — otherwise it would wipe the entire blocklist on save.
    let _blockedUsersLoaded = false;
    let blockedUsersGeneration = 0;
    let blockedUsersContainer = null;
    let importGeneration = 0;

    async function loadBlockedUsersList(blockedIdsString) {
        if (lifecycle.disposed) return;
        const container = document.getElementById('blockedUsersContainer');
        const generation = ++blockedUsersGeneration;
        blockedUsersContainer = container;
        const isCurrent = () =>
            !lifecycle.disposed &&
            generation === blockedUsersGeneration &&
            document.getElementById('blockedUsersContainer') === container;
        const blockedSet = new Set(
            (blockedIdsString || '')
                .split(/[,\r\n]+/)
                .map((id) => id.trim().replace(/-/g, '').toLowerCase())
                .filter(Boolean),
        );

        _blockedUsersLoaded = false;
        if (!container) return;
        try {
            const users = await ApiClient.getUsers();
            if (!isCurrent()) return;
            container.textContent = '';
            users.sort((a, b) => a.Name.localeCompare(b.Name));
            users.forEach((user) => {
                const normalizedId = user.Id.replace(/-/g, '').toLowerCase();
                const div = document.createElement('div');
                div.className = 'checkboxContainer';
                div.style.marginBottom = '0.3em';

                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.setAttribute('is', 'emby-checkbox');
                checkbox.className = 'blockedUserCheckbox';
                checkbox.dataset.userid = normalizedId;
                checkbox.checked = blockedSet.has(normalizedId);
                lifecycle.listen(checkbox, 'change', () => {
                    if (isCurrent()) updateBlockedUsersCount();
                });

                const span = document.createElement('span');
                span.textContent = user.Name;

                label.appendChild(checkbox);
                label.appendChild(span);
                div.appendChild(label);
                container.appendChild(div);
            });
            updateBlockedUsersCount();
            _blockedUsersLoaded = true;

            // Show scroll hint if content overflows, hide it once user scrolls to bottom
            const scrollHint = document.getElementById('blockedUsersScrollHint');
            if (scrollHint) {
                const updateHint = () => {
                    if (!isCurrent()) return;
                    const atBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 4;
                    scrollHint.style.display =
                        container.scrollHeight > container.clientHeight && !atBottom ? 'block' : 'none';
                };
                // Check after render
                lifecycle.requestAnimationFrame(updateHint);
                lifecycle.listen(container, 'scroll', updateHint, undefined, 'blocked-users-scroll-hint');
            }
        } catch (e) {
            if (!isCurrent()) return;
            container.textContent = 'Could not load users.';
            console.error('Failed to load users for blocklist:', e);
            _blockedUsersLoaded = false;
        }
    }

    /**
     * Syncs checked blocked-user checkboxes into the hidden input for config save.
     * Skipped if loadBlockedUsersList failed — otherwise we'd wipe the whole
     * blocklist on save.
     */
    function syncBlockedUsersToHiddenInput() {
        if (lifecycle.disposed || document.getElementById('blockedUsersContainer') !== blockedUsersContainer) return;
        if (!_blockedUsersLoaded) {
            console.warn(
                'Jellyfin Enhanced: skipping blocklist sync — user list failed to load. Existing config preserved.',
            );
            return;
        }
        const checkboxes = document.querySelectorAll('.blockedUserCheckbox:checked');
        const ids = Array.from(checkboxes).map((cb) => cb.dataset.userid);
        document.querySelector('#jellyseerrImportBlockedUsers').value = ids.join(',');
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        lifecycle.listen(document.getElementById('btnImportJellyseerrUsers'), 'click', async () => {
            if (lifecycle.disposed) return;
            const btn = document.getElementById('btnImportJellyseerrUsers');
            const resultDiv = document.getElementById('importUsersResult');
            if (!btn || !resultDiv) return;
            const generation = ++importGeneration;
            const isCurrent = () =>
                !lifecycle.disposed &&
                generation === importGeneration &&
                document.getElementById('btnImportJellyseerrUsers') === btn &&
                document.getElementById('importUsersResult') === resultDiv;
            btn.disabled = true;
            btn.textContent = 'Saving config...';
            resultDiv.style.display = 'none';

            try {
                // Save config first so the server uses the current blocklist
                if ((await saveBeforeImport()) !== true) {
                    throw new Error('Configuration save was not completed.');
                }
            } catch (e) {
                if (!isCurrent()) return;
                resultDiv.style.display = 'block';
                resultDiv.textContent = 'Could not save config. Import was not attempted.';
                resultDiv.style.color = '#f44336';
                console.error('Config save failed before import:', e);
                btn.disabled = false;
                btn.textContent = 'Import Users Now';
                return;
            }

            try {
                // Complete an import the admin already requested, even if
                // its editor was replaced while saving. Only its UI expires.
                if (isCurrent()) btn.textContent = 'Importing...';
                const response = await ApiClient.fetch({
                    url: ApiClient.getUrl('JellyfinEnhanced/jellyseerr/import-users'),
                    type: 'POST',
                    dataType: 'json',
                });
                if (!isCurrent()) return;

                // Handle different response shapes defensively (object, wrapped object, or JSON string)
                let payload = response;
                if (typeof payload === 'string') {
                    try {
                        payload = JSON.parse(payload);
                    } catch (_) {
                        payload = {};
                    }
                }
                if (payload && payload.data && typeof payload.data === 'object') {
                    payload = payload.data;
                }

                const usersImported = Number(payload && payload.usersImported);
                const totalUsers = Number(payload && payload.totalUsers);
                const importedCount = Number.isFinite(usersImported) ? usersImported : 0;
                const totalCount = Number.isFinite(totalUsers) ? totalUsers : 0;
                const errors = Array.isArray(payload && payload.errors) ? payload.errors : [];

                resultDiv.style.display = 'block';
                // surface backend errors[] so the admin sees WHY
                // partial imports failed (email collision, 401, etc.) instead
                // of a flat "Imported 0 new users" with no diagnosis.
                while (resultDiv.firstChild) resultDiv.removeChild(resultDiv.firstChild);
                const summary = document.createElement('div');
                summary.textContent = 'Imported ' + importedCount + ' new user(s) out of ' + totalCount + ' total.';
                summary.style.color = errors.length > 0 ? '#ff9800' : '#4caf50';
                resultDiv.appendChild(summary);
                if (errors.length > 0) {
                    const list = document.createElement('ul');
                    list.style.marginTop = '6px';
                    list.style.color = '#f44336';
                    list.style.fontSize = '0.9em';
                    for (const err of errors) {
                        const li = document.createElement('li');
                        li.textContent = String(err);
                        list.appendChild(li);
                    }
                    resultDiv.appendChild(list);
                }
            } catch (e) {
                if (!isCurrent()) return;
                resultDiv.style.display = 'block';
                while (resultDiv.firstChild) resultDiv.removeChild(resultDiv.firstChild);
                const msg = document.createElement('div');
                msg.textContent = 'Import failed. Check Seerr configuration and API key permissions.';
                msg.style.color = '#f44336';
                resultDiv.appendChild(msg);
                // Show response.errors[] when the server returned 502 with structured errors.
                const detailErrors =
                    e && e.responseJSON && Array.isArray(e.responseJSON.errors) ? e.responseJSON.errors : [];
                if (detailErrors.length > 0) {
                    const list = document.createElement('ul');
                    list.style.marginTop = '6px';
                    list.style.color = '#f44336';
                    list.style.fontSize = '0.9em';
                    for (const err of detailErrors) {
                        const li = document.createElement('li');
                        li.textContent = String(err);
                        list.appendChild(li);
                    }
                    resultDiv.appendChild(list);
                }
                console.error('User import failed:', e);
            } finally {
                if (isCurrent()) {
                    btn.disabled = false;
                    btn.textContent = 'Import Users Now';
                }
            }
        });
    }
    return { loadBlockedUsersList, syncBlockedUsersToHiddenInput, initialize, dispose: () => lifecycle.dispose() };
}
