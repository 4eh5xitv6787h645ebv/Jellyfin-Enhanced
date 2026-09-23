const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const sourceRoot = path.resolve(__dirname, '../../client');
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = value => JSON.parse(JSON.stringify(value));

function load(filename, je = {}, globals = {}) {
    const context = vm.createContext({
        window: { JellyfinEnhanced: je },
        console: { log() {}, warn() {}, error() {} },
        ...globals
    });
    vm.runInContext(fs.readFileSync(path.join(sourceRoot, filename), 'utf8'), context, { filename });
    return context;
}

function reviewApi(overrides = {}) {
    const calls = [];
    const je = { core: { api: {
        fetch: async url => { calls.push(['fetch', url]); return { results: [{ id: 'tmdb' }] }; },
        plugin: async (route, options) => { calls.push(['plugin', route, options]); return { reviews: [{ userId: 'user' }] }; },
        ...overrides
    } } };
    load('reviews-api.js', je, { ApiClient: {
        getUrl: route => '/jellyfin' + route,
        getItem: async (userId, itemId) => { calls.push(['getItem', userId, itemId]); return { ProviderIds: { Tmdb: '99' } }; }
    } });
    return { api: je.reviewApi.create(), calls };
}

test('review transport retains routes, TMDB language/page and mutation retry policy', async () => {
    const { api, calls } = reviewApi();
    assert.deepEqual(plain(await api.fetchReviews('12', 'Series')), [{ id: 'tmdb' }]);
    assert.deepEqual(plain(await api.fetchUserReviews('12:s0:e1', 'tv')), [{ userId: 'user' }]);
    await api.saveUserReview('12:s0:e1', 'tv', 'Review', 0);
    await api.deleteUserReview('12', 'movie');
    await api.adminDeleteUserReview('aa-bb', '12', 'tv');
    assert.deepEqual(plain(calls), [
        ['fetch', '/jellyfin/JellyfinEnhanced/tmdb/tv/12/reviews?language=en-US&page=1'],
        ['plugin', '/reviews/tv/12:s0:e1', null],
        ['plugin', '/reviews/tv/12:s0:e1', { method: 'POST', body: { content: 'Review', rating: null }, skipRetry: true }],
        ['plugin', '/reviews/movie/12', { method: 'DELETE', skipRetry: true }],
        ['plugin', '/reviews/admin/aabb/tv/12', { method: 'DELETE', skipRetry: true }]
    ]);
});

test('review read failures keep distinct empty/null fallbacks; mutation errors remain visible', async () => {
    const failure = { message: 'HTTP 404', status: 404, responseJSON: { message: 'Validation failed' } };
    const { api } = reviewApi({ fetch: async () => { throw failure; }, plugin: async () => { throw failure; } });
    assert.equal(await api.fetchReviews('12', 'Movie'), null);
    assert.deepEqual(plain(await api.fetchUserReviews('12', 'movie')), []);
    await assert.rejects(api.saveUserReview('12', 'movie', 'x', 2.5), /Validation failed/);
    await assert.rejects(api.adminDeleteUserReview('user', '12', 'movie'), /No matching review to delete/);
    await assert.rejects(api.deleteUserReview('12', 'movie'), e => e === failure);
});

test('review keys retain movie, series, season zero and episode zero contracts', async () => {
    const { api, calls } = reviewApi();
    const cases = [
        [{ Type: 'Movie', ProviderIds: { Tmdb: 12 } }, { tmdbKey: '12', apiMediaType: 'movie' }],
        [{ Type: 'Series', ProviderIds: { Tmdb: '12' } }, { tmdbKey: '12', apiMediaType: 'tv' }],
        [{ Type: 'Season', SeriesProviderIds: { Tmdb: '12' }, IndexNumber: 0 }, { tmdbKey: '12:s0', apiMediaType: 'tv' }],
        [{ Type: 'Episode', SeriesId: 'parent', ParentIndexNumber: 0, IndexNumber: 0 }, { tmdbKey: '99:s0:e0', apiMediaType: 'tv' }]
    ];
    for (const [item, expected] of cases) {
        assert.deepEqual(plain(await api.resolveReviewTarget(item, 'viewer')), expected);
    }
    assert.deepEqual(calls, [['getItem', 'viewer', 'parent']]);
    for (const item of [undefined, { Type: 'Audio' }, { Type: 'Movie' }, { Type: 'Season', SeriesProviderIds: { Tmdb: '12' } }, { Type: 'Episode', SeriesProviderIds: { Tmdb: '12' }, IndexNumber: 1 }]) {
        assert.equal(await api.resolveReviewTarget(item, 'viewer'), undefined);
    }
});

