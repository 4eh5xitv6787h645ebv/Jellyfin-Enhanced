// The configuration page's design pass (council review round 1): markers and badges after the label text, What's new as
// a one-line banner under Service Status, the Save dock's read-only-tab rule, the phone drawer's focus handling, modal
// dialogs, the shortcut recorder's explicit record mode, and Show buttons on secrets. The generated page runs as the host
// runs it (bootGenerated): engine, sections, page script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootGenerated, closeAfter, config, settle } from '../../helpers/admin-config-page.mjs';

const WHATS_NEW = {
  pluginVersion: '12.16.0.0',
  // showFileSizes (a switch on Display), DefaultSubtitleStyle (a dropdown on Playback), and the whole Awards card.
  newSettings: { showFileSizes: '12.16.0.0', DefaultSubtitleStyle: '12.16.0.0', showAwards: '12.16.0.0' },
  mediaTags: {},
};

async function page(t, options = {}) {
  const h = bootGenerated({
    saved: { TMDB_API_KEY: 'key', JellyseerrApiKey: 'seerr-key' },
    ajax: r => (/\/whats-new$/.test(r.url) && r.type === 'GET' ? WHATS_NEW : /\/Plugins$/.test(r.url) ? [] : undefined),
    ...options,
  });
  closeAfter(t, h);
  await h.ready();
  h.show();
  await settle(h.window, 100);
  return h;
}

