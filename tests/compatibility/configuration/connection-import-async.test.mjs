import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { createDashboardHarness, deferred, flush } from './dashboard-baseline-harness.mjs';

const root = new URL('../../../src/', import.meta.url);
const sources = await Promise.all([
    'host/dashboard/lifecycle.js',
    'features/seerr/settings/connections.js',
    'features/seerr/settings/permission-audit.js',
    'features/streaming-availability/settings/connections.js',
    'features/arr/settings/instances.js',
].map(path => readFile(new URL(path, root), 'utf8')));

function harness() {
    const h = createDashboardHarness({}, { scripts: [] });
    h.context.window = { setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, requestAnimationFrame() {}, cancelAnimationFrame() {}, location: { origin: 'https://jellyfin.invalid' } };
    runInContext(sources.join('\n'), h.context);
    const lifecycle = h.context.createDashboardLifecycle();
    const cache = [], alerts = [];
    let dependencies = 0;
    const deps = { lifecycle, beginConnectionTest: () => 73, setConnectionTestResult: (...args) => cache.push(args), jeTestAlert: message => alerts.push(message), connectionErrorMessage: () => 'failed', updateAllDependencies: () => dependencies++, renderServiceStatusDashboard() {}, testInstanceConnection() {} };
    h.element('jellyseerrUrls').value = 'https://seerr.invalid';
    h.element('JellyseerrApiKey').value = 'secret';
    h.element('TMDB_API_KEY').value = 'secret';
    return { ...h, lifecycle, deps, cache, alerts, dependencies: () => dependencies };
}

for (const outcome of ['resolve', 'reject']) {
    test(`Seerr connection ${outcome} after disposal cannot change indicator, cache or dialogs`, async () => {
        const h = harness(), pending = deferred();
        h.context.ApiClient.ajax = () => pending.promise;
        const module = h.context.createSeerrConnections(h.deps);
        module.initialize();
        const operation = h.element('testJellyseerrBtn').dispatch('click')[0];
        module.dispose();
        h.element('jellyseerrStatusIndicator').textContent = 'replacement';
        pending[outcome](outcome === 'resolve' ? { ok: true } : { status: 500 });
        await operation;
        assert.equal(h.element('jellyseerrStatusIndicator').textContent, 'replacement');
        assert.deepEqual(h.cache, []);
        assert.deepEqual(h.alerts, []);
    });
}

test('Seerr stale validation loses to the new test and the current test keeps its cache token', async () => {
    const h = harness(), old = deferred(), current = deferred();
    let requests = 0;
    h.context.ApiClient.ajax = () => ++requests === 1 ? old.promise : current.promise;
    const module = h.context.createSeerrConnections(h.deps);
    module.initialize();
    const button = h.element('testJellyseerrBtn');
    const first = button.dispatch('click')[0], second = button.dispatch('click')[0];
    current.resolve({ ok: true });
    await second;
    old.reject({ status: 401 });
    await first;
    assert.equal(h.element('jellyseerrStatusIndicator').textContent, 'check_circle');
    assert.deepEqual(h.cache, [['seerr', 'ok', 'Connected', 73]]);
    assert.equal(h.alerts.length, 1);
});

test('Seerr scan continues intentional fallback mutation after disposal but suppresses completion UI', async () => {
    const h = harness(), first = deferred();
    h.element('jellyseerrUrls').value += '\nhttps://fallback.invalid';
    const requests = [];
    h.context.ApiClient.ajax = options => { requests.push(options); return requests.length === 1 ? first.promise : Promise.resolve({ ok: true }); };
    const module = h.context.createSeerrConnections(h.deps);
    module.initialize();
    const operation = h.element('triggerSeerrScanNowBtn').dispatch('click')[0];
    module.dispose();
    h.element('triggerSeerrScanNowStatus').textContent = 'replacement';
    first.reject({ status: 500 });
    await operation;
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.type === 'POST'));
    assert.equal(h.element('triggerSeerrScanNowStatus').textContent, 'replacement');
    assert.deepEqual(h.trace.alerts, []);
});

function tmdb(h) {
    const button = h.element('testTmdb');
    button.parentElement = { querySelector: () => h.element('tmdbStatusIndicator') };
    const queryAll = h.context.document.querySelectorAll;
    h.context.document.querySelectorAll = selector => selector === '.testTmdbBtn' ? [button] : queryAll(selector);
    const module = h.context.createStreamingAvailabilityConnections(h.deps);
    module.initialize();
    return { module, click: () => button.listeners.click[0]({ target: button }) };
}

for (const outcome of ['resolve', 'reject']) {
    test(`TMDB ${outcome} after disposal cannot update replacement UI, dependencies, cache or dialog`, async () => {
        const h = harness(), pending = deferred();
        h.context.ApiClient.ajax = () => pending.promise;
        const { module, click } = tmdb(h);
        const operation = click();
        module.dispose();
        h.element('tmdbStatusIndicator').textContent = 'replacement';
        pending[outcome](outcome === 'resolve' ? {} : { status: 401 });
        await operation;
        assert.equal(h.element('tmdbStatusIndicator').textContent, 'replacement');
        assert.equal(h.dependencies(), 0);
        assert.deepEqual(h.cache, []);
        assert.deepEqual(h.alerts, []);
    });
}

test('TMDB current response alone restores buttons and writes the existing cache token', async () => {
    const h = harness(), old = deferred(), current = deferred();
    let requests = 0;
    h.context.ApiClient.ajax = () => ++requests === 1 ? old.promise : current.promise;
    const { click } = tmdb(h);
    const first = click(), second = click();
    old.reject({ status: 401 });
    await first;
    assert.equal(h.element('testTmdb').disabled, true);
    assert.deepEqual(h.cache, []);
    current.resolve({});
    await second;
    assert.equal(h.element('testTmdb').disabled, false);
    assert.equal(h.dependencies(), 1);
    assert.deepEqual(h.cache, [['tmdb', 'ok', 'API key valid', 73]]);
});

