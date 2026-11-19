// Port 93 (upstream 40738412): the Leaving soon page's cards as a user sees them, with the Maintainerr of
// p93-leaving.setup.py. Mounted the way its tab mounts it (as p68-page.mjs), then for each card: its text pieces in
// order (title, year, detail, chips, the date and size line), whether it is a row (poster left, details right) or a
// column, the poster's size, the grid's column count, and what leaving-soon/list sent for the item (size).
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => !!window.JellyfinEnhanced?.leavingSoonPage), 15000);
  return page.evaluate(async () => {
    const JE = window.JellyfinEnhanced;
    const host = document.createElement('div');
    host.style.width = '1200px';
    document.body.appendChild(host);
    JE.leavingSoonPage.injectStyles();
    JE.leavingSoonPage.renderForCustomTab(host);
    for (let i = 0; i < 50 && !host.querySelector('.je-ls'); i++) await new Promise(r => setTimeout(r, 100));
    const list = await ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('JellyfinEnhanced/leaving-soon/list'), dataType: 'json' });
    const lines = [`list: ${(list.items || []).map(i => `${i.name} (${i.type}) size=${i.size === undefined ? 'absent' : i.size}`).join('; ')}`,
      `list keys: ${Object.keys(list).join(',')}`];
    const grid = host.querySelector('.je-ls-grid');
    if (grid) lines.push(`grid columns: ${getComputedStyle(grid).gridTemplateColumns.split(' ').length}`);
    for (const c of host.querySelectorAll('.je-ls-card')) {
      const pieces = [...c.querySelectorAll('.je-ls-name, .je-ls-year, .je-ls-sub, .je-ls-chip, .je-ls-scope')].map(e => `${e.className.replace(/je-ls-/g, '')}=${e.textContent}`);
      const poster = c.querySelector('.je-ls-poster').getBoundingClientRect();
      lines.push(`card: ${pieces.join(' | ')}`);
      lines.push(`  layout: ${getComputedStyle(c).flexDirection}, poster ${Math.round(poster.width)}x${Math.round(poster.height)}`);
    }
    host.remove();
    return lines.join('\n');
  });
};
