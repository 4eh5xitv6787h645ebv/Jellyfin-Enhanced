const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const sourceRoot = resolve(__dirname, '../../client');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

function load({ je = {}, api = {}, document = {}, globals = {}, files = ['data', 'recommendations', 'request-more'] } = {}) {
    const JE = {
        pluginConfig: { JellyseerrEnabled: true, JellyseerrShowSimilar: true },
        jellyseerrAPI: { checkUserStatus: async () => ({ active: true }) },
        ...je
    };
    const context = vm.createContext({
        window: { JellyfinEnhanced: JE, location: { hash: '#!/details?id=series' } },
        ApiClient: { getCurrentUserId: () => 'user', getItem: async () => ({ Type: 'Series', ProviderIds: { Tmdb: '42' } }), ...api },
        console: { debug() {}, warn() {}, log() {}, error() {} },
        document, AbortController, DOMException, URLSearchParams, setTimeout, clearTimeout, ...globals
    });
    for (const file of files) {
        const name = file === 'entry' ? 'item-details.js' : `item-details-${file}.js`;
        vm.runInContext(readFileSync(resolve(sourceRoot, name), 'utf8'), context, { filename: name });
    }
    return JE;
}

test('shared item lookup preserves movie/series mapping and cancellation after lookup', async () => {
    let item = { Type: 'Movie', ProviderIds: { Tmdb: '42' } };
    const JE = load({ api: { getItem: async () => item } });
    assert.equal((await JE.internals.jellyseerrItemDetails.getTmdbIdFromItem('movie')).type, 'movie');
    item = { Type: 'Episode', ProviderIds: { Tmdb: '42' } };
    assert.equal((await JE.internals.jellyseerrItemDetails.getTmdbIdFromItem('episode')).tmdbId, null);
    const pending = deferred();
    const waiting = load({ api: { getItem: () => pending.promise } });
    const controller = new AbortController();
    const result = waiting.internals.jellyseerrItemDetails.getTmdbIdFromItem('series', controller.signal);
    controller.abort();
    pending.resolve({ Type: 'Series', ProviderIds: { Tmdb: '42' } });
    await assert.rejects(result, { name: 'AbortError' });
});

test('cleanup of recommendations aborts its fetch without cancelling Request More', async () => {
    const pending = deferred();
    let fetchSignal;
    let checks = 0;
    let lookups = 0;
    const anchor = {};
    const content = { querySelector: selector => selector === '#similarCollapsible' ? anchor : null };
    const page = { querySelector: () => content };
    const JE = load({
        api: { getItem: async () => { lookups++; return { Type: 'Series', ProviderIds: { Tmdb: '42' } }; } },
        document: { querySelector: () => page },
        je: {
            jellyseerrAPI: {
                checkUserStatus: async () => ({ active: true }),
                fetchSimilarTvShows: async (_, { signal }) => { fetchSignal = signal; return pending.promise; },
                fetchTvShowDetails: async () => ({ id: 42, name: 'Series' })
            },
            jellyseerrMoreInfo: { checkForUnrequestedSeasons: async () => { checks++; return false; } }
        }
    });
    const workflows = JE.internals.jellyseerrItemDetails;
    const recommendation = workflows.recommendations.render('series');
    await flush();
    assert.equal(fetchSignal.aborted, false);
    const request = workflows.requestMore.render('series');
    workflows.recommendations.cleanup();
    await request;
    assert.equal(fetchSignal.aborted, true);
    assert.equal(checks, 1);
    pending.resolve({ results: [] });
    await recommendation;
    // A negative Request More result is deduplicated until navigation cleanup.
    await workflows.requestMore.render('series');
    assert.equal(lookups, 2);
    workflows.requestMore.cleanup();
    await workflows.requestMore.render('series');
    assert.equal(checks, 2);
});

test('Request More cleanup cancels checker polling and permits subsequent retry', async () => {
    const timers = new Map();
    let nextTimer = 1;
    let checks = 0;
    const JE = load({
        globals: {
            setTimeout: fn => { const id = nextTimer++; timers.set(id, fn); return id; },
            clearTimeout: id => timers.delete(id)
        },
        je: { jellyseerrAPI: { checkUserStatus: async () => ({ active: true }), fetchTvShowDetails: async () => ({ id: 42 }) } }
    });
    const workflow = JE.internals.jellyseerrItemDetails.requestMore;
    const pending = workflow.render('series');
    await flush();
    assert.equal(timers.size, 1);
    workflow.cleanup();
    await pending;
    assert.equal(timers.size, 0);
    JE.jellyseerrMoreInfo = { checkForUnrequestedSeasons: async () => { checks++; return false; } };
    await workflow.render('series');
    assert.equal(checks, 1);
});

test('recommendation readiness observer is unsubscribed when navigation cancels rendering', async () => {
    let unsubscribed = 0;
    const JE = load({
        document: { querySelector: () => null },
        je: {
            helpers: { onBodyMutation: () => ({ unsubscribe: () => { unsubscribed++; } }) },
            jellyseerrAPI: { checkUserStatus: async () => ({ active: true }), fetchSimilarTvShows: async () => ({ results: [] }) }
        }
    });
    const workflow = JE.internals.jellyseerrItemDetails.recommendations;
    const pending = workflow.render('series');
    await flush();
    workflow.cleanup();
    await pending;
    assert.equal(unsubscribed, 1);
});

test('entry registers teardown before navigation and dispatches both workflows on initial/view pages', () => {
    const calls = [];
    let teardown;
    let navigate;
    let view;
    const workflow = name => ({ render: id => calls.push(`${name}:${id}`), cleanup: () => calls.push(`${name}:cleanup`), injectStyles: () => calls.push('styles') });
    load({
        files: ['entry'],
        document: { readyState: 'complete' },
        globals: { requestAnimationFrame: fn => fn() },
        je: {
            internals: { jellyseerrItemDetails: { recommendations: workflow('recommendations'), requestMore: workflow('requestMore') } },
            core: {
                lifecycle: { register: name => {
                    assert.equal(name, 'jellyseerr-item-details');
                    return { onTeardown: fn => { teardown = fn; }, teardownOn: event => calls.push(`teardown:${event}`) };
                } },
                navigation: { onNavigate: fn => { calls.push('register-navigation'); navigate = fn; }, onViewPage: fn => { view = fn; } }
            }
        }
    });
    assert.deepEqual(calls, ['styles', 'teardown:navigate', 'register-navigation', 'recommendations:series', 'requestMore:series']);
    calls.length = 0;
    teardown();
    navigate();
    view();
    assert.deepEqual(calls, ['recommendations:cleanup', 'requestMore:cleanup', 'recommendations:series', 'requestMore:series', 'recommendations:series', 'requestMore:series']);
});
