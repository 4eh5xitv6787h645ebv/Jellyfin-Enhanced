// Port 7 (upstream ee1c92dc, #1029): a card already on the page redraws when its item's tag entry changes.
// Opens a movie's details page, notes the rating chip on one of its "More Like This" cards, opens that card's
// own details page (jellyfin-web keeps the first details view in the document), changes that movie's community
// rating on the server, waits for the tag cache, goes back to the kept view and reads the same card node again.
export default async ({ page, go, until, sleep }) => {
  const uid = await page.evaluate(() => ApiClient.getCurrentUserId());
  const first = await page.evaluate(async id => (await ApiClient.getItems(id, { IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', Limit: 1, SearchTerm: '101 Dalmatians II' })).Items[0].Id, uid);
  await go(`#/details?id=${first}`);
  const rating = () => page.evaluate(() => {
    const card = document.querySelector('.card[data-je-probe="redraw"]');
    if (!card) return 'card node gone';
    if (card.closest('.page.hide, [data-role="page"].hide')) return 'card is on a hidden page';
    const chip = [...card.querySelectorAll('[class*="rating"]')].map(el => el.textContent.trim()).find(Boolean);
    return chip ? chip.replace(/\s+/g, ' ') : 'no rating chip';
  });
  const picked = await until(() => page.evaluate(() => {
    for (const card of document.querySelectorAll('.itemDetailPage:not(.hide) .card[data-id][data-type="Movie"]')) {
      if (card.querySelector('[class*="rating"]')?.textContent.trim()) { card.dataset.jeProbe = 'redraw'; return card.dataset.id; }
    }
    return null;
  }), 30000);
  if (!picked) return { error: 'no movie card with a rating chip on the details page' };
  const chipBefore = await rating();
  await sleep(21000);                                   // the pipeline asks for a delta at most every 20 s
  await go(`#/details?id=${picked}`);
  const change = await page.evaluate(async ([userId, id]) => {
    const item = await ApiClient.getItem(userId, id);
    const old = item.CommunityRating;
    item.CommunityRating = old && Math.abs(old - 1.1) > 0.05 ? 1.1 : 2.2;
    await ApiClient.updateItem(item);
    return { name: item.Name, from: old ?? null, to: item.CommunityRating };
  }, [uid, picked]);
  await sleep(22000);                                   // tag cache debounce, and the 20 s between deltas
  await page.goBack();
  await until(async () => (await rating()) !== 'card is on a hidden page', 15000);
  await sleep(6000);
  const chipAfterComingBack = await rating();
  await page.evaluate(async ([userId, id, old]) => { const item = await ApiClient.getItem(userId, id); item.CommunityRating = old; await ApiClient.updateItem(item); }, [uid, picked, change.from]);
  return { card: change.name, ratingChangedOnServer: `${change.from} -> ${change.to}`, chipBefore, chipAfterComingBack };
};
