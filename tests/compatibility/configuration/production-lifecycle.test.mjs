import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { createDashboardHarness, clone, deferred, flush } from './dashboard-baseline-harness.mjs';

// Evaluate today's production factories; only Jellyfin/browser boundaries are replaced.
const persistenceSource = await readFile(new URL('../../../src/host/dashboard/persistence.js', import.meta.url), 'utf8');
const lifecycleSource = await readFile(new URL('../../../src/host/dashboard/lifecycle.js', import.meta.url), 'utf8');

function productionHarness(saved = {}) {
    const h = createDashboardHarness(saved, { scripts: [] });
    const timers = new Map();
    const scheduled = [];
    let nextTimer = 0;
    h.context.window = {
        setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); scheduled.push(callback); return id; },
        clearTimeout(id) { timers.delete(id); },
        setInterval() {}, clearInterval() {}, requestAnimationFrame() {}, cancelAnimationFrame() {},
    };
    runInContext(lifecycleSource + '\n' + persistenceSource, h.context);
    const lifecycle = h.context.createDashboardLifecycle();
    const calls = [];
    const loaded = [];
    const ownership = { ManagedOwned: false };
    const hooks = {
        checkInstalledPlugins() { calls.push('plugins'); },
        loadFeatureSettings(config) { calls.push('load'); loaded.push(clone(config)); h.element('featureValue').value = config.Feature; },
        normalizeLoadedSettings() { calls.push('normalize-load'); },
        readFeatureSettings(config) { calls.push('read'); config.Feature = h.element('featureValue').value; },
        normalizeReadSettings() { calls.push('normalize-read'); },
        async runCustomTabsSync() { calls.push('sync'); return { ok: true }; },
        async applyMaintenanceMode() { calls.push('maintenance'); },
    };
    const persistence = h.context.createDashboardPersistence({
        lifecycle, pluginId: 'fixture-plugin',
        ...Object.fromEntries(Object.keys(hooks).map(name => [name, (...args) => hooks[name](...args)])),
        restoreCustomTabOwnership(config) { calls.push('restore-ownership'); ownership.ManagedOwned = config.ManagedOwned === true; },
        applyCustomTabOwnership(config) { calls.push('apply-ownership'); config.ManagedOwned = ownership.ManagedOwned; },
        updateAllDependencies() { calls.push('dependencies'); },
        updateRequestsRequirementsBanner() { calls.push('requirements'); },
        jeMarkSaved() { h.trace.saved++; calls.push('saved'); },
    });
    return {
        ...h, persistence, lifecycle, calls, loaded, ownership, hooks, timers, scheduled,
        load: () => persistence.loadConfig(), save: () => persistence.saveConfig(h.event),
        applyToAll: () => persistence.resetAllUserSettings(),
        runTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
    };
}

// Saving requires a hydrated form. Load first, then discard load-side traces so
// each test observes only its own save.
async function hydratedHarness(saved = {}) {
    const h = productionHarness(saved);
    assert.equal(await h.load(), true);
    h.calls.length = 0;
    h.loaded.length = 0;
    h.trace.reads = 0;
    h.trace.show = 0;
    h.trace.hide = 0;
    h.trace.saved = 0;
    return h;
}

test('production save is refused with an explanation until a load has hydrated the form', async () => {
    const h = productionHarness({ Feature: 'saved' });
    h.element('featureValue').value = 'markup default';
    assert.equal(await h.save(), false);
    assert.equal(await h.persistence.saveBeforeImport(), false);
    assert.equal(await h.applyToAll(), false);
    assert.equal(h.trace.writes.length, 0);
    assert.equal(h.trace.alerts.length, 3);
    assert.ok(h.trace.alerts.every(alert => alert.title === 'Settings not loaded'));
    assert.ok(h.saveButtons.every(button => !button.disabled));
    assert.equal(await h.load(), true);
    h.element('featureValue').value = 'edited';
    await h.save();
    assert.deepEqual(h.trace.writes, [{ Feature: 'edited', ManagedOwned: false }]);
});

test('production failed load keeps saving refused so markup defaults cannot replace saved settings', async () => {
    const h = productionHarness({ Feature: 'saved' });
    h.context.ApiClient.getPluginConfiguration = async () => { throw new Error('offline'); };
    assert.equal(await h.load(), false);
    h.context.ApiClient.getPluginConfiguration = async () => ({ Feature: 'saved' });
    assert.equal(await h.save(), false);
    assert.equal(h.trace.writes.length, 0);
    assert.deepEqual(h.trace.alerts.map(alert => alert.title), ['Load failed', 'Settings not loaded']);
    assert.equal(await h.load(), true);
    await h.save();
    assert.equal(h.trace.writes.length, 1);
});

