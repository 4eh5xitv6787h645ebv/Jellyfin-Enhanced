'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateManifest, renderBootstrap } = require('../../../../tools/build/build-bootstrap');
const manifest = require('../../../../artifacts/generated/module-manifest.json');
const baselineOrder = require('./baseline-module-order.json');
const preLayoutOrder = require('./pre-layout-module-order.json');
const root = path.resolve(__dirname, '../../../..');
const quietConsole = { log() {}, warn() {}, error() {}, debug() {} };

function factory(name, exportName, globals = {}) {
    const context = vm.createContext({ console: quietConsole, ...globals });
    vm.runInContext(fs.readFileSync(path.join(root, 'src/host/bootstrap', `${name}.js`), 'utf8'), context);
    return context[exportName];
}
const plain = value => JSON.parse(JSON.stringify(value));

// Characterized against the original bootstrap before decomposition. New modules
// may be inserted but every pre-existing script must keep its URL and relative order.
test('all original component URLs retain their exact relative execution order', () => {
    const originals = new Set(baselineOrder);
    assert.deepEqual(manifest.components.map(x => x.path).filter(x => originals.has(x)), baselineOrder);
    assert.equal(new Set(manifest.components.map(x => x.path)).size, manifest.components.length);
});

test('feature ownership retains the entire pre-layout component URL order', () => {
    const historical = new Set(preLayoutOrder);
    assert.deepEqual(manifest.components.map(component => component.path).filter(name => historical.has(name)), preLayoutOrder);
});

test('manifest rejects missing dependencies, reversed order, duplicates and unregistered scripts', () => {
    const good = { components: [{ path: 'a.js' }, { path: 'b.js', dependsOn: ['a.js'] }], standalone: [{ path: 'entry.js', reason: 'Injected' }] };
    assert.doesNotThrow(() => validateManifest(good, ['a.js', 'b.js', 'entry.js']));
    assert.throws(() => validateManifest({ ...good, components: [...good.components].reverse() }, ['a.js', 'b.js', 'entry.js']), /requires a.js/);
    assert.throws(() => validateManifest(good, ['a.js', 'entry.js']), /Missing script: b.js/);
    assert.throws(() => validateManifest(good, ['a.js', 'b.js', 'entry.js', 'forgotten.js']), /Unregistered script: forgotten.js/);
    assert.doesNotThrow(() => validateManifest({ components: [{ path: 'feature-directory/file.js' }], standalone: [] }, ['feature-directory/file.js']));
    assert.doesNotThrow(() => validateManifest({ components: [{ path: 'directory/hyphenated-file.js' }], standalone: [] }, ['directory/hyphenated-file.js']));
    assert.throws(() => validateManifest({ ...good, components: [...good.components, good.components[0]] }, ['a.js', 'b.js', 'entry.js']), /Duplicate component/);
});

test('checked-in bootstrap is the deterministic generated artifact', () => {
    assert.equal(fs.readFileSync(path.join(root, 'artifacts/generated/plugin.js'), 'utf8'), renderBootstrap(manifest));
});

test('script loader retains ordered execution, cache key and nonfatal individual errors', async () => {
    const scripts = [];
    const create = factory('script-loader', 'createScriptLoader', {
        ApiClient: { getUrl: value => `/jellyfin${value}` },
        document: {
            querySelector: () => ({ getAttribute: key => key === 'version' ? '12.8.0.0-timestamp' : null }),
            createElement: () => ({}), head: { appendChild: script => scripts.push(script) }
        }
    });
    const loader = create({ pluginVersion: '12.8.0.0' });
    const completion = loader.loadScripts(['core/a.js', 'feature/b.js'], '/JellyfinEnhanced/js');
    assert.equal(scripts.length, 2);
    assert.ok(scripts.every(script => script.async === false));
    assert.equal(scripts[0].src, '/jellyfin/JellyfinEnhanced/js/core/a.js?v=12.8.0.0-timestamp');
    scripts[1].onerror('network');
    scripts[0].onload();
    const results = plain(await completion);
    assert.deepEqual(results.map(x => x.value.status), ['fulfilled', 'rejected']);
    assert.ok(results.every(x => x.status === 'fulfilled'));
});

