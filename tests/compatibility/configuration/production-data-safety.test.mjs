import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { createDashboardHarness, clone, deferred, flush } from './dashboard-baseline-harness.mjs';

const customTabsSource = await readFile(new URL('../../../src/host/dashboard/custom-tabs.js', import.meta.url), 'utf8');
const arrSource = await readFile(new URL('../../../src/features/arr/settings/instances.js', import.meta.url), 'utf8');
const lifecycleSource = await readFile(new URL('../../../src/host/dashboard/lifecycle.js', import.meta.url), 'utf8');

function customTabsHarness(saved = {}) {
    const h = createDashboardHarness(saved, { scripts: [] });
    runInContext(customTabsSource, h.context);
    const deps = { lifecycle: { disposed: false }, pluginId: 'fixture-plugin', renderOptionalPluginsDashboard() {} };
    const entries = ['Bookmarks', 'HiddenContent', 'Downloads', 'Calendar', 'Seerr', 'Activity'].map(name => {
        const entry = { masterKey: name + 'Enabled', parentKey: name + 'Tab', autoKey: name + 'Auto', ownedKey: name + 'Owned', title: name, html: '<div>' + name + '</div>' };
        deps['get' + name + 'CustomTabManagedEntries'] = () => [entry];
        return entry;
    });
    const tabs = h.context.createDashboardCustomTabs(deps);
    tabs.restoreCustomTabOwnership(saved);
    let config = { Tabs: [], ExtraCustomTabsField: 'keep' };
    const posts = [];
    h.context.ApiClient.ajax = async options => {
        if (options.type === 'GET') return clone(config);
        const next = JSON.parse(options.data);
        posts.push(next);
        config = next;
    };
    return { ...h, tabs, entries, posts, setTabs(value) { config = value; }, ownership() { const result = {}; tabs.applyCustomTabOwnership(result); return result; } };
}

function enable(entry) { return { [entry.masterKey]: true, [entry.parentKey]: true, [entry.autoKey]: true }; }

test('production Custom Tabs ownership merges a fresh server copy and commits only after confirmation', async () => {
    const h = customTabsHarness({ BookmarksOwned: false, FutureField: 'concurrent value' });
    const write = deferred();
    let payload;
    h.context.ApiClient.updatePluginConfiguration = (id, config) => { payload = clone(config); return write.promise; };
    const operation = h.tabs.runCustomTabsSync({ ...enable(h.entries[0]), FutureField: 'stale form' });
    await flush();
    assert.equal(h.posts.length, 1);
    assert.equal(payload.FutureField, 'concurrent value');
    assert.equal(payload.BookmarksOwned, true);
    assert.equal(h.ownership().BookmarksOwned, false);
    write.resolve({});
    assert.equal((await operation).ok, true);
    assert.equal(h.ownership().BookmarksOwned, true);
});

test('production Custom Tabs failed ownership write rolls back cache and reports recovery instructions', async () => {
    const h = customTabsHarness({ BookmarksOwned: false });
    h.context.ApiClient.updatePluginConfiguration = async () => { throw new Error('ownership write rejected'); };
    const result = await h.tabs.runCustomTabsSync(enable(h.entries[0]));
    assert.equal(result.status, 'partial');
    assert.equal(result.ok, false);
    assert.equal(h.ownership().BookmarksOwned, false);
    assert.equal(h.trace.reads, 2);
    assert.match(result.detail, /delete the JE-managed entry/);
});

test('production Custom Tabs preserves administrator entries and only removes entries JE owns', async () => {
    const h = customTabsHarness();
    const managed = { Title: 'Administrator title', ContentHtml: h.entries[0].html };
    const unrelated = { Title: 'Other tab', ContentHtml: '<p>other</p>' };
    h.setTabs({ Tabs: [managed, unrelated], FutureField: 7 });
    const noop = await h.tabs.runCustomTabsSync({ BookmarksOwned: false });
    assert.equal(noop.status, 'noop');
    assert.equal(h.posts.length, 0);
    h.tabs.restoreCustomTabOwnership({ BookmarksOwned: true });
    assert.equal((await h.tabs.runCustomTabsSync({ BookmarksOwned: true })).ok, true);
    assert.equal(h.posts.length, 1);
    assert.deepEqual(h.posts[0], { Tabs: [unrelated], FutureField: 7 });
    assert.equal(h.ownership().BookmarksOwned, false);
});

test('production Custom Tabs never records ownership after a rejected Custom Tabs update', async () => {
    const h = customTabsHarness();
    h.context.ApiClient.ajax = async options => {
        if (options.type === 'GET') return { Tabs: [] };
        throw new Error('Custom Tabs rejected POST');
    };
    const result = await h.tabs.runCustomTabsSync(enable(h.entries[0]));
    assert.equal(result.ok, false);
    assert.deepEqual(clone(result.ownedUpdates), []);
    assert.equal(h.trace.writes.length, 0);
    assert.equal(h.ownership().BookmarksOwned, false);
});

