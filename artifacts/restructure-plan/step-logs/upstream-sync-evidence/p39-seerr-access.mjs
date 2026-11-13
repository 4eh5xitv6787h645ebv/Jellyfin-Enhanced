// p39 (upstream 076012a2, #1055): what real-viewer gets from JE's studio/ and genre/ lookups and from the Seerr
// details of two shows, after p39-seerr-access.setup.sh. Run with --user viewer on the rewrite before the port, on
// upstream's build and on the port.
// jellyfin: what Jellyfin itself answers the viewer for the same studio (its user item route, then /Studios/{name}).
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => !!window.ApiClient?.getCurrentUserId?.()), 20000);
  return page.evaluate(async () => {
    const api = window.ApiClient;
    const uid = api.getCurrentUserId();
    const call = async (path) => {
      const r = await fetch(api.getUrl(path), { headers: { Authorization: `MediaBrowser Token="${api.accessToken()}"` } });
      let body = null;
      try { body = await r.json(); } catch { /* not JSON */ }
      return { status: r.status, name: body?.name ?? body?.Name ?? null };
    };
    const studio = '80ae90c0629e00f2b24f51c18b5b308c'; // 2.0 Entertainment
    const genre = 'ce06903d834d2c3417e0889dd4049f3b';  // Action
    return {
      jellyfin: {
        userItemStudio: (await call(`Items/${studio}?userId=${uid}`)).status,
        studiosByName: await call(`Studios/${encodeURIComponent('2.0 Entertainment')}?userId=${uid}`)
      },
      je: {
        studio: await call(`JellyfinEnhanced/studio/${studio}`),
        genre: await call(`JellyfinEnhanced/genre/${genre}`)
      },
      seerr: {
        tvEmptyGermanRating: (await call('JellyfinEnhanced/jellyseerr/tv/990101')).status,
        tvGerman16Control: (await call('JellyfinEnhanced/jellyseerr/tv/990102')).status
      }
    };
  });
};
