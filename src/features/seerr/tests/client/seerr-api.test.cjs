const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceRoot = path.join(__dirname, '../../client');
const plain = value => JSON.parse(JSON.stringify(value));

function createApi() {
    let now = 0;
    let epoch = 0;
    const userChangeHandlers = [];
    const calls = [];
    const events = [];
    const invalidations = [];
    let respond = async () => ({});
    const JE = {
        pluginConfig: {},
        helpers: { trackUsage() {} },
        session: {
            getEpoch: () => epoch,
            isCurrent: value => value === epoch,
            onUserChange: (_, callback) => userChangeHandlers.push(callback)
        },
        requestManager: { clearCacheMatching: key => invalidations.push(key) },
        core: { api: {
            fetch: async (url, options) => { calls.push({ url, options }); return respond(url, options); },
            plugin: async (url, options) => { calls.push({ url, options }); return respond(url, options); }
        } }
    };
    const context = vm.createContext({
        window: { JellyfinEnhanced: JE, location: { origin: 'https://jellyfin.example' } },
        ApiClient: { getUrl: value => value, serverAddress: () => 'https://jellyfin.example/' },
        navigator: { language: 'fr-CA' },
        document: { dispatchEvent: event => events.push(event) },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        Date: { now: () => now }, URLSearchParams,
        console: { debug() {}, log() {}, warn() {}, error() {} }
    });
    for (const file of ['api/status.js', 'api/catalog.js', 'api/overrides.js', 'api/requests.js', 'api/issues.js', 'api.js']) {
        const filename = path.join(sourceRoot, file);
        vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    }
    return {
        api: JE.jellyseerrAPI, JE, calls, events, invalidations,
        respond: callback => { respond = callback; },
        advance: ms => { now += ms; },
        switchUser: () => { epoch++; userChangeHandlers.forEach(callback => callback()); }
    };
}

test('status success is session-scoped, failures expire after 60 seconds', async () => {
    const h = createApi();
    h.respond(async () => ({ active: false, userFound: false, reason: 'disabled' }));
    await h.api.checkUserStatus();
    h.advance(59999);
    await h.api.checkUserStatus();
    assert.equal(h.calls.length, 1);
    h.advance(1);
    h.respond(async () => ({ active: true, userFound: true, jellyseerrUserId: 7 }));
    await h.api.checkUserStatus();
    h.advance(1000000);
    assert.equal(await h.api.getCurrentJellyseerrUserId(), '7');
    assert.equal(h.calls.length, 2);
    h.switchUser();
    await h.api.checkUserStatus();
    assert.equal(h.calls.length, 3);
});

test('status resolving after a user switch is not cached for the new user', async () => {
    const h = createApi();
    let resolve;
    h.respond(() => new Promise(done => { resolve = done; }));
    const pending = h.api.checkUserStatus();
    h.switchUser();
    resolve({ active: true, userFound: true, jellyseerrUserId: 1 });
    await pending;
    h.respond(async () => ({ active: true, userFound: true, jellyseerrUserId: 2 }));
    assert.equal(await h.api.getCurrentJellyseerrUserId(), '2');
});

test('search preserves cached results, filters people and forwards cancellation', async () => {
    const h = createApi();
    const response = { results: [{ id: 1, mediaType: 'person' }, { id: 2, mediaType: 'movie' }], totalResults: 900 };
    h.respond(async () => response);
    const result = await h.api.search('a & b', 2);
    assert.equal(result.results.length, 1);
    assert.equal(result.totalResults, 1);
    assert.equal(response.results.length, 2);
    assert.equal(h.calls[0].url, '/JellyfinEnhanced/jellyseerr/search?query=a%20%26%20b&page=2&language=fr');
    const error = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    h.respond(async () => { throw error; });
    await assert.rejects(h.api.search('x'), error);
});

