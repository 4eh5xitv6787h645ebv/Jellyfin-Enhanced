// The configuration page's live bug hunt and the round 2 reviews (fix round 2): the leave guard and in-page links, the key
// recorder, quiet address writes, search (the card shown before it, both spellings), What's new, linked copies, the TMDB
// test, logos, the skip link and card headings, and the Media Tags People row. The generated page runs as the host runs
// it (bootGenerated); layout and stylesheet behaviour is checked in tests/browser/admin-config-rewrite.spec.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGenerated, settle } from '../../helpers/admin-config-page.mjs';
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
  t.after(() => h.close());
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

test('the Media Tags Overview\'s People button shows the People row and its switch instead of failing', async t => {
  const h = setup(t);
  await h.settle();
  assert.doesNotThrow(() => h.ctx.openTab('groups', { group: 'people', focus: true }));
  const row = h.$('.je-ta-grow[data-group="people"]');
  assert.equal(h.root.dataset.tab, 'groups');
  assert.ok(row.contains(h.document.activeElement), 'its switch has focus');
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
