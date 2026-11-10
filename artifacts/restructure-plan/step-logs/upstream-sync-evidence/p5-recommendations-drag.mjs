// Port 5 (upstream 83510ea1): on the Seerr recommendations page, press the mouse on a studio tile, drag 60px
// along the row and release; then, on a freshly opened page, click the same tile without moving.
// Reports which gesture opened the category page.
export default async ({ page, go, until, sleep }) => {
  const visibleTiles = () => page.locator('.je-recommendations-tile .cardImageContainer').filter({ visible: true });
  const open = async () => {
    await go('#/home'); await sleep(800); await go('#/recommendations');
    return until(() => visibleTiles().count(), 30000);
  };
  const category = () => page.evaluate(() => {
    const title = document.getElementById('je-recommendations-category-title');
    return title && title.offsetParent !== null ? title.textContent.trim() || '(category page open)' : null;
  });
  const centre = async () => { const tile = visibleTiles().first(); await tile.scrollIntoViewIfNeeded(); const box = await tile.boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };

  const tiles = await open();
  if (!tiles) return { error: 'no category tiles rendered', hash: await page.evaluate(() => location.hash) };
  let [x, y] = await centre();
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 4 }); await page.mouse.move(x + 60, y, { steps: 4 });
  await page.mouse.up();
  await sleep(1500);
  const categoryOpenAfterDrag = await category();

  await page.reload(); await sleep(3000);
  if (!(await open())) return { tiles, categoryOpenAfterDrag, error: 'tiles did not render the second time' };
  [x, y] = await centre();
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up();
  await sleep(1500);
  return { tiles, categoryOpenAfterDrag, categoryOpenAfterPlainClick: await category() };
};
