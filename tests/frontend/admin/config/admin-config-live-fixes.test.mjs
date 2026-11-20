// The configuration page's live bug hunt and the round 2 reviews (fix round 2): the leave guard and in-page links, the key
// recorder, quiet address writes, search (the card shown before it, both spellings), What's new, linked copies, the TMDB
// test, logos, the skip link and card headings, and the Media Tags People row. The generated page runs as the host runs
// it (bootGenerated); layout and stylesheet behaviour is checked in tests/browser/admin-config-rewrite.spec.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGenerated, closeAfter, settle } from '../../helpers/admin-config-page.mjs';
import { setup } from '../../helpers/admin-tags-page.mjs';

const WHATS_NEW = {
  pluginVersion: '12.16.0.0',
  newSettings: { showFileSizes: '12.16.0.0', DefaultSubtitleStyle: '12.8.0.0', showAwards: '12.16.0.0' },
  mediaTags: {},
};

async function page(t, { answers = [], getJSON, ...options } = {}) {
  const h = bootGenerated({
    saved: { TMDB_API_KEY: 'key', JellyseerrApiKey: 'seerr-key' },
    ajax: r => {
      const answer = answers.find(([pattern]) => pattern.test(r.url));
      if (answer) return answer[1](r);
      return /\/whats-new$/.test(r.url) && r.type === 'GET' ? WHATS_NEW : /\/Plugins$/.test(r.url) ? [] : undefined;
    },
    ...options,
  });
  closeAfter(t, h);
  if (getJSON) h.window.ApiClient.getJSON = getJSON;
  await h.ready();
  h.show();
  await settle(h.window, 100);
  h.window.console.error = () => {};
  h.window.console.warn = () => {};
  return h;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const tabButton = (h, id) => h.document.querySelector(`.jellyfin-tab-button[data-tab="${id}"]`);
const leaf = (h, title) => [...h.document.querySelectorAll('.jea-nav-leaf')].find(a => a.textContent === title);
const dialog = h => h.document.querySelector('.jea-dialog-backdrop');
const card = (h, title) => [...h.document.querySelectorAll('.jellyfin-tab-content.active > fieldset')]
  .find(f => f.querySelector(':scope > legend .jea-legend-title')?.textContent === title);
const cardParam = h => new URLSearchParams(h.window.location.hash.split('?')[1] ?? '').get('card');
const type = async (h, value) => {
  const input = h.document.getElementById('settingsSearchInput');
  input.value = value;
  input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  await wait(220);
  await settle(h.window);
};
/** The cards a search lists, by tab and title. */
const found = h => [...h.document.querySelectorAll('#JellyfinEnhancedForm > .jellyfin-tab-content > fieldset:not(.je-search-hidden)')]
  .filter(f => f.closest('.jellyfin-tab-content').style.display !== 'none')
  .map(f => f.closest('.jellyfin-tab-content').id + ' › ' + (f.querySelector(':scope > legend .jea-legend-title')?.textContent ?? ''));

test('with unsaved changes, sidebar entries and in-page links open in place without asking, and every exit asks, whatever was answered before', async t => {
  const h = await page(t);
  const doc = h.document;
  await wait(650); // the page records what it loaded 500 ms after loading
  tabButton(h, 'display').click();
  doc.getElementById('showFileSizes').click();
  await settle(h.window);
  assert.ok(doc.querySelector('.je-save-dock.je-dirty'), 'a change is unsaved');

  leaf(h, 'Spoiler Guard').click();
  await settle(h.window, 60);
  assert.equal(dialog(h), null, 'a sidebar entry does not leave the page');
  assert.ok(card(h, 'Spoiler Guard').classList.contains('jea-focus'), 'and opens its card');
  const inPage = doc.createElement('a');
  inPage.href = '#';
  doc.getElementById('display').append(inPage);
  inPage.click();
  await settle(h.window);
  assert.equal(dialog(h), null, 'a link to "#" is not a way out');

  const exit = doc.createElement('a');
  exit.href = '#/dashboard';
  doc.body.append(exit);
  exit.click();
  await settle(h.window);
  assert.ok(dialog(h), 'a link out of the page asks');
  dialog(h).querySelector('[data-r="2"]').click(); // Discard
  await settle(h.window, 60);
  assert.equal(h.window.location.hash, '#/dashboard', 'Discard lets that exit through');

  h.window.location.hash = '#/configurationpage?name=Jellyfin%20Enhanced&tab=display';
  await settle(h.window, 60);
  assert.ok(doc.querySelector('.je-save-dock.je-dirty'), 'still unsaved on return');
  exit.click();
  await settle(h.window);
  assert.ok(dialog(h), 'the next exit asks again');
  dialog(h).querySelector('[data-r="0"]').click(); // Stay
  await settle(h.window);
  assert.match(h.window.location.hash, /configurationpage/, 'Stay keeps the page');
});

test('while a shortcut key is recording, it is marked as a key recorder, so no shortcut runs on the key pressed', async t => {
  const h = await page(t);
  tabButton(h, 'keyboard').click();
  await settle(h.window);
  const chip = h.document.querySelector('[data-sc-name] .je-sc-key');
  assert.equal(chip.hasAttribute('data-je-key-recorder'), false, 'not while idle');
  chip.click();
  assert.equal(chip.getAttribute('aria-pressed'), 'true');
  assert.equal(chip.hasAttribute('data-je-key-recorder'), true, 'the shortcut listener stands aside while it records');
  chip.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(chip.hasAttribute('data-je-key-recorder'), false, 'and only while it records');
});

test('a tab or card shown writes the address quietly, through the plugin\'s writer, so it is not a site navigation', async t => {
  const quiet = [];
  const h = await page(t, { globals: { JellyfinEnhanced: { core: { navigation: { setAddressQuietly: (state, url, push) => quiet.push([url, !!push]) } } } } });
  let replaced = 0;
  const replace = h.window.history.replaceState.bind(h.window.history);
  h.window.history.replaceState = (...args) => { replaced++; return replace(...args); };
  tabButton(h, 'display').click();
  leaf(h, 'Spoiler Guard').click();
  await settle(h.window, 60);
  assert.ok(quiet.some(([url, push]) => /tab=display/.test(url) && !push), 'the tab, written in place');
  assert.ok(quiet.some(([url]) => /card=spoiler-guard/.test(url)), 'the card');
  assert.equal(replaced, 0, 'nothing written past the plugin');
});

test('clearing a search shows the card that was shown on its own before it again, and Escape keeps focus in the search box', async t => {
  const h = await page(t);
  const input = h.document.getElementById('settingsSearchInput');
  tabButton(h, 'display').click();
  leaf(h, 'Spoiler Guard').click();
  await settle(h.window, 60);
  assert.equal(cardParam(h), 'spoiler-guard');
  await type(h, 'seerr');
  assert.ok(h.document.getElementById('JellyfinEnhancedForm').classList.contains('je-search-mode'));
  h.document.getElementById('settingsSearchClear').click();
  await settle(h.window, 60);
  assert.equal(cardParam(h), 'spoiler-guard', 'the clear button brings the card back');
  assert.ok(card(h, 'Spoiler Guard').classList.contains('jea-focus'));

  input.focus();
  await type(h, 'seerr');
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await settle(h.window, 60);
  assert.equal(cardParam(h), 'spoiler-guard', 'so does Escape');
  assert.equal(h.document.activeElement, input, 'and focus stays in the search box');

  await type(h, 'seerr');
  await type(h, '');
  assert.equal(cardParam(h), 'spoiler-guard', 'and emptying the box');
});

test('search finds both spellings of a word, in either direction', async t => {
  const h = await page(t);
  const marks = () => h.document.querySelectorAll('#JellyfinEnhancedForm mark.je-search-match').length;
  for (const [british, american] of [['colour', 'color'], ['favourite', 'favorite'], ['customis', 'customiz'], ['behaviour', 'behavior']]) {
    await type(h, british);
    const fromBritish = [found(h), marks()];
    await type(h, american);
    const fromAmerican = [found(h), marks()];
    assert.ok(fromBritish[0].length > 0 && fromBritish[1] > 0, british + ' finds and highlights something');
    assert.deepEqual(fromAmerican, fromBritish, american + ' finds and highlights what ' + british + ' does');
    // One after another, as typed: a tab the previous search hid is searched again.
    await type(h, american === 'color' ? 'favourite' : 'color');
  }
});

test('What\'s new counts what it lists, badges only this release\'s settings, and a badge is not part of a control\'s name', async t => {
  const h = await page(t);
  const doc = h.document;
  const banner = doc.getElementById('je-whats-new-banner');
  const chips = banner.querySelectorAll('.je-whats-new-chip').length;
  assert.equal(chips, 3);
  assert.equal(banner.querySelector('.je-whats-new-heading').textContent, '3 sections have new settings (v12.8.0.0 to v12.16.0.0)');
  const badge = doc.getElementById('showFileSizes').closest('label').querySelector('.je-new-badge');
  assert.ok(badge, 'a setting new in this release is badged');
  assert.equal(badge.getAttribute('aria-hidden'), 'true', 'outside the switch\'s accessible name');
  assert.equal(doc.querySelector('label[for="DefaultSubtitleStyle"] .je-new-badge'), null, 'one from an older release is listed, not badged');
});

test('a linked copy does not carry a note that only makes sense on the original card', async t => {
  const h = await page(t);
  const original = h.document.querySelector('[data-desc-for="TMDB_API_KEY"]').textContent;
  const copy = h.document.querySelector('[data-desc-for="TMDB_API_KEY--mirror"]').textContent;
  assert.match(original, /The Services tab shows the same field/);
  assert.equal(h.document.querySelector('[data-desc-for="TMDB_API_KEY--mirror"]').closest('.jellyfin-tab-content').id, 'services');
  assert.doesNotMatch(copy, /Services tab/, 'not on the Services tab itself');
  assert.match(copy, /TMDB Reviews, Release Dates and per-season providers need it/, 'the rest of the note stays');
});

test('TMDB Test shows its result in the status indicator, not the Show button, and Overview reports the result for the key tested', async t => {
  const h = await page(t, { answers: [[/tmdb\/validate/, () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); }]] });
  const doc = h.document;
  const show = doc.querySelector('#elsewhere .je-api-row .je-secret-toggle i');
  assert.equal(show.textContent, 'visibility');
  doc.querySelector('#elsewhere .testTmdbBtn').click();
  await settle(h.window, 80);
  assert.equal(show.textContent, 'visibility', 'the Show button keeps its icon');
  assert.equal(doc.getElementById('tmdbStatusIndicator').textContent, 'error', 'the indicator says the key was refused');
  const status = () => doc.querySelector('#je-service-dashboard [data-status-id="tmdb"]');
  assert.match(status().className, /je-state-error/, 'Overview is not green for a refused key');
  assert.match(status().textContent, /API key rejected/);
  const key = doc.getElementById('TMDB_API_KEY');
  key.value = 'another-key';
  key.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  key.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  await settle(h.window, 60);
  tabButton(h, 'overview').click();
  await settle(h.window, 60);
  assert.doesNotMatch(status().className, /je-state-error|je-state-ok/, 'another key has no result yet');
  assert.match(status().textContent, /not tested/);
});

