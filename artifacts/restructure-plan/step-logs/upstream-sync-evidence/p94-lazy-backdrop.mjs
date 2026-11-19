// je12 browse '#/home' --script <this file>
// The status tags' blurred backdrop on a cold Home: when the painter group is fetched, how many tags have their
// picture and how many keep the live backdrop-filter, the pixels of the first tags, and one card under the pointer
// and after it has gone.
import { createHash } from 'node:crypto';
import { coldReload, homeSettled, watchBundles } from './p94-lazy-lib.mjs';

const survey = page => page.evaluate(() => {
  const shown = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const tags = [...document.querySelectorAll('.je-tag-host .status-tag')].filter(shown);
  const hosts = new Set(tags.map(tag => tag.closest('.je-tag-host')));
  const painted = [...document.querySelectorAll('.je-tag-host *')].filter(el => /url\("?data:image/.test(el.style?.backgroundImage || ''));
  const filter = tag => getComputedStyle(tag).backdropFilter || getComputedStyle(tag).webkitBackdropFilter || 'none';
  return {
    statusTags: tags.length,
    hostsWithLiveFilterMark: [...hosts].filter(host => host.dataset.jeBlur === '1').length,
    tagsWithLiveBackdropFilter: tags.filter(tag => filter(tag) !== 'none').length,
    elementsWithAPaintedPicture: painted.length,
    painter: typeof window.JellyfinEnhanced?.statusTagBackdrop,
    painterGroup: window.JellyfinEnhanced?.loader?.state?.()['tag-status-backdrop'] ?? 'not asked',
  };
});

export default async ({ page, until, sleep }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const watch = watchBundles(page);
  await coldReload({ page, until, sleep });
  await page.mouse.move(0, 0);
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  await homeSettled({ page, sleep });
  const drawn = await until(() => page.evaluate(() => document.querySelectorAll('.je-tag-host .status-tag').length), 30000).catch(() => 0);
  if (!drawn) return { error: 'no status tag on Home', asked: watch.since(0) };
  const early = await survey(page);
  // The first status-tagged card into the middle of the view: Jellyfin loads a card's artwork only once it is in view,
  // and the painter paints a card only over artwork that is there.
  await page.evaluate(() => document.querySelector('.je-tag-host .status-tag').closest('.card').scrollIntoView({ block: 'center' }));
  await page.mouse.move(0, 0);
  // The painter waits for the page to be quiet (3 s without a new status tag), then paints in idle slices.
  await until(() => page.evaluate(() => !!window.JellyfinEnhanced?.statusTagBackdrop), 20000).catch(() => false);
  await sleep(8000);
  await watch.settled();
  const rest = await survey(page);
  rest.painterStats = await page.evaluate(() => {
    const s = window.JellyfinEnhanced?.statusTagBackdrop?.stats?.();
    return s ? { watching: s.watching, decodes: s.decodes, drawn: s.drawn, failed: s.failed, unreadable: s.unreadable } : 'no stats';
  });
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.je-tag-host .status-tag')]
    .map(tag => ({ tag, r: tag.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth).slice(0, 6)
    .map(({ tag, r }) => ({ text: tag.textContent.trim(), x: r.x, y: r.y, width: r.width, height: r.height })));
  const pixels = [];
  for (const b of boxes) {
    const shot = await page.screenshot({ clip: { x: Math.floor(b.x) - 1, y: Math.floor(b.y) - 1, width: Math.ceil(b.width) + 2, height: Math.ceil(b.height) + 2 } });
    pixels.push(`${b.text} ${Math.round(b.width)}x${Math.round(b.height)} ${createHash('sha256').update(shot).digest('hex').slice(0, 16)}`);
  }
  // One card under the pointer, then the pointer gone.
  const index = await page.evaluate(() => [...document.querySelectorAll('.card')].findIndex(card => {
    const r = card.getBoundingClientRect();
    return card.querySelector('.je-tag-host .status-tag') && r.top > 60 && r.bottom < innerHeight && r.left > 0 && r.right < innerWidth;
  }));
  const card = () => page.evaluate(i => {
    const host = document.querySelectorAll('.card')[i].querySelector('.je-tag-host');
    const tag = host.querySelector('.status-tag');
    const cs = getComputedStyle(tag);
    return { liveFilterMark: host.dataset.jeBlur ?? null, live: host.dataset.jeLive ?? null, tagBackdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || 'none' };
  }, index);
  const pointer = {};
  if (index >= 0) {
    pointer.atRest = await card();
    const at = await page.evaluate(i => { const r = document.querySelectorAll('.card')[i].querySelector('.cardScalable').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, index);
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await sleep(150);
    pointer.pointerOn = await card();
    await page.mouse.move(0, 0);
    await sleep(2000);
    pointer.pointerGone = await card();
  }
  return { asked: watch.since(0), beforeThePainter: early, atRest: rest, firstTagPixels: pixels, pointer };
};
