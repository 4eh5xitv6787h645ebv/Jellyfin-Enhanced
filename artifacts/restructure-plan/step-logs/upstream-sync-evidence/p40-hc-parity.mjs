// Parity check for upstream 7649dda9 (Hidden Content saves), same script on every build.
// 1. Seed the stored list with a Seerr entry whose name an older card stored HTML-escaped, and reload so the page
//    loads it. 2. Remove an episode from Continue Watching (the server stores it under the dashed ID), then unhide it
//    in this tab, and hide a movie. 3. After the save, read what the server holds.
const EPISODE = '0932a8ba3335d82b0aae3f9b1d4b3269';
const MOVIE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01';
export default async ({ page, go, until, sleep }) => {
  const ready = () => until(() => page.evaluate(() => !!(window.JellyfinEnhanced?.hiddenContent?.unhideItem
    && window.JellyfinEnhanced?.internals?.features?.removeFromHomeSurface)), 30000);
  const ajax = (type, body) => page.evaluate(([type, body]) => {
    const c = window.ApiClient;
    const url = c.getUrl(`/JellyfinEnhanced/user-settings/${c.getCurrentUserId()}/hidden-content.json`) + (type === 'GET' ? `?_=${Date.now()}` : '');
    return c.ajax(body ? { type, url, data: JSON.stringify(body), contentType: 'application/json', dataType: 'json' } : { type, url, dataType: 'json' });
  }, [type, body]);
  await go('#/home');
  await ready();
  await ajax('POST', { items: { 'tmdb-7': { itemId: '', tmdbId: '7', name: 'Tom &amp; Jerry', type: 'Series', hideScope: 'global' } }, settings: {} });
  await page.reload();
  await ready();
  await sleep(1500);
  const shown = await page.evaluate(() => window.JellyfinEnhanced.hiddenContent.getAllHiddenItems().map(i => `${i._key}=${i.name}`));
  const removed = await page.evaluate(id => window.JellyfinEnhanced.internals.features.removeFromHomeSurface(id, 'continuewatching'), EPISODE);
  const afterRemove = Object.keys((await ajax('GET')).Items || {}).sort();
  await page.evaluate(([episode, movie]) => {
    const hc = window.JellyfinEnhanced.hiddenContent;
    hc.unhideItem(episode);
    hc.hideItem({ itemId: movie, name: 'Movie', type: 'Movie' });
  }, [EPISODE, MOVIE]);
  await sleep(3000);
  const stored = (await ajax('GET')).Items || {};
  return {
    shownAtLoad: shown,
    removedFromContinueWatching: removed,
    storedAfterRemoval: afterRemove,
    storedAfterUnhideAndHide: Object.keys(stored).sort(),
    storedSeerrName: stored['tmdb-7']?.Name,
  };
};
