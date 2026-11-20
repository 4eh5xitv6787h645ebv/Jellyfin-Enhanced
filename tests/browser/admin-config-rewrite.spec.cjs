const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const config = path.resolve(__dirname, '../../Jellyfin.Plugin.JellyfinEnhanced/Configuration');
const read = file => fs.readFileSync(path.join(config, file), 'utf8');
const served = ext => [read('jeAdmin' + ext), ...fs.readdirSync(path.join(config, 'admin')).filter(f => f.endsWith(ext)).sort().map(f => read('admin/' + f))].join('\n');
const SAVED = { ShowFileSizes: false, TMDB_API_KEY: 'stored-key', JellyseerrUrls: '', JellyseerrApiKey: '', FutureSetting: { kept: true } };

/** The Jellyfin host, as far as this page uses it: ApiClient, Dashboard and a server holding one configuration. */
function hostScript(saved) {
  window.__saved = saved;
  window.__calls = { puts: [], posts: [] };
  window.__failConfig = false;
  window.Dashboard = { showLoadingMsg() {}, hideLoadingMsg() {}, processPluginConfigurationUpdateResult() {}, alert() {}, confirm() {} };
  window.ApiClient = {
    getUrl: (p, q) => location.origin + '/' + p.replace(/^\//, '') + (q ? '?' + new URLSearchParams(q) : ''),
    getPluginConfiguration: async () => { if (window.__failConfig) throw new Error('offline'); return JSON.parse(JSON.stringify(window.__saved)); },
    updatePluginConfiguration: async (id, body) => { window.__calls.puts.push(JSON.parse(JSON.stringify(body))); window.__saved = JSON.parse(JSON.stringify(body)); return {}; },
    ajax: async request => {
      if (request.type === 'POST') window.__calls.posts.push({ url: request.url, data: request.data });
      if (/apply-user-settings/.test(request.url)) return { applied: 1, userCount: 2, unsupported: [] };
      return request.type === 'GET' || !request.type ? [] : {};
    },
    getJSON: async () => [], fetch: async () => ({}), getUsers: async () => [], accessToken: () => 't', serverVersion: () => '12.0.0',
  };
}

/** jellyfin-web inserts the view, then runs its scripts in order, then shows it. */
async function insertView(page, html) {
  await page.evaluate(markup => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = markup;
    const view = wrapper.querySelector('div[data-role="page"]');
    document.body.appendChild(view);
    view.querySelectorAll('script').forEach(original => {
      const script = document.createElement('script');
      script.text = original.text;
      document.head.appendChild(script).remove();
    });
    view.dispatchEvent(new Event('pageshow'));
  }, html);
}

async function open(page, { engine = () => served('.js'), hash = '#/configurationpage?name=Jellyfin%20Enhanced', saved = SAVED, status = 200, failRead = false, start, before } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/JellyfinEnhanced/Configuration/jeAdmin.js*', route => (typeof status === 'function' ? status() : status) === 200
    ? route.fulfill({ status: 200, contentType: 'application/javascript', body: engine() })
    : route.fulfill({ status: 404, body: 'gone' }));
  await page.route('**/JellyfinEnhanced/Configuration/jeAdmin.css*', route => route.fulfill({ status: 200, contentType: 'text/css', body: served('.css') }));
  await page.route('**/JellyfinEnhanced/{cdn,fonts}/**', route => route.fulfill({ status: 204, body: '' }));
  // `start`: how the browser got to the page (default: opened at its address); `before`: runs in the page just before the view is inserted.
  if (start) await start(page); else await page.goto('/' + hash);
  await page.evaluate(hostScript, saved);
  if (failRead) await page.evaluate(() => { window.__failConfig = true; });
  if (before) await page.evaluate(before);
  await insertView(page, read('configPage.html'));
  return errors;
}

/** The page records what it loaded 500 ms after loading, once late lists have settled. */
const settled = page => page.waitForTimeout(650);
const tab = (page, id) => page.locator(`.jellyfin-tab-button[data-tab="${id}"]`);
const clickTab = async (page, id) => {
  // The phone layout keeps the tabs in its drawer.
  if (await page.locator('.jea-nav-toggle').isVisible()) await page.locator('.jea-nav-toggle').click();
  await tab(page, id).click();
};

