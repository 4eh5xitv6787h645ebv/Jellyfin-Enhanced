const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const featureRoot = path.resolve(__dirname, '../..');
const legacyUrl = 'https://api.github.com/repos/n00bcodr/Jellyfin-Enhanced/contents/Jellyfin.Plugin.JellyfinEnhanced/js/locales';
const migratedUrl = 'https://api.github.com/repos/n00bcodr/Jellyfin-Enhanced/contents/locales';
const response = (status, files = [{ name: 'fr.json' }, { name: 'en.json' }, { name: 'README.md' }, { name: 'DE.json' }]) => ({
    status, ok: status >= 200 && status < 300,
    json: async () => files
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function harness(surface, responses, initial = {}) {
    const calls = [];
    const select = {
        options: [], value: initial.value || '',
        appendChild(option) {
            this.options.push(option);
            option.remove = () => { this.options = this.options.filter(item => item !== option); };
        },
        addEventListener() {}
    };
    for (const option of initial.options || []) select.appendChild({ ...option });
    const JE = { currentSettings: {}, internals: {} };
    const context = vm.createContext({
        window: { JellyfinEnhanced: JE },
        document: {
            getElementById: id => id === (surface === 'runtime' ? 'displayLanguageSelect' : 'DefaultLanguage') ? select : null,
            createElement: () => ({ style: {} })
        },
        ApiClient: {
            getCurrentUserId: () => 'user-a', getUrl: url => url,
            ajax: async ({ url }) => url.endsWith('/locales') ? ['de'] : [
                { TwoLetterISOLanguageName: 'de', DisplayName: 'German' },
                { TwoLetterISOLanguageName: 'fr', DisplayName: 'French' }
            ]
        },
        localStorage: { getItem: () => null },
        fetch: async url => {
            calls.push(url);
            assert.ok(responses.length, 'unexpected additional network request');
            const result = responses.shift();
            if (result instanceof Error) throw result;
            return result;
        },
        console: { log() {}, warn() {} }
    });
    const source = surface === 'runtime' ? 'client/ui-panel-language.js' : 'settings/languages.js';
    vm.runInContext(fs.readFileSync(path.join(featureRoot, source), 'utf8'), context, { filename: source });
    function start() {
        if (surface === 'runtime') {
            JE.internals.enhancedUi.wireLanguageControls({ resetAutoCloseTimer() {} });
            return null;
        }
        const lifecycle = { disposed: false, dispose() { this.disposed = true; } };
        const module = context.createUserSettingsLanguages({ lifecycle });
        module.initialize();
        return module;
    }
    return { calls, select, context, start,
        inventory: () => select.options.map(option => ({ value: option.value, text: option.textContent })) };
}

async function discover(surface, responses) {
    const h = harness(surface, responses);
    h.start();
    // Initialization deliberately keeps its synchronous host contract.
    await flush();
    return { calls: h.calls, options: h.inventory() };
}

for (const surface of ['runtime', 'admin']) {
    test(`${surface}: existing upstream path needs only one request and preserves option formatting`, async () => {
        const result = await discover(surface, [response(200)]);
        assert.deepEqual(result.calls, [legacyUrl]);
        assert.deepEqual(result.options, [{ value: 'fr', text: 'French' }, { value: 'de', text: 'German' }]);
    });

    test(`${surface}: only a missing legacy directory falls back to the root locale directory`, async () => {
        const result = await discover(surface, [response(404), response(200)]);
        assert.deepEqual(result.calls, [legacyUrl, migratedUrl]);
        assert.deepEqual(result.options.map(option => option.value), ['fr', 'de']);
    });

    test(`${surface}: rate limits, authorization, server and network failures retain server locales`, async () => {
        for (const failure of [response(403), response(401), response(429), response(500), new Error('offline')]) {
            const result = await discover(surface, [failure]);
            assert.deepEqual(result.calls, [legacyUrl]);
            assert.deepEqual(result.options, [{ value: 'de', text: 'German' }]);
        }
    });

    test(`${surface}: fallback failures and malformed successful JSON never trigger a third request`, async () => {
        for (const failure of [response(404), response(500), new Error('offline')]) {
            const result = await discover(surface, [response(404), failure]);
            assert.deepEqual(result.calls, [legacyUrl, migratedUrl]);
            assert.deepEqual(result.options, [{ value: 'de', text: 'German' }]);
        }
        const malformed = response(200);
        malformed.json = async () => { throw new SyntaxError('bad JSON'); };
        const result = await discover(surface, [malformed]);
        assert.deepEqual(result.calls, [legacyUrl]);
        assert.deepEqual(result.options, [{ value: 'de', text: 'German' }]);
    });
}


test('admin: disposing while locale APIs are pending skips upstream discovery and leaves static options untouched', async () => {
    const pending = deferred();
    const h = harness('admin', [], { options: [{ value: '', textContent: 'System Default' }] });
    h.context.ApiClient.ajax = () => pending.promise;
    const module = h.start();
    module.dispose();
    pending.resolve([]);
    await flush();
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.inventory(), [{ value: '', text: 'System Default' }]);
});

test('admin: disposing a pending legacy fetch prevents fallback requests and option mutations', async () => {
    const pending = deferred();
    const h = harness('admin', [pending.promise], { options: [{ value: '', textContent: 'System Default' }] });
    const module = h.start();
    await flush();
    assert.deepEqual(h.calls, [legacyUrl]);
    module.dispose();
    pending.resolve(response(404));
    await flush();
    assert.deepEqual(h.calls, [legacyUrl]);
    assert.deepEqual(h.inventory(), [{ value: '', text: 'System Default' }]);
});

test('admin: disposed JSON completion cannot overwrite a replacement instance on the same select', async () => {
    const pending = deferred();
    const oldResponse = response(200);
    oldResponse.json = () => pending.promise;
    const h = harness('admin', [oldResponse, response(200)], {
        options: [{ value: '', textContent: 'System Default' }],
    });
    const first = h.start();
    await flush();
    first.dispose();
    h.start();
    await flush();
    h.select.value = 'fr';
    const expected = h.inventory();
    pending.resolve([{ name: 'es.json' }]);
    await flush();
    assert.deepEqual(h.inventory(), expected);
    assert.equal(h.select.value, 'fr');
    assert.deepEqual(expected, [
        { value: '', text: 'System Default' },
        { value: 'fr', text: 'French' },
        { value: 'de', text: 'German' },
    ]);
});

test('admin: same-DOM reinitialization reconciles locale options once while preserving selection and System Default', async () => {
    const h = harness('admin', [response(200), response(200, [
        { name: 'fr.json' }, { name: 'FR.json' }, { name: 'de.json' }, { name: 'de.json' },
    ])], { options: [{ value: '', textContent: 'System Default' }] });
    const first = h.start();
    first.initialize();
    await flush();
    assert.equal(h.calls.length, 1, 'an instance initializes only once');
    h.select.value = 'fr';
    first.dispose();
    h.start();
    await flush();
    assert.deepEqual(h.inventory(), [
        { value: '', text: 'System Default' },
        { value: 'fr', text: 'French' },
        { value: 'de', text: 'German' },
    ]);
    assert.equal(h.select.value, 'fr');
    assert.equal(new Set(h.select.options.map(option => option.value.toLowerCase())).size, h.select.options.length);
});

test('admin: refreshing discovery retains a selected extension locale even when it disappears from the response', async () => {
    const h = harness('admin', [response(200, [])], {
        value: 'extension',
        options: [
            { value: '', textContent: 'System Default' },
            { value: 'extension', textContent: 'Extension language' },
            { value: 'unused', textContent: 'Old unused language' },
        ],
    });
    h.start();
    await flush();
    assert.equal(h.select.value, 'extension');
    assert.deepEqual(h.inventory(), [
        { value: '', text: 'System Default' },
        { value: 'extension', text: 'Extension language' },
        { value: 'de', text: 'German' },
    ]);
});
