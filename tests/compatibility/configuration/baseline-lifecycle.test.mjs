import assert from 'node:assert/strict';
import test from 'node:test';
import { createDashboardHarness, clone, deferred, flush } from './dashboard-baseline-harness.mjs';

// These explicitly labelled baseline defects describe the captured pre-refactor page;
// they are not requirements for a replacement dashboard to retain the defects.
test('baseline defect: rejected initial configuration load has no recovery handler', () => {
    const h = createDashboardHarness();
    let rejectionHandler;
    h.context.ApiClient.getPluginConfiguration = () => ({ then(success, failure) { rejectionHandler = failure; return {}; } });
    assert.equal(h.context.loadConfig(), undefined);
    assert.equal(rejectionHandler, undefined, 'a rejected real Promise is unhandled by baseline loadConfig');
    assert.equal(h.trace.show, 1);
    assert.equal(h.trace.hide, 0);
    assert.equal(h.trace.alerts.length, 0);
    assert.equal(h.trace.saved, 0);
});

test('failed config read or write leaves the form dirty, releases save lock and enables retry', async () => {
    for (const stage of ['read', 'write']) {
        const h = createDashboardHarness();
        h.context.buildConfigFromForm = async () => {
            if (stage === 'read') throw new Error('read failed');
            return { Feature: true };
        };
        h.context.ApiClient.updatePluginConfiguration = async () => { throw new Error('write failed'); };
        await h.save();
        assert.equal(h.context._jeSaveInFlight, false);
        assert.ok(h.saveButtons.every(button => !button.disabled));
        assert.equal(h.trace.saved, 0);
        assert.equal(h.trace.hide, 1);
        assert.equal(h.trace.alerts[0].title, 'Save failed');
        h.context.buildConfigFromForm = async () => ({ Feature: true });
        h.context.ApiClient.updatePluginConfiguration = async () => ({});
        await h.save();
        assert.equal(h.trace.saved, 1, 'a failed save must not permanently block later saves');
    }
});

test('normal saves stay serialized until Custom Tabs synchronization completes', async () => {
    const h = createDashboardHarness();
    const syncing = deferred();
    let reads = 0;
    h.context.buildConfigFromForm = async () => { reads++; return { Feature: true }; };
    h.context.runCustomTabsSync = () => syncing.promise;
    const first = h.save();
    await flush();
    assert.equal(reads, 1);
    assert.ok(h.saveButtons.every(button => button.disabled));
    await h.save();
    assert.equal(reads, 1);
    assert.equal(h.trace.writes.length, 1);
    assert.equal(h.trace.saved, 0);
    syncing.resolve({ ok: true });
    await first;
    assert.equal(h.trace.saved, 1);
    assert.ok(h.saveButtons.every(button => !button.disabled));
});

test('baseline defect: apply-to-all-users bypasses the normal-save concurrency guard', async () => {
    const h = createDashboardHarness();
    const syncing = deferred();
    h.context.buildConfigFromForm = async () => ({ Feature: true });
    h.context.runCustomTabsSync = () => syncing.promise;
    const normalSave = h.save();
    await flush();
    const applyToAll = h.context.resetAllUserSettings();
    await flush();
    assert.equal(h.context._jeSaveInFlight, true);
    assert.equal(h.trace.writes.length, 2, 'baseline permits both mutation workflows to run concurrently');
    syncing.resolve({ ok: true });
    await Promise.all([normalSave, applyToAll]);
    assert.ok(h.trace.posts.some(request => request.url.endsWith('/reset-all-users-settings')));
});

test('saved JE settings still mark clean while a partial Custom Tabs sync is surfaced', async () => {
    const h = createDashboardHarness();
    h.context.buildConfigFromForm = async () => ({ Feature: true });
    h.context.runCustomTabsSync = async () => ({ ok: false, status: 'partial', detail: 'ownership could not be persisted' });
    await h.save();
    assert.equal(h.trace.writes.length, 1);
    assert.equal(h.trace.saved, 1);
    assert.equal(h.trace.alerts[0].title, 'Custom Tabs sync issue');
    assert.match(h.trace.alerts[0].message, /ownership could not be persisted/);
});

test('baseline defect: repeated pageshow reloads add duplicate field listeners', async () => {
    const h = createDashboardHarness({ TMDB_API_KEY: 'loaded-key' }, { scripts: ['read', 'load', 'save', 'bindings'] });
    h.page.dispatch('pageshow');
    await flush();
    h.page.dispatch('pageshow');
    await flush();
    assert.equal(h.page.listeners.pageshow.length, 1);
    assert.equal(h.form.listeners.submit.length, 1);
    assert.equal(h.element('TMDB_API_KEY').listeners.input.length, 2);
    assert.equal(h.element('analyticsEnabled').listeners.change.length, 2);
    assert.equal(h.trace.hide, 2);
    assert.equal(h.trace.timers.filter(timer => timer.delay === 500).length, 2);
});

test('disabled shortcut overrides survive loading and saving', async () => {
    const h = createDashboardHarness({ Shortcuts: [{ Name: 'Search', Key: '' }, { Name: 'Mute', Key: 'm' }] });
    await h.load();
    assert.deepEqual(clone(h.context.shortcutOverrides), [{ Name: 'Search', Key: '' }]);
    const saved = await h.context.buildConfigFromForm();
    assert.equal(saved.Shortcuts.find(item => item.Name === 'Search').Key, '');
});

test('baseline defect: shortcut overrides absent from the default list are dropped on save', async () => {
    const h = createDashboardHarness({ Shortcuts: [{ Name: 'ExtensionShortcut', Key: 'x' }] });
    await h.load();
    assert.equal(h.context.shortcutOverrides[0].Name, 'ExtensionShortcut');
    const saved = await h.context.buildConfigFromForm();
    assert.equal(saved.Shortcuts.some(item => item.Name === 'ExtensionShortcut'), false);
});

