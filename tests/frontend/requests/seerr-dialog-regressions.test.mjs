import test from 'node:test';
import assert from 'node:assert/strict';
import { moreInfoHarness } from '../helpers/seerr-details.mjs';

// Regressions of the Seerr dialogs over real jsdom history (no stubbed history.back).

/** jsdom queues a history traversal and its popstate on window timers, which the harness clock holds: run them. */
function traverse(h) {
  let pops = 0;
  const count = () => pops++;
  h.window.addEventListener('popstate', count);
  for (let i = 0; i < 4 && !pops; i++) h.clock.run(0);
  h.window.removeEventListener('popstate', count);
  assert.equal(pops, 1, 'one popstate delivered');
}

test('BUG-018: Escape on a dialog above More Info closes only that dialog; Back then closes More Info', async t => {
  const h = moreInfoHarness(t);
  h.load('jellyseerr/modal.js');
  await h.P.open(1, 'movie');
  const moreInfo = h.modal;
  const dialog = h.JE.jellyseerrModal.create({ title: 'Report', subtitle: '', bodyHtml: '', onSave() {} });
  dialog.show();
  h.document.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  traverse(h);
  assert.equal(dialog.modalElement.getAttribute('aria-hidden'), 'true');
  assert.equal(moreInfo._isClosing, undefined, 'the dialog\'s own history.back() must not close More Info');
  assert.equal(h.modal, moreInfo);

  h.window.history.back();
  traverse(h);
  assert.equal(moreInfo._isClosing, true);
});
