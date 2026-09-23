import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { createDashboardHarness, deferred, clone } from './dashboard-baseline-harness.mjs';

const root = new URL('../../../src/', import.meta.url);
const lifecycleSource = await readFile(new URL('host/dashboard/lifecycle.js', root), 'utf8');
const streamingSource = await readFile(new URL('features/streaming-availability/settings/settings.js', root), 'utf8');
const analyticsSource = await readFile(new URL('features/analytics/settings/settings.js', root), 'utf8');
const shortcutsSource = await readFile(new URL('features/user-settings/settings/settings.js', root), 'utf8');

function harness() {
    const h = createDashboardHarness({}, { scripts: [] });
    const scheduled = new Map();
    let nextId = 0;
    const schedule = (callback) => {
        const id = ++nextId;
        scheduled.set(id, callback);
        return id;
    };
    h.context.window = {
        setTimeout: schedule,
        clearTimeout: (id) => scheduled.delete(id),
        setInterval: schedule,
        clearInterval: (id) => scheduled.delete(id),
        requestAnimationFrame: schedule,
        cancelAnimationFrame: (id) => scheduled.delete(id),
    };
    h.context.MutationObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.connected = true;
        }
        disconnect() {
            this.connected = false;
        }
    };
    h.context.jeCdnUrl = (path) => path;
    h.context.fetch = async () => ({ ok: false });
    runInContext(lifecycleSource, h.context);
    return { ...h, scheduled, scope: () => h.context.createDashboardLifecycle() };
}

test('module scopes replace a refreshed binding, preserve independent handlers, and dispose every owned resource', () => {
    const h = harness(),
        scope = h.scope(),
        target = h.element('field');
    let calls = [];
    scope.listen(target, 'input', () => calls.push('old'), undefined, 'mirror');
    scope.listen(target, 'input', () => calls.push('other'), undefined, 'validation');
    scope.listen(target, 'input', () => calls.push('new'), undefined, 'mirror');
    target.dispatch('input');
    assert.deepEqual(calls, ['other', 'new']);
    scope.setTimeout(() => calls.push('timer'), 100);
    scope.setInterval(() => calls.push('poll'), 100);
    scope.requestAnimationFrame(() => calls.push('frame'));
    const observer = scope.createObserver(() => calls.push('observer'));
    assert.equal(h.scheduled.size, 3);
    scope.dispose();
    scope.dispose();
    assert.equal(scope.disposed, true);
    assert.equal(target.listeners.input.length, 0);
    assert.equal(h.scheduled.size, 0);
    assert.equal(observer.connected, false);
    observer.callback();
    scope.listen(target, 'input', () => calls.push('late'));
    scope.setTimeout(() => calls.push('late-timer'));
    assert.deepEqual(calls, ['other', 'new']);
    assert.equal(h.scheduled.size, 0);
});

test('repeated feature hydration keeps one TMDB mirror in each direction and disposal removes both', () => {
    const h = harness();
    runInContext(streamingSource, h.context);
    const module = h.context.createStreamingAvailabilitySettings({ lifecycle: h.scope(), readFieldValue: () => '' });
    for (let i = 0; i < 3; i++) module.load({ TMDB_API_KEY: `key-${i}` });
    const main = h.element('TMDB_API_KEY'),
        mirror = h.element('jellyseerr_TMDB_API_KEY');
    assert.equal(main.listeners.input.length, 1);
    assert.equal(mirror.listeners.input.length, 1);
    main.value = 'edited';
    main.dispatch('input');
    assert.equal(mirror.value, 'edited');
    mirror.value = 'edited-again';
    mirror.dispatch('input');
    assert.equal(main.value, 'edited-again');
    module.dispose();
    assert.equal(main.listeners.input.length, 0);
    assert.equal(mirror.listeners.input.length, 0);
});

