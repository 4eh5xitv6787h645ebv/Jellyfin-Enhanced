'use strict';
const vm = require('node:vm');

// Browser boundary fixture: script tags complete asynchronously in insertion
// order, while the host endpoints and feature initializers remain observable.
async function runBootstrap(source, options = {}) {
    const requests = [];
    const scripts = [];
    const initialized = [];
    const retries = [];
    const storage = new Map();
    const listeners = new Map();
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {}, debug() {} },
        setTimeout: (fn, delay) => { retries.push(delay); return 1; },
        requestAnimationFrame: fn => fn(),
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key),
            key: index => [...storage.keys()][index],
            get length() { return storage.size; }
        }
    });
    context.window = context;
    context.addEventListener = (name, fn) => listeners.set(name, fn);
    context.ApiClient = {
        getCurrentUserId: () => options.loggedOut ? null : 'test-user',
        getUrl: value => value,
        ajax: async ({ url }) => {
            requests.push(url.replace(/\?_=.*/, '?_=TIME'));
            if (options.reject?.some(part => url.includes(part))) throw new Error('fixture failure');
            if (url === '/JellyfinEnhanced/public-config') return options.config || {};
            if (url === '/Plugins') return [];
            if (url.endsWith('/version')) return '12.8.0.0';
            if (url.endsWith('/private-config')) return { PrivateField: 'private' };
            return {};
        }
    };
    context.document = {
        querySelector: () => ({ getAttribute: key => key === 'version' ? '12.8.0.0-build' : null }),
        createElement: tag => ({ tag }), getElementById: () => null,
        addEventListener: (name, fn) => listeners.set(name, fn),
        dispatchEvent() {},
        head: { appendChild(script) {
            scripts.push({ src: script.src, async: script.async });
            const JE = context.JellyfinEnhanced;
            if (script.src.includes('/translations.js') && !options.failScript?.includes('translations.js')) JE.loadTranslations = async () => ({ welcome: 'Welcome' });
            if (script.src.includes('/splashscreen.js')) {
                JE.initializeSplashScreen = () => initialized.push('splash');
                JE.hideSplashScreen = () => initialized.push('hide-splash');
            }
            if (script.src.includes('/core/session.js')) JE.session = { onUserChange() {}, getEpoch: () => 0, isCurrent: () => true };
            if (script.src.includes('/enhanced/config.js')) {
                JE.loadSettings = () => { initialized.push('settings'); return {}; };
                JE.initializeShortcuts = () => initialized.push('shortcuts');
            }
            queueMicrotask(() => options.failScript && script.src.includes(options.failScript) ? script.onerror?.('fixture failure') : script.onload?.());
        } }
    };
    if (options.noApi) delete context.ApiClient;
    vm.runInContext(source, context, { filename: 'plugin.js' });
    await new Promise(resolve => setImmediate(resolve));
    return { requests, scripts, initialized, JE: context.JellyfinEnhanced, listeners, retries };
}
module.exports = { runBootstrap };
