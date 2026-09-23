const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const playerDir = path.resolve(__dirname, '../../client');
const modules = ['playback', 'frame-step', 'seek-history', 'segment-skip', 'track-menu',
    'track-cycle', 'playback-info', 'long-press', 'pause-screen-data', 'pause-screen-styles', 'pausescreen'];
const itemId = '0123456789abcdef0123456789abcdef';
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
    const listeners = new Map();
    const timers = new Map();
    const elements = [];
    const storage = new Map();
    let timerId = 0;
    const node = () => ({
        style: { removeProperty(name) { delete this[name]; } }, children: [],
        setAttribute(name, value) { this[name] = value; },
        appendChild(child) { this.children.push(child); },
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; },
        remove() { this.removed = true; }
    });
    const video = Object.assign(node(), {
        currentTime: 40, duration: 100, playbackRate: 1, paused: true,
        currentSrc: `https://server/Videos/${itemId}/stream?MediaSourceId=source1`,
        addEventListener(name, fn) { listeners.set(name, fn); },
        pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); }
    });
    const toasts = [];
    const JE = { state: {}, currentSettings: { longPress2xEnabled: true },
        t: (key, params) => params ? `${key}:${JSON.stringify(params)}` : key,
        toast: value => toasts.push(value), escapeHtml: value => value,
        isVideoPage: () => true, icon: () => '', IconName: {} };
    const context = vm.createContext({
        console: { warn() {}, log() {}, error() {} }, URLSearchParams, AbortController,
        document: { querySelector: selector => selector === 'video' ? context.video : null,
            querySelectorAll: () => [], addEventListener() {},
            createElement() { const el = node(); elements.push(el); return el; },
            createDocumentFragment: node, body: node(), head: node() },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        performance: { now: () => 100 }, navigator: {},
        setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
        clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => fn(),
        location: { hash: `#/video?id=${itemId}` }, JellyfinEnhanced: JE, video,
        URL: { createObjectURL: () => 'blob:cached', revokeObjectURL() {} }
    });
    context.window = context;
    for (const file of modules) vm.runInContext(fs.readFileSync(path.join(playerDir, `${file}.js`), 'utf8'), context, { filename: file });
    return { context, JE, video, listeners, timers, storage, elements, toasts };
}

function session() {
    return { Id: 'session', DeviceId: 'device', NowPlayingItem: { Id: itemId, MediaStreams: [
        { Type: 'Subtitle', Index: 2, DisplayTitle: 'English' },
        { Type: 'Subtitle', Index: 3, DisplayTitle: 'French' }
    ] }, PlayState: { SubtitleStreamIndex: -1, MediaSourceId: 'source1' } };
}

function api(context, ajax) {
    context.ApiClient = { getCurrentUserId: () => 'user', deviceId: () => 'device',
        getUrl: url => url, serverAddress: () => 'https://server', ajax };
}

test('transport, aspect ratio, and native graphical subtitle fit retain their public behavior', () => {
    const { JE, video, storage } = harness();
    const canvas = { style: {} };
    video.parentElement = { querySelectorAll: () => [canvas] };
    JE.adjustPlaybackSpeed('increase');
    assert.equal(video.playbackRate, 1.25);
    JE.resetPlaybackSpeed();
    assert.equal(video.playbackRate, 1);
    JE.jumpToPercentage(75);
    assert.equal(video.currentTime, 75);
    for (const mode of ['cover', 'fill', 'auto']) {
        JE.cycleAspect();
        assert.equal(storage.get('aspectRatio'), mode);
        assert.equal(canvas.style.objectFit, mode === 'auto' ? 'contain' : mode);
    }
});

test('frame stepping chooses the active source FPS, caches it, and clamps at zero', async () => {
    const { JE, context, video } = harness();
    let calls = 0;
    api(context);
    context.ApiClient.getItem = async () => { calls++; return { MediaSources: [
        { Id: 'other', MediaStreams: [{ Type: 'Video', ReferenceFrameRate: 60 }] },
        { Id: 'source1', MediaStreams: [{ Type: 'Video', ReferenceFrameRate: 25 }] }
    ] }; };
    await JE.frameStep('forward');
    assert.equal(video.currentTime, 40.04);
    video.currentTime = 0.01;
    await JE.frameStep('backward');
    assert.equal(video.currentTime, 0);
    assert.equal(calls, 1);
});

test('frame step transient lookup failures use uncached fallback and retry', async () => {
    const { JE, context, video } = harness();
    api(context);
    let calls = 0;
    context.ApiClient.getItem = async () => { calls++; throw new Error('offline'); };
    video.currentTime = 0;
    await JE.frameStep('forward');
    await JE.frameStep('forward');
    assert.equal(calls, 2);
    assert.equal(video.currentTime, 2 / 24);
});

test('seek history consumes the last stable pre-seek position only once', () => {
    const { JE, video, listeners, toasts } = harness();
    JE.attachSeekTracker(video);
    JE.attachSeekTracker(video);
    listeners.get('timeupdate')();
    video.currentTime = 90;
    listeners.get('seeking')();
    JE.jumpToLastPosition();
    assert.equal(video.currentTime, 40);
    JE.jumpToLastPosition();
    assert.match(toasts.at(-1), /No previous position saved/);
});

test('manual segment skip accounts for progressive transcode start offset', async () => {
    const { JE, context, video } = harness();
    video.currentSrc += '&StartTimeTicks=100000000';
    video.currentTime = 5;
    api(context, async () => ({ Items: [{ StartTicks: 120000000, EndTicks: 200000000, Type: 'Intro' }] }));
    JE.skipIntroOutro();
    await flush();
    assert.equal(video.currentTime, 10);
});

