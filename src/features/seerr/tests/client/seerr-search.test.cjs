const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../../client');
const baseline = process.env.SEERR_SEARCH_BASELINE;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function target(extra = {}) {
    const listeners = new Map();
    return Object.assign({
        listeners,
        addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
        dispatch(type, event = {}) { return Promise.all([...listeners.get(type) || []].map(fn => fn(event))); },
        querySelector() { return null; }, querySelectorAll() { return []; }
    }, extra);
}
function harness() {
    const timers = new Map(); let timerId = 0;
    const nav = new Set(), mutations = new Set(), calls = [], renders = [], cards = [];
    let engine, controller, queryVisible = true, sectionVisible = false, cleanupCount = 0;
    let respond = async (query, page) => ({ page, totalPages: 1, results: [{ id: 1, mediaType: 'movie' }] });
    const input = target({ value: 'Dune', dataset: {} });
    const container = target({
        appendChild(card) { cards.push(...(card.cards || [card])); },
        get firstChild() { return cards[0]; }, removeChild() { cards.shift(); }
    });
    const section = target({ querySelector: selector => selector === '.itemsContainer' ? container : null });
    const document = target({ body: target(), querySelector(selector) {
        if (selector.includes('#searchTextInput')) return selector.includes(':not(.hide)') && !queryVisible ? null : input;
        if (selector === '.jellyseerr-section .itemsContainer') return sectionVisible ? container : null;
        if (selector === '.jellyseerr-section') return sectionVisible ? section : null;
        return null;
    }, createDocumentFragment() { return { cards: [], appendChild(card) { this.cards.push(card); } }; } });
    const JE = {
        pluginConfig: { JellyseerrEnabled: true, ShowCollectionsInSearch: false },
        t: x => x, escapeHtml: x => x, toast() {},
        jellyseerrAPI: {
            checkUserStatus: async () => ({ active: true, userFound: true }),
            search: (query, page, options) => { calls.push({ query, page, options }); return respond(query, page, options); },
            addCollections: async items => items
        },
        hiddenContent: { filterJellyseerrResults: items => items },
        jellyseerrUI: {
            addMainStyles() {}, addSeasonModalStyles() {}, updateJellyseerrIcon() {},
            renderJellyseerrResults(items, query, only, active, userFound) {
                sectionVisible = true; cards.splice(0, cards.length, ...items); renders.push({ items: [...items], query, only, active, userFound });
            },
            createJellyseerrCard: item => item, clearInjectedSearchResults() { sectionVisible = false; cards.length = 0; },
            updateJellyseerrResults() {}, releasePosters() {}
        },
        helpers: {
            onNavigate(fn) { nav.add(fn); return () => nav.delete(fn); },
            onBodyMutation(id, fn) { mutations.add(fn); return { unsubscribe: () => mutations.delete(fn) }; }
        },
        seamlessScroll: {
            cleanupInfiniteScroll() { cleanupCount++; },
            createDeduplicator() {
                const seen = new Set();
                return { clear() { seen.clear(); }, add(item) { const key = `${item.mediaType}:${item.id}`; if (seen.has(key)) return false; seen.add(key); return true; }, filter(items) { return items.filter(item => this.add(item)); } };
            },
            cardsNeeded: () => 40,
            setupInfiniteScroll(state, selector, load, hasMore, loading) { engine = { load, hasMore, loading }; state.fill = () => {}; }
        },
        requestManager: {
            getAbortSignal() { controller?.abort(); controller = new AbortController(); return controller.signal; },
            abortRequest() { controller?.abort(); }
        }
    };
    const context = vm.createContext({
        window: target({ JellyfinEnhanced: JE, location: { hash: '#/search?query=Dune' } }), document,
        ApiClient: { getCurrentUserId: () => 'user', accessToken: () => 'token' }, URLSearchParams,
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }, clearInterval(id) { timers.delete(id); },
        console: { log() {}, debug() {}, warn() {}, error() {} }
    });
    const files = ['../../../shared/browser/lifecycle.js', ...(baseline ? [] : ['search/collections.js', 'search/results.js', 'search/page.js', 'search/interactions.js'])];
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    vm.runInContext(fs.readFileSync(baseline || path.join(root, 'jellyseerr.js'), 'utf8'), context);
    return {
        JE, input, document, calls, renders, cards, nav, mutations, timers,
        get engine() { return engine; }, get cleanupCount() { return cleanupCount; },
        respond(fn) { respond = fn; }, setVisible(value) { queryVisible = value; },
        async tick() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); await flush(); },
        async initialize() { JE.initializeJellyseerrScript(); await flush(); await this.tick(); }
    };
}