test('production Custom Tabs rejects unfamiliar schemas without modifying either plugin', async () => {
    const h = customTabsHarness();
    h.setTabs({ Tabs: [{ Unexpected: true }] });
    const result = await h.tabs.runCustomTabsSync(enable(h.entries[0]));
    assert.equal(result.ok, false);
    assert.equal(h.posts.length, 0);
    assert.equal(h.trace.writes.length, 0);
});

function arrHarness() {
    const h = createDashboardHarness({}, { scripts: [] });
    h.context.window = { setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, requestAnimationFrame() {}, cancelAnimationFrame() {} };
    // Provide only the selectors used by real card creation/serialization. The
    // production parser, editor, field collection and lifecycle run unchanged.
    const createElement = h.context.document.createElement;
    function descendants(el) { return el.children.flatMap(child => [child, ...descendants(child)]); }
    function matches(el, selector) {
        return selector.startsWith('.') ? (el.className || '').split(/\s+/).includes(selector.slice(1)) : el.tagName === selector;
    }
    function enhance(el, tagName) {
        el.tagName = tagName;
        el.querySelectorAll = selector => descendants(el).filter(child => selector.split(/,\s*/).some(part => matches(child, part)));
        el.querySelector = selector => el.querySelectorAll(selector)[0] || null;
        el.removeAttribute = name => { if (name === 'disabled') el.disabled = false; else delete el[name]; };
        el.setAttribute = (name, value) => {
            if (name === 'style') el.style.cssText = value;
            else if (name === 'disabled') el.disabled = true;
            else el[name] = value;
        };
        return el;
    }
    h.context.document.createElement = tag => enhance(createElement(), tag);
    const queryAll = h.context.document.querySelectorAll;
    h.context.document.querySelectorAll = selector => {
        const match = /^#(sonarrInstancesList|radarrInstancesList) (.+)$/.exec(selector);
        return match ? enhance(h.element(match[1]), 'div').querySelectorAll(match[2]) : queryAll(selector);
    };
    runInContext(lifecycleSource + '\n' + arrSource, h.context);
    const lifecycle = h.context.createDashboardLifecycle();
    const arr = h.context.createArrInstances({ lifecycle, updateAllDependencies() {}, renderServiceStatusDashboard() {}, testInstanceConnection() {} });
    return { ...h, arr, lifecycle };
}

test('production Arr preserves malformed and non-array JSON plus legacy credentials until confirmed reset', () => {
    for (const bad of ['{broken-json', '{"not":"an array"}']) {
        const h = arrHarness();
        const saved = { SonarrInstances: bad, SonarrUrl: 'https://legacy.invalid', SonarrApiKey: 'secret', SonarrUrlMappings: '/old=/new', RadarrInstances: '[]' };
        h.arr.loadArrInstances(saved);
        const list = h.element('sonarrInstancesList');
        assert.equal(list.children.length, 1);
        assert.equal(list.children[0].className, 'arr-corrupt-banner');
        const next = clone(saved);
        h.arr.saveArrInstances(next);
        for (const key of Object.keys(saved).filter(key => key.startsWith('Sonarr'))) assert.equal(next[key], saved[key]);
        const reset = list.children[0].children.find(child => child.type === 'button');
        h.context.Dashboard.confirm = (message, title, callback) => callback(false);
        reset.dispatch('click');
        h.arr.saveArrInstances(next);
        assert.equal(next.SonarrInstances, bad);
        h.context.Dashboard.confirm = (message, title, callback) => callback(true);
        reset.dispatch('click');
        h.arr.saveArrInstances(next);
        assert.equal(next.SonarrInstances, '[]');
        assert.equal(next.SonarrUrl, '');
        assert.equal(next.SonarrApiKey, '');
        assert.equal(next.SonarrUrlMappings, '');
    }
});

test('production Arr migrates a valid empty list through real cards and preserves legacy mappings', () => {
    const h = arrHarness();
    const config = { SonarrInstances: '[]', SonarrUrl: 'https://legacy.invalid', SonarrApiKey: 'secret', SonarrUrlMappings: '/a=/b', RadarrInstances: '[]' };
    h.arr.loadArrInstances(config);
    h.arr.saveArrInstances(config);
    assert.deepEqual(JSON.parse(config.SonarrInstances), [{ Name: 'Sonarr', Url: 'https://legacy.invalid', ApiKey: 'secret', UrlMappings: '/a=/b', Enabled: true }]);
    assert.equal(config.SonarrUrlMappings, '/a=/b');
});

test('production Arr retains disabled instances and reports incomplete cards without dropping stored credentials', () => {
    const h = arrHarness();
    const disabled = { Name: 'Archive', Url: 'https://archive.invalid', ApiKey: 'secret', UrlMappings: '/a=/b', Enabled: false };
    const config = { SonarrInstances: JSON.stringify([disabled, { Name: 'Incomplete', Url: 'https://new.invalid', ApiKey: '' }]), RadarrInstances: '[]' };
    h.arr.loadArrInstances(config);
    const warnings = h.arr.saveArrInstances(config);
    assert.deepEqual(JSON.parse(config.SonarrInstances), [disabled]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Incomplete.*no API key/);
});
