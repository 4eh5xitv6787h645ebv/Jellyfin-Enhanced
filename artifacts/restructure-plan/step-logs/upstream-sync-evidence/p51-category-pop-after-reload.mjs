// Upstream c165a07b edge case: after a reload straight onto the standalone Recommendations page (no
// navigation dispatched yet), open a category, add a same-URL history entry above it (what the More Info
// modal does) and go Back. The pop lands on the category's own entry, so the category should stay open.
export default async ({ page, go, until, sleep }) => {
  await go('#/recommendations'); await sleep(1000);
  await page.reload(); await sleep(4000);
  const tiles = await until(() => page.locator('#je-recommendations-page .je-recommendations-tile .cardImageContainer').count(), 30000);
  await page.evaluate(() => document.querySelector('#je-recommendations-page .je-recommendations-tile .cardImageContainer').click());
  const open = () => page.evaluate(() => { const c = document.getElementById('je-recommendations-category-page'); return !!c && !c.classList.contains('hide'); });
  const opened = await until(open, 15000);
  await sleep(1500);
  await page.evaluate(() => { history.pushState({ above: true }, '', location.href); history.back(); });
  await sleep(2000);
  const categoryOpenAfterPopOntoItsEntry = await open();
  await page.evaluate(() => history.back());
  await sleep(2000);
  return { tiles, opened: !!opened, categoryOpenAfterPopOntoItsEntry, categoryOpenAfterBack: await open(), hash: await page.evaluate(() => location.hash) };
};