test('filtered first pages retain a result row and pagination; duplicates stay filtered on append', async () => {
    const h = harness();
    h.JE.hiddenContent.filterJellyseerrResults = items => items.filter(item => item.id !== 1);
    h.respond(async (query, page) => ({ page, totalPages: 4, results: [{ id: page === 1 ? 1 : 2, mediaType: 'movie' }] }));
    await h.initialize();
    assert.deepEqual(h.renders[0].items, []);
    assert.equal(h.engine.hasMore(), true);
    assert.deepEqual(JSON.parse(JSON.stringify(await h.engine.load({ pageBudget: 2 }))), { pages: 2, rendered: 1 });
    assert.deepEqual(h.calls.map(call => call.page), [1, 2, 3]);
    assert.deepEqual(h.cards.map(card => card.id), [2]);
});

test('parallel search pages commit only through the first failure and retry the gap', async () => {
    const h = harness(); let fail = true;
    h.respond(async (query, page) => {
        if (page === 3 && fail) throw new Error('temporary');
        return { page, totalPages: 8, results: [{ id: page, mediaType: 'movie' }] };
    });
    await h.initialize();
    const first = await h.engine.load({ pageBudget: 3 });
    assert.equal(first.pages, 1);
    assert.deepEqual(h.cards.map(card => card.id), [1, 2]);
    fail = false;
    const count = h.calls.length;
    await h.engine.load({ pageBudget: 1 });
    assert.equal(h.calls[count].page, 3);
    assert.deepEqual(h.cards.map(card => card.id), [1, 2, 3]);
});

test('TMDB search pagination never requests page 501', async () => {
    const h = harness();
    h.respond(async (query, page) => ({ page: page === 1 ? 499 : page, totalPages: 999, results: [] }));
    await h.initialize();
    await h.engine.load({ pageBudget: 4, engaged: true });
    assert.deepEqual(h.calls.map(call => call.page), [1, 500]);
    assert.equal(h.engine.hasMore(), false);
});

test('superseding a query aborts its signal and discards its late first page', async () => {
    const h = harness(); let finishOld;
    h.respond((query, page) => query === 'Dune' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ page, results: [{ id: 9, mediaType: 'movie' }] }));
    await h.initialize();
    h.input.value = 'Arrival'; await h.input.dispatch('input'); await h.tick();
    assert.equal(h.calls[0].options.signal.aborted, true);
    finishOld({ page: 1, results: [{ id: 1, mediaType: 'movie' }] }); await flush();
    assert.deepEqual(h.renders.map(render => render.query), ['Arrival']);
    assert.deepEqual(h.cards.map(card => card.id), [9]);
});

test('navigation suspends pagination immediately, then clears results when search is hidden', async () => {
    const h = harness();
    h.respond(async (query, page) => ({ page, totalPages: 3, results: [] }));
    await h.initialize();
    h.setVisible(false); h.nav.forEach(fn => fn());
    assert.equal(h.engine.hasMore(), false);
    await h.engine.load(); assert.equal(h.calls.length, 1);
    await h.tick();
    assert.equal(h.engine.hasMore(), false);
    assert.equal(h.cards.length, 0);
    assert.ok(h.cleanupCount > 0);
});

test('manual refresh bypasses cache and releases old posters before rebuilding', async () => {
    const h = harness(); let released = 0;
    h.JE.jellyseerrUI.releasePosters = () => released++;
    await h.initialize();
    await h.document.dispatch('jellyseerr-manual-refresh'); await flush();
    assert.equal(h.calls[1].options.skipCache, true);
    assert.equal(released, 1);
    assert.equal(h.calls[0].options.signal.aborted, true);
});

if (!baseline) test('reinitialization replaces all search listeners and tears down request/observer ownership', async () => {
    const h = harness();
    await h.initialize();
    const oldSignal = h.calls[0].options.signal;
    await h.initialize();
    assert.equal(oldSignal.aborted, true);
    assert.equal(h.nav.size, 1);
    assert.equal(h.mutations.size, 1);
    assert.equal(h.input.listeners.get('input').size, 1);
    assert.equal(h.document.listeners.get('jellyseerr-manual-refresh').size, 1);
    h.JE.core.lifecycle.get('jellyseerr-search').teardown();
    assert.equal(h.nav.size, 0);
    assert.equal(h.mutations.size, 0);
    assert.equal(h.input.listeners.get('input').size, 0);
    assert.equal(h.document.listeners.get('jellyseerr-manual-refresh').size, 0);
    assert.equal(h.input.dataset.jellyseerrListener, undefined);
    assert.equal(h.calls.at(-1).options.signal.aborted, true);
});

