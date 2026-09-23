// /js/jellyseerr/issue-reporter.js
(function (JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Issue Reporter:';
    const issueReporter = {};
    // Keep the public facade stable; components own data access and modal UI.
    issueReporter.checkReportingAvailability = (...args) => JE.jellyseerrIssueReporterData.checkReportingAvailability(...args);
    issueReporter.getTmdbIdFallback = (...args) => JE.jellyseerrIssueReporterData.getTmdbIdFallback(...args);
    issueReporter.showReportModal = (...args) => JE.jellyseerrIssueReporterModal.showReportModal(...args);

    // Jellyfin themes expose several action-container variants. Keep their
    // precedence identical for enabled and unavailable report buttons.
    function findButtonContainer(page) {
        const selectors = [
            '.detailButtons', '.itemActionsBottom', '[class*="ActionButtons"]',
            '.mainDetailButtons', '.detailButtonsContainer', '[class*="primaryActions"]',
            '.topBarSecondaryMenus + *'
        ];
        for (const selector of selectors) {
            const container = page.querySelector(selector);
            if (container) return container;
        }
        const buttons = page.querySelectorAll('button');
        return buttons.length ? buttons[buttons.length - 1].parentElement : null;
    }

    /**
     * Adds a report issue button to the item detail page
     * @param {HTMLElement} container - Container to append the button to
     * @param {string} tmdbId - TMDB ID of the media
     * @param {string} itemName - Name of the media item
     * @param {string} mediaType - 'movie' or 'tv'
     * @param {string} backdropUrl - Optional backdrop image URL
     */
    issueReporter.createReportButton = function (container, tmdbId, itemName, mediaType, backdropUrl = null, item = null) {
        if (!container) {
            console.warn(`${logPrefix} Container not found for report button`);
            return null;
        }

        const button = document.createElement('button');
        button.setAttribute('is', 'emby-button');
        button.className = 'button-flat detailButton emby-button jellyseerr-report-issue-icon';
        button.type = 'button';
        button.setAttribute('aria-label', JE.t('jellyseerr_report_issue_button'));
        button.title = JE.t('jellyseerr_report_issue_button');
        button.innerHTML = `
            <div class="detailButton-content">
                <span class="material-icons detailButton-icon warning" aria-hidden="true"></span>
            </div>
        `;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            issueReporter.showReportModal(tmdbId, itemName, mediaType, backdropUrl, item);
        });

        return button;
    };

    /**
     * Create a disabled "unavailable" button to show when reporting isn't possible
     * @param {HTMLElement} container
     * @param {string} itemName
     * @param {string} mediaType
     */
    issueReporter.createUnavailableButton = function (container, itemName, mediaType, reason = 'unavailable') {
        if (!container) return null;

        const button = document.createElement('button');
        button.setAttribute('is', 'emby-button');
        button.className = 'button-flat detailButton emby-button jellyseerr-report-unavailable-icon';
        button.type = 'button';

        let ariaLabel = JE.t('jellyseerr_report_unavailable_button');
        let title = JE.t('jellyseerr_report_unavailable_button');

        if (reason === 'no-tmdb') {
            ariaLabel = 'TMDB ID not found';
            title = 'TMDB ID not found for this item';
        } else if (reason === 'no-jellyseerr') {
            ariaLabel = 'Jellyseerr unavailable';
            title = 'Jellyseerr is not available';
        } else if (reason === 'no-both') {
            ariaLabel = 'Reporting services unavailable';
            title = 'TMDB ID not found and Jellyseerr is not available';
        } else if (reason === 'no-permissions') {
            ariaLabel = 'Not enough permissions';
            title = 'Not enough permissions to report';
        }

        button.setAttribute('aria-label', ariaLabel);
        button.title = title;
        button.disabled = true;
        button.innerHTML = `
            <div class="detailButton-content">
                <span class="material-icons detailButton-icon" aria-hidden="true">warning_off</span>
            </div>
        `;

        // Still allow click to show a helpful toast explaining why
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (reason === 'no-tmdb') {
                JE.toast('TMDB ID not found for this item', 4000);
            } else if (reason === 'no-jellyseerr') {
                JE.toast('Jellyseerr is not available', 4000);
            } else if (reason === 'no-both') {
                JE.toast('TMDB ID not found and Jellyseerr is not available', 4000);
            } else if (reason === 'no-permissions') {
                JE.toast('You do not have permissions to report issues', 4000);
            } else {
                JE.toast(JE.t('jellyseerr_report_unavailable_toast'), 4000);
            }
        });

        return button;
    };

    /**
     * Fetches open issues for the item and applies an orange indicator + count badge
     * to the report button. No-op if JellyseerrShowIssueIndicator is off.
     */
    issueReporter.applyIssueIndicator = async function (button, tmdbId, mediaType) {
        if (!JE.pluginConfig?.JellyseerrShowIssueIndicator) return;
        try {
            const result = await JE.jellyseerrAPI.fetchIssuesForMedia(tmdbId, mediaType, { take: 50, filter: 'open' });
            const openIssues = result?.results || [];
            if (openIssues.length === 0) return;

            JE.jellyseerrIssueReporterView.addIndicatorStyles();

            button.classList.add('has-open-issues');

            const badge = document.createElement('span');
            badge.className = 'jellyseerr-issue-count-badge';
            badge.textContent = openIssues.length > 9 ? '9+' : String(openIssues.length);
            button.appendChild(badge);

            const issuesLabel = JE.t('jellyseerr_existing_issues') || 'Issues';
            const openLabel = JE.t('jellyseerr_issue_open') || 'Open';
            const reportLabel = JE.t('jellyseerr_report_issue_button') || 'Report issue';
            const tooltipText = `${openIssues.length} ${openLabel} ${issuesLabel} - ${reportLabel}`;
            button.title = tooltipText;
            button.setAttribute('aria-label', tooltipText);
        } catch (e) {
            console.debug(`${logPrefix} applyIssueIndicator failed:`, e);
        }
    };

    /**
     * Attempts to add the report issue button to the current detail page
     */
    issueReporter.tryAddButton = async function () {
        const itemDetailPage = document.querySelector('#itemDetailPage:not(.hide)');
        if (!itemDetailPage) {
            return false;
        }
        // Don't add if plugin or report-button feature is disabled
        if (!JE.pluginConfig?.JellyseerrEnabled || !JE.pluginConfig?.JellyseerrShowReportButton) {
            console.debug(`${logPrefix} Jellyseerr integration or report button disabled, skipping`);
            return false;
        }

        // Check if we already added the button (either active or unavailable)
        if (itemDetailPage.querySelector('.jellyseerr-report-issue-icon, .jellyseerr-report-unavailable-icon')) {
            console.debug(`${logPrefix} Report button already exists`);
            return true;
        }

        try {
            // Get item ID from URL hash (same way as reviews.js)
            const itemId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
            if (!itemId) {
                console.debug(`${logPrefix} No item ID in URL`);
                return false;
            }

            // Fetch item data from Jellyfin API (same way as reviews.js)
            const userId = ApiClient.getCurrentUserId();
            if (!userId) {
                console.debug(`${logPrefix} No user ID found`);
                return false;
            }

            const item = JE.helpers?.getItemCached
                ? await JE.helpers.getItemCached(itemId, { userId })
                : await ApiClient.getItem(userId, itemId);
            if (!item) {
                console.debug(`${logPrefix} Could not fetch item data`);
                return false;
            }

            // Gate on item type FIRST, before any availability/TMDB lookup — items
            // like MusicVideo, Audio, Book, Photo, BoxSet, etc. can never be reported
            // regardless of TMDB/Jellyseerr state, so there's no point doing a status
            // round-trip (or showing a disabled button) for something that's
            // permanently out of scope rather than transiently unavailable.
            const isTvLike = ['Series', 'Season', 'Episode'].includes(item.Type);
            const isMovie = item.Type === 'Movie';
            if (!isTvLike && !isMovie) {
                console.debug(`${logPrefix} Skipping ${item.Name}: unsupported item type (${item.Type}) — not a Movie/Series/Season/Episode`);
                return false;
            }

            // Special seasons/episodes (season 0) aren't reportable either.
            try {
                if (item.Type === 'Season') {
                    const seasonNumber = parseInt(item.IndexNumber || item.SeasonNumber || item.Index || 0) || 0;
                    if (seasonNumber === 0) {
                        console.debug(`${logPrefix} Skipping ${item.Name}: special season (season 0)`);
                        return false;
                    }
                }

                if (item.Type === 'Episode') {
                    // Episode items often contain the season number in ParentIndexNumber or SeasonNumber
                    const parentSeason = parseInt(item.ParentIndexNumber || item.SeasonIndex || item.ParentIndex || item.SeasonNumber || 0) || 0;
                    if (parentSeason === 0) {
                        console.debug(`${logPrefix} Skipping ${item.Name}: special episode (season 0)`);
                        return false;
                    }
                }
            } catch (e) {
                // If any unexpected shape, don't block the flow; just continue
                console.debug(`${logPrefix} Could not determine season index for special detection:`, e);
            }

            const mediaType = isTvLike ? 'tv' : 'movie';

            // Check if reporting is available (item has TMDB ID and Jellyseerr configured)
            const availability = await issueReporter.checkReportingAvailability(item);

            // If services not available, show unavailable button — except when the
            // item itself simply has no TMDB ID (e.g. MusicVideo, or any other type
            // TMDB doesn't catalog). That's not a transient/fixable state like
            // Jellyseerr being down, so there's nothing useful to report on this
            // item; skip silently rather than cluttering the page with a disabled
            // button that always explains the same permanent limitation.
            if (availability === 'no-tmdb' || availability === 'no-both') {
                console.debug(`${logPrefix} Skipping ${item.Name}: no TMDB ID available, nothing to report against`);
                return false;
            }
            if (availability !== 'available') {
                console.debug(`${logPrefix} Reporting not available: ${availability}`);

                // Try to add an unavailable button
                const buttonContainerUnavail = findButtonContainer(itemDetailPage);

                if (buttonContainerUnavail) {
                    const unavailButton = issueReporter.createUnavailableButton(buttonContainerUnavail, '', '', availability);
                    if (unavailButton) {
                        const moreButton = buttonContainerUnavail.querySelector('.btnMoreCommands');
                        if (moreButton) {
                            buttonContainerUnavail.insertBefore(unavailButton, moreButton);
                        } else {
                            buttonContainerUnavail.appendChild(unavailButton);
                        }
                        console.log(`${logPrefix} Added unavailable report button (${availability})`);
                        return true;
                    }
                }
                return false;
            }

            let tmdbId = item.ProviderIds?.Tmdb;

            console.debug(`${logPrefix} Checking item: ${item.Name} (type=${item.Type}, mediaType=${mediaType}, TMDB: ${tmdbId})`);

            // If no TMDB ID, and this is a Season/Episode, try to fetch parent/series TMDB ID first
            if (!tmdbId && (item.Type === 'Season' || item.Type === 'Episode')) {
                try {
                    // Common fields that may point to the series/parent item
                    const parentId = item.SeriesId || item.ParentId || item.ParentId || (item.Parent && item.Parent.Id) || (item.Series && item.Series.Id) || null;
                    if (parentId) {
                        console.debug(`${logPrefix} Found parentId ${parentId} for ${item.Name}, fetching parent item`);
                        const userId2 = ApiClient.getCurrentUserId();
                        if (userId2) {
                            const parentItem = JE.helpers?.getItemCached
                                ? await JE.helpers.getItemCached(parentId, { userId: userId2 })
                                : await ApiClient.getItem(userId2, parentId);
                            if (parentItem) {
                                const parentTmdb = parentItem.ProviderIds?.Tmdb;
                                if (parentTmdb) {
                                    tmdbId = parentTmdb;
                                    console.log(`${logPrefix} Found TMDB ID on parent: ${tmdbId} (parent ${parentItem.Name})`);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.debug(`${logPrefix} Error fetching parent item for TMDB lookup:`, err);
                }
            }

            // If still no TMDB ID, try the general fallback lookup (may inspect names/urls)
            if (!tmdbId) {
                console.debug(`${logPrefix} No direct TMDB ID found for ${item.Name}, trying fallback...`);
                tmdbId = await issueReporter.getTmdbIdFallback(item.Name, mediaType, item);

                if (!tmdbId) {
                    // No TMDB ID for this item, and the fallback search couldn't find one
                    // either. As above: this isn't a transient state, so skip silently
                    // instead of inserting a disabled "unavailable" button.
                    console.debug(`${logPrefix} No TMDB ID could be resolved for ${item.Name} (fallback also failed), skipping button`);
                    return false;
                } else {
                    console.log(`${logPrefix} Found TMDB ID via fallback: ${tmdbId}`);
                }
            }

            const buttonContainer = findButtonContainer(itemDetailPage);

            if (!buttonContainer) {
                console.debug(`${logPrefix} Could not find button container for ${item.Name}`);
                return false;
            }

            // Extract backdrop URL from Jellyfin item
            let backdropUrl = null;
            if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
                const tag = item.BackdropImageTags[0];
                backdropUrl = ApiClient.getUrl(`Items/${item.Id}/Images/Backdrop`, { tag: tag, quality: 40 });
            } else if (item.ParentBackdropImageTags && item.ParentBackdropImageTags.length > 0) {
                const tag = item.ParentBackdropImageTags[0];
                const parentId = item.ParentBackdropItemId || item.ParentId || item.SeriesId;
                if (parentId) {
                    backdropUrl = ApiClient.getUrl(`Items/${parentId}/Images/Backdrop`, { tag: tag, quality: 40 });
                }
            }
            const button = issueReporter.createReportButton(
                buttonContainer,
                tmdbId,
                item.Name,
                mediaType,
                backdropUrl,
                item
            );

            if (button) {
                // Try to insert before btnMoreCommands, otherwise append
                const moreButton = buttonContainer.querySelector('.btnMoreCommands');
                if (moreButton) {
                    buttonContainer.insertBefore(button, moreButton);
                } else {
                    buttonContainer.appendChild(button);
                }
                console.log(`${logPrefix} ✓ Report issue button added to ${item.Name} (${mediaType}, TMDB: ${tmdbId})`);
                // Fire-and-forget: colour button orange + count badge when open issues exist
                issueReporter.applyIssueIndicator(button, tmdbId, mediaType);
                return true;
            }
        } catch (error) {
            console.warn(`${logPrefix} Error adding button:`, error);
        }

        return false;
    };

    /**
     * Initializes issue reporter on item detail pages
     */
    issueReporter.initialize = async function () {
        if (!JE.pluginConfig?.JellyseerrEnabled || !JE.pluginConfig?.JellyseerrShowReportButton) {
            console.debug(`${logPrefix} Jellyseerr integration or report-button feature disabled, skipping initialization`);
            return;
        }

        JE.jellyseerrUI?.addMainStyles?.();

        console.log(`${logPrefix} Initializing... (verifying Jellyseerr status)`);

        // Verify Jellyseerr is reachable and active via the server-side status endpoint
        try {
            const statusUrl = ApiClient.getUrl('/JellyfinEnhanced/jellyseerr/status');
            const statusRes = await ApiClient.ajax({ type: 'GET', url: statusUrl, dataType: 'json' });
            if (!statusRes || !statusRes.active) {
                console.debug(`${logPrefix} Jellyseerr status check returned inactive, skipping reporter init`);
                return;
            }
        } catch (e) {
            console.warn(`${logPrefix} Failed to verify Jellyseerr status, skipping reporter init:`, e);
            return;
        }

        const handleViewShow = async () => {
            try {
                // Small delay to ensure DOM is ready
                setTimeout(async () => {
                    await issueReporter.tryAddButton();
                }, 100);
            } catch (error) {
                console.warn(`${logPrefix} Error in viewShow handler:`, error);
            }
        };

        // Listen for Jellyfin's page navigation events
        document.addEventListener('viewshow', handleViewShow);

        // Also try on initial load
        setTimeout(handleViewShow, 500);

        console.log(`${logPrefix} ✓ Initialized issue reporter with viewshow listener`);
    };

    // Expose the module on the global JE object
    JE.jellyseerrIssueReporter = issueReporter;

})(window.JellyfinEnhanced);
