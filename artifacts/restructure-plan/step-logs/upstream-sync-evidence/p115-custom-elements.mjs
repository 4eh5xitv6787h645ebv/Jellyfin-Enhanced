// Port 115 (upstream 00ec8b46): JE's own custom elements, as the page shows them. On Home and on the details page of
// Abominable (a library movie), every element with an `is` attribute that JE made (an id or class starting with je or
// jellyseerr, or one of JE's header and sidebar entries) is printed as `tag is=… class=[sorted]`, one line per kind.
// On a modern engine both forms upgrade, so the lines should read the same before and after the port, apart from
// classes the upgrade adds at creation that an assignment to className used to overwrite.
export default async ({ page, go, until, sleep }) => {
  const out = [];
  const read = label => page.evaluate(where => {
    const ours = el => /^(je|jellyseerr|jellyfinEnhanced|enhanced|randomItem)/i.test(el.id)
      || [...el.classList].some(c => /^(je-|jellyseerr|arr-|seerr-|elsewhere|letterboxd|mdblist)/.test(c));
    const lines = new Set();
    for (const el of document.querySelectorAll('[is]')) {
      if (!ours(el) || el.closest('.page.hide')) continue;
      const id = el.id ? `#${el.id.replace(/[0-9a-f]{8,}/g, '…')}` : '';
      lines.add(`${where}: ${el.tagName.toLowerCase()}${id} is=${el.getAttribute('is')} class=[${[...el.classList].sort().join(' ')}]`);
    }
    return [...lines].sort();
  }, label);
  await page.goto('about:blank');
  await go('#/home');
  await until(() => page.evaluate(() => !!document.querySelector('#randomItemButton')), 20000).catch(() => null);
  await sleep(2500);
  out.push(...await read('home'));
  await page.goto('about:blank');
  await go('#/details?id=06de48d758074756c732c7de70aa79f8');
  await until(() => page.evaluate(() => !!document.querySelector('#itemDetailPage:not(.hide) .detailButton')), 20000).catch(() => null);
  await sleep(3000);
  out.push(...await read('details'));
  return out.join('\n');
};
