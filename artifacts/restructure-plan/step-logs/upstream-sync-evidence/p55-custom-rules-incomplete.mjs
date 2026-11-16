// Check for upstream 90c721ef (#1066): in Media Tags > Groups > Custom, a half-filled rule must stay in the
// table while the editor auto-saves. Starts from one stored rule, adds a second and types only its name
// (no label yet), then renames the first rule's label, which auto-saves; reads the table after each step.
// The stored rules are put back at the end.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const api = (method, path, body) => page.evaluate(async ([method, path, body]) => {
    const r = await fetch(ApiClient.getUrl(path), { method, headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    try { return { status: r.status, body: text ? JSON.parse(text) : null }; } catch { return { status: r.status, body: text }; }
  }, [method, path, body]);
  const pluginId = async () => (await api('GET', 'Plugins')).body.find(p => /Jellyfin Enhanced/i.test(p.Name)).Id;
  const setRules = async rules => { const id = await pluginId(); const cfg = (await api('GET', `Plugins/${id}/Configuration`)).body; const before = cfg.CustomTagRules; cfg.CustomTagRules = rules; await api('POST', `Plugins/${id}/Configuration`, cfg); return before; };
  const stored = async () => ((await api('GET', `Plugins/${await pluginId()}/Configuration`)).body.CustomTagRules || []).map(r => `${r.Match}:${r.Value}=${r.Label}`);
  const table = () => page.evaluate(() => [...document.querySelectorAll('#customTagRuleRows .je-ct-row')].map(row => ({ name: row.querySelector('.je-ct-value input')?.value ?? null, label: row.querySelector('.je-ct-label input')?.value ?? null })));
  const domClick = selector => page.evaluate(sel => { const el = document.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.click(); }, selector);
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced)), 30000);
  const original = await setRules([{ Match: 'tag', Value: 'Kids', Label: 'Kids', Icon: null }]);
  try {
    await go('#/configurationpage?name=Jellyfin%20Enhanced');
    await until(() => page.locator('.jellyfin-tab-button[data-tab="media-tags"]').count(), 30000);
    await page.locator('.jellyfin-tab-button[data-tab="media-tags"]').first().click();
    await until(() => page.locator('.je-tag-admin #jeTaTab-groups').count(), 20000);
    await domClick('.je-tag-admin #jeTaTab-groups');
    await until(() => page.locator('.je-tag-admin .je-ta-grow[data-group="custom"] .je-ta-expand').count(), 20000);
    if (await page.locator('.je-tag-admin .je-ta-grow[data-group="custom"]').getAttribute('data-open') !== 'true') await domClick('.je-tag-admin .je-ta-grow[data-group="custom"] .je-ta-expand');
    await until(() => page.locator('#customTagRuleRows .je-ct-row').count(), 20000);
    out.loaded = await table();
    await domClick('#customTagRuleAdd');
    await sleep(300);
    const name = page.locator('#customTagRuleRows .je-ct-row[data-index="1"] .je-ct-value input');
    await name.scrollIntoViewIfNeeded();
    await name.click();
    await name.pressSequentially('Classic', { delay: 40 });
    await sleep(2500);
    out.afterTypingOnlyAName = { table: await table(), stored: await stored() };
    const label = page.locator('#customTagRuleRows .je-ct-row[data-index="0"] .je-ct-label input');
    await label.click();
    await label.press('End');
    await label.pressSequentially(' films', { delay: 40 });
    await label.press('Tab');
    await sleep(3500);
    out.afterRenamingTheFirstRule = { table: await table(), stored: await stored() };
    out.halfFilledRuleKept = out.afterRenamingTheFirstRule.table.some(row => row.name === 'Classic');
  } catch (e) {
    out.error = String(e.message || e).split('\n')[0].slice(0, 200);
  } finally {
    await setRules(original || []);
    out.restored = await stored();
  }
  return out;
};
