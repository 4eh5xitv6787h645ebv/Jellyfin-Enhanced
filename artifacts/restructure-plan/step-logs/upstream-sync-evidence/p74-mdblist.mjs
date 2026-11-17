// The MDBList "Configure ratings shown" list on the Display tab's card and its linked copy on the Services tab (as
// real-admin; the saved MdblistRatingsSources is "imdb,tmdb"). Reads both lists, then unticks IMDb and moves TMDB up in
// the Services tab copy, and reads both lists again. Nothing is saved.
export default async ({ page, until, sleep }) => {
  await until(() => page.evaluate(() => !!document.querySelector('#mdblistRatingsSourcesAdmin .je-quality-cat-admin-row')), 20000).catch(() => null);
  await sleep(1500);
  const lists = () => page.evaluate(() => ['mdblistRatingsSourcesAdmin', 'mdblistRatingsSourcesAdmin--mirror'].map(id => {
    const list = document.getElementById(id);
    if (!list) return `${id}: missing`;
    const rows = [...list.querySelectorAll('.je-quality-cat-admin-row')].map(r => (r.dataset.sourceKey || r.textContent.trim()) + (r.querySelector('input[type=checkbox]')?.checked ? '*' : ''));
    const group = list.closest('details');
    return `${id}: [${group ? group.className + ' "' + group.querySelector('summary')?.textContent.trim() + '"' : 'no group'}] ${rows.slice(0, 5).join(' ')} … (${rows.length} rows)`;
  }).join('\n'));
  const out = ['as loaded:', await lists()];
  await page.evaluate(() => {
    const copy = document.getElementById('mdblistRatingsSourcesAdmin--mirror');
    const row = key => [...copy.querySelectorAll('.je-quality-cat-admin-row')].find(r => r.dataset.sourceKey === key);
    const box = row('imdb')?.querySelector('input[type=checkbox]');
    if (box) box.click();
    row('tmdb')?.querySelector('.je-cat-up')?.click();
  });
  await sleep(1000);
  out.push('after unticking IMDb and moving TMDB up in the Services tab copy:', await lists());
  return out.join('\n');
};
