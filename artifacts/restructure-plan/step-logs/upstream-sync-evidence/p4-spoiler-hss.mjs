// Port 4 (upstream d3bd07d3): 13 Reasons Why is under Spoiler Guard and its first episode is watched, so S01E02 is
// next up and unwatched. Reports that episode as the real Home Screen Sections plugin (3.0.4.0) serves it from
// GET /HomeScreen/Section/NextUp, beside Jellyfin's own GET /Shows/NextUp (which Spoiler Guard already covers).
export default async ({ page }) => page.evaluate(async () => {
  const uid = ApiClient.getCurrentUserId();
  const series = '8748b33dc58b0ad6c2a25d0d522f5a68', firstEpisode = '9563efa92bbb65c2e81d1015e43b0469';
  await ApiClient.markPlayed(uid, firstEpisode, new Date());
  const guard = await ApiClient.ajax({ type: 'POST', url: ApiClient.getUrl('JellyfinEnhanced/spoiler-blur/series/' + series), dataType: 'json' });
  const pick = result => (result.Items || []).filter(item => item.SeriesId === series)
    .map(item => ({ episode: `S${item.ParentIndexNumber}E${item.IndexNumber}`, name: item.Name, overview: item.Overview ? item.Overview.slice(0, 60) : item.Overview ?? null, path: item.Path ?? null }));
  return {
    seriesGuarded: guard?.success ?? guard,
    homeScreenSectionsNextUp: pick(await ApiClient.getJSON(ApiClient.getUrl('HomeScreen/Section/NextUp', { userId: uid }))),
    jellyfinNextUp: pick(await ApiClient.getJSON(ApiClient.getUrl('Shows/NextUp', { userId: uid, seriesId: series, fields: 'Overview,Path' }))),
  };
});
