// Port 67 (upstream bfe4ba23): the details page's version picker after a refresh of the item.
// The lab movie Abominable (06de48d7…) has a second version (101 Dalmatians II's file, merged with
// POST /Videos/MergeVersions). The remembered pick is the version Jellyfin does NOT list first.
// "refill" does to the picker what Jellyfin 10.11's renderTrackSelections does on every refresh of the
// item (options again, the first source selected, no change event); Jellyfin 12.4's own refreshes keep
// the current value, so on this lab only that refill can show the difference.
export default async ({ page, go, until, sleep }) => {
  const ID = '06de48d758074756c732c7de70aa79f8';
  await go('#/home');
  await sleep(1500);
  const sources = await page.evaluate(async (id) => (await ApiClient.getItem(ApiClient.getCurrentUserId(), id)).MediaSources.map(m => ({ id: m.Id, name: m.Name })), ID);
  const pick = sources[1];
  await page.evaluate(([id, pick]) => {
    localStorage.setItem(`je-quality-source:${ApiClient.serverId()}:${ApiClient.getCurrentUserId()}`, JSON.stringify({ [id]: pick }));
  }, [ID, pick.id]);
  const name = (v) => (sources.find(s => s.id === v) || { name: v || '(none)' }).name.replace(/ \{tmdb-\d+\}.*$/, '');
  const read = async () => {
    const r = await page.evaluate(() => {
      const view = document.querySelector('#itemDetailPage:not(.hide)');
      const s = view?.querySelector('.selectSource');
      return { value: s?.value, badges: [...(view?.querySelectorAll('.detailImageContainer .quality-overlay-label') || [])].map(e => e.textContent).join(' ') };
    });
    return `picker: ${name(r.value)}; poster badges: ${r.badges || '(none)'}`;
  };
  const out = { versions: sources.map(s => name(s.id)), remembered: name(pick.id) };
  await go(`#/details?id=${ID}`);
  await until(() => page.evaluate((p) => document.querySelector('#itemDetailPage:not(.hide) .selectSource')?.value === p, pick.id), 4000).catch(() => {});
  await sleep(1000);
  out.opened = await read();
  await page.evaluate(() => { location.hash = '#/home'; });
  await sleep(1500);
  await page.evaluate(() => history.back());
  await sleep(1500);
  out.backToPage = await read();
  await page.evaluate((sources) => {
    window.__jeChanges = 0;
    const s = document.querySelector('#itemDetailPage:not(.hide) .selectSource');
    s.addEventListener('change', () => window.__jeChanges++);
    s.innerHTML = sources.map((v, i) => `<option value="${v.id}"${i === 0 ? ' selected' : ''}>${v.name}</option>`).join('');
  }, sources);
  out.refilled = await read();
  await sleep(1500);
  out.refilledPlus1500ms = await read();
  out.changeEventsAfterRefill = await page.evaluate(() => window.__jeChanges);
  return out;
};