test('a logo that cannot load anywhere on the page becomes an icon', async t => {
  const h = await page(t);
  const doc = h.document;
  const holder = doc.createElement('span');
  holder.className = 'je-ta-card-icon je-ta-card-icon-img';
  holder.innerHTML = '<img alt="" src="http://jf.test/JellyfinEnhanced/cdn/selfhst/svg/tmdb.svg">';
  doc.getElementById('JellyfinEnhancedPage').append(holder);
  holder.querySelector('img').dispatchEvent(new h.window.Event('error'));
  assert.equal(holder.querySelector('img'), null, 'no broken image on the Media Tags card');
  assert.ok(holder.classList.contains('material-icons'));
  const source = doc.querySelector('.je-quality-cat-admin-row img');
  assert.ok(source, 'MDBList\'s rating sources have logos');
  const row = source.closest('.je-quality-cat-admin-row');
  source.dispatchEvent(new h.window.Event('error'));
  assert.equal(row.querySelector('img'), null);
  assert.ok(row.querySelector('i.material-icons'), 'a rating source logo falls back too');
});

test('"Skip to settings" is the page\'s first stop, card titles are headings, and no two boxes are both named "Movies"', async t => {
  const h = await page(t, { getJSON: async url => (/VirtualFolders/.test(url) ? [{ ItemId: 'a1', Name: 'Movies', CollectionType: 'movies' }] : []) });
  const doc = h.document;
  const stops = doc.querySelectorAll('#JellyfinEnhancedPage :is(a[href], button, input, select, textarea)');
  assert.ok(stops[0].classList.contains('jea-skip'), 'the first stop');
  assert.equal(stops[0].textContent, 'Skip to settings');
  tabButton(h, 'display').click();
  stops[0].click();
  assert.ok(doc.getElementById('display').contains(doc.activeElement), 'it moves focus into the tab shown');
  const legends = [...doc.querySelectorAll('#JellyfinEnhancedForm fieldset > legend.sectionTitle')];
  assert.ok(legends.length > 20);
  for (const legend of legends) {
    const heading = legend.querySelector('[role="heading"]');
    assert.ok(heading, 'a heading in ' + legend.textContent.trim());
    assert.equal(heading.getAttribute('aria-level'), '3');
  }
  const names = [...doc.querySelectorAll('#spoilerAutoEnableScopeContainer label')].map(label => label.textContent.trim());
  assert.equal(new Set(names).size, names.length, 'every box says what it is: ' + names.join(', '));
});

