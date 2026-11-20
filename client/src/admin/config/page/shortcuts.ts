import type { PageModules } from './modules';
import { DEFAULT_SHORTCUTS, shortcutClash, shortcutCombo } from '../domain/shortcuts';
import { needHtml } from './dom';
import type { ShortcutEntry } from './types';

/** Dependencies this module calls; members are resolved lazily, after every module exists. */
export type ShortcutsDeps = Pick<PageModules, 'context'>;

export function createShortcuts(m: ShortcutsDeps) {
            const shortcutGrid = needHtml(document.getElementById('shortcut-grid'));

            const shortcutErrorComment = needHtml(document.getElementById('shortcut-error-comment'));

            let shortcutOverrides: ShortcutEntry[] = [];

        const defaultShortcuts = DEFAULT_SHORTCUTS;

        function effectiveShortcutKey(def: ShortcutEntry) : string {
            const o = shortcutOverrides.find(x => x.Name === def.Name);
            return o ? o.Key : def.Key;
        }

        function setShortcutOverride(def: ShortcutEntry, key: string) : void {
            shortcutOverrides = shortcutOverrides.filter(x => x.Name !== def.Name);
            if (key !== def.Key) shortcutOverrides.push({ ...def, Key: key });
            renderOverrides();
        }

        function showValidationError(chip: HTMLElement, message: string) : void {
            shortcutErrorComment.textContent = message;
            shortcutErrorComment.style.display = 'block';
            chip.classList.add('je-sc-error');
            setTimeout(() => {
                chip.classList.remove('je-sc-error');
                shortcutErrorComment.style.display = 'none';
            }, 4000);
        }

        /** The shortcut whose key is being recorded, so a redraw can put focus back on it. */
        let focusAfterRender: string | null = null;

        /** Assigns a key after the same clash check, whichever way it was chosen (typed, restored or re-enabled). */
        function assignKey(def: ShortcutEntry, combo: string, chip: HTMLElement) : boolean {
            if (combo) {
                // Restoring a default is checked too: another shortcut may have taken that key since.
                const taken = combo === def.Key ? defaultShortcuts.find(other => other.Name !== def.Name && effectiveShortcutKey(other) === combo) : undefined;
                const clash = shortcutClash(def, combo, defaultShortcuts, effectiveShortcutKey)
                    ?? (taken ? "The key '" + combo + "' is already used by '" + (taken.Label ?? taken.Name) + "'." : null);
                if (clash) { showValidationError(chip, clash); return false; }
            }
            focusAfterRender = def.Name;
            setShortcutOverride(def, combo);
            return true;
        }

        function renderOverrides() : void {
            shortcutGrid.innerHTML = '';
            ['Global', 'Player'].forEach(category => {
                const col = document.createElement('div');
                const title = document.createElement('h4');
                title.textContent = category;
                col.appendChild(title);

                defaultShortcuts.filter(d => d.Category === category && d.Name !== 'JumpToPercentage').forEach(def => {
                    const key = effectiveShortcutKey(def);
                    // The space bar has no visible character of its own.
                    const keyName = key === ' ' ? 'Space' : key;
                    const isDisabled = key === '';
                    const isModified = shortcutOverrides.some(x => x.Name === def.Name);
                    const action = def.Label ?? def.Name;

                    const row = document.createElement('div');
                    row.className = 'je-sc-row' + (isDisabled ? ' je-sc-disabled' : '');
                    row.dataset.scName = def.Name;

                    // Action first, then its key and the disable button, so the list reads like a menu.
                    const name = document.createElement('div');
                    name.className = 'je-sc-name';
                    name.appendChild(document.createTextNode(action));
                    if (isModified) {
                        const dot = document.createElement('span');
                        dot.className = 'je-sc-mod';
                        dot.textContent = 'Changed';
                        dot.title = 'Default: ' + (def.Key || 'none');
                        name.appendChild(dot);
                    }

                    const controls = document.createElement('div');
                    controls.className = 'je-sc-left';
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'je-sc-key';
                    chip.textContent = isDisabled ? 'Off' : keyName;
                    const idleName = action + ': ' + (isDisabled ? 'disabled' : keyName) + '. Press to record a new key';
                    chip.setAttribute('aria-label', idleName);
                    let recording = false;
                    const stop = () => {
                        recording = false;
                        chip.removeAttribute('data-je-key-recorder');
                        chip.classList.remove('je-sc-recording');
                        chip.setAttribute('aria-pressed', 'false');
                        chip.textContent = isDisabled ? 'Off' : keyName;
                        chip.setAttribute('aria-label', idleName);
                    };
                    chip.setAttribute('aria-pressed', 'false');
                    // Recording starts only on purpose (click, Enter or Space), never just by tabbing onto the key.
                    chip.addEventListener('click', () => {
                        if (recording) return;
                        recording = true;
                        // While it listens, no shortcut runs: the plugin's listener stands aside for a key recorder,
                        // and the press does not travel on to Jellyfin's own (below).
                        chip.setAttribute('data-je-key-recorder', '');
                        chip.classList.add('je-sc-recording');
                        chip.setAttribute('aria-pressed', 'true');
                        chip.textContent = 'Press a key…';
                        chip.setAttribute('aria-label', 'Recording a key for ' + action + '. Escape cancels, Delete turns it off, Backspace restores the default');
                    });
                    chip.addEventListener('blur', () => { if (recording) stop(); });
                    chip.addEventListener('keydown', (e) => {
                        if (!recording) return;
                        // Tab cancels and moves on as usual.
                        if (e.key === 'Tab') { stop(); return; }
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.key === 'Escape') { stop(); return; }
                        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
                        if (e.key === 'Backspace') { assignKey(def, def.Key, chip); return; }
                        if (e.key === 'Delete') { assignKey(def, '', chip); return; }
                        assignKey(def, shortcutCombo(e), chip);
                    });
                    controls.appendChild(chip);

                    const toggle = document.createElement('button');
                    toggle.type = 'button';
                    toggle.className = 'je-sc-btn' + (isDisabled ? ' je-sc-btn-off' : '');
                    toggle.title = isDisabled ? 'Turn back on with its default key' : 'Turn off for every user';
                    toggle.setAttribute('aria-label', isDisabled ? 'Turn on ' + action + ' with its default key' : 'Turn off ' + action + ' for every user');
                    toggle.innerHTML = '<span class="material-icons" aria-hidden="true">' + (isDisabled ? 'settings_backup_restore' : 'block') + '</span>';
                    toggle.addEventListener('click', () => {
                        if (assignKey(def, isDisabled ? def.Key : '', chip)) focusAfterRender = null;
                        shortcutGrid.querySelector<HTMLElement>('[data-sc-name="' + def.Name + '"] .je-sc-btn')?.focus();
                    });
                    controls.appendChild(toggle);

                    row.appendChild(name);
                    row.appendChild(controls);
                    col.appendChild(row);
                });
                shortcutGrid.appendChild(col);
            });
            if (focusAfterRender) {
                const name = focusAfterRender;
                focusAfterRender = null;
                shortcutGrid.querySelector<HTMLElement>('[data-sc-name="' + name + '"] .je-sc-key')?.focus();
            }
        }

    /** Runs this module's start-up work, in the page's original order. */
    function wire(): void {

    }

    return {
        wire,
        defaultShortcuts,
        renderOverrides,
        get shortcutOverrides() { return shortcutOverrides; },
        set shortcutOverrides(value) { shortcutOverrides = value; },
    };
}
