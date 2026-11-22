// Upstream e16cc10b / rewrite 2beb1e94: hide every card of one "Recently Added in" home row, read which row headings
// are on screen, then unhide them again (so both builds start from the same stored list).
export default async ({ page, go, until, sleep }) => {
  await go('#/home');
  await until(() => page.evaluate(() => document.querySelectorAll('.homeSectionsContainer .verticalSection .card[data-id]').length >= 32), 20000);
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.homeSectionsContainer .verticalSection')]
    .filter(s => /^Recently Added in/.test(s.querySelector('.sectionTitle')?.textContent?.trim() || ''))
    .map(s => `${s.querySelector('.sectionTitle').textContent.trim()}: ${s.querySelectorAll('.card[data-id]').length} cards, ${s.querySelectorAll('.card.je-hidden').length} hidden, heading ${getComputedStyle(s).display !== 'none' && s.getClientRects().length > 0 ? 'shown' : 'hidden'}`));
  const before = await rows();
  const ids = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.homeSectionsContainer .verticalSection')].find(x => x.querySelector('.sectionTitle')?.textContent?.trim() === 'Recently Added in Shows');
    return [...s.querySelectorAll('.card[data-id]')].map(c => ({ itemId: c.dataset.id, name: c.querySelector('.cardText')?.textContent?.trim() || c.dataset.id, type: c.dataset.type }));
  });
  await page.evaluate(list => { for (const i of list) window.JellyfinEnhanced.hiddenContent.hideItem(i); }, ids);
  await sleep(3000);
  const allShowsHidden = await rows();
  await page.evaluate(list => { for (const i of list) window.JellyfinEnhanced.hiddenContent.unhideItem(i.itemId); }, ids);
  await sleep(3000);
  const unhidden = await rows();
  return { before, allShowsHidden, unhidden };
};
