const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const sourceRoot = path.resolve(__dirname, '../../client');
const modules = ['model', 'items', 'store', 'markers', 'modal-styles', 'modal'];
function load({ bookmarks = {}, enabled = true, save, items = {} } = {}) {
  const events = [];
  const requests = [];
  const saves = [];
  const listeners = new Map();
  const observers = new Set();
  const JE = {
    pluginConfig: { BookmarksEnabled: enabled },
    userConfig: { bookmark: { bookmarks } },
    t: value => value,
    toast() {},
    isVideoPage: () => false,
    helpers: {
      debounce: fn => fn,
      createObserver: id => observers.add(id),
      disconnectObserver: id => observers.delete(id),
    },
    async saveUserSettings(file, value) {
      saves.push({ file, value: structuredClone(value) });
      if (save) await save(file, value);
    },
  };
  const context = vm.createContext({
    window: { JellyfinEnhanced: JE },
    document: {
      querySelector: selector => selector.includes('btnUserRating') ? { dataset: { id: 'current' } } : null,
      dispatchEvent: event => events.push(event),
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
    },
    CustomEvent: function(type, options) { this.type = type; this.detail = options.detail; },
    ApiClient: {
      getCurrentUserId: () => 'user',
      getUrl: (url, query) => ({ url, query }),
      ajax: async request => { requests.push(request); return { Items: items[request.url.query.Ids] ? [items[request.url.query.Ids]] : [] }; },
    },
    console: { log() {}, warn() {}, error() {}, debug() {} },
    setTimeout,
    clearTimeout,
  });
  for (const suffix of modules) {
    const file = path.join(sourceRoot, `bookmarks-${suffix}.js`);
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'bookmarks.js'), 'utf8'), context);
  return { JE, events, requests, saves, listeners, observers, context };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('disabled bookmarks install no API or lifecycle', () => {
  const { JE } = load({ enabled: false });
  assert.equal(JE.bookmarks, undefined);
  assert.equal(JE.initializeBookmarks, undefined);
});

test('exact item matches take priority but retain fallback candidates', () => {
  const { JE } = load({ bookmarks: {
    exact: { itemId: 'current', timestamp: 8 },
    provider: { itemId: 'old', tmdbId: '42' },
    invalid: null,
    invalidPrimitive: 12,
  } });
  const result = plain(JE.bookmarks.findForItem('current', '42', null));
  assert.deepEqual(result.bookmarks.map(item => item.id), ['exact']);
  assert.equal(result.hasIdMismatch, false);
  assert.equal(result.providerMatches[0].exactMatch, false);
});

test('episode fallback rejects other episodes but preserves legacy bookmarks', () => {
  const { JE } = load({ bookmarks: {
    same: { itemId: 'old1', tmdbId: '42', seasonNumber: 1, episodeNumber: 2 },
    differentEpisode: { itemId: 'old2', tmdbId: '42', seasonNumber: 1, episodeNumber: 3 },
    differentSeason: { itemId: 'old3', tvdbId: '24', seasonNumber: 2, episodeNumber: 2 },
    legacy: { itemId: 'old4', tmdbId: '42' },
  } });
  const result = plain(JE.bookmarks.findForItem('current', '42', '24', 1, 2));
  assert.deepEqual(result.bookmarks.map(item => item.id), ['same', 'legacy']);
  assert.equal(result.hasIdMismatch, true);
});

test('formats timestamps without changing hour, minute or fractional-second rules', () => {
  const { JE } = load();
  assert.deepEqual([0, 59.9, 60, 3600, 3661].map(JE.bookmarks.formatTimestamp), ['0:00', '0:59', '1:00', '1:00:00', '1:01:01']);
});

const episodeItems = {
  current: { Id: 'current', Type: 'Episode', Name: 'Episode', SeriesId: 'series', ParentIndexNumber: 0, IndexNumber: 2, ProviderIds: { Tmdb: 'episodeTmdb', Tvdb: 'episodeTvdb' } },
  series: { Id: 'series', ProviderIds: { Tmdb: 'seriesTmdb', Tvdb: 'seriesTvdb' } },
};

test('adding an episode preserves serialized fields and provider precedence', async () => {
  const { JE, events, saves, requests } = load({ items: episodeItems });
  const result = await JE.bookmarks.add(12.5, 'Scene');
  assert.match(result.id, /^bm_/);
  assert.deepEqual(plain({ ...result, id: undefined, createdAt: undefined, updatedAt: undefined }), {
    itemId: 'current', tmdbId: 'seriesTmdb', tvdbId: 'episodeTvdb', mediaType: 'tv', name: 'Episode',
    timestamp: 12.5, label: 'Scene', syncedFrom: '', seasonNumber: 0, episodeNumber: 2,
  });
  assert.equal(saves[0].file, 'bookmark.json');
  assert.equal(events[0].type, 'je-bookmarks-updated');
  assert.equal(events[0].detail.reason, 'add');
  await JE.bookmarks.add(18);
  assert.equal(requests.length, 2, 'same item details are cached, including series provider lookup');
});

test('failed add rolls back inserted bookmark and emits no update', async () => {
  const { JE, events } = load({ items: episodeItems, save: () => { throw new Error('offline'); } });
  await assert.rejects(JE.bookmarks.add(10), /offline/);
  assert.deepEqual(Object.keys(JE.userConfig.bookmark.bookmarks), []);
  assert.equal(events.length, 0);
});

