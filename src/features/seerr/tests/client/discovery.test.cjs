const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, deferred, Element } = require('../../../../../tools/testing/discovery-harness.cjs');

// Optional local baseline replay uses the same scenarios against the pre-refactor
// file. Normal CI tests always exercise the committed implementation.
const harness = options => createHarness({ ...options, baseline: process.env.JE_DISCOVERY_BASELINE });
const cardIds = h => h.cards.map(c => `${c.mediaType}:${c.id}`);

test('client paging interleaves types, sorts without mutating credits, and resets on filter', async () => {
    const items = [
        { id: 1, mediaType: 'movie', voteAverage: 3 },
        { id: 2, mediaType: 'movie', voteAverage: 9 },
        { id: 3, mediaType: 'tv', voteAverage: 4 },
        { id: 4, mediaType: 'tv', voteAverage: 8 },
        { id: 5, mediaType: 'tv', voteAverage: 1 }
    ];
    const h = harness({ mode: 'client-paged', items });
    await h.discovery.render();
    assert.deepEqual(cardIds(h), ['tv:3', 'movie:1']);
    await h.scroll.loadMore();
    assert.deepEqual(cardIds(h), ['tv:3', 'movie:1', 'tv:4', 'movie:2']);
    h.filter.setSortMode('test', 'vote_average.desc');
    await h.controls.onSort();
    assert.deepEqual(cardIds(h), ['tv:4', 'movie:2']);
    h.filter.setFilterMode('test', 'movies');
    h.controls.onFilter('movies');
    assert.deepEqual(cardIds(h), ['movie:2', 'movie:1']);
    assert.equal(h.scroll.more(), false);
    assert.deepEqual(items.map(i => i.id), [1, 2, 3, 4, 5]);
});

test('dual feed retains successful first page and retries a failed feed from page one', async () => {
    let failed = false;
    const h = harness({ fetch({ kind, page }) {
        if (kind === 'tv' && !failed) { failed = true; throw new Error('temporary'); }
        return { results: [{ id: page, mediaType: kind }], totalPages: 2 };
    } });
    await h.discovery.render();
    assert.deepEqual(cardIds(h), ['movie:1']);
    await h.scroll.loadMore({ pageBudget: 2 });
    assert.deepEqual(cardIds(h), ['movie:1', 'tv:1', 'movie:2']);
    assert.deepEqual(h.calls.slice(0, 4).map(c => `${c.kind}:${c.page}`), ['tv:1', 'movie:1', 'tv:1', 'movie:2']);
});

test('dual feed commits consecutive successes and retries from the first failed page', async () => {
    let fail = true;
    const h = harness({ fetch({ kind, page }) {
        if (kind === 'tv' && page === 3 && fail) throw new Error('page failed');
        return { results: [{ id: page, mediaType: kind }], totalPages: 4 };
    } });
    await h.discovery.render();
    const result = await h.scroll.loadMore({ pageBudget: 4, cards: 80 });
    assert.equal(result.pages, 3);
    assert.deepEqual(cardIds(h), ['tv:1', 'movie:1', 'tv:2', 'movie:2', 'movie:3']);
    fail = false;
    const before = h.calls.length;
    await h.scroll.loadMore({ pageBudget: 2 });
    assert.deepEqual(h.calls.slice(before, before + 2).map(c => `${c.kind}:${c.page}`), ['tv:3', 'movie:4']);
    assert.equal(cardIds(h).filter(id => id === 'tv:2').length, 1);
});

test('sort replacement cancels the old generation and uses TV-specific date sort', async () => {
    const waiting = deferred();
    let delay = true;
    const h = harness({ fetch({ kind, page, sort }) {
        if (page === 2 && !sort && delay) return waiting.promise;
        return { results: [{ id: `${sort || 'popular'}-${page}`, mediaType: kind }], totalPages: 2 };
    } });
    await h.discovery.render();
    const oldLoad = h.scroll.loadMore({ pageBudget: 2 });
    h.filter.setSortMode('test', 'release_date.desc');
    await h.controls.onSort();
    delay = false;
    waiting.resolve({ results: [{ id: 'stale', mediaType: 'tv' }], totalPages: 2 });
    await oldLoad;
    assert.deepEqual(cardIds(h), ['tv:first_air_date.desc-1', 'movie:release_date.desc-1']);
    assert.equal(h.calls.find(c => c.page === 2 && !c.sort).signal.aborted, true);
    assert.equal(h.scroll.loading(), false);
});

