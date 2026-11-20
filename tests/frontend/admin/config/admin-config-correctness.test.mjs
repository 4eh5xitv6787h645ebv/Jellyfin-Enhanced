import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootGenerated, repo, settle } from '../../helpers/admin-config-page.mjs';

// Behaviour of the settings page's actions and status views, driven through the generated page.

const USER_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USER_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const USERS = [{ id: USER_A, username: 'child', hasImage: false }, { id: USER_B, username: 'guest', hasImage: false }];
const SEERR = { JellyseerrEnabled: true, JellyseerrUrls: 'http://seerr.test', JellyseerrApiKey: 'k' };

/** The generated page, loaded from `saved`; `answers` reply to the requests whose URL they match (a thrown error is a failed request). */
async function page(t, { saved = {}, answers = [], ...options } = {}) {
  const h = bootGenerated({ saved, ajax: r => answers.find(([pattern]) => pattern.test(r.url))?.[1](r), ...options });
  t.after(() => h.close());
  await h.ready();
  h.show();
  await settle(h.window, 60);
  h.window.console.error = () => {};
  h.window.console.warn = () => {};
  h.submit = async () => {
    h.document.querySelector('#JellyfinEnhancedForm').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    await settle(h.window, 120);
  };
  h.posted = path => h.calls.ajax.filter(r => r.type === 'POST' && new URL(r.url).pathname === path).map(r => JSON.parse(r.data || 'null'));
  h.dialogs = () => [...h.document.querySelectorAll('.jea-dialog')].map(d => d.textContent);
  h.boxes = () => [...h.document.querySelectorAll('.je-mm-user-cb')].map(cb => [cb.value, cb.checked]);
  h.radio = id => { const r = h.document.getElementById(id); r.checked = true; r.dispatchEvent(new h.window.Event('change', { bubbles: true })); };
  h.feature = name => [...h.document.querySelectorAll('#je-features-dashboard .je-feature-row')].find(row => row.querySelector('.je-feature-name').textContent === name);
  h.service = id => h.document.querySelector(`#je-service-dashboard [data-status-id="${id}"]`);
  return h;
}

// ── Maintenance mode ────────────────────────────────────────────────────────────

for (const [what, saved] of [
  ['maintenance mode on', { MaintenanceModeEnabled: true }],
  ['the daily schedule on', { MaintenanceScheduleEnabled: true }],
]) {
  test(`with ${what}, "Select specific users" with nobody ticked is refused, says why, and keeps the form`, async t => {
    const h = await page(t, {
      saved: { ...saved, MaintenanceModeAction: 'disable_accounts', MaintenanceModeAffectedUsers: JSON.stringify([USER_A]) },
      answers: [[/MaintenanceMode\/Users/, () => USERS]],
    });
    h.document.getElementById('je-mm-deselect-all').click();
    await h.submit();
    assert.equal(h.calls.puts.length, 0, 'nothing was saved');
    assert.deepEqual(h.posted('/JellyfinEnhanced/MaintenanceMode/Enable'), [], 'nobody was locked out');
    assert.match(h.dialogs().join(' '), /at least one user/, 'the administrator is told why');
    assert.equal(h.document.getElementById('mmUsers_select').checked, true, 'the choice stays');
    assert.deepEqual(h.boxes(), [[USER_A, false], [USER_B, false]], 'the boxes stay as they were');
  });
}

test('maintenance for every non-admin user is sent as "all users", not as an empty selection', async t => {
  const h = await page(t, { saved: { MaintenanceModeEnabled: true, MaintenanceModeAffectedUsers: 'all' } });
  await h.submit();
  assert.equal(h.calls.puts.length, 1);
  assert.deepEqual(h.posted('/JellyfinEnhanced/MaintenanceMode/Enable').map(b => b.affectedUserIds), [null]);
});

