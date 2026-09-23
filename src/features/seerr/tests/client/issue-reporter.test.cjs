const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const sourceRoot = resolve(__dirname, '../../client');
const files = ['data', 'view', 'tv-controls', 'modal'].map(name => `issue-reporter-${name}.js`).concat('issue-reporter.js');
const plain = value => JSON.parse(JSON.stringify(value));

function load({ api = {}, je = {}, document = {} } = {}) {
    const JE = {
        t: key => key,
        escapeHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        icon: name => name,
        IconName: { VIDEO: 'video', AUDIO: 'audio', SUBTITLES: 'subtitles', QUESTION: 'other' },
        ...je
    };
    const context = vm.createContext({
        window: { JellyfinEnhanced: JE },
        ApiClient: { getUrl: (path, params) => ({ path, params }), getCurrentUserId: () => 'user', ...api },
        console: { debug() {}, warn() {}, log() {}, error() {} },
        document,
        URLSearchParams,
        setTimeout
    });
    for (const file of files) vm.runInContext(readFileSync(resolve(sourceRoot, file), 'utf8'), context, { filename: file });
    return JE;
}

function select() {
    return {
        options: [], value: '', disabled: false, listeners: {},
        set innerHTML(value) { this.options = []; this.value = ''; },
        appendChild(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; },
        addEventListener(event, handler) { this.listeners[event] = handler; }
    };
}

function controls() {
    const nodes = { '#issue-season': select(), '#issue-episode': select(), '#jellyseerr-tv-controls-placeholder': {} };
    return { nodes, querySelector: selector => nodes[selector] || null };
}

test('availability preserves status combinations, parent lookup and fail-open behavior', async () => {
    for (const active of [true, false]) {
        for (const tmdb of [true, false]) {
            const JE = load({ api: { ajax: async () => ({ active }) } });
            const result = await JE.jellyseerrIssueReporter.checkReportingAvailability({ ProviderIds: tmdb ? { Tmdb: '42' } : {} });
            assert.equal(result, active ? (tmdb ? 'available' : 'no-tmdb') : (tmdb ? 'no-jellyseerr' : 'no-both'));
        }
    }
    const requests = [];
    const JE = load({ api: { ajax: async () => ({ active: true }), getItem: async (...args) => { requests.push(args); return { ProviderIds: { Tmdb: '42' } }; } } });
    assert.equal(await JE.jellyseerrIssueReporter.checkReportingAvailability({ Type: 'Episode', SeriesId: 'series' }), 'available');
    assert.deepEqual(requests, [['user', 'series']]);
    const failing = load({ api: { ajax: async () => { throw new Error('network'); } } });
    assert.equal(await failing.jellyseerrIssueReporter.checkReportingAvailability({}), 'available');
});

test('TMDB fallback accepts map URLs, prefers matching IMDB media type, then exact title/year', async () => {
    const JE = load();
    assert.equal(await JE.jellyseerrIssueReporter.getTmdbIdFallback('Film', 'movie', { ExternalUrls: { tmdb: { Url: 'https://tmdb.org/movie/42' } } }), '42');
    const queries = [];
    JE.jellyseerrAPI = { search: async query => { queries.push(query); return { results: [{ id: 3, mediaType: 'tv' }, { id: 7, mediaType: 'movie' }] }; } };
    assert.equal(await JE.jellyseerrIssueReporter.getTmdbIdFallback('Film', 'movie', { ProviderIds: { Imdb: 'tt123' } }), '7');
    assert.deepEqual(queries, ['tt123']);
    JE.jellyseerrAPI.search = async query => {
        assert.equal(query, 'Film 2020');
        return { results: [{ id: 2, title: 'Film', releaseDate: '2019-01-01' }, { id: 8, title: 'FILM', releaseDate: '2020-01-01' }] };
    };
    assert.equal(await JE.jellyseerrIssueReporter.getTmdbIdFallback('Film', 'movie', { Name: 'Film', ProductionYear: 2020 }), '8');
});

test('local season discovery excludes specials and preserves per-season episode errors', async () => {
    const requests = [];
    const JE = load({ api: { ajax: async ({ url }) => {
        requests.push(url);
        if (url.params.ParentId === 'series') return { Items: [{ Id: 'special', IndexNumber: 0 }, { Id: 'one', IndexNumber: 1 }, { Id: 'two', IndexNumber: 2 }] };
        if (url.params.ParentId === 'one') return { Items: [{ IndexNumber: 3, Name: 'Three' }] };
        throw new Error('unavailable season');
    } } });
    const seasons = await JE.jellyseerrIssueReporterData.getAvailableSeasons({ Type: 'Series', Id: 'series' });
    assert.deepEqual(plain(seasons), [{ seasonNumber: 1, id: 'one', episodes: [{ episodeNumber: 3, title: 'Three' }] }, { seasonNumber: 2, id: 'two', episodes: [] }]);
    assert.deepEqual(requests.map(request => request.params.ParentId), ['series', 'one', 'two']);
    assert.deepEqual(plain(await JE.jellyseerrIssueReporterData.getAvailableSeasons({ SeasonCount: 2 })), [{ seasonNumber: 1, episodes: [] }, { seasonNumber: 2, episodes: [] }]);
});

