// Port 19 (upstream 0e141dfa): the administrator's "Show status badges on collections" switch.
// On a lab with box sets (`je12 env content --collections`). Reports what the public configuration says about the
// switch, how the admin page's Status badges tab draws it, what turning it off through the page stores, and the
// Status badge the web client draws on a collection and on a movie (search results) with the switch on and off.
// The movie is a member of that collection and is given an added date of an hour ago, so the collection is "just
// added" by its own date and by its newest member's: the result does not depend on which of the two a build reads.
export default async ({ page, go, until, sleep }) => {
  const FIELD = 'StatusTagsOnCollections';
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && window.ApiClient.accessToken && window.ApiClient.accessToken())), 30000);
  const patch = (changes) => page.evaluate(async (c) => {
    const r = await fetch(window.ApiClient.getUrl('/JellyfinEnhanced/admin/configuration'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Token="' + window.ApiClient.accessToken() + '"' },
      body: JSON.stringify({ Changes: c }),
    });
    return r.status + ' ' + (await r.text()).slice(0, 160);
  }, changes);
  const stored = () => page.evaluate(async (field) => {
    const plugins = await window.ApiClient.getJSON(window.ApiClient.getUrl('Plugins'));
    const id = plugins.find(p => p.Name === 'Jellyfin Enhanced').Id;
    const config = await window.ApiClient.getPluginConfiguration(id);
    return field in config ? config[field] : 'absent';
  }, FIELD);
  const publicConfig = () => page.evaluate(async (field) => {
    const config = await window.ApiClient.getJSON(window.ApiClient.getUrl('JellyfinEnhanced/public-config'));
    return field in config ? config[field] : 'absent';
  }, FIELD);

  // Lab state: Status tags on for this user, and one member of the first box set added an hour ago.
  const prep = await page.evaluate(async () => {
    const JE = window.JellyfinEnhanced, uid = ApiClient.getCurrentUserId();
    if (!JE.currentSettings.statusTagsEnabled) {
      JE.currentSettings.statusTagsEnabled = true;
      await JE.saveUserSettings('settings.json', JE.currentSettings);
    }
    const sets = (await ApiClient.getItems(uid, { IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'SortName', Limit: 1 })).Items;
    if (!sets.length) return { error: 'no box set in this lab (je12 env content --collections)' };
    const members = (await ApiClient.getItems(uid, { ParentId: sets[0].Id, SortBy: 'SortName' })).Items;
    const movie = await ApiClient.getItem(uid, members[0].Id);
    movie.DateCreated = new Date(Date.now() - 3600000).toISOString();
    await ApiClient.updateItem(movie);
    return { collection: { id: sets[0].Id, name: sets[0].Name }, movie: { id: movie.Id, name: movie.Name } };
  });
  if (prep.error) return prep;
  const out = { collection: prep.collection.name, movie: prep.movie.name, publicConfig: {}, adminPage: {}, webBadges: {} };

  const badges = async () => {
    await sleep(12000);                                     // the tag cache applies item changes after its debounce
    await page.reload(); await sleep(4000);
    await go('#/search?query=' + encodeURIComponent(prep.movie.name));
    const read = () => page.evaluate(ids => ids.map(id => {
      const card = [...document.querySelectorAll('.card[data-id]')].find(c => c.dataset.id === id);
      if (!card) return null;
      const tag = card.querySelector('[class*="status-tag"], [class*="je-status"]');
      return { drawn: !!card.querySelector('.je-tag-host, [class*="je-tag"]'), status: tag ? tag.textContent.trim() : null };
    }), [prep.collection.id, prep.movie.id]);
    await until(async () => { const r = await read(); return r.every(x => x && x.drawn) ? r : null; }, 30000).catch(() => null);
    await sleep(2500);
    const [collection, movie] = await read();
    return { collection: collection ? collection.status : 'card not found', movie: movie ? movie.status : 'card not found' };
  };

  // 1. As installed: the switch has never been touched.
  out.publicConfig.asInstalled = await publicConfig();
  out.webBadges.switchOn = await badges();

  // 2. The admin page, Status badges tab: the cards, the switch, and turning it off the way an administrator does.
  await go('#/configurationpage?name=Jellyfin%20Enhanced&jeSection=media-tags&tab=badges');
  await until(() => page.evaluate(() => !!document.getElementById('statusTagsJustAddedDays')?.offsetParent), 30000);
  await sleep(2000);
  out.adminPage = await page.evaluate(() => {
    const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
    const cards = [...document.querySelectorAll('#jeTaPanel-badges [data-section]')];
    const box = document.getElementById('statusTagsOnCollections');
    const row = document.querySelector('[data-field-row="statusTagsOnCollections"]');
    const card = box ? box.closest('[data-section]') : null;
    return {
      cards: cards.map(c => c.dataset.section),
      switch: box ? {
        card: card ? card.dataset.section : null,
        cardHint: text(card && card.querySelector('.je-ta-hint')),
        type: box.type, checked: box.checked,
        label: text(row && row.querySelector('.je-ta-switch-name')),
        description: text(row && row.querySelector('.je-ta-switch-desc')),
      } : 'no switch',
    };
  });
  if (out.adminPage.switch !== 'no switch') {
    await page.locator('#statusTagsOnCollections').evaluate(el => el.click());
    await until(async () => (await stored()) === false, 20000).catch(() => null);
    await sleep(1000);
    out.adminPage.afterTurningItOff = { checked: await page.evaluate(() => document.getElementById('statusTagsOnCollections').checked), stored: await stored() };
  } else {
    // No control to click: ask the page's save endpoint for the same change.
    out.adminPage.saveEndpointForTheField = await patch({ [FIELD]: false });
    out.adminPage.stored = await stored();
  }

  // 3. With the switch off (where a build has one).
  out.publicConfig.afterTurningItOff = await publicConfig();
  out.webBadges.switchOff = await badges();

  // Leave the lab as it was: the switch on.
  if ((await stored()) === false) await patch({ [FIELD]: true });
  out.switchBackOn = await stored();
  return out;
};