test('a maintenance switch the server refused is reported, apart from the settings that were saved', async t => {
  const h = await page(t, {
    saved: { MaintenanceModeAffectedUsers: 'all' },
    answers: [[/MaintenanceMode\/Enable/, () => { throw Object.assign(new Error('Internal Server Error'), { status: 500 }); }]],
  });
  h.document.getElementById('maintenanceModeEnabled').checked = true;
  await h.submit();
  assert.equal(h.calls.puts.length, 1, 'the settings were saved');
  assert.match(h.dialogs().join(' '), /saved, but maintenance mode could not be turned on/);
});

test('switching the affected users to "All" and back keeps the boxes the administrator ticked', async t => {
  const h = await page(t, {
    saved: { MaintenanceModeAffectedUsers: JSON.stringify([USER_A]) },
    answers: [[/MaintenanceMode\/Users/, () => USERS]],
  });
  assert.deepEqual(h.boxes(), [[USER_A, true], [USER_B, false]]);
  h.document.querySelector(`.je-mm-user-cb[value="${USER_A}"]`).checked = false;
  h.document.querySelector(`.je-mm-user-cb[value="${USER_B}"]`).checked = true;
  h.radio('mmUsers_all');
  await settle(h.window);
  h.radio('mmUsers_select');
  await settle(h.window, 60);
  assert.deepEqual(h.boxes(), [[USER_A, false], [USER_B, true]]);
});

// ── Seerr: Import Users Now ─────────────────────────────────────────────────────

test('Import Users Now does not import when the save before it failed', async t => {
  const h = await page(t, { saved: SEERR });
  let imports = 0;
  h.window.ApiClient.fetch = async () => { imports++; return { usersImported: 0, totalUsers: 0 }; };
  h.window.ApiClient.updatePluginConfiguration = async () => { throw Object.assign(new Error('Bad Request'), { status: 400 }); };
  h.document.getElementById('btnImportJellyseerrUsers').click();
  await settle(h.window, 120);
  assert.equal(imports, 0, 'no import with the old settings');
  assert.match(h.document.getElementById('importUsersResult').textContent, /Import was not attempted/);
  assert.equal(h.document.getElementById('btnImportJellyseerrUsers').disabled, false);
});

test('Import Users Now does not import when the save before it was refused', async t => {
  const h = await page(t, {
    saved: { ...SEERR, MaintenanceModeAffectedUsers: JSON.stringify([USER_A]) },
    answers: [[/MaintenanceMode\/Users/, () => USERS]],
  });
  h.document.getElementById('je-mm-deselect-all').click();
  let imports = 0;
  h.window.ApiClient.fetch = async () => { imports++; return {}; };
  h.document.getElementById('btnImportJellyseerrUsers').click();
  await settle(h.window, 120);
  assert.equal(h.calls.puts.length, 0, 'nothing was saved');
  assert.equal(imports, 0, 'no import with the old settings');
  assert.match(h.document.getElementById('importUsersResult').textContent, /Import was not attempted/);
});

// ── Overview: Re-test all service connections ───────────────────────────────────

test('Re-test all tests each enabled Sonarr and Radarr instance, and skips TMDB without a key', async t => {
  const instances = [
    { Name: 'TV', Url: 'http://sonarr.test', ApiKey: 'tv-key', Enabled: true },
    { Name: 'Old', Url: 'http://old-sonarr.test', ApiKey: 'old-key', Enabled: false },
  ];
  const h = await page(t, {
    saved: { SonarrInstances: JSON.stringify(instances), RadarrInstances: JSON.stringify([{ Name: 'Movies', Url: 'http://radarr.test', ApiKey: 'm-key', Enabled: true }]) },
    answers: [[/arr\/validate/, () => ({})]],
  });
  h.document.getElementById('retestAllConnectionsBtn').click();
  await settle(h.window, 80);
  const tested = h.calls.ajax.filter(r => /validate/.test(r.url)).map(r => new URL(r.url).pathname + ' ' + new URL(r.url).searchParams.get('url'));
  assert.deepEqual(tested.sort(), ['/JellyfinEnhanced/arr/validate/radarr http://radarr.test', '/JellyfinEnhanced/arr/validate/sonarr http://sonarr.test']);
  assert.doesNotMatch(h.dialogs().join(' '), /Missing Information/, 'no prompt for the missing TMDB key');
});

