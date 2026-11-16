// Parity check for upstream c165a07b (#1064): the Recommendations Home tab keeps its rows across a tab
// switch, its category page holds a history entry that Back closes, the Android app's Back (its
// NavigationHelper.goBack, stood in for here) selects Home from a JE tab instead of exiting, a jeTab left
// in the URL without tab=N is not followed, and the row edge masks sit in a hover media block.
// Turns the Recommendations native tab on for the run and off again at the end.
export default async ({ page, go, until, sleep }) => {
  const setNativeTab = on => page.evaluate(async on => {
    const api = window.ApiClient;
    const headers = { Authorization: `MediaBrowser Token="${api.accessToken()}"`, 'Content-Type': 'application/json' };
    const plugins = await (await fetch(api.getUrl('Plugins'), { headers })).json();
    const je = plugins.find(p => /Jellyfin Enhanced/i.test(p.Name));
    const url = api.getUrl(`Plugins/${je.Id}/Configuration`);
    const cfg = await (await fetch(url, { headers })).json();
    Object.assign(cfg, { RecommendationsPageEnabled: true, RecommendationsUseNativeTab: on, RecommendationsUseCustomTabs: false });
    return (await fetch(url, { method: 'POST', headers, body: JSON.stringify(cfg) })).status;
  }, on);
  let discover = 0;
  page.on('request', request => { if (/\/JellyfinEnhanced\/jellyseerr\/discover\//.test(request.url())) discover++; });
  const rows = () => page.evaluate(() => {
    const panel = document.querySelector('.tabContent.pageTabContent.is-active');
    return panel ? panel.querySelectorAll('.jellyfinenhanced.recommendations .je-recommendations-section').length : 0;
  });
  const state = () => page.evaluate(() => {
    const active = document.querySelector('#indexPage:not(.hide) .tabContent.pageTabContent.is-active, .page:not(.hide) .tabContent.pageTabContent.is-active');
    const category = document.getElementById('je-recommendations-category-page');
    const marked = document.querySelector('[data-p51-mark]');
    return {
      hash: location.hash,
      activeTabIsRecommendations: !!active?.querySelector('.jellyfinenhanced.recommendations'),
      activeTabIndex: active ? Number(active.getAttribute('data-index')) : null,
      markedRowsStillInPage: !!marked && marked.isConnected && marked.querySelectorAll('.je-recommendations-section').length > 0,
      categoryOpen: !!category && !category.classList.contains('hide'),
      appExits: window.__p51Exits || 0
    };
  });
  const select = index => page.evaluate(index => { document.querySelector('[is="emby-tabs"]').selectedIndex(index); }, index);
  const out = { configOn: await setNativeTab(true) };
  const LINK = '#/home?tab=2&jeTab=recommendations';
  /** Each step starts on the Recommendations tab; a step that left it (a build without the fix) reopens it. */
  const openTab = async () => {
    if ((await state()).activeTabIsRecommendations && await rows()) return 'already open';
    await go('#/details?id=none'); await sleep(500);
    await go(LINK);
    await until(rows, 30000); await sleep(1500);
    return 'reopened';
  };
  const openCategory = async () => {
    await page.evaluate(() => {
      const panel = document.querySelector('.tabContent.pageTabContent.is-active');
      (panel.querySelector('.je-recommendations-section [data-category], .je-recommendations-section .je-view-all, .je-recommendations-section a.sectionTitleTextButton, .je-recommendations-section .sectionTitleTextButton') ||
        panel.querySelector('.je-recommendations-tile .cardImageContainer')).click();
    });
    const opened = await until(async () => (await state()).categoryOpen, 15000);
    await sleep(1500);
    return !!opened;
  };
  const step = async (name, run) => { try { out[name] = await run(); } catch (error) { out[name] = { error: String(error).split('\n')[0] }; } };
  try {
    await page.reload(); await sleep(3000);
    await go(LINK);
    out.rowsOnFirstOpen = await until(rows, 30000);
    await sleep(1500);
    // The Android app's shell, stood in for: Back calls NavigationHelper.goBack(), which exits the app.
    await page.evaluate(() => { window.NavigationHelper = { goBack() { window.__p51Exits = (window.__p51Exits || 0) + 1; return 'exit'; } }; });
    const mark = () => page.evaluate(() => { document.querySelector('.tabContent.pageTabContent.is-active .jellyfinenhanced.recommendations').firstElementChild.setAttribute('data-p51-mark', '1'); });
    await mark();
    const tabIndex = (await state()).activeTabIndex;
    out.afterOpen = await state();

    // 1. Another Home tab and back.
    await step('tabSwitch', async () => {
      const before = discover;
      await select(0); await sleep(1500);
      await select(tabIndex); await sleep(2500);
      return { ...(await state()), rowsNow: await rows(), discoverRequestsOnReturn: discover - before };
    });

    // 2. A category page from the tab: one history entry, closed by Back.
    await step('category', async () => {
      const tab = await openTab(); await mark();
      const lengthBefore = await page.evaluate(() => history.length);
      const opened = await openCategory();
      return { tab, opened, historyEntriesAdded: await page.evaluate(n => history.length - n, lengthBefore), ...(await state()) };
    });
    await step('categoryAfterBack', async () => {
      const before = discover;
      await page.evaluate(() => history.back());
      await sleep(2500);
      return { ...(await state()), rowsNow: await rows(), discoverRequestsAfterBack: discover - before };
    });

    // 3. The app's Back with the category page open, then on the JE tab, then on Home.
    const back = () => page.evaluate(() => String(window.NavigationHelper.goBack()));
    await step('appBackOverCategory', async () => {
      const tab = await openTab();
      const opened = await openCategory();
      const exitsBefore = (await state()).appExits;
      const returned = await back();
      await sleep(2500);
      const now = await state();
      return { tab, opened, returned, appExitedInstead: now.appExits > exitsBefore, hash: now.hash, categoryOpen: now.categoryOpen, activeTabIsRecommendations: now.activeTabIsRecommendations };
    });
    await step('appBackOnJeTab', async () => {
      const tab = await openTab();
      const exitsBefore = (await state()).appExits;
      const returned = await back();
      await sleep(2500);
      const now = await state();
      return { tab, returned, appExitedInstead: now.appExits > exitsBefore, hash: now.hash, activeTabIndex: now.activeTabIndex };
    });
    await step('appBackOnHome', async () => {
      await select(0); await sleep(1500);
      const exitsBefore = (await state()).appExits;
      const returned = await back();
      await sleep(1000);
      const now = await state();
      return { returned, appExited: now.appExits > exitsBefore, activeTabIndex: now.activeTabIndex };
    });

    // 4. A jeTab left in the URL by a header script, without tab=N.
    await step('staleJeTab', async () => {
      await go('#/details?id=none'); await sleep(800);
      await go('#/home?jeTab=recommendations');
      await sleep(4000);
      const now = await state();
      return { hash: now.hash, activeTabIndex: now.activeTabIndex, activeTabIsRecommendations: now.activeTabIsRecommendations };
    });

    // 5. Where the row edge masks live.
    out.fadeMaskRule = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        let rules; try { rules = sheet.cssRules; } catch { continue; }
        const visit = (list, parent) => {
          for (const rule of list) {
            if (rule.selectorText && rule.selectorText.includes('.emby-scroller.je-fade-r') && !rule.selectorText.includes('je-fade-l')) return parent || 'no media condition';
            if (rule.cssRules) { const found = visit(rule.cssRules, rule.conditionText || parent); if (found) return found; }
          }
          return null;
        };
        const found = visit(rules, null);
        if (found) return found;
      }
      return 'rule not found';
    });
  } finally {
    out.configOff = await setNativeTab(false);
  }
  return out;
};