test('analytics handlers use the latest loaded consent and old preview responses cannot paint after hydration/disposal', async () => {
    const h = harness();
    runInContext(analyticsSource, h.context);
    const module = h.context.createAnalyticsSettings({ lifecycle: h.scope(), formatDateTimeDMY: () => '' });
    const first = deferred(),
        second = deferred();
    let calls = 0;
    h.context.ApiClient.ajax = () => (++calls === 1 ? first.promise : second.promise);
    module.load({ AnalyticsHasBeenConfigured: false });
    const preview = h.element('analyticsPreviewBtn');
    const oldPreview = preview.dispatch('click')[0];
    module.load({ AnalyticsHasBeenConfigured: true, AnalyticsShareFeatureFlags: false });
    const master = h.element('analyticsEnabled');
    master.checked = true;
    master.dispatch('change');
    assert.equal(master.listeners.change.length, 1);
    assert.equal(
        h.element('analyticsShareFeatureFlags').checked,
        false,
        'loaded opt-out must not be overwritten by an old first-enable closure',
    );
    first.resolve({ Payload: { stale: true } });
    await oldPreview;
    assert.equal(h.element('analyticsPreviewJson').textContent, '');
    const pending = preview.dispatch('click')[0];
    module.dispose();
    second.resolve({ Payload: { disposed: true } });
    await pending;
    assert.equal(h.element('analyticsPreviewJson').textContent, '');
    assert.equal(preview.listeners.click.length, 0);
});

test('shortcut editor preserves future and disabled entries, merges fresh unknown entries, and honors explicit removal', () => {
    const h = harness();
    runInContext(shortcutsSource, h.context);
    const module = h.context.createUserSettingsSettings({ lifecycle: h.scope() });
    const unknown = { Name: 'ExtensionShortcut', Key: 'Shift+Z', Label: 'Extension', Extra: { future: true } };
    module.load({ Shortcuts: [{ Name: 'OpenSearch', Key: '' }, unknown] });
    const fresh = { Shortcuts: [{ Name: 'NewerServerShortcut', Key: 'F8' }] };
    module.read(fresh);
    assert.equal(fresh.Shortcuts.find((item) => item.Name === 'OpenSearch').Key, '');
    assert.deepEqual(clone(fresh.Shortcuts.find((item) => item.Name === unknown.Name)), unknown);
    assert.equal(fresh.Shortcuts.find((item) => item.Name === 'NewerServerShortcut').Key, 'F8');
    const row = h.element('shortcut-list-container').children[1];
    row.children[2].children[0].dispatch('click');
    const afterRemoval = { Shortcuts: [unknown] };
    module.read(afterRemoval);
    assert.equal(
        afterRemoval.Shortcuts.some((item) => item.Name === unknown.Name),
        false,
    );
});

test('native event-signal ownership disposes bindings without retaining editor targets in a cleanup list', () => {
    const h = harness(),
        windowEvents = new EventTarget();
    h.context.AbortController = AbortController;
    h.context.window.addEventListener = (...args) => windowEvents.addEventListener(...args);
    h.context.window.removeEventListener = (...args) => windowEvents.removeEventListener(...args);
    const scope = h.scope(),
        target = new EventTarget();
    let calls = 0;
    scope.listen(target, 'change', () => (calls += 100), undefined, 'value');
    scope.listen(target, 'change', () => calls++, undefined, 'value');
    target.dispatchEvent(new Event('change'));
    assert.equal(calls, 1);
    scope.dispose();
    target.dispatchEvent(new Event('change'));
    assert.equal(calls, 1);
});


test('two unkeyed handlers remain independent and capture options survive event-signal ownership', () => {
    const h = harness(), windowEvents = new EventTarget();
    h.context.AbortController = AbortController;
    h.context.window.addEventListener = (...args) => windowEvents.addEventListener(...args);
    h.context.window.removeEventListener = (...args) => windowEvents.removeEventListener(...args);
    const scope = h.scope();
    const options = [];
    const target = new EventTarget();
    const nativeAdd = target.addEventListener.bind(target);
    target.addEventListener = (type, callback, supplied) => { options.push(supplied); nativeAdd(type, callback, supplied); };
    const calls = [];
    scope.listen(target, 'change', () => calls.push('first'), true);
    scope.listen(target, 'change', () => calls.push('second'));
    assert.equal(options[0].capture, true);
    target.dispatchEvent(new Event('change'));
    assert.deepEqual(calls, ['first', 'second']);
    scope.dispose();
    target.dispatchEvent(new Event('change'));
    assert.deepEqual(calls, ['first', 'second']);
});

