// Port 21 (upstream 23281542): the admin page's settings search and New badges reach the Media Tags tab, and the
// Maintainerr card's link is tidied. Reports what the search box says and lists for five queries, what following a
// hit does, which Media Tags rows carry a New badge, what Dismiss does to them, and how the card's link is drawn.
// The lab's What's New has undismissed settings (it was installed from an older build). The Dismiss request is
// answered inside the browser and never reaches the server, so the lab is the same for every build this runs on.
export default async ({ page, go, until, sleep }) => {
  await page.route('**/JellyfinEnhanced/whats-new/dismiss', route => route.fulfill({ status: 204, body: '' }));
  await go('#/configurationpage?name=Jellyfin%20Enhanced');
  await until(() => page.evaluate(() => !!document.getElementById('settingsSearchInput')?.offsetParent), 30000);
  await until(() => page.evaluate(() => !!document.getElementById('je-whats-new-banner')), 30000).catch(() => null);
  await sleep(1500);

  const state = () => page.evaluate(() => {
    const box = document.getElementById('jeMtSearchResults');
    const count = document.getElementById('settingsSearchCount');
    return {
      count: count && count.style.display !== 'none' ? count.textContent : null,
      mediaTags: !box ? 'no result list on this page' : box.hidden ? `hidden (display ${getComputedStyle(box).display})` : {
        heading: box.querySelector('.je-search-tab-label')?.textContent ?? null,
        hits: [...box.querySelectorAll('.je-mt-search-hit')].map(b => `${b.querySelector('strong')?.textContent} — ${b.querySelector('span')?.textContent}`),
      },
    };
  });
  const search = async (text) => {
    await page.locator('#settingsSearchInput').fill(text);
    await sleep(2500);                                      // the debounce, and the first search draws the tab
    return state();
  };
  const brief = (s) => (typeof s.mediaTags === 'object' && s.mediaTags.hits.length > 6
    ? { ...s, mediaTags: { heading: s.mediaTags.heading, hitCount: s.mediaTags.hits.length, first: s.mediaTags.hits.slice(0, 3) } } : s);

  const out = { search: {}, followingAHit: {}, newBadges: {}, maintainerrLink: {} };
  out.search['badges on collections'] = await search('badges on collections');
  out.search['keep status badges off'] = await search('keep status badges off');
  out.search['time windows'] = await search('time windows');
  out.search['tag'] = brief(await search('tag'));
  out.search['zzzz-no-such-setting'] = await search('zzzz-no-such-setting');

  // Following a hit (where a build lists any).
  await search('letterboxd top 250 list');
  const hit = page.locator('#jeMtSearchResults .je-mt-search-hit').first();
  if (await hit.count()) {
    out.followingAHit.hit = (await hit.innerText()).replace(/\s*\n\s*/g, ' — ');
    await hit.click();
    await sleep(2500);
    out.followingAHit.then = await page.evaluate(() => ({
      searchBox: document.getElementById('settingsSearchInput').value,
      searchMode: document.getElementById('JellyfinEnhancedForm').classList.contains('je-search-mode'),
      resultList: document.getElementById('jeMtSearchResults').hidden ? 'hidden' : 'shown',
      mediaTagsTabShown: document.getElementById('media-tags').classList.contains('active'),
      mediaTagsSection: document.querySelector('#media-tags .je-tag-admin')?.dataset.tab ?? null,
      openGroup: document.querySelector('#media-tags .je-ta-grow[data-open="true"]')?.dataset.group ?? null,
      focused: document.activeElement?.id || document.activeElement?.tagName,
    }));
  } else {
    out.followingAHit = 'no hit to follow';
    await page.locator('#settingsSearchInput').fill('');
    await sleep(600);
  }

  // New badges on the Media Tags tab: open it on Status badges, as its sidebar entry does.
  const open = async (query) => {
    await page.evaluate((q) => {
      const a = document.createElement('a');
      a.href = '#/configurationpage?name=Jellyfin%20Enhanced&' + q;
      document.querySelector('[data-role="page"]:not(.hide)').appendChild(a);
      a.click();
      a.remove();
    }, query);
    await sleep(2500);
  };
  await open('jeSection=media-tags&tab=badges');
  const badges = () => page.evaluate(() => {
    const rows = sel => [...document.querySelectorAll(sel)];
    const onTab = rows('#media-tags .je-new-badge');
    return {
      onTheStatusBadgesTab: rows('#jeTaPanel-badges .je-new-badge').map(b => `${b.closest('[data-field-row]')?.dataset.fieldRow}: ${b.textContent.replace('auto_awesome', '')}`),
      onTheWholeMediaTagsTab: onTab.length,
      doubled: onTab.filter(b => b.parentElement.querySelectorAll(':scope > .je-new-badge').length > 1).length,
      onTheForm: document.querySelectorAll('#JellyfinEnhancedForm .je-new-badge').length,
    };
  });
  out.newBadges.asLoaded = await badges();
  // Another section of the tab, and back: rows drawn later are badged too.
  await open('jeSection=media-tags&tab=server');
  await open('jeSection=media-tags&tab=badges');
  out.newBadges.afterVisitingAnotherSection = await badges();
  const dismissed = await page.evaluate(() => { const b = document.querySelector('#je-whats-new-banner .je-whats-new-close'); if (b) b.click(); return !!b; });
  await sleep(1200);
  out.newBadges.afterDismiss = dismissed ? await badges() : 'no banner to dismiss';
  if (dismissed) {
    await open('jeSection=media-tags&tab=server');
    await open('jeSection=media-tags&tab=badges');
    out.newBadges.afterDismissAndVisitingAnotherSection = await badges();
  }

  // The Maintainerr card on the Services tab.
  await open('tab=services');
  out.maintainerrLink = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#services fieldset.jea-section')].find(c => /Maintainerr/.test(c.querySelector('legend')?.textContent || ''));
    const link = card?.querySelector('a.jea-btn');
    return link ? {
      icon: link.querySelector('i.material-icons')?.textContent ?? null,
      text: link.querySelector('span')?.textContent ?? null,
      underline: getComputedStyle(link).textDecorationLine,
      href: link.getAttribute('href'),
    } : 'no Maintainerr card';
  });
  return out;
};
