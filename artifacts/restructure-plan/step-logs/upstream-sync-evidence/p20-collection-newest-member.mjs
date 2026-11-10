// Port 20 (upstream 324b5c92): a collection's Just Added follows its newest member, not its own date.
// On a lab with box sets (`je12 env content --collections`); it uses the second and third box set (port 19's script
// uses the first). Two collections are set up through Jellyfin's own item editor API:
//   "recreated": the collection's own date is an hour ago, every member was added 400 days ago
//                (what a library scan leaves behind when Jellyfin creates an automatic collection again);
//   "arrival":   the collection's own date is 400 days ago, one member was added an hour ago.
// Reports, for each: the Status badge the web client draws on its card (search results), whether the server tag
// cache's entry carries the newest member's date (LatestEpisodeAdded), and the same for the /tag-data fallback.
// Then the arrival's added date is edited back by two years (only the movie changes) and the collection is read
// again, for up to 90 s: does the collection follow the member?
export default async ({ page, go, until, sleep }) => {
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && window.ApiClient.accessToken && window.ApiClient.accessToken())), 30000);
  const DAY = 86400000;
  const prep = await page.evaluate(async (DAY) => {
    const JE = window.JellyfinEnhanced, uid = ApiClient.getCurrentUserId();
    if (!JE.currentSettings.statusTagsEnabled) {
      JE.currentSettings.statusTagsEnabled = true;
      await JE.saveUserSettings('settings.json', JE.currentSettings);
    }
    const sets = (await ApiClient.getItems(uid, { IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'SortName', Limit: 3 })).Items;
    if (sets.length < 3) return { error: 'this lab has fewer than three box sets (je12 env content --collections)' };
    const setDate = async (id, ms) => { const item = await ApiClient.getItem(uid, id); item.DateCreated = new Date(ms).toISOString(); await ApiClient.updateItem(item); return item.Name; };
    const membersOf = async id => (await ApiClient.getItems(uid, { ParentId: id, SortBy: 'SortName' })).Items;
    const now = Date.now(), hourAgo = now - 3600000, old = now - 400 * DAY;
    const [, recreated, arrival] = sets;
    const out = { recreated: { id: recreated.Id, name: recreated.Name, members: [] }, arrival: { id: arrival.Id, name: arrival.Name, members: [] } };
    for (const m of await membersOf(recreated.Id)) out.recreated.members.push({ id: m.Id, name: await setDate(m.Id, old), added: old });
    await setDate(recreated.Id, hourAgo);
    const arrivals = await membersOf(arrival.Id);
    for (let i = 0; i < arrivals.length; i++) out.arrival.members.push({ id: arrivals[i].Id, name: await setDate(arrivals[i].Id, i === 0 ? hourAgo : old), added: i === 0 ? hourAgo : old });
    await setDate(arrival.Id, old);
    return out;
  }, DAY);
  if (prep.error) return prep;

  const key = id => id.replace(/-/g, '').toLowerCase();
  // Jellyfin stores dates to the second: compare at that precision.
  const sameSecond = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.floor(a / 1000) === Math.floor(b / 1000);
  const describe = (value, set) => {
    if (value === null || value === undefined) return 'absent';
    const newest = Math.max(...set.members.map(m => m.added));
    return sameSecond(value, newest) ? "its newest member's added date" : `another date (${new Date(value).toISOString()})`;
  };
  // `withFallback` also asks /tag-data; the waiting loops below read the cache only.
  const serverFacts = (withFallback = false) => page.evaluate(async ([ids, withFallback]) => {
    const uid = ApiClient.getCurrentUserId();
    const cache = await ApiClient.getJSON(ApiClient.getUrl(`JellyfinEnhanced/tag-cache/${uid}`));
    const data = withFallback ? await ApiClient.ajax({ type: 'POST', url: ApiClient.getUrl(`/JellyfinEnhanced/tag-data/${uid}`, { latestEpisode: true }), data: JSON.stringify(ids), contentType: 'application/json', dataType: 'json' }) : {};
    const norm = id => String(id || '').replace(/-/g, '').toLowerCase();
    return ids.map(id => ({
      cache: ((cache.items || {})[norm(id)] || {}).LatestEpisodeAdded ?? null,
      inCache: !!(cache.items || {})[norm(id)],
      tagData: ((data.Items || []).find(i => norm(i.Id) === norm(id)) || {}).LatestEpisodeAdded ?? null,
    }));
  }, [[prep.recreated.id, prep.arrival.id], withFallback]);
  const badges = async () => {
    await page.reload(); await sleep(4000);
    await go('#/search?query=' + encodeURIComponent('Collection (lab)'));
    const read = () => page.evaluate(ids => ids.map(id => {
      const card = [...document.querySelectorAll('.card[data-id]')].find(c => c.dataset.id === id);
      if (!card) return null;
      const tag = card.querySelector('[class*="status-tag"], [class*="je-status"]');
      return { drawn: !!card.querySelector('.je-tag-host, [class*="je-tag"]'), status: tag ? tag.textContent.trim() : null };
    }), [prep.recreated.id, prep.arrival.id]);
    await until(async () => { const r = await read(); return r.every(x => x && x.drawn) ? r : null; }, 30000).catch(() => null);
    await sleep(2500);
    return (await read()).map(card => (card ? card.status : 'card not found'));
  };
  const report = async () => {
    const facts = await serverFacts(true), drawn = await badges();
    const row = (i, set) => ({ badge: drawn[i], tagCacheEntry: facts[i].inCache ? describe(facts[i].cache, set) : 'no entry', tagDataFallback: describe(facts[i].tagData, set) });
    return { recreatedCollection_ownDateAnHourAgo_membersOld: row(0, prep.recreated), collection_ownDateOld_oneMemberAddedAnHourAgo: row(1, prep.arrival) };
  };

  // Wait for the tag cache to take the edits: both collections answer the same way twice in a row, 6 s apart.
  await sleep(15000);
  let before = JSON.stringify(await serverFacts());
  for (let t = 0; t < 10; t++) { await sleep(6000); const now = JSON.stringify(await serverFacts()); if (now === before) break; before = now; }
  const out = { recreated: prep.recreated.name, arrival: `${prep.arrival.name} (member added an hour ago: ${prep.arrival.members[0].name})` };
  out.afterSetup = await report();

  // The arrival's Date Added is edited back two years; Jellyfin reports the movie only.
  const edited = Date.now() - 730 * DAY;
  await page.evaluate(async ([id, ms]) => { const uid = ApiClient.getCurrentUserId(); const item = await ApiClient.getItem(uid, id); item.DateCreated = new Date(ms).toISOString(); await ApiClient.updateItem(item); }, [prep.arrival.members[0].id, edited]);
  prep.arrival.members[0].added = edited;
  const want = Math.max(...prep.arrival.members.map(m => m.added));
  let followed = 'not within 90 s';
  for (let waited = 0; waited < 90; waited += 6) {
    await sleep(6000);
    const f = (await serverFacts())[1];
    if (f.cache === null) { followed = 'the entry has no member date'; break; }
    if (sameSecond(f.cache, want)) { followed = 'yes'; break; }
  }
  out.afterTheArrivalsDateIsEditedBackTwoYears = { ...(await report()).collection_ownDateOld_oneMemberAddedAnHourAgo, tagCacheFollowedTheMember: followed };
  return out;
};