test('production failed save keeps the hydration baseline and never adopts edits made during the write', async () => {
    const h = productionHarness({ Feature: 'saved' });
    assert.equal(await h.load(), true);
    assert.equal(h.trace.saved, 1, 'hydration takes the baseline before any save can start');
    h.element('featureValue').value = 'edited';
    const write = deferred();
    h.context.ApiClient.updatePluginConfiguration = () => write.promise;
    const saving = h.save();
    await flush();
    assert.equal(h.timers.size, 0, 'starting a write cancels the delayed baseline refresh');
    h.runTimers();
    assert.equal(h.trace.saved, 1);
    write.reject(new Error('write failed'));
    await saving;
    assert.equal(h.trace.saved, 1);
    assert.equal(h.trace.alerts[0].title, 'Save failed');
    h.runTimers();
    assert.equal(h.trace.saved, 1, 'a failed write leaves the edited form dirty against the hydration baseline');
    const quick = productionHarness({ Feature: 'saved' });
    assert.equal(await quick.load(), true);
    quick.element('featureValue').value = 'edited';
    quick.context.ApiClient.updatePluginConfiguration = async () => { throw new Error('write failed'); };
    await quick.save();
    quick.runTimers();
    assert.equal(quick.trace.saved, 1, 'a write that fails inside the refresh window cannot adopt the edit as baseline');
    h.persistence.dispose();
    h.runTimers();
    assert.equal(h.trace.saved, 1, 'disposal drops pending refreshes');
});

test('production apply-to-all refuses before confirming when the form is not hydrated', async () => {
    const h = productionHarness({ Feature: 'saved' });
    assert.equal(await h.applyToAll(), false);
    assert.equal(h.trace.confirmations.length, 0);
    assert.equal(h.trace.writes.length, 0);
    assert.equal(h.trace.alerts[0].title, 'Settings not loaded');
});

test('production load restores fields and ownership before dependency refresh and delayed clean snapshot', async () => {
    const h = productionHarness({ Feature: 'saved value', ManagedOwned: true });
    assert.equal(await h.load(), true);
    assert.deepEqual(h.calls, ['plugins', 'restore-ownership', 'load', 'normalize-load', 'dependencies', 'requirements', 'saved']);
    assert.equal(h.element('featureValue').value, 'saved value');
    assert.equal(h.ownership.ManagedOwned, true);
    assert.equal(h.trace.hide, 1);
    assert.equal(h.trace.saved, 1, 'the hydrated form is the clean baseline immediately');
    h.runTimers();
    assert.equal(h.trace.saved, 2, 'late feature populations refresh the baseline');
});

test('production rejected load recovers the spinner, preserves dirty state and can retry', async () => {
    const h = productionHarness();
    h.context.ApiClient.getPluginConfiguration = async () => { throw new Error('offline'); };
    assert.equal(await h.load(), false);
    assert.equal(h.trace.hide, 1);
    assert.equal(h.trace.alerts[0].title, 'Load failed');
    assert.equal(h.trace.saved, 0);
    assert.equal(h.loaded.length, 0);
    h.context.ApiClient.getPluginConfiguration = async () => ({ Feature: 'retry' });
    assert.equal(await h.load(), true);
    h.runTimers();
    assert.equal(h.element('featureValue').value, 'retry');
    assert.equal(h.trace.saved, 2);
});

test('production older config response cannot overwrite a newer pageshow load', async () => {
    const h = productionHarness();
    const older = deferred(), newer = deferred();
    let reads = 0;
    h.context.ApiClient.getPluginConfiguration = () => ++reads === 1 ? older.promise : newer.promise;
    const a = h.load(), b = h.load();
    newer.resolve({ Feature: 'newest' });
    assert.equal(await b, true);
    older.resolve({ Feature: 'stale' });
    assert.equal(await a, false);
    assert.equal(h.element('featureValue').value, 'newest');
    assert.deepEqual(h.loaded, [{ Feature: 'newest' }]);
    h.runTimers();
    assert.equal(h.trace.saved, 2, 'only the newest load takes baselines');
});