// ── Services: linked copies of buttons ─────────────────────────────────────────

test('the Services copy of an action button is disabled while its original is', async t => {
  const h = await page(t, { answers: [[/admin\/leaving-soon/, () => ({ Configured: false, Maintainerr: false, HomeRow: 'off', Items: 0, Dated: 0 })]] });
  await settle(h.window, 20);
  assert.equal(h.document.getElementById('maintainerrRefreshBtn').disabled, true);
  assert.equal(h.document.getElementById('maintainerrRefreshBtn--mirror').disabled, true);
});

// ── *arr test results ───────────────────────────────────────────────────────────

test('two Sonarr instances at one address with different keys each show their own test result', async t => {
  const instances = [
    { Name: 'Good', Url: 'http://sonarr.test', ApiKey: 'good-key', Enabled: true },
    { Name: 'Bad', Url: 'http://sonarr.test/', ApiKey: 'bad-key', Enabled: true },
  ];
  const h = await page(t, {
    saved: { SonarrInstances: JSON.stringify(instances) },
    answers: [[/arr\/validate/, r => { if (r.headers['X-Arr-ApiKey'] !== 'good-key') throw Object.assign(new Error('Unauthorized'), { status: 401 }); return {}; }]],
  });
  h.window.Dashboard.alert = () => {};
  const tests = [...h.document.querySelectorAll('#sonarrInstancesList .arr-instance-test')];
  tests[0].click();
  await settle(h.window, 40);
  tests[1].click();
  await settle(h.window, 40);
  const cards = [...h.document.querySelectorAll('#je-service-dashboard .je-service-card')].filter(c => /Good|Bad/.test(c.textContent));
  const byName = Object.fromEntries(cards.map(c => [c.querySelector('.je-service-name').textContent, c.querySelector('.je-service-detail').textContent]));
  assert.deepEqual(byName, { Good: 'Connected', Bad: 'API key rejected' });
});

// ── Overview: Service Status and Features ──────────────────────────────────────

test('Calendar and Requests are not shown as ready with only a disabled *arr instance or Seerr switched off', async t => {
  const h = await page(t, {
    saved: {
      CalendarPageEnabled: true, DownloadsPageEnabled: true, JellyseerrEnabled: false, JellyseerrUrls: 'http://seerr.test', JellyseerrApiKey: 'k',
      SonarrInstances: JSON.stringify([{ Name: 'Off', Url: 'http://sonarr.test', ApiKey: 'k', Enabled: false }]),
    },
  });
  assert.match(h.feature('Calendar Page').className, /je-state-warn/);
  assert.match(h.feature('Requests Page').className, /je-state-warn/);
});

test('Calendar is ready with Shoko alone', async t => {
  const h = await page(t, { saved: { CalendarPageEnabled: true, ShokoUrl: 'http://shoko.test', ShokoApiKey: 'k' } });
  assert.match(h.feature('Calendar Page').className, /je-state-on/);
});

test('the Seerr status card does not accept an address that is not http(s)', async t => {
  const h = await page(t, { saved: { JellyseerrEnabled: true, JellyseerrUrls: 'seerr.local', JellyseerrApiKey: 'k' } });
  assert.match(h.service('seerr').className, /je-state-warn/);
});

test('the Features list counts each watchlist direction and names only the tab-switch actions that are on', async t => {
  const h = await page(t, { saved: { SyncJellyfinWatchlistToSeerr: true, AutoPauseEnabled: true, AutoResumeEnabled: false, AutoPipEnabled: false } });
  assert.doesNotMatch(h.feature('Watchlist sync').textContent, /Disabled/);
  assert.equal(h.feature('Tab-switch actions').querySelector('.je-feature-detail').textContent, 'Auto-pause');
});

