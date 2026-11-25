// Parity check for upstream 417c00d8 (#1094): touch holds on the player no longer toggle jellyfin-web's OSD or
// scroll, a short tap still toggles it (once, on release), and a hold on paused playback does nothing.
//
// Long press for 2x is switched on for the lab admin beforehand (je12 config set longPress2xEnabled true --user
// admin), since upstream installs its listeners only when the setting is on as the page starts. The lab movie is
// played in the browser, and Chromium's touch emulation (CDP Input.dispatchTouchEvent) sends real, trusted touch
// and pointer input at the middle of the video. For each gesture the script reports whether jellyfin-web's OSD was shown while the finger was down and after it
// was lifted, the video's playback rate and paused state, and whether the touchstart/touchmove were cancelled
// (defaultPrevented, which is what stops native scrolling). Before each gesture it waits for the OSD to hide.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const attempt = async (name, work) => { try { out[name] = await work(); } catch (e) { out[name] = 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 200); } };
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  const id = await page.evaluate(async () => (await ApiClient.getItems(ApiClient.getCurrentUserId(),
    { IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', Limit: 1, SearchTerm: '101 Dalmatians II' })).Items[0]?.Id);
  await go(`#/details?id=${id}`);
  const play = page.locator('.btnPlay, button[data-action="resume"], button[data-action="play"]').filter({ visible: true }).first();
  await until(() => play.count(), 30000);
  await play.click();
  await until(() => page.evaluate(() => { const v = document.querySelector('video'); return v && v.currentTime > 1 && !v.paused; }), 45000);
  await page.evaluate(() => {
    if (window.JellyfinEnhanced.currentSettings.longPress2xEnabled !== true) throw new Error('Long press for 2x is off for this user');
    window.__touch = [];
    for (const type of ['touchstart', 'touchmove']) {
      window.addEventListener(type, e => setTimeout(() => window.__touch.push(`${type}:${e.defaultPrevented ? 'cancelled' : 'not cancelled'}`), 0), { capture: true, passive: true });
    }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const size = await page.evaluate(() => ({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) }));
  const touch = (type, x = size.x, y = size.y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const state = () => page.evaluate(() => {
    const v = document.querySelector('video');
    const osd = [...document.querySelectorAll('#videoOsdPage:not(.hide) .videoOsdBottom')][0];
    const overlay = document.querySelector('[data-speed-overlay]');
    return { osdShown: osd ? !osd.classList.contains('videoOsdBottom-hidden') : null, rate: v ? v.playbackRate : null, paused: v ? v.paused : null,
      speedOverlay: overlay && overlay.style.display !== 'none' ? overlay.textContent.trim() : null, touch: window.__touch.splice(0) };
  });
  const osdHidden = () => until(() => page.evaluate(() => {
    const osd = [...document.querySelectorAll('#videoOsdPage:not(.hide) .videoOsdBottom')][0];
    return !!osd && osd.classList.contains('videoOsdBottom-hidden');
  }), 20000);

  await attempt('tap', async () => {
    await osdHidden(); await state();
    await touch('touchStart'); await sleep(120);
    const down = await state();
    await touch('touchEnd'); await sleep(500);
    return { whileDown: down, afterRelease: await state() };
  });
  await attempt('hold', async () => {
    await osdHidden(); await state();
    await touch('touchStart'); await sleep(900);
    const down = await state();
    await touch('touchEnd'); await sleep(500);
    return { whileHeld: down, afterRelease: await state() };
  });
  await attempt('holdThenDrag', async () => {
    await osdHidden(); await state();
    await touch('touchStart'); await sleep(900);
    await touch('touchMove', size.x, size.y + 40); await sleep(60);
    await touch('touchMove', size.x, size.y + 120); await sleep(200);
    const down = await state();
    await touch('touchEnd'); await sleep(500);
    return { whileDragged: down, afterRelease: await state() };
  });
  await attempt('holdOnPausedPlayback', async () => {
    await page.evaluate(() => document.querySelector('video').pause());
    await sleep(1500); await state();
    const before = await state();
    await touch('touchStart'); await sleep(900);
    const down = await state();
    await touch('touchEnd'); await sleep(500);
    const after = await state();
    return { pausedBefore: before.paused, whileHeld: { rate: down.rate, paused: down.paused, speedOverlay: down.speedOverlay, touch: down.touch },
      afterRelease: { rate: after.rate, paused: after.paused } };
  });
  await page.evaluate(() => { const v = document.querySelector('video'); if (v) v.pause(); });
  return out;
};