function requestButton(mediaType = 'movie') {
    const classes = new Set(['jellyseerr-button-request']);
    const button = {
        dataset: { mediaType, tmdbId: '42', searchResultItem: JSON.stringify({ id: 42, title: 'Arrival' }) },
        disabled: false, innerHTML: '',
        classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
        closest: selector => selector === '.jellyseerr-request-button' || selector === '.jellyseerr-button-group' ? button : null
    };
    return { button, classes };
}

test('movie request actions keep IDs, override payloads and requested button presentation', async () => {
    const h = harness(); const requests = [];
    h.JE.jellyseerrAPI.requestMedia = async (...args) => { requests.push(args); };
    h.JE.jellyseerrUI.icons = { requested: '<requested>' };
    const { button, classes } = requestButton();
    await h.initialize();
    await h.document.body.dispatch('click', { target: button });
    assert.deepEqual(JSON.parse(JSON.stringify(requests)), [['42', 'movie', {}, false, { id: 42, title: 'Arrival' }]]);
    assert.equal(button.disabled, true);
    assert.equal(button.innerHTML, '<span>jellyseerr_btn_requested</span><requested>');
    assert.equal(classes.has('jellyseerr-button-pending'), true);
    assert.equal(classes.has('jellyseerr-button-request'), false);
});

test('TV requests open season selection without submitting a movie request', async () => {
    const h = harness(); const modals = [];
    h.JE.jellyseerrUI.showSeasonSelectionModal = (...args) => modals.push(args);
    h.JE.jellyseerrAPI.requestMedia = () => assert.fail('TV must open season selection');
    await h.initialize();
    await h.document.body.dispatch('click', { target: requestButton('tv').button });
    assert.deepEqual(JSON.parse(JSON.stringify(modals)), [['42', 'tv', 'Arrival', { id: 42, title: 'Arrival' }]]);
});

test('request failures preserve escaping before rendering API messages', async () => {
    const h = harness();
    h.JE.jellyseerrAPI.requestMedia = async () => { throw { responseJSON: { message: '<img onerror=bad>' } }; };
    h.JE.escapeHtml = value => value.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    h.JE.jellyseerrUI.icons = { error: '<error>' };
    const { button, classes } = requestButton();
    await h.initialize();
    await h.document.body.dispatch('click', { target: button });
    assert.equal(button.disabled, false);
    assert.equal(button.innerHTML, '<span>&lt;img onerror=bad&gt;</span><error>');
    assert.equal(classes.has('jellyseerr-button-error'), true);
});

if (!baseline) {
    test('cancelled debounce timers are untracked instead of accumulating until teardown', async () => {
        const h = harness();
        const lifecycle = h.JE.core.lifecycle.register('jellyseerr-search');
        const trackedTimers = new Set();
        const track = lifecycle.track, untrack = lifecycle.untrack;
        lifecycle.track = resource => { if (resource?.timeoutId) trackedTimers.add(resource); return track(resource); };
        lifecycle.untrack = resource => { trackedTimers.delete(resource); return untrack(resource); };
        await h.initialize();
        for (let i = 0; i < 25; i++) { h.input.value = `Title ${i}`; await h.input.dispatch('input'); }
        assert.equal(trackedTimers.size, 1);
        assert.equal(h.timers.size, 1);
        await h.tick();
        assert.equal(trackedTimers.size, 0);
        assert.equal(h.calls.at(-1).query, 'Title 24');
    });

    test('a disposed manual refresh cannot rebuild the row after its request finishes', async () => {
        const h = harness(); let finishRefresh, released = 0;
        h.JE.jellyseerrUI.releasePosters = () => released++;
        await h.initialize();
        h.respond(() => new Promise(resolve => { finishRefresh = resolve; }));
        await h.document.dispatch('jellyseerr-manual-refresh');
        h.JE.core.lifecycle.get('jellyseerr-search').teardown();
        finishRefresh({ results: [{ id: 2, mediaType: 'movie' }] }); await flush();
        assert.equal(released, 0);
        assert.deepEqual(h.cards.map(card => card.id), [1]);
    });
}