test('the Media Tags Overview\'s People button shows the People row and its switch instead of failing', async t => {
  const h = setup(t);
  await h.settle();
  assert.doesNotThrow(() => h.ctx.openTab('groups', { group: 'people', focus: true }));
  const row = h.$('.je-ta-grow[data-group="people"]');
  assert.equal(h.root.dataset.tab, 'groups');
  assert.ok(row.contains(h.document.activeElement), 'its switch has focus');
});

test('a card picked on another tab is dropped when a different tab is picked before it opens', async t => {
  const h = await page(t);
  tabButton(h, 'overview').click();
  leaf(h, 'Random Button').click(); // on Display, which opens first
  tabButton(h, 'admin').click();
  await wait(450);
  await settle(h.window);
  assert.equal(h.document.querySelector('.jellyfin-tab-content.active').id, 'admin');
  assert.equal(cardParam(h), null, 'no card from the other tab in the address');
  assert.equal(h.document.querySelector('.jellyfin-tab-content.jea-focused'), null, 'and no tab is showing one card');
});

test('switching Reclaimerr on and off again brings Maintainerr back, so nothing is left changed', async t => {
  const h = await page(t, { saved: { TMDB_API_KEY: 'key', LeavingSoonMaintainerrEnabled: true, ReclaimerrEnabled: false } });
  await wait(650);
  const maintainerr = h.document.getElementById('LeavingSoonMaintainerrEnabled');
  const reclaimerr = h.document.getElementById('ReclaimerrEnabled');
  const flip = input => { input.checked = !input.checked; input.dispatchEvent(new h.window.Event('change', { bubbles: true })); };
  flip(reclaimerr);
  assert.equal(maintainerr.checked, false, 'one choice: Maintainerr goes off');
  flip(reclaimerr);
  assert.equal(maintainerr.checked, true, 'and comes back');
  await settle(h.window);
  assert.equal(h.document.querySelector('.je-save-dock.je-dirty'), null, 'nothing unsaved');
});

test('a shortcut on the space bar is shown as "Space", not as a blank key', async t => {
  const h = await page(t);
  tabButton(h, 'keyboard').click();
  await settle(h.window);
  const row = [...h.document.querySelectorAll('[data-sc-name]')].find(r => r.dataset.scName === 'OpenSearch');
  row.querySelector('.je-sc-key').click();
  row.querySelector('.je-sc-key').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
  await settle(h.window);
  const chip = h.document.querySelector('[data-sc-name="OpenSearch"] .je-sc-key');
  assert.equal(chip.textContent, 'Space');
  assert.match(chip.getAttribute('aria-label'), /^Open Search: Space\./);
});
