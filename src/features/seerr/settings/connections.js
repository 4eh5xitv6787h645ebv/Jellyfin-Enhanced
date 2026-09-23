/** Feature settings and its private editor state. */
function createSeerrConnections({
    lifecycle,
    beginConnectionTest,
    jeTestAlert,
    setConnectionTestResult,
    connectionErrorMessage,
}) {
    let validationGeneration = 0;
    let scanGeneration = 0;

    const testJellyseerrBtn = document.getElementById('testJellyseerrBtn');

    const jellyseerrStatusIndicator = document.getElementById('jellyseerrStatusIndicator');

    async function testJellyseerrConnection() {
        if (lifecycle.disposed) return;
        const generation = ++validationGeneration;
        const isCurrent = () => !lifecycle.disposed && generation === validationGeneration;
        const urls = (document.querySelector('#jellyseerrUrls').value || '')
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean);
        const apiKey = (document.querySelector('#JellyseerrApiKey').value || '').trim();

        if (!urls.length || !apiKey) {
            Dashboard.alert({
                title: 'Missing Information',
                message: 'Please provide at least one Seerr URL and an API key to test the connection.',
            });
            return;
        }

        const _testToken = typeof beginConnectionTest === 'function' ? beginConnectionTest() : undefined;
        testJellyseerrBtn.disabled = true;
        jellyseerrStatusIndicator.textContent = 'sync';
        jellyseerrStatusIndicator.classList.add('status-check');
        jellyseerrStatusIndicator.style.color = 'var(--primary-accent-color, #00a4dc)';

        let validated = false;
        let lastError = '';
        for (const url of urls) {
            try {
                const validationUrl = ApiClient.getUrl(`/JellyfinEnhanced/jellyseerr/validate`, {
                    url: url,
                });

                const res = await ApiClient.ajax({
                    type: 'GET',
                    url: validationUrl,
                    dataType: 'json',
                    headers: { 'X-Arr-ApiKey': apiKey },
                });

                if (!isCurrent()) return;
                if (res && res.ok) {
                    validated = true;
                    break;
                }
            } catch (e) {
                if (!isCurrent()) return;
                console.error(`Seerr validation failed for ${url}:`, e);
                // Jellyfin's ApiClient.ajax rejects with the Response object
                // (modern fetch), which doesn't expose responseText/responseJSON.
                // Read the body asynchronously so connectionErrorMessage can
                // surface the typed code/cfRay/message envelope.
                if (e && typeof e.json === 'function') {
                    try {
                        e.responseJSON = await e.clone().json();
                    } catch (_) {
                        /* not JSON */
                    }
                }
                if (!isCurrent()) return;
                lastError = connectionErrorMessage(e, 'Seerr', url);
            }
        }

        if (!isCurrent()) return;
        testJellyseerrBtn.disabled = false;
        jellyseerrStatusIndicator.classList.remove('status-check');

        if (validated) {
            jellyseerrStatusIndicator.textContent = 'check_circle';
            jellyseerrStatusIndicator.style.color = '#52b54b';
            try {
                setConnectionTestResult('seerr', 'ok', 'Connected', _testToken);
            } catch (e) {
                /* cache is best-effort */
            }
            jeTestAlert({ title: 'Success', message: 'Successfully connected to Seerr!' });
        } else {
            jellyseerrStatusIndicator.textContent = 'error';
            jellyseerrStatusIndicator.style.color = '#dc3545';
            try {
                setConnectionTestResult(
                    'seerr',
                    'error',
                    lastError && lastError.length < 80 ? lastError : 'Connection failed',
                    _testToken,
                );
            } catch (e) {
                /* cache is best-effort */
            }
            jeTestAlert({ title: 'Connection Failed', message: lastError || 'Could not connect to any provided URL.' });
        }
    }

    async function triggerSeerrScanNow() {
        if (lifecycle.disposed) return;
        const generation = ++scanGeneration;
        const urls = (document.querySelector('#jellyseerrUrls').value || '')
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean);
        const apiKey = (document.querySelector('#JellyseerrApiKey').value || '').trim();
        const btn = document.querySelector('#triggerSeerrScanNowBtn');
        const status = document.querySelector('#triggerSeerrScanNowStatus');

        if (!urls.length || !apiKey) {
            Dashboard.alert({
                title: 'Missing Information',
                message: 'Please provide at least one Seerr URL and an API key in the Setup section above.',
            });
            return;
        }

        btn.disabled = true;
        status.textContent = 'sync';
        status.className = 'material-icons status-check';
        status.style.color = '#00a4dc';

        let triggered = false;
        let lastError = '';
        for (const url of urls) {
            try {
                const triggerUrl = ApiClient.getUrl('/JellyfinEnhanced/jellyseerr/trigger-recently-added-scan', {
                    url: url,
                });
                const res = await ApiClient.ajax({
                    type: 'POST',
                    url: triggerUrl,
                    dataType: 'json',
                    headers: { 'X-Arr-ApiKey': apiKey },
                });
                if (res && res.ok) {
                    triggered = true;
                    break;
                }
            } catch (e) {
                console.error('Seerr scan trigger failed for ' + url + ':', e);
                lastError = connectionErrorMessage(e, 'Seerr', url);
            }
        }

        // Finish the requested scan/fallback attempts; only its completion UI is page-owned.
        if (lifecycle.disposed || generation !== scanGeneration) return;
        btn.disabled = false;
        status.classList.remove('status-check');

        if (triggered) {
            status.textContent = 'check_circle';
            status.style.color = '#52b54b';
            Dashboard.alert({ title: 'Scan Triggered', message: 'Triggered "Jellyfin Recently Added Scan" in Seerr' });
        } else {
            status.textContent = 'error';
            status.style.color = '#dc3545';
            Dashboard.alert({
                title: 'Trigger Failed',
                message: lastError || 'Could not trigger a scan against any provided URL.',
            });
        }
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        lifecycle.listen(testJellyseerrBtn, 'click', testJellyseerrConnection);

        lifecycle.listen(document.querySelector('#triggerSeerrScanNowBtn'), 'click', triggerSeerrScanNow);
    }
    return { testJellyseerrBtn, initialize, dispose: () => lifecycle.dispose() };
}
