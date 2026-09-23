// Streaming availability panels and their search interactions.
// Settings remain live across saves/account changes; transport is injected by the entrypoint.
(function (JE) {
    'use strict';

    function createElsewherePanel(settings, fetchStreamingData) {
        const { createMaterialIcon } = settings;
        const DEFAULT_PROVIDERS = JE.pluginConfig.DEFAULT_PROVIDERS ? JE.pluginConfig.DEFAULT_PROVIDERS.replace(/'/g, '').replace(/\n/g, ',').split(',').map(s => s.trim()).filter(s => s) : [];
        const IGNORE_PROVIDERS = JE.pluginConfig.IGNORE_PROVIDERS ? JE.pluginConfig.IGNORE_PROVIDERS.replace(/'/g, '').replace(/\n/g, ',').split(',').map(s => s.trim()).filter(s => s) : [];
        const ELSEWHERE_CUSTOM_BRANDING_TEXT = JE.pluginConfig.ElsewhereCustomBrandingText || '';
        const ELSEWHERE_CUSTOM_BRANDING_IMAGE_URL = JE.pluginConfig.ElsewhereCustomBrandingImageUrl || '';

        // Safe fallback for helpers.js Stage-3 load-order races.
        const extLink = JE.helpers?.createExternalLink || ((u, o) => {
            const a = document.createElement('a');
            a.setAttribute('is', 'emby-linkbutton');
            a.href = u;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            if (o?.text) a.textContent = o.text;
            if (o?.title) a.title = o.title;
            if (o?.className) a.className = o.className;
            return a;
        });

        function createServiceBadge(service, tmdbId, mediaType) {
            const badge = document.createElement('div');
            badge.style.cssText = `
                display: inline-flex;
                align-items: center;
                padding: 6px 10px;
                margin: 3px 5px 3px 0;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                color: #fff;
                white-space: nowrap;
                transition: all 500ms ease;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(10px);
            `;

            const logo = document.createElement('img');
            logo.src = `https://image.tmdb.org/t/p/w92${service.logo_path}`;
            logo.alt = service.provider_name;
            logo.style.cssText = `
                width: 20px;
                height: 20px;
                margin-right: 8px;
                object-fit: contain;
                border-radius: 4px;
            `;

            logo.onerror = () => logo.style.display = 'none';
            badge.appendChild(logo);

            const text = document.createElement('span');
            text.textContent = service.provider_name;
            badge.appendChild(text);

            // Hover effects
            badge.onmouseenter = () => {
                badge.style.transform = 'translateY(-2px)';
                badge.style.background = 'rgba(255, 255, 255, 0.2)';
                badge.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            };

            badge.onmouseleave = () => {
                badge.style.transform = 'translateY(0)';
                badge.style.background = 'rgba(255, 255, 255, 0.1)';
                badge.style.boxShadow = 'none';
            };

            return badge;
        }

        // Process streaming data for default region (auto-load)
        function processDefaultRegionData(data, tmdbId, mediaType) {
            // settings.userRegion is the effective region: the per-user "Default Search Country"
            // override if the user set one, otherwise the admin's DEFAULT_REGION (see loadSettings).
            const regionData = data.results[settings.userRegion];

            const container = document.createElement('div');
            container.style.cssText = `
                margin: 10px 0;
                padding: 12px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                position: relative;
            `;

            // Create header with title and controls
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            `;


            // Check if services are available in default region
            const hasServices = regionData && regionData.flatrate && regionData.flatrate.length > 0;

            // Pre-filter services to check if any will actually be displayed
            let filteredServices = [];
            if (hasServices) {
                filteredServices = regionData.flatrate;

                // Apply DEFAULT_PROVIDERS filter
                if (DEFAULT_PROVIDERS.length > 0) {
                    filteredServices = filteredServices.filter(service =>
                        DEFAULT_PROVIDERS.includes(service.provider_name)
                    );
                }

                // Apply IGNORE_PROVIDERS filter
                if (IGNORE_PROVIDERS.length > 0) {
                    try {
                        const ignorePatterns = IGNORE_PROVIDERS.map(pattern => new RegExp(pattern, 'i'));
                        filteredServices = filteredServices.filter(service =>
                            !ignorePatterns.some(regex => regex.test(service.provider_name))
                        );
                    } catch (e) {
                        console.error('🪼 Jellyfin Enhanced: 🎬 Jellyfin Elsewhere: Invalid regex in IGNORE_PROVIDERS.', e);
                    }
                }
            }

            const hasFilteredServices = filteredServices.length > 0;

            // Create clickable title that links to JustWatch
            const title = extLink(
                (hasFilteredServices && regionData && regionData.link) ? regionData.link : '#',
                { title: 'JustWatch' }
            );

            if (hasFilteredServices) {
                title.textContent = JE.t('elsewhere_panel_available_in', { region: settings.availableRegions[settings.userRegion] || settings.userRegion });
            } else if (ELSEWHERE_CUSTOM_BRANDING_TEXT) {
                // Show custom branding when no services are available and custom text is configured
                title.textContent = ELSEWHERE_CUSTOM_BRANDING_TEXT;
                title.classList.add('elsewhere-custom-branding');
                title.style.cursor = 'default';

                // Add custom icon if URL is provided
                if (ELSEWHERE_CUSTOM_BRANDING_IMAGE_URL) {
                    title.style.display = 'flex';
                    title.style.alignItems = 'center';
                    title.style.gap = '8px';

                    const icon = document.createElement('img');
                    icon.src = ELSEWHERE_CUSTOM_BRANDING_IMAGE_URL;
                    icon.alt = 'Custom Branding';
                    icon.className = 'elsewhere-custom-branding-icon';
                    icon.style.cssText = `
                        width: 24px;
                        height: 24px;
                        object-fit: contain;
                        margin-left: 4px;
                    `;
                    icon.onerror = () => icon.style.display = 'none';
                    title.appendChild(icon);
                }
            } else {
                // Fallback to default message if no custom text is set
                title.textContent = JE.t('elsewhere_panel_not_available_in', { region: settings.availableRegions[settings.userRegion] || settings.userRegion });
            }

            title.style.cssText = `
                font-weight: 600;
                font-size: 14px;
                text-decoration: none;
                cursor: pointer;
                color: #fff;
                flex: 1;
                text-align: left;
                display: flex;
                align-items: flex-end;
            `;

            // Add JustWatch link if available and has filtered services
            if (hasFilteredServices && regionData && regionData.link) {
                title.classList.add('elsewhere-link-reset');
                title.href = regionData.link;
                title.style.padding = '0';
                title.style.margin = '0';
            } else if (!hasFilteredServices && ELSEWHERE_CUSTOM_BRANDING_TEXT) {
                // Override cursor style for custom branded content
                title.style.cursor = 'default';
            }

             // Create controls container
            const controls = document.createElement('div');
            controls.style.cssText = `
                display: flex;
                gap: 8px;
                align-items: center;
            `;

            // Search button with Material Icon
            const searchButton = document.createElement('button');
            searchButton.className = 'elsewhere-search-button';
            const searchIcon = createMaterialIcon('search', '16px');
            searchButton.appendChild(searchIcon);
            searchButton.appendChild(document.createTextNode(''));

            searchButton.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 500ms ease;
                opacity: ${!hasFilteredServices && ELSEWHERE_CUSTOM_BRANDING_TEXT ? '0' : '1'};
            `;

            searchButton.onmouseenter = () => {
                searchButton.style.background = 'rgba(255, 255, 255, 0.2)';
            };

            searchButton.onmouseleave = () => {
                searchButton.style.background = 'rgba(255, 255, 255, 0.1)';
            };

            // Settings button with Material Icon
            const settingsButton = document.createElement('button');
            settingsButton.className = 'elsewhere-settings-button';
            const settingsIcon = createMaterialIcon('settings', '16px');
            settingsButton.appendChild(settingsIcon);

            settingsButton.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 6px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 500ms ease;
                width: 28px;
                height: 28px;
                opacity: ${!hasFilteredServices && ELSEWHERE_CUSTOM_BRANDING_TEXT ? '0' : '1'};
            `;

            settingsButton.onmouseenter = () => {
                settingsButton.style.background = 'rgba(255, 255, 255, 0.2)';
            };

            settingsButton.onmouseleave = () => {
                settingsButton.style.background = 'rgba(255, 255, 255, 0.1)';
            };

            settingsButton.onclick = () => {
                const modal = document.getElementById('streaming-settings-modal');
                if (modal) {
                    modal.style.display = 'flex';
                }
            };

            controls.appendChild(searchButton);
            controls.appendChild(settingsButton);
            header.appendChild(title);
            header.appendChild(controls);
            container.appendChild(header);

            // Add hover effect to show/hide buttons when custom branding is enabled
            if (!hasFilteredServices && ELSEWHERE_CUSTOM_BRANDING_TEXT) {
                container.onmouseenter = () => {
                    searchButton.style.opacity = '1';
                    settingsButton.style.opacity = '1';
                };
                container.onmouseleave = () => {
                    searchButton.style.opacity = '0';
                    settingsButton.style.opacity = '0';
                };
            }

            // Show services if they exist after filtering, otherwise show appropriate message
            if (hasServices) {
                if (hasFilteredServices) {
                    // Use the pre-filtered services
                    const servicesContainer = document.createElement('div');
                    servicesContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px;';

                    filteredServices.forEach(service => {
                        servicesContainer.appendChild(createServiceBadge(service, tmdbId, mediaType));
                    });

                    container.appendChild(servicesContainer);
                } else if (DEFAULT_PROVIDERS.length > 0) {
                    // Services exist but all were filtered out by user's provider preferences
                    const noServices = document.createElement('div');
                    noServices.textContent = JE.t('elsewhere_panel_no_configured_services');
                    noServices.style.cssText = 'color: #999; font-size: 13px; margin-bottom: 12px;';
                    container.appendChild(noServices);
                }
            }

            // Create manual result container for search results
            const resultContainer = document.createElement('div');
            resultContainer.id = 'streaming-result-container';
            container.appendChild(resultContainer);

            // Add click handler for manual lookup (multiple regions)
            searchButton.onclick = () => {
                searchButton.disabled = true;
                searchButton.innerHTML = '';
                const loadingIcon = createMaterialIcon('refresh', '16px');
                loadingIcon.style.animation = 'spin 1s linear infinite';
                searchButton.appendChild(loadingIcon);
                searchButton.appendChild(document.createTextNode(' ' + JE.t('elsewhere_panel_search_button')));
                searchButton.style.opacity = '0.7';
                resultContainer.innerHTML = '';

                // Add spinning animation
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                if (!document.querySelector('style[data-jellyfin-elsewhere]')) {
                    style.setAttribute('data-jellyfin-elsewhere', 'true');
                    document.head.appendChild(style);
                }

                fetchStreamingData(tmdbId, mediaType, (error, data) => {
                    searchButton.disabled = false;
                    searchButton.innerHTML = '';
                    const searchIcon = createMaterialIcon('search', '16px');
                    searchButton.appendChild(searchIcon);
                    searchButton.appendChild(document.createTextNode(''));
                    searchButton.style.opacity = '1';

                    if (error) {
                        resultContainer.innerHTML = `<div style="color: #ff6b6b; font-size: 13px; margin-top: 8px;">${JE.t('elsewhere_panel_error', { error })}</div>`;
                        return;
                    }

                    // Show results for multiple regions
                    const regionsToSearch = settings.userRegions.length > 0 ? settings.userRegions : [settings.userRegion];

                    let hasAnyResults = false;
                    const unavailableRegions = [];

                    regionsToSearch.forEach((region, index) => {
                        const regionData = data.results[region];
                        const hasServices = regionData && regionData.flatrate && regionData.flatrate.length > 0;

                        if (hasServices) {
                            // Filter services based on user preferences
                            let services = regionData.flatrate;
                            if (settings.userServices.length > 0) {
                                services = services.filter(service =>
                                    settings.userServices.includes(service.provider_name)
                                );
                            }

                            if (services.length > 0) {
                                hasAnyResults = true;
                                const regionResult = processRegionData(data, tmdbId, mediaType, region, true);
                                if (regionResult) {
                                    if (index > 0 || unavailableRegions.length > 0) {
                                        regionResult.style.marginTop = '6px';
                                    }
                                    resultContainer.appendChild(regionResult);
                                }
                            } else {
                                unavailableRegions.push(region);
                            }
                        } else {
                            unavailableRegions.push(region);
                        }
                    });

                    // Show unavailable regions first if there are any
                    if (unavailableRegions.length > 0) {
                        const unavailableContainer = createUnavailableRegionsDisplay(unavailableRegions);
                        resultContainer.insertBefore(unavailableContainer, resultContainer.firstChild);
                    }

                    // If no results found anywhere, show a general message
                    if (!hasAnyResults && unavailableRegions.length === 0) {
                        const noServices = document.createElement('div');
                        noServices.style.cssText = 'color: #6c757d; font-size: 13px; margin-top: 8px;';
                        noServices.textContent = JE.t('elsewhere_panel_no_services_in_regions');
                        resultContainer.appendChild(noServices);
                    }
                });
            };

            return container;
        }

        // Create display for unavailable regions
        function createUnavailableRegionsDisplay(unavailableRegions) {
            const container = document.createElement('div');
            container.style.cssText = `
                margin: 0 0 6px 0;
                padding: 12px;
                border-radius: 8px;
                border: 1px solid rgba(139, 19, 19, 0.6);
                background: rgba(139, 19, 19, 0.3);
                backdrop-filter: blur(10px);
                position: relative;
            `;

            // Create header with title and close button
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0;
            `;

            const title = document.createElement('div');
            const regionNames = unavailableRegions.map(region => settings.availableRegions[region] || region);
            const regionText = regionNames.length === 1 ? regionNames[0] :
                              regionNames.length === 2 ? regionNames.join(' and ') :
                              regionNames.slice(0, -1).join(', ') + ' and ' + regionNames[regionNames.length - 1];

            title.textContent = JE.t('elsewhere_panel_not_available_in_regions', { regions: regionText });
            title.style.cssText = `
                font-weight: 600;
                font-size: 14px;
                color: rgb(255, 20, 20);
                flex: 1;
            `;

            // Create close button
            const closeButton = document.createElement('button');
            const closeIcon = createMaterialIcon('close', '16px');
            closeButton.appendChild(closeIcon);
            closeButton.title = 'Close';
            closeButton.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 6px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 500ms ease;
                width: 28px;
                height: 28px;
            `;

            closeButton.onmouseenter = () => {
                closeButton.style.background = 'rgba(255, 0, 0, 0.2)';
                closeButton.style.borderColor = 'rgba(255, 0, 0, 0.3)';
            };

            closeButton.onmouseleave = () => {
                closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
                closeButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            };

            closeButton.onclick = () => {
                container.remove();
            };

            header.appendChild(title);
            header.appendChild(closeButton);
            container.appendChild(header);

            return container;
        }

        // Process streaming data for a specific region
        function processRegionData(data, tmdbId, mediaType, region, showAvailable = false) {
            const regionData = data.results[region];
            if (!regionData || !regionData.flatrate) {
                return null;
            }

            // Filter services based on user preferences
            const services = regionData.flatrate.filter(service =>
                settings.userServices.length === 0 || settings.userServices.includes(service.provider_name)
            );

            // Don't show container if no services match filters
            if (services.length === 0) {
                return null;
            }

            const container = document.createElement('div');
            container.style.cssText = `
                margin: 10px 0 0 0;
                padding: 12px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                position: relative;
            `;

            // Create header with title and close button
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            `;

            // Create clickable title that links to JustWatch
            const title = extLink(
                regionData.link || '#',
                { title: 'JustWatch' }
            );
            title.textContent = JE.t('elsewhere_panel_available_in_region', { region: settings.availableRegions[region] || region });
            title.style.cssText = `
                font-weight: 600;
                font-size: 14px;
                text-decoration: none;
                cursor: pointer;
                color: #fff;
                flex: 1;
                text-align: left;
            `;

            // Add JustWatch link if available and enabled
            if (regionData.link) {
                title.classList.add('elsewhere-link-reset');
                title.href = regionData.link;
                title.style.padding = '0';
                title.style.margin = '0';
            }

            // Create close button
            const closeButton = document.createElement('button');
            const closeIcon = createMaterialIcon('close', '16px');
            closeButton.appendChild(closeIcon);
            closeButton.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 6px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 500ms ease;
                width: 28px;
                height: 28px;
            `;

            closeButton.onmouseenter = () => {
                closeButton.style.background = 'rgba(255, 0, 0, 0.2)';
                closeButton.style.borderColor = 'rgba(255, 0, 0, 0.3)';
            };

            closeButton.onmouseleave = () => {
                closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
                closeButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            };

            closeButton.onclick = () => {
                container.remove();
            };

            header.appendChild(title);
            header.appendChild(closeButton);
            container.appendChild(header);

            const servicesContainer = document.createElement('div');
            servicesContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 3px;';

            services.forEach(service => {
                servicesContainer.appendChild(createServiceBadge(service, tmdbId, mediaType));
            });

            container.appendChild(servicesContainer);

            return container;
        }

        // Auto-load streaming data on page load (default region only)
        function autoLoadStreamingData(tmdbId, mediaType, container) {
            fetchStreamingData(tmdbId, mediaType, (error, data) => {
                if (error) {
                    const errorDiv = document.createElement('div');
                    errorDiv.style.cssText = 'font-size: 13px; margin-top: 8px; color: #ff6b6b;';
                    errorDiv.textContent = JE.t('elsewhere_panel_error', { error });
                    container.appendChild(errorDiv);
                    return;
                }

                // Show default region results automatically
                const defaultResult = processDefaultRegionData(data, tmdbId, mediaType);
                if (defaultResult) {
                    container.appendChild(defaultResult);
                }
            });
        }

        return { autoLoadStreamingData };
    }

    JE.elsewherePanel = { create: createElsewherePanel };
})(window.JellyfinEnhanced);
