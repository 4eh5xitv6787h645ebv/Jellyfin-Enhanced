// MDBList has no AniList rating (upstream 3d72710d), as real-admin on the plugin page: the MDBList "Configure ratings
// shown" list on the Display tab (the lab's saved MdblistRatingsSources still names anilist) and the rating labels of
// the server's Tag Styles catalog (GET /JellyfinEnhanced/tag-styles/catalog).
export default async ({ page, until, sleep }) => {
  await until(() => page.evaluate(() => !!document.querySelector('#mdblistRatingsSourcesAdmin .je-quality-cat-admin-row')), 20000).catch(() => null);
  await sleep(1000);
  return page.evaluate(async () => {
    const rows = [...document.querySelectorAll('#mdblistRatingsSourcesAdmin .je-quality-cat-admin-row')].map(r => r.dataset.sourceKey || r.textContent.trim());
    const res = await fetch(ApiClient.getUrl('JellyfinEnhanced/tag-styles/catalog'), { headers: { Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' } });
    const catalog = res.ok ? await res.json() : null;
    const groups = catalog && (catalog.groups || catalog.Groups) || {};
    const labels = (groups.rating || groups.Rating || []).map(l => l.key || l.Key);
    return [
      `MDBList list (${rows.length} rows): ${rows.join(' ')}`,
      `anilist row: ${rows.includes('anilist') ? 'present' : 'absent'}`,
      `Tag Styles rating labels (HTTP ${res.status}, ${labels.length}): ${labels.join(' ')}`,
      `aniList label: ${labels.includes('aniList') ? 'present' : 'absent'}`,
    ].join('\n');
  });
};
