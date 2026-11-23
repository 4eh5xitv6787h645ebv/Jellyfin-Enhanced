// Port of upstream da3d9ee9 / 7762f8e1: the Reclaimerr card on the *arr tab, as an administrator sees it. Switches
// "Use Reclaimerr" on in the form (nothing is saved, so the server keeps Reclaimerr off), then prints each setting in the
// card with its label and whether it shows, the card's groups and buttons, whether "User header" follows "Let users request
// removals" (when there is one), and what "Run Audit" shows (when there is one): this lab's server has Reclaimerr off, so
// it answers its refusal. Nothing reaches a Reclaimerr.
export default async ({ page, go, until, sleep }) => {
  await go('#/configurationpage?name=Jellyfin%20Enhanced&tab=arr&card=reclaimerr');
  await until(() => page.evaluate(() => !!document.getElementById('ReclaimerrEnabled') && !!document.querySelector('.jea-layout')), 20000);
  await sleep(2000);
  await page.evaluate(() => {
    const box = document.getElementById('ReclaimerrEnabled');
    if (!box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await sleep(500);
  const describe = () => page.evaluate(() => {
    const box = document.getElementById('ReclaimerrEnabled');
    const card = box.closest('fieldset.jea-section');
    const shown = (el) => !!el && el.getClientRects().length > 0 && !el.closest('.jea-dep-hidden');
    const settings = [...card.querySelectorAll('input[id], textarea[id], select[id]')]
      .filter((el) => !el.id.endsWith('--mirror') && /^Reclaimerr/.test(el.id))
      .map((el) => {
        const label = el.closest('.inputContainer, .checkboxContainer, .jea-row, label')?.querySelector('label, .inputLabel, .checkboxLabel, span')?.textContent?.trim() || '';
        return `${el.id} (${el.type}${el.type === 'checkbox' ? (el.checked ? ', on' : ', off') : ''}) "${label.slice(0, 60)}" ${shown(el) ? 'shown' : 'hidden'}`;
      });
    const groups = [...card.querySelectorAll('details > summary')].map((s) => s.textContent.trim());
    const buttons = [...card.querySelectorAll('button[id]')].filter((b) => /^reclaimerr/.test(b.id)).map((b) => `${b.id}: ${b.textContent.trim()}`);
    const notes = [...card.querySelectorAll('details .jea-note, details .note, details p')].map((n) => n.textContent.trim().slice(0, 160));
    return { settings, groups, buttons, groupNotes: notes };
  });
  const before = await describe();
  let header = 'no Let users request removals toggle';
  const hasRequests = await page.evaluate(() => !!document.getElementById('ReclaimerrUserRequests'));
  if (hasRequests) {
    const visible = () => page.evaluate(() => { const h = document.getElementById('ReclaimerrUserHeader'); return !!h && h.getClientRects().length > 0 && !h.closest('.jea-dep-hidden'); });
    const off = await visible();
    await page.evaluate(() => { const b = document.getElementById('ReclaimerrUserRequests'); b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    header = `User header shown with requests off: ${off}; with requests on: ${await visible()}`;
  }
  let audit = 'no Run Audit button';
  if (await page.evaluate(() => !!document.getElementById('reclaimerrAuditBtn'))) {
    await page.evaluate(() => document.getElementById('reclaimerrAuditBtn').click());
    audit = await until(() => page.evaluate(() => {
      const out = document.getElementById('reclaimerrAuditResult');
      return out && out.style.display === 'block' ? out.textContent.trim() : null;
    }), 10000).catch(() => 'no result drawn');
  }
  return { card: before, header, audit };
};