test('the Features list includes every main feature that is on, and Media Tags opens its own tab', async t => {
  const h = await page(t, {
    saved: {
      SpoilerBlurEnabled: true, ActivityFeedEnabled: true, CatchUpEnabled: true, RecommendationsPageEnabled: true,
      ShowUserReviews: true, ShowAwards: true, ActiveStreamsEnabled: true, LeavingSoonPageEnabled: true,
      QualityTagsEnabled: true,
    },
  });
  for (const name of ['Spoiler Guard', 'Activity Feed', 'Catch Up', 'Seerr Recommendations', 'User Reviews', 'Awards', 'Active Streams', 'Leaving Soon page']) {
    assert.ok(h.feature(name), name + ' is listed');
    assert.doesNotMatch(h.feature(name).textContent, /Disabled/, name);
  }
  assert.equal(h.feature('Media Tags').getAttribute('data-target'), 'media-tags');
});

test('the removal-tool card does not show the saved tool\'s status under the name of the one just switched on', async t => {
  const status = { Configured: true, Maintainerr: true, Provider: 'maintainerr', HomeRow: 'off', Items: 4, Dated: 3, LastSuccess: Date.UTC(2026, 9, 30, 9), LastError: null };
  const h = await page(t, {
    saved: { LeavingSoonMaintainerrEnabled: true, LeavingSoonMaintainerrUrl: 'http://maintainerr.test', LeavingSoonMaintainerrApiKey: 'k', ReclaimerrUrl: 'http://reclaimerr.test' },
    answers: [[/admin\/leaving-soon/, () => status]],
  });
  await settle(h.window, 20);
  assert.match(h.service('maintainerr').textContent, /4 item\(s\) leaving/, 'the saved tool shows its status');
  const reclaimerr = h.document.getElementById('ReclaimerrEnabled');
  reclaimerr.checked = true;
  reclaimerr.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  await settle(h.window, 20);
  h.document.getElementById('retestAllConnectionsBtn').click();
  await settle(h.window, 20);
  const card = h.service('maintainerr');
  assert.equal(card.querySelector('.je-service-name').textContent, 'Reclaimerr');
  assert.doesNotMatch(card.textContent, /item\(s\) leaving/);
});

// ── Playback: toast and panel timing ───────────────────────────────────────────

test('the toast duration\'s documented and empty-field default is the server\'s 1500 ms', async t => {
  const h = await page(t, { saved: { ToastDuration: 4000 } });
  assert.match(h.document.querySelector('[data-desc-for="ToastDuration"]').textContent, /Default: 1500 ms/);
  h.document.getElementById('ToastDuration').value = '';
  await h.submit();
  assert.equal(h.calls.puts.at(-1).ToastDuration, 1500);
});

test('the previews use the playback limits: no cap on the toast, and a short panel delay is used as typed', async t => {
  const h = await page(t);
  const toast = value => {
    h.document.getElementById('ToastDuration').value = value;
    h.document.getElementById('jeTestToast').click();
    return h.document.querySelector('.je-preview-toast').textContent;
  };
  assert.equal(toast(''), 'Example toast, disappears in 1.5s');
  assert.equal(toast('200000'), 'Example toast, disappears in 200.0s');
  h.document.getElementById('HelpPanelAutocloseDelay').value = '100';
  h.document.getElementById('jeTestShortcutsPanel').click();
  assert.equal(h.document.querySelector('.je-preview-panel-countdown').textContent, '0.1s');
});

for (const [how, close] of [
  ['Close now', h => h.document.querySelector('.je-preview-panel-actions button').click()],
  ['Escape', h => h.document.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
  ['a click outside', h => h.document.querySelector('.je-preview-panel-overlay').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }))],
  ['its own timer', async h => { await new Promise(r => setTimeout(r, 350)); }],
]) {
  test(`closing the autoclose preview by ${how} puts focus back on the preview button`, async t => {
    const h = await page(t);
    h.document.getElementById('HelpPanelAutocloseDelay').value = '300';
    const button = h.document.getElementById('jeTestShortcutsPanel');
    button.focus();
    button.click();
    assert.notEqual(h.document.activeElement, button, 'the preview takes focus');
    await close(h);
    await settle(h.window);
    assert.equal(h.document.querySelector('.je-preview-panel-overlay'), null, 'the preview is closed');
    assert.equal(h.document.activeElement, button);
  });
}

