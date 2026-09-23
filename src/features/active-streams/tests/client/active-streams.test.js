const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceRoot = path.resolve(__dirname, '../../client');

// The feature deliberately builds nodes with textContent, never interpolated HTML.
// This tiny DOM records its visible output and event wiring without a browser dependency.
class Element {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.listeners = {};
        this.className = '';
        this.textContent = '';
        this.classList = {
            add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
            remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
            toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name)
        };
    }
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
    insertBefore(child, next) {
        const index = this.children.indexOf(next);
        if (index === -1) return this.appendChild(child);
        this.children.splice(index, 0, child);
        child.parentElement = this;
        return child;
    }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    remove() { this.parentElement?.removeChild(this); }
    get firstChild() { return this.children[0]; }
    querySelector(selector) {
        const match = selector.startsWith('#') ? node => node.id === selector.slice(1)
            : node => node.className.split(' ').includes(selector.slice(1));
        for (const child of this.children) {
            if (match(child)) return child;
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    focus() { this.focused = true; }
    closest() { return null; }
}

function setup({ api = async () => [], admin = true } = {}) {
    const head = new Element('head');
    const body = new Element('body');
    const document = {
        head, body, createElement: tag => new Element(tag),
        getElementById: id => head.querySelector(`#${id}`) || body.querySelector(`#${id}`),
        documentElement: { style: { setProperty() {} } },
        addEventListener() {}, removeEventListener() {}, querySelector() { return null; }
    };
    const timers = new Map();
    let timerId = 0;
    const JE = {
        t: () => undefined,
        pluginConfig: { ActiveStreamsEnabled: true },
        helpers: { isAdmin: () => admin, getHeaderButtonTray: () => body, onBodyMutation: () => ({ unsubscribe() {} }) },
        core: { api: { plugin: api }, lifecycle: { register: () => ({ track() {}, teardown() {} }) }, navigation: { onNavigate: () => () => {} } },
        session: { onUserChange() {} }
    };
    const context = vm.createContext({ window: { JellyfinEnhanced: JE }, document, console: { log() {} },
        setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) });
    for (const file of ['model', 'styles', 'view', 'broadcast']) {
        vm.runInContext(fs.readFileSync(path.join(sourceRoot, `${file}.js`), 'utf8'), context);
    }
    return { JE, document, timers, context, internal: JE.internals.activeStreams };
}

function panel(document) {
    const node = document.createElement('div');
    node.id = 'je-active-streams-panel';
    for (const cls of ['je-as-panel-header', 'je-as-panel-title', 'je-as-panel-body']) {
        const child = document.createElement('div');
        child.className = cls;
        node.appendChild(child);
    }
    document.body.appendChild(node);
    return node;
}

const stream = (item = {}, state = {}) => ({ NowPlayingItem: { Id: 'movie', Name: '<b>Movie</b>', ...item }, PlayState: state });

test('tick formatting retains minute and hour boundaries', () => {
    const { model } = setup().internal;
    for (const [ticks, expected] of [[0, '0:00'], [599999999, '0:59'], [600000000, '1:00'], [36610000000, '1:01:01']]) {
        assert.equal(model.ticksToTime(ticks), expected);
    }
});

test('direct and transcoded badge policy preserves ordering, units, and codec conversion', () => {
    const { model } = setup().internal;
    const direct = stream({ MediaStreams: [{ Type: 'Video', Codec: 'hevc', BitRate: 900000 }] });
    assert.deepEqual(Array.from(model.getBadges(direct), b => b.label), ['Direct Play', 'HEVC', '900 kbps']);
    const transcode = stream({ MediaStreams: [{ Type: 'Audio', Codec: 'truehd' }, { Type: 'Video', Codec: 'hevc' }] }, { PlayMethod: 'Transcode' });
    transcode.TranscodingInfo = { IsVideoDirect: false, VideoCodec: 'h264', AudioCodec: 'aac', Bitrate: 2500000,
        Width: 1920, Height: 1080, Framerate: 23.976, TranscodeReasons: ['AudioCodecNotSupported', 'VideoCodecNotSupported'] };
    assert.deepEqual(Array.from(model.getBadges(transcode), b => b.label), [
        'Transcoding', 'H264', 'AAC', '2.5 Mbps', '1920×1080', '24fps',
        'Audio Codec Not Supported', 'TRUEHD → AAC', 'Video Codec Not Supported', 'HEVC → H264'
    ]);
});

