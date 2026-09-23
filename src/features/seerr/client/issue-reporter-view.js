// issue-reporter-view.js
// Internal issue-reporting component; loaded before issue-reporter.js.
(function (JE) {
    'use strict';

    const escapeHtml = JE.escapeHtml;

    /**
     * Issue type definitions matching Jellyseerr's 4 core issue types
     * Jellyseerr uses: VIDEO (1), AUDIO (2), SUBTITLES (3), OTHER (4)
     */
    const getIssueTypes = () => [
        { value: '1', label: JE.t('jellyseerr_report_issue_type_video'), icon: JE.icon(JE.IconName.VIDEO) },
        { value: '2', label: JE.t('jellyseerr_report_issue_type_audio'), icon: JE.icon(JE.IconName.AUDIO) },
        { value: '3', label: JE.t('jellyseerr_report_issue_type_subtitles'), icon: JE.icon(JE.IconName.SUBTITLES) },
        { value: '4', label: JE.t('jellyseerr_report_issue_type_other'), icon: JE.icon(JE.IconName.QUESTION) }
    ];

    function createForm() {
        // Create the form HTML
        const ISSUE_TYPES = getIssueTypes();
        return `
            <style>
                .jellyseerr-issues-container { margin-top: 12px; }
                .jellyseerr-issues-header { font-weight: 700; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-size: 12px; color: #888; }
                .jellyseerr-issue-section { margin-bottom: 14px; }
                .jellyseerr-issue-section-title { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(100, 100, 255, 0.2); color: #b0b0ff; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; margin: 0 0 10px; }
                .jellyseerr-issue-card { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
                .jellyseerr-issue-summary { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-weight: 600; color: #e6e6e6; }
                .jellyseerr-issue-reporter { color: #9aa; font-weight: 500; }
                .jellyseerr-issue-date { color: #9aa; font-size: 12px; }
                .jellyseerr-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: rgba(0, 150, 255, 0.15); color: #8fd1ff; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
                .pill-number-open { background: rgba(0, 150, 255, 0.15); color: #8fd1ff; }
                .pill-status-open { background: rgba(255, 200, 0, 0.18); color: #ffd666; }
                .pill-number-resolved, .pill-status-resolved { background: rgba(0, 180, 60, 0.18); color: #8dffb0; }
                .jellyseerr-issue-message { margin-top: 6px; color: #ddd; white-space: pre-wrap; }
                .jellyseerr-issue-comments { margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; display: grid; gap: 6px; }
                .jellyseerr-issue-comment { padding: 6px 8px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
                .jellyseerr-issue-comment-meta { font-size: 12px; color: #9aa; margin-bottom: 2px; }
                .jellyseerr-issue-comment-body { color: #eaeaea; font-size: 14px; white-space: pre-wrap; }
                .jellyseerr-issues-empty { color: #9aa; padding: 8px 0; }
            </style>
            <div class="jellyseerr-issue-form">
                <div class="jellyseerr-form-group">
                    <label>${JE.t('jellyseerr_report_issue_type_label')}</label>
                    <div class="jellyseerr-issue-radio-group">
                        ${ISSUE_TYPES.map(type => `
                            <label class="jellyseerr-radio-label">
                                <input type="radio" name="issue-type" value="${type.value}" class="jellyseerr-radio-input" required>
                                <span class="jellyseerr-radio-option">${type.icon} ${type.label}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="jellyseerr-form-group">
                    <label for="issue-message">${JE.t('jellyseerr_report_issue_message')}</label>
                    <textarea
                        id="issue-message"
                        class="jellyseerr-issue-textarea"
                        placeholder="${JE.t('jellyseerr_report_issue_message_placeholder')}"
                        rows="4"
                    ></textarea>
                </div>
                <div id="jellyseerr-tv-controls-placeholder"></div>
                <div class="jellyseerr-issues-container" id="jellyseerr-issues-container">
                    <div class="jellyseerr-issues-header">${JE.t('jellyseerr_existing_issues')}</div>
                    <div class="jellyseerr-issues-body" id="jellyseerr-issues-body">
                        <div class="jellyseerr-issues-loading" id="jellyseerr-issues-loading">${JE.t('jellyseerr_loading_issues')}</div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderIssues(issues) {
        const issueTypeLabels = {
            1: JE.t('jellyseerr_report_issue_type_video') || 'Video',
            2: JE.t('jellyseerr_report_issue_type_audio') || 'Audio',
            3: JE.t('jellyseerr_report_issue_type_subtitles') || 'Subtitles',
            4: JE.t('jellyseerr_report_issue_type_other') || 'Other'
        };

        const statusLabels = {
            1: JE.t('jellyseerr_issue_open') || 'Open',
            2: JE.t('jellyseerr_issue_resolved') || 'Resolved'
        };

        const fmtDate = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            const day = String(d.getDate()).padStart(2, '0');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const mon = monthNames[d.getMonth()];
            const year = d.getFullYear();
            const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            return `${day}-${mon}-${year} ${time}`;
        };

        // Group by type to separate the four issue categories
        const grouped = issues.reduce((acc, issue) => {
            const key = issue.issueType || issue.problemType || 'unknown';
            acc[key] = acc[key] || [];
            acc[key].push(issue);
            return acc;
        }, {});

        const typeOrder = [1, 2, 3, 4, 'unknown'];

        const sections = typeOrder
            .filter(key => grouped[key] && grouped[key].length)
            .map(key => {
                const label = issueTypeLabels[key] || 'Other';
                const cards = grouped[key]
                    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                    .map(issue => {
                        const status = issue.status;
                        const createdBy = escapeHtml(
                            issue.createdBy?.jellyfinUsername ||
                            issue.createdBy?.displayName ||
                            issue.createdBy?.username ||
                            issue.createdBy?.email ||
                            'Someone'
                        );
                        const createdAt = fmtDate(issue.createdAt);
                        const comments = Array.isArray(issue.comments) ? issue.comments : [];

                        // Use first comment as description when no issue.message
                        const [firstComment, ...restComments] = comments;

                        const commentHtml = restComments.map(c => {
                            const who = escapeHtml(
                                c.user?.jellyfinUsername ||
                                c.user?.displayName ||
                                c.user?.username ||
                                c.user?.email ||
                                ''
                            );
                            const when = fmtDate(c.createdAt);
                            const msg = escapeHtml(c.message || '');
                            const meta = `${when}${who ? ' • ' + who : ''}`;
                            return `<div class="jellyseerr-issue-comment"><div class="jellyseerr-issue-comment-meta">${meta}</div><div class="jellyseerr-issue-comment-body">${msg}</div></div>`;
                        }).join('');

                        const mainMessage = escapeHtml(issue.message || (firstComment?.message || '(No description)'));
                        const statusText = statusLabels[status] || '';
                        const isResolved = String(status) === '2' || String(status).toLowerCase() === 'resolved';
                        const numberClass = isResolved ? 'pill-number-resolved' : 'pill-number-open';
                        const statusClass = isResolved ? 'pill-status-resolved' : 'pill-status-open';
                        const summary = `<span class="jellyseerr-pill ${numberClass}">#${escapeHtml(String(issue.id))}</span><span class="jellyseerr-pill ${statusClass}">${escapeHtml(statusText || (isResolved ? 'Resolved' : 'Open'))}</span>${createdAt ? ` <span class="jellyseerr-issue-date">${createdAt}</span>` : ''}`;
                        return `
                            <div class="jellyseerr-issue-card">
                                <div class="jellyseerr-issue-summary">${summary}<span class="jellyseerr-issue-reporter"> — ${createdBy}</span></div>
                                <div class="jellyseerr-issue-message">${mainMessage}</div>
                                ${commentHtml ? `<div class="jellyseerr-issue-comments">${commentHtml}</div>` : ''}
                            </div>
                        `;
                    }).join('');

                return `
                    <div class="jellyseerr-issue-section">
                        <div class="jellyseerr-issue-section-title">${label}</div>
                        ${cards}
                    </div>
                `;
            }).join('');

        return sections;
    }

    function addIndicatorStyles() {
        // Inject CSS once per page load
        if (!document.getElementById('je-issue-indicator-style')) {
            const style = document.createElement('style');
            style.id = 'je-issue-indicator-style';
            style.textContent = `
                .jellyseerr-report-issue-icon.has-open-issues .detailButton-icon { color: #f97316 !important; }
                .jellyseerr-report-issue-icon { position: relative; }
                .jellyseerr-issue-count-badge {
                    position: absolute; top: 2px; right: 2px;
                    background: #f97316; color: #fff;
                    font-size: 10px; font-weight: 700;
                    border-radius: 999px; min-width: 16px; height: 16px;
                    display: flex; align-items: center; justify-content: center;
                    padding: 0 3px; pointer-events: none; line-height: 1;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.5); z-index: 10;
                }
            `;
            document.head.appendChild(style);
        }

    }

    JE.jellyseerrIssueReporterView = { createForm, renderIssues, addIndicatorStyles };

})(window.JellyfinEnhanced);
