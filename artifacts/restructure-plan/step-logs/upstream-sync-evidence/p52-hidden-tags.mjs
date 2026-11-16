// Parity check for upstream e907396d (#1043): hide one tag from the Colours tab's tag list, as an
// administrator does, and read what follows: the tile's mark, the confirmation, the saved TagHiddenValues,
// the public configuration, the Groups row, and the chips on the movies library page before and after.
// The tag is the genre most movies on the page carry. The configuration is put back at the end.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const attempt = async (name, work) => { try { out[name] = await work(); } catch (e) { out[name] = 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 200); } };
  const api = (method, path, body) => page.evaluate(async ([method, path, body]) => {
    const r = await fetch(ApiClient.getUrl(path), { method, headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    try { return { status: r.status, body: text ? JSON.parse(text) : null }; } catch { return { status: r.status, body: text }; }
  }, [method, path, body]);
  const pluginId = async () => (await api('GET', 'Plugins')).body.find(p => /Jellyfin Enhanced/i.test(p.Name)).Id;
  const stored = async () => (await api('GET', `Plugins/${await pluginId()}/Configuration`)).body.TagHiddenValues ?? null;
  const clean = doc => (doc && typeof doc === 'object' ? Object.fromEntries(Object.entries(doc).filter(([, v]) => Array.isArray(v) && v.length)) : doc);
  const publicLists = async () => { const c = (await api('GET', 'JellyfinEnhanced/public-config')).body || {}; return { TagHiddenValues: clean(c.TagHiddenValues ?? null), TagHiddenAgeRatings: c.TagHiddenAgeRatings ?? '(absent)' }; };
  const movies = async () => {
    const views = (await api('GET', `Users/${await page.evaluate(() => ApiClient.getCurrentUserId())}/Views`)).body.Items;
    const id = views.find(v => v.CollectionType === 'movies').Id;
    await go(`#/movies?topParentId=${id}&collectionType=movies`);
    await until(() => page.locator('.card[data-id] .je-tag-host').count(), 30000);
    await sleep(3500);
    return page.evaluate(() => {
      const shown = [...document.querySelectorAll('.page:not(.hide) .je-tag-slot:not([data-je-slot="hover"]) .genre-tag[data-je-genre]')];
      const counts = {};
      for (const chip of shown) counts[chip.dataset.jeGenre] = (counts[chip.dataset.jeGenre] || 0) + 1;
      return { cards: document.querySelectorAll('.page:not(.hide) .card[data-id]').length, genreChips: shown.length, byLabel: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6)) };
    });
  };
  // The section tabs are hidden on a desktop (the sidebar navigates there), so they are clicked in the page.
  const domClick = selector => page.evaluate(sel => { const el = document.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.click(); }, selector);
  const openColours = async group => {
    await go('#/configurationpage?name=Jellyfin%20Enhanced');
    await until(() => page.locator('.jellyfin-tab-button[data-tab="media-tags"]').count(), 30000);
    await page.locator('.jellyfin-tab-button[data-tab="media-tags"]').first().click();
    await until(() => page.locator('.je-tag-admin #jeTaTab-colours').count(), 20000);
    await domClick('.je-tag-admin #jeTaTab-colours');
    await until(() => page.locator(`#tagStyleTabs .je-ts-tab[data-group="${group}"]`).count(), 20000);
    await domClick(`#tagStyleTabs .je-ts-tab[data-group="${group}"]`);
    if (await page.locator('#tagStyleTargetToggle').getAttribute('aria-expanded') !== 'true') await domClick('#tagStyleTargetToggle');
    await sleep(500);
  };

  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  out.before = { stored: clean(await stored()), public: await publicLists() };
  await attempt('moviesBefore', movies);
  const label = out.moviesBefore && out.moviesBefore.byLabel ? Object.keys(out.moviesBefore.byLabel)[0] : null;
  out.hiding = label ? `genre "${label}"` : 'no genre chip found on the movies page';
  try {
    if (label) {
      await attempt('colours', async () => {
        await openColours('genre');
        const hint = await page.locator('#tagStyleTargetHint').textContent();
        const wholeGroupHasSwitch = await page.locator('#tagStyleHide').count();
        await domClick(`#tagStyleTargets .je-ts-target[data-label="${label}"]`);
        await sleep(300);
        const sw = page.locator('#tagStyleHide');
        if (!(await sw.count())) return { hint, hideSwitch: 'none for a picked tag' };
        const switchName = await page.locator('#tagStyleHideName').textContent();
        const switchScope = await page.locator('#tagStyleHideDesc').textContent();
        await sw.scrollIntoViewIfNeeded();
        await sw.click();
        await sleep(2500);
        const tile = page.locator(`#tagStyleTargets .je-ts-target[data-label="${label}"]`);
        return {
          hint, wholeGroupHasSwitch, switchName, switchScope,
          confirmation: (await page.locator('.je-ta-snack').first().textContent().catch(() => '')).replace(/\s+/g, ' ').trim(),
          tileMarkedHidden: await tile.evaluate(el => el.classList.contains('je-ts-target-hidden')),
          tileLabel: await tile.getAttribute('aria-label'),
          tabLabel: await page.locator('#tagStyleTabs .je-ts-tab[data-group="genre"]').getAttribute('aria-label'),
          hiddenLine: ((await page.locator('#tagStyleHiddenLine').textContent()) || '').replace(/\s+/g, ' ').trim(),
          editingNow: ((await page.locator('#tagStyleEditingNow').textContent()) || '').replace(/\s+/g, ' ').trim(),
        };
      });
      await sleep(2500);
      out.afterHide = { stored: clean(await stored()), public: await publicLists() };
      await attempt('groupsRow', async () => {
        await domClick('.je-tag-admin #jeTaTab-groups');
        await sleep(800);
        const row = page.locator('.je-tag-admin .je-ta-grow[data-group="genre"]');
        return { summary: ((await row.locator('.je-ta-grow-sum').textContent()) || '').trim(), link: ((await row.locator('[data-je-colours-group] .je-ta-link-text').first().textContent().catch(() => '(no link)')) || '').trim() };
      });
      await page.reload(); await sleep(3000);
      await attempt('moviesAfter', movies);
      if (out.moviesAfter && out.moviesAfter.byLabel) out.moviesAfter = { cards: out.moviesAfter.cards, [`chipsOf_${label}`]: out.moviesAfter.byLabel[label] || 0, genreChips: out.moviesAfter.genreChips };
    }
  } finally {
    const id = await pluginId();
    const cfg = (await api('GET', `Plugins/${id}/Configuration`)).body;
    cfg.TagHiddenValues = null;
    out.restored = { status: (await api('POST', `Plugins/${id}/Configuration`, cfg)).status, stored: clean(await stored()) };
  }
  return out;
};
