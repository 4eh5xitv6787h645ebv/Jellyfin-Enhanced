const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const sourceRoot = path.resolve(__dirname, '../../client');
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = value => JSON.parse(JSON.stringify(value));

function load(filename, je = {}, globals = {}) {
    const context = vm.createContext({
        window: { JellyfinEnhanced: je },
        console: { log() {}, warn() {}, error() {} },
        ...globals
    });
    vm.runInContext(fs.readFileSync(path.join(sourceRoot, filename), 'utf8'), context, { filename });
    return context;
}

test('settings keep current account preferences live after SPA user changes', async () => {
    const listeners = {};
    const requests = [];
    const je = {
        userConfig: { elsewhere: { Region: 'AU', Regions: ['NZ'], Services: ['Netflix'] } },
        cdn: { url: (_, file) => file }
    };
    load('elsewhere-settings.js', je, {
        document: { addEventListener: (name, listener) => { listeners[name] = listener; } },
        fetch: async url => { requests.push(url); return { ok: true, text: async () => url === 'regions.txt' ? '# comment\nAU\tAustralia\nNZ\tNew Zealand' : '# comment\nNetflix\n' }; }
    });
    const settings = je.elsewhereSettings.create('GB');
    assert.deepEqual(requests, []);
    assert.deepEqual(Object.keys(listeners), []);
    settings.initialize();
    assert.equal(settings.userRegion, 'AU');
    assert.deepEqual(plain(settings.userRegions), ['NZ']);
    assert.deepEqual(plain(settings.userServices), ['Netflix']);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(plain(settings.availableRegions), { AU: 'Australia', NZ: 'New Zealand' });
    je.userConfig.elsewhere = {};
    listeners['je:user-data-loaded']();
    assert.equal(settings.userRegion, 'GB');
    assert.deepEqual(plain(settings.userRegions), []);
    assert.deepEqual(plain(settings.userServices), []);
});

test('settings catalog falls back after network failure', async () => {
    const je = { userConfig: {}, cdn: { url: (_, file) => file } };
    load('elsewhere-settings.js', je, {
        document: { addEventListener() {} },
        fetch: async () => { throw new Error('offline'); }
    });
    const settings = je.elsewhereSettings.create('US');
    settings.initialize();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settings.availableRegions.US, 'United States');
    assert.equal(settings.availableRegions.GB, 'United Kingdom');
});

test('streaming transport preserves provider route and user-visible failure mapping', async () => {
    const urls = [];
    let failure;
    const payload = { results: { AU: { flatrate: [{ provider_name: 'Netflix' }] } } };
    const je = { core: { api: { fetch: async url => { urls.push(url); if (failure) throw failure; return payload; } } } };
    load('elsewhere-api.js', je, { TypeError, SyntaxError, ApiClient: { getUrl: route => '/jellyfin' + route } });
    const { fetchStreamingData } = je.elsewhereApi.create();
    const request = () => new Promise(resolve => fetchStreamingData('42', 'tv', (error, data) => resolve({ error, data })));
    assert.deepEqual(await request(), { error: null, data: payload });
    assert.equal(urls[0], '/jellyfin/JellyfinEnhanced/tmdb/tv/42/watch/providers');
    const cases = [
        [new TypeError('Failed to fetch'), 'TMDB API is unreachable.'],
        [new SyntaxError('Invalid JSON'), 'Received an unexpected response from the server. Check your reverse proxy or Jellyfin configuration.'],
        [new Error('HTTP 401'), 'Invalid TMDB API Key.'],
        [new Error('HTTP 404'), 'The requested item could not be found on TMDB.'],
        [new Error('HTTP 429'), 'Too many requests. Please wait a moment and try again.'],
        [new Error('HTTP 503'), 'The TMDB service is temporarily unavailable. Please try again later.'],
        [new Error('Unusual failure'), 'Unusual failure']
    ];
    for (const [error, expected] of cases) {
        failure = error;
        assert.deepEqual(await request(), { error: expected, data: undefined });
    }
});

test('Elsewhere entrypoint initializes each dependency only when enabled and observes detail changes', () => {
    const events = [];
    const je = {
        pluginConfig: { ElsewhereEnabled: false, TmdbEnabled: true, DEFAULT_REGION: 'AU' },
        elsewhereSettings: { create: region => { events.push(['settings', region]); return {
            initialize: () => events.push(['initialize']), createSettingsModal: () => events.push(['modal'])
        }; } },
        elsewhereApi: { create: () => { events.push(['api']); return { fetchStreamingData() {} }; } },
        elsewherePanel: { create: (settings, fetchStreamingData) => {
            assert.equal(typeof settings.initialize, 'function');
            assert.equal(typeof fetchStreamingData, 'function');
            events.push(['panel']);
            return { autoLoadStreamingData() {} };
        } },
        helpers: { createObserver: name => events.push(['observer', name]) }
    };
    load('elsewhere.js', je, { document: { body: {}, querySelectorAll: () => [] }, setTimeout: callback => callback() });
    je.initializeElsewhereScript();
    assert.deepEqual(events, []);
    je.pluginConfig.ElsewhereEnabled = true;
    je.initializeElsewhereScript();
    assert.deepEqual(events, [['settings', 'AU'], ['api'], ['panel'], ['initialize'], ['modal'], ['observer', 'elsewhere']]);
});
