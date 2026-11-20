import type { PageModules } from './modules';
import { asList, asObjects, text } from '../domain/config';
import type { AdminConfig } from '../domain/config';
import { httpUrls, lines } from '../domain/config-values';
import { importPayload } from '../domain/seerr-import';
import { requestFailureWithBody } from '../domain/http';
import { asHtml, needControl, needHtml, needInput } from './dom';

/** Dependencies this module calls; members are resolved lazily, after every module exists. */
export type BlockedUsersDeps = Pick<PageModules, 'context' | 'mediaTagsTab'>;

export function createBlockedUsers(m: BlockedUsersDeps) {
    const { ApiClient, pluginId } = m.context;

        /**
         * Updates the blocked users count badge in the collapsible summary.
         */
        function updateBlockedUsersCount() : void {
            const total = document.querySelectorAll<HTMLElement>('.blockedUserCheckbox:checked').length;
            const countEl = asHtml(document.getElementById('blockedUsersCount'));
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

        async function loadBlockedUsersList(blockedIdsString: string) : Promise<void> {
            const container = needHtml(document.getElementById('blockedUsersContainer'));
            const blockedSet = new Set(
                (blockedIdsString || '').split(/[,\r\n]+/).map(id => id.trim().replace(/-/g, '').toLowerCase()).filter(Boolean)
            );

            _blockedUsersLoaded = false;
            try {
                const users = asObjects(await ApiClient.getUsers());
                container.textContent = '';
                users.sort((a, b) => text(a.Name).localeCompare(text(b.Name)));
                users.forEach(user => {
                    const normalizedId = text(user.Id).replace(/-/g, '').toLowerCase();
                    const div = document.createElement('div');
                    div.className = 'checkboxContainer';
                    div.style.marginBottom = '0.3em';

                    const label = document.createElement('label');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'blockedUserCheckbox jea-switch';
                    label.className = 'jea-toggle';
                    checkbox.dataset.userid = normalizedId;
                    checkbox.checked = blockedSet.has(normalizedId);
                    checkbox.addEventListener('change', updateBlockedUsersCount);

                    const span = document.createElement('span');
                    span.textContent = text(user.Name);

                    label.appendChild(checkbox);
                    label.appendChild(span);
                    div.appendChild(label);
                    container.appendChild(div);
                });
                updateBlockedUsersCount();
                _blockedUsersLoaded = true;

                // Show scroll hint if content overflows, hide it once user scrolls to bottom
                const scrollHint = asHtml(document.getElementById('blockedUsersScrollHint'));
                if (scrollHint) {
                    const updateHint = () => {
                        const atBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 4;
                        scrollHint.style.display = (container.scrollHeight > container.clientHeight && !atBottom) ? 'block' : 'none';
                    };
                    // Check after render
                    requestAnimationFrame(updateHint);
                    container.addEventListener('scroll', updateHint);
                }
            } catch (e) {
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
        function syncBlockedUsersToHiddenInput() : void {
            if (!_blockedUsersLoaded) {
                console.warn('Jellyfin Enhanced: skipping blocklist sync — user list failed to load. Existing config preserved.');
                return;
            }
            const checkboxes = document.querySelectorAll<HTMLElement>('.blockedUserCheckbox:checked');
            const ids = Array.from(checkboxes).map(cb => cb.dataset.userid);
            needControl(document.querySelector('#jellyseerrImportBlockedUsers')).value = ids.join(',');
        }

        /** Blocked user ids, compared without dashes or case. */
        function idSet(ids: string): Set<string> {
            return new Set((ids || '').split(/[,\r\n]+/).map(id => id.trim().replace(/-/g, '').toLowerCase()).filter(Boolean));
        }

        /**
         * The settings the import reads on the server (Seerr on, its URLs and API key, the blocked users) that differ
         * on this page from what is saved, by name, compared the way Save would write them.
         */
        function unsavedImportSettings(saved: AdminConfig): string[] {
            const unsaved: string[] = [];
            if (needInput(document.getElementById('jellyseerrEnabled')).checked !== (saved.JellyseerrEnabled === true)) unsaved.push('"Enable Seerr integration"');
            const urls = (value: string) => httpUrls(lines(value)).valid.join('\n');
            if (urls(needControl(document.getElementById('jellyseerrUrls')).value) !== urls(text(saved.JellyseerrUrls))) unsaved.push('the Seerr URLs');
            const key = (value: string) => value.replace(/\s/g, '');
            if (key(needControl(document.getElementById('JellyseerrApiKey')).value) !== key(text(saved.JellyseerrApiKey))) unsaved.push('the Seerr API key');
            if (_blockedUsersLoaded) {
                const onPage = new Set(Array.from(document.querySelectorAll<HTMLElement>('.blockedUserCheckbox:checked')).map(cb => cb.dataset.userid || ''));
                const stored = idSet(text(saved.JellyseerrImportBlockedUsers));
                if (onPage.size !== stored.size || Array.from(onPage).some(id => !stored.has(id))) unsaved.push('the blocked users');
            }
            return unsaved;
        }

    /** Runs this module's start-up work, in the page's original order. */
    function wire(): void {
        needHtml(document.getElementById('btnImportJellyseerrUsers')).addEventListener('click', async () => {
            const btn = needControl(document.getElementById('btnImportJellyseerrUsers'));
            const resultDiv = needHtml(document.getElementById('importUsersResult'));
            // The import runs outside the save queue, so it holds its own scope.
            const scope = m.mediaTagsTab.jeWriteOrigin();
            btn.disabled = true;
            btn.textContent = 'Checking...';
            resultDiv.style.display = 'none';
            const refuse = (message: string) => {
                resultDiv.style.display = 'block';
                resultDiv.textContent = message;
                resultDiv.style.color = '#f44336';
                btn.disabled = false;
                btn.textContent = 'Import Users Now';
            };

            // The server imports with the saved settings, and the import saves nothing: it runs only when the settings
            // it uses are saved as they are on this page. Other unsaved changes stay unsaved.
            let unsaved: string[];
            try {
                unsaved = unsavedImportSettings(await ApiClient.getPluginConfiguration(pluginId));
                scope.throwIfStale();
            } catch (e) {
                if (!scope.isCurrent()) {
                    btn.disabled = false;
                    btn.textContent = 'Import Users Now';
                    return;
                }
                console.error('Could not read the saved settings before import:', e);
                refuse('Could not read the saved settings. Import was not attempted.');
                return;
            }
            if (unsaved.length > 0) {
                refuse('Save first: the import uses the saved settings, and ' + unsaved.join(', ').replace(/, ([^,]*)$/, ' and $1')
                    + (unsaved.length > 1 ? ' have' : ' has') + ' changes on this page that are not saved. Nothing was imported.');
                return;
            }

            try {
                scope.throwIfStale();
                btn.textContent = 'Importing...';
                const response = await ApiClient.fetch({
                    url: ApiClient.getUrl('JellyfinEnhanced/jellyseerr/import-users'),
                    type: 'POST',
                    dataType: 'json'
                });

                // Handle different response shapes defensively (object, wrapped object, or JSON string)
                scope.throwIfStale();
                const payload = importPayload(response);

                const usersImported = Number(payload.usersImported);
                const totalUsers = Number(payload.totalUsers);
                const importedCount = Number.isFinite(usersImported) ? usersImported : 0;
                const totalCount = Number.isFinite(totalUsers) ? totalUsers : 0;
                const errors = asList(payload.errors);

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
                if (!scope.isCurrent()) return;
                resultDiv.style.display = 'block';
                while (resultDiv.firstChild) resultDiv.removeChild(resultDiv.firstChild);
                const msg = document.createElement('div');
                msg.textContent = 'Import failed. Check Seerr configuration and API key permissions.';
                msg.style.color = '#f44336';
                resultDiv.appendChild(msg);
                // Show response.errors[] when the server returned 502 with structured errors.
                const detailErrors = asList((await requestFailureWithBody(e)).body?.errors);
                if (!scope.isCurrent()) return;
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
                btn.disabled = false;
                btn.textContent = 'Import Users Now';
            }
        });
    }

    return {
        wire,
        loadBlockedUsersList,
        syncBlockedUsersToHiddenInput,
    };
}
