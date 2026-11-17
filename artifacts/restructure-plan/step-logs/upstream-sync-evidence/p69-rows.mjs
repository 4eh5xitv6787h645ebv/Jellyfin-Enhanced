// The Seerr Similar and Recommended rows on a series, a season and an episode page (as real-viewer): each row's title
// and card count, and which TMDB ids JE asked Seerr about for rows.
export default async ({ page, go, until, sleep }) => {
  const asked = [];
  page.on('request', r => { const m = /jellyseerr\/(tv|movie)\/(\d+)\/(similar|recommendations)/i.exec(r.url()); if (m) asked.push(`${m[1]} ${m[2]} ${m[3]}`); });
  const out = [];
  for (const [label, id] of [['series', '8748b33dc58b0ad6c2a25d0d522f5a68'], ['season', 'bc7dfcc77fc6c36266e9c2db83fa66de'], ['episode', '9563efa92bbb65c2e81d1015e43b0469']]) {
    asked.length = 0;
    await go(`#/details?id=${id}`);
    await until(() => page.evaluate(() => !!document.querySelector('#itemDetailPage:not(.hide) .itemName, .detailPagePrimaryContainer h1')), 15000).catch(() => null);
    await sleep(4000);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#itemDetailPage:not(.hide) .jellyseerr-details-section')]
      .map(s => `${s.querySelector('h2, .sectionTitle')?.textContent.trim()}: ${s.querySelectorAll('.card, .jellyseerr-card').length} cards`));
    out.push(`${label}: ${rows.join('; ') || 'no rows'} | asked: ${[...new Set(asked)].sort().join(', ') || 'nothing'}`);
  }
  return out.join('\n');
};
