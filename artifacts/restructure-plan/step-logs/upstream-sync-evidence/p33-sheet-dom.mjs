// How jellyfin-web 12.4 lays out the OSD settings sheet, and what closes it: upstream c55c758e's
// fallback clicks `.actionSheet` → closest('.dialogContainer') → querySelector('.dialogBackdrop').
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
  const hashBefore = await page.evaluate(() => location.href);
  await page.evaluate(() => document.querySelector('button.btnVideoOsdSettings').click());
  await until(() => page.evaluate(() => document.querySelectorAll('.actionSheet').length), 5000);
  await sleep(300);
  const layout = await page.evaluate(() => {
    const sheet = document.querySelector('.actionSheet');
    const container = sheet?.closest('.dialogContainer');
    return {
      hrefWithSheet: location.href,
      sheetParent: sheet?.parentElement?.className,
      containerHasBackdropInside: !!container?.querySelector('.dialogBackdrop'),
      backdropIsPreviousSibling: !!container?.previousElementSibling?.classList.contains('dialogBackdrop'),
      upstreamCloseTarget: !!document.querySelector('.actionSheet')?.closest('.dialogContainer')?.querySelector('.dialogBackdrop'),
      menuIds: [...(sheet?.querySelectorAll('button[data-id]') || [])].map(b => b.getAttribute('data-id')),
    };
  });
  const count = () => page.evaluate(() => ({ sheets: document.querySelectorAll('.actionSheet').length, href: location.href, playing: !!document.querySelector('video') }));
  const open = async () => {
    if (!(await page.evaluate(() => document.querySelectorAll('.actionSheet').length))) {
      await page.evaluate(() => document.querySelector('button.btnVideoOsdSettings').click());
      await until(() => page.evaluate(() => document.querySelectorAll('.actionSheet').length), 5000);
      await sleep(300);
    }
  };
  const detail = () => page.evaluate(() => ({ sheets: [...document.querySelectorAll('.actionSheet')].map(e => e.className), containers: document.querySelectorAll('.dialogContainer').length, backdrops: [...document.querySelectorAll('.dialogBackdrop')].map(e => e.className) }));
  const attempts = {};
  const seq = async (name, types) => {
    await open();
    await page.evaluate(ts => { const c = document.querySelector('.actionSheet')?.closest('.dialogContainer'); for (const t of ts) { const Ctor = t.startsWith('pointer') ? PointerEvent : MouseEvent; c?.dispatchEvent(new Ctor(t, { bubbles: true, cancelable: true, clientX: 8, clientY: 8, view: window })); } }, types);
    await sleep(1200); attempts[name] = (await detail()).sheets.length;
  };
  await seq('click', ['click']);
  await seq('mousedown+click', ['mousedown', 'click']);
  await seq('pointerdown+click', ['pointerdown', 'click']);
  await seq('mousedown+mouseup+click', ['mousedown', 'mouseup', 'click']);
  await seq('pointerdown+pointerup+click', ['pointerdown', 'pointerup', 'click']);
  await seq('full', ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  const afterContainerClick = { attempts };
  await page.evaluate(() => document.querySelector('video')?.pause());
  return { hashBefore, layout, afterContainerClick };
};