test('own-session probe refuses ambiguous device matches', async () => {
    const { JE, context } = harness();
    api(context, async () => [session(), session()]);
    assert.equal(await JE.internals.player.probeOwnSession(), null);
});

test('rapid subtitle cycles serialize and bridge lagging server selection', async () => {
    const { JE, context } = harness();
    const commands = [];
    api(context, async request => {
        if (request.type === 'GET') return [session()];
        commands.push(JSON.parse(request.data));
    });
    JE.cycleSubtitleTrack();
    JE.cycleSubtitleTrack();
    await flush();
    assert.deepEqual(commands.map(command => command.Arguments.Index), ['2', '3']);
    assert.ok(commands.every(command => command.Name === 'SetSubtitleStreamIndex'));
});

test('queued track commands never target a newly playing item', async () => {
    const { JE, context, video } = harness();
    let resolveProbe;
    let commands = 0;
    api(context, request => {
        if (request.type === 'GET') return new Promise(resolve => { resolveProbe = resolve; });
        commands++;
    });
    JE.cycleSubtitleTrack();
    await flush();
    video.currentSrc = `/Videos/${'a'.repeat(32)}/stream`;
    resolveProbe([session()]);
    await flush();
    assert.equal(commands, 0);
});

test('playback info tears down its overlay and refresh loop on toggle off', async () => {
    const { JE, timers, elements } = harness();
    JE.togglePlaybackInfo();
    await flush();
    const overlay = elements.find(el => el['data-je-playback-info']);
    assert.ok(overlay);
    assert.equal(timers.size, 1);
    JE.togglePlaybackInfo();
    assert.equal(overlay.removed, true);
    assert.equal(timers.size, 0);
});

test('long press restores the original speed on cancellation', () => {
    const { JE, video, timers } = harness();
    video.playbackRate = 1.25;
    JE.handleLongPressDown({ button: 0, clientX: 20, clientY: 20 });
    [...timers.values()].find(timer => timer.ms === 500).fn();
    assert.equal(video.playbackRate, 2);
    JE.handleLongPressCancel();
    assert.equal(video.playbackRate, 1.25);
});

test('pause-screen credentials select the active server and fail closed for missing servers', () => {
    const { JE, context, storage } = harness();
    storage.set('jellyfin_credentials', JSON.stringify({ Servers: [
        { Id: 'other', UserId: 'other-user', AccessToken: 'other-token' },
        { Id: 'active', UserId: 'user', AccessToken: 'token' }
    ] }));
    context.ApiClient = { serverId: () => 'active' };
    const data = new JE.internals.player.PauseScreenData();
    assert.equal(data.getCredentials().token, 'token');
    context.ApiClient.serverId = () => 'missing';
    assert.equal(data.getCredentials(), null);
});

test('pause-screen data caches authenticated metadata until invalidation', async () => {
    const { JE, context } = harness();
    api(context);
    let calls = 0;
    context.fetch = async (url, options) => {
        calls++;
        assert.equal(url, '/Items/item');
        assert.equal(options.headers['X-Emby-Token'], 'token');
        return { ok: true, json: async () => ({ Id: 'item' }) };
    };
    const data = new JE.internals.player.PauseScreenData();
    data.setCredentials({ userId: 'user', token: 'token' });
    const first = await data.getItemRecord('item');
    assert.equal(await data.getItemRecord('item'), first);
    assert.equal(calls, 1);
    data.invalidateMetadata();
    await data.getItemRecord('item');
    assert.equal(calls, 2);
});

test('pause-screen image fallback caches probes and revokes blob URLs on clear', async () => {
    const { JE, context } = harness();
    const requests = [], revoked = [];
    context.URL.revokeObjectURL = url => revoked.push(url);
    context.fetch = async (url, options) => {
        requests.push([url, options.method || 'GET']);
        return { ok: url !== 'missing', blob: async () => ({}) };
    };
    const data = new JE.internals.player.PauseScreenData();
    assert.equal(await data.firstAvailableBlobURL(['missing', 'present']), 'blob:cached');
    assert.equal(await data.firstAvailableBlobURL(['missing', 'present']), 'blob:cached');
    assert.deepEqual(requests, [['missing', 'HEAD'], ['present', 'HEAD'], ['present', 'GET']]);
    data.clear();
    assert.deepEqual(revoked, ['blob:cached']);
    await data.firstAvailableBlobURL(['present']);
    assert.equal(requests.length, 5);
});

test('localized track menus ignore non-track rows and select the next numeric stream', () => {
    const { JE, context } = harness();
    const clicked = [];
    const row = (id, selected) => ({
        getAttribute: () => id,
        querySelector: selector => selector === '.listItemIcon.check'
            ? (selected ? {} : null) : { textContent: `Stream ${id}` },
        click: () => clicked.push(id)
    });
    const rows = [row('-1'), row('secondary'), row('2', true), row('3')];
    const container = { querySelectorAll: () => rows };
    const sheet = { offsetWidth: 100, querySelectorAll: () => [{ textContent: 'Untertitel' }], closest: () => container };
    context.document.querySelector = () => ({ getAttribute: () => 'Untertitel' });
    context.document.querySelectorAll = () => [sheet];
    context.getComputedStyle = () => ({ visibility: 'visible' });
    JE.cycleSubtitleTrack();
    assert.deepEqual(clicked, ['3']);
});

test('closing playback info during a session probe cannot restart its timer', async () => {
    const { JE, context, timers } = harness();
    let resolveProbe;
    api(context, () => new Promise(resolve => { resolveProbe = resolve; }));
    JE.togglePlaybackInfo();
    JE.togglePlaybackInfo();
    resolveProbe([session()]);
    await flush();
    assert.equal(timers.size, 0);
});
