// The fallback path of upstream c55c758e on real jellyfin-web 12.4: the OSD settings menu opens but has
// no "Playback Info" entry (a page observer removes button[data-id="stats"] the moment the sheet is
// built, as a web client without that entry would show it). Expected: the sheet is closed, never seen,
// and the plugin overlay opens and stays; the next press closes the overlay without opening the menu.
export default async ({ page, go, until, sleep }) => {
  const r = await page.evaluate(async () => {
    const api = window.ApiClient;
    const res = await api.getJSON(api.getUrl(`Items?userId=${api.getCurrentUserId()}&IncludeItemTypes=Movie&Recursive=true&SortBy=SortName&Limit=1&HasTmdbId=true`));
    return res.Items[0];
  });
  await go(`#/details?id=${r.Id}`);
  const play = page.locator('.btnPlay, button[data-action="resume"], button[data-action="play"]').filter({ visible: true }).first();
  await until(() => play.count(), 30000);
  await play.click();
  await until(() => page.evaluate(() => { const v = document.querySelector('video'); return v && v.currentTime > 1; }), 45000);
  await page.evaluate(() => {
    window.__menus = 0;
    new MutationObserver(() => {
      for (const b of document.querySelectorAll('.actionSheet button[data-id="stats"]')) { b.remove(); window.__menus++; }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const state = () => page.evaluate(() => {
    const stats = document.querySelector('.playerStats');
    const sheet = document.querySelector('.actionSheet');
    return {
      nativeStats: stats ? (stats.classList.contains('hide') ? 'hidden' : 'shown') : 'absent',
      jeOverlay: document.querySelectorAll('[data-je-playback-info]').length,
      actionSheets: document.querySelectorAll('.actionSheet').length,
      sheetVisible: !!sheet && getComputedStyle(sheet).opacity !== '0' && !!sheet.getClientRects().length,
      hidingStyles: [...document.querySelectorAll('style')].filter(s => /\.dialogContainer,\s*\.dialogBackdrop,\s*\.actionSheet\s*\{\s*opacity:\s*0/.test(s.textContent)).length,
      menusOpened: window.__menus,
    };
  });
  await page.keyboard.press('i');
  await sleep(2500);
  const afterFirstPress = await state();
  await sleep(1500);
  const later = await state();
  await page.keyboard.press('i');
  await sleep(1500);
  const afterSecondPress = await state();
  await page.evaluate(() => document.querySelector('video')?.pause());
  return { afterFirstPress, later, afterSecondPress };
};