test('unreadable Arr JSON and legacy credentials survive until an explicit confirmed reset', () => {
    const h = createDashboardHarness({}, { scripts: ['arr'] });
    const saved = { SonarrInstances: '{broken-json', SonarrUrl: 'https://legacy.invalid', SonarrApiKey: 'legacy-key', SonarrUrlMappings: '/old=/new', RadarrInstances: '[]' };
    h.context.loadArrInstances(saved);
    assert.equal(h.context._arrParseOK.sonarr, false);
    const sonarr = h.element('sonarrInstancesList');
    assert.equal(sonarr.children.filter(child => child.instance).length, 0, 'corrupt JSON must not trigger legacy migration');
    const next = clone(saved);
    h.context.saveArrInstances(next);
    for (const key of ['SonarrInstances', 'SonarrUrl', 'SonarrApiKey', 'SonarrUrlMappings']) assert.equal(next[key], saved[key]);
    const resetButton = sonarr.children[0].children.find(child => child.type === 'button');
    h.context.Dashboard.confirm = (message, title, callback) => callback(false);
    resetButton.dispatch('click');
    assert.equal(h.context._arrParseOK.sonarr, false);
    h.context.Dashboard.confirm = (message, title, callback) => callback(true);
    resetButton.dispatch('click');
    h.context.saveArrInstances(next);
    assert.equal(next.SonarrInstances, '[]');
    assert.equal(next.SonarrUrl, '');
    assert.equal(next.SonarrApiKey, '');
});

test('valid empty Arr lists migrate legacy instances and retain mapping fields', () => {
    const h = createDashboardHarness({}, { scripts: ['arr'] });
    const config = { SonarrInstances: '[]', SonarrUrl: 'https://legacy.invalid', SonarrApiKey: 'key', SonarrUrlMappings: '/a=/b', RadarrInstances: '[]' };
    h.context.loadArrInstances(config);
    h.context.saveArrInstances(config);
    assert.deepEqual(JSON.parse(config.SonarrInstances), [{ Name: 'Sonarr', Url: 'https://legacy.invalid', ApiKey: 'key', UrlMappings: '/a=/b' }]);
});

test('owned-tab flags merge into a fresh server config and commit cache only after confirmed write', async () => {
    const h = createDashboardHarness({ Feature: 'concurrent admin value', FixtureTabJeOwned: false });
    const write = deferred();
    let payload;
    h.context.syncAllManagedCustomTabs = async () => ({ ok: true, ownedUpdates: [{ ownedKey: 'FixtureTabJeOwned', value: true }] });
    h.context.ApiClient.updatePluginConfiguration = (id, config) => { payload = clone(config); return write.promise; };
    const operation = h.context.runCustomTabsSync({ Feature: 'stale form value' });
    await flush();
    assert.equal(payload.Feature, 'concurrent admin value');
    assert.equal(payload.FixtureTabJeOwned, true);
    assert.equal(h.context._jeCustomTabOwnedCache.FixtureTabJeOwned, false);
    write.resolve({});
    assert.equal((await operation).ok, true);
    assert.equal(h.context._jeCustomTabOwnedCache.FixtureTabJeOwned, true);
});

test('failed owned-tab persistence rolls cached ownership back to server truth and reports partial success', async () => {
    const h = createDashboardHarness({ FixtureTabJeOwned: false, FutureSetting: 'preserved' });
    h.context._jeCustomTabOwnedCache.FixtureTabJeOwned = true;
    h.context.syncAllManagedCustomTabs = async () => ({ ok: true, ownedUpdates: [{ ownedKey: 'FixtureTabJeOwned', value: false }] });
    h.context.ApiClient.updatePluginConfiguration = async () => { throw new Error('ownership write failed'); };
    const result = await h.context.runCustomTabsSync({});
    assert.equal(result.ok, false);
    assert.equal(result.status, 'partial');
    assert.equal(h.context._jeCustomTabOwnedCache.FixtureTabJeOwned, false);
    assert.equal(h.trace.reads, 2, 'one fresh merge read and one rollback read');
    assert.match(result.detail, /delete the JE-managed entry/);
});

test('Custom Tabs keeps matching administrator-owned entries and never stamps ownership after failed POST', async () => {
    const h = createDashboardHarness({}, { scripts: ['customTabs', 'save'] });
    const entry = h.context.CUSTOM_TAB_MANAGED_ENTRIES[0];
    const existing = { Title: 'Admin title', ContentHtml: entry.html };
    const writes = [];
    h.context.ApiClient.ajax = async options => {
        if (options.type === 'GET') return { Tabs: [clone(existing)], FutureSetting: 7 };
        writes.push(JSON.parse(options.data));
    };
    const result = await h.context.syncAllManagedCustomTabs({ [entry.ownedKey]: false });
    assert.equal(result.status, 'noop');
    assert.equal(writes.length, 0);
    const removed = await h.context.syncAllManagedCustomTabs({ [entry.ownedKey]: true });
    assert.equal(removed.ok, true);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].Tabs, []);
    assert.equal(writes[0].FutureSetting, 7, 'managed removal preserves unrelated Custom Tabs configuration');
    h.context.ApiClient.ajax = async options => {
        if (options.type === 'GET') return { Tabs: [] };
        throw new Error('Custom Tabs rejected update');
    };
    const failed = await h.context.syncAllManagedCustomTabs({ [entry.masterKey]: true, [entry.parentKey]: true, [entry.autoKey]: true });
    assert.equal(failed.ok, false);
    assert.deepEqual(clone(failed.ownedUpdates), []);
});
