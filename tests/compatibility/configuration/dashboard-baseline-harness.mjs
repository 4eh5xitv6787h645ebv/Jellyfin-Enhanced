import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

export const snapshot = JSON.parse(await readFile(new URL('./fixtures/dashboard-lifecycle-baseline.json', import.meta.url)));
export const clone = value => JSON.parse(JSON.stringify(value));
export const flush = () => new Promise(resolve => setImmediate(resolve));
export function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

// Minimal DOM/host boundary, deliberately counting real listener registrations rather
// than replacing an existing callback. The fixture holds pre-refactor production code.
export function createDashboardHarness(saved = {}, { scripts = ['read', 'load', 'save'], sources = snapshot.sources } = {}) {
    const elements = new Map();
    const trace = { show: 0, hide: 0, saved: 0, reads: 0, writes: [], alerts: [], posts: [], timers: [], prevented: 0, confirmations: [] };
    function makeElement(id = '') {
        const classes = new Set();
        const el = {
            id, value: '', checked: false, disabled: false, style: {}, dataset: {}, children: [], listeners: {},
            classList: { add: value => classes.add(value), remove: value => classes.delete(value), toggle(value, on) { on ? classes.add(value) : classes.delete(value); }, contains: value => classes.has(value) },
            addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
            removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] || []).filter(item => item !== callback); },
            dispatch(name) { return (this.listeners[name] || []).map(fn => fn.call(this, event)); },
            appendChild(child) { child.parent = this; this.children.push(child); return child; },
            remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
            setAttribute(name, value) { this[name] = value; },
            closest() { return this; }, querySelectorAll() { return []; },
        };
        Object.defineProperty(el, 'textContent', { get() { return this.text || ''; }, set(value) { this.text = value; this.children = []; } });
        return el;
    }
    function element(id) {
        if (!elements.has(id)) elements.set(id, makeElement(id));
        return elements.get(id);
    }
    const saveButtons = [makeElement('save-one'), makeElement('save-two')];
    const event = { preventDefault() { trace.prevented++; } };
    const body = makeElement('body');
    body.classList.add('je-has-customtabs-compat');
    const page = makeElement('page');
    const form = makeElement('form');
    const reset = makeElement('reset');
    const context = createContext({
        URL, console: { warn() {}, error() {}, log() {} },
        pluginId: 'fixture-plugin', _qualityCatRenderOK: false,
        defaultShortcuts: [{ Name: 'Search', Key: '/' }, { Name: 'Mute', Key: 'm' }], shortcutOverrides: [],
        CUSTOM_TAB_MANAGED_ENTRIES: [{ ownedKey: 'FixtureTabJeOwned' }],
        _jeCustomTabOwnedCache: { FixtureTabJeOwned: false },
        document: {
            body, getElementById: element, createElement: () => makeElement(),
            querySelector(selector) {
                if (selector === 'input[name="maintenanceModeUsers"]:checked') return { value: element('mmUsers_select').checked ? 'select' : 'all' };
                assert.match(selector, /^#[\w-]+$/, `Unsupported selector ${selector}`);
                return element(selector.slice(1));
            },
            querySelectorAll(selector) { return selector === '.je-save-dock-btn' ? saveButtons : []; },
        },
        ApiClient: {
            async getPluginConfiguration() { trace.reads++; return clone(saved); },
            async updatePluginConfiguration(id, config) { trace.writes.push(clone(config)); return { saved: true }; },
            async ajax(options) { trace.posts.push(clone(options)); return {}; },
            getUrl: path => path,
        },
        Dashboard: {
            alert(message) { trace.alerts.push(clone(message)); },
            showLoadingMsg() { trace.show++; }, hideLoadingMsg() { trace.hide++; },
            processPluginConfigurationUpdateResult() { trace.hide++; },
            confirm(message, title, callback) { trace.confirmations.push(message); callback(true); },
        },
        confirm: () => true,
        setTimeout(callback, delay) { trace.timers.push({ callback, delay }); }, clearTimeout() {},
        saveArrInstances: () => [], syncBlockedUsersToHiddenInput() {},
        checkInstalledPlugins() {}, renderOverrides() {}, populateAddShortcutDropdown() {},
        loadMaintenanceUsers() {}, populateRegionSelect() {}, loadBlockedUsersList() {},
        loadArrInstances() {}, updateAllDependencies() {}, updateRequestsRequirementsBanner() {},
        jeMarkSaved() { trace.saved++; }, syncAllBannerParents() {},
        syncAllManagedCustomTabs: async () => ({ ok: true, status: 'noop', ownedUpdates: [] }),
        createInstanceCard(type, instance) { return Object.assign(makeElement(), { instance: clone(instance) }); },
        collectInstancesFromDom(selector) {
            const container = element(selector.split(' ')[0].slice(1));
            return { instances: container.children.filter(child => child.instance).map(child => child.instance), incomplete: [] };
        },
        page, form, resetAllUserSettingsBtn: reset,
    });
    for (const script of scripts) runInContext(sources[script], context, { filename: `captured-dashboard/${script}.js` });
    return { context, element, elements, trace, event, saveButtons, body, page, form, reset, async load() { context.loadConfig(); await flush(); }, save: () => context.saveConfig(event) };
}
