// Ports 113 and 116 (upstream f83971e3, 235dc152), run with `je12 browse '#/home' --profile tv --script <this>`.
// On Home: the header tab strip's width and the random button's classes. More Info for Abominable (tmdb 431580),
// opened with focus on the random button: its external links, a TV remote's Back (keyCode 10009) and a second one at
// once, where focus lands. The request window: focuscontainer, Back, focus. Seerr search results ("Mock"): OK on the
// first poster not in the library, the title link's tabindex, then Back.
const BACK = { key: 'Unidentified', keyCode: 10009 };

export default async ({ page, go, until, sleep }) => {
  const out = [];
  const back = () => page.evaluate(init => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    (document.activeElement || document.body).dispatchEvent(event);
    return event.defaultPrevented;
  }, BACK);
  const focusName = () => page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'body';
    return a.id ? `#${a.id}` : `${a.tagName.toLowerCase()}.${[...a.classList].slice(0, 2).join('.')}`;
  });
  const home = async () => {
    await page.goto('about:blank');
    await go('#/home');
    await until(() => page.evaluate(() => !!document.querySelector('#randomItemButton')), 20000).catch(() => null);
    await sleep(1500);
    await page.evaluate(() => window.JellyfinEnhanced.loader?.ensure?.('seerr'));
  };

  await home();
  out.push(...await page.evaluate(() => {
    const tabs = document.querySelector('.headerTabs.sectionTabs');
    const random = document.querySelector('#randomItemButton');
    return [`header tab strip: ${tabs ? getComputedStyle(tabs).width : 'none'} wide in a ${innerWidth}px viewport`,
      `random button: is=${random?.getAttribute('is')} class=[${random ? [...random.classList].sort().join(' ') : ''}]`];
  }));

  // More Info
  await page.evaluate(() => document.querySelector('#randomItemButton')?.focus());
  await page.evaluate(() => { void window.JellyfinEnhanced.jellyseerrMoreInfo.open(431580, 'movie'); });
  const opened = await until(() => page.evaluate(() => !!document.querySelector('.je-more-info-modal.active')), 15000).catch(() => false);
  await sleep(1000);
  if (!opened) out.push('More Info: did not open');
  else {
    out.push(await page.evaluate(() => {
      const modal = document.querySelector('.je-more-info-modal.active');
      const links = [...modal.querySelectorAll('.je-more-info-rating-badge-item, .trailer-item, .je-more-info-fact:not(.jellyfin)')];
      return `More Info external links: ${links.length}; with a target: ${modal.querySelectorAll('a[target]').length}; inert (href="#"): ${links.filter(a => a.getAttribute('href') === '#').length}`;
    }));
    out.push(`More Info focus: ${await focusName()}`);
    const hash = await page.evaluate(() => location.hash);
    const first = await back();
    const second = await back();
    await sleep(800);
    out.push(`More Info Back: default prevented ${first}; a second Back at once: default prevented ${second}`);
    out.push(`after Back: More Info open ${await page.evaluate(() => !!document.querySelector('.je-more-info-modal.active'))}; focus ${await focusName()}; address ${hash} -> ${await page.evaluate(() => location.hash)}`);
  }

  // The request window
  await home();
  await page.evaluate(() => document.querySelector('#randomItemButton')?.focus());
  await page.evaluate(() => {
    const created = window.JellyfinEnhanced.jellyseerrModal.create({ title: 'Lab', subtitle: 'TV', bodyHtml: '<p>body</p>', onSave() {} });
    window.__jeLabModal = created;
    created.show();
  });
  await sleep(500);
  out.push(`request window: focuscontainer ${await page.evaluate(() => window.__jeLabModal.modalElement.classList.contains('focuscontainer'))}; focus ${await focusName()}`);
  const hash2 = await page.evaluate(() => location.hash);
  const prevented = await back();
  await sleep(800);
  out.push(`request window Back: default prevented ${prevented}; open after ${await page.evaluate(() => !!document.querySelector('.jellyseerr-season-modal.show'))}; focus ${await focusName()}; address ${hash2} -> ${await page.evaluate(() => location.hash)}`);

  // Seerr cards on the search page
  await page.goto('about:blank');
  await go('#/search?query=Mock');
  const cards = await until(() => page.evaluate(() => document.querySelectorAll('.jellyseerr-card').length), 30000).catch(() => 0);
  await sleep(1500);
  if (!cards) out.push('search: no Seerr cards');
  else {
    const picked = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.jellyseerr-card')].find(c => !c.classList.contains('jellyseerr-card-in-library'));
      if (!card) return null;
      card.setAttribute('data-je-lab-pick', '1');
      card.querySelector('.jellyseerr-poster-image').focus();
      const title = card.querySelector('.jellyseerr-more-info-link');
      return `card "${title?.textContent.trim()}": title link tabindex ${title?.getAttribute('tabindex')}`;
    });
    out.push(picked ?? 'search: every card is in the library');
    if (picked) {
      await page.keyboard.press('Enter');
      await sleep(1500);
      out.push(await page.evaluate(() => {
        const card = document.querySelector('[data-je-lab-pick]');
        return `OK on the poster: overview ${!!card?.querySelector('.jellyseerr-overview')}; More Info open ${!!document.querySelector('.je-more-info-modal.active')}`;
      }));
      out.push(`focus: ${await focusName()}`);
      const hash3 = await page.evaluate(() => location.hash);
      const prevented3 = await back();
      await sleep(800);
      out.push(`Back: default prevented ${prevented3}; overview ${await page.evaluate(() => !!document.querySelector('[data-je-lab-pick] .jellyseerr-overview'))}; More Info open ${await page.evaluate(() => !!document.querySelector('.je-more-info-modal.active'))}; focus ${await focusName()}; address ${hash3} -> ${await page.evaluate(() => location.hash)}`);
    }
  }
  return out.join('\n');
};
