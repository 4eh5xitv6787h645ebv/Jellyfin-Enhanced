import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGenerated, settle } from '../../helpers/admin-config-page.mjs';

// Saves of the settings page against what is stored: a list that did not load is unknown, not empty.

const USER_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USER_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const failed = () => Promise.reject(Object.assign(new Error('Bad Gateway'), { status: 502 }));
const pending = () => new Promise(() => {});

/** The generated page, loaded from `saved`, with `answers` replying to the requests whose URL they match. */
async function page(t, { saved = {}, answers = [] } = {}) {
  const h = bootGenerated({ saved, ajax: r => answers.find(([pattern]) => pattern.test(r.url))?.[1](r) });
  t.after(() => h.close());
  await h.ready();
  h.show();
  await settle(h.window, 60);
  h.submit = async () => {
    h.document.querySelector('#JellyfinEnhancedForm').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    await settle(h.window, 120);
  };
  h.lastPut = () => h.calls.puts.at(-1);
  h.posted = path => h.calls.ajax.filter(r => r.type === 'POST' && new URL(r.url).pathname === path).map(r => JSON.parse(r.data));
  return h;
}

const selectedMaintenance = { MaintenanceModeEnabled: true, MaintenanceModeAction: 'disable_accounts', MaintenanceModeAffectedUsers: JSON.stringify([USER_A]) };

for (const [what, answer] of [['failed to load', failed], ['has not answered yet', pending]]) {
  test(`FR-035: with the maintenance user list that ${what}, a save keeps the stored selection and maintenance keeps its targets`, async t => {
    const h = await page(t, { saved: selectedMaintenance, answers: [[/MaintenanceMode\/Users/, answer]] });
    assert.equal(h.document.getElementById('mmUsers_select').checked, true, 'the page shows "Select specific users"');
    assert.equal(h.document.querySelectorAll('.je-mm-user-cb').length, 0, 'no user boxes to read');
    await h.submit();
    assert.equal(h.calls.puts.length, 1);
    assert.equal(h.lastPut().MaintenanceModeAffectedUsers, JSON.stringify([USER_A]), 'not "[]", which means every non-administrator');
    assert.deepEqual(h.posted('/JellyfinEnhanced/MaintenanceMode/Enable').map(b => b.affectedUserIds), [[USER_A]]);
  });
}

test('FR-035 control: with the user list loaded, a save stores the users ticked', async t => {
  const users = [{ id: USER_A, username: 'child', hasImage: false }, { id: USER_B, username: 'guest', hasImage: false }];
  const h = await page(t, { saved: selectedMaintenance, answers: [[/MaintenanceMode\/Users/, () => users]] });
  assert.deepEqual([...h.document.querySelectorAll('.je-mm-user-cb')].map(cb => [cb.value, cb.checked]), [[USER_A, true], [USER_B, false]]);
  h.document.querySelector(`.je-mm-user-cb[value="${USER_B}"]`).checked = true;
  h.document.querySelector(`.je-mm-user-cb[value="${USER_A}"]`).checked = false;
  await h.submit();
  assert.equal(h.lastPut().MaintenanceModeAffectedUsers, JSON.stringify([USER_B]));
  assert.deepEqual(h.posted('/JellyfinEnhanced/MaintenanceMode/Enable').map(b => b.affectedUserIds), [[USER_B]]);
});

const customMovieRequests = {
  AutoMovieRequestEnabled: true, AutoMovieRequestQualityMode: 'custom',
  AutoMovieRequestCustomServerId: 2, AutoMovieRequestCustomProfileId: 7, AutoMovieRequestCustomRootFolder: '/movies4k',
};
const radarrServers = () => [{ id: 0, name: 'Radarr', is4k: false }, { id: 2, name: 'Radarr 4K', is4k: true }];
const radarrDetails = () => ({ profiles: [{ id: 7, name: 'UHD' }, { id: 8, name: 'HD' }], rootFolders: [{ path: '/movies' }, { path: '/movies4k' }] });
const autoMovie = put => [put.AutoMovieRequestCustomServerId, put.AutoMovieRequestCustomProfileId, put.AutoMovieRequestCustomRootFolder];

