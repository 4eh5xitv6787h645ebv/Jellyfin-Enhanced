// Parity check for upstream ff75fbfa: on a detail page the discovery section stays after Jellyfin's own lists
// when a theme gives those lists a flex `order`. The lab's mock Seerr answers one person's credits
// (p63-person-credits.json, a `je12 mock seerr rule`), so that person's page gets a "More with" section. The
// script reads where the section is with the stock stylesheet (the primary column is a block there, so order
// does nothing), then adds what such a theme does (the column a flex column, a positive order on its own
// children) and reads it again.
export default async ({ page, go, until, sleep }) => {
  const section = '.itemDetailPage:not(.hide) .jellyseerr-person-discovery-section';
  await go('#/details?id=b31e70f9618b4345b21e33626a3aa4d6');
  await until(() => page.locator(`${section} .itemsContainer > .card:not(.jellyseerr-card-placeholder)`).count(), 40000);
  await sleep(1500);
  const read = () => until(() => page.evaluate(selector => {
    const s = document.querySelector(selector);
    if (!s || !s.querySelector('.itemsContainer > .card:not(.jellyseerr-card-placeholder)')) return null;
    const column = s.parentElement;
    const natives = [...column.children].filter(el => el !== s && !el.classList.contains('jellyseerr-join-jump') && el.getClientRects().length > 0 && el.getBoundingClientRect().height > 0);
    const top = s.getBoundingClientRect().top;
    return { title: s.querySelector('.sectionTitle')?.textContent.trim(), cards: s.querySelectorAll('.itemsContainer > .card:not(.jellyseerr-card-placeholder)').length,
      inPrimaryColumn: column.matches('.detailPagePrimaryContent .detailSection'), columnDisplay: getComputedStyle(column).display,
      sectionOrder: getComputedStyle(s).order, nativeListsShown: natives.length, nativeOrders: [...new Set(natives.map(el => getComputedStyle(el).order))],
      afterEveryNativeList: natives.every(el => el.getBoundingClientRect().bottom <= top + 1), lastInTheColumnsMarkup: column.lastElementChild === s || column.lastElementChild?.classList.contains('jellyseerr-join-jump') };
  }, section), 20000);
  const out = { stock: await read() };
  await page.addStyleTag({ content: '.itemDetailPage .detailPagePrimaryContent .detailSection { display: flex; flex-direction: column; } .itemDetailPage .detailPagePrimaryContent .detailSection > :not(.jellyseerr-discovery-section) { order: 3; }' });
  await sleep(500);
  out.themeOrdersTheNativeLists = await read();
  return out;
};
