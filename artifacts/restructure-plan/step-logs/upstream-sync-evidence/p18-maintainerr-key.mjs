// Port 18 (upstream 189a0a26): the Maintainerr API key on the admin page's Media Tags tab (Status badges > Leaving
// soon), the wider boxes for long values, and the Maintainerr card on the Services tab. Reports what the page's
// save endpoint answers for the key, how the key's box is drawn and what it holds before and after a save, the
// width of the long-value boxes, and the Services tab's cards. No Maintainerr address is set, so nothing is called.
export default async ({ page, go, until, sleep }) => {
  const FIELD = 'LeavingSoonMaintainerrApiKey';
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && window.ApiClient.accessToken && window.ApiClient.accessToken())), 30000);
  const patch = (changes, expected) => page.evaluate(async ([c, e]) => {
    const r = await fetch(window.ApiClient.getUrl('/JellyfinEnhanced/admin/configuration'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Token="' + window.ApiClient.accessToken() + '"' },
      body: JSON.stringify(e ? { Changes: c, Expected: e } : { Changes: c }),
    });
    return r.status + ' ' + (await r.text());
  }, [changes, expected ?? null]);
  const stored = () => page.evaluate(async (field) => {
    const plugins = await window.ApiClient.getJSON(window.ApiClient.getUrl('Plugins'));
    const id = plugins.find(p => p.Name === 'Jellyfin Enhanced').Id;
    return (await window.ApiClient.getPluginConfiguration(id))[field] ?? null;
  }, FIELD);

  const out = { saveEndpoint: {}, keyBox: {}, wideBoxes: {}, servicesTab: {} };
  // 1. The save endpoint: what it answers for the key, and whether a stale Expected value is a conflict.
  out.saveEndpoint.setKey = await patch({ [FIELD]: 'lab-key-one' });
  out.saveEndpoint.staleExpected = await patch({ [FIELD]: 'lab-key-two' }, { [FIELD]: 'not-the-stored-key' });
  out.saveEndpoint.storedAfterStaleSave = await stored();
  await patch({ [FIELD]: 'lab-key-one' });

  // 2. The key's box on Status badges > Leaving soon. The page is opened once; after that every move is a link
  // followed in place, as the page's own links are, so there is one view of the page throughout.
  await go('#/configurationpage?name=Jellyfin%20Enhanced&jeSection=media-tags&tab=badges');
  const shown = (id) => page.evaluate((i) => !!document.getElementById(i)?.offsetParent, id);
  await until(() => shown('leavingSoonMaintainerrApiKey'), 30000);
  await sleep(2000);
  const follow = async (query, id) => {
    await page.evaluate((q) => {
      const a = document.createElement('a');
      a.href = '#/configurationpage?name=Jellyfin%20Enhanced&' + q;
      document.querySelector('[data-role="page"]:not(.hide)').appendChild(a);
      a.click();
      a.remove();
    }, query);
    await until(() => shown(id), 30000);
    await sleep(800);
  };
  await page.mouse.move(2, 2);
  const box = () => page.evaluate(() => {
    const el = document.getElementById('leavingSoonMaintainerrApiKey');
    return {
      type: el.type, class: el.className, autocomplete: el.getAttribute('autocomplete'), value: el.value,
      textSecurity: getComputedStyle(el).webkitTextSecurity,
      description: document.querySelector('[data-field-row="leavingSoonMaintainerrApiKey"] .je-ta-switch-desc')?.textContent.trim() ?? null,
    };
  });
  out.keyBox.atRest = await box();
  await page.locator('#leavingSoonMaintainerrApiKey').focus();
  out.keyBox.textSecurityWhenFocused = (await box()).textSecurity;
  // Type another key as an administrator would, leave the box, and wait for the page's own save.
  await page.locator('#leavingSoonMaintainerrApiKey').fill('lab-key-typed');
  await page.locator('#leavingSoonMaintainerrApiKey').dispatchEvent('change');
  await page.locator('#leavingSoonMaintainerrUrl').focus();
  await until(async () => (await stored()) === 'lab-key-typed', 20000).catch(() => null);
  await sleep(1500);
  out.keyBox.afterTypingAndSave = { value: (await box()).value, stored: await stored() };

  // 3. Boxes for long values, at a 1600 px window: the control's class, its width, and the width of its row.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await sleep(500);
  const widths = (ids) => page.evaluate((list) => Object.fromEntries(list.map((id) => {
    const el = document.getElementById(id), px = (e) => (e ? Math.round(e.getBoundingClientRect().width) : null);
    return [id, { control: el?.parentElement.className ?? null, boxPx: px(el), rowPx: px(el?.closest('.je-ta-field')) }];
  })), ids);
  Object.assign(out.wideBoxes, await widths(['leavingSoonMaintainerrUrl', 'leavingSoonMaintainerrApiKey', 'leavingSoonRefreshHours']));
  await follow('jeSection=media-tags&tab=groups&group=awards', 'awardsTagsImdbList');
  Object.assign(out.wideBoxes, await widths(['awardsTagsImdbList', 'awardsTagsLetterboxdList']));
  await follow('jeSection=media-tags&tab=groups&group=language', 'languageTagsPriority');
  Object.assign(out.wideBoxes, await widths(['languageTagsPriority']));

  // 4. The Services tab: its cards, and the Maintainerr card's text, logo and link.
  await follow('tab=services', 'services');
  out.servicesTab = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#services fieldset.jea-section')];
    const card = cards.find(c => /Maintainerr/.test(c.querySelector('legend')?.textContent || ''));
    return {
      cards: cards.map(c => c.querySelector('legend').textContent.trim()),
      maintainerr: card ? {
        logo: card.querySelector('legend img')?.getAttribute('data-je-cdn') ?? null,
        note: card.querySelector('.jea-note')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        link: card.querySelector('a')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        href: card.querySelector('a')?.getAttribute('href') ?? null,
        fields: card.querySelectorAll('input, select, textarea').length,
      } : 'no Maintainerr card',
    };
  });
  if (out.servicesTab.maintainerr !== 'no Maintainerr card') {
    await page.locator('#services fieldset.jea-section a.jea-btn', { hasText: 'Leaving soon' }).click();
    await until(() => shown('leavingSoonMaintainerrUrl'), 15000).catch(() => null);
    out.servicesTab.linkOpens = await page.evaluate(() => ({
      leavingSoonFieldsShown: !!document.getElementById('leavingSoonMaintainerrUrl')?.offsetParent,
      mediaTagsTab: document.querySelector('.je-ta-tab[aria-selected="true"]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      views: document.querySelectorAll('#services').length,
    }));
  }

  // Leave the lab as it was: no key.
  await patch({ [FIELD]: '' });
  out.keyClearedAfterwards = (await stored()) === '';
  return out;
};