test('identity cleanup removes cards, cancels requests, and allows a fresh render', async () => {
    const h = harness();
    await h.discovery.render();
    const signal = h.calls[0].signal;
    const count = h.calls.length;
    await h.discovery.render();
    assert.equal(h.calls.length, count, 'successful page is deduplicated');
    h.JE.changeUser();
    assert.equal(signal.aborted, true);
    assert.deepEqual(cardIds(h), []);
    await h.discovery.render();
    assert.equal(h.calls.length, count + 2);
    assert.deepEqual(cardIds(h), ['tv:1', 'movie:1']);
});

test('one-shot lifecycle does not mark an aborted predecessor as processed', async () => {
    const pending = deferred();
    let runs = 0;
    const h = harness({ mode: 'one-shot', renderOneShot: async () => {
        runs++;
        if (runs === 1) return pending.promise;
        return true;
    } });
    const first = h.discovery.render();
    h.discovery.cleanup();
    await h.discovery.render();
    pending.resolve(true);
    await first;
    await h.discovery.render();
    assert.equal(runs, 2);
});

test('page host distinguishes stale reused lists and current router views', async () => {
    const h = harness();
    h.discovery.initialize();
    h.windowEvents.get('hashchange')();
    await h.discovery.render();
    const options = h.JE.pageOptions;
    assert.equal(options.isStalePage(h.page), true);
    const item = h.list.appendChild(new Element());
    item.setAttribute('data-id', 'next');
    assert.equal(options.isStalePage(h.page), false);
    h.discovery.handlePageNavigation('list', h.page);
    assert.equal(options.getView(), h.page);
    h.window.location.hash = '#!/list?genreId=2';
    assert.equal(options.getView(), null);
});

test('filtered-out stretches respect TMDB page 500 even when upstream reports thousands', async () => {
    const h = harness({
        resolveFeeds: async () => ({ tvId: 1, title: 'TV' }),
        fetch: ({ page }) => ({ results: [{ id: page, mediaType: 'tv', hidden: true }], totalPages: 9000 })
    });
    await h.discovery.render();
    let loads = 0;
    while (h.scroll.more() && loads++ < 600) await h.scroll.loadMore({ pageBudget: 16 });
    assert.ok(loads < 600, 'exhausted discovery stops loading');
    assert.equal(Math.max(...h.calls.map(c => c.page)), 500);
    assert.deepEqual(cardIds(h), []);
});

test('filter changes retire in-flight bookkeeping without skipping the next feed page', async () => {
    const waiting = deferred();
    let hold = true;
    const h = harness({ fetch({ kind, page }) {
        if (page === 2 && hold) return waiting.promise;
        return { results: [{ id: page, mediaType: kind }], totalPages: 2 };
    } });
    await h.discovery.render();
    const oldLoad = h.scroll.loadMore({ pageBudget: 2 });
    h.filter.setFilterMode('test', 'movies');
    h.controls.onFilter('movies');
    waiting.resolve({ results: [{ id: 'stale', mediaType: 'tv' }], totalPages: 2 });
    await oldLoad;
    assert.deepEqual(cardIds(h), ['tv:1', 'movie:1']);
    hold = false;
    const count = h.calls.length;
    await h.scroll.loadMore({ pageBudget: 1 });
    assert.deepEqual(h.calls.slice(count).map(c => `${c.kind}:${c.page}`), ['movie:2']);
    assert.deepEqual(cardIds(h), ['tv:1', 'movie:1', 'movie:2']);
});

test('detail and list route parsers preserve encoded identifiers and reject unrelated routes', () => {
    const h = harness();
    const detail = h.JE.discoveryBase.idFromDetailUrl;
    const list = h.JE.discoveryBase.idFromListParam('genreId');
    assert.equal(list(), '1');
    assert.equal(detail(), null);
    h.window.location.hash = '#!/details?id=a%20b';
    assert.equal(detail(), 'a b');
    assert.equal(list(), null);
    h.window.location.hash = '#!/home?id=a';
    assert.equal(detail(), null);
});
