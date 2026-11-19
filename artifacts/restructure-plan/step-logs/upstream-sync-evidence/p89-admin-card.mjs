// Upstream 3ada0a4e: the Reclaimerr card's "Create Reclaimerr accounts for Jellyfin users" group. Opens the *arr tab,
// switches "Use Reclaimerr" on in the form (nothing is saved), and prints the group: its title, the permission and page
// boxes with their starting ticks, the button. Then the same card's linked copy on the Services tab: its ticks, and what
// a click on its button sends after ticking Auto-approve and unticking Settings there (window.confirm answers yes; the
// request goes to this lab's server, where Reclaimerr is off, so it answers 404), and the line the card shows after.
export default async ({ page, go, until, sleep }) => {
  await go('#/configurationpage?name=Jellyfin%20Enhanced&tab=arr&card=reclaimerr');
  await until(() => page.evaluate(() => !!document.getElementById('ReclaimerrEnabled')), 20000);
  await page.evaluate(() => {
    const box = document.getElementById('ReclaimerrEnabled');
    if (!box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await sleep(500);
  const card = (suffix) => page.evaluate((s) => {
    const btn = document.getElementById('reclaimerrCreateUsersBtn' + s);
    if (!btn) return { group: null };
    const details = btn.closest('details');
    const boxes = (id) => [...document.querySelectorAll('#' + id + s + ' label')].map(l => (l.querySelector('input').checked ? '[x] ' : '[ ] ') + l.textContent.trim());
    return { group: details && details.querySelector('summary').textContent, visible: btn.offsetParent !== null, permissions: boxes('reclaimerrNewPerms'), pages: boxes('reclaimerrNewPages'), button: btn.textContent };
  }, suffix);
  const arrTab = await card('');
  await page.evaluate(() => {
    window.__jeSent = [];
    const ajax = window.ApiClient.ajax.bind(window.ApiClient);
    window.ApiClient.ajax = (o) => { if (String(o.url).includes('reclaimerr/create-users')) window.__jeSent.push(o.data); return ajax(o); };
    window.confirm = () => true;
    document.querySelector('.jellyfin-tab-button[data-tab="services"]').click();
  });
  await sleep(800);
  const servicesBefore = await card('--mirror');
  await page.evaluate(() => {
    const flip = (box) => { box.checked = !box.checked; box.dispatchEvent(new Event('change', { bubbles: true })); };
    const pick = (id, value) => [...document.querySelectorAll('#' + id + '--mirror input')].find(i => i.value === value);
    const auto = pick('reclaimerrNewPerms', 'auto_approve'); if (auto) flip(auto);
    const settings = pick('reclaimerrNewPages', 'settings'); if (settings) flip(settings);
    document.getElementById('reclaimerrCreateUsersBtn--mirror')?.click();
  });
  const line = await until(() => page.evaluate(() => (document.getElementById('reclaimerrCreateUsersLine--mirror')?.textContent || '').trim() || null), 10000).catch(() => null);
  const sent = await page.evaluate(() => window.__jeSent);
  return { arrTab, servicesTab: servicesBefore, sentFromServicesCopy: sent, servicesLine: line };
};
