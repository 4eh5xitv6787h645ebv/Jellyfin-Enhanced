import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const dashboard = new URL('../../../src/host/dashboard/', import.meta.url);
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const settle = () => new Promise(resolve => setImmediate(resolve));

function environment(extra = {}) {
    const mutations = [], logs = [], requests = [];
    const classes = new Set();
    const retry = new EventTarget();
    const body = {
        classList: {
            toggle(name, enabled) { mutations.push([name, enabled]); enabled ? classes.add(name) : classes.delete(name); },
            remove(...names) { mutations.push(['remove', ...names]); names.forEach(name => classes.delete(name)); },
            contains: name => classes.has(name),
        },
    };
    const context = vm.createContext({
        window: { setTimeout, clearTimeout, setInterval, clearInterval },
        console: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
        document: { body, getElementById: id => id === 'je-probe-retry-btn' ? retry : null, querySelector: () => null },
        ApiClient: { getUrl: value => value, ajax(options) { const request = deferred(); requests.push({ ...request, options }); return request.promise; } },
        ...extra,
    });
    vm.runInContext(readFileSync(new URL('lifecycle.js', dashboard), 'utf8'), context);
    const lifecycle = context.createDashboardLifecycle();
    function load(file, factory, dependencies) {
        vm.runInContext(readFileSync(new URL(file, dashboard), 'utf8'), context, { filename: fileURLToPath(new URL(file, dashboard)) });
        return context[factory]({ lifecycle, ...dependencies });
    }
    return { context, lifecycle, load, requests, mutations, logs, classes, retry };
}

function plugins(env) {
    const notifications = [];
    const module = env.load('plugins.js', 'createDashboardPlugins', {
        setProbeWarning: (...args) => notifications.push(['warning', ...args]),
        checkCustomTabsConfigCompat: () => notifications.push(['compat']),
        checkWhatsNew: () => notifications.push(['whats-new']),
        updateAllDependencies: () => notifications.push(['dependencies']),
        updateStatusDashboard: () => notifications.push(['status']),
        getCustomTabsCompatibility: () => null,
        resetCustomTabsCompatibility: () => notifications.push(['reset']),
    });
    return { module, notifications };
}

test('plugin probes apply only the newest result and detach retry listeners on disposal', async () => {
    const env = environment();
    const { module, notifications } = plugins(env);
    module.checkInstalledPlugins();
    module.checkInstalledPlugins();
    env.requests[1].resolve([{ Name: 'Plugin Pages', Status: 'Active' }]);
    await settle();
    assert.equal(module.getPluginStatus().hasPluginPages, true);
    const updates = notifications.length, mutations = env.mutations.length;
    env.requests[0].reject(new Error('older failure'));
    await settle();
    assert.equal(module.getPluginStatus().hasPluginPages, true);
    assert.equal(notifications.length, updates);
    assert.equal(env.mutations.length, mutations);
    assert.equal(env.logs.length, 0);

    env.retry.dispatchEvent(new Event('click'));
    assert.equal(env.requests.length, 3, 'one current retry handler');
    env.lifecycle.dispose();
    env.requests[2].resolve([{ Name: 'Custom Tabs', Status: 'Active' }]);
    await settle();
    assert.equal(env.mutations.length, mutations);
    env.retry.dispatchEvent(new Event('click'));
    module.checkInstalledPlugins();
    assert.equal(env.requests.length, 3, 'disposed page starts no probes');

    const replacement = environment({ document: env.context.document });
    const next = plugins(replacement).module;
    next.checkInstalledPlugins();
    env.retry.dispatchEvent(new Event('click'));
    assert.equal(replacement.requests.length, 2, 'same DOM button binds to the new page instance');
    assert.equal(env.requests.length, 3);
    replacement.lifecycle.dispose();
});

function customTabs(env) {
    let renders = 0;
    const keys = ['Bookmarks', 'HiddenContent', 'Downloads', 'Calendar', 'Seerr', 'Activity'];
    const dependencies = { pluginId: 'je-plugin', renderOptionalPluginsDashboard: () => { renders++; } };
    keys.forEach(key => {
        dependencies[`get${key}CustomTabManagedEntries`] = () => [{
            title: key, html: `<${key}>`, masterKey: key + 'Enabled', parentKey: key + 'Tabs',
            autoKey: key + 'Auto', ownedKey: key + 'Owned',
        }];
    });
    return { module: env.load('custom-tabs.js', 'createDashboardCustomTabs', dependencies), renders: () => renders };
}

test('Custom Tabs compatibility ignores stale, reset and disposed probes', async () => {
    const env = environment();
    const { module, renders } = customTabs(env);
    module.checkCustomTabsConfigCompat();
    module.checkCustomTabsConfigCompat();
    env.requests[1].resolve({ Tabs: [] });
    await settle();
    assert.equal(module.getCustomTabsCompatibility(), 'ok');
    env.requests[0].reject(new Error('stale failure'));
    await settle();
    assert.equal(module.getCustomTabsCompatibility(), 'ok');
    assert.equal(renders(), 1);
    module.checkCustomTabsConfigCompat();
    module.resetCustomTabsCompatibility();
    env.requests[2].resolve({ Tabs: [] });
    await settle();
    assert.equal(module.getCustomTabsCompatibility(), null);
    assert.equal(renders(), 1);
    module.checkCustomTabsConfigCompat();
    env.lifecycle.dispose();
    env.requests[3].reject(new Error('disposed failure'));
    await settle();
    assert.equal(renders(), 1);
    assert.equal(env.logs.length, 0);
});

