/** Feature settings and its private editor state. */
function createUserSettingsLanguages({ lifecycle }) {
    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Populate language options dynamically
        (async () => {
            const defaultLanguageSelect = document.getElementById('DefaultLanguage');
            if (!defaultLanguageSelect || lifecycle.disposed) return;
            const isCurrent = () =>
                !lifecycle.disposed && document.getElementById('DefaultLanguage') === defaultLanguageSelect;

            const CUSTOM_DISPLAY_NAMES = {
                pr: 'Pirate',
                'en-GB': 'English (United Kingdom)',
                'en-US': 'English (United States)',
                'zh-CN': 'Chinese (Simplified)',
                'zh-HK': 'Chinese (Hong Kong)',
                'pt-BR': 'Portuguese (Brazil)',
            };

            try {
                const [localeCodes, cultures] = await Promise.all([
                    ApiClient.ajax({
                        type: 'GET',
                        url: ApiClient.getUrl('/JellyfinEnhanced/locales'),
                        dataType: 'json',
                    }),
                    ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('/Localization/Cultures'), dataType: 'json' }),
                ]);

                if (!isCurrent()) return;

                // Check upstream locales at the repository's root locale directory. A missing
                // directory means that upstream branch still uses the pre-layout path; other
                // failures (including rate limits) keep the bundled server list without another request.
                try {
                    let ghResp = await fetch('https://api.github.com/repos/n00bcodr/Jellyfin-Enhanced/contents/locales');
                    if (!isCurrent()) return;
                    if (ghResp.status === 404) {
                        ghResp = await fetch(
                            'https://api.github.com/repos/n00bcodr/Jellyfin-Enhanced/contents/Jellyfin.Plugin.JellyfinEnhanced/js/locales',
                        );
                    }
                    if (!isCurrent()) return;
                    if (ghResp.ok) {
                        const files = await ghResp.json();
                        if (!isCurrent()) return;
                        const serverSet = new Set(localeCodes.map((c) => c.toLowerCase()));
                        files.forEach((f) => {
                            if (f.name.endsWith('.json') && f.name !== 'en.json') {
                                const code = f.name.replace('.json', '');
                                if (!serverSet.has(code.toLowerCase())) {
                                    localeCodes.push(code);
                                    serverSet.add(code.toLowerCase());
                                }
                            }
                        });
                    }
                } catch (_) {
                    /* GitHub unavailable, server list is sufficient */
                }

                if (!isCurrent()) return;
                const cultureMap = {};
                cultures.forEach((c) => {
                    cultureMap[c.TwoLetterISOLanguageName.toLowerCase()] = c;
                });

                const localeSet = new Set(localeCodes.map((c) => c.toLowerCase()));
                const uniqueCodes = [...new Map(localeCodes.map((code) => [code.toLowerCase(), code])).values()];
                const options = uniqueCodes.map((code) => {
                    let displayName = CUSTOM_DISPLAY_NAMES[code] || cultureMap[code.toLowerCase()]?.DisplayName;
                    if (!displayName && code.includes('-')) {
                        const baseName = cultureMap[code.split('-')[0].toLowerCase()]?.DisplayName;
                        displayName =
                            baseName && localeSet.has(code.split('-')[0].toLowerCase())
                                ? `${baseName} (${code.split('-')[1]})`
                                : baseName;
                    }
                    return { code, displayName: displayName || code };
                });

                // Jellyfin can execute the page script again against the same select.
                // Replace its dynamic options rather than appending another copy,
                // retaining System Default and the administrator's current selection.
                const selected = defaultLanguageSelect.value;
                const existing = Array.from(defaultLanguageSelect.options);
                if (selected && !options.some((option) => option.code === selected)) {
                    const retained = existing.find((option) => option.value === selected);
                    options.push({ code: selected, displayName: retained ? retained.textContent : selected });
                }
                existing.filter((option) => option.value !== '').forEach((option) => option.remove());
                options.sort((a, b) => a.displayName.localeCompare(b.displayName));
                options.forEach(({ code, displayName }) => {
                    const option = document.createElement('option');
                    option.value = code;
                    option.textContent = displayName;
                    defaultLanguageSelect.appendChild(option);
                });
                defaultLanguageSelect.value = selected;
            } catch (err) {
                if (isCurrent()) console.warn('Jellyfin Enhanced: Failed to load language options:', err);
            }
        })();
    }
    return { initialize, dispose: () => lifecycle.dispose() };
}