test('namespace serialization helpers preserve array values and nested object conventions', () => {
    const JE = factory('namespace', 'createNamespace', { window: {} })();
    assert.deepEqual(plain(JE.toCamelCase({ Settings: { DisplayLanguage: 'en' }, Shortcuts: [{ Key: 'x' }] })), { settings: { displayLanguage: 'en' }, shortcuts: [{ Key: 'x' }] });
    assert.deepEqual(plain(JE.toPascalCase({ settings: { enabled: false }, items: ['a'] })), { Settings: { Enabled: false }, Items: ['a'] });
});

function configurationHarness(ajax) {
    const storage = new Map();
    const events = new Map();
    const timers = [];
    const callbacks = new Map();
    let epoch = 1;
    const JE = factory('namespace', 'createNamespace', { window: {} })();
    JE.currentSettings = {};
    JE.session = { getEpoch: () => epoch, isCurrent: value => value === epoch, onUserChange: (name, fn) => callbacks.set(name, fn) };
    const create = factory('configuration', 'createConfiguration', {
        ApiClient: { ajax, getUrl: url => url },
        document: { addEventListener: (name, fn) => events.set(name, fn), dispatchEvent() {} },
        localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value) },
        setTimeout: fn => timers.push(fn), CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } }
    });
    return { JE, config: create(JE), storage, events, timers, callbacks, switchUser: () => { epoch++; callbacks.forEach(fn => fn()); } };
}

test('private configuration resolving after a user switch is discarded', async () => {
    let resolve;
    const h = configurationHarness(() => new Promise(done => { resolve = done; }));
    h.config.registerSessionIntegration();
    const pending = h.config.loadPrivateConfig();
    h.switchUser();
    resolve({ SonarrUrl: 'private-admin-url' });
    await pending;
    assert.deepEqual(plain(h.JE.pluginConfig), {});
});

test('session reset strips private keys, shortcuts and user data synchronously', async () => {
    const h = configurationHarness(async () => ({ SonarrUrl: 'private-admin-url' }));
    h.JE.pluginConfig = { PublicFlag: true };
    h.JE.state.activeShortcuts = { old: 'shortcut' };
    h.JE.userConfig = { settings: { secret: 'old user' } };
    await h.config.loadPrivateConfig();
    h.config.registerSessionIntegration();
    h.switchUser();
    assert.deepEqual(plain(h.JE.pluginConfig), { PublicFlag: true });
    assert.deepEqual(plain(h.JE.state.activeShortcuts), {});
    assert.deepEqual(plain(h.JE.currentSettings), {});
    assert.deepEqual(plain(h.JE.userConfig.settings), {});
});

test('per-user configuration keeps legacy filenames, casing and independent fetch fallbacks', async () => {
    const requested = [];
    const h = configurationHarness(async ({ url }) => {
        requested.push(url);
        if (url.includes('/settings.json')) return { DisplayLanguage: 'pt-br', Nested: { Flag: true } };
        if (url.includes('/shortcuts.json')) return { Shortcuts: [{ Key: 'a' }] };
        if (url.includes('/bookmark.json')) return { Bookmarks: { Movie: { Position: 123 } } };
        throw new Error('missing file');
    });
    const config = plain(await h.config.fetchUserScopedConfig('user-1'));
    assert.equal(requested.length, 5);
    assert.ok(requested.every(url => url.startsWith('/JellyfinEnhanced/user-settings/user-1/')));
    assert.deepEqual(config, { settings: { displayLanguage: 'pt-br', nested: { flag: true } }, shortcuts: { Shortcuts: [{ Key: 'a' }] }, bookmark: { bookmarks: { movie: { position: 123 } } }, elsewhere: {}, hiddenContent: { items: {}, settings: {} } });
});

test('default language is normalized only when the user has not chosen one', () => {
    const h = configurationHarness(async () => ({}));
    h.JE.currentSettings.displayLanguage = 'pt-br';
    h.config.seedDisplayLanguage('one');
    assert.equal(h.storage.get('one-language'), 'pt-BR');
    h.JE.currentSettings.displayLanguage = 'en';
    h.config.seedDisplayLanguage('one');
    assert.equal(h.storage.get('one-language'), 'pt-BR');
});