test('Custom Tabs writes and ownership persistence finish after page disposal', async () => {
    const env = environment();
    const { module } = customTabs(env);
    env.classes.add('je-has-customtabs-compat');
    const writes = [];
    env.context.ApiClient.getPluginConfiguration = async () => ({ unrelatedSetting: 'keep' });
    env.context.ApiClient.updatePluginConfiguration = async (id, config) => { writes.push({ id, config }); };
    const saved = { BookmarksEnabled: true, BookmarksTabs: true, BookmarksAuto: true };
    module.restoreCustomTabOwnership(saved);
    const operation = module.runCustomTabsSync(saved);
    env.lifecycle.dispose();
    env.requests[0].resolve({ Tabs: [] });
    await settle();
    assert.equal(env.requests[1].options.type, 'POST');
    assert.deepEqual(JSON.parse(env.requests[1].options.data), { Tabs: [{ Title: 'Bookmarks', ContentHtml: '<Bookmarks>' }] });
    env.requests[1].resolve();
    const result = await operation;
    assert.equal(result.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].config.BookmarksOwned, true);
    assert.equal(writes[0].config.unrelatedSetting, 'keep');
    const reloaded = {};
    module.applyCustomTabOwnership(reloaded);
    assert.equal(reloaded.BookmarksOwned, true, 'confirmed write still updates its private ownership cache');
});

function whatsNewDocument() {
    const nodes = [], banners = [];
    function element(tag) {
        const node = Object.assign(new EventTarget(), {
            tag, children: [], style: {}, setAttribute() {},
            appendChild(child) { this.children.push(child); },
            remove() { const index = banners.indexOf(this); if (index >= 0) banners.splice(index, 1); },
        });
        nodes.push(node);
        return node;
    }
    const overview = { insertBefore(node) { banners.push(node); } };
    return {
        nodes, banners,
        document: {
            getElementById: id => id === 'overview' ? overview : id === 'je-whats-new-banner' ? banners[0] : null,
            querySelectorAll: () => [], createElement: element, createTextNode: text => ({ textContent: text }),
        },
    };
}

test('What’s New ignores stale/disposed reads and cannot resurrect a dismissed banner', async () => {
    const dom = whatsNewDocument();
    const env = environment({ document: dom.document });
    const module = env.load('whats-new.js', 'createDashboardWhatsNew', { jeJumpToTab() {} });
    module.checkWhatsNew();
    module.checkWhatsNew();
    env.requests[1].resolve({ pluginVersion: '2', newSettings: {} });
    await settle();
    assert.equal(dom.banners.length, 1);
    assert.ok(dom.nodes.some(node => node.textContent === 'No new settings in v2.'));
    const count = dom.nodes.length;
    env.requests[0].resolve({ pluginVersion: '1', newSettings: {} });
    await settle();
    assert.equal(dom.nodes.length, count);
    module.checkWhatsNew();
    dom.nodes.find(node => node.className === 'je-whats-new-close').dispatchEvent(new Event('click'));
    assert.equal(env.requests[3].options.type, 'POST', 'dismiss mutation still starts');
    assert.equal(dom.banners.length, 0);
    env.requests[2].resolve({ pluginVersion: '2', newSettings: {} });
    await settle();
    assert.equal(dom.banners.length, 0);
    module.checkWhatsNew();
    env.lifecycle.dispose();
    env.requests[4].resolve({ pluginVersion: '3', newSettings: {} });
    await settle();
    assert.equal(dom.nodes.length, count);
});

test('clipboard completion cannot update a newer copy or launch fallback after disposal', async () => {
    const copies = [], timeouts = [];
    const label = { textContent: 'Copy' };
    const button = Object.assign(new EventTarget(), {
        style: {}, getAttribute: () => '<html>', querySelector: () => label,
    });
    const env = environment({
        document: { querySelectorAll: () => [button], createElement() { assert.fail('stale fallback touched the document'); } },
        navigator: { clipboard: { writeText() { const pending = deferred(); copies.push(pending); return pending.promise; } } },
        window: { setTimeout(callback) { timeouts.push(callback); return timeouts.length; }, clearTimeout() {} },
    });
    const module = env.load('clipboard.js', 'createDashboardClipboard');
    module.initialize();
    button.dispatchEvent(new Event('click'));
    button.dispatchEvent(new Event('click'));
    copies[0].reject(new Error('older failure'));
    copies[1].resolve();
    await settle();
    assert.equal(label.textContent, 'Copied!');
    assert.equal(env.logs.length, 0);
    button.dispatchEvent(new Event('click'));
    timeouts[0]();
    assert.equal(label.textContent, 'Copied!', 'old reset timer cannot alter the newer copy state');
    env.lifecycle.dispose();
    copies[2].reject(new Error('disposed failure'));
    await settle();
    assert.equal(env.logs.length, 0);
    assert.equal(label.textContent, 'Copied!');
});
