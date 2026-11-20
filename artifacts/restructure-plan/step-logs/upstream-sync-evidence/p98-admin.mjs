// Upstream 1952fa31 on the configuration page: sidebar links of hidden groups, the settings search threshold and
// debounce, card spacing in search mode, the analytics icons. Run with
// `je12 browse '#/configurationpage?name=Jellyfin%20Enhanced&tab=admin' --script p98-admin.mjs`.
export default async ({ page, until, sleep }) => {
  await until(() => page.evaluate(() => !!document.querySelector('.jea-nav .jea-nav-sub') && !!document.getElementById('maintenanceModeEnabled')), 20000);
  await sleep(2500);
  const links = (tab, card) => page.evaluate(([tab, card]) => {
    const button = document.querySelector(`.jea-nav .jellyfin-tab-button[data-tab="${tab}"]`);
    const leaf = [...button.nextElementSibling.querySelectorAll(':scope > .jea-nav-leaf')].find(a => a.textContent.trim() === card);
    return [...leaf.nextElementSibling.querySelectorAll('.jea-nav-sub')].map(a => `${a.textContent.trim()}=${a.hidden ? 'hidden' : 'shown'}/${getComputedStyle(a).display}`).join(', ');
  }, [tab, card]);
  const checked = id => page.evaluate(id => document.getElementById(id).checked, id);
  const flip = async id => { await page.evaluate(id => { const c = document.getElementById(id); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); }, id); await sleep(300); };
  const out = [];
  out.push(`icons: ${await page.evaluate(() => document.querySelectorAll('.jea-analytics').length)}`);
  for (const [tab, card, id] of [['admin', 'Maintenance Mode', 'maintenanceModeEnabled'], ['display', 'Spoiler Guard', 'spoilerBlurEnabled']]) {
    const was = await checked(id);
    out.push(`${card} (${id} ${was ? 'on' : 'off'}): ${await links(tab, card)}`);
    await flip(id);
    out.push(`${card} (${id} ${was ? 'off' : 'on'}, not saved): ${await links(tab, card)}`);
    await flip(id);
  }
  const search = async q => {
    await page.fill('#settingsSearchInput', q);
    await sleep(800);
    return page.evaluate(q => {
      const form = document.getElementById('JellyfinEnhancedForm');
      const shown = [...form.querySelectorAll('.jellyfin-tab-content > fieldset')].filter(f => f.offsetParent && !f.classList.contains('je-search-hidden'));
      const gaps = [...new Set(shown.slice(0, 6).map(f => getComputedStyle(f).marginBottom))].join('/');
      return `search "${q}": mode=${form.classList.contains('je-search-mode')}, marks=${form.querySelectorAll('.je-search-match').length}, count="${document.getElementById('settingsSearchCount').textContent}"` + (shown.length ? `, card margin-bottom=${gaps}` : '');
    }, q);
  };
  out.push(await search('re'));
  out.push(await search('ret'));
  // Debounce: the search has not run 200 ms after the keystroke, and has by 600 ms.
  await page.fill('#settingsSearchInput', '');
  await sleep(500);
  await page.fill('#settingsSearchInput', 'tmdb');
  await sleep(200);
  const at200 = await page.evaluate(() => document.getElementById('JellyfinEnhancedForm').classList.contains('je-search-mode'));
  await sleep(400);
  const at600 = await page.evaluate(() => document.getElementById('JellyfinEnhancedForm').classList.contains('je-search-mode'));
  out.push(`"tmdb": search mode 200 ms after typing=${at200}, 600 ms after=${at600}`);
  return out.join('\n');
};
