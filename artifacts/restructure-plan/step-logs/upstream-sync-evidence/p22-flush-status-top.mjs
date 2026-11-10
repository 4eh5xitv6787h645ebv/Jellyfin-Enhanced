// Port 22 (upstream 83b557cc): on Flush cards a status tag at top centre that is too wide for the gap beside the
// count badge stays at the top edge and rides over the badge, instead of dropping below it.
// Run at a phone width so the tag is wider than the gap: je12 browse '#/home' --width 420 --height 900 --script <this>.
// The first series of the lab gets an added date of an hour ago (so it is "Just Added") and keeps its unwatched
// count badge. The user's layout is Corners with only Status shown, at top centre, largest size. Reports, for Flush
// and for Tight (which must not change): where the tag sits, whether it covers the badge, and the tag layer's z-index.
export default async ({ page, go, until, sleep }) => {
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  const prep = await page.evaluate(async () => {
    const JE = window.JellyfinEnhanced, uid = ApiClient.getCurrentUserId();
    const original = JSON.stringify(JE.currentSettings);
    const series = (await ApiClient.getItems(uid, { IncludeItemTypes: 'Series', Recursive: true, SortBy: 'SortName', Limit: 1 })).Items[0];
    const full = await ApiClient.getItem(uid, series.Id);
    full.DateCreated = new Date(Date.now() - 3600000).toISOString();
    await ApiClient.updateItem(full);
    return { original, id: series.Id, name: series.Name, unwatched: series.UserData ? series.UserData.UnplayedItemCount : null };
  });
  const use = (edge) => page.evaluate(async (edge) => {
    const JE = window.JellyfinEnhanced;
    const off = ['quality', 'genre', 'language', 'rating', 'ageRating', 'awards', 'logos', 'custom'].map(group => ({ group, slot: 'off' }));
    Object.assign(JE.currentSettings, { statusTagsEnabled: true, tagLayoutSettingsVersion: 1, tagLayout: 'corners', tagEdgeSpacing: edge,
      tagScale: 'largest', tagGap: 'default', tagLabelDensity: 'full', tagLayouts: { corners: { groups: [{ group: 'status', slot: 'tc' }, ...off] } } });
    await JE.saveUserSettings('settings.json', JE.currentSettings);
  }, edge);
  const card = async (edge) => {
    await use(edge);
    await page.reload(); await sleep(4000);
    await go('#/search?query=' + encodeURIComponent(prep.name));
    const read = () => page.evaluate((id) => {
      const el = [...document.querySelectorAll('.card[data-id]')].find(c => c.dataset.id === id);
      const host = el && el.querySelector('.je-tag-host'), chip = host && host.querySelector('.status-tag');
      const badge = el && el.querySelector('.countIndicator');
      if (!host || !chip || !badge) return null;
      const h = host.getBoundingClientRect(), c = chip.getBoundingClientRect(), b = badge.getBoundingClientRect();
      const px = n => Math.round(n * 10) / 10;
      return {
        status: chip.textContent.trim(), edge: host.dataset.jeEdge || 'default', slot: chip.closest('[data-je-slot]').dataset.jeSlot,
        cardWidth: px(h.width), tagWidth: px(c.width), badge: badge.textContent.trim(), gapBesideTheBadge: px(h.width - 2 * (h.right - b.left)),
        tagTop: px(c.top - h.top), badgeBottom: px(b.bottom - h.top),
        tagCoversTheBadge: c.right > b.left && c.left < b.right && c.bottom > b.top && c.top < b.bottom,
        tagLayerZIndex: getComputedStyle(host).zIndex, tagHidden: chip.hasAttribute('data-je-overflow'),
      };
    }, prep.id);
    await until(read, 30000).catch(() => null);
    await sleep(2500);
    return (await read()) || 'card, status tag or count badge not found';
  };
  await sleep(12000);                                       // the tag cache applies the item change after its debounce
  const out = { series: prep.name, unwatched: prep.unwatched, flush: await card('flush'), tight: await card('tight') };
  // Leave the user's settings as they were.
  await page.evaluate(async (original) => {
    const JE = window.JellyfinEnhanced, saved = JSON.parse(original);
    for (const key of Object.keys(JE.currentSettings)) if (!(key in saved)) delete JE.currentSettings[key];
    Object.assign(JE.currentSettings, saved);
    await JE.saveUserSettings('settings.json', JE.currentSettings);
  }, prep.original);
  return out;
};