test('production stale load failure cannot hide the current load spinner or alert', async () => {
    const h = productionHarness();
    const older = deferred(), newer = deferred();
    let reads = 0;
    h.context.ApiClient.getPluginConfiguration = () => ++reads === 1 ? older.promise : newer.promise;
    const a = h.load(), b = h.load();
    older.reject(new Error('old request failed'));
    await a;
    assert.equal(h.trace.hide, 0);
    assert.equal(h.trace.alerts.length, 0);
    newer.resolve({ Feature: 'newest' });
    await b;
    assert.equal(h.trace.hide, 1);
});

test('production load resolving after disposal cannot touch a replacement form', async () => {
    const h = productionHarness();
    const fetch = deferred();
    h.context.ApiClient.getPluginConfiguration = () => fetch.promise;
    const loading = h.load();
    h.persistence.dispose();
    h.context.document.querySelector = () => { throw new Error('replacement form must not be accessed'); };
    fetch.resolve({ Feature: 'obsolete' });
    assert.equal(await loading, false);
    assert.equal(h.loaded.length, 0);
    assert.equal(h.trace.saved, 0);
    assert.equal(h.trace.alerts.length, 0);
    assert.equal(h.trace.hide, 1);
});

test('production save reads current server state, preserves unknown settings and applies final normalization', async () => {
    const h = await hydratedHarness({ FutureSetting: { preserved: true }, ManagedOwned: true });
    h.ownership.ManagedOwned = true;
    h.element('featureValue').value = 'edited';
    h.hooks.normalizeReadSettings = config => { config.Normalized = true; };
    await h.save();
    assert.deepEqual(h.trace.writes[0], { FutureSetting: { preserved: true }, ManagedOwned: true, Feature: 'edited', Normalized: true });
    assert.ok(h.calls.indexOf('sync') < h.calls.indexOf('maintenance'));
    assert.equal(h.trace.saved, 1);
    assert.ok(h.saveButtons.every(button => !button.disabled));
});

test('production read/write failures preserve dirty state and release the shared mutation guard for retry', async () => {
    for (const stage of ['read', 'write']) {
        const h = await hydratedHarness();
        if (stage === 'read') h.context.ApiClient.getPluginConfiguration = async () => { throw new Error('read failed'); };
        else h.context.ApiClient.updatePluginConfiguration = async () => { throw new Error('write failed'); };
        await h.save();
        assert.equal(h.trace.saved, 0);
        assert.equal(h.trace.alerts[0].title, 'Save failed');
        assert.ok(h.saveButtons.every(button => !button.disabled));
        h.context.ApiClient.getPluginConfiguration = async () => ({});
        h.context.ApiClient.updatePluginConfiguration = async () => ({});
        await h.save();
        assert.equal(h.trace.saved, 1);
    }
});

test('production normal save and apply-to-all share one guard through Custom Tabs synchronization', async () => {
    for (const firstKind of ['save', 'applyToAll']) {
        const h = await hydratedHarness();
        const syncing = deferred();
        h.hooks.runCustomTabsSync = () => syncing.promise;
        const first = h[firstKind]();
        await flush();
        assert.equal(h.trace.writes.length, 1);
        assert.ok(h.saveButtons.every(button => button.disabled));
        await h.save();
        await h.applyToAll();
        assert.equal(h.trace.writes.length, 1, `${firstKind} must guard both mutation entry points`);
        syncing.resolve({ ok: true });
        await first;
        assert.ok(h.saveButtons.every(button => !button.disabled));
        await h.save();
        assert.equal(h.trace.writes.length, 2, 'completed operations release the guard');
    }
});

test('production apply-to-all preserves operation order and partial Custom Tabs reporting', async () => {
    const h = await hydratedHarness();
    h.hooks.runCustomTabsSync = async () => { h.calls.push('sync'); return { ok: false, detail: 'external update failed' }; };
    h.context.ApiClient.ajax = async options => { h.calls.push('reset'); h.trace.posts.push(clone(options)); };
    await h.applyToAll();
    assert.ok(h.calls.indexOf('saved') < h.calls.indexOf('sync'));
    assert.ok(h.calls.indexOf('sync') < h.calls.indexOf('reset'));
    assert.equal(h.trace.posts[0].url, '/JellyfinEnhanced/reset-all-users-settings');
    assert.match(h.trace.alerts[0].message, /external update failed/);
    assert.equal(h.calls.includes('maintenance'), false, 'apply-to-all retains its own side-effect contract');
});

