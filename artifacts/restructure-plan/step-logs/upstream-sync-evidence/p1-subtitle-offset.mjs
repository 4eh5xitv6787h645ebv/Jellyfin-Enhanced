// Port 1 (upstream 533614b8): press ] ] [ in the player and report what the user sees, then the panel's rows.
export default async ({ page, go, until, sleep }) => {
  const id = await page.evaluate(async () => (await ApiClient.getItems(ApiClient.getCurrentUserId(),
    { IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', Limit: 1, SearchTerm: '101 Dalmatians II' })).Items[0]?.Id);
  await go(`#/details?id=${id}`);
  const play = page.locator('.btnPlay, button[data-action="resume"], button[data-action="play"]').filter({ visible: true }).first();
  await until(() => play.count(), 30000);
  await play.click();
  await until(() => page.evaluate(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.5; }), 45000);
  const state = () => page.evaluate(() => {
    const slider = document.querySelector('.subtitleSyncSlider');
    const box = document.querySelector('.subtitleSyncContainer');
    return { offset: slider ? slider.value : null, panelHidden: box ? box.classList.contains('hide') : null,
      toasts: [...document.querySelectorAll('.jellyfin-enhanced-toast')].map(e => e.textContent.trim()) };
  });
  const out = {};
  out.bindings = await page.evaluate(() => { const s = window.JellyfinEnhanced.state.activeShortcuts;
    return { DecreaseSubtitleOffset: s.DecreaseSubtitleOffset ?? null, IncreaseSubtitleOffset: s.IncreaseSubtitleOffset ?? null }; });
  out.start = await state();
  await page.keyboard.press(']'); await sleep(300); out.afterIncrease = await state();
  await page.keyboard.press(']'); await sleep(300); out.afterIncreaseAgain = await state();
  await page.keyboard.press('['); await sleep(300); out.afterDecrease = await state();
  await sleep(2400); out.afterIdle = await state();
  await page.evaluate(() => document.querySelector('video')?.pause());
  await page.evaluate(() => window.JellyfinEnhanced.showEnhancedPanel());
  out.panelRows = await until(() => page.evaluate(() => {
    const keys = [...document.querySelectorAll('#jellyfin-enhanced-panel .shortcut-key')];
    if (!keys.length) return null;
    return keys.filter(k => /SubtitleOffset/.test(k.dataset.action || '')).map(k => [k.dataset.action, k.textContent.trim(), k.parentElement?.textContent.replace(/\s+/g, ' ').trim()]);
  }), 8000);
  return out;
};
