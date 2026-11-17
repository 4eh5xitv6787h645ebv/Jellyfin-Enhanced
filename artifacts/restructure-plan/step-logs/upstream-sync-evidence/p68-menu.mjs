// The item menu of a movie the removal tool lists, opened from its detail page's ⋮: the removal rows, then the
// Postpone chooser's title and buttons.
export default async ({ page, go, until, sleep }) => {
  await go('#/details?id=0ff8461bed0a2658ec63487586efdbd3');
  await until(() => page.evaluate(() => [...document.querySelectorAll('#itemDetailPage .btnMoreCommands')].some(b => b.offsetParent)), 20000);
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll('#itemDetailPage .btnMoreCommands')].find(b => b.offsetParent).click());
  await until(() => page.evaluate(() => !!document.querySelector('[data-id^="je-maintainerr-"]')), 15000).catch(() => null);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.actionSheetScroller [data-id^="je-maintainerr-"]')].map(r => `${r.dataset.id}: ${r.textContent.trim()}`));
  await page.evaluate(() => document.querySelector('[data-id="je-maintainerr-postpone"]')?.click());
  await until(() => page.evaluate(() => !!document.querySelector('.je-mt-dialog')), 5000).catch(() => null);
  const dialog = await page.evaluate(() => {
    const d = document.querySelector('.je-mt-dialog');
    if (!d) return 'no dialog';
    return [`title: ${(d.querySelector('.je-mt-titletext') || d.querySelector('.je-mt-title'))?.textContent}`,
      `hint: ${d.querySelector('.je-mt-hint')?.textContent}`,
      `days: ${[...d.querySelectorAll('.je-mt-day')].map(b => b.textContent).join(', ')}`,
      `exact date: ${d.querySelector('.je-mt-date') ? 'yes' : 'no'}`,
      `reset: ${d.querySelector('.je-mt-reset')?.textContent.replace('restart_alt', '').trim()}`].join('\n');
  });
  return [...rows, dialog].join('\n');
};