test('TV controls lock episode context and allow all-season switching from a series', async () => {
    const JE = load({ document: { createElement: () => ({}) } });
    JE.jellyseerrIssueReporterData.getAvailableSeasons = async () => [{ seasonNumber: 1, episodes: [] }, { seasonNumber: 2, episodes: [{ episodeNumber: 3, title: 'Three' }] }];
    const episode = controls();
    await JE.jellyseerrIssueReporterTvControls.initialize(episode, { Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 3 });
    assert.equal(episode.nodes['#issue-season'].value, '2');
    assert.equal(episode.nodes['#issue-episode'].value, '3');
    assert.equal(episode.nodes['#issue-season'].disabled, true);
    assert.equal(episode.nodes['#issue-episode'].disabled, true);
    const series = controls();
    await JE.jellyseerrIssueReporterTvControls.initialize(series, { Type: 'Series' });
    assert.equal(series.nodes['#issue-season'].value, '0');
    assert.equal(series.nodes['#issue-episode'].disabled, true);
    series.nodes['#issue-season'].value = '2';
    series.nodes['#issue-season'].listeners.change();
    assert.equal(series.nodes['#issue-episode'].disabled, false);
    assert.deepEqual(series.nodes['#issue-episode'].options.map(option => option.value), ['0', '3']);
});

test('issue history groups by type, sorts newest first and escapes user text', () => {
    const JE = load();
    const html = JE.jellyseerrIssueReporterView.renderIssues([
        { id: 1, issueType: 2, message: 'audio', status: 1 },
        { id: 2, issueType: 1, createdAt: '2020-01-01', comments: [{ message: '<script>description</script>' }, { user: { username: '<author>' }, message: '<comment>' }] },
        { id: 3, issueType: 1, createdAt: '2021-01-01', status: 2, createdBy: { username: '<reporter>' }, message: 'latest' }
    ]);
    assert.ok(html.indexOf('#3') < html.indexOf('#2'));
    assert.ok(html.indexOf('#2') < html.indexOf('#1'));
    assert.match(html, /pill-status-resolved/);
    assert.match(html, /&lt;script&gt;description&lt;\/script&gt;/);
    assert.match(html, /&lt;author&gt;/);
    assert.match(html, /&lt;reporter&gt;/);
    assert.doesNotMatch(html, /<script>|<comment>|<author>|<reporter>/);
});

function modalHarness(reportIssue) {
    let config;
    const toasts = [];
    const modal = controls();
    modal.nodes['#issue-message'] = { value: 'Only this description' };
    modal.nodes['input[name="issue-type"]:checked'] = { value: '2' };
    modal.nodes['#issue-season'] = { value: '2', disabled: true };
    modal.nodes['#issue-episode'] = { value: '3', disabled: true };
    const JE = load({ je: {
        toast: (...args) => toasts.push(args),
        jellyseerrModal: { create: options => { config = options; return { modalElement: modal, show() {} }; } },
        jellyseerrAPI: { reportIssue, fetchIssuesForMedia: async () => ({ results: [] }) }
    } });
    JE.jellyseerrIssueReporter.showReportModal('42', 'Film', 'movie');
    return { JE, config, modal, toasts };
}

test('submission retains disabled episode selectors and closes only after successful API result', async () => {
    const calls = [];
    const { config, modal, toasts } = modalHarness(async (...args) => { calls.push(args); return { id: 1 }; });
    let closed = false;
    const button = {};
    await config.onSave(modal, button, () => { closed = true; });
    assert.deepEqual(calls, [['42', 'movie', '2', 'Only this description', 2, 3]]);
    assert.equal(closed, true);
    assert.deepEqual(toasts, [['jellyseerr_report_issue_success', 3000]]);
});

test('submission validates type and restores button on permission failures', async () => {
    let attempts = 0;
    const { config, modal, toasts } = modalHarness(async () => { attempts++; throw { status: 403 }; });
    delete modal.nodes['input[name="issue-type"]:checked'];
    const button = {};
    await config.onSave(modal, button, () => assert.fail('must stay open'));
    assert.equal(attempts, 0);
    modal.nodes['input[name="issue-type"]:checked'] = { value: '1' };
    await config.onSave(modal, button, () => assert.fail('must stay open'));
    assert.equal(attempts, 1);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'jellyseerr_report_issue_submit');
    assert.deepEqual(toasts, [['Issue Type is required', 3000], ['jellyseerr_err_no_issue_permission', 4000]]);
});
