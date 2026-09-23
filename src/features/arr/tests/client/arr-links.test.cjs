const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = name => readFileSync(path.join(__dirname, '../../client', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function load(config = {}, lookup = async () => ({ matches: [] })) {
    const calls = [], toasts = [];
    const JE = {
        pluginConfig: config,
        toast: value => toasts.push(value),
        helpers: {},
        core: { api: { plugin: route => { calls.push(route); return lookup(route); } } },
    };
    const context = vm.createContext({
        window: { JellyfinEnhanced: JE, location: { origin: 'https://jellyfin.example' } },
        ApiClient: { serverAddress: () => 'https://JELLYFIN.example///' },
        console: { warn() {} },
    });
    vm.runInContext(source('arr-links-data.js'), context);
    return { JE, calls, toasts, data: JE.arrLinks.createData('test') };
}

test('instance configuration keeps enabled instances, exact URL mappings and defaults', () => {
    const { data } = load({
        SonarrInstances: [null, { Enabled: false, Url: 'disabled' },
            { Name: 'TV', Url: 'http://internal', UrlMappings: '\ninvalid\nhttps://jellyfin.example/ | https://sonarr.example/\n' },
            { Url: 'http://other', UrlMappings: 'https://unmatched|https://unused' }],
        RadarrInstances: [{ Name: 'No URL' }],
        BazarrUrl: 'http://bazarr', BazarrUrlMappings: 'https://jellyfin.example|https://bazarr.example/',
    });
    assert.deepEqual(plain(data.sonarrInstances).map(({ name, url }) => ({ name, url })), [
        { name: 'TV', url: 'https://sonarr.example' }, { name: 'Sonarr', url: 'http://other' },
    ]);
    assert.equal(data.radarrInstances.length, 0);
    assert.equal(data.bazarrUrl, 'https://bazarr.example');
});

test('legacy fallback still applies when no usable enabled instances remain', () => {
    const { data } = load({
        SonarrInstances: [{ Enabled: false, Url: 'disabled' }], SonarrUrl: 'http://legacy-tv',
        SonarrUrlMappings: 'https://jellyfin.example|https://legacy-tv.example/',
        RadarrUrl: 'http://legacy-movies/',
    });
    assert.equal(data.sonarrInstances[0].url, 'https://legacy-tv.example');
    assert.equal(data.radarrInstances[0].url, 'http://legacy-movies/');
    assert.equal(data.bazarrUrl, null);
});

test('lookup routes, mapping and defaults preserve API contracts and per-session caching', async () => {
    const { data, JE, calls } = load({}, async () => ({ matches: [{
        instanceName: 'TV', instanceUrl: 'http://internal', titleSlug: 'example-show',
        urlMappings: 'https://jellyfin.example | https://external/', episodeCount: 10,
    }] }));
    const item = { ProviderIds: { Tvdb: 'a&b' } };
    const first = await data.getSonarrSlugs(item);
    assert.deepEqual(plain(first), [{ instanceName: 'TV', instanceUrl: 'https://external',
        titleSlug: 'example-show', episodeFileCount: 0, episodeCount: 10, sizeOnDisk: 0, rootFolderPath: '' }]);
    assert.equal(await data.getSonarrSlugs(item), first);
    assert.deepEqual(calls, ['/arr/series-slugs?tvdbId=a%26b']);
    await JE.arrLinks.createData('new session').getSonarrSlugs(item);
    assert.equal(calls.length, 2);
    await data.getRadarrInstances('a&b');
    assert.equal(calls[2], '/arr/movie-instances?tmdbId=a%26b');
});

test('missing provider IDs never fetch or fabricate matches', async () => {
    const { data, calls } = load();
    assert.equal((await data.getSonarrSlugs({})).length, 0);
    assert.equal((await data.getRadarrInstances('')).length, 0);
    assert.equal(calls.length, 0);
});

test('backend failures remain retryable and toast once until recovery', async () => {
    let failed = true;
    const { data, calls, toasts } = load({}, async () => {
        if (failed) throw new Error('HTTP 503');
        return { matches: [] };
    });
    assert.equal((await data.getRadarrInstances('1')).length, 0);
    await data.getRadarrInstances('1');
    assert.equal(calls.length, 2);
    assert.equal(toasts.length, 1);
    failed = false;
    await data.getRadarrInstances('1');
    failed = true;
    await data.getRadarrInstances('2');
    assert.equal(toasts.length, 2);
});

test('instance errors escape HTML, deduplicate, and can recur after recovery', async () => {
    let errors = [{ instanceName: '<img>', reason: 'bad & "unsafe"' }];
    const { data, toasts } = load({}, async () => ({ matches: [], errors }));
    await data.getRadarrInstances('1');
    await data.getRadarrInstances('2');
    assert.deepEqual(toasts, ['⚠ Radarr instance "&lt;img&gt;" failed: bad &amp; &quot;unsafe&quot;']);
    errors = [];
    await data.getRadarrInstances('3');
    errors = [{ instanceName: '<img>', reason: 'bad & "unsafe"' }];
    await data.getRadarrInstances('4');
    assert.equal(toasts.length, 2);
});

// Minimal DOM for presentation contracts; no browser or network dependency.
function viewFixture(textMode) {
    const elements = [], listeners = [];
    const document = {
        createElement(tagName) {
            const el = { tagName, children: [], style: { setProperty(k, v) { this[k] = v; } },
                setAttribute(k, v) { this[k] = v; }, appendChild(child) { this.children.push(child); },
                addEventListener() {} };
            elements.push(el);
            return el;
        },
        getElementById(id) { return elements.find(el => el.id === id); },
        head: { appendChild() {} }, addEventListener: (...args) => listeners.push(args),
    };
    const JE = { pluginConfig: { ShowArrLinksAsText: textMode }, helpers: { getExternalLinkIconSize: () => 32 },
        cdn: { selfhst: file => `https://cdn.example/${file}` } };
    vm.runInNewContext(source('arr-links-view.js'), { window: { JellyfinEnhanced: JE }, document });
    return { view: JE.arrLinks.createView(), JE, elements, listeners };
}

test('text buttons preserve status badges, tooltip and safe external-link attributes', () => {
    const { view } = viewFixture(true);
    const button = view.createLinkButton('Sonarr', 'https://tv.example', 'arr-link-sonarr', 'partial', '2/8', 'TV\n2/8 episodes');
    assert.equal(button.target, '_blank');
    assert.equal(button.rel, 'noopener noreferrer');
    assert.equal(button.title, 'TV\n2/8 episodes');
    assert.equal(button.className, 'button-link emby-button arr-link arr-link--partial');
    assert.equal(button.textContent, 'Sonarr');
    assert.equal(button.children[0].textContent, '2/8');
});

test('icon mode uses configured icon size and dropdowns keep names as text', () => {
    const { view, JE, listeners, elements } = viewFixture(false);
    const button = view.createLinkButton('Radarr', 'https://movies.example', 'arr-link-radarr');
    assert.equal(button.children[0].src, 'https://cdn.example/svg/radarr-light-hybrid-light.svg');
    assert.equal(button.children[0].style.width, '32px');
    const dropdown = view.createDropdown('Radarr', 'arr-link-radarr', [{ name: '<unsafe>', url: 'https://movies.example', badge: 'Downloaded', size: '1 GB' }]);
    assert.equal(dropdown.children[0].title, 'Radarr (1 instances)');
    const item = dropdown.children[1].children[0];
    assert.equal(item.children[1].textContent, '<unsafe>');
    assert.equal(item.children[1].innerHTML, undefined);
    JE.arrLinks.createView();
    assert.equal(listeners.length, 1, 'outside-click listener remains singleton');
    assert.equal(elements.filter(el => el.id === 'arr-links-styles').length, 1);
});

test('status and byte display retain boundary behavior', () => {
    const { view } = viewFixture(true);
    assert.equal(view.getStatus(0, 0), 'missing');
    assert.equal(view.getStatus(1, 2), 'partial');
    assert.equal(view.getStatus(2, 2), 'complete');
    assert.equal(view.formatBytes(0), '');
    assert.equal(view.formatBytes(1048576), '1 MB');
    assert.equal(view.formatBytes(1073741824), '1.0 GB');
});

function orchestratorFixture({ admin = true, enabled = true } = {}) {
    const registrations = [], timers = [], appended = [];
    let epoch = 1, resolveItem;
    const itemPromise = new Promise(resolve => { resolveItem = resolve; });
    const anchor = { querySelector: () => null, closest: () => null, appendChild: node => appended.push(node) };
    const page = { querySelector: () => anchor, querySelectorAll: () => [] };
    const document = { body: {}, querySelector: () => page, querySelectorAll: () => [],
        contains: () => true, addEventListener() {} };
    const JE = { pluginConfig: { ArrLinksEnabled: enabled },
        session: { getEpoch: () => epoch, isCurrent: e => e === epoch },
        helpers: { isAdmin: () => admin, getItemCached: () => itemPromise,
            createObserver: (name, callback) => {
                const observer = { disconnect() { observer.disconnected = true; } };
                registrations.push({ name, callback, observer }); return observer;
            } },
        arrLinks: { createData: () => ({ sonarrInstances: [], radarrInstances: [], bazarrUrl: 'https://bazarr' }),
            createView: () => ({ createLinkButton: () => ({}) }) },
    };
    const window = { JellyfinEnhanced: JE, location: { hash: '#!/details?id=1' } };
    vm.runInNewContext(source('arr-links.js'), { document, window, URLSearchParams,
        console: { log() {}, error() {} }, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
    return { JE, window, registrations, timers, appended, resolveItem, switchUser: () => { epoch++; } };
}

test('entry point preserves admin gate and retires observer after identity changes', async () => {
    for (const options of [{ admin: false }, { enabled: false }]) {
        const f = orchestratorFixture(options);
        await f.JE.initializeArrLinksScript();
        assert.equal(f.registrations.length, 0);
    }
    const f = orchestratorFixture();
    await f.JE.initializeArrLinksScript();
    assert.equal(f.registrations[0].name, 'arr-links');
    f.switchUser();
    f.registrations[0].callback();
    assert.equal(f.registrations[0].observer.disconnected, true);
    assert.equal(f.timers.length, 0);
});

test('navigation during an item lookup never appends to the old detail page', async () => {
    const f = orchestratorFixture();
    await f.JE.initializeArrLinksScript();
    f.registrations[0].callback();
    f.timers[0]();
    f.window.location.hash = '#!/details?id=2';
    f.resolveItem({ Type: 'Series' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.appended.length, 0);
});
