// je12 browse '#/home' --script <this file>
// Home with tags, no pointer: where resting cards' tags sit (flow or positioned), containment and transforms in the
// tag hosts; then one card with genre icons under the pointer and after the pointer has gone. Started from the
// second port's flow.mjs and hover.mjs.
import { homeSettled } from './p94-lazy-lib.mjs';

export default async ({ page, go, sleep }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await go('#/home');
  await page.mouse.move(0, 0);
  await homeSettled({ page, sleep });
  const rest = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('.je-tag-host')].filter(h => h.querySelector('.je-tag-slot') && h.clientWidth > 0);
    const flow = hosts.filter(h => h.dataset.jeFlow === '1' && !h.dataset.jeLive);
    const containers = hosts.flatMap(h => [...h.querySelectorAll('.je-tag-slot > [data-je-group]')]);
    const chips = containers.flatMap(c => [...c.children]);
    return {
      cardsWithTags: hosts.length,
      restingInFlow: flow.length,
      groupContainersWithLayoutContainment: `${containers.filter(c => /layout|strict|content/.test(getComputedStyle(c).contain)).length} of ${containers.length}`,
      chipsWithATransform: `${chips.filter(c => getComputedStyle(c).transform !== 'none').length} of ${chips.length}`,
      layoutState: typeof window.JellyfinEnhanced?.core?.tagLayout?.flowStats === 'function' ? window.JellyfinEnhanced.core.tagLayout.flowStats() : 'no flowStats',
    };
  });
  const index = await page.evaluate(() => [...document.querySelectorAll('.card')].findIndex(c => {
    const h = c.querySelector('.je-tag-host[data-je-flow]');
    const r = c.getBoundingClientRect();
    return h && h.querySelector('.genre-tag') && r.top > 60 && r.bottom < innerHeight && r.left > 0 && r.right < innerWidth;
  }));
  if (index < 0) return { rest, pointer: 'no resting card with genre icons in view' };
  const read = () => page.evaluate(i => {
    const h = document.querySelectorAll('.card')[i].querySelector('.je-tag-host');
    const slot = h.querySelector('.je-tag-slot');
    const name = h.querySelector('.genre-tag > .genre-text');
    return { flow: h.dataset.jeFlow ?? null, live: h.dataset.jeLive ?? null, hostDisplay: getComputedStyle(h).display, slotPosition: getComputedStyle(slot).position,
      genreNameShown: name ? getComputedStyle(name).display !== 'none' : null };
  }, index);
  const pointer = { atRest: await read() };
  const at = await page.evaluate(i => { const r = document.querySelectorAll('.card')[i].querySelector('.cardScalable').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, index);
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await sleep(150);
  pointer.pointerOn = await read();
  await page.mouse.move(0, 0);
  await sleep(800);
  pointer.pointerGone = await read();
  return { rest, pointer };
};
