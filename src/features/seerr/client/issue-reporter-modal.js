// issue-reporter-modal.js
// Internal issue-reporting component; loaded before issue-reporter.js.
(function (JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Issue Reporter:';
    const issueReporter = {};

    /**
     * Shows the issue report modal for the given media item
     * @param {string} tmdbId - TMDB ID of the media
     * @param {string} itemName - Name of the media item
     * @param {string} mediaType - 'movie' or 'tv'
     * @param {string} backdropUrl - Optional backdrop image URL (full URL from Jellyfin or TMDB)
     */
    issueReporter.showReportModal = function (tmdbId, itemName, mediaType, backdropUrl = null, item = null) {
        const formHtml = JE.jellyseerrIssueReporterView.createForm();

        // Create modal using the existing modal system
        const { modalElement, show } = JE.jellyseerrModal.create({
            title: JE.t('jellyseerr_report_issue_title'),
            subtitle: itemName,
            bodyHtml: formHtml,
            backdropUrl: backdropUrl,
            buttonText: JE.t('jellyseerr_report_issue_submit'),
            onSave: async (modalEl, button, closeModal) => {
                const issueType = modalEl.querySelector('input[name="issue-type"]:checked')?.value;
                const message = modalEl.querySelector('#issue-message').value;

                // Read TV season/episode selections if present
                let problemSeason = 0;
                let problemEpisode = 0;
                const seasonEl = modalEl.querySelector('#issue-season');
                const episodeEl = modalEl.querySelector('#issue-episode');
                if (seasonEl) {
                    problemSeason = parseInt(seasonEl.value) || 0;
                }
                // Always read the episode value if the element exists (even when disabled/preset on episode pages)
                if (episodeEl) {
                    problemEpisode = parseInt(episodeEl.value) || 0;
                }

                if (!issueType) {
                    JE.toast('Issue Type is required', 3000);
                    return;
                }

                try {
                    button.disabled = true;
                    button.textContent = JE.t('jellyseerr_report_issue_submitting');

                    // Pass only the contents of the description box to the API
                    const result = await JE.jellyseerrAPI.reportIssue(tmdbId, mediaType, issueType, message, problemSeason, problemEpisode);

                    if (result) {
                        JE.toast(JE.t('jellyseerr_report_issue_success'), 3000);
                        console.log(`${logPrefix} Issue successfully reported for ${itemName}`);
                        closeModal();
                    } else {
                        throw new Error('No response from API');
                    }
                } catch (error) {
                    console.error(`${logPrefix} Error reporting issue:`, error);
                    const errorMsg = error?.message || error?.toString() || '';
                    if (error?.status === 403) {
                        JE.toast(JE.t('jellyseerr_err_no_issue_permission'), 4000);
                    } else if (errorMsg.toLowerCase().includes('jellyseerr') || errorMsg.toLowerCase().includes('unavailable') || error?.status === 503 || error?.status === 0) {
                        JE.toast('Jellyseerr is not available', 4000);
                    } else {
                        JE.toast(JE.t('jellyseerr_report_issue_error'), 4000);
                    }
                    button.disabled = false;
                    button.textContent = JE.t('jellyseerr_report_issue_submit');
                }
            }
        });

        show();

        // Load existing issues/comments for this item
        (async () => {
            const bodyEl = modalElement.querySelector('#jellyseerr-issues-body');
            const loadingEl = modalElement.querySelector('#jellyseerr-issues-loading');

            const renderEmpty = (msg = JE.t('jellyseerr_no_issues_yet')) => {
                if (bodyEl) bodyEl.innerHTML = `<div class="jellyseerr-issues-empty">${msg}</div>`;
            };

            try {
                if (loadingEl) loadingEl.textContent = JE.t('jellyseerr_loading_issues');
                const res = await JE.jellyseerrAPI.fetchIssuesForMedia(tmdbId, mediaType, { take: 50, filter: 'all' });
                let issues = res?.results || [];

                if (!issues.length) {
                    renderEmpty();
                    return;
                }

                const enriched = await Promise.all(issues.map(async (issue) => {
                    try {
                        const full = await JE.jellyseerrAPI.fetchIssueById(issue.id);
                        return full || issue;
                    } catch (_) { return issue; }
                }));

                issues = enriched;

                const sections = JE.jellyseerrIssueReporterView.renderIssues(issues);

                if (bodyEl) bodyEl.innerHTML = sections;

            } catch (err) {
                console.error(`${logPrefix} Failed to load existing issues:`, err);
                renderEmpty(JE.t('jellyseerr_load_issues_error'));
            }
        })();

        if (mediaType === 'tv') {
            JE.jellyseerrIssueReporterTvControls.initialize(modalElement, item);
        }
    };

    JE.jellyseerrIssueReporterModal = issueReporter;

})(window.JellyfinEnhanced);