test('missing series lookup fails closed instead of inventing a review key', async () => {
    const je = {};
    load('reviews-api.js', je, { ApiClient: { getItem: async () => { throw new Error('offline'); } } });
    assert.equal(await je.reviewApi.create().resolveReviewTarget({ Type: 'Episode', SeriesId: 'parent', ParentIndexNumber: 1, IndexNumber: 2 }, 'viewer'), undefined);
});

test('review markdown retains escaped HTML, text formatting, lists and safe link schemes', () => {
    const je = { escapeHtml, t: key => key };
    load('reviews-rendering.js', je);
    const { parseMarkdown } = je.reviewRendering.create();
    assert.equal(parseMarkdown(''), '');
    assert.equal(parseMarkdown('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    assert.equal(parseMarkdown('**Bold** and _italic_ ~~gone~~ `code`'), '<strong>Bold</strong> and <em>italic</em> <del>gone</del> <code>code</code>');
    assert.equal(parseMarkdown('# Title\n\n- one\n- two'), '<h1>Title</h1><br><ul><li>one</li><li>two</li></ul>');
    assert.equal(parseMarkdown('> quote\n> continued'), '<blockquote>quote<br>continued</blockquote>');
    assert.equal(parseMarkdown('[bad](javascript:alert(1))'), '[bad](javascript:alert(1))');
    assert.match(parseMarkdown('[site](https://example.com)'), /rel="noopener noreferrer"/);
});

test('translation fallback substitutes dollar characters literally and warnings are per key', () => {
    const warnings = [];
    const je = { escapeHtml, t: key => key };
    load('reviews-rendering.js', je, { console: { warn: (...args) => warnings.push(args) } });
    const rendering = je.reviewRendering.create();
    assert.equal(rendering.tWithFallback('missing', 'Hello {name}', { name: '$& $1 $$' }), 'Hello $& $1 $$');
    assert.equal(rendering.tWithFallback('missing', 'Hello {name}', { name: 'second' }), 'Hello second');
    assert.equal(warnings.length, 1);
    je.t = () => 'Translated';
    assert.equal(rendering.tWithFallback('found', 'Fallback'), 'Translated');
});

test('half-star rendering retains clipping and five-star layout', () => {
    const je = { escapeHtml };
    load('reviews-rendering.js', je);
    const { renderUserStarRating } = je.reviewRendering.create();
    assert.equal(renderUserStarRating(null), '');
    assert.equal(renderUserStarRating(0), '');
    const stars = renderUserStarRating(2.5);
    assert.equal((stars.match(/class="je-star-icon"/g) || []).length, 5);
    assert.equal((stars.match(/inset\(0 0% 0 0\)/g) || []).length, 2);
    assert.equal((stars.match(/inset\(0 50% 0 0\)/g) || []).length, 1);
    assert.equal((stars.match(/inset\(0 100% 0 0\)/g) || []).length, 2);
});

test('review styles preserve dynamic font resolution and inject once', () => {
    const styles = [];
    const je = { cdn: { font: file => '/fonts/' + file } };
    load('reviews-styles.js', je, { document: {
        getElementById: id => styles.find(style => style.id === id),
        createElement: () => ({}),
        head: { appendChild: style => styles.push(style) }
    } });
    assert.equal(styles.length, 0);
    je.injectReviewStyles();
    je.injectReviewStyles();
    assert.equal(styles.length, 1);
    assert.equal(styles[0].id, 'tmdb-reviews-enhanced-styles');
    assert.match(styles[0].textContent, /url\(\/fonts\/materialsymbolsrounded.woff2\)/);
    assert.match(styles[0].textContent, /\.je-review-star-picker/);
});
