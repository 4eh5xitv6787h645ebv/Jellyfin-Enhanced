// p42 (upstream 79a90422, #1058): streaming providers from Seerr when there is no TMDB key. The lab has no TMDB key
// and Seerr on (the mock); p42-seerr-providers.setup.sh makes the mock's title details carry watchProviders (US, GB,
// DE), Seerr's global streaming region GB and every user's own DE. Run the same way on each build, once with
// "Use each user's Seerr streaming region" off (the default) and once with it on.
// api: what the two server routes answer the signed-in user; elsewhere: the panel on Abominable's details page;
// posters: the provider lookups the search page's Seerr cards make, search being the first page visited (the lab blocks the logos themselves, and a card drops a
// logo that fails to load), in the order made; moreInfo: the More Info modal's streaming row.
export default async ({ page, go, until, sleep }) => {
  const batches = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.endsWith('/JellyfinEnhanced/watch-providers')) return;
    const batch = { region: url.searchParams.get('region'), items: url.searchParams.get('items'), status: null, results: null };
    batches.push(batch);
    request.response().then(async response => {
      batch.status = response?.status() ?? null;
      const results = (await response?.json())?.results;
      batch.results = results && Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Array.isArray(v) ? v.map(p => p.provider_name) : v]));
    }).catch(() => { /* no answer */ });
  });

  await go('#/home');
  await until(() => page.evaluate(() => !!window.ApiClient?.getCurrentUserId?.()), 20000);
  const api = await page.evaluate(async () => {
    const client = window.ApiClient;
    const call = async path => {
      const r = await fetch(client.getUrl(path), { headers: { Authorization: `MediaBrowser Token="${client.accessToken()}"` } });
      let body = null;
      try { body = await r.json(); } catch { /* not JSON */ }
      return { status: r.status, body };
    };
    const region = await call('JellyfinEnhanced/jellyseerr/streaming-region');
    const batch = await call('JellyfinEnhanced/watch-providers?items=movie:431580,movie:990101');
    const names = list => Array.isArray(list) ? list.map(p => p.provider_name) : list;
    return {
      streamingRegion: region.status === 200 ? region.body : region.status,
      watchProviders: batch.status === 200
        ? { region: batch.body.region, results: Object.fromEntries(Object.entries(batch.body.results).map(([k, v]) => [k, names(v)])) }
        : batch.status
    };
  });
  batches.length = 0; // the line above is the script's own call

  await go('#/search?query=Mock');
  await until(() => page.evaluate(() => [...document.querySelectorAll('.jellyseerr-elsewhere-icons')].some(e => e.closest('.card')?.offsetParent !== null)), 20000);
  // A card looks its icons up once it is on screen.
  await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-elsewhere-icons')].map(e => e.closest('.card')).find(c => c?.offsetParent !== null)?.scrollIntoView());
  await until(async () => batches.length && batches.every(batch => batch.status !== null), 8000);
  const posters = batches.length ? batches.map(b => ({ ...b })) : null;

  await go('#/details?id=06de48d758074756c732c7de70aa79f8');
  const panel = await until(() => page.evaluate(() => {
    const c = [...document.querySelectorAll('.streaming-lookup-container')].find(e => e.offsetParent !== null);
    if (!c) return null;
    const title = c.querySelector('a')?.textContent?.trim() ?? '';
    const services = [...c.querySelectorAll('img')].map(img => img.alt).filter(Boolean);
    return title ? { title, services } : null;
  }), 20000);

  const moreInfo = await page.evaluate(async () => {
    const JE = window.JellyfinEnhanced;
    if (!JE?.jellyseerrMoreInfo?.open) return 'no More Info';
    await JE.jellyseerrMoreInfo.open(431580, 'movie');
    return null;
  });
  const row = moreInfo ?? await until(() => page.evaluate(() => {
    const modal = document.querySelector('.je-more-info-modal:not(.closing)');
    if (!modal) return null;
    const list = modal.querySelector('.je-more-info-providers-list');
    return list ? { region: list.getAttribute('title'), services: [...list.querySelectorAll('img')].map(img => img.alt) } : 'no streaming row';
  }), 20000);
  await sleep(200);
  return { api, elsewhere: panel ?? 'no panel', posters: posters ?? 'no provider request', moreInfo: row };
};
