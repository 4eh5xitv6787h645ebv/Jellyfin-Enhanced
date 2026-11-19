// je12 browse '#/home' --script <this file>
// The bundle requests each step makes, from a cold Home: an item's details page, its first video playing, back to
// Home, and the settings panel. Per step: the bundle.js?g= requests it made and the groups loaded afterwards.
import { coldReload, firstMovie, loaded, quiet, watchBundles } from './p94-lazy-lib.mjs';

export default async ({ page, go, until, sleep }) => {
  const watch = watchBundles(page);
  const steps = [];
  const step = async (name, act) => {
    const before = watch.bundles.length;
    const detail = await act();
    await quiet({ page, sleep });
    await watch.settled();
    steps.push({ step: name, asked: watch.since(before), ...(detail || {}), loaded: await loaded(page) });
  };
  await step('cold Home', async () => {
    await coldReload({ page, until, sleep });
    return { initialized: await page.evaluate(() => window.JellyfinEnhanced.initialized === true) };
  });
  const movie = await firstMovie(page);
  await step(`details page (${movie.name})`, async () => {
    await go(`#/details?id=${movie.id}`);
    await until(() => page.evaluate(() => !!document.querySelector('#itemDetailPage:not(.hide) .btnPlay, #itemDetailPage:not(.hide) .detailButton')), 30000);
  });
  await step('first video', async () => {
    const play = page.locator('#itemDetailPage:not(.hide) .btnPlay, #itemDetailPage:not(.hide) button[data-action="resume"], #itemDetailPage:not(.hide) button[data-action="play"]').filter({ visible: true }).first();
    await until(() => play.count(), 30000);
    await play.click();
    const playing = await until(() => page.evaluate(() => { const v = document.querySelector('video'); return v && v.currentTime > 1; }), 45000).catch(() => false);
    const osdRating = await until(() => page.evaluate(() => document.querySelectorAll('#je-osd-rating-container').length > 0), 10000).catch(() => false);
    await page.evaluate(() => document.querySelector('video')?.pause());
    return { played: !!playing, osdRating: !!osdRating };
  });
  await step('back to Home', async () => {
    await go('#/home');
    await sleep(1000);
  });
  await step('settings panel', async () => {
    await page.evaluate(() => { window.JellyfinEnhanced.showEnhancedPanel(); });
    const open = await until(() => page.evaluate(() => !!document.querySelector('#jellyfin-enhanced-panel')), 30000).catch(() => false);
    return { panelOpen: !!open };
  });
  return { steps };
};