test('sync keeps originals, clamps offset and carries provenance and episode coordinates', async () => {
  const original = { itemId: 'old', timestamp: 5, label: 'Intro', createdAt: 'original-date' };
  const { JE, events } = load({ bookmarks: { original } });
  const synced = await JE.bookmarks.syncBookmarks([original], { itemId: 'replacement', seasonNumber: 0, episodeNumber: 2 }, -10);
  assert.equal(synced[0].timestamp, 0);
  assert.equal(synced[0].syncedFrom, 'old');
  assert.equal(synced[0].createdAt, 'original-date');
  assert.equal(synced[0].seasonNumber, 0);
  assert.equal(JE.userConfig.bookmark.bookmarks.original, original);
  assert.equal(events[0].detail.reason, 'sync');
});

test('failed sync rolls back duplicates and keeps original', async () => {
  const original = { itemId: 'old', timestamp: 5 };
  const { JE } = load({ bookmarks: { original }, save: () => { throw new Error('offline'); } });
  await assert.rejects(JE.bookmarks.syncBookmarks([original], { itemId: 'replacement' }), /offline/);
  assert.deepEqual(Object.keys(JE.userConfig.bookmark.bookmarks), ['original']);
});

test('update and delete retain public success and missing-record behavior', async () => {
  const { JE, events } = load({ bookmarks: { existing: { itemId: 'current', label: 'before' } } });
  assert.equal(await JE.bookmarks.update('missing', {}), false);
  assert.equal(await JE.bookmarks.delete('missing'), false);
  assert.equal(await JE.bookmarks.update('existing', { label: 'after' }), true);
  assert.equal(JE.userConfig.bookmark.bookmarks.existing.label, 'after');
  assert.equal(await JE.bookmarks.delete('existing'), true);
  assert.deepEqual(events.map(event => event.detail.reason), ['update', 'delete']);
});

test('initialization is idempotent and cleanup removes listeners before reinitialization', () => {
  const { JE, listeners } = load();
  JE.initializeBookmarks();
  assert.equal(listeners.size, 3);
  const first = listeners.get('playing');
  JE.initializeBookmarks();
  assert.equal(listeners.get('playing'), first);
  JE.cleanupBookmarks();
  assert.equal(listeners.size, 0);
  JE.initializeBookmarks();
  assert.equal(listeners.size, 3);
  assert.notEqual(listeners.get('playing'), first);
  JE.cleanupBookmarks();
});

test('current-video marker rendering preserves position, label, and seek interaction', async () => {
  const { JE, context } = load({ items: episodeItems, bookmarks: {
    scene: { itemId: 'current', timestamp: 25, label: 'Scene' },
  } });
  const video = { duration: 100, currentTime: 0 };
  const slider = { style: {}, children: [], querySelectorAll: () => [], appendChild(child) { this.children.push(child); } };
  const position = { closest: () => slider };
  context.window.getComputedStyle = () => ({ position: 'static' });
  context.document.querySelector = selector => {
    if (selector.includes('btnUserRating')) return { dataset: { id: 'current' } };
    if (selector === '.videoPlayerContainer video') return video;
    if (selector === '.videoOsdBottom') return { querySelector: () => position };
    return null;
  };
  context.document.createElement = () => ({
    style: {}, children: [], handlers: {},
    appendChild(child) { this.children.push(child); },
    addEventListener(name, handler) { this.handlers[name] = handler; },
  });
  await JE.bookmarks.updateMarkers();
  assert.equal(slider.style.position, 'relative');
  assert.equal(slider.children.length, 1);
  const marker = slider.children[0];
  assert.match(marker.style.cssText, /left: 25%/);
  assert.equal(marker.title, 'Scene - 0:25');
  marker.handlers.click({ stopPropagation() {} });
  assert.equal(video.currentTime, 25);
});

test('modal keeps embedded styles and removes navigation listener after close animation', async () => {
  const { JE, context, listeners } = load({ items: episodeItems });
  const timers = [];
  context.setTimeout = callback => timers.push(callback);
  const controls = new Map();
  function control(selector) {
    if (!controls.has(selector)) controls.set(selector, { handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, focus() {} });
    return controls.get(selector);
  }
  const modal = {
    style: {}, handlers: {}, removed: false,
    querySelector: control,
    querySelectorAll: () => [],
    addEventListener(name, fn) { this.handlers[name] = fn; },
    remove() { this.removed = true; },
  };
  context.document.createElement = () => modal;
  context.document.body = { appendChild(value) { assert.equal(value, modal); } };
  await JE.bookmarks.showModal();
  assert.match(modal.innerHTML, /<style>[\s\S]*\.je-bm-player-modal-overlay/);
  assert.match(modal.innerHTML, /value="0:00"/);
  assert.match(modal.innerHTML, /bookmark_add_title/);
  assert.equal(listeners.has('viewshow'), true);
  controls.get('.je-bookmark-btn-cancel').handlers.click();
  assert.equal(modal.style.opacity, '0');
  timers.forEach(callback => callback());
  assert.equal(modal.removed, true);
  assert.equal(listeners.has('viewshow'), false);
});
