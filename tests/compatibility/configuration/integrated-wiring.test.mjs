import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { createDashboardHarness, deferred, flush } from './dashboard-baseline-harness.mjs';

const root = new URL('../../../src/', import.meta.url);
const paths = JSON.parse(await readFile(new URL('host/dashboard/scripts.json', root), 'utf8'));
const sources = await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')));
const sourceByPath = Object.fromEntries(paths.map((path, index) => [path, sources[index]]));

// Execute the real composition root, coordinator, persistence and lifecycle.
// Feature views are spies here so the test observes wiring/order independently
// of the focused suites which exercise their actual field and network behavior.
function harness() {
    const h = createDashboardHarness({}, { scripts: [] });
    h.context.window = { setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, requestAnimationFrame() {}, cancelAnimationFrame() {} };
    const calls = [], dependencies = {}, modules = {};
    for (let i = 0; i < paths.length; i++) {
        if (paths[i] === 'host/dashboard/initialize.js') continue;
        const name = /^function (create\w+)\(/m.exec(sources[i])[1];
        h.context[name] = deps => {
            dependencies[name] = deps;
            const module = new Proxy({}, { get(target, method) {
                if (method === 'pluginId') return 'fixture-plugin';
                if (method === 'form') return h.form;
                return (...args) => {
                    calls.push([name, method, ...args]);
                    if (method === 'getDependencies') return {};
                    if (method === 'runCustomTabsSync') return { ok: true };
                    return undefined;
                };
            } });
            modules[name] = module;
            return module;
        };
    }
    for (const name of ['lifecycle', 'settings-coordinator', 'persistence']) {
        runInContext(sourceByPath['host/dashboard/' + name + '.js'], h.context);
    }
    const host = runInContext(sourceByPath['host/dashboard/initialize.js'], h.context);
    return { ...h, host, calls, dependencies, modules };
}

const features = ['UserSettings', 'Maintenance', 'Appearance', 'StreamingAvailability', 'Playback', 'Navigation', 'ItemDetails', 'HiddenContent', 'Tags', 'Reviews', 'Ratings', 'Seerr', 'Bookmarks', 'Arr', 'Calendar', 'Activity', 'ActiveStreams', 'Analytics', 'Downloads', 'SpoilerGuard'];

test('composition runs every feature in the agreed order, then normalizes before dependencies or serialization', async () => {
    const h = harness();
    h.calls.length = 0;
    await h.host.load();
    assert.deepEqual(h.calls.filter(call => call[1] === 'load').map(call => call[0]), features.map(feature => 'create' + feature + 'Settings'));
    const index = method => h.calls.findIndex(call => call[1] === method);
    assert.ok(index('restoreCustomTabOwnership') < index('load'));
    assert.ok(index('normalizeLoadedSettings') > h.calls.findLastIndex(call => call[1] === 'load'));
    assert.ok(index('updateAllDependencies') > index('normalizeLoadedSettings'));
    h.calls.length = 0;
    await h.host.save(h.event);
    assert.deepEqual(h.calls.filter(call => call[1] === 'read').map(call => call[0]), features.map(feature => 'create' + feature + 'Settings'));
    assert.ok(index('normalizeReadSettings') > h.calls.findLastIndex(call => call[1] === 'read'));
    assert.ok(index('applyCustomTabOwnership') > index('normalizeReadSettings'));
    assert.equal(h.trace.writes.length, 1);
});

test('composition gives Seerr imports a transaction result and shell submits the false event result', async () => {
    const h = harness();
    await h.host.load();
    h.trace.writes.length = 0;
    assert.equal(await h.dependencies.createSeerrUsers.saveBeforeImport(), true);
    assert.equal(await h.dependencies.createDashboardShell.saveConfig(h.event), false);
    h.context.ApiClient.updatePluginConfiguration = async () => { throw new Error('write failed'); };
    assert.equal(await h.dependencies.createSeerrUsers.saveBeforeImport(), false);
    assert.equal(h.trace.writes.length, 2);
});

test('composition disposes pending persistence UI as well as listeners when the page is replaced', async () => {
    const h = harness(), pending = deferred();
    h.context.ApiClient.getPluginConfiguration = () => pending.promise;
    const operation = h.host.load();
    await flush();
    assert.equal(h.trace.show, 1);
    h.host.dispose();
    assert.equal(h.trace.hide, 1, 'host cleanup must invoke persistence.dispose to release its loading indicator');
    pending.resolve({});
    await operation;
    assert.equal(h.calls.some(call => call[1] === 'load'), false);
});

test('old load completion after reentry cannot hide the replacement loading indicator', async () => {
    const h = harness(), older = deferred(), newer = deferred();
    let reads = 0;
    h.context.ApiClient.getPluginConfiguration = () => ++reads === 1 ? older.promise : newer.promise;
    const oldLoad = h.host.load();
    const replacement = h.context.initializeEnhancedDashboard();
    assert.equal(h.trace.hide, 1, 'replacement releases the previous loading indicator');
    const newLoad = replacement.load();
    assert.equal(h.trace.show, 2);
    older.resolve({ Old: true });
    await oldLoad;
    assert.equal(h.trace.hide, 1, 'old completion does not own the new loading indicator');
    newer.resolve({ New: true });
    await newLoad;
    assert.equal(h.trace.hide, 2);
});

test('pending save reentry restores owned button state and old completion cannot enable new save controls', async () => {
    const h = harness(), older = deferred(), newer = deferred();
    h.saveButtons[1].disabled = true; // Disabled by a separate prerequisite before either save.
    let writes = 0;
    h.context.ApiClient.updatePluginConfiguration = () => ++writes === 1 ? older.promise : newer.promise;
    await h.host.load();
    const oldSave = h.host.save(h.event);
    await flush();
    assert.ok(h.saveButtons.every(button => button.disabled));
    const replacement = h.context.initializeEnhancedDashboard();
    assert.equal(h.saveButtons[0].disabled, false);
    assert.equal(h.saveButtons[1].disabled, true, 'preexisting disabled state survives disposal');
    await replacement.load();
    const newSave = replacement.save(h.event);
    await flush();
    assert.ok(h.saveButtons.every(button => button.disabled));
    const hides = h.trace.hide;
    older.resolve({});
    await oldSave;
    assert.ok(h.saveButtons.every(button => button.disabled), 'old write completion cannot unlock the current save');
    assert.equal(h.trace.hide, hides);
    newer.resolve({});
    await newSave;
    assert.equal(h.saveButtons[0].disabled, false);
    assert.equal(h.saveButtons[1].disabled, true);
});
