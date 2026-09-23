/** Feature settings and its private editor state. */
function createArrConnections({
    lifecycle,
    beginConnectionTest,
    jeTestAlert,
    setConnectionTestResult,
    _jeNormalizeArrUrl,
    updateAllDependencies,
}) {
    const cardRequests = new WeakMap();
    // === Arr Service Test Buttons ===

    /**
     * Produces a user-friendly error message from a connection test failure.
     * @param {Object} error - The ajax error object with a status property
     * @param {string} serviceName - Display name of the service
     * @param {string} url - The URL that was tested
     * @returns {string} Human-readable error message
     */
    function connectionErrorMessage(error, serviceName, url) {
        // surface backend's typed code/cf-ray so admins
        // see actionable messages (HtmlResponse, Cloudflare5xx, etc.)
        // instead of "API key rejected" for everything.
        // Jellyfin's ApiClient.ajax errors don't expose responseJSON;
        // they expose responseText. Parse it ourselves.
        var body =
            error &&
            (error.responseJSON ||
                (function () {
                    try {
                        var txt = error.responseText || (error.response && error.response.text) || '';
                        if (typeof txt === 'string' && txt.length > 0 && txt.trim().charAt(0) === '{') {
                            return JSON.parse(txt);
                        }
                    } catch (_) {
                        /* not JSON, fall through */
                    }
                    return null;
                })());
        if (body && body.code && body.message) {
            var prefix = body.cfRay ? '[' + serviceName + ' cf-ray=' + body.cfRay + '] ' : '';
            return prefix + body.message;
        }
        if (error.status === 502)
            return 'Could not reach ' + url + '. Check the URL is correct and ' + serviceName + ' is running.';
        if (error.status === 504) return 'Connection timed out. The server may be unreachable.';
        if (error.status === 401) return 'The API key was rejected. Check the key is correct.';
        if (error.status === 403)
            return (
                'Permission denied. Check the API key has the correct permissions, or that CSRF protection is not enabled in ' +
                serviceName +
                '.'
            );
        if (error.status === 400) return 'Missing URL or API key.';
        if (error.status === 404)
            return (
                'The URL responded but did not look like a valid ' +
                serviceName +
                ' instance (HTTP 404 on /api/v1/user). It may be a reverse-proxy auth challenge.'
            );
        return 'Connection to ' + serviceName + ' failed (error ' + (error.status || 'unknown') + ').';
    }

    async function testInstanceConnection(card) {
        if (lifecycle.disposed || card.isConnected === false) return;
        var type = card.dataset.type;
        var urlVal = (card.querySelector('.arr-instance-url').value || '').trim();
        var apiKeyVal = (card.querySelector('.arr-instance-apikey').value || '').trim();
        var nameVal =
            card.querySelector('.arr-instance-name').value.trim() || (type === 'sonarr' ? 'Sonarr' : 'Radarr');
        var btn = card.querySelector('.arr-instance-test');
        var indicator = card.querySelector('.arr-instance-status');

        if (!urlVal || !apiKeyVal) {
            Dashboard.alert({
                title: 'Missing Information',
                message: 'Please provide both a URL and API key to test the connection.',
            });
            return;
        }

        const request = {};
        cardRequests.set(card, request);
        const isCurrent = () => !lifecycle.disposed && card.isConnected !== false && cardRequests.get(card) === request;
        var _testToken = typeof beginConnectionTest === 'function' ? beginConnectionTest() : undefined;
        btn.disabled = true;
        indicator.textContent = 'sync';
        // Don't wipe the indicator's class wholesale with `className = ...` —
        // that drops `arr-instance-status`, the identifier used to re-query
        // this element on subsequent Test clicks. classList.add leaves the
        // identifier class intact so repeated tests on the same card work.
        indicator.classList.add('status-check');
        indicator.style.color = 'var(--primary-accent-color, #00a4dc)';

        var arrCacheKey = type + ':' + _jeNormalizeArrUrl(urlVal);
        try {
            var endpoint = type === 'sonarr' ? 'sonarr' : 'radarr';
            var validationUrl = ApiClient.getUrl('/JellyfinEnhanced/arr/validate/' + endpoint, { url: urlVal });
            await ApiClient.ajax({
                type: 'GET',
                url: validationUrl,
                dataType: 'json',
                headers: { 'X-Arr-ApiKey': apiKeyVal },
            });
            if (!isCurrent()) return;

            indicator.textContent = 'check_circle';
            indicator.style.color = '#52b54b';
            indicator.classList.remove('status-check');
            try {
                setConnectionTestResult(arrCacheKey, 'ok', 'Connected', _testToken);
            } catch (err) {
                /* cache is best-effort */
            }
            jeTestAlert({ title: 'Success', message: 'Successfully connected to ' + nameVal + '!' });
        } catch (e) {
            if (!isCurrent()) return;
            indicator.classList.remove('status-check');
            indicator.textContent = 'error';
            indicator.style.color = '#dc3545';

            var msg = connectionErrorMessage(e, nameVal, urlVal);
            try {
                var shortArrDetail =
                    e && e.status === 401
                        ? 'API key rejected'
                        : e && (e.status === 500 || e.status === 0 || !e.status)
                          ? 'Unreachable'
                          : 'Error ' + (e && e.status ? e.status : '?');
                setConnectionTestResult(arrCacheKey, 'error', shortArrDetail, _testToken);
            } catch (err) {
                /* cache is best-effort */
            }
            jeTestAlert({ title: 'Connection Failed', message: msg });
        } finally {
            if (isCurrent()) btn.disabled = false;
        }

        if (isCurrent()) updateAllDependencies();
    }

    return { connectionErrorMessage, testInstanceConnection };
}