for (const [what, saved, answers] of [
  ['Seerr\'s server list failed', customMovieRequests, [[/jellyseerr\/radarr$/, failed]]],
  ['Seerr\'s server list has not answered', customMovieRequests, [[/jellyseerr\/radarr$/, pending]]],
  ['the server\'s profiles and folders failed', customMovieRequests, [[/jellyseerr\/radarr$/, radarrServers], [/jellyseerr\/radarr\/2$/, failed]]],
  ['the mode is not "Custom", so nothing was loaded', { ...customMovieRequests, AutoMovieRequestQualityMode: 'default' }, []],
]) {
  test(`FR-036: when ${what}, a save keeps the stored automatic-request server, profile and folder`, async t => {
    const h = await page(t, { saved, answers });
    await h.submit();
    assert.equal(h.calls.puts.length, 1);
    assert.deepEqual(autoMovie(h.lastPut()), [2, 7, '/movies4k']);
  });
}

test('FR-036 control: with the lists loaded, a save stores what the selects show', async t => {
  const h = await page(t, { saved: customMovieRequests, answers: [[/jellyseerr\/radarr$/, radarrServers], [/jellyseerr\/radarr\/2$/, radarrDetails]] });
  assert.equal(h.document.getElementById('autoMovieRequestProfile').value, '7', 'the stored profile is shown');
  h.document.getElementById('autoMovieRequestProfile').value = '8';
  await h.submit();
  assert.deepEqual(autoMovie(h.lastPut()), [2, 8, '/movies4k']);
});

test('FR-036 control: picking another server whose details fail stores that server with Seerr\'s default profile and folder', async t => {
  const h = await page(t, { saved: customMovieRequests, answers: [[/jellyseerr\/radarr$/, radarrServers], [/jellyseerr\/radarr\/2$/, radarrDetails], [/jellyseerr\/radarr\/0$/, failed]] });
  const server = h.document.getElementById('autoMovieRequestServer');
  server.value = '0';
  server.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  await settle(h.window, 40);
  await h.submit();
  assert.deepEqual(autoMovie(h.lastPut()), [0, 0, ''], 'the stored profile and folder belong to the other server');
});

const locales = () => ['en', 'de', 'fr'];
const cultures = () => [{ TwoLetterISOLanguageName: 'en', DisplayName: 'English' }, { TwoLetterISOLanguageName: 'de', DisplayName: 'German' }, { TwoLetterISOLanguageName: 'fr', DisplayName: 'French' }];

test('FR-036: when the language list fails, a save keeps the stored default language', async t => {
  const h = await page(t, { saved: { DefaultLanguage: 'de' }, answers: [[/JellyfinEnhanced\/locales/, failed], [/Localization\/Cultures/, cultures]] });
  await h.submit();
  assert.equal(h.lastPut().DefaultLanguage, 'de');
});

test('FR-036: when the language list arrives after the settings, the stored default language is shown and kept', async t => {
  let release;
  const late = new Promise(resolve => { release = resolve; });
  const h = await page(t, { saved: { DefaultLanguage: 'de' }, answers: [[/JellyfinEnhanced\/locales/, () => late.then(locales)], [/Localization\/Cultures/, cultures]] });
  release();
  await settle(h.window, 40);
  const select = h.document.getElementById('DefaultLanguage');
  assert.equal(select.value, 'de');
  assert.deepEqual([...select.options].map(o => o.textContent), ['System Default', 'English', 'French', 'German'], 'each language once, by name');
  await h.submit();
  assert.equal(h.lastPut().DefaultLanguage, 'de');
});

test('FR-036 control: with the language list in first, the admin\'s pick is saved', async t => {
  const h = await page(t, { saved: { DefaultLanguage: 'de' }, answers: [[/JellyfinEnhanced\/locales/, locales], [/Localization\/Cultures/, cultures]] });
  const select = h.document.getElementById('DefaultLanguage');
  assert.equal(select.value, 'de');
  select.value = 'fr';
  await h.submit();
  assert.equal(h.lastPut().DefaultLanguage, 'fr');
});