test('successful season request preserves payload, invalidates caches and broadcasts both events', async () => {
    const h = createApi();
    h.respond(async () => ({ id: 5 }));
    await h.api.requestTvSeasons('12', [1, 3], { serverId: 2 }, null, true);
    assert.deepEqual(plain(h.calls[0]), {
        url: '/jellyseerr/request',
        options: { method: 'POST', body: { mediaType: 'tv', mediaId: 12, seasons: [1, 3], serverId: 2, is4k: true }, skipRetry: true }
    });
    assert.deepEqual(h.events.map(event => event.type), ['jellyseerr-media-requested', 'jellyseerr-tv-requested']);
    assert.ok(h.invalidations.includes('jellyseerr:/tv/12'));
    assert.ok(h.invalidations.includes('jellyseerr:/quota'));
});

test('movie request keeps success when watchlist fails; failed submissions have no side effects', async () => {
    const h = createApi();
    h.respond(async () => ({ id: 5 }));
    h.api.addToWatchlist = async () => { throw new Error('watchlist unavailable'); };
    assert.deepEqual(plain(await h.api.requestMedia('12', 'movie')), { id: 5 });
    assert.ok(h.invalidations.includes('tmdb:/movie/12'));
    assert.deepEqual(h.events.map(event => event.type), ['jellyseerr-media-requested']);
    h.events.length = 0;
    h.invalidations.length = 0;
    h.respond(async () => { throw new Error('request rejected'); });
    await assert.rejects(h.api.requestMedia('13', 'movie'), /request rejected/);
    assert.equal(h.events.length, 0);
    assert.equal(h.invalidations.length, 0);
});

test('override rules use first matching service, language, genre and user', async () => {
    const h = createApi();
    h.respond(async url => url.endsWith('/user-status')
        ? { active: true, userFound: true, jellyseerrUserId: 7 }
        : [
            { radarrServiceId: 1, language: 'de', profileId: 1 },
            { radarrServiceId: 2, language: 'en|fr', genre: 'comedy|18', users: '3, 7', profileId: 0, tags: '2|bad|4', rootFolder: '/movies' }
        ]);
    const settings = await h.api.evaluateOverrideRules({ originalLanguage: 'FR', genreIds: [18], genres: [] }, 'movie');
    assert.deepEqual(plain(settings), { serverId: 2, profileId: 0, tags: [2, 4], rootFolder: '/movies' });
    assert.equal(await h.api.evaluateOverrideRules({}, 'tv'), null);
});

test('override rule cache expires and resets on user switch', async () => {
    const h = createApi();
    h.respond(async () => [{ radarrServiceId: 1 }]);
    await h.api.fetchOverrideRules();
    h.advance(299999);
    await h.api.fetchOverrideRules();
    assert.equal(h.calls.length, 1);
    h.advance(1);
    await h.api.fetchOverrideRules();
    assert.equal(h.calls.length, 2);
    h.switchUser();
    await h.api.fetchOverrideRules();
    assert.equal(h.calls.length, 3);
});

test('issue reporting resolves Seerr internal ID and never retries the POST', async () => {
    const h = createApi();
    h.respond(async url => url.endsWith('/tv/12') ? { mediaInfo: { id: '88' } } : { id: 9 });
    await h.api.reportIssue(12, 'tv', '2', 'audio', '3', '4');
    assert.deepEqual(plain(h.calls[1]), {
        url: '/jellyseerr/issue',
        options: { method: 'POST', body: { mediaId: 88, issueType: 2, problemSeason: 3, problemEpisode: 4, message: 'audio' }, skipRetry: true }
    });
});

test('request settings retain last successful response during an outage', async () => {
    const h = createApi();
    h.respond(async () => ({ partialRequestsEnabled: true, enableSpecialEpisodes: true }));
    await h.api.fetchRequestSettings();
    h.respond(async () => { throw new Error('offline'); });
    assert.deepEqual(plain(await h.api.fetchRequestSettings()), { partialRequestsEnabled: true, enableSpecialEpisodes: true });
});

test('URL mapping matches normalized server addresses and preserves fallback', () => {
    const h = createApi();
    h.JE.pluginConfig = { JellyseerrUrlMappings: 'https://JELLYFIN.example/// | https://seerr.example/', JellyseerrBaseUrl: 'https://fallback.example/' };
    assert.equal(h.api.resolveJellyseerrBaseUrl(), 'https://seerr.example');
    h.JE.pluginConfig.JellyseerrUrlMappings = 'invalid';
    assert.equal(h.api.resolveJellyseerrBaseUrl(), 'https://fallback.example');
});