// ── Elsewhere & Reviews ────────────────────────────────────────────────────────

test('TMDB Reviews can be switched on with a TMDB key while Elsewhere is off', async t => {
  const h = await page(t, { saved: { TMDB_API_KEY: 'k', ElsewhereEnabled: false } });
  assert.equal(h.document.getElementById('showReviews').disabled, false);
});

// ── Seerr URLs ─────────────────────────────────────────────────────────────────

test('after a save the Seerr URL box shows what was stored, without the dropped lines', async t => {
  const h = await page(t, { saved: SEERR });
  const box = h.document.getElementById('jellyseerrUrls');
  box.value = 'http://seerr.test\nseerr.local';
  box.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  await h.submit();
  assert.equal(h.calls.puts.at(-1).JellyseerrUrls, 'http://seerr.test');
  assert.equal(box.value, 'http://seerr.test');
  assert.equal(h.document.querySelector('.je-save-dock').classList.contains('je-dirty'), false);
});

// ── Unsaved changes and in-app navigation ──────────────────────────────────────

/** A link outside the page, as Jellyfin's drawer has, whose own handler (the router's) records each navigation. */
function drawerLink(h) {
  const link = h.document.createElement('a');
  link.href = '#/dashboard';
  h.document.body.appendChild(link);
  h.routed = 0;
  h.document.addEventListener('click', e => { if (e.target === link) { e.preventDefault(); h.routed++; } });
  return link;
}
const makeDirty = async h => {
  await new Promise(r => setTimeout(r, 550)); // the page takes its saved snapshot 500 ms after a load
  const box = h.document.getElementById('showFileSizes');
  box.checked = !box.checked;
  box.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  await settle(h.window);
  assert.ok(h.document.querySelector('.je-save-dock').classList.contains('je-dirty'));
};
const choose = async (h, label) => {
  const button = [...h.document.querySelectorAll('.jea-dialog button')].find(b => b.textContent === label);
  assert.ok(button, label + ' is offered: ' + h.dialogs().join(' | '));
  button.click();
  await settle(h.window, 120);
};

test('leaving through a link with unsaved changes asks first: Stay keeps the page, Discard leaves', async t => {
  const h = await page(t);
  const link = drawerLink(h);
  link.click();
  assert.equal(h.routed, 1, 'nothing unsaved: no question');
  assert.deepEqual(h.dialogs(), []);
  await makeDirty(h);
  link.click();
  await settle(h.window);
  assert.equal(h.routed, 1, 'held');
  assert.match(h.dialogs().join(' '), /not saved/);
  await choose(h, 'Stay');
  assert.equal(h.routed, 1);
  assert.equal(h.calls.puts.length, 0);
  link.click();
  await settle(h.window);
  await choose(h, 'Discard');
  assert.equal(h.routed, 2, 'left without saving');
  assert.equal(h.calls.puts.length, 0);
});

test('Save in the leave question saves, then leaves; afterwards nothing is asked', async t => {
  const h = await page(t);
  const link = drawerLink(h);
  await makeDirty(h);
  link.click();
  await settle(h.window);
  await choose(h, 'Save');
  assert.equal(h.calls.puts.length, 1);
  assert.equal(h.routed, 1);
  link.click();
  await settle(h.window);
  assert.equal(h.routed, 2, 'saved: no question');
  assert.deepEqual(h.dialogs(), []);
});

test('a failed Save in the leave question keeps the page and does not trap the administrator', async t => {
  const h = await page(t);
  const link = drawerLink(h);
  await makeDirty(h);
  h.window.ApiClient.updatePluginConfiguration = async () => { throw new Error('offline'); };
  link.click();
  await settle(h.window);
  await choose(h, 'Save');
  assert.equal(h.routed, 0, 'not left with the changes unsaved');
  assert.match(h.dialogs().join(' '), /Save failed/);
  await choose(h, 'OK');
  link.click();
  await settle(h.window);
  await choose(h, 'Discard');
  assert.equal(h.routed, 1);
});