for (const outcome of ['resolve', 'reject']) {
    test(`permission audit ${outcome} after disposal cannot repaint the result`, async () => {
        const h = harness(), pending = deferred();
        h.element('btnPermissionAudit').querySelector = () => null;
        h.context.ApiClient.ajax = () => pending.promise;
        const module = h.context.createSeerrPermissionAudit(h.deps);
        module.initialize();
        const operation = h.element('btnPermissionAudit').dispatch('click')[0];
        module.dispose();
        h.element('permissionAuditResult').textContent = 'replacement';
        h.element('btnPermissionAudit').textContent = 'new button';
        pending[outcome](outcome === 'resolve' ? [] : new Error('offline'));
        await operation;
        assert.equal(h.element('permissionAuditResult').textContent, 'replacement');
        assert.equal(h.element('permissionAuditResult').children.length, 0);
        assert.equal(h.element('btnPermissionAudit').textContent, 'new button');
    });
}

test('latest permission audit owns result rendering and button restoration', async () => {
    const h = harness(), old = deferred(), current = deferred();
    h.element('btnPermissionAudit').querySelector = () => null;
    let requests = 0;
    h.context.ApiClient.ajax = () => ++requests === 1 ? old.promise : current.promise;
    const module = h.context.createSeerrPermissionAudit(h.deps);
    module.initialize();
    const button = h.element('btnPermissionAudit');
    const first = button.dispatch('click')[0], second = button.dispatch('click')[0];
    old.reject(new Error('old'));
    await first;
    assert.equal(button.disabled, true);
    assert.equal(h.element('permissionAuditResult').children.length, 0);
    current.resolve([]);
    await second;
    assert.equal(button.disabled, false);
    assert.equal(h.element('permissionAuditResult').children.length, 1);
});

function arr(h) {
    h.element('sonarrSeerrImportPicker').style.display = 'none';
    h.element('radarrSeerrImportPicker').style.display = 'none';
    const module = h.context.createArrInstances(h.deps);
    module.initialize();
    return { module, click: () => h.element('importSonarrFromSeerr').dispatch('click'), picker: h.element('sonarrSeerrImportPicker') };
}

for (const invalidation of ['dispose', 'close', 'rehydrate']) {
    for (const outcome of ['resolve', 'reject']) {
        test(`Arr import ${outcome} after ${invalidation} cannot repopulate the picker`, async () => {
            const h = harness(), pending = deferred();
            h.context.ApiClient.ajax = options => options.url.endsWith('/sonarr') ? pending.promise : Promise.resolve({});
            const { module, click, picker } = arr(h);
            click();
            if (invalidation === 'dispose') module.dispose();
            if (invalidation === 'close') click();
            if (invalidation === 'rehydrate') module.loadArrInstances({ SonarrInstances: '[]', RadarrInstances: '[]' });
            picker.textContent = 'replacement';
            pending[outcome](outcome === 'resolve' ? [] : new Error('offline'));
            await flush();
            assert.equal(picker.textContent, 'replacement');
            assert.equal(picker.children.length, 0);
            assert.equal(h.dependencies(), 0);
        });
    }
}

test('Arr close/reopen gives the new request exclusive ownership of the picker', async () => {
    const h = harness(), old = deferred(), current = deferred();
    let requests = 0;
    h.context.ApiClient.ajax = options => options.url.endsWith('/sonarr') ? (++requests === 1 ? old.promise : current.promise) : Promise.resolve({});
    const { click, picker } = arr(h);
    click(); click(); click();
    old.reject(new Error('stale error'));
    await flush();
    assert.equal(picker.children.at(-1).textContent, 'Fetching instances from Seerr...');
    current.resolve([]);
    await flush();
    assert.equal(picker.children.at(-1).textContent, 'Seerr has no Sonarr instances configured.');
});

test('Seerr disposal while decoding an error prevents another validation URL attempt', async () => {
    const h = harness(), body = deferred();
    h.element('jellyseerrUrls').value += '\nhttps://fallback.invalid';
    let requests = 0;
    h.context.ApiClient.ajax = async () => {
        requests++;
        throw { json() {}, clone: () => ({ json: () => body.promise }) };
    };
    const module = h.context.createSeerrConnections(h.deps);
    module.initialize();
    const operation = h.element('testJellyseerrBtn').dispatch('click')[0];
    await flush();
    module.dispose();
    body.resolve({ message: 'failed' });
    await operation;
    assert.equal(requests, 1);
    assert.deepEqual(h.alerts, []);
});

test('Arr obsolete import and cancel handlers cannot modify the reopened picker or instance cards', async () => {
    const h = harness();
    h.context.ApiClient.ajax = async options => options.url.endsWith('/sonarr') ? [{ name: 'Shows', hostname: 'sonarr.invalid', port: 8989, apiKey: 'key' }] : {};
    const { click, picker } = arr(h);
    click();
    await flush();
    const controls = picker.children.at(-1).children;
    const importOldSelection = controls[0].listeners.click[0];
    const cancelOldPicker = controls[1].listeners.click[0];
    click(); click();
    picker.textContent = 'replacement';
    importOldSelection();
    cancelOldPicker();
    assert.equal(picker.textContent, 'replacement');
    assert.equal(picker.style.display, 'block');
    assert.equal(h.element('sonarrInstancesList').children.length, 0);
    assert.equal(h.dependencies(), 0);
    await flush();
});