test('full bootstrap preserves early assets, configuration sequence and completion contract', async () => {
    const { runBootstrap } = require('../../../../tools/testing/bootstrap-harness.cjs');
    const result = await runBootstrap(renderBootstrap(manifest));
    assert.equal(result.JE.initialized, true);
    assert.deepEqual(result.requests, [
        '/JellyfinEnhanced/public-config',
        '/JellyfinEnhanced/public-config',
        '/JellyfinEnhanced/version',
        '/JellyfinEnhanced/private-config',
        '/Plugins',
        ...['settings', 'shortcuts', 'bookmark', 'elsewhere', 'hidden-content'].map(name => `/JellyfinEnhanced/user-settings/test-user/${name}.json?_=TIME`)
    ]);
    assert.deepEqual(result.initialized, ['splash', 'splash', 'settings', 'shortcuts', 'hide-splash']);
    assert.deepEqual(result.scripts.slice(0, 2).map(x => x.src), [
        '/JellyfinEnhanced/js/others/splashscreen.js?v=12.8.0.0-build',
        '/JellyfinEnhanced/js/enhanced/translations.js?v=12.8.0.0-build'
    ]);
    assert.deepEqual(result.scripts.slice(2).map(x => x.src), manifest.components.map(x => `/JellyfinEnhanced/js/${x.path}?v=12.8.0.0-build`));
    assert.ok(result.scripts.slice(2).every(x => x.async === false));
    assert.equal(result.JE.pluginConfig.PrivateField, 'private');
    assert.ok(result.listeners.has('beforeunload'));
    assert.ok(result.listeners.has('je:user-changed'));
});


test('configuration normalization retains its bootstrap converter binding', async () => {
    const h = configurationHarness(async () => ({ DisplayLanguage: 'en' }));
    h.JE.toCamelCase = () => ({ replaced: true });
    const config = plain(await h.config.fetchUserScopedConfig('one'));
    assert.deepEqual(config.settings, { displayLanguage: 'en' });
});


test('bootstrap waits for host authentication without advancing configuration stages', async () => {
    const { runBootstrap } = require('../../../../tools/testing/bootstrap-harness.cjs');
    const unavailable = await runBootstrap(renderBootstrap(manifest), { noApi: true });
    assert.deepEqual(unavailable.retries, [50, 50, 300]);
    assert.deepEqual(unavailable.scripts, []);
    assert.equal(unavailable.JE.initialized, undefined);
    const loggedOut = await runBootstrap(renderBootstrap(manifest), { loggedOut: true });
    assert.deepEqual(loggedOut.retries, [300]);
    assert.deepEqual(loggedOut.requests, ['/JellyfinEnhanced/public-config']);
    assert.equal(loggedOut.JE.initialized, undefined);
});

test('bootstrap preserves independent configuration and asset failure fallbacks', async t => {
    const { runBootstrap } = require('../../../../tools/testing/bootstrap-harness.cjs');
    for (const endpoint of ['public-config', 'private-config', '/Plugins', 'user-settings', '/version']) {
        await t.test(endpoint, async () => {
            const result = await runBootstrap(renderBootstrap(manifest), { reject: [endpoint] });
            assert.equal(result.JE.initialized, true);
            assert.equal(result.initialized.at(-1), 'hide-splash');
            if (endpoint === '/version') assert.equal(result.JE.pluginVersion, 'unknown');
            if (endpoint === 'private-config') assert.equal(result.JE.pluginConfig.PrivateField, undefined);
        });
    }
    for (const script of ['translations.js', 'core/navigation.js']) {
        await t.test(script, async () => {
            const result = await runBootstrap(renderBootstrap(manifest), { failScript: script });
            assert.equal(result.JE.initialized, true);
            assert.equal(result.scripts.length, manifest.components.length + 2);
            if (script === 'translations.js') assert.deepEqual(plain(result.JE.translations), {});
        });
    }
});

test('enabled login image retains its dedicated early public asset path', async () => {
    const { runBootstrap } = require('../../../../tools/testing/bootstrap-harness.cjs');
    const result = await runBootstrap(renderBootstrap(manifest), { config: { EnableLoginImage: true } });
    const loginIndex = result.scripts.findIndex(script => script.src === '/JellyfinEnhanced/js/extras/login-image.js?v=12.8.0.0-build');
    const firstComponent = result.scripts.findIndex(script => script.src.includes('/core/navigation.js'));
    assert.ok(loginIndex >= 0 && loginIndex < firstComponent);
});
