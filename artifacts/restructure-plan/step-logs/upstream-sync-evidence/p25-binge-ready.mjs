// Port 25 (upstream 910d1da4): "Binge Ready" instead of "Series Finale" on an ended show released in one drop.
// The lab has no route to TMDB, so the script answers the page's own request for series facts
// (GET /JellyfinEnhanced/status-tags/series) inside the browser, the same way for every build: the show has ended
// and its final regular episode, the last one in the library, aired yesterday. Only the series' premiere date (a
// Jellyfin field, set through the item editor's API) differs between the two cases:
//   oneDrop  the premiere two days before that final episode;
//   weekly   the premiere sixty days before it.
// The web client asks for series facts only when the administrator has Status tags on and a TMDB key set, so the
// script sets both in the plugin configuration for the run (the lab's copy has neither; the key is a made-up one and
// the lab has no route to TMDB) and puts them back afterwards.
// Reports the Status badge the web client draws on the series card in each case, and the Status labels the
// administrator's Tag Styles editor offers (the server's catalogue). The premiere date is put back at the end.
export default async ({ page, go, until, sleep }) => {
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  const day = 86400000;
  const adminSwitches = (values) => page.evaluate(async (values) => {
    const plugins = await ApiClient.getJSON(ApiClient.getUrl('Plugins'));
    const id = plugins.find(p => p.Name === 'Jellyfin Enhanced').Id;
    const config = await ApiClient.getPluginConfiguration(id);
    const before = Object.fromEntries(Object.keys(values).map(key => [key, config[key] === undefined ? null : config[key]]));
    Object.assign(config, values);
    await ApiClient.updatePluginConfiguration(id, config);
    return before;
  }, values);
  const switchesBefore = await adminSwitches({ StatusTagsEnabled: true, TMDB_API_KEY: 'lab-key-without-a-route' });
  const prep = await page.evaluate(async () => {
    const JE = window.JellyfinEnhanced, uid = ApiClient.getCurrentUserId();
    const original = JSON.stringify(JE.currentSettings);
    Object.assign(JE.currentSettings, { statusTagsEnabled: true });
    await JE.saveUserSettings('settings.json', JE.currentSettings);
    const series = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Series', Recursive: true, SortBy: 'SortName', Limit: 1 })).Items[0];
    const full = await ApiClient.getItem(uid, series.Id);
    // The last regular episode the library holds: what the tag cache calls the latest episode.
    const episodes = (await ApiClient.getJSON(ApiClient.getUrl('Shows/' + series.Id + '/Episodes', { userId: uid, Fields: 'Path' }))).Items
      .filter(e => e.ParentIndexNumber > 0 && e.IndexNumber > 0 && e.LocationType !== 'Virtual');
    const last = episodes.reduce((a, b) => (b.ParentIndexNumber > a.ParentIndexNumber || (b.ParentIndexNumber === a.ParentIndexNumber && b.IndexNumber > a.IndexNumber) ? b : a));
    const counts = {};
    for (const e of episodes) counts[e.ParentIndexNumber] = Math.max(counts[e.ParentIndexNumber] || 0, e.IndexNumberEnd || e.IndexNumber);
    return { original, id: series.Id, name: series.Name, premiere: full.PremiereDate || null, last: { season: last.ParentIndexNumber, episode: last.IndexNumberEnd || last.IndexNumber }, counts };
  });
  // Yesterday in the browser's own calendar, as TMDB writes an air date.
  const finalDate = await page.evaluate(() => { const d = new Date(Date.now() - 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  const facts = { status: 'Ended', lastAired: { date: finalDate, season: prep.last.season, episode: prep.last.episode, type: 'finale' }, nextAired: null, seasonEpisodes: prep.counts };
  await page.route(/\/JellyfinEnhanced\/status-tags\/series/, async (route) => {
    const ids = (new URL(route.request().url()).searchParams.get('ids') || '').split(',').filter(Boolean);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.fromEntries(ids.map(id => [id, facts]))) });
  });
  const setPremiere = (iso) => page.evaluate(async ({ id, iso }) => {
    const item = await ApiClient.getItem(ApiClient.getCurrentUserId(), id);
    item.PremiereDate = iso;
    await ApiClient.updateItem(item);
  }, { id: prep.id, iso });
  const badge = async (daysBeforeFinal) => {
    const finalUtc = Date.parse(finalDate + 'T00:00:00Z');
    await setPremiere(new Date(finalUtc - daysBeforeFinal * day).toISOString());
    await sleep(12000);                                     // the tag cache applies the item change after its debounce
    await page.reload(); await sleep(4000);
    await go('#/search?query=' + encodeURIComponent(prep.name));
    const read = () => page.evaluate((id) => {
      const card = [...document.querySelectorAll('.card[data-id]')].find(c => c.dataset.id === id);
      const tag = card && card.querySelector('.status-tag');
      const known = window.JellyfinEnhanced.tagPipeline && window.JellyfinEnhanced.tagPipeline.peekItemFacts ? window.JellyfinEnhanced.tagPipeline.peekItemFacts(id) : null;
      return card && card.querySelector('.je-tag-host') ? { key: tag ? tag.dataset.jeStatus || null : null, text: tag ? tag.textContent.trim() : null,
        libraryLatestEpisode: known && known.LatestEpisodeIndex ? 'S' + known.LatestEpisodeIndex.Season + 'E' + known.LatestEpisodeIndex.Episode : null } : null;
    }, prep.id);
    await until(async () => { const r = await read(); return r && r.key ? r : null; }, 30000).catch(() => null);
    await sleep(2500);
    return { premiereDaysBeforeTheFinalEpisode: daysBeforeFinal, ...((await read()) || { key: 'card not drawn' }) };
  };
  const out = { series: prep.name, finalEpisode: 'S' + prep.last.season + 'E' + prep.last.episode + ' aired yesterday', oneDrop: await badge(2), weekly: await badge(60) };

  // The administrator's Tag Styles editor: the Status labels of the server's catalogue.
  try {
    await go('#/configurationpage?name=Jellyfin%20Enhanced&jeSection=media-tags&tab=colours');
    await until(() => page.evaluate(() => !!document.querySelector('#tagStyleTabs [data-group="status"]')), 30000);
    await page.evaluate(() => document.querySelector('#tagStyleTabs [data-group="status"]').click());
    await until(() => page.evaluate(() => document.querySelectorAll('#tagStyleTargets .status-tag').length > 0), 15000);
    const labels = await page.evaluate(() => [...document.querySelectorAll('#tagStyleTargets .status-tag')].map(c => c.textContent.trim()));
    out.tagStyles = { statusLabels: labels.length, bingeReady: labels.includes('Binge Ready'), seriesFinale: labels.includes('Series Finale') };
  } catch (e) { out.tagStyles = 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 160); }

  // Put the lab back: the series' own premiere date and the user's settings.
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings && window.JellyfinEnhanced.saveUserSettings)), 30000);
  await setPremiere(prep.premiere);
  await adminSwitches(switchesBefore);
  await page.evaluate(async (original) => {
    const JE = window.JellyfinEnhanced, saved = JSON.parse(original);
    for (const key of Object.keys(JE.currentSettings)) if (!(key in saved)) delete JE.currentSettings[key];
    Object.assign(JE.currentSettings, saved);
    await JE.saveUserSettings('settings.json', JE.currentSettings);
  }, prep.original);
  return out;
};
