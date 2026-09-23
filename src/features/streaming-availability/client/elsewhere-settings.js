// Owns the Elsewhere catalog, per-user preferences, and settings modal.
// Creation is side-effect free; initialize() installs the session-change listener.
(function (JE) {
    'use strict';

    function createElsewhereSettings(DEFAULT_REGION) {
        let userRegion = DEFAULT_REGION;
        let userRegions = []; // Multiple regions for search
        let userServices = []; // Empty by default - will show all services from settings region
        let availableRegions = {};
        let availableProviders = [];

        // Load regions and providers from GitHub repo
        function loadRegionsAndProviders() {
            fetch(JE.cdn.url('elsewhere-res', 'regions.txt'))
                .then(response => response.ok ? response.text() : Promise.reject())
                .then(text => {
                    const lines = text.trim().split('\n');
                    lines.forEach(line => {
                        if (line.startsWith('#')) return;
                        const [code, name] = line.split('\t');
                        if (code && name) {
                            availableRegions[code] = name;
                        }
                    });
                })
                .catch(() => {
                    // Fallback to hardcoded regions
                    availableRegions = {
                        'US': 'United States', 'GB': 'United Kingdom', 'IN': 'India', 'CA': 'Canada',
                        'DE': 'Germany', 'FR': 'France', 'JP': 'Japan', 'AU': 'Australia',
                        'BR': 'Brazil', 'MX': 'Mexico', 'IE': 'Ireland', 'IT': 'Italy',
                        'ES': 'Spain', 'NL': 'Netherlands', 'SE': 'Sweden', 'NO': 'Norway',
                        'DK': 'Denmark', 'FI': 'Finland'
                    };
                });

                 // Load providers
            fetch(JE.cdn.url('elsewhere-res', 'providers.txt'))
                .then(response => response.ok ? response.text() : Promise.reject())
                .then(text => {
                    availableProviders = text.trim().split('\n')
                        .filter(line => !line.startsWith('#') && line.trim() !== '');
                })
                .catch(() => {
                    availableProviders = [
                        // Fallback to hardcoded providers
                        'Netflix', 'Amazon Prime Video', 'Disney Plus', 'HBO Max',
                        'Hulu', 'Apple TV Plus', 'Paramount Plus', 'Peacock',
                        'JioCinema', 'Disney+ Hotstar', 'ZEE5', 'SonyLIV'
                    ];
                });
        }

        function createMaterialIcon(iconName, size = '18px') {
            const icon = document.createElement('span');
            icon.className = 'material-icons';
            icon.textContent = iconName;
            icon.style.fontSize = size;
            icon.style.lineHeight = '1';
            return icon;
        }

        function createAutocompleteInput(placeholder, options, selectedValues, onSelect) {
            const container = document.createElement('div');
            container.style.cssText = 'position: relative; margin-bottom: 6px;';

            let debounceTimer;
            // Use helpers.debounce if available for consistent behavior
            const debouncedFilter = JE.helpers?.debounce ? JE.helpers.debounce((filterText) => {
                const value = filterText.toLowerCase();
                if (value.length === 0) {
                    dropdown.style.display = 'none';
                    return;
                }
                const filtered = options.filter(option =>
                    option.toLowerCase().includes(value) && !selectedValues.includes(option)
                );
                showDropdown(filtered);
            }, 300) : null;

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = placeholder;
            input.style.cssText = `
                width: 100%;
                padding: 10px;
                border: 1px solid #444;
                border-radius: 6px;
                box-sizing: border-box;
                background: #2a2a2a;
                color: #fff;
                font-size: 14px;
            `;

            const dropdown = document.createElement('div');
            dropdown.style.cssText = `
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: #1a1a1a;
                border: 1px solid #444;
                border-top: none;
                border-radius: 6px;
                max-height: 200px;
                overflow-y: auto;
                display: none;
                z-index: 1000;
            `;

            const selectedContainer = document.createElement('div');
            selectedContainer.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 6px;
            `;

            let selectedIndex = -1;
            let filteredOptions = [];

            function updateSelected() {
                selectedContainer.innerHTML = '';
                selectedValues.forEach(value => {
                    const tag = document.createElement('span');
                    tag.className = 'selected-tag';
                    tag.style.cssText = `
                        background: #0078d4;
                        color: white;
                        padding: 4px 10px;
                        border-radius: 16px;
                        font-size: 12px;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                    `;
                    tag.textContent = value;

                    const remove = document.createElement('span');
                    remove.textContent = '×';
                    remove.style.cssText = 'cursor: pointer; font-weight: bold; font-size: 14px;';
                    remove.onclick = () => {
                        const index = selectedValues.indexOf(value);
                        if (index > -1) {
                            selectedValues.splice(index, 1);
                            updateSelected();
                        }
                    };
                    tag.appendChild(remove);
                    selectedContainer.appendChild(tag);
                });
            }

            function showDropdown(options) {
                dropdown.innerHTML = '';
                dropdown.style.display = 'block';
                filteredOptions = options;
                selectedIndex = -1;

                options.forEach((option, index) => {
                    const item = document.createElement('div');
                    item.textContent = option;
                    item.style.cssText = `
                        padding: 10px;
                        cursor: pointer;
                        border-bottom: 1px solid #333;
                        color: #fff;
                        font-size: 14px;
                    `;
                    item.dataset.index = index;

                    item.onmouseenter = () => {
                        clearSelection();
                        item.style.background = '#333';
                        selectedIndex = index;
                    };

                    item.onmouseleave = () => {
                        item.style.background = '#1a1a1a';
                    };

                    item.onclick = () => selectOption(option);
                    dropdown.appendChild(item);
                });
            }

            function clearSelection() {
                dropdown.querySelectorAll('div').forEach(item => {
                    item.style.background = '#1a1a1a';
                });
            }

            function updateSelection() {
                clearSelection();
                if (selectedIndex >= 0 && selectedIndex < filteredOptions.length) {
                    const item = dropdown.querySelector(`[data-index="${selectedIndex}"]`);
                    if (item) {
                        item.style.background = '#333';
                        item.scrollIntoView({ block: 'nearest' });
                    }
                }
            }

            function selectOption(option) {
                if (!selectedValues.includes(option)) {
                    selectedValues.push(option);
                    updateSelected();
                    onSelect(selectedValues);
                }
                input.value = '';
                dropdown.style.display = 'none';
                selectedIndex = -1;
            }

            input.oninput = () => {
                if (debouncedFilter) {
                    debouncedFilter(input.value);
                } else {
                    // Fallback to manual debounce if helpers not available
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        const value = input.value.toLowerCase();
                        if (value.length === 0) {
                            dropdown.style.display = 'none';
                            return;
                        }
                        const filtered = options.filter(option =>
                            option.toLowerCase().includes(value) && !selectedValues.includes(option)
                        );
                        showDropdown(filtered);
                    }, 300);
                }
            };

            input.onkeydown = (e) => {
                if (dropdown.style.display === 'none') return;

                switch (e.key) {
                    case 'ArrowDown':
                        e.preventDefault();
                        selectedIndex = Math.min(selectedIndex + 1, filteredOptions.length - 1);
                        updateSelection();
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        selectedIndex = Math.max(selectedIndex - 1, -1);
                        updateSelection();
                        break;
                    case 'Enter':
                        e.preventDefault();
                        if (selectedIndex >= 0 && selectedIndex < filteredOptions.length) {
                            selectOption(filteredOptions[selectedIndex]);
                        }
                        break;
                    case 'Escape':
                        dropdown.style.display = 'none';
                        selectedIndex = -1;
                        break;
                }
            };

            input.onblur = (e) => {
                // Delay hiding to allow clicks on dropdown items
                setTimeout(() => {
                    if (!dropdown.contains(document.activeElement)) {
                        dropdown.style.display = 'none';
                    }
                }, 200);
            };

            container.appendChild(input);
            container.appendChild(dropdown);
            container.appendChild(selectedContainer);

            updateSelected();
            return container;
        }
        // Create settings modal
        function createSettingsModal() {
            const modal = document.createElement('div');
            modal.id = 'streaming-settings-modal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.85);
                display: none;
                z-index: 10000;
                align-items: center;
                justify-content: center;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                background: #181818;
                padding: 20px;
                border-radius: 8px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                color: #fff;
                border: 1px solid #333;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            `;

            content.innerHTML = `
                <h3 style="margin-top: 0; margin-bottom: 16px; color: #fff; font-size: 18px; font-weight: bolder;">${JE.t('elsewhere_settings_title')}</h3>

                <div style="margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                        <label style="font-weight: 600; color: #ccc;">${JE.t('elsewhere_settings_country')}</label>
                        <button type="button" id="reset-region-btn" title="Reset to plugin default" style="display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: #999; cursor: pointer; padding: 2px; border-radius: 4px;"></button>
                    </div>
                    <select id="region-select" style="width: 100%; padding: 12px; border: 1px solid #444; border-radius: 6px; background: #2a2a2a; color: #fff; font-size: 14px;">
                        ${Object.entries(availableRegions).map(([code, name]) =>
                            `<option value="${code}" ${code === userRegion ? 'selected' : ''}>${name}</option>`
                        ).join('')}
                    </select>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #ccc;">${JE.t('elsewhere_settings_other_countries')}</label>
                    <div id="regions-autocomplete"></div>
                </div>

               <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #ccc;">${JE.t('elsewhere_settings_providers')}</label>
                    <div id="services-autocomplete"></div>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="cancel-settings" style="padding: 10px 18px; border: 1px solid #444; background: #2a2a2a; color: #fff; border-radius: 6px; cursor: pointer; font-size: 14px;">${JE.t('elsewhere_settings_cancel')}</button>
                    <button id="save-settings" style="padding: 10px 18px; border: none; background: #0078d4; color: white; border-radius: 6px; cursor: pointer; font-size: 14px;">${JE.t('elsewhere_settings_save')}</button>
                </div>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            // Reset the region dropdown to the admin-configured default when the reset button is clicked
            const resetRegionBtn = content.querySelector('#reset-region-btn');
            resetRegionBtn.appendChild(createMaterialIcon('restart_alt', '16px'));
            resetRegionBtn.onmouseenter = () => { resetRegionBtn.style.color = '#fff'; };
            resetRegionBtn.onmouseleave = () => { resetRegionBtn.style.color = '#999'; };
            resetRegionBtn.onclick = () => {
                document.getElementById('region-select').value = DEFAULT_REGION;
            };

            // Add autocomplete for regions
            const regionsContainer = content.querySelector('#regions-autocomplete');
            const regionOptions = Object.entries(availableRegions).map(([code, name]) => `${name} (${code})`);
            const regionsAutocomplete = createAutocompleteInput(
                JE.t('elsewhere_settings_add_countries_placeholder'),
                regionOptions,
                userRegions.map(code => `${availableRegions[code] || code} (${code})`),
                (selected) => {}
            );
            regionsContainer.appendChild(regionsAutocomplete);

            // Add autocomplete for services
            const servicesContainer = content.querySelector('#services-autocomplete');
            const servicesAutocomplete = createAutocompleteInput(
                JE.t('elsewhere_settings_add_providers_placeholder'),
                availableProviders,
                userServices.slice(),
                (selected) => {}
            );
            servicesContainer.appendChild(servicesAutocomplete);

            document.getElementById('cancel-settings').onclick = () => {
                modal.style.display = 'none';
            };

            document.getElementById('save-settings').onclick = () => {
                userRegion = document.getElementById('region-select').value;

                // Get selected regions from autocomplete
                const selectedRegions = [];
                regionsContainer.querySelectorAll('.selected-tag').forEach(tag => {
                    const text = tag.textContent.replace('×', '').trim();
                    const match = text.match(/\(([A-Z]{2})\)$/);
                    if (match) {
                        selectedRegions.push(match[1]);
                    }
                });
                userRegions = selectedRegions;

                // Get selected services from autocomplete
                const selectedServices = [];
                servicesContainer.querySelectorAll('.selected-tag').forEach(tag => {
                    selectedServices.push(tag.textContent.replace('×', '').trim());
                });
                userServices = selectedServices;

                modal.style.display = 'none';

                const elsewhereSettings = {
                    Region: userRegion,
                    Regions: userRegions,
                    Services: userServices
                };
                JE.saveUserSettings('elsewhere.json', elsewhereSettings);
            };

            // Close on backdrop click
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            };
        }

        // Load saved settings
        function loadSettings() {
            const settings = JE.userConfig.elsewhere || {};
            userRegion = settings.Region || DEFAULT_REGION;
            userRegions = settings.Regions || [];
            userServices = settings.Services || [];
        }

        return {
            get userRegion() { return userRegion; },
            get userRegions() { return userRegions; },
            get userServices() { return userServices; },
            get availableRegions() { return availableRegions; },
            createMaterialIcon,
            createSettingsModal,
            initialize() {
                loadRegionsAndProviders();
                loadSettings();
                // This closure survives an SPA logout/login, so re-read the incoming
                // user's saved regions/services once their config has been reloaded —
                // otherwise user B keeps browsing with user A's Elsewhere preferences.
                document.addEventListener('je:user-data-loaded', loadSettings);
            }
        };
    }

    JE.elsewhereSettings = { create: createElsewhereSettings };
})(window.JellyfinEnhanced);
