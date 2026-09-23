/** Feature settings and its private editor state. */
function createStreamingAvailabilityConnections({
    lifecycle,
    beginConnectionTest,
    jeTestAlert,
    setConnectionTestResult,
    updateAllDependencies,
}) {
    let requestGeneration = 0;
    const isCurrent = (generation) => !lifecycle.disposed && generation === requestGeneration;

    const tmdbStatusIndicator = document.getElementById('tmdbStatusIndicator');

    async function performTmdbConnectionTest(event, generation) {
        const apiKey = (document.querySelector('#TMDB_API_KEY').value || '').trim();

        if (!apiKey) {
            Dashboard.alert({
                title: 'Missing Information',
                message: 'Please provide a TMDB API key to test the connection.',
            });
            return;
        }

        const _testToken = typeof beginConnectionTest === 'function' ? beginConnectionTest() : undefined;

        // Determine which status indicator to update based on button context
        const button = event.target.closest('button');
        const statusIndicator = button.parentElement.querySelector('.material-icons') || tmdbStatusIndicator;

        // Disable all test buttons during the test
        const allTestButtons = document.querySelectorAll('.testTmdbBtn');
        allTestButtons.forEach((btn) => (btn.disabled = true));

        statusIndicator.textContent = 'sync';
        statusIndicator.classList.add('status-check');
        statusIndicator.style.color = 'var(--primary-accent-color, #00a4dc)';

        try {
            const validationUrl = ApiClient.getUrl(`/JellyfinEnhanced/tmdb/validate`, { apiKey: apiKey });
            await ApiClient.ajax({ type: 'GET', url: validationUrl });
            if (!isCurrent(generation)) return;

            statusIndicator.textContent = 'check_circle';
            statusIndicator.style.color = '#52b54b';
            try {
                setConnectionTestResult('tmdb', 'ok', 'API key valid', _testToken);
            } catch (err) {
                /* cache is best-effort */
            }
            jeTestAlert({ title: 'Success', message: 'Successfully connected to TMDB!' });
        } catch (e) {
            if (!isCurrent(generation)) return;
            console.error('TMDB validation failed:', e);
            var errorMessage;
            if (e.status === 401) {
                errorMessage = 'The API key is invalid. Check that you copied it correctly.';
            } else if (e.status === 500 || e.status === 0 || !e.status) {
                errorMessage = 'Could not reach TMDB servers. Check your network connection.';
            } else {
                errorMessage = 'Connection failed (error ' + e.status + '). Check the key and your network.';
            }

            statusIndicator.textContent = 'error';
            statusIndicator.style.color = '#dc3545';
            try {
                var shortDetail =
                    e.status === 401
                        ? 'API key rejected'
                        : e.status === 500 || e.status === 0 || !e.status
                          ? 'Unreachable'
                          : 'Error ' + e.status;
                setConnectionTestResult('tmdb', 'error', shortDetail, _testToken);
            } catch (err) {
                /* cache is best-effort */
            }
            jeTestAlert({ title: 'Connection Failed', message: errorMessage });
        } finally {
            if (isCurrent(generation)) {
                allTestButtons.forEach((btn) => (btn.disabled = false));
                if (statusIndicator) {
                    statusIndicator.classList.remove('status-check');
                }
            }
        }
    }

    async function testTmdbConnection(event) {
        if (lifecycle.disposed) return;
        const generation = ++requestGeneration;
        await performTmdbConnectionTest(event, generation);
        if (isCurrent(generation)) updateAllDependencies();
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // click handlers to all TMDB test buttons
        document.querySelectorAll('.testTmdbBtn').forEach((btn) => {
            lifecycle.listen(btn, 'click', testTmdbConnection);
        });
    }
    return { initialize, dispose: () => lifecycle.dispose() };
}
