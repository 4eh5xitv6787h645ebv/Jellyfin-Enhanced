// p35 (upstream ec470d75, #1044): a person's "More with" section on a real-Seerr lab, as a viewer uses it.
// Reads the header (title, the name kept whole, the summary, tabs, Filters, sort), the cards' role lines, the
// sort menu, then Most votes; the Filters menu's groups, the Role list, a role ticked and a year range typed;
// the line of what is set and the list each time. Run on upstream's build and on the port with the same command.
export default async ({ page, go, until, sleep }) => {
  const sel = '.jellyseerr-person-discovery-section';
  await go('#/details?id=9bb479ad68de565257117f6df776af56');
  await until(() => page.locator(`${sel} .itemsContainer > .card:not(.jellyseerr-card-placeholder)`).count(), 30000);
  await sleep(800);
  const read = () => page.evaluate(sel => {
    const s = document.querySelector(sel);
    const text = el => (el ? el.textContent.trim() : null);
    const cards = [...s.querySelectorAll('.itemsContainer > .card:not(.jellyseerr-card-placeholder)')].filter(c => c.getClientRects().length > 0);
    return {
      title: text(s.querySelector('.sectionTitle')),
      nameKeptWhole: text(s.querySelector('.sectionTitle .jellyseerr-discovery-name')),
      summary: text(s.querySelector('.jellyseerr-discovery-summary')),
      tabs: [...s.querySelectorAll('.jellyseerr-filter-btn')].map(b => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? ' (on)' : ''}`),
      filtersButton: s.querySelector('.jellyseerr-filters-btn') ? `${text(s.querySelector('.jellyseerr-filters-name'))}${s.querySelector('.jellyseerr-filters-btn').hasAttribute('data-on') ? ' (on)' : ''}` : null,
      sort: text(s.querySelector('.jellyseerr-sort-btn')),
      setLine: [...s.querySelectorAll('.jellyseerr-filters-set .jellyseerr-filters-token > span')].map(t => t.textContent),
      none: text(s.querySelector('.jellyseerr-filters-none span')),
      inPrimaryColumn: !!s.closest('.detailPagePrimaryContent .detailSection'),
      cards: cards.length,
      first: cards.slice(0, 6).map(c => `${text(c.querySelector('.cardText-first'))} | ${[...c.querySelectorAll('.jellyseerr-role > bdi')].map(b => b.textContent).join(' / ') || '-'}`)
    };
  }, sel);
  const items = () => page.evaluate(() => [...document.querySelectorAll('.jellyseerr-sort-menu .actionSheetScroller > .actionSheetMenuItem')]
    .map(i => `${i.textContent.trim()}${i.getAttribute('aria-checked') === 'true' ? ' (ticked)' : ''}`));
  const result = { page: await read() };

  await page.locator(`${sel} .jellyseerr-sort-btn`).click();
  await until(() => page.locator('.jellyseerr-sort-menu').count(), 5000);
  result.sortMenu = await items();
  await page.locator('.jellyseerr-sort-menu .actionSheetMenuItem[data-id="vote_count.desc"]').click();
  await sleep(1200);
  result.mostVotes = await read();

  await page.locator(`${sel} .jellyseerr-filters-btn`).click();
  await until(() => page.locator('.jellyseerr-sort-menu .jellyseerr-menu-group').count(), 5000);
  result.filterGroups = await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-menu-group')]
    .map(g => `${g.querySelector('.actionSheetItemText').textContent}: ${g.querySelector('.jellyseerr-menu-group-value').textContent}`));
  await page.locator('.jellyseerr-menu-group[data-toggle="role"]').click();
  await until(() => page.locator('.jellyseerr-menu-group[data-toggle="role"] + .jellyseerr-menu-choices .jellyseerr-menu-tick').count(), 5000);
  const roleRows = page.locator('.jellyseerr-menu-group[data-toggle="role"] + .jellyseerr-menu-choices .jellyseerr-menu-tick');
  result.roles = await roleRows.allTextContents();
  await roleRows.last().click();
  await sleep(1200);
  result.roleTicked = await read();
  await page.locator('.jellyseerr-menu-group[data-toggle="year"]').click();
  const fields = page.locator('.jellyseerr-menu-group[data-toggle="year"] + .jellyseerr-menu-choices .jellyseerr-menu-input');
  await fields.nth(0).fill('1985');
  await fields.nth(0).press('Enter');
  await fields.nth(1).fill('1995-06');
  await fields.nth(1).press('Enter');
  await sleep(1200);
  result.filterGroupsAfter = await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-menu-group')]
    .map(g => `${g.querySelector('.actionSheetItemText').textContent}: ${g.querySelector('.jellyseerr-menu-group-value').textContent}`));
  await page.keyboard.press('Escape');
  await sleep(400);
  result.menuClosed = (await page.locator('.jellyseerr-sort-menu').count()) === 0;
  result.filtered = await read();
  return result;
};
