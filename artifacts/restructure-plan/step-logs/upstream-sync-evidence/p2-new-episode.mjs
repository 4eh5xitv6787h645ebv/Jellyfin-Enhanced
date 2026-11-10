// Port 2 (upstream 6ece3f52): an episode that aired long ago but was added an hour ago, and one that aired two
// days ago and was added long ago. Reports the Status badge the web client draws on each card (search results).
export default async ({ page, go, until, sleep }) => {
  const prep = await page.evaluate(async () => {
    const JE = window.JellyfinEnhanced, uid = ApiClient.getCurrentUserId();
    if (!JE.currentSettings.statusTagsEnabled) {           // lab state: the lab user has Status tags off
      JE.currentSettings.statusTagsEnabled = true;
      await JE.saveUserSettings('settings.json', JE.currentSettings);
    }
    const list = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Episode', Recursive: true, Limit: 2, SortBy: 'SortName',
      Fields: 'DateCreated,PremiereDate', SearchTerm: 'Tape 1, Side' })).Items;   // 13 Reasons Why S01E01 and S01E02
    const day = 86400000, iso = ms => new Date(ms).toISOString();
    const want = [{ PremiereDate: iso(Date.now() - 400 * day), DateCreated: iso(Date.now() - 3600000) },
      { PremiereDate: iso(Date.now() - 2 * day), DateCreated: iso(Date.now() - 400 * day) }];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const item = await ApiClient.getItem(uid, list[i].Id);
      Object.assign(item, want[i]);
      await ApiClient.updateItem(item);
      out.push({ id: item.Id, name: item.Name, series: item.SeriesName });
    }
    return out;
  });
  await sleep(12000);                                       // the tag cache applies item changes after its debounce
  await page.reload(); await sleep(4000);
  await go('#/search?query=' + encodeURIComponent('Tape 1, Side'));
  const read = () => page.evaluate(ids => ids.map(id => {
    const card = [...document.querySelectorAll('.card[data-id]')].find(c => c.dataset.id === id);
    if (!card) return null;
    const tag = card.querySelector('[class*="status-tag"], [class*="je-status"]');
    return { drawn: !!card.querySelector('.je-tag-host, [class*="je-tag"]'), status: tag ? tag.textContent.trim() : null };
  }), prep.map(p => p.id));
  const cards = await until(async () => { const r = await read(); return r.every(x => x && x.drawn) ? r : null; }, 30000) || await read();
  await sleep(1500);
  const final = await read();
  return { addedAnHourAgoAiredLongAgo: final[0]?.status ?? final[0], airedTwoDaysAgoAddedLongAgo: final[1]?.status ?? final[1], episodes: prep.map(p => `${p.series}: ${p.name}`), firstRead: cards };
};