test('Back or a changed address with unsaved changes asks first, where the browser can hold it (Navigation API)', async t => {
  const traversed = [];
  const navigation = { listeners: [], addEventListener(type, fn) { if (type === 'navigate') this.listeners.push(fn); }, traverseTo(key) { traversed.push(key); } };
  const h = await page(t, { globals: { navigation } });
  const navigate = (navigationType, url, hashChange) => {
    const e = { cancelable: true, navigationType, hashChange, destination: { url, key: 'key ' + url }, prevented: false, preventDefault() { this.prevented = true; } };
    navigation.listeners.forEach(fn => fn(e));
    return e.prevented;
  };
  const away = 'http://jf.test/web/#/dashboard';
  assert.equal(navigate('traverse', away, true), false, 'nothing unsaved: not held');
  await makeDirty(h);
  assert.equal(navigate('push', 'http://jf.test/web/#/configurationpage?name=Jellyfin%20Enhanced&tab=admin', true), false, 'within the page: not held');
  assert.equal(navigate('push', away, false), false, 'the router\'s own pushState is left to the link guard');
  assert.equal(navigate('traverse', away, true), true, 'Back is held');
  await settle(h.window);
  await choose(h, 'Stay');
  assert.deepEqual(traversed, []);
  assert.equal(navigate('traverse', away, true), true);
  await settle(h.window);
  await choose(h, 'Discard');
  assert.deepEqual(traversed, ['key ' + away], 'Back is made again');
});

// ── Dependency hints ───────────────────────────────────────────────────────────

