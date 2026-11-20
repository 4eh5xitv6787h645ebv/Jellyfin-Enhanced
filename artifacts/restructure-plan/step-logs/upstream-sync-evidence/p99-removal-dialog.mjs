// Port 99 (upstream fc9b58ea): the removal date dialog. Opens the item menu of a movie the Maintainerr mock lists
// (Abominable, from p76-maintainerr.setup.py) from its detail page's ⋮, presses Postpone, and prints the dialog's
// buttons in order (class: text), whether it has a footer row, and what closes it without a request.
export default async ({ page, go, until, sleep }) => {
  await go('#/details?id=06de48d758074756c732c7de70aa79f8');
  await until(() => page.evaluate(() => [...document.querySelectorAll('#itemDetailPage .btnMoreCommands')].some(b => b.offsetParent)), 20000);
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll('#itemDetailPage .btnMoreCommands')].find(b => b.offsetParent).click());
  await until(() => page.evaluate(() => !!document.querySelector('[data-id^="je-maintainerr-"]')), 15000).catch(() => null);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.actionSheetScroller [data-id^="je-maintainerr-"]')].map(r => `row ${r.dataset.id}: ${r.textContent.trim()}`));
  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/JellyfinEnhanced\/(maintainerr|reclaimerr)\//.test(r.url())) posts.push(new URL(r.url()).pathname); });
  await page.evaluate(() => document.querySelector('[data-id="je-maintainerr-postpone"]')?.click());
  await until(() => page.evaluate(() => !!document.querySelector('.je-mt-dialog')), 5000).catch(() => null);
  const dialog = await page.evaluate(() => {
    const d = document.querySelector('.je-mt-dialog');
    if (!d) return ['no dialog'];
    const label = (b) => { const c = b.cloneNode(true); c.querySelectorAll('.material-icons').forEach(i => i.remove()); return c.textContent.trim(); };
    return [`title: ${d.querySelector('.je-mt-titletext')?.textContent}`,
      ...[...d.querySelectorAll('button')].map(b => `button ${[...b.classList].filter(c => c !== 'je-mt-button').join('.')}: ${label(b) || b.getAttribute('aria-label')}`),
      `footer row: ${d.querySelector('.je-mt-footer') ? 'yes' : 'no'}`,
      `last part: ${d.lastElementChild?.className}`];
  });
  await page.evaluate(() => document.querySelector('.je-mt-dialog .je-mt-x')?.click());
  await sleep(300);
  const closedByX = await page.evaluate(() => !document.querySelector('.je-mt-dialog'));
  await page.evaluate(() => window.JellyfinEnhanced?.removalMenu?.postpone('06de48d758074756c732c7de70aa79f8', { Marked: true, DeleteAt: null }, null));
  const reopened = await page.evaluate(() => !!document.querySelector('.je-mt-dialog'));
  await page.keyboard.press('Escape');
  await sleep(300);
  const closedByEscape = await page.evaluate(() => !document.querySelector('.je-mt-dialog'));
  return [...rows, ...dialog, `closed by the close button: ${closedByX}`, `reopened: ${reopened}, closed by Escape: ${closedByEscape}`, `removal POSTs: ${posts.length ? posts.join(', ') : 'none'}`].join('\n');
};