test('session cards retain episode labels, paused status, capped progress, and literal titles', () => {
    const { view } = setup().internal;
    const card = view.buildSessionCard(stream({ SeriesName: '<script>Series</script>', ParentIndexNumber: 2, IndexNumber: 3, RunTimeTicks: 600000000 }, { IsPaused: true, PositionTicks: 700000000 }));
    assert.equal(card.querySelector('.je-as-card-title').textContent, '<script>Series</script>');
    assert.equal(card.querySelector('.je-as-card-subtitle').textContent, 'S02E03 · <b>Movie</b>');
    assert.equal(card.querySelector('.je-as-state').textContent, 'Paused');
    assert.equal(card.querySelector('.je-as-progress-fill').style.width, '100.0%');
    assert.equal(card.querySelector('.je-as-progress-time').textContent, '1:10 / 1:00');
    assert.ok(card.querySelector('.je-as-poster-placeholder'));
});

test('panel replaces stale cards, filters idle sessions, and retains translated count and timestamp', () => {
    const { internal, JE, document } = setup();
    JE.t = key => key === 'active_streams_count' ? '{count} Stream|{count} Streams' : undefined;
    const node = panel(document);
    internal.view.renderPanel([stream(), {}, stream()], { toLocaleTimeString: () => '12:34:56' });
    assert.equal(node.querySelector('.je-as-panel-title').textContent, '2 Streams');
    assert.equal(node.querySelector('.je-as-panel-body').children.length, 2);
    assert.equal(node.querySelector('.je-as-panel-footer').textContent, 'Updated 12:34:56');
    internal.view.renderPanel([stream()], null);
    assert.equal(node.querySelector('.je-as-panel-title').textContent, '1 Stream');
    assert.equal(node.querySelector('.je-as-panel-body').children.length, 1);
    internal.view.renderPanel(null, null);
    assert.equal(node.querySelector('.je-as-panel-empty').textContent, 'No active streams');
});

test('styles are injected once and retain the public style ID', () => {
    const { internal, document } = setup();
    internal.injectStyles();
    internal.injectStyles();
    assert.equal(document.head.children.length, 1);
    assert.ok(document.getElementById('je-active-streams-styles').textContent.includes('#je-active-streams-panel'));
});

test('broadcast preserves request contract, never retries, and cancels the collapse timer on disposal', async () => {
    const calls = [];
    const { internal, document, timers } = setup({ api: async (...args) => { calls.push(args); return { sent: 2, skipped: 1, errors: ['failed'] }; } });
    const node = panel(document);
    const broadcast = internal.createBroadcast();
    broadcast.inject(node);
    broadcast.inject(node);
    const click = { stopPropagation() {} };
    node.querySelector('.je-as-broadcast-btn').listeners.click(click);
    node.querySelector('.je-as-broadcast-input').value = ' Test ';
    node.querySelector('.je-as-broadcast-textarea').value = ' Hello ';
    node.querySelector('.je-as-broadcast-timeout-input').value = '1.5';
    await node.querySelector('.je-as-broadcast-send').listeners.click(click);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['/active-streams/broadcast', {
        method: 'POST', body: { header: 'Test', text: 'Hello', timeoutMs: 1500 }, skipRetry: true
    }]]);
    assert.equal(node.querySelector('.je-as-broadcast-result').textContent, 'Sent to 2 of 3 sessions (1 error)');
    assert.equal(timers.size, 1);
    broadcast.destroy();
    assert.equal(timers.size, 0);
});

test('broadcast errors preserve server response text and re-enable sending', async () => {
    const { internal, document } = setup({ api: async () => { throw { status: 403, responseText: 'Forbidden' }; } });
    const node = panel(document);
    internal.createBroadcast().inject(node);
    node.querySelector('.je-as-broadcast-input').value = '';
    node.querySelector('.je-as-broadcast-textarea').value = 'Hello';
    node.querySelector('.je-as-broadcast-timeout-input').value = '';
    const send = node.querySelector('.je-as-broadcast-send');
    await send.listeners.click({ stopPropagation() {} });
    assert.equal(node.querySelector('.je-as-broadcast-result').textContent, 'Error: Forbidden');
    assert.equal(send.disabled, false);
});

test('controller rejects an old session response after destroy and enforces user visibility', async () => {
    let resolve;
    const { JE, context, document } = setup({ api: () => new Promise(done => { resolve = done; }) });
    vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'active-streams.js'), 'utf8'), context);
    JE.activeStreams.initialize();
    assert.ok(document.getElementById('je-active-streams'));
    JE.activeStreams.destroy();
    resolve([stream()]);
    await new Promise(done => setImmediate(done));
    assert.equal(document.getElementById('je-active-streams'), null);
    assert.equal(document.getElementById('je-active-streams-panel'), null);

    const nonAdmin = setup({ admin: false });
    vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'active-streams.js'), 'utf8'), nonAdmin.context);
    nonAdmin.JE.activeStreams.initialize();
    assert.equal(nonAdmin.document.getElementById('je-active-streams'), null);
});
