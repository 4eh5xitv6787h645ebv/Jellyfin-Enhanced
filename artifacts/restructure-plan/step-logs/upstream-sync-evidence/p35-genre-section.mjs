// p35 (upstream ec470d75, #1044): a genre's "More in" section on a list page of a real-Seerr lab.
// Reads where the section joins the page, its header and the line that goes to it, the Filters menu of a feed
// (the genre itself given), then types a Score range and records what the feeds then ask the plugin for.
export default async ({ page, go, until, sleep }) => {
  const sel = '.jellyseerr-genre-discovery-section';
  const asked = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.includes('/JellyfinEnhanced/jellyseerr/discover/')) asked.push(`${url.pathname.replace(/^.*\/JellyfinEnhanced\//, '')}${url.search}`);
  });
  await go('#/list?genreId=ce06903d834d2c3417e0889dd4049f3b&serverId=0202511b0eac4284ab045b3ba556d72e');
  await until(() => page.locator(`${sel} .itemsContainer > .card:not(.jellyseerr-card-placeholder)`).count(), 30000);
  await sleep(1500);
  const read = () => page.evaluate(sel => {
    const s = document.querySelector(sel);
    const text = el => (el ? el.textContent.trim() : null);
    const jump = document.querySelector('.jellyseerr-join-jump');
    return {
      title: text(s.querySelector('.sectionTitle')),
      nameKeptWhole: text(s.querySelector('.sectionTitle .jellyseerr-discovery-name')),
      summary: text(s.querySelector('.jellyseerr-discovery-summary')),
      tabs: [...s.querySelectorAll('.jellyseerr-filter-btn')].map(b => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? ' (on)' : ''}`),
      filtersButton: s.querySelector('.jellyseerr-filters-btn') ? text(s.querySelector('.jellyseerr-filters-name')) : null,
      sort: text(s.querySelector('.jellyseerr-sort-btn')),
      jumpLine: jump ? `${jump.textContent}${jump.hidden ? ' (hidden)' : ''}` : null,
      besideTheLibraryList: !!s.parentElement?.querySelector(':scope > .itemsContainer, :scope > .verticalSection, :scope > div > .itemsContainer'),
      placeholders: s.querySelectorAll('.jellyseerr-card-placeholder').length,
      setLine: [...s.querySelectorAll('.jellyseerr-filters-set .jellyseerr-filters-token > span')].map(t => t.textContent),
      message: text(s.querySelector('.jellyseerr-section-message span')),
      cards: s.querySelectorAll('.itemsContainer > .card:not(.jellyseerr-card-placeholder)').length
    };
  }, sel);
  const result = { page: await read(), firstRequests: [...asked].sort() };
  await page.locator(`${sel} .jellyseerr-filters-btn`).click();
  await until(() => page.locator('.jellyseerr-sort-menu .jellyseerr-menu-group').count(), 5000);
  const groups = () => page.evaluate(() => [...document.querySelectorAll('.jellyseerr-menu-group')]
    .map(g => `${g.querySelector('.actionSheetItemText').textContent}: ${g.querySelector('.jellyseerr-menu-group-value').textContent}`));
  result.filterGroups = await groups();
  await page.locator('.jellyseerr-menu-group[data-toggle="genres"]').click();
  await until(() => page.locator('.jellyseerr-menu-group[data-toggle="genres"] + .jellyseerr-menu-choices .jellyseerr-menu-tick').count(), 10000);
  result.genreGiven = await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-menu-group[data-toggle="genres"] + .jellyseerr-menu-choices .jellyseerr-menu-tick[aria-disabled="true"]')]
    .map(r => `${r.textContent.trim()} (${r.getAttribute('aria-checked')})`));
  result.genreCount = await page.locator('.jellyseerr-menu-group[data-toggle="genres"] + .jellyseerr-menu-choices .jellyseerr-menu-tick').count();
  asked.length = 0;
  await page.locator('.jellyseerr-menu-group[data-toggle="score"]').click();
  const fields = page.locator('.jellyseerr-menu-group[data-toggle="score"] + .jellyseerr-menu-choices .jellyseerr-menu-input');
  await fields.nth(0).fill('7,5');
  await fields.nth(0).press('Enter');
  await sleep(2500);
  result.filterGroupsAfter = await groups();
  await page.keyboard.press('Escape');
  await sleep(500);
  result.scoreRequests = [...new Set(asked)].sort();
  result.filtered = await read();
  return result;
};