const timingSource = await readFile(new URL('features/user-settings/settings/timing-previews.js', root), 'utf8');
const descriptionsSource = await readFile(new URL('host/dashboard/descriptions.js', root), 'utf8');

function extendDom(h) {
    function decorate(el) {
        const append = el.appendChild;
        el.appendChild = function (child) { child.parentNode = this; return append.call(this, child); };
        el.removeChild = function (child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; };
        el.getAttribute = name => el[name] ?? null;
        el.querySelector = selector => selector === '.je-banner-trigger' ? el.children.find(child => child.className === 'je-banner-trigger') || null : null;
        return el;
    }
    const create = h.context.document.createElement;
    h.context.document.createElement = () => decorate(create());
    h.context.document.createTextNode = text => ({ textContent: text });
    const docEvents = h.element('document-events');
    h.context.document.addEventListener = docEvents.addEventListener.bind(docEvents);
    h.context.document.removeEventListener = docEvents.removeEventListener.bind(docEvents);
    decorate(h.body);
    return decorate;
}

test('timing previews can initialize again on the same DOM and disposal removes temporary overlays and toasts', () => {
    const h = harness();
    extendDom(h);
    runInContext(timingSource, h.context);
    const panel = h.element('jeTestShortcutsPanel'), toast = h.element('jeTestToast');
    panel.dataset.jeWired = '1'; toast.dataset.jeWired = '1'; // retained legacy DOM
    h.element('HelpPanelAutocloseDelay').value = '10000';
    h.element('ToastDuration').value = '5000';
    const first = h.context.createUserSettingsTimingPreviews({ lifecycle: h.scope() });
    first.initialize(); first.initialize();
    assert.equal(panel.listeners.click.length, 1);
    panel.dispatch('click'); toast.dispatch('click');
    assert.equal(h.body.children.length, 2);
    first.dispose();
    assert.equal(h.body.children.length, 0);
    assert.equal(h.scheduled.size, 0);
    const second = h.context.createUserSettingsTimingPreviews({ lifecycle: h.scope() });
    second.initialize();
    assert.equal(panel.listeners.click.length, 1);
    panel.dispatch('click');
    assert.equal(h.body.children.length, 1);
    second.dispose();
    assert.equal(h.body.children.length, 0);
});

