// Small DOM and request boundaries for exercising the real discovery controllers.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directory = path.resolve(__dirname, '../../src/features/seerr/client/discovery');

class Element {
    constructor(className = '') {
        this.className = className;
        this.children = [];
        this.attributes = {};
        this.style = {};
        this.events = new Map();
        this.classList = {
            contains: name => this.className.split(' ').includes(name),
            add: name => { this.className += ` ${name}`; },
            remove: name => { this.className = this.className.split(' ').filter(c => c !== name).join(' '); }
        };
    }
    get childNodes() { return this.children; }
    get firstChild() { return this.children[0]; }
    get firstElementChild() { return this.children[0]; }
    get childElementCount() { return this.children.length; }
    get isConnected() { return this.root || Boolean(this.parentElement?.isConnected); }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] || null; }
    appendChild(child) {
        if (child.fragment) {
            for (const card of [...child.children]) this.appendChild(card);
            child.children.length = 0;
        } else {
            child.remove();
            child.parentElement = this;
            this.children.push(child);
        }
        return child;
    }
    remove() {
        if (this.parentElement) this.parentElement.removeChild(this);
    }
    removeChild(child) {
        this.children = this.children.filter(c => c !== child);
        child.parentElement = null;
    }
    matches(selector) {
        const classes = selector.match(/\.[\w-]+/g) || [];
        return classes.every(c => c === '.hide' && selector.includes(':not(.hide)')
            ? !this.classList.contains('hide') : this.classList.contains(c.slice(1)));
    }
    querySelectorAll(selector) {
        const result = [];
        for (const child of this.children) {
            if (child.matches(selector)) result.push(child);
            result.push(...child.querySelectorAll(selector));
        }
        return result;
    }
    querySelector(selector) {
        const space = selector.indexOf(' ');
        if (space !== -1) return this.querySelector(selector.slice(0, space))?.querySelector(selector.slice(space + 1)) || null;
        return this.querySelectorAll(selector)[0] || null;
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    contains(child) { return this === child || this.children.some(c => c.contains(child)); }
    addEventListener(type, handler) { this.events.set(type, handler); }
    after(element) { this.parentElement?.appendChild(element); }
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function createHarness({ mode = 'dual-feed', fetch, items = [], pageSize = 2, resolveFeeds, renderOneShot, baseline } = {}) {
    const root = new Element();
    root.root = true;
    const page = root.appendChild(new Element('page'));
    const listSection = page.appendChild(new Element('verticalSection'));
    const list = listSection.appendChild(new Element('itemsContainer'));
    const head = new Element();
    const document = {
        head, readyState: 'complete',
        createElement: () => new Element(),
        getElementById: () => null,
        querySelector: selector => root.querySelector(selector),
        querySelectorAll: selector => root.querySelectorAll(selector),
        addEventListener: () => {}
    };
    const windowEvents = new Map();
    const JE = {
        pluginConfig: {},
        session: { onUserChange: (_key, fn) => { JE.changeUser = fn; } },
        jellyseerrUI: { releasePosters: () => {} },
        seamlessScroll: {
            cardsNeeded: (_container, hint, fallback) => hint?.cards || fallback,
            createDeduplicator() {
                const seen = new Set();
                const key = item => `${item.mediaType}:${item.id}`;
                return {
                    add: item => seen.add(key(item)), clear: () => seen.clear(),
                    filter: values => values.filter(item => {
                        if (seen.has(key(item))) return false;
                        seen.add(key(item));
                        return true;
                    })
                };
            }
        },
        core: {
            lifecycle: { register: () => ({ onTeardown: fn => { JE.teardown = fn; }, teardownOn: () => {} }) },
            navigation: { onNavigate: () => {}, onViewPage: () => {} }
        }
    };
    const window = { JellyfinEnhanced: JE, location: { hash: '#!/list?genreId=1' },
        addEventListener: (type, fn) => windowEvents.set(type, fn) };
    const context = vm.createContext({ window, document, HTMLElement: Element, URLSearchParams,
        AbortController, DOMException, setTimeout, clearTimeout,
        requestAnimationFrame: () => {}, console: { debug() {}, error() {} } });
    const load = file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    load(path.join(directory, 'discovery-filter-utils.js'));
    let controls, scroll;
    const calls = [];
    const filter = JE.discoveryFilter;
    filter.createSectionHeader = (_title, _key, _show, onFilter, onSort) => {
        controls = { onFilter, onSort };
        return new Element('jellyseerr-discovery-header');
    };
    filter.createCardsFragment = values => {
        const fragment = new Element();
        fragment.fragment = true;
        for (const value of values) {
            if (value.hidden) continue;
            const card = fragment.appendChild(new Element('card'));
            card.item = value;
        }
        return fragment;
    };
    filter.waitForPageReady = async (_signal, options) => {
        JE.pageOptions = options;
        return mode === 'dual-feed' ? list : page;
    };
    filter.fetchWithManagedRequest = async (url, key, { signal }) => {
        const parsed = new URL(url, 'https://test.invalid');
        const call = { kind: parsed.pathname.split('/')[1], page: Number(parsed.searchParams.get('page')),
            sort: parsed.searchParams.get('sortBy'), key, signal };
        calls.push(call);
        return fetch ? fetch(call) : { results: [{ id: call.page, mediaType: call.kind }], totalPages: 3 };
    };
    filter.setupInfiniteScroll = (_state, _selector, loadMore, more, loading) => {
        scroll = { loadMore, more, loading };
    };
    filter.cleanupScrollObserver = () => {};
    if (baseline) load(baseline);
    else for (const name of ['discovery-page-host', 'discovery-client-pager', 'discovery-dual-feed', 'discovery-base']) load(path.join(directory, `${name}.js`));
    const spec = {
        key: 'test', mode, logLabel: 'Test', configKey: 'Enabled', pageSize,
        getIdFromUrl: () => 'item', resolveFeeds: resolveFeeds || (async () => ({ tvId: 1, movieId: 2, title: 'Titles' })),
        buildDiscoverPath: kind => `/${kind}/discover`,
        resolveItems: async () => ({ items, title: 'Credits' }), renderOneShot
    };
    const discovery = JE.discoveryBase.createDiscovery(spec);
    return { JE, discovery, filter, calls, window, windowEvents, page, list, context,
        get scroll() { return scroll; },
        get controls() { return controls; },
        get cards() { return root.querySelector('.jellyseerr-test-discovery-section')?.querySelector('.itemsContainer')?.children.map(c => c.item) || []; }
    };
}

module.exports = { createHarness, deferred, Element };
