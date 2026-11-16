// Ports 64 and 65 (upstream 06837783, 8f902bf7): Mark for removal from a movie's page with its version, and on a season.
//   je12 browse '#/home' --script <this file>      (after p64-65-maintainerr.setup.py <dir>)
// On the detail page of the movie (one version, the one shown in its version picker) and then of a season: open the
// page's own ⋮ menu, record the Maintainerr rows, press Mark for removal when it is there, and record the body the
// page sent to /JellyfinEnhanced/maintainerr/mark, the toast, and the [Maintainerr] lines the enhanced log gained
// (they name the collection chosen). Nothing leaves the lab.
const MOVIE = '06de48d758074756c732c7de70aa79f8';
const SEASON = '058a5285363ed578e80bd1cd0eef8426';
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const sent = [];
  page.on('request', (r) => { if (r.url().includes('/JellyfinEnhanced/maintainerr/mark')) sent.push(r.postData()); });
  const call = (method, path) => page.evaluate(async ([m, p]) => {
    try { return { body: await window.ApiClient.ajax({ type: m, url: window.ApiClient.getUrl(p), dataType: p.startsWith('System/Logs/Log') ? 'text' : 'json' }) }; } catch (e) { return { error: `HTTP ${e?.status}` }; }
  }, [method, path]);
  const logText = async () => {
    const files = (await call('GET', 'System/Logs')).body || [];
    const name = files.map((f) => f.Name).filter((n) => /^JellyfinEnhanced/i.test(n)).sort().pop();
    return name ? String((await call('GET', `System/Logs/Log?name=${encodeURIComponent(name)}`)).body ?? '') : '';
  };
  const menu = async (id) => {
    await go(`#/details?id=${id}`);
    await until(() => page.locator('#itemDetailPage:not(.hide) .btnMoreCommands').first().isVisible(), 15000);
    await sleep(1500);
    await page.locator('#itemDetailPage:not(.hide) .btnMoreCommands').first().click();
    await until(() => page.locator('.actionSheetScroller [data-id]').first().isVisible(), 8000);
    await until(() => page.locator('.actionSheetScroller [data-id^="je-maintainerr-"]').count(), 4000).catch(() => null);
    await sleep(300);
    return page.evaluate(() => [...([...document.querySelectorAll('.actionSheetScroller')].pop()?.querySelectorAll('[data-id^="je-maintainerr-"]') ?? [])]
      .map((b) => `${b.dataset.id}: ${b.textContent.trim()}`));
  };
  const toast = async () => {
    await until(() => page.locator('.jellyfin-enhanced-toast').last().isVisible(), 10000);
    return page.evaluate(() => [...document.querySelectorAll('.jellyfin-enhanced-toast')].pop()?.firstChild?.textContent?.trim() ?? null);
  };
  const mark = async (key, id) => {
    out[key] = { rows: await menu(id) };
    if (key === 'movie') out[key].versionPicker = await page.evaluate(() => { const s = document.querySelector('#itemDetailPage:not(.hide) select.selectSource'); return s ? { value: s.value, options: s.options.length } : null; });
    if (!out[key].rows.some((r) => r.startsWith('je-maintainerr-mark'))) { await page.keyboard.press('Escape'); return; }
    await page.evaluate(() => document.querySelectorAll('.jellyfin-enhanced-toast').forEach((t) => t.remove()));
    const before = (await logText()).length;
    const count = sent.length;
    await page.locator('.actionSheetScroller [data-id="je-maintainerr-mark"]').last().click();
    out[key].toast = await toast();
    await sleep(500);
    out[key].sent = sent.slice(count).map((b) => JSON.parse(b));
    out[key].log = (await logText()).slice(before).split('\n').filter((l) => l.includes('[Maintainerr]')).map((l) => l.replace(/^\[[^\]]*\] /, ''));
  };
  await go('#/home');
  await sleep(1500);
  await mark('movie', MOVIE);
  await mark('season', SEASON);
  return out;
};
