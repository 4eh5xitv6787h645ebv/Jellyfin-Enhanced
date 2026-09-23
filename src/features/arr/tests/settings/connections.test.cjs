const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const pending = [], results = [], alerts = [];
    const lifecycle = { disposed: false };
    let refreshes = 0;
    const context = vm.createContext({
        ApiClient: { getUrl: (url, query) => ({ url, query }), ajax: options => new Promise((resolve, reject) => pending.push({ resolve, reject, options })) },
        Dashboard: { alert: value => alerts.push(value) },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../settings/connections.js'), 'utf8'), context);
    const feature = context.createArrConnections({
        lifecycle, beginConnectionTest: () => 17, setConnectionTestResult: (...args) => results.push(args),
        jeTestAlert: value => alerts.push(value), _jeNormalizeArrUrl: value => value.replace(/\/$/, ''),
        updateAllDependencies: () => refreshes++,
    });
    function card(type = 'sonarr') {
        const classes = new Set();
        const elements = {
            '.arr-instance-url': { value: 'https://arr.example/' }, '.arr-instance-apikey': { value: 'key' },
            '.arr-instance-name': { value: 'My Arr' }, '.arr-instance-test': { disabled: false },
            '.arr-instance-status': { textContent: '', style: {}, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } },
        };
        return { dataset: { type }, isConnected: true, querySelector: name => elements[name] };
    }
    return { feature, lifecycle, pending, results, alerts, card, refreshes: () => refreshes };
}

test('Arr tests preserve endpoint, secret header, generation token and success behavior', async () => {
    const h = harness(), card = h.card('radarr');
    const request = h.feature.testInstanceConnection(card);
    assert.equal(h.pending[0].options.url.url, '/JellyfinEnhanced/arr/validate/radarr');
    assert.equal(h.pending[0].options.headers['X-Arr-ApiKey'], 'key');
    h.pending[0].resolve({});
    await request;
    assert.deepEqual(h.results, [['radarr:https://arr.example', 'ok', 'Connected', 17]]);
    assert.equal(h.alerts[0].title, 'Success');
    assert.equal(h.refreshes(), 1);
    assert.equal(card.querySelector('.arr-instance-test').disabled, false);
});

test('older Arr completion cannot overwrite newer test or re-enable its button', async () => {
    const h = harness(), card = h.card();
    const older = h.feature.testInstanceConnection(card);
    const newer = h.feature.testInstanceConnection(card);
    h.pending[0].reject({ status: 401 });
    await older;
    assert.equal(card.querySelector('.arr-instance-test').disabled, true);
    assert.equal(card.querySelector('.arr-instance-status').textContent, 'sync');
    assert.equal(h.results.length, 0);
    assert.equal(h.alerts.length, 0);
    h.pending[1].resolve({});
    await newer;
    assert.equal(h.results.length, 1);
    assert.equal(h.alerts.length, 1);
    assert.equal(card.querySelector('.arr-instance-test').disabled, false);
});

test('disposed or replaced Arr cards cannot update UI, cache, dialogs or dependencies', async () => {
    for (const disposed of [false, true]) for (const failure of [false, true]) {
        const h = harness(), card = h.card();
        const request = h.feature.testInstanceConnection(card);
        if (disposed) h.lifecycle.disposed = true;
        else card.isConnected = false;
        card.querySelector('.arr-instance-status').textContent = 'replacement';
        if (failure) h.pending[0].reject({ status: 502 });
        else h.pending[0].resolve({});
        await request;
        assert.equal(card.querySelector('.arr-instance-status').textContent, 'replacement');
        assert.equal(h.results.length, 0);
        assert.equal(h.alerts.length, 0);
        assert.equal(h.refreshes(), 0);
    }
});

test('independent Arr cards keep separate in-flight ownership and typed errors', async () => {
    const h = harness(), a = h.card(), b = h.card('radarr');
    const first = h.feature.testInstanceConnection(a), second = h.feature.testInstanceConnection(b);
    h.pending[1].resolve({});
    await second;
    h.pending[0].reject({ status: 502, responseText: JSON.stringify({ code: 'Cloudflare5xx', message: 'Retry later', cfRay: 'ray-id' }) });
    await first;
    assert.equal(h.results.length, 2);
    assert.equal(h.alerts[1].message, '[My Arr cf-ray=ray-id] Retry later');
    assert.equal(h.results[1][3], 17);
    assert.equal(h.refreshes(), 2);
});
