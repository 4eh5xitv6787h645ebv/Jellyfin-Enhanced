// Port 24 (upstream 57567775): MyAnimeList, AniList, Metacritic user, Roger Ebert and MDBList as Rating Tags sources.
// The lab has no MDBList key and no route out, so no title has real scores: the chips are drawn by the page's own
// chip code (JE.ratingSources, what the poster renderer calls) from one made-up set of scores. Reports:
//   webChips   which source ids the client offers and accepts, and for each chip its label, logo file (and whether
//              the plugin serves it) and colour;
//   server     what the administrator's default list reads back as after it is saved with three of the new ids;
//   adminPage  the source rows of Media Tags › Groups › Rating, and the Rating labels of the Tag Styles editor;
//   userHub    the source checkboxes of the user's Media Tags hub and the preview's chips after the new ones are ticked.
// The administrator's list and the user's settings are put back at the end.
export default async ({ page, go, until, sleep }) => {
  const ADDED = ['myAnimeList', 'aniList', 'metacriticUser', 'rogerEbert', 'mdblist'];
  const attempt = async (work) => { try { return await work(); } catch (e) { return 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 160); } };
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.ratingSources && window.JellyfinEnhanced.currentSettings)), 30000);
  const out = {};

  out.webChips = await attempt(() => page.evaluate(async () => {
    const R = window.JellyfinEnhanced.ratingSources;
    const scores = { imdb: 8.1, myAnimeList: 8.4, aniList: 82, metacriticUser: 7.9, rogerEbert: 3.5, mdblist: 78 };
    const accepted = R.normalizeSources(Object.keys(scores));
    const chips = [];
    for (const fact of R.resolve(null, null, scores, { sources: accepted, minimum: 0, color: false })) {
      const chip = R.chip(fact), img = chip.querySelector('img');
      let served = null;
      if (img) { try { const r = await fetch(img.src); served = r.status + ' ' + (r.headers.get('content-type') || ''); } catch (e) { served = 'request failed'; } }
      chips.push({ id: fact.id, label: chip.getAttribute('aria-label'), logo: img ? img.getAttribute('src').replace(/^.*\/cdn\//, '').replace(/\?.*$/, '') : chip.querySelector('svg') ? 'inline svg' : 'none',
        served, colour: chip.style.getPropertyValue('--je-rating-source-color') });
    }
    return { offered: Array.from(R.IDS), accepted, chips };
  }));

  // The server: the administrator's default sources, saved with three of the new ids, as every client then reads them.
  const pluginConfig = () => page.evaluate(async () => {
    const plugins = await ApiClient.getJSON(ApiClient.getUrl('Plugins'));
    return ApiClient.getPluginConfiguration(plugins.find(p => p.Name === 'Jellyfin Enhanced').Id);
  });
  const patch = (changes) => page.evaluate(async (c) => {
    const r = await fetch(ApiClient.getUrl('/JellyfinEnhanced/admin/configuration'), { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' }, body: JSON.stringify({ Changes: c }) });
    return r.status;
  }, changes);
  const original = (await pluginConfig()).RatingTagsSources ?? null;
  out.server = await attempt(async () => {
    const saved = await patch({ RatingTagsSources: ['mdblist', 'rogerEbert', 'imdb'] });
    const stored = (await pluginConfig()).RatingTagsSources;
    const served = await page.evaluate(async () => (await ApiClient.getJSON(ApiClient.getUrl('JellyfinEnhanced/public-config'))).RatingTagsSources);
    return { save: saved, stored, publicConfig: served === undefined ? 'absent' : served };
  });

  out.adminPage = await attempt(async () => {
    await go('#/configurationpage?name=Jellyfin%20Enhanced&jeSection=media-tags&tab=groups');
    await until(() => page.evaluate(() => document.querySelectorAll('#ratingTagsSourceRows [data-source]').length > 0), 30000);
    await sleep(1500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#ratingTagsSourceRows [data-source]')]
      .map(r => (r.querySelector('input').checked ? '[x] ' : '[ ] ') + r.dataset.source + ' = ' + r.querySelector('.je-ta-order-name').textContent.trim()));
    await go('#/configurationpage?name=Jellyfin%20Enhanced&jeSection=media-tags&tab=colours');
    await until(() => page.evaluate(() => !!document.querySelector('#tagStyleTabs [data-group="rating"]')), 30000);
    await page.evaluate(() => document.querySelector('#tagStyleTabs [data-group="rating"]').click());
    await until(() => page.evaluate(() => document.querySelectorAll('#tagStyleTargets .rating-tag--source').length > 0), 15000);
    const labels = await page.evaluate(() => [...document.querySelectorAll('#tagStyleTargets .rating-tag--source')]
      .map(c => c.dataset.jeRatingSource + ' ' + (c.querySelector('.rating-text') ? c.querySelector('.rating-text').textContent : '') + (c.querySelector('img, svg') ? ' (logo)' : ' (name only)')));
    return { sourceRows: rows, tagStyleLabels: labels };
  });
  await patch({ RatingTagsSources: original });
  out.serverRestored = JSON.stringify((await pluginConfig()).RatingTagsSources ?? null) === JSON.stringify(original);

  out.userHub = await attempt(async () => {
    await go('#/home');
    await until(() => page.evaluate(() => typeof window.JellyfinEnhanced?.showEnhancedPanel === 'function'), 30000);
    const settings = await page.evaluate(() => JSON.stringify(window.JellyfinEnhanced.currentSettings));
    try {
      await page.evaluate(async () => {
        const JE = window.JellyfinEnhanced;
        Object.assign(JE.currentSettings, { ratingTagsEnabled: true, ratingTagsSources: ['imdb'], tagLayoutSettingsVersion: 1 });
        await JE.saveUserSettings('settings.json', JE.currentSettings);
      });
      await until(() => page.evaluate(async () => { try { await window.JellyfinEnhanced.showEnhancedPanel(); return true; } catch { return false; } }), 15000, 1000);
      const tab = page.locator('[data-tab*="tag" i], button:has-text("Media Tags")').filter({ visible: true }).first();
      if (await tab.count()) await tab.click().catch(() => {});
      await until(() => page.locator('#jeMediaTagsHub').isVisible(), 15000);
      await until(() => page.evaluate(() => document.querySelectorAll('.je-tge-row[data-group="rating"] [data-rating-source]').length > 0), 15000);
      const offered = await page.evaluate(() => [...document.querySelectorAll('.je-tge-row[data-group="rating"] [data-rating-source]')].map(b => b.dataset.ratingSource));
      const ticked = await page.evaluate(async (ids) => {
        const done = [];
        for (const id of ids) {
          const box = document.querySelector('.je-tge-row[data-group="rating"] [data-rating-source="' + id + '"]');
          if (!box) continue;
          box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); done.push(id);
          await new Promise(r => setTimeout(r, 400));
        }
        return done;
      }, ADDED);
      await sleep(1500);
      const preview = await page.evaluate(() => [...document.querySelectorAll('.je-mtp-sample[data-sample="movie"] .je-tag-host .rating-tag')]
        .map(c => (c.dataset.jeRatingSource || c.className) + ' ' + (c.querySelector('.rating-text') ? c.querySelector('.rating-text').textContent : c.textContent.trim())));
      const saved = await page.evaluate(() => window.JellyfinEnhanced.currentSettings.ratingTagsSources);
      return { offered, ticked, savedSources: saved, moviePreview: preview };
    } finally {
      await page.evaluate(async (before) => {
        const JE = window.JellyfinEnhanced, saved = JSON.parse(before);
        for (const key of Object.keys(JE.currentSettings)) if (!(key in saved)) delete JE.currentSettings[key];
        Object.assign(JE.currentSettings, saved);
        await JE.saveUserSettings('settings.json', JE.currentSettings);
      }, settings);
    }
  });
  return out;
};
