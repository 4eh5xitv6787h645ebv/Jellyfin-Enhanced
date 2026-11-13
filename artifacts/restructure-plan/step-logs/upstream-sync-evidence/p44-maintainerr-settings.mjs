// Port 44 (upstream 481a10ee): where the Maintainerr settings are and what they show.
//   je12 browse '#/home' --script <this file>      (after p44-maintainerr.setup.py <dir> on)
// The configuration page: the *arr tab's Maintainerr card (its settings, without the key's value; its status line and
// home-row line), the Services tab's copy, the Overview's Service Status card; then the Media Tags tab's Leaving soon
// section (no Maintainerr field of its own; its state and home-row lines; the link). Nothing leaves the lab.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  await go('#/configurationpage?name=Jellyfin%20Enhanced');
  await until(() => page.locator('#je-service-dashboard').isVisible(), 20000).catch(() => null);
  await sleep(3000);
  out.overview = await page.evaluate(() => document.querySelector('#je-service-dashboard [data-status-id="maintainerr"]')?.textContent?.trim() ?? null);
  await page.locator('.jellyfin-tab-button[data-tab="arr"]').first().click();
  await sleep(1500);
  out.arr = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#arr fieldset')].find((f) => f.querySelector('legend')?.textContent.trim() === 'Maintainerr');
    if (!card) return null;
    const value = (id) => { const el = document.getElementById(id); return !el ? null : el.type === 'checkbox' ? el.checked : el.value; };
    return {
      locked: card.classList.contains('jea-locked'),
      labels: [...card.querySelectorAll('label')].map((l) => l.textContent.trim()).filter(Boolean),
      url: value('LeavingSoonMaintainerrUrl') ? 'set' : 'empty', keySet: !!value('LeavingSoonMaintainerrApiKey'),
      actions: value('LeavingSoonMaintainerrActions'), homeRow: value('LeavingSoonHomeRow'), hours: value('LeavingSoonRefreshHours'),
      status: document.getElementById('maintainerrStatusLine')?.textContent.replace(/Last read .*$/, 'Last read …'),
      row: document.getElementById('maintainerrRowLine')?.textContent,
    };
  });
  await page.locator('.jellyfin-tab-button[data-tab="services"]').first().click();
  await sleep(1500);
  out.services = await page.evaluate(() => [...document.querySelectorAll('#services fieldset')].map((f) => f.querySelector('legend')?.textContent.trim() + (f.classList.contains('jea-mirror') ? ' (linked copy)' : '')));
  // A new view (jellyfin-web keeps the configuration page's view for a change of its query alone).
  await go('#/home');
  await sleep(1500);
  await go('#/configurationpage?name=Jellyfin%20Enhanced&jeSection=media-tags&tab=badges');
  await until(() => page.locator('[data-section="badges-leaving"] [data-leaving-state]').count(), 30000).catch(() => null);
  await sleep(3000);
  out.mediaTags = await page.evaluate(() => {
    const card = document.querySelector('[data-section="badges-leaving"]');
    if (!card) return null;
    return {
      hint: card.querySelector('.je-ta-hint')?.textContent.trim(),
      fields: [...card.querySelectorAll('input, textarea, select')].map((e) => e.id).filter(Boolean),
      state: card.querySelector('[data-leaving-state]')?.textContent,
      row: card.querySelector('[data-leaving-row]')?.textContent ?? null,
      link: card.querySelector('a.je-ta-link')?.textContent.trim() ?? null,
    };
  });
  return out;
};
