// Port 44 (upstream 481a10ee): the administrators' Maintainerr rows in the item menu.
//   je12 browse '#/home' --script <this file> [--user viewer]      (after p44-maintainerr.setup.py <dir> on)
// On the detail page of the movie Maintainerr does not list, then of the one it lists: open the ⋮ menu, record the
// menu's rows, press Mark for removal (unlisted) and Postpone removal then +14 days (listed), and record the toast and
// the chooser. Also records what the routes answer this user and the bootstrap flag. Nothing leaves the lab.
const LISTED = '0ff8461bed0a2658ec63487586efdbd3';
const UNLISTED = '06de48d758074756c732c7de70aa79f8';
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const menu = async (id) => {
    await go(`#/details?id=${id}`);
    await until(() => page.locator('#itemDetailPage:not(.hide) .btnMoreCommands').first().isVisible(), 15000);
    await sleep(800);
    await page.locator('#itemDetailPage:not(.hide) .btnMoreCommands').first().click();
    await until(() => page.locator('.actionSheetScroller [data-id]').first().isVisible(), 8000);
    // The Maintainerr rows arrive after their state request (or never, for a user without them).
    await until(() => page.locator('.actionSheetScroller [data-id^="je-maintainerr-"]').count(), 4000).catch(() => null);
    await sleep(300);
    return page.evaluate(() => [...document.querySelectorAll('.actionSheetScroller')].pop()?.querySelectorAll('[data-id]').length
      ? [...[...document.querySelectorAll('.actionSheetScroller')].pop().querySelectorAll('[data-id]')].map((b) => `${b.dataset.id}: ${b.textContent.trim()}`)
      : []);
  };
  // Toasts with an action stay at least 6 s: drop the earlier ones, so the next one read is this action's.
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('.jellyfin-enhanced-toast').forEach((t) => t.remove()));
  const toast = async () => {
    await until(() => page.locator('.jellyfin-enhanced-toast').last().isVisible(), 8000);
    return page.evaluate(() => { const t = [...document.querySelectorAll('.jellyfin-enhanced-toast')].pop(); return { text: t.firstChild?.textContent?.trim() ?? t.textContent, action: t.querySelector('.jellyfin-enhanced-toast-action')?.textContent ?? null }; });
  };
  await go('#/home');
  await sleep(1500);
  out.bootstrapFlag = await page.evaluate(() => window.JellyfinEnhanced?.pluginConfig?.MaintainerrActionsAvailable ?? null);
  out.routes = await page.evaluate(async ([listed, unlisted]) => {
    const get = async (path) => { try { return await window.ApiClient.ajax({ type: 'GET', url: window.ApiClient.getUrl(path), dataType: 'json' }); } catch (e) { return `HTTP ${e?.status}`; } };
    const status = await get('JellyfinEnhanced/admin/leaving-soon');
    return {
      status: typeof status === 'object' ? { Actions: status.Actions, HomeRow: status.HomeRow, Items: status.Items, Maintainerr: status.Maintainerr } : status,
      listed: await get(`JellyfinEnhanced/maintainerr/item/${listed}`),
      unlisted: await get(`JellyfinEnhanced/maintainerr/item/${unlisted}`),
    };
  }, [LISTED, UNLISTED]);
  for (const s of [out.routes.listed, out.routes.unlisted]) if (s && typeof s === 'object') delete s.DeleteAt;
  out.unlistedMenu = await menu(UNLISTED);
  if (out.unlistedMenu.some((r) => r.startsWith('je-maintainerr-mark'))) {
    await clearToasts();
    await page.locator('.actionSheetScroller [data-id="je-maintainerr-mark"]').last().click();
    out.markToast = await toast();
  }
  out.listedMenu = await menu(LISTED);
  if (out.listedMenu.some((r) => r.startsWith('je-maintainerr-postpone'))) {
    await page.locator('.actionSheetScroller [data-id="je-maintainerr-postpone"]').last().click();
    await until(() => page.locator('.je-mt-dialog').isVisible(), 5000);
    out.chooser = await page.evaluate(() => { const d = document.querySelector('.je-mt-dialog'); return { title: d.querySelector('.je-mt-title')?.textContent, hint: d.querySelector('.je-mt-hint')?.textContent?.replace(/\d+/, 'N') ?? null, days: [...d.querySelectorAll('.je-mt-day')].map((b) => b.textContent), custom: d.querySelector('.je-mt-label')?.textContent, reset: d.querySelector('.je-mt-reset')?.textContent, cancel: d.querySelector('.je-mt-cancel')?.textContent }; });
    await clearToasts();
    await page.locator('.je-mt-day').nth(1).click();
    out.postponeToast = await toast();
  }
  return out;
};