test.describe('admin configuration page', () => {
  test('loads over a real script element, draws every tab and keeps the stored values', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('.jea-layout')).toBeVisible();
    await expect(page.locator('[data-je-section]')).toHaveCount(0);
    await expect(page.locator('#JellyfinEnhancedPage')).not.toHaveAttribute('aria-busy', 'true');
    await clickTab(page, 'elsewhere');
    await expect(page.locator('#TMDB_API_KEY')).toHaveValue('stored-key');
    await clickTab(page, 'keyboard');
    await expect(page.locator('#shortcut-grid .je-sc-row').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('an edit shows as unsaved, saves, and keeps fields this page does not know', async ({ page }) => {
    await open(page);
    await settled(page);
    await clickTab(page, 'display');
    await page.locator('#showFileSizes').evaluate(control => control.click());
    await expect(page.locator('.je-save-dock')).toHaveClass(/je-dirty/);
    await page.locator('.je-save-dock-btn').click();
    await expect.poll(() => page.evaluate(() => window.__calls.puts.length)).toBe(1);
    const put = await page.evaluate(() => window.__calls.puts[0]);
    expect(put.ShowFileSizes).toBe(true);
    expect(put.FutureSetting).toEqual({ kept: true });
    expect(put.TMDB_API_KEY).toBe('stored-key');
    await expect(page.locator('.je-save-dock')).not.toHaveClass(/je-dirty/);
  });

  test('a changed per-user setting offers Apply the above, which posts just that setting', async ({ page }) => {
    await open(page);
    await settled(page);
    await clickTab(page, 'display');
    await page.locator('#showFileSizes').evaluate(control => control.click());
    const banner = page.locator('fieldset:has(#showFileSizes) .jea-apply');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Show file sizes');
    await banner.locator('.jea-apply-sel').click();
    await page.locator('.jea-dialog [data-r="1"]').click();
    await expect.poll(() => page.evaluate(() => window.__calls.posts.find(p => /apply-user-settings/.test(p.url))?.data)).toBe(JSON.stringify({ properties: ['ShowFileSizes'] }));
    await expect(banner).toBeHidden();
  });

  test('search finds a setting on another tab and leaving search restores the page', async ({ page }) => {
    await open(page);
    await page.locator('#settingsSearchInput').fill('tmdb api key');
    await expect(page.locator('#JellyfinEnhancedForm mark.je-search-match').first()).toBeVisible();
    await expect(page.locator('#settingsSearchCount')).toContainText(/match/);
    await page.locator('#settingsSearchClear').click();
    await expect(page.locator('#JellyfinEnhancedForm')).not.toHaveClass(/je-search-mode/);
    await expect(page.locator('mark.je-search-match')).toHaveCount(0);
  });

  test('a deep link opens its tab', async ({ page }) => {
    await open(page, { hash: '#/configurationpage?name=Jellyfin%20Enhanced&tab=seerr' });
    await expect(page.locator('#seerr')).toHaveClass(/active/);
    await expect(tab(page, 'seerr')).toHaveClass(/active/);
  });

  test('a new Sonarr instance is saved as an instance document', async ({ page }) => {
    await open(page);
    await clickTab(page, 'arr');
    await page.locator('#addSonarrInstance').click();
    const card = page.locator('#sonarrInstancesList .arr-instance-card').first();
    await card.locator('.arr-instance-url').fill('http://sonarr.test:8989');
    await card.locator('.arr-instance-apikey').fill('abc');
    await page.locator('.je-save-dock-btn').click();
    await expect.poll(() => page.evaluate(() => window.__calls.puts.length)).toBe(1);
    const stored = JSON.parse((await page.evaluate(() => window.__calls.puts[0])).SonarrInstances);
    expect(stored[0]).toMatchObject({ Url: 'http://sonarr.test:8989', ApiKey: 'abc' });
  });

  test('a recorded key replaces a shortcut and a player key is refused', async ({ page }) => {
    await open(page);
    await clickTab(page, 'keyboard');
    const row = page.locator('#shortcut-grid .je-sc-row', { hasText: 'Show Playback Info' });
    // Recording starts on purpose (Enter on the key, or a click), not when the key is merely focused.
    await row.locator('.je-sc-key').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('k');
    await expect(page.locator('#shortcut-error-comment')).toContainText('already used by the Jellyfin player');
    // A refused key leaves the recorder listening for another.
    await page.keyboard.press('y');
    await expect(page.locator('#shortcut-grid .je-sc-row', { hasText: 'Show Playback Info' }).locator('.je-sc-key')).toHaveText('Y');
  });

  for (const [name, options] of [
    ['a failed request', { status: 404 }],
    ['an empty answer', { engine: () => '' }],
    ['a page that is not the engine', { engine: () => '<!doctype html>' }],
  ]) {
    test(`${name} for the engine leaves a Retry that works`, async ({ page }) => {
      let working = false;
      const current = {
        status: () => (working || !options.status ? 200 : options.status),
        engine: () => (working ? served('.js') : options.engine ? options.engine() : ''),
      };
      await open(page, current);
      const alert = page.locator('.je-admin-load-error');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText('Saved settings are not affected');
      expect(await page.evaluate(() => window.__calls.puts.length)).toBe(0);
      working = true;
      await alert.locator('button').click();
      await expect(page.locator('.jea-layout')).toBeVisible();
      await clickTab(page, 'elsewhere');
      await expect(page.locator('#TMDB_API_KEY')).toHaveValue('stored-key');
    });
  }

  test('a failed read of the settings refuses to save over them, and Retry recovers', async ({ page }) => {
    await open(page, { failRead: true });
    await expect(page.locator('#je-probe-warning')).toBeVisible();
    await expect(page.locator('#je-probe-warning-msg')).toContainText('saving is disabled');
    await page.locator('.je-save-dock-btn').click();
    await expect(page.locator('.jea-dialog')).toContainText('nothing was saved');
    await page.locator('.jea-dialog [data-r="1"]').click();
    expect(await page.evaluate(() => window.__calls.puts.length)).toBe(0);
    await page.evaluate(() => { window.__failConfig = false; });
    await page.locator('#je-probe-retry-btn').click();
    await expect(page.locator('#je-probe-warning')).toBeHidden();
    await clickTab(page, 'elsewhere');
    await expect(page.locator('#TMDB_API_KEY')).toHaveValue('stored-key');
  });

  for (const [name, change] of [['a changed token', () => { const read = window.ApiClient.accessToken; window.ApiClient.accessToken = () => read() + '-b'; }], ['a replaced client', () => { window.ApiClient = { ...window.ApiClient }; }]]) {
    test(`ATB-R2-001: confirming Apply all plugin settings after ${name} sends nothing and shows nothing`, async ({ page }) => {
      await open(page);
      await settled(page);
      await page.locator('#resetAllUserSettingsBtn').evaluate(button => button.click());
      const dialog = page.locator('.jea-dialog');
      await expect(dialog).toContainText('Are you sure');
      await page.evaluate(change);
      await dialog.locator('[data-r="1"]').click();
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.__calls)).toEqual({ puts: [], posts: [] });
      await expect(page.locator('.jea-dialog')).toHaveCount(0);
    });
  }

  test('ATB-R2-001 control: the same account confirming Apply all plugin settings saves and resets', async ({ page }) => {
    await open(page);
    await settled(page);
    await page.locator('#resetAllUserSettingsBtn').evaluate(button => button.click());
    await page.locator('.jea-dialog [data-r="1"]').click();
    await expect(page.locator('.jea-dialog')).toContainText('saved and applied to all users successfully');
    const calls = await page.evaluate(() => window.__calls);
    expect(calls.puts).toHaveLength(1);
    expect(calls.posts.map(post => new URL(post.url).pathname)).toContain('/JellyfinEnhanced/reset-all-users-settings');
  });

  test('the older Media Tags address forwards to the tab', async ({ page }) => {
    await page.goto('/#/configurationpage?name=JellyfinEnhancedMediaTags&tab=groups&group=rating');
    await page.evaluate(html => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const script = document.createElement('script');
      script.text = wrapper.querySelector('script').text;
      document.head.appendChild(script).remove();
    }, read('mediaTagsPage.html'));
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/configurationpage?name=Jellyfin%20Enhanced&jeSection=media-tags&tab=groups&group=rating');
  });

  // ── Fix round 2: the live bug hunt and the round 2 reviews ──────────────────────────────────────────────────────

  test('the sidebar lists a card\'s groups only while they are on screen, whatever hides them, and keeps up as that changes', async ({ page }) => {
    await open(page, { saved: { ...SAVED, MdblistRatingsEnabled: false } });
    await settled(page);
    const subs = title => page.locator('.jea-nav-leaf:not(.jea-nav-sub)', { hasText: title }).locator('xpath=following-sibling::*[1][contains(@class,"jea-nav-subtree")]').locator('.jea-nav-sub');
    // A main switch that is off.
    await clickTab(page, 'display');
    // A card's title: its legend's text (without the icon's ligature).
    const mdblist = await page.evaluate(() => {
      const legend = document.getElementById('mdblistRatingsEnabled').closest('fieldset').querySelector(':scope > legend');
      return legend.querySelector('.jea-legend-title')?.textContent ?? Array.from(legend.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    });
    await expect(subs(mdblist).first()).toBeAttached();
    expect(await subs(mdblist).evaluateAll(links => links.every(link => link.hidden))).toBe(true);
    await page.locator('#mdblistRatingsEnabled').evaluate(input => input.click());
    await expect.poll(() => subs(mdblist).evaluateAll(links => links.every(link => !link.hidden))).toBe(true);
    // A card locked because Seerr is not set up.
    await clickTab(page, 'seerr');
    await expect(page.locator('#seerr fieldset.jea-locked').first()).toBeAttached();
    const lockedWithGroups = await page.evaluate(() => Array.from(document.querySelectorAll('#seerr > fieldset.jea-locked'))
      .map(card => { const legend = card.querySelector(':scope > legend'); return legend.querySelector('.jea-legend-title')?.textContent ?? Array.from(legend.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); })
      .filter(title => Array.from(document.querySelectorAll('.jea-nav-leaf:not(.jea-nav-sub)')).some(leaf => leaf.textContent === title && leaf.nextElementSibling?.classList.contains('jea-nav-subtree'))));
    expect(lockedWithGroups.length).toBeGreaterThan(0);
    for (const title of lockedWithGroups) {
      expect(await subs(title).evaluateAll(links => links.every(link => link.hidden)), title).toBe(true);
    }
  });

  test('a group entry in the sidebar brings its group into view below the page\'s pinned header, also from the phone menu', async ({ page }, info) => {
    // As administrators see it: smooth scrolling, and a long page (Jellyfin's own content below), so nothing stops the scroll short.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page, { saved: { ...SAVED, SpoilerBlurEnabled: true } });
    await page.evaluate(() => { document.body.style.paddingBottom = '3000px'; });
    await settled(page);
    const phone = info.project.name === 'mobile-chromium';
    const menu = async () => { if (phone) { await page.locator('.jea-nav-toggle').click(); await expect(page.locator('.jea-nav')).toHaveClass(/jea-open/); } };
    await menu();
    await tab(page, 'display').click();
    await menu();
    await page.locator('.jea-nav-leaf', { hasText: 'Spoiler Guard' }).first().click();
    await menu();
    await page.locator('.jea-nav-sub', { hasText: 'Hide metadata on unwatched' }).click();
    const place = () => page.evaluate(() => {
      const group = Array.from(document.querySelectorAll('.jea-group')).find(g => g.querySelector('summary').textContent.includes('Hide metadata on unwatched'));
      const header = document.querySelector('.je-sticky-header');
      const toggle = document.querySelector('.jea-nav-toggle');
      const pinned = Math.max(getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0,
        toggle && toggle.getClientRects().length ? toggle.getBoundingClientRect().bottom : 0);
      const top = group.getBoundingClientRect().top;
      return { open: group.open, below: top >= pinned - 1, inView: top < innerHeight - 40 };
    });
    // Where the scroll ends, not a moment on the way.
    let last = -1;
    await expect.poll(async () => { const y = await page.evaluate(() => Math.round(scrollY)); const still = y === last && y > 0; last = y; return still; }, { intervals: [300], timeout: 5000 }).toBe(true);
    expect(await place()).toEqual({ open: true, below: true, inView: true });
  });

  test('Back with unsaved changes asks first, in every browser, and the router sees only the move that is let through', async ({ page }) => {
    // Jellyfin's router listens for popstate on the window, registered long before the page.
    const start = async p => {
      await p.goto('/#/home');
      await p.evaluate(() => { window.__routed = []; window.addEventListener('popstate', () => window.__routed.push(location.hash)); });
      await p.evaluate(() => { location.hash = '#/configurationpage?name=Jellyfin%20Enhanced&tab=display'; });
    };
    await open(page, { start });
    await settled(page);
    await page.waitForTimeout(400);
    await page.locator('#showFileSizes').evaluate(input => input.click());
    await expect(page.locator('.je-save-dock')).toHaveClass(/je-dirty/);
    const before = await page.evaluate(() => window.__routed.length);
    const dialog = page.locator('.jea-dialog');
    await page.goBack({ timeout: 1500 }).catch(() => {});
    await expect(dialog).toContainText('Unsaved changes');
    await dialog.locator('[data-r="0"]').click(); // Stay
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/configurationpage/);
    await expect(page.locator('#display')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.__routed.length)).toBe(before);
    await page.goBack({ timeout: 1500 }).catch(() => {});
    await expect(dialog).toContainText('Unsaved changes');
    await dialog.locator('[data-r="2"]').click(); // Discard
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/home');
    await expect.poll(() => page.evaluate(() => window.__routed.slice(-1)[0])).toBe('#/home');
  });

  test('the bars pinned at the top sit below Jellyfin\'s bar and are opaque', async ({ page }, info) => {
    const appBar = () => {
      document.body.insertAdjacentHTML('afterbegin', '<div class="MuiAppBar-root" style="position:fixed;top:0;left:0;right:0;height:48px;z-index:1100;background:#202020"></div>');
      document.body.style.paddingTop = '48px';
    };
    await open(page, { before: appBar });
    await settled(page);
    await clickTab(page, 'display');
    await page.evaluate(() => window.scrollTo(0, 1500));
    const pinned = () => page.evaluate(() => {
      const box = el => el && el.getClientRects().length ? el.getBoundingClientRect() : null;
      const header = document.querySelector('.je-sticky-header');
      const toggle = document.querySelector('.jea-nav-toggle');
      const sticky = getComputedStyle(header).position === 'sticky';
      return {
        header: sticky ? Math.round(box(header).top) : null,
        toggle: box(toggle) ? Math.round(box(toggle).top) : null,
        toggleOpaque: box(toggle) ? getComputedStyle(toggle).backgroundImage !== 'none' || /rgb\(/.test(getComputedStyle(toggle).backgroundColor) : null,
      };
    });
    if (info.project.name === 'mobile-chromium') await expect.poll(pinned).toMatchObject({ header: null, toggle: 48, toggleOpaque: true });
    else await expect.poll(pinned).toMatchObject({ header: 48 });
  });

  test('switch tracks keep at least 3:1 against their card in the dark and the light theme, on and off, enabled and locked', async ({ page }) => {
    await open(page);
    await settled(page);
    await clickTab(page, 'display');
    for (const theme of ['dark', 'light']) {
      const ratios = await page.evaluate(light => {
        const pageEl = document.getElementById('JellyfinEnhancedPage');
        pageEl.classList.toggle('je-light-theme', light);
        pageEl.classList.toggle('je-dark-theme', !light);
        document.documentElement.style.background = document.body.style.background = light ? '#f2f2f2' : '#101010';
        const parse = c => { const n = (c.match(/[\d.]+/g) || []).map(Number); return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
        const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
        const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const behind = el => {
          const chain = [];
          for (let node = el.parentElement; node; node = node.parentElement) chain.unshift(node);
          return chain.reduce((acc, node) => over(parse(getComputedStyle(node).backgroundColor), acc), { r: 255, g: 255, b: 255, a: 1 });
        };
        const sw = document.querySelector('#display .jea-switch:not(:disabled)');
        const was = sw.checked;
        const out = [];
        for (const [checked, disabled] of [[false, false], [true, false], [false, true], [true, true]]) {
          sw.checked = checked;
          sw.disabled = disabled;
          const style = getComputedStyle(sw);
          const card = behind(sw);
          const ring = over(parse(style.boxShadow), card);
          const fill = over(parse(style.backgroundColor), card);
          out.push({ state: (checked ? 'on' : 'off') + (disabled ? ', locked' : ''), opacity: Number(style.opacity), edge: Math.max(contrast(ring, card), contrast(fill, card)) });
        }
        sw.checked = was;
        sw.disabled = false;
        return out;
      }, theme === 'light');
      for (const r of ratios) {
        expect(r.edge, `${theme}, ${r.state}`).toBeGreaterThanOrEqual(3);
        expect(r.opacity, `${theme}, ${r.state}`).toBe(1);
      }
    }
  });

  test('searching keeps the sidebar and the cards\' width, and lists only cards with a hit', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-chromium', 'desktop layout');
    await open(page);
    await settled(page);
    await clickTab(page, 'display');
    const width = () => page.locator('#display > fieldset').first().evaluate(el => Math.round(el.getBoundingClientRect().width));
    const before = await width();
    await page.locator('#settingsSearchInput').fill('tmdb');
    await expect(page.locator('#JellyfinEnhancedForm')).toHaveClass(/je-search-mode/);
    await expect(page.locator('.jea-nav .je-tab-bar')).toBeVisible();
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('#JellyfinEnhancedForm > .jellyfin-tab-content > .je-info-banner, #je-whats-new-banner'))
      .filter(el => el.getClientRects().length && !el.querySelector('.je-search-match')).length)).toBe(0);
    const widest = await page.evaluate(() => Math.max(...Array.from(document.querySelectorAll('#JellyfinEnhancedForm > .jellyfin-tab-content > fieldset'))
      .filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect().width)));
    expect(widest).toBeLessThanOrEqual(Math.max(before, 820) + 1);
  });

  test('the Seerr tab\'s number fields and stacked rows look like every other tab\'s', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-chromium', 'desktop layout');
    // One column of cards, so rows are not stacked by a narrow card (as every tab's are below about 560px).
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, { saved: { ...SAVED, JellyseerrEnabled: true, JellyseerrUrls: 'http://seerr.test', JellyseerrApiKey: 'k' } });
    await settled(page);
    const widthOf = async id => {
      await clickTab(page, id);
      return page.locator(`#${id} input[type="number"].jea-input`).evaluateAll(inputs => inputs.filter(el => el.getClientRects().length).map(el => Math.round(el.getBoundingClientRect().width))[0]);
    };
    expect(await widthOf('seerr')).toBe(await widthOf('playback'));
    await clickTab(page, 'seerr');
    // A stacked row (label above its control) starts at the left edge, as on every other tab.
    const stacked = await page.evaluate(() => Array.from(document.querySelectorAll('#seerr .jea-inline'))
      .filter(row => row.getClientRects().length && getComputedStyle(row).flexDirection === 'column').map(row => getComputedStyle(row).alignItems));
    expect(stacked.length).toBeGreaterThan(0);
    expect(stacked.filter(value => value === 'center')).toEqual([]);
  });

  test('on a phone, disclosure chevrons, card icons and labels stay on their own lines\' first row with no empty line', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-chromium', 'phone layout');
    await open(page, { saved: { ...SAVED, DoesTheDogDieEnabled: true } });
    await settled(page);
    for (const id of ['pages', 'display', 'elsewhere', 'seerr']) {
      await clickTab(page, id);
      const faults = await page.evaluate(tabId => {
        const out = [];
        const tab = document.getElementById(tabId);
        tab.querySelectorAll('.jea-group > summary').forEach(summary => {
          if (!summary.getClientRects().length) return;
          const line = parseFloat(getComputedStyle(summary).lineHeight) || 22;
          const text = Array.from(summary.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
          const range = document.createRange();
          range.selectNodeContents(summary);
          const rows = new Set(Array.from(range.getClientRects()).map(r => Math.round(r.top / 4)));
          const box = summary.getBoundingClientRect();
          // The chevron is drawn after the content: when it wraps, the summary is taller than its text.
          const textBottom = Math.max(...Array.from(range.getClientRects()).map(r => r.bottom));
          if (box.bottom - textBottom > line + 8) out.push('chevron on its own line: ' + text + ' (' + rows.size + ')');
        });
        tab.querySelectorAll(':scope > fieldset > legend.sectionTitle').forEach(legend => {
          const icon = legend.querySelector('.je-legend-icon, .je-legend-icon-img');
          const title = legend.querySelector('.jea-legend-title');
          if (!icon || !title || !legend.getClientRects().length) return;
          if (title.getBoundingClientRect().top > icon.getBoundingClientRect().bottom) out.push('icon alone above: ' + title.textContent);
        });
        tab.querySelectorAll('.jea-marks').forEach(marks => {
          if (marks.getClientRects().length && !Array.from(marks.children).some(child => child.getClientRects().length)) out.push('empty marks under ' + marks.closest('label')?.textContent.trim());
        });
        return out;
      }, id);
      expect(faults, id).toEqual([]);
    }
  });

  test('the phone menu opens, moves between tabs and closes', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-chromium', 'phone layout');
    await open(page);
    const toggle = page.locator('.jea-nav-toggle');
    await toggle.click();
    await expect(page.locator('.jea-nav')).toHaveClass(/jea-open/);
    await tab(page, 'playback').click();
    await expect(page.locator('.jea-nav')).not.toHaveClass(/jea-open/);
    await expect(toggle).toContainText('Playback');
    await expect(page.locator('#playback')).toHaveClass(/active/);
  });
});