test('production save starts invalidate pending page loads and skip the delayed baseline refresh', async () => {
    const h = productionHarness({ Feature: 'original' });
    await h.load();
    h.element('featureValue').value = 'edited';
    const write = deferred();
    h.context.ApiClient.updatePluginConfiguration = () => write.promise;
    const saving = h.save();
    await flush();
    assert.equal(h.timers.size, 0, 'starting the write cancels the delayed baseline refresh');
    assert.equal(h.trace.saved, 1);
    assert.equal(await h.load(), false, 'pageshow must not reload while a save is committing');
    write.resolve({});
    await saving;
    assert.equal(h.trace.saved, 2);

    const pendingLoad = deferred();
    h.context.ApiClient.getPluginConfiguration = () => pendingLoad.promise;
    const loading = h.load();
    h.context.ApiClient.getPluginConfiguration = async () => ({ FutureSetting: 'fresh' });
    await h.save();
    pendingLoad.resolve({ Feature: 'stale' });
    assert.equal(await loading, false);
    assert.equal(h.element('featureValue').value, 'edited');
});

test('production committed save completes server side effects after disposal without touching completion UI', async () => {
    const h = await hydratedHarness();
    const write = deferred();
    h.context.ApiClient.updatePluginConfiguration = () => write.promise;
    const saving = h.save();
    await flush();
    h.persistence.dispose();
    const hidesOnDispose = h.trace.hide;
    write.resolve({});
    await saving;
    assert.ok(h.calls.includes('sync'));
    assert.ok(h.calls.includes('maintenance'));
    assert.equal(h.trace.saved, 0);
    assert.equal(h.trace.alerts.length, 0);
    assert.equal(h.trace.hide, hidesOnDispose, 'old completion must not hide another page loading indicator');
});

test('production disposal before a save read finishes prevents a new server mutation', async () => {
    const h = await hydratedHarness();
    const read = deferred();
    h.context.ApiClient.getPluginConfiguration = () => read.promise;
    const saving = h.save();
    h.persistence.dispose();
    read.resolve({});
    await saving;
    assert.equal(h.trace.writes.length, 0);
    assert.equal(h.calls.includes('read'), false);
    assert.equal(h.trace.alerts.length, 0);
});

test('production successful config save remains clean while optional tab synchronization reports a partial failure', async () => {
    const h = await hydratedHarness();
    h.hooks.runCustomTabsSync = async () => ({ ok: false, detail: 'ownership failure' });
    await h.save();
    assert.equal(h.trace.saved, 1);
    assert.equal(h.trace.alerts[0].title, 'Custom Tabs sync issue');
    assert.match(h.trace.alerts[0].message, /ownership failure/);
});

test('production save-before-import reports success while submit and apply-to-all retain their false event contract', async () => {
    const h = await hydratedHarness({ Feature: 'saved' });
    assert.equal(await h.persistence.saveBeforeImport(), true);
    assert.equal(await h.save(), false);
    assert.equal(await h.applyToAll(), false);
    assert.equal(h.trace.writes.length, 3);
});

test('production save-before-import returns false on read/write failure, busy save or disposed page', async () => {
    for (const stage of ['read', 'write']) {
        const h = await hydratedHarness();
        h.context.ApiClient[stage === 'read' ? 'getPluginConfiguration' : 'updatePluginConfiguration'] = async () => { throw new Error(stage); };
        assert.equal(await h.persistence.saveBeforeImport(), false);
    }
    const h = await hydratedHarness(), write = deferred();
    h.context.ApiClient.updatePluginConfiguration = () => write.promise;
    const saving = h.save();
    await flush();
    assert.equal(await h.persistence.saveBeforeImport(), false);
    write.resolve({});
    await saving;
    h.persistence.dispose();
    assert.equal(await h.persistence.saveBeforeImport(), false);
});

test('production save-before-import preserves successful committed transaction result after disposal', async () => {
    const h = await hydratedHarness(), write = deferred();
    h.context.ApiClient.updatePluginConfiguration = () => write.promise;
    const saving = h.persistence.saveBeforeImport();
    await flush();
    h.persistence.dispose();
    write.resolve({});
    assert.equal(await saving, true);
    assert.ok(h.calls.includes('sync'));
    assert.ok(h.calls.includes('maintenance'));
    assert.equal(h.trace.saved, 0);
});

test('production save-before-import considers an optional Custom Tabs warning a successful JE save', async () => {
    const h = await hydratedHarness();
    h.hooks.runCustomTabsSync = async () => ({ ok: false, detail: 'ownership unavailable' });
    assert.equal(await h.persistence.saveBeforeImport(), true);
    assert.equal(h.trace.writes.length, 1);
    assert.equal(h.trace.alerts[0].title, 'Custom Tabs sync issue');
});
