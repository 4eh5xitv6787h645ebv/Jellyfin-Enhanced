// Port 8 (upstream 2e1f123d, #1032), against a real Seerr 3.5.1 (`je12 up --real seerr`), as real-admin.
// 1. POST jellyseerr/watchlist as the browser calls it after a request: add, add again, invalid body.
// 2. Removal sync, mode "Jellyfin decides": the movie is liked in Jellyfin and on the Seerr watchlist; the first
//    run of the task only records that; the like is removed; the second run removes it from Seerr.
// The movie is 101 Dalmatians II (TMDB 13654), which the lab library and Seerr's recorded TMDB data both have.
export default async ({ page }) => page.evaluate(async () => {
  const ID = 'f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b', TMDB = 13654;
  const uid = ApiClient.getCurrentUserId();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const call = async (method, path, body) => {
    const response = await fetch(ApiClient.getUrl(path), { method, headers: { Authorization: `MediaBrowser Token="${ApiClient.accessToken()}"`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await response.json(); } catch { /* empty body */ }
    return { status: response.status, json };
  };
  const brief = r => ({ status: r.status, ...(r.json?.code ? { code: r.json.code } : {}), ...(r.json?.tmdbId ? { tmdbId: r.json.tmdbId, mediaType: r.json.mediaType } : {}) });
  const onSeerr = async () => { const r = await call('GET', 'JellyfinEnhanced/jellyseerr/watchlist'); return r.status === 200 ? (r.json.results || []).some(x => x.tmdbId === TMDB) : `HTTP ${r.status}`; };
  const out = {};

  const config = await ApiClient.getPluginConfiguration(ID);
  Object.assign(config, { JellyseerrEnabled: true, AddRequestedMediaToWatchlist: true, SyncJellyfinWatchlistToSeerr: true, WatchlistRemovalSync: 'jellyfin' });
  await ApiClient.updatePluginConfiguration(ID, config);
  out.removalSetting = (await ApiClient.getPluginConfiguration(ID)).WatchlistRemovalSync ?? '(no such setting)';
  // start clean: off the Seerr watchlist, not liked
  const movie = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Movie', Recursive: true, AnyProviderIdEquals: `Tmdb.${TMDB}`, Limit: 1 })).Items[0];
  out.movie = movie ? movie.Name : 'not in the library';
  await call('DELETE', `UserItems/${movie.Id}/Rating?userId=${uid}`);

  out.addToSeerrWatchlist = brief(await call('POST', 'JellyfinEnhanced/jellyseerr/watchlist', { tmdbId: TMDB, mediaType: 'movie', title: 'ignored' }));
  out.addAgain = brief(await call('POST', 'JellyfinEnhanced/jellyseerr/watchlist', { tmdbId: TMDB, mediaType: 'movie' }));
  out.addInvalid = brief(await call('POST', 'JellyfinEnhanced/jellyseerr/watchlist', { tmdbId: TMDB, mediaType: 'person' }));
  out.onSeerrWatchlistAfterAdd = await onSeerr();

  const task = (await ApiClient.getJSON(ApiClient.getUrl('ScheduledTasks'))).find(t => t.Key === 'JellyfinEnhancedWatchlistRemovalSync');
  out.removalTask = task ? `${task.Name} (${(task.Triggers || []).map(t => t.Type + '@' + (t.TimeOfDayTicks / 36e9) + 'h').join(',')})` : 'no such task';
  const run = async () => {
    if (!task) return 'no such task';
    await call('POST', `ScheduledTasks/Running/${task.Id}`);
    for (let i = 0; i < 60; i++) { await wait(1000); const t = await ApiClient.getJSON(ApiClient.getUrl(`ScheduledTasks/${task.Id}`)); if (t.State === 'Idle') return t.LastExecutionResult?.Status ?? 'Idle'; }
    return 'still running';
  };
  await call('POST', `UserItems/${movie.Id}/Rating?userId=${uid}&likes=true`);          // on the Jellyfin watchlist
  out.firstRun = await run();
  out.onSeerrAfterFirstRun = await onSeerr();
  await call('DELETE', `UserItems/${movie.Id}/Rating?userId=${uid}`);                    // removed from the Jellyfin watchlist
  out.secondRun = await run();
  out.onSeerrAfterRemovingInJellyfin = await onSeerr();
  // leave the lab as it was
  await call('DELETE', `UserItems/${movie.Id}/Rating?userId=${uid}`);
  return out;
});
