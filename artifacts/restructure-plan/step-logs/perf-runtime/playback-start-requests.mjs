// je12 browse script (perf-runtime evidence): start playback of the first movie the way a user does and count what
// the pause screen asks the server for.   je12 browse '#/home' --script <this file>
// The pause screen identifies the playing item with GET /Items/{id} and then probes its artwork with one HEAD per
// candidate image. Before the fix it did both twice per playback start (once when the <video> appeared, again after
// jellyfin-web changed the route to the player).
export default async ({ page, go, until, sleep }) => {
  const requests = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/Items\/[0-9a-f]{32}(\/Images\/(Logo|Disc|Backdrop))?$/.test(path)) requests.push(`${request.method()} ${path.replace(/[0-9a-f]{32}/, ':id')}`);
  });
  const id = await page.evaluate(async () => {
    const result = await ApiClient.getItems(ApiClient.getCurrentUserId(), { IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', Limit: 1 });
    return result.Items[0].Id;
  });
  await go(`#/details?id=${id}`);
  const play = page.locator('.btnPlay, button[data-action="resume"], button[data-action="play"]').filter({ visible: true }).first();
  await until(() => play.count(), 30000);
  requests.length = 0;
  await play.click();
  const playing = await until(() => page.evaluate(() => { const video = document.querySelector('video'); return video && video.currentTime > 1; }), 45000);
  await sleep(3000);
  const byKind = {};
  for (const request of requests) byKind[request] = (byKind[request] || 0) + 1;
  return { playing: !!playing, itemRequests: byKind['GET /Items/:id'] || 0, imageProbes: requests.filter(request => request.startsWith('HEAD ')).length, byKind };
};
