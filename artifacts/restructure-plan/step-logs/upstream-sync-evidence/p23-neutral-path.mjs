// Port 23 (upstream bcd6574a, issue #1039): Download and Download all on an item under Spoiler Guard.
// jellyfin-web builds the file name with item.Path.replace(/^.*[\\/]/, ''), so a guarded item without a Path made
// both throw. Two series are put under Spoiler Guard: one whose files are .mkv and one whose files are .mp4 (their
// Container is ffprobe's list "mov,mp4,m4a,3gp,3g2,mj2"). For an unwatched episode of each (not the first, which is
// next up) this reports what the two routes web downloads from return, the file name web builds from each, and
// then what the Download entry of the episode page's menu does. The real paths are never printed.
export default async ({ page, go, until, sleep }) => {
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken())), 30000);
  const out = await page.evaluate(async () => {
    const uid = ApiClient.getCurrentUserId();
    // What web's Download and Download all do with the item (itemContextMenu.js).
    const webFileName = (item) => { try { return item.Path.replace(/^.*[\\/]/, ''); } catch (e) { return 'throws ' + e.constructor.name; } };
    const shape = (item) => ({ path: item.Path === undefined ? 'absent' : item.Path, webFileName: webFileName(item) });
    const result = {};
    for (const [kind, name] of [['mkv', '13 Reasons Why'], ['mp4', 'Oswald']]) {
      const series = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Series', Recursive: true, SearchTerm: name, Limit: 1 })).Items[0];
      const guard = await ApiClient.ajax({ type: 'POST', url: ApiClient.getUrl('JellyfinEnhanced/spoiler-blur/series/' + series.Id), dataType: 'json' });
      // Download all: the season's episodes, asked for the way web asks.
      const list = (await ApiClient.getJSON(ApiClient.getUrl('Shows/' + series.Id + '/Episodes', { userId: uid, Fields: 'CanDownload,Path', Season: 1 }))).Items;
      const listed = list.find(e => e.IndexNumber >= 2 && !(e.UserData && e.UserData.Played) && (kind === 'mp4') === String(e.Container || '').includes(','));
      if (!listed) { result[kind] = { series: series.Name, error: 'no unwatched episode of that kind' }; continue; }
      // Download on the episode's own page: the single-item route.
      const single = await ApiClient.getItem(uid, listed.Id);
      result[kind] = {
        series: series.Name, guarded: guard && guard.success !== undefined ? guard.success : guard, id: listed.Id,
        episode: 'S' + listed.ParentIndexNumber + 'E' + listed.IndexNumber, name: single.Name, container: single.Container, canDownload: single.CanDownload,
        itemPage: shape(single), downloadAll: shape(listed),
      };
    }
    return result;
  });
  // The real menu, on the .mkv episode's page: More, then Download.
  const target = out.mkv && out.mkv.id;
  if (target) {
    const errors = [], downloads = [];
    const onError = (e) => errors.push(String(e.message || e).slice(0, 120));
    const onRequest = (r) => { if (/\/Items\/[0-9a-f]+\/Download/i.test(r.url())) downloads.push(r.method() + ' /Items/…/Download'); };
    const onDownload = () => downloads.push('a download started');
    page.on('pageerror', onError); page.on('request', onRequest); page.on('download', onDownload);
    try {
      await go('#/details?id=' + target);
      const more = page.locator('.itemDetailPage:not(.hide) .btnMoreCommands:not(.hide)').first();
      await more.waitFor({ state: 'visible', timeout: 20000 });
      await sleep(1500);
      errors.length = 0;
      await more.click();
      const entry = page.locator('.actionSheet button[data-id="download"]').first();
      await entry.waitFor({ state: 'visible', timeout: 10000 });
      await entry.click();
      await sleep(4000);
      out.menuDownload = { pageErrors: errors.slice(), downloads: downloads.slice() };
    } catch (e) {
      out.menuDownload = { failed: String(e.message || e).split('\n')[0].slice(0, 160), pageErrors: errors.slice(), downloads: downloads.slice() };
    }
    page.off('pageerror', onError); page.off('request', onRequest); page.off('download', onDownload);
  }
  for (const kind of ['mkv', 'mp4']) if (out[kind]) delete out[kind].id;
  return out;
};
