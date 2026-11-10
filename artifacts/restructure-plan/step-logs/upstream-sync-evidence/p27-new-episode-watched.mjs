// Port 27 (upstream 8d91169c): "New Episode" is not shown on a series the viewer has watched in full.
// The second series of the lab (nothing of it watched, in the library for weeks) gets one episode with an added date
// of an hour ago, so its card says New Episode. The script reads the card's Status badge and Jellyfin's own
// indicator on it, then marks the whole series played (the card then shows the played check) and reads both again.
// The episode's date and the played state are put back at the end.
export default async ({ page, go, until, sleep }) => {
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  const prep = await page.evaluate(async () => {
    const JE = window.JellyfinEnhanced, uid = ApiClient.getCurrentUserId();
    const original = JSON.stringify(JE.currentSettings);
    Object.assign(JE.currentSettings, { statusTagsEnabled: true });
    await JE.saveUserSettings('settings.json', JE.currentSettings);
    const candidates = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Series', Recursive: true, SortBy: 'SortName', Limit: 12, Fields: 'DateCreated,RecursiveItemCount' })).Items;
    // Not the first one (earlier checks of this run changed its dates), nothing watched, in the library for more than a month.
    const series = candidates.slice(1).find(s => s.UserData && s.UserData.UnplayedItemCount > 0 && !s.UserData.Played && s.UserData.PlayedPercentage === 0
      && Date.now() - Date.parse(s.DateCreated) > 30 * 86400000);
    if (!series) return { error: 'no unwatched series older than a month in this lab' };
    const episodes = (await ApiClient.getJSON(ApiClient.getUrl('Shows/' + series.Id + '/Episodes', { userId: uid, Fields: 'DateCreated' }))).Items
      .filter(e => e.ParentIndexNumber > 0 && e.LocationType !== 'Virtual');
    if (episodes.some(e => e.UserData && e.UserData.Played)) return { error: 'the series has watched episodes' };
    const episode = await ApiClient.getItem(uid, episodes[episodes.length - 1].Id);
    const episodeAdded = episode.DateCreated;
    episode.DateCreated = new Date(Date.now() - 3600000).toISOString();
    await ApiClient.updateItem(episode);
    return { original, id: series.Id, name: series.Name, episodes: episodes.length, episodeId: episode.Id, episodeAdded };
  });
  if (prep.error) return prep;
  // Each read uses a search of its own: the web client keeps the answer to a search it has already made.
  const card = async (query) => {
    await sleep(12000);                                     // the tag cache applies the change after its debounce
    await go('#/home');
    await page.reload(); await sleep(4000);
    const played = await page.evaluate(async (id) => (await ApiClient.getItem(ApiClient.getCurrentUserId(), id)).UserData.Played, prep.id);
    await go('#/search?query=' + encodeURIComponent(query));
    const read = () => page.evaluate((id) => {
      const el = [...document.querySelectorAll('.card[data-id]')].find(c => c.dataset.id === id);
      if (!el || !el.querySelector('.je-tag-host')) return null;
      const tag = el.querySelector('.status-tag');
      const count = el.querySelector('.countIndicator');
      return { jellyfinIndicator: el.querySelector('.playedIndicator') ? 'played check' : count ? 'unwatched count ' + count.textContent.trim() : 'none',
        statusBadge: tag ? tag.textContent.trim() : null };
    }, prep.id);
    await until(read, 30000).catch(() => null);
    await sleep(4000);
    return { jellyfinSaysPlayed: played, ...((await read()) || { statusBadge: 'card not drawn' }) };
  };
  const out = { series: prep.name, episodes: prep.episodes };
  out.notWatched = await card(prep.name);
  await page.evaluate(async (id) => { await ApiClient.markPlayed(ApiClient.getCurrentUserId(), id, new Date()); }, prep.id);
  out.watchedInFull = await card(prep.name.split(' ').slice(1).join(' ') || prep.name.slice(0, -1));

  // Put the lab back.
  await page.evaluate(async ({ id, episodeId, episodeAdded, original }) => {
    const uid = ApiClient.getCurrentUserId(), JE = window.JellyfinEnhanced;
    await ApiClient.markUnplayed(uid, id);
    const episode = await ApiClient.getItem(uid, episodeId);
    episode.DateCreated = episodeAdded;
    await ApiClient.updateItem(episode);
    const saved = JSON.parse(original);
    for (const key of Object.keys(JE.currentSettings)) if (!(key in saved)) delete JE.currentSettings[key];
    Object.assign(JE.currentSettings, saved);
    await JE.saveUserSettings('settings.json', JE.currentSettings);
  }, prep);
  return out;
};
