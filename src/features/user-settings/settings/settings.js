/** Feature settings and its private editor state. */
function createUserSettingsSettings({ lifecycle }) {
    function loadUserSettingsSettings(config) {
        const savedShortcuts = config.Shortcuts && config.Shortcuts.length > 0 ? config.Shortcuts : defaultShortcuts;
        shortcutOverrides = savedShortcuts.filter((saved) => {
            const def = defaultShortcuts.find((d) => d.Name === saved.Name);
            return !def || saved.Key !== def.Key;
        });
        loadedShortcutNames = new Set(savedShortcuts.map((shortcut) => shortcut.Name));
        renderOverrides();
        populateAddShortcutDropdown();
        // Load all other settings
        document.querySelector('#devMode').checked = config.DevMode;
        document.querySelector('#disableAllShortcuts').checked = config.DisableAllShortcuts;
        document.querySelector('#ToastDuration').value = config.ToastDuration;
        document.querySelector('#HelpPanelAutocloseDelay').value = config.HelpPanelAutocloseDelay;
        document.querySelector('#DefaultLanguage').value = config.DefaultLanguage || '';
    }

    function readUserSettingsSettings(config) {
        // Preserve unknown shortcuts from newer versions/extensions, including
        // entries added after hydration. An explicit editor removal still wins
        // for an entry that this page actually loaded.
        const freshUnknown = (config.Shortcuts || []).filter(
            (shortcut) =>
                !defaultShortcuts.some((item) => item.Name === shortcut.Name) &&
                !loadedShortcutNames.has(shortcut.Name),
        );
        const finalShortcuts = [...defaultShortcuts, ...freshUnknown];
        shortcutOverrides.forEach((override) => {
            const index = finalShortcuts.findIndex((s) => s.Name === override.Name);
            if (index !== -1) finalShortcuts[index] = override;
            else finalShortcuts.push(override);
        });
        config.Shortcuts = finalShortcuts;
        config.DevMode = document.querySelector('#devMode').checked;
        config.DisableAllShortcuts = document.querySelector('#disableAllShortcuts').checked;
        config.ToastDuration = parseInt(document.querySelector('#ToastDuration').value, 10);
        config.HelpPanelAutocloseDelay = parseInt(document.querySelector('#HelpPanelAutocloseDelay').value, 10);
        config.DefaultLanguage = document.querySelector('#DefaultLanguage').value || '';
    }

    const shortcutListContainer = document.getElementById('shortcut-list-container');

    const addShortcutSelect = document.getElementById('add-shortcut-select');

    const addShortcutKeyInput = document.getElementById('add-shortcut-key');

    const addShortcutBtn = document.getElementById('add-shortcut-btn');

    const disableShortcutBtn = document.getElementById('disable-shortcut-btn');

    const shortcutErrorComment = document.getElementById('shortcut-error-comment');

    let shortcutOverrides = [];
    let loadedShortcutNames = new Set();

    const defaultShortcuts = [
        { Name: 'OpenSearch', Key: '/', Label: 'Open Search', Category: 'Global' },
        { Name: 'GoToHome', Key: 'Shift+H', Label: 'Go to Home', Category: 'Global' },
        { Name: 'GoToDashboard', Key: 'D', Label: 'Go to Dashboard', Category: 'Global' },
        { Name: 'QuickConnect', Key: 'Q', Label: 'Quick Connect', Category: 'Global' },
        { Name: 'PlayRandomItem', Key: 'R', Label: 'Play Random Item', Category: 'Global' },
        { Name: 'CycleAspectRatio', Key: 'A', Label: 'Cycle Aspect Ratio', Category: 'Player' },
        { Name: 'ShowPlaybackInfo', Key: 'I', Label: 'Show Playback Info', Category: 'Player' },
        { Name: 'SubtitleMenu', Key: 'S', Label: 'Subtitle Menu', Category: 'Player' },
        { Name: 'CycleSubtitleTracks', Key: 'C', Label: 'Cycle Subtitle Tracks', Category: 'Player' },
        { Name: 'CycleAudioTracks', Key: 'V', Label: 'Cycle Audio Tracks', Category: 'Player' },
        { Name: 'IncreasePlaybackSpeed', Key: '+', Label: 'Increase Playback Speed', Category: 'Player' },
        { Name: 'DecreasePlaybackSpeed', Key: '-', Label: 'Decrease Playback Speed', Category: 'Player' },
        { Name: 'ResetPlaybackSpeed', Key: 'R', Label: 'Reset Playback Speed', Category: 'Player' },
        { Name: 'BookmarkCurrentTime', Key: 'B', Label: 'Bookmark Current Time', Category: 'Player' },
        { Name: 'OpenEpisodePreview', Key: 'P', Label: 'Open Episode Preview', Category: 'Player' },
        { Name: 'SkipIntroOutro', Key: 'O', Label: 'Skip Intro/Outro', Category: 'Player' },
        { Name: 'FrameStepBack', Key: ',', Label: 'Step Back One Frame', Category: 'Player' },
        { Name: 'FrameStepForward', Key: '.', Label: 'Step Forward One Frame', Category: 'Player' },
        { Name: 'JumpToLastPosition', Key: 'Z', Label: 'Jump to Last Position', Category: 'Player' },
        { Name: 'JumpToPercentage', Key: '0-9', Label: 'Jump to % of video', Category: 'Player' },
    ];

    function renderOverrides() {
        shortcutListContainer.innerHTML = '';
        if (shortcutOverrides.length === 0) {
            shortcutListContainer.innerHTML =
                '<p class="fieldDescription" style="text-align: center;">No overrides configured. All shortcuts are using default values.</p>';
        }
        shortcutOverrides.forEach((shortcut, index) => {
            const row = document.createElement('div');
            row.className = 'inputContainer';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '1em';

            const label = document.createElement('label');
            label.className = 'inputLabel';
            label.textContent = shortcut.Label;
            label.style.flex = '1';

            const input = document.createElement('input');
            input.setAttribute('is', 'emby-input');
            input.type = 'text';
            input.value = shortcut.Key;
            input.style.flex = '1';
            input.style.textAlign = 'center';
            if (shortcut.Key === '') {
                input.placeholder = 'Disabled';
                input.style.opacity = '0.6';
                input.title =
                    'This shortcut is disabled server-wide. Type a key here to re-enable it with that binding, or click Remove to revert to the default.';
            }
            lifecycle.listen(input, 'input', (e) => {
                let value = e.target.value;
                // Automatically convert single lowercase letters to uppercase ***
                if (value.match(/^[a-z]$/)) {
                    value = value.toUpperCase();
                    e.target.value = value;
                }
                input.style.opacity = value === '' ? '0.6' : '';
                input.placeholder = value === '' ? 'Disabled' : '';
                shortcutOverrides[index].Key = value;
            });

            const buttonContainer = document.createElement('div');
            const removeBtn = document.createElement('button');
            removeBtn.setAttribute('is', 'emby-button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'Remove';
            removeBtn.className = 'raised button-cancel';
            removeBtn.style.marginLeft = '1em';
            lifecycle.listen(removeBtn, 'click', () => {
                shortcutOverrides.splice(index, 1);
                renderOverrides();
                populateAddShortcutDropdown();
            });

            buttonContainer.appendChild(removeBtn);
            row.appendChild(label);
            row.appendChild(input);
            row.appendChild(buttonContainer);
            shortcutListContainer.appendChild(row);
        });
    }

    function populateAddShortcutDropdown() {
        addShortcutSelect.innerHTML = '';
        const overriddenNames = shortcutOverrides.map((s) => s.Name);
        const availableShortcuts = defaultShortcuts.filter((s) => !overriddenNames.includes(s.Name));

        availableShortcuts.forEach((shortcut) => {
            const option = document.createElement('option');
            option.value = shortcut.Name;
            option.textContent = shortcut.Label;
            addShortcutSelect.appendChild(option);
        });
        addShortcutBtn.disabled = availableShortcuts.length === 0;
        addShortcutKeyInput.disabled = availableShortcuts.length === 0;
        disableShortcutBtn.disabled = availableShortcuts.length === 0;
    }

    function showValidationError(elementToShake, message) {
        shortcutErrorComment.textContent = message;
        shortcutErrorComment.style.display = 'block';
        elementToShake.classList.add('shake');

        lifecycle.setTimeout(() => {
            elementToShake.classList.remove('shake');
            shortcutErrorComment.style.display = 'none';
        }, 8000);
    }

    function getShortcutOverrides() {
        return shortcutOverrides;
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        lifecycle.listen(addShortcutBtn, 'click', () => {
            const selectedName = addShortcutSelect.value;
            let newKey = addShortcutKeyInput.value.trim();

            // Automatically convert single lowercase letters to uppercase ***
            if (newKey.match(/^[a-z]$/)) {
                newKey = newKey.toUpperCase();
            }

            // Check 0: See if there is a key being added
            if (!selectedName || !newKey) {
                showValidationError(addShortcutBtn, 'Please enter a key to use as an override.');
                return;
            }

            // Check 1: See if the key is already used in another custom override.
            const overrideConflict = shortcutOverrides.find((s) => s.Key.toLowerCase() === newKey.toLowerCase());

            if (overrideConflict) {
                const errorMessage =
                    "The key '" + newKey + "' is already assigned to '" + overrideConflict.Label + "' as an override.";
                showValidationError(addShortcutKeyInput.parentElement, errorMessage);
                return;
            }

            // Check 2: See if the key is used by another default shortcut.
            const defaultConflict = defaultShortcuts.find(
                (s) => s.Key.toLowerCase() === newKey.toLowerCase() && s.Name !== selectedName,
            );

            if (defaultConflict) {
                const errorMessage = "The key '" + newKey + "' is already used by '" + defaultConflict.Label + "'.";
                showValidationError(addShortcutKeyInput.parentElement, errorMessage);
                return;
            }

            const defaultConfig = defaultShortcuts.find((s) => s.Name === selectedName);
            if (defaultConfig) {
                shortcutOverrides.push({ ...defaultConfig, Key: newKey });
                renderOverrides();
                populateAddShortcutDropdown();
                addShortcutKeyInput.value = '';
            }
        });

        lifecycle.listen(disableShortcutBtn, 'click', () => {
            const selectedName = addShortcutSelect.value;
            if (!selectedName) return;

            const defaultConfig = defaultShortcuts.find((s) => s.Name === selectedName);
            if (defaultConfig) {
                // An empty Key is the same "disabled" sentinel the per-user Enhanced Panel
                // uses — it can never match a real keypress, so the shortcut just no-ops.
                shortcutOverrides.push({ ...defaultConfig, Key: '' });
                renderOverrides();
                populateAddShortcutDropdown();
                addShortcutKeyInput.value = '';
            }
        });
    }
    return {
        load: loadUserSettingsSettings,
        read: readUserSettingsSettings,
        getShortcutOverrides,
        initialize,
        dispose: () => lifecycle.dispose(),
    };
}
