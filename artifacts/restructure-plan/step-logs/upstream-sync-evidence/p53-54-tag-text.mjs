// Parity check for upstream 25a168ae and 186121ed (#1063): give two tags other words from the Colours and
// text tab's tag list, as an administrator does (the most common genre and the most common quality label on
// the movies library page), and read what follows: the tab's name, the Text field, the confirmation, the
// tile's tooltip, the saved and public TagTextOverrides, and the chips on the movies page before and after.
// The configuration is put back at the end.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const attempt = async (name, work) => { try { out[name] = await work(); } catch (e) { out[name] = 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 200); } };
  const api = (method, path, body) => page.evaluate(async ([method, path, body]) => {
    const r = await fetch(ApiClient.getUrl(path), { method, headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    try { return { status: r.status, body: text ? JSON.parse(text) : null }; } catch { return { status: r.status, body: text }; }
  }, [method, path, body]);
  const pluginId = async () => (await api('GET', 'Plugins')).body.find(p => /Jellyfin Enhanced/i.test(p.Name)).Id;
  const stored = async () => (await api('GET', `Plugins/${await pluginId()}/Configuration`)).body.TagTextOverrides ?? null;
  const publicDoc = async () => { const c = (await api('GET', 'JellyfinEnhanced/public-config')).body || {}; return 'TagTextOverrides' in c ? c.TagTextOverrides : '(absent)'; };
  const movies = async () => {
    const views = (await api('GET', `Users/${await page.evaluate(() => ApiClient.getCurrentUserId())}/Views`)).body.Items;
    await go(`#/movies?topParentId=${views.find(v => v.CollectionType === 'movies').Id}&collectionType=movies`);
    await until(() => page.locator('.card[data-id] .je-tag-host').count(), 30000);
    await sleep(3500);
    return page.evaluate(() => {
      const top = (selector, key, text) => {
        const counts = {};
        for (const chip of document.querySelectorAll('.page:not(.hide) .je-tag-slot:not([data-je-slot="hover"]) ' + selector)) {
          const label = chip.dataset[key];
          const entry = counts[label] || (counts[label] = { chips: 0, texts: {} });
          entry.chips++;
          const shown = text(chip);
          entry.texts[shown] = (entry.texts[shown] || 0) + 1;
        }
        return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1].chips - a[1].chips || a[0].localeCompare(b[0])).slice(0, 3));
      };
      return { genre: top('.genre-tag[data-je-genre]', 'jeGenre', chip => chip.querySelector('.genre-text')?.textContent ?? ''), quality: top('.quality-overlay-label[data-quality]', 'quality', chip => chip.textContent) };
    });
  };
  // The section tabs are hidden on a desktop (the sidebar navigates there), so they are clicked in the page.
  const domClick = selector => page.evaluate(sel => { const el = document.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.click(); }, selector);
  const openColours = async () => {
    await go('#/configurationpage?name=Jellyfin%20Enhanced');
    await until(() => page.locator('.jellyfin-tab-button[data-tab="media-tags"]').count(), 30000);
    await page.locator('.jellyfin-tab-button[data-tab="media-tags"]').first().click();
    await until(() => page.locator('.je-tag-admin #jeTaTab-colours').count(), 20000);
    await domClick('.je-tag-admin #jeTaTab-colours');
    await until(() => page.locator('#tagStyleTabs .je-ts-tab[data-group="genre"]').count(), 20000);
  };
  const rename = async (group, label, text) => {
    await domClick(`#tagStyleTabs .je-ts-tab[data-group="${group}"]`);
    if (await page.locator('#tagStyleTargetToggle').getAttribute('aria-expanded') !== 'true') await domClick('#tagStyleTargetToggle');
    await sleep(400);
    const hint = await page.locator('#tagStyleTargetHint').textContent();
    const wholeGroup = ((await page.locator('#tagStyleHideRow').textContent()) || '').replace(/\s+/g, ' ').trim();
    await domClick(`#tagStyleTargets .je-ts-target[data-label="${label}"]`);
    await sleep(300);
    const field = page.locator('#tagStyleText');
    if (!(await field.count())) return { hint, wholeGroup, textField: 'none for a picked tag' };
    const placeholder = await field.getAttribute('placeholder');
    const fieldHint = await page.locator('#tagStyleTextHint').textContent();
    await field.scrollIntoViewIfNeeded();
    await field.fill(text);
    await field.press('Enter');
    await field.evaluate(el => el.blur());
    await sleep(2500);
    return { hint, wholeGroup, placeholder, fieldHint, maxLength: await field.getAttribute('maxlength'),
      confirmation: (await page.locator('.je-ta-snack').first().textContent().catch(() => '')).replace(/\s+/g, ' ').trim(),
      tileTooltip: await page.locator(`#tagStyleTargets .je-ts-target[data-label="${label}"]`).getAttribute('title'),
      tileHasPencil: await page.locator(`#tagStyleTargets .je-ts-target[data-label="${label}"] .je-ts-renamed-mark`).count() };
  };

  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  out.before = { stored: await stored(), public: await publicDoc() };
  await attempt('moviesBefore', movies);
  const genre = out.moviesBefore?.genre ? Object.keys(out.moviesBefore.genre)[0] : null;
  const quality = out.moviesBefore?.quality ? Object.keys(out.moviesBefore.quality)[0] : null;
  out.renaming = { genre, quality };
  try {
    await attempt('tab', async () => {
      await openColours();
      return { name: ((await page.locator('.je-tag-admin #jeTaTab-colours').textContent()) || '').replace(/\s+/g, ' ').trim(),
        section: ((await page.locator('.je-tag-admin [data-section="colours"] .je-ta-card-title').first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim() };
    });
    if (genre) await attempt('genreText', () => rename('genre', genre, 'Cartoons'));
    if (quality) await attempt('qualityText', () => rename('quality', quality, 'Sharp'));
    await attempt('ratingGroupHasNoTextField', async () => {
      await domClick('#tagStyleTabs .je-ts-tab[data-group="rating"]');
      await sleep(300);
      await domClick('#tagStyleTargets .je-ts-target[data-label="community"]');
      await sleep(300);
      return (await page.locator('#tagStyleText').count()) === 0;
    });
    await sleep(2000);
    out.afterRename = { stored: await stored(), public: await publicDoc() };
    await attempt('groupsRowLink', async () => {
      await domClick('.je-tag-admin #jeTaTab-groups');
      await sleep(800);
      return ((await page.locator('.je-tag-admin .je-ta-grow[data-group="genre"] [data-je-colours-group] .je-ta-link-text').first().textContent().catch(() => '(no link)')) || '').trim();
    });
    await page.reload(); await sleep(3000);
    await attempt('moviesAfter', movies);
  } finally {
    const id = await pluginId();
    const cfg = (await api('GET', `Plugins/${id}/Configuration`)).body;
    cfg.TagTextOverrides = null;
    out.restored = { status: (await api('POST', `Plugins/${id}/Configuration`, cfg)).status, stored: await stored() };
  }
  return out;
};
