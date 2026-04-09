/*
 * Test: toggle each sidebar-nav feature OFF and verify the nav item
 * actually leaves the DOM within a reasonable window (no refresh needed).
 * Also checks the reverse (toggle ON).
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:8097';

async function login(page) {
  await page.goto(`${BASE}/web/#/login`);
  await page.waitForSelector('.btnManual', { timeout: 15000 });
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.waitForSelector('#txtManualPassword', { state: 'visible', timeout: 5000 });
  await page.fill('#txtManualPassword', '4817');
  await page.click('button.button-submit[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 15000 });
}

const FEATURES = [
  { name: 'bookmarks',    enabledKey: 'BookmarksEnabled',      navSelector: '.je-nav-bookmarks-item' },
  { name: 'calendar',     enabledKey: 'CalendarPageEnabled',   navSelector: '.je-nav-calendar-item' },
  { name: 'downloads',    enabledKey: 'DownloadsPageEnabled',  navSelector: '.je-nav-downloads-item' },
  { name: 'hiddencontent',enabledKey: 'HiddenContentEnabled',  navSelector: '.je-nav-hidden-content-item' },
];

async function getConfig(page) {
  return page.evaluate(async () => {
    return fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
      headers: { 'X-Emby-Token': ApiClient.accessToken() }
    }).then(r => r.json());
  });
}
async function saveConfig(page, cfg) {
  return page.evaluate(async (cfg) => {
    await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Emby-Token': ApiClient.accessToken() },
      body: JSON.stringify(cfg)
    });
    // Trigger the reactive flow locally so we see immediate effect.
    window.JellyfinEnhanced.configStore.broadcastChange();
    await window.JellyfinEnhanced.configStore.reloadConfig({ bypassThrottle: true });
  }, cfg);
}
async function countSelector(page, sel) {
  return page.evaluate((sel) => document.querySelectorAll(sel).length, sel);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[c] ' + m.text()); });

  await login(page);
  await page.waitForTimeout(4000);

  // Make sure all 4 are enabled to start (and in standalone sidebar mode,
  // i.e. not custom tabs / not plugin pages).
  let cfg = await getConfig(page);
  const baseline = {
    BookmarksEnabled: cfg.BookmarksEnabled, BookmarksUseCustomTabs: cfg.BookmarksUseCustomTabs, BookmarksUsePluginPages: cfg.BookmarksUsePluginPages,
    CalendarPageEnabled: cfg.CalendarPageEnabled, CalendarUseCustomTabs: cfg.CalendarUseCustomTabs, CalendarUsePluginPages: cfg.CalendarUsePluginPages,
    DownloadsPageEnabled: cfg.DownloadsPageEnabled, DownloadsUseCustomTabs: cfg.DownloadsUseCustomTabs, DownloadsUsePluginPages: cfg.DownloadsUsePluginPages,
    HiddenContentEnabled: cfg.HiddenContentEnabled, HiddenContentUseCustomTabs: cfg.HiddenContentUseCustomTabs, HiddenContentUsePluginPages: cfg.HiddenContentUsePluginPages,
  };
  console.log('Baseline config:', JSON.stringify(baseline));

  cfg.BookmarksEnabled = true; cfg.BookmarksUseCustomTabs = false; cfg.BookmarksUsePluginPages = false;
  cfg.CalendarPageEnabled = true; cfg.CalendarUseCustomTabs = false; cfg.CalendarUsePluginPages = false;
  cfg.DownloadsPageEnabled = true; cfg.DownloadsUseCustomTabs = false; cfg.DownloadsUsePluginPages = false;
  cfg.HiddenContentEnabled = true; cfg.HiddenContentUseCustomTabs = false; cfg.HiddenContentUsePluginPages = false;
  await saveConfig(page, cfg);
  await page.waitForTimeout(1500);
  // Force a full page reload so the nav items are actually injected by the modules.
  await page.reload();
  await page.waitForTimeout(4000);

  // Verify all 4 nav items exist
  console.log('\n=== After enabling all 4 ===');
  for (const f of FEATURES) {
    const n = await countSelector(page, f.navSelector);
    console.log(`  ${f.name}: ${n > 0 ? 'PRESENT' : 'MISSING'} (${n})`);
  }

  // Now toggle each one OFF one-by-one and check that the nav item disappears
  // within a short timeout. This is the core test.
  for (const f of FEATURES) {
    console.log(`\n=== Toggling ${f.name} OFF ===`);
    cfg = await getConfig(page);
    cfg[f.enabledKey] = false;
    await saveConfig(page, cfg);
    await page.waitForTimeout(1500); // give reactive flow time

    const nAfter = await countSelector(page, f.navSelector);
    if (nAfter === 0) {
      console.log(`  PASS: ${f.name} nav removed (0 elements)`);
    } else {
      console.log(`  FAIL: ${f.name} nav STILL PRESENT (${nAfter} elements) after toggling ${f.enabledKey}=false`);
    }

    // Restore for the next test
    cfg[f.enabledKey] = true;
    await saveConfig(page, cfg);
    await page.waitForTimeout(1500);
    const nRestored = await countSelector(page, f.navSelector);
    if (nRestored > 0) {
      console.log(`  PASS: ${f.name} nav re-injected after re-enabling (${nRestored})`);
    } else {
      console.log(`  FAIL: ${f.name} nav NOT re-injected after re-enabling`);
    }
  }

  // Restore baseline at the end
  console.log('\n=== Restoring baseline ===');
  cfg = await getConfig(page);
  Object.assign(cfg, baseline);
  await saveConfig(page, cfg);

  console.log('\nErrors captured:', errors.length);
  errors.slice(0, 10).forEach((e, i) => console.log(`  ${i + 1}. ${e.slice(0, 200)}`));

  await browser.close();
})();