test('description banners reuse their trigger and rebind once when the same dashboard DOM is initialized again', () => {
    const h = harness(), decorate = extendDom(h);
    const anchor = decorate(h.element('anchor')), banner = decorate(h.element('banner'));
    banner['data-banner-anchor'] = '#anchor';
    banner['data-banner-no-gate'] = 'true';
    anchor.dataset.jeBannerWired = '1'; // retained legacy marker must not suppress the new owner
    decorate(h.element('toggleDescriptionsBtn'));
    h.context.document.querySelectorAll = selector => selector.includes('.je-info-banner') ? [banner] : [];
    h.context.localStorage = { getItem: () => null, setItem() {} };
    runInContext(descriptionsSource, h.context);
    const first = h.context.createDashboardDescriptions({ lifecycle: h.scope() });
    first.initialize();
    const trigger = anchor.children[0];
    trigger.listeners.click[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    first.dispose();
    const second = h.context.createDashboardDescriptions({ lifecycle: h.scope() });
    second.initialize();
    assert.equal(anchor.children.length, 1);
    assert.equal(anchor.children[0], trigger);
    assert.equal(trigger.listeners.click.length, 1);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    trigger.listeners.click[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    second.dispose();
});

const itemDetailsSource = await readFile(new URL('features/item-details/settings/settings.js', root), 'utf8');
const arrSettingsSource = await readFile(new URL('features/arr/settings/settings.js', root), 'utf8');
const dependencyEngineSource = await readFile(new URL('host/dashboard/dependencies.js', root), 'utf8');

test('collected Metadata Icons policy disables and explains Arr text mode while composing with the Arr parent gate', () => {
    const h = harness(), decorate = extendDom(h);
    const create = h.context.document.createElement;
    function find(node, selector) {
        for (const child of node.children) {
            if (selector === 'span' && child.tagName === 'SPAN') return child;
            if (selector.startsWith('.') && (child.className || '').split(' ').includes(selector.slice(1))) return child;
            const nested = find(child, selector);
            if (nested) return nested;
        }
        return null;
    }
    h.context.document.createElement = tag => {
        const el = create();
        el.tagName = tag.toUpperCase();
        el.querySelector = selector => find(el, selector);
        el.removeAttribute = name => delete el[name];
        return el;
    };
    const labels = new Map();
    const originalGet = h.context.document.getElementById;
    h.context.document.getElementById = id => {
        const control = decorate(originalGet(id));
        control.removeAttribute = name => delete control[name];
        if (!labels.has(id)) {
            const label = h.context.document.createElement('label');
            label.appendChild(h.context.document.createElement('span'));
            labels.set(id, label);
        }
        control.closest = () => labels.get(id);
        return control;
    };
    runInContext(itemDetailsSource + arrSettingsSource + dependencyEngineSource, h.context);
    const itemDetails = h.context.createItemDetailsSettings();
    const arr = h.context.createArrSettings({});
    const policy = itemDetails.getDependencies().individual;
    assert.ok(policy.some(rule => rule.id === 'showArrLinksAsText'), 'the host collection must contain the Arr metadata policy');
    const rules = {
        sections: [], customTabsHints: [], individual: policy,
        parents: arr.getDependencies().parents.filter(rule => rule.parent === 'arrLinksEnabled'),
    };
    const engine = h.context.createDashboardDependencies({
        lifecycle: h.scope(), rules, isMetadataIconsEnabled: itemDetails.isMetadataIconsEnabled,
        getPluginStatus: () => ({}), invalidatePersistedTest() {}, renderOptionalPluginsDashboard() {},
        renderFeaturesDashboard() {}, renderServiceStatusDashboard() {}, updateClientTagCacheControlsVisibility() {},
        syncAllBannerParents() {},
    });
    const metadata = h.element('metadataIconsEnabled'), arrEnabled = h.element('arrLinksEnabled'), textMode = h.element('showArrLinksAsText');
    arrEnabled.checked = true; textMode.checked = true; metadata.checked = true;
    engine.updateAllDependencies();
    assert.equal(textMode.disabled, true);
    assert.equal(textMode.checked, true, 'dependency presentation must not silently rewrite the form value');
    assert.equal(labels.get('showArrLinksAsText').title, 'Forced to icon mode while Metadata Icons (Druidblack) is enabled');
    assert.equal(labels.get('showArrLinksAsText').querySelector('.dep-required-icon').textContent, 'block');
    assert.equal(labels.get('showArrLinksAsText').querySelector('.dep-hint-text').textContent, 'Forced to icon mode while Metadata Icons (Druidblack) is enabled');

    metadata.checked = false;
    engine.updateAllDependencies();
    assert.equal(textMode.disabled, false);
    assert.equal(labels.get('showArrLinksAsText').querySelector('.dep-required-icon'), null);

    metadata.checked = true; arrEnabled.checked = false;
    engine.updateAllDependencies();
    metadata.checked = false;
    engine.updateAllDependencies();
    assert.equal(textMode.disabled, true, 'clearing metadata policy must retain the unmet Arr parent gate');
    arrEnabled.checked = true;
    engine.updateAllDependencies();
    assert.equal(textMode.disabled, false);
    assert.equal(textMode.checked, true);
});
