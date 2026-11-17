// The Elsewhere panel's custom branding on a movie with nothing streaming. The lab has no internet, so the page's TMDB
// watch-providers request is answered here with an empty provider list. The plugin settings hold the message
// "Only on this server" and the icon URL /web/favicons/touchicon.png (a file Jellyfin 12.4's web client serves).
export default async ({ page, go, until, sleep }) => {
  const warnings = [];
  page.on('console', m => { if (m.type() === 'warning' && /branding icon/i.test(m.text())) warnings.push(m.text().replace(/https?:\/\/[^/"]+/g, '<server>')); });
  await page.route(/\/JellyfinEnhanced\/tmdb\/.*watch\/providers/i, route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 1, results: { US: { link: 'https://www.justwatch.com/us', flatrate: [] } } }) }));
  await page.reload(); // public config is read when the app starts
  await go('#/details?id=0ff8461bed0a2658ec63487586efdbd3');
  await until(() => page.evaluate(() => !!document.querySelector('#itemDetailPage:not(.hide) .elsewhere-custom-branding')), 20000).catch(() => null);
  await sleep(1500);
  const panel = await page.evaluate(() => {
    const title = document.querySelector('#itemDetailPage:not(.hide) .elsewhere-custom-branding');
    if (!title) return 'no custom branding title';
    const icon = title.querySelector('img');
    return { text: title.textContent.trim(), icon: icon ? icon.getAttribute('src').replace(/^https?:\/\/[^/]+/, '<server>') : null,
      loaded: icon ? icon.complete && icon.naturalWidth > 0 : null, hidden: icon ? icon.style.display === 'none' : null,
      alignItems: title.style.alignItems, gap: title.style.gap };
  });
  return JSON.stringify(panel) + '\nconsole warnings: ' + (warnings.join(' | ') || 'none');
};
