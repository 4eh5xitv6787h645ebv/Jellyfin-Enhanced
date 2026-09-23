/** Feature settings and its private editor state. */
function createAnalyticsSettings({ lifecycle, formatDateTimeDMY }) {
    let previewSeq = 0;

    function loadAnalyticsSettings(config) {
        ++previewSeq; // A previous load must never paint a stale preview.
        // Usage Statistics (opt-in analytics)
        (function () {
            var masterEl = document.querySelector('#analyticsEnabled');
            var subContainer = document.getElementById('analyticsSubOptionsContainer');
            var flagsEl = document.querySelector('#analyticsShareFeatureFlags');
            var countsEl = document.querySelector('#analyticsShareUsageCounts');
            var sizesEl = document.querySelector('#analyticsShareDataSizes');
            var intervalEl = document.querySelector('#analyticsReportIntervalDays');
            var previewBtn = document.getElementById('analyticsPreviewBtn');
            var previewContainer = document.getElementById('analyticsPreviewContainer');
            var previewJson = document.getElementById('analyticsPreviewJson');
            var lastSentEl = document.getElementById('analyticsLastSent');

            masterEl.checked = config.AnalyticsEnabled || false;
            flagsEl.checked = config.AnalyticsShareFeatureFlags !== false;
            countsEl.checked = config.AnalyticsShareUsageCounts !== false;
            sizesEl.checked = config.AnalyticsShareDataSizes !== false;
            intervalEl.value = config.AnalyticsReportIntervalDays || 15;
            subContainer.style.display = masterEl.checked ? '' : 'none';

            if (config.AnalyticsLastReportedAt) {
                var d = new Date(config.AnalyticsLastReportedAt);
                lastSentEl.textContent = 'Last report sent: ' + formatDateTimeDMY(d);
            } else {
                lastSentEl.textContent = 'No report has been sent yet.';
            }

            lifecycle.listen(
                masterEl,
                'change',
                function () {
                    subContainer.style.display = this.checked ? '' : 'none';
                    // Once the admin has turned the master on this session,
                    // the save handler must persist AnalyticsHasBeenConfigured
                    // EVEN IF the master is off again at save time — otherwise
                    // an enable -> uncheck a category -> disable -> save
                    // sequence stores the unchecks with the flag still false,
                    // and the next session's enable re-cascades all three
                    // over a recorded opt-out. dataset (not a closure var)
                    // because the save handler lives outside this IIFE.
                    if (this.checked) masterEl.dataset.jeTouched = '1';
                    // First time the admin ever turns this on, default every
                    // sub-category to shared; after that, leave their choices alone.
                    if (this.checked && !config.AnalyticsHasBeenConfigured) {
                        flagsEl.checked = true;
                        countsEl.checked = true;
                        sizesEl.checked = true;
                        // One-shot: mark configured on the page copy too, or an
                        // off/on toggle in the same session re-forces all three
                        // and silently reverts a deliberate uncheck (the server
                        // copy only updates on save, the closure never does).
                        config.AnalyticsHasBeenConfigured = true;
                        // The programmatic .checked writes above fire no change
                        // events, so refresh an open preview by hand — it must
                        // never show less than what would now be sent.
                        if (previewContainer.style.display !== 'none') runPreview();
                    }
                },
                undefined,
                'analytics-consent',
            );

            // Monotonic token: runPreview has several auto-triggers
            // (button, sub-toggle changes, the first-enable cascade),
            // and overlapping responses would otherwise race
            // last-write-wins — the preview could show a payload
            // contradicting the current checkboxes.
            async function runPreview() {
                var seq = ++previewSeq;
                previewBtn.disabled = true;
                try {
                    var res = await ApiClient.ajax({
                        type: 'POST',
                        url: ApiClient.getUrl('/JellyfinEnhanced/usage/preview'),
                        data: JSON.stringify({
                            shareFeatureFlags: flagsEl.checked,
                            shareUsageCounts: countsEl.checked,
                            shareDataSizes: sizesEl.checked,
                        }),
                        contentType: 'application/json',
                        dataType: 'json',
                    });
                    if (lifecycle.disposed || seq !== previewSeq) return; // superseded by a newer preview
                    previewJson.textContent = JSON.stringify(res.Payload, null, 2);
                    previewContainer.style.display = '';
                } catch (err) {
                    if (lifecycle.disposed || seq !== previewSeq) return; // superseded by a newer preview
                    // ApiClient.ajax rejects with the fetch Response on a
                    // non-2xx (no .message), so build something readable
                    // instead of "[object Response]".
                    var reason =
                        (err && err.message) ||
                        (err && err.status
                            ? 'HTTP ' + err.status + (err.statusText ? ' ' + err.statusText : '')
                            : 'check server logs');
                    previewJson.textContent = 'Failed to build preview: ' + reason;
                    previewContainer.style.display = '';
                } finally {
                    if (!lifecycle.disposed && seq === previewSeq) previewBtn.disabled = false;
                }
            }

            lifecycle.listen(previewBtn, 'click', runPreview, undefined, 'analytics-preview');
            // Re-run automatically once a preview has been shown, so toggling a
            // sub-option updates it live instead of looking stuck until re-clicked.
            [flagsEl, countsEl, sizesEl].forEach(function (el) {
                lifecycle.listen(
                    el,
                    'change',
                    function () {
                        if (previewContainer.style.display !== 'none') runPreview();
                    },
                    undefined,
                    'analytics-preview-category',
                );
            });
        })();
    }

    function readAnalyticsSettings(config) {
        // Usage Statistics
        config.AnalyticsEnabled = document.querySelector('#analyticsEnabled').checked;
        config.AnalyticsShareFeatureFlags = document.querySelector('#analyticsShareFeatureFlags').checked;
        config.AnalyticsShareUsageCounts = document.querySelector('#analyticsShareUsageCounts').checked;
        config.AnalyticsShareDataSizes = document.querySelector('#analyticsShareDataSizes').checked;
        var analyticsIntervalRaw = parseInt(document.querySelector('#analyticsReportIntervalDays').value, 10);
        config.AnalyticsReportIntervalDays = isNaN(analyticsIntervalRaw)
            ? 15
            : Math.min(30, Math.max(7, analyticsIntervalRaw));
        // Persist "configured" when saving with the master ON, and also
        // when the admin turned it on at any point this session (dataset
        // flag set by the master toggle handler) even if it's off again
        // now — their sub-category choices from that interaction are being
        // saved and must not be re-cascaded over on the next enable.
        if (config.AnalyticsEnabled || document.querySelector('#analyticsEnabled').dataset.jeTouched === '1') {
            config.AnalyticsHasBeenConfigured = true;
        }
    }

    return { load: loadAnalyticsSettings, read: readAnalyticsSettings, dispose: () => lifecycle.dispose() };
}