test('every "needs this switch" hint names a switch that is on the page, without doubling its verb', async t => {
  const h = await page(t);
  // A rendered row keeps its text in .jea-label-text, beside the markers; a hand-written one in its first span.
  const labels = new Set([...h.document.querySelectorAll('label.jea-toggle')].map(label => label.querySelector('.jea-label-text') ?? label.querySelector('span'))
    .filter(Boolean).map(s => [...s.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()));
  const hints = [...h.document.querySelectorAll('.dep-hint-text[class*="parent-hint-"]')].map(el => el.textContent);
  assert.ok(hints.length > 10, 'hints are shown for switches that are off');
  for (const hint of hints) {
    assert.doesNotMatch(hint, /Enable ["“]Enable/, hint);
    const names = [...hint.matchAll(/“([^”]+)”/g)].map(match => match[1]);
    assert.ok(names.length > 0, hint);
    for (const name of names) assert.ok(labels.has(name), `${hint}: no switch is labelled "${name}"`);
  }
  assert.ok(hints.includes('Needs “Enable the splash screen override” on'), hints.join(' | '));
});

// ── Overview: TMDB status ──────────────────────────────────────────────────────

test('the TMDB status warns when switches that need a TMDB key are on without one', async t => {
  const h = await page(t, { saved: { ShowReviews: true } });
  assert.match(h.service('tmdb').className, /je-state-warn/);
});

test('control: TMDB without a key and nothing that needs it stays off', async t => {
  const h = await page(t);
  assert.match(h.service('tmdb').className, /je-state-off/);
});

// ── A number the field does not accept ─────────────────────────────────────────

/** Leaving Soon's "Refresh every (hours)" (1 to 168, on the *arr tab, which is not shown) typed as 500. */
const typeBadRefresh = h => {
  const field = h.document.getElementById('LeavingSoonRefreshHours');
  field.value = '500';
  field.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  field.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  return field;
};

for (const [path, save] of [
  ['the Save button', async h => { h.document.querySelector('.je-save-dock-btn').click(); await settle(h.window, 120); }],
  ['Save in the leave question', async h => {
    const link = drawerLink(h);
    link.click();
    await settle(h.window);
    await choose(h, 'Save');
    assert.equal(h.routed, 0, 'the page stays');
  }],
  ['Import Users Now', async h => {
    let imports = 0;
    h.window.ApiClient.fetch = async () => { imports++; return {}; };
    h.document.getElementById('btnImportJellyseerrUsers').click();
    await settle(h.window, 120);
    assert.equal(imports, 0, 'no import');
  }],
]) {
  test(`a number out of range on a tab that is not shown: ${path} writes nothing, opens the field and says what is wrong`, async t => {
    const h = await page(t, { saved: SEERR });
    await makeDirty(h);
    const field = typeBadRefresh(h);
    assert.equal(h.document.getElementById('arr').classList.contains('active'), false, 'the field is on another tab');
    await save(h);
    assert.equal(h.calls.puts.length, 0, 'nothing was written');
    assert.match(h.dialogs().join(' | '), /Refresh every \(hours\)[^|]*must be a whole number from 1 to 168[^|]*Nothing was saved/);
    assert.equal(h.document.getElementById('arr').classList.contains('active'), true, 'its tab is open');
    await choose(h, 'OK');
    assert.equal(h.document.activeElement, field, 'the field has focus');
  });
}

test('a number held by a setting that is off is shown as well, and the message says how to change it', async t => {
  const h = await page(t, { saved: { DownloadsPageEnabled: true, DownloadsPagePollingEnabled: true } });
  const polling = h.document.getElementById('downloadsPagePollingEnabled');
  const field = h.document.getElementById('downloadsPollIntervalSeconds');
  field.value = '5';
  field.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  polling.click();
  await settle(h.window);
  assert.equal(field.disabled, true, 'locked while polling is off');
  await h.submit();
  assert.equal(h.calls.puts.length, 0, 'nothing was written');
  assert.match(h.dialogs().join(' '), /Refresh every \(seconds\).*from 30 to 300.*turn on/);
  const row = field.closest('.inputContainer');
  assert.ok(row.closest('.jea-reveal') || row.classList.contains('jea-reveal'), 'the collapsed row is shown');
  assert.equal(h.document.getElementById('pages').classList.contains('active'), true);
});

test('every number has an upper bound a whole-number setting can hold, so no value fails the whole configuration write', async t => {
  const h = await page(t);
  const numbers = [...h.document.querySelectorAll('#JellyfinEnhancedForm input[type="number"]')];
  assert.ok(numbers.length >= 14);
  for (const field of numbers) {
    assert.ok(field.max !== '' && Number(field.max) <= 2147483647, `${field.id} has max ${JSON.stringify(field.max)}`);
  }
  const toast = h.document.getElementById('ToastDuration');
  toast.value = '99999999999';
  await h.submit();
  assert.equal(h.calls.puts.length, 0, 'an overflowing value is refused before the write');
  assert.match(h.dialogs().join(' '), /Toast notification duration|Toast Notification Duration/i);
});

// ── A setting that is on while what it needs is missing (#867) ────────────────

const hintOf = el => [...(el.closest('.checkboxContainer, .inputContainer') ?? el.closest('label')).querySelectorAll('.dep-hint-text')].map(n => n.textContent).join(' | ');

test('a switch that is on without the TMDB key it needs can be turned off, says it is not working, and keeps its value until touched', async t => {
  const h = await page(t, { saved: { ShowReviews: true, ShowReleaseDates: false } });
  const reviews = h.document.getElementById('showReviews');
  assert.equal(reviews.checked, true);
  assert.equal(reviews.disabled, false, 'it can be turned off');
  assert.match(hintOf(reviews), /On, but not working: no TMDB API key is set/);
  assert.equal(h.document.getElementById('showReleaseDate').disabled, true, 'one that is off still cannot be turned on');
  await h.submit();
  assert.equal(h.calls.puts.at(-1).ShowReviews, true, 'not touched: the stored value is kept');
  reviews.click();
  await settle(h.window);
  assert.equal(reviews.checked, false);
  assert.equal(reviews.disabled, true, 'turned off, it cannot be turned back on without a key');
  assert.doesNotMatch(hintOf(reviews), /On, but/);
  await h.submit();
  assert.equal(h.calls.puts.at(-1).ShowReviews, false);
});

test('Custom Tabs ticked without the Custom Tabs plugin can be turned off; an unknown plugin list is not a missing plugin', async t => {
  const saved = { DownloadsPageEnabled: true, DownloadsUseCustomTabs: true };
  const absent = await page(t, { saved, answers: [[/\/Plugins$/, () => []]] });
  const box = absent.document.getElementById('downloadsUseCustomTabs');
  assert.equal(box.checked, true);
  assert.equal(box.disabled, false);
  assert.match(hintOf(box), /On, but not working: the Custom Tabs plugin is not installed/);
  const unknown = await page(t, { saved, answers: [[/\/Plugins$/, () => { throw Object.assign(new Error('offline'), { status: 0 }); }]] });
  const same = unknown.document.getElementById('downloadsUseCustomTabs');
  assert.equal(same.checked, true);
  assert.equal(same.disabled, false);
  assert.equal(hintOf(same), '', 'no claim that the plugin is missing');
  await unknown.submit();
  assert.equal(unknown.calls.puts.at(-1).DownloadsUseCustomTabs, true, 'kept');
});

test('a sub-setting that is on while its parent is off can be turned off and says what it needs', async t => {
  const h = await page(t, { saved: { AudioLanguageTagSyncEnabled: false, AudioLanguageTagShowAsLinks: true } });
  const links = h.document.getElementById('audioLanguageTagShowAsLinks');
  assert.equal(links.checked, true);
  assert.equal(links.disabled, false);
  assert.match(hintOf(links), /On, but needs “[^”]+” on to work/);
  links.click();
  await settle(h.window);
  assert.equal(links.disabled, true);
  assert.match(hintOf(links), /^Needs “[^”]+” on$/);
});

// ── Seerr connection test ──────────────────────────────────────────────────────

test('testing a Seerr URL without http:// says the address needs it, and asks the server nothing', async t => {
  const h = await page(t, { saved: { ...SEERR, JellyseerrUrls: 'seerr.local' } });
  h.document.getElementById('testJellyseerrBtn').click();
  await settle(h.window, 60);
  assert.equal(h.calls.ajax.filter(r => /jellyseerr\/validate/.test(r.url)).length, 0);
  assert.match(h.dialogs().join(' '), /seerr\.local.*http:\/\/ or https:\/\//);
  assert.doesNotMatch(h.dialogs().join(' '), /Missing URL or API key/);
});

test('a Seerr URL the server refuses is reported with the server\'s reason, not as a missing key', async t => {
  const refused = () => { throw Object.assign(new Error('Bad Request'), { status: 400, responseText: JSON.stringify({ ok: false, message: 'Invalid URL' }) }); };
  const h = await page(t, { saved: { ...SEERR, JellyseerrUrls: 'http://169.254.169.254' }, answers: [[/jellyseerr\/validate/, refused]] });
  h.document.getElementById('testJellyseerrBtn').click();
  await settle(h.window, 60);
  assert.doesNotMatch(h.dialogs().join(' '), /Missing URL or API key/);
  assert.match(h.dialogs().join(' '), /refused/);
});

// ── Text that names what the client offers ─────────────────────────────────────

test('the Enhanced Panel note names only ways the client offers to open it (the avatar long-press went with #627)', async t => {
  const h = await page(t);
  const note = [...h.document.querySelectorAll('#keyboard .je-info-banner, #keyboard [class*="note"]')].map(n => n.textContent).find(text => /Enhanced Panel/.test(text));
  assert.ok(note);
  assert.doesNotMatch(note, /long-press|profile picture/i);
  const client = readFileSync(join(repo, 'client/src/features/settings-panel/ui-entry-points.ts'), 'utf8');
  const named = [...note.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  assert.ok(named.length >= 2, note);
  for (const name of named) assert.ok(client.includes(name), `the client has no "${name}" entry point`);
});