const key = (window, target, keyName, init = {}) => {
  const event = new window.KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

test('a New badge sits after the label text with the row\'s other markers, and a wholly new card is badged once on its title', async t => {
  const h = await page(t);
  const doc = h.document;
  const toggleBadge = doc.getElementById('showFileSizes').closest('label').querySelector('.je-new-badge');
  assert.ok(toggleBadge, 'the switch is badged');
  assert.ok(toggleBadge.parentElement.classList.contains('jea-marks'), 'inside the markers, after the text');
  assert.ok(toggleBadge.parentElement.previousElementSibling.classList.contains('jea-label-text'));
  const selectBadge = doc.querySelector('label[for="DefaultSubtitleStyle"] .je-new-badge');
  assert.ok(selectBadge, 'a dropdown\'s badge is in its label, not beside the control');
  assert.equal(doc.getElementById('DefaultSubtitleStyle').parentElement.querySelector(':scope > .je-new-badge'), null);
  const awards = doc.getElementById('showAwards').closest('fieldset');
  assert.equal(awards.querySelectorAll('.je-new-badge').length, 1, 'one badge for the wholly new card');
  assert.ok(awards.querySelector(':scope > legend > .je-new-badge'), 'on its title');
});

test('What\'s new is one line under Service Status, and Show lists the new settings by tab in sidebar order', async t => {
  const h = await page(t);
  const doc = h.document;
  const banner = doc.getElementById('je-whats-new-banner');
  assert.ok(banner);
  const status = doc.querySelector('#overview > fieldset');
  assert.equal(banner.previousElementSibling, status, 'directly below Service Status');
  // It counts what Show lists (fix round 2): one entry per card with new settings.
  assert.match(banner.querySelector('.je-whats-new-heading').textContent, /^3 sections have new settings in v12\.16\.0\.0$/);
  const list = banner.querySelector('.je-whats-new-list');
  assert.equal(list.hidden, true, 'the list starts closed');
  const show = banner.querySelector('.je-whats-new-toggle');
  assert.equal(show.getAttribute('aria-expanded'), 'false');
  show.click();
  assert.equal(list.hidden, false);
  assert.equal(show.getAttribute('aria-expanded'), 'true');
  assert.deepEqual([...list.querySelectorAll('.je-whats-new-tab')].map(e => e.textContent), ['Display', 'Playback'], 'tabs in sidebar order');
  for (const chip of list.querySelectorAll('.je-whats-new-chip')) assert.doesNotMatch(chip.getAttribute('aria-label'), />/, 'one separator style');
  assert.equal(banner.querySelector('.je-whats-new-release-link').firstChild.textContent, 'Release notes');
});

test('the page names the tab shown, which is what hides the Save dock on Overview, Credits and Docs while nothing is unsaved', async t => {
  const h = await page(t);
  const doc = h.document;
  const pageEl = doc.getElementById('JellyfinEnhancedPage');
  for (const id of ['display', 'about', 'overview']) {
    doc.querySelector(`.jea-nav .jellyfin-tab-button[data-tab="${id}"]`).click();
    await settle(h.window);
    assert.equal(pageEl.dataset.jeTab, id);
    assert.equal(doc.querySelector(`.jellyfin-tab-button[data-tab="${id}"]`).getAttribute('aria-current'), 'page');
    assert.equal(doc.querySelectorAll('.jellyfin-tab-button[aria-current]').length, 1);
  }
  const css = readFileSync(join(config, 'jeAdmin.css'), 'utf8');
  assert.match(css, /\[data-je-tab="overview"\], \[data-je-tab="about"\], \[data-je-tab="docs"\][^{]*\.je-save-dock:not\(\.je-dirty\)/, 'the stylesheet rule keyed off it');
});

test('the phone drawer moves focus in, makes the page behind inert, keeps Tab inside, and gives focus back on close', async t => {
  const h = await page(t);
  const doc = h.document;
  const toggle = doc.querySelector('.jea-nav-toggle');
  const bar = doc.querySelector('.jea-nav .je-tab-bar');
  const main = doc.querySelector('.jea-main');
  assert.match(toggle.getAttribute('aria-label'), /^Settings sections, showing /, 'a named trigger');
  toggle.focus();
  toggle.click();
  assert.ok(bar.contains(doc.activeElement), 'focus moved into the drawer');
  assert.equal(main.hasAttribute('inert'), true, 'the page behind is inert');
  assert.equal(bar.getAttribute('role'), 'dialog');
  const stops = [...bar.querySelectorAll('button, a[href]')];
  stops[stops.length - 1].focus();
  const tab = key(h.window, stops[stops.length - 1], 'Tab');
  assert.equal(tab.defaultPrevented, true);
  assert.equal(doc.activeElement, stops[0], 'Tab wraps to the first stop');
  key(h.window, doc, 'Escape');
  assert.equal(main.hasAttribute('inert'), false);
  assert.equal(doc.activeElement, toggle, 'focus is back on the trigger');
});

test('a confirmation traps focus, starts on Cancel and is described by its message', async t => {
  const h = await page(t);
  const doc = h.document;
  const answer = h.window.JEAdmin.confirm('This replaces every user\'s settings.', 'Apply to all users');
  await settle(h.window, 2);
  const dialog = doc.querySelector('.jea-dialog');
  assert.equal(doc.activeElement.textContent, 'Cancel', 'Enter cannot confirm by accident');
  assert.equal(doc.getElementById(dialog.getAttribute('aria-describedby')).textContent, 'This replaces every user\'s settings.');
  const [cancel, confirm] = dialog.querySelectorAll('button');
  confirm.focus();
  key(h.window, confirm, 'Tab');
  assert.equal(doc.activeElement, cancel, 'Tab stays in the dialog');
  key(h.window, cancel, 'Tab', { shiftKey: true });
  assert.equal(doc.activeElement, confirm, 'and Shift+Tab');
  key(h.window, doc, 'Escape');
  assert.equal(await answer, false);
  assert.equal(doc.querySelector('.jea-dialog'), null);
});

test('a shortcut key records only on purpose: Tab moves on, Escape cancels, a new key keeps focus, and restoring a default checks clashes', async t => {
  const h = await page(t);
  const doc = h.document;
  const row = name => [...doc.querySelectorAll('#shortcut-grid .je-sc-row')].find(r => r.dataset.scName === name);
  const chip = () => row('OpenSearch').querySelector('.je-sc-key');
  assert.equal(chip().tagName, 'BUTTON');
  assert.match(chip().getAttribute('aria-label'), /^Open Search: \/\. Press to record a new key$/);
  assert.match(row('OpenSearch').querySelector('.je-sc-btn').getAttribute('aria-label'), /^Turn off Open Search for every user$/);
  chip().focus();
  assert.equal(key(h.window, chip(), 'x').defaultPrevented, false, 'focus alone records nothing');
  assert.equal(chip().textContent, '/');
  chip().click();
  assert.equal(chip().getAttribute('aria-pressed'), 'true');
  assert.equal(key(h.window, chip(), 'Tab').defaultPrevented, false, 'Tab cancels and moves on');
  assert.equal(chip().getAttribute('aria-pressed'), 'false');
  chip().click();
  key(h.window, chip(), 'Escape');
  assert.equal(chip().textContent, '/', 'Escape cancels');
  assert.equal(doc.activeElement, chip(), 'and keeps focus');
  chip().click();
  key(h.window, chip(), 'j');
  assert.equal(chip().textContent, 'J', 'the new key is recorded');
  assert.equal(doc.activeElement, chip(), 'focus returns to the redrawn key');
  // Turn Go to Home off, give its default key (Shift+H) to Open Search, then try to turn Go to Home back on:
  // the same clash check refuses it.
  const home = () => row('GoToHome').querySelector('.je-sc-key');
  assert.equal(home().textContent, 'Shift+H');
  home().click();
  key(h.window, home(), 'Delete');
  assert.equal(home().textContent, 'Off');
  chip().click();
  key(h.window, chip(), 'H', { shiftKey: true });
  assert.equal(chip().textContent, 'Shift+H');
  row('GoToHome').querySelector('.je-sc-btn').click();
  assert.equal(home().textContent, 'Off', 'the default key is taken, so it is not restored');
  assert.match(doc.getElementById('shortcut-error-comment').textContent, /already used by 'Open Search'/);
});

test('every secret has a Show button and stays masked until it is pressed', async t => {
  const h = await page(t);
  const doc = h.document;
  for (const id of ['TMDB_API_KEY', 'TMDB_API_KEY--mirror', 'JellyseerrApiKey', 'mdblistApiKey', 'doesTheDogDieApiKey', 'LeavingSoonMaintainerrApiKey', 'ReclaimerrApiKey', 'shokoApiKey']) {
    const input = doc.getElementById(id);
    assert.ok(input, id);
    const button = input.closest('.je-secret')?.querySelector('.je-secret-toggle');
    assert.ok(button, `${id} has a Show button`);
    assert.equal(input.classList.contains('je-secret-shown'), false);
    assert.match(button.getAttribute('aria-label'), /^Show /);
    button.click();
    assert.equal(input.classList.contains('je-secret-shown'), true, id);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
  }
  const css = readFileSync(join(config, 'jeAdmin.css'), 'utf8');
  assert.doesNotMatch(css, /:hover[^{]*\{[^}]*text-security: none/, 'nothing is revealed by hovering');
});

// (Whether the sidebar lists a card's groups depends on the stylesheet, so that check runs in a browser:
// tests/browser/admin-config-rewrite.spec.cjs.)
