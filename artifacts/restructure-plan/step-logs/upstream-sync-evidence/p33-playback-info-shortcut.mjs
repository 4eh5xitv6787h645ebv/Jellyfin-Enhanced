// Upstream c55c758e: the ShowPlaybackInfo shortcut ("I") opens jellyfin-web's own stats
// overlay (through an invisible OSD settings sheet) and keeps the plugin overlay only as
// a fallback. Plays the first movie, presses I twice, and reports after each press what
// is on screen: the native stats panel, JE's overlay, and anything the hidden sheet could
// leave behind (an action sheet, a dialog container, the opacity style).
export default async ({ page, go, until, sleep, base }) => {
  const r = await page.evaluate(async () => {
    const api = window.ApiClient;
    const uid = api.getCurrentUserId();
    const res = await api.getJSON(api.getUrl(`Items?userId=${uid}&IncludeItemTypes=Movie&Recursive=true&SortBy=SortName&Limit=1&HasTmdbId=true`));
    return res.Items[0];
  });
  await go(`#/details?id=${r.Id}`);
  const play = page.locator('.btnPlay, button[data-action="resume"], button[data-action="play"]').filter({ visible: true }).first();
  await until(() => play.count(), 30000);
  await play.click();
  const t = await until(() => page.evaluate(() => { const v = document.querySelector('video'); return v && v.currentTime > 1 ? v.currentTime : 0; }), 45000);
  const state = () => page.evaluate(() => {
    const stats = document.querySelector('.playerStats');
    const styles = [...document.querySelectorAll('style')].filter(s => /\.dialogContainer,\s*\.dialogBackdrop,\s*\.actionSheet\s*\{\s*opacity:\s*0/.test(s.textContent));
    return {
      nativeStats: stats ? (stats.classList.contains('hide') ? 'hidden' : 'shown') : 'absent',
      nativeStatsRows: stats ? stats.querySelectorAll('.playerStats-stat').length : 0,
      jeOverlay: document.querySelectorAll('[data-je-playback-info]').length,
      actionSheets: document.querySelectorAll('.actionSheet').length,
      dialogContainers: document.querySelectorAll('.dialogContainer').length,
      hidingStyles: styles.length,
      settingsButton: document.querySelectorAll('button.btnVideoOsdSettings').length,
    };
  });
  const before = await state();
  await page.keyboard.press('i');
  await sleep(1500);
  const afterFirst = await state();
  await page.keyboard.press('i');
  await sleep(1500);
  const afterSecond = await state();
  await page.evaluate(() => document.querySelector('video')?.pause());
  return { item: r.Name, playing: !!t, before, afterFirstPress: afterFirst, afterSecondPress: afterSecond };
};
