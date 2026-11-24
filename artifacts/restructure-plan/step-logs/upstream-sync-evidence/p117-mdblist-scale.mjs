// Port 117 (upstream 03875081): the scale of the item-details MDBList ratings row.
// The lab has no MDBList key and no route out, so the page's one ratings request for Abominable (tmdb 431580) is
// answered here with one fixed MDBList entry: IMDb Score 64 (Value 6.4), RT Critic Score 85, and Roger Ebert with only
// a raw Value of 3.5. Everything else is the build under test: the public configuration it serves, the client that
// draws the row, and the administrator page. Set MdblistRatingsScale and MdblistRatingsShowPercentSymbol with
// `je12 config set` before each run. Prints the scale the page was served, the badges' text in order, and the
// administrator page's Rating Scale control.
export default async ({ page, go, until, sleep }) => {
  const entry = { Found: true, Confirmed: true, Ids: { imdb: 'tt5153288', tmdb: 431580 },
    Ratings: [
      { Source: 'imdb', Score: 64, Value: 6.4, Votes: 1000 },
      { Source: 'tomatoes', Score: 85, Value: 85, Votes: 120 },
      { Source: 'rogerebert', Score: null, Value: 3.5, Votes: null },
    ] };
  let answered = 0;
  await page.route(/\/JellyfinEnhanced\/mdblist-ratings\/movie\/431580/, route => {
    answered += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entry) });
  });
  const out = {};
  await go('#/details?id=06de48d758074756c732c7de70aa79f8');
  await until(() => page.evaluate(() => !!window.JellyfinEnhanced?.pluginConfig), 30000);
  out.served = await page.evaluate(() => {
    const c = window.JellyfinEnhanced.pluginConfig;
    return { MdblistRatingsScale: c.MdblistRatingsScale ?? 'absent', MdblistRatingsShowPercentSymbol: c.MdblistRatingsShowPercentSymbol };
  });
  await until(() => page.evaluate(() => document.querySelectorAll('#itemDetailPage:not(.hide) .je-mdblist-badge').length > 0), 20000).catch(() => null);
  await sleep(500);
  out.badges = await page.evaluate(() => [...document.querySelectorAll('#itemDetailPage:not(.hide) .je-mdblist-badge')]
    .map(b => `${b.querySelector('img')?.getAttribute('alt') ?? b.querySelector('.je-mdblist-source')?.textContent ?? '?'} ${b.textContent.trim()}`));
  out.ratingsRequests = answered;
  await go('#/configurationpage?name=Jellyfin%20Enhanced');
  await until(() => page.evaluate(() => document.querySelector('#mdblistRatingsShowPercentSymbol') !== null), 30000).catch(() => null);
  await sleep(2000);
  out.adminControl = await page.evaluate(() => {
    const select = document.querySelector('#mdblistRatingsScale');
    if (!select) return 'absent';
    const label = select.closest('.jea-row, .selectContainer, .inputContainer')?.querySelector('label')?.textContent?.trim();
    return { label, value: select.value, options: [...select.options].map(o => `${o.value}=${o.textContent}`) };
  });
  return out;
};
