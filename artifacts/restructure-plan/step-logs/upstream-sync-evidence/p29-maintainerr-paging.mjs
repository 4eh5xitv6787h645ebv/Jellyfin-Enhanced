// Port 29 (upstream 53ebf043): every member of a Maintainerr collection gets its Leaving soon fact, not only the
// few the collections list embeds. Run after p29-maintainerr-paging.setup.py, which makes the lab's mock answer like
// a Maintainerr with 971 members in two active collections, two of each embedded in the list.
// The script switches the Status group and its Leaving soon badge on for this user, asks the server to read the
// source now (the Media Tags tab's Refresh now), and reports the status the tab shows, how many of the first
// cards of the Movies library carry the badge, and for how many of the 620 episodes of the second collection the
// server hands this user a Leaving fact (the same answer the cards are drawn from). The user's settings are put back.
export default async ({ page, go, until, sleep }) => {
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  const prep = await page.evaluate(async () => {
    const JE = window.JellyfinEnhanced, uid = ApiClient.getCurrentUserId();
    const original = JSON.stringify(JE.currentSettings);
    Object.assign(JE.currentSettings, { statusTagsEnabled: true, statusTagsLeaving: true });
    await JE.saveUserSettings('settings.json', JE.currentSettings);
    const response = await fetch(ApiClient.getUrl('JellyfinEnhanced/admin/leaving-soon/refresh'), {
      method: 'POST', headers: { Authorization: `MediaBrowser Token="${ApiClient.accessToken()}"` },
    });
    const status = await response.json();
    const movies = (await ApiClient.getUserViews({}, uid)).Items.find(view => view.CollectionType === 'movies');
    const episodes = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Episode', Recursive: true, SortBy: 'SeriesSortName,ParentIndexNumber,IndexNumber', Limit: 620 })).Items.map(item => item.Id);
    return {
      original, movies: movies.Id, episodes,
      status: { http: response.status, items: status.Items, dated: status.Dated, lastError: status.LastError ?? null },
    };
  });
  const cards = async route => {
    await go(route);
    await page.reload();
    const total = await until(() => page.evaluate(() => document.querySelectorAll('.card[data-id]').length), 30000);
    await until(() => page.evaluate(() => document.querySelectorAll('.card[data-id] .je-tag-host').length >= 10), 30000).catch(() => null);
    await sleep(6000);
    return page.evaluate(count => {
      const all = [...document.querySelectorAll('.card[data-id]')];
      const leaving = all.map(card => card.querySelector('.status-tag[data-je-status="leaving"]')).filter(Boolean);
      return { cards: count && all.length, leaving: leaving.length, texts: [...new Set(leaving.map(tag => tag.textContent.trim()))] };
    }, total);
  };
  const out = { status: prep.status };
  try {
    await sleep(12000);   // the tag cache applies a publish after its debounce
    out.moviesLibrary = await cards(`#/movies?topParentId=${prep.movies}&collectionType=movies`);
    out.episodesOfTheSecondCollection = await page.evaluate(async ids => {
      const facts = [];
      for (let start = 0; start < ids.length; start += 200) {
        const response = await fetch(ApiClient.getUrl('JellyfinEnhanced/tag-data/' + ApiClient.getCurrentUserId()), {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `MediaBrowser Token="${ApiClient.accessToken()}"` },
          body: JSON.stringify(ids.slice(start, start + 200)),
        });
        if (!response.ok) return { error: 'tag-data answered ' + response.status };
        facts.push(...Object.values((await response.json()).Items || {}));
      }
      const leaving = facts.filter(fact => fact && fact.Leaving);
      return { asked: ids.length, answered: facts.length, leaving: leaving.length, deleteAt: [...new Set(leaving.map(fact => new Date(fact.Leaving.DeleteAt).toISOString()))] };
    }, prep.episodes);
  } finally {
    await page.evaluate(async original => {
      const JE = window.JellyfinEnhanced, saved = JSON.parse(original);
      for (const key of Object.keys(JE.currentSettings)) if (!(key in saved)) delete JE.currentSettings[key];
      Object.assign(JE.currentSettings, saved);
      await JE.saveUserSettings('settings.json', JE.currentSettings);
    }, prep.original);
  }
  return out;
};
