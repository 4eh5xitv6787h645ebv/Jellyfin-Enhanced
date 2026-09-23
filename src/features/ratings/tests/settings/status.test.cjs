const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, { value: '', textContent: '', style: {}, classList: {
                add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
            } });
        }
        return elements.get(id);
    }
    const pending = [];
    const handlers = new Map();
    const lifecycle = { disposed: false, dispose() { this.disposed = true; }, listen(target, type, callback) { handlers.set(target, callback); } };
    const context = vm.createContext({
        document: { querySelector: selector => element(selector.slice(1)), getElementById: id => id === 'mdblistRatingsSourcesAdmin' ? null : element(id) },
        ApiClient: { getUrl: (url, query) => ({ url, query }), ajax: options => new Promise((resolve, reject) => pending.push({ resolve, reject, options })) },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../settings/settings.js'), 'utf8'), context);
    const feature = context.createRatingsSettings({ lifecycle, refreshQualityCatAdminArrows() {}, formatDateTimeDMY: () => 'DATE' });
    feature.initialize();
    return { feature, lifecycle, pending, element, check: () => handlers.get(element('checkMdblistStatusBtn'))() };
}

test('latest MDBList status wins and older completion cannot remove its spinner', async () => {
    const h = harness();
    h.element('mdblistApiKey').value = 'old-key';
    const older = h.check();
    h.element('mdblistApiKey').value = 'new-key';
    const newer = h.check();
    h.pending[0].reject({ status: 502 });
    await older;
    assert.equal(h.element('mdblistStatusLine').textContent, 'Checking...');
    assert.equal(h.element('mdblistStatusIndicator').classList.contains('status-check'), true);
    h.pending[1].resolve({ RateLimitRemaining: 8, RateLimit: 10, Plan: 'Pro' });
    await newer;
    assert.match(h.element('mdblistStatusLine').textContent, /^8 \/ 10/);
    assert.equal(h.element('mdblistStatusIndicator').classList.contains('status-check'), false);
    assert.equal(h.pending[1].options.url.query.apiKey, 'new-key');
});

test('disposed MDBList callbacks cannot alter a re-entered page status', async () => {
    for (const failure of [false, true]) {
        const h = harness();
        const request = h.check();
        h.feature.dispose();
        h.element('mdblistStatusLine').textContent = 'new page';
        h.element('mdblistStatusIndicator').textContent = 'new indicator';
        if (failure) h.pending[0].reject({ status: 502 });
        else h.pending[0].resolve({ RateLimitRemaining: 99 });
        await request;
        assert.equal(h.element('mdblistStatusLine').textContent, 'new page');
        assert.equal(h.element('mdblistStatusIndicator').textContent, 'new indicator');
    }
});

test('loading configuration without a key invalidates pending status and resets its spinner', async () => {
    const h = harness();
    const request = h.check();
    h.feature.load({ MdblistApiKey: '' });
    h.pending[0].resolve({ RateLimitRemaining: 99 });
    await request;
    assert.equal(h.element('mdblistStatusLine').textContent, '');
    assert.equal(h.element('mdblistStatusIndicator').textContent, '');
    assert.equal(h.element('mdblistStatusIndicator').classList.contains('status-check'), false);
    assert.equal(h.pending.length, 1);
    assert.equal(h.element('mdblistFetchReserve').value, 400);
    assert.equal(h.element('mdblistRatingsShowOnItemDetails').checked, true);
});
