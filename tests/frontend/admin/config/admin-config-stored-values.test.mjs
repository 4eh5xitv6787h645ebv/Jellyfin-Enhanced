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
